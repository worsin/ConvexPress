# PRD: Wishlist System

> **Status:** DRAFT - Awaiting Review & Enhancement
> **System Code:** USR-WSH
> **Phase:** 5 of 6 (Post-Order & Engagement)
> **Priority:** P2 - Medium
> **Complexity:** Simple
> **Airtable Record:** rec47WoasGtxg1qeU

---

## 1. Overview

### 1.1 Purpose

The Wishlist System enables customers to save products for future purchase consideration. It provides a persistent way to track desired items, share wishlists with others (gift registries), and receive notifications when wishlist items go on sale or come back in stock. This system drives engagement, reduces cart abandonment, and supports gift-giving use cases.

### 1.2 Scope

- Multiple wishlists per user (default "My Wishlist" + custom lists)
- Add/remove products from wishlists
- Move items from wishlist to cart
- Share wishlists via link (public/private toggle)
- Wishlist item notifications (price drops, back in stock)
- Guest wishlist with merge on login
- Real-time sync across devices (Convex-powered)

### 1.3 Out of Scope

- Gift registry features (dedicated system later)
- Collaborative wishlists (real-time multi-user editing)
- Wishlist analytics for admins (covered in Analytics & Reporting)

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Customer Accounts | USR-ACT | 1 | User ownership of wishlists |
| Product Catalog | CAT-PRD | 2 | Products to add to wishlists |
| Site Notifications | COM-NOT | 1 | Price drop/back-in-stock alerts |
| Email Notifications | COM-EML | 1 | Wishlist reminder emails |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Analytics & Reporting | ADM-RPT | 6 | Wishlist metrics (conversion, popular items) |
| Product Bundles | CAT-BND | 4 | "Add bundle to wishlist" |

### 2.3 Integration Hooks to Implement

- `wishlist.item_added` event for analytics
- `wishlist.item_removed` event for analytics
- `wishlist.moved_to_cart` event for conversion tracking
- Public API for wishlist sharing (guest access to shared lists)

---

## 3. Routes

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Wishlist Page | /account/wishlist | _account | Yes | customer |
| Shared Wishlist | /wishlist/:shareToken | _marketing | No | public |

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Wishlist Analytics | /admin/analytics/wishlists | _admin | Yes | manager, admin |

---

## 4. Data Model

### 4.1 Tables

```typescript
// Wishlists - User's wishlist collections
wishlists: defineTable({
  userId: v.id("user_profiles"),       // Owner
  name: v.string(),                     // "My Wishlist", "Birthday Ideas"
  description: v.optional(v.string()), // Optional description
  isDefault: v.boolean(),              // true for auto-created default list
  isPublic: v.boolean(),               // Can be viewed via share link
  shareToken: v.optional(v.string()),  // Unique token for public sharing
  itemCount: v.number(),               // Denormalized count
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_share_token", ["shareToken"])
  .index("by_user_default", ["userId", "isDefault"])

// Wishlist Items - Products in wishlists
wishlist_items: defineTable({
  wishlistId: v.id("wishlists"),
  productId: v.id("products"),
  variantId: v.optional(v.id("product_variants")), // Specific variant if applicable
  addedAt: v.number(),
  priceAtAdd: v.number(),                          // Price when added (for price drop alerts)
  notifyOnSale: v.boolean(),                       // Notify if price drops
  notifyOnStock: v.boolean(),                      // Notify if back in stock
  notes: v.optional(v.string()),                   // User notes ("size M, blue color")
})
  .index("by_wishlist", ["wishlistId"])
  .index("by_product", ["productId"])
  .index("by_wishlist_product", ["wishlistId", "productId"])

// Guest Wishlists - Temporary storage before login
guest_wishlists: defineTable({
  sessionId: v.string(),               // Browser session identifier
  productId: v.id("products"),
  variantId: v.optional(v.id("product_variants")),
  addedAt: v.number(),
  expiresAt: v.number(),               // Auto-cleanup after 30 days
})
  .index("by_session", ["sessionId"])
  .index("by_expires", ["expiresAt"])
```

### 4.2 Relationships

- `wishlists` → `user_profiles`: Many wishlists per user
- `wishlist_items` → `wishlists`: Many items per wishlist
- `wishlist_items` → `products`: Reference to product
- `wishlist_items` → `product_variants`: Optional variant reference

### 4.3 Forward-Looking Fields

| Field | Future System | Purpose |
|-------|---------------|---------|
| `notifyOnSale` | Price Drop Alerts | Enable when Marketing Automation built |
| `notifyOnStock` | Inventory Alerts | Leverage existing back-in-stock system |
| `notes` | Gift Registry | Personal notes for gift-giving context |

---

## 5. Actions

### 5.1 Customer Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Add to Wishlist | wishlist.add_item | Add product/variant to wishlist | customer |
| Remove from Wishlist | wishlist.remove_item | Remove item from wishlist | customer |
| Move to Cart | wishlist.move_to_cart | Add item to cart and optionally remove from wishlist | customer |
| Create Wishlist | wishlist.create | Create new custom wishlist | customer |
| Share Wishlist | wishlist.share | Generate/toggle public share link | customer |

