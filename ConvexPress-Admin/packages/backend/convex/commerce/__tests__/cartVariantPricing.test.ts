import { describe, expect, test } from "bun:test";
import {
  resolveCartItemUnitPrice,
  validateCartItemVariant,
  buildCartItemVariantMetadata,
  computeAvailability,
} from "../cartHelpers";

// ────────────────────────────────────────────────────────────────────
// Variant pricing resolution
// ────────────────────────────────────────────────────────────────────

describe("cart variant pricing", () => {
  test("uses variant sale price over product price", () => {
    expect(
      resolveCartItemUnitPrice({
        variant: { salePrice: { amount: 1999 }, price: { amount: 2999 } },
        product: { basePrice: { amount: 999 } },
      }),
    ).toBe(1999);
  });

  test("uses variant base price when no sale price", () => {
    expect(
      resolveCartItemUnitPrice({
        variant: { price: { amount: 2999 } },
        product: { basePrice: { amount: 999 } },
      }),
    ).toBe(2999);
  });

  test("uses product price when no variant", () => {
    expect(
      resolveCartItemUnitPrice({
        product: { salePrice: { amount: 799 }, basePrice: { amount: 999 } },
      }),
    ).toBe(799);
  });
});

// ────────────────────────────────────────────────────────────────────
// Stock quantity check (not just zero check)
// ────────────────────────────────────────────────────────────────────

describe("stock quantity check", () => {
  test("rejects when requested quantity exceeds stock", () => {
    expect(
      computeAvailability({
        trackInventory: true,
        allowBackorders: false,
        stockQuantity: 3,
        reservedCount: 0,
        requestedQuantity: 5,
      }).canFulfill,
    ).toBe(false);
  });

  test("allows when requested quantity is within stock", () => {
    expect(
      computeAvailability({
        trackInventory: true,
        allowBackorders: false,
        stockQuantity: 10,
        reservedCount: 0,
        requestedQuantity: 5,
      }).canFulfill,
    ).toBe(true);
  });

  test("rejects when stock minus reserved is insufficient", () => {
    expect(
      computeAvailability({
        trackInventory: true,
        allowBackorders: false,
        stockQuantity: 10,
        reservedCount: 8,
        requestedQuantity: 5,
      }).canFulfill,
    ).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Variant belongs-to-product validation
// ────────────────────────────────────────────────────────────────────

describe("variant belongs-to-product validation", () => {
  test("variant must belong to product", () => {
    const error = validateCartItemVariant({
      productId: "product_A",
      productType: "variable",
      variantId: "variant_1",
      variantProductId: "product_B",
      quantity: 1,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("does not belong");
  });

  test("passes when variant belongs to the correct product", () => {
    const error = validateCartItemVariant({
      productId: "product_A",
      productType: "variable",
      variantId: "variant_1",
      variantProductId: "product_A",
      quantity: 1,
    });
    expect(error).toBeNull();
  });

  test("variable product without variant is rejected", () => {
    const error = validateCartItemVariant({
      productId: "product_A",
      productType: "variable",
      quantity: 1,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("variant must be selected");
  });
});

// ────────────────────────────────────────────────────────────────────
// Variant metadata on cart items
// ────────────────────────────────────────────────────────────────────

describe("variant metadata", () => {
  test("captures variant title, optionSummary, and SKU", () => {
    expect(
      buildCartItemVariantMetadata({
        title: "Red / Large",
        optionSummary: "Color: Red / Size: Large",
        sku: "TSH-R-L",
      }),
    ).toEqual({
      variantTitle: "Red / Large",
      optionSummary: "Color: Red / Size: Large",
      variantSku: "TSH-R-L",
    });
  });

  test("returns undefined when no variant", () => {
    expect(buildCartItemVariantMetadata(null)).toBeUndefined();
  });
});
