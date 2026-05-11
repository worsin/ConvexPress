# PRD: Checkout System

> **System Code:** ORD-CHK
> **Phase:** 4 of 6
> **Priority:** P0 - Critical
> **Complexity:** Complex

---

## 1. Overview

### 1.1 Purpose

The Checkout System transforms a shopping cart into a completed order. Built for the AI-enabled commerce era, this system implements the Universal Commerce Protocol (UCP) from day one, allowing customers to complete purchases through Google Gemini, Claude, and other AI agents. The checkout flow is designed as a state machine with real-time updates, atomic stock reservation, and seamless payment processing.

### 1.2 Scope

**In Scope:**
- Multi-step checkout flow (shipping → payment → review → confirmation)
- UCP REST API for AI agent checkout
- Checkout session management
- Shipping address collection and validation
- Billing address collection
- Shipping method selection with rate calculation
- Payment method selection and processing
- Order review before submission
- Stock reservation during checkout
- Guest checkout support
- Order creation and confirmation
- Real-time checkout state sync
- MCP tools for checkout operations

**Out of Scope:**
- Cart management (PRD-SHOPPING-CART)
- Payment processing internals (PRD-PAYMENT-SYSTEM)
- Discount/coupon logic (PRD-DISCOUNTS)
- Tax calculation internals (PRD-TAX-CALCULATION)
- Order lifecycle post-creation (PRD-ORDER-MANAGEMENT)
- Shipping fulfillment (PRD-SHIPPING-FULFILLMENT)

### 1.3 UCP Compliance: AI-Enabled Commerce

**This is not optional.** Google launched UCP in January 2026. Our checkout must be UCP-compliant to enable purchases through AI assistants.

```
┌─────────────────────────────────────────────────────────────┐
│                     CUSTOMER TOUCHPOINTS                     │
├───────────────────┬─────────────────┬───────────────────────┤
│   Web Checkout    │  Mobile Checkout │   AI Agent Checkout  │
│  (Browser UI)     │  (Native App)    │ (Gemini, Claude...)  │
└─────────┬─────────┴────────┬────────┴───────────┬───────────┘
          │                  │                    │
          └──────────────────┴────────────────────┘
                             │
                             ▼
                ┌────────────────────────┐
                │   Unified Checkout API  │
                │   (UCP-Compliant REST)  │
                └────────────┬───────────┘
                             │
                             ▼
                ┌────────────────────────┐
                │      Convex Backend     │
                │  (Atomic Transactions)  │
                └────────────────────────┘
```

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Event System | PLT-EVT | 0 | Checkout events for notifications |
| Authentication | PLT-AUT | 0 | User identity (optional for guest) |
| Payment System | PAY-STR | 1 | Payment processing |
| Customer Accounts | USR-ACT | 1 | Address book integration |
| Shopping Cart | ORD-CRT | 3 | Cart contents to check out |
| Inventory System | INV-STK | 3 | Stock reservation |
| Tax Calculation | PAY-TAX | 2 | Tax computation |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Order Management | ORD-MGT | 4 | Order creation |
| Shipping & Fulfillment | FUL-SHP | 4 | Shipping method selection |
| Analytics | ADM-RPT | 6 | Conversion tracking |

### 2.3 Integration Hooks

```typescript
// Events emitted by Checkout System
type CheckoutEvents =
  | "checkout.started"           // Checkout initiated
  | "checkout.shipping_set"      // Shipping address saved
  | "checkout.payment_set"       // Payment method selected
  | "checkout.completed"         // Order successfully placed
  | "checkout.abandoned"         // Checkout not completed
  | "checkout.failed";           // Payment or validation failed

// Checkout context for other systems
interface CheckoutSession {
  id: string;
  cartId: Id<"carts">;
  userId?: Id<"users">;
  status: "shipping" | "payment" | "review" | "processing" | "completed" | "failed";
  shippingAddress?: Address;
  billingAddress?: Address;
  shippingMethod?: ShippingMethod;
  paymentMethod?: PaymentMethod;
  totals: OrderTotals;
  stockReserved: boolean;
  createdAt: number;
  expiresAt: number;
}
```

---

## 3. Routes

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Checkout Shipping | `/checkout/shipping` | _checkout | No* | Guest, Customer |
| Checkout Payment | `/checkout/payment` | _checkout | No* | Guest, Customer |
| Checkout Review | `/checkout/review` | _checkout | No* | Guest, Customer |
| Order Confirmation | `/checkout/confirmation/:orderId` | _marketing | No* | Guest, Customer |

*Guest checkout allowed with email collection

