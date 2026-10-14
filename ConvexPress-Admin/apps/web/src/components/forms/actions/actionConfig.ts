/**
 * Form action configs, read and written with their types.
 *
 * An action's config is stored as JSON. These readers take the stored object
 * field by field (a value of the wrong type reads as absent), and the
 * subscription writer emits only the keys its mode uses, so a saved config
 * never carries a stale offer id or coupon from a mode the operator left.
 */

export type ConfigBag = Record<string, unknown>;

export function parseConfig(json: string | undefined): ConfigBag {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const bag: ConfigBag = {};
    for (const [key, value] of Object.entries(parsed)) bag[key] = value;
    return bag;
  } catch {
    return {};
  }
}

export function textOf(config: ConfigBag, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

export function numberOf(config: ConfigBag, key: string): number | undefined {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function stringMapOf(config: ConfigBag, key: string): Record<string, string> {
  const value = config[key];
  const map: Record<string, string> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return map;
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue === "string") map[entryKey] = entryValue;
  }
  return map;
}

/** The config with `patch` applied; empty strings and undefined remove a key. */
export function withConfig(config: ConfigBag, patch: Record<string, string | number | Record<string, string> | undefined>): ConfigBag {
  const next: ConfigBag = { ...config };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
  }
  return next;
}

// ─── Subscription / payment ────────────────────────────────────────────────

export type OfferMode = "fixed" | "fromField";
export type CouponMode = "none" | "fixed" | "fromField";
export type AccountPolicy = "require_existing" | "create_on_website";

export interface SubscriptionConfig {
  offerMode: OfferMode;
  offerId: string;
  offerFieldName: string;
  /** Choice value → offer id. */
  offerFieldMap: Record<string, string>;
  emailFieldName: string;
  couponMode: CouponMode;
  couponCode: string;
  couponFieldName: string;
  accountPolicy: AccountPolicy;
  returnUrl: string;
  /** Integer minor units; undefined = no cap. */
  maxInitialAmount: number | undefined;
}

export function readSubscriptionConfig(config: ConfigBag): SubscriptionConfig {
  const offerMode = config.offerMode === "fromField" ? "fromField" : "fixed";
  const couponMode = config.couponMode === "fixed" || config.couponMode === "fromField" ? config.couponMode : "none";
  return {
    offerMode,
    offerId: textOf(config, "offerId"),
    offerFieldName: textOf(config, "offerFieldName"),
    offerFieldMap: stringMapOf(config, "offerFieldMap"),
    emailFieldName: textOf(config, "emailFieldName"),
    couponMode,
    couponCode: textOf(config, "couponCode"),
    couponFieldName: textOf(config, "couponFieldName"),
    accountPolicy: config.accountPolicy === "create_on_website" ? "create_on_website" : "require_existing",
    returnUrl: textOf(config, "returnUrl"),
    maxInitialAmount: numberOf(config, "maxInitialAmount"),
  };
}

/** The stored form: only what the chosen modes use. */
export function writeSubscriptionConfig(config: SubscriptionConfig): ConfigBag {
  const out: ConfigBag = { offerMode: config.offerMode, accountPolicy: config.accountPolicy };
  if (config.offerMode === "fixed") {
    if (config.offerId) out.offerId = config.offerId;
  } else {
    if (config.offerFieldName) out.offerFieldName = config.offerFieldName;
    const map: Record<string, string> = {};
    for (const [choice, offerId] of Object.entries(config.offerFieldMap)) if (offerId) map[choice] = offerId;
    if (Object.keys(map).length > 0) out.offerFieldMap = map;
  }
  if (config.emailFieldName) out.emailFieldName = config.emailFieldName;
  out.couponMode = config.couponMode;
  if (config.couponMode === "fixed" && config.couponCode.trim()) out.couponCode = config.couponCode.trim();
  if (config.couponMode === "fromField" && config.couponFieldName) out.couponFieldName = config.couponFieldName;
  if (config.returnUrl.trim()) out.returnUrl = config.returnUrl.trim();
  if (config.maxInitialAmount !== undefined) out.maxInitialAmount = config.maxInitialAmount;
  return out;
}

export interface SubscriptionConfigProblems {
  offer?: string;
  offerField?: string;
  email?: string;
  coupon?: string;
}

/**
 * What would stop this config from saving or checking out, per section. The
 * server checks the same rules (and that the plans and fields exist).
 */
export function subscriptionConfigProblems(
  config: SubscriptionConfig,
  choiceCount: number,
): SubscriptionConfigProblems {
  const problems: SubscriptionConfigProblems = {};
  if (config.offerMode === "fixed" && !config.offerId) problems.offer = "Choose the plan this form sells.";
  if (config.offerMode === "fromField") {
    if (!config.offerFieldName) problems.offerField = "Choose the field where the buyer picks a plan.";
    else if (choiceCount > 0 && !Object.values(config.offerFieldMap).some(Boolean)) {
      problems.offerField = "Choose a plan for at least one choice.";
    }
  }
  if (config.accountPolicy === "create_on_website" && !config.emailFieldName) {
    problems.email = "Choose the email field: a buyer who isn't signed in is identified by the email they enter.";
  }
  if (config.couponMode === "fixed" && !config.couponCode.trim()) problems.coupon = "Enter the coupon code to apply.";
  if (config.couponMode === "fromField" && !config.couponFieldName) problems.coupon = "Choose the field that holds the coupon code.";
  return problems;
}
