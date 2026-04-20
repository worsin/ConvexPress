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
