# PRD: Product Variants

> **Origin:** Ported from VexCart on 2026-04-22, integrated into ConvexPress.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce is not a separate app; it is a first-class layer inside ConvexPress alongside posts, pages, media, users, and taxonomies. Every commerce feature is either **baked into the commerce core** or **gated as an internal extension** via `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts` (feature flags, not a third-party marketplace).
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Customer-facing UIs serve `Subscriber` + guests.
> **No third-party plugin/theme marketplace.** AI builds custom per-site. Internally, "extensions" are feature-flagged modules (Bundles, Digital, Returns, Reviews, Wishlists, Subscriptions, Add-Ons, Membership) that live in `convex/commerce<Thing>/` with a `<thing>Enabled` settings flag and a `require<Thing>Enabled(ctx)` gate on every mutation/query.
> **Package manager:** Bun. **UI:** Base UI (not Radix). **Styling:** Tailwind v4. **Payments:** Stripe (see `agents/knowledge/stripe-integration.md`).


> **Status:** DRAFT - Awaiting Review & Enhancement
> **Airtable Record:** [redacted-airtable-record-id]

---

## Integration with ConvexPress

**Positioning:** internal extension (`commerceVariants` — folded into products).
**Code lives at:** `ConvexPress-Admin/packages/backend/convex/commerce/variants.ts` + `schema/commerce.ts:commerce_product_variants`

**Consumes these ConvexPress systems:**

- **Product System** — variants are children of a parent product.
- **Inventory System** — per-variant stock counts + reservations.
- **Media System** — per-variant imagery.
- **WordPress Sync** — variant round-trip with WooCommerce (see `WOOCOMMERCE-FIELD-FIDELITY-AND-CUSTOMER-CONTINUITY.md`).

**WooCommerce analog:** WooCommerce variable products + variations — attribute-driven child products.

---
## 1. Overview

### 1.1 Purpose

The Product Variants system enables products to have multiple variations (size, color, material, etc.) each with their own SKU, price, inventory, and images. This is essential for apparel, accessories, and any product line where customers choose from multiple options. Variants support both single-option (size only) and multi-option (size + color) configurations.

### 1.2 Scope

- Variant attribute definitions (Size, Color, Material, etc.)
- Multiple variant options per attribute
- Per-variant SKU, price, and inventory
- Variant-specific images
- Variant selection UI on product pages
- Inventory tracking per variant
- Cart/checkout with variant context
- Admin variant management within product editor

### 1.3 Out of Scope

- Variant-based bundles (handled by Product Bundles system)
- Dynamic variant generation from rules
- Variant comparison tools
- Size guides/charts (future enhancement)

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Product Catalog | CAT-PRD | 2 | Parent products for variants |
| Media Library | PLT-MED | 1 | Variant-specific images |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Shopping Cart | ORD-CRT | 3 | Variant selection in cart items |
| Inventory System | INV-STK | 3 | Per-variant stock tracking |
| Wishlist System | USR-WSH | 5 | Variant-specific wishlist items |
| Search System | PLT-SRC | 2 | Variant data in search index |
| Product Bundles | CAT-BND | 4 | Variants as bundle components |

### 2.3 Integration Hooks to Implement

- Variant price/inventory queries for cart
- Variant option selection events for analytics
- Variant availability checks
- UCP ProductVariant schema support

---

## 3. Routes

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Product Detail | /products/:slug | _marketing | No | public |
| (Variant selected via URL params: ?variant=:variantId or ?size=M&color=red) |

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Product Variants Editor | /admin/products/:productId/variants | _admin | Yes | staff, manager, admin |

---

## 4. Data Model

### 4.1 Tables

