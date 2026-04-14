// @ts-nocheck
// Note: @ts-nocheck is retained for the same reason as queries.ts — the
// generic Convex `db.query(table)` typing instantiates too deeply across
// our full schema (TS 2589). Once Convex tightens those generics we can
// remove this pragma. Logic here is still reviewed.
/**
 * Commerce Returns — Mutations
 *
 * POLICY: Returns require an authenticated user account.
 * Guest checkout orders must be claimed to an account before a return can be
 * requested. Returns involve ongoing communication, refund tracking, and
 * shipping labels.
 *
 * Emits commerce_return_history entries for every state transition, dispatches
 * events (RETURN_EVENTS.*), queues customer/admin email notifications, and
 * restocks both product and variant inventory when appropriate.
 */

import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { EMAIL_TEMPLATES, queueEmailForEvent } from "../helpers/email";
import { RETURN_EVENTS } from "../events/constants";
import { requireCommerceReturnsEnabled } from "./helpers";
import { expandBundleLineInventory } from "../commerceBundles/runtime";
import {
  assertValidRequestedItems,
  getCustomerOrderReturnEligibility,
} from "./eligibility";
import {
  buildApprovedItemUpdates,
  buildReceivedItemUpdates,
  calculateApprovedRefundLimit,
  getRemainingRestockQuantity,
  normalizeStoredReturnItems,
  shouldRestockReturnItem,
} from "./itemState";

type ReturnRequestDoc = Doc<"commerce_return_requests">;
type ReturnItemDoc = Doc<"commerce_return_items">;
type OrderItemDoc = Doc<"commerce_order_items">;
type UserDoc = Doc<"users">;

const itemApprovalValidator = v.object({
  orderItemId: v.id("commerce_order_items"),
  quantityApproved: v.number(),
  conditionCode: v.optional(v.string()),
  resolutionType: v.optional(v.string()),
});

