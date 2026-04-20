"use node";

/**
 * PRD C1 ShipStation rate fetching — typed v2 port of legacy
 * `convex/shipping/actions.ts:2249-2453`.
 *
 * Audit fixes preserved:
 *   - Response parses `rate_response.rates` first (legacy bug had it inverted).
 *   - Quote stamped with addressKey + cartKey for stale-rate detection.
 *
 * Differences from legacy:
 *   - Strict TypeScript (no @ts-nocheck).
 *   - Uses v2 NormalizedShippingQuote type from rates/types.ts.
 *   - Uses v2 rankQuotes helper.
 *   - Pulls box dimensions from PRD A3 packed boxes (caller passes packages).
 *
 * Connection health updates remain delegated to the legacy
 * updateConnectionHealth mutation to avoid duplicating that surface.
 */

import { ConvexError } from "convex/values";

import type { ActionCtx } from "../../../_generated/server";
import { internal } from "../../../_generated/api";
import { rankQuotes } from "../../rates/ranking";
import type { NormalizedShippingQuote } from "../../rates/types";
import { computeAddressFingerprint } from "../../helpers/addressFingerprint";
import { getEffectiveShipFrom } from "../../helpers/settings";
import { getDecryptedProviderPayload } from "../_shared/credentials";

export type ShipStationRateInput = {
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
  /**
   * Optional packed boxes from PRD A3 bin-packing. When provided, one rate
   * request is made per box and totals summed. When absent, falls back to a
   * single weight-only request like legacy behavior.
   */
  packages?: Array<{
    weightOz: number;
    lengthIn?: number;
    widthIn?: number;
    heightIn?: number;
    packageCode?: string;
  }>;
  persistQuotes?: boolean;
};

type ShipEngineRate = {
  rate_id?: string;
  carrier_id?: string;
  carrier_code?: string;
  carrier_friendly_name?: string;
  service_code?: string;
  service_type?: string;
  shipping_amount?: { amount?: number; currency?: string } | number;
  rate_details?: { shipping_amount?: { amount?: number; currency?: string } };
  currency?: string;
  delivery_days?: number;
  estimated_delivery_date?: string;
};

type ShipEngineRateResponse = {
  rate_response?: { rates?: ShipEngineRate[] };
  rates?: ShipEngineRate[];
};

