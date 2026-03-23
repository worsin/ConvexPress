# Phase 1: Schema Foundation

> **Duration:** 1-2 days
> **Prerequisites:** None
> **Blocks:** Phase 2, Phase 3

---

## Objective

Create the database schema for the subscription system. This phase is purely schema definition - no business logic, no UI.

---

## Tasks

### 1.1 Create New Subscription Tables

Add the following tables to `admin-app/packages/backend/convex/schema.ts`:

#### subscription_templates
```typescript
subscription_templates: defineTable({
  // Identification
  name: v.string(),
  slug: v.string(),
  displayName: v.string(),
  description: v.optional(v.string()),

  // Billing (monthly only)
  billingInterval: v.literal("month"),
  billingIntervalCount: v.number(), // Always 1

  // Pricing defaults
  setupFee: v.optional(v.number()),
  trialDays: v.optional(v.number()),

  // Proration
  prorationBehavior: v.union(
    v.literal("create_prorations"),
    v.literal("none"),
    v.literal("always_invoice")
  ),

  // Behavior
  allowPause: v.boolean(),
  maxPauseDays: v.optional(v.number()),
  cancelAnytime: v.boolean(),

  // Status
  status: v.union(v.literal("active"), v.literal("archived")),

  // Stripe
  stripeProductId: v.optional(v.string()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_slug", ["slug"])
  .index("by_status", ["status"]),
```

#### subscriptions
```typescript
subscriptions: defineTable({
  // Identification
  subscriptionNumber: v.string(),
  userId: v.id("user_profiles"),
  templateId: v.id("subscription_templates"),

  // Stripe
  stripeSubscriptionId: v.string(),
  stripeCustomerId: v.string(),

  // Billing
  billingInterval: v.literal("month"),
  billingIntervalCount: v.number(),
  currency: v.string(),

  // Totals
  monthlyTotal: v.number(),
  setupFeeTotal: v.number(),

  // Status
  status: v.union(
    v.literal("trialing"),
    v.literal("active"),
    v.literal("paused"),
    v.literal("past_due"),
    v.literal("unpaid"),
    v.literal("canceled")
  ),

  // Dates
  startDate: v.number(),
  currentPeriodStart: v.number(),
  currentPeriodEnd: v.number(),
  trialEndDate: v.optional(v.number()),
  pausedAt: v.optional(v.number()),
  pauseResumeDate: v.optional(v.number()),
  canceledAt: v.optional(v.number()),
  cancelAtPeriodEnd: v.boolean(),

  // Payment
  defaultPaymentMethodId: v.optional(v.string()),
  lastPaymentDate: v.optional(v.number()),
  nextPaymentDate: v.optional(v.number()),
  failedPaymentCount: v.number(),

  // Admin
  assignedRepId: v.optional(v.id("user_profiles")),

  // Credit placeholders (future)
  creditAllocation: v.optional(v.number()),
  creditUsed: v.optional(v.number()),
  creditResetDate: v.optional(v.number()),
  overageEnabled: v.optional(v.boolean()),
  overageRate: v.optional(v.number()),

  // Notes
  internalNotes: v.optional(v.array(v.object({
    note: v.string(),
    createdBy: v.id("user_profiles"),
    createdAt: v.number(),
  }))),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId", "status"])
  .index("by_stripe_id", ["stripeSubscriptionId"])
  .index("by_status", ["status"])
  .index("by_next_payment", ["nextPaymentDate"])
  .index("by_assigned_rep", ["assignedRepId"])
  .index("by_subscription_number", ["subscriptionNumber"]),
```

#### subscription_items
```typescript
subscription_items: defineTable({
  subscriptionId: v.id("subscriptions"),
  productId: v.id("products"),
  variantId: v.optional(v.id("product_variants")),

  // Stripe
  stripeSubscriptionItemId: v.string(),
  stripePriceId: v.string(),

  // Pricing
  price: v.number(),
  setupFee: v.optional(v.number()),
  quantity: v.number(),

  // Overrides
  priceOverride: v.optional(v.number()),
  priceOverrideReason: v.optional(v.string()),
  priceOverrideBy: v.optional(v.id("user_profiles")),

  // Status
  status: v.union(
    v.literal("active"),
    v.literal("pending_cancellation"),
    v.literal("canceled")
  ),

  // Dates
  addedAt: v.number(),
  canceledAt: v.optional(v.number()),
  cancelAtPeriodEnd: v.boolean(),

  // Credit (future)
  itemCreditAllocation: v.optional(v.number()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_subscription", ["subscriptionId", "status"])
  .index("by_product", ["productId"])
  .index("by_stripe_item", ["stripeSubscriptionItemId"]),
```

#### subscription_invoices
```typescript
subscription_invoices: defineTable({
  subscriptionId: v.id("subscriptions"),
  stripeInvoiceId: v.string(),

  invoiceNumber: v.string(),
  amount: v.number(),
  amountPaid: v.number(),
  amountDue: v.number(),
  currency: v.string(),

  status: v.union(
    v.literal("draft"),
    v.literal("open"),
    v.literal("paid"),
    v.literal("void"),
    v.literal("uncollectible")
  ),

  periodStart: v.number(),
  periodEnd: v.number(),
  dueDate: v.optional(v.number()),
  paidAt: v.optional(v.number()),

  paymentIntentId: v.optional(v.string()),
  paymentMethodId: v.optional(v.string()),

  invoicePdfUrl: v.optional(v.string()),
  hostedInvoiceUrl: v.optional(v.string()),

  // Work summary (future)
  workSummaryAttached: v.boolean(),
  workSummaryUrl: v.optional(v.string()),

  createdAt: v.number(),
})
  .index("by_subscription", ["subscriptionId"])
  .index("by_stripe_id", ["stripeInvoiceId"])
  .index("by_status", ["status"]),
```

