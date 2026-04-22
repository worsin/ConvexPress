# PRD: Inventory System

> **Origin:** Ported from VexCart on 2026-04-22, integrated into ConvexPress.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce is not a separate app; it is a first-class layer inside ConvexPress alongside posts, pages, media, users, and taxonomies. Every commerce feature is either **baked into the commerce core** or **gated as an internal extension** via `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts` (feature flags, not a third-party marketplace).
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Customer-facing UIs serve `Subscriber` + guests.
> **No third-party plugin/theme marketplace.** AI builds custom per-site. Internally, "extensions" are feature-flagged modules (Bundles, Digital, Returns, Reviews, Wishlists, Subscriptions, Add-Ons, Membership) that live in `convex/commerce<Thing>/` with a `<thing>Enabled` settings flag and a `require<Thing>Enabled(ctx)` gate on every mutation/query.
> **Package manager:** Bun. **UI:** Base UI (not Radix). **Styling:** Tailwind v4. **Payments:** Stripe (see `docs/stripe-integration.md`).



---

## Integration with ConvexPress

**Positioning:** baked into commerce core.
**Code lives at:** `ConvexPress-Admin/packages/backend/convex/commerce/inventory.ts`

**Consumes these ConvexPress systems:**

- **Product System** — writes stock counts + reservation counts on products + variants.
- **Cart System** — decrements reservations during cart session.
- **Order System** — commits stock at order creation; restocks on refund.
- **Event Dispatcher** — emits `inventory.low`, `inventory.out_of_stock`, `inventory.restocked`.
- **Email Notification System** — low-stock alerts to store admins.

**WooCommerce analog:** WooCommerce stock management + Stock Management plugin behaviors (reservations, backorders, low-stock alerts).

---
## 1. Overview

### 1.1 Purpose

The Inventory System manages stock levels across all products and variants. It ensures accurate, real-time inventory tracking with atomic operations that prevent overselling. Built on Convex's transactional architecture, this system guarantees that when 100 customers simultaneously try to buy the last item, exactly one succeeds. It provides live stock visibility to customers and instant low-stock alerts to administrators.

### 1.2 Scope

**In Scope:**
- Real-time stock level tracking per product/variant
- Atomic stock reservation during checkout
- Stock release on cart abandonment/order cancellation
- Low stock threshold alerts
- Out of stock handling
- Backorder support
- Admin inventory adjustments
- Bulk inventory updates
- Inventory history/audit log
- Real-time admin inventory dashboard
- MCP tools for inventory checking

**Out of Scope:**
- Warehouse location management (future)
- Batch/lot tracking (future)
- Expiry date management (future)
- Multi-warehouse inventory (future)
- Inventory forecasting (future)
- Supplier management (future)

### 1.3 Key Differentiators: Convex Atomic Operations

This is where Convex **shines**. Traditional ConvexPress commerce layers struggle with race conditions during high-demand scenarios (flash sales, limited releases). Convex's serializable transactions eliminate this entirely.

| Traditional Approach | Convex-Native Approach |
|---------------------|----------------------|
| Race conditions, overselling | Serializable transactions, no overselling |
| Locking, deadlocks | No locks needed, automatic serialization |
| Stale stock counts | Real-time updates across all clients |
| Manual polling for updates | Reactive subscriptions, instant sync |
| Separate cache layer | No cache needed, direct from source |

