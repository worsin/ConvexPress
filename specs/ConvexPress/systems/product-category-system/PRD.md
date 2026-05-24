# PRD: Category System

> **Origin:** Ported from VexCart on 2026-04-22, integrated into ConvexPress.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce is not a separate app; it is a first-class layer inside ConvexPress alongside posts, pages, media, users, and taxonomies. Every commerce feature is either **baked into the commerce core** or **gated as an internal extension** via `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts` (feature flags, not a third-party marketplace).
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Customer-facing UIs serve `Subscriber` + guests.
> **No third-party plugin/theme marketplace.** AI builds custom per-site. Internally, "extensions" are feature-flagged modules (Bundles, Digital, Returns, Reviews, Wishlists, Subscriptions, Add-Ons, Membership) that live in `convex/commerce<Thing>/` with a `<thing>Enabled` settings flag and a `require<Thing>Enabled(ctx)` gate on every mutation/query.
> **Package manager:** Bun. **UI:** Base UI (not Radix). **Styling:** Tailwind v4. **Payments:** Stripe (see `agents/knowledge/stripe-integration.md`).



---

## Integration with ConvexPress

**Positioning:** baked into commerce core.
**Code lives at:** `ConvexPress-Admin/packages/backend/convex/commerce/categories.ts`

**Consumes these ConvexPress systems:**

- **Taxonomy System** — ConvexPress has a single unified taxonomy engine; product categories are a `product_cat`-style taxonomy sitting alongside content categories/tags.
- **Product System** — products join categories via `commerce_product_categories` many-to-many.
- **Routing System** — `/category/:slug` URLs (WordPress permalink convention).
- **SEO System** — per-category meta + sitemap inclusion.

**WooCommerce analog:** WooCommerce `product_cat` taxonomy — hierarchical category tree with per-term permalinks.

---
## 1. Overview

### 1.1 Purpose

The Category System provides hierarchical organization for products in the catalog. It enables customers to browse products by logical groupings and supports multi-level category structures (e.g., Electronics → Phones → Smartphones). Built on Convex's real-time architecture, category changes propagate instantly to all connected clients, and category pages display live product counts.

### 1.2 Scope

**In Scope:**
- Hierarchical category tree (parent/child relationships)
- Category CRUD operations
- Category assignment to products (many-to-many)
- Category pages with filtered product grids
- Category navigation menus
- Category images and descriptions
- Real-time product counts per category
- Admin category management interface
- Drag-and-drop category ordering
- MCP tools for category browsing

