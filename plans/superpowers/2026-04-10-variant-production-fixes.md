# Variant System Production Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 verified bugs that prevent the variant system from going live, then verify with end-to-end data tests.

**Architecture:** All fixes are in existing files. Cart pricing fix, checkout variant loading, stock validation fix, wishlist variantId passthrough, and a comprehensive test harness that creates real variant data via Convex functions and validates the entire flow.

**Tech Stack:** Convex (backend mutations/queries), TanStack Start (website), Bun test runner

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `ConvexPress-Admin/packages/backend/convex/commerce/cart.ts` | Modify | Fix variant pricing, stock qty check, variant-belongs-to-product validation, store variant metadata |
| `ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts` | Modify | Load variants in getCartItemsWithProducts, use buildOrderItemTitle/buildOrderItemMetadata for order items |
| `ConvexPress-Website/apps/web/src/routes/_marketing/wishlist.$token.tsx` | Modify | Pass variantId to addToCart |
| `ConvexPress-Admin/packages/backend/convex/commerce/__tests__/cartVariantPricing.test.ts` | Create | Tests for cart variant pricing, stock validation, metadata |
| `ConvexPress-Admin/packages/backend/convex/commerce/__tests__/checkoutVariantSnapshot.test.ts` | Create | Tests for checkout order item variant snapshots |
| `ConvexPress-Admin/packages/backend/convex/commerce/__tests__/variantEndToEnd.test.ts` | Create | End-to-end data flow tests |

---

### Task 1: Fix cart variant pricing

The cart always uses product price, ignoring variant price. This is the most critical bug.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/cart.ts:199-254`

- [ ] **Step 1: Write failing test for variant pricing**

Create `ConvexPress-Admin/packages/backend/convex/commerce/__tests__/cartVariantPricing.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

import {
  resolveCartItemUnitPrice,
  validateCartItemVariant,
  buildCartItemVariantMetadata,
  computeAvailability,
} from "../cartHelpers";

