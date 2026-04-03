/**
 * Knowledge Base System - Internal Functions
 *
 * Non-client-callable functions for scheduled operations:
 *   publishScheduled   - Auto-publish a scheduled article
 *   syncToMeilisearch  - Sync article to Meilisearch (placeholder)
 *   syncToRag          - Sync article to RAG (placeholder)
 *   cleanupPageViews   - Purge old page views (90-day retention)
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { emitEvent } from "../helpers/events";
import { KB_EVENTS, SYSTEM } from "../events/constants";

// ─── Publish Scheduled ──────────────────────────────────────────────────────

export const publishScheduled = internalMutation({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    const article = await ctx.db.get(articleId);
    if (!article || article.status !== "draft" || !article.scheduledAt) return;

    const now = Date.now();
    if (article.scheduledAt > now) return; // Not yet time

    await ctx.db.patch(articleId, {
      status: "published",
      publishedAt: now,
      scheduledAt: undefined,
      updatedAt: now,
      meilisearchSynced: false,
      ragSynced: false,
    });

    // Update category article count
    if (article.categoryId) {
      const category = await ctx.db.get(article.categoryId);
      if (category) {
        await ctx.db.patch(article.categoryId, {
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

// ─── Sync to Meilisearch (placeholder) ──────────────────────────────────────

export const syncToMeilisearch = internalMutation({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    const article = await ctx.db.get(articleId);
    if (!article) return;

    // Placeholder: actual Meilisearch sync will be implemented in Task 34
    // For now, just mark as synced
    await ctx.db.patch(articleId, {
      meilisearchSynced: true,
      meilisearchSyncedAt: Date.now(),
    });
  },
});

// ─── Sync to RAG (placeholder) ──────────────────────────────────────────────

export const syncToRag = internalMutation({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    const article = await ctx.db.get(articleId);
    if (!article) return;

    // Placeholder: actual RAG sync will be implemented in Task 35
    // For now, just mark as synced
    await ctx.db.patch(articleId, {
      ragSynced: true,
      ragSyncedAt: Date.now(),
    });
  },
});

// ─── Cleanup Page Views ─────────────────────────────────────────────────────

export const cleanupPageViews = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

    const oldViews = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_date")
      .collect();

    let deleted = 0;
    for (const view of oldViews) {
      if (view.createdAt < ninetyDaysAgo) {
        await ctx.db.delete(view._id);
        deleted++;
      }
      // Safety limit to avoid timeout
      if (deleted >= 500) break;
    }

    return { deleted };
  },
});

// ─── Get Unsynced Articles ──────────────────────────────────────────────────

export const getUnsyncedForMeilisearch = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("kb_articles")
      .withIndex("by_meilisearch_sync", (q) => q.eq("meilisearchSynced", false))
      .take(50);
  },
});

export const getUnsyncedForRag = internalQuery({
  args: {},
  handler: async (ctx) => {
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
    const article = await ctx.db.get(articleId);
    if (!article) return null;

    // Resolve category slug
    const category = article.categoryId ? await ctx.db.get(article.categoryId) : null;

    // Resolve tags via junction table
    const articleTagRows = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article", (q) => q.eq("articleId", articleId))
      .collect();

    const tagSlugs: string[] = [];
    for (const row of articleTagRows) {
      const tag = await ctx.db.get(row.tagId);
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
    await ctx.db.patch(articleId, {
      meilisearchSynced: true,
      meilisearchSyncedAt: Date.now(),
    });
  },
});

// ─── Mark RAG Synced ────────────────────────────────────────────────────────

export const markRagSynced = internalMutation({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    await ctx.db.patch(articleId, {
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
    const chunks = await ctx.db
      .query("kb_ragChunks")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();

    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    return { deleted: chunks.length };
  },
});

// ─── Get All RAG Chunks ──────────────────────────────────────────────────────

/**
 * Load all RAG chunks for cosine similarity scoring.
 * NOTE: This is efficient for small-to-medium KB sizes but will need
 * vector index support (or batched pagination) for very large deployments.
 */
export const getAllRagChunks = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("kb_ragChunks").collect();
  },
});