### 5.2 Staff/Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| View Wishlist Analytics | wishlist.view_analytics | View wishlist conversion metrics | manager, admin |

---

## 6. Events

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Item Added | wishlist.item_added | Product added to wishlist | `{ wishlistId, productId, variantId?, userId }` |
| Item Removed | wishlist.item_removed | Product removed from wishlist | `{ wishlistId, productId, userId }` |
| Moved to Cart | wishlist.moved_to_cart | Item moved from wishlist to cart | `{ wishlistId, productId, cartId, userId }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| product.price_changed | Product Catalog | Check wishlist items, send price drop notifications |
| product.back_in_stock | Inventory | Check wishlist items, send back-in-stock notifications |
| user.logged_in | Authentication | Merge guest wishlist with user wishlist |

---

## 7. Notifications

### 7.1 Email Notifications

| Name | Trigger Event | Recipient | Template Variables |
|------|---------------|-----------|-------------------|
| Wishlist Price Drop | product.price_changed | customer | `{{productName}}, {{oldPrice}}, {{newPrice}}, {{wishlistUrl}}` |
| Wishlist Back in Stock | product.back_in_stock | customer | `{{productName}}, {{wishlistUrl}}` |

### 7.2 Site Notifications

| Name | Trigger Event | Recipient | Message |
|------|---------------|-----------|---------|
| Price Drop Alert | product.price_changed | user | "{{productName}} is now {{newPrice}} (was {{oldPrice}})" |

---

## 8. User Interface

### 8.1 Components Needed

- [ ] `WishlistButton` - Add to wishlist button on product cards/pages
- [ ] `WishlistDropdown` - Quick-select which wishlist to add to
- [ ] `WishlistPage` - Full wishlist management view
- [ ] `WishlistItem` - Item card with move/remove actions
- [ ] `WishlistShareModal` - Share link management
- [ ] `WishlistCreateModal` - Create new wishlist form
- [ ] `SharedWishlistView` - Public view of shared wishlist

### 8.2 Wireframes

**Product Card/Page:**
- Heart icon button (outline = not in wishlist, filled = in wishlist)
- Click toggles add/remove from default wishlist
- Long-press or dropdown arrow to select specific wishlist

**Wishlist Page (/account/wishlist):**
- Wishlist selector tabs/dropdown
- Grid of wishlist items with product image, name, price, variant
- "Move to Cart" and "Remove" actions per item
- "Share" button for public link
- Price change indicator (was $X, now $Y)

### 8.3 States

- **Loading:** Skeleton cards while fetching wishlist items
- **Empty:** "Your wishlist is empty" with CTA to browse products
- **Error:** "Couldn't load wishlist" with retry button
- **Success:** Toast on add/remove actions

---

## 9. Business Rules

### 9.1 Validation Rules

- Maximum 10 wishlists per user
- Maximum 100 items per wishlist
- Product must be active to add to wishlist
- Duplicate product+variant not allowed in same wishlist

### 9.2 Business Logic

- Auto-create "My Wishlist" on first add if no default exists
- Guest wishlist stored in sessionStorage + server (30-day expiry)
- On login, merge guest wishlist (add missing items, skip duplicates)
- Share tokens are unique 12-character alphanumeric strings
- Price drop threshold: notify if price drops 5% or more

### 9.3 Edge Cases

- Product deleted: Remove from all wishlists, no notification
- Product out of stock: Keep in wishlist, show "Out of Stock" badge
- Variant discontinued: Show variant as unavailable, suggest alternatives
- User deletes account: Delete all wishlists and items

---

## 10. API Design

### 10.1 Queries (Read Operations)

```typescript
// Get user's wishlists
export const getMyWishlists = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    return ctx.db.query("wishlists")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .collect();
  },
});

// Get wishlist with items
export const getWishlist = query({
  args: { wishlistId: v.id("wishlists") },
  handler: async (ctx, args) => {
    const wishlist = await ctx.db.get(args.wishlistId);
    // Verify ownership or public access
    const items = await ctx.db.query("wishlist_items")
      .withIndex("by_wishlist", q => q.eq("wishlistId", args.wishlistId))
      .collect();
    // Enrich with product data
    return { ...wishlist, items: enrichedItems };
  },
});

// Get shared wishlist by token
export const getSharedWishlist = query({
  args: { shareToken: v.string() },
  handler: async (ctx, args) => {
    const wishlist = await ctx.db.query("wishlists")
      .withIndex("by_share_token", q => q.eq("shareToken", args.shareToken))
      .filter(q => q.eq(q.field("isPublic"), true))
      .unique();
    // Return public view (no user data)
  },
});

