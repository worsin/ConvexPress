import { defineTable } from "convex/server";
import { v } from "convex/values";

export const commerceSubscriptionStatusValidator = v.union(
  v.literal("draft"),
  v.literal("trialing"),
  v.literal("active"),
  v.literal("past_due"),
  v.literal("paused"),
  v.literal("pending_cancel"),
  v.literal("cancelled"),
  v.literal("expired"),
);

export const commerceSubscriptionInvoiceStatusValidator = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("paid"),
  v.literal("failed"),
  v.literal("void"),
);

export const commerceSubscriptionEntitlementStatusValidator = v.union(
  v.literal("active"),
  v.literal("grace"),
  v.literal("revoked"),
  v.literal("expired"),
);

export const commerceSubscriptionSourceChannelValidator = v.union(
  v.literal("cart"),
  v.literal("direct_form"),
  v.literal("admin"),
  v.literal("api"),
);

export const commerceSubscriptionOfferStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived"),
);

export const commerceSubscriptionOfferSourceTypeValidator = v.union(
  v.literal("product"),
  v.literal("variant"),
  v.literal("bundle"),
  v.literal("custom"),
);

export const commerceSubscriptionOrderFormStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived"),
);

export const commerceSubscriptionSelectionModeValidator = v.union(
  v.literal("single_offer"),
  v.literal("multiple_offers"),
);

export const commerceSubscriptionAccountModeValidator = v.union(
  v.literal("require_login"),
  v.literal("allow_guest_create_account"),
  v.literal("guest_allowed"),
);

export const commerceSubscriptionPaymentModeValidator = v.union(
  v.literal("pay_now"),
  v.literal("trial_with_payment_method"),
  v.literal("no_payment_required"),
  v.literal("admin_approval"),
);

export const commerceSubscriptionFormSubmissionStatusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("payment_pending"),
  v.literal("approval_pending"),
  v.literal("approved"),
  v.literal("activated"),
  v.literal("rejected"),
  v.literal("expired"),
);

export const commerceSubscriptionCheckoutIntentStatusValidator = v.union(
  v.literal("draft"),
  v.literal("payment_pending"),
  v.literal("payment_succeeded"),
  v.literal("approval_pending"),
  v.literal("activated"),
  v.literal("failed"),
  v.literal("expired"),
);

export const commerceSubscriptionItemStatusValidator = v.union(
  v.literal("active"),
  v.literal("pending_cancel"),
  v.literal("cancelled"),
  v.literal("expired"),
);

export const commerceSubscriptionOfferItemTypeValidator = v.union(
  v.literal("product"),
  v.literal("variant"),
  v.literal("bundle_component"),
  v.literal("service"),
  v.literal("entitlement"),
);

