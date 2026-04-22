# PRD: Product Catalog

> **Origin:** Ported from VexCart on 2026-04-22.
> **Environment:** ConvexPress CMS + Commerce (WordPress-replacement architecture).
> **Auth stack:** Admin uses Convex Auth; website uses Clerk. Not VexCart's auth model.
> **Roles:** WordPress-standard — Administrator / Editor / Author / Contributor / Subscriber.
> **No themes, widgets, or plugins** in ConvexPress — AI builds custom per-site.
> **Package manager:** Bun (not npm/pnpm).
> **See `docs/stripe-integration.md`** for the site-wide Stripe provider architecture; this PRD's payment/tax references should be read through that lens.
>
> Lexical substitutions (VexCart→ConvexPress names and repo paths) have been
> applied automatically. Deeper semantic adaptations (capabilities, role
> naming, event-code conventions) may still reference VexCart-era details
> verbatim — flag and fix as they're used.


> **System Code:** CAT-PRD
> **Phase:** 2 of 6
> **Priority:** P0 - Critical
> **Complexity:** Complex

---

## 1. Overview

### 1.1 Purpose

The Product Catalog is the foundation of the e-commerce platform. It manages all product data, displays, and interactions. Built on Convex's real-time architecture, this system delivers instant updates across all connected clients, ensuring customers always see accurate pricing, availability, and product information. The catalog is designed from day one to support AI-enabled commerce through Universal Commerce Protocol (UCP) and MCP integration.

### 1.2 Scope

**In Scope:**
- Product data model with all required fields
- Product CRUD operations with real-time sync
- Product listing pages with filters and pagination
- Product detail pages with all relevant information
- Admin product management interface
- SEO optimization (meta tags, structured data, sitemap)
- Real-time inventory visibility on product pages
- "X people viewing" presence indicators
- Product search and filtering
- UCP product feed compliance
- MCP tool exposure for AI agents

**Out of Scope:**
- Category management (PRD-CATEGORY-SYSTEM)
- Product variants (PRD-PRODUCT-VARIANTS)
- Inventory stock adjustments (PRD-INVENTORY-SYSTEM)
- Product reviews (future PRD-REVIEWS)
- Wishlist functionality (future PRD-WISHLIST)
- Discount/sale pricing rules (PRD-DISCOUNTS)

### 1.3 Key Differentiators: Convex-Native Design

This is not a traditional e-commerce catalog. It leverages Convex's unique capabilities:

| Traditional Approach | Convex-Native Approach |
|---------------------|----------------------|
| Polling for price updates | Real-time subscriptions, instant price changes |
| Page refresh for stock status | Live inventory display, updates in real-time |
| No visibility into demand | "5 people viewing" presence indicators |
| Stale data, cache issues | Always fresh, reactive queries |
| REST API, latency on every call | Optimistic updates, zero-latency UI |

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Event System | PLT-EVT | 0 | Product events must be dispatched for notifications and analytics |
| Authentication | PLT-AUT | 0 | Admin access requires authentication |
| Media Library | PLT-MED | 1 | Product images are stored in media library |
| Airtable Sync | PLT-SYN | 2 | Product configuration may sync from Airtable |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Category System | CAT-CAT | 3 | Products assigned to categories |
| Product Variants | CAT-VAR | 3 | Variants linked to base products |
| Inventory System | INV-STK | 3 | Stock tracking per product |
| Search System | PLT-SRC | 3 | Products indexed for search |
| Shopping Cart | ORD-CRT | 3 | Add to cart from product pages |
| Checkout System | ORD-CHK | 4 | Product data at checkout |
| Reviews & Ratings | CON-REV | 5 | Reviews linked to products |
| Wishlist | USR-WSH | 5 | Products added to wishlists |
| Discounts | MKT-DSC | 4 | Discount rules apply to products |
| Analytics | ADM-RPT | 6 | Product performance metrics |

### 2.3 Integration Hooks to Implement

```typescript
// Events emitted by Product Catalog
type ProductEvents =
  | "product.created"         // New product added
  | "product.updated"         // Product data changed
  | "product.archived"        // Product archived/hidden
  | "product.restored"        // Product restored from archive
  | "product.viewed"          // Product page visited
  | "product.price_changed"   // Price was modified
  | "product.stock_low"       // Inventory below threshold (delegated to Inventory System)
  | "product.out_of_stock";   // Inventory depleted (delegated to Inventory System)

// Product context for other systems
interface ProductContext {
  id: Id<"products">;
  name: string;
  slug: string;
  price: number;
  salePrice?: number;
  status: "draft" | "active" | "archived";
  stockCount: number;
  images: Id<"media">[];
}
```

---

## 3. Routes