```typescript
// This is SAFE in Convex - no race conditions
export const reserveStock = mutation({
  handler: async (ctx, { productId, quantity }) => {
    const product = await ctx.db.get(productId);

    if (product.stockCount < quantity) {
      throw new Error("Insufficient stock");
    }

    // Atomic update - Convex guarantees this is safe
    await ctx.db.patch(productId, {
      stockCount: product.stockCount - quantity,
      reservedCount: (product.reservedCount ?? 0) + quantity,
    });
  },
});
```

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Event System | PLT-EVT | 0 | Inventory events for notifications |
| Authentication | PLT-AUT | 0 | Admin access for adjustments |
| Product Catalog | CAT-PRD | 2 | Products to track inventory for |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Shopping Cart | ORD-CRT | 3 | Stock validation before add-to-cart |
| Checkout System | ORD-CHK | 4 | Stock reservation during checkout |
| Order Management | ORD-MGT | 4 | Stock deduction on order placed |
| Returns & Refunds | SUP-RTN | 5 | Stock restoration on returns |
| Admin Dashboard | ADM-DSH | 6 | Low stock alerts widget |

### 2.3 Integration Hooks

```typescript
// Events emitted by Inventory System
type InventoryEvents =
  | "inventory.low_stock"         // Stock below threshold
  | "inventory.out_of_stock"      // Stock depleted
  | "inventory.back_in_stock"     // Stock replenished from 0
  | "inventory.adjusted"          // Manual adjustment
  | "inventory.reserved"          // Stock reserved for checkout
  | "inventory.released"          // Reserved stock released
  | "inventory.committed";        // Reserved stock converted to sold

// Inventory context for other systems
interface InventoryContext {
  productId: Id<"products">;
  variantId?: Id<"productVariants">;
  stockCount: number;
  reservedCount: number;
  availableCount: number; // stockCount - reservedCount
  lowStockThreshold: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  allowBackorder: boolean;
}
```

---

## 3. Routes

### 3.1 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles | Real-Time Features |
|-------|------|--------|---------------|-------|-------------------|
| Inventory Dashboard | `/admin/inventory` | _admin | Yes | Staff, Manager, Admin | Live stock levels |
| Inventory Adjustments | `/admin/inventory/adjust` | _admin | Yes | Manager, Admin | - |
| Inventory History | `/admin/inventory/history` | _admin | Yes | Staff, Manager, Admin | Live updates |

---

## 4. Data Model

### 4.1 Tables

```typescript
// admin-app/packages/backend/convex/schema.ts

// Inventory levels are stored on products table (see the Product System PRD (`specs/ConvexPress/systems/product-system/PRD.md`))
// Additional inventory-specific fields:

products: defineTable({
  // ... existing fields ...

  // Inventory fields
  stockCount: v.number(),              // Total stock on hand
  reservedCount: v.number(),           // Stock reserved for pending checkouts
  lowStockThreshold: v.number(),       // Alert when below this
  trackInventory: v.boolean(),         // Whether to track (vs unlimited)
  allowBackorder: v.boolean(),         // Allow orders when OOS

  // Inventory metadata
  lastRestockAt: v.optional(v.number()), // Last restock timestamp
  lastSoldAt: v.optional(v.number()),    // Last purchase timestamp
})

// Inventory adjustments log
inventoryAdjustments: defineTable({
  // Reference
  productId: v.id("products"),
  variantId: v.optional(v.id("productVariants")),

  // Adjustment details
  adjustmentType: v.union(
    v.literal("restock"),      // Adding new stock
    v.literal("sale"),         // Sold to customer
    v.literal("return"),       // Customer return
    v.literal("damage"),       // Damaged/write-off
    v.literal("correction"),   // Count correction
    v.literal("reservation"),  // Reserved for checkout
    v.literal("release"),      // Released from reservation
    v.literal("transfer")      // Transfer (future: multi-warehouse)
  ),

  // Quantities
  quantityBefore: v.number(),
  quantityChange: v.number(),    // Positive or negative
  quantityAfter: v.number(),

  // Context
  reason: v.optional(v.string()),    // Explanation for adjustment
  orderId: v.optional(v.id("orders")), // If sale/return
  userId: v.optional(v.id("users")),   // Who made adjustment

  // Timestamps
  createdAt: v.number(),
})
  .index("by_product", ["productId", "createdAt"])
  .index("by_type", ["adjustmentType", "createdAt"])
  .index("by_order", ["orderId"])
  .index("by_date", ["createdAt"]),

// Stock reservations (for checkout holding)
stockReservations: defineTable({
  productId: v.id("products"),
  variantId: v.optional(v.id("productVariants")),
  cartId: v.optional(v.id("carts")),
  checkoutSessionId: v.optional(v.string()),

  quantity: v.number(),
  expiresAt: v.number(),        // Auto-release after this time

  status: v.union(
    v.literal("active"),         // Currently reserved
    v.literal("committed"),      // Converted to order
    v.literal("released")        // Released back to stock
  ),

  createdAt: v.number(),
})
  .index("by_product", ["productId", "status"])
  .index("by_cart", ["cartId"])
  .index("by_checkout", ["checkoutSessionId"])
  .index("by_expires", ["expiresAt", "status"]),

// Low stock alerts
lowStockAlerts: defineTable({
  productId: v.id("products"),
  variantId: v.optional(v.id("productVariants")),

  stockCount: v.number(),         // Stock when alert triggered
  threshold: v.number(),          // Threshold at time of alert

  status: v.union(
    v.literal("active"),          // Not yet addressed
    v.literal("acknowledged"),    // Admin saw it
    v.literal("resolved")         // Stock replenished
  ),

  acknowledgedBy: v.optional(v.id("users")),
  acknowledgedAt: v.optional(v.number()),

  createdAt: v.number(),
})
  .index("by_product", ["productId"])
  .index("by_status", ["status", "createdAt"]),
```

