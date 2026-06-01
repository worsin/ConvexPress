// @ts-nocheck
import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { isPluginEnabled } from "../helpers/plugins";
import { syncPurchasedCourseEnrollmentsHandler } from "../lms/enrollment/internals";

function generateRandomHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

const PAID_PAYMENT_STATUSES = new Set(["paid", "partially_paid"]);
const PAID_ORDER_STATUSES = new Set(["paid", "processing", "completed", "fulfilled"]);

export function isOrderEligibleForDigitalFulfillment(order: any) {
  return (
    PAID_PAYMENT_STATUSES.has(order?.paymentStatus) ||
    PAID_ORDER_STATUSES.has(order?.status)
  );
}

export function resolveDigitalPolicy(product: any, variant?: any) {
  const deliveryMode =
    variant?.digitalDeliveryMode ??
    product?.digitalDeliveryMode ??
    (variant?.isDownloadable ?? product?.isDownloadable ? "download" : undefined);
  const isDownloadable = Boolean(variant?.isDownloadable ?? product?.isDownloadable);
  const downloadsRequired =
    isDownloadable &&
    (deliveryMode === undefined ||
      deliveryMode === "download" ||
      deliveryMode === "download_and_license");
  const explicitRequiresLicense =
    variant?.requiresLicense ?? product?.requiresLicense;
  const licensesRequired = Boolean(
    explicitRequiresLicense ??
      (deliveryMode === "license" || deliveryMode === "download_and_license"),
  );

  return {
    deliveryMode,
    downloadsRequired,
    licensesRequired,
    downloadLimit: variant?.downloadLimit ?? product?.downloadLimit,
    downloadExpiryDays:
      variant?.downloadExpiryDays ??
      variant?.downloadExpiry ??
      product?.downloadExpiryDays,
    licenseKeyType: variant?.licenseKeyType ?? product?.licenseKeyType,
    maxActivations: variant?.maxActivations ?? product?.maxActivations,
    licenseExpiresAfterDays:
      variant?.licenseExpiresAfterDays ?? product?.licenseExpiresAfterDays,
  };
}

function normalizePositiveNumber(value: unknown) {
  return typeof value === "number" && value > 0 ? value : undefined;
}

function computeExpiresAt(days: unknown, now: number) {
  const normalized = normalizePositiveNumber(days);
  return normalized ? now + normalized * 24 * 60 * 60 * 1000 : undefined;
}

async function appendOrderHistory(ctx: any, args: any) {
  await ctx.db.insert("commerce_order_history", {
    orderId: args.orderId,
    eventType: args.eventType,
    message: args.message,
    actorUserId: args.actorUserId,
    metadata: args.metadata,
    createdAt: Date.now(),
  });
}