> Source: Airtable Routes table

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles | Real-Time Features |
|-------|------|--------|---------------|-------|-------------------|
| Product Listing | `/products` | _marketing | No | Guest, Customer | Live stock badges |
| Product Detail | `/products/:slug` | _marketing | No | Guest, Customer | Live stock, presence |
| Category Products | `/categories/:slug` | _marketing | No | Guest, Customer | Live stock badges |

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles | Real-Time Features |
|-------|------|--------|---------------|-------|-------------------|
| Products List | `/admin/products` | _admin | Yes | Staff, Manager, Admin | Live status updates |
| Product Editor | `/admin/products/:id` | _admin | Yes | Staff, Manager, Admin | Real-time save sync |
| Product Create | `/admin/products/new` | _admin | Yes | Manager, Admin | - |

---

## 4. Data Model

### 4.1 Tables

```typescript
// admin-app/packages/backend/convex/schema.ts

// Products table - core product data
products: defineTable({
  // Identity
  name: v.string(),                    // Product name
  slug: v.string(),                    // URL-friendly slug
  sku: v.optional(v.string()),         // Stock Keeping Unit

  // Description
  description: v.optional(v.string()), // Full description (markdown)
  shortDescription: v.optional(v.string()), // Brief summary

  // Pricing
  basePrice: v.number(),               // Regular price in cents
  salePrice: v.optional(v.number()),   // Sale price in cents
  salePriceStartsAt: v.optional(v.number()), // Sale start timestamp
  salePriceEndsAt: v.optional(v.number()),   // Sale end timestamp

  // Media (Phase 1)
  images: v.array(v.id("media")),      // Ordered array of image IDs

  // Categories (Phase 3 - included for forward compatibility)
  categoryIds: v.optional(v.array(v.id("categories"))),

  // Inventory (Phase 3 - delegated but displayed)
  stockCount: v.number(),              // Current stock level
  lowStockThreshold: v.number(),       // Alert threshold
  trackInventory: v.boolean(),         // Whether to track stock
  allowBackorder: v.boolean(),         // Allow purchases when OOS

  // Variants (Phase 3 - flag for UI)
  hasVariants: v.boolean(),            // Whether product has variants

  // Reviews aggregate (Phase 5 - denormalized for performance)
  averageRating: v.optional(v.number()), // 1-5 star average
  reviewCount: v.number(),             // Total reviews

  // Real-time metrics
  viewCount: v.number(),               // Total views
  purchaseCount: v.number(),           // Total purchases

  // Status
  status: v.union(
    v.literal("draft"),      // Not visible on storefront
    v.literal("active"),     // Live and purchasable
    v.literal("archived")    // Hidden, not deleted
  ),

  // SEO
  metaTitle: v.optional(v.string()),
  metaDescription: v.optional(v.string()),
  canonicalUrl: v.optional(v.string()),

  // Physical properties (for shipping)
  weight: v.optional(v.number()),      // Weight in grams
  dimensions: v.optional(v.object({
    length: v.number(),
    width: v.number(),
    height: v.number(),
  })),

  // AI-Ready fields
  embedding: v.optional(v.array(v.float64())), // Vector embedding for similarity search
  aiMetadata: v.optional(v.string()),  // JSON: auto-generated tags, categories

  // UCP Compliance
  ucpEnabled: v.boolean(),             // Enable UCP for this product
  gtin: v.optional(v.string()),        // Global Trade Item Number (barcode)
  mpn: v.optional(v.string()),         // Manufacturer Part Number
  brand: v.optional(v.string()),       // Brand name

  // Timestamps
  createdAt: v.number(),
  updatedAt: v.number(),
  publishedAt: v.optional(v.number()), // When made active
})
  .index("by_slug", ["slug"])
  .index("by_status", ["status"])
  .index("by_sku", ["sku"])
  .index("by_category", ["categoryIds"])
  .index("by_created", ["createdAt"])
  .index("by_updated", ["updatedAt"])
  .index("by_published", ["publishedAt"])
  .searchIndex("search_products", {
    searchField: "name",
    filterFields: ["status", "categoryIds"],
  }),

// Product presence table - real-time viewers
productPresence: defineTable({
  productId: v.id("products"),
  sessionId: v.string(),           // Anonymous session identifier
  userId: v.optional(v.id("users")), // If logged in
  lastSeenAt: v.number(),          // Last activity timestamp
})
  .index("by_product", ["productId"])
  .index("by_session", ["sessionId"])
  .index("by_last_seen", ["lastSeenAt"]),

// Product views table - analytics
productViews: defineTable({
  productId: v.id("products"),
  userId: v.optional(v.id("users")),
  sessionId: v.string(),
  viewedAt: v.number(),
  source: v.optional(v.string()),   // search, category, direct, etc.
  referrer: v.optional(v.string()), // Previous page
})
  .index("by_product", ["productId"])
  .index("by_user", ["userId"])
  .index("by_date", ["viewedAt"]),
```

### 4.2 Relationships

