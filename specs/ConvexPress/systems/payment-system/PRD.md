# PRD: Payment System

> **Origin:** Ported from VexCart on 2026-04-22, integrated into ConvexPress.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce is not a separate app; it is a first-class layer inside ConvexPress alongside posts, pages, media, users, and taxonomies. Every commerce feature is either **baked into the commerce core** or **gated as an internal extension** via `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts` (feature flags, not a third-party marketplace).
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Customer-facing UIs serve `Subscriber` + guests.
> **No third-party plugin/theme marketplace.** AI builds custom per-site. Internally, "extensions" are feature-flagged modules (Bundles, Digital, Returns, Reviews, Wishlists, Subscriptions, Add-Ons, Membership) that live in `convex/commerce<Thing>/` with a `<thing>Enabled` settings flag and a `require<Thing>Enabled(ctx)` gate on every mutation/query.
> **Package manager:** Bun. **UI:** Base UI (not Radix). **Styling:** Tailwind v4. **Payments:** Stripe (see `agents/knowledge/stripe-integration.md`).



---

## Integration with ConvexPress

**Positioning:** baked into commerce core.
**Code lives at:** `ConvexPress-Admin/packages/backend/convex/commerce/payments.ts` (+ `commerce/paymentActions.ts` for Stripe SDK calls)

**Consumes these ConvexPress systems:**

- **Checkout System** — creates PaymentIntents tied to a checkout session.
- **Order System** — attaches `payment_transaction` records to `commerce_orders`.
- **Commerce Subscriptions** — uses the same Stripe primitives for off-session charging (see `agents/knowledge/stripe-integration.md`).
- **Settings System** — `commerce.payments` section holds Stripe/PayPal keys, read via `helpers/serviceKeys.ts`.

**WooCommerce analog:** WooCommerce Payments + Stripe for WooCommerce + PayPal Payments — gateway abstraction with settings-first key resolution.

---
## 1. Overview

### 1.1 Purpose

The Payment System handles all payment processing for the ConvexPress commerce layer. It provides a **provider-agnostic architecture** that abstracts payment operations behind a common interface, enabling support for multiple payment providers (Stripe primary, PayPal secondary) without requiring changes to the checkout flow.

**Design Philosophy:**
- **Provider Abstraction** - Common interface hides provider-specific complexity
- **PCI Compliance** - Never handle raw card data; use provider tokens/elements
- **Idempotency** - All operations are safe to retry
- **Audit Trail** - Every payment action is logged with full context
- **Graceful Degradation** - If one provider fails, offer alternatives

### 1.2 Scope

**In Scope:**
- Payment provider abstraction layer
- Stripe integration (primary)
  - Payment Intents API
  - Stripe Elements for card input
  - Apple Pay / Google Pay via Payment Request API
  - Saved payment methods (cards)
  - Refund processing
- PayPal integration (secondary)
  - PayPal Checkout (Orders API v2)
  - PayPal Buttons
  - Pay Later options
  - Refund processing
- Webhook handling for both providers
- Transaction logging and history
- Admin payment settings
- Admin refund interface
- Saved payment methods management (customer account)

**Out of Scope:**
- Subscription/recurring billing (future system)
- Buy Now Pay Later providers beyond PayPal (Klarna, Affirm - future)
- Cryptocurrency payments
- Invoice/NET-30 terms
- Multi-currency with automatic conversion

### 1.3 Out of Scope

- **Subscriptions** - Handled by future Subscription System
- **Invoicing** - B2B feature, future consideration
- **Currency Conversion** - Store operates in single currency
- **Payment Plans** - Beyond PayPal Pay Later

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Authentication | PLT-AUT | 0 | Customer identity for saved methods |
| Event System | PLT-EVT | 0 | Payment events for notifications |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Checkout System | ORD-CHK | 4 | Payment step in checkout flow |
| Order Management | ORD-MGT | 4 | Order creation on payment success |
| Returns & Refunds | SUP-RTN | 5 | Refund processing |

### 2.3 Integration Hooks to Implement

```typescript
// Provider-agnostic payment interface
interface PaymentProvider {
  name: "stripe" | "paypal";

  // Initialize payment for checkout
  createPayment(params: CreatePaymentParams): Promise<PaymentSession>;

  // Confirm/capture payment
  confirmPayment(sessionId: string): Promise<PaymentResult>;

  // Cancel/void payment
  cancelPayment(sessionId: string): Promise<void>;

  // Process refund
  refundPayment(params: RefundParams): Promise<RefundResult>;

  // Saved methods (Stripe only for now)
  savePaymentMethod?(customerId: string, methodId: string): Promise<SavedMethod>;
  listPaymentMethods?(customerId: string): Promise<SavedMethod[]>;
  deletePaymentMethod?(methodId: string): Promise<void>;

  // Webhook verification
  verifyWebhook(payload: string, signature: string): boolean;
}

// Unified payment session returned to frontend
interface PaymentSession {
  provider: "stripe" | "paypal";
  sessionId: string;           // Provider's session/intent ID
  clientSecret?: string;       // Stripe client secret
  approvalUrl?: string;        // PayPal approval URL
  amount: number;
  currency: string;
  status: PaymentStatus;
}

// Events emitted
type PaymentEvents =
  | "payment.initiated"
  | "payment.completed"
  | "payment.failed"
  | "payment.refunded"
  | "payment.method_saved";
```

