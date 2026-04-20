/**
 * PRD B8 Local Delivery.
 * Postcode allowlist OR radius match. Flat or distance-based pricing.
 */

import type { NormalizedShippingQuote } from "../rates/types";
import { haversineDistanceKm } from "../helpers/distance";
import { postcodeMatchesRule } from "../helpers/zoneMatching";

export type LocalDeliveryConfig = {
  _id: string;
  zoneId: string;
  name: string;
  label: string;
  shipFromLocationId: string;
  restrictionMode: "postcode_allowlist" | "radius";
  allowedPostcodes?: string[]; // zone-style postcode rules
  radiusKm?: number;
  pricingMode: "flat" | "distance";
  flatCost?: number;
  distancePricing?: {
    baseCost: number;
    perKmCost: number;
    minCost?: number;
    maxCost?: number;
  };
  minOrderAmount?: number;
  enabled: boolean;
};

export type LocalDeliveryCartContext = {
  currencyCode: string;
  subtotalAmount: number;
  destinationPostalCode?: string;
  destinationGeocode?: { lat: number; lng: number };
  originGeocode?: { lat: number; lng: number }; // from ship-from location
  addressKey: string;
  cartKey: string;
};

function matchAllowlist(postcode: string | undefined, rules: string[]): boolean {
  if (!postcode) return false;
  return rules.some((r) => postcodeMatchesRule(postcode, r));
}

function clamp(value: number, min?: number, max?: number): number {
  let result = value;
  if (min !== undefined) result = Math.max(result, min);
  if (max !== undefined) result = Math.min(result, max);
  return result;
}

export function calculateLocalDelivery(
  config: LocalDeliveryConfig,
  cart: LocalDeliveryCartContext,
  quoteCacheTtlSeconds = 300,
): NormalizedShippingQuote[] {
  if (!config.enabled) return [];

  // Minimum order check.
  if (
    config.minOrderAmount !== undefined &&
    cart.subtotalAmount < config.minOrderAmount
  ) {
    return [];
  }

  // Restriction check.
  let distanceKm = 0;
  if (config.restrictionMode === "postcode_allowlist") {
    const matches = matchAllowlist(
      cart.destinationPostalCode,
      config.allowedPostcodes ?? [],
    );
    if (!matches) return [];
  } else if (config.restrictionMode === "radius") {
    if (
      !cart.destinationGeocode ||
      !cart.originGeocode ||
      config.radiusKm === undefined
    ) {
      return [];
    }
    distanceKm = haversineDistanceKm(cart.originGeocode, cart.destinationGeocode);
    if (distanceKm > config.radiusKm) return [];
  }

  // Pricing.
  let cost = 0;
  if (config.pricingMode === "flat") {
    cost = config.flatCost ?? 0;
  } else {
    if (!config.distancePricing) return [];
    const p = config.distancePricing;
    cost = clamp(p.baseCost + distanceKm * p.perKmCost, p.minCost, p.maxCost);
  }

  return [
    {
      quoteKey: `local_delivery:${config._id}`,
      provider: "manual",
      carrierCode: "local_delivery",
      carrierName: config.label,
      serviceCode: config.name,
      serviceName: config.label,
      amount: Math.round(cost * 100),
      currency: cart.currencyCode,
      isCheapest: false,
      isFastest: true, // local delivery is typically fastest option
      isBestValue: false,
      addressKey: cart.addressKey,
      cartKey: cart.cartKey,
      expiresAt: Date.now() + quoteCacheTtlSeconds * 1000,
    },
  ];
}
