// @ts-nocheck
import { recordAuthorizedDownload, type DownloadAttempt, type RecordedDownload } from "./downloadEntitlement";
import type { RegisteredMutation } from "convex/server";
import type { Id } from "../_generated/dataModel";
import { ConvexError, v } from "convex/values";

import { mutation, internalMutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requireCommerceDigitalEnabled } from "../commerce/helpers";
import { requirePluginEnabled } from "../helpers/plugins";
import { patchDynamicWithMediaReferences, deleteDynamicWithMediaReferences } from "../media/attachmentGuard";


// Helper to generate random hex string using Web Crypto API
function generateRandomHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================
// DIGITAL FILE MUTATIONS
// ============================================

/**
 * Upload / register a digital file for a product
 */
export const uploadFile = mutation({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    name: v.string(),
    fileName: v.string(),
    storageId: v.id("_storage"),
    fileSize: v.number(),
    mimeType: v.string(),
    checksum: v.optional(v.string()),
    version: v.string(),
    releaseNotes: v.optional(v.string()),
    isPreviewable: v.optional(v.boolean()),
    requiresLicense: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");

    // Verify product exists
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Product not found" });
    }

    // Mark existing files as not latest if this is a new version
    const existingFiles = await ctx.db
      .query("commerce_digital_files")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .filter((q: any) =>
        args.variantId
          ? q.eq(q.field("variantId"), args.variantId)
          : q.eq(q.field("variantId"), undefined)
      )
      .collect();

    for (const file of existingFiles) {
      if (file.isLatest) {
        await patchDynamicWithMediaReferences(ctx, file._id, { isLatest: false, updatedAt: Date.now() });
      }
    }

    // Get the next sort order
    const sortOrder = args.sortOrder ?? existingFiles.length;

    const now = Date.now();
    const fileId = await ctx.db.insert("commerce_digital_files", {
      productId: args.productId,
      variantId: args.variantId,
      name: args.name,
      fileName: args.fileName,
      storageId: args.storageId,
      fileSize: args.fileSize,
      mimeType: args.mimeType,
      checksum: args.checksum,
      version: args.version,
      releaseNotes: args.releaseNotes,
      isLatest: true,
      isPreviewable: args.isPreviewable ?? false,
      requiresLicense: args.requiresLicense ?? false,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });

    // Update product to mark as downloadable if not already
    if (!product.isDownloadable) {
      await patchDynamicWithMediaReferences(ctx, args.productId, { isDownloadable: true, updatedAt: now });
    }

    return fileId;
  },
});

/**
 * Update digital file metadata
 */
export const updateFile = mutation({
  args: {
    fileId: v.id("commerce_digital_files"),
    name: v.optional(v.string()),
    version: v.optional(v.string()),
    releaseNotes: v.optional(v.string()),
    isPreviewable: v.optional(v.boolean()),
    requiresLicense: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const { fileId, ...updates } = args;

    const file = await ctx.db.get(fileId);
    if (!file) {
      throw new ConvexError({ code: "NOT_FOUND", message: "File not found" });
    }

    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await patchDynamicWithMediaReferences(ctx, fileId, {
      ...cleanUpdates,
      updatedAt: Date.now(),
    });

    return fileId;
  },
});

/**
 * Delete a digital file
 */
export const deleteFile = mutation({
  args: { fileId: v.id("commerce_digital_files") },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new ConvexError({ code: "NOT_FOUND", message: "File not found" });
    }

    // Delete the file record
    await deleteDynamicWithMediaReferences(ctx, args.fileId);

    // If this was the latest, mark the most recent remaining as latest
    if (file.isLatest) {
      const remaining = await ctx.db
        .query("commerce_digital_files")
        .withIndex("by_product", (q: any) => q.eq("productId", file.productId))
        .filter((q: any) =>
          file.variantId
            ? q.eq(q.field("variantId"), file.variantId)
            : q.eq(q.field("variantId"), undefined)
        )
        .order("desc")
        .first();

      if (remaining) {
        await patchDynamicWithMediaReferences(ctx, remaining._id, { isLatest: true, updatedAt: Date.now() });
      }
    }

    // Check if product still has any digital files
    const anyFiles = await ctx.db
      .query("commerce_digital_files")
      .withIndex("by_product", (q: any) => q.eq("productId", file.productId))
      .first();

    if (!anyFiles) {
      await patchDynamicWithMediaReferences(ctx, file.productId, { isDownloadable: false, updatedAt: Date.now() });
    }

    return args.fileId;
  },
});

