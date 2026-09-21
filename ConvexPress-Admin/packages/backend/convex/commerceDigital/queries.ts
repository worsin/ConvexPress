import { readDownloadEntitlement } from "./downloadEntitlement";
import { v } from "convex/values";

import type { RegisteredQuery } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";

import { query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceDigitalEnabled } from "../commerce/helpers";
import { isPluginEnabled } from "../helpers/plugins";


type OrderDownload = Doc<"commerce_download_tokens"> & { file: Doc<"commerce_digital_files"> | null };
type CustomerDownload = OrderDownload & { product: Doc<"commerce_products"> | null; order: Doc<"commerce_orders"> | null; isExpired: boolean; isLimitReached: boolean };
type OrderLicense = Doc<"commerce_license_keys"> & { product: Doc<"commerce_products"> | null; variant: Doc<"commerce_product_variants"> | null; activeActivations: number };
type CustomerLicense = Doc<"commerce_license_keys"> & { product: Doc<"commerce_products"> | null; activeActivations: number; isExpired: boolean };
type DownloadValidation = { valid: false; error: string } | { valid: true; file: { name: string; fileName: string; fileSize: number; mimeType: string; version: string }; product: { title: string }; remainingDownloads: number | null; expiresAt?: number };
type LicenseValidation = { valid: false; error: string; requiresActivation?: boolean } | { valid: true; keyType: Doc<"commerce_license_keys">["keyType"]; expiresAt?: number; product: { id: Id<"commerce_products">; title: string } | null };

// ============================================
// DIGITAL FILE QUERIES
// ============================================

/**
 * Get digital files for a product (admin)
 */
export const getFilesByProduct: RegisteredQuery<"public", { productId: Id<"commerce_products">; variantId?: Id<"commerce_product_variants">; includeAllVersions?: boolean }, Doc<"commerce_digital_files">[] | null> = query({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    includeAllVersions: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceDigital"))) return null;
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const files = await ctx.db
      .query("commerce_digital_files")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    // Filter by variant if specified
    let filtered = args.variantId !== undefined
      ? files.filter((f) => f.variantId === args.variantId)
      : files;

    // Only show latest versions by default
    if (!args.includeAllVersions) {
      filtered = filtered.filter((f) => f.isLatest);
    }

    return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/**
 * Get a specific digital file
 */
export const getFile: RegisteredQuery<"public", { fileId: Id<"commerce_digital_files"> }, Doc<"commerce_digital_files"> | null> = query({
  args: { fileId: v.id("commerce_digital_files") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceDigital"))) return null;
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");
    return await ctx.db.get(args.fileId);
  },
});

// ============================================
// DOWNLOAD TOKEN QUERIES
// ============================================

/**
 * Validate a download token
 */
export const validateDownloadToken: RegisteredQuery<"public", { token: string }, DownloadValidation | null> = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceDigital"))) return null;
    await requireCommerceDigitalEnabled(ctx);

    const access = await readDownloadEntitlement(ctx, args.token);
    if (!access.success) return { valid: false, error: access.error };
    return {
      valid: true,
      file: { name: access.file.name, fileName: access.file.fileName, fileSize: access.file.fileSize, mimeType: access.file.mimeType, version: access.file.version },
      product: { title: access.product.title },
      remainingDownloads: access.remainingDownloads,
      expiresAt: access.token.expiresAt,
    };
  },
});

/**
 * Get download tokens for an order
 */
export const getDownloadTokensByOrder: RegisteredQuery<"public", { orderId: Id<"commerce_orders"> }, OrderDownload[] | null> = query({
  args: { orderId: v.id("commerce_orders") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceDigital"))) return null;
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const tokens = await ctx.db
      .query("commerce_download_tokens")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    // Enrich with file info
    const enriched = await Promise.all(
      tokens.map(async (token) => {
        const file = await ctx.db.get(token.digitalFileId);
        return { ...token, file };
      })
    );

    return enriched;
  },
});

/**
 * Get current user's downloads (customer-facing)
 */
export const getMyDownloads: RegisteredQuery<"public", Record<string, never>, CustomerDownload[] | null> = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceDigital"))) return null;
    await requireCommerceDigitalEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user || user.status !== "active") return [];

    const tokens = await ctx.db
      .query("commerce_download_tokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Enrich with file and product info
    const enriched = await Promise.all(
      tokens.map(async (token) => {
        const file = await ctx.db.get(token.digitalFileId);
        const product = file ? await ctx.db.get(file.productId) : null;
        const order = await ctx.db.get(token.orderId);

        return {
          ...token,
          file,
          product,
          order,
          isExpired: token.expiresAt ? token.expiresAt < Date.now() : false,
          isLimitReached: token.maxDownloads
            ? token.downloadCount >= token.maxDownloads
            : false,
        };
      })
    );

    return enriched.filter((t) => t.file && t.product);
  },
});

/**
 * Get download history for a token (admin)
 */
export const getDownloadHistory: RegisteredQuery<"public", { tokenId: Id<"commerce_download_tokens"> }, Doc<"commerce_download_log">[] | null> = query({
  args: { tokenId: v.id("commerce_download_tokens") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceDigital"))) return null;
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");

    return await ctx.db
      .query("commerce_download_log")
      .withIndex("by_token", (q) => q.eq("downloadTokenId", args.tokenId))
      .order("desc")
      .collect();
  },
});

// ============================================
// LICENSE KEY QUERIES
// ============================================

