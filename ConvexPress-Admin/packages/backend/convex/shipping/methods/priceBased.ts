/**
 * PRD B4 Price-Based Shipping. Tiered rates by cart subtotal.
 */

import type { NormalizedShippingQuote } from "../rates/types";

export type PriceTier = {
  minSubtotal: number;
  maxSubtotal?: number;
  cost: number;
  incrementalCost?: number;
  incrementalSubtotal?: number;
};

export type PriceBasedConfig = {
  _id: string;
  zoneId: string;
  name: string;
  label: string;
  currencyCode: string;
  tiers: PriceTier[];
  useDiscountedSubtotal?: boolean;
  enabled: boolean;
};

export type PriceBasedCartContext = {
  currencyCode: string;
  subtotalBeforeDiscount: number;
  subtotalAfterDiscount: number;
  addressKey: string;
  cartKey: string;
};

function matchPriceTier(subtotal: number, tiers: PriceTier[]): PriceTier | null {
  for (const tier of tiers) {
    const max = tier.maxSubtotal ?? Number.POSITIVE_INFINITY;
    if (subtotal >= tier.minSubtotal && subtotal < max) return tier;
  }
  const top = tiers[tiers.length - 1];
  if (top && top.maxSubtotal === undefined && subtotal >= top.minSubtotal) return top;
  return null;
}

export function calculatePriceBased(
  config: PriceBasedConfig,
  cart: PriceBasedCartContext,
  quoteCacheTtlSeconds = 300,
): NormalizedShippingQuote[] {
  if (!config.enabled) return [];
  if (config.currencyCode !== cart.currencyCode) return [];

  const subtotal = (config.useDiscountedSubtotal ?? true)
    ? cart.subtotalAfterDiscount
    : cart.subtotalBeforeDiscount;

  const tier = matchPriceTier(subtotal, config.tiers);
  if (!tier) return [];

  let cost = tier.cost;
  if (tier.incrementalCost && tier.incrementalSubtotal) {
    const excess = Math.max(0, subtotal - (tier.maxSubtotal ?? tier.minSubtotal));
    if (excess > 0) {
      cost += Math.floor(excess / tier.incrementalSubtotal) * tier.incrementalCost;
    }
  }

  return [
    {
      quoteKey: `price:${config._id}`,
      provider: "manual",
      carrierCode: "price_based",
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
