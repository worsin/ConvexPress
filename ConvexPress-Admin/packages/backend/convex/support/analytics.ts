/**
 * Support Bridge System - Analytics Queries
 *
 * Admin analytics for measuring support deflection effectiveness:
 *
 *   getDeflectionStats        - Overall deflection rate and outcome breakdown
 *   getTopDeflectingArticles  - KB articles that resolve the most queries
 *   getCommonUnanswered       - Queries with no matching articles (content gaps)
 *
 * All queries require the ticket.viewAll capability (admin/support role).
 */

import { query } from "../_generated/server";
import { currentUserCan } from "../helpers/permissions";
import {
  getDeflectionStatsArgs,
  getTopDeflectingArticlesArgs,
  getCommonUnansweredArgs,
} from "./validators";
import { isPluginEnabled } from "../helpers/plugins";

// ─── getDeflectionStats ────────────────────────────────────────────────────────

/**
 * Get overall deflection statistics for the support widget.
 *
 * Returns:
 *   - totalQueries: total deflection log entries in range
 *   - deflectionRate: percentage of queries resolved without escalation
 *   - outcomeBreakdown: { helpful, notHelpful, escalated, abandoned } counts
 *   - avgResponseLatencyMs: average AI response time
 *
 * @auth ticket.viewAll capability
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getDeflectionStats = query({
  args: getDeflectionStatsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const canView = await currentUserCan(ctx, "ticket.viewAll");
    if (!canView) return null;

    // Load logs in the date range using index. Default to last 90 days if no startDate.
    const now = Date.now();
    const startDate = args.startDate ?? now - 90 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate ?? now;
    // Safety-bounded with .take(50000)
    const logs = await ctx.db
      .query("support_deflectionLogs")
      .withIndex("by_date", (q: ConvexQueryBuilder) => q.gte("createdAt", startDate).lte("createdAt", endDate))
      .take(50000);

    if (logs.length === 0) {
      return {
        totalQueries: 0,
        deflectionRate: 0,
        outcomeBreakdown: { helpful: 0, notHelpful: 0, escalated: 0, abandoned: 0 },
        avgResponseLatencyMs: 0,
      };
    }

    type DeflectionOutcome = "helpful" | "notHelpful" | "escalated" | "abandoned";
    const outcomeBreakdown: Record<DeflectionOutcome, number> = {
      helpful: 0,
      notHelpful: 0,
      escalated: 0,
      abandoned: 0,
    };

    let totalLatency = 0;

    for (const log of logs) {
      const outcome = log.outcome as DeflectionOutcome;
      if (outcome in outcomeBreakdown) {
        outcomeBreakdown[outcome]++;
      }
      totalLatency += log.responseLatencyMs;
    }

    // Deflection rate = queries resolved without escalation (helpful + abandoned)
    // "helpful" = successfully deflected; "escalated" = failed deflection
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const deflected = outcomeBreakdown.helpful;
    const deflectionRate = logs.length > 0 ? deflected / logs.length : 0;

    return {
      totalQueries: logs.length,
      deflectionRate: Math.round(deflectionRate * 1000) / 10, // percentage, 1 decimal
      outcomeBreakdown,
      avgResponseLatencyMs: Math.round(totalLatency / logs.length),
    };
  },
});

// ─── getTopDeflectingArticles ─────────────────────────────────────────────────

/**
 * Get the KB articles that resolve the most support queries.
 *
 * Scans deflection logs, counts how many "helpful" outcomes cited each article,
 * and returns the top N articles sorted by helpfulness count descending.
 *
 * Returns:
 *   Array of { articleId, helpfulCount, totalCitedCount, deflectionRate }
 *
 * @auth ticket.viewAll capability
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getTopDeflectingArticles = query({
  args: getTopDeflectingArticlesArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return [];
    const canView = await currentUserCan(ctx, "ticket.viewAll");
    if (!canView) return null;

    const limit = Math.min(args.limit ?? 10, 50);

    // Load logs in the date range. Default to last 90 days if no startDate.
    const now = Date.now();
    const startDate = args.startDate ?? now - 90 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate ?? now;
    // Safety-bounded with .take(50000)
    const logs = await ctx.db
      .query("support_deflectionLogs")
      .withIndex("by_date", (q: ConvexQueryBuilder) => q.gte("createdAt", startDate).lte("createdAt", endDate))
      .take(50000);

    // Count per-article helpful and total citations
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const articleCounts = new Map<string, { helpful: number; total: number }>();

    for (const log of logs) {
      for (const articleId of log.kbArticleIds) {
        const existing = articleCounts.get(articleId) ?? { helpful: 0, total: 0 };
        existing.total++;
        if (log.outcome === "helpful") {
          existing.helpful++;
        }
        articleCounts.set(articleId, existing);
      }
    }

    // Sort by helpful count descending, take top N
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const sorted = Array.from(articleCounts.entries())
      .sort(
        (
          // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
          [, a]: [string, { helpful: number; total: number }],
          // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
          [, b]: [string, { helpful: number; total: number }],
        ) => b.helpful - a.helpful,
      )
      .slice(0, limit);

    return sorted.map(([articleId, counts]) => ({
      articleId,
      helpfulCount: counts.helpful,
      totalCitedCount: counts.total,
      deflectionRate:
        counts.total > 0
          ? Math.round((counts.helpful / counts.total) * 1000) / 10
          : 0,
    }));
  },
});

// ─── getCommonUnanswered ──────────────────────────────────────────────────────

/**
 * Get the most common queries that had no matching KB articles.
 *
 * These are deflection logs where kbArticleIds is empty. They represent
 * content gaps in the KB — topics users ask about but have no documentation.
 *
 * Returns:
 *   Array of { query, count, lastAskedAt } sorted by count descending
 *
 * Normalizes queries by lowercasing and trimming for grouping.
 *
 * @auth ticket.viewAll capability
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getCommonUnanswered = query({
  args: getCommonUnansweredArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const canView = await currentUserCan(ctx, "ticket.viewAll");
    if (!canView) return null;

    const limit = Math.min(args.limit ?? 20, 100);

    // Load logs in the date range. Default to last 90 days if no startDate.
    const now = Date.now();
    const startDate = args.startDate ?? now - 90 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate ?? now;
    // Safety-bounded with .take(50000)
    const logs = await ctx.db
      .query("support_deflectionLogs")
      .withIndex("by_date", (q: ConvexQueryBuilder) => q.gte("createdAt", startDate).lte("createdAt", endDate))
      .take(50000);

    // Filter to unanswered (no articles found)
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const unanswered = logs.filter((l) => l.kbArticleIds.length === 0);

    // Group by normalized query text
    const queryGroups = new Map<string, { count: number; lastAskedAt: number; raw: string }>();

    for (const log of unanswered) {
      const normalized = log.query.toLowerCase().trim();
      const existing = queryGroups.get(normalized);
      if (existing) {
        existing.count++;
        if (log.createdAt > existing.lastAskedAt) {
          existing.lastAskedAt = log.createdAt;
        }
      } else {
        queryGroups.set(normalized, {
          count: 1,
          lastAskedAt: log.createdAt,
          raw: log.query,
        });
      }
    }

    // Sort by count descending, take top N
    const groupedQueries: Array<{ count: number; lastAskedAt: number; raw: string }> = [];
    for (const group of queryGroups.values()) {
      groupedQueries.push(group);
    }
    // @ts-ignore TS2589: Convex generated API union types exceed TypeScript instantiation depth here.
    return groupedQueries
      .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
      .slice(0, limit)
      .map(({ raw, count, lastAskedAt }) => ({ query: raw, count, lastAskedAt }));
  },
});
