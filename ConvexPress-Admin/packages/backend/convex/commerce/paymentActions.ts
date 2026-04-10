// @ts-nocheck
"use node";

/**
 * Commerce Payment Actions — Stripe API Integration
 *
 * Actions that call external Stripe APIs. These run in a Node.js
 * environment and use dynamic imports for the Stripe SDK.
 *
 * Settings-first key resolution:
 *   1. Check settings table for "commerce.payments" section (stripeSecretKey)
 *   2. Fall back to process.env.STRIPE_SECRET_KEY
 */

import { ConvexError, v } from "convex/values";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveServiceKey } from "../helpers/serviceKeys";

// ─── Stripe Key Resolution ──────────────────────────────────────────────────

async function getStripeSecretKey(ctx: any): Promise<string> {
  // Fetch commerce.payments settings
  const settings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "commerce.payments" },
  );

  const key = resolveServiceKey(
    settings,
    "stripeSecretKey",
    "STRIPE_SECRET_KEY",
  );

  if (!key) {
    throw new ConvexError({
      code: "CONFIGURATION_ERROR",
      message:
        "Stripe secret key is not configured. Set it in Settings > Commerce > Payments or as the STRIPE_SECRET_KEY environment variable.",
    });
  }

  return key;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a Stripe PaymentIntent and update the transaction record.
 *
 * Scheduled by `initiatePayment` mutation. Calls Stripe API, then
 * writes the paymentIntentId and clientSecret back to the transaction.
 */
export const createStripeIntent = internalAction({
  args: {
    transactionId: v.id("commerce_payment_transactions"),
    orderId: v.id("commerce_orders"),
    amount: v.number(),
    currency: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let stripeKey: string;
    try {
      stripeKey = await getStripeSecretKey(ctx);
    } catch (error: any) {
      console.error("[Payments] Stripe key not configured:", error.message);
      await ctx.runMutation(
        internal.commerce.payments.confirmPaymentFailure,
        {
          providerTransactionId: String(args.transactionId),
          provider: "stripe",
          error: "Stripe is not configured.",
        },
      );
      return;
    }

    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey);

      // Create PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: args.amount, // Already in cents
        currency: args.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        receipt_email: args.email || undefined,
        metadata: {
          orderId: args.orderId,
          transactionId: String(args.transactionId),
        },
      });

      // Update the transaction record with Stripe details
      await ctx.runMutation(
        internal.commerce.payments.updateTransactionProvider,
        {
          transactionId: args.transactionId,
          providerTransactionId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret ?? undefined,
        },
      );

      // If intent was immediately succeeded (e.g. saved card auto-confirm)
      if (paymentIntent.status === "succeeded") {
        await ctx.runMutation(
          internal.commerce.payments.confirmPaymentSuccess,
          {
            providerTransactionId: paymentIntent.id,
            provider: "stripe",
          },
        );
      }

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      };
    } catch (error: any) {
      console.error("[Payments] Stripe PaymentIntent creation failed:", error);

      // Mark the transaction as failed via the webhook-style handler
      // Use the transactionId as a fallback providerTransactionId
      // since we may not have a real Stripe ID yet
      const transaction = await ctx.runQuery(
        internal.commerce.payments.getTransactionInternal,
        { transactionId: args.transactionId },
      );

      const providerTxnId =
        transaction?.providerTransactionId || String(args.transactionId);

      // Directly patch the transaction since the webhook handler
      // may not find it by providerTransactionId
      await ctx.runMutation(
        internal.commerce.payments.confirmPaymentFailure,
        {
          providerTransactionId: providerTxnId,
          provider: "stripe",
          error: error.message || "Failed to create payment intent",
        },
      );
    }
  },
});

/**
 * Process a Stripe refund.
 *
 * Scheduled by `processRefund` mutation.
 */
export const processStripeRefund = internalAction({
  args: {
    refundId: v.id("commerce_payment_refunds"),
    transactionId: v.id("commerce_payment_transactions"),
    providerTransactionId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    let stripeKey: string;
    try {
      stripeKey = await getStripeSecretKey(ctx);
    } catch (error: any) {
      console.error("[Payments] Stripe key not configured:", error.message);
      await ctx.runMutation(internal.commerce.payments.completeRefund, {
        refundId: args.refundId,
        transactionId: args.transactionId,
        providerRefundId: "",
        amount: args.amount,
        success: false,
        error: "Stripe is not configured.",
      });
      return;
    }

    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey);

      const refund = await stripe.refunds.create({
        payment_intent: args.providerTransactionId,
        amount: args.amount,
      });

      await ctx.runMutation(internal.commerce.payments.completeRefund, {
        refundId: args.refundId,
        transactionId: args.transactionId,
        providerRefundId: refund.id,
        amount: args.amount,
        success: refund.status === "succeeded",
        error:
          refund.status !== "succeeded"
            ? `Refund status: ${refund.status}`
            : undefined,
      });
    } catch (error: any) {
      console.error("[Payments] Stripe refund failed:", error);
      await ctx.runMutation(internal.commerce.payments.completeRefund, {
        refundId: args.refundId,
        transactionId: args.transactionId,
        providerRefundId: "",
        amount: args.amount,
        success: false,
        error: error.message || "Failed to process refund",
      });
    }
  },
});
