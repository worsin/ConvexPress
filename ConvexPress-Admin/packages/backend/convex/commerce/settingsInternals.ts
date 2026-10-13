/**
 * Typed settings reads for commerce code.
 *
 * Settings rows store their values untyped. These helpers merge them with the
 * section defaults and narrow each field commerce reads, falling back to the
 * default when a stored value has the wrong shape. Action code reads them
 * through the internal queries below instead of a loosely typed settings bag.
 *
 * Secret fields are returned as stored (possibly `enc:`/`b64:` ciphertext);
 * callers resolve them with `resolveServiceKeyAsync`, as before.
 */
import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { getSettingsDoc, mergeWithDefaults } from "../settings/helpers";
import { COMMERCE_ASSISTANT_DEFAULTS, type SettingsSection } from "../settings/defaults";

type Values = Record<string, unknown>;

export async function readSettingsValues(ctx: Pick<QueryCtx, "db">, section: SettingsSection): Promise<Values> {
  const doc = await getSettingsDoc(ctx, section);
  const stored: unknown = doc?.values;
  const record: Values | null = typeof stored === "object" && stored !== null && !Array.isArray(stored) ? { ...stored } : null;
  return mergeWithDefaults(section, record);
}

export function stringSetting(values: Values, key: string, fallback = ""): string {
  const value = values[key];
  return typeof value === "string" ? value : fallback;
}
export function booleanSetting(values: Values, key: string, fallback: boolean): boolean {
  const value = values[key];
  return typeof value === "boolean" ? value : fallback;
}
export function numberSetting(values: Values, key: string, fallback: number): number {
  const value = values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
export function literalSetting<T extends string>(values: Values, key: string, allowed: readonly T[], fallback: T): T {
  const value = values[key];
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

export const paymentSettingsValidator = v.object({
  stripeSecretKey: v.string(),
  stripeWebhookSecret: v.string(),
  paypalClientId: v.string(),
  paypalClientSecret: v.string(),
  /** As stored (callers normalize; "live" also means production). */
  paypalMode: v.string(),
  taxProviderMode: v.string(),
});

/** commerce.payments — the provider credentials and modes payment/tax actions use. */
export const getPaymentSettings = internalQuery({
  args: {},
  returns: paymentSettingsValidator,
  handler: async (ctx) => {
    const values = await readSettingsValues(ctx, "commerce.payments");
    return {
      stripeSecretKey: stringSetting(values, "stripeSecretKey"),
      stripeWebhookSecret: stringSetting(values, "stripeWebhookSecret"),
      paypalClientId: stringSetting(values, "paypalClientId"),
      paypalClientSecret: stringSetting(values, "paypalClientSecret"),
      paypalMode: stringSetting(values, "paypalMode"),
      taxProviderMode: stringSetting(values, "taxProviderMode"),
    };
  },
});

/** general.siteUrl — the public site origin used for provider return URLs. */
export const getSiteUrl = internalQuery({
  args: {},
  returns: v.string(),
  handler: async (ctx) => stringSetting(await readSettingsValues(ctx, "general"), "siteUrl"),
});

/** ai — the provider selection and credential the shopping assistant uses. */
export const getAssistantAiSettings = internalQuery({
  args: {},
  returns: v.object({ provider: v.string(), apiKey: v.string(), defaultModel: v.string() }),
  handler: async (ctx) => {
    const values = await readSettingsValues(ctx, "ai");
    return {
      provider: stringSetting(values, "provider", "openrouter"),
      apiKey: stringSetting(values, "apiKey"),
      defaultModel: stringSetting(values, "defaultModel"),
    };
  },
});

/** The commerce.assistant fields the assistant runtime reads. */
export type AssistantRuntimeSettings = {
  enabled: boolean;
  model: string;
  memoryEnabled: boolean;
  memoryRetentionDays: number;
  tone: string;
  disclosureText: string;
  cardsPerGroup: number;
  maxPicks: number;
  rateLimitPerMinute: number;
  groups: { accessory: boolean; consumable: boolean; maintenance: boolean; upgrade: boolean; similar: boolean };
};

export async function readAssistantSettings(ctx: Pick<QueryCtx, "db">): Promise<AssistantRuntimeSettings> {
  const values = await readSettingsValues(ctx, "commerce.assistant");
  const d = COMMERCE_ASSISTANT_DEFAULTS;
  const groupsValue = values.groups;
  const groups: Values = typeof groupsValue === "object" && groupsValue !== null && !Array.isArray(groupsValue) ? { ...groupsValue } : {};
  return {
    enabled: booleanSetting(values, "enabled", d.enabled),
    model: stringSetting(values, "model", d.model),
    memoryEnabled: booleanSetting(values, "memoryEnabled", d.memoryEnabled),
    memoryRetentionDays: numberSetting(values, "memoryRetentionDays", d.memoryRetentionDays),
    tone: stringSetting(values, "tone", d.tone),
    disclosureText: stringSetting(values, "disclosureText", d.disclosureText),
    cardsPerGroup: numberSetting(values, "cardsPerGroup", d.cardsPerGroup),
    maxPicks: numberSetting(values, "maxPicks", d.maxPicks),
    rateLimitPerMinute: numberSetting(values, "rateLimitPerMinute", d.rateLimitPerMinute),
    groups: {
      accessory: booleanSetting(groups, "accessory", d.groups.accessory),
      consumable: booleanSetting(groups, "consumable", d.groups.consumable),
      maintenance: booleanSetting(groups, "maintenance", d.groups.maintenance),
      upgrade: booleanSetting(groups, "upgrade", d.groups.upgrade),
      similar: booleanSetting(groups, "similar", d.groups.similar),
    },
  };
}
