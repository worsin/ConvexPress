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
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";
import { patchDynamicWithMediaReferences } from "../media/attachmentGuard";


import { commerceDocs } from "../schema/commerce.docs.generated";
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

const SHIPMENT_STATUSES: readonly Doc<"commerce_shipments">["status"][] = ["label_created", "shipped", "delivered", "returned"];

const PRIORITY_ORDER: Record<string, number> = {
  rush: 0,
  express: 1,
  standard: 2,
};

/**
 * Derive fulfillment priority from the shipping method on an order.
 */
function derivePriority(order: Pick<Doc<"commerce_orders">, "selectedShippingMethodCode">): string {
  const method = (order.selectedShippingMethodCode ?? "").toLowerCase();
  if (method.includes("overnight") || method.includes("rush")) return "rush";
  if (method.includes("express") || method.includes("expedited")) return "express";
  return "standard";
}

/**
 * The current fulfilment assignee: the latest `fulfillment_assigned` history
 * entry for the order (orders carry no assignee field of their own).
 */
async function currentAssignee(ctx: Pick<QueryCtx, "db">, orderId: Id<"commerce_orders">): Promise<Id<"users"> | undefined> {
  const history = await ctx.db
    .query("commerce_order_history")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  const latest = history
    .filter((entry) => entry.eventType === "fulfillment_assigned")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const assignee: unknown = latest?.metadata?.assigneeUserId;
  return typeof assignee === "string" ? ctx.db.normalizeId("users", assignee) ?? undefined : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberField(record: unknown, key: string): number {
  const value = isRecord(record) ? record[key] : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
  returns: v.object({
    items: v.array(v.object({
      _id: v.id("commerce_orders"),
      orderNumber: v.string(),
      status: v.union(v.literal("pending"), v.literal("failed"), v.literal("processing"), v.literal("completed"), v.literal("cancelled"), v.literal("paid"), v.literal("refunded"), v.literal("fulfilled")),
      fulfillmentStatus: v.string(),
      priority: v.string(),
      email: v.string(),
      totalAmount: v.number(),
      currencyCode: v.string(),
      shippingAddress: v.optional(v.object({
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        phone: v.optional(v.string()),
        company: v.optional(v.string()),
        line2: v.optional(v.string()),
        state: v.optional(v.string()),
        line1: v.string(),
        city: v.string(),
        postalCode: v.string(),
        countryCode: v.string(),
      })),
      selectedShippingMethodLabel: v.optional(v.string()),
      createdAt: v.number(),
      paidAt: v.optional(v.number()),
      assignedTo: v.optional(v.id("users")),
    })),
    total: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    // Fulfillment orders are tracked via commerce_order_history events
    // and the order's fulfillmentStatus field.
    let orders = await ctx.db
      .query("commerce_orders")
      .collect();

    // Filter to orders that need fulfillment (paid, processing, or fulfilled statuses)
    orders = orders.filter((o) => {
      const fulfillmentMatch = args.status
        ? o.fulfillmentStatus === args.status
        : ["unfulfilled", "processing", "packed", "ready_to_ship", "partially_shipped"].includes(
            o.fulfillmentStatus ?? "unfulfilled",
          );
      return fulfillmentMatch && ["paid", "processing", "fulfilled"].includes(o.status);
    });

    // Derive priority and optionally filter
    const enriched = orders.map((o) => ({
      ...o,
      _priority: derivePriority(o),
    }));

    let filtered = enriched;
    if (args.priority) {
      filtered = filtered.filter((o) => o._priority === args.priority);
    }

    // Sort: rush first, then by creation date (oldest first)
    filtered.sort((a, b) => {
      const pA = PRIORITY_ORDER[a._priority] ?? 2;
      const pB = PRIORITY_ORDER[b._priority] ?? 2;
      if (pA !== pB) return pA - pB;
      return a.createdAt - b.createdAt;
    });

    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;
    const page = filtered.slice(offset, offset + limit);

    const assignees = await Promise.all(page.map((o) => currentAssignee(ctx, o._id)));
    return {
      items: page.map((o, index) => ({
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
        assignedTo: assignees[index],
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
  returns: v.object({
    order: commerceDocs.commerce_orders,
    items: v.array(commerceDocs.commerce_order_items),
    shipments: v.array(commerceDocs.commerce_shipments),
    history: v.array(commerceDocs.commerce_order_history),
    priority: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ code: "not_found", message: "Order not found" });

    // Get order items
    const items = await ctx.db
      .query("commerce_order_items")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    // Get shipments
    const shipments = await ctx.db
      .query("commerce_shipments")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    // Get history
    const history = await ctx.db
      .query("commerce_order_history")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    return {
      order,
      items,
      shipments,
      history: history.sort((a, b) => b.createdAt - a.createdAt),
      priority: derivePriority(order),
    };
  },
});

/**
 * Get fulfillment dashboard stats.
 */
export const getStats = query({
  args: {},
  returns: v.object({
    pending: v.number(),
    processing: v.number(),
    readyToShip: v.number(),
    shipped: v.number(),
    onHold: v.number(),
    rushOrders: v.number(),
    totalOrders: v.number(),
    todayPaid: v.number(),
  }),
  handler: async (ctx) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const orders = await ctx.db
      .query("commerce_orders")
      .collect();

    const fulfillable = orders.filter((o) =>
      ["paid", "processing", "fulfilled"].includes(o.status),
    );

    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);

    return {
      pending: fulfillable.filter(
        (o) => (o.fulfillmentStatus ?? "unfulfilled") === "unfulfilled",
      ).length,
      processing: fulfillable.filter(
        (o) => o.fulfillmentStatus === "processing",
      ).length,
      readyToShip: fulfillable.filter(
        (o) => o.fulfillmentStatus === "ready_to_ship" || o.fulfillmentStatus === "packed",
      ).length,
      shipped: fulfillable.filter(
        (o) => o.fulfillmentStatus === "shipped",
      ).length,
      onHold: fulfillable.filter(
        (o) => o.fulfillmentStatus === "on_hold",
      ).length,
      rushOrders: fulfillable.filter((o) => {
        const p = derivePriority(o);
        return (
          p === "rush" &&
          !["shipped", "fulfilled"].includes(o.fulfillmentStatus ?? "unfulfilled")
        );
      }).length,
      totalOrders: fulfillable.length,
      todayPaid: fulfillable.filter(
        (o) => o.paidAt && o.paidAt >= todayStart,
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
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await requireCan(ctx, "manage_options");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ code: "not_found", message: "Order not found" });

    const now = Date.now();
    const previousStatus = order.fulfillmentStatus ?? "unfulfilled";

    // Update order
    const patch: Partial<Doc<"commerce_orders">> = {
      fulfillmentStatus: args.fulfillmentStatus,
      updatedAt: now,
    };

    // If marking as shipped, update the main order status too
    if (args.fulfillmentStatus === "shipped") {
      patch.status = "fulfilled";
    }

    await patchDynamicWithMediaReferences(ctx, args.orderId, patch);

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
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await requireCan(ctx, "manage_options");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ code: "not_found", message: "Order not found" });

    const now = Date.now();

    // The assignment lives in order history (see currentAssignee); orders have no assignee field.
    await patchDynamicWithMediaReferences(ctx, args.orderId, {
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
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
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
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
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
  returns: v.array(v.object({
    orderNumber: v.string(),
    customerEmail: v.string(),
    _id: v.id("commerce_shipments"),
    _creationTime: v.number(),
    createdBy: v.optional(v.id("users")),
    note: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
    provider: v.optional(v.string()),
    carrierCode: v.optional(v.string()),
    serviceCode: v.optional(v.string()),
    serviceName: v.optional(v.string()),
    shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
    carrier: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    trackingUrl: v.optional(v.string()),
    trackingStatus: v.optional(v.string()),
    externalShipmentId: v.optional(v.string()),
    externalLabelId: v.optional(v.string()),
    externalManifestId: v.optional(v.string()),
    labelUrl: v.optional(v.string()),
    labelFormat: v.optional(v.string()),
    labelPurchasedAt: v.optional(v.number()),
    voidedAt: v.optional(v.number()),
    originProof: v.optional(v.object({
      source: v.union(v.literal("order_quote"), v.literal("matching_quote"), v.literal("legacy_configuration")),
      origin: v.object({
        name: v.optional(v.string()),
        phone: v.optional(v.string()),
        company: v.optional(v.string()),
        line2: v.optional(v.string()),
        state: v.optional(v.string()),
        shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
        line1: v.string(),
        city: v.string(),
        postalCode: v.string(),
        countryCode: v.string(),
      }),
    })),
    shippedAt: v.optional(v.number()),
    updatedAt: v.number(),
    createdAt: v.number(),
    status: v.union(v.literal("delivered"), v.literal("label_created"), v.literal("shipped"), v.literal("returned")),
    items: v.array(v.object({ quantity: v.number(), orderItemId: v.id("commerce_order_items") })),
    orderId: v.id("commerce_orders"),
    shipmentNumber: v.string(),
  })),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let shipments: Doc<"commerce_shipments">[];
    const status = SHIPMENT_STATUSES.find((candidate) => candidate === args.status);
    if (args.status && !status) {
      // Not a shipment status: nothing can match.
      shipments = [];
    } else if (status) {
      shipments = await ctx.db
        .query("commerce_shipments")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
    } else {
      shipments = await ctx.db
        .query("commerce_shipments")
        .collect();
    }

    // Enrich with order info
    const enriched = await Promise.all(
      shipments.map(async (s) => {
        const order = await ctx.db.get(s.orderId);
        return {
          ...s,
          orderNumber: order?.orderNumber ?? "N/A",
          customerEmail: order?.email ?? "N/A",
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
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
  returns: v.object({ manifestNumber: v.string(), shipmentCount: v.number() }),
  handler: async (ctx, args) => {
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
      await patchDynamicWithMediaReferences(ctx, shipmentId, {
        externalManifestId: manifestNumber,
        updatedAt: now,
      });
    }

    // Record in history for each order
    const processedOrders = new Set<Id<"commerce_orders">>();
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
  returns: v.array(v.object({
    _id: v.id("commerce_orders"),
    orderNumber: v.string(),
    email: v.string(),
    totalAmount: v.number(),
    currencyCode: v.string(),
    paidAt: v.number(),
    daysSincePaid: v.number(),
    fulfillmentStatus: v.string(),
    priority: v.string(),
  })),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const cutoff = Date.now() - (args.daysOld ?? 3) * 86_400_000;

    const orders = await ctx.db
      .query("commerce_orders")
      .collect();

    const overdue = orders.flatMap((o) =>
      ["paid", "processing"].includes(o.status) &&
      ["unfulfilled", "processing"].includes(o.fulfillmentStatus ?? "unfulfilled") &&
      o.paidAt &&
      o.paidAt < cutoff
        ? [{ ...o, paidAt: o.paidAt }]
        : [],
    );

    return overdue
      .sort((a, b) => a.paidAt - b.paidAt)
      .map((o) => ({
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
  returns: v.object({
    totalShipments: v.number(),
    totalChargedToCustomers: v.number(),
    totalCarrierCost: v.number(),
    totalGrossMargin: v.number(),
    byCarrier: v.record(v.string(), v.object({ count: v.number(), charged: v.number(), cost: v.number(), margin: v.number() })),
  }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    // Gather shipping cost events from order history
    const allHistory = await ctx.db
      .query("commerce_order_history")
      .collect();

    let costEvents = allHistory.filter(
      (h) => h.eventType === "shipping_cost_recorded",
    );

    const { startDate, endDate } = args;
    if (startDate) {
      costEvents = costEvents.filter((h) => h.createdAt >= startDate);
    }
    if (endDate) {
      costEvents = costEvents.filter((h) => h.createdAt <= endDate);
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
      // History metadata is stored untyped; shipping-cost events carry these numbers.
      const meta: unknown = event.metadata;
      const charged = numberField(meta, "chargedToCustomer");
      const cost = numberField(meta, "carrierCost");
      const margin = numberField(meta, "grossMargin");
      totalCharged += charged;
      totalCost += cost;
      totalMargin += margin;

      const carrierValue = isRecord(meta) ? meta.carrier : undefined;
      const carrier = typeof carrierValue === "string" ? carrierValue : "unknown";
      const bucket = byCarrier[carrier] ?? { count: 0, charged: 0, cost: 0, margin: 0 };
      bucket.count++;
      bucket.charged += charged;
      bucket.cost += cost;
      bucket.margin += margin;
      byCarrier[carrier] = bucket;
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
