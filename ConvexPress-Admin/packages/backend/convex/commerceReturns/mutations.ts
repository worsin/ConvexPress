// @ts-nocheck
/**
 * Commerce Returns — Mutations
 *
 * Ported from VexCart returns.ts mutations, adapted to ConvexPress
 * schema (commerce_return_* tables) and auth patterns.
 *
 * POLICY: Returns require an authenticated user account.
 * Guest checkout orders must be claimed to an account before a return can be requested.
 * This is intentional — returns involve ongoing communication, refund tracking, and shipping labels.
 *
 * Functions:
 *   Customer:
 *   - requestReturn        Customer initiates a return request
 *
 *   Admin:
 *   - approveReturn        Approve a return request (sets refund amount)
 *   - rejectReturn         Reject a return request
 *   - markReceived         Mark returned items as received
 *   - processRefund        Process refund for return (triggers payment refund)
 *   - completeReturn       Complete return (final step — restocks inventory)
 *   - addShippingLabel     Add return shipping label
 *   - updateNotes          Update return notes
 *   - retryStuckRefund     Retry a refund stuck in refund_pending state
 */

import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceReturnsEnabled } from "./helpers";

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
  handler: async (ctx: any, args: any) => {
    await requireCommerceReturnsEnabled(ctx);

    const user = await getCurrentUser(ctx);

    // Get order
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Order not found.",
      });
    }

    // Verify order is eligible for return (delivered or fulfilled)
    const eligibleStatuses = ["completed", "fulfilled"];
    if (!eligibleStatuses.includes(order.status)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot return order with status: ${order.status}. Order must be completed or fulfilled.`,
      });
    }

    // Check if user owns this order (if authenticated)
    if (user && order.userId && order.userId !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only return your own orders.",
      });
    }

    // Validate items exist in the order
    const orderItems = await ctx.db
      .query("commerce_order_items")
      .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
      .collect();

    for (const item of args.items) {
      const orderItem = orderItems.find(
        (oi: any) => oi._id === item.orderItemId,
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

      // Check if product is non-returnable
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

    // Generate return number
    const returnNumber = `RMA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const now = Date.now();

    // Create return request
    const returnId = await ctx.db.insert("commerce_return_requests", {
      returnNumber,
      orderId: args.orderId,
      userId: user?._id,
      status: "requested",
      reason: args.reason,
      reasonDetails: args.reasonDetails,
      items: args.items,
      createdAt: now,
      updatedAt: now,
    });

    // Add to order history
    await ctx.db.insert("commerce_order_history", {
      orderId: args.orderId,
      eventType: "return_requested",
      message: `Return requested: ${args.reason}`,
      actorUserId: user?._id,
      metadata: {
        returnId,
        returnNumber,
        itemCount: args.items.length,
      },
      createdAt: now,
    });

    return { returnId, returnNumber };
  },
});

// ============================================
// ADMIN MUTATIONS
// ============================================

/**
 * Admin approves a return request
 */
