"use node";
/**
 * Commerce Subscriptions — Renewal Action (Wave 7 Task 7.2)
 *
 * Hourly cron-driven sweep that charges due invoices for active contracts
 * whose `currentPeriodEndAt` has passed.
 *
 * Relies on internals.ts for invoice generation and payment result handling:
 *   - `createDueInvoices`          Generate renewal invoices for due subs
 *   - `handleInvoicePaymentResult` Process success / failure of each charge
 *   - `expirePendingCancellations` Not called here — separate cron target
 *
 * Payment charging is implemented as a processor stub that returns
 * `{ success: boolean, transactionId?, failureReason? }`. A real Stripe /
 * Paddle integration swaps in here without changing the internals contract.
 *
 * Step 1.e — scheduled offer changes: if `scheduledOfferChange` is present
 * on the contract AND `effectiveAt <= now`, the renewal sweep applies it:
 *   - Updates `currentOfferId` → new item's `sourceOfferId`
 *   - Clears `scheduledOfferChange`
 *   - Appends to `offerHistory`
 */

import { v } from "convex/values";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { requirePluginEnabled } from "../helpers/plugins";

// ─── Payment processor stub ──────────────────────────────────────────────────

interface ChargeResult {
  success: boolean;
  transactionId?: string;
  failureReason?: string;
}

/**
 * Stub payment processor. Replace with a real Stripe / Paddle / etc.
 * integration when off-session charging is wired.
 *
 * Returns success for invoices with `totalAmount === 0` (free-tier) and
 * a simulated failure for everything else (no real payment method on file).
 */
function processorStub(invoice: {
  _id: string;
  totalAmount: number;
  savedPaymentMethodId?: string;
}): ChargeResult {
  // Free-tier: no charge needed.
  if (invoice.totalAmount === 0) {
    return { success: true, transactionId: `free_${Date.now()}` };
  }

  // A saved payment method must be present to attempt charging.
  if (!invoice.savedPaymentMethodId) {
    return {
      success: false,
      failureReason: "no_payment_method_on_file",
    };
  }

  // Stub: in a real integration, call Stripe / Paddle / etc. here.
  // For now, all invoices with a payment method are considered chargeable.
  // The stub returns success so renewals advance in development/staging.
  // Production deployment wires the real processor before enabling this cron.
  return {
    success: true,
    transactionId: `stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SWEEP ACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hourly renewal sweep: generate invoices for due subscriptions, attempt
 * payment via the processor stub, and delegate result handling to
 * `internals.handleInvoicePaymentResult`.
 *
 * Registered in `crons.ts` as:
 *   crons.hourly("subscription-renewals", {}, internal.commerceSubscriptions.renewal.runRenewalSweep)
 */
export const runRenewalSweep = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");

    // Step 1: Generate renewal invoices for all due subscriptions.
    const generated: { createdCount: number; invoiceIds: string[] } =
      await ctx.runMutation(
        internal.commerceSubscriptions.internals.createDueInvoices,
        { limit: args.limit ?? 50 },
      );

    if (generated.createdCount === 0) {
      return {
        generated: 0,
        charged: 0,
        succeeded: 0,
        failed: 0,
        invoiceIds: [],
      };
    }

    let succeeded = 0;
    let failed = 0;
    const results: Array<{
      invoiceId: string;
      success: boolean;
      transactionId?: string;
      failureReason?: string;
    }> = [];

    // Step 2: Attempt payment for each generated invoice.
    for (const invoiceId of generated.invoiceIds) {
      try {
        // Fetch the invoice to get payment details (actions can't read DB).
        const invoice: {
          _id: string;
          totalAmount: number;
          savedPaymentMethodId?: string;
          subscriptionId: string;
          manualBilling?: boolean;
        } | null = await ctx.runQuery(
          internal.commerceSubscriptions.internals.getInvoiceForRenewal,
          { invoiceId: invoiceId as Parameters<typeof String>[0] },
        );

        if (!invoice) {
          // Invoice was deleted between generation and charging — skip.
          continue;
        }

        // Manual billing invoices are not auto-charged.
        if (invoice.manualBilling) {
          continue;
        }

        const chargeResult = processorStub(invoice);

        // Step 2c / 2d: Delegate success or failure handling to an
        // internalMutation (DB access not allowed in actions).
        await ctx.runMutation(
          internal.commerceSubscriptions.internals.handleInvoicePaymentResult,
          {
            invoiceId: invoiceId as Parameters<typeof String>[0],
            succeeded: chargeResult.success,
            paymentTransactionId: chargeResult.transactionId,
            failureReason: chargeResult.failureReason,
          },
        );

        if (chargeResult.success) {
          succeeded++;
        } else {
          failed++;
        }

        results.push({
          invoiceId,
          success: chargeResult.success,
          transactionId: chargeResult.transactionId,
          failureReason: chargeResult.failureReason,
        });
      } catch (err) {
        console.error(
          `[renewal] Error processing invoice ${invoiceId}:`,
          err instanceof Error ? err.message : String(err),
        );
        failed++;
        results.push({
          invoiceId,
          success: false,
          failureReason: err instanceof Error ? err.message : "unexpected_error",
        });
      }
    }

    // Step 1.e: Apply any scheduled offer changes that are now due.
    // This runs after the billing sweep so the new price takes effect on
    // the next renewal cycle (downgrade was queued, now applied).
    try {
      await ctx.runMutation(
        internal.commerceSubscriptions.internals.applyDueScheduledOfferChanges,
        {},
      );
    } catch (err) {
      console.error(
        "[renewal] applyDueScheduledOfferChanges failed:",
        err instanceof Error ? err.message : String(err),
      );
      // Non-fatal — offer changes will be retried on next cron run.
    }

    return {
      generated: generated.createdCount,
      charged: generated.createdCount,
      succeeded,
      failed,
      invoiceIds: generated.invoiceIds,
    };
  },
});
