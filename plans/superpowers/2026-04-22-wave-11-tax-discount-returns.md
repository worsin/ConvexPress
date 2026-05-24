# Wave 11 — Tax + Discount + Returns Commerce Hardening

> **For agentic workers:** Pragmatic scope — schema expansions + backend functions + critical admin plumbing for the three commerce systems whose PRDs were written today. Full admin UIs + Stripe Tax provider are Wave 11.5 polish (deferred where not ship-critical).

**Goal:** Land the Wave-11 schema + backend surface for Tax System, Discount System, and Returns & Refunds System so they meet PRD expectations for core functionality.

**Architecture:** Three parallel sub-waves, deployed in sequence to Convex, full typecheck enabled throughout, each with its own commit.

**Non-goals for this run:**
- Stripe Tax provider integration (keep `taxProviderMode: "rules"` as the only operative mode for now; add the setting + stub the action).
- Full admin UI rewrites — we add the settings + capability plumbing and backend; heavy UI polish is a separate session.
- WooCommerce importer expansion for new coupon fields — logged as Wave 11 follow-up.

---

## Sub-wave map

| Sub-wave | Scope | Risk |
|---|---|---|
| 11.1 Tax schema + engine | `commerce_tax_classes` / `commerce_order_tax_lines` / `commerce_tax_rate_history` tables; `isTaxable` on products + variants; `isTaxExempt` on users; `shippingTaxClass` + `taxProviderMode` settings; `commerce.tax.*` capabilities; remove `@ts-nocheck`; tax class CRUD | Low (additive schema) |
| 11.2 Discount engine | New fields on `commerce_discount_codes` (`individualUse`, `excludeSaleItems`, `allowedEmails`, `newCustomersOnly`, `perUserUsageLimit`, `maximumSubtotalAmount`, `auto`, `autoConditions`, `stripeCouponId`, `stripePromotionCodeId`), add `free_shipping` type; `commerce_discount_usages` table; `commerce.discount.*` capabilities; hard-delete mutation; daily expiry cron | Low |
| 11.3 Returns & Refunds | `commerce_return_reasons` + `commerce_store_credit_ledger` tables; reason CRUD; store-credit issue/redeem/balance queries; refund-policy settings; `commerce.returns.*` capabilities | Low |
| 11.4 Deploy + verify | Full `bunx convex deploy` (no `--typecheck=disable`); full test suite pass | Low |

---

## 11.1 — Tax schema + engine

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts` — new tables + fields
- Modify: `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts` — `taxProviderMode`, `shippingTaxClass` settings
- Modify: `ConvexPress-Admin/packages/backend/convex/settings/validators.ts` — section union
- Modify: `ConvexPress-Admin/packages/backend/convex/settings/mutations.ts` — capability map
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/settings.ts` — section literal
- Create: `ConvexPress-Admin/packages/backend/convex/commerce/taxClasses.ts` — CRUD
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/tax.ts` — remove `@ts-nocheck`, add `commerce.tax.*` capability gates

## 11.2 — Discount engine

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts` — extend `commerce_discount_codes`, new `commerce_discount_usages`
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/discounts.ts` — new fields in mutations, hard delete, capability gates
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/discountEngine.ts` — enforcement for new fields
- Modify: `ConvexPress-Admin/packages/backend/convex/crons.ts` — daily expiry cron registration
- Modify: `ConvexPress-Admin/packages/backend/convex/commerce/cart.ts` / `checkout.ts` — emit `recordUsage` at finalize

## 11.3 — Returns & Refunds

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/commerceReturns.ts` — new `commerce_return_reasons` + `commerce_store_credit_ledger`
- Create: `ConvexPress-Admin/packages/backend/convex/commerceReturns/reasons.ts` — reason CRUD
- Create: `ConvexPress-Admin/packages/backend/convex/commerceReturns/storeCredit.ts` — ledger queries + mutations
- Modify: `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts` — `commerce.returns` settings section

## 11.4 — Deploy + verify

- `cd ConvexPress-Admin/packages/backend && bunx convex deploy`
- `bun test convex/` — full suite passes
- Schema validation passes on prod
- Commit each sub-wave as a single commit with scoped message
