import { defineTable } from "convex/server";
import { v } from "convex/values";

export const commerceWishlistsTables = {
  commerce_wishlists: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    isDefault: v.boolean(),
    isPublic: v.boolean(),
    shareToken: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_share_token", ["shareToken"]),

  commerce_wishlist_items: defineTable({
    wishlistId: v.id("commerce_wishlists"),
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    notes: v.optional(v.string()),
    addedAt: v.number(),
  })
    .index("by_wishlist", ["wishlistId"])
    .index("by_product", ["productId"]),
};