### 3.2 UCP REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ucp/checkout/sessions` | Create checkout session |
| GET | `/api/ucp/checkout/sessions/:id` | Get session state |
| PATCH | `/api/ucp/checkout/sessions/:id` | Update session (address, coupon, qty) |
| POST | `/api/ucp/checkout/sessions/:id/complete` | Complete checkout |
| DELETE | `/api/ucp/checkout/sessions/:id` | Cancel/abandon session |

---

## 4. Data Model

### 4.1 Tables

```typescript
// admin-app/packages/backend/convex/schema.ts

// Checkout sessions table
checkoutSessions: defineTable({
  // Reference
  cartId: v.id("carts"),
  userId: v.optional(v.id("users")),
  sessionToken: v.string(),              // For UCP/API access

  // Guest info (if not logged in)
  guestEmail: v.optional(v.string()),
  guestPhone: v.optional(v.string()),

  // Status
  status: v.union(
    v.literal("shipping"),     // Collecting shipping info
    v.literal("payment"),      // Collecting payment info
    v.literal("review"),       // Ready for final review
    v.literal("processing"),   // Payment processing
    v.literal("completed"),    // Order created
    v.literal("failed"),       // Payment failed
    v.literal("expired"),      // Session timed out
    v.literal("abandoned")     // User left
  ),

  // Shipping
  shippingAddress: v.optional(v.object({
    firstName: v.string(),
    lastName: v.string(),
    company: v.optional(v.string()),
    address1: v.string(),
    address2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    postalCode: v.string(),
    country: v.string(),
    phone: v.optional(v.string()),
  })),
  shippingMethodId: v.optional(v.string()),
  shippingRate: v.optional(v.number()),

  // Billing
  billingAddress: v.optional(v.object({
    firstName: v.string(),
    lastName: v.string(),
    company: v.optional(v.string()),
    address1: v.string(),
    address2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    postalCode: v.string(),
    country: v.string(),
  })),
  billingSameAsShipping: v.boolean(),

  // Payment
  paymentMethodId: v.optional(v.string()),    // Stripe payment method
  paymentIntentId: v.optional(v.string()),    // Stripe payment intent
  paymentStatus: v.optional(v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("succeeded"),
    v.literal("failed")
  )),

  // Discounts
  discountCode: v.optional(v.string()),
  discountId: v.optional(v.id("discounts")),
  discountAmount: v.optional(v.number()),

  // Totals (in cents)
  subtotal: v.number(),
  shippingTotal: v.number(),
  taxTotal: v.number(),
  discountTotal: v.number(),
  grandTotal: v.number(),

  // Stock
  stockReserved: v.boolean(),
  reservationIds: v.optional(v.array(v.id("stockReservations"))),

  // Result
  orderId: v.optional(v.id("orders")),
  failureReason: v.optional(v.string()),

  // UCP specific
  ucpAgentId: v.optional(v.string()),        // AI agent identifier
  ucpMandateId: v.optional(v.string()),      // AP2 mandate reference

  // Timestamps
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.number(),                     // 30 min from creation
  completedAt: v.optional(v.number()),
})
  .index("by_cart", ["cartId"])
  .index("by_user", ["userId"])
  .index("by_token", ["sessionToken"])
  .index("by_status", ["status"])
  .index("by_expires", ["expiresAt"]),
```

### 4.2 Checkout Flow State Machine

```
                    ┌─────────────────┐
                    │    shipping     │ ← Initial state
                    └────────┬────────┘
                             │ setShippingAddress()
                             │ setShippingMethod()
                             ▼
                    ┌─────────────────┐
                    │    payment      │ ← Payment info
                    └────────┬────────┘
                             │ setPaymentMethod()
                             ▼
                    ┌─────────────────┐
                    │     review      │ ← Final review
                    └────────┬────────┘
                             │ complete()
                             ▼
                    ┌─────────────────┐
                    │   processing    │ ← Payment in progress
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                              ▼
    ┌─────────────────┐            ┌─────────────────┐
    │   completed     │            │     failed      │
    └─────────────────┘            └─────────────────┘

Timeout paths:
- Any state → expired (after 30 min inactivity)
- Any state → abandoned (explicit cancellation)
```

---

## 5. Actions

### 5.1 Customer Actions

| Action | Code | Description | Roles | Triggers Events |
|--------|------|-------------|-------|-----------------|
| Start Checkout | `checkout.start` | Begin checkout process | Guest, Customer | `checkout.started` |
| Set Shipping | `checkout.set_shipping` | Save shipping address | Guest, Customer | `checkout.shipping_set` |
| Set Payment | `checkout.set_payment` | Save payment method | Guest, Customer | `checkout.payment_set` |
| Apply Coupon | `checkout.apply_coupon` | Apply discount code | Guest, Customer | - |
| Complete | `checkout.complete` | Finalize order | Guest, Customer | `checkout.completed` |
| Abandon | `checkout.abandon` | Leave checkout | Guest, Customer | `checkout.abandoned` |