```typescript
// Variant attributes (Size, Color, Material, etc.)
variant_attributes: defineTable({
  name: v.string(),           // "Size", "Color", "Material"
  slug: v.string(),           // "size", "color", "material"
  displayType: v.union(
    v.literal("dropdown"),    // Standard select
    v.literal("buttons"),     // Button group
    v.literal("swatches"),    // Color swatches
    v.literal("images"),      // Image selector
  ),
  sortOrder: v.number(),
  isActive: v.boolean(),
  createdAt: v.number(),
})
  .index("by_slug", ["slug"])
  .index("by_sort", ["sortOrder"])

// Attribute options (S, M, L for Size; Red, Blue for Color)
variant_attribute_options: defineTable({
  attributeId: v.id("variant_attributes"),
  name: v.string(),           // "Small", "Red"
  value: v.string(),          // "S", "red"
  displayValue: v.optional(v.string()), // "#FF0000" for color swatches
  sortOrder: v.number(),
  isActive: v.boolean(),
})
  .index("by_attribute", ["attributeId", "sortOrder"])
  .index("by_attribute_value", ["attributeId", "value"])

// Product variants (the actual purchasable variations)
product_variants: defineTable({
  productId: v.id("products"),

  // Variant identity
  sku: v.string(),
  name: v.optional(v.string()),    // Auto-generated: "Product Name - Blue, Large"

  // Attributes (e.g., { size: "L", color: "blue" })
  attributes: v.record(v.string(), v.string()),

  // Pricing (null = use product base price)
  price: v.optional(v.number()),
  salePrice: v.optional(v.number()),
  costPrice: v.optional(v.number()),

  // Inventory
  stockCount: v.number(),
  lowStockThreshold: v.optional(v.number()),
  trackInventory: v.boolean(),
  allowBackorder: v.boolean(),

  // Media
  imageIds: v.optional(v.array(v.id("media"))),

  // Status
  status: v.union(
    v.literal("active"),
    v.literal("inactive"),
    v.literal("discontinued"),
  ),

  // Weight/dimensions (for shipping)
  weight: v.optional(v.number()),
  dimensions: v.optional(v.object({
    length: v.number(),
    width: v.number(),
    height: v.number(),
  })),

  // Barcode
  barcode: v.optional(v.string()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_product", ["productId", "status"])
  .index("by_sku", ["sku"])
  .index("by_barcode", ["barcode"])

// Product variant options mapping (which attributes a product uses)
product_variant_config: defineTable({
  productId: v.id("products"),
  attributeId: v.id("variant_attributes"),
  optionIds: v.array(v.id("variant_attribute_options")), // Which options are available
  sortOrder: v.number(),
})
  .index("by_product", ["productId"])
```

### 4.2 Relationships

```
variant_attributes (Size, Color)
        │
        ▼
variant_attribute_options (S, M, L, Red, Blue)
        │
        ▼
product_variant_config (Product X uses Size[S,M,L] and Color[Red,Blue])
        │
        ▼
product_variants (Specific SKUs: X-Red-S, X-Red-M, X-Blue-S, etc.)
```

### 4.3 Denormalized Fields on Products

```typescript
// Add to products table
products: defineTable({
  // ... existing fields

  // Variant metadata (denormalized for display)
  hasVariants: v.boolean(),
  variantCount: v.number(),
  variantAttributes: v.optional(v.array(v.string())), // ["size", "color"]
  priceRange: v.optional(v.object({
    min: v.number(),
    max: v.number(),
  })),
  totalStock: v.optional(v.number()),   // Sum of all variant stock
})
```

---

## 5. Actions

### 5.1 Customer Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Select Variant | variant.select | Choose variant on product page | public |
| Check Availability | variant.check_availability | Verify variant in stock | public |

### 5.2 Staff/Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Create Variant | variant.create | Add variant to product | staff, manager, admin |
| Update Variant | variant.update | Edit variant details | staff, manager, admin |
| Delete Variant | variant.delete | Remove variant | manager, admin |
| Bulk Generate | variant.bulk_generate | Generate all combinations | staff, manager, admin |
| Update Inventory | variant.update_inventory | Adjust variant stock | staff, manager, admin |

---

