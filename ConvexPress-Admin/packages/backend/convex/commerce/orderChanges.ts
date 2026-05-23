// @ts-nocheck
import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";

const changeType = v.union(
  v.literal("edit"),
  v.literal("return"),
  v.literal("exchange"),
  v.literal("claim"),
  v.literal("cancel"),
  v.literal("refund"),
);

export const listForOrder = query({
  args: { orderId: v.id("commerce_orders") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const changes = await ctx.db
      .query("commerce_order_changes")
      .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
      .collect();
    const enriched = [];
    for (const change of changes) {
      const actions = await ctx.db
        .query("commerce_order_change_actions")
        .withIndex("by_order_change", (q: any) => q.eq("orderChangeId", change._id))
        .collect();
      enriched.push({ ...change, actions: actions.sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0)) });
    }
    return enriched;
  },
});

export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("requested"),
        v.literal("confirmed"),
        v.literal("declined"),
        v.literal("canceled"),
        v.literal("applied"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    const changes = args.status
      ? await ctx.db
          .query("commerce_order_changes")
          .withIndex("by_status", (q: any) => q.eq("status", args.status))
          .order("desc")
          .take(limit)
      : await ctx.db.query("commerce_order_changes").order("desc").take(limit);

    return await Promise.all(
      changes.map(async (change: any) => {
        const order = await ctx.db.get(change.orderId);
        const actions = await ctx.db
          .query("commerce_order_change_actions")
          .withIndex("by_order_change", (q: any) => q.eq("orderChangeId", change._id))
          .collect();
        return {
          ...change,
          orderNumber: order?.orderNumber,
          orderEmail: order?.email,
          actions,
        };
      }),
    );
  },
});

export const create = mutation({
  args: {
    orderId: v.id("commerce_orders"),
    changeType,
    description: v.optional(v.string()),
    internalNote: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "manage_options");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ code: "NOT_FOUND", message: "Order not found." });
    const existing = await ctx.db
      .query("commerce_order_changes")
      .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
      .collect();
    const now = Date.now();
    return await ctx.db.insert("commerce_order_changes", {
      orderId: args.orderId,
      version: existing.length + 1,
      changeType: args.changeType,
      status: "requested",
      description: args.description,
      internalNote: args.internalNote,
      requestedBy: actor._id,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const addAction = mutation({
  args: {
    orderChangeId: v.id("commerce_order_changes"),
    action: v.string(),
    reference: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    details: v.any(),
    amount: v.optional(v.number()),
    ordering: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const change = await ctx.db.get(args.orderChangeId);
    if (!change) throw new ConvexError({ code: "NOT_FOUND", message: "Order change not found." });
    const now = Date.now();
    return await ctx.db.insert("commerce_order_change_actions", {
      orderChangeId: args.orderChangeId,
      orderId: change.orderId,
      action: args.action,
      reference: args.reference,
      referenceId: args.referenceId,
      details: args.details,
      amount: args.amount,
      ordering: args.ordering,
      applied: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const transition = mutation({
  args: {
    orderChangeId: v.id("commerce_order_changes"),
    status: v.union(
      v.literal("confirmed"),
      v.literal("declined"),
      v.literal("canceled"),
      v.literal("applied"),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCan(ctx, "manage_options");
    const change = await ctx.db.get(args.orderChangeId);
    if (!change) throw new ConvexError({ code: "NOT_FOUND", message: "Order change not found." });
    const now = Date.now();
    const patch: any = { status: args.status, updatedAt: now };
    if (args.status === "confirmed") {
      patch.confirmedBy = actor._id;
      patch.confirmedAt = now;
    } else if (args.status === "declined") {
      patch.declinedBy = actor._id;
      patch.declinedAt = now;
    } else if (args.status === "canceled") {
      patch.canceledBy = actor._id;
      patch.canceledAt = now;
    } else if (args.status === "applied") {
      patch.appliedAt = now;
      const actions = await ctx.db
        .query("commerce_order_change_actions")
        .withIndex("by_order_change", (q: any) => q.eq("orderChangeId", args.orderChangeId))
        .collect();
      for (const action of actions) {
        await ctx.db.patch(action._id, { applied: true, updatedAt: now });
      }
    }
    if (args.note) patch.internalNote = [change.internalNote, args.note].filter(Boolean).join("\n");
    await ctx.db.patch(args.orderChangeId, patch);
    return args.orderChangeId;
  },
});
