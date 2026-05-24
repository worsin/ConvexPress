# WooCommerce Variant Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ConvexPress variant system fully compatible with WooCommerce variable products so that syncing from WooCommerce stores preserves every variation field without data loss.

**Architecture:** Three layers of changes: (1) widen the variant schema to hold every WooCommerce field, (2) expand the WooClient type and sync code to pull and store those fields, (3) restore selection/key support in admin mutations so admin-created variants are consistent with synced ones. The sync already works for the core fields — we're widening the pipe.

**Tech Stack:** Convex schema, TypeScript, Bun test runner

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts` | Modify | Add WooCommerce-parity fields to commerce_product_variants |
| `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/wooClient.ts` | Modify | Expand WooProductVariation interface with all WooCommerce fields |
| `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/commerceCatalog.ts` | Modify | Map new WooCommerce fields into upsertVariant calls |
| `ConvexPress-Admin/packages/backend/convex/commerce/products.ts` | Modify | Restore selections/selectionKey/featuredMediaId + add new fields to createVariant and updateVariant |
| `ConvexPress-Admin/packages/backend/convex/commerce/variantHelpers.ts` | Modify | Add WooCommerce field mapping helpers |
| `ConvexPress-Admin/packages/backend/convex/commerce/__tests__/wooVariantParity.test.ts` | Create | Tests for field mapping, sync completeness |

---

### Task 1: Expand variant schema with WooCommerce-parity fields

Every field WooCommerce stores per variation must have a home in our schema.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts`

- [ ] **Step 1: Add all WooCommerce-parity fields to commerce_product_variants**

In `schema/commerce.ts`, replace the `commerce_product_variants` table definition (lines 129-157) with:

```typescript
  commerce_product_variants: defineTable({
    productId: v.id("commerce_products"),
    title: v.string(),
    sku: v.optional(v.string()),
    globalUniqueId: v.optional(v.string()),
    optionSummary: v.string(),
    selections: v.optional(
      v.array(
        v.object({
          optionTypeId: v.string(),
          optionTypeName: v.string(),
          optionValueId: v.string(),
          optionValueLabel: v.string(),
          sortOrder: v.number(),
        }),
      ),
    ),
    selectionKey: v.optional(v.string()),
    description: v.optional(v.string()),
    price: commerceMoneyValidator,
    salePrice: v.optional(commerceMoneyValidator),
    salePriceFrom: v.optional(v.number()),
    salePriceTo: v.optional(v.number()),
    manageStock: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("parent"))),
    stockQuantity: v.optional(v.number()),
    stockStatus: v.optional(v.union(v.literal("instock"), v.literal("outofstock"), v.literal("onbackorder"))),
    backorders: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("notify"))),
    lowStockAmount: v.optional(v.number()),
    weight: v.optional(v.string()),
    shippingLengthIn: v.optional(v.string()),
    shippingWidthIn: v.optional(v.string()),
    shippingHeightIn: v.optional(v.string()),
    shippingClassId: v.optional(v.string()),
    isVirtual: v.optional(v.boolean()),
    isDownloadable: v.optional(v.boolean()),
    downloadLimit: v.optional(v.number()),
    downloadExpiry: v.optional(v.number()),
    taxClass: v.optional(v.string()),
    featuredMediaId: v.optional(v.id("media")),
    galleryMediaIds: v.optional(v.array(v.id("media"))),
    status: v.optional(v.union(v.literal("publish"), v.literal("private"), v.literal("draft"))),
    menuOrder: v.optional(v.number()),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_product_default", ["productId", "isDefault"])
    .index("by_product_selection_key", ["productId", "selectionKey"])
    .index("by_sku", ["sku"]),
```

- [ ] **Step 2: Run tests to verify schema change doesn't break anything**

Run: `cd ConvexPress-Admin/packages/backend && bun test convex/commerce/__tests__/ convex/commerceBundles/__tests__/`
Expected: All pass (schema changes are additive — all new fields are optional)

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/schema/commerce.ts
git commit -m "feat(schema): add WooCommerce-parity fields to commerce_product_variants"
```

---

### Task 2: Expand WooProductVariation type with all WooCommerce fields

The WooClient TypeScript interface only declares 11 of 25+ fields that WooCommerce returns per variation. The sync code can't access fields that aren't in the type.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/wooClient.ts`

- [ ] **Step 1: Replace the WooProductVariation interface**

In `wooClient.ts`, find the `WooProductVariation` interface (lines 88-102) and replace it:

