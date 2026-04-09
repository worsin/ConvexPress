import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { encryptSecret } from "../api/crypto_helpers";
import { requireShippingAdmin } from "./helpers";
import { shippingProviderValidator } from "../schema/shipping";
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

// ---------------------------------------------------------------------------
// Zone CRUD
// ---------------------------------------------------------------------------

export const createZone = mutation({
  args: {
    name: v.string(),
    countries: v.array(v.string()),
    states: v.optional(v.array(v.string())),
    postalCodeRules: v.optional(v.array(v.string())),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    const now = Date.now();
    return ctx.db.insert("commerce_shipping_zones", {
      name: args.name,
      countries: args.countries,
      states: args.states ?? [],
      postalCodeRules: args.postalCodeRules ?? [],
      enabled: true,
      sortOrder: args.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateZone = mutation({
  args: {
    zoneId: v.id("commerce_shipping_zones"),
    name: v.optional(v.string()),
    countries: v.optional(v.array(v.string())),
    states: v.optional(v.array(v.string())),
    postalCodeRules: v.optional(v.array(v.string())),
    enabled: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    const { zoneId, ...updates } = args;
    const existing = await ctx.db.get(zoneId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Zone not found." });
    }
    await ctx.db.patch(zoneId, { ...updates, updatedAt: Date.now() });
  },
});

export const deleteZone = mutation({
  args: { zoneId: v.id("commerce_shipping_zones") },
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    const methods = await ctx.db
      .query("commerce_shipping_zone_methods")
      .withIndex("by_zone", (q: any) => q.eq("zoneId", args.zoneId))
      .collect();
    for (const method of methods) {
      await ctx.db.delete(method._id);
    }
    await ctx.db.delete(args.zoneId);
  },
});

// ---------------------------------------------------------------------------
// Zone Method CRUD
// ---------------------------------------------------------------------------

export const createZoneMethod = mutation({
  args: {
    zoneId: v.id("commerce_shipping_zones"),
    methodCode: v.string(),
    label: v.string(),
    methodType: v.union(
      v.literal("live_rate"),
      v.literal("flat_rate"),
      v.literal("free_shipping"),
      v.literal("local_pickup"),
    ),
    provider: v.optional(shippingProviderValidator),
    serviceFilters: v.optional(v.any()),
    pricingRules: v.optional(v.any()),
    enabled: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    const now = Date.now();
    return ctx.db.insert("commerce_shipping_zone_methods", {
      zoneId: args.zoneId,
      methodCode: args.methodCode,
      label: args.label,
      methodType: args.methodType,
      provider: args.provider,
      serviceFilters: args.serviceFilters,
      pricingRules: args.pricingRules,
      enabled: args.enabled ?? true,
      sortOrder: args.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateZoneMethod = mutation({
  args: {
    methodId: v.id("commerce_shipping_zone_methods"),
    methodCode: v.optional(v.string()),
    label: v.optional(v.string()),
    methodType: v.optional(
      v.union(
        v.literal("live_rate"),
        v.literal("flat_rate"),
        v.literal("free_shipping"),
        v.literal("local_pickup"),
      ),
    ),
    provider: v.optional(shippingProviderValidator),
    serviceFilters: v.optional(v.any()),
    pricingRules: v.optional(v.any()),
    enabled: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    const { methodId, ...updates } = args;
    const existing = await ctx.db.get(methodId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Zone method not found." });
    }
    await ctx.db.patch(methodId, { ...updates, updatedAt: Date.now() });
  },
});

export const deleteZoneMethod = mutation({
  args: { methodId: v.id("commerce_shipping_zone_methods") },
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    await ctx.db.delete(args.methodId);
  },
});
