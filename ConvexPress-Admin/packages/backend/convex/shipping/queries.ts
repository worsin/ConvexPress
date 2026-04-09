import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireCommerceEnabled } from "../commerce/helpers";
import {
  SHIPPING_PROVIDERS,
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
    const accounts = await ctx.db.query("shipping_provider_accounts").collect();

    const providers = await Promise.all(
      SHIPPING_PROVIDERS.map(async (provider) => {
        const connection = connections.find((entry) => entry.provider === provider) ?? null;
        const accountCount = accounts.filter((entry) => entry.provider === provider).length;
        const settings = await getShippingSettingsSection(
          ctx,
          `integrations.shipping.${provider}` as const,
        );
        return {
          provider,
          descriptor: getShippingProviderDescriptor(provider),
          connection,
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

    const section = `integrations.shipping.${args.provider}` as const;
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

    const checkoutSession = await ctx.db
      .query("commerce_checkout_sessions")
      .withIndex("by_session", (q) => q.eq("sessionToken", args.sessionToken))
      .unique();

    if (!checkoutSession) return [];

    const quotes = await ctx.db
      .query("commerce_shipping_rate_quotes")
      .withIndex("by_checkout", (q) => q.eq("checkoutSessionId", checkoutSession._id))
      .collect();

    quotes.sort((a, b) => {
      if (a.isBestValue !== b.isBestValue) return a.isBestValue ? -1 : 1;
      if (a.isCheapest !== b.isCheapest) return a.isCheapest ? -1 : 1;
      if (a.isFastest !== b.isFastest) return a.isFastest ? -1 : 1;
      return a.amount - b.amount;
    });

    return quotes;
  },
});
