import { ConvexError, v } from "convex/values";

import { internalMutation, mutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { requireCan } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { SHIPPING_EVENTS } from "../../events/constants";

export const createPendingManifest = internalMutation({
  args: {
    shipFromLocationId: v.id("commerce_ship_from_locations"),
    provider: v.string(),
    carrierCode: v.string(),
    manifestDate: v.string(),
  },
  handler: async (ctx, args) => {
    // Find-then-insert is safe under Convex OCC: two concurrent calls for the
    // same (location, carrier, date) tuple read the same rows, and whichever
    // commits second is retried against the updated read set, so only one
    // insert goes through.
    const existing = await ctx.db
      .query("commerce_shipment_manifests")
      .withIndex("by_location_date", (q: any) =>
        q.eq("shipFromLocationId", args.shipFromLocationId).eq("manifestDate", args.manifestDate),
      )
      .collect();
    const match = existing.find(
      (m: any) => m.carrierCode === args.carrierCode && m.status === "pending",
    );
    if (match) return match._id;

    const now = Date.now();
    const manifestId = await ctx.db.insert("commerce_shipment_manifests", {
      shipFromLocationId: args.shipFromLocationId,
      provider: args.provider,
      carrierCode: args.carrierCode,
      manifestDate: args.manifestDate,
      labelIds: [],
      status: "pending",
      totalPackages: 0,
      createdAt: now,
      updatedAt: now,
    });
    await emitEvent(ctx, SHIPPING_EVENTS.MANIFEST_CREATED, "shipping", {
      manifestId,
      provider: args.provider,
      carrierCode: args.carrierCode,
      manifestDate: args.manifestDate,
    });
    return manifestId;
  },
});

export const addLabelToManifest = internalMutation({
  args: {
    manifestId: v.id("commerce_shipment_manifests"),
    labelId: v.id("commerce_shipment_labels"),
  },
  handler: async (ctx, args) => {
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest) return null;
    if (manifest.status !== "pending") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot add labels to a closed manifest.",
      });
    }
    if (manifest.labelIds.includes(args.labelId)) return args.manifestId;
    await ctx.db.patch(args.manifestId, {
      labelIds: [...manifest.labelIds, args.labelId],
      totalPackages: manifest.totalPackages + 1,
      updatedAt: Date.now(),
    });
    await emitEvent(ctx, SHIPPING_EVENTS.MANIFEST_LABEL_ADDED, "shipping", {
      manifestId: args.manifestId,
      labelId: args.labelId,
    });
    return args.manifestId;
  },
});

/**
 * Internal — flip a manifest to submitted (success) or failed.
 * Called from `actions.ts:autoCloseDueManifests` after the carrier responds.
 */
export const markManifestSubmitted = internalMutation({
  args: {
    manifestId: v.id("commerce_shipment_manifests"),
    externalManifestId: v.optional(v.string()),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest) return;
    const now = Date.now();
    await ctx.db.patch(args.manifestId, {
      status: args.success ? "submitted" : "failed",
      externalManifestId: args.externalManifestId,
      submittedAt: args.success ? now : undefined,
      errorMessage: args.errorMessage,
      updatedAt: now,
    });
    await emitEvent(
      ctx,
      args.success ? SHIPPING_EVENTS.MANIFEST_SUBMITTED : SHIPPING_EVENTS.MANIFEST_FAILED,
      "shipping",
      {
        manifestId: args.manifestId,
        externalManifestId: args.externalManifestId,
        errorMessage: args.errorMessage,
      },
    );
  },
});

export const closeManifest = mutation({
  args: { manifestId: v.id("commerce_shipment_manifests") },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.manifests.close");
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Manifest not found." });
    }
    if (manifest.status !== "pending") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Manifest is already ${manifest.status}.`,
      });
    }
    const now = Date.now();
    await ctx.db.patch(args.manifestId, {
      status: "closed",
      closedAt: now,
      closedBy: user?._id,
      updatedAt: now,
    });
    await emitEvent(ctx, SHIPPING_EVENTS.MANIFEST_CLOSED, "shipping", {
      manifestId: args.manifestId,
      closedBy: user?._id,
      totalPackages: manifest.totalPackages,
    });
    // PRD D3 §2 — closing a manifest must also submit it to the carrier.
    // Mutations can't fetch() directly, so schedule the submission action
    // to run immediately after commit. markManifestSubmitted flips status.
    await ctx.scheduler.runAfter(
      0,
      (internal as any).shipping.manifests.actions.submitOneManifest,
      { manifestId: args.manifestId },
    );
    return args.manifestId;
  },
});
