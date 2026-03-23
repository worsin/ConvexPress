/**
 * Event Definitions - Public Queries
 *
 * Read operations for the eventDefinitions table.
 * Used by the admin Tools > Events page.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";

/**
 * List all event definitions with optional filtering.
 */
export const list = query({
  args: {
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    let events;

    if (args.status) {
      events = await ctx.db
        .query("eventDefinitions")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else if (args.category) {
      events = await ctx.db
        .query("eventDefinitions")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .collect();
    } else {
      events = await ctx.db.query("eventDefinitions").collect();
    }

    if (args.search) {
      const searchLower = args.search.toLowerCase();
      events = events.filter(
        (evt) =>
          evt.name.toLowerCase().includes(searchLower) ||
          evt.eventCode.toLowerCase().includes(searchLower) ||
          (evt.systemName?.toLowerCase().includes(searchLower) ?? false),
      );
    }

    events.sort((a, b) => a.eventCode.localeCompare(b.eventCode));

    return events;
  },
});

/**
 * Get a single event definition by ID.
 */
export const get = query({
  args: { id: v.id("eventDefinitions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db.get("eventDefinitions", args.id);
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

    const all = await ctx.db.query("eventDefinitions").collect();
    const counts: Record<string, number> = { all: all.length };

    for (const evt of all) {
      const status = evt.status || "Unknown";
      counts[status] = (counts[status] ?? 0) + 1;
    }

    return counts;
  },
});