### 5.2 System Actions

| Action | Code | Description | Triggered By |
|--------|------|-------------|--------------|
| Reserve Stock | `checkout.reserve_stock` | Hold inventory | Checkout start |
| Release Stock | `checkout.release_stock` | Return inventory | Abandon/expire/fail |
| Process Payment | `checkout.process_payment` | Charge payment | Complete action |
| Create Order | `checkout.create_order` | Generate order | Payment success |

---

## 6. Events

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Checkout Started | `checkout.started` | Session created | `{ sessionId: string, cartId: Id, userId?: Id, value: number }` |
| Shipping Set | `checkout.shipping_set` | Address saved | `{ sessionId: string, country: string, state: string }` |
| Payment Set | `checkout.payment_set` | Payment method added | `{ sessionId: string, paymentType: string }` |
| Checkout Completed | `checkout.completed` | Order created | `{ sessionId: string, orderId: Id, value: number, userId?: Id }` |
| Checkout Abandoned | `checkout.abandoned` | User left | `{ sessionId: string, step: string, value: number }` |
| Checkout Failed | `checkout.failed` | Payment/validation failed | `{ sessionId: string, reason: string }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| `cart.updated` | Shopping Cart | Recalculate totals |
| `payment.succeeded` | Payment System | Complete checkout |
| `payment.failed` | Payment System | Mark as failed |

---

## 7. Notifications

### 7.1 Email Notifications

| Name | Trigger Event | Recipient | Priority |
|------|---------------|-----------|----------|
| Order Confirmation | `checkout.completed` | Customer | Immediate |
| Checkout Abandoned | `checkout.abandoned` | Customer | 1 hour delay |
| Payment Failed | `checkout.failed` | Customer | Immediate |

### 7.2 Site Notifications

| Name | Trigger Event | Recipient | Type |
|------|---------------|-----------|------|
| Order Placed | `checkout.completed` | Customer | Success |
| Payment Failed | `checkout.failed` | Customer | Error |

---

## 8. User Interface

### 8.1 Components Needed

**Storefront Components:**
- [ ] `CheckoutLayout` - Multi-step checkout container
- [ ] `CheckoutProgress` - Step indicator (shipping → payment → review)
- [ ] `ShippingAddressForm` - Address input with validation
- [ ] `AddressBook` - Saved addresses selector (logged in users)
- [ ] `ShippingMethodSelector` - Radio list of shipping options
- [ ] `PaymentForm` - Stripe Elements integration
- [ ] `SavedPaymentMethods` - Saved cards selector
- [ ] `BillingAddressForm` - Billing address (or same as shipping)
- [ ] `OrderReview` - Final summary before purchase
- [ ] `OrderSummary` - Sidebar with items, totals
- [ ] `CouponInput` - Discount code input
- [ ] `PlaceOrderButton` - Final submit with loading state
- [ ] `OrderConfirmation` - Success page with order details

### 8.2 Real-Time UI Patterns

```tsx
// Live order summary that updates as user fills out checkout
function OrderSummary({ sessionId }: { sessionId: string }) {
  const session = useQuery(api.checkout.getSession, { sessionId });

  if (!session) return <Skeleton />;

  return (
    <div className="bg-muted p-4 rounded-lg">
      <h3 className="font-bold mb-4">Order Summary</h3>

      {session.items.map((item) => (
        <div key={item.id} className="flex justify-between text-sm">
          <span>{item.product.name} × {item.quantity}</span>
          <span>${(item.lineTotal / 100).toFixed(2)}</span>
        </div>
      ))}

      <Separator className="my-4" />

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>${(session.subtotal / 100).toFixed(2)}</span>
        </div>

        {session.discountAmount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount</span>
            <span>-${(session.discountAmount / 100).toFixed(2)}</span>
          </div>
        )}

        <div className="flex justify-between">
          <span>Shipping</span>
          <span>
            {session.shippingRate
              ? `$${(session.shippingRate / 100).toFixed(2)}`
              : "Calculated next step"
            }
          </span>
        </div>

        <div className="flex justify-between">
          <span>Tax</span>
          <span>${(session.taxTotal / 100).toFixed(2)}</span>
        </div>
      </div>

      <Separator className="my-4" />

      <div className="flex justify-between font-bold">
        <span>Total</span>
        <span>${(session.grandTotal / 100).toFixed(2)}</span>
      </div>
    </div>
  );
}

