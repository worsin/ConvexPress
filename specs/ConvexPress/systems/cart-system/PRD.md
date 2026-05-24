# PRD: Shopping Cart

> **Origin:** Ported from VexCart on 2026-04-22, integrated into ConvexPress.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce is not a separate app; it is a first-class layer inside ConvexPress alongside posts, pages, media, users, and taxonomies. Every commerce feature is either **baked into the commerce core** or **gated as an internal extension** via `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts` (feature flags, not a third-party marketplace).
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Customer-facing UIs serve `Subscriber` + guests.
> **No third-party plugin/theme marketplace.** AI builds custom per-site. Internally, "extensions" are feature-flagged modules (Bundles, Digital, Returns, Reviews, Wishlists, Subscriptions, Add-Ons, Membership) that live in `convex/commerce<Thing>/` with a `<thing>Enabled` settings flag and a `require<Thing>Enabled(ctx)` gate on every mutation/query.
> **Package manager:** Bun. **UI:** Base UI (not Radix). **Styling:** Tailwind v4. **Payments:** Stripe (see `agents/knowledge/stripe-integration.md`).



---

## Integration with ConvexPress

**Positioning:** baked into commerce core.
**Code lives at:** `ConvexPress-Admin/packages/backend/convex/commerce/cart.ts`

**Consumes these ConvexPress systems:**

- **Product System** — resolves product/variant prices + stock from `commerce_products` + `commerce_product_variants`.
- **Inventory System** — calls stock-reservation helpers at add/update.
- **Discount System** — applies active discount codes via `commerce/discounts.ts`.
- **Tax System** (`commerce/tax.ts`) — surfaces a tax preview on the cart (authoritative at checkout).
- **Users** — logged-in carts are keyed by `users._id`; guests use a `cartToken`.
- **Event Dispatcher** — emits `cart.item_added`, `cart.item_removed`, `cart.abandoned`.

**WooCommerce analog:** WooCommerce `WC_Cart` + Cart Fragments API — native session-based cart with AJAX refresh.

---
## 1. Overview

### 1.1 Purpose

The Shopping Cart is the central holding area for products before purchase. Built on Convex's real-time architecture, this cart provides instant responsiveness through optimistic updates, seamless cross-device synchronization for logged-in users, and live inventory validation. When a customer adds an item on their phone, it appears instantly on their laptop without a refresh.

### 1.2 Scope

**In Scope:**
- Cart state management (add, update, remove items)
- Guest cart via session storage with server persistence
- Authenticated cart with cross-device sync
- Cart merge on login (guest → authenticated)
- Real-time inventory validation
- Cart drawer/slide-out component
- Full cart page
- Quantity adjustments
- Cart item price snapshots
- Cart sharing (collaborative carts)
- Abandoned cart tracking
- MCP tools for cart operations

