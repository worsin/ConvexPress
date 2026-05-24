# Commerce Foundation Phase 1 Execution Plan

**System:** Commerce Foundation
**Status:** Planned
**Target Project:** `ConvexPress`
**Scope:** `commerce`, `commerceSubscriptions`, `membership`
**Last Authored:** 2026-04-07

---

## Purpose

This document turns the three foundational commerce plugin specs into one implementation-ready sequence.

It is not another PRD. It is the first actual build plan for the foundational stack:

- `commerce`
- `commerceSubscriptions`
- `membership`

The goal is to prevent three common failures:

1. building subscriptions before the core checkout contract is stable
2. coupling membership to billing internals
3. scattering shared abstractions across plugins with no owner

---

## Execution Principle

Build the foundation from ownership outward:

1. `commerce` establishes canonical products, cart, checkout, orders, and payment/shipping/tax contracts
2. `commerceSubscriptions` extends `commerce` through subscription overlays and recurring jobs
3. `membership` consumes stable entitlement signals without owning billing

That order is mandatory.

---

## Phase 1 Goal

At the end of Phase 1, ConvexPress should have:

- a plugin-registered commerce core
- a stable commerce schema foundation
- a stable checkout/order contract
- subscription-capable extension points
- membership-capable entitlement bridge points

It does **not** need polished storefront UX everywhere yet.

Phase 1 is about backend correctness, plugin structure, and minimal admin/website scaffolding.

---

## Shared Foundation Requirements

These must be designed once and reused.

### 1. Plugin Gating Helpers

Create reusable plugin-state helpers for:

- `commerce`
- `commerceSubscriptions`
- `membership`

These should support:

- admin-only gating
- public query fail-closed behavior
- website route suppression

### 2. Capability Families

Define capability families before admin UI grows:

- `commerce.*`
- `commerce.subscriptions.*`
- `membership.*`

### 3. Event / Trigger Contract

Define explicit internal events or internal mutation hooks for:

- order completed
- order refunded
- subscription created
- subscription renewed
- subscription status changed
- entitlement activated
- entitlement revoked

These do not need a global event bus immediately, but they do need stable internal trigger points.

### 4. Shared Customer Identity Contract

All three plugins must agree on:

- canonical `userId`
- commerce customer profile linkage
- address ownership
- order ownership

### 5. Status Enumerations

Avoid ad hoc string drift.

Lock down stable status enums for:

- orders
- checkout sessions
- subscriptions
- subscription invoices
- membership grants

---

## Build Sequence

### Stage A - Commerce Plugin Skeleton

Goal:

- register `commerce`
- add settings and capabilities
- create schema foundation
- scaffold backend domain folder

Required outputs:

- plugin registry entry
- `commerceEnabled`
- schema registration
- backend domain folder and helpers

Do not yet build:

- complete storefront
- every admin page

### Stage B - Commerce Domain Core

Goal:

- establish canonical domain contracts

Required backend domains:

- products
- categories
- cart
- checkout
- orders
- customers
- payments
- discounts
- inventory
- shipping
- tax

Required rule:

- checkout and order creation must be correct before subscriptions begin

### Stage C - Minimal Commerce UI Surfaces

Goal:

- prove end-to-end core flow

Admin minimum:

- product list/editor
- order list/detail
- settings shell

Website minimum:

- product listing
- product detail
- cart
- checkout
- order confirmation

### Stage D - Subscription Skeleton

Goal:

- register `commerceSubscriptions`
- add dependency enforcement on `commerce`
- create schema and backend module scaffolding

Required outputs:

- plugin registry entry
- settings key
- schema registration
- subscription template/subscription/invoice base tables

### Stage E - Subscription Runtime Core

Goal:

- make subscription purchase and lifecycle real

Required behaviors:

- product subscription eligibility
- checkout recognition of subscription purchase mode
- create subscription on successful order
- invoice and renewal job scaffolding
- entitlement emission

Hard rule:

- no membership restriction logic belongs here

