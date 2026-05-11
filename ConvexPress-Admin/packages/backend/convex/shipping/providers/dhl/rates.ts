"use node";

/**
 * PRD C5 DHL Express rate fetching — typed v2 port of legacy actions.ts:1248-1450.
 *
 * Audit fixes preserved:
 *   - Service codes corrected (E=9:00, T=12:00 Doc, plus I/L/M/Q/V additions)
 *   - Real dimensions from packages or 6×4×4 default (NOT 20×15×10 hardcode)
 *   - isCustomsDeclarable derived from origin/destination country mismatch
 *   - Weight conversion oz→kg via /35.274
 */

import { ConvexError } from "convex/values";

import type { ActionCtx } from "../../../_generated/server";
import { internal } from "../../../_generated/api";
import { rankQuotes } from "../../rates/ranking";
import type { NormalizedShippingQuote } from "../../rates/types";
import { computeAddressFingerprint } from "../../helpers/addressFingerprint";
import { getEffectiveShipFrom } from "../../helpers/settings";
import { getDhlBasicAuth, getDhlCredentialsV2 } from "./auth";
import { getDhlServiceName } from "./serviceCodes";

export type DhlRateInput = {
  sessionToken: string;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    countryCode: string;
  };
  packages?: Array<{
    weightOz: number;
    lengthIn?: number;
    widthIn?: number;
    heightIn?: number;
  }>;
  persistQuotes?: boolean;
};

const IN_TO_CM = 2.54;

export async function fetchDhlRatesV2(
  ctx: ActionCtx,
  args: DhlRateInput,
): Promise<{
  success: true;
  provider: "dhl";
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
    !shippingSettings.shipFromCity ||
    !shippingSettings.shipFromPostalCode ||
    !shippingSettings.shipFromCountryCode
  ) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Ship-from address is incomplete in commerce shipping settings.",
    });
  }

  const credentials = await getDhlCredentialsV2(ctx);
  const basicAuth = getDhlBasicAuth(credentials);

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

  const totalWeightKg = Math.max(0.1, Math.round((totalWeightOz / 35.274) * 100) / 100);

  // Dimensions: from first packed box (cm). When the pipeline didn't pass
  // packed dimensions (no package catalog configured), fall back to a 1cm
  // cube so DHL accepts the request but doesn't falsely inflate volume.
  const firstPkg = args.packages?.[0];
  const lengthCm = firstPkg?.lengthIn ? Math.round(firstPkg.lengthIn * IN_TO_CM) : 1;
  const widthCm = firstPkg?.widthIn ? Math.round(firstPkg.widthIn * IN_TO_CM) : 1;
  const heightCm = firstPkg?.heightIn ? Math.round(firstPkg.heightIn * IN_TO_CM) : 1;

  const params = new URLSearchParams({
    accountNumber: credentials.accountNumber,
    originCountryCode: shippingSettings.shipFromCountryCode,
    originPostalCode: shippingSettings.shipFromPostalCode,
    originCityName: shippingSettings.shipFromCity,
    destinationCountryCode: args.shippingAddress.countryCode,
    destinationPostalCode: args.shippingAddress.postalCode,
    destinationCityName: args.shippingAddress.city,
    weight: totalWeightKg.toFixed(2),
    length: String(lengthCm),
    width: String(widthCm),
    height: String(heightCm),
    plannedShippingDate: new Date().toISOString().slice(0, 10),
    isCustomsDeclarable:
      shippingSettings.shipFromCountryCode !== args.shippingAddress.countryCode
        ? "true"
        : "false",
    unitOfMeasurement: "metric",
  });

  const response = await fetch(`${credentials.apiBaseUrl}/rates?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "dhl",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });
    throw new ConvexError({
      code: "DHL_RATE_ERROR",
      message: body.slice(0, 500) || "Failed to fetch DHL rates.",
    });
  }

  const data = (await response.json()) as { products?: any[] };
  const rawProducts: any[] = Array.isArray(data?.products) ? data.products : [];

  const ttlMs = Number(shippingSettings.quoteCacheTtlSeconds ?? 300) * 1000;
  const expiresAt = Date.now() + ttlMs;
  const addressKey = computeAddressFingerprint(args.shippingAddress);
  const cartKey = (rateContext.items as any[])
    .map((i) => `${i.productId}:${i.variantId ?? ""}:${i.quantity}`)
    .sort()
    .join(",");

  const filtered = rawProducts.filter((product) => {
    const totalPrice = product?.totalPrice?.[0]?.price ?? product?.totalPrice ?? 0;
    return Number(totalPrice) > 0;
  });

  const unranked = filtered.map((product, index) => {
    const serviceCode =
      product.productCode ?? product.productName ?? `dhl-service-${index + 1}`;
    const priceEntry = Array.isArray(product.totalPrice)
      ? product.totalPrice[0]
      : product.totalPrice ?? {};
    const amount = priceEntry?.price ?? priceEntry ?? 0;
    const currency =
      priceEntry?.priceCurrency ?? rateContext.cart.currencyCode ?? "USD";

    const deliveryDate = product.deliveryCapabilities?.estimatedDeliveryDateAndTime;
    let estimatedDays: number | undefined;
    if (deliveryDate) {
      const diffMs = new Date(deliveryDate).getTime() - Date.now();
      estimatedDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }
    if (!estimatedDays && product.deliveryCapabilities?.totalTransitDays) {
      estimatedDays = Number(product.deliveryCapabilities.totalTransitDays);
    }

    return {
      quoteKey: `dhl:${serviceCode}-${index}`,
      provider: "dhl" as const,
      carrierCode: "dhl",
      carrierName: "DHL Express",
      serviceCode: String(serviceCode),
      serviceName: product.productName || getDhlServiceName(String(serviceCode)),
      amount: Math.round(Number(amount || 0) * 100) || 0,
      currency,
      estimatedDaysMin: estimatedDays,
      estimatedDaysMax: estimatedDays,
      rawQuote: product,
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
    provider: "dhl",
    status: "connected",
    lastSyncAt: Date.now(),
  });

  return { success: true, provider: "dhl", quotes: ranked };
}
