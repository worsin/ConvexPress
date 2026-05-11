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
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";

// ─── Track Page View ────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const trackPageView = mutation({
  args: trackPageViewArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    // Validate sessionId
    if (!args.sessionId || args.sessionId.length > 128) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Invalid session ID" });
    }
    // Validate article exists
    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    const user = await getCurrentUser(ctx);
    const now = Date.now();

    // Check if this session has EVER viewed this article
    const priorView = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_session_article", (q: ConvexQueryBuilder) =>
        q.eq("sessionId", args.sessionId).eq("articleId", args.articleId),
      )
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
    if (article) {
      await ctx.db.patch("kb_articles", args.articleId, {
        viewCount: article.viewCount + 1,
        uniqueViewCount: isNewUnique ? article.uniqueViewCount + 1 : article.uniqueViewCount,
      });
    }

    return viewId;
  },
});

// ─── Update Duration ────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateDuration = mutation({
  args: updateDurationArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    // Validate duration range
    if (args.duration < 0 || args.duration > 3600) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Duration must be between 0 and 3600 seconds" });
    }
    // Validate page view exists
    const pageView = await ctx.db.get("kb_pageViews", args.pageViewId);
    if (!pageView) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Page view not found" });
    }

    await ctx.db.patch("kb_pageViews", args.pageViewId, { duration: args.duration });
  },
});

// ─── Track Search ───────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const trackSearch = mutation({
  args: trackSearchArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    // Validate query
    if (!args.query || args.query.trim().length === 0 || args.query.length > 500) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Query must be non-empty and at most 500 characters" });
    }
    // Validate resultCount
    if (args.resultCount < 0) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Result count must be >= 0" });
    }

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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getDashboardStats = query({
  args: getDashboardStatsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await requireCan(ctx, "kb.viewAnalytics");

    const now = Date.now();
    const startDate = args.startDate ?? now - 30 * 24 * 60 * 60 * 1000; // Default 30 days
    const endDate = args.endDate ?? now;

    // Article counts by status — safety-bounded with .take(10000) per status
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const [draftArticles, reviewArticles, publishedArticles, archivedArticles] = await Promise.all([
      ctx.db.query("kb_articles").withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "draft")).take(10000),
      ctx.db.query("kb_articles").withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "review")).take(10000),
      ctx.db.query("kb_articles").withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "published")).take(10000),
      ctx.db.query("kb_articles").withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "archived")).take(10000),
    ]);
    const statusCounts = {
      draft: draftArticles.length,
      review: reviewArticles.length,
      published: publishedArticles.length,
      archived: archivedArticles.length,
    };
    const totalArticles = draftArticles.length + reviewArticles.length + publishedArticles.length + archivedArticles.length;

    // Page views in range — safety-bounded with .take(50000)
    const viewsInRange = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_date", (q: ConvexQueryBuilder) => q.gte("createdAt", startDate).lte("createdAt", endDate))
      .take(50000);
    const totalViews = viewsInRange.length;
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const uniqueSessions = new Set(viewsInRange.map((v) => v.sessionId)).size;

    // Search queries in range — safety-bounded with .take(10000)
    const searchesInRange = await ctx.db
      .query("kb_searchQueries")
      .withIndex("by_date", (q: ConvexQueryBuilder) => q.gte("createdAt", startDate).lte("createdAt", endDate))
      .take(10000);

    // Feedback stats — no date-range index on feedback; use a safety-bounded take
    const feedback = await ctx.db.query("kb_articleFeedback").take(5000);
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const helpful = feedback.filter((f) => f.isHelpful).length;
    const total = feedback.length;

    return {
      articles: statusCounts,
      totalArticles,
      views: {
        total: totalViews,
        uniqueSessions,
      },
      searches: {
        total: searchesInRange.length,
        avgResultCount: searchesInRange.length > 0
          // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getArticleStats = query({
  args: getArticleAnalyticsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await requireCan(ctx, "kb.viewAnalytics");

    const views = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_article", (q: ConvexQueryBuilder) => q.eq("articleId", args.articleId))
      .take(10000);

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const durations = views.filter((v) => v.duration).map((v) => v.duration!);
    const avgDuration = durations.length > 0
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : 0;

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const uniqueSessions = new Set(views.map((v) => v.sessionId)).size;

    // Views over time (last 30 days, grouped by day)
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getSearchAnalytics = query({
  args: getSearchAnalyticsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await requireCan(ctx, "kb.viewAnalytics");

    const now = Date.now();
    const startDate = args.startDate ?? now - 30 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate ?? now;
    const limit = args.limit ?? 20;

    const inRange = await ctx.db
      .query("kb_searchQueries")
      .withIndex("by_date", (q: ConvexQueryBuilder) => q.gte("createdAt", startDate).lte("createdAt", endDate))
      .take(10000);

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
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const topQueries = Object.entries(queryCounts)
      .map(([query, stats]) => ({
        query,
        count: stats.count,
        avgResults: Math.round(stats.avgResults / stats.count),
        clickRate: stats.count > 0 ? Math.round((stats.clicked / stats.count) * 100) : 0,
      }))
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    // Zero-result queries
    const zeroResults = inRange
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .filter((s) => s.resultCount === 0)
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .map((s) => s.query);
    const uniqueZeroResults = [
      ...new Set(zeroResults.map((query: string) => query.toLowerCase().trim())),
    ];

    return {
      totalSearches: inRange.length,
      topQueries,
      zeroResultQueries: uniqueZeroResults.slice(0, limit),
      bySource: {
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        convex: inRange.filter((s) => s.source === "convex").length,
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        meilisearch: inRange.filter((s) => s.source === "meilisearch").length,
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        rag: inRange.filter((s) => s.source === "rag").length,
      },
    };
  },
});
