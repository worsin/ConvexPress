"use node";

/**
 * AI Content Generation - Internal Actions (Node.js runtime)
 *
 * These run in Node.js because they call external APIs (Tavily, Anthropic, OpenRouter).
 * Queries and mutations are in helpers.ts (Convex runtime).
 *
 * API keys are read from the settings table (section: "ai") with fallback
 * to environment variables for backward compatibility.
 *
 * Supported providers:
 *   - "anthropic" (default): Uses the Anthropic SDK directly
 *   - "openrouter": Uses the OpenAI-compatible chat completions API at openrouter.ai
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";

// ─── Settings Helper ────────────────────────────────────────────────────────

/**
 * Read AI settings from the settings table and encrypted secrets.
 *
 * Non-secret settings (provider, defaultModel) come from the settings table.
 * Secret keys (apiKey, tavilyApiKey) come from encrypted service_secrets,
 * with env var fallback for backward compatibility.
 */
async function resolveAiSettings(ctx: {
  runQuery: (query: any, args?: any) => Promise<any>;
}) {
  // Read non-secret settings
  const settings = (await ctx.runQuery(
    internal.settings.internals.getInternal,
    { section: "ai" },
  )) as Record<string, unknown> | null;

  // Read encrypted secrets (returns null if not stored)
  const encryptedApiKey = await ctx.runQuery(
    internal.settings.secrets.getServiceSecret,
    { service: "ai.provider" },
  ) as string | null;

  const encryptedTavilyKey = await ctx.runQuery(
    internal.settings.secrets.getServiceSecret,
    { service: "ai.tavily" },
  ) as string | null;

  // Resolve API key: encrypted secret -> legacy settings -> env var
  const apiKey =
    encryptedApiKey ??
    ((settings?.apiKey as string) || "").trim() ||
    process.env.ANTHROPIC_API_KEY ??
    "";

  // Resolve Tavily key: encrypted secret -> legacy settings -> env var
  const tavilyApiKey =
    encryptedTavilyKey ??
    ((settings?.tavilyApiKey as string) || "").trim() ||
    process.env.TAVILY_API_KEY ??
    "";

  return {
    provider: ((settings?.provider as string) || "anthropic") as "openrouter" | "anthropic",
    apiKey,
    defaultModel: (settings?.defaultModel as string) || "claude-sonnet-4-20250514",
    tavilyApiKey,
  };
}

// ─── Tavily Research ────────────────────────────────────────────────────────

/**
 * Research a topic using Tavily Search API.
 * Returns aggregated content from top results plus source URLs.
 *
 * Reads the Tavily API key from settings with env var fallback.
 */
export const researchTopic = internalAction({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { tavilyApiKey } = await resolveAiSettings(ctx);

    if (!tavilyApiKey) {
      throw new ConvexError({
        code: "CONFIGURATION_ERROR",
        message:
          "Tavily API key not configured. Set it in Settings > AI or as TAVILY_API_KEY environment variable.",
      });
    }

    const { tavily } = await import("@tavily/core");
    const tvly = tavily({ apiKey: tavilyApiKey });

    const result = await tvly.search(args.query, {
      searchDepth: "advanced",
      maxResults: args.maxResults ?? 5,
      includeAnswer: true,
    });

    const sources = (result.results || []).map((r: any) => ({
      title: r.title || "Untitled",
      url: r.url,
      content: r.content || "",
      score: r.score || 0,
    }));

    const aggregatedContent = sources
      .map((s: any) => `### ${s.title}\nSource: ${s.url}\n\n${s.content}`)
      .join("\n\n---\n\n");

    return {
      answer: result.answer || "",
      aggregatedContent,
      sources,
    };
  },
});

// ─── OpenRouter Generation ──────────────────────────────────────────────────

/**
 * Generate text using the OpenRouter API (OpenAI-compatible chat completions).
 */
async function generateWithOpenRouter(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://convexpress.com",
      "X-Title": "ConvexPress",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ConvexError({
      code: "PROVIDER_ERROR",
      message: `OpenRouter API error (${response.status}): ${errorText}`,
    });
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error) {
    throw new ConvexError({
      code: "PROVIDER_ERROR",
      message: `OpenRouter error: ${data.error.message}`,
    });
  }

  return data.choices?.[0]?.message?.content || "";
}

// ─── Anthropic Generation ───────────────────────────────────────────────────

/**
 * Generate text using the Anthropic SDK directly.
 */
async function generateWithAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
}

// ─── Claude Generation ──────────────────────────────────────────────────────

/**
 * Generate text content using the configured AI provider.
 *
 * Reads provider and API key from settings, falling back to env vars.
 * Supports:
 *   - "anthropic": Direct Anthropic SDK (model format: "claude-sonnet-4-20250514")
 *   - "openrouter": OpenAI-compatible API (model format: "anthropic/claude-sonnet-4-20250514")
 */
export const generateWithClaude = internalAction({
  args: {
    systemPrompt: v.string(),
    userPrompt: v.string(),
    maxTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { provider, apiKey, defaultModel } = await resolveAiSettings(ctx);

    if (!apiKey) {
      throw new ConvexError({
        code: "CONFIGURATION_ERROR",
        message:
          "AI API key not configured. Set it in Settings > AI or as ANTHROPIC_API_KEY environment variable.",
      });
    }

    const maxTokens = args.maxTokens ?? 1024;

    if (provider === "openrouter") {
      return await generateWithOpenRouter(
        apiKey,
        defaultModel,
        args.systemPrompt,
        args.userPrompt,
        maxTokens,
      );
    }

    // Default: Anthropic direct
    return await generateWithAnthropic(
      apiKey,
      defaultModel,
      args.systemPrompt,
      args.userPrompt,
      maxTokens,
    );
  },
});