```
products
  ├── media (many:many via images array)
  ├── categories (many:many via categoryIds)
  ├── productVariants (1:many) - Phase 3
  ├── productPresence (1:many) - Real-time viewers
  ├── productViews (1:many) - View analytics
  ├── reviews (1:many) - Phase 5
  ├── wishlistItems (1:many) - Phase 5
  ├── cartItems (1:many) - Phase 3
  └── orderItems (1:many) - Phase 4
```

### 4.3 Forward-Looking Fields

| Field | Future System | Purpose |
|-------|---------------|---------|
| `categoryIds` | Category System (Phase 3) | Multi-category assignment |
| `hasVariants` | Product Variants (Phase 3) | UI indicator for variant selector |
| `averageRating` | Reviews (Phase 5) | Denormalized rating display |
| `reviewCount` | Reviews (Phase 5) | Social proof count |
| `embedding` | AI Search | Vector similarity search |
| `aiMetadata` | AI Features | Auto-tagging, smart categorization |
| `ucpEnabled` | UCP Integration | Enable AI commerce |
| `gtin`, `mpn`, `brand` | UCP/Google | Product identification |

---

## 5. Actions

> Source: Airtable Actions table

### 5.1 Customer Actions

| Action | Code | Description | Roles | Triggers Events |
|--------|------|-------------|-------|-----------------|
| View Product | `product.view` | View a product detail page | Guest, Customer | `product.viewed` |
| Search Products | `product.search` | Search the product catalog | Guest, Customer | - |
| Filter Products | `product.filter` | Apply filters to product list | Guest, Customer | - |

### 5.2 Staff/Admin Actions

| Action | Code | Description | Roles | Triggers Events |
|--------|------|-------------|-------|-----------------|
| Create Product | `product.create` | Create a new product | Manager, Admin | `product.created` |
| Update Product | `product.update` | Modify product details | Staff, Manager, Admin | `product.updated` |
| Archive Product | `product.archive` | Archive/hide a product | Manager, Admin | `product.archived` |
| Restore Product | `product.restore` | Restore archived product | Manager, Admin | `product.restored` |
| Delete Product | `product.delete` | Permanently delete product | Admin | - |
| Bulk Update | `product.bulk_update` | Update multiple products | Manager, Admin | Multiple `product.updated` |
| Update Price | `product.update_price` | Change product pricing | Manager, Admin | `product.price_changed` |

---

## 6. Events

> Source: Airtable Events table

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Product Created | `product.created` | New product saved | `{ productId: Id, name: string, sku?: string, status: string }` |
| Product Updated | `product.updated` | Product data modified | `{ productId: Id, fields: string[], previousValues: object }` |
| Product Archived | `product.archived` | Product set to archived | `{ productId: Id, name: string }` |
| Product Restored | `product.restored` | Product restored from archive | `{ productId: Id, name: string }` |
| Product Viewed | `product.viewed` | Product page visited | `{ productId: Id, userId?: Id, sessionId: string, source?: string }` |
| Price Changed | `product.price_changed` | Base or sale price modified | `{ productId: Id, previousPrice: number, newPrice: number, priceType: 'base' \| 'sale' }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| `media.deleted` | Media Library | Remove deleted images from products |
| `category.deleted` | Category System | Remove category from categoryIds |
| `inventory.updated` | Inventory System | Update stockCount (if not directly managed) |

---

## 7. Notifications

### 7.1 Email Notifications

| Name | Trigger Event | Recipient | Template Variables |
|------|---------------|-----------|-------------------|
| Product Published | `product.created` (if status=active) | Admin | `{{productName}}, {{productUrl}}` |
| Price Change Alert | `product.price_changed` | Wishlist users | `{{productName}}, {{oldPrice}}, {{newPrice}}` |

### 7.2 Site Notifications

| Name | Trigger Event | Recipient | Message |
|------|---------------|-----------|---------|
| Product Created | `product.created` | Admin | "New product '{{name}}' created" |
| Price Drop Alert | `product.price_changed` | Wishlist users | "{{name}} price dropped from {{old}} to {{new}}" |

---

## 8. User Interface

### 8.1 Components Needed

**Storefront Components:**
- [ ] `ProductCard` - Card display with image, name, price, quick-add
- [ ] `ProductGrid` - Responsive grid of ProductCards with loading states
- [ ] `ProductListItem` - List view variant for search results
- [ ] `ProductDetail` - Full product page layout
- [ ] `ProductGallery` - Image carousel/gallery with zoom
- [ ] `ProductInfo` - Name, price, description, add-to-cart
- [ ] `ProductPrice` - Price display with sale formatting
- [ ] `StockBadge` - Real-time stock status indicator
- [ ] `ViewerCount` - "5 people viewing" presence display
- [ ] `ProductFilters` - Category, price, availability filters
- [ ] `ProductSort` - Sort dropdown (price, name, newest)
- [ ] `AddToCartButton` - Quantity selector + add to cart
- [ ] `WishlistButton` - Heart icon (placeholder for Phase 5)

**Admin Components:**
- [ ] `ProductTable` - Sortable data table with bulk actions
- [ ] `ProductForm` - Create/edit form with all fields
- [ ] `ProductImageUploader` - Multi-image upload with ordering
- [ ] `ProductSEOEditor` - Meta title, description, canonical
- [ ] `ProductStatusBadge` - Draft/Active/Archived indicator
- [ ] `ProductQuickEdit` - Inline edit for common fields
- [ ] `BulkActionsBar` - Archive, activate, delete selected

### 8.2 Real-Time UI Patterns

```tsx
// Live stock display on product page
function StockStatus({ productId }: { productId: Id<"products"> }) {
  const product = useQuery(api.products.get, { id: productId });

  if (product === undefined) return <Skeleton />;

  return (
    <div className={cn(
      product.stockCount === 0 && "text-red-600",
      product.stockCount <= product.lowStockThreshold && "text-orange-500",
      product.stockCount > product.lowStockThreshold && "text-green-600"
    )}>
      {product.stockCount === 0
        ? "Out of Stock"
        : product.stockCount <= product.lowStockThreshold
          ? `Only ${product.stockCount} left!`
          : "In Stock"
      }
    </div>
  );
}

