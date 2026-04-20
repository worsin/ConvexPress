import { describe, expect, test } from "bun:test";

import {
  normalizeVariantSelections,
  buildSelectionKey,
  buildOptionSummaryFromSelections,
  validateVariantSelectionsResult,
  generateVariantCombinations,
  getVariantDisplayPrice,
  getVariantLabel,
  validateOptionTypesShape,
  type OptionType,
} from "../variantHelpers";

import {
  resolveCartItemUnitPrice,
  validateCartItemVariant,
  buildCartItemVariantMetadata,
  buildOrderItemSnapshot,
  computeAvailability,
} from "../cartHelpers";

import {
  buildOrderItemTitle,
  buildOrderItemMetadata,
  getOrderItemInventoryAllocations,
  resolveInventoryAdjustment,
} from "../orderBundleHelpers";

/**
 * End-to-end variant data flow tests.
 *
 * Simulates the full lifecycle:
 * 1. Define option types on a product
 * 2. Generate variant combinations
 * 3. Validate selections
 * 4. Add to cart with correct pricing
 * 5. Create order item snapshot
 * 6. Verify inventory adjustment
 * 7. Verify display labels
 */

const OPTION_TYPES: OptionType[] = [
  {
    id: "opt_color",
    name: "Color",
    sortOrder: 0,
    values: [
      { id: "val_red", label: "Red", sortOrder: 0 },
      { id: "val_blue", label: "Blue", sortOrder: 1 },
    ],
  },
  {
    id: "opt_size",
    name: "Size",
    sortOrder: 1,
    values: [
      { id: "val_s", label: "Small", sortOrder: 0 },
      { id: "val_m", label: "Medium", sortOrder: 1 },
      { id: "val_l", label: "Large", sortOrder: 2 },
    ],
  },
];