### 4.2 Stock Lifecycle

```
Stock Flow:
┌─────────────┐
│   Restock   │ → stockCount increases
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Available  │ ← stockCount - reservedCount
└──────┬──────┘
       │
       │ Customer adds to cart → begins checkout
       ▼
┌─────────────┐
│  Reserved   │ ← reservedCount increases
└──────┬──────┘
       │
       ├─── Cart abandoned (15 min) → release → back to Available
       │
       └─── Order placed → stockCount decreases, reservedCount decreases
            │
            ▼
      ┌─────────────┐
      │    Sold     │ → Final state
      └──────┬──────┘
             │
             └─── Return → stockCount increases
```

---

## 5. Actions

### 5.1 System Actions

| Action | Code | Description | Triggered By |
|--------|------|-------------|--------------|
| Reserve Stock | `inventory.reserve` | Hold stock for checkout | Checkout initiation |
| Release Stock | `inventory.release` | Return reserved stock | Cart abandonment, checkout failure |
| Commit Stock | `inventory.commit` | Finalize stock deduction | Order placed |
| Return Stock | `inventory.return` | Restore stock on return | Return approved |

### 5.2 Staff/Admin Actions

| Action | Code | Description | Roles | Triggers Events |
|--------|------|-------------|-------|-----------------|
| Adjust Stock | `inventory.adjust` | Manual stock correction | Manager, Admin | `inventory.adjusted` |
| Restock | `inventory.restock` | Add new inventory | Staff, Manager, Admin | `inventory.adjusted`, possibly `inventory.back_in_stock` |
| Write Off | `inventory.writeoff` | Remove damaged stock | Manager, Admin | `inventory.adjusted` |
| Bulk Adjust | `inventory.bulk_adjust` | Update multiple products | Manager, Admin | Multiple `inventory.adjusted` |
| Acknowledge Alert | `inventory.acknowledge_alert` | Mark alert as seen | Staff, Manager, Admin | - |

---

