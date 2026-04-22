/**
 * Site Notification Definitions - Public Queries
 *
 * Read operations for the siteNotificationDefinitions table.
 * Used by the admin Tools > Site Notifications page.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";

/**
 * List all site notification definitions with optional filtering.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    status: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    notificationType: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    search: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    let notifs;

    if (args.status) {
      notifs = await ctx.db
        .query("siteNotificationDefinitions")
        .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", args.status!))
        .collect();
    } else if (args.notificationType) {
      notifs = await ctx.db
        .query("siteNotificationDefinitions")
        .withIndex("by_type", (q: ConvexQueryBuilder) =>
          q.eq("notificationType", args.notificationType!),
        )
        .collect();
    } else {
      notifs = await ctx.db
        .query("siteNotificationDefinitions")
        .collect();
    }

    if (args.search) {
      const searchLower = args.search.toLowerCase();
      notifs = notifs.filter(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (n) =>
          n.name.toLowerCase().includes(searchLower) ||
          (n.messageTemplate?.toLowerCase().includes(searchLower) ?? false) ||
          (n.systemName?.toLowerCase().includes(searchLower) ?? false),
      );
    }

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    notifs.sort((a, b) => a.name.localeCompare(b.name));

    return notifs;
  },
});

/**
 * Get a single site notification definition by ID.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const get = query({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { id: v.id("siteNotificationDefinitions") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db.get("siteNotificationDefinitions", args.id);
  },
});

/**
 * Get counts by status for status tabs.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const counts = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return {};

    const all = await ctx.db
      .query("siteNotificationDefinitions")
      .collect();
    const counts: Record<string, number> = { all: all.length };

    for (const n of all) {
      const status = n.status || "Unknown";
      counts[status] = (counts[status] ?? 0) + 1;
    }

    return counts;
  },
});
