import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { ConvexError } from "convex/values";

import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  COMMERCE_PAYMENTS_DEFAULTS,
  COMMERCE_GENERAL_DEFAULTS,
  PLUGINS_DEFAULTS,
  type CommercePaymentsSettings,
  type CommerceGeneralSettings,
  type PluginsSettings,
} from "../settings/defaults";

type CommerceCtx = Pick<QueryCtx, "db">;
const IMPLEMENTED_CHECKOUT_PAYMENT_METHOD_CODES = new Set([
  "card",
  "manual_invoice",
  "cash_on_delivery",
]);

async function getPluginSettings(ctx: CommerceCtx, budget?: RequestReadLedger): Promise<PluginsSettings> {
  budget?.beforeRead();
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", "plugins"))
    .unique();

  budget?.record(doc);
  // Stored settings values are untyped; the section's defaults define the shape.
  const stored: Partial<PluginsSettings> = doc?.values ?? {};
  return { ...PLUGINS_DEFAULTS, ...stored };
}

export async function getCommerceSettings(
  ctx: CommerceCtx,
): Promise<CommerceGeneralSettings> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", "commerce.general"))
    .unique();

  const stored: Partial<CommerceGeneralSettings> = doc?.values ?? {};
  return { ...COMMERCE_GENERAL_DEFAULTS, ...stored };
}

export async function getCommercePaymentsSettings(
  ctx: CommerceCtx,
): Promise<CommercePaymentsSettings> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", "commerce.payments"))
    .unique();

  const stored: Partial<CommercePaymentsSettings> = doc?.values ?? {};
  return { ...COMMERCE_PAYMENTS_DEFAULTS, ...stored };
}

export function getEnabledShippingMethods(
  settings: CommerceGeneralSettings,
): Array<{ code: string; label: string }> {
  if (!settings.shippingEnabled) {
    return [];
  }

  return settings.shippingMethods.filter(
    (method) => method.code.trim().length > 0 && method.label.trim().length > 0,
  );
}

export function getEnabledPaymentMethods(
  settings: CommerceGeneralSettings,
): Array<{ code: string; label: string; enabled: boolean }> {
  return settings.paymentMethods.filter(
    (method) =>
      method.enabled &&
      method.code.trim().length > 0 &&
      method.label.trim().length > 0,
  );
}

export function isCheckoutPaymentMethodImplemented(code: string): boolean {
  return IMPLEMENTED_CHECKOUT_PAYMENT_METHOD_CODES.has(code);
}

export function getEnabledCheckoutPaymentMethods(
  settings: CommerceGeneralSettings,
): Array<{ code: string; label: string; enabled: boolean }> {
  return getEnabledPaymentMethods(settings).filter((method) =>
    isCheckoutPaymentMethodImplemented(method.code),
  );
}

export async function isCommerceEnabled(ctx: CommerceCtx, budget?: RequestReadLedger): Promise<boolean> {
  const settings = await getPluginSettings(ctx, budget);
  return settings.commerceEnabled;
}

export async function isCommerceReturnsEnabled(
  ctx: CommerceCtx,
): Promise<boolean> {
  const settings = await getPluginSettings(ctx);
  return settings.commerceEnabled && settings.commerceReturnsEnabled;
}

export async function isCommerceDigitalEnabled(
  ctx: CommerceCtx,
): Promise<boolean> {
  const settings = await getPluginSettings(ctx);
  return settings.commerceEnabled && settings.commerceDigitalEnabled;
}

export async function requireCommerceDigitalEnabled(
  ctx: CommerceCtx,
): Promise<void> {
  await requireCommerceEnabled(ctx);

  if (!(await isCommerceDigitalEnabled(ctx))) {
    throw new ConvexError({
      code: "commerce_digital_disabled",
      message: "Commerce Digital plugin is disabled.",
    });
  }
}

export async function requireCommerceEnabled(ctx: CommerceCtx, budget?: RequestReadLedger): Promise<void> {
  if (!(await isCommerceEnabled(ctx, budget))) {
    throw new ConvexError({
      code: "commerce_disabled",
      message: "Commerce plugin is disabled.",
    });
  }
}

export async function isCommerceSubscriptionsEnabled(
  ctx: CommerceCtx,
): Promise<boolean> {
  const settings = await getPluginSettings(ctx);
  return settings.commerceEnabled && settings.commerceSubscriptionsEnabled;
}

export async function isCommerceReviewsEnabled(
  ctx: CommerceCtx,
  budget?: RequestReadLedger,
): Promise<boolean> {
  const settings = await getPluginSettings(ctx, budget);
  return settings.commerceEnabled && settings.commerceReviewsEnabled;
}

export async function isCommerceWishlistsEnabled(
  ctx: CommerceCtx,
): Promise<boolean> {
  const settings = await getPluginSettings(ctx);
  return settings.commerceEnabled && settings.commerceWishlistsEnabled;
}

export async function isMembershipPluginEnabled(
  ctx: CommerceCtx,
  budget?: RequestReadLedger,
): Promise<boolean> {
  const settings = await getPluginSettings(ctx, budget);
  return settings.membershipEnabled;
}
