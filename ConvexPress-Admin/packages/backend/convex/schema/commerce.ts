import { defineTable } from "convex/server";
import { v } from "convex/values";

export const commerceProductStatusValidator = v.union(
  v.literal("draft"),
  v.literal("publish"),
  v.literal("private"),
  v.literal("trash"),
);

export const commerceProductTypeValidator = v.union(
  v.literal("simple"),
  v.literal("variable"),
  v.literal("external"),
);

export const commerceCartStatusValidator = v.union(
  v.literal("active"),
  v.literal("pending_payment"),
  v.literal("abandoned"),
  v.literal("converted"),
);

export const commerceCheckoutStatusValidator = v.union(
  v.literal("draft"),
  v.literal("collecting_shipping"),
  v.literal("collecting_payment"),
  v.literal("ready_for_review"),
  v.literal("payment_pending"),
  v.literal("completed"),
  v.literal("abandoned"),
  v.literal("failed"),
);

export const commerceOrderStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("paid"),
  v.literal("fulfilled"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("refunded"),
  v.literal("failed"),
);

export const commerceShipmentStatusValidator = v.union(
  v.literal("label_created"),
  v.literal("shipped"),
  v.literal("delivered"),
  v.literal("returned"),
);

export const commerceAddressValidator = v.object({
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  company: v.optional(v.string()),
  line1: v.string(),
  line2: v.optional(v.string()),
  city: v.string(),
  state: v.optional(v.string()),
  postalCode: v.string(),
  countryCode: v.string(),
  phone: v.optional(v.string()),
});

export const commerceMoneyValidator = v.object({
  amount: v.number(),
  currencyCode: v.string(),
});

