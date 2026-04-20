import { ConvexError, v } from "convex/values";

import { internalMutation, mutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { requireCan } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { SHIPPING_EVENTS } from "../../events/constants";
import { voidLabelArgs } from "./validators";

/**
 * Internal — flip a label to voided + start refund tracking. Called from
 * `actions.ts:voidLabelWithCarrier` after the carrier confirms.
 */
export const markLabelVoided = internalMutation({
  args: {
    labelId: v.id("commerce_shipment_labels"),
    refundPending: v.boolean(),
  },
  handler: async (ctx, args) => {
    const label = await ctx.db.get(args.labelId);
    if (!label || label.voidedAt) return label?._id ?? null;
    await ctx.db.patch(args.labelId, {
      voidedAt: Date.now(),
      refundStatus: args.refundPending ? "pending" : "failed",
      updatedAt: Date.now(),
    });
    await emitEvent(ctx, SHIPPING_EVENTS.LABEL_VOIDED, "shipping", {
      labelId: args.labelId,
      orderId: label.orderId,
      refundPending: args.refundPending,
    });
    if (args.refundPending) {
      await emitEvent(ctx, SHIPPING_EVENTS.LABEL_REFUND_REQUESTED, "shipping", {
        labelId: args.labelId,
        orderId: label.orderId,
      });
    }
    return args.labelId;
  },
});

/**
 * Internal — record a label that was just purchased through the v2 label
 * action. Called from `actions.ts:purchaseLabel`. Idempotent on
 * (shipmentId, externalLabelId) — repeat calls are no-ops.
 */
export const recordPurchasedLabel = internalMutation({
  args: {
    shipmentId: v.id("commerce_shipments"),
    orderId: v.id("commerce_orders"),
    packageIndex: v.number(),
    packageTemplateId: v.optional(v.id("commerce_shipping_packages")),
    provider: v.string(),
    carrierCode: v.optional(v.string()),
    serviceCode: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    externalLabelId: v.optional(v.string()),
    labelFileStorageId: v.optional(v.id("_storage")),
    labelFormat: v.optional(v.string()),
    labelUrl: v.optional(v.string()),
    labelCost: v.number(),
    labelCurrency: v.string(),
    idempotencyKey: v.optional(v.string()),
    rawMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (args.externalLabelId) {
      const existing = await ctx.db
        .query("commerce_shipment_labels")
        .withIndex("by_external_label", (q: any) =>
          q.eq("externalLabelId", args.externalLabelId),
        )
        .first();
      if (existing) return existing._id;
    }
    const now = Date.now();
    const RETENTION_MS = 180 * 24 * 60 * 60 * 1000; // 180 days default
    const labelId = await ctx.db.insert("commerce_shipment_labels", {
      ...args,
      refundStatus: "none",
      purchasedAt: now,
      printCount: 0,
      retentionExpiresAt: now + RETENTION_MS,
      createdAt: now,
      updatedAt: now,
    });

    // PRD D3 §2 — auto-accumulate into the day's pending manifest so merchants
    // don't have to manually sweep. Resolve the label's shipFromLocationId via
    // the shipment; if none is configured, skip silently (manifest will be
    // created on first manual close).
    try {
      const shipment = await ctx.db.get(args.shipmentId);
      if (shipment && (shipment as any).shipFromLocationId && args.carrierCode) {
        const today = new Date(now).toISOString().slice(0, 10);
        const manifestId = await ctx.runMutation(
          internal.shipping.manifests.mutations.createPendingManifest,
          {
            shipFromLocationId: (shipment as any).shipFromLocationId,
            provider: args.provider,
            carrierCode: args.carrierCode,
            manifestDate: today,
          },
        );
        if (manifestId) {
          await ctx.runMutation(
            internal.shipping.manifests.mutations.addLabelToManifest,
            { manifestId, labelId },
          );
        }
      }
    } catch (err) {
      console.warn(
        `[shipping.labels] auto-manifest queue skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await emitEvent(ctx, SHIPPING_EVENTS.LABEL_PURCHASED, "shipping", {
      labelId,
      orderId: args.orderId,
      shipmentId: args.shipmentId,
      provider: args.provider,
      carrierCode: args.carrierCode,
      serviceCode: args.serviceCode,
      trackingNumber: args.trackingNumber,
      labelCostCents: args.labelCost,
      currency: args.labelCurrency,
    });

    return labelId;
  },
});

/**
 * PRD D1 §2 — reprint a label. Bumps the print counter + stamps
 * `lastPrintedAt`/`lastPrintedBy` for audit. Returns the storage id and
 * URL so the admin UI can open the PDF.
 */
export const reprintLabel = mutation({
  args: { labelId: v.id("commerce_shipment_labels") },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.labels.print");
    const label = await ctx.db.get(args.labelId);
    if (!label) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Label not found." });
    }
    if (label.voidedAt) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot reprint a voided label.",
      });
    }
    const now = Date.now();
    await ctx.db.patch(args.labelId, {
      printCount: (label.printCount ?? 0) + 1,
      lastPrintedAt: now,
      lastPrintedBy: user?._id,
      updatedAt: now,
    });
    await emitEvent(ctx, SHIPPING_EVENTS.LABEL_REPRINTED, "shipping", {
      labelId: args.labelId,
      orderId: label.orderId,
      printCount: (label.printCount ?? 0) + 1,
      reprintedBy: user?._id,
    });
    return {
      labelUrl: label.labelUrl,
      labelFileStorageId: label.labelFileStorageId,
      printCount: (label.printCount ?? 0) + 1,
    };
  },
});

export const voidLabel = mutation({
  args: voidLabelArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.labels.void");
    const label = await ctx.db.get(args.labelId);
    if (!label) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Label not found." });
    }
    if (label.voidedAt) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Label already voided.",
      });
    }
    // PRD D1 §2 — split carrier void vs local state: stamp who requested
    // the void + mark refund pending, then schedule the carrier-side
    // void action. Only the carrier response (markLabelVoided internal)
    // sets `voidedAt` — the public void mutation records the intent, not
    // the success. Prevents orphaned "voided here, not at carrier" state.
    await ctx.db.patch(args.labelId, {
      voidedBy: user?._id,
      voidRequestedAt: Date.now(),
      refundStatus: "pending",
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      0,
      (internal as any).shipping.labels.actions.voidLabelWithCarrier,
      { labelId: args.labelId },
    );
    await emitEvent(ctx, SHIPPING_EVENTS.LABEL_VOID_REQUESTED, "shipping", {
      labelId: args.labelId,
      orderId: label.orderId,
      voidedBy: user?._id,
    });
    return args.labelId;
  },
});
