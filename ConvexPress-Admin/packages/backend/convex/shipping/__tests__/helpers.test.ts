/**
 * Shipping System - helpers.ts Unit Tests
 *
 * Tests for exported helper utilities:
 *   - assertShippingProvider: throws ConvexError on unknown provider
 *   - SHIPPING_PROVIDERS: contains all 5 expected providers
 *
 * Note: buildFedexTrackingUrl and buildDhlTrackingUrl are NOT tested here
 * because they will be added in future tasks (FedEx Labels and DHL).
 *
 * Run with: bun test packages/backend/convex/shipping/__tests__/helpers.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  assertShippingProvider,
  SHIPPING_PROVIDERS,
} from "../helpers";

// ─── assertShippingProvider ───────────────────────────────────────────────────

describe("assertShippingProvider", () => {
  test("ups is a valid provider and does not throw", () => {
    expect(() => assertShippingProvider("ups")).not.toThrow();
  });

  test("usps is a valid provider and does not throw", () => {
    expect(() => assertShippingProvider("usps")).not.toThrow();
  });

  test("fedex is a valid provider and does not throw", () => {
    expect(() => assertShippingProvider("fedex")).not.toThrow();
  });

  test("dhl is a valid provider and does not throw", () => {
    expect(() => assertShippingProvider("dhl")).not.toThrow();
  });

  test("shipstation is a valid provider and does not throw", () => {
    expect(() => assertShippingProvider("shipstation")).not.toThrow();
  });

  test("returns the provider string for valid input", () => {
    expect(assertShippingProvider("ups")).toBe("ups");
    expect(assertShippingProvider("fedex")).toBe("fedex");
    expect(assertShippingProvider("usps")).toBe("usps");
    expect(assertShippingProvider("dhl")).toBe("dhl");
    expect(assertShippingProvider("shipstation")).toBe("shipstation");
  });

  test("throws ConvexError for unknown provider", () => {
    expect(() => assertShippingProvider("unknown-carrier")).toThrow();
  });

  test("throws ConvexError for empty string", () => {
    expect(() => assertShippingProvider("")).toThrow();
  });

  test("throws ConvexError for provider with wrong casing", () => {
    // Provider codes are lowercase; "UPS" should not be accepted
    expect(() => assertShippingProvider("UPS")).toThrow();
    expect(() => assertShippingProvider("FedEx")).toThrow();
  });

  test("thrown error message includes the invalid provider name", () => {
    let errorMessage = "";
    try {
      assertShippingProvider("bad-carrier");
    } catch (err: unknown) {
      // ConvexError stores data as .data property
      const convexErr = err as { data?: { message?: string }; message?: string };
      errorMessage =
        convexErr?.data?.message ?? convexErr?.message ?? String(err);
    }
    expect(errorMessage).toContain("bad-carrier");
  });
});

// ─── SHIPPING_PROVIDERS ───────────────────────────────────────────────────────

describe("SHIPPING_PROVIDERS", () => {
  test("contains exactly 5 providers", () => {
    expect(SHIPPING_PROVIDERS).toHaveLength(5);
  });

  test("contains ups", () => {
    expect(SHIPPING_PROVIDERS).toContain("ups");
  });

  test("contains usps", () => {
    expect(SHIPPING_PROVIDERS).toContain("usps");
  });

  test("contains fedex", () => {
    expect(SHIPPING_PROVIDERS).toContain("fedex");
  });

  test("contains dhl", () => {
    expect(SHIPPING_PROVIDERS).toContain("dhl");
  });

  test("contains shipstation", () => {
    expect(SHIPPING_PROVIDERS).toContain("shipstation");
  });
});
