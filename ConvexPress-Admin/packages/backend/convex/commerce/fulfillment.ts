// @ts-nocheck
// ============================================
// FULFILLMENT OPERATIONS — Queue, assignments, status tracking,
// manifests, shipping cost recording, stats
// Ported from VexCart fulfillment.ts, adapted to ConvexPress schema
// (commerce_orders, commerce_order_history, commerce_shipments)
// ============================================

import { ConvexError, v } from "convex/values";

import {
  query,
  mutation,
  internalMutation,
} from "../_generated/server";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";

// ============================================
// HELPERS
// ============================================

const FULFILLMENT_STATUSES = [
  "pending",
  "processing",
  "packed",
  "ready_to_ship",
  "shipped",
  "partially_shipped",
  "on_hold",
] as const;

const PRIORITY_ORDER: Record<string, number> = {
  rush: 0,
  express: 1,
  standard: 2,
};

/**
 * Derive fulfillment priority from the shipping method on an order.
 */
function derivePriority(order: any): string {
  const method = (order.selectedShippingMethodCode ?? "").toLowerCase();
  if (method.includes("overnight") || method.includes("rush")) return "rush";
  if (method.includes("express") || method.includes("expedited")) return "express";
  return "standard";
}

/**
 * Calculate default ship-by date (2 business days).
 */
function defaultShipByDate(): number {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  return d.getTime();
}

// ============================================
// FULFILLMENT QUEUE QUERIES
// ============================================

/**
 * List orders in the fulfillment queue, enriched with order data.
 */
export const listQueue = query({
  args: {
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    // Fulfillment orders are tracked via commerce_order_history events
    // and the order's fulfillmentStatus field.
    let orders = await ctx.db
      .query("commerce_orders")
      .collect();

    // Filter to orders that need fulfillment (paid, processing, or fulfilled statuses)
    orders = orders.filter((o: any) => {
      const fulfillmentMatch = args.status
        ? o.fulfillmentStatus === args.status
        : ["unfulfilled", "processing", "packed", "ready_to_ship", "partially_shipped"].includes(
            o.fulfillmentStatus ?? "unfulfilled",
          );
      return fulfillmentMatch && ["paid", "processing", "fulfilled"].includes(o.status);
    });

    // Derive priority and optionally filter
    const enriched = orders.map((o: any) => ({
      ...o,
      _priority: derivePriority(o),
    }));

    let filtered = enriched;
    if (args.priority) {
      filtered = filtered.filter((o: any) => o._priority === args.priority);
    }

    // Sort: rush first, then by creation date (oldest first)
    filtered.sort((a: any, b: any) => {
      const pA = PRIORITY_ORDER[a._priority] ?? 2;
      const pB = PRIORITY_ORDER[b._priority] ?? 2;
      if (pA !== pB) return pA - pB;
      return a.createdAt - b.createdAt;
    });

    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;
    const page = filtered.slice(offset, offset + limit);

    return {
      items: page.map((o: any) => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        status: o.status,
        fulfillmentStatus: o.fulfillmentStatus ?? "unfulfilled",
        priority: o._priority,
        email: o.email,
        totalAmount: o.totalAmount,
        currencyCode: o.currencyCode,
        shippingAddress: o.shippingAddress,
        selectedShippingMethodLabel: o.selectedShippingMethodLabel,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        assignedTo: o.assignedTo,
      })),
      total: filtered.length,
      hasMore: offset + limit < filtered.length,
    };
  },
});

/**
 * Get detailed fulfillment info for a single order.
 */
export const getOrderFulfillment = query({
  args: { orderId: v.id("commerce_orders") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ code: "not_found", message: "Order not found" });

    // Get order items
    const items = await ctx.db
      .query("commerce_order_items")
      .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
      .collect();

    // Get shipments
    const shipments = await ctx.db
      .query("commerce_shipments")
      .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
      .collect();

    // Get history
    const history = await ctx.db
      .query("commerce_order_history")
      .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
      .collect();

    return {
      order,
      items,
      shipments,
      history: history.sort((a: any, b: any) => b.createdAt - a.createdAt),
      priority: derivePriority(order),
    };
  },
});

/**
 * Get fulfillment dashboard stats.
 */
export const getStats = query({
  args: {},
  handler: async (ctx: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const orders = await ctx.db
      .query("commerce_orders")
      .collect();

    const fulfillable = orders.filter((o: any) =>
      ["paid", "processing", "fulfilled"].includes(o.status),
    );

    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);

    return {
      pending: fulfillable.filter(
        (o: any) => (o.fulfillmentStatus ?? "unfulfilled") === "unfulfilled",
      ).length,
      processing: fulfillable.filter(
        (o: any) => o.fulfillmentStatus === "processing",
      ).length,
      readyToShip: fulfillable.filter(
        (o: any) => o.fulfillmentStatus === "ready_to_ship" || o.fulfillmentStatus === "packed",
      ).length,
      shipped: fulfillable.filter(
        (o: any) => o.fulfillmentStatus === "shipped",
      ).length,
      onHold: fulfillable.filter(
        (o: any) => o.fulfillmentStatus === "on_hold",
      ).length,
      rushOrders: fulfillable.filter((o: any) => {
        const p = derivePriority(o);
        return (
          p === "rush" &&
          !["shipped", "fulfilled"].includes(o.fulfillmentStatus ?? "unfulfilled")
        );
      }).length,
      totalOrders: fulfillable.length,
      todayPaid: fulfillable.filter(
        (o: any) => o.paidAt && o.paidAt >= todayStart,
      ).length,
    };
  },
});