// Check if product is in any wishlist
export const isInWishlist = query({
  args: { productId: v.id("products"), variantId: v.optional(v.id("product_variants")) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { isInWishlist: false, wishlists: [] };
    // Check all user wishlists for this product
  },
});
```

### 10.2 Mutations (Write Operations)

```typescript
// Add item to wishlist
export const addItem = mutation({
  args: {
    wishlistId: v.optional(v.id("wishlists")), // If not provided, use default
    productId: v.id("products"),
    variantId: v.optional(v.id("product_variants")),
    notifyOnSale: v.optional(v.boolean()),
    notifyOnStock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Get or create default wishlist
    // Validate product exists and is active
    // Check for duplicates
    // Insert item with current price
    // Update wishlist itemCount
    // Dispatch wishlist.item_added event
  },
});

// Remove item from wishlist
export const removeItem = mutation({
  args: { wishlistItemId: v.id("wishlist_items") },
  handler: async (ctx, args) => {
    // Verify ownership
    // Delete item
    // Update wishlist itemCount
    // Dispatch wishlist.item_removed event
  },
});

// Move item to cart
export const moveToCart = mutation({
  args: {
    wishlistItemId: v.id("wishlist_items"),
    removeFromWishlist: v.optional(v.boolean()), // Default true
  },
  handler: async (ctx, args) => {
    // Get wishlist item
    // Add to cart (call cart.addItem internally)
    // Optionally remove from wishlist
    // Dispatch wishlist.moved_to_cart event
  },
});

// Create new wishlist
export const create = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Verify user authenticated
    // Check wishlist count limit
    // Insert new wishlist
  },
});

// Toggle public sharing
export const toggleShare = mutation({
  args: { wishlistId: v.id("wishlists") },
  handler: async (ctx, args) => {
    // Verify ownership
    // Toggle isPublic
    // Generate shareToken if enabling
  },
});

// Merge guest wishlist on login
export const mergeGuestWishlist = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    // Get guest wishlist items
    // Get or create user's default wishlist
    // Add non-duplicate items
    // Delete guest wishlist entries
  },
});
```

---

## 11. Security Considerations

### 11.1 Authentication Requirements

- Wishlist management requires authenticated user
- Guest wishlist uses session ID (ephemeral)
- Shared wishlists accessible without auth via token

### 11.2 Authorization Rules

- Users can only access their own wishlists
- Share tokens provide read-only public access
- No staff/admin access to customer wishlists (privacy)

### 11.3 Data Privacy

- Wishlist data is private by default
- Shared wishlists show products only, not user info
- Guest wishlists cleaned up after 30 days
- Full deletion on account deletion

---

## 12. Testing Strategy

### 12.1 Unit Tests

- Wishlist CRUD operations
- Duplicate prevention logic
- Guest wishlist merge logic
- Share token generation

### 12.2 Integration Tests

- Price drop notification trigger
- Back-in-stock notification trigger
- Move to cart integration
- Event dispatch verification

### 12.3 E2E Tests

- Add product to wishlist from product page
- View and manage wishlists in account
- Share wishlist and view as guest
- Guest login and wishlist merge

---

## 13. Implementation Checklist

### Phase 1: Foundation
- [ ] Schema definition (wishlists, wishlist_items, guest_wishlists)
- [ ] Basic CRUD mutations (add, remove, create, delete)
- [ ] Queries with indexes (getMyWishlists, getWishlist)

### Phase 2: Core Features
- [ ] Wishlist page route
- [ ] WishlistButton component
- [ ] WishlistPage component with item management
- [ ] Move to cart functionality

### Phase 3: Integration
- [ ] Event emission (item_added, item_removed, moved_to_cart)
- [ ] Guest wishlist merge on login
- [ ] Price drop notification listener
- [ ] Back-in-stock notification listener

### Phase 4: Polish
- [ ] Share functionality with token generation
- [ ] SharedWishlistView for public access
- [ ] Error handling and loading states
- [ ] Wishlist analytics queries

---

## 14. Future Considerations

- **Gift Registry:** Extend wishlists with registry features (claimed items, desired quantity)
- **Collaborative Lists:** Real-time multi-user wishlist editing
- **AI Recommendations:** "Based on your wishlist, you might like..."
- **Wishlist Reminders:** Scheduled emails for dormant wishlists

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | rec47WoasGtxg1qeU |
| Routes | recWRPbQasj63OOdD |
| Actions | recPN5OgQuEhVS4VT, recrrZB7ZckNLbQqz, recEwsyz7PJeozs8v, rec6gpLC8XsaMJntW, rec7bkD6JnnpdG7zR |
| Events | recQIgk5M7oDjxQTY, recOPj8bJ2FLTysWl, recurR624lbHFbYat |
| Email Notifications | recPjtt32ERszjYzh, recWUKf3whEmj1GSE |
| Site Notifications | recjtqTC12mpigETz |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Shopping Cart PRD](./PRD-SHOPPING-CART.md)
- [Product Catalog PRD](./PRD-PRODUCT-CATALOG.md)

---

**PRD Version:** 0.1 (DRAFT)
**Created:** 2025-02-03
**Last Updated:** 2025-02-03
**Author:** Claude (AI-Generated Draft)
**Status:** Awaiting human review and enhancement
