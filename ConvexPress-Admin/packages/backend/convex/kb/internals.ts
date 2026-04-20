/**
 * Knowledge Base System - Internal Functions
 *
 * Non-client-callable functions for scheduled operations:
 *   publishScheduled      - Auto-publish a single scheduled article (by ID)
 *   publishScheduledBatch - Cron entry: scan & publish all due scheduled articles
 *   cleanupPageViews      - Purge old page views (90-day retention)
 *
 * Real sync entry points live in meilisearch.ts (syncArticle) and rag.ts (ingestArticle).
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { emitEvent } from "../helpers/events";
import { KB_EVENTS, SYSTEM } from "../events/constants";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";

// ─── Publish Scheduled ──────────────────────────────────────────────────────

export const publishScheduled = internalMutation({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const article = await ctx.db.get("kb_articles", articleId);
    if (!article || article.status !== "draft" || !article.scheduledAt) return;

    const now = Date.now();
    if (article.scheduledAt > now) return; // Not yet time

    await ctx.db.patch("kb_articles", articleId, {
      status: "published",
      publishedAt: now,
      scheduledAt: undefined,
      updatedAt: now,
      meilisearchSynced: false,
      ragSynced: false,
    });

    // Update category article count
    if (article.categoryId) {
      const category = await ctx.db.get("kb_categories", article.categoryId);
      if (category) {
        await ctx.db.patch("kb_categories", article.categoryId, {
          articleCount: category.articleCount + 1,
          updatedAt: now,
        });
      }
    }

    await emitEvent(ctx, KB_EVENTS.ARTICLE_PUBLISHED, SYSTEM.KB, {
      articleId,
      title: article.title,
      authorId: article.authorId,
      publishedAt: now,
      scheduledPublish: true,
    });
  },
});

// ─── Publish Scheduled (Batch / Cron Entry) ─────────────────────────────────

/**
 * Scan all draft articles with a scheduledAt in the past and publish them.
 * Called by the every-5-minute cron. Processes up to 50 per run to stay
 * within mutation time limits.
 */
export const publishScheduledBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const now = Date.now();

    // Use by_scheduled index with range bounds to only load articles due now.
    // Safety-bounded with .take(200) to avoid unbounded memory usage in crons.
    const candidates = await ctx.db
      .query("kb_articles")
      .withIndex("by_scheduled", (q) => q.lte("scheduledAt", now))
      .take(200);

    // Filter for drafts only (scheduled articles in other statuses are skipped)
    const due = candidates
      .filter((a) => a.status === "draft" && a.scheduledAt !== undefined)
      .slice(0, 50);

    for (const article of due) {
      await ctx.db.patch("kb_articles", article._id, {
        status: "published",
        publishedAt: now,
        scheduledAt: undefined,
        updatedAt: now,
        meilisearchSynced: false,
        ragSynced: false,
      });

      if (article.categoryId) {
        const category = await ctx.db.get("kb_categories", article.categoryId);
        if (category) {
          await ctx.db.patch("kb_categories", article.categoryId, {
            articleCount: category.articleCount + 1,
            updatedAt: now,
          });
        }
      }

      await emitEvent(ctx, KB_EVENTS.ARTICLE_PUBLISHED, SYSTEM.KB, {
        articleId: article._id,
        title: article.title,
        authorId: article.authorId,
        publishedAt: now,
        scheduledPublish: true,
      });
    }

    // Self-reschedule if we hit the safety bound — there may be more due articles
    if (candidates.length >= 200) {
      await ctx.scheduler.runAfter(0, internal.kb.internals.publishScheduledBatch, {});
    }

    return { published: due.length };
  },
});

// ─── Cleanup Page Views ─────────────────────────────────────────────────────

export const cleanupPageViews = internalMutation({
  args: {},
  handler: async (ctx) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

    const oldViews = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_date", (q) => q.lt("createdAt", ninetyDaysAgo))
      .take(500);

    let deleted = 0;
    for (const view of oldViews) {
      await ctx.db.delete("kb_pageViews", view._id);
      deleted++;
    }

    // Self-reschedule if there are more to delete
    if (deleted >= 500) {
      await ctx.scheduler.runAfter(0, internal.kb.internals.cleanupPageViews, {});
    }

    return { deleted };
  },
});

