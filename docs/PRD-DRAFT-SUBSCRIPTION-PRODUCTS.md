# PRD: Subscription Products

> **Status:** DRAFT - Upgraded to Template-Driven Container Model
> **System Code:** CAT-SUB
> **Phase:** 4 of 6 (Checkout & Orders)
> **Priority:** P1 - High
> **Complexity:** Complex
> **Airtable Record:** recVGRWbekNydvuH4

---

## 1. Overview

### 1.1 Purpose

The Subscription Products system enables selling products as recurring subscriptions through a **template-driven, multi-item container model**. Designed for Virtual Overseer's virtual employee service, this system treats subscriptions as billing containers that hold multiple line items (subscription items), each representing a product or service that bills together on a unified monthly cycle.

**Key Design Principles:**
- **One subscription, one invoice** - Customers receive a single monthly charge regardless of how many items they subscribe to
- **Items individually manageable** - Add or cancel items without affecting other items in the subscription
- **Template-driven configuration** - Centralized billing templates reduce complexity and ensure consistency
- **Monthly billing only** - Simplified model eliminates weekly/quarterly/annual complexity
- **Future-ready** - Credit system placeholders prepared for usage tracking

### 1.2 Architectural Model

**Before (Traditional Per-Product Model):**
```
PRODUCT A ─────────────> SUBSCRIPTION A ─────> INVOICE A ($50/mo)
PRODUCT B ─────────────> SUBSCRIPTION B ─────> INVOICE B ($75/mo)
PRODUCT C ─────────────> SUBSCRIPTION C ─────> INVOICE C ($50/mo)
```
*Result: 3 subscriptions, 3 invoices, 3 charges, 3 emails*

**After (Container Model):**
```
SUBSCRIPTION (billing container)
├── Customer: John Smith
├── Template: "Virtual Employee - Monthly"
├── Billing cycle: 1st of each month
├── Monthly total: $175
│
└── SUBSCRIPTION ITEMS:
    ├── Product A (Roxy Receptionist)  — $50/mo  ✓ Active
    ├── Product B (Bob Project Manager) — $75/mo  ✓ Active
    └── Product C (Sarah Support)       — $50/mo  ✓ Active
```
*Result: 1 subscription, 1 invoice, 1 charge, 1 email*

### 1.3 Scope

**In Scope:**
- Subscription templates (centralized billing configurations)
- Multi-item subscription containers
- Item-level add/cancel management
- Monthly billing cycle (first of month)
- Setup fees (one-time, first invoice)
- Trial periods per template
- Proration for mid-cycle changes
- Itemized invoices with line items
- Customer subscription management portal
- Admin subscription management tools
- Bundle-to-subscription conversion
- UCP REST API for AI agent access
- MCP tools for subscription operations
- Credit system placeholders (future-ready)

**Out of Scope:**
- Weekly/quarterly/annual billing cycles (monthly only)
- Usage-based/metered billing (future enhancement)
- Multi-currency subscriptions (single currency per subscription)
- Subscription gifting
- B2B multi-seat licensing with user provisioning

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Product Catalog | CAT-PRD | 2 | Products to subscribe to |
| Payment System | PAY-STR | 1 | Stripe subscription billing |
| Customer Accounts | USR-ACT | 1 | Subscription ownership |
| Order Management | ORD-MGT | 4 | Subscription order creation |
| Email Notifications | COM-EML | 1 | Subscription emails |
| Checkout System | ORD-CHK | 4 | Subscription checkout flow |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Product Bundles | CAT-BND | 4 | Subscription bundles become multi-item containers |
| Digital Products | CAT-DIG | 4 | Digital subscription content |
| Analytics & Reporting | ADM-RPT | 6 | Subscription metrics (MRR, churn) |

### 2.3 Integration Hooks to Implement

- Stripe Subscription webhooks (subscription.created, updated, deleted)
- Stripe Invoice webhooks (invoice.paid, payment_failed)
- Add item to existing subscription
- Cancel item from subscription
- Proration calculations
- Credit system hooks (future)
- Work summary attachment (future)

---

## 3. Data Model

### 3.1 Subscription Templates

Templates are centrally managed billing configurations that products reference. This provides consistency and simplifies management.

```typescript
// Subscription templates - centralized billing configurations
subscription_templates: defineTable({
  // Identification
  name: v.string(),                       // "Virtual Employee - Monthly"
  slug: v.string(),                       // "virtual-employee-monthly"
  displayName: v.string(),                // Customer-facing name
  description: v.optional(v.string()),

  // Billing configuration (MONTHLY ONLY)
  billingInterval: v.literal("month"),    // Fixed to monthly
  billingIntervalCount: v.number(),       // Always 1 (monthly)

  // Pricing defaults
  setupFee: v.optional(v.number()),       // One-time setup fee (cents)
  trialDays: v.optional(v.number()),      // Free trial period

  // Proration setting
  prorationBehavior: v.union(
    v.literal("create_prorations"),       // Default - prorate additions
    v.literal("none"),                    // No proration
    v.literal("always_invoice"),          // Invoice immediately
  ),

  // Behavior settings
  allowPause: v.boolean(),                // Can customers pause?
  maxPauseDays: v.optional(v.number()),   // Max days paused
  cancelAnytime: v.boolean(),             // Self-service cancellation

  // Status
  status: v.union(
    v.literal("active"),
    v.literal("archived"),
  ),

  // Stripe reference
  stripeProductId: v.optional(v.string()), // Stripe Product for billing

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_slug", ["slug"])
  .index("by_status", ["status"])

// Product subscription configuration (references template)
// Added to products table
products: defineTable({
  // ... existing fields

  // Subscription configuration
  isSubscriptionEnabled: v.boolean(),
  subscriptionTemplateId: v.optional(v.id("subscription_templates")),

  // Optional overrides (at product level)
  subscriptionOverrides: v.optional(v.object({
    setupFee: v.optional(v.number()),     // Override template setup fee
    trialDays: v.optional(v.number()),    // Override template trial days
    customPrice: v.optional(v.number()),  // Override product base price for subscription
  })),
})
```

### 3.2 Subscriptions (Container Model)

