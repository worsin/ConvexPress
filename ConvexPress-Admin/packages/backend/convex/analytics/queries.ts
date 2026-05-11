/**
 * Analytics System - Public Queries
 *
 * Admin-facing queries for analytics dashboards and post editor tabs.
 * All queries require analytics.view capability (Editor+).
 * Data is read primarily from pageAnalyticsDaily rollups for performance.
 * Today's data is supplemented from raw pageEvents for near-real-time stats.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { currentUserCan } from "../helpers/permissions";
import { dateRangeArgs, targetArgs } from "./validators";

// ─── Helper: Get date string for N days ago ─────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── getTrafficSummary ──────────────────────────────────────────────────────

/**
 * Traffic summary for a specific page or site-wide.
 * Reads from pageAnalyticsDaily rollups for the given date range.
 *
 * @auth analytics.view (Editor+)
 */
export const getTrafficSummary = query({
  args: {
    ...targetArgs,
    ...dateRangeArgs,
  },
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "analytics.view");
    if (!canView) return null;

    // Fetch rollups for the date range
    let rollups;
    if (args.postId) {
      rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_postId_date", (q) =>
          q.eq("postId", args.postId!).gte("date", args.startDate).lte("date", args.endDate),
        )
        .collect();
    } else if (args.path) {
      rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_path_date", (q) =>
          q.eq("path", args.path!).gte("date", args.startDate).lte("date", args.endDate),
        )
        .collect();
    } else {
      // Site-wide
      rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_date", (q) =>
          q.gte("date", args.startDate).lte("date", args.endDate),
        )
        .collect();
    }

    // Aggregate across all rollup rows
    let totalPageviews = 0;
    let totalSessions = 0;
    let bounceRateSum = 0;
    let bounceRateCount = 0;

    // Daily breakdown
    const dailyMap = new Map<string, { pageviews: number; uniqueVisitors: number }>();

    // Referrer breakdown
    const referrerMap = new Map<string, number>();

    // Device breakdown
    const deviceBreakdown = { desktop: 0, mobile: 0, tablet: 0 };

    // Country breakdown
    const countryMap = new Map<string, number>();

    for (const r of rollups) {
      totalPageviews += r.pageviews;
      totalSessions += r.sessions;
      bounceRateSum += r.bounceRate * r.sessions;
      bounceRateCount += r.sessions;

      // Daily
      const existing = dailyMap.get(r.date) ?? { pageviews: 0, uniqueVisitors: 0 };
      existing.pageviews += r.pageviews;
      existing.uniqueVisitors += r.uniqueVisitors;
      dailyMap.set(r.date, existing);

      // Referrers
      const domain = r.referrerDomain ?? "(direct)";
      referrerMap.set(domain, (referrerMap.get(domain) ?? 0) + r.pageviews);

      // Devices
      deviceBreakdown[r.deviceType] += r.pageviews;

      // Countries
      if (r.country) {
        countryMap.set(r.country, (countryMap.get(r.country) ?? 0) + r.pageviews);
      }
    }

    // Compute total unique visitors (summed from daily -- approximate, may overcount)
    let totalUniqueVisitors = 0;
    for (const d of dailyMap.values()) {
      totalUniqueVisitors += d.uniqueVisitors;
    }

    // Sort and format outputs
    const dailyBreakdown = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    const topReferrers = Array.from(referrerMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([domain, pageviews]) => ({ domain, pageviews }));

    const topCountries = Array.from(countryMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([country, pageviews]) => ({ country, pageviews }));

    return {
      totalPageviews,
      totalUniqueVisitors,
      totalSessions,
      avgBounceRate: bounceRateCount > 0 ? bounceRateSum / bounceRateCount : 0,
      dailyBreakdown,
      topReferrers,
      deviceBreakdown,
      topCountries,
    };
  },
});

// ─── getEngagementSummary ───────────────────────────────────────────────────

/**
 * Engagement summary for a specific page or site-wide.
 * Reads from pageAnalyticsDaily rollups for the given date range.
 *
 * @auth analytics.view (Editor+)
 */
