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
export const list = query({
  args: {},
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
export const get = query({
  args: { id: v.id("layouts") },
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
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db
      .query("layouts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});