```typescript
// Subscriptions - billing containers holding multiple items
subscriptions: defineTable({
  // Identification
  subscriptionNumber: v.string(),         // "SUB-2026-001234"
  userId: v.id("user_profiles"),

  // Template reference
  templateId: v.id("subscription_templates"),

  // Stripe integration
  stripeSubscriptionId: v.string(),
  stripeCustomerId: v.string(),

  // Billing configuration (from template, but stored for history)
  billingInterval: v.literal("month"),
  billingIntervalCount: v.number(),       // Always 1
  currency: v.string(),                   // "usd"

  // Calculated totals (sum of active items)
  monthlyTotal: v.number(),               // Sum of all active item prices
  setupFeeTotal: v.number(),              // Sum of setup fees (first invoice only)

  // Status
  status: v.union(
    v.literal("trialing"),                // In trial period
    v.literal("active"),                  // Active and billing
    v.literal("paused"),                  // Temporarily paused
    v.literal("past_due"),                // Payment failed, retrying
    v.literal("unpaid"),                  // Payment failed, exhausted retries
    v.literal("canceled"),                // Canceled by user or admin
  ),

  // Dates
  startDate: v.number(),
  currentPeriodStart: v.number(),
  currentPeriodEnd: v.number(),
  trialEndDate: v.optional(v.number()),
  pausedAt: v.optional(v.number()),
  pauseResumeDate: v.optional(v.number()),
  canceledAt: v.optional(v.number()),
  cancelAtPeriodEnd: v.boolean(),         // Cancel at end of current period

  // Payment
  defaultPaymentMethodId: v.optional(v.string()),
  lastPaymentDate: v.optional(v.number()),
  nextPaymentDate: v.optional(v.number()),
  failedPaymentCount: v.number(),

  // Admin assignment
  assignedRepId: v.optional(v.id("user_profiles")), // Account representative

  // Credit system placeholders (future)
  creditAllocation: v.optional(v.number()),   // Monthly credit allocation
  creditUsed: v.optional(v.number()),         // Credits used this period
  creditResetDate: v.optional(v.number()),    // When credits reset
  overageEnabled: v.optional(v.boolean()),    // Allow overage billing
  overageRate: v.optional(v.number()),        // Cost per credit over limit

  // Internal notes (admin only)
  internalNotes: v.optional(v.array(v.object({
    note: v.string(),
    createdBy: v.id("user_profiles"),
    createdAt: v.number(),
  }))),

  // Metadata
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId", "status"])
  .index("by_stripe_id", ["stripeSubscriptionId"])
  .index("by_status", ["status"])
  .index("by_next_payment", ["nextPaymentDate"])
  .index("by_assigned_rep", ["assignedRepId"])
```

### 3.3 Subscription Items (Line Items)

```typescript
// Subscription items - individual products/services within a subscription
subscription_items: defineTable({
  // References
  subscriptionId: v.id("subscriptions"),
  productId: v.id("products"),
  variantId: v.optional(v.id("product_variants")),

  // Stripe integration
  stripeSubscriptionItemId: v.string(),
  stripePriceId: v.string(),

  // Pricing
  price: v.number(),                      // Monthly price for this item
  setupFee: v.optional(v.number()),       // One-time setup fee (charged first invoice)
  quantity: v.number(),                   // Usually 1

  // Override pricing (admin adjustments)
  priceOverride: v.optional(v.number()),  // Admin can override price
  priceOverrideReason: v.optional(v.string()),
  priceOverrideBy: v.optional(v.id("user_profiles")),

  // Status
  status: v.union(
    v.literal("active"),                  // Actively billing
    v.literal("pending_cancellation"),    // Will cancel at period end
    v.literal("canceled"),                // No longer billing
  ),

  // Dates
  addedAt: v.number(),
  canceledAt: v.optional(v.number()),
  cancelAtPeriodEnd: v.boolean(),

  // Credit allocation (future - per-item credits)
  itemCreditAllocation: v.optional(v.number()),

  // Metadata
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_subscription", ["subscriptionId", "status"])
  .index("by_product", ["productId"])
  .index("by_stripe_item", ["stripeSubscriptionItemId"])

// Bundle subscription items (when a bundle is added to subscription)
subscription_bundle_items: defineTable({
  subscriptionItemId: v.id("subscription_items"),
  bundleId: v.id("product_bundles"),
  componentProductId: v.id("products"),
  componentVariantId: v.optional(v.id("product_variants")),
  componentQuantity: v.number(),
})
  .index("by_subscription_item", ["subscriptionItemId"])
  .index("by_bundle", ["bundleId"])
```

### 3.4 Subscription Invoices (Itemized)

```typescript
// Subscription invoices (synced from Stripe, with itemization)
subscription_invoices: defineTable({
  subscriptionId: v.id("subscriptions"),
  stripeInvoiceId: v.string(),

  // Invoice details
  invoiceNumber: v.string(),
  amount: v.number(),                     // Total amount
  amountPaid: v.number(),
  amountDue: v.number(),
  currency: v.string(),

  status: v.union(
    v.literal("draft"),
    v.literal("open"),
    v.literal("paid"),
    v.literal("void"),
    v.literal("uncollectible"),
  ),

  // Dates
  periodStart: v.number(),
  periodEnd: v.number(),
  dueDate: v.optional(v.number()),
  paidAt: v.optional(v.number()),

  // Payment
  paymentIntentId: v.optional(v.string()),
  paymentMethodId: v.optional(v.string()),

  // PDF/Links
  invoicePdfUrl: v.optional(v.string()),
  hostedInvoiceUrl: v.optional(v.string()),

  // Work summary placeholder (future)
  workSummaryAttached: v.boolean(),
  workSummaryUrl: v.optional(v.string()),

  createdAt: v.number(),
})
  .index("by_subscription", ["subscriptionId"])
  .index("by_stripe_id", ["stripeInvoiceId"])
  .index("by_status", ["status"])

// Invoice line items (itemized breakdown)
subscription_invoice_items: defineTable({
  invoiceId: v.id("subscription_invoices"),
  subscriptionItemId: v.optional(v.id("subscription_items")), // May be null for one-time charges

  // Line item details
  description: v.string(),                // "Roxy Receptionist - Monthly"
  quantity: v.number(),
  unitAmount: v.number(),
  amount: v.number(),                     // quantity * unitAmount

  // Proration info
  isProrated: v.boolean(),
  prorationDetails: v.optional(v.object({
    periodStart: v.number(),
    periodEnd: v.number(),
    description: v.string(),
  })),

  // Type
  type: v.union(
    v.literal("subscription"),            // Regular subscription charge
    v.literal("setup_fee"),               // One-time setup fee
    v.literal("proration_credit"),        // Credit for mid-cycle changes
    v.literal("proration_charge"),        // Charge for mid-cycle additions
    v.literal("adjustment"),              // Manual adjustment
  ),

  createdAt: v.number(),
})
  .index("by_invoice", ["invoiceId"])
  .index("by_subscription_item", ["subscriptionItemId"])
```

