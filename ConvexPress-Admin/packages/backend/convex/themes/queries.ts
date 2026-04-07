import { query } from "../_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("themes").order("asc").collect();
  },
});

export const get = query({
  args: { id: v.id("themes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("themes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .first();
  },
});
