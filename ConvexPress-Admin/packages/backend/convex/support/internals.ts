/**
 * Support Bridge System - Internal Functions
 *
 * Non-client-callable functions for scheduled operations and cross-system use:
 *
 *   logDeflection           - Write a deflection log entry (called by action)
 *   cleanupOldLogs          - Purge deflection logs older than 90 days
 *   searchKbConvex          - Full-text search KB articles (called by generateAnswer action)
 *   searchKbKeywordFallback - Keyword fallback search for KB articles (called by generateAnswer action)
 *                            NOTE: This is NOT real RAG/vector search. It's a keyword-matching
 *                            fallback used when no embedding provider is configured.
 *   getSupportAiSettings    - Load support.ai settings (called by generateAnswer action)
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { logDeflectionInternalArgs, DEFLECTION_LOG_RETENTION_MS } from "./validators";

// ─── logDeflection ────────────────────────────────────────────────────────────

/**
 * Write a deflection log entry to support_deflectionLogs.
 *
 * Called by the generateAnswer action (actions cannot write to the DB directly).
 * Also called by logInteraction mutation for external clients.
 */
export const logDeflection = internalMutation({
  args: logDeflectionInternalArgs,
  handler: async (ctx, args) => {
    return ctx.db.insert("support_deflectionLogs", {
      sessionId: args.sessionId,
      userId: args.userId,
      query: args.query,
      aiResponse: args.aiResponse,
      kbArticleIds: args.kbArticleIds,
      outcome: args.outcome,
      ticketId: args.ticketId,
      responseLatencyMs: args.responseLatencyMs,
      tokensUsed: args.tokensUsed,
      createdAt: Date.now(),
    });
  },
});

// ─── cleanupOldLogs ────────────────────────────────────────────────────────────

/**
 * Purge deflection logs older than 90 days.
 *
 * Scheduled via crons.ts to run daily. Processes up to 500 records per run
 * to avoid Convex function timeout limits.
 *
 * Returns { deleted } count for monitoring.
 */
export const cleanupOldLogs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - DEFLECTION_LOG_RETENTION_MS;

    // Use by_date index to efficiently find old records
    const oldLogs = await ctx.db
      .query("support_deflectionLogs")
      .withIndex("by_date", (q) => q.lt("createdAt", cutoff))
      .take(500);

    let deleted = 0;
    for (const log of oldLogs) {
      await ctx.db.delete("support_deflectionLogs", log._id);
      deleted++;
    }

    // If we hit the batch limit, there may be more records — reschedule immediately
    if (deleted >= 500) {
      await ctx.scheduler.runAfter(0, internal.support.internals.cleanupOldLogs, {});
    }

    return { deleted };
  },
});

// ─── searchKbConvex ───────────────────────────────────────────────────────────

/**
 * Full-text search KB articles using Convex searchIndex.
 *
 * Returns published articles only, with normalized relevance scores.
 * Called by the generateAnswer action in deflection.ts.
 */
export const searchKbConvex = internalQuery({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    const results = await ctx.db
      .query("kb_articles")
      .withSearchIndex("search_articles", (q) =>
        q.search("contentPlainText", query).eq("status", "published"),
      )
      .take(10);

    return results.map((article, index) => ({
      id: String(article._id),
      title: article.title,
      excerpt: article.excerpt,
      slug: article.slug,
      // Convex search results are already ranked; assign decreasing scores
      score: 1 - index * 0.08,
    }));
  },
});

// ─── searchKbKeywordFallback ──────────────────────────────────────────────────

/**
 * Keyword-matching fallback search over KB RAG chunks.
 *
 * NOTE: This is NOT real RAG / vector search. It performs a client-side keyword
 * scan over kb_ragChunks because no embedding provider is configured. A true
 * RAG implementation would require an action to call an embedding API and use
 * a vector index. This function exists as a graceful fallback when ragEnabled
 * is true but no embeddings have been generated yet.
 *
 * Called by the generateAnswer action in deflection.ts when support.ai.ragEnabled
 * is true.
 */