```typescript
export interface WooProductVariation {
  id: number;
  sku?: string;
  global_unique_id?: string;
  description?: string;
  image?: WooProductImage | null;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  date_on_sale_from?: string | null;
  date_on_sale_to?: string | null;
  on_sale?: boolean;
  manage_stock?: boolean | "parent";
  stock_quantity?: number | null;
  stock_status?: "instock" | "outofstock" | "onbackorder";
  backorders?: "no" | "notify" | "yes";
  backorders_allowed?: boolean;
  low_stock_amount?: number | null;
  weight?: string;
  dimensions?: { length?: string; width?: string; height?: string };
  shipping_class?: string;
  shipping_class_id?: number;
  virtual?: boolean;
  downloadable?: boolean;
  downloads?: Array<{ id: string; name: string; file: string }>;
  download_limit?: number;
  download_expiry?: number;
  tax_class?: string;
  tax_status?: string;
  status?: string;
  menu_order?: number;
  date_created?: string;
  date_modified?: string;
  attributes?: WooProductAttribute[];
}
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/wooClient.ts
git commit -m "feat(wooClient): expand WooProductVariation with all WooCommerce variation fields"
```

---

### Task 3: Add variant field mapping helpers

Pure helpers that convert WooCommerce variation fields to ConvexPress format. Testable without Convex runtime.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/variantHelpers.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/commerce/__tests__/wooVariantParity.test.ts`

- [ ] **Step 1: Write tests for WooCommerce field mapping**

Create `convex/commerce/__tests__/wooVariantParity.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