const itemReceiptValidator = v.object({
  orderItemId: v.id("commerce_order_items"),
  quantityReceived: v.number(),
  conditionCode: v.optional(v.string()),
  resolutionType: v.optional(v.string()),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getReturnItemRows(
  ctx: MutationCtx,
  returnId: Id<"commerce_return_requests">,
): Promise<ReturnItemDoc[]> {
  return await ctx.db
    .query("commerce_return_items")
    .withIndex("by_return_request", (q) =>
      q.eq("returnRequestId", returnId),
    )
    .collect();
}

async function getOrCreateReturnItemRows(
  ctx: MutationCtx,
  returnRequest: ReturnRequestDoc,
  now: number,
): Promise<ReturnItemDoc[]> {
  const existingRows = await getReturnItemRows(ctx, returnRequest._id);
  if (existingRows.length > 0) {
    return existingRows;
  }

  const normalizedItems = normalizeStoredReturnItems(returnRequest);
  const createdRows: ReturnItemDoc[] = [];

  for (const item of normalizedItems) {
    if (!item.orderItemId) continue;
    const orderItem = await ctx.db.get(
      item.orderItemId as Id<"commerce_order_items">,
    );
    if (!orderItem?.productId) continue;

    const rowId = await ctx.db.insert("commerce_return_items", {
      returnRequestId: returnRequest._id,
      orderItemId: orderItem._id,
      productId: orderItem.productId,
      variantId: orderItem.variantId,
      quantityRequested: item.quantityRequested,
      quantityApproved: item.quantityApproved,
      quantityReceived: item.quantityReceived,
      quantityRestocked: item.quantityRestocked,
      reasonText: item.reason,
      createdAt: returnRequest.createdAt ?? now,
      updatedAt: now,
    });

    const inserted = await ctx.db.get(rowId);
    if (inserted) createdRows.push(inserted);
  }

  return createdRows;
}

async function getOrderItemsById(
  ctx: MutationCtx,
  orderId: Id<"commerce_orders">,
): Promise<Map<string, OrderItemDoc>> {
  const orderItems = await ctx.db
    .query("commerce_order_items")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  return new Map(orderItems.map((item) => [item._id.toString(), item]));
}

function throwValidationError(error: unknown): never {
  throw new ConvexError({
    code: "VALIDATION_ERROR",
    message: error instanceof Error ? error.message : String(error),
  });
}

function formatUserName(user: UserDoc | null): string | undefined {
  if (!user) return undefined;
  if (user.displayName) return user.displayName;
  const parts = [user.firstName, user.lastName].filter(
    (v): v is string => !!v,
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}

async function insertReturnHistory(
  ctx: MutationCtx,
  args: {
    returnRequestId: Id<"commerce_return_requests">;
    eventType: string;
    fromStatus?: string;
    toStatus?: string;
    actorUserId?: Id<"users">;
    actorType?: "admin" | "customer" | "system";
    note?: string;
    metadata?: Record<string, unknown>;
    now: number;
  },
): Promise<void> {
  await ctx.db.insert("commerce_return_history", {
    returnRequestId: args.returnRequestId,
    actorUserId: args.actorUserId,
    actorType: args.actorType,
    eventType: args.eventType,
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
    note: args.note,
    metadata: args.metadata,
    createdAt: args.now,
  });
}

async function emitReturnEvent(
  ctx: MutationCtx,
  args: {
    code: string;
    returnRequest: ReturnRequestDoc;
    orderNumber?: string;
    actorId?: string;
    extraPayload?: Record<string, unknown>;
  },
): Promise<Id<"events"> | null> {
  try {
    return await emitEvent(
      ctx,
      args.code,
      "commerce",
      {
        returnId: args.returnRequest._id.toString(),
        returnNumber: args.returnRequest.returnNumber,
        orderId: args.returnRequest.orderId.toString(),
        orderNumber: args.orderNumber ?? "",
        status: args.returnRequest.status,
        ...(args.extraPayload ?? {}),
      },
      args.actorId ? { actorId: args.actorId } : undefined,
    );
  } catch (error) {
    console.warn(
      `[commerceReturns] emitEvent ${args.code} failed:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function queueReturnEmail(
  ctx: MutationCtx,
  args: {
    template: string;
    recipientEmail?: string;
    recipientName?: string;
    recipientUserId?: string;
    eventId?: Id<"events"> | null;
    variables: Record<string, string>;
  },
): Promise<void> {
  if (!args.recipientEmail) return;
  try {
    await queueEmailForEvent(ctx, args.template, {
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      recipientUserId: args.recipientUserId,
      variables: args.variables,
      eventId: args.eventId ?? undefined,
    });
  } catch (error) {
    console.warn(
      `[commerceReturns] queueEmailForEvent ${args.template} failed:`,
      error instanceof Error ? error.message : error,
    );
  }
}

async function getAdminRecipients(ctx: MutationCtx) {
  const adminRole = await ctx.db
    .query("roles")
    .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
    .unique();

  if (!adminRole) return [] as UserDoc[];

  const admins = await ctx.db
    .query("users")
    .withIndex("by_roleId", (q) => q.eq("roleId", adminRole._id))
    .collect();

  return admins;
}

function formatCurrency(amountCents: number, currencyCode: string): string {
  const amount = (amountCents / 100).toFixed(2);
  return `${currencyCode?.toUpperCase() ?? "USD"} ${amount}`;
}

// ============================================
// CUSTOMER MUTATIONS
// ============================================

/**
 * Customer initiates a return request
 */
export const requestReturn = mutation({
  args: {
    orderId: v.id("commerce_orders"),
    reason: v.string(),
    reasonDetails: v.optional(v.string()),
    items: v.array(
      v.object({
        orderItemId: v.id("commerce_order_items"),
        quantity: v.number(),
        reason: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireCommerceReturnsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "You must be signed in to request a return.",
      });
    }

    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Order not found.",
      });
    }

    const eligibleStatuses = ["completed", "fulfilled"];
    if (!eligibleStatuses.includes(order.status)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot return order with status: ${order.status}. Order must be completed or fulfilled.`,
      });
    }

    if (order.userId?.toString() !== user._id.toString()) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only return your own orders.",
      });
    }

    const eligibility = await getCustomerOrderReturnEligibility(
      ctx as never,
      {
        orderId: args.orderId,
        userId: user._id,
      },
    );
    if (!eligibility.isEligible) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          eligibility.ineligibleReason ??
          "This order is not eligible for returns.",
      });
    }
    assertValidRequestedItems(
      args.items.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.quantity,
      })),
      new Map(
        eligibility.items.map((item: { orderItemId: string; quantityAvailableToReturn: number }) => [
          item.orderItemId,
          item.quantityAvailableToReturn,
        ]),
      ),
    );

    const orderItems = await ctx.db
      .query("commerce_order_items")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    for (const item of args.items) {
      const orderItem = orderItems.find(
        (oi) => oi._id.toString() === item.orderItemId.toString(),
      );
      if (!orderItem) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Order item ${item.orderItemId} not found in this order.`,
        });
      }
      if (item.quantity > orderItem.quantity) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Cannot return more than ordered quantity for ${orderItem.productTitle}.`,
        });
      }
      if (item.quantity <= 0) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Return quantity must be greater than 0 for ${orderItem.productTitle}.`,
        });
      }

      if (orderItem.productId) {
        const product = await ctx.db.get(orderItem.productId);
        if (product?.isNonReturnable === true) {
          throw new ConvexError({
            code: "VALIDATION_ERROR",
            message: `${orderItem.productTitle} is not eligible for return.`,
          });
        }
      }
    }

    const returnNumber = `RMA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const now = Date.now();

    const returnId = await ctx.db.insert("commerce_return_requests", {
      returnNumber,
      orderId: args.orderId,
      userId: user._id,
      status: "requested",
      reason: args.reason,
      reasonDetails: args.reasonDetails,
      items: args.items,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of args.items) {
      const orderItem = orderItems.find(
        (oi) => oi._id.toString() === item.orderItemId.toString(),
      );
      if (!orderItem?.productId) continue;
      await ctx.db.insert("commerce_return_items", {
        returnRequestId: returnId,
        orderItemId: orderItem._id,
        productId: orderItem.productId,
        variantId: orderItem.variantId,
        quantityRequested: item.quantity,
        reasonText: item.reason,
        createdAt: now,
        updatedAt: now,
      });
    }

    const insertedReturn = (await ctx.db.get(returnId)) as ReturnRequestDoc;

    await insertReturnHistory(ctx, {
      returnRequestId: returnId,
      eventType: "requested",
      toStatus: "requested",
      actorUserId: user._id,
      actorType: "customer",
      note: args.reasonDetails,
      metadata: {
        reason: args.reason,
        itemCount: args.items.length,
      },
      now,
    });

    await ctx.db.insert("commerce_order_history", {
      orderId: args.orderId,
      eventType: "return_requested",
      message: `Return requested: ${args.reason}`,
      actorUserId: user._id,
      metadata: {
        returnId,
        returnNumber,
        itemCount: args.items.length,
      },
      createdAt: now,
    });

    const eventId = await emitReturnEvent(ctx, {
      code: RETURN_EVENTS.REQUESTED,
      returnRequest: insertedReturn,
      orderNumber: order.orderNumber,
      actorId: user._id.toString(),
      extraPayload: {
        reason: args.reason,
      },
    });

    const adminRecipients = await getAdminRecipients(ctx);
    for (const admin of adminRecipients) {
      if (!admin.email) continue;
      await queueReturnEmail(ctx, {
        template: EMAIL_TEMPLATES.RETURN_REQUESTED_ADMIN,
        recipientEmail: admin.email,
        recipientName: formatUserName(admin),
        recipientUserId: admin._id.toString(),
        eventId,
        variables: {
          returnNumber,
          orderNumber: order.orderNumber,
          customerEmail: order.email,
          reason: args.reason,
        },
      });
    }

    return { returnId, returnNumber };
  },
});