async function getLatestDigitalFiles(ctx: any, productId: any, variantId?: any) {
  const files = await ctx.db
    .query("commerce_digital_files")
    .withIndex("by_product", (q: any) => q.eq("productId", productId))
    .collect();

  return files
    .filter((file: any) => file.isLatest)
    .filter((file: any) => {
      if (variantId) {
        return (
          file.variantId?.toString() === variantId.toString() ||
          file.variantId === undefined
        );
      }
      return file.variantId === undefined;
    })
    .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

async function tokenExists(ctx: any, args: any) {
  const tokens = await ctx.db
    .query("commerce_download_tokens")
    .withIndex("by_order_item", (q: any) => q.eq("orderItemId", args.orderItemId))
    .collect();
  return tokens.some(
    (token: any) =>
      token.digitalFileId?.toString() === args.digitalFileId.toString() &&
      token.orderId?.toString() === args.orderId.toString(),
  );
}

async function createDownloadToken(ctx: any, args: any) {
  const now = Date.now();
  await ctx.db.insert("commerce_download_tokens", {
    digitalFileId: args.digitalFileId,
    orderId: args.orderId,
    orderItemId: args.orderItemId,
    userId: args.userId,
    token: generateRandomHex(32),
    downloadCount: 0,
    maxDownloads: normalizePositiveNumber(args.maxDownloads),
    expiresAt: computeExpiresAt(args.expiryDays, now),
    isActive: true,
    createdAt: now,
  });
}

async function countAssignedKeysForLine(ctx: any, args: any) {
  const keys = await ctx.db
    .query("commerce_license_keys")
    .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
    .collect();
  return keys.filter((key: any) => {
    if (key.status === "revoked") return false;
    if (key.productId?.toString() !== args.productId.toString()) return false;
    return (key.variantId?.toString() ?? null) === (args.variantId?.toString() ?? null);
  }).length;
}

async function findAvailableLicenseKey(ctx: any, productId: any, variantId?: any) {
  const available = await ctx.db
    .query("commerce_license_keys")
    .withIndex("by_product_status", (q: any) =>
      q.eq("productId", productId).eq("status", "available"),
    )
    .collect();

  if (variantId) {
    const exact = available.find(
      (key: any) => key.variantId?.toString() === variantId.toString(),
    );
    if (exact) return exact;
  }

  return available.find((key: any) => key.variantId === undefined) ?? null;
}

async function assignMissingLicenseKeys(ctx: any, args: any) {
  const existingCount = await countAssignedKeysForLine(ctx, args);
  const needed = Math.max(0, args.quantity - existingCount);
  const assigned: any[] = [];
  const errors: string[] = [];
  const now = Date.now();

  for (let i = 0; i < needed; i++) {
    const key = await findAvailableLicenseKey(ctx, args.productId, args.variantId);
    if (!key) {
      errors.push(`No available license keys for ${args.label}.`);
      break;
    }

    await ctx.db.patch(key._id, {
      orderId: args.orderId,
      userId: args.userId,
      status: "assigned",
      expiresAt: key.expiresAt ?? computeExpiresAt(args.licenseExpiresAfterDays, now),
      updatedAt: now,
    });
    assigned.push(key._id);
  }

  return { assigned, errors, existingCount };
}

export async function fulfillOrderDigitalEntitlementsHandler(ctx: any, args: any) {
    const order = await ctx.db.get(args.orderId);
    if (!order) return { status: "failed", reason: "Order not found" };

    if (!isOrderEligibleForDigitalFulfillment(order)) {
      await ctx.db.patch(order._id, {
        digitalFulfillmentStatus: "pending",
        updatedAt: Date.now(),
      });
      return { status: "pending", reason: "Order is not paid yet" };
    }

    const lmsEnrollments = await syncPurchasedCourseEnrollmentsHandler(ctx, {
      orderId: order._id,
      userId: order.userId,
      action: "grant",
    });

    if (!(await isPluginEnabled(ctx, "commerceDigital"))) {
      return { status: "skipped", reason: "commerceDigital disabled", lmsEnrollments };
    }

    const orderItems = await ctx.db
      .query("commerce_order_items")
      .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
      .collect();

    let required = false;
    let createdTokens = 0;
    let existingTokens = 0;
    let assignedKeys = 0;
    let existingAssignedKeys = 0;
    const reviewMessages: string[] = [];

    for (const item of orderItems) {
      const product = await ctx.db.get(item.productId);
      if (!product) {
        reviewMessages.push(`Product missing for order item ${item._id}.`);
        continue;
      }
      const variant = item.variantId ? await ctx.db.get(item.variantId) : null;
      const policy = resolveDigitalPolicy(product, variant);
      const quantity = Math.max(1, Number(item.quantity ?? 1));
      const label = item.productTitle ?? product.title ?? "digital product";

      if (!policy.downloadsRequired && !policy.licensesRequired) continue;
      required = true;

      const files = policy.downloadsRequired
        ? await getLatestDigitalFiles(ctx, product._id, item.variantId)
        : [];

      if (policy.downloadsRequired && files.length === 0) {
        reviewMessages.push(`No latest digital file is attached to ${label}.`);
      }

      let fileRequiresLicense = false;
      for (const file of files) {
        fileRequiresLicense ||= Boolean(file.requiresLicense);
        if (await tokenExists(ctx, {
          orderId: order._id,
          orderItemId: item._id,
          digitalFileId: file._id,
        })) {
          existingTokens += 1;
          continue;
        }
        await createDownloadToken(ctx, {
          digitalFileId: file._id,
          orderId: order._id,
          orderItemId: item._id,
          userId: order.userId,
          maxDownloads: policy.downloadLimit,
          expiryDays: policy.downloadExpiryDays,
        });
        createdTokens += 1;
      }

      if (policy.licensesRequired || fileRequiresLicense) {
        const result = await assignMissingLicenseKeys(ctx, {
          orderId: order._id,
          userId: order.userId,
          productId: product._id,
          variantId: item.variantId,
          quantity,
          label,
          licenseExpiresAfterDays: policy.licenseExpiresAfterDays,
        });
        assignedKeys += result.assigned.length;
        existingAssignedKeys += result.existingCount;
        reviewMessages.push(...result.errors);
      }
    }

    const now = Date.now();
    const status = !required
      ? "not_required"
      : reviewMessages.length > 0
        ? createdTokens > 0 ||
            assignedKeys > 0 ||
            existingTokens > 0 ||
            existingAssignedKeys > 0
          ? "partial"
          : "needs_review"
        : "completed";

    await ctx.db.patch(order._id, {
      digitalFulfillmentStatus: status,
      digitalFulfilledAt: status === "completed" || status === "not_required" ? now : undefined,
      digitalFulfillmentError: reviewMessages.length
        ? reviewMessages.join(" ")
        : undefined,
      updatedAt: now,
    });

    if (
      required &&
      (createdTokens > 0 ||
        assignedKeys > 0 ||
        reviewMessages.length > 0 ||
        order.digitalFulfillmentStatus !== status)
    ) {
      await appendOrderHistory(ctx, {
        orderId: order._id,
        eventType:
          status === "completed"
            ? "digital_fulfillment_completed"
            : "digital_fulfillment_needs_review",
        message:
          status === "completed"
            ? `Digital fulfillment completed: ${createdTokens} download token(s), ${assignedKeys} license key(s).`
            : `Digital fulfillment needs review: ${reviewMessages.join(" ")}`,
        actorUserId: args.actorUserId,
        metadata: {
          reason: args.reason,
          createdTokens,
          existingTokens,
          assignedKeys,
          existingAssignedKeys,
          lmsEnrollments,
          reviewMessages,
        },
      });
    }

    return {
      status,
      createdTokens,
      existingTokens,
      assignedKeys,
      existingAssignedKeys,
      lmsEnrollments,
      reviewMessages,
    };
}

export const fulfillOrderDigitalEntitlements = internalMutation({
  args: {
    orderId: v.id("commerce_orders"),
    actorUserId: v.optional(v.id("users")),
    reason: v.optional(v.string()),
  },
  handler: fulfillOrderDigitalEntitlementsHandler,
});