## 6. Events

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Low Stock | `inventory.low_stock` | Stock falls below threshold | `{ productId: Id, variantId?: Id, stockCount: number, threshold: number }` |
| Out of Stock | `inventory.out_of_stock` | Stock reaches 0 | `{ productId: Id, variantId?: Id, productName: string }` |
| Back in Stock | `inventory.back_in_stock` | Stock goes from 0 to >0 | `{ productId: Id, variantId?: Id, productName: string, stockCount: number }` |
| Stock Adjusted | `inventory.adjusted` | Manual adjustment made | `{ productId: Id, adjustmentType: string, change: number, reason?: string, userId: Id }` |
| Stock Reserved | `inventory.reserved` | Stock held for checkout | `{ productId: Id, quantity: number, checkoutSessionId: string }` |
| Stock Released | `inventory.released` | Reserved stock returned | `{ productId: Id, quantity: number, reason: string }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| `order.placed` | Order Management | Commit reserved stock |
| `order.cancelled` | Order Management | Return committed stock |
| `return.approved` | Returns System | Restore stock |
| `checkout.abandoned` | Checkout System | Release reservations |

---

## 7. Notifications

### 7.1 Email Notifications

| Name | Trigger Event | Recipient | Priority |
|------|---------------|-----------|----------|
| Low Stock Alert | `inventory.low_stock` | Admin/Manager | High |
| Out of Stock Alert | `inventory.out_of_stock` | Admin | Immediate |
| Back in Stock | `inventory.back_in_stock` | Wishlist customers | Normal |

### 7.2 Site Notifications

| Name | Trigger Event | Recipient | Type |
|------|---------------|-----------|------|
| Low Stock | `inventory.low_stock` | Admin | Warning |
| Out of Stock | `inventory.out_of_stock` | Admin | Error |
| Stock Adjusted | `inventory.adjusted` | Admin | Info |

---

## 8. User Interface

### 8.1 Components Needed

**Admin Components:**
- [ ] `InventoryDashboard` - Overview with alerts, low stock items
- [ ] `InventoryTable` - Sortable list of all products with stock
- [ ] `StockAdjustmentForm` - Form for manual adjustments
- [ ] `BulkAdjustmentDialog` - Update multiple products
- [ ] `LowStockAlert` - Alert card component
- [ ] `InventoryHistory` - Adjustment log viewer
- [ ] `StockLevelBadge` - Visual stock indicator

**Storefront Components (from Product Catalog):**
- [ ] `StockBadge` - In Stock / Low Stock / Out of Stock
- [ ] `StockQuantityDisplay` - "Only 3 left!"

### 8.2 Real-Time UI Patterns

```tsx
// Admin: Live inventory dashboard
function InventoryDashboard() {
  const lowStockItems = useQuery(api.inventory.getLowStock);
  const outOfStockItems = useQuery(api.inventory.getOutOfStock);
  const recentAdjustments = useQuery(api.inventory.getRecentAdjustments);

  // All update in real-time as stock changes!
  return (
    <div className="grid grid-cols-3 gap-4">
      <AlertCard
        title="Low Stock"
        count={lowStockItems?.length ?? 0}
        variant="warning"
      />
      <AlertCard
        title="Out of Stock"
        count={outOfStockItems?.length ?? 0}
        variant="error"
      />
      <RecentActivity items={recentAdjustments} />
    </div>
  );
}

// Storefront: Real-time stock on product page
function ProductStock({ productId }: { productId: Id<"products"> }) {
  const stock = useQuery(api.inventory.getAvailable, { productId });

  if (stock === undefined) return <Skeleton />;

  if (stock.available === 0) {
    return stock.allowBackorder ? (
      <Badge variant="info">Available for Backorder</Badge>
    ) : (
      <Badge variant="error">Out of Stock</Badge>
    );
  }

  if (stock.available <= stock.lowThreshold) {
    return (
      <Badge variant="warning">
        Only {stock.available} left!
      </Badge>
    );
  }

  return <Badge variant="success">In Stock</Badge>;
}
```

---

## 9. Business Rules

### 9.1 Reservation Rules

**Reservation Timing:**
- Stock reserved when checkout begins
- Reservation expires after 15 minutes (configurable)
- Expired reservations auto-release via scheduled job

**Reservation Limits:**
- Max reservation per customer: configurable per product
- Cannot reserve more than available stock
- Backorder products skip reservation

### 9.2 Stock Calculations

```typescript
// Available stock calculation
availableStock = stockCount - reservedCount;