// ============================================
// ADMIN MUTATIONS
// ============================================

export const approveReturn = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    refundAmount: v.number(),
    items: v.optional(v.array(itemApprovalValidator)),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireCan(ctx, "commerce.returns.review");
    await requireCommerceReturnsEnabled(ctx);

    const returnRequest = await ctx.db.get(args.returnId);
    if (!returnRequest) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Return request not found.",
      });
    }

    if (returnRequest.status !== "requested") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot approve return with status: ${returnRequest.status}. Must be "requested".`,
      });
    }

    if (args.refundAmount <= 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Refund amount must be greater than 0.",
      });
    }

    const now = Date.now();
    const returnItemRows = await getOrCreateReturnItemRows(ctx, returnRequest, now);
    let approvedItems;

    try {
      approvedItems = buildApprovedItemUpdates(
        normalizeStoredReturnItems(returnRequest, returnItemRows),
        args.items,
      );
      const refundLimit = calculateApprovedRefundLimit(
        approvedItems,
        await getOrderItemsById(ctx, returnRequest.orderId),
      );
      if (args.refundAmount > refundLimit) {
        throw new Error(
          `Refund amount cannot exceed approved item total $${(refundLimit / 100).toFixed(2)}.`,
        );
      }
    } catch (error) {
      throwValidationError(error);
    }

    await ctx.db.patch(args.returnId, {
      status: "approved",
      refundAmount: args.refundAmount,
      processedBy: admin._id,
      notes: args.notes,
      updatedAt: now,
    });

    const rowsByOrderItemId = new Map(
      returnItemRows.map((row) => [row.orderItemId.toString(), row]),
    );
    for (const item of approvedItems!) {
      const row = rowsByOrderItemId.get(item.orderItemId!);
      if (!row) continue;
      await ctx.db.patch(row._id, {
        quantityApproved: item.quantityApproved,
        conditionCode: item.conditionCode,
        resolutionType: item.resolutionType,
        updatedAt: now,
      });
    }

    await insertReturnHistory(ctx, {
      returnRequestId: args.returnId,
      eventType: "approved",
      fromStatus: "requested",
      toStatus: "approved",
      actorUserId: admin._id,
      actorType: "admin",
      note: args.notes,
      metadata: {
        refundAmount: args.refundAmount,
      },
      now,
    });

    await ctx.db.insert("commerce_order_history", {
      orderId: returnRequest.orderId,
      eventType: "return_approved",
      message: `Return ${returnRequest.returnNumber} approved. Refund: $${(args.refundAmount / 100).toFixed(2)}`,
      actorUserId: admin._id,
      createdAt: now,
    });

    const order = await ctx.db.get(returnRequest.orderId);
    const updatedReturn = (await ctx.db.get(args.returnId)) as ReturnRequestDoc;
    const eventId = await emitReturnEvent(ctx, {
      code: RETURN_EVENTS.APPROVED,
      returnRequest: updatedReturn,
      orderNumber: order?.orderNumber,
      actorId: admin._id.toString(),
      extraPayload: {
        refundAmount: String(args.refundAmount),
      },
    });

    if (order?.email) {
      await queueReturnEmail(ctx, {
        template: EMAIL_TEMPLATES.RETURN_APPROVED,
        recipientEmail: order.email,
        recipientUserId: returnRequest.userId?.toString(),
        eventId,
        variables: {
          returnNumber: returnRequest.returnNumber,
          orderNumber: order.orderNumber,
          refundAmount: formatCurrency(args.refundAmount, order.currencyCode),
          notes: args.notes ?? "",
        },
      });
    }

    return { success: true };
  },
});

export const rejectReturn = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireCan(ctx, "commerce.returns.review");
    await requireCommerceReturnsEnabled(ctx);

    const returnRequest = await ctx.db.get(args.returnId);
    if (!returnRequest) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Return request not found.",
      });
    }

    if (returnRequest.status !== "requested") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot reject return with status: ${returnRequest.status}. Must be "requested".`,
      });
    }

    const now = Date.now();

    await ctx.db.patch(args.returnId, {
      status: "rejected",
      processedBy: admin._id,
      notes: args.reason,
      updatedAt: now,
    });

    await insertReturnHistory(ctx, {
      returnRequestId: args.returnId,
      eventType: "rejected",
      fromStatus: "requested",
      toStatus: "rejected",
      actorUserId: admin._id,
      actorType: "admin",
      note: args.reason,
      now,
    });

    await ctx.db.insert("commerce_order_history", {
      orderId: returnRequest.orderId,
      eventType: "return_rejected",
      message: `Return ${returnRequest.returnNumber} rejected: ${args.reason}`,
      actorUserId: admin._id,
      createdAt: now,
    });

    const order = await ctx.db.get(returnRequest.orderId);
    const updatedReturn = (await ctx.db.get(args.returnId)) as ReturnRequestDoc;
    const eventId = await emitReturnEvent(ctx, {
      code: RETURN_EVENTS.REJECTED,
      returnRequest: updatedReturn,
      orderNumber: order?.orderNumber,
      actorId: admin._id.toString(),
      extraPayload: {
        reason: args.reason,
      },
    });

    if (order?.email) {
      await queueReturnEmail(ctx, {
        template: EMAIL_TEMPLATES.RETURN_REJECTED,
        recipientEmail: order.email,
        recipientUserId: returnRequest.userId?.toString(),
        eventId,
        variables: {
          returnNumber: returnRequest.returnNumber,
          orderNumber: order.orderNumber,
          reason: args.reason,
        },
      });
    }

    return { success: true };
  },
});

