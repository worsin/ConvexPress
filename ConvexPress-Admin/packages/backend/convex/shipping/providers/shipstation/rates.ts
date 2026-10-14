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
import { z } from "zod";

import type { ActionCtx } from "../../../_generated/server";
import { internal } from "../../../_generated/api";
import { rankQuotes } from "../../rates/ranking";
import type { NormalizedShippingQuote } from "../../rates/types";
import { computeAddressFingerprint } from "../../helpers/addressFingerprint";
import { snapshotShippingOrigin } from "../../quoteProvenance";
import { getEffectiveShipFrom } from "../../helpers/settings";
import { getDecryptedProviderPayload } from "../_shared/credentials";
import { readExternalJson } from "../../../helpers/externalJson";
import { at, str } from "../../helpers/json";

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

/**
 * One ShipEngine rate: the fields read below, at their documented types
 * (ShipEngine sends null for absent optional fields). Other fields are kept,
 * because the rate is stored as the quote's raw provider payload.
 */
const shipEngineAmountSchema = z.object({ amount: z.number(), currency: z.string().nullish() });
const shipEngineRateSchema = z.looseObject({
  rate_id: z.string().nullish(),
  carrier_id: z.string().nullish(),
  carrier_code: z.string().nullish(),
  carrier_friendly_name: z.string().nullish(),
  service_code: z.string().nullish(),
  service_type: z.string().nullish(),
  shipping_amount: z.union([shipEngineAmountSchema, z.number()]),
  rate_details: z.unknown().optional(),
  currency: z.string().nullish(),
  delivery_days: z.number().nullish(),
  estimated_delivery_date: z.string().nullish(),
});

/** The rate list sits under `rate_response.rates` (documented) or `rates`. */
const shipEngineRateResponseSchema = z.object({
  rate_response: z.object({ rates: z.array(z.unknown()).nullish() }).nullish(),
  rates: z.array(z.unknown()).nullish(),
});

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

  // Typed integration settings merged with the default ship-from location.
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
        name: shippingSettings.shipFromName || "Store",
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

  const data = await readExternalJson(response, shipEngineRateResponseSchema);
  if (!data.ok) {
    throw new ConvexError({
      code: "SHIPSTATION_RATE_ERROR",
      message: `ShipStation rate response could not be read: ${data.problem}.`,
    });
  }

  // Audit fix: rate_response.rates is the documented path. Legacy had this
  // inverted; the v2 port preserves the corrected order.
  const listed = data.value.rate_response?.rates ?? data.value.rates ?? [];
  // A rate without a numeric amount cannot be quoted (it used to become a
  // free quote); it is left out rather than offered.
  const rawRates = listed.flatMap((entry) => {
    const rate = shipEngineRateSchema.safeParse(entry);
    if (!rate.success) console.warn("[ShipStation] Skipped a rate that does not match the documented shape:", rate.error.issues[0]?.message);
    return rate.success ? [rate.data] : [];
  });

  const ttlMs = Number(shippingSettings.quoteCacheTtlSeconds ?? 300) * 1000;
  const expiresAt = Date.now() + ttlMs;
  const addressKey = computeAddressFingerprint(args.shippingAddress);
  const cartKey = rateContext.items
    .map((i) => `${i.productId}:${i.variantId ?? ""}:${i.quantity}`)
    .sort()
    .join(",");

  const unranked = rawRates.map((rate, index) => {
    const amountValue =
      typeof rate.shipping_amount === "object"
        ? rate.shipping_amount.amount
        : rate.shipping_amount;
    const currency =
      (typeof rate.shipping_amount === "object"
        ? rate.shipping_amount.currency
        : undefined) ??
      str(at(rate.rate_details, "shipping_amount", "currency")) ??
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
      amount: Math.round(amountValue * 100),
      currency,
      estimatedDaysMin:
        typeof rate.delivery_days === "number" ? rate.delivery_days : undefined,
      estimatedDaysMax:
        typeof rate.delivery_days === "number" ? rate.delivery_days : undefined,
      deliveryDateEstimated: rate.estimated_delivery_date
        ? Date.parse(rate.estimated_delivery_date)
        : undefined,
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
    provider: "shipstation",
    status: "connected",
    lastSyncAt: Date.now(),
  });

  return { success: true, provider: "shipstation", quotes: ranked };
}
