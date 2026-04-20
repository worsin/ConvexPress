"use node";

/**
 * PRD B10 — LiveRateProvider contract.
 *
 * Every concrete carrier provider (ShipStation, UPS, USPS, FedEx, DHL)
 * conforms to this single interface. The rate pipeline routes to providers
 * through `resolveProvider(id)` instead of hardcoding which fetcher to call,
 * so zone-methods of type `live_rate` can point at any registered provider
 * via `provider` + `accountId` + `serviceFilters`.
 */

import type { ActionCtx } from "../../_generated/server";
import type { NormalizedShippingQuote } from "../rates/types";

import { fetchShipStationRatesV2 } from "./shipstation/rates";
import { fetchUspsRatesV2 } from "./usps/rates";
import { fetchFedexRatesV2 } from "./fedex/rates";
import { fetchDhlRatesV2 } from "./dhl/rates";
import { fetchUpsRatesV2 } from "./ups/rates";

import { api } from "../../_generated/api";

/**
 * Bridge that routes purchaseLabel through the legacy
 * `createShippingLabelForOrder` dispatcher. The legacy entry point already
 * branches by provider internally, so a single implementation covers all
 * label-capable carriers today. A future refactor moves each provider's
 * carrier API call into its own module.
 */
async function purchaseLabelViaLegacy(
  ctx: ActionCtx,
  args: LabelPurchaseArgs,
): Promise<LabelPurchaseResult> {
  const r: any = await ctx.runAction(
    (api as any).shipping.actions.createShippingLabelForOrder,
    { orderId: args.orderId },
  );
  return {
    success: Boolean(r?.success ?? true),
    labelUrl: r?.labelUrl ?? r?.label_download?.pdf,
    trackingNumber: r?.trackingNumber ?? r?.tracking_number,
    externalLabelId: r?.externalLabelId ?? r?.label_id,
    shipmentId: r?.shipmentId,
    labelCost: r?.labelCost ?? r?.shipment_cost?.amount,
    labelCurrency: r?.labelCurrency ?? r?.shipment_cost?.currency,
    carrierCode: r?.carrierCode ?? r?.carrier_code,
    serviceCode: r?.serviceCode ?? r?.service_code,
    packages: Array.isArray(r?.packages) ? r.packages : undefined,
  };
}

function unsupportedLabel(providerName: string): LabelPurchaseResult {
  return {
    success: false,
    errorCode: "NOT_SUPPORTED",
    errorMessage: `${providerName} does not support label purchase yet.`,
  };
}

export type ProviderId = "shipstation" | "ups" | "usps" | "fedex" | "dhl";

export type ProviderFetchArgs = {
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
  /** Optional account override (maps to `shipping_provider_accounts._id`). */
  accountId?: string;
  /** Optional service allowlist — when set, provider must filter. */
  serviceFilters?: {
    allow?: string[];
    deny?: string[];
  };
  persistQuotes?: boolean;
};

export type ProviderFetchResult = {
  success: true;
  provider: ProviderId;
  quotes: NormalizedShippingQuote[];
};

export type LabelPurchaseArgs = {
  orderId: string;
  /** Optional: which rated quote to purchase when the order carries one. */
  rateId?: string;
};

export type LabelPurchaseResult = {
  success: boolean;
  labelUrl?: string;
  trackingNumber?: string;
  externalLabelId?: string;
  shipmentId?: any;
  labelCost?: number;
  labelCurrency?: string;
  carrierCode?: string;
  serviceCode?: string;
  /** When carriers return per-package results, the full list. */
  packages?: any[];
  errorCode?: string;
  errorMessage?: string;
};

export type LiveRateProvider = {
  id: ProviderId;
  /** Human label for logs/diagnostics. */
  displayName: string;
  capabilities: {
    rates: boolean;
    labels: boolean;
    tracking: boolean;
    manifests: boolean;
    addressValidation: boolean;
  };
  fetchRates(ctx: ActionCtx, args: ProviderFetchArgs): Promise<ProviderFetchResult>;
  /** Purchase a label for a finalized order. Throws NOT_SUPPORTED when `capabilities.labels === false`. */
  purchaseLabel(ctx: ActionCtx, args: LabelPurchaseArgs): Promise<LabelPurchaseResult>;
};

/**
 * Apply service allow/deny filters to a provider's normalized quotes.
 * Called after every provider fetch when `serviceFilters` are configured
 * on the live_rate zone-method.
 */
export function applyServiceFilters(
  quotes: NormalizedShippingQuote[],
  filters: { allow?: string[]; deny?: string[] } | undefined,
): NormalizedShippingQuote[] {
  if (!filters) return quotes;
  const allow = filters.allow && filters.allow.length > 0 ? new Set(filters.allow) : null;
  const deny = filters.deny && filters.deny.length > 0 ? new Set(filters.deny) : null;
  return quotes.filter((q) => {
    if (allow && !allow.has(q.serviceCode)) return false;
    if (deny && deny.has(q.serviceCode)) return false;
    return true;
  });
}

const shipstation: LiveRateProvider = {
  id: "shipstation",
  displayName: "ShipStation",
  capabilities: {
    rates: true,
    labels: true,
    tracking: true,
    manifests: true,
    addressValidation: false,
  },
  fetchRates: (ctx, args) => fetchShipStationRatesV2(ctx, args),
  purchaseLabel: (ctx, args) => purchaseLabelViaLegacy(ctx, args),
};

const usps: LiveRateProvider = {
  id: "usps",
  displayName: "USPS",
  capabilities: {
    rates: true,
    labels: false,
    tracking: true,
    manifests: false,
    addressValidation: true,
  },
  fetchRates: (ctx, args) => fetchUspsRatesV2(ctx, args),
  purchaseLabel: async () => unsupportedLabel("USPS"),
};

const fedex: LiveRateProvider = {
  id: "fedex",
  displayName: "FedEx",
  capabilities: {
    rates: true,
    labels: true,
    tracking: true,
    manifests: true,
    addressValidation: true,
  },
  fetchRates: (ctx, args) => fetchFedexRatesV2(ctx, args),
  purchaseLabel: (ctx, args) => purchaseLabelViaLegacy(ctx, args),
};

const dhl: LiveRateProvider = {
  id: "dhl",
  displayName: "DHL Express",
  capabilities: {
    rates: true,
    labels: false,
    tracking: false,
    manifests: false,
    addressValidation: false,
  },
  fetchRates: (ctx, args) => fetchDhlRatesV2(ctx, args),
  purchaseLabel: async () => unsupportedLabel("DHL"),
};

const ups: LiveRateProvider = {
  id: "ups",
  displayName: "UPS",
  capabilities: {
    rates: true,
    labels: true,
    tracking: true,
    manifests: true,
    addressValidation: false,
  },
  fetchRates: (ctx, args) => fetchUpsRatesV2(ctx, args),
  purchaseLabel: (ctx, args) => purchaseLabelViaLegacy(ctx, args),
};

const REGISTRY: Record<ProviderId, LiveRateProvider> = {
  shipstation,
  usps,
  fedex,
  dhl,
  ups,
};

export function resolveProvider(id: ProviderId): LiveRateProvider {
  return REGISTRY[id];
}

export function allProviders(): LiveRateProvider[] {
  return Object.values(REGISTRY);
}
