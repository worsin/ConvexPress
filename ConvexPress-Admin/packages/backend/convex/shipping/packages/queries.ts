import { v } from "convex/values";

import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { packageSourceValidator } from "./validators";

export const list = query({
  args: {
    source: v.optional(packageSourceValidator),
    shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.packages.read");
    const all = await ctx.db.query("commerce_shipping_packages").collect();
    return all
      .filter((pkg: any) => {
        if (!args.includeArchived && pkg.isArchived) return false;
        if (args.source && pkg.packageSource !== args.source) return false;
        if (
          args.shipFromLocationId !== undefined &&
          pkg.shipFromLocationId !== args.shipFromLocationId
        ) {
          return false;
        }
        return true;
      })
      .sort((a: any, b: any) => {
        const aOrder = a.sortOrder ?? 0;
        const bOrder = b.sortOrder ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.label.localeCompare(b.label);
      });
  },
});

export const get = query({
  args: { packageId: v.id("commerce_shipping_packages") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.packages.read");
    return ctx.db.get(args.packageId);
  },
});

export const getDefault = query({
  args: { shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")) },
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.packages.read");
    const scoped = await ctx.db
      .query("commerce_shipping_packages")
      .withIndex("by_default_scope", (q: any) =>
        q.eq("shipFromLocationId", args.shipFromLocationId).eq("isDefault", true),
      )
      .unique();
    if (scoped) return scoped;
    // Fallback to global default.
    return ctx.db
      .query("commerce_shipping_packages")
      .withIndex("by_default_scope", (q: any) =>
        q.eq("shipFromLocationId", undefined).eq("isDefault", true),
      )
      .unique();
  },
});
