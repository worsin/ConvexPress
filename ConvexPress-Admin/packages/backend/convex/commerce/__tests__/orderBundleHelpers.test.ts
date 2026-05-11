import { describe, expect, test } from "bun:test";

import {
  buildOrderItemMetadata,
  buildOrderItemTitle,
  getOrderItemInventoryAllocations,
  resolveInventoryAdjustment,
} from "../orderBundleHelpers";
import { buildBundleLineMetadata } from "../../commerceBundles/runtime";

describe("commerce order bundle helpers", () => {
  test("preserves bundle metadata and enriches it with product and variant labels", () => {
    const bundleMetadata = buildBundleLineMetadata({
      bundle: {
        _id: "bundle_1",
        slug: "starter-kit",
        name: "Starter Kit",
        bundleType: "mix_and_match",
        pricingType: "component_sum",
      },
      owningProductId: "bundle_product",
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            componentLabel: "Core Item",
            productId: "product_a",
            productTitle: "Alpha",
            variantId: "variant_a",
            variantTitle: "Large",
            quantity: 2,
            unitPriceAmount: 1500,
            lineTotalAmount: 3000,
          },
        ],
        totalItems: 2,
        regularPriceAmount: 4000,
        componentSubtotalAmount: 3000,
        resolvedBundlePriceAmount: 3000,
      },
    });

    expect(
      buildOrderItemMetadata({
        metadata: bundleMetadata,
        product: { title: "Starter Bundle" },
        variant: { title: "Bundle Variant", optionSummary: "Blue / Large", sku: "BNDL-1" },
      }),
    ).toEqual({
      ...bundleMetadata,
      productTitle: "Starter Bundle",
      variantTitle: "Bundle Variant",
      optionSummary: "Blue / Large",
      variantSku: "BNDL-1",
    });
  });

  test("uses variant title in order line titles when present", () => {
    expect(
      buildOrderItemTitle({
        product: { title: "Starter Bundle" },
        variant: { title: "Blue / Large" },
      }),
    ).toBe("Starter Bundle - Blue / Large");

    expect(buildOrderItemTitle({ product: { title: "Starter Bundle" } })).toBe(
      "Starter Bundle",
    );
  });

  test("expands bundle order items into component inventory allocations", () => {
    const bundleMetadata = buildBundleLineMetadata({
      bundle: {
        _id: "bundle_1",
        slug: "starter-kit",
        name: "Starter Kit",
        bundleType: "mix_and_match",
        pricingType: "component_sum",
      },
      owningProductId: "bundle_product",
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            productId: "product_a",
            productTitle: "Alpha",
            variantId: "variant_a",
            variantTitle: "Large",
            quantity: 2,
            unitPriceAmount: 1500,
            lineTotalAmount: 3000,
          },
          {
            componentId: "component_b",
            productId: "product_b",
            productTitle: "Bravo",
            quantity: 1,
            unitPriceAmount: 500,
            lineTotalAmount: 500,
          },
        ],
        totalItems: 3,
        regularPriceAmount: 5000,
        componentSubtotalAmount: 3500,
        resolvedBundlePriceAmount: 3500,
      },
    });

    expect(
      getOrderItemInventoryAllocations({
        quantity: 2,
        metadata: bundleMetadata,
      }),
    ).toEqual([
      {
        productId: "product_a",
        variantId: "variant_a",
        quantity: 4,
        label: "Alpha",
      },
      {
        productId: "product_b",
        variantId: undefined,
        quantity: 2,
        label: "Bravo",
      },
    ]);
  });

  test("keeps normal products as a single inventory allocation", () => {
    expect(
      getOrderItemInventoryAllocations({
        productId: "product_simple",
        variantId: "variant_simple",
        productTitle: "Simple Product",
        quantity: 3,
      }),
    ).toEqual([
      {
        productId: "product_simple",
        variantId: "variant_simple",
        quantity: 3,
        label: "Simple Product",
      },
    ]);
  });

  test("computes decrement adjustments for tracked inventory", () => {
    expect(
      resolveInventoryAdjustment({
        mode: "decrement",
        stockQuantity: 10,
        allocationQuantity: 4,
        allowBackorders: false,
        label: "Alpha",
      }),
    ).toEqual({
      quantityDelta: -4,
      nextStock: 6,
      adjustmentType: "order_allocation",
    });
  });

  test("computes restore adjustments for released inventory", () => {
    expect(
      resolveInventoryAdjustment({
        mode: "restore",
        stockQuantity: 2,
        allocationQuantity: 3,
        allowBackorders: false,
        label: "Alpha",
      }),
    ).toEqual({
      quantityDelta: 3,
      nextStock: 5,
      adjustmentType: "order_release",
    });
  });

  test("rejects decrements that would drive stock below zero when backorders are off", () => {
    expect(() =>
      resolveInventoryAdjustment({
        mode: "decrement",
        stockQuantity: 1,
        allocationQuantity: 2,
        allowBackorders: false,
        label: "Alpha",
      }),
    ).toThrow("Insufficient inventory for Alpha.");
  });

  test("allows negative stock when backorders are enabled", () => {
    expect(
      resolveInventoryAdjustment({
        mode: "decrement",
        stockQuantity: 1,
        allocationQuantity: 2,
        allowBackorders: true,
        label: "Alpha",
      }),
    ).toEqual({
      quantityDelta: -2,
      nextStock: -1,
      adjustmentType: "order_allocation",
    });
  });
});

