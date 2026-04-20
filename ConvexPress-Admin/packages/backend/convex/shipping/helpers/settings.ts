/**
 * Tier 3.3 — Typed settings getters for the shipping system.
 *
 * Action handlers need to read shipping settings via `ctx.runQuery`, which
 * returns `any`. These helpers wrap the internal query and cast to the
 * canonical setting types defined in `settings/defaults.ts`, so callers can
 * drop the ad-hoc `: any` annotations they were sprinkling on every read.
 *
 * Usage (action context):
 *   const shippingSettings = await getShippingIntegrationSettings(ctx);
 *   if (shippingSettings.liveRatesEnabled) { ... }
 *
 *   const uspsSettings = await getShippingProviderSettings(ctx, "usps");
 *   const mode = uspsSettings.mode; // "sandbox" | "production"
 *
 *   const origin = await getEffectiveShipFrom(ctx);
 *   // origin.shipFromLine1, .shipFromCity, .shipFromPostalCode, etc.
 */

import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";

/**
 * Resolve the effective ship-from address for carrier rate calls. Prefers
 * the default ship-from location (PRD A4) and falls back to the global
 * `integrations.shipping` settings when no location is configured. Returns
 * a shape compatible with callers that previously read `shippingSettings`
 * directly — any existing rate fetcher can do:
 *
 *   const origin = await getEffectiveShipFrom(ctx);
 *   // origin.shipFromLine1, .shipFromCity, .shipFromPostalCode, etc.
 */
export type EffectiveShipFromSettings = ShippingIntegrationSettings & {
  shipFromLocationId: string | null;
};

export async function getEffectiveShipFrom(
  ctx: ActionCtx,
): Promise<EffectiveShipFromSettings> {
  const integration = await getShippingIntegrationSettings(ctx);
  try {
    const loc: any = await ctx.runQuery(
      internal.shipping.shipFromLocations.internals.getDefault,
      {},
    );
    if (loc?.address) {
      return {
        ...integration,
        shipFromLine1: loc.address.line1 ?? integration.shipFromLine1 ?? "",
        shipFromLine2: loc.address.line2 ?? integration.shipFromLine2 ?? "",
        shipFromCity: loc.address.city ?? integration.shipFromCity ?? "",
        shipFromState: loc.address.state ?? integration.shipFromState ?? "",
        shipFromPostalCode:
          loc.address.postalCode ?? integration.shipFromPostalCode ?? "",
        shipFromCountryCode:
          loc.address.countryCode ?? integration.shipFromCountryCode ?? "",
        shipFromName: loc.name ?? integration.shipFromName ?? "",
        shipFromCompany:
          loc.companyName ?? integration.shipFromCompany ?? "",
        shipFromLocationId: String(loc._id),
      };
    }
  } catch {
    // fall through to integration defaults
  }
  return { ...integration, shipFromLocationId: null };
}
import {
  SHIPPING_INTEGRATION_DEFAULTS,
  SHIPPING_PROVIDER_DEFAULTS,
  type ShippingIntegrationSettings,
  type ShippingProviderSettings,
} from "../../settings/defaults";
// Inline provider union to avoid ambiguity between shipping/helpers.ts (file)
// and shipping/helpers/ (dir) resolution.
type ShippingProvider = "shipstation" | "ups" | "usps" | "fedex" | "dhl";

export async function getShippingIntegrationSettings(
  ctx: ActionCtx,
): Promise<ShippingIntegrationSettings> {
  const raw = (await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "integrations.shipping" },
  )) as Partial<ShippingIntegrationSettings> | null;
  return { ...SHIPPING_INTEGRATION_DEFAULTS, ...(raw ?? {}) };
}

export async function getShippingProviderSettings(
  ctx: ActionCtx,
  provider: ShippingProvider,
): Promise<ShippingProviderSettings> {
  const raw = (await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: `integrations.shipping.${provider}` as any },
  )) as Partial<ShippingProviderSettings> | null;
  return { ...SHIPPING_PROVIDER_DEFAULTS, ...(raw ?? {}) };
}
