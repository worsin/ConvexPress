// @ts-nocheck
/**
 * Commerce Payment System — Queries, Mutations, Internal Mutations
 *
 * Handles Stripe payment intent creation, webhook-driven confirmation,
 * and admin refund processing.
 *
 * Flow:
 *   1. Frontend calls `initiatePayment` with an orderId
 *   2. Mutation creates a `commerce_payment_transactions` record (status "pending")
 *   3. Mutation schedules `createStripeIntent` action (paymentActions.ts)
 *   4. Action calls Stripe API, updates transaction with clientSecret + paymentIntentId
 *   5. Frontend uses clientSecret to confirm payment via Stripe Elements
 *   6. Stripe webhook calls `confirmPaymentSuccess` or `confirmPaymentFailure`
 */

import { ConvexError, v } from "convex/values";

import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { getCommerceSettings, requireCommerceEnabled } from "./helpers";

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get payment settings (public-safe — publishable key only, no secrets).
 */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const settings = await getCommerceSettings(ctx);

    // Read commerce.payments section for Stripe publishable key
    const paymentsDoc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "commerce.payments"))
      .unique();

    const paymentsValues = (paymentsDoc?.values ?? {}) as Record<
      string,
      unknown
    >;

    return {
      stripePublishableKey:
        (paymentsValues.stripePublishableKey as string) || null,
      enabledPaymentMethods: settings.paymentMethods.filter((m) => m.enabled),
      currencyCode: settings.currencyCode,
    };
  },
});

/**
 * List payment transactions (admin).
 */
export const listTransactions = query({
  args: {
    status: v.optional(v.string()),
    provider: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");

    let results;

    if (args.provider && args.status) {
      results = await ctx.db
        .query("commerce_payment_transactions")
        .withIndex("by_provider_status", (q) =>
          q.eq("provider", args.provider).eq("status", args.status),
        )
        .order("desc")
        .take(args.limit ?? 50);
    } else {
      results = await ctx.db
        .query("commerce_payment_transactions")
        .order("desc")
        .take(args.limit ?? 50);

      if (args.status) {
        results = results.filter((t) => t.status === args.status);
      }
      if (args.provider) {
        results = results.filter((t) => t.provider === args.provider);
      }
    }

    // Enrich with order info
    const enriched = await Promise.all(
      results.map(async (t) => {
        const order = t.orderId ? await ctx.db.get(t.orderId) : null;
        return {
          ...t,
          orderNumber: order?.orderNumber ?? null,
          orderEmail: order?.email ?? null,
        };
      }),
    );

    return enriched;
  },
});

/**
 * Get a single transaction with full detail (admin).
 */
export const getTransaction = query({
  args: {
    transactionId: v.id("commerce_payment_transactions"),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) return null;

    // Get associated refunds
    const refunds = await ctx.db
      .query("commerce_payment_refunds")
      .withIndex("by_order", (q) => q.eq("orderId", transaction.orderId))
      .collect();

    // Get order info
    const order = transaction.orderId
      ? await ctx.db.get(transaction.orderId)
      : null;

    return {
      ...transaction,
      refunds,
      order: order
        ? {
            _id: order._id,
            orderNumber: order.orderNumber,
            email: order.email,
            status: order.status,
            totalAmount: order.totalAmount,
          }
        : null,
    };
  },
});

/**
 * Get a transaction by ID (for frontend polling after initiatePayment).
 */
