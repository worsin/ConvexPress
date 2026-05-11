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
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
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