export const markReceived = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    items: v.optional(v.array(itemReceiptValidator)),
    trackingNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireCan(ctx, "commerce.returns.receive");
    await requireCommerceReturnsEnabled(ctx);

    const returnRequest = await ctx.db.get(args.returnId);
    if (!returnRequest) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Return request not found.",
      });
    }

    if (returnRequest.status !== "approved") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot mark received with status: ${returnRequest.status}. Must be "approved".`,
      });
    }

    const now = Date.now();
    const returnItemRows = await getOrCreateReturnItemRows(ctx, returnRequest, now);
    let receivedItems;

    try {
      receivedItems = buildReceivedItemUpdates(
        normalizeStoredReturnItems(returnRequest, returnItemRows),
        args.items,
      );
    } catch (error) {
      throwValidationError(error);
    }

    await ctx.db.patch(args.returnId, {
      status: "received",
      trackingNumber: args.trackingNumber ?? returnRequest.trackingNumber,
      notes: args.notes
        ? (returnRequest.notes ?? "") + "\n\n" + args.notes
        : returnRequest.notes,
      updatedAt: now,
    });

    const rowsByOrderItemId = new Map(
      returnItemRows.map((row) => [row.orderItemId.toString(), row]),
    );
    for (const item of receivedItems!) {
      const row = rowsByOrderItemId.get(item.orderItemId!);
      if (!row) continue;
      await ctx.db.patch(row._id, {
        quantityReceived: item.quantityReceived,
        conditionCode: item.conditionCode,
        resolutionType: item.resolutionType,
        updatedAt: now,
      });
    }

    await insertReturnHistory(ctx, {
      returnRequestId: args.returnId,
      eventType: "received",
      fromStatus: "approved",
      toStatus: "received",
      actorUserId: admin._id,
      actorType: "admin",
      note: args.trackingNumber,
      metadata: args.notes ? { notes: args.notes } : undefined,
      now,
    });

    await ctx.db.insert("commerce_order_history", {
      orderId: returnRequest.orderId,
      eventType: "return_received",
      message: `Return ${returnRequest.returnNumber} items received`,
      actorUserId: admin._id,
      createdAt: now,
    });

    const order = await ctx.db.get(returnRequest.orderId);
    const updatedReturn = (await ctx.db.get(args.returnId)) as ReturnRequestDoc;
    await emitReturnEvent(ctx, {
      code: RETURN_EVENTS.RECEIVED,
      returnRequest: updatedReturn,
      orderNumber: order?.orderNumber,
      actorId: admin._id.toString(),
    });

    return { success: true };
  },
});

/**
 * Process refund for return — creates a refund record in the payments system
 * and triggers the actual payment provider refund.
 *
 * Important safety properties:
 *   - Refund amount is recomputed from actually *received* quantities to
 *     guarantee partial receipt is never over-refunded.
 *   - refundMethod === "original_payment" requires a real Stripe-capable
 *     transaction. Without one, the call fails rather than silently marking
 *     the return as refunded.
 *   - Manual (non-original_payment) refund methods (e.g. store_credit) mark
 *     the refund record succeeded immediately, because the admin is recording
 *     an out-of-band refund.
 */
export const processRefund = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    refundMethod: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireCan(ctx, "commerce.returns.refund");
    await requireCommerceReturnsEnabled(ctx);

    const returnRequest = await ctx.db.get(args.returnId);
    if (!returnRequest) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Return request not found.",
      });
    }

    if (returnRequest.status !== "received") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot process refund with status: ${returnRequest.status}. Must be "received".`,
      });
    }

    // Recalculate refund amount from actually received quantities, not the
    // value that was stored at approval time. This guarantees partial
    // receipts never get refunded for more than what was received.
    const now = Date.now();
    const returnItemRows = await getOrCreateReturnItemRows(ctx, returnRequest, now);
    const normalizedItems = normalizeStoredReturnItems(returnRequest, returnItemRows);
    const orderItemsById = await getOrderItemsById(ctx, returnRequest.orderId);

    const receivedRefundLimit = normalizedItems.reduce((sum, item) => {
      const orderItem = item.orderItemId
        ? orderItemsById.get(item.orderItemId)
        : undefined;
      if (!orderItem) return sum;
      const orderedQuantity = Math.max(0, orderItem.quantity ?? 0);
      const receivedQuantity = Math.max(0, item.quantityReceived ?? 0);
      if (orderedQuantity <= 0 || receivedQuantity <= 0) return sum;
      const lineTotal =
        typeof orderItem.lineTotalAmount === "number"
          ? orderItem.lineTotalAmount
          : Math.max(0, orderItem.unitPriceAmount ?? 0) * orderedQuantity;
      return sum + Math.round((lineTotal * receivedQuantity) / orderedQuantity);
    }, 0);

    if (receivedRefundLimit <= 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          "Cannot process refund: no items have been marked received with a quantity greater than 0.",
      });
    }

    const approvedAmount = returnRequest.refundAmount ?? 0;
    if (approvedAmount <= 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          "No refund amount set. Approve the return with a refund amount first.",
      });
    }

    // Cap the refund at whatever was actually received.
    const effectiveRefundAmount = Math.min(approvedAmount, receivedRefundLimit);

    // Locate a refundable transaction up front so we can fail before
    // persisting state for original_payment flows that cannot be fulfilled.
    const transactions = await ctx.db
      .query("commerce_payment_transactions")
      .withIndex("by_order", (q) => q.eq("orderId", returnRequest.orderId))
      .collect();
    const succeededTxn = transactions.find(
      (t) => t.status === "succeeded" || t.status === "partially_refunded",
    );

    const isOriginalPayment = args.refundMethod === "original_payment";
    const canAutoRefundViaStripe =
      !!succeededTxn &&
      succeededTxn.provider === "stripe" &&
      !!succeededTxn.providerTransactionId;

    if (isOriginalPayment && !canAutoRefundViaStripe) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          "Cannot refund to original payment: no Stripe transaction is available. " +
          "Choose a manual refund method (e.g. store credit) or record the refund outside the system.",
      });
    }

    await ctx.db.patch(args.returnId, {
      status: "refund_pending",
      refundMethod: args.refundMethod,
      refundAmount: effectiveRefundAmount,
      refundPendingAt: now,
      notes: args.notes
        ? (returnRequest.notes ?? "") + "\n\n" + args.notes
        : returnRequest.notes,
      updatedAt: now,
    });

    await insertReturnHistory(ctx, {
      returnRequestId: args.returnId,
      eventType: "refund_pending",
      fromStatus: "received",
      toStatus: "refund_pending",
      actorUserId: admin._id,
      actorType: "admin",
      note: args.refundMethod,
      metadata: {
        refundAmount: effectiveRefundAmount,
        refundMethod: args.refundMethod,
      },
      now,
    });

    if (succeededTxn) {
      const refundId = await ctx.db.insert("commerce_payment_refunds", {
        orderId: returnRequest.orderId,
        transactionId: succeededTxn._id,
        returnId: args.returnId,
        amount: {
          amount: effectiveRefundAmount,
          currencyCode: succeededTxn.amount.currencyCode,
        },
        reason: `Return ${returnRequest.returnNumber}: ${args.refundMethod}`,
        status: "pending",
        createdBy: admin._id,
        createdAt: now,
        updatedAt: now,
      });

      if (isOriginalPayment && canAutoRefundViaStripe) {
        await ctx.scheduler.runAfter(
          0,
          internal.commerce.paymentActions.processStripeRefund,
          {
            refundId,
            transactionId: succeededTxn._id,
            providerTransactionId: succeededTxn.providerTransactionId!,
            amount: effectiveRefundAmount,
          },
        );
      } else {
        // Manual refund method: admin is recording an out-of-band refund
        // (store credit, manual Stripe dashboard action, etc.). The refund
        // status for the refund record is marked succeeded so that the
        // payments ledger is consistent, and the return immediately advances
        // to "refunded". The provider transaction is NOT touched.
        await ctx.db.patch(refundId, {
          status: "succeeded",
          updatedAt: now,
        });
        await ctx.db.patch(args.returnId, {
          status: "refunded",
          refundedAt: now,
          updatedAt: now,
        });

        await insertReturnHistory(ctx, {
          returnRequestId: args.returnId,
          eventType: "refund_succeeded",
          fromStatus: "refund_pending",
          toStatus: "refunded",
          actorUserId: admin._id,
          actorType: "admin",
          note: args.refundMethod,
          metadata: {
            refundAmount: effectiveRefundAmount,
            refundMethod: args.refundMethod,
            manual: true,
          },
          now,
        });
      }
    } else {
      // No payment transaction recorded at all. Only acceptable for
      // manual refund methods. (isOriginalPayment already rejected above.)
      await ctx.db.patch(args.returnId, {
        status: "refunded",
        refundedAt: now,
        updatedAt: now,
      });

      await insertReturnHistory(ctx, {
        returnRequestId: args.returnId,
        eventType: "refund_succeeded",
        fromStatus: "refund_pending",
        toStatus: "refunded",
        actorUserId: admin._id,
        actorType: "admin",
        note: args.refundMethod,
        metadata: {
          refundAmount: effectiveRefundAmount,
          refundMethod: args.refundMethod,
          manual: true,
          noTransaction: true,
        },
        now,
      });
    }

    await ctx.db.insert("commerce_order_history", {
      orderId: returnRequest.orderId,
      eventType: "refund_processed",
      message: `Refund of $${(effectiveRefundAmount / 100).toFixed(2)} processed via ${args.refundMethod} for return ${returnRequest.returnNumber}`,
      actorUserId: admin._id,
      metadata: {
        returnId: args.returnId,
        refundAmount: effectiveRefundAmount,
        refundMethod: args.refundMethod,
      },
      createdAt: now,
    });

    const order = await ctx.db.get(returnRequest.orderId);
    const updatedReturn = (await ctx.db.get(args.returnId)) as ReturnRequestDoc;
    const refundedNow = updatedReturn.status === "refunded";

    const eventId = refundedNow
      ? await emitReturnEvent(ctx, {
          code: RETURN_EVENTS.REFUNDED,
          returnRequest: updatedReturn,
          orderNumber: order?.orderNumber,
          actorId: admin._id.toString(),
          extraPayload: {
            refundAmount: String(effectiveRefundAmount),
            refundMethod: args.refundMethod,
          },
        })
      : null;

    if (refundedNow && order?.email) {
      await queueReturnEmail(ctx, {
        template: EMAIL_TEMPLATES.RETURN_REFUNDED,
        recipientEmail: order.email,
        recipientUserId: returnRequest.userId?.toString(),
        eventId,
        variables: {
          returnNumber: returnRequest.returnNumber,
          orderNumber: order.orderNumber,
          refundAmount: formatCurrency(effectiveRefundAmount, order.currencyCode),
          refundMethod: args.refundMethod,
        },
      });
    }

    return { success: true };
  },
});

