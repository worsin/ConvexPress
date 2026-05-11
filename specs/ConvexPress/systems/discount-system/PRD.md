# PRD: Discount System

> **Project:** ConvexPress — unified CMS + commerce platform. Commerce is a first-class layer alongside posts/pages/media/users/taxonomies. Features are baked into commerce core or gated as internal extensions via `lib/plugins/registry.ts`.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA + Convex Auth, owns Convex DB) + `ConvexPress-Website/` (TanStack Start SSR + Clerk auth, read-only consumer).
> **Roles:** WordPress-standard — Administrator / Editor / Author / Contributor / Subscriber.
> **No third-party plugin/theme marketplace.** Stack: Bun, Base UI, Tailwind v4, Stripe.
> **Canonical path:** `specs/ConvexPress/systems/discount-system/PRD.md`
> **Airtable Record:** `recfLI9oTU3wOx9Je`
> **Expert:** `/experts:discount-system` (to be created)
> **Status:** Core engine shipped (~55% feature-complete). Parity gaps identified with WooCommerce Coupons + Shopify Discounts.

---

## Integration with ConvexPress

**Positioning:** baked into commerce core.
**Code lives at:** `ConvexPress-Admin/packages/backend/convex/commerce/discounts.ts` + `commerce/discountEngine.ts` (pure helpers) + `schema/commerce.ts:commerce_discount_codes`.
**Admin UI:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/discounts.tsx`.

**Consumes these ConvexPress systems:**

- **Cart System** — cart calls `apply(cartId, code)` + `remove(cartId, code)` and carries `commerce_carts.discountCodes` + `discountAmount`. Engine evaluates applicability on every cart mutation.
- **Checkout System** — validates codes again at finalize (prices could have changed since add); freezes `commerce_orders.discountCodes` + `discountAmount`.
- **Product System + Product Category System** — codes can target specific `productIds` / `categoryIds` or exclude them.
- **Customer System** — per-user usage limits require a `commerce_discount_usages` history join on `users._id`.
- **Shipping System** — new `free_shipping` discount type must suppress the shipping-cost line (routed through Shipping Rules Engine).
- **Payment System** — Stripe `coupon` / `promotion_code` mirror so hosted-checkout sessions accept the same codes.
- **Commerce Subscriptions** — subscription renewal invoices honor codes with `appliesTo: "recurring"` set.
- **Event Dispatcher** — emits `discount.created`, `discount.updated`, `discount.applied`, `discount.redeemed`, `discount.usage_limit_hit`.
- **Role & Capability** — dedicated `commerce.discount.*` capabilities replace the current broad `manage_options` check.
- **WordPress Sync** — `wordpressSync/phases/commerceTransactions.ts` imports Woo coupons; must round-trip every field.

**WooCommerce / Shopify analog:** WooCommerce Coupons (native) + Shopify Discount Codes + Automatic Discounts + Discount Apps.

---

## 1. Overview

### 1.1 Purpose

The Discount System manages promotional codes and automatic discounts that
reduce cart subtotals, individual item prices, or shipping costs.
WooCommerce parity is the baseline — import + merchants' existing habits
demand it — but we also take Shopify's Automatic Discounts model (no code
required, matches a condition) and bolt Stripe's hosted-checkout
`promotion_code` mirror on top.

### 1.2 Scope

**In Scope:**
- Three coupon types (exist): `fixed_cart`, `percent`, `fixed_product`.
- **NEW:** fourth type `free_shipping` wired to Shipping Rules Engine.
- Code CRUD with product / category include / exclude lists.
- Minimum subtotal and minimum quantity thresholds.
- **NEW:** maximum subtotal threshold.
- Usage limits: total + per-user + per-email-allowlist.
- **NEW:** `individualUse` flag (single-code-per-cart enforcement).
- **NEW:** `excludeSaleItems` flag (skip items with an `onSale: true` price).
- Tiered amounts (exist) — quantity-based step discounts.
- Start / end dates with status auto-flip via a daily cron.
- **NEW:** Automatic discounts — no code, triggers by condition (match a product/category, new customer only, cart total ≥ X).
- **NEW:** `commerce_discount_usages` history table — who used what code when on which order.
- **NEW:** Stripe mirror action — when a code is created/updated, upsert a matching Stripe `coupon` + `promotion_code`.
- Cart + checkout apply/remove flows (exist; harden against race conditions via Convex reactivity).
- Admin CRUD UI with search, status filter, stats column.

**Out of Scope:**
- Gift cards — separate future system (stored-value accounts, not discounts).
- Referral programs — a separate system using discounts as a reward primitive.
- BOGO (buy-one-get-one) as a first-class type — implementable via tiered discounts; first-class BOGO deferred.

### 1.3 Key Differentiators

- **WooCommerce round-trip** — every Woo coupon field imports losslessly; admins migrating feel at home.
- **Automatic discounts** — rarely-used in Woo, core in Shopify; we ship both.
- **Stripe mirror** — codes work in both our own checkout AND hosted Stripe sessions.
- **Usage history** — reporting-grade audit trail, not a scan of `commerce_orders`.

---

## 2. Data Model

### 2.1 `commerce_discount_codes` (exists — extend)

New fields added to the existing table:

```ts
// discountType gains a 4th literal:
v.literal("free_shipping"),

