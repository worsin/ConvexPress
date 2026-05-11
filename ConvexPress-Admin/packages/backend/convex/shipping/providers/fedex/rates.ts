"use node";

/**
 * PRD C4 FedEx rate fetching — typed v2 port of legacy actions.ts:1012-1230.
 *
 * Audit fixes preserved:
 *   - Residential flag dynamic based on company name presence
 *   - rateRequestType: ["ACCOUNT"] for negotiated rates
 *   - 1h token cache (NEW — legacy didn't cache, was a known gap)
 */

import { ConvexError } from "convex/values";

import type { ActionCtx } from "../../../_generated/server";
import { internal } from "../../../_generated/api";
import { rankQuotes } from "../../rates/ranking";
import type { NormalizedShippingQuote } from "../../rates/types";
import { computeAddressFingerprint } from "../../helpers/addressFingerprint";
import { getEffectiveShipFrom } from "../../helpers/settings";
import { getFedexAccessTokenV2 } from "./auth";
import { getFedexServiceName, parseFedexTransitDays } from "./serviceCodes";

/**
 * Resolve the residential flag FedEx expects on rate requests.
 * Priority: cached A5 address validation → company heuristic.
 */
async function resolveResidentialFlag(
  ctx: ActionCtx,
  address: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    countryCode: string;
    company?: string;
  },
): Promise<boolean> {
  try {
    const fingerprint = computeAddressFingerprint(address);
    const cached: any = await ctx.runQuery(
      internal.shipping.addressValidation.queries.getValidationByFingerprintInternal,
      { fingerprint },
    );
    if (cached && typeof cached.isResidential === "boolean") {
      return cached.isResidential;
    }
  } catch {
    // fall through to heuristic
  }
  return !(address.company || "").trim();
}

export type FedexRateInput = {
  sessionToken: string;
  shippingAddress: {
    firstName?: string;
    lastName?: string;
    company?: string;
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    countryCode: string;
    phone?: string;
  };
  packages?: Array<{
    weightOz: number;
    lengthIn?: number;
    widthIn?: number;
    heightIn?: number;
  }>;
  persistQuotes?: boolean;
};

export async function fetchFedexRatesV2(
  ctx: ActionCtx,
  args: FedexRateInput,
): Promise<{
  success: true;
  provider: "fedex";
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
  if (
    !shippingSettings.shipFromLine1 ||
    !shippingSettings.shipFromCity ||
    !shippingSettings.shipFromPostalCode ||
    !shippingSettings.shipFromCountryCode
  ) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Ship-from address is incomplete in commerce shipping settings.",
    });
  }

  const shippableItems = (rateContext.items as any[]).filter(
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

  const { accessToken, credentials } = await getFedexAccessTokenV2(ctx);
  const totalWeightLbs = Math.max(0.1, Math.round((totalWeightOz / 16) * 100) / 100);

  const requestPayload = {
    accountNumber: { value: credentials.accountNumber },
    rateRequestControlParameters: { returnTransitTimes: true },
    requestedShipment: {
      shipper: {
        address: {
          streetLines: [
            shippingSettings.shipFromLine1,
            shippingSettings.shipFromLine2 || undefined,
          ].filter(Boolean) as string[],
          city: shippingSettings.shipFromCity,
          stateOrProvinceCode: shippingSettings.shipFromState || undefined,
          postalCode: shippingSettings.shipFromPostalCode,
          countryCode: shippingSettings.shipFromCountryCode,
        },
      },
      recipient: {
        address: {
          streetLines: [
            args.shippingAddress.line1,
            args.shippingAddress.line2 || undefined,
          ].filter(Boolean) as string[],
          city: args.shippingAddress.city,
          stateOrProvinceCode: args.shippingAddress.state || undefined,
          postalCode: args.shippingAddress.postalCode,
          countryCode: args.shippingAddress.countryCode,
          residential: await resolveResidentialFlag(ctx, args.shippingAddress),
        },
      },
      pickupType: "DROPOFF_AT_FEDEX_LOCATION",
      packagingType: "YOUR_PACKAGING",
      rateRequestType: ["ACCOUNT"],
      requestedPackageLineItems: [
        {
          weight: { units: "LB", value: totalWeightLbs },
        },
      ],
    },
  };

  const response = await fetch(`${credentials.apiBaseUrl}/rate/v1/rates/quotes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-customer-transaction-id": `convexpress-fedex-${Date.now()}`,
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    const body = await response.text();
    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "fedex",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });
    throw new ConvexError({
      code: "FEDEX_RATE_ERROR",
      message: body.slice(0, 500) || "Failed to fetch FedEx rates.",
    });
  }

  const data = (await response.json()) as any;
  const rawRates: any[] = Array.isArray(data?.output?.rateReplyDetails)
    ? data.output.rateReplyDetails
    : Array.isArray(data?.rateReplyDetails)
      ? data.rateReplyDetails
      : [];

  const ttlMs = Number(shippingSettings.quoteCacheTtlSeconds ?? 300) * 1000;
  const expiresAt = Date.now() + ttlMs;
  const addressKey = computeAddressFingerprint(args.shippingAddress);
  const cartKey = (rateContext.items as any[])
    .map((i) => `${i.productId}:${i.variantId ?? ""}:${i.quantity}`)
    .sort()
    .join(",");

  const unranked = rawRates.map((rate, index) => {
    const serviceCode = rate.serviceType ?? rate.serviceName ?? `fedex-service-${index + 1}`;
    const chargeDetail =
      rate.ratedShipmentDetails?.[0]?.totalNetCharge ??
      rate.ratedShipmentDetails?.[0]?.shipmentRateDetail?.totalNetCharge ??
      rate.ratedShipmentDetails?.[0]?.shipmentRateDetail?.totalNetFedExCharge ??
      {};
    const amount =
      chargeDetail.amount ??
      rate.totalNetCharge?.amount ??
      rate.totalCharge?.amount ??
      0;
    const currency =
      chargeDetail.currency ??
      rate.currency ??
      rateContext.cart.currencyCode ??
      "USD";
    const transitDays =
      parseFedexTransitDays(rate.commit?.transitDays) ??
      parseFedexTransitDays(rate.commit?.delayDetail?.status) ??
      parseFedexTransitDays(rate.transitTime);

    return {
      quoteKey: `fedex:${serviceCode}-${index}`,
      provider: "fedex" as const,
      carrierCode: "fedex",
      carrierName: "FedEx",
      serviceCode: String(serviceCode),
      serviceName: rate.serviceName || getFedexServiceName(String(serviceCode)),
      amount: Math.round(Number(amount || 0) * 100) || 0,
      currency,
      estimatedDaysMin: transitDays,
      estimatedDaysMax: transitDays,
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
    provider: "fedex",
    status: "connected",
    lastSyncAt: Date.now(),
  });

  return { success: true, provider: "fedex", quotes: ranked };
}
