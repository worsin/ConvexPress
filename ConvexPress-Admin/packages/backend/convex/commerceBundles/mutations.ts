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
 *   Legacy Selection Staging:
 *   - saveSelection          Legacy/debug helper; canonical purchase flow now
 *                            stores bundle snapshots directly on cart/order items
 */

import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requireCommerceBundlesEnabled } from "./helpers";
import { getCommerceSettings } from "../commerce/helpers";
import {
  commerceBundleStatusValidator,
  commerceBundlePricingTypeValidator,
  commerceBundleTypeValidator,
} from "../schema/commerceBundles";
import {
  buildBundleLineMetadata,
  resolveBundlePricingPreview,
  resolveBundleSelectionSnapshot,
} from "./runtime";

// ============================================
// HELPER: Recalculate and update bundle price
// ============================================

async function recalculateBundlePrice(ctx: any, bundleId: any) {
  const bundle = await ctx.db.get(bundleId);
  if (!bundle) return;
  const snapshot = await resolveBundlePricingPreview(ctx, { bundle });

  await ctx.db.patch(bundleId, {
    regularPrice: snapshot?.regularPriceAmount ?? 0,
    bundlePrice: snapshot?.resolvedBundlePriceAmount ?? 0,
    updatedAt: Date.now(),
  });
}