// Live viewer count with presence
function ViewerCount({ productId }: { productId: Id<"products"> }) {
  const viewers = useQuery(api.presence.getProductViewers, { productId });

  if (!viewers || viewers.count <= 1) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <EyeIcon className="h-4 w-4" />
      <span>{viewers.count} people viewing</span>
    </div>
  );
}
```

### 8.3 States

**Loading States:**
- Product grid skeleton (shimmer cards)
- Product detail skeleton
- Image loading placeholder
- Price loading (rare, real-time)

**Empty States:**
- No products found (search/filter)
- No products in category

**Error States:**
- Product not found (404)
- Failed to load products (network error)
- Failed to add to cart

**Success States:**
- Product created toast
- Product updated toast
- Added to cart animation

---

## 9. Business Rules

### 9.1 Validation Rules

**Name:**
- Required
- 2-200 characters
- No leading/trailing whitespace

**Slug:**
- Required
- Lowercase alphanumeric with hyphens
- Unique across all products
- Auto-generated from name if not provided
- 2-100 characters

**SKU:**
- Optional but recommended
- Unique if provided
- Alphanumeric with dashes/underscores
- Max 50 characters

**Price:**
- Required (basePrice)
- Minimum: 0 (free products allowed)
- Maximum: 999999999 (in cents = $9,999,999.99)
- Integer only (stored in cents)

**Sale Price:**
- Optional
- Must be less than basePrice
- If provided, requires salePriceEndsAt

**Images:**
- At least 1 required for active products
- Max 20 images per product
- Order matters (first is primary)

**Status:**
- Draft: Can be saved without images
- Active: Requires at least 1 image
- Archived: Retains all data, hidden from storefront

### 9.2 Business Logic

1. **Slug Generation:**
   - Auto-generate from name if not provided
   - Handle duplicates by appending `-2`, `-3`, etc.
   - Preserve existing slug on name update (unless explicitly changed)

2. **Price Display:**
   - Show sale price if active and within date range
   - Show original price struck through when on sale
   - Show savings percentage for sales

3. **Stock Display:**
   - "In Stock" when stockCount > lowStockThreshold
   - "Only X left!" when stockCount ≤ lowStockThreshold
   - "Out of Stock" when stockCount = 0
   - "Available for Backorder" when allowBackorder = true and stockCount = 0

4. **Presence Tracking:**
   - Update presence every 30 seconds
   - Expire presence after 60 seconds of inactivity
   - Aggregate for display (don't show individual users)

5. **View Counting:**
   - Debounce views (one per session per 30 min)
   - Track source for attribution
   - Update aggregate viewCount on product

### 9.3 Edge Cases

| Scenario | Handling |
|----------|----------|
| Duplicate slug on save | Append incrementing suffix (-2, -3, etc.) |
| Delete product with cart items | Prevent deletion, show error with count |
| Archive product in active carts | Allow archive, show "unavailable" in cart |
| Price change during checkout | Validate price at order creation, show warning |
| Image deleted from media library | Remove from product images array |
| Category deleted | Remove from categoryIds, product remains |
| Sale price expires mid-session | UI updates in real-time via subscription |

---

## 10. API Design

### 10.1 Queries (Read Operations)

```typescript
// Get single product by ID
export const get = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get product by slug (for storefront)
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!product || product.status !== "active") {
      return null;
    }

    // Include presence count
    const viewers = await ctx.db
      .query("productPresence")
      .withIndex("by_product", (q) => q.eq("productId", product._id))
      .filter((q) => q.gt(q.field("lastSeenAt"), Date.now() - 60000))
      .collect();

    return {
      ...product,
      viewerCount: viewers.length,
    };
  },
});

