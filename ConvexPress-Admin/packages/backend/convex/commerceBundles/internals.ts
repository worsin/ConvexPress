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
