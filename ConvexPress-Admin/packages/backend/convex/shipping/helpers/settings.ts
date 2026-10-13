/**
 * Tier 3.3 — Typed settings getters for the shipping system.
 *
 * Action handlers read shipping settings via `ctx.runQuery`. These helpers
 * call the typed queries in `shipping/settingsInternals.ts`, which merge the
 * stored values with the canonical defaults from `settings/defaults.ts` and
 * validate every field.
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
import type { Id } from "../../_generated/dataModel";

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
  shipFromLocationId: Id<"commerce_ship_from_locations"> | null;
  shipFromPhone?: string;
};

export async function getEffectiveShipFrom(
  ctx: ActionCtx,
): Promise<EffectiveShipFromSettings> {
  const integration = await getShippingIntegrationSettings(ctx);
  const loc = await ctx.runQuery(
    internal.shipping.shipFromLocations.internals.getDefault,
    {},
  );
  if (loc?.address) {
    return {
      ...integration,
      shipFromLine1: loc.address.line1 ?? integration.shipFromLine1 ?? "",
      shipFromLine2: loc.address.line2 ?? "",
      shipFromCity: loc.address.city ?? integration.shipFromCity ?? "",
      shipFromState: loc.address.state ?? integration.shipFromState ?? "",
      shipFromPostalCode:
        loc.address.postalCode ?? integration.shipFromPostalCode ?? "",
      shipFromCountryCode:
        loc.address.countryCode ?? integration.shipFromCountryCode ?? "",
      shipFromName: loc.address.contactName ?? loc.name ?? integration.shipFromName ?? "",
      shipFromCompany:
        loc.address.companyName ?? integration.shipFromCompany ?? "",
      shipFromPhone: loc.address.phone ?? "",
      shipFromLocationId: loc._id,
    };
  }
  return { ...integration, shipFromLocationId: null };
}
import type { ShippingIntegrationSettings, ShippingProviderSettings } from "../../settings/defaults";
// Inline provider union to avoid ambiguity between shipping/helpers.ts (file)
// and shipping/helpers/ (dir) resolution.
type ShippingProvider = "shipstation" | "ups" | "usps" | "fedex" | "dhl";

export async function getShippingIntegrationSettings(
  ctx: ActionCtx,
): Promise<ShippingIntegrationSettings> {
  return await ctx.runQuery(internal.shipping.settingsInternals.getShippingIntegrationSettings, {});
}

export async function getShippingProviderSettings(
  ctx: ActionCtx,
  provider: ShippingProvider,
): Promise<ShippingProviderSettings> {
  return await ctx.runQuery(internal.shipping.settingsInternals.getShippingProviderSettings, { provider });
}
