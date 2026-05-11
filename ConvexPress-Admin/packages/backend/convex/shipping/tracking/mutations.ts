import { v } from "convex/values";

import { internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { emitEvent } from "../../helpers/events";
import { SHIPPING_EVENTS } from "../../events/constants";

/**
 * PRD 7.9 — fire customer notification on tracking status transitions.
 * Template slugs follow the convention `shipping_<status>`. If a template
 * doesn't exist, the email queue logs a warning and skips silently —
 * merchant can add templates later without re-deploying.
 */
const NOTIFY_ON_STATUS = new Set([
  "picked_up",
  "out_for_delivery",
  "delivered",
  "exception",
  "returned",
]);

async function maybeNotifyCustomer(
  ctx: any,
  shipmentId: any,
  status: string,
  description?: string,
) {
  if (!NOTIFY_ON_STATUS.has(status)) return;
  const shipment = await ctx.db.get(shipmentId);
  if (!shipment) return;
  const order = await ctx.db.get(shipment.orderId);
  if (!order || !order.email) return;

  const templateSlug = `shipping_${status}`;
  try {
    await ctx.runMutation((internal as any).emails.internals.queueEmail, {
      templateSlug,
      recipientEmail: order.email,
      recipientName:
        [order.shippingAddress?.firstName, order.shippingAddress?.lastName]
          .filter(Boolean)
          .join(" ") || undefined,
      variables: JSON.stringify({
        order_number: order.orderNumber,
        tracking_number: shipment.trackingNumber ?? "",
        carrier: shipment.carrier ?? "",
        status_description: description ?? status,
      }),
    });
  } catch (err) {
    console.warn(
      `[shipping.notify] template "${templateSlug}" send skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Auto-update an order's fulfillment status to "fulfilled" when every label
 * for that order has reached a terminal "delivered" status.
 * PRD 7.8 — runs after every recordTrackingEvent.
 */
async function maybeMarkOrderFulfilled(ctx: any, shipmentId: any) {
  const shipment = await ctx.db.get(shipmentId);
  if (!shipment) return;
  const order = await ctx.db.get(shipment.orderId);
  if (!order || order.fulfillmentStatus === "fulfilled") return;

  // Gather all labels for this order and check if every one is delivered.
  const labels = await ctx.db
    .query("commerce_shipment_labels")
    .withIndex("by_order", (q: any) => q.eq("orderId", shipment.orderId))
    .collect();

  // If no labels exist (legacy flow only), fall back to checking shipments table.
  if (labels.length === 0) {
    const shipments = await ctx.db
      .query("commerce_shipments")
      .withIndex("by_order", (q: any) => q.eq("orderId", shipment.orderId))
      .collect();
    if (shipments.length === 0) return;
    const allDelivered = shipments.every((s: any) => s.status === "delivered");
    if (allDelivered) {
      await ctx.db.patch(shipment.orderId, {
        fulfillmentStatus: "fulfilled",
        updatedAt: Date.now(),
      });
    }
    return;
  }

  // Per-package aggregation (PRD D2 §2.1) — for each non-voided label,
  // find the latest tracking event that was recorded specifically for
  // THAT label. Fall back to shipment-level latest only if no label-
  // scoped events exist (legacy single-package flow).
  let allDelivered = true;
  for (const label of labels) {
    if (label.voidedAt) continue;
    const labelScopedLatest = await ctx.db
      .query("commerce_shipment_tracking_events")
      .withIndex("by_shipment_time", (q: any) =>
        q.eq("shipmentId", label.shipmentId),
      )
      .order("desc")
      .collect();
    const matched = labelScopedLatest.find(
      (e: any) => e.labelId === label._id,
    );
    const latest = matched ?? labelScopedLatest[0];
    if (!latest || latest.normalizedStatus !== "delivered") {
      allDelivered = false;
      break;
    }
  }

  if (allDelivered) {
    await ctx.db.patch(shipment.orderId, {
      fulfillmentStatus: "fulfilled",
      updatedAt: Date.now(),
    });
  }
}

/**
 * Record a tracking event. Internal — called by webhook handlers and the
 * scheduled sync cron. Idempotent via (shipmentId, eventId) dedup.
 */
export const recordTrackingEvent = internalMutation({
  args: {
    shipmentId: v.id("commerce_shipments"),
    labelId: v.optional(v.id("commerce_shipment_labels")),
    eventId: v.string(),
    occurredAt: v.number(),
    normalizedStatus: v.union(
      v.literal("pending"),
      v.literal("picked_up"),
      v.literal("in_transit"),
      v.literal("out_for_delivery"),
      v.literal("delivered"),
      v.literal("exception"),
      v.literal("returned"),
    ),
    carrierStatus: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    rawMetadata: v.optional(v.any()),
    receivedVia: v.union(v.literal("webhook"), v.literal("poll")),
  },
  handler: async (ctx, args) => {
    // Dedup: (shipmentId, eventId).
    const existing = await ctx.db
      .query("commerce_shipment_tracking_events")
      .withIndex("by_shipment_event", (q: any) =>
        q.eq("shipmentId", args.shipmentId).eq("eventId", args.eventId),
      )
      .unique();
    if (existing) return existing._id;

    const id = await ctx.db.insert("commerce_shipment_tracking_events", {
      ...args,
      receivedAt: Date.now(),
    });

    // PRD 7.8: auto-update order fulfillment status if every label is delivered.
    if (args.normalizedStatus === "delivered") {
      await maybeMarkOrderFulfilled(ctx, args.shipmentId);
    }

    // PRD 7.9: notify customer on meaningful transitions.
    await maybeNotifyCustomer(
      ctx,
      args.shipmentId,
      args.normalizedStatus,
      args.description,
    );

    // Status-specific event emission (D2 lifecycle).
    const eventCode =
      args.normalizedStatus === "delivered"
        ? SHIPPING_EVENTS.TRACKING_DELIVERED
        : args.normalizedStatus === "exception"
          ? SHIPPING_EVENTS.TRACKING_EXCEPTION
          : args.normalizedStatus === "returned"
            ? SHIPPING_EVENTS.TRACKING_RETURNED
            : SHIPPING_EVENTS.TRACKING_UPDATED;
    await emitEvent(ctx, eventCode, "shipping", {
      shipmentId: args.shipmentId,
      labelId: args.labelId,
      status: args.normalizedStatus,
      carrierStatus: args.carrierStatus,
      receivedVia: args.receivedVia,
    });

    return id;
  },
});
