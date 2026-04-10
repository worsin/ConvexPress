// @ts-nocheck
/**
 * Commerce Bundles — Mutations
 *
 * Ported from VexCart bundles.ts mutations, adapted to ConvexPress
 * schema (commerce_bundle* tables) and auth patterns.
 *
 * Functions:
 *   Bundle CRUD:
 *   - create                 Create a new bundle (admin)
 *   - update                 Update bundle fields (admin)
 *   - remove                 Delete bundle and cascade components (admin)
 *
 *   Component Management:
 *   - addComponent           Add a component product to a bundle
 *   - updateComponent        Update component settings
 *   - removeComponent        Remove a component from a bundle
 *   - reorderComponents      Reorder components within a bundle
 *
 *   Bundle Selections (cart integration):
 *   - saveSelection          Validate & save customer component choices for cart
 */

import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceBundlesEnabled } from "./helpers";
import {
  commerceBundleStatusValidator,
  commerceBundlePricingTypeValidator,
  commerceBundleTypeValidator,
} from "../schema/commerceBundles";

// ============================================
// HELPER: Recalculate and update bundle price
// ============================================

async function recalculateBundlePrice(ctx: any, bundleId: any) {
  const bundle = await ctx.db.get(bundleId);
  if (!bundle) return;

  const components = await ctx.db
    .query("commerce_bundle_components")
    .withIndex("by_bundle", (q: any) => q.eq("bundleId", bundleId))
    .collect();

  let regularPrice = 0;

  for (const comp of components) {
    const product = await ctx.db.get(comp.productId);
    if (!product) continue;

    let price = product.basePrice?.amount ?? product.basePrice ?? 0;
    if (comp.variantId) {
      const variant = await ctx.db.get(comp.variantId);
      if (variant?.price) {
        price = variant.price?.amount ?? variant.price ?? 0;
      }
    }

    regularPrice += price * comp.quantity;
  }

  let bundlePrice = regularPrice;

  switch (bundle.pricingType) {
    case "fixed":
      bundlePrice = bundle.fixedPrice || regularPrice;
      break;
    case "percent_off":
      bundlePrice = Math.round(
        regularPrice * (1 - (bundle.discountPercent || 0) / 100),
      );
      break;
    case "amount_off":
      bundlePrice = Math.max(0, regularPrice - (bundle.discountAmount || 0));
      break;
  }

  await ctx.db.patch(bundleId, {
    regularPrice,
    bundlePrice,
    updatedAt: Date.now(),
  });
}

// ============================================
// BUNDLE CRUD
// ============================================