---

## 3. Routes

> Source: Airtable Routes table

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Checkout - Payment | `/checkout/payment` | _marketing | No* | Guest, Customer |

*Guest checkout supported - no auth required, but Customer has access to saved methods.

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Payment Settings | `/admin/settings/payments` | _admin | Yes | Admin |
| Transaction History | `/admin/transactions` | _admin | Yes | Manager, Admin |

---

## 4. Data Model

### 4.1 Tables

```typescript
// admin-app/packages/backend/convex/schema.ts

// Payment transactions log
transactions: defineTable({
  // Reference
  orderId: v.optional(v.id("orders")),  // Linked after order creation
  customerId: v.optional(v.id("users")), // Optional for guest checkout

  // Provider info
  provider: v.union(v.literal("stripe"), v.literal("paypal")),
  providerTransactionId: v.string(),    // Stripe PaymentIntent ID or PayPal Order ID
  providerCustomerId: v.optional(v.string()), // Stripe Customer ID or PayPal Payer ID

  // Amount
  amount: v.number(),                   // In cents/smallest unit
  currency: v.string(),                 // ISO 4217 (USD, EUR, etc.)

  // Status
  status: v.union(
    v.literal("pending"),               // Created, awaiting action
    v.literal("processing"),            // Payment in progress
    v.literal("succeeded"),             // Payment complete
    v.literal("failed"),                // Payment failed
    v.literal("cancelled"),             // Cancelled before completion
    v.literal("refunded"),              // Fully refunded
    v.literal("partially_refunded")     // Partial refund issued
  ),

  // Failure info
  failureCode: v.optional(v.string()),
  failureMessage: v.optional(v.string()),

  // Refund tracking
  refundedAmount: v.optional(v.number()),

  // Metadata
  metadata: v.optional(v.object({
    checkoutSessionId: v.optional(v.string()),
    paymentMethodType: v.optional(v.string()), // card, paypal, apple_pay, etc.
    last4: v.optional(v.string()),              // Last 4 of card
    brand: v.optional(v.string()),              // visa, mastercard, etc.
    email: v.optional(v.string()),              // Customer email
  })),

  // Timestamps
  createdAt: v.number(),
  updatedAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_order", ["orderId"])
  .index("by_customer", ["customerId"])
  .index("by_provider_id", ["provider", "providerTransactionId"])
  .index("by_status", ["status"])
  .index("by_created", ["createdAt"]),

// Refunds table (separate for audit trail)
refunds: defineTable({
  transactionId: v.id("transactions"),

  // Provider info
  provider: v.union(v.literal("stripe"), v.literal("paypal")),
  providerRefundId: v.string(),

  // Amount
  amount: v.number(),
  currency: v.string(),

  // Status
  status: v.union(
    v.literal("pending"),
    v.literal("succeeded"),
    v.literal("failed")
  ),

  // Reason
  reason: v.optional(v.union(
    v.literal("requested_by_customer"),
    v.literal("duplicate"),
    v.literal("fraudulent"),
    v.literal("order_cancelled"),
    v.literal("other")
  )),
  notes: v.optional(v.string()),

  // Who processed it
  processedBy: v.optional(v.id("users")),

  // Timestamps
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_transaction", ["transactionId"])
  .index("by_status", ["status"]),

// Saved payment methods (Stripe-managed, we store reference)
savedPaymentMethods: defineTable({
  customerId: v.id("users"),

  // Provider info
  provider: v.literal("stripe"),        // Only Stripe supports this well
  providerMethodId: v.string(),         // Stripe PaymentMethod ID
  providerCustomerId: v.string(),       // Stripe Customer ID

  // Display info (safe to store)
  type: v.union(v.literal("card"), v.literal("bank_account")),
  brand: v.optional(v.string()),        // visa, mastercard, amex
  last4: v.string(),
  expiryMonth: v.optional(v.number()),
  expiryYear: v.optional(v.number()),

  // Status
  isDefault: v.boolean(),

  // Timestamps
  createdAt: v.number(),
})
  .index("by_customer", ["customerId"])
  .index("by_provider_method", ["provider", "providerMethodId"]),

// Payment settings (admin-configurable)
paymentSettings: defineTable({
  // Stripe config
  stripeEnabled: v.boolean(),
  stripePublishableKey: v.optional(v.string()),
  // Secret key stored in environment variables, not database

  // PayPal config
  paypalEnabled: v.boolean(),
  paypalClientId: v.optional(v.string()),
  paypalMode: v.optional(v.union(v.literal("sandbox"), v.literal("live"))),
  // Secret stored in environment variables

  // General settings
  defaultCurrency: v.string(),
  allowGuestCheckout: v.boolean(),

  // Payment method ordering (for UI)
  methodOrder: v.array(v.string()), // ["card", "paypal", "apple_pay", "google_pay"]

  // Metadata
  updatedAt: v.number(),
  updatedBy: v.optional(v.id("users")),
}),
```