// List products with pagination and filters
export const list = query({
  args: {
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("archived")
    )),
    categoryId: v.optional(v.id("categories")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    sortBy: v.optional(v.union(
      v.literal("newest"),
      v.literal("oldest"),
      v.literal("price_asc"),
      v.literal("price_desc"),
      v.literal("name")
    )),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    let query = ctx.db.query("products");

    if (args.status) {
      query = query.withIndex("by_status", (q) => q.eq("status", args.status));
    }

    const products = await query.collect();

    // Filter by category if provided
    let filtered = products;
    if (args.categoryId) {
      filtered = products.filter((p) =>
        p.categoryIds?.includes(args.categoryId)
      );
    }

    // Sort
    const sortFn = {
      newest: (a, b) => b.createdAt - a.createdAt,
      oldest: (a, b) => a.createdAt - b.createdAt,
      price_asc: (a, b) => a.basePrice - b.basePrice,
      price_desc: (a, b) => b.basePrice - a.basePrice,
      name: (a, b) => a.name.localeCompare(b.name),
    }[args.sortBy ?? "newest"];

    filtered.sort(sortFn);

    // Paginate
    const startIndex = args.cursor ? parseInt(args.cursor) : 0;
    const page = filtered.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < filtered.length
      ? String(startIndex + limit)
      : null;

    return {
      products: page,
      nextCursor,
      totalCount: filtered.length,
    };
  },
});

// Search products
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.query.trim()) {
      return [];
    }

    const results = await ctx.db
      .query("products")
      .withSearchIndex("search_products", (q) =>
        q.search("name", args.query).eq("status", "active")
      )
      .take(args.limit ?? 20);

    return results;
  },
});

// Get product count by status (admin dashboard)
export const getCountsByStatus = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();

    return {
      draft: products.filter((p) => p.status === "draft").length,
      active: products.filter((p) => p.status === "active").length,
      archived: products.filter((p) => p.status === "archived").length,
      total: products.length,
    };
  },
});
```

### 10.2 Mutations (Write Operations)

```typescript
// Create new product
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    sku: v.optional(v.string()),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    basePrice: v.number(),
    salePrice: v.optional(v.number()),
    salePriceEndsAt: v.optional(v.number()),
    images: v.array(v.id("media")),
    categoryIds: v.optional(v.array(v.id("categories"))),
    stockCount: v.number(),
    lowStockThreshold: v.number(),
    trackInventory: v.boolean(),
    allowBackorder: v.boolean(),
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("archived")
    )),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    weight: v.optional(v.number()),
    ucpEnabled: v.optional(v.boolean()),
    gtin: v.optional(v.string()),
    mpn: v.optional(v.string()),
    brand: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate auth
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Generate or validate slug
    let slug = args.slug || generateSlug(args.name);
    slug = await ensureUniqueSlug(ctx, slug);

    // Validate SKU uniqueness
    if (args.sku) {
      const existingSku = await ctx.db
        .query("products")
        .withIndex("by_sku", (q) => q.eq("sku", args.sku))
        .unique();
      if (existingSku) {
        throw new Error("SKU already exists");
      }
    }

    // Validate active status requires image
    if (args.status === "active" && args.images.length === 0) {
      throw new Error("Active products require at least one image");
    }

    const now = Date.now();

    const productId = await ctx.db.insert("products", {
      name: args.name,
      slug,
      sku: args.sku,
      description: args.description,
      shortDescription: args.shortDescription,
      basePrice: args.basePrice,
      salePrice: args.salePrice,
      salePriceEndsAt: args.salePriceEndsAt,
      images: args.images,
      categoryIds: args.categoryIds ?? [],
      stockCount: args.stockCount,
      lowStockThreshold: args.lowStockThreshold,
      trackInventory: args.trackInventory,
      allowBackorder: args.allowBackorder,
      hasVariants: false,
      averageRating: undefined,
      reviewCount: 0,
      viewCount: 0,
      purchaseCount: 0,
      status: args.status ?? "draft",
      metaTitle: args.metaTitle,
      metaDescription: args.metaDescription,
      weight: args.weight,
      ucpEnabled: args.ucpEnabled ?? false,
      gtin: args.gtin,
      mpn: args.mpn,
      brand: args.brand,
      createdAt: now,
      updatedAt: now,
      publishedAt: args.status === "active" ? now : undefined,
    });

    // Dispatch event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "product.created",
      payload: {
        productId,
        name: args.name,
        sku: args.sku,
        status: args.status ?? "draft",
      },
    });

    return productId;
  },
});

