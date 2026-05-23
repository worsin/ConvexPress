// @ts-nocheck
import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";

function totalItems(items: any[]) {
  return items.reduce((sum, item) => sum + Number(item.lineTotalAmount ?? 0), 0);
}

async function recalculate(ctx: any, draftOrderId: any) {
  const draft = await ctx.db.get(draftOrderId);
  if (!draft) return;
  const items = await ctx.db
    .query("commerce_draft_order_items")
    .withIndex("by_draft_order", (q: any) => q.eq("draftOrderId", draftOrderId))
    .collect();
  const subtotalAmount = totalItems(items);
  const totalAmount =
    subtotalAmount -
    Number(draft.discountAmount ?? 0) +
    Number(draft.shippingAmount ?? 0) +
    Number(draft.taxAmount ?? 0);
  await ctx.db.patch(draftOrderId, {
    subtotalAmount,
    totalAmount,
    updatedAt: Date.now(),
  });
}

export const list = query({
  args: { status: v.optional(v.union(v.literal("open"), v.literal("completed"), v.literal("canceled"))) },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    if (args.status) {
      return await ctx.db
        .query("commerce_draft_orders")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .order("desc")
        .collect();
    }
    return await ctx.db.query("commerce_draft_orders").order("desc").collect();
  },
});

export const get = query({
  args: { draftOrderId: v.id("commerce_draft_orders") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const draft = await ctx.db.get(args.draftOrderId);
    if (!draft) return null;
    const items = await ctx.db
      .query("commerce_draft_order_items")
      .withIndex("by_draft_order", (q: any) => q.eq("draftOrderId", args.draftOrderId))
      .collect();
    return { ...draft, items };
  },
});

export const create = mutation({
  args: {
    customerId: v.optional(v.id("commerce_customer_profiles")),
    userId: v.optional(v.id("users")),
    email: v.optional(v.string()),
    currencyCode: v.string(),
    regionId: v.optional(v.id("commerce_regions")),
    salesChannelId: v.optional(v.id("commerce_sales_channels")),
    customerGroupId: v.optional(v.id("commerce_customer_groups")),
    billingAddress: v.optional(v.any()),
    shippingAddress: v.optional(v.any()),
    discountAmount: v.optional(v.number()),
    shippingAmount: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    notes: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "manage_options");
    const now = Date.now();
    return await ctx.db.insert("commerce_draft_orders", {
      status: "open",
      customerId: args.customerId,
      userId: args.userId,
      email: args.email,
      currencyCode: args.currencyCode.toUpperCase(),
      regionId: args.regionId,
      salesChannelId: args.salesChannelId,
      customerGroupId: args.customerGroupId,
      billingAddress: args.billingAddress,
      shippingAddress: args.shippingAddress,
      subtotalAmount: 0,
      discountAmount: args.discountAmount ?? 0,
      shippingAmount: args.shippingAmount ?? 0,
      taxAmount: args.taxAmount ?? 0,
      totalAmount: (args.shippingAmount ?? 0) + (args.taxAmount ?? 0) - (args.discountAmount ?? 0),
      notes: args.notes,
      metadata: args.metadata,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertItem = mutation({
  args: {
    draftOrderId: v.id("commerce_draft_orders"),
    itemId: v.optional(v.id("commerce_draft_order_items")),
    productId: v.optional(v.id("commerce_products")),
    variantId: v.optional(v.id("commerce_product_variants")),
    title: v.string(),
    quantity: v.number(),
    unitPriceAmount: v.number(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const draft = await ctx.db.get(args.draftOrderId);
    if (!draft) throw new ConvexError({ code: "NOT_FOUND", message: "Draft order not found." });
    if (draft.status !== "open") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Only open draft orders can be edited." });
    }
    const now = Date.now();
    const lineTotalAmount = args.quantity * args.unitPriceAmount;
    let id = args.itemId;
    if (id) {
      await ctx.db.patch(id, {
        productId: args.productId,
        variantId: args.variantId,
        title: args.title,
        quantity: args.quantity,
        unitPriceAmount: args.unitPriceAmount,
        lineTotalAmount,
        metadata: args.metadata,
        updatedAt: now,
      });
    } else {
      id = await ctx.db.insert("commerce_draft_order_items", {
        draftOrderId: args.draftOrderId,
        productId: args.productId,
        variantId: args.variantId,
        title: args.title,
        quantity: args.quantity,
        unitPriceAmount: args.unitPriceAmount,
        lineTotalAmount,
        metadata: args.metadata,
        createdAt: now,
        updatedAt: now,
      });
    }
    await recalculate(ctx, args.draftOrderId);
    return id;
  },
});

export const complete = mutation({
  args: {
    draftOrderId: v.id("commerce_draft_orders"),
    orderId: v.optional(v.id("commerce_orders")),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const draft = await ctx.db.get(args.draftOrderId);
    if (!draft) throw new ConvexError({ code: "NOT_FOUND", message: "Draft order not found." });
    const now = Date.now();
    await ctx.db.patch(args.draftOrderId, {
      status: "completed",
      orderId: args.orderId,
      completedAt: now,
      updatedAt: now,
    });
    if (args.orderId) {
      await ctx.db.insert("commerce_order_changes", {
        orderId: args.orderId,
        version: 1,
        changeType: "edit",
        status: "applied",
        draftOrderId: args.draftOrderId,
        description: "Draft order completed.",
        appliedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    return args.draftOrderId;
  },
});