### 3.5 Subscription History (Audit Trail)

```typescript
// Subscription history (comprehensive audit trail)
subscription_history: defineTable({
  subscriptionId: v.id("subscriptions"),
  subscriptionItemId: v.optional(v.id("subscription_items")), // If item-specific

  action: v.union(
    // Subscription-level
    v.literal("created"),
    v.literal("activated"),
    v.literal("paused"),
    v.literal("resumed"),
    v.literal("canceled"),
    v.literal("reactivated"),
    v.literal("payment_failed"),
    v.literal("payment_succeeded"),
    v.literal("trial_ended"),
    v.literal("rep_assigned"),
    v.literal("note_added"),
    // Item-level
    v.literal("item_added"),
    v.literal("item_canceled"),
    v.literal("item_price_changed"),
    v.literal("item_reactivated"),
  ),

  performedBy: v.optional(v.id("user_profiles")),
  performedByType: v.union(
    v.literal("customer"),
    v.literal("admin"),
    v.literal("system"),
  ),

  details: v.optional(v.any()),           // Action-specific details
  timestamp: v.number(),
})
  .index("by_subscription", ["subscriptionId", "timestamp"])
  .index("by_item", ["subscriptionItemId", "timestamp"])
```

---

## 4. Template System

### 4.1 How Templates Work

Templates define the billing configuration that products inherit. This centralizes settings and ensures consistency.

```
┌─────────────────────────────────────────────────────────────────┐
│  SUBSCRIPTION TEMPLATE                                          │
│  "Virtual Employee - Monthly"                                   │
├─────────────────────────────────────────────────────────────────┤
│  Billing: Monthly (1st of month)                                │
│  Setup Fee: $0 (default)                                        │
│  Trial: 7 days (default)                                        │
│  Proration: create_prorations                                   │
│  Pause: Allowed (max 30 days)                                   │
│  Cancel: Anytime                                                │
└─────────────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────────┐  ┌─────────────────────────┐
│  PRODUCT                │  │  PRODUCT                │
│  "Roxy Receptionist"    │  │  "Bob Project Manager"  │
├─────────────────────────┤  ├─────────────────────────┤
│  Base Price: $50/mo     │  │  Base Price: $75/mo     │
│  Template: ↑            │  │  Template: ↑            │
│  Overrides: None        │  │  Overrides:             │
│                         │  │    Setup Fee: $100      │
└─────────────────────────┘  └─────────────────────────┘
```

### 4.2 Template Management (Admin)

Admins create and manage templates through the admin interface:

1. **Create Template** - Name, billing settings, behavior options
2. **Assign to Products** - Products reference templates via foreign key
3. **Product Overrides** - Optional setup_fee, trial_days, custom_price per product
4. **Archive Template** - Existing subscriptions continue; new ones cannot use it

### 4.3 Template Resolution

When creating a subscription item, the system resolves settings:

```typescript
function resolveSubscriptionSettings(product, template) {
  return {
    setupFee: product.subscriptionOverrides?.setupFee ?? template.setupFee ?? 0,
    trialDays: product.subscriptionOverrides?.trialDays ?? template.trialDays ?? 0,
    price: product.subscriptionOverrides?.customPrice ?? product.basePrice,
    prorationBehavior: template.prorationBehavior,
    allowPause: template.allowPause,
    cancelAnytime: template.cancelAnytime,
  };
}
```

---

## 5. Subscription Container Model

### 5.1 Container Concept

A subscription is a **billing container** that holds multiple items. All items share:
- Same billing date (1st of month)
- Same payment method
- Same customer
- Single invoice per billing cycle

### 5.2 Example: Virtual Employee Team

```
┌────────────────────────────────────────────────────────────────┐
│  SUBSCRIPTION: SUB-2026-000123                                  │
│  Customer: John Smith (john@company.com)                        │
│  Status: Active                                                 │
│  Next Billing: February 1, 2026                                 │
│  Payment Method: Visa ending 4242                               │
├────────────────────────────────────────────────────────────────┤
│  TEAM MEMBERS (Subscription Items):                             │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Roxy Rings (Receptionist)                                │  │
│  │ Status: ✓ Active                                         │  │
│  │ Monthly: $50.00                                           │  │
│  │ Added: November 15, 2025                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Bob Builder (Project Manager)                            │  │
│  │ Status: ✓ Active                                         │  │
│  │ Monthly: $75.00                                           │  │
│  │ Added: November 15, 2025                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Sarah Support (Customer Service)                         │  │
│  │ Status: ✓ Active                                         │  │
│  │ Monthly: $150.00                                          │  │
│  │ Added: December 1, 2025 (prorated)                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Tom Tracker (was Data Analyst)                           │  │
│  │ Status: ✗ Canceled                                       │  │
│  │ Monthly: $50.00 (no longer billing)                       │  │
│  │ Canceled: January 10, 2026                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
├────────────────────────────────────────────────────────────────┤
│  MONTHLY TOTAL: $275.00                                         │
│  (Active items only)                                            │
└────────────────────────────────────────────────────────────────┘
```

### 5.3 Key Behaviors

**Adding Items:**
- New item added to existing subscription
- Prorated charge for remainder of current period
- Full price starts next billing cycle

**Canceling Items:**
- Item marked `pending_cancellation`
- Continues until end of current period
- Then marked `canceled` and excluded from future billing
- Subscription continues with remaining items

**Canceling Subscription:**
- All items canceled at period end
- Subscription status changes to `canceled`
- Customer loses access to all services

---

## 6. Billing & Proration

### 6.1 Billing Simplifications

**Monthly ONLY:**
- All subscriptions bill on monthly cycle
- Billing date: 1st of each month
- No weekly, quarterly, or annual options

**Setup Fees:**
- One-time charge on first invoice
- Per-item (each product can have setup fee)
- Charged when item is added

**Proration Rules:**
- Adding mid-cycle: Customer charged prorated amount immediately
- Canceling mid-cycle: Access continues until period end (no refund)
- Price changes: Prorated credit/charge on next invoice

### 6.2 Proration Example

