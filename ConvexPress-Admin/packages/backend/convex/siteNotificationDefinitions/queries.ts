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
export const list = query({
  args: {
    status: v.optional(v.string()),
    notificationType: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    let notifs;

    if (args.status) {
      notifs = await ctx.db
        .query("siteNotificationDefinitions")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else if (args.notificationType) {
      notifs = await ctx.db
        .query("siteNotificationDefinitions")
        .withIndex("by_type", (q) =>
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
        (n) =>
          n.name.toLowerCase().includes(searchLower) ||
          (n.messageTemplate?.toLowerCase().includes(searchLower) ?? false) ||
          (n.systemName?.toLowerCase().includes(searchLower) ?? false),
      );
    }

    notifs.sort((a, b) => a.name.localeCompare(b.name));

    return notifs;
  },
});

/**
 * Get a single site notification definition by ID.
 */
export const get = query({
  args: { id: v.id("siteNotificationDefinitions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db.get("siteNotificationDefinitions", args.id);
  },
});

/**
 * Get counts by status for status tabs.
 */
export const counts = query({
  args: {},
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
