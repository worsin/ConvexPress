"use node";

/**
 * PRD C2 UPS rate fetching — minimal v2 implementation.
 *
 * Calls UPS Rating API v2409 (`/api/rating/v2409/Rate`) with account credentials
 * and returns normalized quotes. Parity with the legacy UPS rate path that
 * was removed during Phase 13.4 cleanup.
 */

import { ConvexError } from "convex/values";

import type { ActionCtx } from "../../../_generated/server";
import { internal } from "../../../_generated/api";
import { rankQuotes } from "../../rates/ranking";
import type { NormalizedShippingQuote } from "../../rates/types";
import { computeAddressFingerprint } from "../../helpers/addressFingerprint";
import { getEffectiveShipFrom } from "../../helpers/settings";
import { getUpsAccessTokenV2 } from "./auth";
import { getUpsServiceName, parseUpsTransitDays } from "./serviceCodes";

export type UpsRateInput = {
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

export async function fetchUpsRatesV2(
  ctx: ActionCtx,
  args: UpsRateInput,
): Promise<{ success: true; provider: "ups"; quotes: NormalizedShippingQuote[] }> {
  const rateContext = await ctx.runQuery(
    internal.shipping.internals.getRateContextForSession,
    { sessionToken: args.sessionToken },
  );
  if (!rateContext?.checkoutSession || !rateContext.cart) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Checkout session not found." });
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
      message:
        "Ship-from address is incomplete. Configure a default ship-from location or fill in commerce shipping settings.",
    });
  }

  const { accessToken, credentials } = await getUpsAccessTokenV2(ctx);

  const shippableItems = (rateContext.items as any[]).filter(
    (i: any) => i.product && i.product.isVirtual !== true,
  );
  const totalWeightOz =
    args.packages?.reduce((sum, pkg) => sum + pkg.weightOz, 0) ??
    shippableItems.reduce(
      (sum: number, item: any) =>
        sum + Math.max(1, item.product?.shippingWeightOz ?? 16) * item.quantity,
      0,
    );
  const totalWeightLb = Math.max(0.1, totalWeightOz / 16);
  // No hidden production dimensions: require the pipeline to supply packed
  // boxes. If it didn't (unconfigured package catalog), UPS is rated on
  // weight alone with a 1x1x1 placeholder that signals "unspecified dims"
  // to the carrier rather than a fictitious cubic-foot box.
  const pkgs = args.packages?.length
    ? args.packages
    : [{ weightOz: totalWeightOz, lengthIn: 1, widthIn: 1, heightIn: 1 }];

  const requestBody = {
    RateRequest: {
      Request: {
        RequestOption: "Shop",
        TransactionReference: {
          CustomerContext: rateContext.checkoutSession._id,
        },
      },
      Shipment: {
        Shipper: {
          Name: shippingSettings.shipFromCompany || shippingSettings.shipFromName || "Shipper",
          ShipperNumber: credentials.accountNumber,
          Address: {
            AddressLine: [shippingSettings.shipFromLine1, shippingSettings.shipFromLine2].filter(
              Boolean,
            ),
            City: shippingSettings.shipFromCity,
            StateProvinceCode: shippingSettings.shipFromState,
            PostalCode: shippingSettings.shipFromPostalCode,
            CountryCode: shippingSettings.shipFromCountryCode,
          },
        },
        ShipTo: {
          Name:
            [args.shippingAddress.firstName, args.shippingAddress.lastName]
              .filter(Boolean)
              .join(" ") || "Recipient",
          Address: {
            AddressLine: [args.shippingAddress.line1, args.shippingAddress.line2].filter(Boolean),
            City: args.shippingAddress.city,
            StateProvinceCode: args.shippingAddress.state,
            PostalCode: args.shippingAddress.postalCode,
            CountryCode: args.shippingAddress.countryCode,
          },
        },
        ShipFrom: {
          Name: shippingSettings.shipFromName || "Shipper",
          Address: {
            AddressLine: [shippingSettings.shipFromLine1, shippingSettings.shipFromLine2].filter(
              Boolean,
            ),
            City: shippingSettings.shipFromCity,
            StateProvinceCode: shippingSettings.shipFromState,
            PostalCode: shippingSettings.shipFromPostalCode,
            CountryCode: shippingSettings.shipFromCountryCode,
          },
        },
        PaymentDetails: {
          ShipmentCharge: {
            Type: "01",
            BillShipper: { AccountNumber: credentials.accountNumber },
          },
        },
        Package: pkgs.map((p) => ({
          PackagingType: { Code: "02" },
          Dimensions: {
            UnitOfMeasurement: { Code: "IN" },
            Length: String(Math.max(1, Math.round(p.lengthIn ?? 6))),
            Width: String(Math.max(1, Math.round(p.widthIn ?? 4))),
            Height: String(Math.max(1, Math.round(p.heightIn ?? 4))),
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: "LBS" },
            Weight: String(Math.max(0.1, p.weightOz / 16).toFixed(1)),
          },
        })),
        RateInformation: { NegotiatedRatesIndicator: "" },
      },
    },
  };

  async function postRate(token: string): Promise<Response> {
    return fetch(
      `${credentials.apiBaseUrl}/api/rating/v2409/Rate?additionalinfo=timeintransit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-merchant-id": credentials.accountNumber,
          transId: `cp-${Date.now()}`,
          transactionSrc: "convexpress",
        },
        body: JSON.stringify(requestBody),
      },
    );
  }

  // Retry once on 401: token may have expired mid-flight. Invalidate cache
  // and fetch a fresh token before the second attempt.
  let response = await postRate(accessToken);
  if (response.status === 401) {
    try {
      await ctx.runMutation(
        internal.shipping.providers._shared.tokenCache.invalidateForProvider,
        { provider: "ups" },
      );
    } catch {
      // If invalidation helper is absent, the next getUpsAccessTokenV2 call
      // will still refresh naturally because our cached row will be stale.
    }
    const fresh = await getUpsAccessTokenV2(ctx);
    response = await postRate(fresh.accessToken);
  }

  if (!response.ok) {
    const body = await response.text();
    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "ups",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });
    throw new ConvexError({
      code: "UPS_RATE_ERROR",
      message: body.slice(0, 500) || "Failed to fetch UPS rates.",
    });
  }

  const data = (await response.json()) as any;
  const rates =
    data?.RateResponse?.RatedShipment ??
    (Array.isArray(data?.RateResponse) ? data.RateResponse : []);
  const ratesArr: any[] = Array.isArray(rates) ? rates : [rates].filter(Boolean);

  const addressKey = computeAddressFingerprint(args.shippingAddress);
  const cartKey = (rateContext.items as any[])
    .map((i: any) => `${i.productId}:${i.variantId ?? ""}:${i.quantity}`)
    .sort()
    .join(",");

  const quotes: Omit<
    NormalizedShippingQuote,
    "isCheapest" | "isFastest" | "isBestValue"
  >[] = ratesArr.map((r: any) => {
    const serviceCode = String(r?.Service?.Code ?? "");
    const negotiated = r?.NegotiatedRateCharges?.TotalCharge?.MonetaryValue;
    const standard = r?.TotalCharges?.MonetaryValue;
    const amount = Number(negotiated ?? standard ?? 0);
    const currency = String(
      r?.NegotiatedRateCharges?.TotalCharge?.CurrencyCode ??
        r?.TotalCharges?.CurrencyCode ??
        "USD",
    );
    const transitDays = parseUpsTransitDays(r);
    return {
      quoteKey: `ups:${serviceCode}`,
      provider: "ups",
      carrierCode: "ups",
      carrierName: "UPS",
      serviceCode,
      serviceName: getUpsServiceName(serviceCode),
      // Normalize to cents to match the rest of the pipeline. UPS
      // MonetaryValue is returned as a decimal-string dollar amount.
      amount: Math.round(Number(amount || 0) * 100) || 0,
      currency,
      estimatedDaysMin: transitDays || undefined,
      estimatedDaysMax: transitDays || undefined,
      rawQuote: { ...r, addressKey, cartKey },
    };
  });

  await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
    provider: "ups",
    status: "connected",
    lastSyncAt: Date.now(),
  });

  return { success: true, provider: "ups", quotes: rankQuotes(quotes) };
}
