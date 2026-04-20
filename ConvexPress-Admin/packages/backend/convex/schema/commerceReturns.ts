import { defineTable } from "convex/server";
import { v } from "convex/values";

export const commerceReturnStatusValidator = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("received"),
  v.literal("refund_pending"),
  v.literal("refunded"),
  v.literal("completed"),
);

export const commerceReturnsTables = {
  commerce_return_requests: defineTable({
    returnNumber: v.string(),
    orderId: v.id("commerce_orders"),
    userId: v.optional(v.id("users")),
    status: commerceReturnStatusValidator,
    reason: v.string(),
    reasonDetails: v.optional(v.string()),
    items: v.array(
      v.object({
        orderItemId: v.id("commerce_order_items"),
        quantity: v.number(),
        reason: v.optional(v.string()),
      }),
    ),
    refundAmount: v.optional(v.number()),
    refundMethod: v.optional(v.string()),
    notes: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    returnShippingLabel: v.optional(v.string()),
    processedBy: v.optional(v.id("users")),
    refundPendingAt: v.optional(v.number()),
    refundedAt: v.optional(v.number()),
    refundFailureReason: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_return_number", ["returnNumber"])
    .index("by_order", ["orderId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  commerce_return_items: defineTable({
    returnRequestId: v.id("commerce_return_requests"),
    orderItemId: v.id("commerce_order_items"),
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    quantityRequested: v.number(),
    quantityApproved: v.optional(v.number()),
    quantityReceived: v.optional(v.number()),
    quantityRestocked: v.optional(v.number()),
    reasonCode: v.optional(v.string()),
    reasonText: v.optional(v.string()),
    conditionCode: v.optional(v.string()),
    resolutionType: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_return_request", ["returnRequestId"])
    .index("by_product", ["productId"]),

  commerce_return_labels: defineTable({
    returnRequestId: v.id("commerce_return_requests"),
    carrier: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    labelUrl: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_return_request", ["returnRequestId"]),

  commerce_return_history: defineTable({
    returnRequestId: v.id("commerce_return_requests"),
    actorUserId: v.optional(v.id("users")),
    actorType: v.optional(v.string()),
    eventType: v.string(),
    fromStatus: v.optional(v.string()),
    toStatus: v.optional(v.string()),
    note: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_return_request", ["returnRequestId"]),
};