// Shipping method selector with live rate updates
function ShippingMethodSelector({ sessionId }: { sessionId: string }) {
  const session = useQuery(api.checkout.getSession, { sessionId });
  const shippingMethods = useQuery(api.shipping.getAvailableMethods, {
    addressId: session?.shippingAddress ? "current" : undefined,
  });
  const setShippingMethod = useMutation(api.checkout.setShippingMethod);

  if (!shippingMethods) return <Skeleton />;

  return (
    <RadioGroup
      value={session?.shippingMethodId}
      onValueChange={(methodId) => setShippingMethod({ sessionId, methodId })}
    >
      {shippingMethods.map((method) => (
        <div key={method.id} className="flex items-center justify-between border p-4 rounded">
          <div className="flex items-center gap-3">
            <RadioGroupItem value={method.id} />
            <div>
              <div className="font-medium">{method.name}</div>
              <div className="text-sm text-muted-foreground">
                {method.estimatedDays} business days
              </div>
            </div>
          </div>
          <span className="font-medium">
            ${(method.rate / 100).toFixed(2)}
          </span>
        </div>
      ))}
    </RadioGroup>
  );
}
```

---

## 9. Business Rules

### 9.1 Session Rules

**Session Lifetime:**
- Sessions expire after 30 minutes of inactivity
- Expired sessions release stock reservations
- Sessions can be resumed if not expired

**Guest Checkout:**
- Email required for guest checkout
- Phone optional but recommended
- Guest order history accessible via email link

### 9.2 Validation Rules

**Shipping Address:**
- All required fields must be filled
- Country must be in supported list
- State/province validated for country
- Postal code format validated for country

**Payment:**
- Valid payment method required
- Billing address required (or same as shipping)
- Card must not be expired

**Stock:**
- All items must be available or backordered
- Quantities validated against reservations
- Failed stock validation blocks checkout

### 9.3 Price Locking

- Prices locked when checkout session created
- If product price changes during checkout, customer sees original price
- Stock reservation ensures availability
- Discount validation at time of application

### 9.4 Edge Cases

| Scenario | Handling |
|----------|----------|
| Item goes OOS during checkout | Show error, allow removing item |
| Session expires | Prompt to restart, cart preserved |
| Payment fails | Return to payment step, retain all info |
| Price changes during checkout | Use price at session creation |
| Discount expires during checkout | Show message, recalculate totals |
| User logs in during guest checkout | Merge cart, continue checkout |

---

## 10. API Design

### 10.1 Queries

```typescript
// Get checkout session
export const getSession = query({
  args: {
    sessionId: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let session;

    if (args.sessionId) {
      session = await ctx.db.get(args.sessionId as Id<"checkoutSessions">);
    } else if (args.sessionToken) {
      session = await ctx.db
        .query("checkoutSessions")
        .withIndex("by_token", (q) => q.eq("sessionToken", args.sessionToken))
        .first();
    }

    if (!session) return null;

    // Get cart items
    const cart = await ctx.db.get(session.cartId);
    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", session.cartId))
      .collect();

    const itemsWithProducts = await Promise.all(
      items.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        return {
          ...item,
          product,
          lineTotal: (product?.salePrice ?? product?.basePrice ?? 0) * item.quantity,
        };
      })
    );

    return {
      ...session,
      items: itemsWithProducts,
    };
  },
});