/**
 * Create a new bundle
 */
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    images: v.optional(v.array(v.string())),
    pricingType: commerceBundlePricingTypeValidator,
    fixedPrice: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    bundleType: commerceBundleTypeValidator,
    minItems: v.optional(v.number()),
    maxItems: v.optional(v.number()),
    stockCount: v.optional(v.number()),
    trackInventory: v.optional(v.boolean()),
    categoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
    tags: v.optional(v.array(v.string())),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "commerce.bundles.create");

    // Check for duplicate slug
    const existing = await ctx.db
      .query("commerce_bundles")
      .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
      .unique();

    if (existing) {
      throw new ConvexError({
        code: "duplicate_slug",
        message: "A bundle with this slug already exists",
      });
    }

    const now = Date.now();

    return await ctx.db.insert("commerce_bundles", {
      name: args.name,
      slug: args.slug,
      description: args.description,
      shortDescription: args.shortDescription,
      images: args.images || [],
      pricingType: args.pricingType,
      fixedPrice: args.fixedPrice,
      discountPercent: args.discountPercent,
      discountAmount: args.discountAmount,
      bundleType: args.bundleType,
      minItems: args.minItems,
      maxItems: args.maxItems,
      stockCount: args.stockCount,
      trackInventory: args.trackInventory,
      categoryIds: args.categoryIds,
      tags: args.tags,
      metaTitle: args.metaTitle,
      metaDescription: args.metaDescription,
      status: "draft",
      purchaseCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a bundle
 */
export const update = mutation({
  args: {
    id: v.id("commerce_bundles"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    images: v.optional(v.array(v.string())),
    pricingType: v.optional(commerceBundlePricingTypeValidator),
    fixedPrice: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    bundleType: v.optional(commerceBundleTypeValidator),
    minItems: v.optional(v.number()),
    maxItems: v.optional(v.number()),
    stockCount: v.optional(v.number()),
    trackInventory: v.optional(v.boolean()),
    allowPartialStock: v.optional(v.boolean()),
    status: v.optional(commerceBundleStatusValidator),
    categoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
    tags: v.optional(v.array(v.string())),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "commerce.bundles.edit");

    const { id, ...updates } = args;

    const bundle = await ctx.db.get(id);
    if (!bundle) {
      throw new ConvexError({
        code: "bundle_not_found",
        message: "Bundle not found",
      });
    }

    // Check slug uniqueness if changed
    if (updates.slug && updates.slug !== bundle.slug) {
      const existing = await ctx.db
        .query("commerce_bundles")
        .withIndex("by_slug", (q: any) => q.eq("slug", updates.slug))
        .unique();

      if (existing) {
        throw new ConvexError({
          code: "duplicate_slug",
          message: "A bundle with this slug already exists",
        });
      }
    }

    // Remove undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, val]) => val !== undefined),
    );

    const now = Date.now();

    await ctx.db.patch(id, {
      ...cleanUpdates,
      updatedAt: now,
      publishedAt:
        updates.status === "active" && !bundle.publishedAt
          ? now
          : bundle.publishedAt,
    });

    // Recalculate prices
    await recalculateBundlePrice(ctx, id);

    return id;
  },
});

/**
 * Delete a bundle (cascades components)
 */
export const remove = mutation({
  args: { id: v.id("commerce_bundles") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "commerce.bundles.delete");

    const bundle = await ctx.db.get(args.id);
    if (!bundle) {
      throw new ConvexError({
        code: "bundle_not_found",
        message: "Bundle not found",
      });
    }

    // Delete all components
    const components = await ctx.db
      .query("commerce_bundle_components")
      .withIndex("by_bundle", (q: any) => q.eq("bundleId", args.id))
      .collect();

    for (const comp of components) {
      await ctx.db.delete(comp._id);
    }

    // Delete all selections
    const selections = await ctx.db
      .query("commerce_bundle_selections")
      .withIndex("by_bundle", (q: any) => q.eq("bundleId", args.id))
      .collect();

    for (const sel of selections) {
      await ctx.db.delete(sel._id);
    }

    // Delete the bundle
    await ctx.db.delete(args.id);

    return args.id;
  },
});

// ============================================
// COMPONENT MANAGEMENT
// ============================================

/**
 * Add a component to a bundle
 */
export const addComponent = mutation({
  args: {
    bundleId: v.id("commerce_bundles"),
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    quantity: v.number(),
    minQuantity: v.optional(v.number()),
    maxQuantity: v.optional(v.number()),
    priceOverride: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    isRequired: v.boolean(),
    isDefault: v.optional(v.boolean()),
    allowVariantChange: v.optional(v.boolean()),
    label: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "commerce.bundles.edit");

    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle) {
      throw new ConvexError({
        code: "bundle_not_found",
        message: "Bundle not found",
      });
    }

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new ConvexError({
        code: "product_not_found",
        message: "Product not found",
      });
    }

    // Get current component count for sort order
    const existing = await ctx.db
      .query("commerce_bundle_components")
      .withIndex("by_bundle", (q: any) => q.eq("bundleId", args.bundleId))
      .collect();

    const now = Date.now();

    const componentId = await ctx.db.insert("commerce_bundle_components", {
      bundleId: args.bundleId,
      productId: args.productId,
      variantId: args.variantId,
      quantity: args.quantity,
      minQuantity: args.minQuantity,
      maxQuantity: args.maxQuantity,
      priceOverride: args.priceOverride,
      discountPercent: args.discountPercent,
      isRequired: args.isRequired,
      isDefault: args.isDefault,
      allowVariantChange: args.allowVariantChange,
      label: args.label,
      sortOrder: existing.length,
      createdAt: now,
      updatedAt: now,
    });

    // Recalculate bundle price
    await recalculateBundlePrice(ctx, args.bundleId);

    return componentId;
  },
});