// ============================================
// DOWNLOAD TOKEN MUTATIONS
// ============================================

/**
 * Legacy internal allowance recording; public downloads use expiring leases.
 */
export const recordDownload: RegisteredMutation<"internal", DownloadAttempt, { storageId: Id<"_storage">; fileName: string; mimeType: string }> = internalMutation({
  args: {
    token: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    await requireCommerceDigitalEnabled(ctx);
    const result = await recordAuthorizedDownload(ctx, args);
    if (!result.success) throw new ConvexError({ code: result.code, message: result.error });
    return { storageId: result.storageId, fileName: result.fileName, mimeType: result.mimeType };
  },
});

// ============================================
// DOWNLOAD TOKEN INTERNALS (order completion)
// ============================================

/**
 * Generate a download token for a single digital file
 * INTERNAL: Called after successful order completion
 */
export const generateDownloadToken = internalMutation({
  args: {
    digitalFileId: v.id("commerce_digital_files"),
    orderId: v.id("commerce_orders"),
    orderItemId: v.id("commerce_order_items"),
    userId: v.optional(v.id("users")),
    maxDownloads: v.optional(v.number()),
    expiryDays: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    const file = await ctx.db.get(args.digitalFileId);
    if (!file) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Digital file not found" });
    }

    // Generate a secure random token
    const token = generateRandomHex(32);

    // Calculate expiry
    const expiryDays = args.expiryDays ?? 30; // default 30 days
    const expiresAt = expiryDays
      ? Date.now() + expiryDays * 24 * 60 * 60 * 1000
      : undefined;

    const maxDownloads = args.maxDownloads;

    const tokenId = await ctx.db.insert("commerce_download_tokens", {
      digitalFileId: args.digitalFileId,
      orderId: args.orderId,
      orderItemId: args.orderItemId,
      userId: args.userId,
      token,
      downloadCount: 0,
      maxDownloads,
      expiresAt,
      isActive: true,
      createdAt: Date.now(),
    });

    return { tokenId, token };
  },
});

/**
 * Generate download tokens for all digital files in an order
 * INTERNAL: Called by order completion system
 */
export const generateOrderDownloadTokens = internalMutation({
  args: {
    orderId: v.id("commerce_orders"),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Order not found" });
    }

    // Get order items
    const orderItems = await ctx.db
      .query("commerce_order_items")
      .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
      .collect();

    const tokens: any[] = [];

    for (const item of orderItems) {
      if (!item.productId) continue;

      // Get latest digital files for this product
      const files = await ctx.db
        .query("commerce_digital_files")
        .withIndex("by_product", (q: any) => q.eq("productId", item.productId))
        .filter((q: any) =>
          item.variantId
            ? q.or(
                q.eq(q.field("variantId"), item.variantId),
                q.eq(q.field("variantId"), undefined)
              )
            : q.eq(q.field("variantId"), undefined)
        )
        .filter((q: any) => q.eq(q.field("isLatest"), true))
        .collect();

      for (const file of files) {
        const token = generateRandomHex(32);

        const tokenId = await ctx.db.insert("commerce_download_tokens", {
          digitalFileId: file._id,
          orderId: args.orderId,
          orderItemId: item._id,
          userId: order.userId,
          token,
          downloadCount: 0,
          maxDownloads: undefined,
          expiresAt: undefined,
          isActive: true,
          createdAt: Date.now(),
        });

        tokens.push({
          orderItemId: item._id,
          fileId: file._id,
          tokenId,
          token,
        });
      }
    }

    return tokens;
  },
});

/**
 * Internal mutation to record download and return storage info
 * Legacy internal adapter; public delivery uses expiring leases.
 */
export const recordDownloadInternal: RegisteredMutation<"internal", DownloadAttempt, RecordedDownload> = internalMutation({
  args: {
    token: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    await requireCommerceDigitalEnabled(ctx);
    return await recordAuthorizedDownload(ctx, args);
  },
});