// Get available shipping methods for address
export const getShippingMethods = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId as Id<"checkoutSessions">);
    if (!session?.shippingAddress) return [];

    // Get shipping methods from config (synced from Airtable)
    const methods = await ctx.db.query("shippingMethods").collect();

    // Filter by country/region availability
    const availableMethods = methods.filter((m) =>
      m.countries.includes(session.shippingAddress.country) ||
      m.countries.includes("*")
    );

    // Calculate rates based on cart weight/value
    const cart = await ctx.db.get(session.cartId);
    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", session.cartId))
      .collect();

    const cartValue = session.subtotal;
    const cartWeight = await calculateCartWeight(ctx, items);

    return availableMethods.map((method) => ({
      id: method._id,
      name: method.name,
      description: method.description,
      estimatedDays: method.estimatedDays,
      rate: calculateShippingRate(method, cartValue, cartWeight),
    }));
  },
});
```

### 10.2 Mutations

```typescript
// Start checkout
export const start = mutation({
  args: {
    cartId: v.optional(v.id("carts")),
    guestEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity ? await getUserId(ctx, identity.email) : undefined;

    // Get cart
    let cart;
    if (args.cartId) {
      cart = await ctx.db.get(args.cartId);
    } else {
      cart = await getActiveCart(ctx, userId);
    }

    if (!cart) throw new Error("No cart found");

    // Validate cart has items
    const items = await ctx.db
      .query("cartItems")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .collect();

    if (items.length === 0) throw new Error("Cart is empty");

    // Check for existing session
    const existingSession = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "completed"),
          q.neq(q.field("status"), "expired"),
          q.neq(q.field("status"), "abandoned"),
          q.gt(q.field("expiresAt"), Date.now())
        )
      )
      .first();

    if (existingSession) {
      // Resume existing session
      await ctx.db.patch(existingSession._id, {
        expiresAt: Date.now() + 30 * 60 * 1000,
        updatedAt: Date.now(),
      });
      return { sessionId: existingSession._id, sessionToken: existingSession.sessionToken };
    }

    // Calculate subtotal
    const subtotal = await calculateSubtotal(ctx, items);

    // Reserve stock
    const reservationIds = await reserveStockForCheckout(ctx, items);

    // Create session
    const sessionToken = generateSecureToken();
    const now = Date.now();

    const sessionId = await ctx.db.insert("checkoutSessions", {
      cartId: cart._id,
      userId,
      sessionToken,
      guestEmail: args.guestEmail,
      status: "shipping",
      billingSameAsShipping: true,
      subtotal,
      shippingTotal: 0,
      taxTotal: 0,
      discountTotal: 0,
      grandTotal: subtotal,
      stockReserved: true,
      reservationIds,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 30 * 60 * 1000, // 30 minutes
    });

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "checkout.started",
      payload: { sessionId, cartId: cart._id, userId, value: subtotal },
    });

    return { sessionId, sessionToken };
  },
});

// Set shipping address
export const setShippingAddress = mutation({
  args: {
    sessionId: v.id("checkoutSessions"),
    address: v.object({
      firstName: v.string(),
      lastName: v.string(),
      company: v.optional(v.string()),
      address1: v.string(),
      address2: v.optional(v.string()),
      city: v.string(),
      state: v.string(),
      postalCode: v.string(),
      country: v.string(),
      phone: v.optional(v.string()),
    }),
    saveToAddressBook: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    // Validate address
    validateAddress(args.address);

    // Calculate tax based on address
    const taxTotal = await calculateTax(ctx, session.subtotal, args.address);

    await ctx.db.patch(args.sessionId, {
      shippingAddress: args.address,
      taxTotal,
      grandTotal: session.subtotal + session.shippingTotal + taxTotal - session.discountTotal,
      updatedAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000, // Reset expiry
    });

    // Save to address book if requested
    if (args.saveToAddressBook && session.userId) {
      await ctx.db.insert("addresses", {
        userId: session.userId,
        ...args.address,
        isDefault: false,
        createdAt: Date.now(),
      });
    }

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "checkout.shipping_set",
      payload: {
        sessionId: args.sessionId,
        country: args.address.country,
        state: args.address.state,
      },
    });

    return { success: true };
  },
});