```
Customer adds "Sarah Support" ($150/mo) on December 15
Current period: December 1 - December 31

Days remaining in period: 17 days
Days in period: 31 days
Proration factor: 17/31 = 0.548

Prorated charge: $150 × 0.548 = $82.26 (charged immediately)
January 1 invoice: Full $150 charge
```

---

## 7. Checkout Integration

### 7.1 Multi-Product Subscription Checkout

When a customer checks out with subscription products:

```
┌────────────────────────────────────────────────────────────────┐
│  CHECKOUT FLOW                                                  │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Customer adds subscription products to cart:                │
│     - Roxy Receptionist ($50/mo)                               │
│     - Bob Project Manager ($75/mo)                             │
│     - Desk Lamp (one-time $29.99)                              │
│                                                                 │
│  2. At checkout, system separates:                              │
│     - Subscription items → Create/update subscription           │
│     - One-time items → Standard order                           │
│                                                                 │
│  3. If customer has existing subscription:                      │
│     → Add items to existing subscription                        │
│     → Charge prorated amount for new items                      │
│                                                                 │
│  4. If no existing subscription:                                │
│     → Create new subscription                                   │
│     → First invoice includes all items + any setup fees         │
│                                                                 │
│  5. One-time items processed as normal order                    │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 7.2 Checkout Session Fields

```typescript
// Added to checkoutSessions table
checkoutSessions: defineTable({
  // ... existing fields

  // Subscription handling
  hasSubscriptionItems: v.boolean(),
  subscriptionItems: v.optional(v.array(v.object({
    productId: v.id("products"),
    variantId: v.optional(v.id("product_variants")),
    price: v.number(),
    setupFee: v.number(),
  }))),

  // Existing subscription to add to (if applicable)
  existingSubscriptionId: v.optional(v.id("subscriptions")),
  subscriptionAction: v.optional(v.union(
    v.literal("create"),                  // Create new subscription
    v.literal("add_items"),               // Add to existing
  )),

  // Created subscription reference
  createdSubscriptionId: v.optional(v.id("subscriptions")),
})
```

---

## 8. Item Management

### 8.1 Adding Items

**Customer Self-Service:**
1. Navigate to "My Team" / "My Subscriptions"
2. Click "Add Team Member"
3. Browse available subscription products
4. Select product, confirm prorated price
5. Item added, charged immediately (prorated)

**Admin:**
1. Open subscription detail
2. Click "Add Item"
3. Search/select product
4. Optional: Set price override
5. Choose: Charge prorated or start next period
6. Item added, history logged

### 8.2 Canceling Items

**Customer Self-Service:**
1. Navigate to "My Team"
2. Click "Manage" on team member card
3. Click "Cancel This Team Member"
4. Confirm: "Access continues until [period end]"
5. Item status → `pending_cancellation`
6. At period end → status → `canceled`

**Admin:**
1. Open subscription detail
2. Find item in items list
3. Actions dropdown → "Cancel Item"
4. Choose: End of period or Immediate
5. Confirm action
6. History logged with reason

### 8.3 Reactivating Items

Admin can reactivate canceled items:
1. Find canceled item in subscription detail
2. Actions → "Reactivate Item"
3. Prorated charge calculated
4. Item status → `active`

---

## 9. Invoice Model

### 9.1 Itemized Invoices

Each invoice shows line items:

```
┌────────────────────────────────────────────────────────────────┐
│  INVOICE #INV-2026-001234                                       │
│  Date: February 1, 2026                                         │
│  Period: February 1 - February 28, 2026                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SUBSCRIPTION ITEMS                                             │
│  ──────────────────────────────────────────────────────────────│
│  Roxy Rings (Receptionist)              1 × $50.00    $50.00   │
│  Bob Builder (Project Manager)          1 × $75.00    $75.00   │
│  Sarah Support (Customer Service)       1 × $150.00   $150.00  │
│                                                                 │
│  ──────────────────────────────────────────────────────────────│
│  Subtotal                                             $275.00   │
│  Tax (0%)                                             $0.00     │
│  ──────────────────────────────────────────────────────────────│
│  TOTAL                                                $275.00   │
│                                                                 │
│  Payment Method: Visa ending 4242                               │
│  Status: PAID                                                   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 9.2 Work Summary Placeholder

For future enhancement, invoices include:

```typescript
// Fields ready for work summary attachment
workSummaryAttached: v.boolean(),
workSummaryUrl: v.optional(v.string()),

// Work summary could include:
// - Hours worked by virtual employee
// - Tasks completed
// - Performance metrics
// - Client satisfaction score
```

---

## 10. Bundle Integration

### 10.1 Bundles as Multi-Item Subscriptions

When a subscription-enabled bundle is purchased:

```
BUNDLE: "Startup Team Package" ($200/mo, saves $25)
├── Roxy Receptionist ($50/mo)
├── Bob Project Manager ($75/mo)
├── Sarah Support ($100/mo)
└── Total if separate: $225/mo

BECOMES SUBSCRIPTION:
├── Item: Roxy Receptionist — $50/mo (component of bundle)
├── Item: Bob Project Manager — $75/mo (component of bundle)
├── Item: Sarah Support — $100/mo (component of bundle)
├── Discount: -$25/mo (bundle savings)
└── Monthly Total: $200/mo
```

### 10.2 Bundle Pricing Options

**Fixed Bundle Price:**
- Bundle has fixed monthly price
- Components shown for transparency
- Discount calculated as savings vs components

**Sum of Components:**
- Bundle price = sum of component prices
- Optional percentage discount applied
- Each component as separate line item

### 10.3 Post-Purchase Bundle Modification

Admin can modify bundle composition after purchase:

1. Open subscription with bundle
2. See bundle components as line items
3. Can remove single component (recalculates pricing)
4. Can add products outside bundle
5. Bundle discount may adjust based on remaining components

---

## 11. Credit System (Placeholders)

### 11.1 Schema Placeholders

The schema includes fields ready for credit-based billing:

```typescript
// On subscriptions table
creditAllocation: v.optional(v.number()),   // Monthly credits
creditUsed: v.optional(v.number()),         // Used this period
creditResetDate: v.optional(v.number()),    // Reset date
overageEnabled: v.optional(v.boolean()),    // Allow overages
overageRate: v.optional(v.number()),        // $/credit over limit

// On subscription_items table
itemCreditAllocation: v.optional(v.number()), // Per-item credits
```

