import { defineTable } from "convex/server";
import { v } from "convex/values";

export const commerceReviewStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("spam"),
  v.literal("deleted"),
);

export const commerceReviewsTables = {
  commerce_review_ratings: defineTable({
    productId:v.id("commerce_products"),phase:v.union(v.literal("pending"),v.literal("scanning"),v.literal("ready")),
    generation:v.number(),counts:v.array(v.number()),updatedAt:v.number(),
    frontierTime:v.union(v.number(),v.null()),frontierId:v.union(v.string(),v.null()),
    horizonTime:v.union(v.number(),v.null()),horizonId:v.union(v.string(),v.null()),
  }).index("by_product",["productId"]).index("by_phase_updated",["phase","updatedAt"]),
  commerce_review_items: defineTable({
    productId: v.id("commerce_products"),
    userId: v.id("users"),
    orderId: v.optional(v.id("commerce_orders")),
    rating: v.number(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    status: commerceReviewStatusValidator,
    isVerifiedPurchase: v.boolean(),
    helpfulCount: v.number(),
    rejectionReason: v.optional(v.string()),
    moderatedBy: v.optional(v.id("users")),
    moderatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_product_status", ["productId", "status"])
    .index("by_product_status_created", ["productId", "status", "createdAt"])
    .index("by_product_status_rating", ["productId", "status", "rating"])
    .index("by_product_status_helpful", ["productId", "status", "helpfulCount"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_product_user", ["productId", "userId"]),

  commerce_review_helpful_votes: defineTable({
    reviewId: v.id("commerce_review_items"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_review", ["reviewId"])
    .index("by_review_user", ["reviewId", "userId"])
    .index("by_user", ["userId"]),
};