**Out of Scope:**
- Checkout flow (the Checkout System PRD (`specs/ConvexPress/systems/checkout-system/PRD.md`))
- Discount/coupon application (the Commerce Core PRD's Discounts section (no standalone PRD yet — see `.codex/docs/COMMERCE-CORE-PLUGIN-PRD.md`))
- Saved/wishlist items (the Wishlist System PRD at `specs/ConvexPress/systems/wishlist-system/PRD.md`)
- Gift cards (future)

### 1.3 Key Differentiators: Convex Optimistic Updates

The cart is the most interactive part of e-commerce. Every action should feel instant. Convex enables this through optimistic updates - the UI updates immediately while the mutation syncs in the background.

| Traditional Approach | Convex-Native Approach |
|---------------------|----------------------|
| "Adding..." spinner on button | Instant UI update, zero perceived latency |
| Page refresh for cart sync | Automatic real-time sync across devices |
| Stale cart data issues | Always fresh, reactive queries |
| Complex cache invalidation | No cache needed, mutations trigger updates |
| Custom WebSocket for live updates | Built-in via Convex subscriptions |

```typescript
// Optimistic update pattern - UI updates INSTANTLY
const addToCart = useMutation(api.cart.addItem).withOptimisticUpdate(
  (localStore, args) => {
    const cart = localStore.getQuery(api.cart.getMine, {});
    if (cart) {
      localStore.setQuery(api.cart.getMine, {}, {
        ...cart,
        items: [...cart.items, {
          productId: args.productId,
          quantity: args.quantity,
          // Optimistic data - will be replaced by server response
        }],
        itemCount: cart.itemCount + args.quantity,
      });
    }
  }
);
```

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Event System | PLT-EVT | 0 | Cart events for analytics/notifications |
| Authentication | PLT-AUT | 0 | User identity for persistent carts |
| Product Catalog | CAT-PRD | 2 | Products to add to cart |
| Inventory System | INV-STK | 3 | Stock validation |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Checkout System | ORD-CHK | 4 | Cart contents become order |
| Discounts & Coupons | MKT-DSC | 4 | Discount application to cart |
| Order Management | ORD-MGT | 4 | Cart history for recommendations |
| Analytics | ADM-RPT | 6 | Cart abandonment tracking |

### 2.3 Integration Hooks

```typescript
// Events emitted by Shopping Cart
type CartEvents =
  | "cart.item_added"       // Item added to cart
  | "cart.item_updated"     // Quantity changed
  | "cart.item_removed"     // Item removed from cart
  | "cart.cleared"          // Cart emptied
  | "cart.merged"           // Guest cart merged with user cart
  | "cart.abandoned"        // Cart inactive for 24+ hours
  | "cart.recovered";       // Abandoned cart reactivated

// Cart context for other systems
interface CartContext {
  id: Id<"carts">;
  userId?: Id<"users">;
  sessionId?: string;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  lastActivityAt: number;
}

interface CartItem {
  id: Id<"cartItems">;
  productId: Id<"products">;
  variantId?: Id<"productVariants">;
  quantity: number;
  priceAtAdd: number;
  product: Product; // Joined data
}
```

---

## 3. Routes

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles | Real-Time Features |
|-------|------|--------|---------------|-------|-------------------|
| Cart Page | `/cart` | _marketing | No | Guest, Customer | Live updates, stock validation |

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Abandoned Carts | `/admin/orders/abandoned` | _admin | Yes | Staff, Manager, Admin |

---

## 4. Data Model

### 4.1 Tables

```typescript
// admin-app/packages/backend/convex/schema.ts

// Carts table - one per user or session
carts: defineTable({
  // Owner identification
  userId: v.optional(v.id("users")),       // Logged in user
  sessionId: v.optional(v.string()),        // Guest session ID

  // Sharing
  shareToken: v.optional(v.string()),       // For shareable cart links
  isShared: v.boolean(),                    // Allow others to view/edit
  collaborators: v.optional(v.array(v.id("users"))), // Shared cart editors

  // State
  status: v.union(
    v.literal("active"),      // Currently in use
    v.literal("converted"),   // Became an order
    v.literal("abandoned"),   // Inactive, not recovered
    v.literal("merged")       // Merged into another cart
  ),

  // Metadata
  lastActivityAt: v.number(),
  createdAt: v.number(),
  convertedAt: v.optional(v.number()),
  orderId: v.optional(v.id("orders")),     // If converted

  // Abandonment tracking
  abandonedEmailSentAt: v.optional(v.number()),
  recoveredAt: v.optional(v.number()),

  // Notes
  note: v.optional(v.string()),            // Customer notes
})
  .index("by_user", ["userId", "status"])
  .index("by_session", ["sessionId", "status"])
  .index("by_share_token", ["shareToken"])
  .index("by_last_activity", ["lastActivityAt"])
  .index("by_status", ["status"]),

// Cart items table
cartItems: defineTable({
  cartId: v.id("carts"),
  productId: v.id("products"),
  variantId: v.optional(v.id("productVariants")),

  // Quantity
  quantity: v.number(),

  // Price snapshot (for comparison, not billing)
  priceAtAdd: v.number(),                  // Price when added

  // Metadata
  addedAt: v.number(),
  addedBy: v.optional(v.id("users")),      // For collaborative carts
  updatedAt: v.number(),

  // Notes
  itemNote: v.optional(v.string()),        // Gift message, customization
})
  .index("by_cart", ["cartId"])
  .index("by_product", ["productId"])
  .index("by_added", ["addedAt"]),
```

### 4.2 Cart Lifecycle

```
Guest User Flow:
┌─────────────────┐
│   Land on Site  │ → Generate sessionId (stored in localStorage)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Add to Cart   │ → Create cart with sessionId
└────────┬────────┘
         │
         ├─── Continue shopping → Cart persists
         │
         ├─── Log in → Merge guest cart into user cart
         │
         └─── Checkout → Create order, convert cart

Authenticated User Flow:
┌─────────────────┐
│     Log In      │ → Look up or create cart with userId
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Add to Cart   │ → Update user's cart (syncs across devices!)
└────────┬────────┘
         │
         └─── Changes appear on all devices in real-time
```

### 4.3 Cart Merge Logic

When a guest logs in with items in their session cart:

1. Get user's existing cart (if any)
2. Get guest's session cart
3. For each item in guest cart:
   - If product exists in user cart: Keep higher quantity
   - If product doesn't exist: Add to user cart
4. Mark guest cart as "merged"
5. Transfer session to authenticated context

---

## 5. Actions

### 5.1 Customer Actions

| Action | Code | Description | Roles | Triggers Events |
|--------|------|-------------|-------|-----------------|
| Add to Cart | `cart.add_item` | Add product to cart | Guest, Customer | `cart.item_added` |
| Update Quantity | `cart.update_quantity` | Change item quantity | Guest, Customer | `cart.item_updated` |
| Remove Item | `cart.remove_item` | Remove item from cart | Guest, Customer | `cart.item_removed` |
| Clear Cart | `cart.clear` | Remove all items | Guest, Customer | `cart.cleared` |
| Share Cart | `cart.share` | Generate share link | Customer | - |
| Apply Coupon | `cart.apply_coupon` | Apply discount code | Guest, Customer | - (see Discounts) |

### 5.2 System Actions

| Action | Code | Description | Triggered By |
|--------|------|-------------|--------------|
| Merge Carts | `cart.merge` | Combine guest + user carts | Login |
| Mark Abandoned | `cart.mark_abandoned` | Flag inactive cart | Scheduled job |
| Convert to Order | `cart.convert` | Transform cart to order | Checkout completion |

---

## 6. Events

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Item Added | `cart.item_added` | Product added to cart | `{ cartId: Id, productId: Id, quantity: number, userId?: Id }` |
| Item Updated | `cart.item_updated` | Quantity changed | `{ cartId: Id, productId: Id, previousQty: number, newQty: number }` |
| Item Removed | `cart.item_removed` | Item removed | `{ cartId: Id, productId: Id, quantity: number }` |
| Cart Cleared | `cart.cleared` | All items removed | `{ cartId: Id, itemCount: number }` |
| Cart Merged | `cart.merged` | Guest cart merged | `{ guestCartId: Id, userCartId: Id, itemsMerged: number }` |
| Cart Abandoned | `cart.abandoned` | 24h+ inactivity | `{ cartId: Id, userId?: Id, email?: string, value: number }` |
| Cart Recovered | `cart.recovered` | Abandoned cart reactivated | `{ cartId: Id, userId?: Id }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| `user.logged_in` | Authentication | Trigger cart merge |
| `product.price_changed` | Product Catalog | Update price snapshot warning |
| `inventory.out_of_stock` | Inventory | Mark items unavailable |

---

## 7. Notifications

### 7.1 Email Notifications

| Name | Trigger Event | Recipient | Priority | Delay |
|------|---------------|-----------|----------|-------|
| Abandoned Cart | `cart.abandoned` | Customer | Normal | 1 hour |
| Abandoned Cart Reminder | `cart.abandoned` | Customer | Normal | 24 hours |

### 7.2 Site Notifications

| Name | Trigger Event | Recipient | Type |
|------|---------------|-----------|------|
| Item Added | `cart.item_added` | Customer | Success (toast) |
| Price Changed | Price mismatch detected | Customer | Warning |
| Item Unavailable | `inventory.out_of_stock` | Customer | Warning |

---

## 8. User Interface

### 8.1 Components Needed

**Storefront Components:**
- [ ] `CartProvider` - Context provider with cart state
- [ ] `CartDrawer` - Slide-out cart panel
- [ ] `CartPage` - Full cart page layout
- [ ] `CartItem` - Single item row with controls
- [ ] `CartSummary` - Subtotal, item count
- [ ] `CartIcon` - Header icon with badge
- [ ] `AddToCartButton` - Product page add button
- [ ] `QuantitySelector` - +/- quantity control
- [ ] `EmptyCart` - Empty state with CTA
- [ ] `CartItemUnavailable` - Out of stock item display
- [ ] `PriceChangeWarning` - Price changed since add
- [ ] `CartShareButton` - Generate share link

**Admin Components:**
- [ ] `AbandonedCartsTable` - List of abandoned carts
- [ ] `CartDetail` - View cart contents
- [ ] `AbandonedCartStats` - Summary metrics

### 8.2 Real-Time UI Patterns

```tsx
// Cart icon with live badge - updates across all tabs/devices
function CartIcon() {
  const cart = useQuery(api.cart.getMine);

  return (
    <Link to="/cart" className="relative">
      <ConvexPressIcon className="h-6 w-6" />
      {cart && cart.itemCount > 0 && (
        <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center">
          {cart.itemCount}
        </span>
      )}
    </Link>
  );
}

// Add to cart with optimistic update - INSTANT feedback
function AddToCartButton({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);

  const addToCart = useMutation(api.cart.addItem).withOptimisticUpdate(
    (localStore, args) => {
      const cart = localStore.getQuery(api.cart.getMine, {});
      if (cart) {
        // Instant UI update
        const existingItem = cart.items.find(
          (i) => i.productId === args.productId
        );

        if (existingItem) {
          localStore.setQuery(api.cart.getMine, {}, {
            ...cart,
            items: cart.items.map((i) =>
              i.productId === args.productId
                ? { ...i, quantity: i.quantity + args.quantity }
                : i
            ),
            itemCount: cart.itemCount + args.quantity,
            subtotal: cart.subtotal + (product.salePrice ?? product.basePrice) * args.quantity,
          });
        } else {
          localStore.setQuery(api.cart.getMine, {}, {
            ...cart,
            items: [
              ...cart.items,
              {
                productId: args.productId,
                quantity: args.quantity,
                product,
                priceAtAdd: product.salePrice ?? product.basePrice,
                addedAt: Date.now(),
              },
            ],
            itemCount: cart.itemCount + args.quantity,
            subtotal: cart.subtotal + (product.salePrice ?? product.basePrice) * args.quantity,
          });
        }
      }
    }
  );

  const handleAdd = async () => {
    await addToCart({
      productId: product._id,
      quantity,
    });
    toast.success("Added to cart!");
  };

  return (
    <div className="flex gap-2">
      <QuantitySelector value={quantity} onChange={setQuantity} max={product.stockCount} />
      <Button onClick={handleAdd} disabled={product.stockCount === 0}>
        {product.stockCount === 0 ? "Out of Stock" : "Add to Cart"}
      </Button>
    </div>
  );
}

// Cart drawer with live updates
function CartDrawer() {
  const cart = useQuery(api.cart.getMine);
  const removeItem = useMutation(api.cart.removeItem);
  const updateQuantity = useMutation(api.cart.updateQuantity);

  if (cart === undefined) return <DrawerSkeleton />;
  if (!cart || cart.items.length === 0) return <EmptyCartDrawer />;

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <CartIcon />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Your Cart ({cart.itemCount} items)</DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 overflow-auto">
          {cart.items.map((item) => (
            <CartItemRow
              key={item.id}
              item={item}
              onQuantityChange={(qty) =>
                updateQuantity({ itemId: item.id, quantity: qty })
              }
              onRemove={() => removeItem({ itemId: item.id })}
            />
          ))}
        </div>

        <DrawerFooter>
          <div className="flex justify-between mb-4">
            <span>Subtotal</span>
            <span className="font-bold">${(cart.subtotal / 100).toFixed(2)}</span>
          </div>
          <Link to="/checkout">
            <Button className="w-full">Checkout</Button>
          </Link>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

// Real-time stock validation
function CartItemRow({ item, onQuantityChange, onRemove }) {
  const stock = useQuery(api.inventory.getAvailable, {
    productId: item.productId,
  });

  const isOutOfStock = stock && stock.available === 0;
  const isLowStock = stock && stock.available > 0 && stock.available < item.quantity;
  const priceChanged = item.product.basePrice !== item.priceAtAdd;

  return (
    <div className={cn(
      "flex gap-4 p-4 border-b",
      isOutOfStock && "opacity-50"
    )}>
      <img src={item.product.images[0]} className="w-16 h-16 object-cover" />

      <div className="flex-1">
        <h4 className="font-medium">{item.product.name}</h4>

        {isOutOfStock && (
          <Badge variant="destructive">Out of Stock</Badge>
        )}

        {isLowStock && (
          <Badge variant="warning">Only {stock.available} left</Badge>
        )}

        {priceChanged && (
          <div className="text-sm text-muted-foreground">
            Price updated: ${(item.priceAtAdd / 100).toFixed(2)} →
            ${(item.product.basePrice / 100).toFixed(2)}
          </div>
        )}
      </div>

      <QuantitySelector
        value={item.quantity}
        onChange={onQuantityChange}
        max={stock?.available}
        disabled={isOutOfStock}
      />

      <div className="text-right">
        <div className="font-medium">
          ${((item.product.salePrice ?? item.product.basePrice) * item.quantity / 100).toFixed(2)}
        </div>
        <button onClick={onRemove} className="text-sm text-red-600">
          Remove
        </button>
      </div>
    </div>
  );
}
```

### 8.3 States

**Loading States:**
- Cart drawer skeleton
- Cart page skeleton
- Add to cart button loading

**Empty States:**
- Empty cart with "Continue Shopping" CTA
- Empty cart with product recommendations

**Error States:**
- Failed to add item
- Item out of stock during checkout
- Network error

**Success States:**
- Item added toast
- Quantity updated
- Cart shared

---

## 9. Business Rules

### 9.1 Quantity Rules

- Minimum quantity: 1
- Maximum quantity: Product stock or 99, whichever is lower
- Quantity must be integer
- Setting quantity to 0 removes item

### 9.2 Cart Persistence

**Guest Carts:**
- Created on first add-to-cart
- Associated with sessionId (stored in localStorage)
- Persist for 30 days (server-side)
- Clear localStorage sessionId on explicit logout

**Authenticated Carts:**
- One active cart per user
- Synced across all devices in real-time
- Persist indefinitely

### 9.3 Cart Merge Rules

On login, if both guest and user carts exist:

1. Items in both carts: Take maximum quantity
2. Items only in guest cart: Add to user cart
3. Items only in user cart: Keep as-is
4. Mark guest cart as "merged"
5. Delete guest cart items (they're now in user cart)

### 9.4 Stock Validation

- Validate stock on add-to-cart
- Re-validate on cart view
- Final validation at checkout
- Show warnings for unavailable items
- Block checkout if any items unavailable (unless backorder allowed)

### 9.5 Abandonment Rules

- Mark abandoned after 24 hours of inactivity
- Send first email at 1 hour
- Send reminder at 24 hours
- Maximum 2 abandonment emails per cart
- Recover cart on any activity

### 9.6 Edge Cases

| Scenario | Handling |
|----------|----------|
| Add item that's already in cart | Increase quantity |
| Add more than stock allows | Limit to available stock, show message |
| Item goes OOS while in cart | Show unavailable warning, exclude from subtotal |
| Price changes while in cart | Show price change notice, use current price |
| Merge cart with conflicting items | Keep higher quantity |
| Share cart link accessed | Show read-only view (or editable if allowed) |

---

## 10. API Design

### 10.1 Queries

```typescript
// Get current user's/session's cart
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    let cart;

    if (identity) {
      // Logged in user
      const userId = await getUserId(ctx, identity.email);
      cart = await ctx.db
        .query("carts")
        .withIndex("by_user", (q) =>
          q.eq("userId", userId).eq("status", "active")
        )
        .first();
    } else {
      // Guest - session ID comes from header/arg
      const sessionId = getSessionIdFromContext(ctx);
      if (sessionId) {
        cart = await ctx.db
          .query("carts")
          .withIndex("by_session", (q) =>
            q.eq("sessionId", sessionId).eq("status", "active")
          )
          .first();
      }
    }

    if (!cart) {
      return null;
    }

    // Get cart items with product data
    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .collect();

    const itemsWithProducts = await Promise.all(
      items.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        return {
          ...item,
          product,
        };
      })
    );

    // Filter out items with deleted products
    const validItems = itemsWithProducts.filter((i) => i.product !== null);

    // Calculate totals
    const itemCount = validItems.reduce((sum, i) => sum + i.quantity, 0);
    const subtotal = validItems.reduce((sum, i) => {
      const price = i.product.salePrice ?? i.product.basePrice;
      return sum + price * i.quantity;
    }, 0);

    return {
      ...cart,
      items: validItems,
      itemCount,
      subtotal,
    };
  },
});

