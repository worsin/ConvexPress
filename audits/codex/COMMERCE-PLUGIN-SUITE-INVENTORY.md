# Commerce Plugin Suite Inventory

**System:** Commerce Plugin Suite
**Status:** Planned
**Target Project:** `ConvexPress`
**Reference Blueprint:** `/Users/worsin/Development/VexCart`
**Last Authored:** 2026-04-07

---

## Purpose

This document is the running inventory of the ConvexPress commerce plugin suite.

It exists to keep the plugin map stable while the suite is designed incrementally.

---

## Current Planned Plugins

### Foundational

- `commerce`
  - core catalog, cart, checkout, orders, customers, payments, shipping, tax, inventory
- `commerceSubscriptions`
  - recurring billing, subscription products, invoices, dunning, billing lifecycle
- `membership`
  - content access rules, entitlement mapping, member tiers, gated experiences

### Likely Add-On Plugins

- `commerceDigital`
  - downloads, license keys, digital file delivery
- `commerceReviews`
  - product reviews and moderation
- `commerceWishlists`
  - wishlists and saved items
- `commerceBundles`
  - product bundles and bundle pricing
- `commerceReturns`
  - returns, RMAs, refund workflows

### Deferred / Optional Later Plugins

- `commerceFulfillment`
  - warehouse/packing/label/manifests
- `commerceLoyalty`
  - points, store credit, tiers, rewards
- `commerceUcp`
  - Universal Commerce Protocol service/discovery/API surfaces

### Integration Tooling (Not Plugins)

These are subsystems, integration layers, or admin-only tooling modules. They do not appear in the plugin manager and have no user-facing plugin toggle.

- `commerceWooSync`
  - WooCommerce import/sync tooling module, admin-only, no plugin toggle
- Shipping provider adapters (ShipStation, UPS, USPS, FedEx, DHL)
  - subsystem of `commerce`, configured through settings/integrations
- Support bridge (KB + Tickets deflection)
  - runtime integration layer, active when both `knowledgeBase` and `tickets` plugins are enabled

---

## Boundary Rules

### `commerce`

Owns:

- selling things
- taking payment
- creating orders
- calculating totals

Does not own:

- recurring subscription billing
- membership access rules

### `commerceSubscriptions`

Owns:

- recurring billing lifecycle
- subscription products
- subscription invoices
- dunning
- pause/resume/cancel

Does not own:

- CMS content gating by itself
- role assignment policy by itself

### `membership`

Owns:

- access entitlements
- content/product/category gating rules
- member plans/tiers
- access evaluation

May consume:

- role/capability system
- subscription entitlements from `commerceSubscriptions`
- manual grants from admin

Does not own:

- recurring billing engine

---

## Relationship Model

The intended WooCommerce-style relationship is:

- `commerce` is equivalent to WooCommerce core
- `commerceSubscriptions` is equivalent to WooCommerce Subscriptions
- `membership` is equivalent to WooCommerce Memberships or a CMS-native membership add-on

### Important Rule

- a subscription may grant membership
- a membership does not require a subscription
- a store may run subscriptions without gated content
- a site may run gated content without subscriptions

---

## Source System Notes

### Derived Directly From VexCart

- `commerce`
- `commerceSubscriptions`

### Derived Partly From ConvexPress Existing CMS Systems

- `membership`

### Not Present As A Real VexCart Subsystem

- `commerceLoyalty`

There is no meaningful points/loyalty ledger in VexCart today. That would be net-new work later.

