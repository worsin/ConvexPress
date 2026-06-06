import { describe, expect, test } from "bun:test";

import {
  PAYPAL_PRODUCTION_BASE_URL,
  PAYPAL_SANDBOX_BASE_URL,
  getPayPalBaseUrl,
  normalizePayPalMode,
} from "../paypalMode";

describe("paypal mode helpers", () => {
  test("uses sandbox by default", () => {
    expect(normalizePayPalMode(undefined)).toBe("sandbox");
    expect(normalizePayPalMode("")).toBe("sandbox");
    expect(getPayPalBaseUrl("sandbox")).toBe(PAYPAL_SANDBOX_BASE_URL);
  });

  test("maps production and legacy live values to the live PayPal API", () => {
    expect(normalizePayPalMode("production")).toBe("production");
    expect(normalizePayPalMode("live")).toBe("production");
    expect(getPayPalBaseUrl("production")).toBe(PAYPAL_PRODUCTION_BASE_URL);
    expect(getPayPalBaseUrl("live")).toBe(PAYPAL_PRODUCTION_BASE_URL);
  });
});