// Get cart by share token (for shared carts)
export const getByShareToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const cart = await ctx.db
      .query("carts")
      .withIndex("by_share_token", (q) => q.eq("shareToken", args.token))
      .first();

    if (!cart || !cart.isShared) {
      return null;
    }

    // Same item loading logic as getMine
    // ...
  },
});

// Check if product is in cart
export const hasProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const cart = await ctx.runQuery(api.cart.getMine, {});
    if (!cart) return false;

    return cart.items.some((i) => i.productId === args.productId);
  },
});

// Get abandoned carts (admin)
export const getAbandoned = query({
  args: {
    limit: v.optional(v.number()),
    minValue: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const carts = await ctx.db
      .query("carts")
      .withIndex("by_status", (q) => q.eq("status", "abandoned"))
      .take(args.limit ?? 50);

    // Enrich with items and user info
    return Promise.all(
      carts.map(async (cart) => {
        const items = await ctx.db
          .query("cartItems")
          .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
          .collect();

        const user = cart.userId ? await ctx.db.get(cart.userId) : null;

        const value = await calculateCartValue(ctx, cart._id);

        return {
          ...cart,
          itemCount: items.length,
          value,
          userEmail: user?.email,
        };
      })
    ).then((carts) =>
      carts.filter((c) => !args.minValue || c.value >= args.minValue)
    );
  },
});
```

### 10.2 Mutations

```typescript
// Add item to cart
export const addItem = mutation({
  args: {
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
    quantity: v.optional(v.number()),
    sessionId: v.optional(v.string()), // For guests
  },
  handler: async (ctx, args) => {
    const quantity = args.quantity ?? 1;
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity ? await getUserId(ctx, identity.email) : undefined;
    const sessionId = args.sessionId;

    // Validate product exists and is active
    const product = await ctx.db.get(args.productId);
    if (!product || product.status !== "active") {
      throw new Error("Product not available");
    }

    // Validate stock
    if (product.trackInventory && !product.allowBackorder) {
      const available = product.stockCount - (product.reservedCount ?? 0);
      if (available < quantity) {
        throw new Error(`Only ${available} available`);
      }
    }

    // Get or create cart
    let cart;
    if (userId) {
      cart = await ctx.db
        .query("carts")
        .withIndex("by_user", (q) =>
          q.eq("userId", userId).eq("status", "active")
        )
        .first();

      if (!cart) {
        const cartId = await ctx.db.insert("carts", {
          userId,
          isShared: false,
          status: "active",
          lastActivityAt: Date.now(),
          createdAt: Date.now(),
        });
        cart = await ctx.db.get(cartId);
      }
    } else if (sessionId) {
      cart = await ctx.db
        .query("carts")
        .withIndex("by_session", (q) =>
          q.eq("sessionId", sessionId).eq("status", "active")
        )
        .first();

      if (!cart) {
        const cartId = await ctx.db.insert("carts", {
          sessionId,
          isShared: false,
          status: "active",
          lastActivityAt: Date.now(),
          createdAt: Date.now(),
        });
        cart = await ctx.db.get(cartId);
      }
    } else {
      throw new Error("Session ID required for guest cart");
    }

    // Check if item already in cart
    const existingItem = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("productId"), args.productId),
          args.variantId
            ? q.eq(q.field("variantId"), args.variantId)
            : true
        )
      )
      .first();

    if (existingItem) {
      // Update quantity
      const newQuantity = existingItem.quantity + quantity;

      // Validate new total
      if (product.trackInventory && !product.allowBackorder) {
        const available = product.stockCount - (product.reservedCount ?? 0);
        if (newQuantity > available) {
          throw new Error(`Cannot add more. Only ${available} available.`);
        }
      }

      await ctx.db.patch(existingItem._id, {
        quantity: newQuantity,
        updatedAt: Date.now(),
      });
    } else {
      // Add new item
      await ctx.db.insert("cartItems", {
        cartId: cart._id,
        productId: args.productId,
        variantId: args.variantId,
        quantity,
        priceAtAdd: product.salePrice ?? product.basePrice,
        addedAt: Date.now(),
        addedBy: userId,
        updatedAt: Date.now(),
      });
    }

    // Update cart activity
    await ctx.db.patch(cart._id, {
      lastActivityAt: Date.now(),
      status: "active", // Recover if was abandoned
      recoveredAt: cart.status === "abandoned" ? Date.now() : cart.recoveredAt,
    });

    // Dispatch event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "cart.item_added",
      payload: {
        cartId: cart._id,
        productId: args.productId,
        quantity,
        userId,
      },
    });

    return { success: true, cartId: cart._id };
  },
});