// Can purchase?
canPurchase = (
  !trackInventory ||              // Not tracking inventory
  availableStock >= quantity ||    // Have enough stock
  allowBackorder                   // Backorders allowed
);

// Is low stock?
isLowStock = trackInventory && stockCount <= lowStockThreshold && stockCount > 0;

// Is out of stock?
isOutOfStock = trackInventory && stockCount === 0 && !allowBackorder;
```

### 9.3 Adjustment Rules

**Allowed Adjustments:**
- Restock: Positive only, requires quantity and reason
- Write-off: Negative only, requires reason
- Correction: Positive or negative, requires reason
- Transfer: Requires source and destination (future)

**Validation:**
- Cannot adjust to negative stock
- All adjustments logged with timestamp, user, reason
- Cannot adjust reserved stock directly

### 9.4 Edge Cases

| Scenario | Handling |
|----------|----------|
| Two users try to buy last item | Convex serialization ensures one wins |
| Checkout abandoned, stock reserved | Auto-release after 15 minutes |
| Return of item now at 0 stock | Increment stock, trigger `back_in_stock` |
| Bulk restock during flash sale | Reservations continue, new stock adds to available |
| Product deleted with reservations | Cancel reservations, notify affected checkouts |

---

## 10. API Design

### 10.1 Queries

```typescript
// Get available stock for a product
export const getAvailable = query({
  args: {
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");

    // For variants, check variant stock (future)
    // For now, use product stock

    return {
      productId: args.productId,
      stockCount: product.stockCount,
      reservedCount: product.reservedCount ?? 0,
      available: product.stockCount - (product.reservedCount ?? 0),
      lowThreshold: product.lowStockThreshold,
      isLowStock: product.stockCount <= product.lowStockThreshold && product.stockCount > 0,
      isOutOfStock: product.stockCount === 0,
      trackInventory: product.trackInventory,
      allowBackorder: product.allowBackorder,
    };
  },
});

// Check if can fulfill order
export const canFulfill = query({
  args: {
    items: v.array(v.object({
      productId: v.id("products"),
      variantId: v.optional(v.id("productVariants")),
      quantity: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.items.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        if (!product) return { ...item, canFulfill: false, reason: "Product not found" };

        const available = product.stockCount - (product.reservedCount ?? 0);

        if (!product.trackInventory) {
          return { ...item, canFulfill: true, reason: "Not tracking inventory" };
        }

        if (available >= item.quantity) {
          return { ...item, canFulfill: true, available };
        }

        if (product.allowBackorder) {
          return { ...item, canFulfill: true, reason: "Backorder", backordered: item.quantity - available };
        }

        return { ...item, canFulfill: false, reason: "Insufficient stock", available };
      })
    );

    return {
      canFulfillAll: results.every((r) => r.canFulfill),
      items: results,
    };
  },
});

// Get low stock products (admin)
export const getLowStock = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();

    return products
      .filter((p) =>
        p.trackInventory &&
        p.status === "active" &&
        p.stockCount > 0 &&
        p.stockCount <= p.lowStockThreshold
      )
      .sort((a, b) => a.stockCount - b.stockCount);
  },
});

// Get out of stock products (admin)
export const getOutOfStock = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();

    return products.filter((p) =>
      p.trackInventory &&
      p.status === "active" &&
      p.stockCount === 0 &&
      !p.allowBackorder
    );
  },
});