// New fields:
maximumSubtotalAmount: v.optional(v.number()),
allowedEmails: v.optional(v.array(v.string())),
newCustomersOnly: v.optional(v.boolean()),
individualUse: v.optional(v.boolean()),
excludeSaleItems: v.optional(v.boolean()),
perUserUsageLimit: v.optional(v.number()),
appliesTo: v.optional(
  v.union(v.literal("initial"), v.literal("recurring"), v.literal("both")),
),
auto: v.optional(v.boolean()),
autoConditions: v.optional(v.any()),
stripeCouponId: v.optional(v.string()),
stripePromotionCodeId: v.optional(v.string()),

// Indexes:
.index("by_auto", ["auto"])
.index("by_stripe_coupon", ["stripeCouponId"])
```

### 2.2 `commerce_discount_usages` (NEW)

```ts
commerce_discount_usages: defineTable({
  discountId: v.id("commerce_discount_codes"),
  userId: v.optional(v.id("users")),
  customerEmail: v.optional(v.string()),
  orderId: v.optional(v.id("commerce_orders")),
  subscriptionId: v.optional(v.id("commerce_subscriptions")),
  invoiceId: v.optional(v.id("commerce_subscription_invoices")),
  appliedAmount: v.number(),
  appliedAt: v.number(),
  context: v.union(
    v.literal("order"),
    v.literal("subscription_initial"),
    v.literal("subscription_renewal"),
  ),
  createdAt: v.number(),
})
  .index("by_discount", ["discountId"])
  .index("by_user", ["userId"])
  .index("by_email", ["customerEmail"])
  .index("by_order", ["orderId"])
  .index("by_subscription", ["subscriptionId"])
  .index("by_applied_at", ["appliedAt"]);
