# Claude Execution Brief

Date: 2026-04-09
Project: `ConvexPress`
Reference Source: `/Users/worsin/Development/VexCart`
Primary Goal: bring ConvexPress commerce functionality to practical parity with the relevant commerce systems in VexCart without migrating or modifying VexCart itself

## Mission

You are continuing a carry-over program from `VexCart` into `ConvexPress`.

This is not a migration of VexCart.

Do not rewrite VexCart. Do not move VexCart. Do not break VexCart.

Treat VexCart as the source implementation reference and ConvexPress as the destination plugin platform.

Your job is to systematically close the functional gaps between:

- `VexCart`
- the ConvexPress commerce plugin suite

while preserving ConvexPress architecture:

- `ConvexPress-Admin/` owns schema, backend logic, settings, capabilities, admin UI
- `ConvexPress-Website/` consumes public query surfaces and renders storefront/customer experiences
- commerce systems must be plugin-gated
- extension plugins must not redefine the core commerce foundation

## Important Operating Rules

### 1. Preserve system boundaries

Do not collapse everything into one giant commerce blob.

Keep this split:

- `commerce`
- `commerceSubscriptions`
- `membership`
- later extension plugins:
  - `commerceDigital`
  - `commerceReviews`
  - `commerceWishlists`
  - `commerceBundles`
  - `commerceReturns`
  - optional later `commerceFulfillment`

### 2. VexCart is the feature reference, not the architecture template

You should extract feature parity from VexCart, but not copy its structure blindly.

ConvexPress already has different and better boundaries in some areas, especially:

- plugin gating
- admin vs website ownership
- shared shipping infrastructure
- support and KB being split out from commerce

### 3. Prefer code reality over planning docs

Use the docs as intent, but treat the live codebase as truth when they diverge.

### 4. Do not count placeholder screens as implemented

If a route exists but only renders explanatory text, it is not implemented.

### 5. Finish runtime before adding more empty shells

The biggest current risk is surface-area inflation:

### 6. Integration layers are not plugins

Do not add plugin manager toggles for:
- shipping provider adapters
- support bridge / ticket-KB integration
- payment provider adapters
- import/sync tooling (WooSync, WordPress sync)
- subscription-to-membership bridges
- any cross-plugin interoperability layer

If both parent systems are enabled, their integration should just work automatically.

Shipping is a subsystem of commerce, configured through settings/integrations.
Support is runtime logic guarded by tickets + KB enablement.
WooSync is admin-only import tooling under commerce operations.

- schema exists
- routes exist
- plugin toggle exists
- but the actual business runtime is missing

Do not keep adding shells without operational behavior.

## Current Reality Summary

ConvexPress has already made meaningful progress.

### Already materially present

- `commerce` plugin registration
- `commerceSubscriptions` plugin registration
- `membership` plugin registration
- core commerce schema
- subscription schema
- membership schema
- backend modules for:
  - products
  - categories
  - cart
  - checkout
  - orders
  - customers
  - discounts
- website storefront routes for:
  - products
  - product detail
  - cart
  - checkout
  - order history
- shipping provider and quote infrastructure

### Still materially incomplete

- payments runtime
- inventory runtime
- tax runtime
- customer account depth
- subscriptions runtime
- digital products/downloads/licenses
- wishlists
- reviews
- bundles
- returns
- fulfillment operations
- shipping CRUD and operations UI

## Source of Truth Files

### ConvexPress current implementation

- [registry.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts)
- [commerce.ts schema](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/schema/commerce.ts)
- [commerceSubscriptions.ts schema](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts)
- [membership.ts schema](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/schema/membership.ts)
- [shipping.ts schema](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/schema/shipping.ts)
- [products.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/products.ts)
- [orders.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/orders.ts)
- [cart.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/cart.ts)
- [checkout.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts)
- [customers.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/commerce/customers.ts)
- [settings.shipping.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.tsx)
- [settings.shipping.zones.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.zones.tsx)
- [settings.shipping.packages.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.packages.tsx)
- [settings.shipping.rules.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.rules.tsx)
- [subscriptions admin placeholder](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/index.tsx)
- [subscriptions website placeholder](/Users/worsin/Development/ConvexPress/ConvexPress-Website/apps/web/src/routes/dashboard/subscriptions.tsx)
- [products storefront](/Users/worsin/Development/ConvexPress/ConvexPress-Website/apps/web/src/routes/_marketing/products/index.tsx)

### VexCart reference implementation