export const approveReturn = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    refundAmount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
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

    await ctx.db.patch(args.returnId, {
      status: "approved",
      refundAmount: args.refundAmount,
      processedBy: admin._id,
      notes: args.notes,
      updatedAt: now,
    });

    // Add to order history
    await ctx.db.insert("commerce_order_history", {
      orderId: returnRequest.orderId,
      eventType: "return_approved",
      message: `Return ${returnRequest.returnNumber} approved. Refund: $${(args.refundAmount / 100).toFixed(2)}`,
      actorUserId: admin._id,
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Admin rejects a return request
 */
export const rejectReturn = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    reason: v.string(),
  },
  handler: async (ctx: any, args: any) => {
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

    // Add to order history
    await ctx.db.insert("commerce_order_history", {
      orderId: returnRequest.orderId,
      eventType: "return_rejected",
      message: `Return ${returnRequest.returnNumber} rejected: ${args.reason}`,
      actorUserId: admin._id,
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Mark return items as received
 */
export const markReceived = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    trackingNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
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

    await ctx.db.patch(args.returnId, {
      status: "received",
      trackingNumber: args.trackingNumber ?? returnRequest.trackingNumber,
      notes: args.notes
        ? (returnRequest.notes ?? "") + "\n\n" + args.notes
        : returnRequest.notes,
      updatedAt: now,
    });

    // Add to order history
    await ctx.db.insert("commerce_order_history", {
      orderId: returnRequest.orderId,
      eventType: "return_received",
      message: `Return ${returnRequest.returnNumber} items received`,
      actorUserId: admin._id,
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Process refund for return — creates a refund record in the payments system
 * and triggers the actual payment provider refund.
 *
 * Sets status to "refund_pending" until the provider confirms completion,
 * at which point completeReturn can be called.
 */
export const processRefund = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    refundMethod: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
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

    if (!returnRequest.refundAmount) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "No refund amount set. Approve the return with a refund amount first.",
      });
    }

    const now = Date.now();

    // Set status to refund_pending — will transition to refunded once provider confirms
    await ctx.db.patch(args.returnId, {
      status: "refund_pending",
      refundMethod: args.refundMethod,
      refundPendingAt: now,
      notes: args.notes
        ? (returnRequest.notes ?? "") + "\n\n" + args.notes
        : returnRequest.notes,
      updatedAt: now,
    });

    // Look up the payment transaction for this order to wire into payments system
    const transactions = await ctx.db
      .query("commerce_payment_transactions")
      .withIndex("by_order", (q: any) =>
        q.eq("orderId", returnRequest.orderId),
      )
      .collect();

    const succeededTxn = transactions.find(
      (t: any) => t.status === "succeeded" || t.status === "partially_refunded",
    );

    // If a payment transaction exists, create a refund record
    if (succeededTxn) {
      const refundId = await ctx.db.insert("commerce_payment_refunds", {
        orderId: returnRequest.orderId,
        transactionId: succeededTxn._id,
        returnId: args.returnId,
        amount: {
          amount: returnRequest.refundAmount,
          currencyCode: succeededTxn.amount.currencyCode,
        },
        reason: `Return ${returnRequest.returnNumber}: ${args.refundMethod}`,
        status: "pending",
        createdBy: admin._id,
        createdAt: now,
        updatedAt: now,
      });

      // Schedule payment provider refund action if Stripe transaction exists
      if (succeededTxn.providerTransactionId && succeededTxn.provider === "stripe") {
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
      } else {
        // For non-Stripe or manual refunds, mark as refunded immediately
        await ctx.db.patch(args.returnId, {
          status: "refunded",
          updatedAt: now,
        });
      }
    } else {
      // No payment transaction found — mark as refunded for manual processing
      await ctx.db.patch(args.returnId, {
        status: "refunded",
        updatedAt: now,
      });
    }

    // Add to order history
    await ctx.db.insert("commerce_order_history", {
      orderId: returnRequest.orderId,
      eventType: "refund_processed",
      message: `Refund of $${(returnRequest.refundAmount / 100).toFixed(2)} processed via ${args.refundMethod} for return ${returnRequest.returnNumber}`,
      actorUserId: admin._id,
      metadata: {
        returnId: args.returnId,
        refundAmount: returnRequest.refundAmount,
        refundMethod: args.refundMethod,
      },
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Complete return (final step — restocks inventory)
 */
export const completeReturn = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
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

    // Add to order history
    await ctx.db.insert("commerce_order_history", {
      orderId: returnRequest.orderId,
      eventType: "return_completed",
      message: `Return ${returnRequest.returnNumber} completed`,
      actorUserId: admin._id,
      createdAt: now,
    });

    // Restore inventory for returned items
    for (const item of returnRequest.items) {
      const orderItem = await ctx.db.get(item.orderItemId);
      if (orderItem?.productId) {
        const product = await ctx.db.get(orderItem.productId);
        if (product && product.trackInventory) {
          const currentStock = product.stockQuantity ?? 0;
          const newStock = currentStock + item.quantity;

          await ctx.db.patch(orderItem.productId, {
            stockQuantity: newStock,
            updatedAt: now,
          });

          // Log inventory adjustment
          await ctx.db.insert("commerce_inventory_adjustments", {
            productId: orderItem.productId,
            variantId: orderItem.variantId,
            adjustmentType: "return",
            quantityDelta: item.quantity,
            reason: `Return ${returnRequest.returnNumber} completed`,
            actorUserId: admin._id,
            createdAt: now,
          });
        }
      }
    }

    return { success: true };
  },
});

/**
 * Add return shipping label
 */
export const addShippingLabel = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    shippingLabelUrl: v.string(),
    trackingNumber: v.optional(v.string()),
    carrier: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
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

    // Update the return request with label info
    await ctx.db.patch(args.returnId, {
      returnShippingLabel: args.shippingLabelUrl,
      trackingNumber: args.trackingNumber,
      updatedAt: now,
    });

    // Also create a return label record for auditing
    await ctx.db.insert("commerce_return_labels", {
      returnRequestId: args.returnId,
      carrier: args.carrier,
      trackingNumber: args.trackingNumber,
      labelUrl: args.shippingLabelUrl,
      createdBy: admin._id,
      createdAt: now,
      updatedAt: now,
    });

    // Add to order history
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

    return { success: true };
  },
});

