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
export const getDeflectionStats = query({
  args: getDeflectionStatsArgs,
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "ticket.viewAll");
    if (!canView) return null;

    // Load logs in the date range using index to avoid full table scan
    const now = Date.now();
    const startDate = args.startDate ?? 0;
    const endDate = args.endDate ?? now;
    const logs = await ctx.db
      .query("support_deflectionLogs")
      .withIndex("by_date", (q) => q.gte("createdAt", startDate).lte("createdAt", endDate))
      .collect();

    if (logs.length === 0) {
      return {
        totalQueries: 0,
        deflectionRate: 0,
        outcomeBreakdown: { helpful: 0, notHelpful: 0, escalated: 0, abandoned: 0 },
        avgResponseLatencyMs: 0,
      };
    }

    const outcomeBreakdown = {
      helpful: 0,
      notHelpful: 0,
      escalated: 0,
      abandoned: 0,
    };

    let totalLatency = 0;

    for (const log of logs) {
      outcomeBreakdown[log.outcome]++;
      totalLatency += log.responseLatencyMs;
    }

    // Deflection rate = queries resolved without escalation (helpful + abandoned)
    // "helpful" = successfully deflected; "escalated" = failed deflection
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
export const getTopDeflectingArticles = query({
  args: getTopDeflectingArticlesArgs,
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "ticket.viewAll");
    if (!canView) return null;

    const limit = Math.min(args.limit ?? 10, 50);

    // Load logs in the date range using index to avoid full table scan
    const now = Date.now();
    const startDate = args.startDate ?? 0;
    const endDate = args.endDate ?? now;
    const logs = await ctx.db
      .query("support_deflectionLogs")
      .withIndex("by_date", (q) => q.gte("createdAt", startDate).lte("createdAt", endDate))
      .collect();

    // Count per-article helpful and total citations
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
    const sorted = Array.from(articleCounts.entries())
      .sort(([, a], [, b]) => b.helpful - a.helpful)
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
export const getCommonUnanswered = query({
  args: getCommonUnansweredArgs,
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "ticket.viewAll");
    if (!canView) return null;

    const limit = Math.min(args.limit ?? 20, 100);

    // Load logs in the date range using index to avoid full table scan
    const now = Date.now();
    const startDate = args.startDate ?? 0;
    const endDate = args.endDate ?? now;
    const logs = await ctx.db
      .query("support_deflectionLogs")
      .withIndex("by_date", (q) => q.gte("createdAt", startDate).lte("createdAt", endDate))
      .collect();

    // Filter to unanswered (no articles found)
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
    return Array.from(queryGroups.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(({ raw, count, lastAskedAt }) => ({ query: raw, count, lastAskedAt }));
  },
});