### 11.2 Future Credit Display

Customer sees usage like Claude Code:

```
┌────────────────────────────────────────────────────────────────┐
│  Usage This Period                                              │
├────────────────────────────────────────────────────────────────┤
│  ████████████████████░░░░░░░░░░  67% used                      │
│                                                                 │
│  Credits Used: 670 / 1,000                                      │
│  Resets: February 1, 2026                                       │
│                                                                 │
│  Per Team Member:                                               │
│  • Roxy Receptionist: 210 credits                               │
│  • Bob Project Manager: 300 credits                             │
│  • Sarah Support: 160 credits                                   │
│                                                                 │
│  [View Details]                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 12. Customer Experience (Website App)

### 12.1 Routes

| Route | Path | Layout | Auth Required | Description |
|-------|------|--------|---------------|-------------|
| My Subscriptions | `/account/subscriptions` | _account | Yes | Overview of all subscriptions |
| Subscription Detail | `/account/subscriptions/:id` | _account | Yes | Manage specific subscription |
| Billing History | `/account/subscriptions/:id/invoices` | _account | Yes | View all invoices |
| Invoice Detail | `/account/subscriptions/:id/invoices/:invoiceId` | _account | Yes | Single invoice view |
| Update Payment | `/account/subscriptions/:id/payment` | _account | Yes | Change payment method |
| Add Team Member | `/account/subscriptions/:id/add` | _account | Yes | Browse products to add |

### 12.2 My Subscriptions Page (My Team)

**Header Section:**
- Monthly total across all subscriptions
- Next billing date
- Payment method on file (last 4 digits)

**Team Overview (Card Grid):**
- Visual cards for each subscription item (virtual employee)
- Each card shows: Avatar, Name, Role, Monthly price, Status badge
- Quick actions: Manage, Cancel

**Billing Summary:**
- Current period dates
- Itemized breakdown (like invoice preview)
- Pending changes indicator (if item cancelling at period end)

**Recent Invoices:**
- Last 3 invoices with date, amount, status
- "View All Invoices" link

### 12.3 Customer Wireframe: My Team

```
┌────────────────────────────────────────────────────────────────┐
│  My Team                                              $275/mo   │
│  Next billing: February 1, 2026 • Visa ending 4242             │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  [Avatar]       │  │  [Avatar]       │  │  [Avatar]       │ │
│  │  Roxy Rings     │  │  Bob Builder    │  │  Sarah Support  │ │
│  │  Receptionist   │  │  Project Mgr    │  │  Customer Svc   │ │
│  │  $50/mo ✓Active │  │  $75/mo ✓Active │  │  $150/mo ✓Active│ │
│  │  [Manage]       │  │  [Manage]       │  │  [Manage]       │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                 │
│  [ + Add Team Member ]                                          │
│                                                                 │
│  ────────────────────────────────────────────────────────────  │
│                                                                 │
│  Recent Invoices                                                │
│  Jan 1, 2026    $275.00    Paid    [View] [PDF]                │
│  Dec 1, 2025    $275.00    Paid    [View] [PDF]                │
│  Nov 1, 2025    $200.00    Paid    [View] [PDF]                │
│                                                                 │
│  [View All Invoices]                                            │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 12.4 Subscription Detail Page

**Subscription Info:**
- Subscription number
- Status badge (Active, Paused, Past Due, Cancelled)
- Created date
- Current billing cycle dates

**Team Members Section:**
- List of all subscription items
- For each item: Name, Description, Price, Status, Date added, Actions
- Actions per item: View Product, Cancel Item

**Add to Team:**
- "Add Team Member" button
- Opens modal/page to browse available products
- Shows prorated amount for adding mid-cycle

**Billing Section:**
- Current payment method with "Update" button
- Billing address
- Billing history table (date, amount, status, PDF link)
- Upcoming invoice preview

**Subscription Actions:**
- Pause Subscription (if allowed by template)
- Resume Subscription (if paused)
- Cancel Subscription (entire thing)
- Update Payment Method

**Usage Section (Future/Placeholder):**
- Usage meter (percentage)
- Per-item usage breakdown
- "View Details" link

### 12.5 Customer Self-Service Capabilities

| Capability | Available | Notes |
|------------|-----------|-------|
| View subscription details | Yes | |
| View team members | Yes | |
| Add team member | Yes | Through product catalog |
| Cancel single team member | Yes | Immediate or at period end |
| Cancel entire subscription | Yes | With confirmation |
| Pause subscription | Configurable | Template setting |
| Update payment method | Yes | Via Stripe |
| View invoices | Yes | |
| Download invoice PDF | Yes | Via Stripe |
| Update billing address | Yes | |
| View usage/credits | Future | Placeholder in UI |

---

## 13. Admin Experience (Admin App)

### 13.1 Routes

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Subscriptions Dashboard | `/admin/subscriptions` | _admin | Yes | staff, manager, admin |
| Subscription List | `/admin/subscriptions/list` | _admin | Yes | staff, manager, admin |
| Subscription Detail | `/admin/subscriptions/:id` | _admin | Yes | staff, manager, admin |
| Customer Subscriptions | `/admin/customers/:id/subscriptions` | _admin | Yes | staff, manager, admin |
| Templates List | `/admin/subscriptions/templates` | _admin | Yes | admin |
| Template Editor | `/admin/subscriptions/templates/:id` | _admin | Yes | admin |
| Invoice List | `/admin/subscriptions/invoices` | _admin | Yes | staff, manager, admin |

### 13.2 Subscriptions Dashboard

**Key Metrics Cards:**
- MRR (Monthly Recurring Revenue)
- Active Subscriptions count
- Items per Subscription average
- Churn Rate (this month)
- New subscriptions (this month)
- Failed Payments (requiring attention)

**Quick Actions:**
- Create subscription manually
- View failed payments
- Export subscription data

**Recent Activity Feed:**
- New subscriptions
- Cancellations
- Failed payments
- Item additions/removals

### 13.3 Subscription List

**Filters:**
- Status (Active, Paused, Past Due, Cancelled, Trialing)
- Date range (created, billing date)
- Assigned rep
- Template
- Monthly value range

**Search:**
- By subscription number
- By customer name/email
- By product name

**Columns:**
- Subscription # (link to detail)
- Customer name (link to customer)
- Status badge
- Items count
- Monthly total
- Next billing date
- Assigned rep
- Actions dropdown

