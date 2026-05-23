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
 *   - "openrouter" (default): OpenAI-compatible chat completions API at openrouter.ai
 *   - "openai": Direct OpenAI chat completions API at api.openai.com.
 *     Available as a fallback when an admin prefers to bypass OpenRouter.
 *   - "anthropic": Uses the Anthropic SDK directly (only when an admin
 *     explicitly opts in via Settings > AI). No code path falls back to
 *     Anthropic; an unconfigured install routes through OpenRouter.
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import { getServiceKeyFromAction } from "../helpers/serviceKeys";

// ─── Settings Helper ────────────────────────────────────────────────────────

/**
 * Read AI settings from the settings table, falling back to env vars.
 * Uses the shared resolveServiceKey helper for consistent key resolution.
 * Returns resolved provider, apiKey, model, and tavilyApiKey.
 *
 * Provider is OpenRouter by default. Env-var fallback and the model
 * fallback are provider-aware, so the only way to reach an Anthropic
 * code path is for an admin to explicitly select provider="anthropic"
 * in Settings > AI.
 */
type AiProvider = "openrouter" | "anthropic" | "openai";
type AiTask =
  | "default"
  | "pageGeneration"
  | "blockEditing"
  | "research"
  | "legacyContent";

function envVarForProvider(provider: AiProvider): string {
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "openai") return "OPENAI_API_KEY";
  return "OPENROUTER_API_KEY";
}

function fallbackModelForProvider(provider: AiProvider): string {
  if (provider === "anthropic") return "claude-opus-4-7";
  if (provider === "openai") return "gpt-5.5";
  return "anthropic/claude-opus-4.7";
}

function modelKeyForTask(task: AiTask): string {
  if (task === "pageGeneration") return "pageGenerationModel";
  if (task === "blockEditing") return "blockEditingModel";
  if (task === "research") return "researchModel";
  if (task === "legacyContent") return "legacyContentModel";
  return "defaultModel";
}

async function resolveAiSettings(ctx: {
  runQuery: (query: any, args?: any) => Promise<any>;
}, task: AiTask = "default") {
  const settings = (await ctx.runQuery(
    internal.settings.internals.getInternal,
    { section: "ai" },
  )) as Record<string, unknown> | null;

  const provider = ((settings?.provider as string) || "openrouter") as AiProvider;
  const envVarName = envVarForProvider(provider);
  const fallbackModel = fallbackModelForProvider(provider);
  const taskModel = settings?.[modelKeyForTask(task)];
  const defaultModel =
    typeof taskModel === "string" && taskModel.trim()
      ? taskModel.trim()
      : (settings?.defaultModel as string) || fallbackModel;

  return {
    provider,
    envVarName,
    apiKey: (await getServiceKeyFromAction(ctx, "ai", "apiKey", envVarName)) ?? "",
    defaultModel,
    tavilyApiKey: (await getServiceKeyFromAction(ctx, "ai", "tavilyApiKey", "TAVILY_API_KEY")) ?? "",
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

// ─── OpenAI Generation ──────────────────────────────────────────────────────

/**
 * Generate text using the OpenAI chat completions API directly
 * (no OpenRouter proxy). Same wire shape as the OpenRouter path, but
 * hits api.openai.com and skips the OpenRouter-specific headers.
 */
async function generateWithOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
    });
    return response.choices[0]?.message?.content || "";
  } catch (error) {
    throw new ConvexError({
      code: "PROVIDER_ERROR",
      message: `OpenAI error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
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
 *   - "anthropic": Direct Anthropic SDK (model format: "claude-opus-4-7")
 *   - "openrouter": OpenAI-compatible API (model format: "anthropic/claude-opus-4.7")
 */
export const generateWithClaude = internalAction({
  args: {
    systemPrompt: v.string(),
    userPrompt: v.string(),
    maxTokens: v.optional(v.number()),
    task: v.optional(
      v.union(
        v.literal("default"),
        v.literal("pageGeneration"),
        v.literal("blockEditing"),
        v.literal("research"),
        v.literal("legacyContent"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { provider, apiKey, defaultModel, envVarName } =
      await resolveAiSettings(ctx, args.task ?? "default");

    if (!apiKey) {
      throw new ConvexError({
        code: "CONFIGURATION_ERROR",
        message: `AI API key not configured. Set it in Settings > AI or as ${envVarName} environment variable.`,
      });
    }

    const maxTokens = args.maxTokens ?? 1024;

    if (provider === "openai") {
      return await generateWithOpenAI(
        apiKey,
        defaultModel,
        args.systemPrompt,
        args.userPrompt,
        maxTokens,
      );
    }

    if (provider === "anthropic") {
      return await generateWithAnthropic(
        apiKey,
        defaultModel,
        args.systemPrompt,
        args.userPrompt,
        maxTokens,
      );
    }

    // Default: OpenRouter
    return await generateWithOpenRouter(
      apiKey,
      defaultModel,
      args.systemPrompt,
      args.userPrompt,
      maxTokens,
    );
  },
});
