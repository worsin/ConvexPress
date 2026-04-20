/**
 * PRD B6 Free Shipping. Conditional zero-cost shipping.
 * Six condition types: always, min_amount, coupon, min_amount_or_coupon,
 * min_amount_and_coupon, rule.
 */

import type { NormalizedShippingQuote } from "../rates/types";
import { evaluateRule } from "../rulesEngine/evaluator";
import type { RuleAST, RuleContext } from "../rulesEngine/types";

export type FreeShippingConfig = {
  _id: string;
  zoneId: string;
  name: string;
  label: string;
  conditionType:
    | "always"
    | "min_amount"
    | "coupon"
    | "min_amount_or_coupon"
    | "min_amount_and_coupon"
    | "rule";
  minAmount?: number;
  couponCode?: string;
  ruleAST?: RuleAST;
  excludeShippingClassIds?: string[];
  requireCustomerTags?: string[];
  enabled: boolean;
};

export type FreeShippingCartContext = {
  currencyCode: string;
  subtotalAmount: number;
  appliedDiscountCode?: string;
  shippingClasses: string[];
  customerTags: string[];
  addressKey: string;
  cartKey: string;
  ruleContext: RuleContext; // for conditionType=rule
};

export function calculateFree(
  config: FreeShippingConfig,
  cart: FreeShippingCartContext,
  quoteCacheTtlSeconds = 300,
): NormalizedShippingQuote[] {
  if (!config.enabled) return [];

  // Exclusion: any excluded class present → disqualified.
  if (
    config.excludeShippingClassIds &&
    config.excludeShippingClassIds.some((cid) => cart.shippingClasses.includes(cid))
  ) {
    return [];
  }

  // Required customer tags: ALL must be present.
  if (
    config.requireCustomerTags &&
    !config.requireCustomerTags.every((t) => cart.customerTags.includes(t))
  ) {
    return [];
  }

  const meetsMinAmount =
    config.minAmount !== undefined && cart.subtotalAmount >= config.minAmount;
  const hasCoupon =
    config.couponCode !== undefined &&
    cart.appliedDiscountCode?.toUpperCase() === config.couponCode.toUpperCase();

  let qualifies = false;
  switch (config.conditionType) {
    case "always":
      qualifies = true;
      break;
    case "min_amount":
      qualifies = meetsMinAmount;
      break;
    case "coupon":
      qualifies = hasCoupon;
      break;
    case "min_amount_or_coupon":
      qualifies = meetsMinAmount || hasCoupon;
      break;
    case "min_amount_and_coupon":
      qualifies = meetsMinAmount && hasCoupon;
      break;
    case "rule":
      qualifies = config.ruleAST
        ? evaluateRule(config.ruleAST, cart.ruleContext)
        : false;
      break;
  }

  if (!qualifies) return [];

  // PRD B6 §2 — progress hint: when min_amount is defined and qualified, the
  // storefront can render "You unlocked free shipping!". When disqualified
  // by a small margin we surface "Add $X.XX for free shipping" via the
  // rawQuote payload so the checkout UI can read it.
  const remainingForFree =
    config.minAmount !== undefined
      ? Math.max(0, config.minAmount - cart.subtotalAmount)
      : 0;

  return [
    {
      quoteKey: `free:${config._id}`,
      provider: "manual",
      carrierCode: "free_shipping",
      carrierName: config.label,
      serviceCode: config.name,
      serviceName: config.label,
      amount: 0,
      currency: cart.currencyCode,
      isCheapest: true, // always cheapest when qualified
      isFastest: false,
      isBestValue: false,
      addressKey: cart.addressKey,
      cartKey: cart.cartKey,
      expiresAt: Date.now() + quoteCacheTtlSeconds * 1000,
      rawQuote: {
        freeShippingProgress: {
          unlocked: true,
          minAmount: config.minAmount,
          remainingToUnlock: remainingForFree,
        },
      },
    },
  ];
}

/**
 * PRD B6 §2 — storefront progress hint for disqualified carts. Lets the
 * checkout UI render "Add $X.XX for free shipping" without firing another
 * rate request. Returns null when no hint applies.
 */
export function computeFreeShippingHint(
  config: FreeShippingConfig,
  cart: FreeShippingCartContext,
): { applies: boolean; minAmount?: number; remaining?: number } | null {
  if (!config.enabled) return null;
  if (config.conditionType !== "min_amount" || config.minAmount === undefined)
    return null;
  const remaining = Math.max(0, config.minAmount - cart.subtotalAmount);
  return {
    applies: remaining > 0,
    minAmount: config.minAmount,
    remaining,
  };
}