export const getEngagementSummary = query({
  args: {
    ...targetArgs,
    ...dateRangeArgs,
  },
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "analytics.view");
    if (!canView) return null;

    // Fetch rollups (same pattern as getTrafficSummary)
    let rollups;
    if (args.postId) {
      rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_postId_date", (q) =>
          q.eq("postId", args.postId!).gte("date", args.startDate).lte("date", args.endDate),
        )
        .collect();
    } else if (args.path) {
      rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_path_date", (q) =>
          q.eq("path", args.path!).gte("date", args.startDate).lte("date", args.endDate),
        )
        .collect();
    } else {
      rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_date", (q) =>
          q.gte("date", args.startDate).lte("date", args.endDate),
        )
        .collect();
    }

    // Aggregate engagement metrics
    let totalTimeMs = 0;
    let totalEngagedMs = 0;
    let totalPageviews = 0;
    let totalInternalClicks = 0;

    // Weighted scroll depth aggregation
    const scrollDepthAccum = {
      hero: 0,
      topic1: 0,
      topic2: 0,
      topic3: 0,
      topic4: 0,
      topic5: 0,
      summary: 0,
      sources: 0,
      comments: 0,
    };

    // Click target aggregation
    const clickMap = new Map<string, number>();

    for (const r of rollups) {
      const weight = r.pageviews;
      totalTimeMs += r.avgTimeOnPageMs * weight;
      totalEngagedMs += r.avgEngagedTimeMs * weight;
      totalPageviews += weight;
      totalInternalClicks += r.internalClicks;

      // Weighted scroll depth
      for (const key of Object.keys(scrollDepthAccum) as Array<keyof typeof scrollDepthAccum>) {
        scrollDepthAccum[key] += r.scrollDepth[key] * weight;
      }

      // Click targets
      for (const ct of r.topClickTargets) {
        clickMap.set(ct.targetPath, (clickMap.get(ct.targetPath) ?? 0) + ct.count);
      }
    }

    // Compute weighted averages
    const scrollDepthDistribution = { ...scrollDepthAccum };
    if (totalPageviews > 0) {
      for (const key of Object.keys(scrollDepthDistribution) as Array<keyof typeof scrollDepthDistribution>) {
        scrollDepthDistribution[key] = scrollDepthDistribution[key] / totalPageviews;
      }
    }

    const topInternalLinks = Array.from(clickMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([targetPath, clicks]) => ({ targetPath, clicks }));

    return {
      avgTimeOnPage: totalPageviews > 0 ? totalTimeMs / totalPageviews : 0,
      avgEngagedTime: totalPageviews > 0 ? totalEngagedMs / totalPageviews : 0,
      scrollDepthDistribution,
      topInternalLinks,
      totalInternalClicks,
    };
  },
});

// ─── getTabBadges ───────────────────────────────────────────────────────────

/**
 * Compact metrics for the post editor's Analytics tab badges.
 * Returns lightweight data suitable for rendering in the tab bar.
 *
 * @auth analytics.view (Editor+)
 */
export const getTabBadges = query({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "analytics.view");
    if (!canView) return null;

    const now = todayUTC();
    const d7 = daysAgo(7);
    const d30 = daysAgo(30);

    // 7-day rollups
    const rollups7d = await ctx.db
      .query("pageAnalyticsDaily")
      .withIndex("by_postId_date", (q) =>
        q.eq("postId", args.postId).gte("date", d7).lte("date", now),
      )
      .collect();

    // 30-day rollups
    const rollups30d = await ctx.db
      .query("pageAnalyticsDaily")
      .withIndex("by_postId_date", (q) =>
        q.eq("postId", args.postId).gte("date", d30).lte("date", now),
      )
      .collect();

    const views7d = rollups7d.reduce((sum, r) => sum + r.pageviews, 0);
    const views30d = rollups30d.reduce((sum, r) => sum + r.pageviews, 0);

    // Average time on page (30d, weighted by pageviews)
    let totalTimeWeighted = 0;
    let totalPvs = 0;
    for (const r of rollups30d) {
      totalTimeWeighted += r.avgTimeOnPageMs * r.pageviews;
      totalPvs += r.pageviews;
    }
    const avgTimeOnPage = totalPvs > 0 ? totalTimeWeighted / totalPvs : 0;

    // Top section (deepest section most visitors reach in 30d)
    // Find the section with highest weighted scroll depth
    const sectionAccum = {
      hero: 0,
      topic1: 0,
      topic2: 0,
      topic3: 0,
      topic4: 0,
      topic5: 0,
      summary: 0,
      sources: 0,
      comments: 0,
    };
    for (const r of rollups30d) {
      for (const key of Object.keys(sectionAccum) as Array<keyof typeof sectionAccum>) {
        sectionAccum[key] += r.scrollDepth[key] * r.pageviews;
      }
    }

    // Find deepest section where >50% of readers reach
    const sectionOrder: Array<keyof typeof sectionAccum> = [
      "hero",
      "topic1",
      "topic2",
      "topic3",
      "topic4",
      "topic5",
      "summary",
      "sources",
      "comments",
    ];
    let topSection = "hero";
    if (totalPvs > 0) {
      for (const key of sectionOrder) {
        if (sectionAccum[key] / totalPvs >= 0.5) {
          topSection = key;
        }
      }
    }

    return {
      views7d,
      views30d,
      avgTimeOnPage,
      topSection,
    };
  },
});

