import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { encryptSecret } from "../api/crypto_helpers";
import { requireShippingAdmin } from "./helpers";
import { shippingProviderValidator } from "../schema/shipping";
import { saveProviderSecretArgs, upsertConnectionMetadataArgs } from "./validators";

const SHIPPING_ENCRYPTION_KEY = process.env.SHIPPING_PROVIDER_ENCRYPTION_KEY;

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const upsertConnectionMetadata = mutation({
  args: upsertConnectionMetadataArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);

    const existing = await ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q: any) => q.eq("provider", args.provider))
      .unique();

    const now = Date.now();
    if (existing) {
      const patch: Record<string, unknown> = {
        displayName: args.displayName,
        enabled: args.enabled,
        mode: args.mode,
        isPrimary: args.isPrimary,
        rateShoppingEnabled: args.rateShoppingEnabled,
        rateShoppingPriority: args.rateShoppingPriority,
        updatedAt: now,
      };
      if (args.webhookSecret !== undefined) {
        patch.webhookSecret = args.webhookSecret || undefined;
      }
      await ctx.db.patch(existing._id, patch as any);
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
      webhookSecret: args.webhookSecret || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const saveProviderSecret = mutation({
  args: saveProviderSecretArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
      .withIndex("by_provider", (q: any) => q.eq("provider", args.provider))
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
      .withIndex("by_connection", (q: any) => q.eq("connectionId", connection._id))
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createZone = mutation({
  args: {
    name: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    countries: v.array(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    states: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    postalCodeRules: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    sortOrder: v.optional(v.number()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateZone = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    zoneId: v.id("commerce_shipping_zones"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    name: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    countries: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    states: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    postalCodeRules: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    enabled: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    sortOrder: v.optional(v.number()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteZone = mutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { zoneId: v.id("commerce_shipping_zones") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createZoneMethod = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    zoneId: v.id("commerce_shipping_zones"),
    methodCode: v.string(),
    label: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    methodType: v.union(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("live_rate"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("flat_rate"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("free_shipping"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("local_pickup"),
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    provider: v.optional(shippingProviderValidator),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    serviceFilters: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    pricingRules: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    enabled: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    sortOrder: v.optional(v.number()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateZoneMethod = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    methodId: v.id("commerce_shipping_zone_methods"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    methodCode: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    label: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    methodType: v.optional(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.union(
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("live_rate"),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("flat_rate"),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("free_shipping"),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("local_pickup"),
      ),
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    provider: v.optional(shippingProviderValidator),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    serviceFilters: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    pricingRules: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    enabled: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    sortOrder: v.optional(v.number()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteZoneMethod = mutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { methodId: v.id("commerce_shipping_zone_methods") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    await ctx.db.delete(args.methodId);
  },
});

// ---------------------------------------------------------------------------
// Shipping Package CRUD
// ---------------------------------------------------------------------------

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createPackage = mutation({
  args: {
    code: v.string(),
    label: v.string(),
    packageType: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    weight: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    dimensions: v.optional(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.object({
        length: v.number(),
        width: v.number(),
        height: v.number(),
      }),
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    carrierCode: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    provider: v.optional(shippingProviderValidator),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);

    // Ensure unique code
    const existing = await ctx.db
      .query("commerce_shipping_packages")
      .withIndex("by_code", (q: any) => q.eq("code", args.code))
      .unique();

    if (existing) {
      throw new ConvexError({ code: "DUPLICATE", message: `Package code "${args.code}" already exists.` });
    }

    const now = Date.now();
    return ctx.db.insert("commerce_shipping_packages", {
      code: args.code,
      label: args.label,
      packageType: args.packageType,
      weight: args.weight,
      dimensions: args.dimensions,
      carrierCode: args.carrierCode,
      provider: args.provider,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updatePackage = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    packageId: v.id("commerce_shipping_packages"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    code: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    label: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    packageType: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    weight: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    dimensions: v.optional(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.object({
        length: v.number(),
        width: v.number(),
        height: v.number(),
      }),
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    carrierCode: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    provider: v.optional(shippingProviderValidator),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    const existing = await ctx.db.get(args.packageId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Package not found." });
    }

    // If code changed, check uniqueness
    if (args.code && args.code !== existing.code) {
      const dup = await ctx.db
        .query("commerce_shipping_packages")
        .withIndex("by_code", (q: any) => q.eq("code", args.code))
        .unique();
      if (dup) {
        throw new ConvexError({ code: "DUPLICATE", message: `Package code "${args.code}" already exists.` });
      }
    }

    const { packageId, ...updates } = args;
    const patch: Record<string, any> = { updatedAt: Date.now() };
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) patch[key] = val;
    }
    await ctx.db.patch(packageId, patch);
    return packageId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deletePackage = mutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { packageId: v.id("commerce_shipping_packages") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    const existing = await ctx.db.get(args.packageId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Package not found." });
    }
    await ctx.db.delete(args.packageId);
    return { success: true };
  },
});
