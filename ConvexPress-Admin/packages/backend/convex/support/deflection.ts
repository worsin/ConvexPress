/**
 * Support Bridge System - AI Deflection Action
 *
 * The core deflection engine. When a user submits a support query:
 *
 *   1. Search KB articles via Convex searchIndex (always)
 *   2. If Meilisearch enabled: also search Meilisearch (via settings)
 *   3. If RAG enabled: also search RAG vector index (via settings)
 *   4. Merge and deduplicate, take top MAX_DEFLECTION_ARTICLES articles
 *   5. If AI provider configured: call OpenAI/Anthropic to generate answer
 *   6. If no AI provider: return article list directly (graceful degradation)
 *   7. Return { answer, sourceArticles, confidence }
 *
 * logInteraction mutation records deflection outcomes for analytics.
 */

import { action, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import { getCurrentUser } from "../helpers/permissions";
import { SUPPORT_EVENTS, SYSTEM } from "../events/constants";
import { emitEvent } from "../helpers/events";
import {
  generateAnswerArgs,
  logInteractionArgs,
  MAX_DEFLECTION_ARTICLES,
  MAX_DEFLECTION_QUERY_LENGTH,
} from "./validators";

// ─── Source Article Type ──────────────────────────────────────────────────────

interface SourceArticle {
  id: string;
  title: string;
  excerpt: string;
  slug: string;
  score: number;
}

// ─── generateAnswer ───────────────────────────────────────────────────────────

/**
 * Generate an AI answer for a support query using KB articles as context.
 *
 * Search strategy (in priority order):
 *   1. Convex full-text searchIndex on kb_articles (always enabled)
 *   2. Meilisearch (if support.ai.meilisearchEnabled setting is true)
 *   3. RAG vector search on kb_ragChunks (if support.ai.ragEnabled is true)
 *
 * If an AI provider (OpenAI or Anthropic) is configured in support.ai settings,
 * the matched articles are used as context to generate a natural-language answer.
 * Otherwise, the matched article list is returned directly (graceful degradation).
 *
 * @returns { answer, sourceArticles, confidence, usedAi }
 */
export const generateAnswer = action({
  args: generateAnswerArgs,
  handler: async (ctx, args): Promise<{
    answer: string;
    sourceArticles: SourceArticle[];
    confidence: "high" | "medium" | "low" | "none";
    usedAi: boolean;
  }> => {
    const startTime = Date.now();

    // Truncate query to max length
    const query = args.query.slice(0, MAX_DEFLECTION_QUERY_LENGTH);

    // ── Step 1: Convex full-text search (always) ────────────────────────────
    const convexResults: SourceArticle[] = await ctx.runQuery(
      internal.support.internals.searchKbConvex,
      { query },
    );

    // ── Step 2: Load support AI settings ────────────────────────────────────
    const supportAiSettings = await ctx.runQuery(
      internal.support.internals.getSupportAiSettings,
      {},
    );

    const allResults: Map<string, SourceArticle> = new Map();

    // Seed with Convex results
    for (const article of convexResults) {
      allResults.set(article.id, article);
    }

    // ── Step 3: Meilisearch (if enabled) ────────────────────────────────────
    if (supportAiSettings?.meilisearchEnabled && supportAiSettings.meilisearchUrl) {
      try {
        const meilisearchResults = await searchMeilisearch(
          query,
          supportAiSettings.meilisearchUrl,
          supportAiSettings.meilisearchApiKey ?? "",
        );
        for (const article of meilisearchResults) {
          // Meilisearch results boost score if article already found by Convex
          const existing = allResults.get(article.id);
          if (existing) {
            allResults.set(article.id, { ...existing, score: existing.score + article.score });
          } else {
            allResults.set(article.id, article);
          }
        }
      } catch {
        // Meilisearch failure is non-fatal — continue with Convex results
      }
    }

    // ── Step 4: RAG vector search (if enabled) ───────────────────────────────
    if (supportAiSettings?.ragEnabled) {
      try {
        const ragResults: SourceArticle[] = await ctx.runQuery(
          internal.support.internals.searchKbRag,
          { query },
        );
        for (const article of ragResults) {
          const existing = allResults.get(article.id);
          if (existing) {
            allResults.set(article.id, { ...existing, score: existing.score + article.score });
          } else {
            allResults.set(article.id, article);
          }
        }
      } catch {
        // RAG failure is non-fatal
      }
    }

    // ── Step 5: Merge, sort by score, deduplicate, take top N ────────────────
    const sourceArticles = Array.from(allResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_DEFLECTION_ARTICLES);

    // No articles found — return early with "none" confidence
    if (sourceArticles.length === 0) {
      return {
        answer: "I couldn't find any relevant articles to answer your question. Please contact support directly.",
        sourceArticles: [],
        confidence: "none",
        usedAi: false,
      };
    }

    // ── Step 6: AI answer generation (if provider configured) ────────────────
    if (supportAiSettings?.aiProvider && supportAiSettings.aiApiKey) {
      try {
        const aiResult = await generateAiAnswer(
          query,
          sourceArticles,
          supportAiSettings.aiProvider,
          supportAiSettings.aiApiKey,
          supportAiSettings.aiModel,
        );

        return {
          answer: aiResult.answer,
          sourceArticles,
          confidence: aiResult.confidence,
          usedAi: true,
        };
      } catch {
        // AI failure — fall through to graceful degradation
      }
    }

    // ── Step 7: Graceful degradation — return article list ───────────────────
    const articleTitles = sourceArticles.map((a) => `- ${a.title}`).join("\n");
    const answer = `Here are some articles that may help with your question:\n\n${articleTitles}\n\nIf these don't answer your question, please contact support.`;

    const confidence: "high" | "medium" | "low" = sourceArticles.length >= 3 ? "medium" : "low";

    return {
      answer,
      sourceArticles,
      confidence,
      usedAi: false,
    };
  },
});

// ─── logInteraction ───────────────────────────────────────────────────────────

/**
 * Record the outcome of a deflection interaction for analytics.
 *
 * Called by the client after the user indicates whether the answer was helpful,
 * clicks "Contact Support" (escalated), or closes the widget (abandoned).
 *
 * No auth required — widget users may be anonymous. sessionId is used to
 * associate logs with the same session.
 */
export const logInteraction = mutation({
  args: logInteractionArgs,
  handler: async (ctx, args) => {
    // Validate input lengths
    if (args.query.length > 2000) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Query too long" });
    }
    if (args.aiResponse.length > 50000) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Response too long" });
    }

    // Validate session exists and is not expired
    if (args.sessionId) {
      const session = await ctx.db
        .query("ticket_sessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
        .first();
      if (!session || session.expiresAt < Date.now()) {
        throw new ConvexError({ code: "INVALID_SESSION", message: "Invalid or expired session" });
      }
    }

    const user = await getCurrentUser(ctx);
    const now = Date.now();

    const logId = await ctx.db.insert("support_deflectionLogs", {
      sessionId: args.sessionId,
      userId: user?._id,
      query: args.query,
      aiResponse: args.aiResponse,
      kbArticleIds: args.kbArticleIds,
      outcome: args.outcome,
      ticketId: args.ticketId,
      responseLatencyMs: args.responseLatencyMs,
      tokensUsed: args.tokensUsed,
      createdAt: now,
    });

    // Emit event for event dispatcher subscribers
    const eventCode = args.outcome === "escalated"
      ? SUPPORT_EVENTS.DEFLECTION_ESCALATED
      : SUPPORT_EVENTS.DEFLECTION_ATTEMPTED;

    await emitEvent(ctx, eventCode, SYSTEM.SUPPORT, {
      logId,
      sessionId: args.sessionId,
      userId: user?._id,
      outcome: args.outcome,
      kbArticleCount: args.kbArticleIds.length,
      ticketId: args.ticketId,
    });

    return logId;
  },
});