#### subscription_invoice_items
```typescript
subscription_invoice_items: defineTable({
  invoiceId: v.id("subscription_invoices"),
  subscriptionItemId: v.optional(v.id("subscription_items")),

  description: v.string(),
  quantity: v.number(),
  unitAmount: v.number(),
  amount: v.number(),

  isProrated: v.boolean(),
  prorationDetails: v.optional(v.object({
    periodStart: v.number(),
    periodEnd: v.number(),
    description: v.string(),
  })),

  type: v.union(
    v.literal("subscription"),
    v.literal("setup_fee"),
    v.literal("proration_credit"),
    v.literal("proration_charge"),
    v.literal("adjustment")
  ),

  createdAt: v.number(),
})
  .index("by_invoice", ["invoiceId"])
  .index("by_subscription_item", ["subscriptionItemId"]),
```

#### subscription_history
```typescript
subscription_history: defineTable({
  subscriptionId: v.id("subscriptions"),
  subscriptionItemId: v.optional(v.id("subscription_items")),

  action: v.union(
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
    v.literal("item_added"),
    v.literal("item_canceled"),
    v.literal("item_price_changed"),
    v.literal("item_reactivated")
  ),

  performedBy: v.optional(v.id("user_profiles")),
  performedByType: v.union(
    v.literal("customer"),
    v.literal("admin"),
    v.literal("system")
  ),

  details: v.optional(v.any()),
  timestamp: v.number(),
})
  .index("by_subscription", ["subscriptionId", "timestamp"])
  .index("by_item", ["subscriptionItemId", "timestamp"]),
```

#### subscription_bundle_items
```typescript
subscription_bundle_items: defineTable({
  subscriptionItemId: v.id("subscription_items"),
  bundleId: v.id("product_bundles"),
  componentProductId: v.id("products"),
  componentVariantId: v.optional(v.id("product_variants")),
  componentQuantity: v.number(),
})
  .index("by_subscription_item", ["subscriptionItemId"])
  .index("by_bundle", ["bundleId"]),
```

---

### 1.2 Modify Existing Tables

#### products table - Add fields
```typescript
// Add to existing products table definition:
isSubscriptionEnabled: v.optional(v.boolean()),
subscriptionTemplateId: v.optional(v.id("subscription_templates")),
subscriptionOverrides: v.optional(v.object({
  setupFee: v.optional(v.number()),
  trialDays: v.optional(v.number()),
  customPrice: v.optional(v.number()),
})),
```

**Note:** The existing `products` table likely has many fields. Add these 3 new fields. You may need to add an index:
```typescript
.index("by_subscription_template", ["subscriptionTemplateId"])
```

#### user_profiles table - Add fields
```typescript
// Add to existing user_profiles table definition:
activeSubscriptionId: v.optional(v.id("subscriptions")),
hasActiveSubscription: v.optional(v.boolean()),
```

#### checkout_sessions table - Add fields
```typescript
// Add to existing checkout_sessions table definition:
hasSubscriptionItems: v.optional(v.boolean()),
subscriptionItems: v.optional(v.array(v.object({
  productId: v.id("products"),
  variantId: v.optional(v.id("product_variants")),
  price: v.number(),
  setupFee: v.number(),
}))),
existingSubscriptionId: v.optional(v.id("subscriptions")),
subscriptionAction: v.optional(v.union(
  v.literal("create"),
  v.literal("add_items")
)),
createdSubscriptionId: v.optional(v.id("subscriptions")),
```

#### cart_items table - Add fields
```typescript
// Add to existing cart_items table definition:
isSubscription: v.optional(v.boolean()),
subscriptionConfig: v.optional(v.object({
  templateId: v.id("subscription_templates"),
  price: v.number(),
  setupFee: v.optional(v.number()),
})),
```

---

### 1.3 Create Helper Files Structure

Create empty files for future phases:

```
admin-app/packages/backend/convex/
├── subscriptions/
│   ├── templates.ts      (Phase 2)
│   ├── subscriptions.ts  (Phase 3)
│   ├── items.ts          (Phase 3)
│   ├── invoices.ts       (Phase 3)
│   ├── webhooks.ts       (Phase 3)
│   └── helpers.ts        (Phase 2)
```

Create these as empty files with basic imports:

```typescript
// subscriptions/templates.ts
import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

// Template queries and mutations will go here
```

---

## Verification Checklist

After completing Phase 1:

- [ ] All 7 new tables created in schema.ts
- [ ] Existing tables modified with new fields
- [ ] No schema validation errors
- [ ] `bun run dev:server` runs without errors
- [ ] Convex dashboard shows new tables (empty)
- [ ] Helper file structure created

---

## Integration Notes

### Existing Schema Patterns to Follow

Looking at the existing schema, you'll see patterns like:
- All tables have `createdAt: v.number()`
- Indexes follow `by_fieldName` naming convention
- Foreign keys use `v.id("table_name")`
- Optional fields use `v.optional()`

### No Breaking Changes

All modifications to existing tables are **additive** (new optional fields). This means:
- Existing data won't break
- Existing queries continue to work
- New fields default to `undefined`

---

## Files to Modify

| File | Action |
|------|--------|
| `admin-app/packages/backend/convex/schema.ts` | Add 7 new tables, modify 4 existing |
| `admin-app/packages/backend/convex/subscriptions/` | Create folder and empty files |

---

## Estimated Effort

| Task | Time |
|------|------|
| Create new tables | 1-2 hours |
| Modify existing tables | 30 min |
| Create helper structure | 15 min |
| Testing & verification | 30 min |
| **Total** | **2-3 hours** |

---

**Next Phase:** [Phase 2: Template System & Stripe Setup](./02-PHASE-TEMPLATES.md)