// ─── Get Unsynced Articles ──────────────────────────────────────────────────

export const getUnsyncedForMeilisearch = internalQuery({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    return ctx.db
      .query("kb_articles")
      .withIndex("by_meilisearch_sync", (q) => q.eq("meilisearchSynced", false))
      .take(50);
  },
});

export const getUnsyncedForRag = internalQuery({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    return ctx.db
      .query("kb_articles")
      .withIndex("by_rag_sync", (q) => q.eq("ragSynced", false))
      .take(50);
  },
});

// ─── Get Article for External Sync ─────────────────────────────────────────

/**
 * Load a full article enriched with category slug and article tag slugs.
 * Used by Meilisearch and RAG sync actions.
 */
export const getArticleForSync = internalQuery({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const article = await ctx.db.get("kb_articles", articleId);
    if (!article) return null;

    // Resolve category slug
    const category = article.categoryId ? await ctx.db.get("kb_categories", article.categoryId) : null;

    // Resolve tags via junction table
    const articleTagRows = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article", (q) => q.eq("articleId", articleId))
      .take(100);

    const tagSlugs: string[] = [];
    for (const row of articleTagRows) {
      const tag = await ctx.db.get("kb_tags", row.tagId);
      if (tag) tagSlugs.push(tag.slug);
    }

    return {
      ...article,
      categorySlug: category?.slug ?? null,
      tags: tagSlugs,
    };
  },
});

// ─── Mark Meilisearch Synced ────────────────────────────────────────────────

export const markMeilisearchSynced = internalMutation({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    await ctx.db.patch("kb_articles", articleId, {
      meilisearchSynced: true,
      meilisearchSyncedAt: Date.now(),
    });
  },
});

// ─── Mark RAG Synced ────────────────────────────────────────────────────────

export const markRagSynced = internalMutation({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    await ctx.db.patch("kb_articles", articleId, {
      ragSynced: true,
      ragSyncedAt: Date.now(),
    });
  },
});

// ─── Insert RAG Chunk ────────────────────────────────────────────────────────

export const insertRagChunk = internalMutation({
  args: {
    articleId: v.id("kb_articles"),
    articleSlug: v.string(),
    content: v.string(),
    chunkIndex: v.number(),
    embedding: v.array(v.number()),
    metadata: v.object({
      title: v.string(),
      categorySlug: v.optional(v.string()),
      excerpt: v.optional(v.string()),
    }),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    return ctx.db.insert("kb_ragChunks", {
      articleId: args.articleId,
      articleSlug: args.articleSlug,
      content: args.content,
      chunkIndex: args.chunkIndex,
      embedding: args.embedding,
      metadata: args.metadata,
      createdAt: args.now,
      updatedAt: args.now,
    });
  },
});

// ─── Remove Article RAG Chunks ─────────────────────────────────────────────

/**
 * Delete all RAG chunks stored for a given article.
 *
 * This is a standard mutation (no embedding API calls). It is called by
 * ingestArticle (in rag.ts, a "use node" file) before re-ingestion and
 * by the article remove mutation.
 *
 * Lives in internals.ts (Convex runtime) rather than rag.ts (Node.js runtime)
 * because mutations cannot run in Node.js -- only actions can.
 */
export const removeArticleChunks = internalMutation({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const chunks = await ctx.db
      .query("kb_ragChunks")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(100);

    for (const chunk of chunks) {
      await ctx.db.delete("kb_ragChunks", chunk._id);
    }

    return { deleted: chunks.length };
  },
});

// ─── Get All RAG Chunks ──────────────────────────────────────────────────────

/**
 * Load RAG chunks for cosine similarity scoring.
 *
 * KNOWN SCALABILITY LIMIT: This loads up to 5,000 chunks into memory for
 * in-memory cosine similarity scoring. For large KBs (500+ articles, 10k+
 * chunks), migrate to a Convex vector index on kb_ragChunks instead.
 */
export const getAllRagChunks = internalQuery({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    return ctx.db.query("kb_ragChunks").take(5000);
  },
});
