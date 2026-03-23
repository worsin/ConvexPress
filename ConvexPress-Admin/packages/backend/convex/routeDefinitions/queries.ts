/**
 * Route Definitions - Public Queries
 *
 * Read operations for the routeDefinitions table.
 * Used by the admin Tools > Routes page.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";

/**
 * List all route definitions with optional filtering.
 */
export const list = query({
  args: {
    status: v.optional(v.string()),
    app: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    let routes;

    if (args.status) {
      routes = await ctx.db
        .query("routeDefinitions")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else if (args.app) {
      routes = await ctx.db
        .query("routeDefinitions")
        .withIndex("by_app", (q) => q.eq("app", args.app!))
        .collect();
    } else {
      routes = await ctx.db.query("routeDefinitions").collect();
    }

    if (args.search) {
      const searchLower = args.search.toLowerCase();
      routes = routes.filter(
        (route) =>
          route.name.toLowerCase().includes(searchLower) ||
          route.path.toLowerCase().includes(searchLower) ||
          (route.systemName?.toLowerCase().includes(searchLower) ?? false),
      );
    }

    routes.sort((a, b) => a.path.localeCompare(b.path));

    return routes;
  },
});

/**
 * Get a single route definition by ID.
 */
export const get = query({
  args: { id: v.id("routeDefinitions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db.get("routeDefinitions", args.id);
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

    const all = await ctx.db.query("routeDefinitions").collect();
    const counts: Record<string, number> = { all: all.length };

    for (const route of all) {
      const status = route.status || "Unknown";
      counts[status] = (counts[status] ?? 0) + 1;
    }

    // Also count by app
    const appCounts: Record<string, number> = {};
    for (const route of all) {
      const app = route.app || "Unknown";
      appCounts[app] = (appCounts[app] ?? 0) + 1;
    }

    return { ...counts, ...appCounts };
  },
});
