"use node";

/**
 * PRD C3 USPS rate fetching — typed v2 port of legacy actions.ts:805-996.
 *
 * Audit fixes preserved:
 *   - Required fields: processingCategory, rateIndicator, destinationEntryFacilityType
 *   - Response parsing via rateOptions[].rates[] flatMap
 *   - Service name from rate.description with fallback chain
 *   - Real dimensions from packages or sensible default (NOT 0.1×0.1×0.1)
 *   - accountType/accountNumber removed (caused 403 errors per audit)
 */

import { ConvexError } from "convex/values";
import { z } from "zod";

import type { ActionCtx } from "../../../_generated/server";
import { internal } from "../../../_generated/api";
import { rankQuotes } from "../../rates/ranking";
import type { NormalizedShippingQuote } from "../../rates/types";
import { computeAddressFingerprint } from "../../helpers/addressFingerprint";
import { snapshotShippingOrigin } from "../../quoteProvenance";
import { getEffectiveShipFrom } from "../../helpers/settings";
import { getUspsAccessTokenV2 } from "./auth";
import { getUspsServiceName, parseUspsBusinessDays } from "./serviceCodes";
import { readExternalJson } from "../../../helpers/externalJson";

export type UspsRateInput = {
  sessionToken: string;
  shippingAddress: {
    line1: string;
    city: string;
    state?: string;
    postalCode: string;
    countryCode: string;
    line2?: string;
  };
  packages?: Array<{
    weightOz: number;
    lengthIn?: number;
    widthIn?: number;
    heightIn?: number;
  }>;
  persistQuotes?: boolean;
};

/**
 * One USPS price: the fields read below at their documented types. Delivery
 * standards vary in form and are parsed by parseUspsBusinessDays. Other
 * fields are kept, because the rate is stored as the quote's raw payload.
 */
const uspsRateSchema = z.looseObject({
  mailClass: z.string().nullish(),
  productCode: z.string().nullish(),
  description: z.string().nullish(),
  mailClassDescription: z.string().nullish(),
  price: z.number().nullish(),
  totalBasePrice: z.number().nullish(),
  totalPrice: z.number().nullish(),
  commercialPrice: z.number().nullish(),
  basePrice: z.number().nullish(),
  expectedDeliveryDays: z.unknown().optional(),
  serviceStandards: z.unknown().optional(),
  deliveryDays: z.unknown().optional(),
  currency: z.string().nullish(),
  currencyCode: z.string().nullish(),
});

/** Prices sit under `rateOptions` (each option nesting `rates`, or itself a price), `prices` or `rates`. */
const uspsRateResponseSchema = z.object({
  rateOptions: z.array(z.unknown()).nullish(),
  prices: z.array(z.unknown()).nullish(),
  rates: z.array(z.unknown()).nullish(),
});
const uspsRateOptionSchema = z.object({ rates: z.array(z.unknown()) });

