import { v } from "convex/values";

import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { requireCommerceEnabled } from "../../commerce/helpers";
import { zoneMatchesAddress } from "../helpers/zoneMatching";
import { matchZoneForAddressArgs } from "./validators";

import { shippingDocs } from "../../schema/shipping.docs.generated";
export const listZones = query({
  args: {},
  returns: v.array(shippingDocs.commerce_shipping_zones),
  handler: async (ctx) => {
    await requireCan(ctx, "shipping.zones.read");
    const zones = await ctx.db
      .query("commerce_shipping_zones")
      .withIndex("by_sort")
      .collect();
    // Stable sort: sortOrder asc, then creation time asc.
    return zones.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a._creationTime - b._creationTime;
    });
  },
});

export const getZone = query({
  args: { zoneId: v.id("commerce_shipping_zones") },
  returns: v.union(v.null(), shippingDocs.commerce_shipping_zones),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.zones.read");
    return ctx.db.get(args.zoneId);
  },
});

export const getZoneBySlug = query({
  args: { slug: v.string() },
  returns: v.union(v.null(), shippingDocs.commerce_shipping_zones),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.zones.read");
    return ctx.db
      .query("commerce_shipping_zones")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

/**
 * Match a zone for a given address. Used by the rate calculation pipeline.
 *
 * First-match-wins, respecting sortOrder ascending. Falls back to the
 * isFallback zone if no regular zone matches. Returns null when nothing matches.
 */
export const matchZoneForAddress = query({
  args: matchZoneForAddressArgs,
  returns: v.union(v.null(), v.object({ zone: shippingDocs.commerce_shipping_zones, matchedFallback: v.boolean() })),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
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
