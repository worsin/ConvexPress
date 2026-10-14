import { v, type Infer } from "convex/values";

import { commerceSubscriptionStatusValidator } from "../schema/commerceSubscriptions";

export const subscriptionIntervalValidator = v.union(
  v.literal("week"),
  v.literal("month"),
  v.literal("year"),
);

export const subscriptionTemplateCreateValidator = v.object({
  title: v.string(),
  slug: v.string(),
  billingInterval: subscriptionIntervalValidator,
  billingIntervalCount: v.number(),
  trialDays: v.optional(v.number()),
  gracePeriodDays: v.optional(v.number()),
  pausable: v.boolean(),
  cancelAtPeriodEndDefault: v.boolean(),
});

/**
 * What every checkout-intent activation returns (free, webhook or confirmed
 * first charge). Shared so the Node actions that relay an activation return
 * exactly the shape the activation mutations validate.
 */
export const activationResultValidator = v.object({
  ok: v.literal(true),
  contractId: v.id("commerce_subscriptions"),
  status: commerceSubscriptionStatusValidator,
  trialDays: v.number(),
  currentPeriodEndAt: v.optional(v.number()),
});
export type ActivationResult = Infer<typeof activationResultValidator>;

/** Why `confirmFirstCharge` could not activate yet, and what the buyer can do. */
export const firstChargePendingReasonValidator = v.union(
  // Stripe has not settled the payment yet (processing / 3DS in progress).
  v.literal("processing"),
  // Paid, but no verified account owns the checkout email yet (guest checkout).
  v.literal("account_required"),
);

/** Why `confirmFirstCharge` refused to activate. */
export const firstChargeFailureReasonValidator = v.union(
  // The card was declined: the same checkout can be paid with another card.
  v.literal("payment_failed"),
  // The checkout expired, failed or was cancelled; start a new one.
  v.literal("checkout_closed"),
  // The Stripe object does not settle this checkout (intent, customer, amount,
  // currency or mode differ, or Stripe has no such object).
  v.literal("verification_failed"),
  // The paying account and the checkout's account disagree.
  v.literal("account_mismatch"),
);

/** The result of the public, server-verified `publicCharge.confirmFirstCharge`. */
export const firstChargeConfirmationValidator = v.union(
  v.object({
    status: v.literal("active"),
    subscriptionId: v.id("commerce_subscriptions"),
    subscriptionStatus: commerceSubscriptionStatusValidator,
    formSubmissionId: v.optional(v.id("form_submissions")),
  }),
  v.object({
    status: v.literal("pending"),
    reason: firstChargePendingReasonValidator,
  }),
  v.object({
    status: v.literal("failed"),
    reason: firstChargeFailureReasonValidator,
  }),
);
export type FirstChargeConfirmation = Infer<typeof firstChargeConfirmationValidator>;
