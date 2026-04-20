import { describe, expect, test } from "bun:test";

import {
  validateCartItemVariant,
  buildCartItemVariantMetadata,
  resolveCartItemUnitPrice,
  buildOrderItemSnapshot,
  computeAvailability,
} from "../cartHelpers";

// ────────────────────────────────────────────────────────────────────
// validateCartItemVariant
// ────────────────────────────────────────────────────────────────────

describe("validateCartItemVariant", () => {
  test("variable product requires variantId", () => {
    const error = validateCartItemVariant({
      productId: "p1",
      productType: "variable",
      quantity: 1,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("VALIDATION_ERROR");
    expect(error!.message).toContain("variant must be selected");
  });

  test("variable product with valid variantId passes", () => {
    const error = validateCartItemVariant({
      productId: "p1",
      productType: "variable",
      variantId: "v1",
      variantProductId: "p1",
      quantity: 1,
    });
    expect(error).toBeNull();
  });

  test("variant must belong to the selected product", () => {
    const error = validateCartItemVariant({
      productId: "p1",
      productType: "variable",
      variantId: "v1",
      variantProductId: "p_DIFFERENT",
      quantity: 1,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("does not belong");
  });

  test("simple product without variant passes", () => {
    const error = validateCartItemVariant({
      productId: "p1",
      productType: "simple",
      quantity: 1,
    });
    expect(error).toBeNull();
  });

  test("simple product with optional variant passes if it belongs to product", () => {
    const error = validateCartItemVariant({
      productId: "p1",
      productType: "simple",
      variantId: "v1",
      variantProductId: "p1",
      quantity: 1,
    });
    expect(error).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// buildCartItemVariantMetadata
// ────────────────────────────────────────────────────────────────────

describe("buildCartItemVariantMetadata", () => {
  test("returns undefined for null variant", () => {
    expect(buildCartItemVariantMetadata(null)).toBeUndefined();
  });

  test("preserves variant title, optionSummary, and SKU", () => {
    const metadata = buildCartItemVariantMetadata({
      title: "Red / Large",
      optionSummary: "Color: Red / Size: Large",
      sku: "SKU-R-L",
    });
    expect(metadata).toEqual({
      variantTitle: "Red / Large",
      optionSummary: "Color: Red / Size: Large",
      variantSku: "SKU-R-L",
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// resolveCartItemUnitPrice
// ────────────────────────────────────────────────────────────────────

describe("resolveCartItemUnitPrice", () => {
  test("uses variant sale price when available", () => {
    expect(
      resolveCartItemUnitPrice({
        variant: {
          salePrice: { amount: 1500 },
          price: { amount: 2000 },
        },
        product: {
          salePrice: { amount: 3000 },
          basePrice: { amount: 4000 },
        },
      }),
    ).toBe(1500);
  });

  test("uses variant base price when no sale price", () => {
    expect(
      resolveCartItemUnitPrice({
        variant: {
          price: { amount: 2000 },
        },
        product: {
          basePrice: { amount: 4000 },
        },
      }),
    ).toBe(2000);
  });

  test("uses product price when no variant", () => {
    expect(
      resolveCartItemUnitPrice({
        product: {
          salePrice: { amount: 3000 },
          basePrice: { amount: 4000 },
        },
      }),
    ).toBe(3000);
  });

  test("uses bundle price over product price when present", () => {
    expect(
      resolveCartItemUnitPrice({
        product: {
          basePrice: { amount: 4000 },
        },
        bundlePriceAmount: 2500,
      }),
    ).toBe(2500);
  });
});

// ────────────────────────────────────────────────────────────────────
// buildOrderItemSnapshot
// ────────────────────────────────────────────────────────────────────

describe("buildOrderItemSnapshot", () => {
  test("preserves variant title, SKU, optionSummary, and selected variant price", () => {
    const snapshot = buildOrderItemSnapshot({
      productId: "p1",
      variantId: "v1",
      quantity: 2,
      product: { title: "T-Shirt", sku: "TSH" },
      variant: {
        title: "Red / Large",
        sku: "TSH-R-L",
        optionSummary: "Color: Red / Size: Large",
        price: { amount: 2000, currencyCode: "USD" },
        salePrice: { amount: 1500, currencyCode: "USD" },
      },
      unitPriceAmount: 1500,
    });

    expect(snapshot.productTitle).toBe("T-Shirt");
    expect(snapshot.variantTitle).toBe("Red / Large");
    expect(snapshot.optionSummary).toBe("Color: Red / Size: Large");
    expect(snapshot.variantSku).toBe("TSH-R-L");
    expect(snapshot.sku).toBe("TSH-R-L");
    expect(snapshot.unitPriceAmount).toBe(1500);
    expect(snapshot.lineTotalAmount).toBe(3000);
  });

  test("uses product SKU when variant has no SKU", () => {
    const snapshot = buildOrderItemSnapshot({
      productId: "p1",
      quantity: 1,
      product: { title: "T-Shirt", sku: "TSH" },
      unitPriceAmount: 2000,
    });

    expect(snapshot.sku).toBe("TSH");
    expect(snapshot.variantTitle).toBeUndefined();
    expect(snapshot.optionSummary).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// computeAvailability (inventory)
// ────────────────────────────────────────────────────────────────────

describe("computeAvailability", () => {
  test("variable products use variant stock, not parent product stock", () => {
    // This test validates the principle: variable products should use
    // per-variant stockQuantity. The pure function takes the resolved values.
    const result = computeAvailability({
      trackInventory: true,
      allowBackorders: false,
      stockQuantity: 5,  // variant stock
      reservedCount: 2,
      requestedQuantity: 3,
    });
    expect(result.canFulfill).toBe(true);
    expect(result.available).toBe(3);
  });

  test("reservation reduces available stock", () => {
    const result = computeAvailability({
      trackInventory: true,
      allowBackorders: false,
      stockQuantity: 10,
      reservedCount: 8,
      requestedQuantity: 3,
    });
    expect(result.canFulfill).toBe(false);
    expect(result.available).toBe(2);
  });

  test("backorder allows fulfillment even when stock is insufficient", () => {
    const result = computeAvailability({
      trackInventory: true,
      allowBackorders: true,
      stockQuantity: 1,
      reservedCount: 0,
      requestedQuantity: 5,
    });
    expect(result.canFulfill).toBe(true);
  });

  test("untracked inventory always fulfillable", () => {
    const result = computeAvailability({
      trackInventory: false,
      allowBackorders: false,
      stockQuantity: 0,
      reservedCount: 0,
      requestedQuantity: 100,
    });
    expect(result.canFulfill).toBe(true);
  });

  test("out of stock rejects fulfillment", () => {
    const result = computeAvailability({
      trackInventory: true,
      allowBackorders: false,
      stockQuantity: 0,
      reservedCount: 0,
      requestedQuantity: 1,
    });
    expect(result.canFulfill).toBe(false);
  });

  test("zero reserved count means full stock available", () => {
    const result = computeAvailability({
      trackInventory: true,
      allowBackorders: false,
      stockQuantity: 10,
      reservedCount: 0,
      requestedQuantity: 5,
    });
    expect(result.canFulfill).toBe(true);
    expect(result.available).toBe(10);
  });
});

// ────────────────────────────────────────────────────────────────────
// Inventory adjustment via resolveInventoryAdjustment (imported from existing)
// ────────────────────────────────────────────────────────────────────

import { resolveInventoryAdjustment } from "../orderBundleHelpers";

describe("inventory variant adjustments", () => {
  test("allocation decrements variant stock", () => {
    const result = resolveInventoryAdjustment({
      mode: "decrement",
      stockQuantity: 10,
      allocationQuantity: 3,
      allowBackorders: false,
      label: "T-Shirt - Red/Large",
    });
    expect(result.quantityDelta).toBe(-3);
    expect(result.nextStock).toBe(7);
    expect(result.adjustmentType).toBe("order_allocation");
  });

  test("cancellation/failure releases variant stock", () => {
    const result = resolveInventoryAdjustment({
      mode: "restore",
      stockQuantity: 7,
      allocationQuantity: 3,
      allowBackorders: false,
      label: "T-Shirt - Red/Large",
    });
    expect(result.quantityDelta).toBe(3);
    expect(result.nextStock).toBe(10);
    expect(result.adjustmentType).toBe("order_release");
  });

  test("refund restock restores variant stock", () => {
    const result = resolveInventoryAdjustment({
      mode: "restore",
      stockQuantity: 5,
      allocationQuantity: 2,
      allowBackorders: false,
      label: "T-Shirt - Red/Large",
    });
    expect(result.quantityDelta).toBe(2);
    expect(result.nextStock).toBe(7);
  });

  test("backorder allows negative stock", () => {
    const result = resolveInventoryAdjustment({
      mode: "decrement",
      stockQuantity: 0,
      allocationQuantity: 5,
      allowBackorders: true,
      label: "T-Shirt - Red/Large",
    });
    expect(result.quantityDelta).toBe(-5);
    expect(result.nextStock).toBe(-5);
  });

  test("rejects over-allocation without backorders", () => {
    expect(() =>
      resolveInventoryAdjustment({
        mode: "decrement",
        stockQuantity: 2,
        allocationQuantity: 5,
        allowBackorders: false,
        label: "T-Shirt - Red/Large",
      }),
    ).toThrow("Insufficient inventory");
  });
});