/**
 * Update a bundle component
 */
export const updateComponent = mutation({
  args: {
    componentId: v.id("commerce_bundle_components"),
    variantId: v.optional(v.id("commerce_product_variants")),
    clearVariant: v.optional(v.boolean()),
    quantity: v.optional(v.number()),
    minQuantity: v.optional(v.number()),
    maxQuantity: v.optional(v.number()),
    priceOverride: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    isRequired: v.optional(v.boolean()),
    isDefault: v.optional(v.boolean()),
    allowVariantChange: v.optional(v.boolean()),
    label: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "commerce.bundles.edit");

    const { componentId, clearVariant, ...updates } = args;

    const component = await ctx.db.get(componentId);
    if (!component) {
      throw new ConvexError({
        code: "component_not_found",
        message: "Component not found",
      });
    }

    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, val]) => val !== undefined),
    );

    // Handle clearing variantId explicitly (since undefined means "don't change")
    if (clearVariant) {
      cleanUpdates.variantId = undefined;
    }

    await ctx.db.patch(componentId, {
      ...cleanUpdates,
      updatedAt: Date.now(),
    });

    // Recalculate bundle price
    await recalculateBundlePrice(ctx, component.bundleId);

    return componentId;
  },
});

/**
 * Remove a component from a bundle
 */
export const removeComponent = mutation({
  args: { componentId: v.id("commerce_bundle_components") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "commerce.bundles.edit");

    const component = await ctx.db.get(args.componentId);
    if (!component) {
      throw new ConvexError({
        code: "component_not_found",
        message: "Component not found",
      });
    }

    const bundleId = component.bundleId;

    await ctx.db.delete(args.componentId);

    // Recalculate bundle price
    await recalculateBundlePrice(ctx, bundleId);

    return args.componentId;
  },
});

/**
 * Reorder bundle components
 */
export const reorderComponents = mutation({
  args: {
    bundleId: v.id("commerce_bundles"),
    componentIds: v.array(v.id("commerce_bundle_components")),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "commerce.bundles.edit");

    for (let i = 0; i < args.componentIds.length; i++) {
      const componentId = args.componentIds[i];
      if (!componentId) continue;
      await ctx.db.patch(componentId, {
        sortOrder: i,
        updatedAt: Date.now(),
      });
    }

    return args.bundleId;
  },
});

// ============================================
// ADMIN: BACKFILL
// ============================================

/**
 * Backfill owning product links for bundles that lack a productId.
 * Admin-callable wrapper around the internal backfill logic.
 */
