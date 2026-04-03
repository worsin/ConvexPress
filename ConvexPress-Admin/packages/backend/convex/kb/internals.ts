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