- [schema.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/schema.ts)
- [products.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/products.ts)
- [categories.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/categories.ts)
- [cart.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/cart.ts)
- [checkout.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/checkout.ts)
- [orders.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/orders.ts)
- [customers.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/customers.ts)
- [payments.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/payments.ts)
- [inventory.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/inventory.ts)
- [shipping.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/shipping.ts)
- [shippingZones.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/shippingZones.ts)
- [shippingRates.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/shippingRates.ts)
- [shippingClasses.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/shippingClasses.ts)
- [shippingPackages.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/shippingPackages.ts)
- [shippingCarriers.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/shippingCarriers.ts)
- [tax.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/tax.ts)
- [subscriptions.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/subscriptions.ts)
- [digitalProducts.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/digitalProducts.ts)
- [wishlists.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/wishlists.ts)
- [reviews.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/reviews.ts)
- [bundles.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/bundles.ts)
- [returns.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/returns.ts)
- [fulfillment.ts](/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex/fulfillment.ts)
- [downloads dashboard](/Users/worsin/Development/VexCart/VexCart-Website/apps/web/src/routes/_dashboard/downloads.tsx)
- [wishlist dashboard](/Users/worsin/Development/VexCart/VexCart-Website/apps/web/src/routes/_dashboard/wishlist.tsx)

## What Is Missing, In Detail

## A. Commerce Core Gaps

### A1. Payments runtime is missing

ConvexPress currently has payment transaction and refund tables in schema, but it does not have a dedicated commerce payments backend equivalent to VexCart.

VexCart supports:

- public payment settings retrieval
- available payment methods
- saved payment methods
- transaction listing and inspection
- Stripe payment intents
- PayPal order creation
- refund processing
- provider webhook handling
- provider-specific internal actions

ConvexPress still needs:

- `ConvexPress-Admin/packages/backend/convex/commerce/payments.ts`
- provider-agnostic payment abstraction
- payment settings persistence and admin management
- optional saved payment methods if desired for parity
- webhook ingestion and idempotency strategy
- checkout integration with payment authorization/capture
- admin payments visibility

### A2. Inventory runtime is missing

ConvexPress currently records inventory adjustments and stock reservations, but lacks the operational inventory module VexCart already has.

VexCart supports:

- availability checks
- fulfillment checks
- low stock queries
- out of stock queries
- inventory history
- active reservations
- alerting
- bulk adjustment flows
- reservation release/commit lifecycle

ConvexPress still needs:

- `ConvexPress-Admin/packages/backend/convex/commerce/inventory.ts`
- low stock and out of stock reporting
- reservation lifecycle management beyond checkout completion
- bulk inventory management
- inventory admin screens
- alert generation or dashboard surfacing

### A3. Tax runtime is missing

ConvexPress has `commerce_tax_rules` in schema but does not yet have a dedicated runtime equivalent to VexCart's tax system.

Needed:

- `ConvexPress-Admin/packages/backend/convex/commerce/tax.ts`
- CRUD for tax rules
- tax calculation queries for checkout
- tax admin screens
- shipping tax interaction rules where required

### A4. Customer runtime is too thin

Current `customers.ts` in ConvexPress only exposes a simple admin list and `getMine`.

VexCart customer functionality is far deeper:

- richer customer profile retrieval
- addresses
- customer order relationships
- customer segmentation and stats
- saved payment methods
- broader account data surfaces

ConvexPress still needs:

- real customer detail queries
- address management flows
- account preferences where commerce depends on them
- richer admin customer detail and editing
- linkage to subscriptions, downloads, returns, and support context

### A5. Product runtime is only partial parity

ConvexPress products are real, but much smaller than VexCart.

VexCart product runtime includes:

- status counts
- search
- featured and on-sale queries
- archive/restore/delete/bulk actions
- option type and option value CRUD
- variant CRUD and auto-generation
- view tracking
- recommendation/search extensions
- review aggregate updates
- stock updates

ConvexPress still needs to evaluate and likely add:

- richer product search and filtering
- variant authoring depth
- bulk actions
- stock editing workflows
- merchandising helpers like featured/on-sale queries if desired
- recommendation hooks only if they belong in ConvexPress scope

## B. Shipping Gaps

Shipping is the most nuanced area.

### B1. Shipping backend is structurally ahead, but operationally incomplete

ConvexPress already has:

- provider connection schema
- provider accounts
- provider services
- shipping profiles
- shipping packages
- shipping zones
- zone methods
- rate quote storage
- shipment-related order operations
- shipping actions/internals with real provider logic scaffolding

This means shipping is not absent.

However, it is still incomplete versus VexCart because VexCart also has:

- shipping zone locations
- class-based surcharges
- table rates
- weight tiers
- package packing results
- shipping labels
- tracking events
- address validation cache
- shipping manifests
- shipping cost analytics
- richer fulfillment queue integration

### B2. Shipping admin screens are still placeholder-level

These current ConvexPress routes are placeholders:

- [settings.shipping.zones.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.zones.tsx)
- [settings.shipping.packages.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.packages.tsx)
- [settings.shipping.rules.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.rules.tsx)

These must become real CRUD and operations pages.

### B3. Shipping conclusion

Do not restart shipping from scratch.

Instead:

- audit and preserve the existing shared shipping architecture
- wire it into commerce workflows properly
- build missing CRUD and operations UI
- add the missing operational tables and runtime where parity requires them

## C. Subscriptions Gaps

Subscriptions are the highest-risk false-positive area because they look mature in schema but are not operational.

### C1. What already exists

ConvexPress has a strong subscription schema:

- templates
- product overrides
- subscriptions
- subscription items
- invoices
- invoice items
- history
- entitlements
- dunning attempts
- idempotency keys

### C2. What is actually missing

ConvexPress does not yet have the runtime equivalent of VexCart's subscription engine:

- no `products.ts` subscription-aware runtime
- no `subscriptions.ts`
- no `invoices.ts`
- no `entitlements.ts`
- no `dunning.ts`
- no renewal scheduler/runtime
- no real admin subscription management UI
- no real customer subscription dashboard
- no checkout integration that creates and maintains subscriptions

### C3. Placeholder evidence

These pages explicitly state the runtime is not connected yet:

- [subscriptions/index.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/index.tsx)
- [dashboard/subscriptions.tsx](/Users/worsin/Development/ConvexPress/ConvexPress-Website/apps/web/src/routes/dashboard/subscriptions.tsx)

### C4. Required outcome

Subscriptions should become a real operational plugin, not just a schema package.

## D. Digital Commerce Gaps

This is currently absent in ConvexPress.

VexCart digital commerce includes:

- digital file upload/management
- versioning
- previewability flags
- download tokens
- download logs
- license keys
- license activations
- customer downloads dashboard

ConvexPress needs a full `commerceDigital` plugin with:

- plugin registration
- plugin setting
- schema
- backend runtime
- admin file management
- customer downloads page
- optional license key management for parity

## E. Wishlist Gaps

This is currently absent in ConvexPress.

VexCart wishlist system includes:

- multiple wishlists
- shared/public wishlist behavior
- guest merge
- move to cart
- analytics and activity
- dashboard UX

ConvexPress needs a `commerceWishlists` plugin with:

- schema
- backend runtime
- public/shared route if desired
- customer dashboard route
- add-to-wishlist integration on product surfaces

## F. Reviews Gaps

This is currently absent in ConvexPress.

VexCart review system includes:

- review items
- helpful votes
- moderation/admin review route
- customer dashboard review route
- product aggregate integration

ConvexPress needs a `commerceReviews` plugin with:

- schema
- backend runtime
- moderation/admin UI
- product detail integration
- aggregate update flow

## G. Bundles Gaps

This is currently absent in ConvexPress.

VexCart bundle system includes:

- bundles
- bundle components
- bundle selections
- component ordering
- bundle pricing calculation
- availability checks
- admin routes

ConvexPress needs a `commerceBundles` plugin with:

- schema
- backend runtime
- admin authoring UI
- cart and checkout integration

## H. Returns Gaps

This is currently absent in ConvexPress.

VexCart returns include:

- return requests
- statuses and lifecycle
- order linkage
- admin returns route
- return labels

ConvexPress needs a `commerceReturns` plugin with:

- schema
- backend runtime
- admin return management
- customer return initiation and tracking
- refund interaction with core payments/orders

## I. Fulfillment Gaps

This can remain later-stage, but parity-wise VexCart has a real fulfillment system.

VexCart includes:

- fulfillment orders
- assignments
- ship-by dates
- manifest generation
- return labels
- shipping cost records
- analytics

ConvexPress currently has partial overlap through shipments and shipping providers, but not full fulfillment operations.

Decide whether to:

- create `commerceFulfillment`, or
- phase fulfillment in under shipping operations first

Do not ignore the gap just because shipping exists.

## J. Plugin Registry Gaps

The current registry includes:

- `commerce`
- `commerceSubscriptions`
- `membership`
- `knowledgeBase`
- `tickets`
- `customFields`
- `recipes`
- `gallery`

It does **not** yet include the remaining VexCart-derived commerce plugins:

- `commerceDigital`
- `commerceReviews`
- `commerceWishlists`
- `commerceBundles`
- `commerceReturns`

