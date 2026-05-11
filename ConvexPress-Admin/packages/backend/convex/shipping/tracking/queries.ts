import { v } from "convex/values";

import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";

/**
 * Tier 4.1 — Tracking health dashboard stats.
 * Aggregates the most recent 500 tracking events to surface webhook/poll
 * split, 24h/7d volume, last-received timestamps, status distribution,
 * per-provider webhook counts, and active-shipment status.
 */
export const getTrackingHealth = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "shipping.tracking.view");

    const events = await ctx.db
      .query("commerce_shipment_tracking_events")
      .order("desc")
      .take(500);

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const WEEK_MS = 7 * DAY_MS;

    let webhookCount = 0;
    let pollCount = 0;
    let last24h = 0;
    let last7d = 0;
    let lastReceivedAt = 0;
    let lastWebhookAt = 0;
    let lastPollAt = 0;
    const statusCounts: Record<string, number> = {
      pending: 0,
      picked_up: 0,
      in_transit: 0,
      out_for_delivery: 0,
      delivered: 0,
      exception: 0,
      returned: 0,
    };
    const perProviderWebhook: Record<string, number> = {};

    for (const ev of events) {
      if (ev.receivedVia === "webhook") webhookCount++;
      else pollCount++;
      if (ev.receivedAt > now - DAY_MS) last24h++;
      if (ev.receivedAt > now - WEEK_MS) last7d++;
      if (ev.receivedAt > lastReceivedAt) lastReceivedAt = ev.receivedAt;
      statusCounts[ev.normalizedStatus] =
        (statusCounts[ev.normalizedStatus] ?? 0) + 1;

      const prefix = String(ev.eventId).split(":")[0] ?? "unknown";
      if (ev.receivedVia === "webhook") {
        perProviderWebhook[prefix] = (perProviderWebhook[prefix] ?? 0) + 1;
        if (ev.receivedAt > lastWebhookAt) lastWebhookAt = ev.receivedAt;
      } else if (ev.receivedAt > lastPollAt) {
        lastPollAt = ev.receivedAt;
      }
    }

    const latestByShipment = new Map<string, string>();
    for (const ev of events) {
      const key = String(ev.shipmentId);
      if (!latestByShipment.has(key)) latestByShipment.set(key, ev.normalizedStatus);
    }
    const activeShipmentStatusCounts: Record<string, number> = {
      in_transit: 0,
      out_for_delivery: 0,
      delivered: 0,
      exception: 0,
    };
    for (const status of latestByShipment.values()) {
      if (status in activeShipmentStatusCounts) {
        activeShipmentStatusCounts[status] =
          (activeShipmentStatusCounts[status] ?? 0) + 1;
      }
    }

    return {
      windowSize: events.length,
      webhookCount,
      pollCount,
      webhookShare: events.length ? webhookCount / events.length : 0,
      last24h,
      last7d,
      lastReceivedAt: lastReceivedAt || null,
      lastWebhookAt: lastWebhookAt || null,
      lastPollAt: lastPollAt || null,
      statusCounts,
      perProviderWebhook,
      activeShipmentStatusCounts,
      uniqueShipmentsInWindow: latestByShipment.size,
    };
  },
});

export const listForShipment = query({
  args: { shipmentId: v.id("commerce_shipments") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.tracking.view");
    const events = await ctx.db
      .query("commerce_shipment_tracking_events")
      .withIndex("by_shipment_time", (q: any) => q.eq("shipmentId", args.shipmentId))
      .collect();
    // Sort by occurredAt descending (newest first).
    return events.sort((a: any, b: any) => b.occurredAt - a.occurredAt);
  },
});

/**
 * Public tracking lookup by trackingToken (stored on orders). No capability
 * check — used by the website-side public tracking page. Only exposes the
 * tracking timeline, nothing PII.
 */
export const publicTracking = query({
  args: { trackingToken: v.string() },
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("commerce_orders")
      .withIndex("by_trackingToken", (q: any) => q.eq("trackingToken", args.trackingToken))
      .unique();
    if (!order) return null;

    const shipments = await ctx.db
      .query("commerce_shipments")
      .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
      .collect();

    const timeline: any[] = [];
    for (const shipment of shipments) {
      const events = await ctx.db
        .query("commerce_shipment_tracking_events")
        .withIndex("by_shipment_time", (q: any) => q.eq("shipmentId", shipment._id))
        .collect();
      timeline.push({
        shipmentId: shipment._id,
        trackingNumber: shipment.trackingNumber,
        carrier: shipment.carrier,
        events: events.sort((a: any, b: any) => b.occurredAt - a.occurredAt),
      });
    }

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      shipments: timeline,
    };
  },
});
