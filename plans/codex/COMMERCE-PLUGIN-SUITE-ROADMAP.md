# Commerce Plugin Suite Roadmap

**System:** Commerce Plugin Suite
**Status:** Planned
**Target Project:** `ConvexPress`
**Reference Blueprint:** `/Users/worsin/Development/VexCart`
**Last Authored:** 2026-04-07

---

## Purpose

This document normalizes the ConvexPress commerce suite into one dependency-aware roadmap.

It exists because the suite is now large enough that standalone PRDs are no longer sufficient for sequencing. The suite needs:

- clear plugin tiers
- dependency rules
- implementation order
- cross-plugin integration points
- explicit "not yet" boundaries

---

## Suite Goal

ConvexPress should evolve into a WooCommerce-shaped commerce platform with:

- `commerce` as WooCommerce core
- add-ons layered cleanly on top of it
- strict plugin gating
- admin-owned backend/domain logic
- website consumer rendering only

The architecture must preserve the ConvexPress split:

- `ConvexPress-Admin/` owns schema, functions, settings, permissions, and admin UI
- `ConvexPress-Website/` consumes public queries and renders storefront/account surfaces

---

## Plugin Tiers

### Tier 0 - Foundation

- `commerce`
- `commerceSubscriptions`
- `membership`

These three define the backbone of sellable products, recurring billing, and access-control entitlements.

### Tier 1 - Storefront And Revenue Add-Ons

- `commerceDigital`
- `commerceReviews`
- `commerceWishlists`
- `commerceBundles`
- `commerceReturns`

These improve storefront capability, post-purchase operations, and merchandizing without changing the core ownership model.

### Tier 2 - Operations And Protocol Add-Ons

- `commerceFulfillment`
- `commerceUcp`
- `commerceLoyalty`

These are important, but they should not block initial core commerce launch.

### Integration Tooling (Not Plugins)

These are subsystems or admin-only tooling modules, not user-facing plugins with toggles:

- `commerceWooSync` - import/sync tooling under commerce operations
- Shipping provider adapters - subsystem of `commerce`, configured through settings/integrations
- Support bridge - runtime logic guarded by `tickets` + `knowledgeBase` enablement

---

## Recommended Build Order

### Wave 1 - Launchable Core

1. `commerce`
2. `commerceSubscriptions`
3. `membership`

### Wave 2 - First Commercially Important Add-Ons

4. `commerceDigital`
5. `commerceReviews`
6. `commerceReturns`

### Wave 3 - Storefront Experience And Merchandizing

7. `commerceWishlists`
8. `commerceBundles`
9. `commerceLoyalty`

### Wave 4 - Operations And External Protocols

10. `commerceFulfillment`
11. `commerceUcp`

### Integration Tooling (Built Alongside, Not Plugin-Gated)

12. `commerceWooSync` (import tooling module, not a plugin)

This order is based on dependency risk, not just feature appeal.

---

## Dependency Map

### Hard Dependencies

- `commerceSubscriptions -> commerce`
- `commerceDigital -> commerce`
- `commerceReviews -> commerce`
- `commerceWishlists -> commerce`
- `commerceBundles -> commerce`
- `commerceReturns -> commerce`
- `commerceFulfillment -> commerce`
- `commerceUcp -> commerce`
- `commerceWooSync -> commerce`
- `commerceLoyalty -> commerce`

### Soft / Optional Integrations

- `membership -> commerceSubscriptions`
- `membership -> commerce`
- `commerceWooSync -> commerceReviews`
- `commerceWooSync -> media`
- `commerceFulfillment -> shipping labels if present`
- `commerceUcp -> commerceSubscriptions` later
- `commerceUcp -> commerceFulfillment` later

### Important Non-Dependencies

- `membership` must not depend on billing ownership
- `commerceSubscriptions` must not depend on content restriction logic
- `commerceLoyalty` must not depend on subscriptions or membership
- `commerceReturns` must not depend on support/tickets

---

## Boundary Rules

### `commerce`

Owns:

- products
- variants
- pricing
- cart
- checkout
- orders
- shipping
- tax
- payments
- discounts
- inventory

Does not own:

- recurring billing
- content restriction
- returns
- fulfillment operations
- loyalty

### `commerceSubscriptions`

Owns:

- recurring billing lifecycle
- subscription products
- invoices
- dunning
- subscription entitlements

Does not own:

- gated content logic
- member-plan evaluation

### `membership`

Owns:

- plans
- grants
- restriction rules
- access evaluation

Consumes:

- manual grants
- subscription entitlements
- existing roles/capabilities

### Add-On Rule

All other commerce plugins should either:

- extend `commerce`, or
- consume signals from `commerce` and its add-ons

No add-on should create a second cart, checkout, order, or billing engine.

---

## Cross-Plugin Contracts

### Contract 1 - Product Ownership

Canonical products and variants belong to `commerce`.

Other plugins may extend product behavior through overlays, overrides, linked records, or product-type flags, but must not create a second catalog.

### Contract 2 - Order Ownership

Canonical orders belong to `commerce`.

Add-ons may attach records to an order or consume order events, but must not redefine order state ownership.

### Contract 3 - Entitlement Ownership

- `commerceSubscriptions` emits billing-derived entitlements
- `membership` consumes those entitlements and turns them into access decisions

### Contract 4 - Media Ownership

All media-intensive commerce plugins must reuse the existing ConvexPress media system:

- `commerceDigital`
- `commerceWooSync`
- product galleries in `commerce`

### Contract 5 - Public Gating

Every commerce plugin must enforce plugin enablement in:

- public queries
- website routes
- website blocks/embeds
- admin navigation where relevant

This is non-negotiable.

---

## Foundational Milestones

### Milestone A - Core Store Exists

Required plugins:

- `commerce`

Definition of done:

- products render
- cart works
- checkout works
- orders exist
- admin can manage products and orders

### Milestone B - Recurring Commerce Exists

Required plugins:

- `commerce`
- `commerceSubscriptions`

Definition of done:

- subscription products sell
- renewals run
- invoices exist
- customer subscription dashboard exists

### Milestone C - Paid Access Exists

Required plugins:

- `commerce`
- `commerceSubscriptions`
- `membership`

Definition of done:

- active subscriptions can drive access entitlements
- restricted pages/posts can be enforced
- manual grants also work

---

## Technical Risk Areas

### Highest Risk

- core checkout and payment correctness
- subscription renewal correctness
- entitlement boundary between subscriptions and membership
- plugin gating consistency across public surfaces

### Medium Risk

- digital delivery
- returns/refund coordination
- UCP security posture
- Woo import mapping correctness

### Lower Risk

- wishlists
- reviews
- bundles

Lower risk does not mean low effort. It means they are less likely to destabilize the core platform.

---

## Recommended Documentation State

The suite should now be treated as having three document layers:

1. suite roadmap
2. per-plugin PRDs
3. per-plugin implementation checklists

For actual build work, the next planning layer should be milestone-oriented execution plans rather than more standalone PRDs.

---

## Immediate Next Planning Artifact

The most useful next document after this roadmap is:

- a foundational execution plan for `commerce`, `commerceSubscriptions`, and `membership`

That document should define:

- exact build order
- integration checkpoints
- when shared abstractions must be created
- what can be stubbed first versus built fully