import {
  mapWooManageStock,
  mapWooSaleDates,
  mapWooDimensions,
  mapWooBackorders,
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
      const result = mapWooDimensions({ length: "10", width: "8", height: "2" });
      expect(result).toEqual({
        shippingLengthIn: "10",
        shippingWidthIn: "8",
        shippingHeightIn: "2",
      });
    });
    test("handles empty/undefined dimensions", () => {
      const result = mapWooDimensions(undefined);
      expect(result).toEqual({
        shippingLengthIn: undefined,
        shippingWidthIn: undefined,
        shippingHeightIn: undefined,
      });
    });
    test("handles partial dimensions", () => {
      const result = mapWooDimensions({ length: "10" });
      expect(result).toEqual({
        shippingLengthIn: "10",
        shippingWidthIn: undefined,
        shippingHeightIn: undefined,
      });
    });
  });

  describe("mapWooBackorders", () => {
    test("maps 'no' to 'no'", () => {
      expect(mapWooBackorders("no")).toBe("no");
    });
    test("maps 'yes' to 'yes'", () => {
      expect(mapWooBackorders("yes")).toBe("yes");
    });
    test("maps 'notify' to 'notify'", () => {
      expect(mapWooBackorders("notify")).toBe("notify");
    });
    test("maps undefined to undefined", () => {
      expect(mapWooBackorders(undefined)).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ConvexPress-Admin/packages/backend && bun test convex/commerce/__tests__/wooVariantParity.test.ts`
Expected: FAIL (functions don't exist yet)

- [ ] **Step 3: Add mapping helpers to variantHelpers.ts**

Add these exports to the bottom of `convex/commerce/variantHelpers.ts`:

```typescript
// ────────────────────────────────────────────────────────────────────
// WooCommerce field mapping helpers
// ────────────────────────────────────────────────────────────────────

export function mapWooManageStock(
  value: boolean | "parent" | undefined,
): "yes" | "no" | "parent" | undefined {
  if (value === undefined) return undefined;
  if (value === "parent") return "parent";
  return value ? "yes" : "no";
}

export function mapWooSaleDates(
  from: string | null | undefined,
  to: string | null | undefined,
): { salePriceFrom: number | undefined; salePriceTo: number | undefined } {
  return {
    salePriceFrom: from ? new Date(from).getTime() : undefined,
    salePriceTo: to ? new Date(to).getTime() : undefined,
  };
}

export function mapWooDimensions(
  dimensions: { length?: string; width?: string; height?: string } | undefined,
): {
  shippingLengthIn: string | undefined;
  shippingWidthIn: string | undefined;
  shippingHeightIn: string | undefined;
} {
  return {
    shippingLengthIn: dimensions?.length || undefined,
    shippingWidthIn: dimensions?.width || undefined,
    shippingHeightIn: dimensions?.height || undefined,
  };
}

export function mapWooBackorders(
  value: "no" | "notify" | "yes" | undefined,
): "no" | "notify" | "yes" | undefined {
  if (value === "no" || value === "yes" || value === "notify") return value;
  return undefined;
}
```

- [ ] **Step 4: Run tests**

Run: `cd ConvexPress-Admin/packages/backend && bun test convex/commerce/__tests__/wooVariantParity.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Run all commerce tests**

Run: `bun test convex/commerce/__tests__/ convex/commerceBundles/__tests__/`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/commerce/variantHelpers.ts ConvexPress-Admin/packages/backend/convex/commerce/__tests__/wooVariantParity.test.ts
git commit -m "feat(variantHelpers): add WooCommerce field mapping helpers with tests"
```

---

### Task 4: Update upsertVariant and sync code to store all fields

The sync code currently drops description, weight, dimensions, manage_stock, stock_status, backorders, low_stock_amount, sale dates, virtual, downloadable, tax_class, shipping_class, status, menu_order, and global_unique_id. Wire them all through.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/commerceCatalog.ts`

- [ ] **Step 1: Update upsertVariant args to accept all new fields**

In `commerceCatalog.ts`, find the `upsertVariant` mutation (around line 923). Update its `variant` object validator to include the new fields. Replace the `variant: v.object({...})` block inside the args:

```typescript
    variant: v.object({
      title: v.string(),
      sku: v.optional(v.string()),
      globalUniqueId: v.optional(v.string()),
      optionSummary: v.string(),
      selections: v.optional(v.any()),
      description: v.optional(v.string()),
      price: v.object({
        amount: v.number(),
        currencyCode: v.string(),
      }),
      salePrice: v.optional(v.object({
        amount: v.number(),
        currencyCode: v.string(),
      })),
      salePriceFrom: v.optional(v.number()),
      salePriceTo: v.optional(v.number()),
      manageStock: v.optional(v.string()),
      stockQuantity: v.optional(v.number()),
      stockStatus: v.optional(v.string()),
      backorders: v.optional(v.string()),
      lowStockAmount: v.optional(v.number()),
      weight: v.optional(v.string()),
      shippingLengthIn: v.optional(v.string()),
      shippingWidthIn: v.optional(v.string()),
      shippingHeightIn: v.optional(v.string()),
      shippingClassId: v.optional(v.string()),
      isVirtual: v.optional(v.boolean()),
      isDownloadable: v.optional(v.boolean()),
      downloadLimit: v.optional(v.number()),
      downloadExpiry: v.optional(v.number()),
      taxClass: v.optional(v.string()),
      featuredMediaId: v.optional(v.string()),
      status: v.optional(v.string()),
      menuOrder: v.optional(v.number()),
      isDefault: v.boolean(),
    }),
```

- [ ] **Step 2: Update the patch object in upsertVariant handler to include new fields**

In the handler, find the `const patch = {` block (around line 989) and add the new fields:

```typescript
    const patch = {
      productId: targetProductId,
      title: variant.title,
      sku: variant.sku,
      globalUniqueId: variant.globalUniqueId,
      optionSummary: variant.optionSummary,
      selections: variant.selections,
      selectionKey,
      description: variant.description,
      price: variant.price,
      salePrice: variant.salePrice,
      salePriceFrom: variant.salePriceFrom,
      salePriceTo: variant.salePriceTo,
      manageStock: variant.manageStock,
      stockQuantity: variant.stockQuantity,
      stockStatus: variant.stockStatus,
      backorders: variant.backorders,
      lowStockAmount: variant.lowStockAmount,
      weight: variant.weight,
      shippingLengthIn: variant.shippingLengthIn,
      shippingWidthIn: variant.shippingWidthIn,
      shippingHeightIn: variant.shippingHeightIn,
      shippingClassId: variant.shippingClassId,
      isVirtual: variant.isVirtual,
      isDownloadable: variant.isDownloadable,
      downloadLimit: variant.downloadLimit,
      downloadExpiry: variant.downloadExpiry,
      taxClass: variant.taxClass,
      featuredMediaId: variant.featuredMediaId
        ? (variant.featuredMediaId as Id<"media">)
        : undefined,
      status: variant.status,
      menuOrder: variant.menuOrder,
      isDefault: variant.isDefault,
      updatedAt: now,
    };
```

- [ ] **Step 3: Update the sync call site to pass all new fields**

Find where `upsertVariant` is called with the variant object (around line 491). Update the `variant:` property to pass all the new fields from the WooCommerce variation:

```typescript
            variant: {
              title: buildVariantTitle(args.product.name, optionSummary),
              sku: variation.sku || undefined,
              globalUniqueId: variation.global_unique_id || undefined,
              optionSummary,
              selections,
              description: variation.description || undefined,
              price: toMoney(
                variation.regular_price || variation.price || args.product.regular_price || args.product.price,
                inferCurrencyCode(args.product)
              ),
              salePrice: variation.sale_price
                ? toMoney(variation.sale_price, inferCurrencyCode(args.product))
                : undefined,
              salePriceFrom: variation.date_on_sale_from
                ? new Date(variation.date_on_sale_from).getTime()
                : undefined,
              salePriceTo: variation.date_on_sale_to
                ? new Date(variation.date_on_sale_to).getTime()
                : undefined,
              manageStock: variation.manage_stock === true
                ? "yes"
                : variation.manage_stock === "parent"
                  ? "parent"
                  : variation.manage_stock === false
                    ? "no"
                    : undefined,
              stockQuantity: normalizeStockQuantity(variation.stock_quantity),
              stockStatus: variation.stock_status || undefined,
              backorders: variation.backorders || undefined,
              lowStockAmount: variation.low_stock_amount ?? undefined,
              weight: variation.weight || undefined,
              shippingLengthIn: variation.dimensions?.length || undefined,
              shippingWidthIn: variation.dimensions?.width || undefined,
              shippingHeightIn: variation.dimensions?.height || undefined,
              shippingClassId: variation.shipping_class_id
                ? String(variation.shipping_class_id)
                : undefined,
              isVirtual: variation.virtual ?? undefined,
              isDownloadable: variation.downloadable ?? undefined,
              downloadLimit: variation.download_limit ?? undefined,
              downloadExpiry: variation.download_expiry ?? undefined,
              taxClass: variation.tax_class || undefined,
              featuredMediaId: variantMediaIds[0],
              status: variation.status || undefined,
              menuOrder: variation.menu_order ?? undefined,
              isDefault: Boolean(!existingId && page === 1 && index === 0),
            },
```

- [ ] **Step 4: Run all tests**

Run: `cd ConvexPress-Admin/packages/backend && bun test convex/`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/commerceCatalog.ts
git commit -m "feat(sync): map all WooCommerce variation fields through to ConvexPress variants"
```

---

### Task 5: Restore selections/selectionKey/featuredMediaId in admin mutations

The admin `createVariant` and `updateVariant` mutations were simplified and no longer accept selections, selectionKey, or featuredMediaId. This means admin-created variants are second-class. Restore these fields plus add the new WooCommerce-parity fields.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/products.ts`

- [ ] **Step 1: Update createVariant args and handler**

Find the `createVariant` mutation (around line 845). Replace its args and handler to accept all variant fields:

Add to the args object (after `optionSummary: v.string(),`):

```typescript
    selections: v.optional(
      v.array(
        v.object({
          optionTypeId: v.string(),
          optionTypeName: v.string(),
          optionValueId: v.string(),
          optionValueLabel: v.string(),
          sortOrder: v.optional(v.number()),
        }),
      ),
    ),
```

Add before `isDefault: v.optional(v.boolean()),`:

```typescript
    featuredMediaId: v.optional(v.id("media")),
    description: v.optional(v.string()),
    weight: v.optional(v.string()),
    shippingLengthIn: v.optional(v.string()),
    shippingWidthIn: v.optional(v.string()),
    shippingHeightIn: v.optional(v.string()),
    manageStock: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("parent"))),
    backorders: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("notify"))),
    lowStockAmount: v.optional(v.number()),
    isVirtual: v.optional(v.boolean()),
    isDownloadable: v.optional(v.boolean()),
    menuOrder: v.optional(v.number()),
```

In the handler's `ctx.db.insert("commerce_product_variants", {` block, add after `stockQuantity: args.stockQuantity,`:

```typescript
      selections: args.selections,
      selectionKey: args.selections?.length
        ? args.selections.map((s: any) => `${s.optionTypeId}:${s.optionValueId}`).join("|")
        : undefined,
      featuredMediaId: args.featuredMediaId,
      description: args.description,
      weight: args.weight,
      shippingLengthIn: args.shippingLengthIn,
      shippingWidthIn: args.shippingWidthIn,
      shippingHeightIn: args.shippingHeightIn,
      manageStock: args.manageStock,
      backorders: args.backorders,
      lowStockAmount: args.lowStockAmount,
      isVirtual: args.isVirtual,
      isDownloadable: args.isDownloadable,
      menuOrder: args.menuOrder,
```

- [ ] **Step 2: Update updateVariant args and handler**

Find the `updateVariant` mutation (around line 911). Add to its args (after `stockQuantity: v.optional(v.number()),`):

```typescript
    selections: v.optional(
      v.array(
        v.object({
          optionTypeId: v.string(),
          optionTypeName: v.string(),
          optionValueId: v.string(),
          optionValueLabel: v.string(),
          sortOrder: v.optional(v.number()),
        }),
      ),
    ),
    featuredMediaId: v.optional(v.id("media")),
    description: v.optional(v.string()),
    weight: v.optional(v.string()),
    shippingLengthIn: v.optional(v.string()),
    shippingWidthIn: v.optional(v.string()),
    shippingHeightIn: v.optional(v.string()),
    manageStock: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("parent"))),
    backorders: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("notify"))),
    lowStockAmount: v.optional(v.number()),
    isVirtual: v.optional(v.boolean()),
    isDownloadable: v.optional(v.boolean()),
    menuOrder: v.optional(v.number()),
```

In the handler, add after `if (args.stockQuantity !== undefined) updates.stockQuantity = args.stockQuantity;`:

```typescript
    if (args.selections !== undefined) {
      updates.selections = args.selections;
      updates.selectionKey = args.selections?.length
        ? args.selections.map((s: any) => `${s.optionTypeId}:${s.optionValueId}`).join("|")
        : undefined;
      if (args.optionSummary === undefined) {
        updates.optionSummary = args.selections
          .map((s: any) => `${s.optionTypeName}: ${s.optionValueLabel}`)
          .join(" / ");
      }
    }
    if (args.featuredMediaId !== undefined) updates.featuredMediaId = args.featuredMediaId;
    if (args.description !== undefined) updates.description = args.description;
    if (args.weight !== undefined) updates.weight = args.weight;
    if (args.shippingLengthIn !== undefined) updates.shippingLengthIn = args.shippingLengthIn;
    if (args.shippingWidthIn !== undefined) updates.shippingWidthIn = args.shippingWidthIn;
    if (args.shippingHeightIn !== undefined) updates.shippingHeightIn = args.shippingHeightIn;
    if (args.manageStock !== undefined) updates.manageStock = args.manageStock;
    if (args.backorders !== undefined) updates.backorders = args.backorders;
    if (args.lowStockAmount !== undefined) updates.lowStockAmount = args.lowStockAmount;
    if (args.isVirtual !== undefined) updates.isVirtual = args.isVirtual;
    if (args.isDownloadable !== undefined) updates.isDownloadable = args.isDownloadable;
    if (args.menuOrder !== undefined) updates.menuOrder = args.menuOrder;
```

- [ ] **Step 3: Run all tests**

Run: `cd ConvexPress-Admin/packages/backend && bun test convex/commerce/__tests__/ convex/commerceBundles/__tests__/`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/commerce/products.ts
git commit -m "feat(products): restore selections/selectionKey + add WooCommerce-parity fields to variant mutations"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run all backend tests**

Run: `cd ConvexPress-Admin/packages/backend && bun test convex/commerce/__tests__/ convex/commerceBundles/__tests__/`
Expected: All pass, 0 failures

- [ ] **Step 2: Run all website tests**

Run: `cd ConvexPress-Website && bun test apps/web/src/`
Expected: All pass

- [ ] **Step 3: Run admin frontend tests**

Run: `cd ConvexPress-Admin && bun test apps/web/src/`
Expected: All pass

- [ ] **Step 4: TypeScript check on pure helpers**

Run: `cd ConvexPress-Admin/packages/backend && npx tsc --noEmit --strict convex/commerce/variantHelpers.ts convex/commerce/cartHelpers.ts`
Expected: Clean

- [ ] **Step 5: Verify field coverage — grep for all WooCommerce variation fields in sync code**

Run: `cd ConvexPress-Admin/packages/backend && grep -c "variation\." convex/wordpressSync/phases/commerceCatalog.ts`

Verify these WooCommerce fields are all mapped in the upsertVariant call site:
- `variation.sku` ✓
- `variation.global_unique_id` ✓
- `variation.description` ✓
- `variation.regular_price` / `variation.price` / `variation.sale_price` ✓
- `variation.date_on_sale_from` / `variation.date_on_sale_to` ✓
- `variation.manage_stock` ✓
- `variation.stock_quantity` ✓
- `variation.stock_status` ✓
- `variation.backorders` ✓
- `variation.low_stock_amount` ✓
- `variation.weight` ✓
- `variation.dimensions` (length/width/height) ✓
- `variation.shipping_class_id` ✓
- `variation.virtual` ✓
- `variation.downloadable` ✓
- `variation.download_limit` / `variation.download_expiry` ✓
- `variation.tax_class` ✓
- `variation.image` ✓
- `variation.status` ✓
- `variation.menu_order` ✓
- `variation.attributes` ✓

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: WooCommerce variant parity complete — all variation fields mapped"
```