// Update item quantity
export const updateQuantity = mutation({
  args: {
    itemId: v.id("cartItems"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    const cart = await ctx.db.get(item.cartId);
    if (!cart) throw new Error("Cart not found");

    // Verify ownership
    await verifyCartAccess(ctx, cart);

    if (args.quantity <= 0) {
      // Remove item
      return ctx.runMutation(api.cart.removeItem, { itemId: args.itemId });
    }

    // Validate stock
    const product = await ctx.db.get(item.productId);
    if (product?.trackInventory && !product.allowBackorder) {
      const available = product.stockCount - (product.reservedCount ?? 0);
      if (args.quantity > available) {
        throw new Error(`Only ${available} available`);
      }
    }

    const previousQty = item.quantity;

    await ctx.db.patch(args.itemId, {
      quantity: args.quantity,
      updatedAt: Date.now(),
    });

    await ctx.db.patch(item.cartId, {
      lastActivityAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "cart.item_updated",
      payload: {
        cartId: item.cartId,
        productId: item.productId,
        previousQty,
        newQty: args.quantity,
      },
    });

    return { success: true };
  },
});

// Remove item from cart
export const removeItem = mutation({
  args: { itemId: v.id("cartItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    const cart = await ctx.db.get(item.cartId);
    if (!cart) throw new Error("Cart not found");

    await verifyCartAccess(ctx, cart);

    await ctx.db.delete(args.itemId);

    await ctx.db.patch(item.cartId, {
      lastActivityAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "cart.item_removed",
      payload: {
        cartId: item.cartId,
        productId: item.productId,
        quantity: item.quantity,
      },
    });

    return { success: true };
  },
});

// Clear cart
export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const cart = await getMyCart(ctx);
    if (!cart) return { success: true };

    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .collect();

    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    await ctx.db.patch(cart._id, {
      lastActivityAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "cart.cleared",
      payload: { cartId: cart._id, itemCount: items.length },
    });

    return { success: true };
  },
});

