/**
 * ConvexPress Forms — settle the action runs waiting on a paid checkout.
 *
 * The `subscription`/`payment` action stores its paid outcome as a NON-terminal
 * `awaiting_payment` run (see `commerce.ts`). The checkout intent it started is
 * activated later, by the signature-verified Stripe webhook or by the
 * server-verified `publicCharge.confirmFirstCharge`, and both go through the one
 * activation in `commerceSubscriptions/checkout.ts`, which calls this helper.
 *
 * Settling a run marks it `completed`, replaces the stored payment descriptor
 * (it carries the single-use client secret, which is no longer needed) with the
 * activation outcome, and emits `form.action_completed` exactly once: a run is
 * settled only while it is still `awaiting_payment`, so a replayed activation
 * finds nothing to settle.
 *
 * A run is matched by the checkout intent id the action stored on it, never by
 * the submission alone, so an intent that merely names a submission in its
 * metadata cannot complete that submission's runs.
 */

import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { emitEvent } from "../../helpers/events";
import { FORM_EVENTS, SYSTEM } from "../../events/constants";

/** The activation outcome recorded on a settled run. */
export interface CheckoutRunActivation {
  intentId: Id<"commerce_subscription_checkout_intents">;
  contractId: Id<"commerce_subscriptions">;
  status: string;
  amount: number;
  recurringAmount: number;
  currency: string;
}

/** The checkout intent id an action run stored in its result JSON, if any. */
export function storedCheckoutIntentId(result: string | undefined): string | undefined {
  if (!result) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || !("intentId" in parsed)) {
    return undefined;
  }
  return typeof parsed.intentId === "string" ? parsed.intentId : undefined;
}

/**
 * Complete every `awaiting_payment` run of `submissionId` that is waiting on
 * `activation.intentId`, and emit `form.action_completed` for each. Returns the
 * number of runs settled.
 */
export async function completeCheckoutRuns(
  ctx: MutationCtx,
  submissionId: Id<"form_submissions">,
  activation: CheckoutRunActivation,
): Promise<number> {
  const runs = await ctx.db
    .query("form_action_runs")
    .withIndex("by_submission", (q) => q.eq("submissionId", submissionId))
    .collect();
  const now = Date.now();
  let settled = 0;
  for (const run of runs) {
    if (run.status !== "awaiting_payment") continue;
    if (storedCheckoutIntentId(run.result) !== String(activation.intentId)) continue;
    const result = {
      intentId: String(activation.intentId),
      contractId: String(activation.contractId),
      status: activation.status,
      amount: activation.amount,
      recurringAmount: activation.recurringAmount,
      currency: activation.currency,
      paid: true,
    };
    await ctx.db.patch("form_action_runs", run._id, {
      status: "completed",
      result: JSON.stringify(result),
      error: undefined,
      nextAttemptAt: undefined,
      updatedAt: now,
    });
    settled += 1;
    // Same payload the runner emits for a run that completes in-line.
    if (run.formId) {
      await emitEvent(ctx, FORM_EVENTS.ACTION_COMPLETED, SYSTEM.FORMS, {
        formId: run.formId,
        submissionId,
        formActionId: run.formActionId,
        actionType: run.type,
        result,
      });
    }
  }
  return settled;
}
