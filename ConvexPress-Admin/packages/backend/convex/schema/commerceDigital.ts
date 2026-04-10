import { defineTable } from "convex/server";
import { v } from "convex/values";

export const commerceDigitalFileStatusValidator = v.union(
  v.literal("active"),
  v.literal("archived"),
);

export const commerceDownloadTokenStatusValidator = v.union(
  v.literal("active"),
  v.literal("expired"),
  v.literal("revoked"),
  v.literal("exhausted"),
);

export const commerceLicenseKeyTypeValidator = v.union(
  v.literal("single"),
  v.literal("multi"),
  v.literal("unlimited"),
  v.literal("subscription"),
);

export const commerceLicenseKeyStatusValidator = v.union(
  v.literal("available"),
  v.literal("assigned"),
  v.literal("active"),
  v.literal("expired"),
  v.literal("revoked"),
);

export const commerceDigitalTables = {
  // ─── Digital Files ──────────────────────────────────────────────────────────
  // Downloadable file records attached to commerce products / variants
  commerce_digital_files: defineTable({
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
    isLatest: v.boolean(),
    isPreviewable: v.boolean(),
    requiresLicense: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_product_variant", ["productId", "variantId"])
    .index("by_product_latest", ["productId", "isLatest"]),

  // ─── Download Tokens ────────────────────────────────────────────────────────
  // Secure, expirable tokens granting access to a specific digital file
  commerce_download_tokens: defineTable({
    digitalFileId: v.id("commerce_digital_files"),
    orderId: v.id("commerce_orders"),
    orderItemId: v.id("commerce_order_items"),
    userId: v.optional(v.id("users")),
    token: v.string(),
    downloadCount: v.number(),
    maxDownloads: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    lastDownloadedAt: v.optional(v.number()),
    lastIpAddress: v.optional(v.string()),
    ipAddresses: v.optional(v.array(v.string())),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_order", ["orderId"])
    .index("by_user", ["userId"])
    .index("by_file", ["digitalFileId"]),

  // ─── Download Log ───────────────────────────────────────────────────────────
  // Immutable audit trail of every download attempt
  commerce_download_log: defineTable({
    downloadTokenId: v.id("commerce_download_tokens"),
    digitalFileId: v.id("commerce_digital_files"),
    userId: v.optional(v.id("users")),
    downloadedAt: v.number(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    success: v.boolean(),
  })
    .index("by_token", ["downloadTokenId"])
    .index("by_file", ["digitalFileId"])
    .index("by_user", ["userId"]),

  // ─── License Keys ──────────────────────────────────────────────────────────
  // Software-style license keys tied to products, optionally assigned to orders
  commerce_license_keys: defineTable({
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    orderId: v.optional(v.id("commerce_orders")),
    userId: v.optional(v.id("users")),
    licenseKey: v.string(),
    keyType: commerceLicenseKeyTypeValidator,
    maxActivations: v.optional(v.number()),
    status: commerceLicenseKeyStatusValidator,
    expiresAt: v.optional(v.number()),
    activatedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_license_key", ["licenseKey"])
    .index("by_product", ["productId"])
    .index("by_product_status", ["productId", "status"])
    .index("by_order", ["orderId"])
    .index("by_user", ["userId"]),

  // ─── License Activations ───────────────────────────────────────────────────
  // Per-device activation records for license keys
  commerce_license_activations: defineTable({
    licenseKeyId: v.id("commerce_license_keys"),
    userId: v.optional(v.id("users")),
    deviceId: v.string(),
    deviceName: v.optional(v.string()),
    deviceType: v.optional(v.string()),
    platform: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    isActive: v.boolean(),
    activatedAt: v.number(),
    lastSeenAt: v.number(),
    deactivatedAt: v.optional(v.number()),
    deactivatedReason: v.optional(v.string()),
  })
    .index("by_license", ["licenseKeyId"])
    .index("by_license_active", ["licenseKeyId", "isActive"])
    .index("by_user", ["userId"]),
};