// Merge guest cart into user cart on login
export const merge = mutation({
  args: { guestSessionId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Must be logged in");

    const userId = await getUserId(ctx, identity.email);

    // Get guest cart
    const guestCart = await ctx.db
      .query("carts")
      .withIndex("by_session", (q) =>
        q.eq("sessionId", args.guestSessionId).eq("status", "active")
      )
      .first();

    if (!guestCart) return { merged: false, reason: "No guest cart" };

    // Get guest items
    const guestItems = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", guestCart._id))
      .collect();

    if (guestItems.length === 0) {
      return { merged: false, reason: "Guest cart empty" };
    }

    // Get or create user cart
    let userCart = await ctx.db
      .query("carts")
      .withIndex("by_user", (q) =>
        q.eq("userId", userId).eq("status", "active")
      )
      .first();

    if (!userCart) {
      const cartId = await ctx.db.insert("carts", {
        userId,
        isShared: false,
        status: "active",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
      });
      userCart = await ctx.db.get(cartId);
    }

    // Get user's existing items
    const userItems = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", userCart._id))
      .collect();

    // Merge items
    let itemsMerged = 0;
    for (const guestItem of guestItems) {
      const existingUserItem = userItems.find(
        (ui) =>
          ui.productId === guestItem.productId &&
          ui.variantId === guestItem.variantId
      );

      if (existingUserItem) {
        // Keep higher quantity
        if (guestItem.quantity > existingUserItem.quantity) {
          await ctx.db.patch(existingUserItem._id, {
            quantity: guestItem.quantity,
            updatedAt: Date.now(),
          });
          itemsMerged++;
        }
      } else {
        // Add guest item to user cart
        await ctx.db.insert("cartItems", {
          ...guestItem,
          cartId: userCart._id,
          addedBy: userId,
          updatedAt: Date.now(),
        });
        itemsMerged++;
      }

      // Remove from guest cart
      await ctx.db.delete(guestItem._id);
    }

    // Mark guest cart as merged
    await ctx.db.patch(guestCart._id, {
      status: "merged",
      lastActivityAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "cart.merged",
      payload: {
        guestCartId: guestCart._id,
        userCartId: userCart._id,
        itemsMerged,
      },
    });

    return { merged: true, itemsMerged };
  },
});

