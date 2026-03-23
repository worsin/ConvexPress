/**
 * Capabilities - Public Queries
 *
 * Read operations for the capabilities (actions) table.
 * Used by the admin Tools > Capabilities page.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";

/**
 * List all capabilities with optional filtering.
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

    let capabilities;

    if (args.status) {
      capabilities = await ctx.db
        .query("capabilities")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else if (args.category) {
      capabilities = await ctx.db
        .query("capabilities")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .collect();
    } else {
      capabilities = await ctx.db.query("capabilities").collect();
    }

    // Apply search filter if provided
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      capabilities = capabilities.filter(
        (cap) =>
          cap.name.toLowerCase().includes(searchLower) ||
          cap.actionCode.toLowerCase().includes(searchLower) ||
          (cap.systemName?.toLowerCase().includes(searchLower) ?? false),
      );
    }

    // Sort alphabetically by action code
    capabilities.sort((a, b) => a.actionCode.localeCompare(b.actionCode));

    return capabilities;
  },
});

/**
 * Get a single capability by ID.
 */
export const get = query({
  args: { id: v.id("capabilities") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db.get("capabilities", args.id);
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

    const all = await ctx.db.query("capabilities").collect();
    const counts: Record<string, number> = { all: all.length };

    for (const cap of all) {
      const status = cap.status || "Unknown";
      counts[status] = (counts[status] ?? 0) + 1;
    }

    return counts;
  },
});