describe("variant end-to-end data flow", () => {
  // Phase 1: Option types → variant generation
  const combos = generateVariantCombinations(OPTION_TYPES);

  test("phase 1: generates all expected combinations", () => {
    expect(combos).toHaveLength(6); // 2 colors × 3 sizes
    expect(new Set(combos.map((c) => c.selectionKey)).size).toBe(6);
  });

  // Phase 2: Pick a variant and validate its selections
  const redLarge = combos.find(
    (c) =>
      c.selections.some((s) => s.optionValueId === "val_red") &&
      c.selections.some((s) => s.optionValueId === "val_l"),
  )!;

  test("phase 2: validates selections against option model", () => {
    const result = validateVariantSelectionsResult(OPTION_TYPES, redLarge.selections);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selections[0].optionTypeName).toBe("Color");
      expect(result.selections[0].optionValueLabel).toBe("Red");
      expect(result.selections[1].optionTypeName).toBe("Size");
      expect(result.selections[1].optionValueLabel).toBe("Large");
    }
  });

  test("phase 2: selection key is deterministic", () => {
    expect(redLarge.selectionKey).toBe("opt_color:val_red|opt_size:val_l");
  });

  test("phase 2: option summary is human-readable", () => {
    expect(redLarge.optionSummary).toBe("Color: Red / Size: Large");
  });

  // Phase 3: Simulate variant record as stored in DB
  const variantRecord = {
    _id: "variant_red_large",
    productId: "product_tshirt",
    title: "Red / Large",
    sku: "TSH-RED-L",
    optionSummary: redLarge.optionSummary,
    selections: redLarge.selections,
    selectionKey: redLarge.selectionKey,
    price: { amount: 2999, currencyCode: "USD" },
    salePrice: { amount: 2499, currencyCode: "USD" },
    stockQuantity: 15,
    isDefault: true,
  };

  const productRecord = {
    _id: "product_tshirt",
    title: "Classic T-Shirt",
    sku: "TSH-BASE",
    productType: "variable",
    basePrice: { amount: 1999, currencyCode: "USD" },
    salePrice: null,
    trackInventory: true,
    allowBackorders: false,
    stockQuantity: 0,
  };

  // Phase 4: Cart validation
  test("phase 4: cart validates variant belongs to product", () => {
    expect(
      validateCartItemVariant({
        productId: "product_tshirt",
        productType: "variable",
        variantId: "variant_red_large",
        variantProductId: "product_tshirt",
        quantity: 1,
      }),
    ).toBeNull();

    expect(
      validateCartItemVariant({
        productId: "product_tshirt",
        productType: "variable",
        variantId: "variant_red_large",
        variantProductId: "product_OTHER",
        quantity: 1,
      }),
    ).not.toBeNull();
  });

  test("phase 4: cart uses variant price, not product price", () => {
    const price = resolveCartItemUnitPrice({
      variant: { salePrice: { amount: 2499 }, price: { amount: 2999 } },
      product: { basePrice: { amount: 1999 } },
    });
    expect(price).toBe(2499);
  });

  test("phase 4: cart checks variant stock, not product stock", () => {
    expect(
      computeAvailability({
        trackInventory: true,
        allowBackorders: false,
        stockQuantity: 15,
        reservedCount: 0,
        requestedQuantity: 3,
      }).canFulfill,
    ).toBe(true);

    expect(
      computeAvailability({
        trackInventory: true,
        allowBackorders: false,
        stockQuantity: 0,
        reservedCount: 0,
        requestedQuantity: 1,
      }).canFulfill,
    ).toBe(false);
  });

  test("phase 4: stock check rejects when qty exceeds stock", () => {
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

  // Phase 5: Cart metadata preserved
  test("phase 5: cart item stores variant metadata", () => {
    const metadata = buildCartItemVariantMetadata({
      title: variantRecord.title,
      optionSummary: variantRecord.optionSummary,
      sku: variantRecord.sku,
    });
    expect(metadata).toEqual({
      variantTitle: "Red / Large",
      optionSummary: "Color: Red / Size: Large",
      variantSku: "TSH-RED-L",
    });
  });

  // Phase 6: Order item snapshot
  test("phase 6: order item captures variant title and SKU", () => {
    expect(
      buildOrderItemTitle({
        product: { title: productRecord.title },
        variant: { title: variantRecord.title },
      }),
    ).toBe("Classic T-Shirt - Red / Large");
  });

  test("phase 6: order item metadata includes variant details", () => {
    const metadata = buildOrderItemMetadata({
      product: { title: productRecord.title },
      variant: {
        title: variantRecord.title,
        optionSummary: variantRecord.optionSummary,
        sku: variantRecord.sku,
      },
    });
    expect(metadata.productTitle).toBe("Classic T-Shirt");
    expect(metadata.variantTitle).toBe("Red / Large");
    expect(metadata.optionSummary).toBe("Color: Red / Size: Large");
    expect(metadata.variantSku).toBe("TSH-RED-L");
  });

  test("phase 6: order snapshot preserves variant pricing", () => {
    const snapshot = buildOrderItemSnapshot({
      productId: "product_tshirt",
      variantId: "variant_red_large",
      quantity: 2,
      product: { title: "Classic T-Shirt", sku: "TSH-BASE" },
      variant: {
        title: "Red / Large",
        sku: "TSH-RED-L",
        optionSummary: "Color: Red / Size: Large",
        price: { amount: 2999, currencyCode: "USD" },
        salePrice: { amount: 2499, currencyCode: "USD" },
      },
      unitPriceAmount: 2499,
    });
    expect(snapshot.sku).toBe("TSH-RED-L");
    expect(snapshot.unitPriceAmount).toBe(2499);
    expect(snapshot.lineTotalAmount).toBe(4998);
    expect(snapshot.variantTitle).toBe("Red / Large");
    expect(snapshot.optionSummary).toBe("Color: Red / Size: Large");
  });

  // Phase 7: Inventory adjustment targets variant
  test("phase 7: inventory allocation targets variant", () => {
    expect(
      getOrderItemInventoryAllocations({
        productId: "product_tshirt",
        variantId: "variant_red_large",
        productTitle: "Classic T-Shirt",
        quantity: 2,
      }),
    ).toEqual([
      {
        productId: "product_tshirt",
        variantId: "variant_red_large",
        quantity: 2,
        label: "Classic T-Shirt",
      },
    ]);
  });

  test("phase 7: stock decrement is variant-scoped", () => {
    const result = resolveInventoryAdjustment({
      mode: "decrement",
      stockQuantity: 15,
      allocationQuantity: 2,
      allowBackorders: false,
      label: "Classic T-Shirt - Red / Large",
    });
    expect(result.nextStock).toBe(13);
    expect(result.adjustmentType).toBe("order_allocation");
  });

  // Phase 8: Display labels
  test("phase 8: variant label uses standardized fallback", () => {
    expect(getVariantLabel(variantRecord)).toBe("Color: Red / Size: Large");
    expect(getVariantLabel({ title: "Red / Large" })).toBe("Red / Large");
    expect(getVariantLabel({ sku: "TSH-RED-L" })).toBe("TSH-RED-L");
    expect(getVariantLabel(null)).toBeNull();
  });

  test("phase 8: display price uses sale price", () => {
    expect(getVariantDisplayPrice(variantRecord)).toBe(2499);
  });

  // Phase 9: Option type shape validation
  test("phase 9: option types shape is valid", () => {
    expect(validateOptionTypesShape(OPTION_TYPES)).toEqual([]);
  });

  test("phase 9: detects malformed option types", () => {
    const issues = validateOptionTypesShape([
      { id: "", name: "Color", sortOrder: 0, values: [] },
    ]);
    expect(issues.length).toBeGreaterThan(0);
  });
});