export async function fetchShipStationRatesV2(
  ctx: ActionCtx,
  args: ShipStationRateInput,
): Promise<{
  success: true;
  provider: "shipstation";
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

  // Convex codegen returns a narrow doc type for getBySectionInternal —
  // the actual result is the merged ShippingIntegrationSettings shape with
  // ship-from address fields. Cast through any to access them.
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

  // Credentials: decrypt via the shared helper so we read the actual apiKey
  // from the encrypted secret payload (not the envelope).
  const credsPayload = await getDecryptedProviderPayload(ctx, "shipstation");
  const apiKey = credsPayload.apiKey;
  const apiBaseUrl = (credsPayload.apiBaseUrl || "https://api.shipengine.com").replace(
    /\/+$/,
    "",
  );
  if (!apiKey) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "ShipStation API key is not configured.",
    });
  }

  // Compute weight from packed boxes if provided; otherwise sum item weights.
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

  // ShipEngine accepts one shipment with N packages. We pack everything into
  // one request — multi-package splitting (PRD A7 §6.9) lives in the pipeline.
  const packageEntries =
    args.packages && args.packages.length > 0
      ? args.packages.map((p) => ({
          weight: { value: p.weightOz, unit: "ounce" as const },
          dimensions:
            p.lengthIn && p.widthIn && p.heightIn
              ? {
                  length: p.lengthIn,
                  width: p.widthIn,
                  height: p.heightIn,
                  unit: "inch" as const,
                }
              : undefined,
        }))
      : [{ weight: { value: totalWeightOz, unit: "ounce" as const } }];

  const quoteRequest = {
    rate_options: { carrier_ids: [] as string[] },
    shipment: {
      ship_to: {
        name:
          [args.shippingAddress.firstName, args.shippingAddress.lastName]
            .filter(Boolean)
            .join(" ") || "Customer",
        company_name: args.shippingAddress.company,
        address_line1: args.shippingAddress.line1,
        address_line2: args.shippingAddress.line2,
        city_locality: args.shippingAddress.city,
        state_province: args.shippingAddress.state,
        postal_code: args.shippingAddress.postalCode,
        country_code: args.shippingAddress.countryCode,
        phone: args.shippingAddress.phone,
      },
      ship_from: {
        name:
          shippingSettings.shipFromName ||
          (shippingSettings as any).storeName ||
          "Store",
        company_name: shippingSettings.shipFromCompany,
        address_line1: shippingSettings.shipFromLine1,
        address_line2: shippingSettings.shipFromLine2,
        city_locality: shippingSettings.shipFromCity,
        state_province: shippingSettings.shipFromState,
        postal_code: shippingSettings.shipFromPostalCode,
        country_code: shippingSettings.shipFromCountryCode,
      },
      packages: packageEntries,
    },
  };

  const response = await fetch(`${apiBaseUrl}/v1/rates`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(quoteRequest),
  });

  if (!response.ok) {
    const body = await response.text();
    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "shipstation",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });
    throw new ConvexError({
      code: "SHIPSTATION_RATE_ERROR",
      message: body.slice(0, 500) || "Failed to fetch ShipStation rates.",
    });
  }

  const data = (await response.json()) as ShipEngineRateResponse;

  // Audit fix: rate_response.rates is the documented path. Legacy had this
  // inverted; the v2 port preserves the corrected order.
  const rawRates: ShipEngineRate[] = Array.isArray(data.rate_response?.rates)
    ? data.rate_response!.rates!
    : Array.isArray(data.rates)
      ? data.rates
      : [];

  const ttlMs = Number(shippingSettings.quoteCacheTtlSeconds ?? 300) * 1000;
  const expiresAt = Date.now() + ttlMs;
  const addressKey = computeAddressFingerprint(args.shippingAddress);
  const cartKey = (rateContext.items as any[])
    .map((i) => `${i.productId}:${i.variantId ?? ""}:${i.quantity}`)
    .sort()
    .join(",");

  const unranked = rawRates.map((rate, index) => {
    const amountValue =
      typeof rate.shipping_amount === "object"
        ? rate.shipping_amount?.amount ?? 0
        : (rate.shipping_amount ?? 0);
    const currency =
      (typeof rate.shipping_amount === "object"
        ? rate.shipping_amount?.currency
        : undefined) ??
      rate.rate_details?.shipping_amount?.currency ??
      rate.currency ??
      rateContext.cart.currencyCode ??
      "USD";

    return {
      quoteKey: `shipstation:${
        rate.rate_id ??
        `${rate.carrier_code ?? "carrier"}-${rate.service_code ?? "service"}-${index}`
      }`,
      provider: "shipstation" as const,
      carrierCode: rate.carrier_code ?? rate.carrier_id ?? "unknown",
      carrierName: rate.carrier_friendly_name ?? rate.carrier_code ?? "Carrier",
      serviceCode: rate.service_code ?? rate.service_type ?? "service",
      serviceName: rate.service_type ?? rate.service_code ?? "Service",
      amount: Math.round(Number(amountValue) * 100) || 0,
      currency,
      estimatedDaysMin:
        typeof rate.delivery_days === "number" ? rate.delivery_days : undefined,
      estimatedDaysMax:
        typeof rate.delivery_days === "number" ? rate.delivery_days : undefined,
      deliveryDateEstimated: rate.estimated_delivery_date
        ? Date.parse(rate.estimated_delivery_date)
        : undefined,
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
    provider: "shipstation",
    status: "connected",
    lastSyncAt: Date.now(),
  });

  return { success: true, provider: "shipstation", quotes: ranked };
}