// Get inventory history
export const getHistory = query({
  args: {
    productId: v.optional(v.id("products")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("inventoryAdjustments").withIndex("by_date");

    if (args.productId) {
      query = ctx.db
        .query("inventoryAdjustments")
        .withIndex("by_product", (q) => q.eq("productId", args.productId));
    }

    const adjustments = await query.order("desc").take(args.limit ?? 50);

    // Enrich with product info
    return Promise.all(
      adjustments.map(async (adj) => {
        const product = await ctx.db.get(adj.productId);
        const user = adj.userId ? await ctx.db.get(adj.userId) : null;
        return {
          ...adj,
          productName: product?.name ?? "Unknown",
          userName: user?.name ?? "System",
        };
      })
    );
  },
});

// Get active reservations (admin)
export const getActiveReservations = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("stockReservations")
      .withIndex("by_expires")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});
```

### 10.2 Mutations

```typescript
// Reserve stock for checkout (ATOMIC - no race conditions)
export const reserve = mutation({
  args: {
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
    quantity: v.number(),
    cartId: v.optional(v.id("carts")),
    checkoutSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");

    // Skip reservation for non-tracked or backorder products
    if (!product.trackInventory || product.allowBackorder) {
      return { success: true, reserved: 0 };
    }

    const available = product.stockCount - (product.reservedCount ?? 0);

    if (available < args.quantity) {
      throw new Error(`Insufficient stock. Only ${available} available.`);
    }

    // Atomic update - Convex guarantees no race condition
    await ctx.db.patch(args.productId, {
      reservedCount: (product.reservedCount ?? 0) + args.quantity,
    });

    // Create reservation record
    const reservationId = await ctx.db.insert("stockReservations", {
      productId: args.productId,
      variantId: args.variantId,
      cartId: args.cartId,
      checkoutSessionId: args.checkoutSessionId,
      quantity: args.quantity,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
      status: "active",
      createdAt: Date.now(),
    });

    // Log adjustment
    await ctx.db.insert("inventoryAdjustments", {
      productId: args.productId,
      variantId: args.variantId,
      adjustmentType: "reservation",
      quantityBefore: available,
      quantityChange: -args.quantity,
      quantityAfter: available - args.quantity,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "inventory.reserved",
      payload: {
        productId: args.productId,
        quantity: args.quantity,
        checkoutSessionId: args.checkoutSessionId,
      },
    });

    return { success: true, reservationId, reserved: args.quantity };
  },
});

