/**
 * PRD B1 Flat Rate Shipping calculator. Pure function.
 * Three cost modes: per_order, per_item, per_shipping_class.
 */

import type { NormalizedShippingQuote } from "../rates/types";

export type FlatRateConfig = {
  _id: string;
  zoneId: string;
  name: string;
  label: string;
  baseCost: number;
  costMode: "per_order" | "per_item" | "per_shipping_class";
  classOverrides?: Array<{ classId: string; cost: number }>;
  minCost?: number;
  maxCost?: number;
  enabled: boolean;
};

export type FlatRateCartContext = {
  currencyCode: string;
  itemCount: number;
  classBreakdown: Array<{ classId: string | null; itemCount: number }>;
  addressKey: string;
  cartKey: string;
};

function clamp(value: number, min?: number, max?: number): number {
  let result = value;
  if (min !== undefined) result = Math.max(result, min);
  if (max !== undefined) result = Math.min(result, max);
  return result;
}

export function calculateFlatRate(
  config: FlatRateConfig,
  cart: FlatRateCartContext,
  quoteCacheTtlSeconds = 300,
): NormalizedShippingQuote[] {
  if (!config.enabled) return [];

  let cost = 0;
  if (config.costMode === "per_order") {
    cost = config.baseCost;
  } else if (config.costMode === "per_item") {
    cost = config.baseCost * cart.itemCount;
  } else {
    // per_shipping_class: sum cost per class that appears in cart.
    const overrideMap = new Map<string, number>();
    for (const ov of config.classOverrides ?? []) {
      overrideMap.set(ov.classId, ov.cost);
    }
    for (const bucket of cart.classBreakdown) {
      if (bucket.classId && overrideMap.has(bucket.classId)) {
        cost += overrideMap.get(bucket.classId)!;
      } else {
        cost += config.baseCost;
      }
    }
  }
  cost = clamp(cost, config.minCost, config.maxCost);

  return [
    {
      quoteKey: `flat:${config._id}`,
      provider: "manual",
      carrierCode: "flat_rate",
      carrierName: config.label,
      serviceCode: config.name,
      serviceName: config.label,
      amount: Math.round(cost * 100),
      currency: cart.currencyCode,
      isCheapest: false,
      isFastest: false,
      isBestValue: false,
      addressKey: cart.addressKey,
      cartKey: cart.cartKey,
      expiresAt: Date.now() + quoteCacheTtlSeconds * 1000,
    },
  ];
}
