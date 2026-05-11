# PRD: Product Bundles

> **Status:** DRAFT - Awaiting Review & Enhancement
> **System Code:** CAT-BND
> **Phase:** 4 of 6 (Checkout & Orders)
> **Priority:** P1 - High
> **Complexity:** Medium
> **Airtable Record:** reckWsQczpT0y8QZ0

---

## 1. Overview

### 1.1 Purpose

The Product Bundles system enables creating grouped product packages that are sold together at a bundled price. Bundles can include physical products, digital products, and subscription items. They offer flexible pricing (fixed or percentage discount), inventory validation across components, and can themselves be subscription-enabled. This drives AOV (average order value) and provides customer value through curated packages.

### 1.2 Scope

- Bundle product type with component products
- Fixed price or percentage discount pricing
- Component quantity specification
- Inventory validation across all components
- Bundle display on product pages (show what's included)
- Cart handling (show bundle with components)
- Bundles can include variants
- Bundles can be subscription-enabled
- Admin bundle builder interface

### 1.3 Out of Scope

- Dynamic bundles (customer builds their own)
- "Frequently bought together" suggestions (separate system)
- Bundle-only exclusive products
- Mix-and-match bundles

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Product Catalog | CAT-PRD | 2 | Products to bundle |
| Product Variants | CAT-VAR | 3 | Variant selection in bundles |
| Inventory System | INV-STK | 3 | Component stock validation |
| Shopping Cart | ORD-CRT | 3 | Bundle cart handling |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Subscription Products | CAT-SUB | 4 | Subscription bundles |
| Digital Products | CAT-DIG | 4 | Digital content bundles |
| Order Management | ORD-MGT | 4 | Bundle fulfillment |

### 2.3 Integration Hooks to Implement

- Bundle inventory calculation
- Bundle cart item expansion
- Bundle fulfillment breakdown
- Bundle analytics events

---

## 3. Routes

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Bundle Page | /bundles/:slug | _marketing | No | public |
| Bundle Listing | /bundles | _marketing | No | public |

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Bundles List | /admin/bundles | _admin | Yes | staff, manager, admin |
| Bundle Editor | /admin/bundles/:bundleId | _admin | Yes | staff, manager, admin |
| Bundle Builder | /admin/bundles/new | _admin | Yes | staff, manager, admin |

---

## 4. Data Model

### 4.1 Bundle Tables

```typescript
// Product bundles
product_bundles: defineTable({
  // Basic info
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  shortDescription: v.optional(v.string()),

  // Pricing strategy
  pricingType: v.union(
    v.literal("fixed"),              // Set price for bundle
    v.literal("discount_percent"),   // Percentage off sum of components
    v.literal("discount_amount"),    // Fixed amount off sum of components
  ),
  fixedPrice: v.optional(v.number()),       // For "fixed" type
  discountPercent: v.optional(v.number()),  // For "discount_percent" (e.g., 20 = 20%)
  discountAmount: v.optional(v.number()),   // For "discount_amount"

  // Calculated prices (denormalized)
  calculatedPrice: v.number(),        // Current bundle price
  originalPrice: v.number(),          // Sum of component prices (for comparison)
  savingsAmount: v.number(),          // originalPrice - calculatedPrice
  savingsPercent: v.number(),         // Savings as percentage

  // Images
  imageIds: v.optional(v.array(v.id("media"))),
  thumbnailId: v.optional(v.id("media")),

  // Status
  status: v.union(
    v.literal("draft"),
    v.literal("active"),
    v.literal("archived"),
  ),

  // Availability
  isAvailable: v.boolean(),           // False if any component unavailable
  availableFrom: v.optional(v.number()),
  availableUntil: v.optional(v.number()),

  // Subscription option
  isSubscriptionEnabled: v.boolean(),
  subscriptionConfig: v.optional(v.object({
    billingCycles: v.array(v.object({
      interval: v.string(),
      intervalCount: v.number(),
      price: v.number(),
    })),
  })),

  // SEO
  metaTitle: v.optional(v.string()),
  metaDescription: v.optional(v.string()),

  // Categories
  categoryIds: v.optional(v.array(v.id("product_categories"))),

  // Display
  displayOrder: v.number(),
  featured: v.boolean(),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_slug", ["slug"])
  .index("by_status", ["status"])
  .index("by_featured", ["featured", "status"])

// Bundle components (products in the bundle)
bundle_components: defineTable({
  bundleId: v.id("product_bundles"),
  productId: v.id("products"),
  variantId: v.optional(v.id("product_variants")), // Specific variant or null for customer choice

  // Quantity
  quantity: v.number(),               // How many of this product in bundle

  // Variant handling
  variantSelectionMode: v.union(
    v.literal("fixed"),               // Specific variant, no choice
    v.literal("customer_choice"),     // Customer selects variant
    v.literal("any"),                 // Any variant, system picks
  ),
  allowedVariantIds: v.optional(v.array(v.id("product_variants"))), // If limited choice

  // Display
  displayOrder: v.number(),
  showInListing: v.boolean(),         // Show in bundle contents display

  // Pricing (for itemized display)
  componentPrice: v.number(),         // Price if bought separately

  createdAt: v.number(),
})
  .index("by_bundle", ["bundleId", "displayOrder"])
  .index("by_product", ["productId"])

// Bundle cart selections (when customer must choose variants)
bundle_selections: defineTable({
  cartItemId: v.id("cart_items"),
  componentId: v.id("bundle_components"),
  selectedVariantId: v.id("product_variants"),
})
  .index("by_cart_item", ["cartItemId"])
```

### 4.2 Integration with Existing Tables

```typescript
// Add to cart_items
cart_items: defineTable({
  // ... existing fields

  // Bundle support
  isBundleItem: v.boolean(),
  bundleId: v.optional(v.id("product_bundles")),
  bundleSelections: v.optional(v.array(v.object({
    componentId: v.id("bundle_components"),
    productId: v.id("products"),
    variantId: v.optional(v.id("product_variants")),
    quantity: v.number(),
  }))),
})

// Add to order_items
order_items: defineTable({
  // ... existing fields

  // Bundle support
  isBundleItem: v.boolean(),
  bundleId: v.optional(v.id("product_bundles")),
  bundleComponents: v.optional(v.array(v.object({
    productId: v.id("products"),
    variantId: v.optional(v.id("product_variants")),
    quantity: v.number(),
    price: v.number(),
  }))),
})
```

---

## 5. Pricing Examples

### 5.1 Fixed Price Bundle

```
Bundle: "Complete Starter Kit"
Components:
- Widget A ($29.99) x 1
- Widget B ($19.99) x 1
- Accessory Pack ($14.99) x 1

Sum of components: $64.97
Bundle fixed price: $49.99
Savings: $14.98 (23% off)
```

### 5.2 Percentage Discount Bundle

```
Bundle: "Office Essentials"
Pricing type: 20% discount

Components:
- Monitor ($299.99) x 1
- Keyboard ($79.99) x 1
- Mouse ($49.99) x 1

Sum of components: $429.97
20% discount: $85.99
Bundle price: $343.98
Savings: $85.99
```

### 5.3 Fixed Amount Discount Bundle

```
Bundle: "Summer Collection"
Pricing type: $50 off

Components:
- Summer Dress ($89.99) x 1
- Sandals ($59.99) x 1
- Sunhat ($29.99) x 1

Sum of components: $179.97
Bundle price: $129.97
Savings: $50.00
```

---

## 6. Actions

### 6.1 Customer Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| View Bundle | bundle.view | View bundle details | public |
| Add to Cart | bundle.add_to_cart | Add bundle to cart | public |
| Select Variants | bundle.select_variants | Choose component variants | public |

### 6.2 Staff/Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Create Bundle | bundle.create | Create new bundle | staff, manager, admin |
| Update Bundle | bundle.update | Edit bundle details | staff, manager, admin |
| Add Component | bundle.add_component | Add product to bundle | staff, manager, admin |
| Remove Component | bundle.remove_component | Remove from bundle | staff, manager, admin |
| Archive Bundle | bundle.archive | Archive bundle | manager, admin |
| Publish Bundle | bundle.publish | Make bundle active | manager, admin |

---

## 7. Events

### 7.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Bundle Created | bundle.created | New bundle | `{ bundleId, name }` |
| Bundle Updated | bundle.updated | Bundle modified | `{ bundleId, changes }` |
| Bundle Published | bundle.published | Status → active | `{ bundleId }` |
| Bundle Archived | bundle.archived | Status → archived | `{ bundleId }` |
| Bundle Added to Cart | bundle.added_to_cart | Customer adds bundle | `{ bundleId, userId? }` |

### 7.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| product.updated | Product Catalog | Recalculate bundle prices |
| product.archived | Product Catalog | Check bundle availability |
| inventory.updated | Inventory | Check bundle availability |

---

## 8. User Interface

### 8.1 Components Needed

- [ ] `BundleCard` - Bundle display on listing pages
- [ ] `BundlePage` - Full bundle detail page
- [ ] `BundleContents` - List of included products
- [ ] `BundleVariantSelector` - Choose variants for customer_choice components
- [ ] `BundlePricingSummary` - Show original vs bundle price
- [ ] `BundleSavingsBadge` - "Save 20%" badge
- [ ] `AdminBundleEditor` - Create/edit bundle
- [ ] `AdminComponentSelector` - Add products to bundle
- [ ] `CartBundleItem` - Bundle in cart with components

### 8.2 Bundle Product Page

```
┌────────────────────────────────────────────────────────────────┐
│  Complete Home Office Bundle                    Save 25%!      │
├────────────────────────────────────────────────────────────────┤
│  [Bundle Image Gallery]                                        │
│                                                                 │
│  Everything you need to set up your perfect home office.       │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  What's Included:                                         │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  ✓ Ergonomic Desk Chair              $299.99     x1      │  │
│  │  ✓ Standing Desk (60")               $499.99     x1      │  │
│  │    Color: [Black ▼]                                       │  │
│  │  ✓ Monitor Arm                       $79.99      x1      │  │
│  │  ✓ Cable Management Kit              $29.99      x1      │  │
│  │  ✓ Desk Pad                          $39.99      x1      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Bundle Price:           $749.99                         │  │
│  │  ──────────────────────────────────────                  │  │
│  │  If bought separately:   $949.95                         │  │
│  │  You save:               $199.96 (21%)                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ✓ All items in stock                                          │
│                                                                 │
│  [Add Bundle to Cart]                                           │
│                                                                 │
│  ○ Subscribe & Save: $699.99/month (extra 7% off)             │
└────────────────────────────────────────────────────────────────┘
```

### 8.3 Cart Bundle Display

```
┌────────────────────────────────────────────────────────────────┐
│  Shopping Cart                                                  │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 📦 Complete Home Office Bundle                  $749.99  │  │
│  │    └── Ergonomic Desk Chair x1                           │  │
│  │    └── Standing Desk (Black, 60") x1                     │  │
│  │    └── Monitor Arm x1                                    │  │
│  │    └── Cable Management Kit x1                           │  │
│  │    └── Desk Pad x1                                       │  │
│  │                                                           │  │
│  │    Qty: [1 ▼]                      [Remove]              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Subtotal: $749.99                                              │
│  Bundle savings: -$199.96                                       │
└────────────────────────────────────────────────────────────────┘
```

### 8.4 Admin Bundle Builder

```
┌────────────────────────────────────────────────────────────────┐
│  Create Bundle                                    [Save Draft] │
├────────────────────────────────────────────────────────────────┤
│  Bundle Name: [Complete Home Office Bundle_______]             │
│  Slug: [complete-home-office-bundle______________]             │
│                                                                 │
│  Description: [Rich text editor________________]               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Pricing                                                  │  │
│  │  ○ Fixed Price        ● Discount %        ○ Discount $   │  │
│  │                                                           │  │
│  │  Discount: [25]%                                          │  │
│  │                                                           │  │
│  │  Component Total: $999.95                                 │  │
│  │  Bundle Price: $749.96                                    │  │
│  │  Savings: $249.99                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Components                            [+ Add Product]    │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  1. Ergonomic Desk Chair    $299.99   Qty: [1]   [×]     │  │
│  │     Variant: Fixed (Black)                                │  │
│  │                                                           │  │
│  │  2. Standing Desk           $499.99   Qty: [1]   [×]     │  │
│  │     Variant: Customer Choice [Black, White, Wood]         │  │
│  │                                                           │  │
│  │  3. Monitor Arm             $79.99    Qty: [1]   [×]     │  │
│  │                                                           │  │
│  │  [↕ Drag to reorder]                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [Cancel]                              [Save] [Save & Publish] │
└────────────────────────────────────────────────────────────────┘
```

---

## 9. Business Rules

### 9.1 Bundle Availability

- Bundle is available only if ALL components are available
- If any component is out of stock, bundle shows "Out of Stock"
- If any component is archived, bundle is auto-archived
- Scheduled availability (availableFrom/Until) takes precedence

### 9.2 Inventory Rules

- Bundle purchase deducts from each component's inventory
- Bundle inventory = minimum of (component stock / component quantity)
- Example: Bundle needs 2x Widget A (stock: 10) and 1x Widget B (stock: 5)
  - Max bundles available: min(10/2, 5/1) = 5 bundles

### 9.3 Pricing Rules

- Prices recalculate when component prices change
- Discount can never exceed component sum (no negative prices)
- If component has sale price, use sale price for calculations
- Variant price differences reflected in bundle price

### 9.4 Cart Rules

- Bundle added as single line item
- Cannot modify component quantities in cart (buy whole bundle)
- Bundle quantity can be changed (multiply all components)
- Variant selections persist in cart

---

## 10. API Design

### 10.1 Queries

```typescript
// Get bundle with components
export const getBundle = query({
  args: { bundleId: v.id("product_bundles") },
  handler: async (ctx, args) => {
    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle || bundle.status !== "active") return null;

    const components = await ctx.db.query("bundle_components")
      .withIndex("by_bundle", q => q.eq("bundleId", args.bundleId))
      .collect();

    // Enrich with product data
    const enrichedComponents = await Promise.all(components.map(async (c) => {
      const product = await ctx.db.get(c.productId);
      const variant = c.variantId ? await ctx.db.get(c.variantId) : null;
      const allowedVariants = c.allowedVariantIds
        ? await Promise.all(c.allowedVariantIds.map(id => ctx.db.get(id)))
        : null;

      return { ...c, product, variant, allowedVariants };
    }));

    return { ...bundle, components: enrichedComponents };
  },
});

// Check bundle availability
export const getBundleAvailability = query({
  args: { bundleId: v.id("product_bundles") },
  handler: async (ctx, args) => {
    const components = await ctx.db.query("bundle_components")
      .withIndex("by_bundle", q => q.eq("bundleId", args.bundleId))
      .collect();

    let maxAvailable = Infinity;
    const unavailableReasons: string[] = [];

    for (const component of components) {
      const product = await ctx.db.get(component.productId);
      if (!product || product.status !== "active") {
        unavailableReasons.push(`${product?.name || "Product"} is unavailable`);
        maxAvailable = 0;
        continue;
      }

      let stock: number;
      if (component.variantId) {
        const variant = await ctx.db.get(component.variantId);
        stock = variant?.stockCount ?? 0;
      } else {
        stock = product.stockCount ?? 0;
      }

      const bundlesFromComponent = Math.floor(stock / component.quantity);
      maxAvailable = Math.min(maxAvailable, bundlesFromComponent);

      if (stock < component.quantity) {
        unavailableReasons.push(`${product.name} is out of stock`);
      }
    }

    return {
      isAvailable: maxAvailable > 0,
      maxQuantity: maxAvailable === Infinity ? 999 : maxAvailable,
      unavailableReasons,
    };
  },
});

// List active bundles
export const listBundles = query({
  args: {
    featured: v.optional(v.boolean()),
    categoryId: v.optional(v.id("product_categories")),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("product_bundles")
      .filter(q => q.eq(q.field("status"), "active"));

    if (args.featured) {
      query = query.filter(q => q.eq(q.field("featured"), true));
    }

    const bundles = await query.collect();

    // Filter by category if specified
    if (args.categoryId) {
      return bundles.filter(b =>
        b.categoryIds?.includes(args.categoryId)
      );
    }

    return bundles;
  },
});
```

### 10.2 Mutations

```typescript
// Create bundle
export const createBundle = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    pricingType: v.string(),
    fixedPrice: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    components: v.array(v.object({
      productId: v.id("products"),
      variantId: v.optional(v.id("product_variants")),
      quantity: v.number(),
      variantSelectionMode: v.string(),
      allowedVariantIds: v.optional(v.array(v.id("product_variants"))),
    })),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    // Validate unique slug
    const existingSlug = await ctx.db.query("product_bundles")
      .withIndex("by_slug", q => q.eq("slug", args.slug))
      .first();

    if (existingSlug) throw new Error("Bundle slug already exists");

    // Calculate prices
    const { calculatedPrice, originalPrice, savingsAmount, savingsPercent } =
      await calculateBundlePricing(ctx, args.components, args.pricingType, {
        fixedPrice: args.fixedPrice,
        discountPercent: args.discountPercent,
        discountAmount: args.discountAmount,
      });

    // Create bundle
    const bundleId = await ctx.db.insert("product_bundles", {
      name: args.name,
      slug: args.slug,
      description: args.description,
      pricingType: args.pricingType,
      fixedPrice: args.fixedPrice,
      discountPercent: args.discountPercent,
      discountAmount: args.discountAmount,
      calculatedPrice,
      originalPrice,
      savingsAmount,
      savingsPercent,
      status: "draft",
      isAvailable: true,
      isSubscriptionEnabled: false,
      displayOrder: 0,
      featured: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create components
    for (let i = 0; i < args.components.length; i++) {
      const comp = args.components[i];
      const product = await ctx.db.get(comp.productId);
      const variant = comp.variantId ? await ctx.db.get(comp.variantId) : null;

      const componentPrice = variant?.price ?? product?.basePrice ?? 0;

      await ctx.db.insert("bundle_components", {
        bundleId,
        productId: comp.productId,
        variantId: comp.variantId,
        quantity: comp.quantity,
        variantSelectionMode: comp.variantSelectionMode,
        allowedVariantIds: comp.allowedVariantIds,
        displayOrder: i,
        showInListing: true,
        componentPrice,
        createdAt: Date.now(),
      });
    }

    await dispatchEvent(ctx, "bundle.created", { bundleId, name: args.name });

    return bundleId;
  },
});

// Add bundle to cart
export const addBundleToCart = mutation({
  args: {
    bundleId: v.id("product_bundles"),
    quantity: v.optional(v.number()),
    variantSelections: v.optional(v.array(v.object({
      componentId: v.id("bundle_components"),
      variantId: v.id("product_variants"),
    }))),
  },
  handler: async (ctx, args) => {
    const bundle = await ctx.db.get(args.bundleId);
    if (!bundle || bundle.status !== "active") {
      throw new Error("Bundle not available");
    }

    const quantity = args.quantity ?? 1;

    // Validate availability
    const availability = await ctx.runQuery(api.bundles.getBundleAvailability, {
      bundleId: args.bundleId
    });

    if (!availability.isAvailable) {
      throw new Error("Bundle is out of stock");
    }

    if (quantity > availability.maxQuantity) {
      throw new Error(`Only ${availability.maxQuantity} bundles available`);
    }

    // Get components
    const components = await ctx.db.query("bundle_components")
      .withIndex("by_bundle", q => q.eq("bundleId", args.bundleId))
      .collect();

    // Build bundle selections
    const bundleSelections = components.map(comp => {
      let variantId = comp.variantId;

      // Check if customer selection needed
      if (comp.variantSelectionMode === "customer_choice") {
        const selection = args.variantSelections?.find(
          s => s.componentId === comp._id
        );

        if (!selection) {
          throw new Error(`Please select a variant for ${comp.productId}`);
        }

        variantId = selection.variantId;
      }

      return {
        componentId: comp._id,
        productId: comp.productId,
        variantId,
        quantity: comp.quantity,
      };
    });

    // Get or create cart
    const cart = await getOrCreateCart(ctx);

    // Add bundle as cart item
    await ctx.db.insert("cart_items", {
      cartId: cart._id,
      productId: args.bundleId, // Store bundleId as productId for reference
      quantity,
      price: bundle.calculatedPrice,
      isBundleItem: true,
      bundleId: args.bundleId,
      bundleSelections,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await dispatchEvent(ctx, "bundle.added_to_cart", {
      bundleId: args.bundleId,
      quantity,
    });
  },
});

// Recalculate bundle prices (internal, triggered by product updates)
export const recalculateBundlePrices = internalMutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    // Find all bundles containing this product
    const components = await ctx.db.query("bundle_components")
      .withIndex("by_product", q => q.eq("productId", args.productId))
      .collect();

    const bundleIds = [...new Set(components.map(c => c.bundleId))];

    for (const bundleId of bundleIds) {
      const bundle = await ctx.db.get(bundleId);
      if (!bundle) continue;

      const bundleComponents = await ctx.db.query("bundle_components")
        .withIndex("by_bundle", q => q.eq("bundleId", bundleId))
        .collect();

      const { calculatedPrice, originalPrice, savingsAmount, savingsPercent } =
        await calculateBundlePricing(ctx, bundleComponents, bundle.pricingType, {
          fixedPrice: bundle.fixedPrice,
          discountPercent: bundle.discountPercent,
          discountAmount: bundle.discountAmount,
        });

      await ctx.db.patch(bundleId, {
        calculatedPrice,
        originalPrice,
        savingsAmount,
        savingsPercent,
        updatedAt: Date.now(),
      });
    }
  },
});
```

---

## 11. Fulfillment Handling

When a bundle order is fulfilled:

1. Order item stores `bundleComponents` with specific products/variants
2. Fulfillment system processes each component as separate items
3. Inventory deducted from each component product
4. Shipping may require special handling (multiple packages)
5. Returns handled per-component or as whole bundle

---

## 12. Implementation Checklist

### Phase 1: Foundation
- [ ] Bundle schema definition
- [ ] Create bundle mutation
- [ ] Bundle pricing calculations
- [ ] Basic bundle queries

### Phase 2: Core Features
- [ ] Bundle product page
- [ ] Bundle listing page
- [ ] Admin bundle editor
- [ ] Component management

### Phase 3: Integration
- [ ] Cart integration
- [ ] Checkout handling
- [ ] Order fulfillment
- [ ] Inventory validation

### Phase 4: Polish
- [ ] Variant selection UI
- [ ] Bundle availability checks
- [ ] Price recalculation triggers
- [ ] Bundle analytics

---

## 13. Future Considerations

- **Build Your Own Bundle:** Customer picks components
- **Tiered Bundles:** Good/Better/Best bundles
- **Cross-Sell Bundles:** "Complete the look" suggestions
- **Limited Edition Bundles:** Time-limited special bundles
- **Bundle Upsells:** Offer bundle upgrade at checkout

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | reckWsQczpT0y8QZ0 |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Product Catalog PRD](./PRD-PRODUCT-CATALOG.md)
- [Product Variants PRD](./PRD-DRAFT-PRODUCT-VARIANTS.md)
- [Subscription Products PRD](./PRD-DRAFT-SUBSCRIPTION-PRODUCTS.md)

---

**PRD Version:** 0.1 (DRAFT)
**Created:** 2025-02-03
**Last Updated:** 2025-02-03
**Author:** Claude (AI-Generated Draft)
**Status:** Awaiting human review and enhancement
