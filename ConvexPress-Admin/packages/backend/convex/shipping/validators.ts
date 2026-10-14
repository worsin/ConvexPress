import { v } from "convex/values";

export const shippingProviderArg = v.union(
  v.literal("shipstation"),
  v.literal("ups"),
  v.literal("usps"),
  v.literal("fedex"),
  v.literal("dhl"),
);

export const getProviderConnectionArgs = {
  provider: shippingProviderArg,
};

export const upsertConnectionMetadataArgs = {
  provider: shippingProviderArg,
  displayName: v.string(),
  enabled: v.boolean(),
  mode: v.union(v.literal("sandbox"), v.literal("production")),
  isPrimary: v.boolean(),
  rateShoppingEnabled: v.boolean(),
  rateShoppingPriority: v.number(),
  // Tier 1.2 — per-connection webhook signing secret (optional, falls back to env var)
  webhookSecret: v.optional(v.string()),
};

export const saveProviderSecretArgs = {
  provider: shippingProviderArg,
  /** Credential fields by name (apiKey, clientId, ...); stored encrypted, read back as strings. */
  credentials: v.record(v.string(), v.string()),
};

/** Zone-method `serviceFilters`: carrier service codes to allow or deny (read by rates/pipeline.ts). */
export const zoneMethodServiceFiltersValidator = v.object({
  allow: v.optional(v.array(v.string())),
  deny: v.optional(v.array(v.string())),
});

/**
 * Zone-method `pricingRules`. The rate pipeline reads the markup and clamp
 * fields; flatRateAmount and freeShippingMinimum are what the admin Shipping
 * Rules page writes and displays.
 */
export const zoneMethodPricingRulesValidator = v.object({
  markupPct: v.optional(v.number()),
  markupFlatCents: v.optional(v.number()),
  minCostCents: v.optional(v.number()),
  maxCostCents: v.optional(v.number()),
  roundToCents: v.optional(v.number()),
  flatRateAmount: v.optional(v.number()),
  freeShippingMinimum: v.optional(v.number()),
});

export const createShipStationLabelForOrderArgs = {
  orderId: v.id("commerce_orders"),
  rateId: v.optional(v.string()),
};

export const syncShipStationTrackingArgs = {
  shipmentId: v.id("commerce_shipments"),
};

export const createShippingLabelForOrderArgs = {
  orderId: v.id("commerce_orders"),
  rateId: v.optional(v.string()),
};

export const syncShipmentTrackingArgs = {
  shipmentId: v.id("commerce_shipments"),
};

export const verifyDirectCarrierFoundationArgs = {
  provider: v.union(
    v.literal("ups"),
    v.literal("usps"),
    v.literal("fedex"),
    v.literal("dhl"),
  ),
};