export const searchKbKeywordFallback = internalQuery({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    // Collect a sample of chunks and do client-side keyword matching
    // Note: Real RAG implementation would use vectorize or a similar index
    const allChunks = await ctx.db
      .query("kb_ragChunks")
      .take(500);

    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/).filter((w) => w.length > 3);

    if (words.length === 0) return [];

    // Score chunks by keyword overlap
    const scored = allChunks
      .map((chunk) => {
        const contentLower = chunk.content.toLowerCase();
        const matchCount = words.filter((w) => contentLower.includes(w)).length;
        return { chunk, score: matchCount / words.length };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Deduplicate by articleId, take best score per article
    const byArticle = new Map<string, { title: string; excerpt: string; slug: string; score: number }>();

    for (const { chunk, score } of scored) {
      const articleId = chunk.articleId as string;
      const existing = byArticle.get(articleId);
      if (!existing || score > existing.score) {
        byArticle.set(articleId, {
          title: chunk.metadata.title,
          excerpt: chunk.metadata.excerpt ?? chunk.content.slice(0, 200),
          slug: chunk.articleSlug,
          score,
        });
      }
    }

    return Array.from(byArticle.entries()).map(([id, data]) => ({
      id,
      title: data.title,
      excerpt: data.excerpt,
      slug: data.slug,
      score: data.score * 0.9, // Slight discount vs. Convex full-text
    }));
  },
});

// ─── getSupportAiSettings ─────────────────────────────────────────────────────

/**
 * Load support.ai settings from the settings table.
 *
 * Called by the generateAnswer action in deflection.ts to determine
 * which search providers and AI model to use.
 *
 * Returns null if the support.ai settings section has never been saved.
 */
/** Return shape for getSupportAiSettings. */
interface SupportAiSettings {
  aiProvider: string | null;
  aiApiKey: string | null;
  aiModel: string | null;
  meilisearchEnabled: boolean;
  meilisearchUrl: string | null;
  meilisearchApiKey: string | null;
  ragEnabled: boolean;
}

export const getSupportAiSettings = internalQuery({
  args: {},
  handler: async (ctx): Promise<SupportAiSettings> => {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "support.ai"))
      .unique();

    const values = doc ? (doc.values as Record<string, unknown>) : {};

    // Read encrypted secrets for support AI and Meilisearch keys
    const encryptedAiKey = await ctx.db
      .query("service_secrets")
      .withIndex("by_service", (q) => q.eq("service", "support.ai"))
      .unique();

    const encryptedMeilisearchKey = await ctx.db
      .query("service_secrets")
      .withIndex("by_service", (q) => q.eq("service", "support.meilisearch"))
      .unique();

    // For encrypted secrets in internalQuery, we cannot decrypt (no crypto in query runtime).
    // We check for existence here; the action that actually needs the decrypted value
    // should call internal.settings.secrets.getServiceSecret separately.
    // For backward compatibility, return legacy plain-text values if no encrypted secret exists.
    const hasEncryptedAiKey = encryptedAiKey !== null;
    const hasEncryptedMeilisearchKey = encryptedMeilisearchKey !== null;

    return {
      aiProvider: (values.aiProvider as string | null) ?? null,
      // If encrypted key exists, return a sentinel; the action layer reads the real value.
      // If no encrypted key, return legacy plain-text value for backward compatibility.
      aiApiKey: hasEncryptedAiKey
        ? "__encrypted__"
        : (values.aiApiKey as string | null) ?? null,
      aiModel: (values.aiModel as string | null) ?? null,
      meilisearchEnabled: (values.meilisearchEnabled as boolean) ?? false,
      meilisearchUrl: (values.meilisearchUrl as string | null) ?? null,
      meilisearchApiKey: hasEncryptedMeilisearchKey
        ? "__encrypted__"
        : (values.meilisearchApiKey as string | null) ?? null,
      ragEnabled: (values.ragEnabled as boolean) ?? false,
    };
  },
});