async function ensureOwningProductForBundle(
  ctx: any,
  args: {
    actorId: any;
    bundle: any;
    updates?: Record<string, unknown>;
  },
) {
  if (args.bundle.productId) {
    return args.bundle.productId;
  }

  const commerceSettings = await getCommerceSettings(ctx);
  const now = Date.now();
  const effective = args.updates ?? {};
  const productId = await ctx.db.insert("commerce_products", {
    title: effective.name ?? args.bundle.name,
    slug: effective.slug ?? args.bundle.slug,
    description: effective.description ?? args.bundle.description,
    excerpt: effective.shortDescription ?? args.bundle.shortDescription,
    status:
      effective.status === "active"
        ? "publish"
        : effective.status === "archived"
          ? "private"
          : "draft",
    productType: "simple",
    sku: undefined,
    authorId: args.actorId,
    featuredMediaId: undefined,
    galleryMediaIds: [],
    categoryIds: effective.categoryIds ?? args.bundle.categoryIds ?? [],
    basePrice: {
      amount: effective.fixedPrice ?? args.bundle.fixedPrice ?? 0,
      currencyCode: commerceSettings.currencyCode || "USD",
    },
    salePrice: undefined,
    trackInventory: false,
    stockQuantity: undefined,
    allowBackorders: true,
    isVirtual: false,
    shippingWeightOz: undefined,
    isDownloadable: false,
    publishedAt: effective.status === "active" ? now : undefined,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.patch(args.bundle._id, {
    productId,
    updatedAt: now,
  });

  return productId;
}

async function requireActiveBundleIsPurchasable(
  ctx: any,
  bundle: any,
  options?: {
    components?: any[];
  },
) {
  if (bundle.status !== "active") return;

  if (!bundle.productId) {
    throw new ConvexError({
      code: "bundle_not_publishable",
      message: "Bundle must have an owning product before it can be active.",
    });
  }

  const owningProduct = await ctx.db.get(bundle.productId);
  if (!owningProduct || owningProduct.status !== "publish") {
    throw new ConvexError({
      code: "bundle_not_publishable",
      message: "Bundle owning product must be published before the bundle can be active.",
    });
  }

  const components =
    options?.components ??
    (await ctx.db
      .query("commerce_bundle_components")
      .withIndex("by_bundle", (q: any) => q.eq("bundleId", bundle._id))
      .collect());
  if (components.length === 0) {
    throw new ConvexError({
      code: "bundle_not_publishable",
      message: "Bundle must have at least one component before it can be active.",
    });
  }

  for (const component of components) {
    const product = await ctx.db.get(component.productId);
    if (!product || product.status !== "publish") {
      throw new ConvexError({
        code: "bundle_not_publishable",
        message: "Every bundle component product must be published before the bundle can be active.",
      });
    }
    if (product.productType === "variable" && !component.variantId) {
      throw new ConvexError({
        code: "bundle_not_publishable",
        message: "Variable component products must select a variant before the bundle can be active.",
      });
    }
    if (component.variantId) {
      const variant = await ctx.db.get(component.variantId);
      if (!variant || variant.productId.toString() !== component.productId.toString()) {
        throw new ConvexError({
          code: "bundle_not_publishable",
          message: "Every bundle component variant must belong to its component product.",
        });
      }
    }
  }
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
    allowPartialStock: v.optional(v.boolean()),
    status: v.optional(commerceBundleStatusValidator),
    categoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
    tags: v.optional(v.array(v.string())),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);
    const actor = await requireCan(ctx, "commerce.bundles.create");
    if (args.status === "active") {
      throw new ConvexError({
        code: "bundle_not_publishable",
        message: "Create the bundle first, then add components before activating it.",
      });
    }

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
    const commerceSettings = await getCommerceSettings(ctx);
    const owningProductId = await ctx.db.insert("commerce_products", {
      title: args.name,
      slug: args.slug,
      description: args.description,
      excerpt: args.shortDescription,
      status:
        args.status === "active"
          ? "publish"
          : args.status === "archived"
            ? "private"
            : "draft",
      productType: "simple",
      sku: undefined,
      authorId: actor._id,
      featuredMediaId: undefined,
      galleryMediaIds: [],
      categoryIds: args.categoryIds ?? [],
      basePrice: {
        amount: args.fixedPrice ?? 0,
        currencyCode: commerceSettings.currencyCode || "USD",
      },
      salePrice: undefined,
      trackInventory: false,
      stockQuantity: undefined,
      allowBackorders: true,
      isVirtual: false,
      shippingWeightOz: undefined,
      isDownloadable: false,
      publishedAt: args.status === "active" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    return await ctx.db.insert("commerce_bundles", {
      productId: owningProductId,
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
      allowPartialStock: args.allowPartialStock,
      categoryIds: args.categoryIds,
      tags: args.tags,
      metaTitle: args.metaTitle,
      metaDescription: args.metaDescription,
      status: args.status ?? "draft",
      purchaseCount: 0,
      publishedAt: args.status === "active" ? now : undefined,
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
    const actor = await requireCan(ctx, "commerce.bundles.edit");

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
    const owningProductId = await ensureOwningProductForBundle(ctx, {
      actorId: actor._id,
      bundle,
      updates: cleanUpdates,
    });
    const nextBundle = {
      ...bundle,
      ...cleanUpdates,
      productId: owningProductId,
    };

    await ctx.db.patch(id, {
      ...cleanUpdates,
      productId: owningProductId,
      updatedAt: now,
      publishedAt:
        updates.status === "active" && !bundle.publishedAt
          ? now
          : bundle.publishedAt,
    });

    if (owningProductId) {
      const nextStatus = cleanUpdates.status ?? bundle.status;
      const productStatus =
        nextStatus === "active"
          ? "publish"
          : nextStatus === "archived"
            ? "private"
            : "draft";
      const productPatch: Record<string, unknown> = {
        title: cleanUpdates.name ?? bundle.name,
        slug: cleanUpdates.slug ?? bundle.slug,
        description: cleanUpdates.description ?? bundle.description,
        excerpt: cleanUpdates.shortDescription ?? bundle.shortDescription,
        categoryIds: cleanUpdates.categoryIds ?? bundle.categoryIds ?? [],
        status: productStatus,
        updatedAt: now,
      };
      if (nextStatus === "active") {
        productPatch.publishedAt = now;
      }
      if (cleanUpdates.fixedPrice !== undefined) {
        const product = await ctx.db.get(owningProductId);
        if (product?.basePrice?.currencyCode) {
          productPatch.basePrice = {
            amount: cleanUpdates.fixedPrice,
            currencyCode: product.basePrice.currencyCode,
          };
        }
      }
      await ctx.db.patch(owningProductId, productPatch);
    }
    await requireActiveBundleIsPurchasable(ctx, nextBundle);

    // When activating a bundle, validate via runtime snapshot
    const newStatus = cleanUpdates.status ?? bundle.status;
    const currentStatus = bundle.status;
    if (newStatus === "active" && currentStatus !== "active") {
      const activationComponents = await ctx.db
        .query("commerce_bundle_components")
        .withIndex("by_bundle", (q: any) => q.eq("bundleId", id))
        .collect();
      const snapshot = await resolveBundlePricingPreview(ctx, { bundle: nextBundle, components: activationComponents });
      if (!snapshot) {
        throw new ConvexError({
          code: "INVALID_BUNDLE",
          message: "Bundle cannot be activated — runtime validation failed. Check component products and quantities.",
        });
      }
    }

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
    if (bundle.productId) {
      await ctx.db.patch(bundle.productId, {
        status: "trash",
        updatedAt: Date.now(),
      });
    }

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
    if (bundle.status === "active" && product.status !== "publish") {
      throw new ConvexError({
        code: "bundle_not_publishable",
        message: "Active bundles can only include published component products.",
      });
    }
    if (args.variantId) {
      const variant = await ctx.db.get(args.variantId);
      if (!variant || variant.productId.toString() !== args.productId.toString()) {
        throw new ConvexError({
          code: "invalid_variant",
          message: "Selected variant does not belong to the selected product.",
        });
      }
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
    await requireActiveBundleIsPurchasable(ctx, {
      ...bundle,
      _id: args.bundleId,
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
    productId: v.optional(v.id("commerce_products")),
    variantId: v.optional(v.union(v.id("commerce_product_variants"), v.null())),
    quantity: v.optional(v.number()),
    minQuantity: v.optional(v.union(v.number(), v.null())),
    maxQuantity: v.optional(v.union(v.number(), v.null())),
    priceOverride: v.optional(v.union(v.number(), v.null())),
    discountPercent: v.optional(v.union(v.number(), v.null())),
    isRequired: v.optional(v.boolean()),
    isDefault: v.optional(v.boolean()),
    allowVariantChange: v.optional(v.boolean()),
    label: v.optional(v.union(v.string(), v.null())),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "commerce.bundles.edit");

    const { componentId, ...updates } = args;

    const component = await ctx.db.get(componentId);
    if (!component) {
      throw new ConvexError({
        code: "component_not_found",
        message: "Component not found",
      });
    }

    const nextProductId = args.productId ?? component.productId;
    const nextProduct = await ctx.db.get(nextProductId);
    if (!nextProduct) {
      throw new ConvexError({
        code: "product_not_found",
        message: "Product not found",
      });
    }
    const bundle = await ctx.db.get(component.bundleId);
    if (bundle?.status === "active" && nextProduct.status !== "publish") {
      throw new ConvexError({
        code: "bundle_not_publishable",
        message: "Active bundles can only include published component products.",
      });
    }

    const nextVariantId =
      args.variantId === undefined ? component.variantId : args.variantId;
    if (nextVariantId) {
      const variant = await ctx.db.get(nextVariantId);
      if (!variant || variant.productId.toString() !== nextProductId.toString()) {
        throw new ConvexError({
          code: "invalid_variant",
          message: "Selected variant does not belong to the selected product.",
        });
      }
    }

    const cleanUpdates = Object.fromEntries(
      Object.entries(updates)
        .filter(([_, val]) => val !== undefined)
        .map(([key, val]) => [key, val === null ? undefined : val]),
    );

    await ctx.db.patch(componentId, {
      ...cleanUpdates,
      updatedAt: Date.now(),
    });
    if (bundle) {
      await requireActiveBundleIsPurchasable(ctx, bundle);
    }

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
    const bundle = await ctx.db.get(bundleId);
    if (bundle?.status === "active") {
      const existingComponents = await ctx.db
        .query("commerce_bundle_components")
        .withIndex("by_bundle", (q: any) => q.eq("bundleId", bundleId))
        .collect();
      if (existingComponents.length <= 1) {
        throw new ConvexError({
          code: "bundle_not_publishable",
          message: "Active bundles must have at least one component.",
        });
      }

      // Check minItems constraint
      const remainingCount = existingComponents.length - 1;
      if (bundle.minItems && remainingCount < bundle.minItems) {
        throw new ConvexError({
          code: "BELOW_MINIMUM",
          message: `Active bundle requires at least ${bundle.minItems} components. Cannot remove.`,
        });
      }
    }

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
// LEGACY SELECTION STAGING
// ============================================

/**
 * Save bundle selections into the legacy staging table.
 *
 * Canonical storefront checkout no longer depends on this record. Bundle
 * snapshots now flow through cart item metadata and are copied into order
 * item metadata at checkout.
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
    await requireCan(ctx, "commerce.bundles.edit");

    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle) {
      throw new ConvexError({
        code: "bundle_not_found",
        message: "Bundle not found",
      });
    }

    const snapshot = await resolveBundleSelectionSnapshot(ctx, {
      bundle,
      selections: args.selections,
    });

    const now = Date.now();

    const selectionId = await ctx.db.insert("commerce_bundle_selections", {
      bundleId: args.bundleId,
      cartItemId: args.cartItemId,
      selections: snapshot.selections.map((selection) => ({
        componentId: selection.componentId,
        productId: selection.productId,
        variantId: selection.variantId,
        quantity: selection.quantity,
        unitPrice: selection.unitPriceAmount,
      })),
      totalPrice: snapshot.resolvedBundlePriceAmount,
      createdAt: now,
      updatedAt: now,
    });

    return {
      selectionId,
      totalPrice: snapshot.resolvedBundlePriceAmount,
      metadata: buildBundleLineMetadata({
        bundle,
        owningProductId: bundle.productId,
        snapshot,
      }),
    };
  },
});

export const backfillOwningProducts = mutation({
  args: {},
  handler: async (ctx: any) => {
    await requireCommerceBundlesEnabled(ctx);
    const actor = await requireCan(ctx, "commerce.bundles.edit");

    const bundles = await ctx.db.query("commerce_bundles").collect();
    let updatedCount = 0;

    for (const bundle of bundles) {
      if (bundle.productId) continue;
      await ensureOwningProductForBundle(ctx, {
        actorId: actor._id,
        bundle,
      });
      updatedCount += 1;
    }

    return { updatedCount };
  },
});