// Generate share link
export const generateShareLink = mutation({
  args: { editable: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const cart = await getMyCart(ctx);
    if (!cart) throw new Error("No cart found");

    const shareToken = generateSecureToken();

    await ctx.db.patch(cart._id, {
      shareToken,
      isShared: true,
    });

    return {
      shareToken,
      shareUrl: `${process.env.SITE_URL}/cart/shared/${shareToken}`,
    };
  },
});

// Convert cart to order (called by checkout)
export const convertToOrder = internalMutation({
  args: {
    cartId: v.id("carts"),
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cartId, {
      status: "converted",
      convertedAt: Date.now(),
      orderId: args.orderId,
    });
  },
});
```

### 10.3 Scheduled Jobs

```typescript
// Mark abandoned carts (runs every hour)
export const markAbandonedCarts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const abandonThreshold = Date.now() - 24 * 60 * 60 * 1000; // 24 hours

    const carts = await ctx.db
      .query("carts")
      .withIndex("by_last_activity")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.lt(q.field("lastActivityAt"), abandonThreshold)
        )
      )
      .collect();

    for (const cart of carts) {
      // Only mark carts with items
      const items = await ctx.db
        .query("cartItems")
        .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
        .first();

      if (items) {
        await ctx.db.patch(cart._id, { status: "abandoned" });

        const user = cart.userId ? await ctx.db.get(cart.userId) : null;
        const value = await calculateCartValue(ctx, cart._id);

        await ctx.scheduler.runAfter(0, internal.events.dispatch, {
          eventCode: "cart.abandoned",
          payload: {
            cartId: cart._id,
            userId: cart.userId,
            email: user?.email,
            value,
          },
        });
      }
    }

    return { marked: carts.length };
  },
});
```

---

## 11. MCP Integration

### 11.1 MCP Tools

```typescript
// MCP Tool: create_cart
{
  name: "create_cart",
  description: "Create a new shopping cart",
  inputSchema: {
    type: "object",
    properties: {
      userId: { type: "string", description: "User ID (optional)" },
    },
  },
  handler: async ({ userId }) => {
    // Implementation creates cart and returns ID
  },
}

