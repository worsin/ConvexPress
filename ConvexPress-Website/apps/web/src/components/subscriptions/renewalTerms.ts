/**
 * The automatic-renewal terms a subscription checkout shows beside its pay
 * button, and records when the buyer agrees (upstream PR 061). Built from the
 * server's checkout summary, so the words match what will be charged: the
 * plan and price, how often it renews, that it continues until cancelled,
 * the trial's end, and when a cancellation takes effect.
 */
import type { RenewalConsent } from "@/extensions/forms/payment/FormStripePaymentForm";
import { formatMinor, type CheckoutSummary } from "./OrderSummary";

function cadence(summary: CheckoutSummary): string {
  const count = summary.billingIntervalCount > 1 ? summary.billingIntervalCount : 1;
  return count === 1 ? `every ${summary.billingInterval}` : `every ${count} ${summary.billingInterval}s`;
}

function longDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function renewalTermsText(summary: CheckoutSummary, currency: string): string {
  const price = formatMinor(summary.recurringAmount, currency);
  const renews =
    summary.trialDays > 0
      ? `Your free trial of ${summary.planTitle} ends on ${longDate(summary.nextChargeAt)}. Then it renews automatically at ${price} ${cadence(summary)} until you cancel, starting that day.`
      : `${summary.planTitle} renews automatically at ${price} ${cadence(summary)} until you cancel. Your next charge is on ${longDate(summary.nextChargeAt)}.`;
  const cancel = summary.cancelAtPeriodEnd
    ? "You can cancel any time from your account; your plan stays active until the end of the period you've paid for, and you won't be charged again."
    : "You can cancel any time from your account; cancelling ends your plan right away.";
  return `${renews} ${cancel}`;
}

/** The checkbox the buyer ticks to agree to the terms above it. */
export const RENEWAL_CONSENT_LABEL = "I agree that my subscription renews automatically on these terms until I cancel.";

/** The payment form's consent: these terms, the checkbox, and how to record the agreement to them. */
export function renewalConsent(terms: string, record: (text: string) => Promise<unknown>): RenewalConsent {
  return {
    terms,
    label: RENEWAL_CONSENT_LABEL,
    record: async () => {
      await record(terms);
    },
  };
}