### 4.2 Relationships

```
transactions
  ├── orders (many:1) - Payment for order
  ├── users (many:1) - Customer who paid
  └── refunds (1:many) - Refunds against this transaction

savedPaymentMethods
  └── users (many:1) - Customer who owns the method

paymentSettings
  └── users (many:1) - Who last updated settings
```

### 4.3 Forward-Looking Fields

| Field | Future System | Purpose |
|-------|---------------|---------|
| `transactions.metadata.subscriptionId` | Subscription System | Link to recurring billing |
| `paymentSettings.klarnaEnabled` | BNPL Expansion | Klarna Pay Later |
| `paymentSettings.affirmEnabled` | BNPL Expansion | Affirm financing |

---

## 5. Actions

> Source: Airtable Actions table

### 5.1 Customer Actions

| Action | Code | Description | Roles | Triggers Events |
|--------|------|-------------|-------|-----------------|
| Set Payment Method | `checkout.set_payment` | Enter payment details or select saved method | Guest, Customer | `checkout.step_completed` |
| Save Payment Method | `payment.save_method` | Save a payment method for future purchases | Customer | `payment.method_saved` |
| Delete Payment Method | `payment.delete_method` | Remove a saved payment method | Customer | - |

### 5.2 System Actions

| Action | Code | Description | Roles | Triggers Events |
|--------|------|-------------|-------|-----------------|
| Process Payment | `payment.process` | Process a payment through provider | System | `payment.initiated`, `payment.completed`, `payment.failed` |

### 5.3 Staff/Admin Actions

| Action | Code | Description | Roles | Triggers Events |
|--------|------|-------------|-------|-----------------|
| View Transactions | `payment.view_transactions` | View payment transaction history | Staff, Manager, Admin | - |
| Process Refund | `payment.refund` | Process a full or partial refund | Manager, Admin | `payment.refunded` |

---

## 6. Events

