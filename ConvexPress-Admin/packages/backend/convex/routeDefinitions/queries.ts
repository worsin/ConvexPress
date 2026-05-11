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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    status: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    app: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    search: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    let routes;

    if (args.status) {
      routes = await ctx.db
        .query("routeDefinitions")
        .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", args.status!))
        .collect();
    } else if (args.app) {
      routes = await ctx.db
        .query("routeDefinitions")
        .withIndex("by_app", (q: ConvexQueryBuilder) => q.eq("app", args.app!))
        .collect();
    } else {
      routes = await ctx.db.query("routeDefinitions").collect();
    }

    if (args.search) {
      const searchLower = args.search.toLowerCase();
      routes = routes.filter(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (route) =>
          route.name.toLowerCase().includes(searchLower) ||
          route.path.toLowerCase().includes(searchLower) ||
          (route.systemName?.toLowerCase().includes(searchLower) ?? false),
      );
    }

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    routes.sort((a, b) => a.path.localeCompare(b.path));

    return routes;
  },
});

/**
 * Get a single route definition by ID.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const get = query({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { id: v.id("routeDefinitions") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db.get("routeDefinitions", args.id);
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