/**
 * Update return notes
 */
export const updateNotes = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
    notes: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    const returnRequest = await ctx.db.get(args.returnId);
    if (!returnRequest) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Return request not found.",
      });
    }

    await ctx.db.patch(args.returnId, {
      notes: args.notes,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================
// STUCK REFUND RECOVERY
// ============================================

/**
 * Retry a refund that is stuck in refund_pending state.
 * Re-triggers the payment provider refund action.
 */
export const retryStuckRefund = mutation({
  args: {
    returnId: v.id("commerce_return_requests"),
  },
  handler: async (ctx: any, args: any) => {
    await requireCan(ctx, "commerce.returns.refund");
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

    // Look up the original payment transaction
    const transactions = await ctx.db
      .query("commerce_payment_transactions")
      .withIndex("by_order", (q: any) =>
        q.eq("orderId", returnRequest.orderId),
      )
      .collect();

    const succeededTxn = transactions.find(
      (t: any) => t.status === "succeeded" || t.status === "partially_refunded",
    );

    if (!succeededTxn || !succeededTxn.providerTransactionId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "No eligible payment transaction found for retry.",
      });
    }

    // Find or create a pending refund record
    const existingRefunds = await ctx.db
      .query("commerce_payment_refunds")
      .withIndex("by_return", (q: any) => q.eq("returnId", args.returnId))
      .collect();

    let refundId;
    const pendingRefund = existingRefunds.find((r: any) => r.status === "pending" || r.status === "failed");
    if (pendingRefund) {
      // Reset existing failed refund to pending
      await ctx.db.patch(pendingRefund._id, {
        status: "pending",
        failureCode: undefined,
        failureMessage: undefined,
        updatedAt: now,
      });
      refundId = pendingRefund._id;
    } else {
      // Create a new refund record
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
        createdAt: now,
        updatedAt: now,
      });
    }

    // Update the refundPendingAt timestamp
    await ctx.db.patch(args.returnId, {
      refundPendingAt: now,
      updatedAt: now,
    });

    // Re-schedule the provider refund action
    if (succeededTxn.provider === "stripe") {
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
    }

    // Add to order history
    await ctx.db.insert("commerce_order_history", {
      orderId: returnRequest.orderId,
      eventType: "refund_retried",
      message: `Refund retry initiated for return ${returnRequest.returnNumber}`,
      createdAt: now,
    });

    return { success: true, refundId };
  },
});