/**
 * Complete return (final step — restocks inventory).
 *
 * Restocks both product-level stock (for simple products) and variant-level
 * stock (for variable products), matching how inventory is deducted at
 * checkout.
 */
export const completeReturn = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireCan(ctx, "commerce.returns.manage");
    await requireCommerceReturnsEnabled(ctx);

    const returnRequest = await ctx.db.get(args.returnId);
    if (!returnRequest) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Return request not found.",
      });
    }

    if (returnRequest.status !== "refunded") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot complete return with status: ${returnRequest.status}. Must be "refunded".`,
      });
    }

    const now = Date.now();

    await ctx.db.patch(args.returnId, {
      status: "completed",
      completedAt: now,
      notes: args.notes
        ? (returnRequest.notes ?? "") + "\n\n" + args.notes
        : returnRequest.notes,
      updatedAt: now,
    });

    await insertReturnHistory(ctx, {
      returnRequestId: args.returnId,
      eventType: "completed",
      fromStatus: "refunded",
      toStatus: "completed",
      actorUserId: admin._id,
      actorType: "admin",
      note: args.notes,
      now,
    });

    await ctx.db.insert("commerce_order_history", {
      orderId: returnRequest.orderId,
      eventType: "return_completed",
      message: `Return ${returnRequest.returnNumber} completed`,
      actorUserId: admin._id,
      createdAt: now,
    });

    const returnItemRows = await getOrCreateReturnItemRows(ctx, returnRequest, now);
    const normalizedItems = normalizeStoredReturnItems(returnRequest, returnItemRows);
    const rowsByOrderItemId = new Map(
      returnItemRows.map((row) => [row.orderItemId.toString(), row]),
    );

    for (const item of normalizedItems) {
      if (!shouldRestockReturnItem(item)) continue;
      const restockQuantity = getRemainingRestockQuantity(item);
      if (restockQuantity <= 0 || !item.orderItemId) continue;

      const orderItem = await ctx.db.get(
        item.orderItemId as Id<"commerce_order_items">,
      );
      if (!orderItem?.productId) continue;

      // Check if this is a bundle order item — restock component products, not the owning bundle product
      if (orderItem.metadata?.lineType === "bundle" && orderItem.metadata?.selections) {
        const componentDeltas = expandBundleLineInventory(orderItem.metadata, restockQuantity);
        for (const delta of componentDeltas) {
          const compProduct = delta.productId ? await ctx.db.get(delta.productId) : null;
          if (compProduct?.trackInventory) {
            await ctx.db.patch(delta.productId, {
              stockQuantity: (compProduct.stockQuantity ?? 0) + delta.quantity,
              updatedAt: now,
            });
          }
          if (delta.variantId) {
            const variant = await ctx.db.get(delta.variantId);
            if (variant) {
              await ctx.db.patch(delta.variantId, {
                stockQuantity: (variant.stockQuantity ?? 0) + delta.quantity,
                updatedAt: now,
              });
            }
          }
          await ctx.db.insert("commerce_inventory_adjustments", {
            productId: delta.productId,
            variantId: delta.variantId,
            adjustmentType: "return",
            quantityDelta: delta.quantity,
            reason: `Return ${returnRequest.returnNumber} — bundle component restock`,
            actorUserId: admin._id,
            createdAt: now,
          });
        }
        // Also restore bundle-level stock if tracked
        const bundleId = orderItem.metadata.bundleId;
        if (bundleId) {
          const bundle = await ctx.db.get(bundleId);
          if (bundle?.trackInventory && typeof bundle.stockCount === "number") {
            await ctx.db.patch(bundleId, {
              stockCount: bundle.stockCount + orderItem.quantity,
              updatedAt: now,
            });
          }
        }

        const row = rowsByOrderItemId.get(item.orderItemId);
        if (row) {
          await ctx.db.patch(row._id, {
            quantityRestocked: (row.quantityRestocked ?? 0) + restockQuantity,
            updatedAt: now,
          });
        }
        continue; // Skip the normal single-product restock for this bundle item
      }

      const product = await ctx.db.get(orderItem.productId);

      if (orderItem.variantId) {
        const variant = await ctx.db.get(orderItem.variantId);
        if (variant) {
          const currentStock = variant.stockQuantity ?? 0;
          await ctx.db.patch(orderItem.variantId, {
            stockQuantity: currentStock + restockQuantity,
            updatedAt: now,
          });
        }
      }

      if (product && product.trackInventory) {
        const currentStock = product.stockQuantity ?? 0;
        await ctx.db.patch(orderItem.productId, {
          stockQuantity: currentStock + restockQuantity,
          updatedAt: now,
        });
      }

      await ctx.db.insert("commerce_inventory_adjustments", {
        productId: orderItem.productId,
        variantId: orderItem.variantId,
        adjustmentType: "return",
        quantityDelta: restockQuantity,
        reason: `Return ${returnRequest.returnNumber} completed`,
        actorUserId: admin._id,
        createdAt: now,
      });

      const row = rowsByOrderItemId.get(item.orderItemId);
      if (row) {
        await ctx.db.patch(row._id, {
          quantityRestocked: (row.quantityRestocked ?? 0) + restockQuantity,
          updatedAt: now,
        });
      }
    }

    const order = await ctx.db.get(returnRequest.orderId);
    const updatedReturn = (await ctx.db.get(args.returnId)) as ReturnRequestDoc;
    await emitReturnEvent(ctx, {
      code: RETURN_EVENTS.COMPLETED,
      returnRequest: updatedReturn,
      orderNumber: order?.orderNumber,
      actorId: admin._id.toString(),
    });

    return { success: true };
  },
});

export const addShippingLabel = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    shippingLabelUrl: v.string(),
    trackingNumber: v.optional(v.string()),
    carrier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireCan(ctx, "commerce.returns.manage");
    await requireCommerceReturnsEnabled(ctx);

    const returnRequest = await ctx.db.get(args.returnId);
    if (!returnRequest) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Return request not found.",
      });
    }

    const now = Date.now();

    await ctx.db.patch(args.returnId, {
      returnShippingLabel: args.shippingLabelUrl,
      trackingNumber: args.trackingNumber,
      updatedAt: now,
    });

    await ctx.db.insert("commerce_return_labels", {
      returnRequestId: args.returnId,
      carrier: args.carrier,
      trackingNumber: args.trackingNumber,
      labelUrl: args.shippingLabelUrl,
      createdBy: admin._id,
      createdAt: now,
      updatedAt: now,
    });

    await insertReturnHistory(ctx, {
      returnRequestId: args.returnId,
      eventType: "label_added",
      fromStatus: returnRequest.status,
      toStatus: returnRequest.status,
      actorUserId: admin._id,
      actorType: "admin",
      note: args.trackingNumber,
      metadata: {
        carrier: args.carrier,
        trackingNumber: args.trackingNumber,
      },
      now,
    });

    await ctx.db.insert("commerce_order_history", {
      orderId: returnRequest.orderId,
      eventType: "return_label_created",
      message: `Return shipping label created for ${returnRequest.returnNumber}`,
      actorUserId: admin._id,
      metadata: {
        trackingNumber: args.trackingNumber,
        carrier: args.carrier,
      },
      createdAt: now,
    });

    const order = await ctx.db.get(returnRequest.orderId);
    const updatedReturn = (await ctx.db.get(args.returnId)) as ReturnRequestDoc;
    const eventId = await emitReturnEvent(ctx, {
      code: RETURN_EVENTS.LABEL_ADDED,
      returnRequest: updatedReturn,
      orderNumber: order?.orderNumber,
      actorId: admin._id.toString(),
      extraPayload: {
        carrier: args.carrier ?? "",
        trackingNumber: args.trackingNumber ?? "",
      },
    });

    if (order?.email) {
      await queueReturnEmail(ctx, {
        template: EMAIL_TEMPLATES.RETURN_LABEL_ADDED,
        recipientEmail: order.email,
        recipientUserId: returnRequest.userId?.toString(),
        eventId,
        variables: {
          returnNumber: returnRequest.returnNumber,
          orderNumber: order.orderNumber,
          trackingNumber: args.trackingNumber ?? "",
          carrier: args.carrier ?? "",
          labelUrl: args.shippingLabelUrl,
        },
      });
    }

    return { success: true };
  },
});

export const updateNotes = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    const returnRequest = await ctx.db.get(args.returnId);
    if (!returnRequest) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Return request not found.",
      });
    }

    const now = Date.now();

    await ctx.db.patch(args.returnId, {
      notes: args.notes,
      updatedAt: now,
    });

    await insertReturnHistory(ctx, {
      returnRequestId: args.returnId,
      eventType: "notes_updated",
      fromStatus: returnRequest.status,
      toStatus: returnRequest.status,
      actorUserId: admin._id,
      actorType: "admin",
      note: args.notes,
      now,
    });

    return { success: true };
  },
});

// ============================================
// STUCK REFUND RECOVERY
// ============================================

/**
 * Retry a refund stuck in refund_pending. Only Stripe-backed refunds can be
 * re-scheduled automatically. For non-Stripe cases the caller gets an error
 * so they can manually resolve the refund rather than silently stalling.
 */
export const retryStuckRefund = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
  },
  handler: async (ctx, args) => {
    const admin = await requireCan(ctx, "commerce.returns.refund");
    await requireCommerceReturnsEnabled(ctx);

    const returnRequest = await ctx.db.get(args.returnId);
    if (!returnRequest || returnRequest.status !== "refund_pending") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Return is not in refund_pending state.",
      });
    }

    if (!returnRequest.refundAmount) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "No refund amount set on this return.",
      });
    }

    const now = Date.now();

    const transactions = await ctx.db
      .query("commerce_payment_transactions")
      .withIndex("by_order", (q) => q.eq("orderId", returnRequest.orderId))
      .collect();

    const succeededTxn = transactions.find(
      (t) => t.status === "succeeded" || t.status === "partially_refunded",
    );

    if (!succeededTxn || !succeededTxn.providerTransactionId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "No eligible payment transaction found for retry.",
      });
    }

    if (succeededTxn.provider !== "stripe") {
      throw new ConvexError({
        code: "UNSUPPORTED_PROVIDER",
        message: `Automatic retry is not available for provider "${succeededTxn.provider}". Resolve the refund manually.`,
      });
    }

    const existingRefunds = await ctx.db
      .query("commerce_payment_refunds")
      .withIndex("by_return", (q) => q.eq("returnId", args.returnId))
      .collect();

    let refundId: Id<"commerce_payment_refunds">;
    const pendingRefund = existingRefunds.find(
      (r) => r.status === "pending" || r.status === "failed",
    );
    if (pendingRefund) {
      await ctx.db.patch(pendingRefund._id, {
        status: "pending",
        failureCode: undefined,
        failureMessage: undefined,
        updatedAt: now,
      });
      refundId = pendingRefund._id;
    } else {
      refundId = await ctx.db.insert("commerce_payment_refunds", {
        orderId: returnRequest.orderId,
        transactionId: succeededTxn._id,
        returnId: args.returnId,
        amount: {
          amount: returnRequest.refundAmount,
          currencyCode: succeededTxn.amount.currencyCode,
        },
        reason: `Return ${returnRequest.returnNumber}: retry`,
        status: "pending",
        createdBy: admin._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.returnId, {
      refundPendingAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.commerce.paymentActions.processStripeRefund,
      {
        refundId,
        transactionId: succeededTxn._id,
        providerTransactionId: succeededTxn.providerTransactionId,
        amount: returnRequest.refundAmount,
      },
    );

    await insertReturnHistory(ctx, {
      returnRequestId: args.returnId,
      eventType: "refund_retried",
      fromStatus: "refund_pending",
      toStatus: "refund_pending",
      actorUserId: admin._id,
      actorType: "admin",
      metadata: {
        refundId: refundId.toString(),
        refundAmount: returnRequest.refundAmount,
      },
      now,
    });

    await ctx.db.insert("commerce_order_history", {
      orderId: returnRequest.orderId,
      eventType: "refund_retried",
      message: `Refund retry initiated for return ${returnRequest.returnNumber}`,
      actorUserId: admin._id,
      createdAt: now,
    });

    return { success: true, refundId };
  },
});
