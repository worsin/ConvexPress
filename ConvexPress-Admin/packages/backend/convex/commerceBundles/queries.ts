// @ts-nocheck
/**
 * Commerce Bundles — Queries
 *
 * Ported from VexCart bundles.ts queries, adapted to ConvexPress
 * schema (commerce_bundle* tables) and auth patterns.
 *
 * Functions:
 *   Admin:
 *   - list                   List all bundles with optional status filter
 *   - get                    Get single bundle by ID
 *   - getComponents          Get components for a bundle (enriched with product data)
 *
 *   Public / Storefront:
 *   - listActive             Active bundles for storefront (optional category filter)
 *   - getBySlug              Bundle detail by slug (with enriched components)
 *
 *   Pricing & Availability:
 *   - calculatePrice         Calculate bundle price with optional selection overrides
 *   - checkAvailability      Verify bundle is purchasable (stock + status checks)
 *
 *   Cart:
 *   - getSelectionByCartItem Get saved bundle selections for a cart item
 */

import { ConvexError, v } from "convex/values";

import { query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceBundlesEnabled } from "./helpers";
import {
  commerceBundleStatusValidator,
  commerceBundlePricingTypeValidator,
  commerceBundleTypeValidator,
} from "../schema/commerceBundles";

// ============================================
// ADMIN QUERIES
// ============================================

/**
 * List all bundles with optional filtering
 */
export const list = query({
  args: {
    status: v.optional(commerceBundleStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "commerce.bundles.view");

    const bundlesQuery = args.status
      ? ctx.db
          .query("commerce_bundles")
          .withIndex("by_status", (q: any) => q.eq("status", args.status))
      : ctx.db.query("commerce_bundles");

    const bundles = await bundlesQuery.order("desc").collect();

    // Apply limit
    const limited = args.limit ? bundles.slice(0, args.limit) : bundles;

    // Enrich with component count
    const enriched = await Promise.all(
      limited.map(async (bundle: any) => {
        const components = await ctx.db
          .query("commerce_bundle_components")
          .withIndex("by_bundle", (q: any) => q.eq("bundleId", bundle._id))
          .collect();

        return {
          ...bundle,
          componentCount: components.length,
        };
      }),
    );

    return enriched;
  },
});

/**
 * Get a single bundle by ID
 */
export const get = query({
  args: { id: v.id("commerce_bundles") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);

    return await ctx.db.get(args.id);
  },
});

/**
 * Get bundle components (enriched with product & variant data)
 */
export const getComponents = query({
  args: { bundleId: v.id("commerce_bundles") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);

    const components = await ctx.db
      .query("commerce_bundle_components")
      .withIndex("by_bundle", (q: any) => q.eq("bundleId", args.bundleId))
      .collect();

    // Enrich with product data
    const enriched = await Promise.all(
      components.map(async (comp: any) => {
        const product = await ctx.db.get(comp.productId);
        const variant = comp.variantId
          ? await ctx.db.get(comp.variantId)
          : null;

        return {
          ...comp,
          product,
          variant,
        };
      }),
    );

    return enriched
      .filter((c: any) => c.product)
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  },
});

// ============================================
// PUBLIC / STOREFRONT QUERIES
// ============================================

/**
 * List active bundles for storefront
 */
export const listActive = query({
  args: {
    limit: v.optional(v.number()),
    categoryId: v.optional(v.id("commerce_product_categories")),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);

    const bundles = await ctx.db
      .query("commerce_bundles")
      .withIndex("by_status", (q: any) => q.eq("status", "active"))
      .collect();

    // Filter by category if specified
    let filtered = args.categoryId
      ? bundles.filter((b: any) => b.categoryIds?.includes(args.categoryId))
      : bundles;

    // Apply limit
    if (args.limit) {
      filtered = filtered.slice(0, args.limit);
    }

    // Enrich with component products
    const enriched = await Promise.all(
      filtered.map(async (bundle: any) => {
        const components = await ctx.db
          .query("commerce_bundle_components")
          .withIndex("by_bundle", (q: any) => q.eq("bundleId", bundle._id))
          .collect();

        const componentProducts = await Promise.all(
          components.map(async (comp: any) => {
            const product = await ctx.db.get(comp.productId);
            return {
              ...comp,
              product,
            };
          }),
        );

        return {
          ...bundle,
          components: componentProducts.filter((c: any) => c.product),
        };
      }),
    );

    return enriched;
  },
});