// ============================================================
// Bundle Variant → Order Helpers (Checklist Item 9)
// ============================================================

describe("bundle variant correctness in order helpers", () => {
  test("buildOrderItemMetadata preserves bundle component variant selections in order metadata", () => {
    const bundleMetadata = buildBundleLineMetadata({
      bundle: {
        _id: "bundle_1",
        slug: "variant-bundle",
        name: "Variant Bundle",
        bundleType: "fixed",
        pricingType: "component_sum",
      },
      owningProductId: "bundle_product",
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            componentLabel: "Main",
            productId: "product_a",
            productTitle: "Alpha",
            variantId: "variant_a_large",
            variantTitle: "Large / Blue",
            quantity: 2,
            unitPriceAmount: 2500,
            lineTotalAmount: 5000,
          },
          {
            componentId: "component_b",
            componentLabel: "Accessory",
            productId: "product_b",
            productTitle: "Bravo",
            // No variant — simple product
            quantity: 1,
            unitPriceAmount: 500,
            lineTotalAmount: 500,
          },
        ],
        totalItems: 3,
        regularPriceAmount: 5500,
        componentSubtotalAmount: 5500,
        resolvedBundlePriceAmount: 5500,
      },
    });

    const orderMetadata = buildOrderItemMetadata({
      metadata: bundleMetadata,
      product: { title: "Variant Bundle" },
    });

    // The full bundle metadata including selections with variant info is preserved
    expect(orderMetadata.lineType).toBe("bundle");
    expect(orderMetadata.selections).toHaveLength(2);
    expect(orderMetadata.selections[0].variantId).toBe("variant_a_large");
    expect(orderMetadata.selections[0].variantTitle).toBe("Large / Blue");
    expect(orderMetadata.selections[1].variantId).toBeUndefined();
  });

  test("inventory allocations target variant-level for bundle components with variants", () => {
    const bundleMetadata = buildBundleLineMetadata({
      bundle: {
        _id: "bundle_1",
        slug: "variant-bundle",
        name: "Variant Bundle",
        bundleType: "fixed",
        pricingType: "component_sum",
      },
      owningProductId: "bundle_product",
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            productId: "product_a",
            productTitle: "Alpha",
            variantId: "variant_a_large",
            variantTitle: "Large",
            quantity: 2,
            unitPriceAmount: 2500,
            lineTotalAmount: 5000,
          },
          {
            componentId: "component_b",
            productId: "product_b",
            productTitle: "Bravo",
            variantId: "variant_b_red",
            variantTitle: "Red",
            quantity: 1,
            unitPriceAmount: 1000,
            lineTotalAmount: 1000,
          },
        ],
        totalItems: 3,
        regularPriceAmount: 6000,
        componentSubtotalAmount: 6000,
        resolvedBundlePriceAmount: 6000,
      },
    });

    const allocations = getOrderItemInventoryAllocations({
      quantity: 3,
      metadata: bundleMetadata,
    });

    // Each allocation must include the variantId so stock is deducted from the correct variant
    expect(allocations).toEqual([
      {
        productId: "product_a",
        variantId: "variant_a_large",
        quantity: 6, // 2 * 3 bundles
        label: "Alpha",
      },
      {
        productId: "product_b",
        variantId: "variant_b_red",
        quantity: 3, // 1 * 3 bundles
        label: "Bravo",
      },
    ]);
  });

  test("inventory allocations without variants allocate against the product", () => {
    const bundleMetadata = buildBundleLineMetadata({
      bundle: {
        _id: "bundle_1",
        slug: "simple-bundle",
        name: "Simple Bundle",
        bundleType: "fixed",
        pricingType: "component_sum",
      },
      owningProductId: "bundle_product",
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            productId: "product_simple",
            productTitle: "Simple Product",
            // No variantId
            quantity: 4,
            unitPriceAmount: 1000,
            lineTotalAmount: 4000,
          },
        ],
        totalItems: 4,
        regularPriceAmount: 4000,
        componentSubtotalAmount: 4000,
        resolvedBundlePriceAmount: 4000,
      },
    });

    const allocations = getOrderItemInventoryAllocations({
      quantity: 2,
      metadata: bundleMetadata,
    });

    expect(allocations).toEqual([
      {
        productId: "product_simple",
        variantId: undefined,
        quantity: 8, // 4 * 2 bundles
        label: "Simple Product",
      },
    ]);
  });
});
