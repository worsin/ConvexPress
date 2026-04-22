"use node";
/**
 * Commerce Subscriptions — Dunning Action (Wave 7 Task 7.2)
 *
 * Hourly cron-driven sweep (offset 15 min after renewals) that retries
 * failed payments for past-due subscriptions.
 *
 * Flow:
 *   1. Query `past_due` subscriptions that have dunning attempts due for retry
 *      (via `internals.getRetryableDunningAttempts`).
 *   2. For each: attempt payment via processor stub.
 *   3a. Success → mark invoice paid, transition contract to `active`, sync
 *       entitlements. (Delegated to `handleInvoicePaymentResult`.)
 *   3b. Failure → record attempt, schedule next retry (if max not reached),
 *       or cancel the subscription when dunning is exhausted.
 *
 * Default retry schedule (when no template dunningPolicyCode is set):
 *   [1 day, 3 days, 7 days, 14 days] — 4 attempts maximum.
 *
 * Registration in `crons.ts`:
 *   crons.hourly("subscription-dunning", { minuteUTC: 15 },
 *     internal.commerceSubscriptions.dunning.runDunningSweep)
 */

import { v } from "convex/values";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { requirePluginEnabled } from "../helpers/plugins";

// ─── Default dunning policy ──────────────────────────────────────────────────

const DEFAULT_RETRY_DAYS = [1, 3, 7, 14]; // attempt at +1d, +3d, +7d, +14d
const DEFAULT_MAX_ATTEMPTS = 4;

// ─── Payment processor stub ──────────────────────────────────────────────────

interface ChargeResult {
  success: boolean;
  transactionId?: string;
  failureReason?: string;
}

function processorStub(invoice: {
  _id: string;
  totalAmount: number;
  savedPaymentMethodId?: string;
}): ChargeResult {
  if (invoice.totalAmount === 0) {
    return { success: true, transactionId: `free_${Date.now()}` };
  }
  if (!invoice.savedPaymentMethodId) {
    return { success: false, failureReason: "no_payment_method_on_file" };
  }
  // Stub: real processor replaces this.
  return {
    success: false,
    failureReason: "stub_processor_dunning_not_yet_wired",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DUNNING SWEEP ACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hourly dunning retry sweep. Offset 15 minutes in `crons.ts` so renewals
 * complete before dunning runs.
 */
export const runDunningSweep = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");

    const limit = args.limit ?? 100;

    // Fetch retryable dunning attempts (past_due contracts with due retries).
    const retryable: Array<{
      attemptId: string;
      subscriptionId: string;
      invoiceId: string;
      attemptNumber: number;
    }> | null = await ctx.runQuery(
      internal.commerceSubscriptions.internals.getRetryableDunningAttempts,
      { limit },
    );

    if (!retryable || retryable.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0, cancelled: 0 };
    }

    let succeeded = 0;
    let failed = 0;
    let cancelled = 0;

    for (const attempt of retryable) {
      try {
        // Fetch the invoice for this dunning attempt.
        const invoice: {
          _id: string;
          totalAmount: number;
          savedPaymentMethodId?: string;
          manualBilling?: boolean;
          subscriptionId: string;
        } | null = await ctx.runQuery(
          internal.commerceSubscriptions.internals.getInvoiceForRenewal,
          { invoiceId: attempt.invoiceId as Parameters<typeof String>[0] },
        );

        if (!invoice) {
          // Invoice gone — abort this attempt.
          await ctx.runMutation(
            internal.commerceSubscriptions.internals.abortDunningAttempt,
            {
              attemptId: attempt.attemptId as Parameters<typeof String>[0],
              reason: "invoice_not_found",
            },
          );
          continue;
        }

        if (invoice.manualBilling) {
          continue;
        }

        const chargeResult = processorStub(invoice);

        if (chargeResult.success) {
          // On success: delegate result handling (marks invoice paid,
          // advances period, transitions contract to active).
          await ctx.runMutation(
            internal.commerceSubscriptions.internals.handleInvoicePaymentResult,
            {
              invoiceId: attempt.invoiceId as Parameters<typeof String>[0],
              succeeded: true,
              paymentTransactionId: chargeResult.transactionId,
            },
          );

          // Mark dunning attempt as succeeded.
          await ctx.runMutation(
            internal.commerceSubscriptions.internals.completeDunningAttempt,
            {
              attemptId: attempt.attemptId as Parameters<typeof String>[0],
              outcome: "success",
            },
          );

          succeeded++;
        } else {
          // On failure: update dunning attempt, decide if we cancel.
          const outcome: {
            cancelled: boolean;
            nextRetryAt?: number;
          } = await ctx.runMutation(
            internal.commerceSubscriptions.internals.recordDunningFailure,
            {
              attemptId: attempt.attemptId as Parameters<typeof String>[0],
              subscriptionId:
                attempt.subscriptionId as Parameters<typeof String>[0],
              invoiceId: attempt.invoiceId as Parameters<typeof String>[0],
              attemptNumber: attempt.attemptNumber,
              failureReason: chargeResult.failureReason,
              maxAttempts: DEFAULT_MAX_ATTEMPTS,
              retryDays: DEFAULT_RETRY_DAYS,
            },
          );

          if (outcome.cancelled) {
            cancelled++;
          } else {
            failed++;
          }
        }
      } catch (err) {
        console.error(
          `[dunning] Error processing attempt ${attempt.attemptId}:`,
          err instanceof Error ? err.message : String(err),
        );
        failed++;
      }
    }

    return {
      processed: retryable.length,
      succeeded,
      failed,
      cancelled,
    };
  },
});
