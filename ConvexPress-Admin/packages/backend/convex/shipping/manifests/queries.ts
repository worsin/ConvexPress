import { v } from "convex/values";

import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";

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
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.manifests.view");
    const all = await ctx.db.query("commerce_shipment_manifests").collect();
    return all
      .filter((m: any) => !args.status || m.status === args.status)
      .sort((a: any, b: any) => b.createdAt - a.createdAt);
  },
});

export const getTodaysManifest = query({
  args: {
    shipFromLocationId: v.id("commerce_ship_from_locations"),
    carrierCode: v.string(),
    manifestDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.manifests.view");
    const all = await ctx.db
      .query("commerce_shipment_manifests")
      .withIndex("by_location_date", (q: any) =>
        q.eq("shipFromLocationId", args.shipFromLocationId).eq("manifestDate", args.manifestDate),
      )
      .collect();
    return all.find((m: any) => m.carrierCode === args.carrierCode) ?? null;
  },
});

export const get = query({
  args: { manifestId: v.id("commerce_shipment_manifests") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.manifests.view");
    return ctx.db.get(args.manifestId);
  },
});