/**
 * Get a bundle by slug (full detail with enriched components)
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);

    const bundle = await ctx.db
      .query("commerce_bundles")
      .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
      .unique();

    if (!bundle) return null;

    // Get components
    const components = await ctx.db
      .query("commerce_bundle_components")
      .withIndex("by_bundle", (q: any) => q.eq("bundleId", bundle._id))
      .collect();

    // Enrich components with product data
    const enrichedComponents = await Promise.all(
      components.map(async (comp: any) => {
        const product = await ctx.db.get(comp.productId);
        const variant = comp.variantId
          ? await ctx.db.get(comp.variantId)
          : null;

        return {
          ...comp,
          product,
          variant,
        };
      }),
    );

    return {
      ...bundle,
      components: enrichedComponents
        .filter((c: any) => c.product)
        .sort((a: any, b: any) => a.sortOrder - b.sortOrder),
    };
  },
});

// ============================================
// PRICING & AVAILABILITY QUERIES
// ============================================

/**
 * Calculate bundle price based on pricing type and components
 */
export const calculatePrice = query({
  args: {
    bundleId: v.id("commerce_bundles"),
    selections: v.optional(
      v.array(
        v.object({
          componentId: v.id("commerce_bundle_components"),
          quantity: v.number(),
          variantId: v.optional(v.id("commerce_product_variants")),
        }),
      ),
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

    const components = await ctx.db
      .query("commerce_bundle_components")
      .withIndex("by_bundle", (q: any) => q.eq("bundleId", args.bundleId))
      .collect();

    let regularPrice = 0;
    let bundlePrice = 0;

    // Calculate regular price (sum of components)
    for (const comp of components) {
      // For mix_and_match, check if this component is selected
      if (bundle.bundleType === "mix_and_match" && args.selections) {
        const selection = args.selections.find(
          (s: any) => s.componentId === comp._id,
        );
        if (!selection) continue;
      }

      const product = await ctx.db.get(comp.productId);
      if (!product) continue;

      // Get price (variant price or product base price)
      let price = product.basePrice?.amount ?? product.basePrice ?? 0;
      if (comp.variantId) {
        const variant = await ctx.db.get(comp.variantId);
        if (variant?.price) {
          price = variant.price?.amount ?? variant.price ?? 0;
        }
      }

      // Apply component-level override or discount
      if (comp.priceOverride !== undefined && comp.priceOverride !== null) {
        price = comp.priceOverride;
      } else if (comp.discountPercent) {
        price = Math.round(price * (1 - comp.discountPercent / 100));
      }

      const quantity =
        bundle.bundleType === "mix_and_match" && args.selections
          ? args.selections.find((s: any) => s.componentId === comp._id)
              ?.quantity || comp.quantity
          : comp.quantity;

      regularPrice += (product.basePrice?.amount ?? product.basePrice ?? 0) * quantity;
    }

    // Calculate bundle price based on pricing type
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
        bundlePrice = Math.max(
          0,
          regularPrice - (bundle.discountAmount || 0),
        );
        break;
      case "component_sum":
        bundlePrice = regularPrice;
        break;
      default:
        bundlePrice = regularPrice;
    }

    return {
      regularPrice,
      bundlePrice,
      savings: regularPrice - bundlePrice,
      savingsPercent:
        regularPrice > 0
          ? Math.round(
              ((regularPrice - bundlePrice) / regularPrice) * 100,
            )
          : 0,
    };
  },
});

/**
 * Check bundle inventory availability
 */
export const checkAvailability = query({
  args: {
    bundleId: v.id("commerce_bundles"),
    quantity: v.optional(v.number()),
    selections: v.optional(
      v.array(
        v.object({
          componentId: v.id("commerce_bundle_components"),
          quantity: v.number(),
          variantId: v.optional(v.id("commerce_product_variants")),
        }),
      ),
    ),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);

    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle) {
      return { available: false, reason: "Bundle not found" };
    }

    if (bundle.status !== "active") {
      return { available: false, reason: "Bundle is not active" };
    }

    // Check bundle-level stock
    if (bundle.trackInventory && bundle.stockCount !== undefined) {
      if (bundle.stockCount < (args.quantity || 1)) {
        return { available: false, reason: "Bundle out of stock" };
      }
    }

    // Check component stock
    const components = await ctx.db
      .query("commerce_bundle_components")
      .withIndex("by_bundle", (q: any) => q.eq("bundleId", args.bundleId))
      .collect();

    const unavailableComponents: string[] = [];

    for (const comp of components) {
      // Skip non-required components if not selected
      if (
        !comp.isRequired &&
        args.selections &&
        !args.selections.find((s: any) => s.componentId === comp._id)
      ) {
        continue;
      }

      const product = await ctx.db.get(comp.productId);
      if (!product) {
        unavailableComponents.push(comp.label || comp._id);
        continue;
      }

      if (product.trackInventory) {
        const requiredQty = comp.quantity * (args.quantity || 1);

        // Check variant stock if specific variant
        if (comp.variantId) {
          const variant = await ctx.db.get(comp.variantId);
          if (variant) {
            const stock = variant.stockQuantity ?? 0;
            if (stock < requiredQty && !product.allowBackorders) {
              unavailableComponents.push(product.title);
            }
          }
        } else {
          // Check product stock
          const stock = product.stockQuantity ?? 0;
          if (stock < requiredQty && !product.allowBackorders) {
            unavailableComponents.push(product.title);
          }
        }
      }
    }

    if (unavailableComponents.length > 0 && !bundle.allowPartialStock) {
      return {
        available: false,
        reason: `Out of stock: ${unavailableComponents.join(", ")}`,
        unavailableComponents,
      };
    }

    return { available: true };
  },
});

