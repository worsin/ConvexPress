/**
 * Knowledge Base System - Analytics Functions
 *
 * Page view tracking and search analytics:
 *   trackPageView      - Record a page view (session-deduplicated, mutation)
 *   updateDuration     - Update view duration (mutation)
 *   trackSearch        - Log a search query (mutation)
 *   getDashboardStats  - KB-wide analytics stats (admin query)
 *   getArticleStats    - Single article analytics (admin query)
 *   getSearchAnalytics - Search query analytics (admin query)
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import {
  trackPageViewArgs,
  updateDurationArgs,
  trackSearchArgs,
  getDashboardStatsArgs,
  getArticleAnalyticsArgs,
  getSearchAnalyticsArgs,
  PAGE_VIEW_DEDUP_WINDOW_MS,
} from "./validators";

// ─── Track Page View ────────────────────────────────────────────────────────

export const trackPageView = mutation({
  args: trackPageViewArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();

    // Check if this session has EVER viewed this article
    const priorView = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("articleId"), args.articleId))
      .first();

    // Session-based deduplication: skip if same session+article viewed within 30 min
    if (priorView && now - priorView.createdAt < PAGE_VIEW_DEDUP_WINDOW_MS) {
      return priorView._id; // Deduplicated
    }

    // isNewUnique: this session has never viewed this article before
    const isNewUnique = !priorView;

    // Record the view
    const viewId = await ctx.db.insert("kb_pageViews", {
      articleId: args.articleId,
      userId: user?._id,
      sessionId: args.sessionId,
      referrer: args.referrer,
      userAgent: args.userAgent,
      duration: undefined,
      createdAt: now,
    });

    // Increment article view counts
    const article = await ctx.db.get(args.articleId);
    if (article) {
      await ctx.db.patch(args.articleId, {
        viewCount: article.viewCount + 1,
        uniqueViewCount: isNewUnique ? article.uniqueViewCount + 1 : article.uniqueViewCount,
      });
    }

    return viewId;
  },
});

// ─── Update Duration ────────────────────────────────────────────────────────

export const updateDuration = mutation({
  args: updateDurationArgs,
  handler: async (ctx, args) => {
    const view = await ctx.db.get(args.pageViewId);
    if (!view) return;

    await ctx.db.patch(args.pageViewId, { duration: args.duration });
  },
});

// ─── Track Search ───────────────────────────────────────────────────────────

export const trackSearch = mutation({
  args: trackSearchArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const searchId = await ctx.db.insert("kb_searchQueries", {
      query: args.query,
      resultCount: args.resultCount,
      userId: user?._id,
      clickedArticleId: args.clickedArticleId,
      source: args.source,
      createdAt: Date.now(),
    });

    return searchId;
  },
});

// ─── Get Dashboard Stats (Admin) ────────────────────────────────────────────

export const getDashboardStats = query({
  args: getDashboardStatsArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.viewAnalytics");

    const now = Date.now();
    const startDate = args.startDate ?? now - 30 * 24 * 60 * 60 * 1000; // Default 30 days
    const endDate = args.endDate ?? now;

    // Article counts by status
    const allArticles = await ctx.db.query("kb_articles").collect();
    const statusCounts = {
      draft: 0,
      review: 0,
      published: 0,
      archived: 0,
    };
    for (const article of allArticles) {
      statusCounts[article.status]++;
    }

    // Page views in range
    const views = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_date")
      .collect();
    const viewsInRange = views.filter((v) => v.createdAt >= startDate && v.createdAt <= endDate);
    const totalViews = viewsInRange.length;
    const uniqueSessions = new Set(viewsInRange.map((v) => v.sessionId)).size;

    // Search queries in range
    const searches = await ctx.db
      .query("kb_searchQueries")
      .withIndex("by_date")
      .collect();
    const searchesInRange = searches.filter((s) => s.createdAt >= startDate && s.createdAt <= endDate);

    // Feedback stats
    const feedback = await ctx.db.query("kb_articleFeedback").collect();
    const helpful = feedback.filter((f) => f.isHelpful).length;
    const total = feedback.length;

    return {
      articles: statusCounts,
      totalArticles: allArticles.length,
      views: {
        total: totalViews,
        uniqueSessions,
      },
      searches: {
        total: searchesInRange.length,
        avgResultCount: searchesInRange.length > 0
          ? Math.round(searchesInRange.reduce((s, q) => s + q.resultCount, 0) / searchesInRange.length)
          : 0,
      },
      feedback: {
        total,
        helpfulPercent: total > 0 ? Math.round((helpful / total) * 100) : 0,
      },
    };
  },
});

// ─── Get Article Stats (Admin) ──────────────────────────────────────────────

export const getArticleStats = query({
  args: getArticleAnalyticsArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.viewAnalytics");

    const views = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();

    const durations = views.filter((v) => v.duration).map((v) => v.duration!);
    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : 0;

    const uniqueSessions = new Set(views.map((v) => v.sessionId)).size;

    // Views over time (last 30 days, grouped by day)
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentViews = views.filter((v) => v.createdAt >= thirtyDaysAgo);

    const viewsByDay: Record<string, number> = {};
    for (const view of recentViews) {
      const day = new Date(view.createdAt).toISOString().slice(0, 10);
      viewsByDay[day] = (viewsByDay[day] ?? 0) + 1;
    }

    return {
      totalViews: views.length,
      uniqueSessions,
      avgDuration,
      viewsByDay,
    };
  },
});

// ─── Get Search Analytics (Admin) ───────────────────────────────────────────

export const getSearchAnalytics = query({
  args: getSearchAnalyticsArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.viewAnalytics");

    const now = Date.now();
    const startDate = args.startDate ?? now - 30 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate ?? now;
    const limit = args.limit ?? 20;

    const searches = await ctx.db
      .query("kb_searchQueries")
      .withIndex("by_date")
      .collect();

    const inRange = searches.filter((s) => s.createdAt >= startDate && s.createdAt <= endDate);

    // Group by query
    const queryCounts: Record<string, { count: number; avgResults: number; clicked: number }> = {};
    for (const search of inRange) {
      const key = search.query.toLowerCase().trim();
      if (!queryCounts[key]) {
        queryCounts[key] = { count: 0, avgResults: 0, clicked: 0 };
      }
      queryCounts[key].count++;
      queryCounts[key].avgResults += search.resultCount;
      if (search.clickedArticleId) queryCounts[key].clicked++;
    }

    // Calculate averages and sort
    const topQueries = Object.entries(queryCounts)
      .map(([query, stats]) => ({
        query,
        count: stats.count,
        avgResults: Math.round(stats.avgResults / stats.count),
        clickRate: stats.count > 0 ? Math.round((stats.clicked / stats.count) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    // Zero-result queries
    const zeroResults = inRange
      .filter((s) => s.resultCount === 0)
      .map((s) => s.query);
    const uniqueZeroResults = [...new Set(zeroResults.map((q) => q.toLowerCase().trim()))];

    return {
      totalSearches: inRange.length,
      topQueries,
      zeroResultQueries: uniqueZeroResults.slice(0, limit),
      bySource: {
        convex: inRange.filter((s) => s.source === "convex").length,
        meilisearch: inRange.filter((s) => s.source === "meilisearch").length,
        rag: inRange.filter((s) => s.source === "rag").length,
      },
    };
  },
});