**Bulk Actions:**
- Export selected
- Assign rep to selected

### 13.4 Subscription Detail (Admin View)

**Header:**
- Subscription number
- Customer name (link to customer profile)
- Status with badge
- Quick actions: Pause, Cancel, Add Item

**Customer Info Panel:**
- Name, email, phone
- Customer since date
- Other subscriptions (if any)
- Link to full customer profile

**Subscription Items Section:**
- Table of all items (active and cancelled)
- Columns: Product, Status, Price, Added Date, Actions
- Actions per item: Edit Price, Cancel, Remove (immediate)
- "Add Item" button

**Admin Adjustments Panel:**
- Add item (search products)
- Override item price
- Apply credit/adjustment
- Change billing date

**Billing Info:**
- Current payment method
- Billing address
- Stripe customer link

**Invoice History:**
- Full invoice table
- Filter by status
- Resend invoice email action
- Link to Stripe invoice

**Subscription History/Audit Log:**
- Timeline of all changes
- Who made each change (customer, admin, system)
- Change details (what changed)

**Internal Notes:**
- Add notes visible only to admins
- Note history with timestamps

**Assigned Rep:**
- Current assignment
- Change assignment dropdown
- Rep contact info

### 13.5 Admin Wireframe: Subscription Detail

```
┌────────────────────────────────────────────────────────────────┐
│  ← Back to Subscriptions                                        │
│                                                                 │
│  SUB-2026-000123                           [Pause] [Cancel]     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐│
│  │ Customer                 │  │ Subscription Info            ││
│  │ John Smith               │  │ Status: ✓ Active             ││
│  │ john@company.com         │  │ Created: Nov 15, 2025        ││
│  │ (555) 123-4567           │  │ Monthly: $275.00             ││
│  │ [View Customer]          │  │ Next Bill: Feb 1, 2026       ││
│  └──────────────────────────┘  │ Rep: Sarah (Account Mgr)     ││
│                                └──────────────────────────────┘│
│                                                                 │
│  Team Members                                    [+ Add Item]   │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ Product          │ Status │ Price   │ Added    │ Actions   ││
│  ├────────────────────────────────────────────────────────────┤│
│  │ Roxy Rings       │ Active │ $50.00  │ Nov 15   │ [···]     ││
│  │ Bob Builder      │ Active │ $75.00  │ Nov 15   │ [···]     ││
│  │ Sarah Support    │ Active │ $150.00 │ Dec 1    │ [···]     ││
│  │ Tom Tracker      │ Cancelled│ $50.00 │ Nov 15  │ -         ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────┐  ┌────────────────────────────┐
│  │ Admin Actions               │  │ Internal Notes             │
│  │ [Override Price]            │  │ ┌────────────────────────┐ │
│  │ [Apply Credit]              │  │ │ Customer called about  │ │
│  │ [Change Billing Date]       │  │ │ adding more team...    │ │
│  │ [Assign Rep: ▼]             │  │ └────────────────────────┘ │
│  └─────────────────────────────┘  │ [Add Note]                 │
│                                   └────────────────────────────┘
│                                                                 │
│  Invoice History                                                │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ Invoice #    │ Date     │ Amount  │ Status │ Actions       ││
│  ├────────────────────────────────────────────────────────────┤│
│  │ INV-001234   │ Jan 1    │ $275.00 │ Paid   │ [View][Resend]││
│  │ INV-001198   │ Dec 1    │ $275.00 │ Paid   │ [View][Resend]││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Activity History                                               │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ Jan 15 │ Sarah (Admin) added note                          ││
│  │ Jan 10 │ Customer cancelled Tom Tracker                    ││
│  │ Dec 1  │ Customer added Sarah Support                      ││
│  │ Nov 15 │ Subscription created via checkout                 ││
│  └────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

### 13.6 Template Management

**Template List:**
- Name, status, usage count
- Actions: Edit, Archive, Duplicate

**Template Editor:**
- Name and slug
- Billing interval (monthly - fixed)
- Setup fee (optional)
- Trial days (optional)
- Proration setting
- Pause/cancel settings
- Display name (customer-facing)
- Status (Active/Archived)
- Products using this template (read-only list)

### 13.7 Admin Capabilities

| Capability | Roles | Notes |
|------------|-------|-------|
| View all subscriptions | Staff, Manager, Admin | |
| View subscription details | Staff, Manager, Admin | |
| Add item to subscription | Staff, Manager, Admin | |
| Remove item from subscription | Manager, Admin | |
| Override item price | Manager, Admin | Creates audit log |
| Apply credit/adjustment | Manager, Admin | |
| Pause subscription | Staff, Manager, Admin | |
| Resume subscription | Staff, Manager, Admin | |
| Cancel subscription | Manager, Admin | With confirmation |
| Change payment method | Admin | Requires customer consent |
| Resend invoice | Staff, Manager, Admin | |
| Issue refund | Admin | Via Stripe |
| Assign rep | Manager, Admin | |
| Add internal notes | Staff, Manager, Admin | |
| Create manual subscription | Manager, Admin | |
| Manage templates | Admin | |
| Export data | Manager, Admin | |

---

## 14. Actions

### 14.1 Customer Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| View Subscriptions | subscription.view_own | View own subscriptions | customer |
| Add Item | subscription.add_item | Add product to subscription | customer |
| Cancel Item | subscription.cancel_item | Cancel single item | customer |
| Cancel Subscription | subscription.cancel | Cancel entire subscription | customer |
| Pause | subscription.pause | Temporarily pause (if allowed) | customer |
| Resume | subscription.resume | Resume paused subscription | customer |
| Update Payment | subscription.update_payment | Change payment method | customer |

### 14.2 Staff/Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| View All | subscription.view_all | List all subscriptions | staff, manager, admin |
| View Details | subscription.view_details | View subscription detail | staff, manager, admin |
| Add Item (Admin) | subscription.admin_add_item | Add item to any subscription | staff, manager, admin |
| Cancel Item (Admin) | subscription.admin_cancel_item | Cancel item on any subscription | manager, admin |
| Override Price | subscription.override_price | Set custom item price | manager, admin |
| Force Cancel | subscription.force_cancel | Immediately cancel | manager, admin |
| Issue Refund | subscription.refund | Refund subscription payment | admin |
| Assign Rep | subscription.assign_rep | Assign account representative | manager, admin |
| Add Note | subscription.add_note | Add internal note | staff, manager, admin |
| Manage Templates | subscription.manage_templates | CRUD on templates | admin |

---

## 15. Events

### 15.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Subscription Created | `subscription.created` | New subscription | `{ subscriptionId, userId, templateId, monthlyTotal }` |
| Subscription Activated | `subscription.activated` | Trial ended or first payment | `{ subscriptionId }` |
| Subscription Paused | `subscription.paused` | User/admin pauses | `{ subscriptionId, resumeDate? }` |
| Subscription Resumed | `subscription.resumed` | User/admin resumes | `{ subscriptionId }` |
| Subscription Canceled | `subscription.canceled` | User/admin cancels | `{ subscriptionId, reason?, cancelledBy }` |
| Item Added | `subscription.item_added` | New item added | `{ subscriptionId, itemId, productId, price }` |
| Item Canceled | `subscription.item_canceled` | Item canceled | `{ subscriptionId, itemId, productId, immediate }` |
| Payment Failed | `subscription.payment_failed` | Payment attempt failed | `{ subscriptionId, attemptCount, invoiceId }` |
| Payment Succeeded | `subscription.payment_succeeded` | Successful billing | `{ subscriptionId, invoiceId, amount }` |
| Trial Ending | `subscription.trial_ending` | 3 days before trial ends | `{ subscriptionId, trialEndDate }` |

### 15.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| `checkout.completed` | Checkout | Create/update subscription |
| `product.archived` | Product Catalog | Check active subscriptions |
| `bundle.updated` | Product Bundles | Update bundle subscription items |

---

## 16. Notifications

### 16.1 Email Notifications

| Name | Trigger Event | Recipient | Template Variables |
|------|---------------|-----------|-------------------|
| Subscription Welcome | subscription.created | customer | `{{items}}, {{monthlyTotal}}, {{nextBillDate}}` |
| Trial Ending Soon | subscription.trial_ending | customer | `{{trialEndDate}}, {{monthlyTotal}}` |
| Payment Successful | subscription.payment_succeeded | customer | `{{invoiceUrl}}, {{amount}}, {{items}}` |
| Payment Failed | subscription.payment_failed | customer | `{{updatePaymentUrl}}, {{attemptCount}}` |
| Item Added | subscription.item_added | customer | `{{productName}}, {{price}}, {{proratedAmount}}` |
| Item Canceled | subscription.item_canceled | customer | `{{productName}}, {{endDate}}` |
| Subscription Paused | subscription.paused | customer | `{{resumeDate?}}` |
| Subscription Canceled | subscription.canceled | customer | `{{endDate}}, {{items}}` |

### 16.2 Admin Notifications

| Name | Trigger | Recipient | Message |
|------|---------|-----------|---------|
| High Churn Alert | Churn rate > threshold | admin | "Monthly churn rate is {{rate}}%" |
| Failed Payment Alert | 3+ failed attempts | manager | "Subscription {{id}} has {{count}} failed payments" |
| New Subscription | subscription.created | assigned_rep | "New subscription from {{customerName}}" |

---

## 17. UCP/API Design

### 17.1 REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ucp/subscriptions` | List customer's subscriptions |
| GET | `/api/ucp/subscriptions/:id` | Get subscription details |
| POST | `/api/ucp/subscriptions` | Create new subscription |
| POST | `/api/ucp/subscriptions/:id/items` | Add item to subscription |
| DELETE | `/api/ucp/subscriptions/:id/items/:itemId` | Cancel item |
| POST | `/api/ucp/subscriptions/:id/pause` | Pause subscription |
| POST | `/api/ucp/subscriptions/:id/resume` | Resume subscription |
| POST | `/api/ucp/subscriptions/:id/cancel` | Cancel subscription |
| GET | `/api/ucp/subscriptions/:id/invoices` | List invoices |
| GET | `/api/ucp/subscription-templates` | List available templates |

