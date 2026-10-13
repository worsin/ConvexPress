import { v } from "convex/values";

import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";

import { shippingDocs } from "../../schema/shipping.docs.generated";
export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("submitted"),
        v.literal("closed"),
        v.literal("failed"),
      ),
    ),
  },
  returns: v.array(shippingDocs.commerce_shipment_manifests),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.manifests.view");
    const all = await ctx.db.query("commerce_shipment_manifests").collect();
    return all
      .filter((m) => !args.status || m.status === args.status)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getTodaysManifest = query({
  args: {
    shipFromLocationId: v.id("commerce_ship_from_locations"),
    carrierCode: v.string(),
    manifestDate: v.string(),
  },
  returns: v.union(v.null(), shippingDocs.commerce_shipment_manifests),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.manifests.view");
    const all = await ctx.db
      .query("commerce_shipment_manifests")
      .withIndex("by_location_date", (q) =>
        q.eq("shipFromLocationId", args.shipFromLocationId).eq("manifestDate", args.manifestDate),
      )
      .collect();
    return all.find((m) => m.carrierCode === args.carrierCode) ?? null;
  },
});

export const get = query({
  args: { manifestId: v.id("commerce_shipment_manifests") },
  returns: v.union(v.null(), shippingDocs.commerce_shipment_manifests),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.manifests.view");
    return ctx.db.get(args.manifestId);
  },
});