## 6. Events

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Variant Created | variant.created | New variant added | `{ variantId, productId, sku }` |
| Variant Updated | variant.updated | Variant details changed | `{ variantId, changes }` |
| Variant Deleted | variant.deleted | Variant removed | `{ variantId, productId }` |
| Variant Selected | variant.selected | Customer selects variant | `{ productId, variantId, attributes }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| product.created | Product Catalog | Initialize variant config |
| product.deleted | Product Catalog | Delete all variants |

---

## 7. User Interface

### 7.1 Components Needed

- [ ] `VariantSelector` - Attribute option selection UI
- [ ] `SizeSelector` - Size button group
- [ ] `ColorSwatches` - Color picker with swatches
- [ ] `VariantPrice` - Display variant-specific pricing
- [ ] `VariantStock` - Stock status indicator
- [ ] `VariantImageSwitcher` - Switch images on variant change
- [ ] `AdminVariantEditor` - Full variant management
- [ ] `AdminVariantGenerator` - Bulk variant creation
- [ ] `VariantInventoryGrid` - Quick stock updates

### 7.2 Product Page Variant Selection

```
┌────────────────────────────────────────────────────────────────┐
│  Classic T-Shirt                                                │
│  $24.99 - $29.99                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Product Image - updates on variant selection]                │
│                                                                 │
├────────────────────────────────────────────────────────────────┤
│  Color: Blue                                                    │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐                                       │
│  │ ● │ │   │ │   │ │   │   (color swatches)                    │
│  │Red│ │Blu│ │Grn│ │Blk│                                       │
│  └───┘ └───┘ └───┘ └───┘                                       │
│                                                                 │
│  Size: Medium                                                   │
│  [ S ] [ M ] [ L ] [ XL ] [ 2XL ]   (button group)             │
│         ▲                                                       │
│        selected                                                 │
│                                                                 │
│  $24.99  ✓ In Stock (12 available)                             │
│                                                                 │
│  [ Add to Cart ]                                                │
└────────────────────────────────────────────────────────────────┘
```

### 7.3 Admin Variant Editor

```
┌────────────────────────────────────────────────────────────────┐
│  Product Variants: Classic T-Shirt                              │
├────────────────────────────────────────────────────────────────┤
│  Variant Attributes                    [+ Add Attribute]       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Size: S, M, L, XL, 2XL                    [Edit] [×]   │   │
│  │ Color: Red, Blue, Green, Black            [Edit] [×]   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Generate All Combinations] - Creates 20 variants              │
├────────────────────────────────────────────────────────────────┤
│  Variants (20 total)                [+ Add Variant Manually]   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ SKU           │ Size │ Color │ Price │ Stock │ Status   │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ TSHIRT-RED-S  │ S    │ Red   │ $24.99│ 15    │ ✓ Active │  │
│  │ TSHIRT-RED-M  │ M    │ Red   │ $24.99│ 20    │ ✓ Active │  │
│  │ TSHIRT-RED-L  │ L    │ Red   │ $26.99│ 18    │ ✓ Active │  │
│  │ TSHIRT-BLU-S  │ S    │ Blue  │ $24.99│ 0     │ ⚠ OOS    │  │
│  │ ...                                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Bulk Actions: [Set Price] [Set Stock] [Activate] [Deactivate] │
└────────────────────────────────────────────────────────────────┘
```

---

## 8. Business Rules

### 8.1 Variant Validation

- SKU must be unique across all variants
- At least one variant required if product has variants enabled
- Variant cannot be deleted if in active orders
- Price must be >= 0 (null = use base product price)

### 8.2 Variant Generation Rules

- Auto-generate SKU: `{PRODUCT_SKU}-{ATTR1}-{ATTR2}`
- Auto-generate name: `{PRODUCT_NAME} - {Option1}, {Option2}`
- New variants inherit default price from product
- New variants default to 0 stock

### 8.3 Inventory Rules

- Product `totalStock` = sum of all active variant stock
- Product `inStock` = true if any variant has stock > 0
- Variant with stock <= lowStockThreshold triggers alert
- Backorder allowed only if variant.allowBackorder = true

### 8.4 Pricing Rules

- Variant price overrides product base price
- If variant.price is null, use product.basePrice
- Sale price follows same logic
- Price range on product = min/max of all variant prices

---

## 9. API Design

### 9.1 Queries (Read Operations)

```typescript
// Get variant attributes (global)
export const getVariantAttributes = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("variant_attributes")
      .filter(q => q.eq(q.field("isActive"), true))
      .order("asc")
      .collect();
  },
});

// Get product variants
export const getProductVariants = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const variants = await ctx.db.query("product_variants")
      .withIndex("by_product", q => q.eq("productId", args.productId))
      .filter(q => q.neq(q.field("status"), "discontinued"))
      .collect();

    // Enrich with attribute option names
    return Promise.all(variants.map(async (v) => ({
      ...v,
      images: v.imageIds ? await getMediaItems(ctx, v.imageIds) : [],
    })));
  },
});

// Get variant by attributes (for selection)
export const getVariantByAttributes = query({
  args: {
    productId: v.id("products"),
    attributes: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const variants = await ctx.db.query("product_variants")
      .withIndex("by_product", q => q.eq("productId", args.productId))
      .collect();

    // Find matching variant
    return variants.find(v =>
      Object.entries(args.attributes).every(
        ([key, value]) => v.attributes[key] === value
      )
    );
  },
});

// Get available options (respects inventory)
export const getAvailableOptions = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const variants = await ctx.db.query("product_variants")
      .withIndex("by_product", q => q.eq("productId", args.productId))
      .filter(q => q.eq(q.field("status"), "active"))
      .collect();

    const config = await ctx.db.query("product_variant_config")
      .withIndex("by_product", q => q.eq("productId", args.productId))
      .collect();

    // Build availability matrix
    const availability: Record<string, Record<string, boolean>> = {};

    for (const variant of variants) {
      const isAvailable = variant.stockCount > 0 || variant.allowBackorder;

      for (const [attr, value] of Object.entries(variant.attributes)) {
        if (!availability[attr]) availability[attr] = {};
        if (isAvailable) {
          availability[attr][value] = true;
        }
      }
    }

    return { config, availability, variants };
  },
});