export const commerceTables = {
  commerce_product_categories: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    parentId: v.optional(v.id("commerce_product_categories")),
    depth: v.optional(v.number()),
    path: v.optional(v.array(v.id("commerce_product_categories"))),
    thumbnailMediaId: v.optional(v.id("media")),
    icon: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    productCount: v.number(),
    totalProductCount: v.optional(v.number()),
    isVisible: v.optional(v.boolean()),
    isFeatured: v.optional(v.boolean()),
    showInNav: v.optional(v.boolean()),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_parent", ["parentId"])
    .index("by_parent_sort", ["parentId", "sortOrder"])
    .index("by_visible", ["isVisible"])
    .index("by_featured", ["isFeatured"])
    .index("by_nav", ["showInNav"]),

  commerce_products: defineTable({
    title: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    status: commerceProductStatusValidator,
    productType: commerceProductTypeValidator,
    sku: v.optional(v.string()),
    authorId: v.id("users"),
    featuredMediaId: v.optional(v.id("media")),
    galleryMediaIds: v.array(v.id("media")),
    categoryIds: v.array(v.id("commerce_product_categories")),
    basePrice: commerceMoneyValidator,
    salePrice: v.optional(commerceMoneyValidator),
    trackInventory: v.boolean(),
    stockQuantity: v.optional(v.number()),
    allowBackorders: v.boolean(),
    isVirtual: v.boolean(),
    shippingWeightOz: v.optional(v.number()),
    // Shipping dimensions (inches)
    shippingLengthIn: v.optional(v.number()),
    shippingWidthIn: v.optional(v.number()),
    shippingHeightIn: v.optional(v.number()),
    // Scheduled sale window
    salePriceFrom: v.optional(v.number()),
    salePriceTo: v.optional(v.number()),
    // Cross-selling
    upsellProductIds: v.optional(v.array(v.id("commerce_products"))),
    crossSellProductIds: v.optional(v.array(v.id("commerce_products"))),
    // Preserved source metadata for fields we don't have dedicated columns for
    rawSourceMeta: v.optional(v.string()),
    isDownloadable: v.boolean(),
    requiresLicense: v.optional(v.boolean()),
    digitalDeliveryMode: v.optional(
      v.union(
        v.literal("download"),
        v.literal("license"),
        v.literal("download_and_license"),
      ),
    ),
    downloadLimit: v.optional(v.number()),
    downloadExpiryDays: v.optional(v.number()),
    licenseKeyType: v.optional(
      v.union(
        v.literal("single"),
        v.literal("multi"),
        v.literal("unlimited"),
        v.literal("subscription"),
      ),
    ),
    maxActivations: v.optional(v.number()),
    licenseExpiresAfterDays: v.optional(v.number()),
    isNonReturnable: v.optional(v.boolean()),
    taxClass: v.optional(v.string()),
    isTaxable: v.optional(v.boolean()),
    optionTypes: v.optional(v.any()),
    productAttributes: v.optional(v.any()),
    defaultAttributes: v.optional(v.any()),
    // Shipping class (PRD A2). undefined = no class (method default rate).
    shippingClassId: v.optional(v.id("commerce_shipping_classes")),
    // PRD A3 per-product package overrides.
    preferredPackageId: v.optional(v.id("commerce_shipping_packages")),
    shipsInOwnBox: v.optional(v.boolean()),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_sku", ["sku"])
    .index("by_status", ["status"])
    .index("by_author", ["authorId"])
    .index("by_shipping_class", ["shippingClassId"])
    .searchIndex("search_commerce_products", {
      searchField: "title",
      filterFields: ["status", "authorId"],
    }),

  commerce_product_variants: defineTable({
    productId: v.id("commerce_products"),
    title: v.string(),
    sku: v.optional(v.string()),
    globalUniqueId: v.optional(v.string()),
    optionSummary: v.string(),
    selections: v.optional(
      v.array(
        v.object({
          optionTypeId: v.string(),
          optionTypeName: v.string(),
          optionValueId: v.string(),
          optionValueLabel: v.string(),
          sortOrder: v.number(),
        }),
      ),
    ),
    selectionKey: v.optional(v.string()),
    description: v.optional(v.string()),
    price: commerceMoneyValidator,
    salePrice: v.optional(commerceMoneyValidator),
    salePriceFrom: v.optional(v.number()),
    salePriceTo: v.optional(v.number()),
    manageStock: v.optional(
      v.union(v.literal("yes"), v.literal("no"), v.literal("parent")),
    ),
    stockQuantity: v.optional(v.number()),
    stockStatus: v.optional(
      v.union(
        v.literal("instock"),
        v.literal("outofstock"),
        v.literal("onbackorder"),
      ),
    ),
    backorders: v.optional(
      v.union(v.literal("yes"), v.literal("no"), v.literal("notify")),
    ),
    lowStockAmount: v.optional(v.number()),
    weight: v.optional(v.string()),
    shippingLengthIn: v.optional(v.string()),
    shippingWidthIn: v.optional(v.string()),
    shippingHeightIn: v.optional(v.string()),
    taxClass: v.optional(v.string()),
    isTaxable: v.optional(v.boolean()),
    isVirtual: v.optional(v.boolean()),
    isDownloadable: v.optional(v.boolean()),
    requiresLicense: v.optional(v.boolean()),
    digitalDeliveryMode: v.optional(
      v.union(
        v.literal("download"),
        v.literal("license"),
        v.literal("download_and_license"),
      ),
    ),
    downloadLimit: v.optional(v.number()),
    downloadExpiry: v.optional(v.number()),
    downloadExpiryDays: v.optional(v.number()),
    licenseKeyType: v.optional(
      v.union(
        v.literal("single"),
        v.literal("multi"),
        v.literal("unlimited"),
        v.literal("subscription"),
      ),
    ),
    maxActivations: v.optional(v.number()),
    licenseExpiresAfterDays: v.optional(v.number()),
    featuredMediaId: v.optional(v.id("media")),
    galleryMediaIds: v.optional(v.array(v.id("media"))),
    status: v.optional(
      v.union(v.literal("publish"), v.literal("private"), v.literal("draft")),
    ),
    menuOrder: v.optional(v.number()),
    isDefault: v.boolean(),
    // Shipping class (PRD A2). undefined = inherit from parent product.
    // Distinct from product.shippingClassId (undefined = no class on product).
    shippingClassId: v.optional(v.id("commerce_shipping_classes")),
    // Explicit-null marker for "this variant has NO class" (overrides parent).
    // Convex optional fields can't distinguish absent vs null, so we use a
    // sibling boolean flag. When true, shippingClassId is ignored and the
    // variant resolves to "no class" regardless of parent.
    shippingClassOverrideNone: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_product_default", ["productId", "isDefault"])
    .index("by_product_selection_key", ["productId", "selectionKey"])
    .index("by_sku", ["sku"])
    .index("by_product_status", ["productId", "status"])
    .index("by_product_menu_order", ["productId", "menuOrder"])
    .index("by_shipping_class", ["shippingClassId"]),

  commerce_carts: defineTable({
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    status: commerceCartStatusValidator,
    currencyCode: v.string(),
    appliedDiscountCode: v.optional(v.string()),
    appliedDiscountDescription: v.optional(v.string()),
    subtotalAmount: v.number(),
    discountAmount: v.number(),
    shippingAmount: v.number(),
    taxAmount: v.number(),
    totalAmount: v.number(),
    itemCount: v.number(),
    lastActiveAt: v.number(),
    abandonedAt: v.optional(v.number()),
    abandonedEmailSentAt: v.optional(v.number()),
    recoveredAt: v.optional(v.number()),
    convertedAt: v.optional(v.number()),
    orderId: v.optional(v.id("commerce_orders")),
    mergedIntoCartId: v.optional(v.id("commerce_carts")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_session", ["sessionToken"])
    .index("by_status", ["status"])
    .index("by_status_lastActiveAt", ["status", "lastActiveAt"]),

  commerce_cart_items: defineTable({
    cartId: v.id("commerce_carts"),
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    quantity: v.number(),
    unitPriceAmount: v.number(),
    lineTotalAmount: v.number(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_cart", ["cartId"])
    .index("by_cart_product", ["cartId", "productId"]),

  commerce_checkout_sessions: defineTable({
    cartId: v.id("commerce_carts"),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    status: commerceCheckoutStatusValidator,
    currencyCode: v.string(),
    email: v.optional(v.string()),
    shippingAddress: v.optional(commerceAddressValidator),
    billingAddress: v.optional(commerceAddressValidator),
    selectedShippingMethodCode: v.optional(v.string()),
    selectedShippingMethodLabel: v.optional(v.string()),
    selectedPaymentMethodCode: v.optional(v.string()),
    selectedPaymentMethodLabel: v.optional(v.string()),
    appliedDiscountCode: v.optional(v.string()),
    appliedDiscountDescription: v.optional(v.string()),
    notes: v.optional(v.string()),
    subtotalAmount: v.number(),
    discountAmount: v.number(),
    shippingAmount: v.number(),
    taxAmount: v.number(),
    totalAmount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_cart", ["cartId"])
    .index("by_session", ["sessionToken"])
    .index("by_user", ["userId"]),

  commerce_customer_profiles: defineTable({
    userId: v.optional(v.id("users")),
    email: v.string(),
    phone: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    isGuest: v.optional(v.boolean()),
    defaultBillingAddressId: v.optional(v.id("commerce_customer_addresses")),
    defaultShippingAddressId: v.optional(v.id("commerce_customer_addresses")),
    totalOrders: v.number(),
    totalSpentAmount: v.number(),
    currencyCode: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_email", ["email"])
    .index("by_createdAt", ["createdAt"])
    .index("by_totalSpent", ["totalSpentAmount"])
    .index("by_totalOrders", ["totalOrders"])
    .searchIndex("search_customers", {
      searchField: "email",
      filterFields: ["isGuest"],
    }),

  commerce_customer_addresses: defineTable({
    customerId: v.id("commerce_customer_profiles"),
    label: v.string(),
    addressType: v.union(v.literal("billing"), v.literal("shipping")),
    isDefault: v.boolean(),
    address: commerceAddressValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_customer", ["customerId"])
    .index("by_customer_default", ["customerId", "isDefault"]),

  commerce_orders: defineTable({
    orderNumber: v.string(),
    trackingToken: v.string(),
    customerId: v.optional(v.id("commerce_customer_profiles")),
    userId: v.optional(v.id("users")),
    checkoutSessionId: v.optional(v.id("commerce_checkout_sessions")),
    status: commerceOrderStatusValidator,
    currencyCode: v.string(),
    email: v.string(),
    billingAddress: commerceAddressValidator,
    shippingAddress: v.optional(commerceAddressValidator),
    shippingProvider: v.optional(v.string()),
    shippingCarrierCode: v.optional(v.string()),
    shippingCarrierName: v.optional(v.string()),
    shippingServiceCode: v.optional(v.string()),
    shippingServiceName: v.optional(v.string()),
    shippingQuoteRaw: v.optional(v.any()),
    // PRD A5 §4.3 — address validation snapshot at order-finalize.
    shippingAddressValidatedAt: v.optional(v.number()),
    shippingAddressValidationProvider: v.optional(v.string()),
    shippingAddressValidationStatus: v.optional(v.string()),
    shippingAddressValidationFingerprint: v.optional(v.string()),
    shippingAddressIsResidential: v.optional(v.boolean()),
    shippingAddressNormalized: v.optional(v.any()),
    // PRD D1 §6.10 — rate reconfirmation fingerprints snapshot at order-finalize.
    // Label purchase compares these to the current address+cart fingerprints
    // and throws STALE_SHIPPING_RATE on mismatch.
    shippingQuoteAddressKey: v.optional(v.string()),
    shippingQuoteCartKey: v.optional(v.string()),
    shippingQuoteExpiresAt: v.optional(v.number()),
    shippingQuoteProvider: v.optional(v.string()),
    shippingQuoteAccountId: v.optional(v.string()),
    // PRD §79 — full selected-quote provenance snapshot at finalize.
    shippingQuoteProof: v.optional(
      v.object({
        quoteKey: v.optional(v.string()),
        amount: v.optional(v.number()),
        currency: v.optional(v.string()),
        provider: v.optional(v.string()),
        carrierCode: v.optional(v.string()),
        serviceCode: v.optional(v.string()),
        accountId: v.optional(v.string()),
        packages: v.optional(v.any()),
        fingerprintAddressKey: v.optional(v.string()),
        fingerprintCartKey: v.optional(v.string()),
        expiresAt: v.optional(v.number()),
        origin: v.optional(v.any()),
        rateSource: v.optional(v.string()),
        snapshotAt: v.optional(v.number()),
      }),
    ),
    // PRD A4 — origin snapshot at order finalize for label routing + audit.
    shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
    selectedShippingMethodCode: v.optional(v.string()),
    selectedShippingMethodLabel: v.optional(v.string()),
    selectedPaymentMethodCode: v.optional(v.string()),
    selectedPaymentMethodLabel: v.optional(v.string()),
    appliedDiscountCode: v.optional(v.string()),
    appliedDiscountDescription: v.optional(v.string()),
    subtotalAmount: v.number(),
    discountAmount: v.number(),
    shippingAmount: v.number(),
    taxAmount: v.number(),
    totalAmount: v.number(),
    paymentStatus: v.string(),
    fulfillmentStatus: v.string(),
    digitalFulfillmentStatus: v.optional(
      v.union(
        v.literal("not_required"),
        v.literal("pending"),
        v.literal("completed"),
        v.literal("partial"),
        v.literal("needs_review"),
        v.literal("failed"),
      ),
    ),
    digitalFulfilledAt: v.optional(v.number()),
    digitalFulfillmentError: v.optional(v.string()),
    inventoryCommittedAt: v.optional(v.number()),
    inventoryReleasedAt: v.optional(v.number()),
    discountUsageCountedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    paidAt: v.optional(v.number()),
  })
    .index("by_orderNumber", ["orderNumber"])
    .index("by_trackingToken", ["trackingToken"])
    .index("by_customer", ["customerId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_email", ["email"])
    .searchIndex("search_orders", {
      searchField: "orderNumber",
      filterFields: ["status", "email"],
    }),

  commerce_order_items: defineTable({
    orderId: v.id("commerce_orders"),
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    productTitle: v.string(),
    sku: v.optional(v.string()),
    quantity: v.number(),
    unitPriceAmount: v.number(),
    lineSubtotalAmount: v.number(),
    lineTotalAmount: v.number(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_order", ["orderId"])
    .index("by_product", ["productId"]),

  commerce_order_history: defineTable({
    orderId: v.id("commerce_orders"),
    eventType: v.string(),
    message: v.string(),
    actorUserId: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_order", ["orderId"]),

  commerce_shipments: defineTable({
    orderId: v.id("commerce_orders"),
    shipmentNumber: v.string(),
    status: commerceShipmentStatusValidator,
    provider: v.optional(v.string()),
    carrier: v.optional(v.string()),
    carrierCode: v.optional(v.string()),
    serviceCode: v.optional(v.string()),
    serviceName: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    trackingUrl: v.optional(v.string()),
    trackingStatus: v.optional(v.string()),
    externalShipmentId: v.optional(v.string()),
    externalLabelId: v.optional(v.string()),
    externalManifestId: v.optional(v.string()),
    labelUrl: v.optional(v.string()),
    labelFormat: v.optional(v.string()),
    labelPurchasedAt: v.optional(v.number()),
    voidedAt: v.optional(v.number()),
    // PRD A4 — which ship-from location fulfilled this shipment. Required
    // for D3 manifest routing (each manifest is per-location).
    shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
    items: v.array(
      v.object({
        orderItemId: v.id("commerce_order_items"),
        quantity: v.number(),
      }),
    ),
    note: v.optional(v.string()),
    shippedAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order", ["orderId"])
    .index("by_status", ["status"])
    .index("by_tracking", ["trackingNumber"])
    .index("by_ship_from_location", ["shipFromLocationId"]),

  commerce_discount_codes: defineTable({
    code: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    discountType: v.union(
      v.literal("fixed_cart"),
      v.literal("percent"),
      v.literal("fixed_product"),
      v.literal("free_shipping"),
    ),
    amount: v.number(),
    minimumSubtotalAmount: v.optional(v.number()),
    maximumSubtotalAmount: v.optional(v.number()),
    minimumQuantity: v.optional(v.number()),
    applicability: v.optional(
      v.union(v.literal("cart"), v.literal("matching_items")),
    ),
    productIds: v.optional(v.array(v.id("commerce_products"))),
    categoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
    excludedProductIds: v.optional(v.array(v.id("commerce_products"))),
    excludedCategoryIds: v.optional(
      v.array(v.id("commerce_product_categories")),
    ),
    allowedEmails: v.optional(v.array(v.string())),
    newCustomersOnly: v.optional(v.boolean()),
    individualUse: v.optional(v.boolean()),
    excludeSaleItems: v.optional(v.boolean()),
    perUserUsageLimit: v.optional(v.number()),
    appliesTo: v.optional(
      v.union(
        v.literal("initial"),
        v.literal("recurring"),
        v.literal("both"),
      ),
    ),
    auto: v.optional(v.boolean()),
    autoConditions: v.optional(v.any()),
    stripeCouponId: v.optional(v.string()),
    stripePromotionCodeId: v.optional(v.string()),
    tiers: v.optional(
      v.array(
        v.object({
          label: v.optional(v.string()),
          minQuantity: v.optional(v.number()),
          minSubtotalAmount: v.optional(v.number()),
          discountType: v.union(
            v.literal("fixed_cart"),
            v.literal("percent"),
            v.literal("fixed_product"),
          ),
          amount: v.number(),
        }),
      ),
    ),
    maxDiscountAmount: v.optional(v.number()),
    usageCount: v.number(),
    usageLimit: v.optional(v.number()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    rawSourceMeta: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"])
    .index("by_auto", ["auto"])
    .index("by_stripe_coupon", ["stripeCouponId"])
    .index("by_updatedAt", ["updatedAt"])
    .searchIndex("search_discount_codes", {
      searchField: "code",
      filterFields: ["status", "discountType"],
    }),

  // Wave 11.2: per-usage history for reporting + perUserUsageLimit enforcement.
  commerce_discount_usages: defineTable({
    discountId: v.id("commerce_discount_codes"),
    userId: v.optional(v.id("users")),
    customerEmail: v.optional(v.string()),
    orderId: v.optional(v.id("commerce_orders")),
    subscriptionId: v.optional(v.id("commerce_subscriptions")),
    invoiceId: v.optional(v.id("commerce_subscription_invoices")),
    appliedAmount: v.number(),
    appliedAt: v.number(),
    context: v.union(
      v.literal("order"),
      v.literal("subscription_initial"),
      v.literal("subscription_renewal"),
    ),
    createdAt: v.number(),
  })
    .index("by_discount", ["discountId"])
    .index("by_user", ["userId"])
    .index("by_email", ["customerEmail"])
    .index("by_order", ["orderId"])
    .index("by_subscription", ["subscriptionId"])
    .index("by_applied_at", ["appliedAt"]),

  commerce_payment_transactions: defineTable({
    orderId: v.optional(v.id("commerce_orders")),
    checkoutSessionId: v.optional(v.id("commerce_checkout_sessions")),
    provider: v.string(),
    providerTransactionId: v.optional(v.string()),
    clientSecret: v.optional(v.string()),
    status: v.string(),
    amount: commerceMoneyValidator,
    refundedAmount: v.optional(v.number()),
    metadata: v.optional(v.any()),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order", ["orderId"])
    .index("by_checkout", ["checkoutSessionId"])
    .index("by_provider_status", ["provider", "status"])
    .index("by_provider_txn", ["provider", "providerTransactionId"]),

  commerce_payment_refunds: defineTable({
    orderId: v.id("commerce_orders"),
    transactionId: v.optional(v.id("commerce_payment_transactions")),
    returnId: v.optional(v.id("commerce_return_requests")),
    amount: commerceMoneyValidator,
    reason: v.optional(v.string()),
    status: v.string(),
    providerRefundId: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order", ["orderId"])
    .index("by_return", ["returnId"]),

  commerce_shipping_methods: defineTable({
    code: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    rateType: v.union(v.literal("flat"), v.literal("free"), v.literal("pickup")),
    baseAmount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"]),

  commerce_tax_rules: defineTable({
    name: v.string(),
    countryCode: v.string(),
    stateCode: v.optional(v.string()),
    postalCodePattern: v.optional(v.string()),
    taxClass: v.optional(v.string()),
    ratePercent: v.number(),
    priority: v.number(),
    isCompound: v.boolean(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_country", ["countryCode"])
    .index("by_active", ["isActive"])
    .index("by_tax_class", ["taxClass"]),

  // Wave 11.1: managed tax classes replace free-form strings.
  commerce_tax_classes: defineTable({
    code: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_default", ["isDefault"]),

  // Wave 11.1: per-jurisdiction tax breakdown on orders for compliance audits.
  commerce_order_tax_lines: defineTable({
    orderId: v.id("commerce_orders"),
    orderItemId: v.optional(v.id("commerce_order_items")),
    ruleId: v.optional(v.id("commerce_tax_rules")),
    taxClass: v.optional(v.string()),
    jurisdictionLabel: v.string(),
    taxableAmount: v.number(),
    ratePercent: v.number(),
    taxAmount: v.number(),
    provider: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_order", ["orderId"])
    .index("by_order_item", ["orderItemId"])
    .index("by_rule", ["ruleId"]),

  // Wave 11.1: rate-history audit log so retroactive order analysis stays correct.
  commerce_tax_rate_history: defineTable({
    ruleId: v.id("commerce_tax_rules"),
    changedBy: v.id("users"),
    changedAt: v.number(),
    before: v.any(),
    after: v.any(),
    reason: v.optional(v.string()),
  })
    .index("by_rule", ["ruleId"])
    .index("by_changed_at", ["changedAt"]),

  commerce_inventory_adjustments: defineTable({
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    orderId: v.optional(v.id("commerce_orders")),
    adjustmentType: v.string(),
    quantityDelta: v.number(),
    reason: v.optional(v.string()),
    actorUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_variant", ["variantId"])
    .index("by_type", ["adjustmentType"])
    .index("by_date", ["createdAt"]),

  commerce_low_stock_alerts: defineTable({
    productId: v.id("commerce_products"),
    stockQuantity: v.number(),
    threshold: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("acknowledged"),
      v.literal("resolved"),
    ),
    acknowledgedBy: v.optional(v.id("users")),
    acknowledgedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_product", ["productId"])
    .index("by_status", ["status"]),

  commerce_stock_reservations: defineTable({
    checkoutSessionId: v.id("commerce_checkout_sessions"),
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    quantity: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("released"),
      v.literal("converted"),
      v.literal("expired"),
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_checkout", ["checkoutSessionId"])
    .index("by_product_status", ["productId", "status"]),

  commerce_saved_payment_methods: defineTable({
    userId: v.id("users"),
    provider: v.string(),
    providerMethodId: v.string(),
    providerCustomerId: v.optional(v.string()),
    type: v.string(),
    brand: v.optional(v.string()),
    last4: v.string(),
    expiryMonth: v.optional(v.number()),
    expiryYear: v.optional(v.number()),
    isDefault: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_provider_method", ["providerMethodId"]),

  commerce_webhook_events: defineTable({
    provider: v.string(),
    eventType: v.string(),
    eventId: v.string(),
    payload: v.optional(v.any()),
    status: v.union(
      v.literal("received"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed"),
    ),
    errorMessage: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_provider_event", ["provider", "eventId"]),
};