> Source: Airtable Events table

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Payment Initiated | `payment.initiated` | Payment process begins | `{ orderId: Id, amount: number, method: string, customerId?: Id }` |
| Payment Completed | `payment.completed` | Payment successfully processed | `{ orderId: Id, paymentIntentId: string, amount: number, customerId?: Id }` |
| Payment Failed | `payment.failed` | Payment processing fails | `{ orderId: Id, error: string, customerId?: Id, email: string }` |
| Refund Issued | `payment.refunded` | Refund is processed | `{ orderId: Id, refundId: string, amount: number, customerId?: Id, email: string }` |
| Payment Method Saved | `payment.method_saved` | Customer saves a payment method | `{ customerId: Id, paymentMethodId: string, type: 'card' \| 'bank', last4: string }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| `checkout.step_completed` | Checkout | Update transaction status |
| `order.cancelled` | Order Management | Trigger auto-refund (if configured) |

---

## 7. Notifications

### 7.1 Email Notifications

> Source: Airtable Email Notifications table

| Name | Trigger Event | Recipient | Subject Template | Priority |
|------|---------------|-----------|------------------|----------|
| Payment Failed | `payment.failed` | Customer | "Payment Issue with Your Order" | Immediate |
| Payment Received | `payment.completed` | Customer | "Payment Confirmed - Order #{orderId}" | Immediate |
| Refund Processed | `payment.refunded` | Customer | "Refund Processed - #{orderId}" | Immediate |

### 7.2 Site Notifications

> Source: Airtable Site Notifications table

| Name | Trigger Event | Recipient | Message Template | Type |
|------|---------------|-----------|------------------|------|
| Payment Confirmed | `payment.completed` | Customer | "Payment received for order #{orderId}!" | Success |
| Payment Failed | `payment.failed` | Customer | "Payment failed for order #{orderId}. Please update your payment method." | Error |
| Refund Issued | `payment.refunded` | Customer | "Your refund for order #{orderId} has been processed." | Success |

---

## 8. User Interface

### 8.1 Components Needed

**Checkout Payment Step:**
- [ ] `PaymentMethodSelector` - Choose between providers/methods
- [ ] `StripePaymentForm` - Stripe Elements card input
- [ ] `PayPalButton` - PayPal Checkout button
- [ ] `ApplePayButton` - Apple Pay button (Stripe)
- [ ] `GooglePayButton` - Google Pay button (Stripe)
- [ ] `SavedMethodsList` - List of saved payment methods
- [ ] `SaveMethodCheckbox` - Option to save method for later
- [ ] `PaymentSummary` - Order total, tax, shipping summary

**Account Payment Methods:**
- [ ] `PaymentMethodsPage` - List saved methods
- [ ] `PaymentMethodCard` - Single method display
- [ ] `AddPaymentMethodModal` - Add new card via Stripe
- [ ] `DeleteMethodConfirmation` - Confirm deletion

**Admin Components:**
- [ ] `TransactionList` - Paginated transaction table
- [ ] `TransactionDetail` - Full transaction info
- [ ] `RefundModal` - Process refund form
- [ ] `PaymentSettingsForm` - Enable/configure providers

### 8.2 Wireframes

**Checkout Payment Step:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Payment Method                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ○ Credit or Debit Card                                      │   │
│  │   ┌───────────────────────────────────────────────────────┐ │   │
│  │   │  Card Number                                          │ │   │
│  │   │  ┌─────────────────────────────────────────────────┐  │ │   │
│  │   │  │ 4242 4242 4242 4242                    [visa]   │  │ │   │
│  │   │  └─────────────────────────────────────────────────┘  │ │   │
│  │   │                                                       │ │   │
│  │   │  Expiry          CVC                                  │ │   │
│  │   │  ┌──────────┐    ┌──────────┐                        │ │   │
│  │   │  │ 12 / 28  │    │  •••     │                        │ │   │
│  │   │  └──────────┘    └──────────┘                        │ │   │
│  │   │                                                       │ │   │
│  │   │  ☐ Save card for future purchases                     │ │   │
│  │   └───────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ○ PayPal                                                    │   │
│  │   ┌───────────────────────────────────────────────────────┐ │   │
│  │   │  [        PayPal Checkout Button         ]            │ │   │
│  │   │                                                       │ │   │
│  │   │  Pay in 4 interest-free payments of $24.99            │ │   │
│  │   └───────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ○ Saved Card: Visa •••• 4242                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                                                 [Continue to Review]│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Admin Refund Modal:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Process Refund                                              [×]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Order: #ORD-2025-001234                                           │
│  Original Amount: $99.99                                           │
│  Already Refunded: $0.00                                           │
│  Available to Refund: $99.99                                       │
│                                                                     │
│  ─────────────────────────────────────────────────────────────     │
│                                                                     │
│  Refund Amount                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ○ Full refund ($99.99)                                      │   │
│  │ ● Partial refund                                            │   │
│  │   $ [25.00_____________]                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Reason                                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ [Requested by customer              ▼]                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Notes (internal)                                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Customer changed mind, item unopened                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ⚠️  Refunds typically take 5-10 business days to appear           │
│                                                                     │
│                                    [Cancel]    [Process Refund]     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.3 States

**Payment Form States:**
- Idle (ready for input)
- Validating (real-time card validation)
- Processing (payment in progress)
- 3D Secure (authentication challenge)
- Success (payment complete)
- Failed (with error message and retry)

**PayPal Flow States:**
- Initial (button displayed)
- Popup opened (PayPal window)
- Approved (returned from PayPal)
- Capturing (finalizing)
- Complete/Failed

**Refund States:**
- Processing (request sent)
- Success (refund confirmed)
- Failed (with reason)

---

## 9. Business Rules

### 9.1 Validation Rules

**Payment Amount:**
- Minimum: $0.50 USD (Stripe minimum)
- Maximum: $999,999.99 (practical limit)
- Currency must match store currency

**Card Validation:**
- Handled by Stripe Elements (Luhn, expiry, CVC)
- We don't validate - provider does

**Refund Validation:**
- Cannot exceed original transaction amount
- Cannot exceed remaining refundable amount
- Must have valid reason selected

### 9.2 Business Logic

**Payment Flow (Stripe):**
```
1. Customer selects card payment
2. Frontend creates PaymentIntent via our API
3. Backend calls Stripe API, returns client_secret
4. Frontend uses Stripe.js to confirm payment
5. Stripe handles 3DS if required
6. Stripe webhook confirms payment
7. Backend updates transaction, creates order
8. Dispatch payment.completed event
```

**Payment Flow (PayPal):**
```
1. Customer clicks PayPal button
2. Frontend calls our API to create PayPal order
3. Backend calls PayPal Orders API, returns approval URL
4. Customer approves in PayPal popup
5. Frontend receives approval, calls capture
6. Backend captures PayPal order
7. PayPal webhook confirms capture
8. Backend updates transaction, creates order
9. Dispatch payment.completed event
```

**Refund Flow:**
```
1. Admin initiates refund from order detail
2. Backend validates refund amount
3. Backend calls provider refund API
4. Provider webhook confirms refund
5. Backend updates transaction status
6. Dispatch payment.refunded event
7. Email sent to customer
```

**Saved Payment Methods (Stripe only):**
```
1. During checkout, customer checks "Save for later"
2. After successful payment, backend creates Stripe Customer
3. PaymentMethod attached to Customer
4. Backend stores reference in savedPaymentMethods
5. On future checkout, list saved methods
6. Customer can select saved method (no re-entry)
7. Customer can delete from account settings
```

### 9.3 Edge Cases

| Scenario | Handling |
|----------|----------|
| 3DS authentication required | Stripe Elements handles automatically |
| Card declined | Show friendly error, allow retry with different card |
| PayPal popup blocked | Show instructions to allow popups |
| Webhook arrives before frontend callback | Idempotent - check if already processed |
| Duplicate webhook delivery | Idempotent key check |
| Partial capture (auth > capture) | Not supported in MVP - full capture only |
| Currency mismatch | Reject - must match store currency |
| Refund on cancelled PayPal order | Check status before refund |
| Customer disputes/chargebacks | Log event, notify admin (manual handling) |
| Network failure mid-payment | Frontend retries, backend checks idempotency |

### 9.4 Provider-Specific Quirks

**Stripe:**
- PaymentIntents are idempotent by default
- 3DS is automatic with radar rules
- Apple/Google Pay work through Payment Request API
- Saved methods via Customer + PaymentMethod attachment

**PayPal:**
- Orders API v2 (not legacy NVP)
- Must capture within 3 days of authorization
- No native "saved payment methods" - use PayPal vault (complex)
- Pay Later availability varies by region
- Buyer email not always available
- Refunds can take longer than Stripe

---

## 10. API Design

### 10.1 Queries (Read Operations)

```typescript
// Get available payment methods for checkout
export const getAvailableMethods = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("paymentSettings").first();
    if (!settings) {
      return { methods: [] };
    }

    const methods: PaymentMethodOption[] = [];

    if (settings.stripeEnabled) {
      methods.push(
        { id: "card", name: "Credit or Debit Card", provider: "stripe" },
        { id: "apple_pay", name: "Apple Pay", provider: "stripe" },
        { id: "google_pay", name: "Google Pay", provider: "stripe" }
      );
    }

    if (settings.paypalEnabled) {
      methods.push(
        { id: "paypal", name: "PayPal", provider: "paypal" }
      );
    }

    // Sort by configured order
    const orderedMethods = settings.methodOrder
      .map(id => methods.find(m => m.id === id))
      .filter(Boolean);

    return {
      methods: orderedMethods,
      stripePublishableKey: settings.stripePublishableKey,
      paypalClientId: settings.paypalClientId,
    };
  },
});

