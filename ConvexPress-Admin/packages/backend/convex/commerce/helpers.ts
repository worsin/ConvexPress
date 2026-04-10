import { ConvexError } from "convex/values";

import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  COMMERCE_GENERAL_DEFAULTS,
  PLUGINS_DEFAULTS,
  type CommerceGeneralSettings,
  type PluginsSettings,
} from "../settings/defaults";

type CommerceCtx = QueryCtx | MutationCtx;

async function getPluginSettings(ctx: CommerceCtx): Promise<PluginsSettings> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: any) => q.eq("section", "plugins"))
    .unique();

  return {
    ...PLUGINS_DEFAULTS,
    ...(doc?.values ?? {}),
  } as PluginsSettings;
}

export async function getCommerceSettings(
  ctx: CommerceCtx,
): Promise<CommerceGeneralSettings> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: any) => q.eq("section", "commerce.general"))
    .unique();

  return {
    ...COMMERCE_GENERAL_DEFAULTS,
    ...(doc?.values ?? {}),
  } as CommerceGeneralSettings;
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

export async function isCommerceEnabled(ctx: CommerceCtx): Promise<boolean> {
  const settings = await getPluginSettings(ctx);
  return settings.commerceEnabled;
}

export async function requireCommerceEnabled(ctx: CommerceCtx): Promise<void> {
  if (!(await isCommerceEnabled(ctx))) {
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
): Promise<boolean> {
  const settings = await getPluginSettings(ctx);
  return settings.commerceEnabled && (settings as any).commerceReviewsEnabled;
}

export async function isMembershipPluginEnabled(
  ctx: CommerceCtx,
): Promise<boolean> {
  const settings = await getPluginSettings(ctx);
  return settings.membershipEnabled;
}
