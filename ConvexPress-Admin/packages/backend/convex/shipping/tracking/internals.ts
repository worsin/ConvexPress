import { v } from "convex/values";

import { internalMutation, internalQuery } from "../../_generated/server";

/**
 * PRD D2 §5 — append a durable sync log entry. Called from tracking
 * actions (poll) and webhook handlers so admins can inspect the full
 * sync history with backoff + error context.
 */
export const recordSyncLog = internalMutation({
  args: {
    provider: v.string(),
    shipmentId: v.optional(v.id("commerce_shipments")),
    labelId: v.optional(v.id("commerce_shipment_labels")),
    trackingNumber: v.optional(v.string()),
    source: v.union(v.literal("poll"), v.literal("webhook")),
    success: v.boolean(),
    durationMs: v.optional(v.number()),
    statusCode: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    eventCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Consecutive-failure tracking + exponential backoff computation.
    let consecutiveFailures = 0;
    let backoffMs: number | undefined;
    if (args.shipmentId) {
      const latest = await ctx.db
        .query("commerce_tracking_sync_log")
        .withIndex("by_shipment", (q: any) =>
          q.eq("shipmentId", args.shipmentId),
        )
        .order("desc")
        .first();
      if (args.success) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures =
          (latest?.consecutiveFailures ?? 0) + 1;
        // 2^n minutes, capped at 12 hours.
        backoffMs = Math.min(
          12 * 60 * 60 * 1000,
          Math.pow(2, consecutiveFailures) * 60 * 1000,
        );
      }
    }
    return ctx.db.insert("commerce_tracking_sync_log", {
      ...args,
      consecutiveFailures,
      backoffMs,
      createdAt: Date.now(),
    });
  },
});

const TERMINAL_STATUSES = new Set(["delivered", "returned"]);

/**
 * List labels eligible for tracking sync. Excludes terminal-status labels
 * and labels older than maxAgeMs. Caps at 100 per call to bound load.
 */
export const listSyncableLabels = internalQuery({
  args: { maxAgeMs: v.number() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.maxAgeMs;
    const labels = await ctx.db
      .query("commerce_shipment_labels")
      .collect();

    const eligible = [];
    for (const label of labels) {
      if (!label.trackingNumber) continue;
      if (label.voidedAt) continue;
      if (label.purchasedAt < cutoff) continue;

      // Check the most recent tracking event status — skip if terminal.
      const latest = await ctx.db
        .query("commerce_shipment_tracking_events")
        .withIndex("by_shipment_time", (q: any) =>
          q.eq("shipmentId", label.shipmentId),
        )
        .order("desc")
        .first();
      if (latest && TERMINAL_STATUSES.has(latest.normalizedStatus)) continue;

      eligible.push(label);
      if (eligible.length >= 100) break;
    }
    return eligible;
  },
});

export const getLabelById = internalQuery({
  args: { labelId: v.id("commerce_shipment_labels") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.labelId);
  },
});

/**
 * Find a shipment + label pair by tracking number. Used by webhook handlers
 * to map carrier-side tracking numbers back to ConvexPress shipments.
 */
export const findShipmentByTracking = internalQuery({
  args: { trackingNumber: v.string() },
  handler: async (ctx, args) => {
    // Try the shipment_labels table first (most granular for multi-package).
    const label = await ctx.db
      .query("commerce_shipment_labels")
      .withIndex("by_tracking", (q: any) => q.eq("trackingNumber", args.trackingNumber))
      .first();
    if (label) {
      return {
        shipmentId: label.shipmentId,
        orderId: label.orderId,
        labelId: label._id,
      };
    }

    // Fall back to the legacy commerce_shipments table.
    const shipment = await ctx.db
      .query("commerce_shipments")
      .withIndex("by_tracking", (q: any) => q.eq("trackingNumber", args.trackingNumber))
      .first();
    if (shipment) {
      return {
        shipmentId: shipment._id,
        orderId: shipment.orderId,
        labelId: undefined,
      };
    }

    return null;
  },
});