// Get saved payment methods for customer
export const getSavedMethods = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) return [];

    return await ctx.db
      .query("savedPaymentMethods")
      .withIndex("by_customer", (q) => q.eq("customerId", user._id))
      .collect();
  },
});

// Get transaction by ID (admin)
export const getTransaction = query({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.id);
    if (!transaction) return null;

    // Get associated refunds
    const refunds = await ctx.db
      .query("refunds")
      .withIndex("by_transaction", (q) => q.eq("transactionId", args.id))
      .collect();

    // Get customer info if exists
    const customer = transaction.customerId
      ? await ctx.db.get(transaction.customerId)
      : null;

    return {
      ...transaction,
      refunds,
      customer: customer ? { id: customer._id, email: customer.email, name: customer.name } : null,
    };
  },
});

// List transactions (admin)
export const listTransactions = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("transactions");

    if (args.status) {
      query = query.withIndex("by_status", (q) => q.eq("status", args.status as any));
    } else {
      query = query.withIndex("by_created");
    }

    const transactions = await query
      .order("desc")
      .take(args.limit ?? 50);

    return transactions;
  },
});
```

### 10.2 Mutations (Write Operations)

```typescript
// Create payment intent (Stripe)
export const createStripePaymentIntent = mutation({
  args: {
    amount: v.number(),
    currency: v.string(),
    saveMethod: v.optional(v.boolean()),
    savedMethodId: v.optional(v.string()),
    metadata: v.optional(v.object({
      checkoutSessionId: v.optional(v.string()),
      email: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    // Create transaction record
    const transactionId = await ctx.db.insert("transactions", {
      provider: "stripe",
      providerTransactionId: "", // Will be updated
      amount: args.amount,
      currency: args.currency,
      status: "pending",
      customerId: identity ? await getCustomerId(ctx, identity.email) : undefined,
      metadata: args.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Call Stripe via action
    const result = await ctx.scheduler.runAfter(0, internal.payment.createStripeIntent, {
      transactionId,
      amount: args.amount,
      currency: args.currency,
      saveMethod: args.saveMethod,
      savedMethodId: args.savedMethodId,
      customerEmail: identity?.email || args.metadata?.email,
    });

    return { transactionId };
  },
});

// Create PayPal order
export const createPayPalOrder = mutation({
  args: {
    amount: v.number(),
    currency: v.string(),
    metadata: v.optional(v.object({
      checkoutSessionId: v.optional(v.string()),
      email: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    // Create transaction record
    const transactionId = await ctx.db.insert("transactions", {
      provider: "paypal",
      providerTransactionId: "", // Will be updated
      amount: args.amount,
      currency: args.currency,
      status: "pending",
      customerId: identity ? await getCustomerId(ctx, identity.email) : undefined,
      metadata: args.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Trigger PayPal order creation
    await ctx.scheduler.runAfter(0, internal.payment.createPayPalOrder, {
      transactionId,
      amount: args.amount,
      currency: args.currency,
    });

    return { transactionId };
  },
});

// Confirm payment after provider processing
export const confirmPayment = mutation({
  args: {
    transactionId: v.id("transactions"),
    providerTransactionId: v.string(),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) throw new Error("Transaction not found");

    // Update transaction
    await ctx.db.patch(args.transactionId, {
      providerTransactionId: args.providerTransactionId,
      status: "succeeded",
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Dispatch event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "payment.completed",
      payload: {
        orderId: transaction.orderId,
        paymentIntentId: args.providerTransactionId,
        amount: transaction.amount,
        customerId: transaction.customerId,
      },
    });

    return { success: true };
  },
});

// Process refund (admin)
export const processRefund = mutation({
  args: {
    transactionId: v.id("transactions"),
    amount: v.number(),
    reason: v.union(
      v.literal("requested_by_customer"),
      v.literal("duplicate"),
      v.literal("fraudulent"),
      v.literal("order_cancelled"),
      v.literal("other")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction) throw new Error("Transaction not found");

    // Validate amount
    const refundedSoFar = transaction.refundedAmount ?? 0;
    const availableToRefund = transaction.amount - refundedSoFar;

    if (args.amount > availableToRefund) {
      throw new Error(`Cannot refund more than ${availableToRefund}`);
    }

    // Get admin user
    const admin = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .unique();

    // Create refund record
    const refundId = await ctx.db.insert("refunds", {
      transactionId: args.transactionId,
      provider: transaction.provider,
      providerRefundId: "", // Will be updated
      amount: args.amount,
      currency: transaction.currency,
      status: "pending",
      reason: args.reason,
      notes: args.notes,
      processedBy: admin?._id,
      createdAt: Date.now(),
    });

    // Trigger provider refund
    await ctx.scheduler.runAfter(0, internal.payment.processProviderRefund, {
      refundId,
      transactionId: args.transactionId,
      provider: transaction.provider,
      providerTransactionId: transaction.providerTransactionId,
      amount: args.amount,
    });

    return { refundId };
  },
});

// Save payment method
export const savePaymentMethod = mutation({
  args: {
    providerMethodId: v.string(),
    type: v.union(v.literal("card"), v.literal("bank_account")),
    brand: v.optional(v.string()),
    last4: v.string(),
    expiryMonth: v.optional(v.number()),
    expiryYear: v.optional(v.number()),
    providerCustomerId: v.string(),
    setAsDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) throw new Error("User not found");

    // Check if method already saved
    const existing = await ctx.db
      .query("savedPaymentMethods")
      .withIndex("by_provider_method", (q) =>
        q.eq("provider", "stripe").eq("providerMethodId", args.providerMethodId)
      )
      .unique();

    if (existing) {
      return existing._id;
    }

    // If setting as default, unset others
    if (args.setAsDefault) {
      const otherMethods = await ctx.db
        .query("savedPaymentMethods")
        .withIndex("by_customer", (q) => q.eq("customerId", user._id))
        .collect();

      for (const method of otherMethods) {
        if (method.isDefault) {
          await ctx.db.patch(method._id, { isDefault: false });
        }
      }
    }

    // Create saved method
    const methodId = await ctx.db.insert("savedPaymentMethods", {
      customerId: user._id,
      provider: "stripe",
      providerMethodId: args.providerMethodId,
      providerCustomerId: args.providerCustomerId,
      type: args.type,
      brand: args.brand,
      last4: args.last4,
      expiryMonth: args.expiryMonth,
      expiryYear: args.expiryYear,
      isDefault: args.setAsDefault ?? false,
      createdAt: Date.now(),
    });

    // Dispatch event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "payment.method_saved",
      payload: {
        customerId: user._id,
        paymentMethodId: args.providerMethodId,
        type: args.type,
        last4: args.last4,
      },
    });

    return methodId;
  },
});

// Delete saved payment method
export const deletePaymentMethod = mutation({
  args: { id: v.id("savedPaymentMethods") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const method = await ctx.db.get(args.id);
    if (!method) throw new Error("Payment method not found");

    // Verify ownership
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user || method.customerId !== user._id) {
      throw new Error("Unauthorized");
    }

    // Detach from Stripe
    await ctx.scheduler.runAfter(0, internal.payment.detachStripeMethod, {
      providerMethodId: method.providerMethodId,
    });

    // Delete record
    await ctx.db.delete(args.id);

    return { success: true };
  },
});
```

### 10.3 Actions (External/Async Operations)

```typescript
// Create Stripe PaymentIntent
export const createStripeIntent = internalAction({
  args: {
    transactionId: v.id("transactions"),
    amount: v.number(),
    currency: v.string(),
    saveMethod: v.optional(v.boolean()),
    savedMethodId: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    // Get or create Stripe Customer if saving method
    let customerId: string | undefined;
    if (args.saveMethod && args.customerEmail) {
      const customers = await stripe.customers.list({
        email: args.customerEmail,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: args.customerEmail,
        });
        customerId = customer.id;
      }
    }

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: args.amount, // Already in cents
      currency: args.currency.toLowerCase(),
      customer: customerId,
      payment_method: args.savedMethodId,
      setup_future_usage: args.saveMethod ? "on_session" : undefined,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        transactionId: args.transactionId,
      },
    });

    // Update transaction with Stripe ID
    await ctx.runMutation(internal.payment.updateTransactionProvider, {
      transactionId: args.transactionId,
      providerTransactionId: paymentIntent.id,
      providerCustomerId: customerId,
    });

    // Dispatch initiated event
    await ctx.runMutation(internal.events.dispatchInternal, {
      eventCode: "payment.initiated",
      payload: {
        transactionId: args.transactionId,
        amount: args.amount,
        method: "card",
      },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  },
});

// Create PayPal Order
export const createPayPalOrder = internalAction({
  args: {
    transactionId: v.id("transactions"),
    amount: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const paypal = new PayPalClient({
      clientId: process.env.PAYPAL_CLIENT_ID!,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
      mode: process.env.PAYPAL_MODE as "sandbox" | "live",
    });

    // Convert cents to dollars for PayPal
    const amountInDollars = (args.amount / 100).toFixed(2);

    const order = await paypal.orders.create({
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: args.currency,
          value: amountInDollars,
        },
        custom_id: args.transactionId, // For webhook matching
      }],
      application_context: {
        return_url: `${process.env.SITE_URL}/checkout/paypal/return`,
        cancel_url: `${process.env.SITE_URL}/checkout/paypal/cancel`,
      },
    });

    // Update transaction
    await ctx.runMutation(internal.payment.updateTransactionProvider, {
      transactionId: args.transactionId,
      providerTransactionId: order.id,
    });

    // Get approval URL
    const approvalUrl = order.links.find((l: any) => l.rel === "approve")?.href;

    return {
      orderId: order.id,
      approvalUrl,
    };
  },
});

