import { describe, expect, test } from "bun:test";

import {
  getCartLineSku,
  getCartLineSubtitle,
  getCartLineTitle,
} from "./cartLine";

describe("cart line display helpers", () => {
  test("prefers bundle metadata for bundle line titles", () => {
    expect(
      getCartLineTitle(
        { title: "Parent product" },
        { lineType: "bundle", bundleName: "Starter Kit" },
      ),
    ).toBe("Starter Kit");
  });

  test("shows option summary for variant lines", () => {
    expect(
      getCartLineSubtitle({
        variantTitle: "Black / Large",
        optionSummary: "Color: Black / Size: Large",
      }),
    ).toBe("Color: Black / Size: Large");
  });

  test("falls back to variant title when no option summary exists", () => {
    expect(
      getCartLineSubtitle({
        variantTitle: "Black / Large",
      }),
    ).toBe("Black / Large");
  });

  test("prefers variant SKU over parent SKU", () => {
    expect(
      getCartLineSku(
        { sku: "PARENT-SKU" },
        { variantSku: "VARIANT-SKU" },
      ),
    ).toBe("VARIANT-SKU");
  });
});

describe("live cart variant read model", () => {
  const variant = { title: "Pair", optionSummary: "Set size: Pair", sku: "LINEN-PAIR" };
  test("uses the resolved variant when cart metadata is absent", () => {
    expect(getCartLineSubtitle(undefined, variant)).toBe("Set size: Pair");
    expect(getCartLineSku({ sku: "LINEN" }, undefined, variant)).toBe("LINEN-PAIR");
  });
  test("resolved variant overrides stale client-supplied metadata", () => {
    expect(getCartLineSubtitle({ optionSummary: "Single" }, variant)).toBe("Set size: Pair");
    expect(getCartLineSku({ sku: "LINEN" }, { variantSku: "FAKE" }, variant)).toBe("LINEN-PAIR");
  });
  test("resolved title is usable without options and bundles retain their separate labels", () => {
    expect(getCartLineSubtitle(undefined, { title: "Pair" })).toBe("Pair");
    expect(getCartLineSubtitle({ lineType: "bundle" }, variant)).toBeNull();
    expect(getCartLineSku({ sku: "LINEN" }, { lineType: "bundle" }, variant)).toBeNull();
  });
});
