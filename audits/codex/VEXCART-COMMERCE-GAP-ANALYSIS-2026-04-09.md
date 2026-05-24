# VexCart Commerce Gap Analysis

Date: 2026-04-09
Source: `/Users/worsin/Development/VexCart`
Target: `ConvexPress`

## Scope

This compares the commerce-related feature surface in `VexCart` against the current ConvexPress plugin implementation.

This is a carry-over audit, not a migration plan:

- VexCart remains standalone.
- ConvexPress should absorb the commerce capabilities that belong in its plugin suite.
- Adjacent non-commerce systems such as support and KB may already exist in ConvexPress, but they are not counted as commerce-plugin parity unless directly relevant.

## Executive Summary

ConvexPress has a real commerce foundation, but it is not yet at VexCart parity.

What is already materially present:

- commerce core schema
- products, categories, cart, checkout, orders, discounts
- website product archive/detail/cart/checkout/order history routes
- shipping provider groundwork and live-rate infrastructure
- subscription schema
- membership schema and admin/website surfaces

What is still clearly behind VexCart:

- payment runtime and payment settings
- inventory runtime and admin workflows
- customer account depth
- subscriptions runtime
- digital products/downloads/licenses
- wishlists
- reviews
- bundles
- returns
- fulfillment operations
- several shipping admin CRUD surfaces

## Current ConvexPress State

### Implemented foundation

- `commerce` plugin is registered.
- `commerceSubscriptions` and `membership` are registered.
- Commerce plugin settings exist.
- Commerce core schema exists.
- Subscription schema exists.
- Membership schema exists.

### Partially implemented areas

- shipping schema and provider integration are ahead of the original planning docs
- shipping admin CRUD is still scaffold-level in multiple routes
- subscriptions have schema only, with placeholder admin and website pages

### Missing plugin registrations from the original VexCart decomposition

The current registry does **not** include the planned VexCart-derived extension plugins:

- `commerceDigital`
- `commerceReviews`
- `commerceWishlists`
- `commerceBundles`
- `commerceReturns`

Note: `commerceWooSync` is intentionally excluded from this list. It is import/sync tooling, not a user-facing plugin with a toggle. Shipping provider adapters and the support bridge are also subsystems/integration layers, not plugins.

## Plugin-By-Plugin Gap Matrix

### `commerce`

Status: partial, meaningful progress

Present in ConvexPress:

- schema for products, categories, variants, carts, checkout sessions, customer profiles, addresses, orders, order items, order history, shipments, discounts, payment transactions, refunds, shipping methods, tax rules, inventory adjustments, stock reservations
- backend modules:
  - `products.ts`
  - `categories.ts`
  - `cart.ts`
  - `checkout.ts`
  - `orders.ts`
  - `customers.ts`
  - `discounts.ts`
- admin routes for products, categories, customers, orders, discounts, shipping settings
- website routes for products, cart, checkout, order history

Still missing or clearly behind VexCart:

- no dedicated `payments.ts` domain module in ConvexPress commerce
- no dedicated `inventory.ts` domain module in ConvexPress commerce
- no dedicated `shipping.ts` commerce runtime module analogous to VexCart's shipping module split
- no dedicated `tax.ts` domain module in ConvexPress commerce
- no saved payment methods model/runtime
- no payment settings model/runtime inside commerce
- customer runtime is minimal
- product runtime is much smaller than VexCart

Notes:

- VexCart backend exports 23 commerce modules at top level.
- ConvexPress commerce currently exposes 7 functional backend files plus helpers/validators.
- Shipping is partly rehomed into shared `shipping/*` modules instead of staying inside `commerce/*`, so shipping is only partially a gap and partially an architectural divergence.

### `commerceSubscriptions`

Status: schema present, runtime absent

Present in ConvexPress:

- strong schema coverage for templates, overrides, subscriptions, subscription items, invoices, invoice items, history, entitlements, dunning attempts, idempotency keys
- plugin registration
- plugin setting
- admin route shell
- website dashboard route shell

Missing versus VexCart:

- no `products.ts`, `subscriptions.ts`, `invoices.ts`, `entitlements.ts`, or `dunning.ts` backend modules
- no lifecycle mutations
- no renewal processing
- no customer portal runtime
- no admin management runtime
- no checkout integration for recurring purchases

### `membership`

