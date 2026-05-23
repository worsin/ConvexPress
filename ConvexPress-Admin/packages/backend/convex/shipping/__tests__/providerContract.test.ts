import { describe, expect, test } from "bun:test";
import {
  applyServiceFilters,
  allProviders,
  resolveProvider,
} from "../providers/contract";
import {
  getProviderCapabilities,
  getShippingProviderDescriptor,
} from "../providers";
import type { ShippingProvider } from "../helpers";
import type { NormalizedShippingQuote } from "../rates/types";

/**
 * PRD B10 §4 — provider contract conformance tests. These are pure
 * contract checks (no carrier API calls); sandbox-level smoke tests for
 * rates/labels/tracking require real credentials and live in a separate
 * suite gated by env vars.
 */
describe("LiveRateProvider contract", () => {
  const EXPECTED: Array<{
    id: ShippingProvider;
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

  test("runtime capabilities stay aligned with provider descriptors", () => {
    for (const { id } of EXPECTED) {
      const provider = resolveProvider(id);
      const descriptor = getShippingProviderDescriptor(id);
      const capabilities = getProviderCapabilities(id);

      expect(descriptor.provider).toBe(id);
      expect(provider.capabilities.rates).toBe(capabilities.supports_rates);
      expect(provider.capabilities.labels).toBe(capabilities.supports_labels);
      expect(provider.capabilities.tracking).toBe(capabilities.supports_tracking);
      expect(provider.capabilities.manifests).toBe(capabilities.supports_manifests);

      expect(descriptor.operations.rates === "implemented").toBe(
        provider.capabilities.rates,
      );
      expect(descriptor.operations.labels === "implemented").toBe(
        provider.capabilities.labels,
      );
      expect(descriptor.operations.tracking === "implemented").toBe(
        provider.capabilities.tracking,
      );
      expect(descriptor.operations.manifests === "implemented").toBe(
        provider.capabilities.manifests,
      );
    }
  });

  test("partial provider coverage is explicit for USPS and DHL", () => {
    const usps = getShippingProviderDescriptor("usps");
    expect(usps.operations.rates).toBe("implemented");
    expect(usps.operations.tracking).toBe("implemented");
    expect(usps.operations.address_validation).toBe("implemented");
    expect(usps.operations.labels).toBe("planned");
    expect(usps.operations.manifests).toBe("planned");
    expect(getProviderCapabilities("usps").supports_labels).toBe(false);
    expect(resolveProvider("usps").capabilities.labels).toBe(false);

    const dhl = getShippingProviderDescriptor("dhl");
    expect(dhl.operations.rates).toBe("implemented");
    expect(dhl.operations.labels).toBe("not_supported");
    expect(dhl.operations.tracking).toBe("not_supported");
    expect(dhl.operations.manifests).toBe("not_supported");
    expect(getProviderCapabilities("dhl").supports_tracking).toBe(false);
    expect(resolveProvider("dhl").capabilities.tracking).toBe(false);
  });

  test("unknown provider capability lookups fail closed", () => {
    const capabilities = getProviderCapabilities("not-a-provider");
    expect(capabilities.supports_rates).toBe(false);
    expect(capabilities.supports_labels).toBe(false);
    expect(capabilities.supports_tracking).toBe(false);
    expect(capabilities.supports_manifests).toBe(false);
    expect(capabilities.supports_returns).toBe(false);
  });
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
