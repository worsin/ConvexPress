import { v } from "convex/values";

import { internalQuery } from "../../_generated/server";
import { zoneMatchesAddress } from "../helpers/zoneMatching";

import { shippingDocs } from "../../schema/shipping.docs.generated";
/**
 * Internal, unauth'd zone matcher used by the rate calculation pipeline (PRD A7)
 * and by internal tax / rules code paths. Mirrors the public `matchZoneForAddress`
 * query without the capability gate.
 */
export const matchZoneForAddressInternal = internalQuery({
  args: {
    countryCode: v.string(),
    state: v.optional(v.string()),
    postalCode: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.object({ zone: shippingDocs.commerce_shipping_zones, matchedFallback: v.boolean() })),
  handler: async (ctx, args) => {
    const zones = await ctx.db
      .query("commerce_shipping_zones")
      .withIndex("by_enabled_sort", (q) => q.eq("enabled", true))
      .collect();

    const sorted = zones.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a._creationTime - b._creationTime;
    });

    const fallback = sorted.find((z) => z.isFallback === true) ?? null;
    const regularZones = sorted.filter((z) => !z.isFallback);

    for (const zone of regularZones) {
      if (zoneMatchesAddress(zone, args)) {
        return { zone, matchedFallback: false };
      }
    }

    if (fallback) {
      return { zone: fallback, matchedFallback: true };
    }

    return null;
  },
});