// Set shipping method
export const setShippingMethod = mutation({
  args: {
    sessionId: v.id("checkoutSessions"),
    methodId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    // Get method and rate
    const method = await ctx.db.get(args.methodId as Id<"shippingMethods">);
    if (!method) throw new Error("Invalid shipping method");

    const rate = calculateShippingRate(method, session.subtotal, 0);

    await ctx.db.patch(args.sessionId, {
      shippingMethodId: args.methodId,
      shippingRate: rate,
      shippingTotal: rate,
      grandTotal: session.subtotal + rate + session.taxTotal - session.discountTotal,
      status: "payment", // Progress to payment step
      updatedAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    return { success: true };
  },
});

// Set payment method
export const setPaymentMethod = mutation({
  args: {
    sessionId: v.id("checkoutSessions"),
    paymentMethodId: v.string(),
    billingAddress: v.optional(v.object({
      firstName: v.string(),
      lastName: v.string(),
      company: v.optional(v.string()),
      address1: v.string(),
      address2: v.optional(v.string()),
      city: v.string(),
      state: v.string(),
      postalCode: v.string(),
      country: v.string(),
    })),
    billingSameAsShipping: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const billingSameAsShipping = args.billingSameAsShipping ?? true;
    const billingAddress = billingSameAsShipping
      ? session.shippingAddress
      : args.billingAddress;

    await ctx.db.patch(args.sessionId, {
      paymentMethodId: args.paymentMethodId,
      billingAddress,
      billingSameAsShipping,
      status: "review", // Progress to review step
      updatedAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "checkout.payment_set",
      payload: { sessionId: args.sessionId, paymentType: "card" },
    });

    return { success: true };
  },
});

// Apply coupon code
export const applyCoupon = mutation({
  args: {
    sessionId: v.id("checkoutSessions"),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    // Validate and apply coupon (delegated to Discounts system)
    const discount = await validateAndApplyCoupon(ctx, args.code, session);

    if (!discount) {
      throw new Error("Invalid or expired coupon code");
    }

    await ctx.db.patch(args.sessionId, {
      discountCode: args.code,
      discountId: discount._id,
      discountAmount: discount.amount,
      discountTotal: discount.amount,
      grandTotal: session.subtotal + session.shippingTotal + session.taxTotal - discount.amount,
      updatedAt: Date.now(),
    });

    return { success: true, discount };
  },
});

// Complete checkout
export const complete = mutation({
  args: {
    sessionId: v.id("checkoutSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    if (session.status !== "review") {
      throw new Error(`Cannot complete checkout in ${session.status} status`);
    }

    // Validate all required info
    if (!session.shippingAddress) throw new Error("Shipping address required");
    if (!session.shippingMethodId) throw new Error("Shipping method required");
    if (!session.paymentMethodId) throw new Error("Payment method required");

    // Update status to processing
    await ctx.db.patch(args.sessionId, {
      status: "processing",
      updatedAt: Date.now(),
    });

    try {
      // Process payment via Payment System
      const paymentResult = await ctx.runAction(internal.payments.processPayment, {
        paymentMethodId: session.paymentMethodId,
        amount: session.grandTotal,
        currency: "usd",
        metadata: {
          checkoutSessionId: args.sessionId,
          cartId: session.cartId,
        },
      });

      if (!paymentResult.success) {
        await ctx.db.patch(args.sessionId, {
          status: "failed",
          paymentStatus: "failed",
          failureReason: paymentResult.error,
          updatedAt: Date.now(),
        });

        await ctx.scheduler.runAfter(0, internal.events.dispatch, {
          eventCode: "checkout.failed",
          payload: { sessionId: args.sessionId, reason: paymentResult.error },
        });

        throw new Error(paymentResult.error);
      }

      // Create order via Order Management
      const orderId = await ctx.runMutation(internal.orders.createFromCheckout, {
        sessionId: args.sessionId,
        paymentIntentId: paymentResult.paymentIntentId,
      });

      // Commit stock reservations
      await ctx.runMutation(internal.inventory.commit, {
        checkoutSessionId: session.sessionToken,
        orderId,
      });

      // Mark cart as converted
      await ctx.runMutation(internal.cart.convertToOrder, {
        cartId: session.cartId,
        orderId,
      });

      // Update session
      await ctx.db.patch(args.sessionId, {
        status: "completed",
        paymentStatus: "succeeded",
        paymentIntentId: paymentResult.paymentIntentId,
        orderId,
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });

      await ctx.scheduler.runAfter(0, internal.events.dispatch, {
        eventCode: "checkout.completed",
        payload: {
          sessionId: args.sessionId,
          orderId,
          value: session.grandTotal,
          userId: session.userId,
        },
      });

      return { success: true, orderId };

    } catch (error) {
      // Release stock on failure
      if (session.stockReserved) {
        await ctx.runMutation(internal.inventory.release, {
          checkoutSessionId: session.sessionToken,
          reason: "checkout_failed",
        });
      }

      throw error;
    }
  },
});

// Abandon checkout
export const abandon = mutation({
  args: { sessionId: v.id("checkoutSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    if (session.status === "completed") return;

    // Release stock reservations
    if (session.stockReserved) {
      await ctx.runMutation(internal.inventory.release, {
        checkoutSessionId: session.sessionToken,
        reason: "abandoned",
      });
    }

    await ctx.db.patch(args.sessionId, {
      status: "abandoned",
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "checkout.abandoned",
      payload: {
        sessionId: args.sessionId,
        step: session.status,
        value: session.grandTotal,
      },
    });
  },
});
```

### 10.3 Scheduled Jobs

```typescript
// Expire old checkout sessions
export const expireSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_expires")
      .filter((q) =>
        q.and(
          q.lt(q.field("expiresAt"), Date.now()),
          q.neq(q.field("status"), "completed"),
          q.neq(q.field("status"), "expired"),
          q.neq(q.field("status"), "abandoned")
        )
      )
      .collect();

    for (const session of expired) {
      // Release stock
      if (session.stockReserved) {
        await ctx.runMutation(internal.inventory.release, {
          checkoutSessionId: session.sessionToken,
          reason: "expired",
        });
      }

      await ctx.db.patch(session._id, {
        status: "expired",
        updatedAt: Date.now(),
      });
    }

    return { expired: expired.length };
  },
});
```

---

## 11. UCP REST API Implementation

### 11.1 Discovery Endpoint

```typescript
// /api/.well-known/ucp
export async function GET() {
  return Response.json({
    version: "1.0",
    capabilities: ["checkout", "order", "identity_linking", "inventory"],
    rest: {
      endpoint: `${process.env.SITE_URL}/api/ucp`,
      authentication: ["oauth2", "api_key"],
    },
    product_feed: {
      url: `${process.env.SITE_URL}/api/feed/products.json`,
      format: "json",
    },
  });
}
```

### 11.2 Checkout Session Endpoints

```typescript
// POST /api/ucp/checkout/sessions
export async function POST(req: Request) {
  const body = await req.json();

  // Validate agent authentication
  const agentId = await validateUCPAgent(req);

  // Create session
  const result = await convex.mutation(api.checkout.start, {
    cartId: body.cart_id,
    guestEmail: body.email,
  });

  // Record agent
  await convex.mutation(internal.checkout.setAgentId, {
    sessionId: result.sessionId,
    agentId,
    mandateId: body.mandate_id,
  });

  return Response.json({
    id: result.sessionToken, // Use token for UCP, not internal ID
    status: "shipping",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    _links: {
      self: { href: `/api/ucp/checkout/sessions/${result.sessionToken}` },
      complete: { href: `/api/ucp/checkout/sessions/${result.sessionToken}/complete` },
    },
  });
}

