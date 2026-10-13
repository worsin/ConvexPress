/**
 * Typed reads of the shipping settings sections for action code.
 *
 * Settings rows store their values untyped; these queries merge them with the
 * code defaults and narrow every field to its declared type, falling back to
 * the default when a stored value has the wrong shape. Actions get exact,
 * validated objects instead of a loosely typed settings bag.
 */
import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { getSettingsDoc, mergeWithDefaults } from "../settings/helpers";
import {
  SHIPPING_INTEGRATION_DEFAULTS,
  SHIPPING_PROVIDER_DEFAULTS,
  type ShippingIntegrationSettings,
  type ShippingProviderSettings,
} from "../settings/defaults";
import { shippingProviderValidator } from "../schema/shipping";

type ShippingProvider = "shipstation" | "ups" | "usps" | "fedex" | "dhl";

export const shippingIntegrationSettingsValidator = v.object({
  preferredProvider: v.union(
    v.literal("shipstation"),
    v.literal("ups"),
    v.literal("usps"),
    v.literal("fedex"),
    v.literal("dhl"),
    v.literal(""),
  ),
  liveRatesEnabled: v.boolean(),
  fallbackToManualRates: v.boolean(),
  fallbackMessage: v.string(),
  recommendationStrategy: v.literal("best_value_weighted"),
  cheapestBadgeLabel: v.string(),
  fastestBadgeLabel: v.string(),
  bestOptionBadgeLabel: v.string(),
  quoteCacheTtlSeconds: v.number(),
  defaultPackageWeightOz: v.number(),
  shipFromName: v.string(),
  shipFromCompany: v.string(),
  shipFromLine1: v.string(),
  shipFromLine2: v.string(),
  shipFromCity: v.string(),
  shipFromState: v.string(),
  shipFromPostalCode: v.string(),
  shipFromCountryCode: v.string(),
});

export const shippingProviderSettingsValidator = v.object({
  enabled: v.boolean(),
  displayName: v.string(),
  mode: v.union(v.literal("sandbox"), v.literal("production")),
  isPrimary: v.boolean(),
  rateShoppingEnabled: v.boolean(),
  rateShoppingPriority: v.number(),
  accountNickname: v.string(),
});

function stringOr(values: Record<string, unknown>, key: string, fallback: string): string {
  const value = values[key];
  return typeof value === "string" ? value : fallback;
}
function booleanOr(values: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = values[key];
  return typeof value === "boolean" ? value : fallback;
}
function numberOr(values: Record<string, unknown>, key: string, fallback: number): number {
  const value = values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function oneOf<T extends string>(values: Record<string, unknown>, key: string, allowed: readonly T[], fallback: T): T {
  const value = values[key];
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

async function storedValues(ctx: Pick<QueryCtx, "db">, section: Parameters<typeof mergeWithDefaults>[0]): Promise<Record<string, unknown>> {
  const doc = await getSettingsDoc(ctx, section);
  const stored: unknown = doc?.values;
  const record: Record<string, unknown> | null =
    typeof stored === "object" && stored !== null && !Array.isArray(stored) ? { ...stored } : null;
  return mergeWithDefaults(section, record);
}

export async function readShippingIntegrationSettings(ctx: Pick<QueryCtx, "db">): Promise<ShippingIntegrationSettings> {
  const values = await storedValues(ctx, "integrations.shipping");
  const d = SHIPPING_INTEGRATION_DEFAULTS;
  return {
    preferredProvider: oneOf(values, "preferredProvider", ["shipstation", "ups", "usps", "fedex", "dhl", ""], d.preferredProvider),
    liveRatesEnabled: booleanOr(values, "liveRatesEnabled", d.liveRatesEnabled),
    fallbackToManualRates: booleanOr(values, "fallbackToManualRates", d.fallbackToManualRates),
    fallbackMessage: stringOr(values, "fallbackMessage", d.fallbackMessage),
    recommendationStrategy: oneOf(values, "recommendationStrategy", ["best_value_weighted"], d.recommendationStrategy),
    cheapestBadgeLabel: stringOr(values, "cheapestBadgeLabel", d.cheapestBadgeLabel),
    fastestBadgeLabel: stringOr(values, "fastestBadgeLabel", d.fastestBadgeLabel),
    bestOptionBadgeLabel: stringOr(values, "bestOptionBadgeLabel", d.bestOptionBadgeLabel),
    quoteCacheTtlSeconds: numberOr(values, "quoteCacheTtlSeconds", d.quoteCacheTtlSeconds),
    defaultPackageWeightOz: numberOr(values, "defaultPackageWeightOz", d.defaultPackageWeightOz),
    shipFromName: stringOr(values, "shipFromName", d.shipFromName),
    shipFromCompany: stringOr(values, "shipFromCompany", d.shipFromCompany),
    shipFromLine1: stringOr(values, "shipFromLine1", d.shipFromLine1),
    shipFromLine2: stringOr(values, "shipFromLine2", d.shipFromLine2),
    shipFromCity: stringOr(values, "shipFromCity", d.shipFromCity),
    shipFromState: stringOr(values, "shipFromState", d.shipFromState),
    shipFromPostalCode: stringOr(values, "shipFromPostalCode", d.shipFromPostalCode),
    shipFromCountryCode: stringOr(values, "shipFromCountryCode", d.shipFromCountryCode),
  };
}

export async function readShippingProviderSettings(
  ctx: Pick<QueryCtx, "db">,
  provider: ShippingProvider,
): Promise<ShippingProviderSettings> {
  const values = await storedValues(ctx, `integrations.shipping.${provider}`);
  const d = SHIPPING_PROVIDER_DEFAULTS;
  return {
    enabled: booleanOr(values, "enabled", d.enabled),
    displayName: stringOr(values, "displayName", d.displayName),
    mode: oneOf(values, "mode", ["sandbox", "production"], d.mode),
    isPrimary: booleanOr(values, "isPrimary", d.isPrimary),
    rateShoppingEnabled: booleanOr(values, "rateShoppingEnabled", d.rateShoppingEnabled),
    rateShoppingPriority: numberOr(values, "rateShoppingPriority", d.rateShoppingPriority),
    accountNickname: stringOr(values, "accountNickname", d.accountNickname),
  };
}

export const getShippingIntegrationSettings = internalQuery({
  args: {},
  returns: shippingIntegrationSettingsValidator,
  handler: async (ctx): Promise<ShippingIntegrationSettings> => readShippingIntegrationSettings(ctx),
});

export const getShippingProviderSettings = internalQuery({
  args: { provider: shippingProviderValidator },
  returns: shippingProviderSettingsValidator,
  handler: async (ctx, args): Promise<ShippingProviderSettings> => readShippingProviderSettings(ctx, args.provider),
});