You should add them only when there is at least real backend/schema progress, not merely as empty future shells unless there is a clear dependency reason.

## Required Execution Order

## Phase 1: Finish `commerce` operational parity

Do this first.

### Tasks

1. Build `commerce/payments.ts`
2. Build `commerce/inventory.ts`
3. Build `commerce/tax.ts`
4. Expand `commerce/customers.ts`
5. Audit and complete product variant and product-management parity where still missing
6. Audit order-payment-shipment interactions end to end

### Acceptance criteria

- checkout can create, authorize, and record payment states correctly
- admin can inspect payments
- inventory can be adjusted, reserved, released, and reported
- tax rules can be managed and used in checkout totals
- customer detail views are meaningful and useful

## Phase 2: Finish shipping operations

Do not rewrite shipping. Complete it.

### Tasks

1. Audit existing `shipping/*` backend modules
2. Build real CRUD for:
   - zones
   - packages
   - zone methods/rules
3. Validate quote generation and checkout integration
4. Validate shipment creation and tracking update flows
5. Decide what remaining VexCart shipping constructs must exist in ConvexPress:
   - labels
   - tracking events
   - manifests
   - cost records
   - packing results

### Acceptance criteria

- admin can manage shipping destinations and methods
- checkout can choose real shipping options
- orders can progress through shipment states cleanly

## Phase 3: Finish `commerceSubscriptions`

This is the next major dependency.

### Tasks

1. Create real subscription backend modules
2. Integrate subscription product purchase mode into checkout
3. Create subscription creation flow from qualifying orders
4. Add invoice and dunning runtime
5. Add entitlement synchronization hooks
6. Replace placeholder admin and website subscription pages with working screens

### Acceptance criteria

- subscription products can be purchased
- subscriptions are created from orders
- renewal lifecycle is represented in runtime
- admin can inspect/manage subscriptions
- customers can view their subscriptions and billing state

## Phase 4: Build customer account commerce parity

After core + shipping + subscriptions are reliable, close the customer experience gap.

### Tasks

1. audit current dashboard commerce surfaces
2. add missing customer account capabilities in priority order:
   - downloads
   - wishlist
   - reviews
3. improve account data cohesion across:
   - orders
   - subscriptions
   - membership
   - support

### Acceptance criteria

- customer dashboard feels like a real commerce account area rather than a partial prototype

## Phase 5: Add extension plugins

Build in this order unless code dependencies force a different sequence:

1. `commerceDigital`
2. `commerceReviews`
3. `commerceWishlists`
4. `commerceBundles`
5. `commerceReturns`

`commerceFulfillment` can be later.

## Detailed Build Expectations Per Plugin

For each new plugin, do not stop at schema.

Each plugin must include:

1. plugin registration
2. plugin settings keys and validation
3. schema
4. backend runtime
5. admin navigation
6. admin routes
7. admin UI
8. website/customer routes if applicable
9. plugin gating
10. capabilities and permission checks
11. event hooks where needed
12. test coverage or at minimum verification plan

## Specific Warnings

### Warning 1: Do not over-credit existing schema

If schema exists without operational runtime, treat it as incomplete.

### Warning 2: Do not bury payment or inventory inside ad hoc order logic

They should be explicit domains with clear responsibilities.

### Warning 3: Do not copy VexCart’s support system into commerce

ConvexPress already has separate `tickets` and `support` domains. Keep them separate.

### Warning 4: Do not let membership absorb subscription logic

Membership is not the recurring billing engine.

### Warning 5: Do not create plugin shells without a delivery plan

Only add plugin shells if they unlock real implementation work immediately.

## Suggested Immediate Task List

If you are starting work now, do these first:

1. Audit `commerce` backend against VexCart modules and implement the missing domains:
   - payments
   - inventory
   - tax
2. Audit shipping and convert the placeholder shipping pages into real CRUD
3. Build `commerceSubscriptions` runtime and replace placeholder subscription pages
4. Only after that, start `commerceDigital`

## Output Standard

For every implementation slice, report back with:

- what VexCart feature was targeted
- what ConvexPress files were added or changed
- what runtime is now functional
- what is still missing in that slice
- what the next dependency is

## Bottom Line

ConvexPress has already absorbed part of VexCart commerce, but only the foundation.

The carry-over is not finished until ConvexPress has:

- real operational `commerce`
- real operational `commerceSubscriptions`
- completed shipping operations
- customer account parity for the relevant commerce extensions
- the missing extension plugins brought over in a disciplined way

Do not drift into planning-only mode. Close runtime gaps first.
