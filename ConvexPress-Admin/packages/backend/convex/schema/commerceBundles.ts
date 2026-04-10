import { defineTable } from "convex/server";
import { v } from "convex/values";

export const commerceBundleStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived"),
);

export const commerceBundleTypeValidator = v.union(
  v.literal("fixed"),
  v.literal("mix_and_match"),
  v.literal("bogo"),
);

export const commerceBundlePricingTypeValidator = v.union(
  v.literal("fixed"),
  v.literal("percent_off"),
  v.literal("amount_off"),
  v.literal("component_sum"),
);

export const commerceBundlesTables = {
  /**
   * commerce_bundles — bundle definitions
   *
   * Ported from VexCart product_bundles. Each record describes a purchasable
   * bundle offer: its type, pricing strategy, inventory policy, SEO metadata,
   * and current computed prices.
   */
  commerce_bundles: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    images: v.array(v.string()),

    // Bundle behaviour
    bundleType: commerceBundleTypeValidator,
    minItems: v.optional(v.number()),
    maxItems: v.optional(v.number()),

    // Pricing strategy
    pricingType: commerceBundlePricingTypeValidator,
    fixedPrice: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    discountAmount: v.optional(v.number()),

    // Computed totals (kept in sync by recalculateBundlePrice)
    regularPrice: v.optional(v.number()),
    bundlePrice: v.optional(v.number()),

    // Inventory
    stockCount: v.optional(v.number()),
    trackInventory: v.optional(v.boolean()),
    allowPartialStock: v.optional(v.boolean()),

    // Taxonomy & SEO
    categoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
    tags: v.optional(v.array(v.string())),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),

    // Lifecycle
    status: commerceBundleStatusValidator,
    purchaseCount: v.number(),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  /**
   * commerce_bundle_components — items that make up a bundle
   *
   * Ported from VexCart bundle_components. Each row links one product
   * (optionally a specific variant) into a parent bundle with quantity,
   * pricing override / discount, and ordering metadata.
   */
  commerce_bundle_components: defineTable({
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
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_bundle", ["bundleId"])
    .index("by_product", ["productId"]),

  /**
   * commerce_bundle_selections — customer's chosen components for
   * configurable / mix-and-match bundles
   *
   * Ported from VexCart bundle_selections. Captures the exact component
   * choices a shopper made, linked to a cart item, together with the
   * resolved total price at the time of selection.
   */
  commerce_bundle_selections: defineTable({
    bundleId: v.id("commerce_bundles"),
    cartItemId: v.optional(v.id("commerce_cart_items")),
    orderItemId: v.optional(v.id("commerce_order_items")),
    selections: v.array(
      v.object({
        componentId: v.id("commerce_bundle_components"),
        productId: v.id("commerce_products"),
        variantId: v.optional(v.id("commerce_product_variants")),
        quantity: v.number(),
        unitPrice: v.optional(v.number()),
      }),
    ),
    totalPrice: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_bundle", ["bundleId"])
    .index("by_cart_item", ["cartItemId"])
    .index("by_order_item", ["orderItemId"]),
};
