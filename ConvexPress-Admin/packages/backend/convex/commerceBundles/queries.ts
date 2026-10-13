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
import type { RegisteredQuery } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { BundleSelectionInput } from "./runtime";
type AdminBundle = Doc<"commerce_bundles"> & { componentCount: number };
type AdminComponent = Doc<"commerce_bundle_components"> & { product: Doc<"commerce_products"> | null; variant: Doc<"commerce_product_variants"> | null };
type BundleStatus = Doc<"commerce_bundles">["status"];
type PriceArgs = { bundleId: Id<"commerce_bundles">; selections?: Omit<BundleSelectionInput, "productId">[]; refreshAt?: number };

import { RequestReadLedger } from "../helpers/requestReadLedger";
import { readPublicBundle, type PublicBundle, type PublicBundlePrice } from "./publicBundle";
import { assertCartAccess, getCurrentShopper } from "../commerce/shopperAccess";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceBundlesEnabled } from "./helpers";
import {
  commerceBundleStatusValidator,
  commerceBundlePricingTypeValidator,
  commerceBundleTypeValidator,
} from "../schema/commerceBundles";
import { isPluginEnabled } from "../helpers/plugins";

import { commerceDocs } from "../schema/commerce.docs.generated";
import { commerceBundlesDocs } from "../schema/commerceBundles.docs.generated";
// ============================================
// ADMIN QUERIES
// ============================================

/**
 * List all bundles with optional filtering
 */