// ============================================
// FULFILLMENT MUTATIONS
// ============================================

/**
 * Update the fulfillment status of an order.
 */
export const updateFulfillmentStatus = mutation({
  args: {
    orderId: v.id("commerce_orders"),
    fulfillmentStatus: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const user = await requireCan(ctx, "manage_options");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ code: "not_found", message: "Order not found" });

    const now = Date.now();
    const previousStatus = order.fulfillmentStatus ?? "unfulfilled";

    // Update order
    const patch: any = {
      fulfillmentStatus: args.fulfillmentStatus,
      updatedAt: now,
    };

    // If marking as shipped, update the main order status too
    if (args.fulfillmentStatus === "shipped") {
      patch.status = "fulfilled";
    }

    await ctx.db.patch(args.orderId, patch);

    // Record in order history
    await ctx.db.insert("commerce_order_history", {
      orderId: args.orderId,
      eventType: "fulfillment_status_changed",
      message: `Fulfillment status changed from "${previousStatus}" to "${args.fulfillmentStatus}"${args.note ? `: ${args.note}` : ""}`,
      actorUserId: user?._id,
      metadata: {
        previousStatus,
        newStatus: args.fulfillmentStatus,
      },
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Assign an order to a user for fulfillment.
 */
export const assignOrder = mutation({
  args: {
    orderId: v.id("commerce_orders"),
    assigneeUserId: v.optional(v.id("users")),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const user = await requireCan(ctx, "manage_options");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ code: "not_found", message: "Order not found" });

    const now = Date.now();

    await ctx.db.patch(args.orderId, {
      assignedTo: args.assigneeUserId,
      updatedAt: now,
    });

    // Record in history
    const actionMsg = args.assigneeUserId
      ? "Order assigned for fulfillment"
      : "Order unassigned from fulfillment";

    await ctx.db.insert("commerce_order_history", {
      orderId: args.orderId,
      eventType: "fulfillment_assigned",
      message: actionMsg,
      actorUserId: user?._id,
      metadata: { assigneeUserId: args.assigneeUserId },
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Add an internal note to the order fulfillment history.
 */
export const addFulfillmentNote = mutation({
  args: {
    orderId: v.id("commerce_orders"),
    note: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const user = await requireCan(ctx, "manage_options");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ code: "not_found", message: "Order not found" });

    await ctx.db.insert("commerce_order_history", {
      orderId: args.orderId,
      eventType: "fulfillment_note",
      message: args.note,
      actorUserId: user?._id,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================
// SHIPPING COST RECORDING
// ============================================

/**
 * Record shipping cost for an order (called after label purchase).
 * INTERNAL: not client-callable.
 */
export const recordShippingCost = internalMutation({
  args: {
    orderId: v.id("commerce_orders"),
    shipmentId: v.id("commerce_shipments"),
    chargedToCustomer: v.number(),
    carrierCost: v.number(),
    insuranceCost: v.optional(v.number()),
    packageMaterialCost: v.optional(v.number()),
    carrier: v.string(),
    service: v.string(),
    weightOz: v.number(),
  },
  handler: async (ctx: any, args: any) => {
    const totalCost =
      args.carrierCost + (args.insuranceCost ?? 0) + (args.packageMaterialCost ?? 0);
    const grossMargin = args.chargedToCustomer - totalCost;

    await ctx.db.insert("commerce_order_history", {
      orderId: args.orderId,
      eventType: "shipping_cost_recorded",
      message: `Shipping cost recorded: carrier $${(args.carrierCost / 100).toFixed(2)}, charged $${(args.chargedToCustomer / 100).toFixed(2)}`,
      metadata: {
        shipmentId: args.shipmentId,
        chargedToCustomer: args.chargedToCustomer,
        carrierCost: args.carrierCost,
        insuranceCost: args.insuranceCost,
        packageMaterialCost: args.packageMaterialCost,
        grossMargin,
        carrier: args.carrier,
        service: args.service,
        weightOz: args.weightOz,
      },
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================
// MANIFEST GENERATION
// ============================================

/**
 * List shipments ready for manifest (shipped but not yet manifested).
 */
export const listShipmentsByStatus = query({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let shipments;
    if (args.status) {
      shipments = await ctx.db
        .query("commerce_shipments")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .collect();
    } else {
      shipments = await ctx.db
        .query("commerce_shipments")
        .collect();
    }

    // Enrich with order info
    const enriched = await Promise.all(
      shipments.map(async (s: any) => {
        const order = await ctx.db.get(s.orderId);
        return {
          ...s,
          orderNumber: order?.orderNumber ?? "N/A",
          customerEmail: order?.email ?? "N/A",
        };
      }),
    );

    return enriched.sort((a: any, b: any) => b.createdAt - a.createdAt);
  },
});

/**
 * Generate a manifest for a batch of shipments.
 * Groups shipments into a logical manifest document.
 */
export const generateManifest = mutation({
  args: {
    shipmentIds: v.array(v.id("commerce_shipments")),
    carrier: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const user = await requireCan(ctx, "manage_options");

    if (args.shipmentIds.length === 0) {
      throw new ConvexError({ code: "empty", message: "No shipments provided" });
    }

    const now = Date.now();
    const manifestNumber = `MAN-${Date.now().toString(36).toUpperCase()}`;

    // Validate and tag each shipment
    let totalWeight = 0;
    for (const shipmentId of args.shipmentIds) {
      const shipment = await ctx.db.get(shipmentId);
      if (!shipment) continue;

      // Record manifest reference on shipment
      await ctx.db.patch(shipmentId, {
        externalManifestId: manifestNumber,
        updatedAt: now,
      });
    }

    // Record in history for each order
    const processedOrders = new Set<string>();
    for (const shipmentId of args.shipmentIds) {
      const shipment = await ctx.db.get(shipmentId);
      if (!shipment || processedOrders.has(shipment.orderId)) continue;
      processedOrders.add(shipment.orderId);

      await ctx.db.insert("commerce_order_history", {
        orderId: shipment.orderId,
        eventType: "manifest_generated",
        message: `Shipment added to manifest ${manifestNumber}`,
        actorUserId: user?._id,
        metadata: {
          manifestNumber,
          shipmentId,
          carrier: args.carrier,
        },
        createdAt: now,
      });
    }

    return {
      manifestNumber,
      shipmentCount: args.shipmentIds.length,
    };
  },
});

// ============================================
// OVERDUE / QUEUE QUERIES
// ============================================

/**
 * List orders pending fulfillment that were paid more than N days ago.
 */
export const listOverdue = query({
  args: {
    daysOld: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const cutoff = Date.now() - (args.daysOld ?? 3) * 86_400_000;

    const orders = await ctx.db
      .query("commerce_orders")
      .collect();

    const overdue = orders.filter(
      (o: any) =>
        ["paid", "processing"].includes(o.status) &&
        ["unfulfilled", "processing"].includes(o.fulfillmentStatus ?? "unfulfilled") &&
        o.paidAt &&
        o.paidAt < cutoff,
    );

    return overdue
      .sort((a: any, b: any) => a.paidAt - b.paidAt)
      .map((o: any) => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        email: o.email,
        totalAmount: o.totalAmount,
        currencyCode: o.currencyCode,
        paidAt: o.paidAt,
        daysSincePaid: Math.floor((Date.now() - o.paidAt) / 86_400_000),
        fulfillmentStatus: o.fulfillmentStatus ?? "unfulfilled",
        priority: derivePriority(o),
      }));
  },
});

/**
 * Get shipping analytics (cost breakdown by carrier/service).
 */
export const getShippingAnalytics = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    // Gather shipping cost events from order history
    const allHistory = await ctx.db
      .query("commerce_order_history")
      .collect();

    let costEvents = allHistory.filter(
      (h: any) => h.eventType === "shipping_cost_recorded",
    );

    if (args.startDate) {
      costEvents = costEvents.filter((h: any) => h.createdAt >= args.startDate);
    }
    if (args.endDate) {
      costEvents = costEvents.filter((h: any) => h.createdAt <= args.endDate);
    }

    if (costEvents.length === 0) {
      return {
        totalShipments: 0,
        totalChargedToCustomers: 0,
        totalCarrierCost: 0,
        totalGrossMargin: 0,
        byCarrier: {},
      };
    }

    let totalCharged = 0;
    let totalCost = 0;
    let totalMargin = 0;
    const byCarrier: Record<string, { count: number; charged: number; cost: number; margin: number }> = {};

    for (const event of costEvents) {
      const meta = event.metadata ?? {};
      totalCharged += meta.chargedToCustomer ?? 0;
      totalCost += meta.carrierCost ?? 0;
      totalMargin += meta.grossMargin ?? 0;

      const carrier = meta.carrier ?? "unknown";
      if (!byCarrier[carrier]) {
        byCarrier[carrier] = { count: 0, charged: 0, cost: 0, margin: 0 };
      }
      byCarrier[carrier].count++;
      byCarrier[carrier].charged += meta.chargedToCustomer ?? 0;
      byCarrier[carrier].cost += meta.carrierCost ?? 0;
      byCarrier[carrier].margin += meta.grossMargin ?? 0;
    }

    return {
      totalShipments: costEvents.length,
      totalChargedToCustomers: totalCharged,
      totalCarrierCost: totalCost,
      totalGrossMargin: totalMargin,
      byCarrier,
    };
  },
});