### 17.2 MCP Tools

```typescript
// MCP Tool: get_subscriptions
{
  name: "get_subscriptions",
  description: "List customer's active subscriptions with items",
  inputSchema: {
    type: "object",
    properties: {
      customerId: { type: "string", description: "Customer ID" },
      status: { type: "string", description: "Filter by status" },
    },
  },
  handler: async ({ customerId, status }) => {
    return await convex.query(api.subscriptions.listByCustomer, {
      userId: customerId,
      status,
    });
  },
}

// MCP Tool: add_subscription_item
{
  name: "add_subscription_item",
  description: "Add a product to customer's subscription",
  inputSchema: {
    type: "object",
    properties: {
      subscriptionId: { type: "string", required: true },
      productId: { type: "string", required: true },
      variantId: { type: "string" },
    },
    required: ["subscriptionId", "productId"],
  },
  handler: async ({ subscriptionId, productId, variantId }) => {
    return await convex.mutation(api.subscriptions.addItem, {
      subscriptionId,
      productId,
      variantId,
    });
  },
}

// MCP Tool: cancel_subscription_item
{
  name: "cancel_subscription_item",
  description: "Cancel a specific item from subscription",
  inputSchema: {
    type: "object",
    properties: {
      subscriptionId: { type: "string", required: true },
      itemId: { type: "string", required: true },
      cancelImmediately: { type: "boolean", default: false },
    },
    required: ["subscriptionId", "itemId"],
  },
  handler: async ({ subscriptionId, itemId, cancelImmediately }) => {
    return await convex.mutation(api.subscriptions.cancelItem, {
      subscriptionId,
      itemId,
      cancelImmediately,
    });
  },
}

// MCP Tool: get_subscription_status
{
  name: "get_subscription_status",
  description: "Get subscription status with billing details",
  inputSchema: {
    type: "object",
    properties: {
      subscriptionId: { type: "string", required: true },
    },
    required: ["subscriptionId"],
  },
  handler: async ({ subscriptionId }) => {
    const sub = await convex.query(api.subscriptions.get, { subscriptionId });
    return {
      status: sub.status,
      monthlyTotal: sub.monthlyTotal,
      nextBillingDate: sub.nextPaymentDate,
      items: sub.items.map(i => ({
        name: i.product.name,
        price: i.price,
        status: i.status,
      })),
    };
  },
}
```

---

## 18. Stripe Integration

### 18.1 Stripe Objects Mapping

| Our Model | Stripe Object |
|-----------|---------------|
| Subscription Template | Stripe Product (for billing) |
| Subscription | Stripe Subscription |
| Subscription Item | Stripe Subscription Item |
| Product Price | Stripe Price (recurring) |
| Invoice | Stripe Invoice |
| Invoice Item | Stripe Invoice Line Item |