// Update product
export const update = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    basePrice: v.optional(v.number()),
    salePrice: v.optional(v.number()),
    salePriceEndsAt: v.optional(v.number()),
    images: v.optional(v.array(v.id("media"))),
    categoryIds: v.optional(v.array(v.id("categories"))),
    stockCount: v.optional(v.number()),
    lowStockThreshold: v.optional(v.number()),
    trackInventory: v.optional(v.boolean()),
    allowBackorder: v.optional(v.boolean()),
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("archived")
    )),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    weight: v.optional(v.number()),
    ucpEnabled: v.optional(v.boolean()),
    gtin: v.optional(v.string()),
    mpn: v.optional(v.string()),
    brand: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Product not found");

    // Track changes for event
    const changes: string[] = [];
    const previousValues: Record<string, any> = {};

    // Check for price change
    const priceChanged = args.basePrice !== undefined && args.basePrice !== existing.basePrice;
    if (priceChanged) {
      previousValues.basePrice = existing.basePrice;
    }

    // Validate slug uniqueness if changed
    if (args.slug && args.slug !== existing.slug) {
      const slugExists = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug))
        .unique();
      if (slugExists && slugExists._id !== args.id) {
        throw new Error("Slug already exists");
      }
      changes.push("slug");
    }

    const now = Date.now();

    // Determine publishedAt
    let publishedAt = existing.publishedAt;
    if (args.status === "active" && existing.status !== "active") {
      publishedAt = now;
    }

    await ctx.db.patch(args.id, {
      ...args,
      id: undefined, // Don't patch the id
      updatedAt: now,
      publishedAt,
    });

    // Dispatch update event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "product.updated",
      payload: {
        productId: args.id,
        fields: changes,
        previousValues,
      },
    });

    // Dispatch price change event if applicable
    if (priceChanged) {
      await ctx.scheduler.runAfter(0, internal.events.dispatch, {
        eventCode: "product.price_changed",
        payload: {
          productId: args.id,
          previousPrice: existing.basePrice,
          newPrice: args.basePrice,
          priceType: "base",
        },
      });
    }

    return args.id;
  },
});

// Archive product
export const archive = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const product = await ctx.db.get(args.id);
    if (!product) throw new Error("Product not found");

    await ctx.db.patch(args.id, {
      status: "archived",
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "product.archived",
      payload: { productId: args.id, name: product.name },
    });

    return args.id;
  },
});

// Track product view
export const trackView = mutation({
  args: {
    productId: v.id("products"),
    sessionId: v.string(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity ? await getUserId(ctx, identity.email) : undefined;

    // Check for recent view (debounce)
    const recentView = await ctx.db
      .query("productViews")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .filter((q) =>
        q.and(
          q.eq(q.field("sessionId"), args.sessionId),
          q.gt(q.field("viewedAt"), Date.now() - 30 * 60 * 1000) // 30 min
        )
      )
      .first();

    if (recentView) return; // Already viewed recently

    // Record view
    await ctx.db.insert("productViews", {
      productId: args.productId,
      userId,
      sessionId: args.sessionId,
      viewedAt: Date.now(),
      source: args.source,
    });

    // Increment view count
    const product = await ctx.db.get(args.productId);
    if (product) {
      await ctx.db.patch(args.productId, {
        viewCount: product.viewCount + 1,
      });
    }

    // Update presence
    await updatePresence(ctx, args.productId, args.sessionId, userId);

    // Dispatch event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "product.viewed",
      payload: {
        productId: args.productId,
        userId,
        sessionId: args.sessionId,
        source: args.source,
      },
    });
  },
});
```

### 10.3 Actions (External/Async Operations)

```typescript
// Generate embedding for product (AI search)
export const generateEmbedding = action({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.runQuery(api.products.get, { id: args.productId });
    if (!product) throw new Error("Product not found");

    const text = `${product.name} ${product.description || ""} ${product.shortDescription || ""}`;

    // Call embedding API (OpenAI, Anthropic, etc.)
    const embedding = await generateTextEmbedding(text);

    // Save embedding
    await ctx.runMutation(internal.products.saveEmbedding, {
      productId: args.productId,
      embedding,
    });

    return { success: true };
  },
});

