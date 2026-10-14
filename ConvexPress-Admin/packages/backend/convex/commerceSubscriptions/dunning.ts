"use node";
/**
 * Commerce Subscriptions — dunning sweep.
 *
 * Hourly (crons.ts `subscription-dunning`, 15 minutes after renewals): charges
 * each retry that has come due. A declined renewal schedules its retries in
 * `internals.handleInvoicePaymentResult` from the contract's dunning policy
 * (by default 1, 3 and 7 days after each failure, then cancellation).
 *
 * Each retry is claimed first (`internals.claimDunningAttempt`), which closes
 * retries that no longer apply: the invoice was paid or voided, or the contract
 * ended or recovered. The charge uses the contract's current card, under an
 * idempotency key unique to the retry, and its outcome is recorded by
 * `handleInvoicePaymentResult` like any other charge.
 */

import { v } from "convex/values";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { requirePluginEnabled } from "../helpers/plugins";

export const runDunningSweep = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    succeeded: v.number(),
    failed: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");

    const retryable = await ctx.runQuery(internal.commerceSubscriptions.internals.getRetryableDunningAttempts, {
      limit: args.limit ?? 100,
    });

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    for (const attempt of retryable) {
      try {
        const claim = await ctx.runMutation(internal.commerceSubscriptions.internals.claimDunningAttempt, {
          attemptId: attempt.attemptId,
        });
        if (!claim) {
          skipped++;
          continue;
        }
        const result = await ctx.runAction(internal.commerceSubscriptions.stripeCharge.chargeSubscriptionInvoice, {
          invoiceId: claim.invoiceId,
          attemptNumber: claim.attemptNumber,
        });
        if (result.skipped) skipped++;
        else if (result.success) succeeded++;
        else failed++;
      } catch (err) {
        // A claimed retry that never reports back is claimable again later.
        console.error(
          `[dunning] Error processing attempt ${attempt.attemptId}:`,
          err instanceof Error ? err.message : String(err),
        );
        failed++;
      }
    }

    return { processed: retryable.length, succeeded, failed, skipped };
  },
});