// Capture PayPal Order (after customer approval)
export const capturePayPalOrder = internalAction({
  args: {
    transactionId: v.id("transactions"),
    paypalOrderId: v.string(),
  },
  handler: async (ctx, args) => {
    const paypal = new PayPalClient({
      clientId: process.env.PAYPAL_CLIENT_ID!,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
      mode: process.env.PAYPAL_MODE as "sandbox" | "live",
    });

    const capture = await paypal.orders.capture(args.paypalOrderId);

    if (capture.status === "COMPLETED") {
      await ctx.runMutation(internal.payment.markTransactionSucceeded, {
        transactionId: args.transactionId,
      });
    } else {
      await ctx.runMutation(internal.payment.markTransactionFailed, {
        transactionId: args.transactionId,
        error: `PayPal capture failed: ${capture.status}`,
      });
    }

    return { status: capture.status };
  },
});

// Process refund via provider
export const processProviderRefund = internalAction({
  args: {
    refundId: v.id("refunds"),
    transactionId: v.id("transactions"),
    provider: v.union(v.literal("stripe"), v.literal("paypal")),
    providerTransactionId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    let providerRefundId: string;

    if (args.provider === "stripe") {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

      const refund = await stripe.refunds.create({
        payment_intent: args.providerTransactionId,
        amount: args.amount,
      });

      providerRefundId = refund.id;
    } else {
      // PayPal refund
      const paypal = new PayPalClient({
        clientId: process.env.PAYPAL_CLIENT_ID!,
        clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
        mode: process.env.PAYPAL_MODE as "sandbox" | "live",
      });

      // Get capture ID from order
      const order = await paypal.orders.get(args.providerTransactionId);
      const captureId = order.purchase_units[0]?.payments?.captures?.[0]?.id;

      if (!captureId) {
        throw new Error("No capture found for PayPal order");
      }

      const amountInDollars = (args.amount / 100).toFixed(2);
      const refund = await paypal.captures.refund(captureId, {
        amount: {
          currency_code: "USD",
          value: amountInDollars,
        },
      });

      providerRefundId = refund.id;
    }

    // Update refund record
    await ctx.runMutation(internal.payment.completeRefund, {
      refundId: args.refundId,
      providerRefundId,
      transactionId: args.transactionId,
      amount: args.amount,
    });
  },
});

