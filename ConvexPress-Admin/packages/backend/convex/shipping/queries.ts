// @ts-nocheck
import { v } from "convex/values";

import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/auth";
import { requireCommerceEnabled } from "../commerce/helpers";
import { computeAddressKey, computeCartKey } from "../commerce/checkoutShippingGuards";
import {
  SHIPPING_PROVIDERS,
  type ShippingProvider,
  type ShippingSettingsSection,
  getShippingSettingsSection,
  requireShippingAdmin,
} from "./helpers";
import { getShippingProviderDescriptor } from "./providers";
import { getProviderConnectionArgs } from "./validators";

export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireShippingAdmin(ctx);

    const integrationSettings = await getShippingSettingsSection(
      ctx,
      "integrations.shipping",
    );
    const connections = await ctx.db
      .query("shipping_provider_connections")
      .collect();
    const secrets = await ctx.db.query("shipping_provider_secrets").collect();
    const accounts = await ctx.db.query("shipping_provider_accounts").collect();

    const providers = await Promise.all(
      SHIPPING_PROVIDERS.map(async (provider) => {
        const connection = connections.find((entry) => entry.provider === provider) ?? null;
        const accountCount = accounts.filter((entry) => entry.provider === provider).length;
        const settings = await getShippingSettingsSection(
          ctx,
          `integrations.shipping.${provider}` as ShippingSettingsSection,
        );
        return {
          provider,
          descriptor: getShippingProviderDescriptor(provider),
          connection,
          secretStored: Boolean(
            connection &&
              secrets.some((secret) => secret.connectionId === connection._id),
          ),
          settings,
          accountCount,
        };
      }),
    );

    return {
      integrationSettings,
      providers,
    };
  },
});

export const getProviderConnection = query({
  args: getProviderConnectionArgs,
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);

    const section =
      `integrations.shipping.${args.provider}` as ShippingSettingsSection;
    const settings = await getShippingSettingsSection(ctx, section);
    const connection = await ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();
    const accounts = connection
      ? await ctx.db
          .query("shipping_provider_accounts")
          .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
          .collect()
      : [];
    const services = connection
      ? await ctx.db
          .query("shipping_provider_services")
          .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
          .collect()
      : [];

    return {
      provider: args.provider,
      descriptor: getShippingProviderDescriptor(args.provider),
      settings,
      connection,
      secretStored: Boolean(connection
        ? await ctx.db
            .query("shipping_provider_secrets")
            .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
            .unique()
        : null),
      accounts,
      services,
    };
  },
});

export const listCheckoutQuotes = query({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);

    const checkoutSessions = await ctx.db
      .query("commerce_checkout_sessions")
      .withIndex("by_session", (q) => q.eq("sessionToken", args.sessionToken))
      .collect();
    const checkoutSession =
      checkoutSessions.find((session) =>
        ["draft", "collecting_shipping", "collecting_payment", "ready_for_review", "payment_pending"].includes(session.status),
      ) ??
      checkoutSessions[0] ??
      null;

    if (!checkoutSession) return [];

    const cartItems = await ctx.db
      .query("commerce_cart_items")
      .withIndex("by_cart", (q) => q.eq("cartId", checkoutSession.cartId))
      .collect();
    const currentAddressKey = computeAddressKey(checkoutSession.shippingAddress);
    const currentCartKey = computeCartKey(
      cartItems.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      })),
    );

    const now = Date.now();
    const quotes = (await ctx.db
      .query("commerce_shipping_rate_quotes")
      .withIndex("by_checkout", (q) => q.eq("checkoutSessionId", checkoutSession._id))
      .collect()).filter(
        (quote) =>
          Number(quote.expiresAt ?? 0) > now &&
          (!quote.addressKey || quote.addressKey === currentAddressKey) &&
          (!quote.cartKey || quote.cartKey === currentCartKey),
      );

    quotes.sort((a, b) => {
      if (a.isCheapest !== b.isCheapest) return a.isCheapest ? -1 : 1;
      if (a.amount !== b.amount) return a.amount - b.amount;
      if (a.isBestValue !== b.isBestValue) return a.isBestValue ? -1 : 1;
      if (a.isFastest !== b.isFastest) return a.isFastest ? -1 : 1;
      return (a.estimatedDaysMax ?? 9999) - (b.estimatedDaysMax ?? 9999);
    });

    return quotes;
  },
});

export const getRecentQuoteDiagnostics = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    const limit = args.limit ?? 25;
    return ctx.db
      .query("shipping_quote_diagnostics")
      .withIndex("by_requestedAt")
      .order("desc")
      .take(limit);
  },
});

export const listZonesWithMethods = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const zones = await ctx.db.query("commerce_shipping_zones").collect();
    const methods = await ctx.db.query("commerce_shipping_zone_methods").collect();

    return zones
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((zone) => ({
        ...zone,
        methods: methods
          .filter((method) => method.zoneId === zone._id)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      }));
  },
});

// ---------------------------------------------------------------------------
// Shipping Packages
// ---------------------------------------------------------------------------

export const listPackages = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const packages = await ctx.db.query("commerce_shipping_packages").collect();
    return packages.sort(
      (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );
  },
});

export const getPackage = query({
  args: { packageId: v.id("commerce_shipping_packages") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return ctx.db.get(args.packageId);
  },
});

export const getProviderCapabilities = query({
  args: {},
  handler: async (ctx) => {
    await requireShippingAdmin(ctx);

    const connections = await ctx.db.query("shipping_provider_connections").collect();
    const accounts = await ctx.db.query("shipping_provider_accounts").collect();

    return connections.map((conn) => {
      const providerAccounts = accounts.filter((account) =>
        account.provider === conn.provider
      );
      const primaryAccount = providerAccounts[0];
      return {
        provider: conn.provider as ShippingProvider,
        status: conn.status,
        enabled: conn.enabled,
        supportsRates: primaryAccount?.supportsRates ?? false,
        supportsLabels: primaryAccount?.supportsLabels ?? false,
        supportsTracking: primaryAccount?.supportsTracking ?? false,
        supportsManifests: primaryAccount?.supportsManifests ?? false,
        supportsReturns: primaryAccount?.supportsReturns ?? false,
      };
    });
  },
});
