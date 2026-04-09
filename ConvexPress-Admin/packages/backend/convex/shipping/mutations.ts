import { ConvexError } from "convex/values";

import { mutation } from "../_generated/server";
import { encryptSecret } from "../api/crypto_helpers";
import { requireShippingAdmin } from "./helpers";
import { saveProviderSecretArgs, upsertConnectionMetadataArgs } from "./validators";

const SHIPPING_ENCRYPTION_KEY = process.env.SHIPPING_PROVIDER_ENCRYPTION_KEY;

export const upsertConnectionMetadata = mutation({
  args: upsertConnectionMetadataArgs,
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);

    const existing = await ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: args.displayName,
        enabled: args.enabled,
        mode: args.mode,
        isPrimary: args.isPrimary,
        rateShoppingEnabled: args.rateShoppingEnabled,
        rateShoppingPriority: args.rateShoppingPriority,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("shipping_provider_connections", {
      provider: args.provider,
      displayName: args.displayName,
      status: "disconnected",
      enabled: args.enabled,
      mode: args.mode,
      isPrimary: args.isPrimary,
      rateShoppingEnabled: args.rateShoppingEnabled,
      rateShoppingPriority: args.rateShoppingPriority,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const saveProviderSecret = mutation({
  args: saveProviderSecretArgs,
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);

    if (!SHIPPING_ENCRYPTION_KEY) {
      throw new ConvexError({
        code: "CONFIG_ERROR",
        message: "SHIPPING_PROVIDER_ENCRYPTION_KEY is not configured.",
      });
    }

    let connection = await ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();

    const now = Date.now();
    if (!connection) {
      const connectionId = await ctx.db.insert("shipping_provider_connections", {
        provider: args.provider,
        displayName:
          args.provider === "shipstation" ? "ShipStation" : args.provider.toUpperCase(),
        status: "disconnected",
        enabled: false,
        mode: "production",
        isPrimary: args.provider === "shipstation",
        rateShoppingEnabled: args.provider === "shipstation",
        rateShoppingPriority:
          args.provider === "shipstation"
            ? 10
            : args.provider === "ups"
              ? 20
              : args.provider === "usps"
                ? 30
                : args.provider === "fedex"
                  ? 40
                  : 50,
        createdAt: now,
        updatedAt: now,
      });
      connection = await ctx.db.get(connectionId);
    }

    if (!connection) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Unable to create shipping provider connection.",
      });
    }

    const encryptedPayload = await encryptSecret(
      JSON.stringify(args.credentials ?? {}),
      SHIPPING_ENCRYPTION_KEY,
    );

    const existingSecret = await ctx.db
      .query("shipping_provider_secrets")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .unique();

    if (existingSecret) {
      await ctx.db.patch(existingSecret._id, {
        encryptedPayload,
        secretVersion: existingSecret.secretVersion + 1,
        updatedAt: now,
      });
      return existingSecret._id;
    }

    return ctx.db.insert("shipping_provider_secrets", {
      connectionId: connection._id,
      secretVersion: 1,
      encryptedPayload,
      createdAt: now,
      updatedAt: now,
    });
  },
});
