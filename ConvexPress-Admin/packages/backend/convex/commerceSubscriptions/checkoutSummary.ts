/**
 * What a checkout intent buys, in the customer's terms: the plan, its price
 * and cadence, the setup fee, the trial, the coupon and what it takes off the
 * first charge, and when the next charge after today runs. Read from the
 * intent's pricing snapshot, so it shows exactly what the server will charge.
 *
 * Used by the form checkout (`extensions/forms/actions.getPendingPayment`) and
 * the direct signup page (`checkout.getMyCheckout`).
 */
import { v } from "convex/values";

import type { QueryCtx } from "../_generated/server";
import { addBillingPeriod, addDays } from "./lifecycle";
import { snapshotNumber, snapshotString } from "./snapshot";

export const checkoutSummaryValidator = v.object({
  planTitle: v.string(),
  billingInterval: v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("year")),
  billingIntervalCount: v.number(),
  recurringAmount: v.number(),
  setupFeeAmount: v.number(),
  trialDays: v.number(),
  couponCode: v.optional(v.string()),
  /** Taken off the first charge. */
  firstChargeDiscount: v.number(),
  /** When the next charge after today's runs (the end of the trial or the first period). */
  nextChargeAt: v.number(),
  /** Cancelling ends the subscription at the end of the paid period (true) or at once. */
  cancelAtPeriodEnd: v.boolean(),
});

/** The plan, its terms and the coupon of a checkout intent, from its pricing snapshot. */
export async function checkoutSummary(ctx: Pick<QueryCtx, "db">, rawIntentId: string) {
  const intentId = ctx.db.normalizeId("commerce_subscription_checkout_intents", rawIntentId);
  const intent = intentId ? await ctx.db.get(intentId) : null;
  if (!intent) return null;
  const snapshot = intent.pricingSnapshot;
  const offerId = intent.selectedOfferIds[0];
  const offer = offerId ? await ctx.db.get(offerId) : null;
  const template = offer ? await ctx.db.get(offer.templateId) : null;
  const interval = template?.billingInterval ?? "month";
  const count = template?.billingIntervalCount ?? 1;
  const trialDays = snapshotNumber(snapshot, "trialDays") ?? 0;
  return {
    planTitle: snapshotString(snapshot, "offerTitle") ?? offer?.title ?? "Subscription",
    billingInterval: interval,
    billingIntervalCount: count,
    recurringAmount: intent.recurringAmount,
    setupFeeAmount: intent.setupFeeAmount,
    trialDays,
    couponCode: snapshotString(snapshot, "couponCode"),
    firstChargeDiscount: snapshotNumber(snapshot, "firstChargeDiscount") ?? 0,
    nextChargeAt: trialDays > 0 ? addDays(intent.createdAt, trialDays) : addBillingPeriod(intent.createdAt, interval, count),
    cancelAtPeriodEnd: template?.cancelAtPeriodEndDefault ?? true,
  };
}