// MCP Tool: add_to_cart
{
  name: "add_to_cart",
  description: "Add a product to a cart",
  inputSchema: {
    type: "object",
    properties: {
      cartId: { type: "string", required: true },
      productId: { type: "string", required: true },
      quantity: { type: "number", default: 1 },
      variantId: { type: "string" },
    },
    required: ["cartId", "productId"],
  },
  handler: async ({ cartId, productId, quantity, variantId }) => {
    return await convex.mutation(api.cart.addItem, {
      productId,
      variantId,
      quantity,
    });
  },
}

// MCP Tool: update_cart_item
{
  name: "update_cart_item",
  description: "Update quantity of a cart item",
  inputSchema: {
    type: "object",
    properties: {
      cartId: { type: "string", required: true },
      lineItemId: { type: "string", required: true },
      quantity: { type: "number", required: true },
    },
    required: ["cartId", "lineItemId", "quantity"],
  },
  handler: async ({ cartId, lineItemId, quantity }) => {
    return await convex.mutation(api.cart.updateQuantity, {
      itemId: lineItemId,
      quantity,
    });
  },
}

// MCP Tool: remove_from_cart
{
  name: "remove_from_cart",
  description: "Remove an item from the cart",
  inputSchema: {
    type: "object",
    properties: {
      cartId: { type: "string", required: true },
      lineItemId: { type: "string", required: true },
    },
    required: ["cartId", "lineItemId"],
  },
  handler: async ({ cartId, lineItemId }) => {
    return await convex.mutation(api.cart.removeItem, { itemId: lineItemId });
  },
}