// ============================================
// LICENSE KEY MUTATIONS
// ============================================

/**
 * Generate license keys for a product (admin)
 */
export const generateLicenseKeys = mutation({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    count: v.number(),
    keyType: v.union(
      v.literal("single"),
      v.literal("multi"),
      v.literal("unlimited"),
      v.literal("subscription")
    ),
    maxActivations: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    prefix: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Product not found" });
    }

    const now = Date.now();
    const keys: any[] = [];

    for (let i = 0; i < args.count; i++) {
      // Generate a license key in format: XXXX-XXXX-XXXX-XXXX
      const segments = Array.from({ length: 4 }, () =>
        generateRandomHex(2).toUpperCase()
      );
      const licenseKey = args.prefix
        ? `${args.prefix}-${segments.join("-")}`
        : segments.join("-");

      const keyId = await ctx.db.insert("commerce_license_keys", {
        productId: args.productId,
        variantId: args.variantId,
        licenseKey,
        keyType: args.keyType,
        maxActivations: args.maxActivations,
        status: "available",
        expiresAt: args.expiresAt,
        createdAt: now,
        updatedAt: now,
      });

      keys.push({ keyId, licenseKey });
    }

    return keys;
  },
});

/**
 * Import pre-generated license keys (admin)
 */
export const importLicenseKeys = mutation({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    keys: v.array(v.string()),
    keyType: v.union(
      v.literal("single"),
      v.literal("multi"),
      v.literal("unlimited"),
      v.literal("subscription")
    ),
    maxActivations: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Product not found" });
    }

    const now = Date.now();
    const results: any[] = [];

    for (const licenseKey of args.keys) {
      // Check for duplicates
      const existing = await ctx.db
        .query("commerce_license_keys")
        .withIndex("by_license_key", (q: any) => q.eq("licenseKey", licenseKey))
        .unique();

      if (existing) {
        results.push({ licenseKey, error: "Key already exists" });
        continue;
      }

      const keyId = await ctx.db.insert("commerce_license_keys", {
        productId: args.productId,
        variantId: args.variantId,
        licenseKey,
        keyType: args.keyType,
        maxActivations: args.maxActivations,
        status: "available",
        expiresAt: args.expiresAt,
        createdAt: now,
        updatedAt: now,
      });

      results.push({ licenseKey, keyId });
    }

    return results;
  },
});

/**
 * Assign a license key to an order
 * INTERNAL: Called by order completion system
 */
export const assignLicenseKey = internalMutation({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    orderId: v.id("commerce_orders"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    // Find an available key
    const availableKey = await ctx.db
      .query("commerce_license_keys")
      .withIndex("by_product_status", (q: any) =>
        q.eq("productId", args.productId).eq("status", "available")
      )
      .filter((q: any) =>
        args.variantId
          ? q.eq(q.field("variantId"), args.variantId)
          : q.eq(q.field("variantId"), undefined)
      )
      .first();

    if (!availableKey) {
      throw new ConvexError({ code: "NO_KEYS", message: "No available license keys" });
    }

    await patchDynamicWithMediaReferences(ctx, availableKey._id, {
      orderId: args.orderId,
      userId: args.userId,
      status: "assigned",
      updatedAt: Date.now(),
    });

    return {
      keyId: availableKey._id,
      licenseKey: availableKey.licenseKey,
    };
  },
});

/**
 * Revoke a license key (admin)
 */