**Out of Scope:**
- Product management (the Product System PRD (`specs/ConvexPress/systems/product-system/PRD.md`))
- Product filtering beyond category (PRD-SEARCH-SYSTEM)
- Dynamic/smart collections (future enhancement)
- Category-specific discounts (the Commerce Core PRD's Discounts section (no standalone PRD yet — see `.codex/docs/COMMERCE-CORE-PLUGIN-PRD.md`))

### 1.3 Key Features: Convex-Native

| Feature | Implementation |
|---------|----------------|
| Live product counts | Reactive query updates when products change |
| Instant category updates | Real-time sync across all admin sessions |
| Fast navigation | Cached category tree, instant UI updates |

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Event System | PLT-EVT | 0 | Category events for notifications |
| Authentication | PLT-AUT | 0 | Admin access requires auth |
| Media Library | PLT-MED | 1 | Category images |
| Product Catalog | CAT-PRD | 2 | Products to categorize |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Product Catalog | CAT-PRD | 2 | Category filtering on product pages |
| Search System | PLT-SRC | 3 | Category facets in search |
| Shopping Cart | ORD-CRT | 3 | Category-based recommendations |
| Discounts | MKT-DSC | 4 | Category-level discounts |
| Analytics | ADM-RPT | 6 | Sales by category reports |

### 2.3 Integration Hooks

```typescript
// Events emitted by Category System
type CategoryEvents =
  | "category.created"      // New category added
  | "category.updated"      // Category data changed
  | "category.deleted"      // Category removed
  | "category.reordered";   // Category sort order changed

// Category context for other systems
interface CategoryContext {
  id: Id<"categories">;
  name: string;
  slug: string;
  parentId?: Id<"categories">;
  productCount: number;
  depth: number;
}
```

---

## 3. Routes

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Category Page | `/categories/:slug` | _marketing | No | Guest, Customer |
| All Categories | `/categories` | _marketing | No | Guest, Customer |

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Category Management | `/admin/categories` | _admin | Yes | Staff, Manager, Admin |

---

## 4. Data Model

### 4.1 Tables

```typescript
// admin-app/packages/backend/convex/schema.ts

// Categories table - hierarchical product groupings
categories: defineTable({
  // Identity
  name: v.string(),                         // Display name
  slug: v.string(),                         // URL-friendly identifier

  // Hierarchy
  parentId: v.optional(v.id("categories")), // Parent category (null = root)
  depth: v.number(),                        // Nesting level (0 = root)
  path: v.array(v.id("categories")),        // Ancestor IDs for breadcrumbs

  // Display
  description: v.optional(v.string()),      // Category description
  image: v.optional(v.id("media")),         // Hero/banner image
  icon: v.optional(v.string()),             // Icon name or SVG

  // Ordering
  sortOrder: v.number(),                    // Display order within parent

  // Metrics (denormalized for performance)
  productCount: v.number(),                 // Active products in this category
  totalProductCount: v.number(),            // Including subcategories

  // Display options
  isVisible: v.boolean(),                   // Show on storefront
  isFeatured: v.boolean(),                  // Show in featured section
  showInNav: v.boolean(),                   // Show in navigation menu

  // SEO
  metaTitle: v.optional(v.string()),
  metaDescription: v.optional(v.string()),

  // Timestamps
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_slug", ["slug"])
  .index("by_parent", ["parentId", "sortOrder"])
  .index("by_visible", ["isVisible"])
  .index("by_featured", ["isFeatured"]),
```

### 4.2 Relationships

```
categories
  ├── categories (self-referential, 1:many via parentId)
  ├── media (many:1 via image)
  └── products (many:many via products.categoryIds)
```

### 4.3 Category Tree Example

```
Electronics (depth: 0)
├── Phones (depth: 1)
│   ├── Smartphones (depth: 2)
│   └── Feature Phones (depth: 2)
├── Computers (depth: 1)
│   ├── Laptops (depth: 2)
│   └── Desktops (depth: 2)
└── Accessories (depth: 1)

Clothing (depth: 0)
├── Men's (depth: 1)
└── Women's (depth: 1)
```

---

## 5. Actions

### 5.1 Customer Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Browse Category | `category.browse` | View category page with products | Guest, Customer |
| Navigate Categories | `category.navigate` | Use category menu | Guest, Customer |

### 5.2 Staff/Admin Actions

| Action | Code | Description | Roles | Triggers Events |
|--------|------|-------------|-------|-----------------|
| Create Category | `category.create` | Add new category | Manager, Admin | `category.created` |
| Update Category | `category.update` | Modify category details | Staff, Manager, Admin | `category.updated` |
| Delete Category | `category.delete` | Remove category | Admin | `category.deleted` |
| Reorder Categories | `category.reorder` | Change sort order | Staff, Manager, Admin | `category.reordered` |
| Move Category | `category.move` | Change parent category | Manager, Admin | `category.updated` |

---

## 6. Events

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Category Created | `category.created` | New category saved | `{ categoryId: Id, name: string, parentId?: Id }` |
| Category Updated | `category.updated` | Category data modified | `{ categoryId: Id, fields: string[] }` |
| Category Deleted | `category.deleted` | Category removed | `{ categoryId: Id, name: string, productsMoved: number }` |
| Categories Reordered | `category.reordered` | Sort order changed | `{ parentId?: Id, newOrder: Id[] }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| `product.created` | Product Catalog | Increment productCount for assigned categories |
| `product.updated` | Product Catalog | Update productCount if categoryIds changed |
| `product.archived` | Product Catalog | Decrement productCount |

---

## 7. Notifications

### 7.1 Site Notifications (Admin Only)

| Name | Trigger Event | Recipient | Message |
|------|---------------|-----------|---------|
| Category Created | `category.created` | Admin | "New category '{{name}}' created" |

---

## 8. User Interface

### 8.1 Components Needed

**Storefront Components:**
- [ ] `CategoryNav` - Navigation menu with categories
- [ ] `CategoryTree` - Expandable category sidebar
- [ ] `CategoryCard` - Card for category grid display
- [ ] `CategoryBreadcrumbs` - Breadcrumb trail
- [ ] `CategoryHeader` - Hero section with image and description
- [ ] `CategoryProductGrid` - Products filtered by category

**Admin Components:**
- [ ] `CategoryTree` - Drag-and-drop tree editor
- [ ] `CategoryForm` - Create/edit form
- [ ] `CategoryNodeItem` - Single category in tree
- [ ] `CategoryMoveDialog` - Dialog to change parent
- [ ] `CategoryDeleteDialog` - Confirm deletion with product handling

### 8.2 States

**Loading States:**
- Category tree skeleton
- Category page products loading

**Empty States:**
- No products in category
- No subcategories

**Error States:**
- Category not found
- Failed to load categories

---

## 9. Business Rules

### 9.1 Validation Rules

**Name:**
- Required
- 2-100 characters

**Slug:**
- Required, unique
- Auto-generated from name if not provided
- Lowercase alphanumeric with hyphens

**Hierarchy:**
- Max depth: 3 levels (configurable)
- Cannot be parent of itself
- Cannot create circular references

### 9.2 Business Logic

1. **Product Count Updates:**
   - Increment when product added to category
   - Decrement when product removed or archived
   - Cascade up to parent categories for totalProductCount

2. **Deletion Handling:**
   - Option 1: Move products to parent category
   - Option 2: Unassign products from deleted category
   - Subcategories must be moved or deleted first

3. **Slug Generation:**
   - Auto-generate from name
   - Handle duplicates with suffix (-2, -3, etc.)
   - Include parent slug for nested categories (optional)

4. **Visibility Cascade:**
   - Hidden parent hides all children
   - Children can be individually hidden

### 9.3 Edge Cases

| Scenario | Handling |
|----------|----------|
| Delete category with products | Prompt to move products first |
| Delete category with subcategories | Require subcategories deleted first |
| Move category to deeper level | Validate max depth not exceeded |
| Circular reference attempt | Validate and reject |

---

## 10. API Design

### 10.1 Queries

```typescript
// Get category by slug (storefront)
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const category = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!category || !category.isVisible) {
      return null;
    }

    // Get parent chain for breadcrumbs
    const ancestors = await Promise.all(
      category.path.map((id) => ctx.db.get(id))
    );

    return {
      ...category,
      ancestors: ancestors.filter(Boolean),
    };
  },
});