export const backfillOwningProducts = mutation({
  args: {},
  handler: async (ctx: any) => {
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const bundles = await ctx.db.query("commerce_bundles").collect();
    const unlinked = bundles.filter((b: any) => !b.productId);

    let linked = 0;
    const now = Date.now();

    for (const bundle of unlinked) {
      // Create a virtual product entry for the bundle
      const productId = await ctx.db.insert("commerce_products", {
        title: bundle.name,
        slug: `bundle-${bundle.slug}`,
        status: bundle.status === "active" ? "publish" : "draft",
        productType: "bundle",
        basePrice: { amount: bundle.bundlePrice ?? bundle.regularPrice ?? 0, currency: "USD" },
        trackInventory: bundle.trackInventory ?? false,
        stockQuantity: bundle.stockCount ?? 0,
        allowBackorders: false,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.patch(bundle._id, {
        productId,
        updatedAt: now,
      });

      linked++;
    }

    return { linked, total: bundles.length };
  },
});

// ============================================
// BUNDLE SELECTION (cart integration)
// ============================================

/**
 * Save bundle selections for cart
 *
 * Validates required components, min/max item counts for mix_and_match,
 * resolves per-component pricing, and applies bundle-level discount.
 */
export const saveSelection = mutation({
  args: {
    bundleId: v.id("commerce_bundles"),
    cartItemId: v.optional(v.id("commerce_cart_items")),
    selections: v.array(
      v.object({
        componentId: v.id("commerce_bundle_components"),
        productId: v.id("commerce_products"),
        variantId: v.optional(v.id("commerce_product_variants")),
        quantity: v.number(),
      }),
    ),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);

    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle) {
      throw new ConvexError({
        code: "bundle_not_found",
        message: "Bundle not found",
      });
    }

    // Validate selections
    const components = await ctx.db
      .query("commerce_bundle_components")
      .withIndex("by_bundle", (q: any) => q.eq("bundleId", args.bundleId))
      .collect();

    // Check required components are selected
    for (const comp of components) {
      if (comp.isRequired) {
        const selected = args.selections.find(
          (s: any) => s.componentId === comp._id,
        );
        if (!selected) {
          throw new ConvexError({
            code: "required_component_missing",
            message: `Required component missing: ${comp.label || comp._id}`,
          });
        }
      }
    }

    // Check min/max items for mix_and_match
    if (bundle.bundleType === "mix_and_match") {
      const totalItems = args.selections.reduce(
        (sum: number, s: any) => sum + s.quantity,
        0,
      );

      if (bundle.minItems && totalItems < bundle.minItems) {
        throw new ConvexError({
          code: "min_items_not_met",
          message: `Minimum ${bundle.minItems} items required`,
        });
      }

      if (bundle.maxItems && totalItems > bundle.maxItems) {
        throw new ConvexError({
          code: "max_items_exceeded",
          message: `Maximum ${bundle.maxItems} items allowed`,
        });
      }
    }

    // Calculate total price
    let totalPrice = 0;
    const selectionsWithPrice = await Promise.all(
      args.selections.map(async (sel: any) => {
        const component = components.find((c: any) => c._id === sel.componentId);
        if (!component) {
          throw new ConvexError({
            code: "invalid_component",
            message: "Invalid component",
          });
        }

        const product = await ctx.db.get(sel.productId);
        if (!product) {
          throw new ConvexError({
            code: "product_not_found",
            message: "Product not found",
          });
        }

        let unitPrice = product.basePrice?.amount ?? product.basePrice ?? 0;
        if (sel.variantId) {
          const variant = await ctx.db.get(sel.variantId);
          if (variant?.price) {
            unitPrice = variant.price?.amount ?? variant.price ?? 0;
          }
        }

        if (
          component.priceOverride !== undefined &&
          component.priceOverride !== null
        ) {
          unitPrice = component.priceOverride;
        } else if (component.discountPercent) {
          unitPrice = Math.round(
            unitPrice * (1 - component.discountPercent / 100),
          );
        }

        totalPrice += unitPrice * sel.quantity;

        return {
          ...sel,
          unitPrice,
        };
      }),
    );

    // Apply bundle-level discount
    switch (bundle.pricingType) {
      case "fixed":
        totalPrice = bundle.fixedPrice || totalPrice;
        break;
      case "percent_off":
        totalPrice = Math.round(
          totalPrice * (1 - (bundle.discountPercent || 0) / 100),
        );
        break;
      case "amount_off":
        totalPrice = Math.max(
          0,
          totalPrice - (bundle.discountAmount || 0),
        );
        break;
    }

    const now = Date.now();

    const selectionId = await ctx.db.insert("commerce_bundle_selections", {
      bundleId: args.bundleId,
      cartItemId: args.cartItemId,
      selections: selectionsWithPrice,
      totalPrice,
      createdAt: now,
      updatedAt: now,
    });

    return { selectionId, totalPrice };
  },
});
