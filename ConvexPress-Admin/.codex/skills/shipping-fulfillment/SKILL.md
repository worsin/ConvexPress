---
name: shipping-fulfillment
description: Use when the user asks to create, audit, debug, or improve ConvexPress shipping zones, methods, rates, rules, classes, packages, ship-from locations, provider integrations, labels, manifests, tracking, fulfillment, shipping settings, or carrier credential flows.
---

# shipping-fulfillment

Use this for fulfillment and carrier work. Shipping affects checkout pricing,
orders, Purchase Core, provider credentials, labels, manifests, tracking, and
customer notifications.

## System Map

- Admin routes:
  - `apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping*`
  - `commerce/shipping.manifests.tsx`
  - `commerce/shipping.tracking.tsx`
  - `settings/integrations.shipping*.tsx`
- Backend: `packages/backend/convex/shipping/` and shipping provider domains.
- Specs: `specs/ConvexPress/systems/shipping-*`
- Purchase/order consumers: commerce checkout, order detail, labels/tracking,
  notifications.
- Website consumers: checkout shipping step, dashboard order tracking, public
  tracking route.

## Workflow

1. Identify subsystem: locations, classes, packages, zones, methods, rules, live
   rates, labels, manifests, tracking, provider settings, or checkout display.
2. Trace pricing from cart/order context through rate calculation to checkout UI.
3. Preserve provider abstraction boundaries; do not hardcode carrier-specific
   logic into shared checkout components.
4. For labels/manifests/tracking, verify idempotency, stale quote handling,
   void/reprint behavior, and notification events.
5. Treat live carrier calls as provider-dependent; use sandbox/test credentials
   if available and state gaps clearly.
6. For checkout/customer UI, also use `website-commerce-experience`.

## Verification

Run focused shipping/provider tests where present plus backend typecheck:

```bash
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

Smoke shipping settings, checkout shipping, order label/tracking route when UI
changes.

## Report

List shipping subsystem, provider impact, checkout/order effects, notification
effects, and verification.