// Get category tree (navigation)
export const getTree = query({
  args: {
    parentId: v.optional(v.id("categories")),
    visibleOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("categories").withIndex("by_parent");

    if (args.parentId) {
      query = query.filter((q) => q.eq(q.field("parentId"), args.parentId));
    } else {
      query = query.filter((q) => q.eq(q.field("parentId"), undefined));
    }

    const categories = await query.collect();

    // Filter visibility if needed
    const visible = args.visibleOnly
      ? categories.filter((c) => c.isVisible)
      : categories;

    // Sort by sortOrder
    visible.sort((a, b) => a.sortOrder - b.sortOrder);

    // Recursively get children
    return Promise.all(
      visible.map(async (cat) => ({
        ...cat,
        children: await ctx.runQuery(api.categories.getTree, {
          parentId: cat._id,
          visibleOnly: args.visibleOnly,
        }),
      }))
    );
  },
});

// Get all categories (flat list for admin)
export const list = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query("categories").collect();
    return categories.sort((a, b) => a.createdAt - b.createdAt);
  },
});

// Get navigation categories
export const getNavCategories = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("categories")
      .filter((q) =>
        q.and(
          q.eq(q.field("showInNav"), true),
          q.eq(q.field("isVisible"), true)
        )
      )
      .collect();
  },
});