// Get product variant configuration
export const getProductVariantConfig = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const configs = await ctx.db.query("product_variant_config")
      .withIndex("by_product", q => q.eq("productId", args.productId))
      .collect();

    // Enrich with attribute and option details
    return Promise.all(configs.map(async (config) => {
      const attribute = await ctx.db.get(config.attributeId);
      const options = await Promise.all(
        config.optionIds.map(id => ctx.db.get(id))
      );
      return { ...config, attribute, options };
    }));
  },
});
```

### 9.2 Mutations (Write Operations)

```typescript
// Create single variant
export const createVariant = mutation({
  args: {
    productId: v.id("products"),
    sku: v.string(),
    attributes: v.record(v.string(), v.string()),
    price: v.optional(v.number()),
    salePrice: v.optional(v.number()),
    stockCount: v.number(),
    imageIds: v.optional(v.array(v.id("media"))),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    // Validate unique SKU
    const existingSku = await ctx.db.query("product_variants")
      .withIndex("by_sku", q => q.eq("sku", args.sku))
      .first();

    if (existingSku) throw new Error("SKU already exists");

    // Create variant
    const variantId = await ctx.db.insert("product_variants", {
      productId: args.productId,
      sku: args.sku,
      attributes: args.attributes,
      price: args.price,
      salePrice: args.salePrice,
      stockCount: args.stockCount,
      trackInventory: true,
      allowBackorder: false,
      imageIds: args.imageIds,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update product metadata
    await updateProductVariantMetadata(ctx, args.productId);

    // Dispatch event
    await dispatchEvent(ctx, "variant.created", {
      variantId,
      productId: args.productId,
      sku: args.sku,
    });

    return variantId;
  },
});

// Bulk generate variants from attribute combinations
export const bulkGenerateVariants = mutation({
  args: {
    productId: v.id("products"),
    attributeOptions: v.array(v.object({
      attributeSlug: v.string(),
      optionValues: v.array(v.string()),
    })),
    basePrice: v.optional(v.number()),
    baseStock: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");

    // Generate all combinations
    const combinations = generateCombinations(args.attributeOptions);

    const createdVariants: string[] = [];

    for (const combo of combinations) {
      // Generate SKU
      const skuSuffix = Object.values(combo).join("-").toUpperCase();
      const sku = `${product.sku}-${skuSuffix}`;

      // Check if variant already exists
      const existing = await ctx.db.query("product_variants")
        .withIndex("by_sku", q => q.eq("sku", sku))
        .first();

      if (existing) continue;

      // Create variant
      const variantId = await ctx.db.insert("product_variants", {
        productId: args.productId,
        sku,
        attributes: combo,
        price: args.basePrice,
        stockCount: args.baseStock ?? 0,
        trackInventory: true,
        allowBackorder: false,
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      createdVariants.push(variantId);
    }

    // Update product metadata
    await updateProductVariantMetadata(ctx, args.productId);

    return { created: createdVariants.length, skipped: combinations.length - createdVariants.length };
  },
});

// Update variant
export const updateVariant = mutation({
  args: {
    variantId: v.id("product_variants"),
    updates: v.object({
      sku: v.optional(v.string()),
      price: v.optional(v.number()),
      salePrice: v.optional(v.number()),
      stockCount: v.optional(v.number()),
      status: v.optional(v.string()),
      imageIds: v.optional(v.array(v.id("media"))),
    }),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    const variant = await ctx.db.get(args.variantId);
    if (!variant) throw new Error("Variant not found");

    // Validate SKU uniqueness if changing
    if (args.updates.sku && args.updates.sku !== variant.sku) {
      const existing = await ctx.db.query("product_variants")
        .withIndex("by_sku", q => q.eq("sku", args.updates.sku))
        .first();
      if (existing) throw new Error("SKU already exists");
    }

    await ctx.db.patch(args.variantId, {
      ...args.updates,
      updatedAt: Date.now(),
    });

    // Update product metadata
    await updateProductVariantMetadata(ctx, variant.productId);

    await dispatchEvent(ctx, "variant.updated", {
      variantId: args.variantId,
      changes: Object.keys(args.updates),
    });
  },
});

// Bulk update inventory
export const bulkUpdateInventory = mutation({
  args: {
    updates: v.array(v.object({
      variantId: v.id("product_variants"),
      stockCount: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    const productIds = new Set<string>();

    for (const update of args.updates) {
      const variant = await ctx.db.get(update.variantId);
      if (variant) {
        await ctx.db.patch(update.variantId, {
          stockCount: update.stockCount,
          updatedAt: Date.now(),
        });
        productIds.add(variant.productId);
      }
    }

    // Update all affected products
    for (const productId of productIds) {
      await updateProductVariantMetadata(ctx, productId);
    }

    return { updated: args.updates.length };
  },
});

// Helper: Update product variant metadata
async function updateProductVariantMetadata(ctx: MutationCtx, productId: Id<"products">) {
  const variants = await ctx.db.query("product_variants")
    .withIndex("by_product", q => q.eq("productId", productId))
    .filter(q => q.eq(q.field("status"), "active"))
    .collect();

  if (variants.length === 0) {
    await ctx.db.patch(productId, {
      hasVariants: false,
      variantCount: 0,
      priceRange: null,
      totalStock: 0,
    });
    return;
  }

  // Get unique attribute names
  const attributes = new Set<string>();
  variants.forEach(v => Object.keys(v.attributes).forEach(a => attributes.add(a)));

  // Calculate price range
  const prices = variants.map(v => v.price ?? 0).filter(p => p > 0);
  const priceRange = prices.length > 0 ? {
    min: Math.min(...prices),
    max: Math.max(...prices),
  } : null;

  // Calculate total stock
  const totalStock = variants.reduce((sum, v) => sum + v.stockCount, 0);

  await ctx.db.patch(productId, {
    hasVariants: true,
    variantCount: variants.length,
    variantAttributes: Array.from(attributes),
    priceRange,
    totalStock,
  });
}

// Helper: Generate combinations
function generateCombinations(
  attributeOptions: Array<{ attributeSlug: string; optionValues: string[] }>
): Array<Record<string, string>> {
  if (attributeOptions.length === 0) return [{}];

  const [first, ...rest] = attributeOptions;
  const restCombinations = generateCombinations(rest);

  return first.optionValues.flatMap(value =>
    restCombinations.map(combo => ({
      [first.attributeSlug]: value,
      ...combo,
    }))
  );
}
```

---

## 10. UCP Integration

### 10.1 ProductVariant Schema (Universal Commerce Protocol)

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Classic T-Shirt",
  "offers": {
    "@type": "AggregateOffer",
    "lowPrice": "24.99",
    "highPrice": "29.99",
    "priceCurrency": "USD"
  },
  "model": [
    {
      "@type": "ProductModel",
      "name": "Classic T-Shirt - Red, Small",
      "sku": "TSHIRT-RED-S",
      "color": "Red",
      "size": "S",
      "offers": {
        "@type": "Offer",
        "price": "24.99",
        "availability": "https://schema.org/InStock"
      }
    }
  ]
}
```

---

## 11. Security Considerations

### 11.1 Access Control

- Variant creation/editing requires staff role
- Variant deletion requires manager role
- Public can only read active variants
- Inventory data protected from public APIs

---

## 12. Implementation Checklist

### Phase 1: Foundation
- [ ] Schema definition (attributes, options, variants, config)
- [ ] Basic CRUD mutations
- [ ] Variant queries with availability

### Phase 2: Core Features
- [ ] Variant selector component
- [ ] Admin variant editor
- [ ] Bulk variant generation
- [ ] Per-variant images

### Phase 3: Integration
- [ ] Cart integration (variant in cart items)
- [ ] Inventory system per-variant
- [ ] Search index variant data
- [ ] Product metadata updates

### Phase 4: Polish
- [ ] Color swatches UI
- [ ] Variant image switching
- [ ] Bulk inventory updates
- [ ] UCP schema markup

---

## 13. Future Considerations

- **Size Guides:** Size chart per product category
- **Variant Rules:** Price adjustments based on options
- **3D/AR Preview:** Variant visualization
- **Stock Notifications:** "Notify when back in stock" per variant
- **Cross-Sell:** "This also comes in..." recommendations

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | [redacted-airtable-record-id] |
| Routes | [redacted-airtable-record-id] |
| Actions | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Product Catalog PRD](./the Product System PRD (`specs/ConvexPress/systems/product-system/PRD.md`).md)
- [Inventory System PRD](./the Inventory System PRD (`specs/ConvexPress/systems/inventory-system/PRD.md`).md)
- [Shopping Cart PRD](./the Cart System PRD (`specs/ConvexPress/systems/cart-system/PRD.md`).md)

---

**PRD Version:** 0.1 (DRAFT)
**Created:** 2025-02-03
**Last Updated:** 2025-02-03
**Author:** Claude (AI-Generated Draft)
**Status:** Awaiting human review and enhancement
