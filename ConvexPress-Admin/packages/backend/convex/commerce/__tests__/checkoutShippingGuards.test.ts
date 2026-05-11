import { describe, expect, test } from "bun:test";

import {
  computeAddressKey,
  computeCartKey,
  isQuoteUsableForCheckout,
} from "../checkoutShippingGuards";

describe("checkout shipping guards", () => {
  test("address fingerprint changes when shipping address changes", () => {
    const original = computeAddressKey({
      line1: "123 Main St",
      city: "Denver",
      state: "CO",
      postalCode: "80202",
      countryCode: "US",
    });
    const changed = computeAddressKey({
      line1: "999 Market St",
      city: "Denver",
      state: "CO",
      postalCode: "80202",
      countryCode: "US",
    });

    expect(original).not.toBe(changed);
  });

  test("cart fingerprint is deterministic and changes when quantity changes", () => {
    const first = computeCartKey([
      { productId: "p2", variantId: "v2", quantity: 1 },
      { productId: "p1", quantity: 2 },
    ]);
    const reordered = computeCartKey([
      { productId: "p1", quantity: 2 },
      { productId: "p2", variantId: "v2", quantity: 1 },
    ]);
    const changed = computeCartKey([
      { productId: "p1", quantity: 3 },
      { productId: "p2", variantId: "v2", quantity: 1 },
    ]);

    expect(first).toBe(reordered);
    expect(first).not.toBe(changed);
  });

  test("quote is rejected when expired, address changed, or cart changed", () => {
    const now = 1_000;
    expect(
      isQuoteUsableForCheckout(
        { expiresAt: 2_000, addressKey: "addr", cartKey: "cart" },
        "addr",
        "cart",
        now,
      ),
    ).toBe(true);
    expect(
      isQuoteUsableForCheckout(
        { expiresAt: 999, addressKey: "addr", cartKey: "cart" },
        "addr",
        "cart",
        now,
      ),
    ).toBe(false);
    expect(
      isQuoteUsableForCheckout(
        { expiresAt: 2_000, addressKey: "old", cartKey: "cart" },
        "addr",
        "cart",
        now,
      ),
    ).toBe(false);
    expect(
      isQuoteUsableForCheckout(
        { expiresAt: 2_000, addressKey: "addr", cartKey: "old" },
        "addr",
        "cart",
        now,
      ),
    ).toBe(false);
  });
});
