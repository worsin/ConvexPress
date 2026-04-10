// @ts-nocheck
import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceEnabled } from "../commerce/helpers";

// ============================================
// DIGITAL FILE QUERIES
// ============================================

/**
 * Get digital files for a product (admin)
 */
export const getFilesByProduct = query({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    includeAllVersions: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);

    const files = await ctx.db
      .query("commerce_digital_files")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .collect();

    // Filter by variant if specified
    let filtered = args.variantId !== undefined
      ? files.filter((f: any) => f.variantId === args.variantId)
      : files;

    // Only show latest versions by default
    if (!args.includeAllVersions) {
      filtered = filtered.filter((f: any) => f.isLatest);
    }

    return filtered.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  },
});

/**
 * Get a specific digital file
 */
export const getFile = query({
  args: { fileId: v.id("commerce_digital_files") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    return await ctx.db.get(args.fileId);
  },
});

// ============================================
// DOWNLOAD TOKEN QUERIES
// ============================================

/**
 * Validate a download token
 */
export const validateDownloadToken = query({
  args: { token: v.string() },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);

    const tokenRecord = await ctx.db
      .query("commerce_download_tokens")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .unique();

    if (!tokenRecord) {
      return { valid: false, error: "Invalid download token" };
    }

    if (!tokenRecord.isActive) {
      return { valid: false, error: "Download token has been deactivated" };
    }

    if (tokenRecord.expiresAt && tokenRecord.expiresAt < Date.now()) {
      return { valid: false, error: "Download token has expired" };
    }

    if (
      tokenRecord.maxDownloads &&
      tokenRecord.downloadCount >= tokenRecord.maxDownloads
    ) {
      return { valid: false, error: "Download limit reached" };
    }

    // Get file info
    const file = await ctx.db.get(tokenRecord.digitalFileId);
    if (!file) {
      return { valid: false, error: "File not found" };
    }

    const product = await ctx.db.get(file.productId);

    return {
      valid: true,
      tokenRecord,
      file,
      product,
      remainingDownloads: tokenRecord.maxDownloads
        ? tokenRecord.maxDownloads - tokenRecord.downloadCount
        : null,
    };
  },
});

/**
 * Get download tokens for an order
 */
export const getDownloadTokensByOrder = query({
  args: { orderId: v.id("commerce_orders") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);

    const tokens = await ctx.db
      .query("commerce_download_tokens")
      .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
      .collect();

    // Enrich with file info
    const enriched = await Promise.all(
      tokens.map(async (token: any) => {
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
export const getMyDownloads = query({
  args: {},
  handler: async (ctx: any) => {
    await requireCommerceEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const tokens = await ctx.db
      .query("commerce_download_tokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    // Enrich with file and product info
    const enriched = await Promise.all(
      tokens.map(async (token: any) => {
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

    return enriched.filter((t: any) => t.file && t.product);
  },
});

/**
 * Get download history for a token (admin)
 */
export const getDownloadHistory = query({
  args: { tokenId: v.id("commerce_download_tokens") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    return await ctx.db
      .query("commerce_download_log")
      .withIndex("by_token", (q: any) => q.eq("downloadTokenId", args.tokenId))
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
export const getLicenseKeysByOrder = query({
  args: { orderId: v.id("commerce_orders") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);

    const keys = await ctx.db
      .query("commerce_license_keys")
      .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
      .collect();

    // Enrich with product info and activation count
    const enriched = await Promise.all(
      keys.map(async (key: any) => {
        const product = await ctx.db.get(key.productId);
        const variant = key.variantId ? await ctx.db.get(key.variantId) : null;

        const activations = await ctx.db
          .query("commerce_license_activations")
          .withIndex("by_license_active", (q: any) =>
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
export const getMyLicenseKeys = query({
  args: {},
  handler: async (ctx: any) => {
    await requireCommerceEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const keys = await ctx.db
      .query("commerce_license_keys")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    const enriched = await Promise.all(
      keys.map(async (key: any) => {
        const product = await ctx.db.get(key.productId);
        const activations = await ctx.db
          .query("commerce_license_activations")
          .withIndex("by_license_active", (q: any) =>
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

    return enriched.filter((k: any) => k.product);
  },
});

/**
 * Get available license key count for a product (admin)
 */
export const getAvailableLicenseKeyCount = query({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);

    const keys = await ctx.db
      .query("commerce_license_keys")
      .withIndex("by_product_status", (q: any) =>
        q.eq("productId", args.productId).eq("status", "available")
      )
      .filter((q: any) =>
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
export const listLicenseKeysByProduct = query({
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
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const keys = await ctx.db
      .query("commerce_license_keys")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .collect();

    let filtered = args.status
      ? keys.filter((k: any) => k.status === args.status)
      : keys;

    // Sort by created date descending
    filtered.sort((a: any, b: any) => b.createdAt - a.createdAt);

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
export const validateLicense = query({
  args: {
    licenseKey: v.string(),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);

    const key = await ctx.db
      .query("commerce_license_keys")
      .withIndex("by_license_key", (q: any) => q.eq("licenseKey", args.licenseKey))
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
        .withIndex("by_license_active", (q: any) =>
          q.eq("licenseKeyId", key._id).eq("isActive", true)
        )
        .filter((q: any) => q.eq(q.field("deviceId"), args.deviceId))
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
export const getLicenseActivations = query({
  args: { keyId: v.id("commerce_license_keys") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);

    return await ctx.db
      .query("commerce_license_activations")
      .withIndex("by_license", (q: any) => q.eq("licenseKeyId", args.keyId))
      .collect();
  },
});
