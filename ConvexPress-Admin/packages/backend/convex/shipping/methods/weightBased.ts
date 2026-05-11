/**
 * PRD B2 Weight-Based Shipping calculator. Pure function.
 * Tier matching: inclusive-min, exclusive-max, first match wins.
 */

import type { NormalizedShippingQuote } from "../rates/types";

export type WeightTier = {
  minWeight: number;
  maxWeight?: number; // undefined = open-ended top tier
  cost: number;
  incrementalCost?: number;
  incrementalWeight?: number; // e.g. 1 = "per additional lb"
};

export type WeightBasedConfig = {
  _id: string;
  zoneId: string;
  name: string;
  label: string;
  weightUnit: "oz" | "g" | "lb" | "kg";
  incrementalMode?: "above_min" | "above_max_of_previous";
  tiers: WeightTier[];
  classOverrides?: Array<{ classId: string; tiers: WeightTier[] }>;
  enabled: boolean;
};

export type WeightBasedCartContext = {
  currencyCode: string;
  totalWeight: number; // in the method's weightUnit
  classes: string[]; // class ids present in cart
  addressKey: string;
  cartKey: string;
};

const OZ_PER_UNIT: Record<WeightBasedConfig["weightUnit"], number> = {
  oz: 1,
  g: 0.035274,
  lb: 16,
  kg: 35.274,
};

export function convertWeight(
  value: number,
  from: WeightBasedConfig["weightUnit"],
  to: WeightBasedConfig["weightUnit"],
): number {
  const oz = value * OZ_PER_UNIT[from];
  return oz / OZ_PER_UNIT[to];
}

function matchTier(weight: number, tiers: WeightTier[]): WeightTier | null {
  for (const tier of tiers) {
    const max = tier.maxWeight ?? Number.POSITIVE_INFINITY;
    if (weight >= tier.minWeight && weight < max) return tier;
  }
  // Fallback: if above all tiers and top tier has no max, return top tier.
  const top = tiers[tiers.length - 1];
  if (top && top.maxWeight === undefined && weight >= top.minWeight) return top;
  return null;
}

function computeTierCost(
  tier: WeightTier,
  weight: number,
  incrementalMode: "above_min" | "above_max_of_previous" = "above_min",
): number {
  let cost = tier.cost;
  if (tier.incrementalCost && tier.incrementalWeight) {
    // PRD B2 §4 — "above_max_of_previous" prices the excess past the tier's
    // maxWeight (or minWeight for the first tier); "above_min" prices past
    // the tier's own minWeight. Default remains the legacy behavior.
    const anchor =
      incrementalMode === "above_min"
        ? tier.minWeight
        : tier.maxWeight ?? tier.minWeight;
    const excess = Math.max(0, weight - anchor);
    if (excess > 0) {
      cost += Math.ceil(excess / tier.incrementalWeight) * tier.incrementalCost;
    }
  }
  return cost;
}

export function calculateWeightBased(
  config: WeightBasedConfig,
  cart: WeightBasedCartContext,
  quoteCacheTtlSeconds = 300,
): NormalizedShippingQuote[] {
  if (!config.enabled) return [];

  // Class overrides: if any cart class has an override, use it; otherwise
  // fall back to default tiers. When multiple overrides apply, use the
  // most-expensive matching tier (conservative; merchants can adjust via
  // Table Rate if they need different semantics).
  let tiers = config.tiers;
  const overrides = (config.classOverrides ?? []).filter((o) =>
    cart.classes.includes(o.classId),
  );
  if (overrides.length > 0) {
    // Pick override with highest base cost for weight = cart.totalWeight.
    let best: WeightTier[] = tiers;
    let bestCost = -Infinity;
    for (const override of overrides) {
      const tier = matchTier(cart.totalWeight, override.tiers);
      if (tier) {
        const cost = computeTierCost(tier, cart.totalWeight, config.incrementalMode);
        if (cost > bestCost) {
          bestCost = cost;
          best = override.tiers;
        }
      }
    }
    tiers = best;
  }

  const tier = matchTier(cart.totalWeight, tiers);
  if (!tier) return [];

  const cost = computeTierCost(tier, cart.totalWeight, config.incrementalMode);

  return [
    {
      quoteKey: `weight:${config._id}`,
      provider: "manual",
      carrierCode: "weight_based",
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
