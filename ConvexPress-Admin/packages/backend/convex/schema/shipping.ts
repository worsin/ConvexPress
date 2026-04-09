import { defineTable } from "convex/server";
import { v } from "convex/values";

export const shippingProviderValidator = v.union(
  v.literal("shipstation"),
  v.literal("ups"),
  v.literal("usps"),
  v.literal("fedex"),
  v.literal("dhl"),
);

export const shippingConnectionStatusValidator = v.union(
  v.literal("disconnected"),
  v.literal("connected"),
  v.literal("degraded"),
  v.literal("error"),
);

export const shippingModeValidator = v.union(
  v.literal("sandbox"),
  v.literal("production"),
);

export const shippingServiceGroupValidator = v.union(
  v.literal("economy"),
  v.literal("standard"),
  v.literal("expedited"),
  v.literal("overnight"),
  v.literal("international"),
  v.literal("freight"),
  v.literal("return"),
);

export const shippingTables = {
  shipping_provider_connections: defineTable({
    provider: shippingProviderValidator,
    displayName: v.string(),
    status: shippingConnectionStatusValidator,
    enabled: v.boolean(),
    mode: shippingModeValidator,
    isPrimary: v.boolean(),
    rateShoppingEnabled: v.boolean(),
    rateShoppingPriority: v.number(),
    lastVerifiedAt: v.optional(v.number()),
    lastSyncAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    lastErrorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider", ["provider"])
    .index("by_status", ["status"])
    .index("by_primary", ["isPrimary"])
    .index("by_rate_priority", ["rateShoppingPriority"]),

  shipping_provider_secrets: defineTable({
    connectionId: v.id("shipping_provider_connections"),
    secretVersion: v.number(),
    encryptedPayload: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_connection", ["connectionId"]),

  shipping_provider_accounts: defineTable({
    connectionId: v.id("shipping_provider_connections"),
    provider: shippingProviderValidator,
    externalAccountId: v.string(),
    carrierCode: v.string(),
    carrierName: v.string(),
    nickname: v.optional(v.string()),
    status: v.string(),
    supportsRates: v.boolean(),
    supportsLabels: v.boolean(),
    supportsTracking: v.boolean(),
    supportsManifests: v.boolean(),
    supportsReturns: v.boolean(),
    rawCapabilities: v.optional(v.any()),
    lastSyncAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_connection", ["connectionId"])
    .index("by_provider", ["provider"])
    .index("by_external_account", ["provider", "externalAccountId"]),

  shipping_provider_services: defineTable({
    connectionId: v.id("shipping_provider_connections"),
    accountId: v.optional(v.id("shipping_provider_accounts")),
    carrierCode: v.string(),
    serviceCode: v.string(),
    serviceName: v.string(),
    serviceGroup: shippingServiceGroupValidator,
    isActive: v.boolean(),
    supportsDomestic: v.boolean(),
    supportsInternational: v.boolean(),
    rawMetadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_connection", ["connectionId"])
    .index("by_account", ["accountId"])
    .index("by_carrier_service", ["carrierCode", "serviceCode"]),

  commerce_shipping_profiles: defineTable({
    name: v.string(),
    shipFromAddress: v.any(),
    defaultPackageCode: v.optional(v.string()),
    weightUnit: v.string(),
    dimensionUnit: v.string(),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_default", ["isDefault"]),

  commerce_shipping_packages: defineTable({
    code: v.string(),
    label: v.string(),
    packageType: v.string(),
    weight: v.optional(v.number()),
    dimensions: v.optional(
      v.object({
        length: v.number(),
        width: v.number(),
        height: v.number(),
      }),
    ),
    carrierCode: v.optional(v.string()),
    provider: v.optional(shippingProviderValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_code", ["code"]),

  commerce_shipping_zones: defineTable({
    name: v.string(),
    countries: v.array(v.string()),
    states: v.array(v.string()),
    postalCodeRules: v.array(v.string()),
    enabled: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_sort", ["sortOrder"]),

  commerce_shipping_zone_methods: defineTable({
    zoneId: v.id("commerce_shipping_zones"),
    methodCode: v.string(),
    label: v.string(),
    methodType: v.union(
      v.literal("live_rate"),
      v.literal("flat_rate"),
      v.literal("free_shipping"),
      v.literal("local_pickup"),
    ),
    provider: v.optional(shippingProviderValidator),
    accountId: v.optional(v.id("shipping_provider_accounts")),
    serviceFilters: v.optional(v.any()),
    pricingRules: v.optional(v.any()),
    presentationRules: v.optional(v.any()),
    enabled: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_zone", ["zoneId"])
    .index("by_zone_sort", ["zoneId", "sortOrder"]),

  commerce_shipping_rate_quotes: defineTable({
    checkoutSessionId: v.id("commerce_checkout_sessions"),
    quoteKey: v.string(),
    provider: shippingProviderValidator,
    accountId: v.optional(v.id("shipping_provider_accounts")),
    carrierCode: v.string(),
    carrierName: v.string(),
    serviceCode: v.string(),
    serviceName: v.string(),
    amount: v.number(),
    currency: v.string(),
    estimatedDaysMin: v.optional(v.number()),
    estimatedDaysMax: v.optional(v.number()),
    deliveryDateEstimated: v.optional(v.number()),
    isCheapest: v.boolean(),
    isFastest: v.boolean(),
    isBestValue: v.boolean(),
    rawQuote: v.optional(v.any()),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_checkout", ["checkoutSessionId"])
    .index("by_quote_key", ["quoteKey"]),
};
