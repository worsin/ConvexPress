---
name: website-commerce-experience
description: Use when the user asks to build, audit, debug, redesign, or improve public commerce pages: product catalog, product detail, cart, checkout, order confirmation, customer orders, subscriptions, wishlist, returns, tracking, or purchase/payment UX on the ConvexPress Website.
---

# website-commerce-experience

Use this for public shopping and customer order flows. The Admin backend owns
commerce data and Purchase Core; Website is the consumer.

## System Map

- Catalog/product:
  - `apps/web/src/routes/_marketing/products*`
  - `apps/web/src/routes/_marketing/shop.tsx`
  - `apps/web/src/routes/_marketing/bundles*`
- Cart/checkout:
  - `apps/web/src/routes/_marketing/cart*`
  - `apps/web/src/routes/_marketing/checkout/**`
- Customer account:
  - `apps/web/src/routes/dashboard/orders*`
  - `apps/web/src/routes/dashboard/subscriptions*`
  - `apps/web/src/routes/dashboard/returns*`
  - `apps/web/src/routes/dashboard/wishlist.tsx`
- Backend owner:
  - `../ConvexPress-Admin/packages/backend/convex/commerce*/`
  - `../ConvexPress-Admin/packages/backend/convex/purchases/`
  - `../ConvexPress-Admin/packages/backend/convex/shipping/`

## Workflow

1. Identify flow: browse, configure product, cart, checkout shipping/payment,
   order confirmation, dashboard order detail, return, subscription, or wishlist.
2. Trace UI state to backend queries/mutations and Purchase Core.
3. Preserve price math, variants/attributes, stock, discounts, tax, shipping,
   payment state, and idempotency.
4. Cart/checkout changes must show loading/error/empty states and avoid layout
   shift on mobile.
5. Customer order views should handle storefront, form, and subscription
   purchases when using Purchase Core.
6. For visual redesign, also follow the matching `design-catalog` or
   `design-single-product` skill.

## Verification

Run Website typecheck/build and focused backend tests when contracts change:

```bash
bun run check-types
bun run build
```

Browser-smoke product detail, cart, checkout, and dashboard order detail for UI
changes.

## Report

List flow, backend contracts, money/provider risks, Purchase Core impact, and
verification.