export const getTransactionStatus = query({
  args: {
    transactionId: v.id("commerce_payment_transactions"),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) return null;

    return {
      _id: transaction._id,
      status: transaction.status,
      clientSecret: transaction.clientSecret ?? null,
      providerTransactionId: transaction.providerTransactionId ?? null,
      failureMessage: transaction.failureMessage ?? null,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// MUTATIONS (client-callable)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initiate payment for an order. Creates a payment transaction record
 * and schedules the Stripe action to create a PaymentIntent.
 *
 * Called by the frontend after checkout.complete() returns an orderId.
 */
export const initiatePayment = mutation({
  args: {
    orderId: v.id("commerce_orders"),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);

    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Order not found.",
      });
    }

    if (order.paymentStatus !== "pending") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Order payment status is "${order.paymentStatus}", expected "pending".`,
      });
    }

    // Check for existing pending/processing transaction
    const existingTransactions = await ctx.db
      .query("commerce_payment_transactions")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    const activeTransaction = existingTransactions.find(
      (t) => t.status === "pending" || t.status === "processing",
    );

    if (activeTransaction) {
      // Return existing transaction instead of creating duplicate
      return { transactionId: activeTransaction._id };
    }

    const now = Date.now();

    // Create transaction record
    const transactionId = await ctx.db.insert(
      "commerce_payment_transactions",
      {
        orderId: args.orderId,
        checkoutSessionId: order.checkoutSessionId,
        provider: "stripe",
        status: "pending",
        amount: {
          amount: order.totalAmount,
          currencyCode: order.currencyCode,
        },
        metadata: {
          orderNumber: order.orderNumber,
          email: order.email,
        },
        createdAt: now,
        updatedAt: now,
      },
    );

    // Schedule the Stripe action
    await ctx.scheduler.runAfter(
      0,
      internal.commerce.paymentActions.createStripeIntent,
      {
        transactionId,
        orderId: args.orderId,
        amount: order.totalAmount,
        currency: order.currencyCode,
        email: order.email,
      },
    );

    return { transactionId };
  },
});

/**
 * Process a refund (admin only).
 */
export const processRefund = mutation({
  args: {
    transactionId: v.id("commerce_payment_transactions"),
    amount: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "manage_options");

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Transaction not found.",
      });
    }

    if (
      transaction.status !== "succeeded" &&
      transaction.status !== "partially_refunded"
    ) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          "Can only refund succeeded or partially refunded transactions.",
      });
    }

    // Validate refund amount
    const refundedSoFar = transaction.refundedAmount ?? 0;
    const availableToRefund = transaction.amount.amount - refundedSoFar;

    if (args.amount > availableToRefund) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot refund more than ${availableToRefund}. Already refunded: ${refundedSoFar}.`,
      });
    }

    if (args.amount <= 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Refund amount must be greater than 0.",
      });
    }

    if (!transaction.orderId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Transaction has no associated order.",
      });
    }

    const now = Date.now();

    // Create refund record
    const refundId = await ctx.db.insert("commerce_payment_refunds", {
      orderId: transaction.orderId,
      transactionId: args.transactionId,
      amount: {
        amount: args.amount,
        currencyCode: transaction.amount.currencyCode,
      },
      reason: args.reason,
      status: "pending",
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // Schedule the Stripe refund action
    await ctx.scheduler.runAfter(
      0,
      internal.commerce.paymentActions.processStripeRefund,
      {
        refundId,
        transactionId: args.transactionId,
        providerTransactionId: transaction.providerTransactionId!,
        amount: args.amount,
      },
    );

    return { refundId };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS (called by actions/webhooks — not client-callable)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update transaction with Stripe PaymentIntent details (called by action).
 */
export const updateTransactionProvider = internalMutation({
  args: {
    transactionId: v.id("commerce_payment_transactions"),
    providerTransactionId: v.string(),
    clientSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.transactionId, {
      providerTransactionId: args.providerTransactionId,
      clientSecret: args.clientSecret,
      status: "processing",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Confirm payment succeeded (called by Stripe webhook).
 */
export const confirmPaymentSuccess = internalMutation({
  args: {
    providerTransactionId: v.string(),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db
      .query("commerce_payment_transactions")
      .withIndex("by_provider_txn", (q) =>
        q
          .eq("provider", args.provider)
          .eq("providerTransactionId", args.providerTransactionId),
      )
      .unique();

    if (!transaction) {
      console.error(
        "[Payments] Transaction not found for provider ID:",
        args.providerTransactionId,
      );
      return;
    }

    // Idempotency: already succeeded
    if (transaction.status === "succeeded") return;

    const now = Date.now();

    await ctx.db.patch(transaction._id, {
      status: "succeeded",
      completedAt: now,
      updatedAt: now,
    });

    // Update the order's paymentStatus to "paid"
    if (transaction.orderId) {
      const order = await ctx.db.get(transaction.orderId);
      if (order) {
        await ctx.db.patch(transaction.orderId, {
          paymentStatus: "paid",
          status: "processing",
          paidAt: now,
          updatedAt: now,
        });

        // Add order history entry
        await ctx.db.insert("commerce_order_history", {
          orderId: transaction.orderId,
          eventType: "payment_received",
          message: `Payment of ${transaction.amount.amount} ${transaction.amount.currencyCode} received via ${args.provider}.`,
          metadata: {
            transactionId: transaction._id,
            providerTransactionId: args.providerTransactionId,
          },
          createdAt: now,
        });
      }
    }
  },
});

/**
 * Confirm payment failed (called by Stripe webhook).
 */
export const confirmPaymentFailure = internalMutation({
  args: {
    providerTransactionId: v.string(),
    provider: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db
      .query("commerce_payment_transactions")
      .withIndex("by_provider_txn", (q) =>
        q
          .eq("provider", args.provider)
          .eq("providerTransactionId", args.providerTransactionId),
      )
      .unique();

    if (!transaction) {
      console.error(
        "[Payments] Transaction not found for provider ID:",
        args.providerTransactionId,
      );
      return;
    }

    // Idempotency: already failed or succeeded
    if (
      transaction.status === "failed" ||
      transaction.status === "succeeded"
    ) {
      return;
    }

    const now = Date.now();

    await ctx.db.patch(transaction._id, {
      status: "failed",
      failureMessage: args.error || "Payment failed",
      updatedAt: now,
    });

    // Update the order's paymentStatus to "failed"
    if (transaction.orderId) {
      const order = await ctx.db.get(transaction.orderId);
      if (order) {
        await ctx.db.patch(transaction.orderId, {
          paymentStatus: "failed",
          status: "failed",
          updatedAt: now,
        });

        await ctx.db.insert("commerce_order_history", {
          orderId: transaction.orderId,
          eventType: "payment_failed",
          message: `Payment failed: ${args.error || "Unknown error"}.`,
          metadata: {
            transactionId: transaction._id,
            providerTransactionId: args.providerTransactionId,
            error: args.error,
          },
          createdAt: now,
        });
      }
    }
  },
});

/**
 * Complete refund processing (called by Stripe refund action).
 */
export const completeRefund = internalMutation({
  args: {
    refundId: v.id("commerce_payment_refunds"),
    transactionId: v.id("commerce_payment_transactions"),
    providerRefundId: v.string(),
    amount: v.number(),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) return;

    if (args.success) {
      // Update refund record
      await ctx.db.patch(args.refundId, {
        status: "succeeded",
        updatedAt: now,
      });

      // Update transaction refunded amount
      const newRefundedAmount =
        (transaction.refundedAmount ?? 0) + args.amount;
      const newStatus =
        newRefundedAmount >= transaction.amount.amount
          ? "refunded"
          : "partially_refunded";

      await ctx.db.patch(args.transactionId, {
        refundedAmount: newRefundedAmount,
        status: newStatus,
        updatedAt: now,
      });

      // Update order status if fully refunded
      if (transaction.orderId && newStatus === "refunded") {
        await ctx.db.patch(transaction.orderId, {
          paymentStatus: "refunded",
          status: "refunded",
          updatedAt: now,
        });
      }

      // Add order history
      if (transaction.orderId) {
        await ctx.db.insert("commerce_order_history", {
          orderId: transaction.orderId,
          eventType: "refund_processed",
          message: `Refund of ${args.amount} ${transaction.amount.currencyCode} processed.`,
          metadata: {
            refundId: args.refundId,
            providerRefundId: args.providerRefundId,
            amount: args.amount,
          },
          createdAt: now,
        });
      }
    } else {
      // Refund failed
      await ctx.db.patch(args.refundId, {
        status: "failed",
        updatedAt: now,
      });

      if (transaction.orderId) {
        await ctx.db.insert("commerce_order_history", {
          orderId: transaction.orderId,
          eventType: "refund_failed",
          message: `Refund failed: ${args.error || "Unknown error"}.`,
          metadata: {
            refundId: args.refundId,
            error: args.error,
          },
          createdAt: now,
        });
      }
    }
  },
});

// ─── Internal Queries (for actions) ──────────────────────────────────────────

/**
 * Get transaction by ID (for actions that need to read transaction state).
 */
export const getTransactionInternal = internalQuery({
  args: {
    transactionId: v.id("commerce_payment_transactions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.transactionId);
  },
});
