import { defineTable } from "convex/server";
import { v } from "convex/values";

export const commerceWishlistsTables = {
  commerce_wishlist_owner_totals: defineTable({
    ownerId:v.id("users"),phase:v.union(v.literal("pending"),v.literal("scanning"),v.literal("ready")),
    generation:v.number(),totalLists:v.number(),totalItems:v.number(),pendingCounts:v.number(),updatedAt:v.number(),
    frontierTime:v.union(v.number(),v.null()),frontierId:v.union(v.string(),v.null()),
    horizonTime:v.union(v.number(),v.null()),horizonId:v.union(v.string(),v.null()),
  }).index("by_owner",["ownerId"]).index("by_phase_updated",["phase","updatedAt"]),
  commerce_wishlist_counts: defineTable({
    ownerId:v.optional(v.id("users")),listCreatedAt:v.optional(v.number()),
    wishlistId:v.id("commerce_wishlists"),
    phase:v.union(v.literal("pending"),v.literal("scanning"),v.literal("ready")),
    generation:v.number(),count:v.number(),updatedAt:v.number(),
    frontierTime:v.union(v.number(),v.null()),frontierId:v.union(v.string(),v.null()),
    horizonTime:v.union(v.number(),v.null()),horizonId:v.union(v.string(),v.null()),
  }).index("by_wishlist",["wishlistId"]).index("by_phase_updated",["phase","updatedAt"]),
  // Short-lived deletion receipts keep cleanup resumable after the list itself
  // is removed. Completed receipts are retained for safe acknowledgement replay.
  commerce_wishlist_deletions: defineTable({
    wishlistId: v.id("commerce_wishlists"),
    requestedBy: v.id("users"),
    generation: v.number(),
    state: v.union(v.literal("pending"), v.literal("complete"), v.literal("blocked")),
    deletedItems: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_wishlist", ["wishlistId"])
    .index("by_state_updated_at", ["state", "updatedAt"]),
  commerce_wishlists: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    isDefault: v.boolean(),
    itemCountReady: v.optional(v.boolean()),
    isPublic: v.boolean(),
    shareToken: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_item_count_ready", ["itemCountReady"])
    .index("by_share_token", ["shareToken"]),

  commerce_wishlist_items: defineTable({
    wishlistId: v.id("commerce_wishlists"),
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    notes: v.optional(v.string()),
    addedAt: v.number(),
  })
    .index("by_wishlist", ["wishlistId"])
    .index("by_product", ["productId"])
    .index("by_added_at", ["addedAt"])
    .index("by_wishlist_product_variant", ["wishlistId", "productId", "variantId"]),
};