// Webhook handlers
export const handleStripeWebhook = httpAction(async (ctx, request) => {
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const event = stripe.webhooks.constructEvent(
    body,
    signature!,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  switch (event.type) {
    case "payment_intent.succeeded":
      await ctx.runMutation(internal.payment.handlePaymentSuccess, {
        providerTransactionId: event.data.object.id,
        provider: "stripe",
      });
      break;

    case "payment_intent.payment_failed":
      await ctx.runMutation(internal.payment.handlePaymentFailure, {
        providerTransactionId: event.data.object.id,
        provider: "stripe",
        error: event.data.object.last_payment_error?.message ?? "Payment failed",
      });
      break;

    case "charge.refunded":
      // Refund confirmation handled here if needed
      break;
  }

  return new Response("OK", { status: 200 });
});

export const handlePayPalWebhook = httpAction(async (ctx, request) => {
  const body = await request.json();

  // Verify webhook signature (PayPal-specific)
  // ... verification logic ...

  switch (body.event_type) {
    case "PAYMENT.CAPTURE.COMPLETED":
      await ctx.runMutation(internal.payment.handlePaymentSuccess, {
        providerTransactionId: body.resource.supplementary_data.related_ids.order_id,
        provider: "paypal",
      });
      break;

    case "PAYMENT.CAPTURE.DENIED":
      await ctx.runMutation(internal.payment.handlePaymentFailure, {
        providerTransactionId: body.resource.supplementary_data.related_ids.order_id,
        provider: "paypal",
        error: "Payment denied by PayPal",
      });
      break;
  }

  return new Response("OK", { status: 200 });
});
```

---

## 11. Security Considerations

### 11.1 Authentication Requirements

| Route/Action | Requirement |
|--------------|-------------|
| Payment page | No auth (guest checkout) |
| Save payment method | Authenticated |
| List saved methods | Authenticated + own methods only |
| Delete saved method | Authenticated + own methods only |
| Admin transactions | Authenticated + Manager/Admin role |
| Process refund | Authenticated + Manager/Admin role |

### 11.2 Authorization Rules

- Customers can only view/delete their own saved methods
- Staff can view transactions but not refund
- Only Manager/Admin can process refunds
- System role processes payments (webhook handlers)

### 11.3 Data Privacy

**PCI Compliance:**
- NEVER handle or store raw card numbers
- Use Stripe Elements / PayPal Buttons (hosted fields)
- Only store tokenized references
- Card last4 and brand are safe to store

**Sensitive Data:**
- Stripe secret key in environment only
- PayPal secret in environment only
- Webhook secrets in environment only
- Never log full card details or tokens

**Data Retention:**
- Transaction records kept indefinitely (accounting)
- Refund records kept indefinitely (audit)
- Deleted saved methods removed immediately from our DB
- Stripe/PayPal may retain per their policies

---

## 12. Testing Strategy

### 12.1 Unit Tests

- Amount validation
- Currency formatting
- Refund amount calculations
- Provider detection logic

### 12.2 Integration Tests

- Stripe PaymentIntent creation
- PayPal Order creation
- Webhook signature verification
- Refund processing
- Saved method CRUD

### 12.3 E2E Tests

- Complete card payment flow
- Complete PayPal payment flow
- 3DS challenge flow (Stripe test cards)
- Payment failure and retry
- Save card during checkout
- Use saved card for payment
- Admin refund flow

### 12.4 Test Cards/Accounts

**Stripe Test Cards:**
- `4242424242424242` - Successful payment
- `4000002500003155` - Requires 3DS
- `4000000000009995` - Declined

**PayPal Sandbox:**
- Use sandbox accounts from PayPal Developer Dashboard

---

## 13. Implementation Checklist

### Phase 1: Foundation
- [ ] Define schema (transactions, refunds, savedPaymentMethods, paymentSettings)
- [ ] Set up Stripe SDK
- [ ] Set up PayPal SDK
- [ ] Implement `createStripePaymentIntent` action
- [ ] Implement `createPayPalOrder` action

### Phase 2: Core Features
- [ ] Create payment provider abstraction interface
- [ ] Build `PaymentMethodSelector` component
- [ ] Integrate Stripe Elements
- [ ] Integrate PayPal Buttons
- [ ] Implement webhook handlers
- [ ] Build `/checkout/payment` route

### Phase 3: Integration
- [ ] Wire up events (initiated, completed, failed)
- [ ] Connect email notifications
- [ ] Connect site notifications
- [ ] Implement saved payment methods (Stripe)
- [ ] Build account payment methods page

### Phase 4: Admin & Polish
- [ ] Build `/admin/settings/payments` route
- [ ] Build `/admin/transactions` route
- [ ] Implement refund flow
- [ ] Add Apple Pay / Google Pay
- [ ] Add PayPal Pay Later
- [ ] Error handling and retry logic

---

## 14. Future Considerations

### Additional Providers
- **Klarna** - Buy Now Pay Later
- **Affirm** - Financing
- **Shop Pay** - Shopify's accelerated checkout
- **Amazon Pay** - Amazon account payments

### Subscriptions
- Stripe Billing integration
- Subscription management system
- Dunning (failed payment retries)
- Proration on plan changes

### Advanced Features
- Multi-currency support
- Split payments (marketplace model)
- Payment links (shareable checkout)
- Invoice payments (NET-30, etc.)
- ACH/Bank transfers

### PayPal Enhancements
- PayPal Vault (saved methods)
- Venmo (US only)
- Pay with Crypto

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System (Payment System) | [redacted-airtable-record-id] |
| Routes | [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Actions | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Events | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Email Notifications | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Site Notifications | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Event System PRD](./the ConvexPress Event Dispatcher System KB (`.claude/docs/EVENT-DISPATCHER-SYSTEM.md`).md)
- [Auth System PRD](./the ConvexPress Auth System KB (`.claude/docs/AUTH-SYSTEM.md`).md)
- [Checkout System PRD](./the Checkout System PRD (`specs/ConvexPress/systems/checkout-system/PRD.md`).md) (future)

### C. Provider API References

**Stripe:**
- [Payment Intents](https://stripe.com/docs/payments/payment-intents)
- [Stripe Elements](https://stripe.com/docs/stripe-js)
- [Webhooks](https://stripe.com/docs/webhooks)
- [Refunds](https://stripe.com/docs/refunds)

**PayPal:**
- [Orders API v2](https://developer.paypal.com/docs/api/orders/v2/)
- [JavaScript SDK](https://developer.paypal.com/sdk/js/)
- [Webhooks](https://developer.paypal.com/docs/api/webhooks/v1/)
- [Refunds](https://developer.paypal.com/docs/api/payments/v2/#captures_refund)

### D. Environment Variables

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayPal
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_MODE=sandbox  # or 'live'
PAYPAL_WEBHOOK_ID=...
```

---

**PRD Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
**Author:** Claude (AI Assistant)