// Generate AI metadata (tags, categories)
export const generateAIMetadata = action({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.runQuery(api.products.get, { id: args.productId });
    if (!product) throw new Error("Product not found");

    // Call AI API for metadata generation
    const metadata = await generateProductMetadata(product);

    await ctx.runMutation(internal.products.saveAIMetadata, {
      productId: args.productId,
      aiMetadata: JSON.stringify(metadata),
    });

    return { success: true, metadata };
  },
});
```

---

## 11. UCP & MCP Integration

### 11.1 Universal Commerce Protocol (UCP) Compliance

**Discovery Endpoint:**
```
GET /.well-known/ucp
```

Returns:
```json
{
  "version": "1.0",
  "capabilities": ["checkout", "order", "inventory"],
  "rest": {
    "endpoint": "https://api.yourstore.com/ucp"
  },
  "product_feed": {
    "url": "https://api.yourstore.com/feed/products.json",
    "format": "json"
  }
}
```

**Product Feed for UCP:**
```typescript
// API route: /api/feed/products
export default async function handler(req: Request) {
  const products = await convex.query(api.products.list, {
    status: "active",
    limit: 1000,
  });

  return Response.json({
    products: products.products.map((p) => ({
      id: p._id,
      title: p.name,
      description: p.description,
      link: `https://yourstore.com/products/${p.slug}`,
      image_link: getImageUrl(p.images[0]),
      price: `${p.basePrice / 100} USD`,
      sale_price: p.salePrice ? `${p.salePrice / 100} USD` : undefined,
      availability: p.stockCount > 0 ? "in_stock" : "out_of_stock",
      gtin: p.gtin,
      mpn: p.mpn,
      brand: p.brand,
      native_commerce: p.ucpEnabled,
    })),
  });
}
```

### 11.2 MCP Server Tools

**Product Tools for AI Agents:**

```typescript
// MCP Tool: search_products
{
  name: "search_products",
  description: "Search for products in the catalog",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      categoryId: { type: "string", description: "Filter by category" },
      minPrice: { type: "number", description: "Minimum price in cents" },
      maxPrice: { type: "number", description: "Maximum price in cents" },
      inStock: { type: "boolean", description: "Only show in-stock items" },
      limit: { type: "number", description: "Max results", default: 20 },
    },
    required: ["query"],
  },
  handler: async ({ query, categoryId, minPrice, maxPrice, inStock, limit }) => {
    // Implementation calls Convex query
  },
}

// MCP Tool: get_product
{
  name: "get_product",
  description: "Get full product details by ID or slug",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Product ID" },
      slug: { type: "string", description: "Product slug" },
    },
  },
  handler: async ({ id, slug }) => {
    // Implementation calls Convex query
  },
}

// MCP Tool: check_inventory
{
  name: "check_inventory",
  description: "Check product availability",
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string", description: "Product ID", required: true },
      quantity: { type: "number", description: "Desired quantity", default: 1 },
    },
    required: ["productId"],
  },
  handler: async ({ productId, quantity }) => {
    const product = await convex.query(api.products.get, { id: productId });
    return {
      available: product.stockCount >= quantity,
      stockCount: product.stockCount,
      allowBackorder: product.allowBackorder,
    };
  },
}

// MCP Tool: list_products
{
  name: "list_products",
  description: "List products with optional filters",
  inputSchema: {
    type: "object",
    properties: {
      categoryId: { type: "string" },
      sortBy: { type: "string", enum: ["newest", "price_asc", "price_desc"] },
      limit: { type: "number", default: 20 },
      cursor: { type: "string" },
    },
  },
  handler: async (args) => {
    return await convex.query(api.products.list, { ...args, status: "active" });
  },
}
```

**MCP Resources:**

```typescript
// Resource: product://{productId}
// Returns full product data

// Resource: products://category/{slug}
// Returns products in a category

// Resource: products://search?q={query}
// Returns search results

