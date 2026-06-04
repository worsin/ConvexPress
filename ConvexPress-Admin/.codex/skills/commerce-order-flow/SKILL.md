---
name: commerce-order-flow
description: Use when the user asks to build, audit, debug, or improve products, cart, checkout, orders, payments, refunds, subscriptions, purchase ledger, form orders, order notifications, shipping/tax/discount pricing, or customer order dashboards in ConvexPress.
---

# commerce-order-flow

Use this for money-moving paths and order continuity. Treat Purchase Core as the
cross-system ledger for storefront, form, and subscription purchases.

## Read First

- `ConvexPress-Admin/AGENTS.md`
- `specs/prds/PRD-ORDER-MANAGEMENT.md`
- `specs/ConvexPress/systems/order-system/PRD.md`
- `specs/ConvexPress/systems/commerce-analytics-system/PRD.md`
- Relevant commerce PRDs under `specs/codex-prds/COMMERCE-*-PRD.md`

## System Map

- Storefront/admin commerce routes: `apps/web/src/routes/_authenticated/_admin/commerce/**`
- Public cart/checkout/orders:
  - `../ConvexPress-Website/apps/web/src/routes/_marketing/cart*`
  - `../ConvexPress-Website/apps/web/src/routes/_marketing/checkout/**`
  - `../ConvexPress-Website/apps/web/src/routes/dashboard/orders*`
- Purchase Core:
  - `packages/backend/convex/schema/purchases.ts`
  - `packages/backend/convex/purchases/internals.ts`
  - `packages/backend/convex/purchases/queries.ts`
  - `packages/backend/convex/purchases/migrations.ts`
- Commerce backend domains:
  - `packages/backend/convex/commerce*/`
  - `packages/backend/convex/productAttributes/`
  - `packages/backend/convex/shipping/`
  - `packages/backend/convex/tax*`
- Events: `PURCHASE_EVENTS` and commerce events in
  `packages/backend/convex/events/constants.ts`
- Notifications/email: `packages/backend/convex/notifications/validators.ts`,
  `packages/backend/convex/emails/registry.ts`

## Workflow

1. Identify source: storefront order, dynamic form order, subscription checkout,
   subscription invoice, refund, shipping label, or manual/admin order.
2. Follow the full path: UI action -> mutation/action -> payment/provider ->
   domain order row -> Purchase Core sync -> events -> notifications/emails ->
   customer/admin views.
3. Do not fork order storage casually. If a purchase can be paid, viewed,
   refunded, notified, or audited, make sure it syncs into Purchase Core.
4. Keep source-specific tables for their own operational details, but use
   Purchase Core for cross-source listing and customer order history.
5. For checkout changes, verify cart pricing, tax, shipping, discounts,
   inventory, payment intent state, idempotency, and return URL handling.
6. For subscription changes, verify entitlement/membership effects and invoice
   sync.
7. For notification changes, keep site notifications and email templates aligned
   to the event names.

## Verification

Prefer focused backend tests, then route smoke:

```bash
bun test packages/backend/convex/commerceSubscriptions/__tests__/*.test.ts packages/backend/convex/emails/__tests__/registry.test.ts packages/backend/convex/notificationEngine/__tests__/registry.test.ts
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

Add or run domain-specific commerce/form/shipping tests when touched. Browser
smoke `/commerce/orders`, `/dashboard/orders`, cart, and checkout when UI moves.

## Report

State which order source changed, whether Purchase Core sync was affected,
event/notification/email effects, provider/manual smoke gaps, and verification.