/**
 * Get license keys for an order
 */
export const getLicenseKeysByOrder: RegisteredQuery<"public", { orderId: Id<"commerce_orders"> }, OrderLicense[] | null> = query({
  args: { orderId: v.id("commerce_orders") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceDigital"))) return null;
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const keys = await ctx.db
      .query("commerce_license_keys")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    // Enrich with product info and activation count
    const enriched = await Promise.all(
      keys.map(async (key) => {
        const product = await ctx.db.get(key.productId);
        const variant = key.variantId ? await ctx.db.get(key.variantId) : null;

        const activations = await ctx.db
          .query("commerce_license_activations")
          .withIndex("by_license_active", (q) =>
            q.eq("licenseKeyId", key._id).eq("isActive", true)
          )
          .collect();

        return {
          ...key,
          product,
          variant,
          activeActivations: activations.length,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get current user's license keys (customer-facing)
 */
export const getMyLicenseKeys: RegisteredQuery<"public", Record<string, never>, CustomerLicense[] | null> = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceDigital"))) return null;
    await requireCommerceDigitalEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user || user.status !== "active") return [];

    const keys = await ctx.db
      .query("commerce_license_keys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const enriched = await Promise.all(
      keys.map(async (key) => {
        const product = await ctx.db.get(key.productId);
        const activations = await ctx.db
          .query("commerce_license_activations")
          .withIndex("by_license_active", (q) =>
            q.eq("licenseKeyId", key._id).eq("isActive", true)
          )
          .collect();

        return {
          ...key,
          product,
          activeActivations: activations.length,
          isExpired: key.expiresAt ? key.expiresAt < Date.now() : false,
        };
      })
    );

    return enriched.filter((k) => k.product);
  },
});

/**
 * Get available license key count for a product (admin)
 */
export const getAvailableLicenseKeyCount: RegisteredQuery<"public", { productId: Id<"commerce_products">; variantId?: Id<"commerce_product_variants"> }, number | null> = query({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceDigital"))) return null;
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const keys = await ctx.db
      .query("commerce_license_keys")
      .withIndex("by_product_status", (q) =>
        q.eq("productId", args.productId).eq("status", "available")
      )
      .filter((q) =>
        args.variantId
          ? q.eq(q.field("variantId"), args.variantId)
          : q.eq(q.field("variantId"), undefined)
      )
      .collect();

    return keys.length;
  },
});

/**
 * List all license keys for a product (admin)
 */
export const listLicenseKeysByProduct: RegisteredQuery<"public", { productId: Id<"commerce_products">; status?: Doc<"commerce_license_keys">["status"]; limit?: number }, Doc<"commerce_license_keys">[] | null> = query({
  args: {
    productId: v.id("commerce_products"),
    status: v.optional(
      v.union(
        v.literal("available"),
        v.literal("assigned"),
        v.literal("active"),
        v.literal("expired"),
        v.literal("revoked")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceDigital"))) return null;
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const keys = await ctx.db
      .query("commerce_license_keys")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    let filtered = args.status
      ? keys.filter((k) => k.status === args.status)
      : keys;

    // Sort by created date descending
    filtered.sort((a, b) => b.createdAt - a.createdAt);

    // Apply limit
    if (args.limit) {
      filtered = filtered.slice(0, args.limit);
    }

    return filtered;
  },
});

/**
 * Validate a license (public — check if still valid)
 */
export const validateLicense: RegisteredQuery<"public", { licenseKey: string; deviceId?: string }, LicenseValidation | null> = query({
  args: {
    licenseKey: v.string(),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceDigital"))) return null;
    await requireCommerceDigitalEnabled(ctx);

    const key = await ctx.db
      .query("commerce_license_keys")
      .withIndex("by_license_key", (q) => q.eq("licenseKey", args.licenseKey))
      .unique();

    if (!key) {
      return { valid: false, error: "Invalid license key" };
    }

    if (key.status === "revoked") {
      return { valid: false, error: "License has been revoked" };
    }

    if (key.expiresAt && key.expiresAt < Date.now()) {
      return { valid: false, error: "License has expired" };
    }

    if (key.status === "available") {
      return { valid: false, error: "License not yet assigned" };
    }

    // If device ID provided, check if activated on this device
    if (args.deviceId) {
      const activation = await ctx.db
        .query("commerce_license_activations")
        .withIndex("by_license_active", (q) =>
          q.eq("licenseKeyId", key._id).eq("isActive", true)
        )
        .filter((q) => q.eq(q.field("deviceId"), args.deviceId))
        .unique();

      if (!activation) {
        return {
          valid: false,
          error: "License not activated on this device",
          requiresActivation: true,
        };
      }
    }

    const product = await ctx.db.get(key.productId);

    return {
      valid: true,
      keyType: key.keyType,
      expiresAt: key.expiresAt,
      product: product
        ? { id: product._id, title: product.title }
        : null,
    };
  },
});

/**
 * Get license activations for a key (admin)
 */
export const getLicenseActivations: RegisteredQuery<"public", { keyId: Id<"commerce_license_keys"> }, Doc<"commerce_license_activations">[] | null> = query({
  args: { keyId: v.id("commerce_license_keys") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceDigital"))) return null;
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");

    return await ctx.db
      .query("commerce_license_activations")
      .withIndex("by_license", (q) => q.eq("licenseKeyId", args.keyId))
      .collect();
  },
});
