// @ts-nocheck
/**
 * Commerce Bundles — Internal Functions
 *
 * Internal mutations and queries that are not client-callable.
 * Used for background maintenance and system-to-system operations.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Clean up stale bundle selections that are older than 30 days
 * and not linked to active orders.
 *
 * commerce_bundle_selections rows accumulate as customers configure
 * mix-and-match / BOGO bundles during cart sessions. Abandoned carts
 * leave orphaned rows. This mutation prunes them in batches of 500
 * to stay within Convex transaction limits.
 *
 * Should be scheduled as a periodic cron (e.g., daily).
 */
export const cleanupStaleBundleSelections = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const stale = await ctx.db
      .query("commerce_bundle_selections")
      .filter((q: any) => q.lt(q.field("_creationTime"), cutoff))
      .take(500);

    let deleted = 0;
    for (const sel of stale) {
      // Keep selections that are linked to an order item (completed purchases)
      if (sel.orderItemId) continue;
      await ctx.db.delete(sel._id);
      deleted++;
    }

    return { deleted, scanned: stale.length };
  },
});

/**
 * Commit bundle inventory on successful purchase.
 *
 * Called by the checkout/order system after an order is placed.
 * Increments purchaseCount and decrements stockCount (when tracked).
 * This is the bundle-level equivalent of commerce/inventory.commit.
 */
export const commitBundleInventory = internalMutation({
  args: {
    bundleId: v.id("commerce_bundles"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle) return { success: false, reason: "Bundle not found" };

    const now = Date.now();

    // Increment purchase count
    const newPurchaseCount = (bundle.purchaseCount ?? 0) + args.quantity;

    // Decrement stock if inventory is tracked
    const updates: Record<string, any> = {
      purchaseCount: newPurchaseCount,
      updatedAt: now,
    };

    if (bundle.trackInventory && typeof bundle.stockCount === "number") {
      updates.stockCount = Math.max(0, bundle.stockCount - args.quantity);
    }

    await ctx.db.patch(args.bundleId, updates);

    return {
      success: true,
      purchaseCount: newPurchaseCount,
      stockCount: updates.stockCount ?? bundle.stockCount,
    };
  },
});

/**
 * Backfill owning product links for bundles that lack a productId.
 *
 * Some bundles created before the productId linkage was adopted may
 * not have an associated commerce_products row. This mutation creates
 * a virtual/bundle-type product for each unlinked bundle so the bundle
 * can participate in the standard order/checkout pipeline.
 *
 * Safe to call multiple times — skips bundles that already have a productId.
 */
export const backfillOwningProducts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const bundles = await ctx.db.query("commerce_bundles").collect();
    const unlinked = bundles.filter((b: any) => !b.productId);

    let linked = 0;
    const now = Date.now();

    for (const bundle of unlinked) {
      // Create a virtual product entry for the bundle
      const productId = await ctx.db.insert("commerce_products", {
        title: bundle.name,
        slug: `bundle-${bundle.slug}`,
        status: bundle.status === "active" ? "publish" : "draft",
        productType: "bundle",
        basePrice: { amount: bundle.bundlePrice ?? bundle.regularPrice ?? 0, currency: "USD" },
        trackInventory: bundle.trackInventory ?? false,
        stockQuantity: bundle.stockCount ?? 0,
        allowBackorders: false,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.patch(bundle._id, {
        productId,
        updatedAt: now,
      });

      linked++;
    }

    return { linked, total: bundles.length };
  },
});
