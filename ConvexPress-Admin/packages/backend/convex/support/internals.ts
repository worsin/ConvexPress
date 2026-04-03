/**
 * Support Bridge System - Internal Functions
 *
 * Non-client-callable functions for scheduled operations and cross-system use:
 *
 *   logDeflection           - Write a deflection log entry (called by action)
 *   cleanupOldLogs          - Purge deflection logs older than 90 days
 *   searchKbConvex          - Full-text search KB articles (called by generateAnswer action)
 *   searchKbRag             - RAG vector search KB articles (called by generateAnswer action)
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
      await ctx.db.delete(log._id);
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
      id: article._id as string,
      title: article.title,
      excerpt: article.excerpt,
      slug: article.slug,
      // Convex search results are already ranked; assign decreasing scores
      score: 1 - index * 0.08,
    }));
  },
});

// ─── searchKbRag ──────────────────────────────────────────────────────────────

/**
 * RAG vector search KB articles using kb_ragChunks.
 *
 * Performs a simple text scan of chunk content when no embedding provider
 * is configured. A full vector embedding search would require an action
 * to call an embedding API first — this is a placeholder that falls back
 * to keyword matching on chunk content.
 *
 * Called by the generateAnswer action in deflection.ts.
 */
export const searchKbRag = internalQuery({
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
export const getSupportAiSettings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "support.ai"))
      .unique();

    if (!doc) {
      return {
        aiProvider: null as string | null,
        aiApiKey: null as string | null,
        aiModel: null as string | null,
        meilisearchEnabled: false,
        meilisearchUrl: null as string | null,
        meilisearchApiKey: null as string | null,
        ragEnabled: false,
      };
    }

    const values = doc.values as Record<string, unknown>;

    return {
      aiProvider: (values.aiProvider as string | null) ?? null,
      aiApiKey: (values.aiApiKey as string | null) ?? null,
      aiModel: (values.aiModel as string | null) ?? null,
      meilisearchEnabled: (values.meilisearchEnabled as boolean) ?? false,
      meilisearchUrl: (values.meilisearchUrl as string | null) ?? null,
      meilisearchApiKey: (values.meilisearchApiKey as string | null) ?? null,
      ragEnabled: (values.ragEnabled as boolean) ?? false,
    };
  },
});