Status: net-new ConvexPress domain, not a VexCart parity target

Present in ConvexPress:

- schema for plans, benefits, grants, restriction rules, access log
- admin routes
- website membership route

Interpretation:

- this is valuable and correctly separate from subscriptions
- it should not be counted as replacing VexCart subscriptions or digital commerce

### `commerceDigital`

Status: missing as plugin

VexCart has:

- digital files
- download tokens
- download log
- license keys
- license activations
- customer downloads dashboard

ConvexPress currently lacks:

- plugin registration
- schema
- backend runtime
- admin file management UI
- customer downloads route

### `commerceWishlists`

Status: missing as plugin

VexCart has:

- wishlists
- wishlist items
- guest merge
- sharing
- analytics
- customer dashboard wishlist UI

ConvexPress currently lacks:

- plugin registration
- schema
- backend runtime
- website wishlist routes
- admin analytics surface

### `commerceReviews`

Status: missing as plugin

VexCart has:

- review items
- helpful votes
- review aggregates integrated back into products
- admin moderation route
- dashboard reviews route

ConvexPress currently lacks:

- plugin registration
- review schema
- review backend runtime
- admin moderation UI
- customer review dashboard

### `commerceBundles`

Status: missing as plugin

VexCart has:

- bundles
- bundle components
- bundle selections
- pricing logic
- admin bundle routes

ConvexPress currently lacks:

- plugin registration
- schema
- backend runtime
- admin routes
- storefront bundle UX

### `commerceReturns`

Status: missing as plugin

VexCart has:

- return requests
- return labels
- refund-linked return flow
- admin returns route
- order return UI

ConvexPress currently lacks:

- plugin registration
- return schema
- backend runtime
- admin routes
- website return flows

### `commerceFulfillment`

Status: optional later, but VexCart already has it

VexCart has:

- fulfillment orders
- shipping manifests
- shipping labels
- tracking events
- shipping cost records
- package packing results

ConvexPress has partial overlap:

- order shipments
- provider integrations
- live quote storage
- provider accounts/services/secrets

Still missing:

- fulfillment queue model
- manifest model/runtime
- shipping cost analytics model/runtime
- return label model/runtime
- package packing result model/runtime

## Important Architectural Findings

### 1. ConvexPress is already decomposing VexCart correctly

The overall direction is right:

- core commerce separated from subscriptions
- support and KB split out from commerce
- plugin gating exists
- admin-owned backend boundary is preserved

This is not a failed port. It is a partially completed decomposition.

### 2. Shipping is farther along than the plugin checklist suggests

ConvexPress already has:

- shipping provider connection schema
- provider account/service schema
- quote storage
- live-rate action infrastructure
- shipment creation/tracking hooks

But the admin CRUD surface for zones, packages, and rules is still placeholder-level.

### 3. Subscriptions are the biggest "looks done but is not done" area

The schema is substantial, which makes the area look mature.

In practice, the runtime is still missing:

- admin page is placeholder
- website page is placeholder
- backend lifecycle modules are absent

### 4. Customer account parity is still far from VexCart

VexCart customer experience includes:

- orders
- subscriptions
- downloads
- wishlist
- reviews
- account management
- support

ConvexPress currently covers:

- orders
- subscriptions shell
- membership
- support/tickets

The account-side commerce extension surface is still incomplete.

## Suggested Build Order

### Priority 1

- finish `commerce` parity in backend:
  - payments
  - inventory
  - tax
  - customer runtime
- finish shipping CRUD and operational workflows
- finish `commerceSubscriptions` runtime

### Priority 2

- build `commerceDigital`
- build `commerceReviews`
- build `commerceWishlists`

### Priority 3

- build `commerceBundles`
- build `commerceReturns`

### Priority 4

- decide whether `commerceFulfillment` should remain a later plugin or be partially folded into shipping operations first

## Bottom Line

ConvexPress has already absorbed the **foundation** of VexCart commerce, but not the **full platform**.

The current state is best described as:

- core commerce: started and usable in parts
- subscriptions: modeled but not operational
- shipping: architecturally advanced but operationally incomplete
- account extensions: mostly still missing
- digital/wishlist/reviews/bundles/returns: not yet brought over

The next phase should focus on closing runtime gaps in `commerce` and `commerceSubscriptions` before adding more plugin shells.