// ─── Private Helpers ─────────────────────────────────────────────────────────

/**
 * Search Meilisearch for KB articles matching the query.
 * Returns an array of SourceArticle with relevance scores.
 */
async function searchMeilisearch(
  query: string,
  host: string,
  apiKey: string,
): Promise<SourceArticle[]> {
  const url = `${host.replace(/\/$/, "")}/indexes/kb_articles/search`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      q: query,
      limit: MAX_DEFLECTION_ARTICLES * 2,
      filter: "status = published",
      attributesToRetrieve: ["_id", "title", "excerpt", "slug"],
    }),
  });

  if (!response.ok) {
    throw new Error(`Meilisearch search failed: ${response.status}`);
  }

  const data = await response.json() as {
    hits: Array<{ _id: string; title: string; excerpt: string; slug: string }>;
  };

  return (data.hits ?? []).map((hit, index) => ({
    id: hit._id,
    title: hit.title,
    excerpt: hit.excerpt ?? "",
    slug: hit.slug,
    // Score decreases linearly with rank; will be boosted if also found by Convex
    score: 1 - index * 0.1,
  }));
}

/**
 * Call OpenAI or Anthropic to generate a natural-language answer from article context.
 */
async function generateAiAnswer(
  query: string,
  articles: SourceArticle[],
  provider: string,
  apiKey: string,
  model: string | undefined,
): Promise<{ answer: string; confidence: "high" | "medium" | "low" }> {
  const articleContext = articles
    .map((a, i) => `Article ${i + 1}: ${a.title}\n${a.excerpt}`)
    .join("\n\n");

  const systemPrompt =
    "You are a helpful support assistant. Answer the user's question using only the provided KB articles as context. " +
    "If the articles don't contain enough information to answer confidently, say so. " +
    "Be concise and helpful. Do not make up information not in the articles.";

  const userPrompt = `KB Articles:\n${articleContext}\n\nUser Question: ${query}`;

  if (provider === "anthropic") {
    const defaultModel = model ?? "claude-haiku-20240307";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: defaultModel,
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };
    const answer = data.content.find((c) => c.type === "text")?.text ?? "";
    return { answer, confidence: articles.length >= 3 ? "high" : "medium" };
  }

  // Default: OpenAI-compatible (includes openrouter)
  const defaultModel = model ?? "gpt-3.5-turbo";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: defaultModel,
      max_tokens: 512,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  const answer = data.choices[0]?.message?.content ?? "";
  return { answer, confidence: articles.length >= 3 ? "high" : "medium" };
}
