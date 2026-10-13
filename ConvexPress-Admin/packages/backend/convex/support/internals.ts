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
 *   readableKbArticles      - Current public metadata for externally ranked article IDs
 *   getSupportAiSettings    - Load support.ai settings (called by generateAnswer action)
 *
 * Every KB result that reaches a support visitor or the AI answer passes the
 * public KB gate (kb/publicAccess.ts): internal, unpublished and restricted
 * articles never become deflection sources.
 */

import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { flagSetting, settingsRecord } from "../helpers/settingsReader";
import { logDeflectionInternalArgs, DEFLECTION_LOG_RETENTION_MS } from "./validators";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { createPublicKbAccess } from "../kb/publicAccess";
import { PUBLIC_VISIBILITY_KEY } from "../kb/helpers/visibility";

type KbSource = { id: string; title: string; excerpt: string; slug: string; score: number };
const kbSourceValidator = v.object({ id: v.string(), title: v.string(), excerpt: v.string(), slug: v.string(), score: v.number() });

/** Keep only candidates the current visitor may read, with current article
 * metadata. External indexes and chunk metadata may be stale or internal. */
async function readableSources(ctx: QueryCtx, candidates: readonly { id: string; score: number }[]): Promise<KbSource[]> {
  const access = createPublicKbAccess(ctx);
  if (!await access.available()) return [];
  const sources: KbSource[] = [];
  for (const candidate of candidates.slice(0, 50)) {
    const articleId = ctx.db.normalizeId("kb_articles", candidate.id);
    const article = articleId ? await ctx.db.get("kb_articles", articleId) : null;
    if (!article || !await access.article(article)) continue;
    sources.push({ id: String(article._id), title: article.title, excerpt: article.excerpt, slug: article.slug, score: candidate.score });
  }
  return sources;
}

// ─── logDeflection ────────────────────────────────────────────────────────────

/**
 * Write a deflection log entry to support_deflectionLogs.
 *
 * Called by the generateAnswer action (actions cannot write to the DB directly).
 * Also called by logInteraction mutation for external clients.
 */
export const logDeflection = internalMutation({
  args: logDeflectionInternalArgs,
  returns: v.id("support_deflectionLogs"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
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
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    await requirePluginEnabled(ctx, "tickets");
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
export const searchKbConvex: import("convex/server").RegisteredQuery<"internal", { query: string }, Array<{ id: string; title: string; excerpt: import("../_generated/dataModel").Doc<"kb_articles">["excerpt"]; slug: string; score: number }>> = internalQuery({
  args: { query: v.string() },
  returns: v.array(kbSourceValidator),
  handler: async (ctx, { query }) => {
    if (
      !(await isPluginEnabled(ctx, "tickets")) ||
      !(await isPluginEnabled(ctx, "knowledgeBase"))
    ) {
      return [];
    }
    const results = await ctx.db
      .query("kb_articles")
      .withSearchIndex("search_articles", (q) =>
        q.search("contentPlainText", query).eq("status", "published").eq("visibility", PUBLIC_VISIBILITY_KEY),
      )
      .take(10);

    // Convex search results are already ranked; assign decreasing scores
    return readableSources(ctx, results.map((article, index) => ({ id: String(article._id), score: 1 - index * 0.08 })));
  },
});

/** Gate article IDs ranked by an external provider (Meilisearch). */
export const readableKbArticles: import("convex/server").RegisteredQuery<"internal", { candidates: Array<{ id: string; score: number }> }, KbSource[]> = internalQuery({
  args: { candidates: v.array(v.object({ id: v.string(), score: v.number() })) },
  returns: v.array(kbSourceValidator),
  handler: async (ctx, { candidates }) => {
    if (!(await isPluginEnabled(ctx, "tickets")) || !(await isPluginEnabled(ctx, "knowledgeBase"))) return [];
    return readableSources(ctx, candidates);
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
  returns: v.array(kbSourceValidator),
  handler: async (ctx, { query }) => {
    if (
      !(await isPluginEnabled(ctx, "tickets")) ||
      !(await isPluginEnabled(ctx, "knowledgeBase"))
    ) {
      return [];
    }
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
      .filter((entry: { score: number }) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Deduplicate by articleId, take best score per article
    const byArticle = new Map<string, number>();
    for (const { chunk, score } of scored) {
      const articleId = String(chunk.articleId);
      byArticle.set(articleId, Math.max(byArticle.get(articleId) ?? 0, score));
    }

    // Chunk metadata may describe an article that has since become internal or
    // unpublished; titles and excerpts come from the gated current article.
    return readableSources(ctx, [...byArticle].map(([id, score]) => ({
      id,
      score: score * 0.9, // Slight discount vs. Convex full-text
    })));
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
  returns: v.object({
    aiProvider: v.union(v.null(), v.string()),
    aiApiKey: v.union(v.null(), v.string()),
    aiModel: v.union(v.null(), v.string()),
    meilisearchEnabled: v.boolean(),
    meilisearchUrl: v.union(v.null(), v.string()),
    meilisearchApiKey: v.union(v.null(), v.string()),
    ragEnabled: v.boolean(),
  }),
  handler: async (ctx): Promise<SupportAiSettings> => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return { aiProvider: null, aiApiKey: null, aiModel: null, meilisearchEnabled: false, meilisearchUrl: null, meilisearchApiKey: null, ragEnabled: false };
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "support.ai"))
      .unique();

    if (!doc) {
      return {
        aiProvider: null,
        aiApiKey: null,
        aiModel: null,
        meilisearchEnabled: false,
        meilisearchUrl: null,
        meilisearchApiKey: null,
        ragEnabled: false,
      };
    }

    const values = settingsRecord(doc.values);
    const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

    return {
      aiProvider: text(values.aiProvider),
      aiApiKey: text(values.aiApiKey),
      aiModel: text(values.aiModel),
      meilisearchEnabled: flagSetting(values.meilisearchEnabled, false),
      meilisearchUrl: text(values.meilisearchUrl),
      meilisearchApiKey: text(values.meilisearchApiKey),
      ragEnabled: flagSetting(values.ragEnabled, false),
    };
  },
});