// GET /api/ucp/checkout/sessions/:id
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await convex.query(api.checkout.getSession, {
    sessionToken: params.id,
  });

  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  return Response.json({
    id: session.sessionToken,
    status: session.status,
    shipping_address: session.shippingAddress,
    shipping_method: session.shippingMethodId,
    billing_address: session.billingAddress,
    payment_method: session.paymentMethodId ? { id: session.paymentMethodId } : null,
    totals: {
      subtotal: session.subtotal,
      shipping: session.shippingTotal,
      tax: session.taxTotal,
      discount: session.discountTotal,
      total: session.grandTotal,
      currency: "usd",
    },
    items: session.items.map((item) => ({
      product_id: item.productId,
      name: item.product.name,
      quantity: item.quantity,
      unit_price: item.product.salePrice ?? item.product.basePrice,
      line_total: item.lineTotal,
    })),
    created_at: new Date(session.createdAt).toISOString(),
    expires_at: new Date(session.expiresAt).toISOString(),
  });
}

// PATCH /api/ucp/checkout/sessions/:id
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();

  const session = await convex.query(api.checkout.getSession, {
    sessionToken: params.id,
  });

  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  // Handle different update types
  if (body.shipping_address) {
    await convex.mutation(api.checkout.setShippingAddress, {
      sessionId: session._id,
      address: body.shipping_address,
    });
  }

  if (body.shipping_method) {
    await convex.mutation(api.checkout.setShippingMethod, {
      sessionId: session._id,
      methodId: body.shipping_method,
    });
  }

  if (body.payment_method) {
    await convex.mutation(api.checkout.setPaymentMethod, {
      sessionId: session._id,
      paymentMethodId: body.payment_method.id,
      billingAddress: body.billing_address,
    });
  }

  if (body.coupon_code) {
    await convex.mutation(api.checkout.applyCoupon, {
      sessionId: session._id,
      code: body.coupon_code,
    });
  }

  // Return updated session
  const updated = await convex.query(api.checkout.getSession, {
    sessionToken: params.id,
  });

  return Response.json(formatSessionForUCP(updated));
}

// POST /api/ucp/checkout/sessions/:id/complete
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await convex.query(api.checkout.getSession, {
    sessionToken: params.id,
  });

  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const result = await convex.mutation(api.checkout.complete, {
      sessionId: session._id,
    });

    return Response.json({
      status: "completed",
      order_id: result.orderId,
      order_url: `${process.env.SITE_URL}/account/orders/${result.orderId}`,
    });
  } catch (error) {
    return Response.json(
      { error: error.message, status: "failed" },
      { status: 400 }
    );
  }
}

// DELETE /api/ucp/checkout/sessions/:id
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await convex.query(api.checkout.getSession, {
    sessionToken: params.id,
  });

  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  await convex.mutation(api.checkout.abandon, { sessionId: session._id });

  return Response.json({ status: "cancelled" });
}
```

---

## 12. MCP Integration

### 12.1 MCP Tools

```typescript
// MCP Tool: initiate_checkout
{
  name: "initiate_checkout",
  description: "Start a new checkout session from a cart",
  inputSchema: {
    type: "object",
    properties: {
      cartId: { type: "string", required: true },
      email: { type: "string", description: "Customer email for guest checkout" },
    },
    required: ["cartId"],
  },
  handler: async ({ cartId, email }) => {
    return await convex.mutation(api.checkout.start, { cartId, guestEmail: email });
  },
}

