import { describe, expect, test } from "bun:test";

import {
  findMatchingVariant,
  getInitialSelectedOptions,
  isOptionValueEnabled,
  type ProductVariant,
} from "./-variantSelection";

const optionTypes = [
  {
    id: "color",
    name: "Color",
    values: [
      { id: "black", label: "Black" },
      { id: "white", label: "White" },
    ],
  },
  {
    id: "size",
    name: "Size",
    values: [
      { id: "small", label: "Small" },
      { id: "large", label: "Large" },
    ],
  },
];

const variants: ProductVariant[] = [
  {
    _id: "variant_black_small",
    title: "Black / Small",
    sku: "BLK-SM",
    optionSummary: "Color: Black / Size: Small",
    stockQuantity: 10,
    isDefault: true,
    price: { amount: 2500 },
    selections: [
      { optionTypeId: "color", optionValueId: "black" },
      { optionTypeId: "size", optionValueId: "small" },
    ],
  },
  {
    _id: "variant_white_large",
    title: "White / Large",
    sku: "WHT-LG",
    optionSummary: "Color: White / Size: Large",
    stockQuantity: 0,
    price: { amount: 3500 },
    salePrice: { amount: 2999 },
    selections: [
      { optionTypeId: "color", optionValueId: "white" },
      { optionTypeId: "size", optionValueId: "large" },
    ],
  },
];

