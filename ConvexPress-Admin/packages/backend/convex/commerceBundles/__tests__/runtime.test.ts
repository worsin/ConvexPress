import { describe, expect, test } from "bun:test";

import {
  applyBundlePricing,
  buildBundleLineMetadata,
  expandBundleLineInventory,
  getBundlePurchaseDelta,
  getResolvedComponentUnitPrice,
  isBundleLineMetadata,
  resolveBundleAvailability,
  resolveBundlePricingPreview,
  resolveBundleSelectionSnapshot,
} from "../runtime";

describe("commerceBundles runtime helpers", () => {
  test("prefers component price override over the base unit price", () => {
    expect(
      getResolvedComponentUnitPrice({ priceOverride: 1250, discountPercent: 50 }, 2000),
    ).toBe(1250);
  });

  test("applies component discounts when no override is present", () => {
    expect(getResolvedComponentUnitPrice({ discountPercent: 25 }, 2000)).toBe(1500);
  });

  test("supports the bundle pricing modes used by cart and storefront", () => {
    expect(applyBundlePricing({ pricingType: "fixed", fixedPrice: 3500 }, 5000)).toBe(3500);
    expect(
      applyBundlePricing({ pricingType: "percent_off", discountPercent: 20 }, 5000),
    ).toBe(4000);
    expect(
      applyBundlePricing({ pricingType: "amount_off", discountAmount: 1200 }, 5000),
    ).toBe(3800);
    expect(applyBundlePricing({ pricingType: "component_sum" }, 5000)).toBe(5000);
  });

  test("builds bundle metadata that can be recognized and expanded for inventory", () => {
    const metadata = buildBundleLineMetadata({
      bundle: {
        _id: "bundle_1",
        slug: "starter-kit",
        name: "Starter Kit",
        bundleType: "mix_and_match",
        pricingType: "component_sum",
      },
      owningProductId: "product_bundle",
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

    expect(isBundleLineMetadata(metadata)).toBe(true);
    expect(expandBundleLineInventory(metadata, 3)).toEqual([
      {
        productId: "product_a",
        variantId: "variant_a",
        quantity: 6,
        label: "Alpha",
      },
    ]);
  });

  test("ignores non-bundle metadata in inventory expansion", () => {
    expect(isBundleLineMetadata({ lineType: "product" })).toBe(false);
    expect(expandBundleLineInventory(undefined, 2)).toEqual([]);
  });

  test("derives purchase count increments from bundle cart or order metadata", () => {
    const metadata = buildBundleLineMetadata({
      bundle: {
        _id: "bundle_1",
        slug: "starter-kit",
        name: "Starter Kit",
        bundleType: "fixed",
        pricingType: "fixed",
      },
      owningProductId: "product_bundle",
      snapshot: {
        selections: [],
        totalItems: 0,
        regularPriceAmount: 4000,
        componentSubtotalAmount: 4000,
        resolvedBundlePriceAmount: 3500,
      },
    });

    expect(getBundlePurchaseDelta(metadata, 3)).toEqual({
      bundleId: "bundle_1",
      quantity: 3,
    });
    expect(getBundlePurchaseDelta(metadata, 0)).toBeNull();
    expect(getBundlePurchaseDelta({ lineType: "product" }, 1)).toBeNull();
  });

  test("returns null pricing preview for configurable bundles with no required/default selections", async () => {
    const ctx = {
      db: {
        query(tableName: string) {
          expect(tableName).toBe("commerce_bundle_components");
          return {
            withIndex() {
              return {
                async collect() {
                  return [
                    {
                      _id: "component_optional",
                      bundleId: "bundle_1",
                      productId: "product_optional",
                      quantity: 1,
                      sortOrder: 0,
                      isRequired: false,
                      isDefault: false,
                    },
                  ];
                },
              };
            },
          };
        },
      },
    } as any;

    const preview = await resolveBundlePricingPreview(ctx, {
      bundle: {
        _id: "bundle_1",
        bundleType: "mix_and_match",
        pricingType: "component_sum",
      },
    });

    expect(preview).toBeNull();
  });

  test("reports unavailable components when bundle selections exceed stock", async () => {
    const rows = new Map<string, any>([
      [
        "product_a",
        {
          _id: "product_a",
          title: "Alpha",
          status: "publish",
          productType: "simple",
          trackInventory: true,
          stockQuantity: 1,
          allowBackorders: false,
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const availability = await resolveBundleAvailability(ctx, {
      bundle: {
        status: "active",
        allowPartialStock: false,
      },
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            componentLabel: "Core Item",
            productId: "product_a",
            productTitle: "Alpha",
            quantity: 2,
            unitPriceAmount: 1500,
            lineTotalAmount: 3000,
          },
        ],
        totalItems: 2,
        regularPriceAmount: 3000,
        componentSubtotalAmount: 3000,
        resolvedBundlePriceAmount: 3000,
      },
      quantity: 1,
    });

    expect(availability).toEqual({
      available: false,
      reason: "Out of stock: Alpha",
      unavailableComponents: ["Alpha"],
    });
  });

  test("reports unpublished component products as unavailable", async () => {
    const rows = new Map<string, any>([
      [
        "product_a",
        {
          _id: "product_a",
          title: "Alpha",
          status: "draft",
          productType: "simple",
          trackInventory: false,
          allowBackorders: false,
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const availability = await resolveBundleAvailability(ctx, {
      bundle: {
        status: "active",
        allowPartialStock: false,
      },
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            componentLabel: "Core Item",
            productId: "product_a",
            productTitle: "Alpha",
            quantity: 1,
            unitPriceAmount: 1500,
            lineTotalAmount: 1500,
          },
        ],
        totalItems: 1,
        regularPriceAmount: 1500,
        componentSubtotalAmount: 1500,
        resolvedBundlePriceAmount: 1500,
      },
      quantity: 1,
    });

    expect(availability).toEqual({
      available: false,
      reason: "Out of stock: Core Item",
      unavailableComponents: ["Core Item"],
    });
  });

  test("does not allow partial-stock bundles to bypass component inventory", async () => {
    const rows = new Map<string, any>([
      [
        "product_a",
        {
          _id: "product_a",
          title: "Alpha",
          status: "publish",
          productType: "simple",
          trackInventory: true,
          stockQuantity: 0,
          allowBackorders: false,
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const availability = await resolveBundleAvailability(ctx, {
      bundle: {
        status: "active",
        allowPartialStock: true,
      },
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            productId: "product_a",
            productTitle: "Alpha",
            quantity: 1,
            unitPriceAmount: 1500,
            lineTotalAmount: 1500,
          },
        ],
      },
      quantity: 1,
    });

    expect(availability).toEqual({
      available: false,
      reason: "Out of stock: Alpha",
      unavailableComponents: ["Alpha"],
    });
  });
});

// ============================================================
// Bundle Variant Hardening Tests (Checklist Item 9)
// ============================================================

describe("bundle variant correctness", () => {
  // --- Wrong-product variants ---

  test("rejects variant belonging to a different product in resolveBundleSelectionSnapshot", async () => {
    const rows = new Map<string, any>([
      [
        "product_a",
        {
          _id: "product_a",
          title: "Alpha",
          status: "publish",
          productType: "variable",
          basePrice: { amount: 2000, currencyCode: "USD" },
          trackInventory: false,
        },
      ],
      [
        "variant_from_product_b",
        {
          _id: "variant_from_product_b",
          productId: "product_b",
          title: "Wrong Variant",
          price: { amount: 1500, currencyCode: "USD" },
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const components = [
      {
        _id: "component_a",
        bundleId: "bundle_1",
        productId: "product_a",
        variantId: "variant_from_product_b",
        quantity: 1,
        sortOrder: 0,
        isRequired: true,
        allowVariantChange: true,
      },
    ];

    await expect(
      resolveBundleSelectionSnapshot(ctx, {
        bundle: {
          _id: "bundle_1",
          bundleType: "fixed",
          pricingType: "component_sum",
        },
        components,
      }),
    ).rejects.toThrow("Selected variant does not belong to the bundle component product.");
  });

  test("rejects wrong-product variant supplied via selection input", async () => {
    const rows = new Map<string, any>([
      [
        "product_a",
        {
          _id: "product_a",
          title: "Alpha",
          status: "publish",
          productType: "variable",
          basePrice: { amount: 2000, currencyCode: "USD" },
          trackInventory: false,
        },
      ],
      [
        "variant_from_product_b",
        {
          _id: "variant_from_product_b",
          productId: "product_b",
          title: "Wrong Variant",
          price: { amount: 1500, currencyCode: "USD" },
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const components = [
      {
        _id: "component_a",
        bundleId: "bundle_1",
        productId: "product_a",
        quantity: 1,
        sortOrder: 0,
        isRequired: true,
        allowVariantChange: true,
      },
    ];

    await expect(
      resolveBundleSelectionSnapshot(ctx, {
        bundle: {
          _id: "bundle_1",
          bundleType: "mix_and_match",
          pricingType: "component_sum",
        },
        components,
        selections: [
          {
            componentId: "component_a",
            variantId: "variant_from_product_b",
            quantity: 1,
          },
        ],
      }),
    ).rejects.toThrow("Selected variant does not belong to the bundle component product.");
  });

  // --- Missing variants for variable products ---

  test("marks variable product component without variant as unavailable in availability check", async () => {
    const rows = new Map<string, any>([
      [
        "product_variable",
        {
          _id: "product_variable",
          title: "Variable Product",
          status: "publish",
          productType: "variable",
          trackInventory: true,
          stockQuantity: 100,
          allowBackorders: false,
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const availability = await resolveBundleAvailability(ctx, {
      bundle: {
        status: "active",
      },
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            productId: "product_variable",
            productTitle: "Variable Product",
            // No variantId — missing variant
            quantity: 1,
            unitPriceAmount: 2000,
            lineTotalAmount: 2000,
          },
        ],
      },
      quantity: 1,
    });

    expect(availability.available).toBe(false);
    expect(availability.unavailableComponents).toContain("Variable Product");
  });

  // --- Variant pricing flows through bundle pricing ---

  test("uses variant price instead of product base price when variant is present", async () => {
    const rows = new Map<string, any>([
      [
        "product_a",
        {
          _id: "product_a",
          title: "Alpha",
          status: "publish",
          productType: "variable",
          basePrice: { amount: 2000, currencyCode: "USD" },
          trackInventory: false,
        },
      ],
      [
        "variant_a",
        {
          _id: "variant_a",
          productId: "product_a",
          title: "Large",
          price: { amount: 2500, currencyCode: "USD" },
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const components = [
      {
        _id: "component_a",
        bundleId: "bundle_1",
        productId: "product_a",
        variantId: "variant_a",
        quantity: 2,
        sortOrder: 0,
        isRequired: true,
      },
    ];

    const snapshot = await resolveBundleSelectionSnapshot(ctx, {
      bundle: {
        _id: "bundle_1",
        bundleType: "fixed",
        pricingType: "component_sum",
      },
      components,
    });

    // Should use variant price (2500) not product base price (2000)
    expect(snapshot.selections[0]!.unitPriceAmount).toBe(2500);
    expect(snapshot.selections[0]!.lineTotalAmount).toBe(5000);
    expect(snapshot.regularPriceAmount).toBe(5000);
    expect(snapshot.resolvedBundlePriceAmount).toBe(5000);
  });

  test("uses variant sale price when available", async () => {
    const rows = new Map<string, any>([
      [
        "product_a",
        {
          _id: "product_a",
          title: "Alpha",
          status: "publish",
          productType: "variable",
          basePrice: { amount: 3000, currencyCode: "USD" },
          trackInventory: false,
        },
      ],
      [
        "variant_a",
        {
          _id: "variant_a",
          productId: "product_a",
          title: "Large",
          price: { amount: 2500, currencyCode: "USD" },
          salePrice: { amount: 2000, currencyCode: "USD" },
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const components = [
      {
        _id: "component_a",
        bundleId: "bundle_1",
        productId: "product_a",
        variantId: "variant_a",
        quantity: 1,
        sortOrder: 0,
        isRequired: true,
      },
    ];

    const snapshot = await resolveBundleSelectionSnapshot(ctx, {
      bundle: {
        _id: "bundle_1",
        bundleType: "fixed",
        pricingType: "component_sum",
      },
      components,
    });

    // salePrice (2000) takes precedence over variant price (2500)
    expect(snapshot.selections[0]!.unitPriceAmount).toBe(2000);
  });

  test("applies component price override on top of variant base price", async () => {
    const rows = new Map<string, any>([
      [
        "product_a",
        {
          _id: "product_a",
          title: "Alpha",
          status: "publish",
          productType: "variable",
          basePrice: { amount: 3000, currencyCode: "USD" },
          trackInventory: false,
        },
      ],
      [
        "variant_a",
        {
          _id: "variant_a",
          productId: "product_a",
          title: "Large",
          price: { amount: 2500, currencyCode: "USD" },
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const components = [
      {
        _id: "component_a",
        bundleId: "bundle_1",
        productId: "product_a",
        variantId: "variant_a",
        quantity: 1,
        sortOrder: 0,
        isRequired: true,
        priceOverride: 1800,
      },
    ];

    const snapshot = await resolveBundleSelectionSnapshot(ctx, {
      bundle: {
        _id: "bundle_1",
        bundleType: "fixed",
        pricingType: "component_sum",
      },
      components,
    });

    // priceOverride (1800) supersedes variant price (2500)
    expect(snapshot.selections[0]!.unitPriceAmount).toBe(1800);
    // regularPriceAmount still reflects base variant price
    expect(snapshot.regularPriceAmount).toBe(2500);
  });

  test("applies component discount percent on variant price", async () => {
    const rows = new Map<string, any>([
      [
        "product_a",
        {
          _id: "product_a",
          title: "Alpha",
          status: "publish",
          productType: "variable",
          basePrice: { amount: 3000, currencyCode: "USD" },
          trackInventory: false,
        },
      ],
      [
        "variant_a",
        {
          _id: "variant_a",
          productId: "product_a",
          title: "Large",
          price: { amount: 2000, currencyCode: "USD" },
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const components = [
      {
        _id: "component_a",
        bundleId: "bundle_1",
        productId: "product_a",
        variantId: "variant_a",
        quantity: 1,
        sortOrder: 0,
        isRequired: true,
        discountPercent: 25,
      },
    ];

    const snapshot = await resolveBundleSelectionSnapshot(ctx, {
      bundle: {
        _id: "bundle_1",
        bundleType: "fixed",
        pricingType: "component_sum",
      },
      components,
    });

    // 25% off variant price 2000 = 1500
    expect(snapshot.selections[0]!.unitPriceAmount).toBe(1500);
    // Regular price is the un-discounted variant price
    expect(snapshot.regularPriceAmount).toBe(2000);
  });

  test("variant pricing flows through bundle-level fixed pricing", async () => {
    const rows = new Map<string, any>([
      [
        "product_a",
        {
          _id: "product_a",
          title: "Alpha",
          status: "publish",
          productType: "variable",
          basePrice: { amount: 3000, currencyCode: "USD" },
          trackInventory: false,
        },
      ],
      [
        "variant_a",
        {
          _id: "variant_a",
          productId: "product_a",
          title: "Large",
          price: { amount: 2500, currencyCode: "USD" },
        },
      ],
      [
        "product_b",
        {
          _id: "product_b",
          title: "Bravo",
          status: "publish",
          productType: "simple",
          basePrice: { amount: 1500, currencyCode: "USD" },
          trackInventory: false,
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const components = [
      {
        _id: "component_a",
        bundleId: "bundle_1",
        productId: "product_a",
        variantId: "variant_a",
        quantity: 1,
        sortOrder: 0,
        isRequired: true,
      },
      {
        _id: "component_b",
        bundleId: "bundle_1",
        productId: "product_b",
        quantity: 1,
        sortOrder: 1,
        isRequired: true,
      },
    ];

    const snapshot = await resolveBundleSelectionSnapshot(ctx, {
      bundle: {
        _id: "bundle_1",
        bundleType: "fixed",
        pricingType: "fixed",
        fixedPrice: 3000,
      },
      components,
    });

    // Component subtotal = 2500 + 1500 = 4000
    expect(snapshot.regularPriceAmount).toBe(4000);
    // Fixed bundle price overrides the component sum
    expect(snapshot.resolvedBundlePriceAmount).toBe(3000);
  });

  // --- Component stock handling against variants ---

  test("checks variant stock instead of product stock for variable products in availability", async () => {
    const rows = new Map<string, any>([
      [
        "product_variable",
        {
          _id: "product_variable",
          title: "Variable Product",
          status: "publish",
          productType: "variable",
          trackInventory: true,
          stockQuantity: 100, // product-level stock is high
          allowBackorders: false,
        },
      ],
      [
        "variant_low_stock",
        {
          _id: "variant_low_stock",
          productId: "product_variable",
          title: "Small",
          price: { amount: 1000, currencyCode: "USD" },
          stockQuantity: 1, // variant stock is low
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const availability = await resolveBundleAvailability(ctx, {
      bundle: {
        status: "active",
      },
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            productId: "product_variable",
            productTitle: "Variable Product",
            variantId: "variant_low_stock",
            variantTitle: "Small",
            quantity: 3,
            unitPriceAmount: 1000,
            lineTotalAmount: 3000,
          },
        ],
      },
      quantity: 1,
    });

    // Should be unavailable because variant stock (1) < required (3)
    expect(availability.available).toBe(false);
    expect(availability.unavailableComponents).toContain("Variable Product - Small");
  });

  test("passes variant stock check when variant has sufficient inventory", async () => {
    const rows = new Map<string, any>([
      [
        "product_variable",
        {
          _id: "product_variable",
          title: "Variable Product",
          status: "publish",
          productType: "variable",
          trackInventory: true,
          stockQuantity: 0, // product-level stock is zero
          allowBackorders: false,
        },
      ],
      [
        "variant_in_stock",
        {
          _id: "variant_in_stock",
          productId: "product_variable",
          title: "Large",
          price: { amount: 2000, currencyCode: "USD" },
          stockQuantity: 10, // but variant stock is sufficient
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const availability = await resolveBundleAvailability(ctx, {
      bundle: {
        status: "active",
      },
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            productId: "product_variable",
            productTitle: "Variable Product",
            variantId: "variant_in_stock",
            variantTitle: "Large",
            quantity: 2,
            unitPriceAmount: 2000,
            lineTotalAmount: 4000,
          },
        ],
      },
      quantity: 1,
    });

    // Variant stock (10) >= required (2), so available
    expect(availability.available).toBe(true);
  });

  test("multiplies variant stock requirement by bundle line quantity", async () => {
    const rows = new Map<string, any>([
      [
        "product_variable",
        {
          _id: "product_variable",
          title: "Variable Product",
          status: "publish",
          productType: "variable",
          trackInventory: true,
          stockQuantity: 100,
          allowBackorders: false,
        },
      ],
      [
        "variant_limited",
        {
          _id: "variant_limited",
          productId: "product_variable",
          title: "Medium",
          price: { amount: 1500, currencyCode: "USD" },
          stockQuantity: 5,
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    // Component needs 2 per bundle, but ordering 3 bundles -> 6 needed
    const availability = await resolveBundleAvailability(ctx, {
      bundle: {
        status: "active",
      },
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            productId: "product_variable",
            productTitle: "Variable Product",
            variantId: "variant_limited",
            variantTitle: "Medium",
            quantity: 2,
            unitPriceAmount: 1500,
            lineTotalAmount: 3000,
          },
        ],
      },
      quantity: 3, // 3 bundles * 2 per component = 6 required, but only 5 in stock
    });

    expect(availability.available).toBe(false);
    expect(availability.unavailableComponents).toContain("Variable Product - Medium");
  });

  test("marks variant with wrong productId as unavailable in availability check", async () => {
    const rows = new Map<string, any>([
      [
        "product_variable",
        {
          _id: "product_variable",
          title: "Variable Product",
          status: "publish",
          productType: "variable",
          trackInventory: true,
          stockQuantity: 100,
          allowBackorders: false,
        },
      ],
      [
        "variant_wrong_product",
        {
          _id: "variant_wrong_product",
          productId: "product_other", // belongs to a different product
          title: "Mismatched",
          price: { amount: 1000, currencyCode: "USD" },
          stockQuantity: 100,
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const availability = await resolveBundleAvailability(ctx, {
      bundle: {
        status: "active",
      },
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            productId: "product_variable",
            productTitle: "Variable Product",
            variantId: "variant_wrong_product",
            variantTitle: "Mismatched",
            quantity: 1,
            unitPriceAmount: 1000,
            lineTotalAmount: 1000,
          },
        ],
      },
      quantity: 1,
    });

    expect(availability.available).toBe(false);
    expect(availability.unavailableComponents).toContain("Variable Product - Mismatched");
  });

  // --- Bundle metadata snapshots variant info ---

  test("buildBundleLineMetadata preserves variant info from snapshot selections", () => {
    const metadata = buildBundleLineMetadata({
      bundle: {
        _id: "bundle_1",
        slug: "variant-bundle",
        name: "Variant Bundle",
        bundleType: "fixed",
        pricingType: "component_sum",
      },
      owningProductId: "product_bundle",
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            componentLabel: "Main Product",
            productId: "product_a",
            productTitle: "Alpha",
            variantId: "variant_a_large",
            variantTitle: "Large / Blue",
            quantity: 1,
            unitPriceAmount: 2500,
            lineTotalAmount: 2500,
          },
          {
            componentId: "component_b",
            componentLabel: "Accessory",
            productId: "product_b",
            productTitle: "Bravo",
            // No variant — simple product
            quantity: 2,
            unitPriceAmount: 500,
            lineTotalAmount: 1000,
          },
        ],
        totalItems: 3,
        regularPriceAmount: 3500,
        componentSubtotalAmount: 3500,
        resolvedBundlePriceAmount: 3500,
      },
    });

    expect(isBundleLineMetadata(metadata)).toBe(true);
    // Variant selection is preserved in metadata
    expect(metadata.selections[0]!.variantId).toBe("variant_a_large");
    expect(metadata.selections[0]!.variantTitle).toBe("Large / Blue");
    // Simple product has no variant
    expect(metadata.selections[1]!.variantId).toBeUndefined();
    expect(metadata.selections[1]!.variantTitle).toBeUndefined();
  });

  test("expandBundleLineInventory allocates against component variants", () => {
    const metadata = buildBundleLineMetadata({
      bundle: {
        _id: "bundle_1",
        slug: "multi-variant-bundle",
        name: "Multi Variant Bundle",
        bundleType: "fixed",
        pricingType: "component_sum",
      },
      owningProductId: "product_bundle",
      snapshot: {
        selections: [
          {
            componentId: "component_a",
            productId: "product_a",
            productTitle: "Alpha",
            variantId: "variant_a_large",
            variantTitle: "Large",
            quantity: 2,
            unitPriceAmount: 2000,
            lineTotalAmount: 4000,
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
          {
            componentId: "component_c",
            productId: "product_c",
            productTitle: "Charlie",
            // simple product, no variant
            quantity: 3,
            unitPriceAmount: 500,
            lineTotalAmount: 1500,
          },
        ],
        totalItems: 6,
        regularPriceAmount: 6500,
        componentSubtotalAmount: 6500,
        resolvedBundlePriceAmount: 6500,
      },
    });

    // Buying 2 bundles, so component quantities multiply by 2
    const allocations = expandBundleLineInventory(metadata, 2);

    expect(allocations).toEqual([
      {
        productId: "product_a",
        variantId: "variant_a_large",
        quantity: 4, // 2 * 2
        label: "Alpha",
      },
      {
        productId: "product_b",
        variantId: "variant_b_red",
        quantity: 2, // 1 * 2
        label: "Bravo",
      },
      {
        productId: "product_c",
        variantId: undefined,
        quantity: 6, // 3 * 2
        label: "Charlie",
      },
    ]);
  });

  // --- Snapshot: variant selection stored in bundle metadata for checkout ---

  test("full end-to-end: variant selection snapshot flows through metadata and inventory", async () => {
    const rows = new Map<string, any>([
      [
        "product_a",
        {
          _id: "product_a",
          title: "Alpha",
          status: "publish",
          productType: "variable",
          basePrice: { amount: 3000, currencyCode: "USD" },
          trackInventory: false,
        },
      ],
      [
        "variant_a",
        {
          _id: "variant_a",
          productId: "product_a",
          title: "Large / Blue",
          price: { amount: 2500, currencyCode: "USD" },
        },
      ],
      [
        "product_b",
        {
          _id: "product_b",
          title: "Bravo",
          status: "publish",
          productType: "simple",
          basePrice: { amount: 1500, currencyCode: "USD" },
          trackInventory: false,
        },
      ],
    ]);

    const ctx = {
      db: {
        async get(id: string) {
          return rows.get(id) ?? null;
        },
      },
    } as any;

    const components = [
      {
        _id: "component_a",
        bundleId: "bundle_1",
        productId: "product_a",
        variantId: "variant_a",
        quantity: 1,
        sortOrder: 0,
        isRequired: true,
      },
      {
        _id: "component_b",
        bundleId: "bundle_1",
        productId: "product_b",
        quantity: 2,
        sortOrder: 1,
        isRequired: true,
      },
    ];

    const bundle = {
      _id: "bundle_1",
      slug: "e2e-bundle",
      name: "E2E Bundle",
      bundleType: "fixed" as const,
      pricingType: "percent_off" as const,
      discountPercent: 10,
    };

    // Step 1: Resolve snapshot
    const snapshot = await resolveBundleSelectionSnapshot(ctx, {
      bundle,
      components,
    });

    expect(snapshot.selections[0]!.variantId).toBe("variant_a");
    expect(snapshot.selections[0]!.variantTitle).toBe("Large / Blue");
    expect(snapshot.selections[0]!.unitPriceAmount).toBe(2500);

    // Step 2: Build metadata (as cart would)
    const metadata = buildBundleLineMetadata({
      bundle,
      owningProductId: "product_bundle",
      snapshot,
    });

    expect(isBundleLineMetadata(metadata)).toBe(true);
    expect(metadata.selections[0]!.variantId).toBe("variant_a");

    // Step 3: Expand inventory (as order fulfillment would)
    const allocations = expandBundleLineInventory(metadata, 1);
    expect(allocations[0]).toEqual({
      productId: "product_a",
      variantId: "variant_a",
      quantity: 1,
      label: "Alpha",
    });
    expect(allocations[1]).toEqual({
      productId: "product_b",
      variantId: undefined,
      quantity: 2,
      label: "Bravo",
    });

    // Step 4: Pricing reflects 10% off
    // Regular = 2500 + 3000 = 5500, 10% off = 4950
    expect(snapshot.regularPriceAmount).toBe(5500);
    expect(snapshot.resolvedBundlePriceAmount).toBe(4950);
  });
});
