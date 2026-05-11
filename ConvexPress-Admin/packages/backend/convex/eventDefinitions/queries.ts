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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    status: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    category: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    search: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    let events;

    if (args.status) {
      events = await ctx.db
        .query("eventDefinitions")
        .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", args.status!))
        .collect();
    } else if (args.category) {
      events = await ctx.db
        .query("eventDefinitions")
        .withIndex("by_category", (q: ConvexQueryBuilder) => q.eq("category", args.category!))
        .collect();
    } else {
      events = await ctx.db.query("eventDefinitions").collect();
    }

    if (args.search) {
      const searchLower = args.search.toLowerCase();
      events = events.filter(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (evt) =>
          evt.name.toLowerCase().includes(searchLower) ||
          evt.eventCode.toLowerCase().includes(searchLower) ||
          (evt.systemName?.toLowerCase().includes(searchLower) ?? false),
      );
    }

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    events.sort((a, b) => a.eventCode.localeCompare(b.eventCode));

    return events;
  },
});

/**
 * Get a single event definition by ID.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const get = query({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { id: v.id("eventDefinitions") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db.get("eventDefinitions", args.id);
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

    const all = await ctx.db.query("eventDefinitions").collect();
    const counts: Record<string, number> = { all: all.length };

    for (const evt of all) {
      const status = evt.status || "Unknown";
      counts[status] = (counts[status] ?? 0) + 1;
    }

    return counts;
  },
});
