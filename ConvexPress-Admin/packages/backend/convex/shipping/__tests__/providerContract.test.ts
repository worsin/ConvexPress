import { describe, expect, test } from "bun:test";
import {
  applyServiceFilters,
  allProviders,
  resolveProvider,
} from "../providers/contract";
import type { NormalizedShippingQuote } from "../rates/types";

/**
 * PRD B10 §4 — provider contract conformance tests. These are pure
 * contract checks (no carrier API calls); sandbox-level smoke tests for
 * rates/labels/tracking require real credentials and live in a separate
 * suite gated by env vars.
 */
describe("LiveRateProvider contract", () => {
  const EXPECTED: Array<{
    id: "shipstation" | "ups" | "usps" | "fedex" | "dhl";
    supportsLabels: boolean;
  }> = [
    { id: "shipstation", supportsLabels: true },
    { id: "ups", supportsLabels: true },
    { id: "usps", supportsLabels: false },
    { id: "fedex", supportsLabels: true },
    { id: "dhl", supportsLabels: false },
  ];

  test("registry has exactly the 5 expected providers", () => {
    const ids = allProviders().map((p) => p.id).sort();
    expect(ids).toEqual(EXPECTED.map((e) => e.id).sort());
  });

  for (const { id, supportsLabels } of EXPECTED) {
    test(`${id} — exposes required contract surface`, () => {
      const p = resolveProvider(id);
      expect(p.id).toBe(id);
      expect(typeof p.displayName).toBe("string");
      expect(typeof p.fetchRates).toBe("function");
      expect(typeof p.purchaseLabel).toBe("function");
      expect(p.capabilities.rates).toBe(true);
      expect(p.capabilities.labels).toBe(supportsLabels);
    });
  }
});

describe("applyServiceFilters", () => {
  const base: NormalizedShippingQuote[] = [
    {
      quoteKey: "a",
      provider: "ups",
      carrierCode: "ups",
      carrierName: "UPS",
      serviceCode: "01",
      serviceName: "Next Day",
      amount: 2000,
      currency: "USD",
      isCheapest: false,
      isFastest: false,
      isBestValue: false,
      addressKey: "",
      cartKey: "",
    },
    {
      quoteKey: "b",
      provider: "ups",
      carrierCode: "ups",
      carrierName: "UPS",
      serviceCode: "03",
      serviceName: "Ground",
      amount: 1000,
      currency: "USD",
      isCheapest: false,
      isFastest: false,
      isBestValue: false,
      addressKey: "",
      cartKey: "",
    },
  ];

  test("no filters returns all", () => {
    expect(applyServiceFilters(base, undefined)).toHaveLength(2);
  });

  test("allow narrows", () => {
    const out = applyServiceFilters(base, { allow: ["03"] });
    expect(out).toHaveLength(1);
    expect(out[0]!.serviceCode).toBe("03");
  });

  test("deny removes", () => {
    const out = applyServiceFilters(base, { deny: ["03"] });
    expect(out).toHaveLength(1);
    expect(out[0]!.serviceCode).toBe("01");
  });

  test("allow then deny applies both", () => {
    const out = applyServiceFilters(base, { allow: ["01", "03"], deny: ["01"] });
    expect(out).toHaveLength(1);
    expect(out[0]!.serviceCode).toBe("03");
  });
});