### 18.2 Webhook Events to Handle

| Stripe Event | Our Action |
|--------------|------------|
| `customer.subscription.created` | Create/update local subscription |
| `customer.subscription.updated` | Update status/dates/items |
| `customer.subscription.deleted` | Mark as canceled |
| `customer.subscription.trial_will_end` | Send trial ending email |
| `invoice.created` | Create local invoice record |
| `invoice.paid` | Update invoice status, dispatch event |
| `invoice.payment_failed` | Update failed count, notify |
| `invoice.payment_action_required` | Send payment action email |

### 18.3 Multi-Item Subscription with Stripe

```typescript
// Creating subscription with multiple items
const stripeSubscription = await stripe.subscriptions.create({
  customer: stripeCustomerId,
  items: [
    { price: roxyPriceId, quantity: 1 },
    { price: bobPriceId, quantity: 1 },
    { price: sarahPriceId, quantity: 1 },
  ],
  proration_behavior: 'create_prorations',
  payment_behavior: 'default_incomplete',
  metadata: {
    convex_subscription_id: subscriptionId,
  },
});

// Adding item to existing subscription
const newItem = await stripe.subscriptionItems.create({
  subscription: stripeSubscriptionId,
  price: newProductPriceId,
  quantity: 1,
  proration_behavior: 'create_prorations',
});

// Canceling single item
await stripe.subscriptionItems.update(stripeItemId, {
  deleted: true,
  proration_behavior: 'create_prorations',
});
```

---

## 19. Subscription Metrics

### 19.1 Key Metrics

| Metric | Calculation |
|--------|-------------|
| MRR | Sum of all active subscription monthly totals |
| ARR | MRR × 12 |
| Churn Rate | Canceled subscriptions / Total at start of period |
| ARPU | MRR / Active subscribers |
| LTV | ARPU / Churn Rate |
| Average Items per Subscription | Total active items / Active subscriptions |
| Trial Conversion Rate | Subscriptions activated / Trials started |

### 19.2 Dashboard Queries

```typescript
export const getSubscriptionMetrics = query({
  args: {},
  handler: async (ctx) => {
    await requireManager(ctx);

    const activeSubscriptions = await ctx.db.query("subscriptions")
      .withIndex("by_status", q => q.eq("status", "active"))
      .collect();

    // Calculate MRR
    const mrr = activeSubscriptions.reduce((sum, sub) => sum + sub.monthlyTotal, 0);

    // Count active items
    const allItems = await ctx.db.query("subscription_items")
      .withIndex("by_status", q => q.eq("status", "active"))
      .collect();

    // Calculate averages
    const avgItemsPerSub = allItems.length / activeSubscriptions.length;

    return {
      mrr,
      arr: mrr * 12,
      activeSubscriptionCount: activeSubscriptions.length,
      activeItemCount: allItems.length,
      avgItemsPerSubscription: avgItemsPerSub,
    };
  },
});
```

---

## 20. Implementation Phases

### Phase 1: Foundation
- [ ] Create subscription_templates schema
- [ ] Create subscriptions schema (container model)
- [ ] Create subscription_items schema
- [ ] Create subscription_invoices schema
- [ ] Set up indexes

### Phase 2: Template System
- [ ] Template CRUD mutations
- [ ] Admin template management UI
- [ ] Product-template linkage
- [ ] Override resolution logic

### Phase 3: Core Subscription Features
- [ ] Subscription creation from checkout
- [ ] Add item to subscription mutation
- [ ] Cancel item mutation
- [ ] Stripe multi-item subscription integration
- [ ] Stripe webhook handlers

### Phase 4: Customer Experience
- [ ] My Subscriptions page (My Team)
- [ ] Team member cards
- [ ] Add team member flow
- [ ] Cancel item flow
- [ ] Invoice history

### Phase 5: Admin Tooling
- [ ] Subscriptions dashboard with metrics
- [ ] Subscription list with filters
- [ ] Subscription detail page
- [ ] Item management
- [ ] Price override functionality
- [ ] Internal notes

### Phase 6: Integration & Polish
- [ ] UCP REST endpoints
- [ ] MCP tools
- [ ] Email notifications
- [ ] Bundle-to-subscription conversion
- [ ] Credit system placeholder activation

---

## 21. Verification Checklist

After implementation, verify these use cases:

### Checkout Scenarios
- [ ] Customer adds 3 virtual employees → 1 subscription, 3 items
- [ ] Customer with existing subscription adds product → Added to existing
- [ ] Customer checks out with subscription + one-time items → Both handled

### Item Management
- [ ] Customer cancels 1 employee → Item cancelled, subscription continues
- [ ] Customer adds another employee mid-cycle → Prorated charge
- [ ] Admin overrides item price → Price changes, audit logged

### Billing
- [ ] Monthly invoice shows all active items itemized
- [ ] Setup fees appear on first invoice only
- [ ] Proration appears as separate line items

### UCP Compliance
- [ ] AI agent can query subscription status
- [ ] AI agent can add item to subscription
- [ ] AI agent can cancel item

### Bundle Integration
- [ ] Bundle purchase → Multiple items in subscription
- [ ] Admin can modify bundle composition post-purchase

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | recVGRWbekNydvuH4 |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Payment System PRD](./PRD-PAYMENT-SYSTEM.md)
- [Checkout System PRD](./PRD-CHECKOUT-SYSTEM.md)
- [Product Bundles PRD](./PRD-DRAFT-PRODUCT-BUNDLES.md)
- [Stripe Subscriptions](https://stripe.com/docs/billing/subscriptions)
- [Stripe Multi-Item Subscriptions](https://stripe.com/docs/billing/subscriptions/multiple-products)

### C. Glossary

| Term | Definition |
|------|------------|
| Subscription | Billing container holding multiple items |
| Subscription Item | Single product/service within a subscription |
| Template | Reusable billing configuration |
| MRR | Monthly Recurring Revenue |
| Proration | Partial charge/credit for mid-cycle changes |
| Container Model | Architecture where one subscription holds multiple items |

---

**PRD Version:** 2.0 (Upgraded to Template-Driven Container Model)
**Created:** 2025-02-03
**Last Updated:** 2026-02-03
**Author:** Claude (AI Assistant)
**Status:** DRAFT - Ready for Review