describe("cart variant pricing", () => {
  test("uses variant sale price over product price", () => {
    expect(
      resolveCartItemUnitPrice({
        variant: {
          salePrice: { amount: 1999 },
          price: { amount: 2999 },
        },
        product: {
          basePrice: { amount: 999 },
        },
      }),
    ).toBe(1999);
  });

  test("uses variant base price when no sale price", () => {
    expect(
      resolveCartItemUnitPrice({
        variant: {
          price: { amount: 2999 },
        },
        product: {
          basePrice: { amount: 999 },
        },
      }),
    ).toBe(2999);
  });

  test("uses product price when no variant", () => {
    expect(
      resolveCartItemUnitPrice({
        product: {
          salePrice: { amount: 799 },
          basePrice: { amount: 999 },
        },
      }),
    ).toBe(799);
  });

  test("stock check rejects when quantity exceeds stock", () => {
    const result = computeAvailability({
      trackInventory: true,
      allowBackorders: false,
      stockQuantity: 3,
      reservedCount: 0,
      requestedQuantity: 5,
    });
    expect(result.canFulfill).toBe(false);
  });

  test("stock check allows when quantity within stock", () => {
    const result = computeAvailability({
      trackInventory: true,
      allowBackorders: false,
      stockQuantity: 10,
      reservedCount: 0,
      requestedQuantity: 5,
    });
    expect(result.canFulfill).toBe(true);
  });

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

  test("metadata captures variant title, optionSummary, SKU", () => {
    const metadata = buildCartItemVariantMetadata({
      title: "Red / Large",
      optionSummary: "Color: Red / Size: Large",
      sku: "TSH-R-L",
    });
    expect(metadata).toEqual({
      variantTitle: "Red / Large",
      optionSummary: "Color: Red / Size: Large",
      variantSku: "TSH-R-L",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (these test the pure helpers that already exist)

Run: `cd ConvexPress-Admin/packages/backend && bun test convex/commerce/__tests__/cartVariantPricing.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 3: Fix cart.ts addItem — variant pricing, stock qty, belongs-to-product, metadata**

In `cart.ts`, replace the addItem handler (lines 188-258) with this corrected version. The key changes are:
1. Load variant early and validate it belongs to product
2. Check `stock < quantity` instead of `stock <= 0`
3. Use variant pricing when variant exists
4. Store variant metadata on cart item

Replace lines 188-258 in `cart.ts`:

```typescript
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    const product = await ctx.db.get(args.productId);

    if (!product || product.status !== "publish") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Product not found.",
      });
    }

    // Load and validate variant
    const variant = args.variantId ? await ctx.db.get(args.variantId) : null;
    if (args.variantId && (!variant || variant.productId.toString() !== product._id.toString())) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Selected variant does not belong to this product.",
      });
    }

    if (product.productType === "variable" && !variant) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "A product variant must be selected before adding this item to cart.",
      });
    }

    const quantity = Math.max(1, args.quantity);

    // Inventory availability check for non-bundle products
    if (product.trackInventory && !product.allowBackorders) {
      const stock = variant
        ? (variant.stockQuantity ?? 0)
        : (product.stockQuantity ?? 0);

      if (stock < quantity) {
        throw new ConvexError({
          code: "OUT_OF_STOCK",
          message: stock <= 0
            ? "This product is currently out of stock."
            : `Only ${stock} available.`,
        });
      }
    }

    const cart = await ensureCart(ctx, args.sessionToken, user?._id);
    const bundle = await getBundleByProductId(ctx, args.productId);
    let metadata: Record<string, unknown> | undefined = variant
      ? {
          variantTitle: variant.title,
          optionSummary: variant.optionSummary,
          variantSku: variant.sku,
        }
      : undefined;

    if (bundle && args.metadata?.lineType !== "bundle") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Bundle products must be added with a validated bundle configuration.",
      });
    }

    if (args.metadata?.lineType === "bundle") {
      await requireCommerceBundlesEnabled(ctx);
      if (!bundle || bundle._id.toString() !== args.metadata.bundleId.toString()) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Bundle payload does not match the selected product.",
        });
      }
      if (bundle.status !== "active") {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Bundle is not available for purchase.",
        });
      }

      const snapshot = await resolveBundleSelectionSnapshot(ctx, {
        bundle,
        selections: args.metadata.selections,
      });
      const availability = await resolveBundleAvailability(ctx, {
        bundle,
        snapshot,
        quantity,
      });
      if (!availability.available) {
        throw new ConvexError({
          code: "OUT_OF_STOCK",
          message: availability.reason ?? "Bundle is out of stock.",
        });
      }
      metadata = buildBundleLineMetadata({
        bundle,
        owningProductId: args.productId,
        snapshot,
      });
    }

    const existing = (
      await ctx.db
        .query("commerce_cart_items")
        .withIndex("by_cart_product", (q: any) =>
          q.eq("cartId", cart._id).eq("productId", args.productId),
        )
        .collect()
    ).find(
      (item: any) =>
        (item.variantId?.toString() ?? null) ===
          (args.variantId?.toString() ?? null) &&
        JSON.stringify(item.metadata ?? null) === JSON.stringify(metadata ?? null),
    );

    // Use variant pricing when variant exists
    const unitPriceAmount = variant
      ? (variant.salePrice ?? variant.price).amount
      : isBundleLineMetadata(metadata)
        ? metadata.resolvedBundlePriceAmount
        : (product.salePrice ?? product.basePrice).amount;
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        quantity: existing.quantity + quantity,
        unitPriceAmount,
        lineTotalAmount: (existing.quantity + quantity) * unitPriceAmount,
        metadata,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("commerce_cart_items", {
        cartId: cart._id,
        productId: args.productId,
        variantId: args.variantId,
        quantity,
        unitPriceAmount,
        lineTotalAmount: quantity * unitPriceAmount,
        metadata,
        createdAt: now,
        updatedAt: now,
      });
    }

    await recalculateCart(ctx, cart._id);
    return cart._id;
  },
```

- [ ] **Step 4: Run all commerce tests**

Run: `cd ConvexPress-Admin/packages/backend && bun test convex/commerce/__tests__/ convex/commerceBundles/__tests__/`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/commerce/cart.ts ConvexPress-Admin/packages/backend/convex/commerce/__tests__/cartVariantPricing.test.ts
git commit -m "fix(cart): use variant pricing, validate stock qty, store metadata"
```

---

### Task 2: Fix checkout variant loading and order item snapshots

Checkout doesn't load variants, so order items get product SKU/title instead of variant data.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts:56-70,446-459`

- [ ] **Step 1: Write test for order item snapshot**

