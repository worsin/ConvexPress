# WooCommerce Variant/Attribute Parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the ConvexPress product attributes and variations systems to exact WooCommerce parity — global attributes, per-variation fields, admin UI, storefront behavior, sync, and cart/order integration.

**Architecture:** Two phases. Phase 1 adds the global attribute tables, expands the variant schema with all WooCommerce fields, and wires the sync to use them. Phase 2 builds the admin UI and storefront behavior. The existing `optionTypes` inline approach is preserved as a compatibility layer during transition — new code writes to both the global tables AND the inline `optionTypes` field so nothing breaks during rollout.

**Tech Stack:** Convex schema/functions, TanStack Router (admin), TanStack Start (website), Bun test runner

---

## Phase 1: Data Model + Sync (Backend)

### Task 1: Create global attribute tables in schema

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/schema/productAttributes.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/schema.ts` (import and spread)

- [ ] **Step 1: Create the schema file**

Create `convex/schema/productAttributes.ts`:

```typescript
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const productAttributesTables = {
  commerce_product_attributes: defineTable({
    name: v.string(),
    label: v.string(),
    slug: v.string(),
    type: v.union(v.literal("select"), v.literal("text")),
    orderBy: v.union(
      v.literal("menu_order"),
      v.literal("name"),
      v.literal("name_num"),
      v.literal("id"),
    ),
    hasArchives: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_name", ["name"]),

  commerce_product_attribute_terms: defineTable({
    attributeId: v.id("commerce_product_attributes"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    menuOrder: v.number(),
    productCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_attribute", ["attributeId"])
    .index("by_attribute_slug", ["attributeId", "slug"])
    .index("by_attribute_order", ["attributeId", "menuOrder"]),
};
```

- [ ] **Step 2: Import in schema.ts hub file**

In `convex/schema.ts`, add import and spread:

```typescript
import { productAttributesTables } from "./schema/productAttributes";
// ... in defineSchema:
...productAttributesTables,
```

- [ ] **Step 3: Add productAttributes and defaultAttributes fields to commerce_products**

In `convex/schema/commerce.ts`, add after `optionTypes: v.optional(v.any()),`:

```typescript
    productAttributes: v.optional(v.any()),
    defaultAttributes: v.optional(v.any()),
```

- [ ] **Step 4: Run tests**

Run: `cd ConvexPress-Admin/packages/backend && bun test convex/commerce/__tests__/ convex/commerceBundles/__tests__/`

- [ ] **Step 5: Commit**

---

### Task 2: Expand variant schema with all WooCommerce fields

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts`

- [ ] **Step 1: Replace commerce_product_variants table definition**

Replace the entire `commerce_product_variants: defineTable({...})` block with the full WooCommerce-parity schema (description, weight, dimensions, manageStock, stockStatus, backorders, lowStockAmount, scheduled sale dates, virtual, downloadable, download limits, taxClass, shippingClassId, galleryMediaIds, status, menuOrder, globalUniqueId). All new fields are optional so existing data is unaffected.

See the Variations PRD §3.1 for the complete field list. The key additions beyond what exists today:

```typescript
    description: v.optional(v.string()),
    globalUniqueId: v.optional(v.string()),
    salePriceFrom: v.optional(v.number()),
    salePriceTo: v.optional(v.number()),
    manageStock: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("parent"))),
    stockStatus: v.optional(v.union(v.literal("instock"), v.literal("outofstock"), v.literal("onbackorder"))),
    backorders: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("notify"))),
    lowStockAmount: v.optional(v.number()),
    weight: v.optional(v.string()),
    shippingLengthIn: v.optional(v.string()),
    shippingWidthIn: v.optional(v.string()),
    shippingHeightIn: v.optional(v.string()),
    shippingClassId: v.optional(v.string()),
    taxClass: v.optional(v.string()),
    isVirtual: v.optional(v.boolean()),
    isDownloadable: v.optional(v.boolean()),
    downloadLimit: v.optional(v.number()),
    downloadExpiry: v.optional(v.number()),
    galleryMediaIds: v.optional(v.array(v.id("media"))),
    status: v.optional(v.union(v.literal("publish"), v.literal("private"), v.literal("draft"))),
    menuOrder: v.optional(v.number()),
```

Add indexes:
```typescript
    .index("by_product_status", ["productId", "status"])
    .index("by_product_menu_order", ["productId", "menuOrder"])
```

- [ ] **Step 2: Run tests, commit**

---

### Task 3: Expand WooProductVariation type and sync code

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/wooClient.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/commerceCatalog.ts`

- [ ] **Step 1: Expand WooProductVariation interface**

Add all missing fields: `global_unique_id`, `weight`, `dimensions`, `date_on_sale_from`, `date_on_sale_to`, `on_sale`, `backorders`, `backorders_allowed`, `low_stock_amount`, `stock_status`, `virtual`, `downloadable`, `downloads`, `download_limit`, `download_expiry`, `tax_class`, `tax_status`, `shipping_class`, `shipping_class_id`, `menu_order`.

- [ ] **Step 2: Update upsertVariant args to accept all new fields**

Expand the `variant` object validator in the `upsertVariant` mutation to include every new field from the schema.

- [ ] **Step 3: Update the patch object in upsertVariant handler**

Add every new field to the `const patch = {` block so they get written to the DB.

- [ ] **Step 4: Update the sync call site to pass all fields**

In the variation import loop, map every WooCommerce field to its ConvexPress equivalent:
- `variation.description` → `description`
- `variation.global_unique_id` → `globalUniqueId`
- `variation.date_on_sale_from` → `salePriceFrom` (timestamp)
- `variation.date_on_sale_to` → `salePriceTo` (timestamp)
- `variation.manage_stock` → `manageStock` (true→"yes", false→"no", "parent"→"parent")
- `variation.stock_status` → `stockStatus`
- `variation.backorders` → `backorders`
- `variation.low_stock_amount` → `lowStockAmount`
- `variation.weight` → `weight`
- `variation.dimensions` → `shippingLengthIn/shippingWidthIn/shippingHeightIn`
- `variation.shipping_class_id` → `shippingClassId`
- `variation.virtual` → `isVirtual`
- `variation.downloadable` → `isDownloadable`
- `variation.download_limit` → `downloadLimit`
- `variation.download_expiry` → `downloadExpiry`
- `variation.tax_class` → `taxClass`
- `variation.status` → `status`
- `variation.menu_order` → `menuOrder`

- [ ] **Step 5: Run tests, commit**

---

### Task 4: Create global attribute sync from WooCommerce

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/productAttributes/mutations.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/productAttributes/queries.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/commerceCatalog.ts`

- [ ] **Step 1: Create attribute CRUD mutations**

Basic CRUD for `commerce_product_attributes` and `commerce_product_attribute_terms`:
- `upsertAttribute` (internal, for sync)
- `upsertTerm` (internal, for sync)
- `createAttribute` (public, for admin)
- `updateAttribute` (public, for admin)
- `deleteAttribute` (public, for admin)
- `createTerm`, `updateTerm`, `deleteTerm`, `reorderTerms` (public, for admin)

- [ ] **Step 2: Create attribute queries**

- `listAttributes` — all global attributes sorted by label
- `getAttribute` — single attribute with terms
- `listTerms` — terms for an attribute respecting orderBy

- [ ] **Step 3: Add WooCommerce attribute import to sync**

Before importing products, sync global attributes:
1. Fetch `GET /products/attributes` from WooCommerce
2. For each attribute, upsert into `commerce_product_attributes`
3. Fetch `GET /products/attributes/{id}/terms` for each
4. Upsert terms into `commerce_product_attribute_terms`
5. Store ID mappings

- [ ] **Step 4: Update product import to set productAttributes**

When importing a product, map its `attributes[]` to the `productAttributes` format defined in the Attributes PRD §3.3. Continue ALSO setting `optionTypes` for backward compatibility.

- [ ] **Step 5: Run tests, commit**

---

### Task 5: Restore full variant mutation args

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/products.ts`

- [ ] **Step 1: Restore selections, selectionKey, featuredMediaId to createVariant**

The current `createVariant` was simplified and lost these fields. Add them back plus all new WooCommerce-parity fields (description, weight, dimensions, manageStock, backorders, etc.).

- [ ] **Step 2: Add all new fields to updateVariant**

Same expansion — every field from the schema should be settable via updateVariant.

- [ ] **Step 3: Add manageStock "parent" inheritance in inventory resolution**

In `inventory.ts resolveInventoryTarget`, when a variant has `manageStock === "parent"`, resolve stock from the parent product instead of the variant.

- [ ] **Step 4: Run tests, commit**

---

### Task 6: Add WooCommerce field mapping helper tests

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/variantHelpers.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/commerce/__tests__/wooVariantParity.test.ts`

- [ ] **Step 1: Add mapping helpers**

`mapWooManageStock`, `mapWooSaleDates`, `mapWooDimensions`, `mapWooBackorders`, `resolveVariantInheritance` (resolves inherited fields from parent).

- [ ] **Step 2: Write comprehensive tests**

Test every mapping function, every inheritance rule, every edge case.

- [ ] **Step 3: Run all tests, commit**

---

## Phase 2: Admin UI + Storefront

### Task 7: Global attributes admin page

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/attributes.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/attributes.$attributeId.tsx`

- [ ] **Step 1: Build attributes list page**

Split layout: "Add new attribute" form on left (name, slug, type, order by, has archives), table of existing attributes on right. Uses Base UI components, CSS variable colors.

- [ ] **Step 2: Build term management page**

Navigate to from attributes list. "Add term" form on left, draggable term table on right.

- [ ] **Step 3: Add route to admin sidebar navigation**

Under Commerce → Attributes.

- [ ] **Step 4: Commit**

---

### Task 8: Expand product editor variation section

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/components/commerce/CommerceProductEditor.tsx`

- [ ] **Step 1: Add all WooCommerce fields to per-variation editor**

Expandable panel per variation with sections matching WooCommerce:
- Pricing: regular price, sale price, sale schedule (date pickers)
- Inventory: manage stock dropdown (yes/no/parent), stock qty, backorders dropdown (no/yes/notify), low stock threshold, stock status
- Shipping: weight, L/W/H, shipping class, virtual checkbox
- Downloads: downloadable checkbox, file list, download limit, download expiry
- Other: SKU, GTIN, tax class, description textarea

- [ ] **Step 2: Add bulk actions dropdown**

Matching WooCommerce: set prices, set stock, set weight/dimensions, toggle virtual/downloadable, toggle enabled.

- [ ] **Step 3: Add variation pagination**

15 per page with navigation arrows.

- [ ] **Step 4: Add drag-and-drop reordering**

Uses menuOrder field.

- [ ] **Step 5: Commit**

---

### Task 9: Storefront variation form behavior

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/products/$slug.tsx`

- [ ] **Step 1: Add variation description switching**

When customer selects a variant with a `description`, show it below the selectors.

- [ ] **Step 2: Add stock status messaging**

Display "In stock", "Out of stock", "Available on backorder" based on variant's `stockStatus` and `backorders` fields.

- [ ] **Step 3: Add price range display on variable products**

When no variant selected, show "$X – $Y" range from min/max of visible variants' active prices. Show sale strikethrough when applicable.

- [ ] **Step 4: Add scheduled sale price display**

Check `salePriceFrom`/`salePriceTo` against current time to determine if sale is active.

- [ ] **Step 5: Commit**

---

### Task 10: Cart/checkout/order with per-variation data

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/cart.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/inventory.ts`

- [ ] **Step 1: Cart uses manageStock "parent" for stock resolution**

When checking stock on addItem/updateItemQuantity, if variant.manageStock is "parent", use parent product's stock.

- [ ] **Step 2: Cart uses active price with scheduled sale awareness**

Check salePriceFrom/salePriceTo to determine current price.

- [ ] **Step 3: Checkout passes per-variation weight/dimensions for shipping calculation**

When computing shipping, use variant's weight/dimensions (falling back to parent).

- [ ] **Step 4: Order items store full variation metadata**

Include all variant fields in the order item metadata snapshot.

- [ ] **Step 5: Commit**

---

### Task 11: Full verification + audit

- [ ] **Step 1: Run all backend tests**
- [ ] **Step 2: Run all website tests**
- [ ] **Step 3: Run all admin tests**
- [ ] **Step 4: TypeScript check on pure helpers**
- [ ] **Step 5: Audit field coverage — verify every WooCommerce variation field is mapped in sync, stored in schema, editable in admin, displayed on storefront**
- [ ] **Step 6: Commit**