export const revokeLicenseKey = mutation({
  args: {
    keyId: v.id("commerce_license_keys"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    await requireCommerceDigitalEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const key = await ctx.db.get(args.keyId);
    if (!key) {
      throw new ConvexError({ code: "NOT_FOUND", message: "License key not found" });
    }

    const now = Date.now();

    // Deactivate all activations
    const activations = await ctx.db
      .query("commerce_license_activations")
      .withIndex("by_license_active", (q: any) =>
        q.eq("licenseKeyId", args.keyId).eq("isActive", true)
      )
      .collect();

    for (const activation of activations) {
      await patchDynamicWithMediaReferences(ctx, activation._id, {
        isActive: false,
        deactivatedAt: now,
        deactivatedReason: "License revoked",
      });
    }

    // Revoke the key
    await patchDynamicWithMediaReferences(ctx, args.keyId, {
      status: "revoked",
      revokedAt: now,
      revokedReason: args.reason,
      updatedAt: now,
    });

    return args.keyId;
  },
});

// ============================================
// LICENSE ACTIVATION MUTATIONS
// ============================================

/**
 * Activate a license on a device
 */
export const activateLicense = mutation({
  args: {
    licenseKey: v.string(),
    deviceId: v.string(),
    deviceName: v.optional(v.string()),
    deviceType: v.optional(v.string()),
    platform: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    await requireCommerceDigitalEnabled(ctx);

    // Find the license key
    const key = await ctx.db
      .query("commerce_license_keys")
      .withIndex("by_license_key", (q: any) => q.eq("licenseKey", args.licenseKey))
      .unique();

    if (!key) {
      return { success: false, error: "Invalid license key" };
    }

    if (key.status === "revoked") {
      return { success: false, error: "License has been revoked" };
    }

    if (key.status === "expired" || (key.expiresAt && key.expiresAt < Date.now())) {
      return { success: false, error: "License has expired" };
    }

    if (key.status === "available") {
      return { success: false, error: "License has not been purchased" };
    }

    // Check for existing activation on this device
    const existingActivation = await ctx.db
      .query("commerce_license_activations")
      .withIndex("by_license_active", (q: any) =>
        q.eq("licenseKeyId", key._id).eq("isActive", true)
      )
      .filter((q: any) => q.eq(q.field("deviceId"), args.deviceId))
      .unique();

    if (existingActivation) {
      // Update last seen
      await patchDynamicWithMediaReferences(ctx, existingActivation._id, {
        lastSeenAt: Date.now(),
        appVersion: args.appVersion,
        ipAddress: args.ipAddress,
      });

      return {
        success: true,
        activationId: existingActivation._id,
        message: "Device already activated",
      };
    }

    // Check activation limit
    if (key.keyType !== "unlimited" && key.maxActivations) {
      const activeCount = await ctx.db
        .query("commerce_license_activations")
        .withIndex("by_license_active", (q: any) =>
          q.eq("licenseKeyId", key._id).eq("isActive", true)
        )
        .collect();

      if (activeCount.length >= key.maxActivations) {
        return {
          success: false,
          error: `Maximum activations reached (${key.maxActivations})`,
        };
      }
    }

    // Create new activation
    const now = Date.now();
    const activationId = await ctx.db.insert("commerce_license_activations", {
      licenseKeyId: key._id,
      userId: key.userId,
      deviceId: args.deviceId,
      deviceName: args.deviceName,
      deviceType: args.deviceType,
      platform: args.platform,
      appVersion: args.appVersion,
      ipAddress: args.ipAddress,
      isActive: true,
      activatedAt: now,
      lastSeenAt: now,
    });

    // Update license key status if first activation
    if (key.status === "assigned") {
      await patchDynamicWithMediaReferences(ctx, key._id, {
        status: "active",
        activatedAt: now,
        updatedAt: now,
      });
    }

    return { success: true, activationId };
  },
});

/**
 * Deactivate a license on a device
 */
export const deactivateLicense = mutation({
  args: {
    licenseKey: v.string(),
    deviceId: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceDigital");
    await requireCommerceDigitalEnabled(ctx);

    const key = await ctx.db
      .query("commerce_license_keys")
      .withIndex("by_license_key", (q: any) => q.eq("licenseKey", args.licenseKey))
      .unique();

    if (!key) {
      throw new ConvexError({ code: "INVALID_KEY", message: "Invalid license key" });
    }

    const activation = await ctx.db
      .query("commerce_license_activations")
      .withIndex("by_license_active", (q: any) =>
        q.eq("licenseKeyId", key._id).eq("isActive", true)
      )
      .filter((q: any) => q.eq(q.field("deviceId"), args.deviceId))
      .unique();

    if (!activation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "No active activation found for this device",
      });
    }

    await patchDynamicWithMediaReferences(ctx, activation._id, {
      isActive: false,
      deactivatedAt: Date.now(),
      deactivatedReason: "User deactivated",
    });

    return activation._id;
  },
});
