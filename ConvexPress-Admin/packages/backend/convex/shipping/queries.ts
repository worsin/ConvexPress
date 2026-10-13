import { assertCheckoutAccess } from "../commerce/shopperAccess";
import { v } from "convex/values";
import { publicShippingQuote, publicShippingQuoteValidator } from "./quoteProvenance";

import { query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "../commerce/helpers";
import { computeAddressKey, computeCartKey } from "../commerce/checkoutShippingGuards";
import {
  SHIPPING_PROVIDERS,
  type ShippingProvider,
  requireShippingAdmin,
} from "./helpers";
import { readShippingIntegrationSettings, readShippingProviderSettings } from "./settingsInternals";
import { getShippingProviderDescriptor } from "./providers";
import { getProviderConnectionArgs } from "./validators";

import { shippingDocs } from "../schema/shipping.docs.generated";
export const getOverview = query({
  args: {},
  returns: v.object({
    integrationSettings: v.object({
      preferredProvider: v.union(v.literal(""), v.literal("shipstation"), v.literal("ups"), v.literal("usps"), v.literal("fedex"), v.literal("dhl")),
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
    }),
    providers: v.array(v.object({
      provider: v.union(v.literal("shipstation"), v.literal("ups"), v.literal("usps"), v.literal("fedex"), v.literal("dhl")),
      descriptor: v.object({
        provider: v.union(v.literal("shipstation"), v.literal("ups"), v.literal("usps"), v.literal("fedex"), v.literal("dhl")),
        title: v.string(),
        summary: v.string(),
        modeNotes: v.string(),
        implementationStatus: v.union(v.literal("active"), v.literal("foundation"), v.literal("planned")),
        operations: v.object({
          returns: v.union(v.literal("planned"), v.literal("implemented"), v.literal("not_supported")),
          rates: v.union(v.literal("planned"), v.literal("implemented"), v.literal("not_supported")),
          labels: v.union(v.literal("planned"), v.literal("implemented"), v.literal("not_supported")),
          tracking: v.union(v.literal("planned"), v.literal("implemented"), v.literal("not_supported")),
          manifests: v.union(v.literal("planned"), v.literal("implemented"), v.literal("not_supported")),
          address_validation: v.union(v.literal("planned"), v.literal("implemented"), v.literal("not_supported")),
        }),
        primaryUseCase: v.string(),
        verificationMode: v.union(v.literal("live_api"), v.literal("local_readiness")),
        credentialFields: v.array(v.object({
          key: v.string(),
          label: v.string(),
          type: v.union(v.literal("url"), v.literal("password"), v.literal("text")),
          placeholder: v.optional(v.string()),
          required: v.boolean(),
        })),
      }),
      connection: v.union(v.null(), shippingDocs.shipping_provider_connections),
      secretStored: v.boolean(),
      settings: v.object({
        enabled: v.boolean(),
        displayName: v.string(),
        mode: v.union(v.literal("sandbox"), v.literal("production")),
        isPrimary: v.boolean(),
        rateShoppingEnabled: v.boolean(),
        rateShoppingPriority: v.number(),
        accountNickname: v.string(),
      }),
      accountCount: v.number(),
    })),
  }),
  handler: async (ctx) => {
    await requireShippingAdmin(ctx);

    const integrationSettings = await readShippingIntegrationSettings(ctx);
    const connections = await ctx.db
      .query("shipping_provider_connections")
      .collect();
    const secrets = await ctx.db.query("shipping_provider_secrets").collect();
    const accounts = await ctx.db.query("shipping_provider_accounts").collect();

    const providers = await Promise.all(
      SHIPPING_PROVIDERS.map(async (provider) => {
        const connection = connections.find((entry) => entry.provider === provider) ?? null;
        const accountCount = accounts.filter((entry) => entry.provider === provider).length;
        const settings = await readShippingProviderSettings(ctx, provider);
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
  returns: v.object({
    provider: v.union(v.literal("shipstation"), v.literal("ups"), v.literal("usps"), v.literal("fedex"), v.literal("dhl")),
    descriptor: v.object({
      provider: v.union(v.literal("shipstation"), v.literal("ups"), v.literal("usps"), v.literal("fedex"), v.literal("dhl")),
      title: v.string(),
      summary: v.string(),
      modeNotes: v.string(),
      implementationStatus: v.union(v.literal("active"), v.literal("foundation"), v.literal("planned")),
      operations: v.object({
        returns: v.union(v.literal("planned"), v.literal("implemented"), v.literal("not_supported")),
        rates: v.union(v.literal("planned"), v.literal("implemented"), v.literal("not_supported")),
        labels: v.union(v.literal("planned"), v.literal("implemented"), v.literal("not_supported")),
        tracking: v.union(v.literal("planned"), v.literal("implemented"), v.literal("not_supported")),
        manifests: v.union(v.literal("planned"), v.literal("implemented"), v.literal("not_supported")),
        address_validation: v.union(v.literal("planned"), v.literal("implemented"), v.literal("not_supported")),
      }),
      primaryUseCase: v.string(),
      verificationMode: v.union(v.literal("live_api"), v.literal("local_readiness")),
      credentialFields: v.array(v.object({
        key: v.string(),
        label: v.string(),
        type: v.union(v.literal("url"), v.literal("password"), v.literal("text")),
        placeholder: v.optional(v.string()),
        required: v.boolean(),
      })),
    }),
    settings: v.object({
      enabled: v.boolean(),
      displayName: v.string(),
      mode: v.union(v.literal("sandbox"), v.literal("production")),
      isPrimary: v.boolean(),
      rateShoppingEnabled: v.boolean(),
      rateShoppingPriority: v.number(),
      accountNickname: v.string(),
    }),
    connection: v.union(v.null(), shippingDocs.shipping_provider_connections),
    secretStored: v.boolean(),
    accounts: v.array(shippingDocs.shipping_provider_accounts),
    services: v.array(shippingDocs.shipping_provider_services),
  }),
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);

    const settings = await readShippingProviderSettings(ctx, args.provider);
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
  returns:v.array(publicShippingQuoteValidator),
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
    await assertCheckoutAccess(ctx, checkoutSession, args.sessionToken);

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

    return quotes.map(publicShippingQuote);
  },
});

export const getRecentQuoteDiagnostics = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(shippingDocs.shipping_quote_diagnostics),
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
  returns: v.array(v.object({
    methods: v.array(shippingDocs.commerce_shipping_zone_methods),
    _id: v.id("commerce_shipping_zones"),
    _creationTime: v.number(),
    updatedBy: v.optional(v.id("users")),
    description: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    name: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
    enabled: v.boolean(),
    slug: v.string(),
    sortOrder: v.number(),
    countries: v.array(v.string()),
    states: v.array(v.string()),
    postalCodeRules: v.array(v.string()),
    isFallback: v.boolean(),
  })),
  handler: async (ctx) => {
    await requireCan(ctx, "shipping.zones.read");

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
  returns: v.array(shippingDocs.commerce_shipping_packages),
  handler: async (ctx) => {
    await requireCan(ctx, "shipping.packages.read");
    const packages = await ctx.db.query("commerce_shipping_packages").collect();
    return packages.sort(
      (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );
  },
});

export const getPackage = query({
  args: { packageId: v.id("commerce_shipping_packages") },
  returns: v.union(v.null(), shippingDocs.commerce_shipping_packages),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.packages.read");
    return ctx.db.get(args.packageId);
  },
});

export const getProviderCapabilities = query({
  args: {},
  returns: v.array(v.object({
    provider: v.union(v.literal("shipstation"), v.literal("ups"), v.literal("usps"), v.literal("fedex"), v.literal("dhl")),
    status: v.union(v.literal("error"), v.literal("disconnected"), v.literal("connected"), v.literal("degraded")),
    enabled: v.boolean(),
    supportsRates: v.boolean(),
    supportsLabels: v.boolean(),
    supportsTracking: v.boolean(),
    supportsManifests: v.boolean(),
    supportsReturns: v.boolean(),
  })),
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
        provider: conn.provider,
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