// ============================================
// PRODUCT-BUNDLE RELATIONSHIP QUERIES
// ============================================

/**
 * Check if a product is used as a component in any active bundle.
 *
 * Used by the product editor to:
 * - Show a notice: "This product is a component of bundle X. Edit bundle settings there."
 * - Prevent trashing/archiving a product that is in an active bundle.
 *
 * TODO (FIX 7): When the product editor page is built, use this query to display
 * a bundle-backed product notice and disable destructive status changes.
 */
export const getBundlesForProduct = query({
  args: { productId: v.id("commerce_products") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);

    const components = await ctx.db
      .query("commerce_bundle_components")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .collect();

    if (components.length === 0) return [];

    // Resolve bundle details for each component
    const bundleIds = [...new Set(components.map((c: any) => c.bundleId))];
    const bundles = await Promise.all(
      bundleIds.map(async (id: any) => {
        const bundle = await ctx.db.get(id);
        if (!bundle) return null;
        return {
          _id: bundle._id,
          name: bundle.name,
          slug: bundle.slug,
          status: bundle.status,
        };
      }),
    );

    return bundles.filter(Boolean);
  },
});

// ============================================
// HEALTH & METRICS QUERIES
// ============================================

/**
 * Get bundle system health stats (admin only).
 *
 * Returns:
 *   total          — all bundles
 *   active         — bundles with status "active"
 *   draft          — bundles with status "draft"
 *   archived       — bundles with status "archived"
 *   unlinked       — bundles missing a productId (need backfill, if productId is adopted)
 *   draftsBlocked  — draft bundles that cannot publish because they have zero components
 */
export const getStats = query({
  args: {},
  handler: async (ctx: any) => {
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const bundles = await ctx.db.query("commerce_bundles").collect();
    const active = bundles.filter((b: any) => b.status === "active");
    const draft = bundles.filter((b: any) => b.status === "draft");
    const archived = bundles.filter((b: any) => b.status === "archived");

    // Count bundles missing productId (need backfill if productId linkage is adopted)
    const unlinked = bundles.filter((b: any) => !b.productId);

    // Count drafts that can't publish (no components)
    const components = await ctx.db
      .query("commerce_bundle_components")
      .collect();
    const draftsBlocked = draft.filter((b: any) => {
      const bComponents = components.filter(
        (c: any) => c.bundleId === b._id,
      );
      return bComponents.length === 0;
    });

    return {
      total: bundles.length,
      active: active.length,
      draft: draft.length,
      archived: archived.length,
      unlinked: unlinked.length,
      draftsBlocked: draftsBlocked.length,
    };
  },
});

// ============================================
// INVENTORY ALERTS
// ============================================

/**
 * Get bundles with low stock (admin).
 *
 * Returns bundles where trackInventory is enabled and stockCount is
 * at or below the given threshold. Used by the inventory dashboard
 * to surface bundle-level stock warnings alongside product-level ones.
 */
export const getLowStock = query({
  args: { threshold: v.optional(v.number()) },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const threshold = args.threshold ?? 5;
    const bundles = await ctx.db.query("commerce_bundles").collect();

    return bundles
      .filter(
        (b: any) =>
          b.trackInventory &&
          typeof b.stockCount === "number" &&
          b.stockCount <= threshold &&
          b.status === "active",
      )
      .map((b: any) => ({
        _id: b._id,
        name: b.name,
        slug: b.slug,
        stockCount: b.stockCount,
        status: b.status,
      }));
  },
});

// ============================================
// CART QUERIES
// ============================================

/**
 * Get selections for a cart item
 */
export const getSelectionByCartItem = query({
  args: { cartItemId: v.id("commerce_cart_items") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceBundlesEnabled(ctx);

    return await ctx.db
      .query("commerce_bundle_selections")
      .withIndex("by_cart_item", (q: any) =>
        q.eq("cartItemId", args.cartItemId),
      )
      .unique();
  },
});