// Get featured categories
export const getFeatured = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const featured = await ctx.db
      .query("categories")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .filter((q) => q.eq(q.field("isVisible"), true))
      .take(args.limit ?? 6);

    return featured;
  },
});
```

### 10.2 Mutations

```typescript
// Create category
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    parentId: v.optional(v.id("categories")),
    description: v.optional(v.string()),
    image: v.optional(v.id("media")),
    isVisible: v.optional(v.boolean()),
    isFeatured: v.optional(v.boolean()),
    showInNav: v.optional(v.boolean()),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Generate slug
    let slug = args.slug || generateSlug(args.name);
    slug = await ensureUniqueSlug(ctx, "categories", slug);

    // Calculate depth and path
    let depth = 0;
    let path: Id<"categories">[] = [];

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent) throw new Error("Parent category not found");
      depth = parent.depth + 1;
      path = [...parent.path, parent._id];

      if (depth > 3) {
        throw new Error("Maximum category depth (3) exceeded");
      }
    }

    // Get max sort order for this parent
    const siblings = await ctx.db
      .query("categories")
      .withIndex("by_parent")
      .filter((q) => q.eq(q.field("parentId"), args.parentId ?? undefined))
      .collect();
    const maxOrder = Math.max(0, ...siblings.map((s) => s.sortOrder));

    const now = Date.now();

    const categoryId = await ctx.db.insert("categories", {
      name: args.name,
      slug,
      parentId: args.parentId,
      depth,
      path,
      description: args.description,
      image: args.image,
      sortOrder: maxOrder + 1,
      productCount: 0,
      totalProductCount: 0,
      isVisible: args.isVisible ?? true,
      isFeatured: args.isFeatured ?? false,
      showInNav: args.showInNav ?? true,
      metaTitle: args.metaTitle,
      metaDescription: args.metaDescription,
      createdAt: now,
      updatedAt: now,
    });

    // Dispatch event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "category.created",
      payload: { categoryId, name: args.name, parentId: args.parentId },
    });

    return categoryId;
  },
});

// Update category
export const update = mutation({
  args: {
    id: v.id("categories"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    image: v.optional(v.id("media")),
    isVisible: v.optional(v.boolean()),
    isFeatured: v.optional(v.boolean()),
    showInNav: v.optional(v.boolean()),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Category not found");

    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.image !== undefined) updates.image = args.image;
    if (args.isVisible !== undefined) updates.isVisible = args.isVisible;
    if (args.isFeatured !== undefined) updates.isFeatured = args.isFeatured;
    if (args.showInNav !== undefined) updates.showInNav = args.showInNav;
    if (args.metaTitle !== undefined) updates.metaTitle = args.metaTitle;
    if (args.metaDescription !== undefined) updates.metaDescription = args.metaDescription;

    if (args.slug && args.slug !== existing.slug) {
      const slugExists = await ctx.db
        .query("categories")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug))
        .unique();
      if (slugExists && slugExists._id !== args.id) {
        throw new Error("Slug already exists");
      }
      updates.slug = args.slug;
    }

    await ctx.db.patch(args.id, updates);

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "category.updated",
      payload: { categoryId: args.id, fields: Object.keys(updates) },
    });

    return args.id;
  },
});

// Move category to new parent
export const move = mutation({
  args: {
    id: v.id("categories"),
    newParentId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const category = await ctx.db.get(args.id);
    if (!category) throw new Error("Category not found");

    // Prevent circular reference
    if (args.newParentId) {
      const newParent = await ctx.db.get(args.newParentId);
      if (!newParent) throw new Error("New parent not found");
      if (newParent.path.includes(args.id)) {
        throw new Error("Cannot create circular reference");
      }
    }

    // Calculate new depth and path
    let newDepth = 0;
    let newPath: Id<"categories">[] = [];

    if (args.newParentId) {
      const parent = await ctx.db.get(args.newParentId);
      if (parent) {
        newDepth = parent.depth + 1;
        newPath = [...parent.path, parent._id];
      }
    }

    // Check max depth (including subcategories)
    const maxChildDepth = await getMaxChildDepth(ctx, args.id);
    if (newDepth + maxChildDepth > 3) {
      throw new Error("Moving would exceed maximum depth");
    }

    await ctx.db.patch(args.id, {
      parentId: args.newParentId,
      depth: newDepth,
      path: newPath,
      updatedAt: Date.now(),
    });

    // Update all descendants' paths
    await updateDescendantPaths(ctx, args.id, newPath, newDepth);

    return args.id;
  },
});

// Reorder categories
export const reorder = mutation({
  args: {
    parentId: v.optional(v.id("categories")),
    orderedIds: v.array(v.id("categories")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    for (let i = 0; i < args.orderedIds.length; i++) {
      await ctx.db.patch(args.orderedIds[i], {
        sortOrder: i,
        updatedAt: Date.now(),
      });
    }

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "category.reordered",
      payload: { parentId: args.parentId, newOrder: args.orderedIds },
    });

    return true;
  },
});

