/**
 * Dashboard System - Helpers
 *
 * Shared helper functions for dashboard queries and mutations.
 * These aggregate data from other systems' tables to provide
 * dashboard summary information.
 *
 * Also exports shared constants used by both queries.ts and mutations.ts.
 */

import type { QueryCtx } from "../_generated/server";

// ─── Shared Constants ──────────────────────────────────────────────────────

/**
 * Default admin widget order used when no preferences exist.
 *
 * IMPORTANT: This is the single source of truth for default widget layout.
 * Both queries.ts (getWidgetPreferences defaults) and mutations.ts
 * (new preference creation) MUST use this constant.
 *
 * Widget IDs must match the WIDGET_REGISTRY in the frontend.
 */
export const DEFAULT_ADMIN_WIDGET_ORDER = {
  primary: ["at-a-glance", "activity-feed"],
  secondary: ["quick-draft", "moderation-queue", "recent-comments", "system-health"],
} as const;

/**
 * Default website dashboard widget order.
 */
export const DEFAULT_WEBSITE_WIDGET_ORDER = {
  primary: ["my-content", "my-notifications"],
  secondary: ["my-comments", "content-performance", "quick-links"],
} as const;

/**
 * Get the default widget order for a given surface.
 */
export function getDefaultWidgetOrder(
  surface: "admin" | "website",
): { primary: string[]; secondary: string[] } {
  if (surface === "admin") {
    return {
      primary: [...DEFAULT_ADMIN_WIDGET_ORDER.primary],
      secondary: [...DEFAULT_ADMIN_WIDGET_ORDER.secondary],
    };
  }
  return {
    primary: [...DEFAULT_WEBSITE_WIDGET_ORDER.primary],
    secondary: [...DEFAULT_WEBSITE_WIDGET_ORDER.secondary],
  };
}

// ─── Content Counts ─────────────────────────────────────────────────────────

export interface ContentCounts {
  posts: {
    publish: number;
    draft: number;
    pending: number;
    future: number;
    private: number;
    trash: number;
    total: number;
  };
  pages: {
    publish: number;
    draft: number;
    pending: number;
    private: number;
    trash: number;
    total: number;
  };
}

/**
 * Count posts and pages by status.
 *
 * Uses the `by_type_status` index on the posts table.
 * Performs one query per type+status combination.
 */
export async function getContentCounts(ctx: QueryCtx): Promise<ContentCounts> {
  const postStatuses = [
    "publish",
    "draft",
    "pending",
    "future",
    "private",
    "trash",
  ] as const;
  const pageStatuses = [
    "publish",
    "draft",
    "pending",
    "private",
    "trash",
  ] as const;

  // Count posts by status
  const postCounts: Record<string, number> = {};
  let postTotal = 0;
  for (const status of postStatuses) {
    const count = await ctx.db
      .query("posts")
      .withIndex("by_type_status", (q) =>
        q.eq("type", "post").eq("status", status),
      )
      .collect();
    postCounts[status] = count.length;
    postTotal += count.length;
  }

  // Count pages by status
  const pageCounts: Record<string, number> = {};
  let pageTotal = 0;
  for (const status of pageStatuses) {
    const count = await ctx.db
      .query("posts")
      .withIndex("by_type_status", (q) =>
        q.eq("type", "page").eq("status", status),
      )
      .collect();
    pageCounts[status] = count.length;
    pageTotal += count.length;
  }

  return {
    posts: {
      publish: postCounts.publish ?? 0,
      draft: postCounts.draft ?? 0,
      pending: postCounts.pending ?? 0,
      future: postCounts.future ?? 0,
      private: postCounts.private ?? 0,
      trash: postCounts.trash ?? 0,
      total: postTotal,
    },
    pages: {
      publish: pageCounts.publish ?? 0,
      draft: pageCounts.draft ?? 0,
      pending: pageCounts.pending ?? 0,
      private: pageCounts.private ?? 0,
      trash: pageCounts.trash ?? 0,
      total: pageTotal,
    },
  };
}

// ─── Comment Counts ─────────────────────────────────────────────────────────

export interface CommentCounts {
  approved: number;
  pending: number;
  spam: number;
  trash: number;
  total: number;
}

/**
 * Count comments by status.
 *
 * Uses the `by_status` index on the comments table.
 */
export async function getCommentCounts(ctx: QueryCtx): Promise<CommentCounts> {
  const statuses = ["approved", "pending", "spam", "trash"] as const;

  const counts: Record<string, number> = {};
  let total = 0;
  for (const status of statuses) {
    const results = await ctx.db
      .query("comments")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();
    counts[status] = results.length;
    total += results.length;
  }

  return {
    approved: counts.approved ?? 0,
    pending: counts.pending ?? 0,
    spam: counts.spam ?? 0,
    trash: counts.trash ?? 0,
    total,
  };
}

// ─── User Count ─────────────────────────────────────────────────────────────

/**
 * Count active users.
 *
 * Uses the `by_status` index on the users table.
 */
export async function getUserCount(ctx: QueryCtx): Promise<number> {
  const activeUsers = await ctx.db
    .query("users")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  return activeUsers.length;
}

// ─── Content Performance Aggregation ────────────────────────────────────────

/**
 * Pure aggregation helper — rank a list of content items (posts/pages) by
 * view count, with a tie-break by title. Items with zero views are
 * excluded. Callers pass in the recent-views map from `analytics_events`
 * aggregation and the item metadata list.
 *
 * Returns at most `limit` entries (default 5). Sort order:
 *   1. views DESC
 *   2. title ASC (stable tie-break)
 */
export function aggregateContentPerformance<
  T extends { _id: string; title: string },
>(
  items: T[],
  viewsByItemId: Record<string, number>,
  limit = 5,
): Array<T & { views: number }> {
  return items
    .map((item) => ({ ...item, views: viewsByItemId[item._id] ?? 0 }))
    .filter((entry) => entry.views > 0)
    .sort((a, b) => {
      if (b.views !== a.views) return b.views - a.views;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}
