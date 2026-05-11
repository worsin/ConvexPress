import { describe, expect, test } from "bun:test";

import {
  mapWooManageStock,
  mapWooSaleDates,
  mapWooDimensions,
  mapWooBackorders,
  resolveActivePrice,
  resolveVariantField,
} from "../variantHelpers";

describe("WooCommerce variant field mapping", () => {
  describe("mapWooManageStock", () => {
    test("maps boolean true to 'yes'", () => {
      expect(mapWooManageStock(true)).toBe("yes");
    });
    test("maps boolean false to 'no'", () => {
      expect(mapWooManageStock(false)).toBe("no");
    });
    test("maps string 'parent' to 'parent'", () => {
      expect(mapWooManageStock("parent")).toBe("parent");
    });
    test("maps undefined to undefined", () => {
      expect(mapWooManageStock(undefined)).toBeUndefined();
    });
  });

  describe("mapWooSaleDates", () => {
    test("converts ISO date strings to timestamps", () => {
      const result = mapWooSaleDates("2024-01-01T00:00:00", "2024-02-01T00:00:00");
      expect(result.salePriceFrom).toBe(new Date("2024-01-01T00:00:00").getTime());
      expect(result.salePriceTo).toBe(new Date("2024-02-01T00:00:00").getTime());
    });
    test("handles null dates", () => {
      const result = mapWooSaleDates(null, null);
      expect(result.salePriceFrom).toBeUndefined();
      expect(result.salePriceTo).toBeUndefined();
    });
    test("handles mixed null/present dates", () => {
      const result = mapWooSaleDates("2024-01-01T00:00:00", null);
      expect(result.salePriceFrom).toBe(new Date("2024-01-01T00:00:00").getTime());
      expect(result.salePriceTo).toBeUndefined();
    });
  });

  describe("mapWooDimensions", () => {
    test("passes through string dimensions", () => {
      expect(mapWooDimensions({ length: "10", width: "8", height: "2" })).toEqual({
        shippingLengthIn: "10", shippingWidthIn: "8", shippingHeightIn: "2",
      });
    });
    test("handles undefined dimensions", () => {
      expect(mapWooDimensions(undefined)).toEqual({
        shippingLengthIn: undefined, shippingWidthIn: undefined, shippingHeightIn: undefined,
      });
    });
    test("handles partial dimensions", () => {
      expect(mapWooDimensions({ length: "10" })).toEqual({
        shippingLengthIn: "10", shippingWidthIn: undefined, shippingHeightIn: undefined,
      });
    });
    test("handles empty string dimensions as undefined", () => {
      expect(mapWooDimensions({ length: "", width: "", height: "" })).toEqual({
        shippingLengthIn: undefined, shippingWidthIn: undefined, shippingHeightIn: undefined,
      });
    });
  });

  describe("mapWooBackorders", () => {
    test("maps 'no' to 'no'", () => { expect(mapWooBackorders("no")).toBe("no"); });
    test("maps 'yes' to 'yes'", () => { expect(mapWooBackorders("yes")).toBe("yes"); });
    test("maps 'notify' to 'notify'", () => { expect(mapWooBackorders("notify")).toBe("notify"); });
    test("maps undefined to undefined", () => { expect(mapWooBackorders(undefined)).toBeUndefined(); });
  });

  describe("resolveActivePrice", () => {
    test("returns sale price when sale is active (no dates)", () => {
      expect(resolveActivePrice({
        price: { amount: 2999 },
        salePrice: { amount: 1999 },
      })).toBe(1999);
    });
    test("returns regular price when no sale price", () => {
      expect(resolveActivePrice({
        price: { amount: 2999 },
      })).toBe(2999);
    });
    test("returns regular price when sale period has not started", () => {
      expect(resolveActivePrice({
        price: { amount: 2999 },
        salePrice: { amount: 1999 },
        salePriceFrom: Date.now() + 86400000,
      })).toBe(2999);
    });
    test("returns regular price when sale period has ended", () => {
      expect(resolveActivePrice({
        price: { amount: 2999 },
        salePrice: { amount: 1999 },
        salePriceTo: Date.now() - 86400000,
      })).toBe(2999);
    });
    test("returns sale price when within sale period", () => {
      expect(resolveActivePrice({
        price: { amount: 2999 },
        salePrice: { amount: 1999 },
        salePriceFrom: Date.now() - 86400000,
        salePriceTo: Date.now() + 86400000,
      })).toBe(1999);
    });
    test("returns undefined when no price set", () => {
      expect(resolveActivePrice({})).toBeUndefined();
    });
  });

  describe("resolveVariantField (inheritance)", () => {
    test("uses variant value when present", () => {
      expect(resolveVariantField("variant_weight", "parent_weight")).toBe("variant_weight");
    });
    test("falls back to parent when variant is undefined", () => {
      expect(resolveVariantField(undefined, "parent_weight")).toBe("parent_weight");
    });
    test("falls back to parent when variant is null", () => {
      expect(resolveVariantField(null, "parent_weight")).toBe("parent_weight");
    });
    test("returns undefined when both are undefined", () => {
      expect(resolveVariantField(undefined, undefined)).toBeUndefined();
    });
    test("uses variant value of 0 (not falsy fallback)", () => {
      expect(resolveVariantField(0, 5)).toBe(0);
    });
    test("uses variant empty string (not falsy fallback)", () => {
      expect(resolveVariantField("", "parent")).toBe("");
    });
  });
});