// ─── getSiteOverview ────────────────────────────────────────────────────────

/**
 * Site-wide analytics overview for the admin Analytics page.
 *
 * @auth analytics.view (Editor+)
 */
export const getSiteOverview = query({
  args: dateRangeArgs,
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "analytics.view");
    if (!canView) return null;

    const rollups = await ctx.db
      .query("pageAnalyticsDaily")
      .withIndex("by_date", (q) =>
        q.gte("date", args.startDate).lte("date", args.endDate),
      )
      .collect();

    let totalPageviews = 0;
    let totalSessions = 0;
    let bounceRateSum = 0;
    let bounceRateCount = 0;

    // Group by date for daily trend
    const dailyMap = new Map<string, { pageviews: number; uniqueVisitors: number }>();

    // Group by path for top pages
    const pageMap = new Map<
      string,
      { postId?: string; pageviews: number }
    >();

    for (const r of rollups) {
      totalPageviews += r.pageviews;
      totalSessions += r.sessions;
      bounceRateSum += r.bounceRate * r.sessions;
      bounceRateCount += r.sessions;

      // Daily
      const existing = dailyMap.get(r.date) ?? { pageviews: 0, uniqueVisitors: 0 };
      existing.pageviews += r.pageviews;
      existing.uniqueVisitors += r.uniqueVisitors;
      dailyMap.set(r.date, existing);

      // Pages
      const pageEntry = pageMap.get(r.path) ?? { postId: undefined, pageviews: 0 };
      pageEntry.pageviews += r.pageviews;
      if (r.postId) pageEntry.postId = r.postId;
      pageMap.set(r.path, pageEntry);
    }

    // Total unique visitors (approximate)
    let totalUniqueVisitors = 0;
    for (const d of dailyMap.values()) {
      totalUniqueVisitors += d.uniqueVisitors;
    }

    // Sort and format
    const dailyTrend = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    const topPages = Array.from(pageMap.entries())
      .sort(([, a], [, b]) => b.pageviews - a.pageviews)
      .slice(0, 20)
      .map(([path, data]) => ({ path, postId: data.postId, pageviews: data.pageviews }));

    return {
      totalPageviews,
      totalUniqueVisitors,
      totalSessions,
      avgBounceRate: bounceRateCount > 0 ? bounceRateSum / bounceRateCount : 0,
      topPages,
      dailyTrend,
    };
  },
});

// ─── getRecentEvents ────────────────────────────────────────────────────────

/**
 * Recent raw events for near-real-time display.
 * Reads from the raw pageEvents table for the last hour.
 *
 * @auth analytics.view (Editor+)
 */
export const getRecentEvents = query({
  args: {
    path: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "analytics.view");
    if (!canView) return null;

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const limit = args.limit ?? 50;

    let events;
    if (args.path) {
      events = await ctx.db
        .query("pageEvents")
        .withIndex("by_path_timestamp", (q) =>
          q.eq("path", args.path!).gte("timestamp", oneHourAgo),
        )
        .order("desc")
        .take(limit);
    } else {
      events = await ctx.db
        .query("pageEvents")
        .withIndex("by_timestamp", (q) => q.gte("timestamp", oneHourAgo))
        .order("desc")
        .take(limit);
    }

    return events.map((e) => ({
      eventType: e.eventType,
      path: e.path,
      timestamp: e.timestamp,
      deviceType: e.deviceType,
      browser: e.browser,
      referrerDomain: e.referrerDomain,
      payload: e.payload,
    }));
  },
});
