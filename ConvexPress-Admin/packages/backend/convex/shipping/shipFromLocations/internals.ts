import { v } from "convex/values";

import { internalQuery, type QueryCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";

/** A location able to fulfil a product, with the product mapping's priority when one applies. */
type ResolvedLocation = Doc<"commerce_ship_from_locations"> & { mappingPriority?: number };

import { shippingDocs } from "../../schema/shipping.docs.generated";
/** Fetch a ship-from location by id — used by the rate pipeline. */
export const getById = internalQuery({
  args: { locationId: v.id("commerce_ship_from_locations") },
  returns: v.union(v.null(), shippingDocs.commerce_ship_from_locations),
  handler: async (ctx, args) => {
    return ctx.db.get(args.locationId);
  },
});

/** List active pickup-enabled ship-from locations for the rate pipeline. */
export const listActivePickupLocations = internalQuery({
  args: {},
  returns: v.array(shippingDocs.commerce_ship_from_locations),
  handler: async (ctx) => {
    const all = await ctx.db.query("commerce_ship_from_locations").collect();
    return all.filter(
      (loc) => loc.isPickupEnabled === true && !loc.isArchived && loc.isActive,
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
  returns: v.array(v.object({
    ...shippingDocs.commerce_ship_from_locations.fields,
    mappingPriority: v.optional(v.number()),
  })),
  handler: async (ctx, args): Promise<ResolvedLocation[]> => {
    // Variant-specific mappings take precedence.
    const variantId = args.variantId;
    if (variantId) {
      const variantMappings = await ctx.db
        .query("commerce_product_location_fulfillment")
        .withIndex("by_variant_location", (q) =>
          q.eq("variantId", variantId),
        )
        .collect();
      const enabledVariant = variantMappings.filter((m) => m.enabled !== false);
      if (enabledVariant.length > 0) {
        return await resolveLocations(ctx, enabledVariant);
      }
    }

    // Product-level mappings.
    const productMappings = await ctx.db
      .query("commerce_product_location_fulfillment")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    const productLevel = productMappings.filter(
      (m) => !m.variantId && m.enabled !== false,
    );
    if (productLevel.length > 0) {
      return await resolveLocations(ctx, productLevel);
    }

    // Fallback to default location.
    const defaultLocation = await ctx.db
      .query("commerce_ship_from_locations")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .unique();
    return defaultLocation && defaultLocation.isActive && !defaultLocation.isArchived
      ? [defaultLocation]
      : [];
  },
});

async function resolveLocations(
  ctx: Pick<QueryCtx, "db">,
  mappings: Doc<"commerce_product_location_fulfillment">[],
): Promise<ResolvedLocation[]> {
  const locations: ResolvedLocation[] = [];
  for (const mapping of mappings) {
    const loc = await ctx.db.get(mapping.locationId);
    if (loc && loc.isActive && !loc.isArchived) {
      locations.push({ ...loc, mappingPriority: mapping.priority });
    }
  }
  locations.sort(
    (a, b) =>
      (a.mappingPriority ?? a.priority ?? 100) -
      (b.mappingPriority ?? b.priority ?? 100),
  );
  return locations;
}

export const getDefault = internalQuery({
  args: {},
  returns: v.union(v.null(), shippingDocs.commerce_ship_from_locations),
  handler: async (ctx) => {
    return ctx.db
      .query("commerce_ship_from_locations")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .unique();
  },
});
