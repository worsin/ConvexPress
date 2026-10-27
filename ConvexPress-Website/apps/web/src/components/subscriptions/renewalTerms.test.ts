import { describe, expect, test } from "bun:test";

import type { CheckoutSummary } from "./OrderSummary";
import { RENEWAL_CONSENT_LABEL, renewalConsent, renewalTermsText } from "./renewalTerms";

const NOV_14 = Date.UTC(2026, 10, 14, 12);
const summary = (patch: Partial<CheckoutSummary> = {}): CheckoutSummary => ({
  planTitle: "Practice",
  billingInterval: "month",
  billingIntervalCount: 1,
  recurringAmount: 29_900,
  setupFeeAmount: 0,
  trialDays: 0,
  firstChargeDiscount: 0,
  nextChargeAt: NOV_14,
  cancelAtPeriodEnd: true,
  ...patch,
});

describe("renewalTermsText", () => {
  test("states the plan, price, cadence, that it continues until cancelled, and how cancelling works", () => {
    expect(renewalTermsText(summary(), "USD")).toBe(
      "Practice renews automatically at $299.00 every month until you cancel. Your next charge is on November 14, 2026. " +
        "You can cancel any time from your account; your plan stays active until the end of the period you've paid for, and you won't be charged again.",
    );
  });
  test("a trial says when it ends and that the renewals start then", () => {
    expect(renewalTermsText(summary({ trialDays: 14 }), "USD")).toContain(
      "Your free trial of Practice ends on November 14, 2026. Then it renews automatically at $299.00 every month until you cancel, starting that day.",
    );
  });
  test("longer periods and immediate cancellation are said plainly", () => {
    const text = renewalTermsText(summary({ billingIntervalCount: 3, cancelAtPeriodEnd: false }), "USD");
    expect(text).toContain("at $299.00 every 3 months until you cancel");
    expect(text).toContain("cancelling ends your plan right away");
  });
});

describe("renewalConsent", () => {
  test("records exactly the terms shown", async () => {
    const recorded: string[] = [];
    const consent = renewalConsent("The terms.", async (text) => {
      recorded.push(text);
    });
    expect(consent.label).toBe(RENEWAL_CONSENT_LABEL);
    await consent.record();
    expect(recorded).toEqual(["The terms."]);
  });
});
