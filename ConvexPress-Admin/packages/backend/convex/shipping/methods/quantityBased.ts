/**
 * PRD B5 Quantity-Based Shipping. Tiered rates by item count.
 */

import type { NormalizedShippingQuote } from "../rates/types";

export type CountTier = {
  minCount: number;
  maxCount?: number;
  cost: number;
  incrementalCost?: number;
  incrementalCount?: number;
};

export type QuantityBasedConfig = {
  _id: string;
  zoneId: string;
  name: string;
  label: string;
  countMode: "total_items" | "total_line_items" | "per_shipping_class";
  tiers: CountTier[];
  classOverrides?: Array<{ classId: string; tiers: CountTier[] }>;
  enabled: boolean;
};

export type QuantityBasedCartContext = {
  currencyCode: string;
  totalItems: number;
  totalLineItems: number;
  classBreakdown: Array<{ classId: string | null; itemCount: number }>;
  addressKey: string;
  cartKey: string;
};

function matchCountTier(count: number, tiers: CountTier[]): CountTier | null {
  for (const tier of tiers) {
    const max = tier.maxCount ?? Number.POSITIVE_INFINITY;
    if (count >= tier.minCount && count < max) return tier;
  }
  const top = tiers[tiers.length - 1];
  if (top && top.maxCount === undefined && count >= top.minCount) return top;
  return null;
}

function computeCountCost(tier: CountTier, count: number): number {
  let cost = tier.cost;
  if (tier.incrementalCost && tier.incrementalCount) {
    const excess = Math.max(0, count - (tier.maxCount ?? tier.minCount));
    if (excess > 0) {
      cost += Math.ceil(excess / tier.incrementalCount) * tier.incrementalCost;
    }
  }
  return cost;
}

export function calculateQuantityBased(
  config: QuantityBasedConfig,
  cart: QuantityBasedCartContext,
  quoteCacheTtlSeconds = 300,
): NormalizedShippingQuote[] {
  if (!config.enabled) return [];

  let cost = 0;

  if (config.countMode === "per_shipping_class") {
    const overrideMap = new Map<string, CountTier[]>();
    for (const ov of config.classOverrides ?? []) {
      overrideMap.set(ov.classId, ov.tiers);
    }
    for (const bucket of cart.classBreakdown) {
      const tiers =
        bucket.classId && overrideMap.has(bucket.classId)
          ? overrideMap.get(bucket.classId)!
          : config.tiers;
      const tier = matchCountTier(bucket.itemCount, tiers);
      if (tier) cost += computeCountCost(tier, bucket.itemCount);
    }
  } else {
    const count =
      config.countMode === "total_items" ? cart.totalItems : cart.totalLineItems;
    const tier = matchCountTier(count, config.tiers);
    if (!tier) return [];
    cost = computeCountCost(tier, count);
  }

  return [
    {
      quoteKey: `qty:${config._id}`,
      provider: "manual",
      carrierCode: "quantity_based",
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
