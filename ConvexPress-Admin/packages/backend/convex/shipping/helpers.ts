import { ConvexError } from "convex/values";

import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import {
  SHIPPING_INTEGRATION_DEFAULTS,
  SHIPPING_PROVIDER_DEFAULTS,
} from "../settings/defaults";

type ShippingCtx = MutationCtx | QueryCtx;

export const SHIPPING_PROVIDERS = [
  "shipstation",
  "ups",
  "usps",
  "fedex",
  "dhl",
] as const;

export type ShippingProvider = (typeof SHIPPING_PROVIDERS)[number];

export type NormalizedShippingQuote = {
  quoteKey: string;
  provider: ShippingProvider;
  carrierCode: string;
  carrierName: string;
  serviceCode: string;
  serviceName: string;
  amount: number;
  currency: string;
  estimatedDaysMin?: number;
  estimatedDaysMax?: number;
  deliveryDateEstimated?: number;
  isCheapest: boolean;
  isFastest: boolean;
  isBestValue: boolean;
  rawQuote?: unknown;
};

export async function requireShippingAdmin(ctx: ShippingCtx) {
  return requireCan(ctx, "manage_options");
}

export function assertShippingProvider(provider: string): asserts provider is ShippingProvider {
  if (!SHIPPING_PROVIDERS.includes(provider as ShippingProvider)) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Unsupported shipping provider: ${provider}`,
    });
  }
}

export async function getShippingSettingsSection(
  ctx: ShippingCtx,
  section:
    | "integrations.shipping"
    | "integrations.shipping.shipstation"
    | "integrations.shipping.ups"
    | "integrations.shipping.usps"
    | "integrations.shipping.fedex"
    | "integrations.shipping.dhl",
) {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: any) => q.eq("section", section))
    .unique();

  const defaults =
    section === "integrations.shipping"
      ? SHIPPING_INTEGRATION_DEFAULTS
      : SHIPPING_PROVIDER_DEFAULTS;

  return {
    ...defaults,
    ...(doc?.values ?? {}),
  };
}

export function rankShippingQuotes(
  quotes: Array<Omit<NormalizedShippingQuote, "isCheapest" | "isFastest" | "isBestValue">>,
): NormalizedShippingQuote[] {
  if (quotes.length === 0) return [];

  const sortedByAmount = [...quotes].sort((a, b) => a.amount - b.amount);
  const cheapestAmount = sortedByAmount[0]!.amount;

  const deliveryMetric = (quote: typeof quotes[number]) =>
    quote.estimatedDaysMin ??
    quote.estimatedDaysMax ??
    (quote.deliveryDateEstimated ? Math.max(1, quote.deliveryDateEstimated) : Number.MAX_SAFE_INTEGER);

  const sortedBySpeed = [...quotes].sort((a, b) => deliveryMetric(a) - deliveryMetric(b));
  const fastestMetric = deliveryMetric(sortedBySpeed[0]!);

  const ranked = quotes.map((quote) => {
    const costRank = sortedByAmount.findIndex((entry) => entry.quoteKey === quote.quoteKey) + 1;
    const speedRank = sortedBySpeed.findIndex((entry) => entry.quoteKey === quote.quoteKey) + 1;
    return {
      ...quote,
      score: costRank * 0.6 + speedRank * 0.4,
      isCheapest: quote.amount === cheapestAmount,
      isFastest: deliveryMetric(quote) === fastestMetric,
      isBestValue: false,
    };
  });

  ranked.sort((a, b) => a.score - b.score || a.amount - b.amount);
  if (ranked[0]) ranked[0]!.isBestValue = true;

  return ranked.map(({ score: _score, ...quote }) => quote);
}

export function buildFedexTrackingUrl(trackingNumber?: string) {
  if (!trackingNumber) return undefined;
  return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`;
}

export function buildDhlTrackingUrl(trackingNumber?: string) {
  if (!trackingNumber) return undefined;
  return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(trackingNumber)}`;
}
