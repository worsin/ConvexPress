// @ts-nocheck
import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    return await ctx.db.query("commerce_customer_groups").collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const now = Date.now();
    return await ctx.db.insert("commerce_customer_groups", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    groupId: v.id("commerce_customer_groups"),
    patch: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      metadata: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new ConvexError({ code: "NOT_FOUND", message: "Customer group not found." });
    await ctx.db.patch(args.groupId, { ...args.patch, updatedAt: Date.now() });
    return args.groupId;
  },
});

export const addMember = mutation({
  args: {
    groupId: v.id("commerce_customer_groups"),
    customerId: v.id("commerce_customer_profiles"),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "manage_options");
    const existing = await ctx.db
      .query("commerce_customer_group_members")
      .withIndex("by_group_customer", (q: any) =>
        q.eq("groupId", args.groupId).eq("customerId", args.customerId),
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("commerce_customer_group_members", {
      groupId: args.groupId,
      customerId: args.customerId,
      addedBy: actor._id,
      addedAt: Date.now(),
    });
  },
});

export const removeMember = mutation({
  args: {
    groupId: v.id("commerce_customer_groups"),
    customerId: v.id("commerce_customer_profiles"),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const existing = await ctx.db
      .query("commerce_customer_group_members")
      .withIndex("by_group_customer", (q: any) =>
        q.eq("groupId", args.groupId).eq("customerId", args.customerId),
      )
      .unique();
    if (!existing) return null;
    await ctx.db.delete(existing._id);
    return existing._id;
  },
});