export const commerceSubscriptionTables = {
  commerce_subscription_templates: defineTable({
    title: v.string(),
    slug: v.string(),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    billingInterval: v.union(
      v.literal("week"),
      v.literal("month"),
      v.literal("year"),
    ),
    billingIntervalCount: v.number(),
    trialDays: v.optional(v.number()),
    gracePeriodDays: v.optional(v.number()),
    pausable: v.boolean(),
    cancelAtPeriodEndDefault: v.boolean(),
    dunningPolicyCode: v.optional(v.string()),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  commerce_subscription_offers: defineTable({
    title: v.string(),
    slug: v.string(),
    status: commerceSubscriptionOfferStatusValidator,
    templateId: v.id("commerce_subscription_templates"),
    description: v.optional(v.string()),
    publicSummary: v.optional(v.string()),
    sourceType: commerceSubscriptionOfferSourceTypeValidator,
    productId: v.optional(v.id("commerce_products")),
    variantId: v.optional(v.id("commerce_product_variants")),
    bundleId: v.optional(v.id("commerce_bundles")),
    availableInCart: v.boolean(),
    availableInDirectForms: v.boolean(),
    availableForAdminProvisioning: v.boolean(),
    createNewSubscription: v.boolean(),
    allowAddToExistingSubscription: v.boolean(),
    currencyCode: v.string(),
    recurringAmount: v.number(),
    setupFeeAmount: v.optional(v.number()),
    trialDaysOverride: v.optional(v.number()),
    minimumQuantity: v.optional(v.number()),
    maximumQuantity: v.optional(v.number()),
    entitlementCodes: v.optional(v.array(v.string())),
    features: v.optional(
      v.array(
        v.object({
          text: v.string(),
          highlighted: v.optional(v.boolean()),
          icon: v.optional(v.string()),
        }),
      ),
    ),
    pricingCardVisible: v.optional(v.boolean()),
    excludedPlanFeatureIds: v.optional(
      v.array(v.id("membership_plan_benefits")),
    ),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_template", ["templateId"])
    .index("by_product", ["productId"])
    .index("by_variant", ["variantId"])
    .index("by_bundle", ["bundleId"])
    .index("by_cart_availability", ["availableInCart", "status"])
    .index("by_form_availability", ["availableInDirectForms", "status"])
    .index("by_admin_availability", [
      "availableForAdminProvisioning",
      "status",
    ]),

  commerce_subscription_offer_items: defineTable({
    offerId: v.id("commerce_subscription_offers"),
    itemType: commerceSubscriptionOfferItemTypeValidator,
    productId: v.optional(v.id("commerce_products")),
    variantId: v.optional(v.id("commerce_product_variants")),
    bundleId: v.optional(v.id("commerce_bundles")),
    title: v.string(),
    quantity: v.number(),
    recurringAmount: v.number(),
    setupFeeAmount: v.optional(v.number()),
    entitlementCodes: v.optional(v.array(v.string())),
    sortOrder: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_offer", ["offerId"])
    .index("by_product", ["productId"])
    .index("by_variant", ["variantId"])
    .index("by_bundle", ["bundleId"]),

  commerce_subscription_order_forms: defineTable({
    title: v.string(),
    slug: v.string(),
    status: commerceSubscriptionOrderFormStatusValidator,
    selectionMode: commerceSubscriptionSelectionModeValidator,
    offerIds: v.array(v.id("commerce_subscription_offers")),
    fieldSchema: v.optional(v.any()),
    accountMode: commerceSubscriptionAccountModeValidator,
    paymentMode: commerceSubscriptionPaymentModeValidator,
    successRedirectUrl: v.optional(v.string()),
    successMessage: v.optional(v.string()),
    allowedDiscountCodes: v.optional(v.array(v.string())),
    rateLimitKey: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  commerce_subscription_form_submissions: defineTable({
    formId: v.id("commerce_subscription_order_forms"),
    status: commerceSubscriptionFormSubmissionStatusValidator,
    userId: v.optional(v.id("users")),
    customerId: v.optional(v.id("commerce_customer_profiles")),
    email: v.optional(v.string()),
    selectedOfferIds: v.array(v.id("commerce_subscription_offers")),
    fieldValues: v.optional(v.any()),
    checkoutIntentId: v.optional(
      v.id("commerce_subscription_checkout_intents"),
    ),
    subscriptionId: v.optional(v.id("commerce_subscriptions")),
    ipHash: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_form", ["formId"])
    .index("by_status", ["status"])
    .index("by_user", ["userId"])
    .index("by_customer", ["customerId"])
    .index("by_checkout_intent", ["checkoutIntentId"])
    .index("by_subscription", ["subscriptionId"]),

  commerce_subscription_checkout_intents: defineTable({
    sourceChannel: commerceSubscriptionSourceChannelValidator,
    status: commerceSubscriptionCheckoutIntentStatusValidator,
    userId: v.optional(v.id("users")),
    customerId: v.optional(v.id("commerce_customer_profiles")),
    email: v.optional(v.string()),
    orderId: v.optional(v.id("commerce_orders")),
    orderItemIds: v.optional(v.array(v.id("commerce_order_items"))),
    formId: v.optional(v.id("commerce_subscription_order_forms")),
    formSubmissionId: v.optional(
      v.id("commerce_subscription_form_submissions"),
    ),
    selectedOfferIds: v.array(v.id("commerce_subscription_offers")),
    pricingSnapshot: v.optional(v.any()),
    initialAmount: v.number(),
    recurringAmount: v.number(),
    setupFeeAmount: v.number(),
    currencyCode: v.string(),
    paymentProvider: v.optional(v.string()),
    paymentTransactionId: v.optional(v.string()),
    savedPaymentMethodId: v.optional(v.string()),
    subscriptionId: v.optional(v.id("commerce_subscriptions")),
    idempotencyKey: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_source_channel", ["sourceChannel"])
    .index("by_user", ["userId"])
    .index("by_customer", ["customerId"])
    .index("by_order", ["orderId"])
    .index("by_form", ["formId"])
    .index("by_form_submission", ["formSubmissionId"])
    .index("by_subscription", ["subscriptionId"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_expiresAt", ["expiresAt"]),

  commerce_product_subscription_overrides: defineTable({
    productId: v.id("commerce_products"),
    templateId: v.optional(v.id("commerce_subscription_templates")),
    offerId: v.optional(v.id("commerce_subscription_offers")),
    isSubscriptionEnabled: v.boolean(),
    allowOneTimePurchase: v.boolean(),
    overridePriceAmount: v.optional(v.number()),
    overrideCurrencyCode: v.optional(v.string()),
    overrideBillingInterval: v.optional(
      v.union(v.literal("week"), v.literal("month"), v.literal("year")),
    ),
    overrideBillingIntervalCount: v.optional(v.number()),
    overrideTrialDays: v.optional(v.number()),
    overrideGracePeriodDays: v.optional(v.number()),
    overridePausable: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_offer", ["offerId"]),

  commerce_subscriptions: defineTable({
    subscriptionNumber: v.optional(v.string()),
    customerId: v.optional(v.id("commerce_customer_profiles")),
    userId: v.optional(v.id("users")),
    sourceChannel: v.optional(commerceSubscriptionSourceChannelValidator),
    sourceCheckoutIntentId: v.optional(
      v.id("commerce_subscription_checkout_intents"),
    ),
    sourceOrderId: v.optional(v.id("commerce_orders")),
    sourceFormSubmissionId: v.optional(
      v.id("commerce_subscription_form_submissions"),
    ),
    productId: v.optional(v.id("commerce_products")),
    orderId: v.optional(v.id("commerce_orders")),
    orderItemId: v.optional(v.id("commerce_order_items")),
    templateId: v.optional(v.id("commerce_subscription_templates")),
    templateVersion: v.optional(v.number()),
    status: commerceSubscriptionStatusValidator,
    currencyCode: v.string(),
    recurringAmount: v.number(),
    setupFeeAmount: v.optional(v.number()),
    billingInterval: v.optional(
      v.union(v.literal("week"), v.literal("month"), v.literal("year")),
    ),
    billingIntervalCount: v.optional(v.number()),
    nextBillingAt: v.optional(v.number()),
    currentPeriodStartAt: v.optional(v.number()),
    currentPeriodEndAt: v.optional(v.number()),
    trialEndsAt: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    cancelScheduledAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    pausedAt: v.optional(v.number()),
    gracePeriodEndsAt: v.optional(v.number()),
    defaultPaymentMethodId: v.optional(v.string()),
    paymentProvider: v.optional(v.string()),
    paymentTransactionId: v.optional(v.string()),
    lastInvoiceId: v.optional(v.id("commerce_subscription_invoices")),
    manualBilling: v.optional(v.boolean()),
    pricingSnapshot: v.optional(v.any()),
    sourceMetadata: v.optional(v.any()),
    offerHistory: v.optional(
      v.array(
        v.object({
          offerId: v.id("commerce_subscription_offers"),
          effectiveAt: v.number(),
          reason: v.string(),
        }),
      ),
    ),
    scheduledOfferChange: v.optional(
      v.object({
        toOfferId: v.id("commerce_subscription_offers"),
        effectiveAt: v.number(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subscription_number", ["subscriptionNumber"])
    .index("by_customer", ["customerId"])
    .index("by_user", ["userId"])
    .index("by_source_channel", ["sourceChannel"])
    .index("by_checkout_intent", ["sourceCheckoutIntentId"])
    .index("by_source_order", ["sourceOrderId"])
    .index("by_form_submission", ["sourceFormSubmissionId"])
    .index("by_status", ["status"])
    .index("by_nextBillingAt", ["nextBillingAt"])
    .index("by_default_payment_method", ["defaultPaymentMethodId"]),

  commerce_subscription_items: defineTable({
    subscriptionId: v.id("commerce_subscriptions"),
    sourceOfferId: v.optional(v.id("commerce_subscription_offers")),
    sourceOfferItemId: v.optional(v.id("commerce_subscription_offer_items")),
    productId: v.optional(v.id("commerce_products")),
    variantId: v.optional(v.id("commerce_product_variants")),
    bundleId: v.optional(v.id("commerce_bundles")),
    titleSnapshot: v.optional(v.string()),
    quantity: v.number(),
    unitAmount: v.number(),
    unitRecurringAmount: v.optional(v.number()),
    unitSetupFeeAmount: v.optional(v.number()),
    currencyCode: v.string(),
    status: v.optional(commerceSubscriptionItemStatusValidator),
    startsAt: v.optional(v.number()),
    currentPeriodEndAt: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    cancelledAt: v.optional(v.number()),
    entitlementCodes: v.optional(v.array(v.string())),
    priceSnapshot: v.optional(v.any()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subscription", ["subscriptionId"])
    .index("by_source_offer", ["sourceOfferId"])
    .index("by_product", ["productId"])
    .index("by_variant", ["variantId"])
    .index("by_bundle", ["bundleId"])
    .index("by_status", ["status"]),

  commerce_subscription_invoices: defineTable({
    subscriptionId: v.id("commerce_subscriptions"),
    checkoutIntentId: v.optional(v.id("commerce_subscription_checkout_intents")),
    sourceChannel: v.optional(commerceSubscriptionSourceChannelValidator),
    status: commerceSubscriptionInvoiceStatusValidator,
    currencyCode: v.string(),
    subtotalAmount: v.number(),
    taxAmount: v.number(),
    totalAmount: v.number(),
    paymentProvider: v.optional(v.string()),
    paymentTransactionId: v.optional(v.string()),
    savedPaymentMethodId: v.optional(v.string()),
    manualBilling: v.optional(v.boolean()),
    dueAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    prorationEventId: v.optional(
      v.id("commerce_subscription_proration_events"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subscription", ["subscriptionId"])
    .index("by_checkout_intent", ["checkoutIntentId"])
    .index("by_source_channel", ["sourceChannel"])
    .index("by_status", ["status"]),

  commerce_subscription_invoice_items: defineTable({
    invoiceId: v.id("commerce_subscription_invoices"),
    subscriptionItemId: v.optional(v.id("commerce_subscription_items")),
    description: v.string(),
    quantity: v.number(),
    unitAmount: v.number(),
    lineType: v.optional(v.string()),
    currencyCode: v.optional(v.string()),
    lineTotalAmount: v.number(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_invoice", ["invoiceId"]),

  commerce_subscription_history: defineTable({
    subscriptionId: v.id("commerce_subscriptions"),
    eventType: v.string(),
    message: v.string(),
    actorUserId: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_subscription", ["subscriptionId"]),

  commerce_subscription_entitlements: defineTable({
    subscriptionId: v.id("commerce_subscriptions"),
    userId: v.optional(v.id("users")),
    entitlementCode: v.string(),
    status: commerceSubscriptionEntitlementStatusValidator,
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    graceEndsAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subscription", ["subscriptionId"])
    .index("by_user_status", ["userId", "status"]),

  commerce_subscription_dunning_attempts: defineTable({
    subscriptionId: v.id("commerce_subscriptions"),
    invoiceId: v.optional(v.id("commerce_subscription_invoices")),
    attemptNumber: v.number(),
    status: v.union(
      v.literal("scheduled"),
      v.literal("processing"),
      v.literal("failed"),
      v.literal("succeeded"),
      v.literal("aborted"),
    ),
    scheduledAt: v.number(),
    processedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subscription", ["subscriptionId"])
    .index("by_status", ["status"]),

  commerce_subscription_idempotency_keys: defineTable({
    scope: v.string(),
    key: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    payloadHash: v.optional(v.string()),
    resultRef: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scope_key", ["scope", "key"])
    .index("by_status", ["status"]),

  commerce_subscription_coupons: defineTable({
    code: v.string(),
    discountType: v.union(v.literal("percent"), v.literal("fixed")),
    amount: v.number(),
    duration: v.union(
      v.literal("once"),
      v.literal("forever"),
      v.literal("n_months"),
    ),
    durationMonths: v.optional(v.number()),
    maxRedemptions: v.optional(v.number()),
    perCustomerLimit: v.optional(v.number()),
    offerIds: v.optional(v.array(v.id("commerce_subscription_offers"))),
    startsAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("archived"),
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"]),

  commerce_subscription_coupon_redemptions: defineTable({
    contractId: v.id("commerce_subscriptions"),
    couponId: v.id("commerce_subscription_coupons"),
    customerId: v.id("users"),
    redeemedAt: v.number(),
    remainingApplications: v.number(),
  })
    .index("by_contract", ["contractId"])
    .index("by_coupon", ["couponId"])
    .index("by_customer_and_coupon", ["customerId", "couponId"]),

  commerce_subscription_proration_events: defineTable({
    contractId: v.id("commerce_subscriptions"),
    fromOfferId: v.id("commerce_subscription_offers"),
    toOfferId: v.id("commerce_subscription_offers"),
    daysRemaining: v.number(),
    daysInCycle: v.number(),
    unusedOldAmount: v.number(),
    proratedNewAmount: v.number(),
    netCharge: v.number(),
    invoiceId: v.optional(v.id("commerce_subscription_invoices")),
    triggeredBy: v.id("users"),
    triggeredAt: v.number(),
  })
    .index("by_contract", ["contractId"])
    .index("by_invoice", ["invoiceId"]),

  commerce_subscription_pricing_card_config: defineTable({
    singletonKey: v.string(),
    orderedOfferIds: v.array(v.id("commerce_subscription_offers")),
    headline: v.optional(v.string()),
    subheadline: v.optional(v.string()),
    featuredOfferId: v.optional(v.id("commerce_subscription_offers")),
    templateKey: v.string(),
    updatedAt: v.number(),
    updatedBy: v.id("users"),
  }).index("by_singleton", ["singletonKey"]),
};
