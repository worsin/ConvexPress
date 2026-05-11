/**
 * @deprecated 2026-05-11 — Legacy in-admin Theme/Template Builder.
 *
 * STATUS:  Frozen. Hidden from active nav. Do NOT extend or fix issues here.
 * REASON:  A pre-built section enum + preset theme picker limits what each
 *          site can look like. Replaced by AI-generated React components,
 *          one per route, generated per site by the design:* skill kit.
 * REPLACEMENT:  See ConvexPress-Website/design-kit/README.md
 * REMOVAL:  Safe to delete once at least one site is fully shipped via the
 *           skill kit and nothing else references this file.
 */
/**
 * Layout System - Queries
 *
 * Read operations for layout configurations:
 *   list    — Returns all layouts ordered by name
 *   get     — Returns a single layout by ID
 *   getBySlug — Returns a single layout by slug (using index)
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "../helpers/permissions";

/**
 * List all layouts, ordered by name.
 *
 * @auth Requires authenticated user.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const layouts = await ctx.db
      .query("layouts")
      .withIndex("by_name")
      .collect();

    return layouts;
  },
});

/**
 * Get a single layout by its ID.
 *
 * @auth Requires authenticated user.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const get = query({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { id: v.id("layouts") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db.get(args.id);
  },
});

/**
 * Get a single layout by its slug.
 *
 * @auth Requires authenticated user.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getBySlug = query({
  args: { slug: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db
      .query("layouts")
      .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", args.slug))
      .first();
  },
});