// Release reserved stock
export const release = mutation({
  args: {
    reservationId: v.optional(v.id("stockReservations")),
    productId: v.optional(v.id("products")),
    checkoutSessionId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let reservation;

    if (args.reservationId) {
      reservation = await ctx.db.get(args.reservationId);
    } else if (args.checkoutSessionId) {
      reservation = await ctx.db
        .query("stockReservations")
        .withIndex("by_checkout", (q) => q.eq("checkoutSessionId", args.checkoutSessionId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();
    }

    if (!reservation || reservation.status !== "active") {
      return { success: false, reason: "No active reservation found" };
    }

    const product = await ctx.db.get(reservation.productId);
    if (!product) return { success: false, reason: "Product not found" };

    // Return stock
    await ctx.db.patch(reservation.productId, {
      reservedCount: Math.max(0, (product.reservedCount ?? 0) - reservation.quantity),
    });

    // Update reservation status
    await ctx.db.patch(reservation._id, { status: "released" });

    // Log adjustment
    await ctx.db.insert("inventoryAdjustments", {
      productId: reservation.productId,
      variantId: reservation.variantId,
      adjustmentType: "release",
      quantityBefore: product.stockCount - (product.reservedCount ?? 0),
      quantityChange: reservation.quantity,
      quantityAfter: product.stockCount - (product.reservedCount ?? 0) + reservation.quantity,
      reason: args.reason,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "inventory.released",
      payload: {
        productId: reservation.productId,
        quantity: reservation.quantity,
        reason: args.reason ?? "released",
      },
    });

    return { success: true, released: reservation.quantity };
  },
});

// Commit reserved stock (order placed)
export const commit = mutation({
  args: {
    checkoutSessionId: v.string(),
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const reservations = await ctx.db
      .query("stockReservations")
      .withIndex("by_checkout", (q) => q.eq("checkoutSessionId", args.checkoutSessionId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    for (const reservation of reservations) {
      const product = await ctx.db.get(reservation.productId);
      if (!product) continue;

      // Deduct from both stockCount and reservedCount
      await ctx.db.patch(reservation.productId, {
        stockCount: product.stockCount - reservation.quantity,
        reservedCount: Math.max(0, (product.reservedCount ?? 0) - reservation.quantity),
        lastSoldAt: Date.now(),
      });

      // Update reservation status
      await ctx.db.patch(reservation._id, { status: "committed" });

      // Log adjustment
      await ctx.db.insert("inventoryAdjustments", {
        productId: reservation.productId,
        variantId: reservation.variantId,
        adjustmentType: "sale",
        quantityBefore: product.stockCount,
        quantityChange: -reservation.quantity,
        quantityAfter: product.stockCount - reservation.quantity,
        orderId: args.orderId,
        createdAt: Date.now(),
      });

      // Check for low stock or out of stock
      const newStock = product.stockCount - reservation.quantity;

      if (newStock === 0 && product.trackInventory && !product.allowBackorder) {
        await ctx.scheduler.runAfter(0, internal.events.dispatch, {
          eventCode: "inventory.out_of_stock",
          payload: { productId: reservation.productId, productName: product.name },
        });
      } else if (
        newStock <= product.lowStockThreshold &&
        newStock > 0 &&
        product.trackInventory
      ) {
        await ctx.scheduler.runAfter(0, internal.events.dispatch, {
          eventCode: "inventory.low_stock",
          payload: {
            productId: reservation.productId,
            stockCount: newStock,
            threshold: product.lowStockThreshold,
          },
        });
      }
    }

    return { success: true, committed: reservations.length };
  },
});

// Manual stock adjustment (admin)
export const adjust = mutation({
  args: {
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
    adjustmentType: v.union(
      v.literal("restock"),
      v.literal("damage"),
      v.literal("correction")
    ),
    quantity: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const userId = await getUserId(ctx, identity.email);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");

    const previousStock = product.stockCount;
    const newStock = previousStock + args.quantity;

    if (newStock < 0) {
      throw new Error("Cannot adjust to negative stock");
    }

    const wasOutOfStock = previousStock === 0;
    const isNowInStock = newStock > 0;

    await ctx.db.patch(args.productId, {
      stockCount: newStock,
      ...(args.adjustmentType === "restock" && { lastRestockAt: Date.now() }),
    });

    await ctx.db.insert("inventoryAdjustments", {
      productId: args.productId,
      variantId: args.variantId,
      adjustmentType: args.adjustmentType,
      quantityBefore: previousStock,
      quantityChange: args.quantity,
      quantityAfter: newStock,
      reason: args.reason,
      userId,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "inventory.adjusted",
      payload: {
        productId: args.productId,
        adjustmentType: args.adjustmentType,
        change: args.quantity,
        reason: args.reason,
        userId,
      },
    });

    // Check for back in stock
    if (wasOutOfStock && isNowInStock) {
      await ctx.scheduler.runAfter(0, internal.events.dispatch, {
        eventCode: "inventory.back_in_stock",
        payload: {
          productId: args.productId,
          productName: product.name,
          stockCount: newStock,
        },
      });
    }

    return { success: true, previousStock, newStock };
  },
});

// Bulk adjustment
export const bulkAdjust = mutation({
  args: {
    adjustments: v.array(v.object({
      productId: v.id("products"),
      quantity: v.number(),
    })),
    adjustmentType: v.union(v.literal("restock"), v.literal("correction")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const results = await Promise.all(
      args.adjustments.map(async (adj) => {
        try {
          await ctx.runMutation(internal.inventory.adjust, {
            productId: adj.productId,
            adjustmentType: args.adjustmentType,
            quantity: adj.quantity,
            reason: args.reason,
          });
          return { productId: adj.productId, success: true };
        } catch (error) {
          return { productId: adj.productId, success: false, error: error.message };
        }
      })
    );

    return {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success),
    };
  },
});
```

### 10.3 Scheduled Jobs

```typescript
// Release expired reservations (runs every minute)
export const releaseExpiredReservations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("stockReservations")
      .withIndex("by_expires")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.lt(q.field("expiresAt"), Date.now())
        )
      )
      .collect();

    for (const reservation of expired) {
      await ctx.runMutation(internal.inventory.release, {
        reservationId: reservation._id,
        reason: "expired",
      });
    }

    return { released: expired.length };
  },
});

