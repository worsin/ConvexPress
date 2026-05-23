// @ts-nocheck
import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";

async function clearDefault(ctx: any, currentId?: any) {
  const current = await ctx.db
    .query("commerce_sales_channels")
    .withIndex("by_default", (q: any) => q.eq("isDefault", true))
    .collect();
  for (const channel of current) {
    if (!currentId || channel._id.toString() !== currentId.toString()) {
      await ctx.db.patch(channel._id, { isDefault: false, updatedAt: Date.now() });
    }
  }
}

export const list = query({
  args: { includeDisabled: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const rows = await ctx.db.query("commerce_sales_channels").collect();
    return args.includeDisabled ? rows : rows.filter((row) => !row.isDisabled);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    isDisabled: v.optional(v.boolean()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    if (args.isDefault) await clearDefault(ctx);
    const now = Date.now();
    return await ctx.db.insert("commerce_sales_channels", {
      name: args.name,
      description: args.description,
      isDefault: args.isDefault,
      isDisabled: args.isDisabled ?? false,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    channelId: v.id("commerce_sales_channels"),
    patch: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      isDefault: v.optional(v.boolean()),
      isDisabled: v.optional(v.boolean()),
      metadata: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new ConvexError({ code: "NOT_FOUND", message: "Sales channel not found." });
    if (args.patch.isDefault) await clearDefault(ctx, args.channelId);
    await ctx.db.patch(args.channelId, { ...args.patch, updatedAt: Date.now() });
    return args.channelId;
  },
});

export const assignProduct = mutation({
  args: {
    productId: v.id("commerce_products"),
    channelId: v.id("commerce_sales_channels"),
    isAvailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const existing = await ctx.db
      .query("commerce_product_sales_channels")
      .withIndex("by_product_channel", (q: any) =>
        q.eq("productId", args.productId).eq("channelId", args.channelId),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        isAvailable: args.isAvailable ?? true,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("commerce_product_sales_channels", {
      productId: args.productId,
      channelId: args.channelId,
      isAvailable: args.isAvailable ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});
