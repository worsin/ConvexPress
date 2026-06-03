import { defineTable } from "convex/server";
import { v } from "convex/values";

export const purchaseSourceTypeValidator = v.union(
  v.literal("storefront_order"),
  v.literal("form_order"),
  v.literal("subscription_signup"),
  v.literal("subscription_invoice"),
  v.literal("manual"),
  v.literal("api"),
);

export const purchaseOrderStatusValidator = v.union(
  v.literal("draft"),
  v.literal("pending"),
  v.literal("payment_pending"),
  v.literal("paid"),
  v.literal("payment_failed"),
  v.literal("partially_refunded"),
  v.literal("refunded"),
  v.literal("cancelled"),
  v.literal("fulfilled"),
);

export const purchasePaymentStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("requires_action"),
  v.literal("authorized"),
  v.literal("captured"),
  v.literal("paid"),
  v.literal("failed"),
  v.literal("cancelled"),
  v.literal("partially_refunded"),
  v.literal("refunded"),
);

export const purchaseRefundStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export const purchaseLineTypeValidator = v.union(
  v.literal("product"),
  v.literal("variant"),
  v.literal("bundle"),
  v.literal("course"),
  v.literal("form_choice"),
  v.literal("subscription"),
  v.literal("setup_fee"),
  v.literal("shipping"),
  v.literal("tax"),
  v.literal("discount"),
  v.literal("adjustment"),
  v.literal("custom"),
);

export const purchaseTables = {
  purchase_orders: defineTable({
    orderNumber: v.string(),
    sourceType: purchaseSourceTypeValidator,
    sourceId: v.string(),
    sourceLabel: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),

    commerceOrderId: v.optional(v.id("commerce_orders")),
    formId: v.optional(v.id("forms")),
    formSubmissionId: v.optional(v.id("form_submissions")),
    formOrderId: v.optional(v.id("form_orders")),
    subscriptionId: v.optional(v.id("commerce_subscriptions")),
    subscriptionCheckoutIntentId: v.optional(
      v.id("commerce_subscription_checkout_intents"),
    ),
    subscriptionInvoiceId: v.optional(
      v.id("commerce_subscription_invoices"),
    ),

    customerId: v.optional(v.id("commerce_customer_profiles")),
    userId: v.optional(v.id("users")),
    email: v.optional(v.string()),
    customerName: v.optional(v.string()),

    status: purchaseOrderStatusValidator,
    paymentStatus: purchasePaymentStatusValidator,
    fulfillmentStatus: v.optional(v.string()),

    currencyCode: v.string(),
    subtotalAmount: v.number(),
    discountAmount: v.number(),
    shippingAmount: v.number(),
    taxAmount: v.number(),
    totalAmount: v.number(),
    amountPaid: v.number(),
    amountRefunded: v.number(),

    placedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    refundedAt: v.optional(v.number()),

    // Source-specific snapshots stay here so the ledger can preserve details
    // without forcing storefront, Forms, and subscription schemas together.
    metadata: v.optional(v.any()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orderNumber", ["orderNumber"])
    .index("by_source", ["sourceType", "sourceId"])
    .index("by_source_type", ["sourceType", "createdAt"])
    .index("by_commerce_order", ["commerceOrderId"])
    .index("by_form_submission", ["formSubmissionId"])
    .index("by_form_order", ["formOrderId"])
    .index("by_subscription", ["subscriptionId"])
    .index("by_subscription_invoice", ["subscriptionInvoiceId"])
    .index("by_customer", ["customerId"])
    .index("by_user", ["userId"])
    .index("by_email", ["email"])
    .index("by_status", ["status", "createdAt"])
    .index("by_payment_status", ["paymentStatus", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .searchIndex("search_purchase_orders", {
      searchField: "orderNumber",
      filterFields: ["sourceType", "status", "paymentStatus", "email"],
    }),

  purchase_order_lines: defineTable({
    purchaseOrderId: v.id("purchase_orders"),
    sourceLineId: v.optional(v.string()),
    lineType: purchaseLineTypeValidator,
    title: v.string(),
    subtitle: v.optional(v.string()),
    sku: v.optional(v.string()),
    quantity: v.number(),
    unitAmount: v.number(),
    lineSubtotalAmount: v.number(),
    lineTotalAmount: v.number(),
    currencyCode: v.string(),
    productId: v.optional(v.id("commerce_products")),
    variantId: v.optional(v.id("commerce_product_variants")),
    courseId: v.optional(v.id("lms_courses")),
    formId: v.optional(v.id("forms")),
    formSubmissionId: v.optional(v.id("form_submissions")),
    subscriptionId: v.optional(v.id("commerce_subscriptions")),
    subscriptionInvoiceId: v.optional(
      v.id("commerce_subscription_invoices"),
    ),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_purchase_order", ["purchaseOrderId"])
    .index("by_product", ["productId"])
    .index("by_course", ["courseId"])
    .index("by_form_submission", ["formSubmissionId"])
    .index("by_subscription", ["subscriptionId"])
    .index("by_subscription_invoice", ["subscriptionInvoiceId"]),

  purchase_payments: defineTable({
    purchaseOrderId: v.id("purchase_orders"),
    provider: v.string(),
    providerTransactionId: v.optional(v.string()),
    providerSessionId: v.optional(v.string()),
    paymentIntentId: v.optional(v.string()),
    status: purchasePaymentStatusValidator,
    amount: v.number(),
    currencyCode: v.string(),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    rawStatus: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_purchase_order", ["purchaseOrderId"])
    .index("by_status", ["status", "createdAt"])
    .index("by_provider_txn", ["provider", "providerTransactionId"])
    .index("by_payment_intent", ["paymentIntentId"])
    .index("by_createdAt", ["createdAt"]),

  purchase_refunds: defineTable({
    purchaseOrderId: v.id("purchase_orders"),
    purchasePaymentId: v.optional(v.id("purchase_payments")),
    provider: v.string(),
    providerRefundId: v.optional(v.string()),
    status: purchaseRefundStatusValidator,
    amount: v.number(),
    currencyCode: v.string(),
    reason: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_purchase_order", ["purchaseOrderId"])
    .index("by_payment", ["purchasePaymentId"])
    .index("by_provider_refund", ["provider", "providerRefundId"])
    .index("by_status", ["status", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  purchase_order_events: defineTable({
    purchaseOrderId: v.id("purchase_orders"),
    eventType: v.string(),
    message: v.string(),
    actorUserId: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_purchase_order", ["purchaseOrderId"])
    .index("by_event_type", ["eventType", "createdAt"])
    .index("by_createdAt", ["createdAt"]),
};
