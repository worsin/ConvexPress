import { describe, expect, test } from "bun:test";

import { discountText, formatCadence, nextChargeText, planPriceText } from "./portalTypes";

describe("account page wording", () => {
  test("the plan reads as price and cadence", () => {
    expect(planPriceText({ recurringAmount: 29_900, currencyCode: "USD", billingInterval: "month", billingIntervalCount: 1 })).toBe(
      "$299.00 per month",
    );
    expect(formatCadence("month", 3)).toBe("every 3 months");
    expect(formatCadence(undefined, undefined)).toBe("per period");
  });

  test("the next charge reads as amount and date, or a dash when none is due", () => {
    const at = Date.UTC(2026, 10, 14, 12);
    expect(nextChargeText({ nextChargeAt: at, nextChargeAmount: 26_910, currencyCode: "USD" })).toBe("$269.10 on Nov 14, 2026");
    expect(nextChargeText({ nextChargeAt: undefined, nextChargeAmount: 26_910, currencyCode: "USD" })).toBe("--");
  });

  test("a discount says how much and for how long", () => {
    expect(discountText({ code: "TEN", discountType: "percent", amount: 10, remainingCharges: null }, "USD")).toBe("TEN: 10% off every charge");
    expect(discountText({ code: "OFF25", discountType: "fixed", amount: 2_500, remainingCharges: 1 }, "USD")).toBe(
      "OFF25: $25.00 off your next charge",
    );
    expect(discountText({ code: "SPRING", discountType: "percent", amount: 20, remainingCharges: 3 }, "USD")).toBe(
      "SPRING: 20% off your next 3 charges",
    );
  });
});
