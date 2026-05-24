# Wave 11 — Tax + Discount + Returns — Acceptance Report

**Date:** 2026-04-22
**Plan:** `plans/superpowers/2026-04-22-wave-11-tax-discount-returns.md`
**Deployment:** `amiable-mongoose-989.convex.cloud`
**Deploy flag:** `bunx convex deploy` — **full typecheck enabled**, no `--typecheck=disable`.

---

## Shipped

### 11.1 Tax System — schema + engine

- **Schema** (`convex/schema/commerce.ts`):
  - `commerce_tax_classes` — managed tax-class list (`code`, `label`, `description`, `isDefault`), with `by_code` + `by_default` indexes.
  - `commerce_order_tax_lines` — per-jurisdiction tax breakdown written at checkout finalize, with `by_order` / `by_order_item` / `by_rule` indexes.
  - `commerce_tax_rate_history` — rate-change audit log with `by_rule` + `by_changed_at` indexes.
  - `commerce_tax_rules` — new `by_tax_class` index for efficient class-filtered lookup.
  - `commerce_products.isTaxable` + `commerce_product_variants.isTaxable` fields.
- **Schema** (`convex/schema/users.ts`):
  - `users.isTaxExempt`, `taxExemptId`, `taxExemptReason`, `taxExemptVerifiedAt`.
- **Settings** (`convex/settings/defaults.ts:CommercePaymentsSettings`):
  - `taxProviderMode: "rules" | "stripe"` (default `"rules"`).
  - `shippingTaxClass: string` (default `""` = no shipping tax).
- **Tax Classes CRUD** — new `convex/commerce/taxClasses.ts` with `list`, `getByCode`, `create`, `update`, `remove` (guards default class), `seedDefaults` (seeds standard / reduced-rate / zero-rate).
- **`@ts-nocheck` removal** — dropped from `convex/commerce/tax.ts`; scoped `@ts-expect-error TS2589` suppressions added at the Convex generated-API recursion sites.

### 11.2 Discount System — schema + parity

- **Schema** (`convex/schema/commerce.ts:commerce_discount_codes`):
  - 4th `discountType` literal: `"free_shipping"`.
  - New fields: `maximumSubtotalAmount`, `allowedEmails`, `newCustomersOnly`, `individualUse`, `excludeSaleItems`, `perUserUsageLimit`, `appliesTo` (`"initial" | "recurring" | "both"`), `auto`, `autoConditions`, `stripeCouponId`, `stripePromotionCodeId`.
  - New indexes: `by_auto`, `by_stripe_coupon`.
- **Schema** (new): `commerce_discount_usages` — audit trail for every code application with user/email/order/subscription/invoice joins + context classification + `by_applied_at` sort index.

### 11.3 Returns & Refunds — reasons + store credit

- **Schema** (`convex/schema/commerceReturns.ts`):
  - `commerce_return_reasons` — managed taxonomy (code, label, `requiresPhoto`, `requiresRestock`, sort order), indexed by code + active.
  - `commerce_store_credit_ledger` — signed-amount ledger with `balanceAfter` per row; indexed by user + source return + expiration.
- **Reason CRUD** — `convex/commerceReturns/reasons.ts` with `list` / `getByCode` / `create` / `update` / `remove` + `seedDefaults` (6 reasons: defective / wrong_item / changed_mind / not_as_described / quality / other).
- **Store-credit ledger** — `convex/commerceReturns/storeCredit.ts` with:
  - `getBalance(userId)`, `listLedger(userId, limit)` — public queries.
  - `issue` (admin — credit a customer from a return or order), `redeem` (called from cart/checkout finalize), `adjust` (admin manual +/-), `expireExpired` (internal, cron-ready).
  - Latest-entry pattern: `balance === latest.balanceAfter`.

---

## Artifacts

```bash
git log --oneline wave-11~4..wave-11
# de7ecec docs(plan): Wave 11 — Tax + Discount + Returns commerce hardening
# 6dee9ec feat(tax): Wave 11.1 — managed tax classes, per-line tax, rate history, isTaxable, isTaxExempt
# 84607fd feat(discount): Wave 11.2 schema — free_shipping type, new parity fields, commerce_discount_usages
# <commit>  feat(returns): Wave 11.3 — reason taxonomy + store-credit ledger
```

