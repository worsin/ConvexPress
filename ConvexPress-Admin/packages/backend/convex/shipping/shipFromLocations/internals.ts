import { v } from "convex/values";

import { internalQuery } from "../../_generated/server";

/** Fetch a ship-from location by id — used by the rate pipeline. */
export const getById = internalQuery({
  args: { locationId: v.id("commerce_ship_from_locations") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.locationId);
  },
});

/** List active pickup-enabled ship-from locations for the rate pipeline. */
export const listActivePickupLocations = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("commerce_ship_from_locations").collect();
    return all.filter(
      (loc: any) => loc.isPickupEnabled === true && !loc.isArchived && loc.isActive,
    );
  },
});

/**
 * Resolve which ship-from location(s) can fulfill a given product/variant.
 * PRD A4 selection algorithm.
 *  1. Look for product_location_fulfillment rows (variant-specific first, then product-level).
 *  2. If none, fall back to the default location (every product ships from the default).
 *  3. Inactive and archived locations are excluded.
 */
export const resolveForProduct = internalQuery({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
  },
  handler: async (ctx, args) => {
    // Variant-specific mappings take precedence.
    if (args.variantId) {
      const variantMappings = await ctx.db
        .query("commerce_product_location_fulfillment")
        .withIndex("by_variant_location", (q: any) =>
          q.eq("variantId", args.variantId),
        )
        .collect();
      const enabledVariant = variantMappings.filter((m: any) => m.enabled !== false);
      if (enabledVariant.length > 0) {
        return await resolveLocations(ctx, enabledVariant);
      }
    }

    // Product-level mappings.
    const productMappings = await ctx.db
      .query("commerce_product_location_fulfillment")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .collect();
    const productLevel = productMappings.filter(
      (m: any) => !m.variantId && m.enabled !== false,
    );
    if (productLevel.length > 0) {
      return await resolveLocations(ctx, productLevel);
    }

    // Fallback to default location.
    const defaultLocation = await ctx.db
      .query("commerce_ship_from_locations")
      .withIndex("by_default", (q: any) => q.eq("isDefault", true))
      .unique();
    return defaultLocation && defaultLocation.isActive && !defaultLocation.isArchived
      ? [defaultLocation]
      : [];
  },
});

async function resolveLocations(ctx: any, mappings: any[]) {
  const locations = [];
  for (const mapping of mappings) {
    const loc = await ctx.db.get(mapping.locationId);
    if (loc && loc.isActive && !loc.isArchived) {
      locations.push({ ...loc, mappingPriority: mapping.priority });
    }
  }
  locations.sort(
    (a: any, b: any) =>
      (a.mappingPriority ?? a.priority ?? 100) -
      (b.mappingPriority ?? b.priority ?? 100),
  );
  return locations;
}

export const getDefault = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("commerce_ship_from_locations")
      .withIndex("by_default", (q: any) => q.eq("isDefault", true))
      .unique();
  },
});
