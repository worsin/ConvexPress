import { query } from "../_generated/server";
import { v } from "convex/values";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    return await ctx.db.query("themes").order("asc").collect();
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const get = query({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { id: v.id("themes") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getActive = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    return await ctx.db
      .query("themes")
      .withIndex("by_active", (q: ConvexQueryBuilder) => q.eq("isActive", true))
      .first();
  },
});