// Resource: products://featured
// Returns featured/promoted products
```

---

## 12. Security Considerations

### 12.1 Authentication Requirements

| Route/Action | Requirement |
|--------------|-------------|
| View products | Public (no auth required) |
| Search products | Public |
| Create product | Manager or Admin |
| Update product | Staff, Manager, or Admin |
| Archive product | Manager or Admin |
| Delete product | Admin only |
| Access admin routes | Authenticated staff+ |

### 12.2 Authorization Rules

```typescript
// Helper to check product permissions
async function checkProductPermission(
  ctx: MutationCtx,
  action: "create" | "update" | "archive" | "delete"
): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");

  const user = await getUserByEmail(ctx, identity.email);
  if (!user) throw new Error("User not found");

  const role = await ctx.db.get(user.roleId);
  const level = role?.level ?? 0;

  const requiredLevel = {
    create: 80,   // Manager
    update: 50,   // Staff
    archive: 80,  // Manager
    delete: 100,  // Admin
  }[action];

  if (level < requiredLevel) {
    throw new Error(`Insufficient permissions for ${action}`);
  }
}
```

### 12.3 Data Privacy

**Public Data:**
- Product name, description, images
- Pricing (current and sale)
- Stock status (not exact count for competitive reasons)
- Category assignments

**Protected Data:**
- Exact stock counts (visible to staff+)
- View analytics and metrics
- SKU (internal use)
- Supplier/cost information (future)

### 12.4 Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Product list | 100 | 1 minute |
| Product search | 60 | 1 minute |
| Product view track | 10 | 1 minute per product |
| Create product | 30 | 1 hour |
| Update product | 60 | 1 hour |

---

## 13. Testing Strategy

### 13.1 Unit Tests

- `generateSlug` - Slug generation from name
- `ensureUniqueSlug` - Unique slug handling
- Price display logic (sale vs regular)
- Stock status calculation
- Presence timeout logic
- View debouncing logic

### 13.2 Integration Tests

- Create product → Event dispatched
- Update product → Changes persisted, event dispatched
- Price change → Wishlist notifications triggered
- Archive product → Status updated, still queryable by admin
- Image upload → Product images array updated
- Presence tracking → Viewer count updates correctly

### 13.3 E2E Tests

- View product listing page with filters
- Navigate to product detail page
- See real-time stock indicator
- See "X people viewing" (with mock)
- Admin: Create new product
- Admin: Edit existing product
- Admin: Archive and restore product
- Search for products, verify results

### 13.4 Performance Tests

- Load product listing with 1000+ products
- Search performance with large catalog
- Presence updates with many concurrent viewers
- Image gallery loading with multiple images

---

## 14. Implementation Checklist

### Phase 1: Foundation
- [ ] Define schema in `convex/schema.ts`
- [ ] Create basic CRUD mutations (create, update, get, list)
- [ ] Add indexes for common queries
- [ ] Implement slug generation and uniqueness
- [ ] Set up Convex search index

### Phase 2: Core Features
- [ ] Create product listing page (`/products`)
- [ ] Create product detail page (`/products/:slug`)
- [ ] Build `ProductCard` component
- [ ] Build `ProductGrid` component
- [ ] Build `ProductDetail` component
- [ ] Implement filtering and sorting
- [ ] Implement pagination

### Phase 3: Admin Interface
- [ ] Create admin product list (`/admin/products`)
- [ ] Create product editor (`/admin/products/:id`)
- [ ] Build `ProductForm` component
- [ ] Build `ProductImageUploader` component
- [ ] Implement bulk actions
- [ ] Add status workflow UI

### Phase 4: Real-Time Features
- [ ] Implement presence tracking
- [ ] Build `ViewerCount` component
- [ ] Build `StockBadge` component
- [ ] Add view tracking mutation
- [ ] Wire up real-time stock display

### Phase 5: Integration
- [ ] Dispatch all product events
- [ ] Connect to Media Library for images
- [ ] Add SEO metadata generation
- [ ] Implement structured data for products
- [ ] Build product sitemap generator

### Phase 6: UCP/MCP
- [ ] Implement UCP discovery endpoint
- [ ] Create product feed endpoint
- [ ] Build MCP tools for product access
- [ ] Add UCP fields to product form
- [ ] Test with AI agents

### Phase 7: Polish
- [ ] Add error handling and validation
- [ ] Implement loading skeletons
- [ ] Add empty state designs
- [ ] Optimize image loading
- [ ] Performance testing and optimization

---

## 15. Future Considerations

### AI-Enhanced Features
- Vector similarity search for "more like this"
- Auto-generated product descriptions
- Smart tagging and categorization
- Personalized product recommendations
- Visual search (find by image)

### Live Commerce
- Real-time price drops (flash sales)
- Live inventory countdown
- Purchase notifications ("John just bought this")
- Collaborative browsing

### Advanced Catalog
- Product bundles and kits
- Configurable products (build your own)
- Subscription products
- Digital products and downloads
- Product comparisons

### Internationalization
- Multi-currency pricing
- Translated content
- Region-specific availability
- Localized tax handling

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System (Product Catalog) | recXXXXX |
| Routes | recXXXXX, recXXXXX |
| Actions | recXXXXX, recXXXXX |
| Events | recXXXXX, recXXXXX |

### B. Related Documentation
- [Action Plan](./ACTION-PLAN.md)
- [Tech Stack](../.claude/CLAUDE.md)
- [Media Library PRD](./PRD-MEDIA-LIBRARY.md)
- [Category System PRD](./PRD-CATEGORY-SYSTEM.md)

### C. Convex Real-Time Patterns Reference

```typescript
// Pattern: Optimistic update for add to cart
const addToCart = useMutation(api.cart.addItem).withOptimisticUpdate(
  (localStore, args) => {
    const cart = localStore.getQuery(api.cart.getMine, {});
    if (cart) {
      localStore.setQuery(api.cart.getMine, {}, {
        ...cart,
        items: [...cart.items, { productId: args.productId, quantity: 1 }],
      });
    }
  }
);

// Pattern: Real-time subscription with loading state
function ProductPrice({ productId }) {
  const product = useQuery(api.products.get, { id: productId });

  if (product === undefined) return <Skeleton />;
  if (product === null) return <NotFound />;

  const isOnSale = product.salePrice &&
    product.salePriceEndsAt > Date.now();

  return (
    <div>
      {isOnSale ? (
        <>
          <span className="line-through">${product.basePrice / 100}</span>
          <span className="text-red-600">${product.salePrice / 100}</span>
        </>
      ) : (
        <span>${product.basePrice / 100}</span>
      )}
    </div>
  );
}

// Pattern: Presence heartbeat
useEffect(() => {
  const sessionId = getSessionId();

  // Initial presence
  updatePresence({ productId, sessionId });

  // Heartbeat every 30 seconds
  const interval = setInterval(() => {
    updatePresence({ productId, sessionId });
  }, 30000);

  return () => clearInterval(interval);
}, [productId]);
```

---

**PRD Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
**Author:** Claude (AI Assistant)