### Stage F - Membership Skeleton

Goal:

- register `membership`
- create plans/grants/restrictions schema
- create backend access-evaluator contract

Required outputs:

- plugin registry entry
- settings key
- schema registration
- access evaluation helper surface

### Stage G - Membership Runtime Core

Goal:

- make restricted content real

Required behaviors:

- manual membership grants
- plan creation
- restriction-rule storage
- loader-visible access checks
- optional subscription-entitlement bridge

Hard rule:

- membership consumes entitlement signals; it does not query billing internals directly if a stable entitlement contract exists

---

## Cross-Plugin Integration Checkpoints

### Checkpoint 1 - Commerce Done Enough For Extensions

Must exist before subscriptions work starts:

- stable order creation contract
- stable customer identity linkage
- stable payment success/failure outcomes
- plugin gating helper

### Checkpoint 2 - Subscriptions Done Enough For Membership

Must exist before membership bridge work starts:

- stable subscription statuses
- emitted entitlement shape
- revoke/activate transition behavior

### Checkpoint 3 - Membership Done Enough For Restricted Content

Must exist before deep CMS integration:

- access evaluator
- plan/grant query surface
- website route-loader integration contract

---

## Entitlement Contract

This contract must be defined before `membership` consumes subscriptions.

Recommended entitlement shape:

- `subjectUserId`
- `sourcePlugin`
- `sourceType`
- `sourceRef`
- `entitlementCode`
- `status`
- `startsAt`
- `endsAt?`
- `graceEndsAt?`
- `metadata?`

Examples:

- subscription grants "gold-membership"
- subscription grants "premium-downloads"
- manual grant creates the same normalized shape later if desired

This prevents `membership` from becoming tightly coupled to subscription tables.

---

## Minimal Deliverable Definition

### `commerce`

Phase 1 minimum:

- one or more product types can be authored
- cart supports add/update/remove
- checkout creates an order
- payment result updates order state

### `commerceSubscriptions`

Phase 1 minimum:

- one subscription-capable product can be sold
- subscription record is created from an order
- invoice/renewal scaffolding exists
- entitlement record is emitted

### `membership`

Phase 1 minimum:

- one plan can be created
- one page/post can be restricted
- one manual grant can unlock access
- one subscription entitlement can unlock access

---

## Recommended File Ownership Order

### Admin Backend First

Start in:

- `ConvexPress-Admin/packages/backend/convex/schema/`
- `ConvexPress-Admin/packages/backend/convex/commerce/`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/`
- `ConvexPress-Admin/packages/backend/convex/membership/`

### Then Admin UI

Move to:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/membership/`

### Then Website Consumer Surfaces

Finally add:

- storefront routes in `ConvexPress-Website/apps/web/src/routes/_marketing/`
- account routes in `ConvexPress-Website/apps/web/src/routes/_dashboard/`
- restriction-aware loaders and wrappers

This order matches the actual architecture of ConvexPress.

---

## What To Stub Early

Stub early:

- admin dashboards
- analytics
- advanced search/filtering
- polished account pages
- full email workflows
- rich visual merchandising blocks

Do not stub:

- order correctness
- subscription lifecycle correctness
- entitlement contract
- membership access evaluation
- plugin gating

---

## Testing Priorities

### Highest Priority

- cart to checkout to order flow
- payment success/failure state changes
- subscription creation from checkout
- renewal and entitlement emission
- restricted-content access evaluation

### Medium Priority

- admin product authoring
- customer order history
- customer subscription dashboard
- membership account page

---

## Exit Criteria For Phase 1

Phase 1 is complete when:

- `commerce` can sell products end to end
- `commerceSubscriptions` can create and maintain subscriptions from valid purchases
- `membership` can enforce access based on manual or subscription-derived grants
- the boundaries between checkout, billing, and access are explicit and stable

At that point, the foundation is strong enough to start the next add-on wave:

- `commerceDigital`
- `commerceReviews`
- `commerceReturns`