// Cron job registration
export const setupCronJobs = internalAction({
  handler: async (ctx) => {
    // Run every minute
    await ctx.scheduler.runEvery(
      60 * 1000, // 1 minute
      internal.inventory.releaseExpiredReservations
    );
  },
});
```

---

## 11. MCP Integration

### 11.1 MCP Tools

```typescript
// MCP Tool: check_inventory
{
  name: "check_inventory",
  description: "Check product availability and stock level",
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string", description: "Product ID", required: true },
      quantity: { type: "number", description: "Desired quantity", default: 1 },
    },
    required: ["productId"],
  },
  handler: async ({ productId, quantity }) => {
    const stock = await convex.query(api.inventory.getAvailable, { productId });

    return {
      available: stock.available >= quantity,
      stockCount: stock.stockCount,
      availableCount: stock.available,
      isLowStock: stock.isLowStock,
      isOutOfStock: stock.isOutOfStock,
      allowBackorder: stock.allowBackorder,
      canFulfill: stock.available >= quantity || stock.allowBackorder,
    };
  },
}

// MCP Tool: get_stock_level
{
  name: "get_stock_level",
  description: "Get current stock level for a product",
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string", required: true },
    },
  },
  handler: async ({ productId }) => {
    return await convex.query(api.inventory.getAvailable, { productId });
  },
}
```

### 11.2 MCP Resources

```typescript
// Resource: inventory://{productId}
// Returns current stock level

// Resource: inventory://low-stock
// Returns items below threshold

// Resource: inventory://out-of-stock
// Returns out of stock items
```

---

## 12. Security Considerations

### 12.1 Authorization

| Action | Required Role |
|--------|---------------|
| View stock levels (public) | Guest (limited info) |
| View detailed inventory | Staff+ |
| Reserve stock | System (checkout) |
| Adjust stock | Manager+ |
| Bulk adjust | Manager+ |

### 12.2 Data Protection

- Exact stock counts may be hidden from public (only "In Stock"/"Low Stock"/"Out of Stock")
- Reservation details not exposed to customers
- Adjustment history limited to authorized users

---

## 13. Implementation Checklist

### Phase 1: Foundation
- [ ] Add inventory fields to products schema
- [ ] Create inventoryAdjustments table
- [ ] Create stockReservations table
- [ ] Implement getAvailable query

### Phase 2: Core Operations
- [ ] Implement reserve mutation
- [ ] Implement release mutation
- [ ] Implement commit mutation
- [ ] Set up reservation expiry cron job

### Phase 3: Admin Interface
- [ ] Create inventory dashboard route
- [ ] Build InventoryTable component
- [ ] Build StockAdjustmentForm
- [ ] Implement history viewer

### Phase 4: Integration
- [ ] Wire up low stock/out of stock events
- [ ] Connect to email notifications
- [ ] Add MCP tools

---

## 14. Future Considerations

- **Multi-Warehouse:** Track stock per location
- **Batch/Lot Tracking:** For perishables, compliance
- **Forecasting:** Predict restock needs
- **Supplier Integration:** Auto-reorder triggers
- **Serial Numbers:** For high-value items

---

**PRD Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
**Author:** Claude (AI Assistant)
