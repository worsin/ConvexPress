import { v } from "convex/values";

import { internalQuery } from "../../_generated/server";

/**
 * Resolve the effective package for a cart line (PRD A3 §5.2 resolution order):
 * 1. Product-level override (product.preferredPackageId)
 * 2. Shipping class default (shippingClass.preferredPackageId) — deferred until A2 adds field
 * 3. Ship-from location default
 * 4. Global default
 */
export const resolveForCartLine = internalQuery({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;

    // 1. Product-level override.
    if (product.preferredPackageId) {
      const pkg = await ctx.db.get(product.preferredPackageId);
      if (pkg && !pkg.isArchived) return pkg;
    }

    // 2. Class-level override — shippingClasses.preferredPackageId.
    const variant = args.variantId ? await ctx.db.get(args.variantId) : null;
    const classId =
      (variant && !variant.shippingClassOverrideNone
        ? variant.shippingClassId
        : null) ?? product.shippingClassId ?? null;
    if (classId) {
      const cls = await ctx.db.get(classId);
      if (cls?.preferredPackageId) {
        const pkg = await ctx.db.get(cls.preferredPackageId);
        if (pkg && !pkg.isArchived) return pkg;
      }
    }

    // 3. Location-scoped default.
    if (args.shipFromLocationId) {
      const locScoped = await ctx.db
        .query("commerce_shipping_packages")
        .withIndex("by_default_scope", (q: any) =>
          q.eq("shipFromLocationId", args.shipFromLocationId).eq("isDefault", true),
        )
        .unique();
      if (locScoped && !locScoped.isArchived) return locScoped;
    }

    // 4. Global default.
    const globalDefault = await ctx.db
      .query("commerce_shipping_packages")
      .withIndex("by_default_scope", (q: any) =>
        q.eq("shipFromLocationId", undefined).eq("isDefault", true),
      )
      .unique();
    return globalDefault ?? null;
  },
});

export const listAvailablePackages = internalQuery({
  args: {
    shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("commerce_shipping_packages").collect();
    return all.filter((pkg: any) => {
      if (pkg.isArchived) return false;
      // Include global packages and location-scoped ones matching the arg.
      if (!pkg.shipFromLocationId) return true;
      return pkg.shipFromLocationId === args.shipFromLocationId;
    });
  },
});
