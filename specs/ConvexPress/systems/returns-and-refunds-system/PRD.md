# PRD: Returns & Refunds System

> **Project:** ConvexPress — unified CMS + commerce. Commerce is a first-class layer inside ConvexPress alongside posts/pages/media/users/taxonomies. Features are baked into commerce core or gated as internal extensions via `lib/plugins/registry.ts`.
> **Two-app architecture:** `ConvexPress-Admin/` (Convex Auth) + `ConvexPress-Website/` (Clerk).
> **Roles:** WordPress-standard (Administrator / Editor / Author / Contributor / Subscriber).
> **Stack:** Bun, Base UI, Tailwind v4, Stripe (see `docs/stripe-integration.md`).
> **Canonical path:** `specs/ConvexPress/systems/returns-and-refunds-system/PRD.md`
> **Airtable Record:** `recCOTnfkHREZgeRm`
> **Expert:** `/experts:returns-refunds-system` (to be created)
> **Status:** Internal extension (`commerceReturns`). ~82% feature-complete; documentation + UI polish + auto-label-gen are the remaining gaps.

---

## Integration with ConvexPress

**Positioning:** internal extension (`commerceReturns`).
**Extension gate:** `commerce.returns.returnsEnabled` in Settings; `requireCommerceReturnsEnabled(ctx)` helper on every mutation/query; admin UI hides nav item when disabled.
**Code lives at:** `ConvexPress-Admin/packages/backend/convex/commerceReturns/` (9 files: mutations, queries, eligibility, helpers, itemState, migrations, refundLifecycle, refundPolicy, __tests__).
**Admin UI:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/returns.*`.

**Consumes these ConvexPress systems:**

- **Order System** — returns attach to `commerce_orders` and specific `commerce_order_items` via quantity claims.
- **Payment System** — refunds run through `commerce/paymentActions.processStripeRefund` (Stripe only today) + future PayPal action.
- **Inventory System** — approved returns optionally restock via `inventory.internals.restockFromReturn`.
- **Email Notification System** — templates: `return_requested`, `return_approved`, `return_declined`, `refund_issued`, `return_shipping_label_issued`.
- **Event Dispatcher** — emits `commerce.return_requested`, `.approved`, `.declined`, `.completed`, `commerce.refund_issued`, `.failed`.
- **Users + Customer System** — returns are filed by `users._id` or guest `customerEmail`.
- **Shipping System** — return-shipping labels routed through Shippo/EasyPost return endpoints (new wiring, Wave 11).
- **Audit Log System** — every status transition logged.
- **Role & Capability** — `commerce.returns.*` capabilities replace current broad `manage_options`.

**WooCommerce analog:** WooCommerce's native "Refund" on orders + RMA plugins like "WooCommerce Smart Refunder" and "YITH RMA." We combine ad-hoc admin refunds (Woo-native) with structured RMA workflow (YITH-like) in one system.

---

## 1. Overview

### 1.1 Purpose

Customers submit return requests for purchased items; admins review,
approve or decline; approved returns progress through states (awaiting
shipping, received, inspected) and end in a refund via the original
payment method, store credit, or manual resolution.

### 1.2 Scope

**In Scope:**
- Customer-initiated return request flow from `/dashboard/orders/$id/return`.
- Admin approval / decline with reason.
- Partial returns (quantity-per-item claim).
- Refund methods: original payment, store credit (NEW ledger), manual.
- Automated Stripe refund via `paymentActions.processStripeRefund` (exists).
- **NEW:** PayPal refund action.
- **NEW:** Return-shipping label auto-generation via Shippo / EasyPost return endpoints.
- **NEW:** Admin-managed return-reason taxonomy (codes + labels, translatable).
- **NEW:** Admin `/commerce/orders/$id/refund` ad-hoc order-level refund UI.
- **NEW:** Configurable refund policy (tax / shipping / restocking fee inclusion toggles) via Settings UI, replacing hardcoded `REFUND_POLICY` constants.
- **NEW:** Store-credit ledger — balance, issue, redeem, expire.
- **NEW:** Stuck-refund detector cron (refunds in `processing` >48h trigger alert).

**Out of Scope:**
- Store-credit redemption at checkout — owned by Cart/Checkout (consumes the ledger API we expose).
- Fraudulent-refund detection — future ML/heuristic module.
- Chargeback handling — Payment System owns the dispute lifecycle.

---

## 2. Data Model

### 2.1 Exists
- `commerce_returns` — return header (orderId, status, reason, requestedAt, approvedAt, etc.)
- `commerce_return_items` — per-order-item claim rows
- `commerce_refunds` — refund ledger

### 2.2 NEW for Wave 11

```ts
commerce_return_reasons: defineTable({
  code: v.string(),             // "defective", "wrong_item", "changed_mind"
  label: v.string(),
  description: v.optional(v.string()),
  requiresPhoto: v.optional(v.boolean()),
  requiresRestock: v.optional(v.boolean()),
  sortOrder: v.optional(v.number()),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_code", ["code"]).index("by_active", ["isActive"]);

commerce_store_credit_ledger: defineTable({
  userId: v.id("users"),
  entryType: v.union(
    v.literal("issue"),
    v.literal("redeem"),
    v.literal("expire"),
    v.literal("adjust"),
  ),
  amount: v.number(),              // signed cents
  balanceAfter: v.number(),
  sourceReturnId: v.optional(v.id("commerce_returns")),
  sourceOrderId: v.optional(v.id("commerce_orders")),
  note: v.optional(v.string()),
  createdBy: v.optional(v.id("users")),
  expiresAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_return", ["sourceReturnId"])
  .index("by_expires_at", ["expiresAt"]);

// Settings: commerce.returns
// - returnsEnabled: boolean
// - returnWindowDays: number (default 30)
// - refundsIncludeTax: boolean
// - refundsIncludeShipping: boolean
// - restockingFeePercent: number
// - autoLabelProvider: "shippo" | "easypost" | null
// - storeCreditExpirationDays: number (0 = never)
```

---

## 3. Functions

### 3.1 Exists
- `commerce.returns.queries.*` — list/get for admin + customer
- `commerce.returns.mutations.*` — request, approve, decline, update status
- `refundLifecycle.ts` — refund state machine
- `eligibility.ts` — return-window + order-status checks
- `commerce.paymentActions.processStripeRefund` — Stripe refund action

### 3.2 New for Wave 11
- `commerce.returns.actions.generateReturnLabel` — Shippo/EasyPost label action
- `commerce.returns.actions.processPayPalRefund` — PayPal refund action
- `commerce.returns.internals.issueStoreCredit` — ledger write
- `commerce.storeCredit.queries.getBalance(userId)`
- `commerce.storeCredit.mutations.redeem(userId, amount, orderId)` (called at checkout)
- `commerce.returns.internals.detectStuckRefunds` — hourly cron
- `commerce.returns.mutations.recordReasonCode` — admin CRUD for reasons
- `commerce.returns.internals.expireStoreCredit` — daily cron honoring `storeCreditExpirationDays`

### 3.3 Capabilities (replace broad `manage_options`)

- `commerce.returns.view`
- `commerce.returns.approve`
- `commerce.returns.decline`
- `commerce.returns.refund`
- `commerce.returns.reason.manage`
- `commerce.returns.store_credit.manage`

---

## 4. Admin UI

### 4.1 Exists
- Returns list table at `/commerce/returns`
- Return detail at `/commerce/returns/$returnId`
- Settings toggle at `/commerce/returns.settings`

### 4.2 New
- `/commerce/orders/$orderId/refund` — ad-hoc refund form (backend mutation exists today)
- `/commerce/returns/reasons` — reason-code taxonomy CRUD
- `/commerce/returns/settings` expanded with tax/shipping/restocking-fee toggles (replaces hardcoded constants)
- `/commerce/customers/$userId/store-credit` — balance + ledger view + manual adjust
- Return-label button on return detail — calls `generateReturnLabel` action

---

## 5. Events

- `commerce.return_requested / approved / declined / received / completed`
- `commerce.refund_issued / failed / stuck`
- `commerce.store_credit_issued / redeemed / expired`

---

## 6. Integration points

### Order / Payment
Refund mutations always scope to an order + the original transaction. Stripe/PayPal actions must honor idempotency keys keyed on `refundId` to prevent double refunds on retry.

### Inventory
On return approval, if the reason has `requiresRestock` and the product/variant is stocked, `inventory.internals.restockFromReturn` runs inside the approval mutation.

### Email
Every status transition queues a templated email (welcome stack: `return_requested` → `return_approved` / `return_declined` → `refund_issued` → `return_completed`).

### Shipping
`generateReturnLabel` calls the chosen provider's return-label API, persists the resulting `labelUrl` + `trackingNumber` on the `commerce_returns` row, and emails the customer.

### Checkout (store-credit redemption)
Cart/Checkout expose a "Use store credit" toggle that calls `storeCredit.queries.getBalance` for the signed-in user and deducts at finalize via `storeCredit.mutations.redeem`.

---

## 7. Acceptance criteria

### 7.1 Existing (must not regress)
- [x] Customer return request flow
- [x] Admin approve / decline
- [x] Partial-return quantity claims
- [x] Stripe refund action
- [x] Refund lifecycle state machine
- [x] Eligibility checks (return window, order status)

### 7.2 Wave 11 new
- [ ] PayPal refund action
- [ ] Return-shipping-label auto-gen (Shippo + EasyPost)
- [ ] `commerce_return_reasons` table + admin CRUD + customer-facing dropdown
- [ ] `/commerce/orders/$id/refund` ad-hoc UI
- [ ] `commerce_store_credit_ledger` + issue/redeem/expire mutations
- [ ] Refund-policy settings (tax/shipping/restocking-fee toggles) replace hardcoded constants
- [ ] Stuck-refund hourly cron + admin alert
- [ ] Dedicated `commerce.returns.*` capabilities
- [ ] Store-credit expiration cron
- [ ] Admin store-credit view per customer

---

## 8. Definition of Done

1. All §7.2 boxes ticked.
2. Returns + refund + store-credit round-trip tested end-to-end on a Stripe test account.
3. Stuck-refund alert fires on a staged refund that never completes.
4. `lib/plugins/registry.ts` hides the entire nav when `returnsEnabled: false`.
5. Existing 82%-complete test suite grows to cover the new store-credit ledger + label-gen happy paths.

---

## 9. References

- Code: `convex/commerceReturns/*` (9 files) + `commerce/paymentActions.processStripeRefund`
- Docs: `.codex/docs/COMMERCE-RETURNS-PLUGIN-PRD.md`, `.codex/docs/COMMERCE-RETURNS-PLUGIN-IMPLEMENTATION-CHECKLIST.md`, `.codex/docs/RETURNS-AND-REFUNDS-SYSTEM.md`
- Audit: `.codex/audit-backlog/system-audit-gaps.md` §Returns & Refunds System
- Sibling PRDs: `order-system`, `payment-system`, `customer-system`, `shipping-index`
- Airtable: `appqpJ8QQkoKsH02O` / Systems / `recCOTnfkHREZgeRm`