export async function fetchUspsRatesV2(
  ctx: ActionCtx,
  args: UspsRateInput,
): Promise<{
  success: true;
  provider: "usps";
  quotes: NormalizedShippingQuote[];
}> {
  const rateContext = await ctx.runQuery(
    internal.shipping.internals.getRateContextForSession,
    { sessionToken: args.sessionToken },
  );
  if (!rateContext?.checkoutSession || !rateContext.cart) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Checkout session not found.",
    });
  }

  const shippingSettings = await getEffectiveShipFrom(ctx);
  if (!shippingSettings.shipFromPostalCode) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Ship-from postal code is required for USPS rates.",
    });
  }

  const { accessToken, credentials } = await getUspsAccessTokenV2(ctx);

  // Weight: from packed boxes if provided, else sum item weights.
  const shippableItems = rateContext.items.filter(
    (item) => item.product && item.product.isVirtual !== true,
  );
  const totalWeightOz =
    args.packages && args.packages.length > 0
      ? args.packages.reduce((sum, p) => sum + p.weightOz, 0)
      : shippableItems.reduce((sum, item) => {
          const unit =
            item.product?.shippingWeightOz ??
            shippingSettings.defaultPackageWeightOz ??
            16;
          return sum + Math.max(1, unit) * item.quantity;
        }, 0);
  if (totalWeightOz <= 0) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "No shippable item weight is available for quote calculation.",
    });
  }

  // Dimensions: first packed box if provided, else sensible default 6×4×4.
  const firstPkg = args.packages?.[0];
  const length = firstPkg?.lengthIn ?? 6;
  const width = firstPkg?.widthIn ?? 4;
  const height = firstPkg?.heightIn ?? 4;

  const pounds = Math.floor(totalWeightOz / 16);
  const ounces = Number((totalWeightOz % 16).toFixed(1));
  const decimalWeight = Number((pounds + ounces / 16).toFixed(2));

  const requestPayload = {
    originZIPCode: shippingSettings.shipFromPostalCode,
    destinationZIPCode: args.shippingAddress.postalCode,
    weight: decimalWeight,
    length,
    width,
    height,
    mailClasses: [
      "USPS_GROUND_ADVANTAGE",
      "PRIORITY_MAIL",
      "PRIORITY_MAIL_EXPRESS",
      "PARCEL_SELECT",
    ],
    processingCategory: "MACHINABLE",
    rateIndicator: "DR",
    destinationEntryFacilityType: "NONE",
    priceType: "COMMERCIAL",
    mailingDate: new Date().toISOString().slice(0, 10),
  };

  const response = await fetch(
    `${credentials.apiBaseUrl}/prices/v3/base-rates-list/search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestPayload),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "usps",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });
    throw new ConvexError({
      code: "USPS_RATE_ERROR",
      message: body.slice(0, 500) || "Failed to fetch USPS rates.",
    });
  }

  const data = await readExternalJson(response, uspsRateResponseSchema);
  if (!data.ok) {
    throw new ConvexError({
      code: "USPS_RATE_ERROR",
      message: `USPS rate response could not be read: ${data.problem}.`,
    });
  }
  // A rate option either nests its rates or is itself a rate.
  const listed: unknown[] = data.value.rateOptions
    ? data.value.rateOptions.flatMap((option) => {
        const nested = uspsRateOptionSchema.safeParse(option);
        return nested.success ? nested.data.rates : [option];
      })
    : (data.value.prices ?? data.value.rates ?? []);
  // A price without a numeric amount cannot be quoted (it used to become a
  // free quote); it is left out rather than offered.
  const rawRates = listed.flatMap((entry) => {
    const rate = uspsRateSchema.safeParse(entry);
    if (!rate.success) {
      console.warn("[USPS] Skipped a price that does not match the documented shape:", rate.error.issues[0]?.message);
      return [];
    }
    const amount = rate.data.price ?? rate.data.totalBasePrice ?? rate.data.totalPrice ?? rate.data.commercialPrice ?? rate.data.basePrice;
    return amount === null || amount === undefined ? [] : [{ rate: rate.data, amount }];
  });

  const ttlMs = Number(shippingSettings.quoteCacheTtlSeconds ?? 300) * 1000;
  const expiresAt = Date.now() + ttlMs;
  const addressKey = computeAddressFingerprint(args.shippingAddress);
  const cartKey = rateContext.items
    .map((i) => `${i.productId}:${i.variantId ?? ""}:${i.quantity}`)
    .sort()
    .join(",");

  const unranked = rawRates.map(({ rate, amount }, index) => {
    const serviceCode =
      rate.mailClass ?? rate.productCode ?? `usps-service-${index + 1}`;
    const estimatedDays =
      parseUspsBusinessDays(rate.expectedDeliveryDays) ??
      parseUspsBusinessDays(rate.serviceStandards) ??
      parseUspsBusinessDays(rate.deliveryDays);

    return {
      quoteKey: `usps:${serviceCode}-${index}`,
      provider: "usps" as const,
      carrierCode: "usps",
      carrierName: "USPS",
      serviceCode: String(serviceCode),
      serviceName:
        rate.description ??
        rate.mailClassDescription ??
        getUspsServiceName(String(serviceCode)),
      amount: Math.round(amount * 100),
      currency:
        rate.currency ??
        rate.currencyCode ??
        rateContext.cart.currencyCode ??
        "USD",
      estimatedDaysMin: estimatedDays,
      estimatedDaysMax: estimatedDays,
      origin: snapshotShippingOrigin(shippingSettings),
      packages: args.packages,
      rawQuote: rate,
      addressKey,
      cartKey,
      expiresAt,
    };
  });

  const ranked = rankQuotes(unranked);

  if (args.persistQuotes !== false) {
    await ctx.runMutation(internal.shipping.internals.replaceCheckoutQuotes, {
      checkoutSessionId: rateContext.checkoutSession._id,
      quotes: ranked,
      addressKey,
      cartKey,
    });
  }

  await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
    provider: "usps",
    status: "connected",
    lastSyncAt: Date.now(),
  });

  return { success: true, provider: "usps", quotes: ranked };
}