describe("product variant selection helpers", () => {
  test("builds initial selected options from the default variant", () => {
    expect(getInitialSelectedOptions(variants[0])).toEqual({
      color: "black",
      size: "small",
    });
  });

  test("returns empty options when variant is null", () => {
    expect(getInitialSelectedOptions(null)).toEqual({});
  });

  test("returns empty options when variant is undefined", () => {
    expect(getInitialSelectedOptions(undefined)).toEqual({});
  });

  test("returns empty options when variant has no selections", () => {
    expect(
      getInitialSelectedOptions({ _id: "v1", title: "Plain", selections: [] }),
    ).toEqual({});
  });

  test("finds the matching variant for a complete option selection", () => {
    expect(
      findMatchingVariant(optionTypes, variants, {
        color: "white",
        size: "large",
      }),
    )?.toMatchObject({
      _id: "variant_white_large",
      title: "White / Large",
    });
  });

  test("returns null when the current selection does not match a real variant", () => {
    expect(
      findMatchingVariant(optionTypes, variants, {
        color: "black",
        size: "large",
      }),
    ).toBeNull();
  });

  test("returns null when only a partial selection is provided", () => {
    expect(
      findMatchingVariant(optionTypes, variants, { color: "black" }),
    ).toBeNull();
  });

  test("returns null when selected options are empty", () => {
    expect(findMatchingVariant(optionTypes, variants, {})).toBeNull();
  });

  test("disables impossible option values against the current partial selection", () => {
    expect(
      isOptionValueEnabled("size", "large", { color: "black" }, variants),
    ).toBe(false);
    expect(
      isOptionValueEnabled("size", "small", { color: "black" }, variants),
    ).toBe(true);
  });

  test("enables all values for an option type when no other option is selected", () => {
    expect(
      isOptionValueEnabled("color", "black", {}, variants),
    ).toBe(true);
    expect(
      isOptionValueEnabled("color", "white", {}, variants),
    ).toBe(true);
  });

  test("detects impossible option combinations across multiple axes", () => {
    // Black only comes in Small, White only in Large
    // If color=white is selected, size=small should be disabled
    expect(
      isOptionValueEnabled("size", "small", { color: "white" }, variants),
    ).toBe(false);
    expect(
      isOptionValueEnabled("size", "large", { color: "white" }, variants),
    ).toBe(true);
  });

  // ---- Default variant initialization from product data ----

  describe("default variant initialization", () => {
    test("picks the isDefault variant as the initial selection", () => {
      const defaultVariant =
        variants.find((v) => v.isDefault) ?? variants[0] ?? null;
      expect(defaultVariant?._id).toBe("variant_black_small");
      const initial = getInitialSelectedOptions(defaultVariant);
      expect(initial).toEqual({ color: "black", size: "small" });

      // And it resolves back to the same variant
      const resolved = findMatchingVariant(optionTypes, variants, initial);
      expect(resolved?._id).toBe("variant_black_small");
    });

    test("falls back to first variant when no isDefault flag exists", () => {
      const noDefaultVariants: ProductVariant[] = variants.map((v) => ({
        ...v,
        isDefault: false,
      }));
      const fallback = noDefaultVariants[0] ?? null;
      expect(fallback?._id).toBe("variant_black_small");
      const initial = getInitialSelectedOptions(fallback);
      expect(Object.keys(initial).length).toBe(2);
    });
  });

  // ---- Add-to-cart disabled until valid variant selected ----

  describe("add-to-cart guard logic", () => {
    test("requiresVariantSelection is true when no variant matches partial selection", () => {
      const selected = findMatchingVariant(optionTypes, variants, {
        color: "black",
      });
      const requiresVariantSelection = selected === null;
      expect(requiresVariantSelection).toBe(true);
    });

    test("requiresVariantSelection is false when a full valid variant is selected", () => {
      const selected = findMatchingVariant(optionTypes, variants, {
        color: "black",
        size: "small",
      });
      const requiresVariantSelection = selected === null;
      expect(requiresVariantSelection).toBe(false);
    });
  });

  // ---- Selected variant out-of-stock behavior ----

  describe("out-of-stock variant behavior", () => {
    test("selected variant with stockQuantity 0 is out of stock", () => {
      const selected = findMatchingVariant(optionTypes, variants, {
        color: "white",
        size: "large",
      });
      expect(selected === null).toBe(false);
      const isOutOfStock = (selected!.stockQuantity ?? 0) <= 0;
      expect(isOutOfStock).toBe(true);
    });

    test("selected variant with positive stockQuantity is in stock", () => {
      const selected = findMatchingVariant(optionTypes, variants, {
        color: "black",
        size: "small",
      });
      expect(selected === null).toBe(false);
      const isOutOfStock = (selected!.stockQuantity ?? 0) <= 0;
      expect(isOutOfStock).toBe(false);
    });

    test("variant with undefined stockQuantity is treated as out of stock", () => {
      const variantNoStock: ProductVariant = {
        _id: "variant_no_stock",
        title: "No Stock Info",
        selections: [
          { optionTypeId: "color", optionValueId: "black" },
          { optionTypeId: "size", optionValueId: "small" },
        ],
      };
      const isOutOfStock = (variantNoStock.stockQuantity ?? 0) <= 0;
      expect(isOutOfStock).toBe(true);
    });
  });

  // ---- Variant price resolution ----

  describe("variant price resolution", () => {
    test("sale price takes precedence over base price", () => {
      const selected = findMatchingVariant(optionTypes, variants, {
        color: "white",
        size: "large",
      });
      const effectivePrice =
        selected?.salePrice?.amount ?? selected?.price?.amount ?? null;
      expect(effectivePrice).toBe(2999);
    });

    test("falls back to base price when no sale price", () => {
      const selected = findMatchingVariant(optionTypes, variants, {
        color: "black",
        size: "small",
      });
      const effectivePrice =
        selected?.salePrice?.amount ?? selected?.price?.amount ?? null;
      expect(effectivePrice).toBe(2500);
    });
  });

  // ---- Wishlist button variant pass-through ----

  describe("wishlist button variant pass-through", () => {
    test("selected variant id is available for wishlist when valid", () => {
      const selected = findMatchingVariant(optionTypes, variants, {
        color: "black",
        size: "small",
      });
      // The WishlistButton receives variantId prop; ensure we have the right value
      const variantIdForWishlist = selected?._id;
      expect(variantIdForWishlist).toBe("variant_black_small");
    });

    test("variant id is undefined when no variant is selected", () => {
      const selected = findMatchingVariant(optionTypes, variants, {
        color: "black",
      });
      const variantIdForWishlist = selected?._id;
      expect(variantIdForWishlist).toBe(undefined);
    });

    test("WishlistButton should be hidden when variable product has no valid variant", () => {
      const isVariableProduct = true;
      const selectedVariant = findMatchingVariant(optionTypes, variants, {
        color: "black",
      });
      // Logic from the product detail page: show button only when not variable or has variant
      const showWishlistButton = !isVariableProduct || selectedVariant !== null;
      expect(showWishlistButton).toBe(false);
    });

    test("WishlistButton should be visible when valid variant is selected", () => {
      const isVariableProduct = true;
      const selectedVariant = findMatchingVariant(optionTypes, variants, {
        color: "black",
        size: "small",
      });
      const showWishlistButton = !isVariableProduct || selectedVariant !== null;
      expect(showWishlistButton).toBe(true);
    });
  });
});