// Delete category
export const remove = mutation({
  args: {
    id: v.id("categories"),
    moveProductsTo: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const category = await ctx.db.get(args.id);
    if (!category) throw new Error("Category not found");

    // Check for subcategories
    const children = await ctx.db
      .query("categories")
      .withIndex("by_parent")
      .filter((q) => q.eq(q.field("parentId"), args.id))
      .collect();

    if (children.length > 0) {
      throw new Error("Delete subcategories first");
    }

    // Handle products in this category
    const products = await ctx.db.query("products").collect();
    const productsInCategory = products.filter((p) =>
      p.categoryIds?.includes(args.id)
    );

    for (const product of productsInCategory) {
      const newCategoryIds = product.categoryIds?.filter((id) => id !== args.id) ?? [];
      if (args.moveProductsTo && !newCategoryIds.includes(args.moveProductsTo)) {
        newCategoryIds.push(args.moveProductsTo);
      }
      await ctx.db.patch(product._id, { categoryIds: newCategoryIds });
    }

    await ctx.db.delete(args.id);

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "category.deleted",
      payload: {
        categoryId: args.id,
        name: category.name,
        productsMoved: productsInCategory.length,
      },
    });

    return true;
  },
});

// Update product count (internal, called when products change)
export const updateProductCount = internalMutation({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.categoryId);
    if (!category) return;

    const products = await ctx.db.query("products").collect();
    const count = products.filter(
      (p) => p.status === "active" && p.categoryIds?.includes(args.categoryId)
    ).length;

    await ctx.db.patch(args.categoryId, {
      productCount: count,
      updatedAt: Date.now(),
    });

    // Update parent's totalProductCount
    if (category.parentId) {
      await updateTotalProductCount(ctx, category.parentId);
    }
  },
});
```

---

## 11. MCP Integration

### 11.1 MCP Tools

```typescript
// MCP Tool: list_categories
{
  name: "list_categories",
  description: "Get all categories or subcategories of a parent",
  inputSchema: {
    type: "object",
    properties: {
      parentId: { type: "string", description: "Parent category ID (optional)" },
    },
  },
  handler: async ({ parentId }) => {
    return await convex.query(api.categories.getTree, {
      parentId,
      visibleOnly: true,
    });
  },
}

// MCP Tool: get_category
{
  name: "get_category",
  description: "Get category details by ID or slug",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Category ID" },
      slug: { type: "string", description: "Category slug" },
    },
  },
  handler: async ({ id, slug }) => {
    if (slug) {
      return await convex.query(api.categories.getBySlug, { slug });
    }
    return await convex.query(api.categories.get, { id });
  },
}
```

### 11.2 MCP Resources

```typescript
// Resource: category://{categoryId}
// Returns full category data with ancestors

// Resource: categories://tree
// Returns full category hierarchy

// Resource: categories://featured
// Returns featured categories
```

---

## 12. Security Considerations

### 12.1 Authorization

| Action | Required Role |
|--------|---------------|
| View categories | Public |
| Create category | Manager+ |
| Update category | Staff+ |
| Delete category | Admin |
| Reorder categories | Staff+ |

---

## 13. Implementation Checklist

### Phase 1: Foundation
- [ ] Define schema in `convex/schema.ts`
- [ ] Create basic CRUD mutations
- [ ] Implement slug generation
- [ ] Implement hierarchy validation

### Phase 2: Core Features
- [ ] Create category page (`/categories/:slug`)
- [ ] Build `CategoryNav` component
- [ ] Build `CategoryBreadcrumbs` component
- [ ] Implement product filtering by category

### Phase 3: Admin Interface
- [ ] Create admin category management
- [ ] Build drag-and-drop tree editor
- [ ] Implement move and reorder functionality

### Phase 4: Integration
- [ ] Wire up product count updates
- [ ] Connect to navigation system
- [ ] Add MCP tools

---

## 14. Future Considerations

- **Smart Collections:** Dynamic categories based on rules (price, tags)
- **Category-Level Discounts:** Apply discounts to entire categories
- **Multi-Language:** Translated category names/descriptions
- **Category Attributes:** Custom fields per category

---

**PRD Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
**Author:** Claude (AI Assistant)
