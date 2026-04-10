// @ts-nocheck
"use node";
/**
 * Commerce Subscriptions — Actions (Node.js runtime)
 *
 * Ported from VexCart subscriptions, adapted to ConvexPress.
 * These run in the Node.js runtime and can make external API calls (Stripe, etc.).
 *
 * Functions:
 *   - processRenewals            Process all due subscription renewals (generate invoices + charge)
 *   - processDunningRetries      Retry failed payments for past-due subscriptions
 *   - processExpiredSubscriptions  Expire pending-cancel subscriptions past their period end
 *   - chargeSubscriptionInvoice  Charge a single subscription invoice via Stripe
 */

import { v } from "convex/values";

import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// ═══════════════════════════════════════════════════════════════════════════
// RENEWAL PROCESSING ACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process subscription renewals.
 *
 * Flow:
 *   1. Call internal mutation to generate invoices for due subscriptions
 *   2. For each new invoice, attempt to charge via Stripe
 *   3. Report results back via handleInvoicePaymentResult
 *
 * This should be scheduled to run periodically (e.g. every hour via cron).
 */
export const processRenewals = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Step 1: Generate invoices for due subscriptions
    const result: any = await ctx.runMutation(
      internal.commerceSubscriptions.internals.createDueInvoices,
      { limit: args.limit ?? 50 },
    );

    if (result.createdCount === 0) {
      return { processed: 0, succeeded: 0, failed: 0, invoiceIds: [] };
    }

    // Step 2: For each invoice, attempt payment
    let succeeded = 0;
    let failed = 0;

    for (const invoiceId of result.invoiceIds) {
      try {
        // In production, this would call Stripe to charge the customer's
        // stored payment method. For now we simulate the payment attempt
        // and delegate to handleInvoicePaymentResult.
        //
        // When Stripe is integrated, this becomes:
        //   const paymentResult = await stripe.paymentIntents.create({ ... });
        //   const paymentSucceeded = paymentResult.status === 'succeeded';

        // For now, mark as succeeded (real Stripe integration will replace this)
        await ctx.runMutation(
          internal.commerceSubscriptions.internals.handleInvoicePaymentResult,
          {
            invoiceId,
            succeeded: true,
            paymentTransactionId: undefined,
            correlationId: `renewal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          },
        );
        succeeded++;
      } catch (error: any) {
        // Payment failed — record the failure
        try {
          await ctx.runMutation(
            internal.commerceSubscriptions.internals.handleInvoicePaymentResult,
            {
              invoiceId,
              succeeded: false,
              failureCode: "payment_failed",
              failureReason: error?.message ?? "Unknown payment error",
              correlationId: `renewal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            },
          );
        } catch {
          // If even recording the failure fails, log and continue
          console.error(
            `[Subscriptions] Failed to record payment failure for invoice ${invoiceId}:`,
            error,
          );
        }
        failed++;
      }
    }

    return {
      processed: result.createdCount,
      succeeded,
      failed,
      invoiceIds: result.invoiceIds,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// DUNNING RETRY ACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process dunning retries for failed subscription payments.
 *
 * Flow:
 *   1. Run dunning sweep to identify and schedule retry attempts
 *   2. For each scheduled attempt, process it and attempt payment
 *   3. Report results
 *
 * This should be scheduled to run periodically (e.g. every 6 hours via cron).
 */
export const processDunningRetries = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Step 1: Sweep for retryable invoices
    const sweepResult: any = await ctx.runMutation(
      internal.commerceSubscriptions.internals.runDunningSweep,
      { limit: args.limit ?? 100 },
    );

    if (sweepResult.scheduled === 0) {
      return { scheduled: 0, retried: 0, succeeded: 0, failed: 0 };
    }

    // Step 2: Get the retryable invoices and attempt payment
    const retryableInvoices: any = await ctx.runQuery(
      internal.commerceSubscriptions.internals.getRetryableInvoices,
      { limit: args.limit ?? 100 },
    );

    let retried = 0;
    let succeeded = 0;
    let failed = 0;

    for (const invoice of retryableInvoices) {
      try {
        // In production: attempt Stripe charge with stored payment method
        // For now, simulate (real Stripe integration will replace this)

        await ctx.runMutation(
          internal.commerceSubscriptions.internals.handleInvoicePaymentResult,
          {
            invoiceId: invoice._id,
            succeeded: true,
            paymentTransactionId: undefined,
            correlationId: `dunning_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          },
        );
        succeeded++;
      } catch (error: any) {
        try {
          await ctx.runMutation(
            internal.commerceSubscriptions.internals.handleInvoicePaymentResult,
            {
              invoiceId: invoice._id,
              succeeded: false,
              failureCode: "dunning_retry_failed",
              failureReason: error?.message ?? "Dunning retry failed",
              correlationId: `dunning_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            },
          );
        } catch {
          console.error(
            `[Subscriptions] Failed to record dunning failure for invoice ${invoice._id}:`,
            error,
          );
        }
        failed++;
      }
      retried++;
    }

    return {
      scheduled: sweepResult.scheduled,
      retried,
      succeeded,
      failed,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPIRATION ACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process expired subscriptions.
 * Transitions pending_cancel subscriptions to cancelled when their period ends.
 *
 * This should be scheduled to run periodically (e.g. every hour via cron).
 */
export const processExpiredSubscriptions = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result: any = await ctx.runMutation(
      internal.commerceSubscriptions.internals.expirePendingCancellations,
      { limit: args.limit ?? 100 },
    );

    return result;
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE INVOICE CHARGE ACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Charge a single subscription invoice.
 * Used for manual retry or immediate charge scenarios.
 *
 * In production, this would:
 *   1. Look up the customer's stored payment method
 *   2. Create a Stripe PaymentIntent with off-session confirmation
 *   3. Report the result back via handleInvoicePaymentResult
 */
export const chargeSubscriptionInvoice = internalAction({
  args: {
    invoiceId: v.id("commerce_subscription_invoices"),
  },
  handler: async (ctx, args) => {
    const correlationId = `charge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      // In production, this is where Stripe off-session payment happens:
      //
      // 1. Get the invoice details
      // 2. Get the subscription and customer
      // 3. Look up stored payment method (Stripe customer ID + payment method)
      // 4. Create PaymentIntent with confirm: true, off_session: true
      // 5. Handle result
      //
      // For now, we delegate to the internal mutation with a simulated success.
      // Real Stripe integration will replace the succeeded: true with actual result.

      await ctx.runMutation(
        internal.commerceSubscriptions.internals.handleInvoicePaymentResult,
        {
          invoiceId: args.invoiceId,
          succeeded: true,
          paymentTransactionId: undefined,
          correlationId,
        },
      );

      return { success: true, correlationId };
    } catch (error: any) {
      try {
        await ctx.runMutation(
          internal.commerceSubscriptions.internals.handleInvoicePaymentResult,
          {
            invoiceId: args.invoiceId,
            succeeded: false,
            failureCode: "charge_failed",
            failureReason: error?.message ?? "Charge failed",
            correlationId,
          },
        );
      } catch {
        console.error(
          `[Subscriptions] Failed to record charge failure for invoice ${args.invoiceId}:`,
          error,
        );
      }

      return { success: false, error: error?.message, correlationId };
    }
  },
});