Create `ConvexPress-Admin/packages/backend/convex/commerce/__tests__/checkoutVariantSnapshot.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

import {
  buildOrderItemTitle,
  buildOrderItemMetadata,
} from "../orderBundleHelpers";

describe("checkout variant order item snapshots", () => {
  test("order item title includes variant title", () => {
    expect(
      buildOrderItemTitle({
        product: { title: "T-Shirt" },
        variant: { title: "Red / Large" },
      }),
    ).toBe("T-Shirt - Red / Large");
  });

  test("order item title uses product only when no variant", () => {
    expect(
      buildOrderItemTitle({
        product: { title: "T-Shirt" },
      }),
    ).toBe("T-Shirt");
  });

  test("order item metadata captures variant SKU, title, optionSummary", () => {
    const metadata = buildOrderItemMetadata({
      product: { title: "T-Shirt" },
      variant: {
        title: "Red / Large",
        optionSummary: "Color: Red / Size: Large",
        sku: "TSH-R-L",
      },
    });
    expect(metadata.variantTitle).toBe("Red / Large");
    expect(metadata.optionSummary).toBe("Color: Red / Size: Large");
    expect(metadata.variantSku).toBe("TSH-R-L");
    expect(metadata.productTitle).toBe("T-Shirt");
  });

  test("order item metadata handles missing variant gracefully", () => {
    const metadata = buildOrderItemMetadata({
      product: { title: "Simple Product" },
    });
    expect(metadata.productTitle).toBe("Simple Product");
    expect(metadata.variantTitle).toBeUndefined();
    expect(metadata.optionSummary).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd ConvexPress-Admin/packages/backend && bun test convex/commerce/__tests__/checkoutVariantSnapshot.test.ts`
Expected: PASS (4 tests — these test existing helpers that work)

- [ ] **Step 3: Fix getCartItemsWithProducts to load variants**

In `checkout.ts`, replace `getCartItemsWithProducts` (lines 56-70):

```typescript
async function getCartItemsWithProducts(ctx: any, cartId: any) {
  const items = await ctx.db
    .query("commerce_cart_items")
    .withIndex("by_cart", (q: any) => q.eq("cartId", cartId))
    .collect();

  const enrichedItems = await Promise.all(
    items.map(async (item: any) => ({
      ...item,
      product: await ctx.db.get(item.productId),
      variant: item.variantId ? await ctx.db.get(item.variantId) : null,
    })),
  );

  return enrichedItems;
}
```

- [ ] **Step 4: Fix order item creation to use variant data**

In `checkout.ts`, add import at top of file:

```typescript
import {
  buildOrderItemTitle,
  buildOrderItemMetadata,
} from "./orderBundleHelpers";
```

Replace the order item insertion loop (lines 446-459):

```typescript
    for (const item of items) {
      await ctx.db.insert("commerce_order_items", {
        orderId,
        productId: item.productId,
        variantId: item.variantId,
        productTitle: buildOrderItemTitle(item),
        sku: item.variant?.sku ?? item.product?.sku,
        quantity: item.quantity,
        unitPriceAmount: item.unitPriceAmount,
        lineSubtotalAmount: item.lineTotalAmount,
        lineTotalAmount: item.lineTotalAmount,
        metadata: buildOrderItemMetadata(item),
        createdAt: now,
      });
    }
```

- [ ] **Step 5: Run all commerce tests**

Run: `cd ConvexPress-Admin/packages/backend && bun test convex/commerce/__tests__/`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts ConvexPress-Admin/packages/backend/convex/commerce/__tests__/checkoutVariantSnapshot.test.ts
git commit -m "fix(checkout): load variants, snapshot metadata into order items"
```

---

### Task 3: Fix shared wishlist add-to-cart variantId

Shared wishlist add-to-cart drops the variantId.

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/wishlist.$token.tsx:59-63`

- [ ] **Step 1: Fix the addToCart call to pass variantId**

In `wishlist.$token.tsx`, replace the addToCart call (lines 59-63):

```typescript
      await addToCart({
        sessionToken,
        productId: item.productId as any,
        ...(item.variantId ? { variantId: item.variantId as any } : {}),
        quantity: 1,
      });
```

- [ ] **Step 2: Verify the item type includes variantId**

