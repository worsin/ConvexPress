// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  buildSubscriptionPricingSnapshot,
  hasExplicitSubscriptionEnablement,
  resolveMoneyAmount,
  resolveMoneyCurrency,
  resolveSubscriptionUnitAmount,
} from "../pricing";

describe("subscription pricing", () => {
  test("resolves commerce money objects", () => {
    expect(resolveMoneyAmount({ amount: 2500, currencyCode: "USD" })).toBe(2500);
    expect(resolveMoneyCurrency({ amount: 2500, currencyCode: "USD" })).toBe("USD");
  });

  test("uses product sale price only inside the sale window", () => {
    const now = 1000;

    expect(
      resolveSubscriptionUnitAmount({
        product: {
          basePrice: { amount: 5000, currencyCode: "USD" },
          salePrice: { amount: 3500, currencyCode: "USD" },
          salePriceFrom: 900,
          salePriceTo: 1100,
        },
        now,
      }),
    ).toBe(3500);

    expect(
      resolveSubscriptionUnitAmount({
        product: {
          basePrice: { amount: 5000, currencyCode: "USD" },
          salePrice: { amount: 3500, currencyCode: "USD" },
          salePriceFrom: 1101,
        },
        now,
      }),
    ).toBe(5000);
  });

  test("variant pricing overrides product pricing", () => {
    expect(
      buildSubscriptionPricingSnapshot({
        product: {
          basePrice: { amount: 5000, currencyCode: "USD" },
        },
        variant: {
          price: { amount: 7000, currencyCode: "USD" },
          salePrice: { amount: 6500, currencyCode: "USD" },
        },
        quantity: 2,
      }),
    ).toMatchObject({
      unitAmount: 6500,
      recurringAmount: 13000,
      currencyCode: "USD",
    });
  });

  test("explicit override is required for subscription enablement", () => {
    expect(hasExplicitSubscriptionEnablement(null)).toBe(false);
    expect(hasExplicitSubscriptionEnablement({ isSubscriptionEnabled: false })).toBe(false);
    expect(hasExplicitSubscriptionEnablement({ isSubscriptionEnabled: true })).toBe(true);
  });

  test("price override wins over catalog money", () => {
    expect(
      buildSubscriptionPricingSnapshot({
        product: {
          basePrice: { amount: 5000, currencyCode: "USD" },
        },
        override: {
          isSubscriptionEnabled: true,
          overridePriceAmount: 4200,
          overrideCurrencyCode: "CAD",
        },
        quantity: 3,
      }),
    ).toMatchObject({
      unitAmount: 4200,
      recurringAmount: 12600,
      currencyCode: "CAD",
      source: "override",
    });
  });
});
