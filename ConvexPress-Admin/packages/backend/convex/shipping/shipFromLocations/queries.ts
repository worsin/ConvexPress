import { v } from "convex/values";

import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";

import { shippingDocs } from "../../schema/shipping.docs.generated";
export const list = query({
  args: {
    includeArchived: v.optional(v.boolean()),
    includeInactive: v.optional(v.boolean()),
  },
  returns: v.array(shippingDocs.commerce_ship_from_locations),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.locations.read");
    const all = await ctx.db.query("commerce_ship_from_locations").collect();
    return all
      .filter((loc) => {
        if (!args.includeArchived && loc.isArchived) return false;
        if (!args.includeInactive && !loc.isActive) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.name.localeCompare(b.name);
      });
  },
});

export const get = query({
  args: { locationId: v.id("commerce_ship_from_locations") },
  returns: v.union(v.null(), shippingDocs.commerce_ship_from_locations),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.locations.read");
    return ctx.db.get(args.locationId);
  },
});

export const getDefault = query({
  args: {},
  returns: v.union(v.null(), shippingDocs.commerce_ship_from_locations),
  handler: async (ctx) => {
    await requireCan(ctx, "shipping.locations.read");
    return ctx.db
      .query("commerce_ship_from_locations")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .unique();
  },
});

export const listPickupLocations = query({
  args: {},
  returns: v.array(shippingDocs.commerce_ship_from_locations),
  handler: async (ctx) => {
    await requireCan(ctx, "shipping.locations.read");
    const all = await ctx.db.query("commerce_ship_from_locations").collect();
    return all.filter(
      (loc) => loc.isPickupEnabled === true && !loc.isArchived && loc.isActive,
    );
  },
});

export const listProductLocations = query({
  args: { productId: v.id("commerce_products") },
  returns: v.array(shippingDocs.commerce_product_location_fulfillment),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.locations.read");
    return ctx.db
      .query("commerce_product_location_fulfillment")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
  },
});