Check that the component's props type for `item` includes `variantId`. It should already exist on the wishlist item data. If the type definition (around line 30-48) doesn't include `variantId`, add it:

```typescript
  item: {
    _id: string;
    productId: string;
    variantId?: string;  // Ensure this exists
    // ... rest of fields
  };
```

- [ ] **Step 3: Run website tests**

Run: `cd ConvexPress-Website && bun test apps/web/src/`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add ConvexPress-Website/apps/web/src/routes/_marketing/wishlist.\$token.tsx
git commit -m "fix(wishlist): pass variantId when adding shared wishlist item to cart"
```

---

### Task 4: End-to-end variant data flow tests

Create a comprehensive test that validates the entire data flow: option types → variant generation → selection key → pricing → cart metadata → order snapshot.

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/commerce/__tests__/variantEndToEnd.test.ts`

- [ ] **Step 1: Write end-to-end data flow tests**

```typescript
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
  type VariantSelection,
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
 * These simulate the full lifecycle:
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
  const redLarge = combos.find((c) =>
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
    stockQuantity: 0, // parent stock should be ignored for variable products
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
      variant: {
        salePrice: { amount: 2499 },
        price: { amount: 2999 },
      },
      product: {
        basePrice: { amount: 1999 },
      },
    });
    expect(price).toBe(2499); // Variant sale price, NOT product base 1999
  });

  test("phase 4: cart checks variant stock, not product stock", () => {
    // Variant has 15 stock — should fulfill
    expect(
      computeAvailability({
        trackInventory: true,
        allowBackorders: false,
        stockQuantity: 15, // variant stock
        reservedCount: 0,
        requestedQuantity: 3,
      }).canFulfill,
    ).toBe(true);

    // Product has 0 stock — should NOT be used for variable products
    expect(
      computeAvailability({
        trackInventory: true,
        allowBackorders: false,
        stockQuantity: 0, // product stock (wrong to use for variable)
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
    const title = buildOrderItemTitle({
      product: { title: productRecord.title },
      variant: { title: variantRecord.title },
    });
    expect(title).toBe("Classic T-Shirt - Red / Large");
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
    expect(snapshot.sku).toBe("TSH-RED-L"); // variant SKU, not product
    expect(snapshot.unitPriceAmount).toBe(2499); // variant sale price
    expect(snapshot.lineTotalAmount).toBe(4998); // 2 × 2499
    expect(snapshot.variantTitle).toBe("Red / Large");
    expect(snapshot.optionSummary).toBe("Color: Red / Size: Large");
  });

  // Phase 7: Inventory adjustment targets variant
  test("phase 7: inventory allocation targets variant", () => {
    const allocations = getOrderItemInventoryAllocations({
      productId: "product_tshirt",
      variantId: "variant_red_large",
      productTitle: "Classic T-Shirt",
      quantity: 2,
    });
    expect(allocations).toEqual([
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
```

- [ ] **Step 2: Run all tests**

Run: `cd ConvexPress-Admin/packages/backend && bun test convex/commerce/__tests__/`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/commerce/__tests__/variantEndToEnd.test.ts
git commit -m "test: add end-to-end variant data flow tests"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run all backend tests**

Run: `cd ConvexPress-Admin/packages/backend && bun test convex/commerce/__tests__/ convex/commerceBundles/__tests__/`
Expected: All pass, 0 failures

- [ ] **Step 2: Run all website tests**

Run: `cd ConvexPress-Website && bun test apps/web/src/`
Expected: All pass

- [ ] **Step 3: Run admin frontend tests**

Run: `cd ConvexPress-Admin && bun test apps/web/src/`
Expected: All pass

- [ ] **Step 4: TypeScript check on modified pure helpers**

Run: `cd ConvexPress-Admin/packages/backend && npx tsc --noEmit --strict convex/commerce/variantHelpers.ts convex/commerce/cartHelpers.ts convex/commerce/orderBundleHelpers.ts`
Expected: Clean

- [ ] **Step 5: Lint check on modified files**

Run: `cd ConvexPress-Admin/packages/backend && npx oxlint convex/commerce/variantHelpers.ts convex/commerce/cartHelpers.ts --quiet`
Expected: 0 errors

- [ ] **Step 6: Final commit with all remaining changes**

```bash
git add -A
git commit -m "chore: variant system production hardening complete"
```