export const list: RegisteredQuery<"public", { status?: BundleStatus; limit?: number }, AdminBundle[] | null> = query({
  args: {
    status: v.optional(commerceBundleStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.union(v.null(), v.array(v.object({
    componentCount: v.number(),
    _id: v.id("commerce_bundles"),
    _creationTime: v.number(),
    description: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    categoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
    discountAmount: v.optional(v.number()),
    productId: v.optional(v.id("commerce_products")),
    trackInventory: v.optional(v.boolean()),
    shortDescription: v.optional(v.string()),
    minItems: v.optional(v.number()),
    maxItems: v.optional(v.number()),
    fixedPrice: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    regularPrice: v.optional(v.number()),
    bundlePrice: v.optional(v.number()),
    stockCount: v.optional(v.number()),
    allowPartialStock: v.optional(v.boolean()),
    name: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    slug: v.string(),
    bundleType: v.union(v.literal("fixed"), v.literal("mix_and_match"), v.literal("bogo")),
    pricingType: v.union(v.literal("fixed"), v.literal("percent_off"), v.literal("amount_off"), v.literal("component_sum")),
    images: v.array(v.string()),
    purchaseCount: v.number(),
  }))),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceBundles"))) return null;
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "commerce.bundles.view");

    const status = args.status;
    const bundlesQuery = status
      ? ctx.db
          .query("commerce_bundles")
          .withIndex("by_status", (q) => q.eq("status", status))
      : ctx.db.query("commerce_bundles");

    const bundles = await bundlesQuery.order("desc").collect();

    // Apply limit
    const limited = args.limit ? bundles.slice(0, args.limit) : bundles;

    // Enrich with component count
    const enriched = await Promise.all(
      limited.map(async (bundle) => {
        const components = await ctx.db
          .query("commerce_bundle_components")
          .withIndex("by_bundle", (q) => q.eq("bundleId", bundle._id))
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
export const get: RegisteredQuery<"public", { id: Id<"commerce_bundles"> }, Doc<"commerce_bundles"> | null> = query({
  args: { id: v.id("commerce_bundles") },
  returns: v.union(v.null(), commerceBundlesDocs.commerce_bundles),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceBundles"))) return null;
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "commerce.bundles.view");

    return await ctx.db.get(args.id);
  },
});

/**
 * Get bundle components (enriched with product & variant data)
 */
export const getComponents: RegisteredQuery<"public", { bundleId: Id<"commerce_bundles"> }, AdminComponent[] | null> = query({
  args: { bundleId: v.id("commerce_bundles") },
  returns: v.union(v.null(), v.array(v.object({
    product: v.union(v.null(), commerceDocs.commerce_products),
    variant: v.union(v.null(), commerceDocs.commerce_product_variants),
    _id: v.id("commerce_bundle_components"),
    _creationTime: v.number(),
    label: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    variantId: v.optional(v.id("commerce_product_variants")),
    minQuantity: v.optional(v.number()),
    maxQuantity: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    priceOverride: v.optional(v.number()),
    allowVariantChange: v.optional(v.boolean()),
    updatedAt: v.number(),
    createdAt: v.number(),
    sortOrder: v.number(),
    quantity: v.number(),
    productId: v.id("commerce_products"),
    bundleId: v.id("commerce_bundles"),
    isRequired: v.boolean(),
  }))),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceBundles"))) return null;
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "commerce.bundles.view");

    const components = await ctx.db
      .query("commerce_bundle_components")
      .withIndex("by_bundle", (q) => q.eq("bundleId", args.bundleId))
      .collect();

    // Enrich with product data
    const enriched = await Promise.all(
      components.map(async (comp) => {
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
      .filter((c) => c.product)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

// ============================================
// PUBLIC / STOREFRONT QUERIES
// ============================================

/**
 * List active bundles for storefront
 */
export const listActive: RegisteredQuery<"public", { limit?: number; categoryId?: Id<"commerce_product_categories"> }, PublicBundle[]> = query({
  args: { limit: v.optional(v.number()), categoryId: v.optional(v.id("commerce_product_categories")) },
  returns: v.array(v.object({
    _id: v.id("commerce_bundles"),
    productId: v.id("commerce_products"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    images: v.array(v.string()),
    bundleType: v.union(v.literal("fixed"), v.literal("mix_and_match"), v.literal("bogo")),
    pricingType: v.union(v.literal("fixed"), v.literal("percent_off"), v.literal("amount_off"), v.literal("component_sum")),
    fixedPrice: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    regularPrice: v.optional(v.number()),
    bundlePrice: v.optional(v.number()),
    minItems: v.optional(v.number()),
    maxItems: v.optional(v.number()),
    status: v.literal("active"),
    currencyCode: v.string(),
    components: v.array(v.object({
      _id: v.id("commerce_bundle_components"),
      productId: v.id("commerce_products"),
      variantId: v.optional(v.id("commerce_product_variants")),
      quantity: v.number(),
      minQuantity: v.optional(v.number()),
      maxQuantity: v.optional(v.number()),
      isRequired: v.boolean(),
      isDefault: v.boolean(),
      allowVariantChange: v.boolean(),
      label: v.optional(v.string()),
      sortOrder: v.number(),
      priceOverride: v.optional(v.number()),
      discountPercent: v.optional(v.number()),
      product: v.object({
        _id: v.id("commerce_products"),
        title: v.string(),
        slug: v.string(),
        basePrice: v.object({ amount: v.number(), currencyCode: v.string() }),
      }),
      variant: v.optional(v.object({
        _id: v.id("commerce_product_variants"),
        title: v.string(),
        name: v.string(),
        price: v.object({ amount: v.number(), currencyCode: v.string() }),
        unitPriceAmount: v.number(),
        available: v.boolean(),
      })),
      variants: v.array(v.object({
        _id: v.id("commerce_product_variants"),
        title: v.string(),
        name: v.string(),
        price: v.object({ amount: v.number(), currencyCode: v.string() }),
        unitPriceAmount: v.number(),
        available: v.boolean(),
      })),
      unitPriceAmount: v.number(),
    })),
    quote: v.union(v.null(), v.object({
      regularPrice: v.number(),
      bundlePrice: v.number(),
      savings: v.number(),
      savingsPercent: v.number(),
      currencyCode: v.string(),
      available: v.boolean(),
      selections: v.array(v.object({
        componentId: v.id("commerce_bundle_components"),
        productId: v.optional(v.id("commerce_products")),
        variantId: v.optional(v.id("commerce_product_variants")),
        quantity: v.number(),
      })),
      pricedAt: v.number(),
      recheckAt: v.union(v.null(), v.number()),
    })),
    pricedAt: v.number(),
    recheckAt: v.union(v.null(), v.number()),
  })),
  handler: async (ctx, args): Promise<PublicBundle[]> => {
    const limit = args.limit ?? 24;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ConvexError({ code: "VALIDATION_ERROR", message: "Choose between 1 and 100 bundles." });
    const budget = new RequestReadLedger(), result: PublicBundle[] = [];
    budget.beforeRead();
    const plugins = budget.record(await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique());
    if (!plugins?.values?.commerceEnabled || !plugins.values.commerceBundlesEnabled) return [];
    if (args.categoryId) {
      budget.beforeRead(); const category = budget.record(await ctx.db.get(args.categoryId));
      if (!category || category.isVisible === false) return [];
    }
    let cursor: string | null = null;
    while (result.length < limit) {
      budget.beforeRead();
      const page = await ctx.db.query("commerce_bundles").withIndex("by_status", q => q.eq("status", "active")).paginate({ cursor, numItems: Math.min(16, limit - result.length) });
      for (const bundle of page.page) budget.record(bundle);
      for (const bundle of page.page) {
        if (args.categoryId && !bundle.categoryIds?.includes(args.categoryId)) continue;
        const value = await readPublicBundle(ctx, bundle, { budget });
        if (value) result.push(value);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    return result;
  },
});

export const getBySlug: RegisteredQuery<"public", { slug: string }, PublicBundle | null> = query({
  args: { slug: v.string() },
  returns: v.union(v.null(), v.object({
    _id: v.id("commerce_bundles"),
    productId: v.id("commerce_products"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    images: v.array(v.string()),
    bundleType: v.union(v.literal("fixed"), v.literal("mix_and_match"), v.literal("bogo")),
    pricingType: v.union(v.literal("fixed"), v.literal("percent_off"), v.literal("amount_off"), v.literal("component_sum")),
    fixedPrice: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    regularPrice: v.optional(v.number()),
    bundlePrice: v.optional(v.number()),
    minItems: v.optional(v.number()),
    maxItems: v.optional(v.number()),
    status: v.literal("active"),
    currencyCode: v.string(),
    components: v.array(v.object({
      _id: v.id("commerce_bundle_components"),
      productId: v.id("commerce_products"),
      variantId: v.optional(v.id("commerce_product_variants")),
      quantity: v.number(),
      minQuantity: v.optional(v.number()),
      maxQuantity: v.optional(v.number()),
      isRequired: v.boolean(),
      isDefault: v.boolean(),
      allowVariantChange: v.boolean(),
      label: v.optional(v.string()),
      sortOrder: v.number(),
      priceOverride: v.optional(v.number()),
      discountPercent: v.optional(v.number()),
      product: v.object({
        _id: v.id("commerce_products"),
        title: v.string(),
        slug: v.string(),
        basePrice: v.object({ amount: v.number(), currencyCode: v.string() }),
      }),
      variant: v.optional(v.object({
        _id: v.id("commerce_product_variants"),
        title: v.string(),
        name: v.string(),
        price: v.object({ amount: v.number(), currencyCode: v.string() }),
        unitPriceAmount: v.number(),
        available: v.boolean(),
      })),
      variants: v.array(v.object({
        _id: v.id("commerce_product_variants"),
        title: v.string(),
        name: v.string(),
        price: v.object({ amount: v.number(), currencyCode: v.string() }),
        unitPriceAmount: v.number(),
        available: v.boolean(),
      })),
      unitPriceAmount: v.number(),
    })),
    quote: v.union(v.null(), v.object({
      regularPrice: v.number(),
      bundlePrice: v.number(),
      savings: v.number(),
      savingsPercent: v.number(),
      currencyCode: v.string(),
      available: v.boolean(),
      selections: v.array(v.object({
        componentId: v.id("commerce_bundle_components"),
        productId: v.optional(v.id("commerce_products")),
        variantId: v.optional(v.id("commerce_product_variants")),
        quantity: v.number(),
      })),
      pricedAt: v.number(),
      recheckAt: v.union(v.null(), v.number()),
    })),
    pricedAt: v.number(),
    recheckAt: v.union(v.null(), v.number()),
  })),
  handler: async (ctx, args): Promise<PublicBundle | null> => {
    if (args.slug.length > 256) return null;
    const budget = new RequestReadLedger(); budget.beforeRead();
    const bundle = budget.record(await ctx.db.query("commerce_bundles").withIndex("by_slug", q => q.eq("slug", args.slug)).unique());
    return readPublicBundle(ctx, bundle, { budget });
  },
});

const selectionsValidator = v.optional(v.array(v.object({
  componentId: v.id("commerce_bundle_components"), quantity: v.number(), variantId: v.optional(v.id("commerce_product_variants")),
})));
export const calculatePrice: RegisteredQuery<"public", PriceArgs, PublicBundlePrice | null> = query({
  // refreshAt changes the subscription cache key at a scheduled price boundary;
  // it never supplies the authority's pricing time.
  args: { bundleId: v.id("commerce_bundles"), selections: selectionsValidator, refreshAt: v.optional(v.number()) },
  returns: v.union(v.null(), v.object({
    regularPrice: v.number(),
    bundlePrice: v.number(),
    savings: v.number(),
    savingsPercent: v.number(),
    currencyCode: v.string(),
    available: v.boolean(),
    selections: v.array(v.object({
      componentId: v.id("commerce_bundle_components"),
      productId: v.optional(v.id("commerce_products")),
      variantId: v.optional(v.id("commerce_product_variants")),
      quantity: v.number(),
    })),
    pricedAt: v.number(),
    recheckAt: v.union(v.null(), v.number()),
  })),
  handler: async (ctx, args): Promise<PublicBundlePrice | null> => {
    const budget = new RequestReadLedger(); budget.beforeRead();
    const bundle = budget.record(await ctx.db.get(args.bundleId));
    const result = await readPublicBundle(ctx, bundle, { budget, selections: args.selections });
    return result?.quote ?? null;
  },
});

export const checkAvailability: RegisteredQuery<"public", PriceArgs & { quantity?: number }, { available: boolean; reason?: string }> = query({
  args: { bundleId: v.id("commerce_bundles"), quantity: v.optional(v.number()), selections: selectionsValidator, refreshAt: v.optional(v.number()) },
  returns: v.object({ available: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ available: boolean; reason?: string }> => {
    const budget = new RequestReadLedger(); budget.beforeRead();
    const bundle = budget.record(await ctx.db.get(args.bundleId));
    const result = await readPublicBundle(ctx, bundle, { budget, selections: args.selections, quantity: args.quantity });
    return result?.quote?.available ? { available: true } : { available: false, reason: "This bundle configuration is unavailable." };
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
export const getBundlesForProduct: RegisteredQuery<"public", { productId: Id<"commerce_products"> }, { _id: Id<"commerce_bundles">; name: string; slug: string; status: BundleStatus }[] | null> = query({
  args: { productId: v.id("commerce_products") },
  returns: v.union(v.null(), v.array(v.union(v.null(), v.object({
    _id: v.id("commerce_bundles"),
    name: v.string(),
    slug: v.string(),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
  })))),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceBundles"))) return null;
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "commerce.bundles.view");

    const components = await ctx.db
      .query("commerce_bundle_components")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    if (components.length === 0) return [];

    // Resolve bundle details for each component
    const bundleIds = [...new Set(components.map((c) => c.bundleId))];
    const bundles = await Promise.all(
      bundleIds.map(async (id) => {
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
export const getStats: RegisteredQuery<"public", {}, { total: number; active: number; draft: number; archived: number; unlinked: number; draftsBlocked: number }> = query({
  args: {},
  returns: v.object({
    total: v.number(),
    active: v.number(),
    draft: v.number(),
    archived: v.number(),
    unlinked: v.number(),
    draftsBlocked: v.number(),
  }),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceBundles"))) return { total: 0, active: 0, draft: 0, archived: 0, unlinked: 0, draftsBlocked: 0 };
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const bundles = await ctx.db.query("commerce_bundles").collect();
    const active = bundles.filter((b) => b.status === "active");
    const draft = bundles.filter((b) => b.status === "draft");
    const archived = bundles.filter((b) => b.status === "archived");

    // Count bundles missing productId (need backfill if productId linkage is adopted)
    const unlinked = bundles.filter((b) => !b.productId);

    // Count drafts that can't publish (no components)
    const components = await ctx.db
      .query("commerce_bundle_components")
      .collect();
    const draftsBlocked = draft.filter((b) => {
      const bComponents = components.filter(
        (c) => c.bundleId === b._id,
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
export const getLowStock: RegisteredQuery<"public", { threshold?: number }, { _id: Id<"commerce_bundles">; name: string; slug: string; stockCount?: number; status: BundleStatus }[] | null> = query({
  args: { threshold: v.optional(v.number()) },
  returns: v.union(v.null(), v.array(v.object({
    _id: v.id("commerce_bundles"),
    name: v.string(),
    slug: v.string(),
    stockCount: v.optional(v.number()),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
  }))),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceBundles"))) return null;
    await requireCommerceBundlesEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const threshold = args.threshold ?? 5;
    const bundles = await ctx.db.query("commerce_bundles").collect();

    return bundles
      .filter(
        (b) =>
          b.trackInventory &&
          typeof b.stockCount === "number" &&
          b.stockCount <= threshold &&
          b.status === "active",
      )
      .map((b) => ({
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
export const getSelectionByCartItem: RegisteredQuery<"public", { cartItemId: Id<"commerce_cart_items">; sessionToken?: string }, Doc<"commerce_bundle_selections"> | null> = query({
  args: { cartItemId: v.id("commerce_cart_items"), sessionToken: v.optional(v.string()) },
  returns: v.union(v.null(), commerceBundlesDocs.commerce_bundle_selections),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceBundles"))) return null;
    await requireCommerceBundlesEnabled(ctx);
    const item = await ctx.db.get(args.cartItemId);
    const cart = item ? await ctx.db.get(item.cartId) : null;
    if (!item || !cart) return null;
    const user = await getCurrentShopper(ctx);
    assertCartAccess(cart, args.sessionToken, user?._id);


    return await ctx.db
      .query("commerce_bundle_selections")
      .withIndex("by_cart_item", (q) =>
        q.eq("cartItemId", args.cartItemId),
      )
      .unique();
  },
});