---

## Verification

### Typecheck
- `bunx tsc --noEmit -p convex/tsconfig.json` → **0 errors**
- `bunx convex deploy` → passes with full typecheck; schema validation clean; all new indexes added

### Tests
- `bun test convex/commerce/ convex/commerceReturns/ convex/commerceSubscriptions/ convex/membership/ convex/helpers/__tests__/`
- **598 pass** / 1 fail — the 1 failure is the pre-existing `dashboard.test.ts` (Wave 7 Known Limitation #4, unrelated).

### Deploy
- **Environment:** prod
- **Deployment:** `amiable-mongoose-989.convex.cloud`
- **Result:** ✅ Schema validation passed; all functions pushed; new indexes added:
  - `commerce_tax_rules.by_tax_class`
  - `commerce_tax_classes.by_code` + `.by_default`
  - `commerce_order_tax_lines.by_order` + `.by_order_item` + `.by_rule`
  - `commerce_tax_rate_history.by_rule` + `.by_changed_at`
  - `commerce_discount_codes.by_auto` + `.by_stripe_coupon`
  - `commerce_discount_usages.by_discount` + `.by_user` + `.by_email` + `.by_order` + `.by_subscription` + `.by_applied_at`
  - `commerce_return_reasons.by_code` + `.by_active`
  - `commerce_store_credit_ledger.by_user` + `.by_return` + `.by_expires_at`

---

## Deferred to Wave 11.5 (explicit scope cut)

Per the plan, these were intentionally not shipped in this pass:

- **Stripe Tax provider integration** — the `taxProviderMode: "stripe"` path is defined in settings but the `calculateViaStripe` action is not yet built. The existing rules engine remains the only live path. Adding it is a focused follow-up.
- **Discount engine enforcement for new fields** — `individualUse`, `excludeSaleItems`, `newCustomersOnly`, `perUserUsageLimit` are schema fields + indexed, but the `discountEngine.ts` matcher + enforcement checks haven't been extended yet. Current apply-to-cart flow ignores them.
- **Stripe coupon/promotion_code mirror action** — schema fields + indexes in place; mirror Node action pending.
- **Per-line tax writing at checkout finalize** — `commerce_order_tax_lines` table exists but the hook in `checkout.ts:finalize` that writes rows isn't wired yet.
- **WordPress importer expansion** — logged as per-PRD follow-up.
- **Admin UIs** — tax-classes CRUD route, reason-taxonomy CRUD route, store-credit ledger view, dunning/discount usage dashboards are all deferred to Wave 11.5 UI polish.
- **Auto-discount engine** — `auto: true` + `autoConditions` storage is ready; the cart-time evaluator is deferred.
- **Dedicated `commerce.discount.*` / `commerce.returns.*` / `commerce.tax.*` capabilities** — current mutations still gate on `manage_options`. Capability split is deferred.
- **Daily crons** — discount expiry + store-credit expiration cron registration in `crons.ts` deferred (the mutations are cron-ready; they're just not yet scheduled).

---

## Definition of Done — Wave 11 core

1. [x] All Wave-11 schema additions deployed.
2. [x] Full typecheck passes (zero `--typecheck=disable`).
3. [x] Convex deploy succeeds with new indexes.
4. [x] Test suite green (modulo pre-existing unrelated failure).
5. [x] `@ts-nocheck` removed from `commerce/tax.ts`.
6. [x] Tax class + return reason + store credit CRUD surfaces exist as backend functions.

---

## Next action options

1. **Wave 11.5 admin UIs** — tax classes route, reason taxonomy route, store-credit view, discount detail/edit route.
2. **Wave 11.6 Stripe Tax integration** — `taxProviderMode: "stripe"` action + fallback.
3. **Wave 11.7 Discount enforcement** — wire the new schema fields into `discountEngine.ts` + cart apply.

Recommended sequence: 11.7 → 11.5 → 11.6. Enforcement must precede UIs (admins can't configure what the engine doesn't honor); Stripe Tax is optional provider polish.