```

---

## 3. Functions

### 3.1 Exists
- `commerce.discounts.list / getById / create / update / toggleStatus`
- `commerce.discounts.applyToCart / removeFromCart`
- `commerce.discountEngine.*` — pure helpers for applicability evaluation

### 3.2 New
- `commerce.discounts.remove` (hard delete — missing today)
- `commerce.discounts.listUsages(discountId)`
- `commerce.discounts.listAutomatic` + `evaluateAutomatic(cartContext)`
- `commerce.discounts.actions.mirrorToStripe` — Node action
- `commerce.discounts.internals.recordUsage` — history write at finalize
- `commerce.discounts.internals.expireCodes` — daily cron

### 3.3 Capabilities

Replace broad `manage_options` with dedicated:
- `commerce.discount.view`
- `commerce.discount.create`
- `commerce.discount.update`
- `commerce.discount.delete`
- `commerce.discount.apply` (granted to Subscriber + guests — customer-facing)

---

## 4. Admin UI

### 4.1 Exists
- `/commerce/discounts` — single-page list with inline create + toggle.

### 4.2 New
- Full list table with search + filter by status / type / expiry
- Dedicated edit route `/commerce/discounts/$id/edit`
- Usage history panel on the detail view
- "Automatic discounts" tab with condition builders
- Stripe mirror status indicator (synced / error / disabled)

---

## 5. Events

- `discount.created / updated / deleted / toggled`
- `discount.applied` at cart.apply
- `discount.removed` at cart.remove
- `discount.redeemed` at order finalize
- `discount.usage_limit_hit`
- `discount.expired` from daily cron

---

## 6. Integration points

### Cart
`cart.apply(code)` runs the engine against current cart state, stores the code on `commerce_carts.discountCodes` (array; single-element when `individualUse`), sets `commerce_carts.discountAmount`.

### Checkout
Re-validates every code at finalize (catches price/availability changes mid-flight). Writes per-code usage rows via `internals.recordUsage` inside the finalize mutation.

### Subscriptions
Invoices honor codes with `appliesTo: "recurring"` or `"both"` on every renewal. The existing `helpers/coupons.ts` module in `commerceSubscriptions` folds into the unified engine so one codebase serves both.

### Stripe mirror
Every create/update schedules `actions.mirrorToStripe` which calls `stripe.coupons.create|update` and `stripe.promotionCodes.create`. Stores resulting IDs on the record. Hosted-checkout sessions pass `allow_promotion_codes: true`.

### WordPress sync
`wordpressSync/phases/commerceTransactions.ts` currently drops several Woo coupon fields (product_ids exclude list, usage_limit_per_user, individual_use, free_shipping, minimum_amount, maximum_amount). Importer rewrite lands all of them losslessly, round-tripping anything unmapped to `rawSourceMeta`.

---

## 7. Acceptance criteria

### 7.1 Existing (must not regress)
- [x] CRUD for codes with three types
- [x] Min subtotal / min quantity enforcement
- [x] Product / category include + exclude
- [x] Tiered pricing
- [x] Cart apply / remove
- [x] Start / end date windows

### 7.2 Wave 11 new
- [ ] Fourth type `free_shipping` suppresses shipping line via Shipping Rules Engine
- [ ] `individualUse` enforcement (single-code-per-cart)
- [ ] `excludeSaleItems` filter
- [ ] `allowedEmails` + `newCustomersOnly`
- [ ] `perUserUsageLimit` via history-table join
- [ ] `maximumSubtotalAmount` gate
- [ ] `commerce_discount_usages` history table + write at order finalize
- [ ] `auto: true` + `autoConditions` — cart evaluates automatic discounts on every update
- [ ] Stripe coupon + promotion_code mirror Node action
- [ ] Hard-delete mutation with capability gate
- [ ] Dedicated admin edit route with all fields
- [ ] Usage history panel
- [ ] WordPress importer round-trips all Woo coupon fields
- [ ] Daily cron expires past-`endsAt` codes + emits `discount.expired`
- [ ] Dedicated `commerce.discount.*` capabilities replace `manage_options`

---

## 8. Seed defaults

New ConvexPress sites come pre-seeded with illustrative inactive codes:
- `WELCOME10` — 10% off first order, new customers only
- `FREESHIP50` — free shipping on orders ≥ $50
- `SAVE20` — $20 off orders ≥ $100

Admins toggle active + tune.

---

## 9. Definition of Done

1. All §7.2 checkboxes ticked.
2. `commerce.discount.*` capabilities wired; no broad `manage_options` left.
3. Admin edit route shows + edits every field.
4. Hosted Stripe session accepts codes created in ConvexPress (manual test, Stripe test account).
5. WordPress importer → export round-trip on a sample of 20 Woo coupons produces zero field drift.
6. Usage history panel shows accurate `usageCount`, `appliedAmount` totals, per-user breakdown.
7. Test suite adds: individualUse, newCustomersOnly, perUserUsageLimit, expiry cron, Stripe mirror error fallback.

---

## 10. References

- Current code: `commerce/discounts.ts`, `commerce/discountEngine.ts`
- Schema: `schema/commerce.ts:commerce_discount_codes`
- Admin UI: `apps/web/src/routes/.../commerce/discounts.tsx`
- Audit backlog: `.codex/audit-backlog/system-audit-gaps.md` §Discount System
- Sibling PRDs: `cart-system`, `checkout-system`, `tax-system`, `order-system`, `customer-system`, `subscription-system`, `payment-system`
- Airtable: `appqpJ8QQkoKsH02O` / Systems / `recfLI9oTU3wOx9Je`
