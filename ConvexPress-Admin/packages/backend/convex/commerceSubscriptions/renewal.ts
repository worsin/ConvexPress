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
 * Paid payment charging is live-provider only. When
 * `commerce.payments.subscriptionChargingEnabled` is false, zero-dollar
 * invoices can renew, but paid invoices fail closed instead of simulating
 * success.
 *
 * Step 1.e — scheduled offer changes: if `scheduledOfferChange` is present
 * on the contract AND `effectiveAt <= now`, the renewal sweep applies it:
 *   - Updates `currentOfferId` → new item's `sourceOfferId`
 *   - Clears `scheduledOfferChange`
 *   - Appends to `offerHistory`
 */

import { v } from "convex/values";

import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { requirePluginEnabled } from "../helpers/plugins";

// ─── Payment processor: disabled fallback + live Stripe dispatch ─────────────

interface ChargeResult {
  success: boolean;
  transactionId?: string;
  failureReason?: string;
}

/**
 * Disabled-provider fallback. Returns success for free-tier invoices only.
 * Paid invoices fail closed so deployments cannot silently advance paid
 * subscriptions through an unverified mock payment path.
 */
function processorStub(invoice: {
  _id: string;
  totalAmount: number;
  savedPaymentMethodId?: string;
}): ChargeResult {
  if (invoice.totalAmount === 0) {
    return { success: true, transactionId: `free_${Date.now()}` };
  }
  if (!invoice.savedPaymentMethodId) {
    return {
      success: false,
      failureReason: "no_payment_method_on_file",
    };
  }
  return {
    success: false,
    failureReason: "subscription_charging_not_enabled",
  };
}

/**
 * Returns true when `commerce.payments.subscriptionChargingEnabled` is set
 * in settings. Callers fall through to the disabled-provider fallback when
 * this is false.
 */
async function isLiveChargingEnabled(ctx: Pick<ActionCtx, "runQuery">): Promise<boolean> {
  const settings = await ctx.runQuery(
    internal.commerceSubscriptions.internals.getPaymentChargingSettings,
    {},
  );
  return settings.subscriptionChargingEnabled;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SWEEP ACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hourly renewal sweep: generate invoices for due subscriptions, attempt
 * payment via the live processor or disabled-provider fallback, and delegate result handling to
 * `internals.handleInvoicePaymentResult`.
 *
 * Registered in `crons.ts` as:
 *   crons.hourly("subscription-renewals", {}, internal.commerceSubscriptions.renewal.runRenewalSweep)
 */
export const runRenewalSweep = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    generated: v.number(),
    charged: v.number(),
    succeeded: v.number(),
    failed: v.number(),
    invoiceIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");

    await ctx.runMutation(
      internal.commerceSubscriptions.internals.applyDueScheduledOfferChanges,
      {},
    );

    // Step 1: Generate renewal invoices for all due subscriptions.
    const generated = await ctx.runMutation(
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

    const live = await isLiveChargingEnabled(ctx);
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
        let chargeResult: ChargeResult;

        if (live) {
          // Live Stripe path — delegate to the off-session charge action,
          // which also writes the invoice result via
          // `handleInvoicePaymentResult` on our behalf.
          const stripeResult = await ctx.runAction(
            internal.commerceSubscriptions.stripeCharge
              .chargeSubscriptionInvoice,
            { invoiceId },
          );
          chargeResult = {
            success: stripeResult.success,
            transactionId: stripeResult.transactionId,
            failureReason: stripeResult.failureReason,
          };
        } else {
          // Disabled-provider path — fetch the invoice and fail paid
          // invoices closed while allowing zero-dollar renewals.
          const invoice = await ctx.runQuery(
            internal.commerceSubscriptions.internals.getInvoiceForRenewal,
            { invoiceId },
          );

          if (!invoice) continue;
          if (invoice.manualBilling) continue;

          chargeResult = processorStub(invoice);

          await ctx.runMutation(
            internal.commerceSubscriptions.internals.handleInvoicePaymentResult,
            {
              invoiceId,
              succeeded: chargeResult.success,
              paymentTransactionId: chargeResult.transactionId,
              failureReason: chargeResult.failureReason,
            },
          );
        }

        if (chargeResult.success) succeeded++;
        else failed++;

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


    return {
      generated: generated.createdCount,
      charged: generated.createdCount,
      succeeded,
      failed,
      invoiceIds: generated.invoiceIds,
    };
  },
});
