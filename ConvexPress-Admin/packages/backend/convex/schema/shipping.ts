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
    // Tier 1.2 — per-connection webhook signing secret. Replaces shared env var.
    webhookSecret: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider", ["provider"])
    .index("by_status", ["status"])
    .index("by_primary", ["isPrimary"])
    .index("by_rate_priority", ["rateShoppingPriority"]),

  // Tier 1.1 — Cross-invocation OAuth token cache. Keyed by provider+connection.
  // Replaces the in-process Map cache that was thrashing carrier rate limits.
  shipping_provider_oauth_tokens: defineTable({
    connectionId: v.id("shipping_provider_connections"),
    provider: shippingProviderValidator,
    accessToken: v.string(),
    expiresAt: v.number(),
    refreshedAt: v.number(),
  })
    .index("by_connection", ["connectionId"])
    .index("by_provider", ["provider"])
    .index("by_expires", ["expiresAt"]),

  // Tier 4.2 — Webhook replay protection.
  // Before recording a tracking event from a provider webhook, we check this
  // table for an existing row keyed by (provider, signatureHash). If present,
  // the delivery is a replay and we skip reprocessing. Rows expire 7 days
  // after receipt via the daily purge cron.
  shipping_webhook_deliveries: defineTable({
    provider: shippingProviderValidator,
    signatureHash: v.string(), // hex signature or content hash
    receivedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_provider_signature", ["provider", "signatureHash"])
    .index("by_expires", ["expiresAt"]),

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

  // PRD D1 Shipping Labels — per-package labels for multi-package shipments.
  commerce_shipment_labels: defineTable({
    shipmentId: v.id("commerce_shipments"),
    orderId: v.id("commerce_orders"),
    packageIndex: v.number(),
    packageTemplateId: v.optional(v.id("commerce_shipping_packages")),
    provider: v.string(),
    carrierCode: v.optional(v.string()),
    serviceCode: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    externalLabelId: v.optional(v.string()),
    labelFileStorageId: v.optional(v.id("_storage")),
    labelFormat: v.optional(v.string()),
    labelUrl: v.optional(v.string()),
    labelCost: v.number(),
    labelCurrency: v.string(),
    purchasedAt: v.number(),
    /** PRD D1 — caller-supplied idempotency key for retry safety. */
    idempotencyKey: v.optional(v.string()),
    /** Set when a merchant *requests* a void; separate from voidedAt which
     * only fires after the carrier confirms the void succeeded. */
    voidRequestedAt: v.optional(v.number()),
    voidedAt: v.optional(v.number()),
    voidedBy: v.optional(v.id("users")),
    refundStatus: v.optional(
      v.union(
        v.literal("none"),
        v.literal("pending"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    refundedAt: v.optional(v.number()),
    rawMetadata: v.optional(v.any()),
    /** PRD D1 §2 — reprint/print counters + audit trail. */
    printCount: v.optional(v.number()),
    lastPrintedAt: v.optional(v.number()),
    lastPrintedBy: v.optional(v.id("users")),
    /** Label retention policy — when expired the PDF is eligible for purge. */
    retentionExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_shipment", ["shipmentId"])
    .index("by_order", ["orderId"])
    .index("by_tracking", ["trackingNumber"])
    .index("by_external_label", ["externalLabelId"])
    .index("by_idempotency", ["orderId", "idempotencyKey"]),

  commerce_label_batch_jobs: defineTable({
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("partial"),
    ),
    orderIds: v.array(v.id("commerce_orders")),
    successCount: v.number(),
    failureCount: v.number(),
    errors: v.optional(
      v.array(
        v.object({
          orderId: v.id("commerce_orders"),
          message: v.string(),
        }),
      ),
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
  }).index("by_status", ["status"]),

  // PRD D2 Shipping Tracking — per-shipment tracking events timeline.
  commerce_shipment_tracking_events: defineTable({
    shipmentId: v.id("commerce_shipments"),
    labelId: v.optional(v.id("commerce_shipment_labels")),
    eventId: v.string(), // carrier's unique event identifier (for dedup)
    occurredAt: v.number(),
    normalizedStatus: v.union(
      v.literal("pending"),
      v.literal("picked_up"),
      v.literal("in_transit"),
      v.literal("out_for_delivery"),
      v.literal("delivered"),
      v.literal("exception"),
      v.literal("returned"),
    ),
    carrierStatus: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    rawMetadata: v.optional(v.any()),
    receivedVia: v.union(v.literal("webhook"), v.literal("poll")),
    receivedAt: v.number(),
  })
    .index("by_shipment_time", ["shipmentId", "occurredAt"])
    .index("by_shipment_event", ["shipmentId", "eventId"])
    .index("by_status", ["normalizedStatus"]),

  // PRD D3 Shipping Manifests — daily carrier manifests for bulk pickup.
  commerce_shipment_manifests: defineTable({
    shipFromLocationId: v.id("commerce_ship_from_locations"),
    provider: v.string(),
    carrierCode: v.string(),
    manifestDate: v.string(), // "YYYY-MM-DD" in location timezone
    labelIds: v.array(v.id("commerce_shipment_labels")),
    externalManifestId: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("submitted"),
      v.literal("closed"),
      v.literal("failed"),
    ),
    submittedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    pdfStorageId: v.optional(v.id("_storage")),
    totalPackages: v.number(),
    totalWeight: v.optional(v.number()),
    closedBy: v.optional(v.id("users")),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_location_date", ["shipFromLocationId", "manifestDate"])
    .index("by_status", ["status"])
    .index("by_carrier_date", ["carrierCode", "manifestDate"]),

  // PRDs B1-B9 method configs. One table per method type. Each links to a zone
  // and optionally a rule (from commerce_shipping_rules) that gates availability.
  commerce_shipping_method_flat_rate: defineTable({
    zoneId: v.id("commerce_shipping_zones"),
    name: v.string(),
    label: v.string(),
    labelHintTemplate: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    updatedBy: v.optional(v.id("users")),
    baseCost: v.number(),
    costMode: v.union(
      v.literal("per_order"),
      v.literal("per_item"),
      v.literal("per_shipping_class"),
    ),
    classOverrides: v.optional(
      v.array(
        v.object({
          classId: v.id("commerce_shipping_classes"),
          cost: v.number(),
        }),
      ),
    ),
    minCost: v.optional(v.number()),
    maxCost: v.optional(v.number()),
    taxable: v.optional(v.boolean()),
    enabled: v.boolean(),
    sortOrder: v.number(),
    ruleId: v.optional(v.id("commerce_shipping_rules")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_zone", ["zoneId"])
    .index("by_zone_sort", ["zoneId", "sortOrder"]),

  commerce_shipping_method_weight_based: defineTable({
    zoneId: v.id("commerce_shipping_zones"),
    name: v.string(),
    label: v.string(),
    labelHintTemplate: v.optional(v.string()),
    weightUnit: v.union(
      v.literal("oz"),
      v.literal("g"),
      v.literal("lb"),
      v.literal("kg"),
    ),
    // PRD B2 §4 — how incremental cost is applied:
    //   "above_min" — N incremental units beyond tier.minWeight
    //   "above_max_of_previous" — beyond the previous tier's maxWeight
    incrementalMode: v.optional(
      v.union(v.literal("above_min"), v.literal("above_max_of_previous")),
    ),
    tiers: v.array(
      v.object({
        minWeight: v.number(),
        maxWeight: v.optional(v.number()),
        cost: v.number(),
        incrementalCost: v.optional(v.number()),
        incrementalWeight: v.optional(v.number()),
      }),
    ),
    classOverrides: v.optional(
      v.array(
        v.object({
          classId: v.id("commerce_shipping_classes"),
          tiers: v.array(
            v.object({
              minWeight: v.number(),
              maxWeight: v.optional(v.number()),
              cost: v.number(),
              incrementalCost: v.optional(v.number()),
              incrementalWeight: v.optional(v.number()),
            }),
          ),
        }),
      ),
    ),
    includeTareWeight: v.optional(v.boolean()),
    enabled: v.boolean(),
    sortOrder: v.number(),
    ruleId: v.optional(v.id("commerce_shipping_rules")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_zone", ["zoneId"])
    .index("by_zone_sort", ["zoneId", "sortOrder"]),

  commerce_shipping_method_dimensional: defineTable({
    zoneId: v.id("commerce_shipping_zones"),
    name: v.string(),
    label: v.string(),
    divisor: v.number(),
    // PRD §4.1 — unit for L×W×H (paired with divisor: 139/166 for in, 5000 for cm).
    dimensionUnit: v.optional(v.union(v.literal("in"), v.literal("cm"))),
    weightUnit: v.union(
      v.literal("oz"),
      v.literal("g"),
      v.literal("lb"),
      v.literal("kg"),
    ),
    // PRD §4.1 — rounding mode on computed billable weight.
    roundingMode: v.optional(
      v.union(v.literal("up"), v.literal("nearest"), v.literal("up_half")),
    ),
    // PRD §4.1 — floor applied to billable weight before tier lookup.
    minBillableWeight: v.optional(v.number()),
    // PRD §4.1 — per-zone divisor override (rarely used; mostly for metric markets).
    perZoneDivisors: v.optional(
      v.array(
        v.object({
          zoneId: v.id("commerce_shipping_zones"),
          divisor: v.number(),
        }),
      ),
    ),
    tiers: v.array(
      v.object({
        minWeight: v.number(),
        maxWeight: v.optional(v.number()),
        cost: v.number(),
        incrementalCost: v.optional(v.number()),
        incrementalWeight: v.optional(v.number()),
      }),
    ),
    classOverrides: v.optional(v.any()),
    enabled: v.boolean(),
    sortOrder: v.number(),
    ruleId: v.optional(v.id("commerce_shipping_rules")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_zone", ["zoneId"])
    .index("by_zone_sort", ["zoneId", "sortOrder"]),

  commerce_shipping_method_price_based: defineTable({
    zoneId: v.id("commerce_shipping_zones"),
    name: v.string(),
    label: v.string(),
    labelHintTemplate: v.optional(v.string()),
    currencyCode: v.string(),
    tiers: v.array(
      v.object({
        minSubtotal: v.number(),
        maxSubtotal: v.optional(v.number()),
        cost: v.number(),
        incrementalCost: v.optional(v.number()),
        incrementalSubtotal: v.optional(v.number()),
      }),
    ),
    useDiscountedSubtotal: v.optional(v.boolean()),
    enabled: v.boolean(),
    sortOrder: v.number(),
    ruleId: v.optional(v.id("commerce_shipping_rules")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_zone", ["zoneId"])
    .index("by_zone_sort", ["zoneId", "sortOrder"]),

  commerce_shipping_method_quantity_based: defineTable({
    zoneId: v.id("commerce_shipping_zones"),
    name: v.string(),
    label: v.string(),
    labelHintTemplate: v.optional(v.string()),
    countMode: v.union(
      v.literal("total_items"),
      v.literal("total_line_items"),
      v.literal("per_shipping_class"),
    ),
    tiers: v.array(
      v.object({
        minCount: v.number(),
        maxCount: v.optional(v.number()),
        cost: v.number(),
        incrementalCost: v.optional(v.number()),
        incrementalCount: v.optional(v.number()),
      }),
    ),
    classOverrides: v.optional(v.any()),
    enabled: v.boolean(),
    sortOrder: v.number(),
    ruleId: v.optional(v.id("commerce_shipping_rules")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_zone", ["zoneId"])
    .index("by_zone_sort", ["zoneId", "sortOrder"]),

  commerce_shipping_method_free: defineTable({
    zoneId: v.id("commerce_shipping_zones"),
    name: v.string(),
    label: v.string(),
    conditionType: v.union(
      v.literal("always"),
      v.literal("min_amount"),
      v.literal("coupon"),
      v.literal("min_amount_or_coupon"),
      v.literal("min_amount_and_coupon"),
      v.literal("rule"),
    ),
    minAmount: v.optional(v.number()),
    couponCode: v.optional(v.string()),
    // PRD §2 — evaluate min_amount against discounted subtotal (default true)
    // vs raw subtotal when false.
    useDiscountedSubtotal: v.optional(v.boolean()),
    ruleId: v.optional(v.id("commerce_shipping_rules")),
    excludeShippingClassIds: v.optional(
      v.array(v.id("commerce_shipping_classes")),
    ),
    requireCustomerTags: v.optional(v.array(v.string())),
    enabled: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_zone", ["zoneId"])
    .index("by_zone_sort", ["zoneId", "sortOrder"]),

  commerce_shipping_method_local_pickup: defineTable({
    zoneId: v.id("commerce_shipping_zones"),
    name: v.string(),
    label: v.string(),
    allowedPickupLocationIds: v.array(
      v.id("commerce_ship_from_locations"),
    ),
    handlingFee: v.optional(v.number()),
    pickupInstructions: v.optional(v.string()),
    requirePickupLocationSelection: v.optional(v.boolean()),
    enabled: v.boolean(),
    sortOrder: v.number(),
    ruleId: v.optional(v.id("commerce_shipping_rules")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_zone", ["zoneId"])
    .index("by_zone_sort", ["zoneId", "sortOrder"]),

  commerce_shipping_method_local_delivery: defineTable({
    zoneId: v.id("commerce_shipping_zones"),
    name: v.string(),
    label: v.string(),
    shipFromLocationId: v.id("commerce_ship_from_locations"),
    restrictionMode: v.union(
      v.literal("postcode_allowlist"),
      v.literal("radius"),
    ),
    allowedPostcodes: v.optional(v.array(v.string())),
    radiusKm: v.optional(v.number()),
    pricingMode: v.union(v.literal("flat"), v.literal("distance")),
    flatCost: v.optional(v.number()),
    distancePricing: v.optional(
      v.object({
        baseCost: v.number(),
        perKmCost: v.number(),
        minCost: v.optional(v.number()),
        maxCost: v.optional(v.number()),
      }),
    ),
    minOrderAmount: v.optional(v.number()),
    deliveryWindows: v.optional(
      v.array(
        v.object({
          day: v.number(),
          startTime: v.string(),
          endTime: v.string(),
        }),
      ),
    ),
    enabled: v.boolean(),
    sortOrder: v.number(),
    ruleId: v.optional(v.id("commerce_shipping_rules")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_zone", ["zoneId"])
    .index("by_zone_sort", ["zoneId", "sortOrder"]),

  commerce_shipping_method_table_rate: defineTable({
    zoneId: v.id("commerce_shipping_zones"),
    name: v.string(),
    label: v.string(),
    matchMode: v.union(
      v.literal("first_match"),
      v.literal("all_matches_sum"),
      v.literal("cheapest_match"),
    ),
    rows: v.array(
      v.object({
        priority: v.number(),
        conditionAST: v.any(),
        costFormula: v.object({
          mode: v.union(
            v.literal("flat"),
            v.literal("per_weight"),
            v.literal("per_item"),
            v.literal("per_subtotal"),
          ),
          baseCost: v.number(),
          perUnitCost: v.optional(v.number()),
          unitCap: v.optional(v.number()),
        }),
        label: v.optional(v.string()),
        enabled: v.boolean(),
      }),
    ),
    enabled: v.boolean(),
    sortOrder: v.number(),
    ruleId: v.optional(v.id("commerce_shipping_rules")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_zone", ["zoneId"])
    .index("by_zone_sort", ["zoneId", "sortOrder"]),

  // PRD A7 Rate Calculation Pipeline — per-run diagnostic record.
  commerce_rate_pipeline_runs: defineTable({
    checkoutSessionId: v.optional(v.id("commerce_checkout_sessions")),
    requestedAt: v.number(),
    totalDurationMs: v.number(),
    matchedZoneId: v.optional(v.id("commerce_shipping_zones")),
    matchedZoneName: v.optional(v.string()),
    fellBackToManual: v.boolean(),
    totalQuotes: v.number(),
    // PRD A7 §7 — full diagnostics payload so admins can reproduce a run.
    cacheHit: v.optional(v.boolean()),
    shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
    selectedPackageIds: v.optional(v.array(v.string())),
    warnings: v.optional(v.array(v.string())),
    zeroQuoteReasons: v.optional(v.array(v.string())),
    requestContext: v.optional(
      v.object({
        shippingAddress: v.optional(v.any()),
        itemCount: v.optional(v.number()),
        totalWeightOz: v.optional(v.number()),
        subtotalAmount: v.optional(v.number()),
        currencyCode: v.optional(v.string()),
        preferredProvider: v.optional(v.string()),
      }),
    ),
    stages: v.array(
      v.object({
        stage: v.string(),
        startedAt: v.number(),
        durationMs: v.number(),
        success: v.boolean(),
        detail: v.optional(v.string()),
      }),
    ),
    providerResults: v.optional(
      v.array(
        v.object({
          provider: v.string(),
          success: v.boolean(),
          quoteCount: v.number(),
          durationMs: v.number(),
          error: v.optional(v.string()),
        }),
      ),
    ),
    addressKey: v.optional(v.string()),
    cartKey: v.optional(v.string()),
  })
    .index("by_session", ["checkoutSessionId"])
    .index("by_requestedAt", ["requestedAt"]),

  // PRD A6 Shipping Rules Engine — persisted rules for named reuse. Most
  // method-specific rules live inline on the method config, but named rules
  // can be created and referenced by methodConfig.ruleId for reuse.
  commerce_shipping_rules: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    ruleAST: v.any(), // RuleAST type; validated at save time.
    schemaVersion: v.number(),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_name", ["name"]),

  // PRD A5 Address Validation Service — cache of validation results keyed
  // by deterministic address fingerprint.
  // PRD D2 §5 — durable sync log for tracking polling runs + webhook
  // deliveries. Admin tracking-health dashboard reads these for backoff
  // + retry visibility.
  commerce_tracking_sync_log: defineTable({
    provider: v.string(),
    shipmentId: v.optional(v.id("commerce_shipments")),
    labelId: v.optional(v.id("commerce_shipment_labels")),
    trackingNumber: v.optional(v.string()),
    source: v.union(v.literal("poll"), v.literal("webhook")),
    success: v.boolean(),
    durationMs: v.optional(v.number()),
    statusCode: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    eventCount: v.optional(v.number()),
    /** Number of retry attempts since last successful sync for this shipment. */
    consecutiveFailures: v.optional(v.number()),
    /** ms to wait before next retry (exponential backoff). */
    backoffMs: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_shipment", ["shipmentId"])
    .index("by_provider_created", ["provider", "createdAt"])
    .index("by_created", ["createdAt"]),

  commerce_address_validations: defineTable({
    fingerprint: v.string(),
    provider: v.union(
      v.literal("usps"),
      v.literal("smartystreets"),
      v.literal("google"),
      v.literal("ups"),
      v.literal("fedex"),
      v.literal("skip"),
    ),
    status: v.union(
      v.literal("valid"),
      v.literal("corrected"),
      v.literal("invalid"),
      v.literal("unconfirmed"),
      // PRD A5 §5.1 — extended states.
      v.literal("ambiguous"),
      v.literal("unsupported_country"),
      v.literal("skipped"),
    ),
    inputAddress: v.any(),
    normalizedAddress: v.optional(v.any()),
    isResidential: v.optional(v.boolean()),
    deliveryPoint: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    geocode: v.optional(
      v.object({ lat: v.number(), lng: v.number(), accuracy: v.string() }),
    ),
    rawResponse: v.optional(v.any()),
    // PRD A5 §5.1 — per-provider attempt trace (why each step fired or was skipped).
    validationDiagnostics: v.optional(v.any()),
    validatedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_fingerprint", ["fingerprint"])
    .index("by_expires", ["expiresAt"]),

  // PRD A4 Ship-From Locations System
  commerce_ship_from_locations: defineTable({
    name: v.string(),
    code: v.string(),
    locationType: v.union(
      v.literal("warehouse"),
      v.literal("retail_store"),
      v.literal("dropshipper"),
      v.literal("fulfillment_center"),
      v.literal("other"),
    ),
    address: v.object({
      contactName: v.string(),
      companyName: v.optional(v.string()),
      line1: v.string(),
      line2: v.optional(v.string()),
      city: v.string(),
      state: v.string(),
      postalCode: v.string(),
      countryCode: v.string(),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
    geocode: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
        accuracy: v.string(),
        geocodedAt: v.number(),
      }),
    ),
    isActive: v.boolean(),
    isDefault: v.boolean(),
    isArchived: v.boolean(),
    isPickupEnabled: v.optional(v.boolean()),
    timezone: v.string(),
    cutoffTime: v.optional(v.string()),
    operatingDays: v.optional(v.array(v.number())),
    operatingHours: v.optional(
      v.object({
        open: v.string(),
        close: v.string(),
      }),
    ),
    handlingTimeDays: v.optional(v.number()),
    priority: v.number(),
    fulfillmentProvider: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("amazon_mcf"),
        v.literal("shipstation"),
        v.literal("third_party_logistics"),
        v.literal("custom"),
      ),
    ),
    externalProviderLocationId: v.optional(v.string()),
    fulfillmentProviderConfig: v.optional(v.any()),
    preferredProviderAccountIds: v.optional(
      v.array(v.id("shipping_provider_accounts")),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdByUserId: v.optional(v.id("users")),
    updatedByUserId: v.optional(v.id("users")),
  })
    .index("by_active", ["isActive"])
    .index("by_default", ["isDefault"])
    .index("by_archived", ["isArchived"])
    .index("by_code", ["code"])
    .index("by_priority", ["priority"]),

  commerce_product_location_fulfillment: defineTable({
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    locationId: v.id("commerce_ship_from_locations"),
    priority: v.optional(v.number()),
    enabled: v.boolean(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_product_variant", ["productId", "variantId"])
    .index("by_location", ["locationId"])
    .index("by_product_location", ["productId", "locationId"])
    .index("by_variant_location", ["variantId", "locationId"]),

  // PRD A2 Shipping Classes System
  commerce_shipping_classes: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.number(),
    // PRD A3 §4.3 — class-level package default. Class picks over ship-from
    // location default but below product-level override.
    preferredPackageId: v.optional(v.id("commerce_shipping_packages")),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  })
    .index("by_slug", ["slug"])
    .index("by_sort_order", ["sortOrder", "name"])
    .index("by_created_at", ["createdAt"]),

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
    // PRD A3 extensions
    packageSource: v.optional(
      v.union(
        v.literal("custom"),
        v.literal("shipstation"),
        v.literal("ups"),
        v.literal("usps"),
        v.literal("fedex"),
        v.literal("dhl"),
      ),
    ),
    carrierPackageCode: v.optional(v.string()),
    shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
    isDefault: v.optional(v.boolean()),
    dimensionUnit: v.optional(v.union(v.literal("in"), v.literal("cm"))),
    weightUnit: v.optional(
      v.union(v.literal("oz"), v.literal("lb"), v.literal("g"), v.literal("kg")),
    ),
    tareWeight: v.optional(v.number()),
    maxLoadWeight: v.optional(v.number()),
    innerDimensions: v.optional(
      v.object({
        length: v.number(),
        width: v.number(),
        height: v.number(),
      }),
    ),
    shipStationPackageId: v.optional(v.string()),
    shipStationCarrierCode: v.optional(v.string()),
    isArchived: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_source_location", ["packageSource", "shipFromLocationId"])
    .index("by_default_scope", ["shipFromLocationId", "isDefault"])
    .index("by_carrier_code", ["packageSource", "carrierPackageCode"])
    .index("by_archived", ["isArchived"]),

  commerce_shipping_zones: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    countries: v.array(v.string()),
    states: v.array(v.string()),
    postalCodeRules: v.array(v.string()),
    enabled: v.boolean(),
    isFallback: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  })
    .index("by_sort", ["sortOrder"])
    .index("by_slug", ["slug"])
    .index("by_fallback", ["isFallback"])
    .index("by_enabled_sort", ["enabled", "sortOrder"]),

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

  shipping_quote_diagnostics: defineTable({
    checkoutSessionId: v.optional(v.id("commerce_checkout_sessions")),
    requestedAt: v.number(),
    requestedBy: v.optional(v.string()),
    shippingAddress: v.optional(v.any()),
    providerResults: v.array(
      v.object({
        provider: v.string(),
        attempted: v.boolean(),
        success: v.boolean(),
        quoteCount: v.number(),
        durationMs: v.optional(v.number()),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        skippedReason: v.optional(v.string()),
      }),
    ),
    totalQuotes: v.number(),
    fallbackUsed: v.boolean(),
  })
    .index("by_session", ["checkoutSessionId"])
    .index("by_requestedAt", ["requestedAt"]),

  commerce_shipping_rate_quotes: defineTable({
    checkoutSessionId: v.id("commerce_checkout_sessions"),
    quoteKey: v.string(),
    provider: v.string(),
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
    /** Deterministic fingerprint of the shipping address used when this quote was fetched. */
    addressKey: v.optional(v.string()),
    /** Deterministic fingerprint of the cart items when this quote was fetched. */
    cartKey: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_checkout", ["checkoutSessionId"])
    .index("by_quote_key", ["quoteKey"]),
};