// MCP Tool: get_cart
{
  name: "get_cart",
  description: "Get cart contents and totals",
  inputSchema: {
    type: "object",
    properties: {
      cartId: { type: "string", required: true },
    },
    required: ["cartId"],
  },
  handler: async ({ cartId }) => {
    // Return cart with items and totals
  },
}

// MCP Tool: apply_coupon
{
  name: "apply_coupon",
  description: "Apply a discount code to the cart",
  inputSchema: {
    type: "object",
    properties: {
      cartId: { type: "string", required: true },
      code: { type: "string", required: true },
    },
    required: ["cartId", "code"],
  },
  handler: async ({ cartId, code }) => {
    // Forward to discounts system
  },
}

// MCP Tool: clear_cart
{
  name: "clear_cart",
  description: "Remove all items from cart",
  inputSchema: {
    type: "object",
    properties: {
      cartId: { type: "string", required: true },
    },
    required: ["cartId"],
  },
  handler: async ({ cartId }) => {
    return await convex.mutation(api.cart.clear, {});
  },
}
```

### 11.2 MCP Resources

```typescript
// Resource: cart://{cartId}
// Returns full cart state with items and totals

// Resource: cart://{cartId}/items
// Returns only line items
```

---

## 12. Security Considerations

### 12.1 Authorization

| Action | Requirement |
|--------|-------------|
| View own cart | Owner (user or session) |
| Modify own cart | Owner |
| View shared cart | Anyone with share token |
| Modify shared cart | Collaborators only |
| View abandoned carts | Staff+ |

### 12.2 Session Security

- Session IDs are randomly generated, not guessable
- Session IDs should not contain PII
- Clear session on explicit logout
- Share tokens are separate from session IDs

---

## 13. Implementation Checklist

### Phase 1: Foundation
- [ ] Define schema (carts, cartItems)
- [ ] Implement getMine query
- [ ] Implement addItem mutation with optimistic updates
- [ ] Implement updateQuantity and removeItem

### Phase 2: Core UI
- [ ] Build CartDrawer component
- [ ] Build CartPage component
- [ ] Build AddToCartButton with optimistic updates
- [ ] Build CartIcon with live badge
- [ ] Implement QuantitySelector

### Phase 3: Guest/Auth Flow
- [ ] Implement session-based guest carts
- [ ] Implement cart merge on login
- [ ] Build CartProvider context

### Phase 4: Advanced Features
- [ ] Implement cart sharing
- [ ] Build abandoned cart tracking
- [ ] Add MCP tools
- [ ] Wire up events

---

## 14. Future Considerations

- **Save for Later:** Move items to wishlist
- **Cart Notes:** Per-item gift messages
- **Multi-Cart:** Multiple named carts
- **Cart Recommendations:** Suggested items
- **Price Alerts:** Notify on price drops

---

**PRD Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
**Author:** Claude (AI Assistant)