// MCP Tool: set_shipping_address
{
  name: "set_shipping_address",
  description: "Set the shipping address for checkout",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: { type: "string", required: true },
      address: {
        type: "object",
        properties: {
          firstName: { type: "string" },
          lastName: { type: "string" },
          address1: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          postalCode: { type: "string" },
          country: { type: "string" },
        },
        required: ["firstName", "lastName", "address1", "city", "state", "postalCode", "country"],
      },
    },
    required: ["sessionId", "address"],
  },
  handler: async ({ sessionId, address }) => {
    return await convex.mutation(api.checkout.setShippingAddress, { sessionId, address });
  },
}

// MCP Tool: set_shipping_method
{
  name: "set_shipping_method",
  description: "Select a shipping method",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: { type: "string", required: true },
      methodId: { type: "string", required: true },
    },
    required: ["sessionId", "methodId"],
  },
  handler: async ({ sessionId, methodId }) => {
    return await convex.mutation(api.checkout.setShippingMethod, { sessionId, methodId });
  },
}

// MCP Tool: set_payment_method
{
  name: "set_payment_method",
  description: "Set the payment method for checkout",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: { type: "string", required: true },
      paymentMethodId: { type: "string", required: true },
    },
    required: ["sessionId", "paymentMethodId"],
  },
  handler: async ({ sessionId, paymentMethodId }) => {
    return await convex.mutation(api.checkout.setPaymentMethod, { sessionId, paymentMethodId });
  },
}

// MCP Tool: calculate_totals
{
  name: "calculate_totals",
  description: "Get current checkout totals",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: { type: "string", required: true },
    },
    required: ["sessionId"],
  },
  handler: async ({ sessionId }) => {
    const session = await convex.query(api.checkout.getSession, { sessionId });
    return {
      subtotal: session.subtotal,
      shipping: session.shippingTotal,
      tax: session.taxTotal,
      discount: session.discountTotal,
      total: session.grandTotal,
      currency: "usd",
    };
  },
}

// MCP Tool: place_order
{
  name: "place_order",
  description: "Complete the checkout and place the order",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: { type: "string", required: true },
    },
    required: ["sessionId"],
  },
  handler: async ({ sessionId }) => {
    return await convex.mutation(api.checkout.complete, { sessionId });
  },
}
```

### 12.2 MCP Resources

```typescript
// Resource: checkout://{sessionId}
// Returns full checkout state

// Resource: checkout://{sessionId}/shipping
// Returns available shipping options

// Resource: checkout://{sessionId}/payment
// Returns available payment methods
```

---

## 13. Security Considerations

### 13.1 Session Security

- Session tokens are cryptographically random
- Tokens expire after 30 minutes
- Sessions are bound to user or anonymous session
- Stock reservations tied to session, auto-release on expire

### 13.2 Payment Security

- Payment data never touches our server (Stripe Elements)
- PCI DSS compliance via Stripe
- Payment intent created server-side, confirmed client-side

### 13.3 UCP/Agent Security

- Agents authenticated via OAuth 2.0 or API key
- Spending limits per agent (configurable)
- High-value orders require explicit mandate
- All agent actions logged for audit

---

## 14. Implementation Checklist

### Phase 1: Foundation
- [ ] Define checkoutSessions schema
- [ ] Implement start mutation
- [ ] Implement stock reservation integration
- [ ] Implement session expiry

### Phase 2: Core Flow
- [ ] Build ShippingAddressForm
- [ ] Implement setShippingAddress
- [ ] Build ShippingMethodSelector
- [ ] Build PaymentForm with Stripe Elements
- [ ] Implement setPaymentMethod

### Phase 3: Completion
- [ ] Build OrderReview component
- [ ] Implement complete mutation
- [ ] Implement order creation
- [ ] Build OrderConfirmation page

### Phase 4: UCP/MCP
- [ ] Implement UCP REST endpoints
- [ ] Build MCP tools
- [ ] Add agent authentication
- [ ] Test with Gemini/Claude

---

## 15. Future Considerations

- **Subscription Checkout:** Recurring payment setup
- **Split Payments:** Pay partially with gift card + card
- **Express Checkout:** Apple Pay, Google Pay, Shop Pay
- **B2B Checkout:** PO numbers, net terms
- **Multi-Currency:** Price in local currency

---

**PRD Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
**Author:** Claude (AI Assistant)
