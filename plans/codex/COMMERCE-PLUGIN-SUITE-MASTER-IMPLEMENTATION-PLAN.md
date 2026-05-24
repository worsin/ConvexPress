# Commerce Plugin Suite Master Implementation Plan

**System:** Commerce Plugin Suite
**Status:** Planned
**Target Project:** `ConvexPress`
**Reference Blueprint:** `/Users/worsin/Development/VexCart`
**Last Authored:** 2026-04-07

---

## Purpose

This is the execution plan for building the full ConvexPress commerce suite.

It replaces fragmented plugin-by-plugin planning with one build program that answers:

- what gets built first
- what blocks what
- what gets stubbed versus finished
- what each wave must deliver
- when a plugin is allowed to start

This document is not another PRD. It is the suite-level implementation program.

---

## Governing Rules

### Rule 1

`ConvexPress-Admin` owns:

- schema
- Convex functions
- settings
- capabilities
- plugin registry
- admin UI
- HTTP/protocol surfaces that require the owning backend

### Rule 2

`ConvexPress-Website` owns:

- storefront rendering
- customer account rendering
- CMS embedding and shortcode/block output
- public route UX

It consumes the admin-owned backend and does not define its own competing commerce backend.

### Rule 3

No plugin is allowed to create a second:

- cart
- checkout engine
- order system
- product catalog
- billing engine

### Rule 4

Every plugin must enforce plugin gating in:

- admin navigation
- backend queries/mutations/actions
- website routes
- blocks/embeds/shortcodes where applicable

---

## Full Plugin Order

### Wave 1 - Foundation

1. `commerce`
2. `commerceSubscriptions`
3. `membership`

### Wave 2 - Launch-Critical Add-Ons

4. `commerceDigital`
5. `commerceReviews`
6. `commerceReturns`

### Wave 3 - Storefront Growth Add-Ons

7. `commerceWishlists`
8. `commerceBundles`
9. `commerceLoyalty`

### Wave 4 - Operations And Integration

10. `commerceFulfillment`
11. `commerceUcp`

### Integration Tooling (Built Alongside, Not Plugin-Gated)

12. `commerceWooSync` (import/sync tooling module, not a user-facing plugin)

This order is mandatory unless the architecture changes.

---

## Wave Deliverables

### Wave 1 Deliverable

ConvexPress can:

- sell products
- take payment
- create orders
- sell subscriptions
- emit subscription entitlements
- restrict content using membership grants

### Wave 2 Deliverable

ConvexPress can:

- deliver digital purchases
- collect product reviews
- run returns/RMA workflows

### Wave 3 Deliverable

ConvexPress can:

- support wishlists
- merchandise configurable bundles
- run points/reward incentives

### Wave 4 Deliverable

ConvexPress can:

- operate shipment workflows
- expose UCP surfaces
- migrate from WooCommerce (via `commerceWooSync` import tooling, not a plugin toggle)

---

## Execution By Wave

## Wave 1 - Foundation

### 1. `commerce`

Build order inside the plugin:

1. plugin registration and settings
2. core schema
3. backend domain modules
4. admin product and order surfaces
5. website storefront minimum
6. checkout and order correctness
7. CMS block/embed integration

Hard stop before moving on:

- checkout must create canonical orders correctly
- payment outcomes must be stable
- product and order ownership must be locked

### 2. `commerceSubscriptions`

Build order inside the plugin:

1. plugin registration and dependency enforcement
2. subscription schema
3. product overlay model
4. checkout integration
5. subscription record creation
6. invoice and renewal jobs
7. entitlement emission
8. customer subscription dashboard

Hard stop before moving on:

- subscription purchase mode works
- renewals have a stable job path
- entitlements emit from subscription status changes

### 3. `membership`

Build order inside the plugin:

1. plugin registration and settings
2. plan/grant/restriction schema
3. access evaluator
4. admin plan/grant/restriction UI
5. website route/content integration
6. subscription entitlement bridge

Hard stop before Wave 2:

- restricted content works
- manual grants work
- subscription-derived access works without billing leakage into membership

---

## Wave 2 - Launch-Critical Add-Ons

### 4. `commerceDigital`

Required before starting:

- `commerce` order ownership
- media system integration patterns

Build order:

1. schema and backend module
2. product attachment overlays
3. download authorization contract
4. download delivery routes/components
5. download logs and customer library

### 5. `commerceReviews`

Required before starting:

- `commerce` product and customer ownership

Build order:

1. schema and backend module
2. moderation and aggregate model
3. storefront review submission/display
4. verified-purchase bridge
5. admin moderation surfaces

### 6. `commerceReturns`

Required before starting:

- `commerce` orders
- `commerce` refunds

Build order:

1. schema and backend lifecycle
2. customer return-request flow
3. admin queue/detail workflow
4. refund coordination
5. status history and reporting

---

## Wave 3 - Storefront Growth Add-Ons

### 7. `commerceWishlists`

Required before starting:

- `commerce` product surfaces
- customer auth/account routes

Build order:

1. schema and backend CRUD
2. guest local-state behavior
3. account wishlists
4. shareable wishlist route
5. move-to-cart integration

### 8. `commerceBundles`

Required before starting:

- `commerce` product, pricing, inventory, and cart contracts

Build order:

1. schema and validation model
2. admin bundle editor
3. storefront configurator
4. cart payload and order snapshot integration
5. inventory behavior validation

### 9. `commerceLoyalty`

Required before starting:

- `commerce` checkout/order completion events

Build order:

1. ledger schema
2. loyalty account and manual adjustment surfaces
3. order-based earning
4. checkout redemption
5. expiry, reversal, and reporting

Important note:

- this is ConvexPress-native, not a direct VexCart extraction

---

## Wave 4 - Operations And Integration

### 10. `commerceFulfillment`

Required before starting:

- `commerce` orders and shipping model

Build order:

1. fulfillment queue schema
2. fulfillment creation bridge
3. admin queue/detail screens
4. status transitions
5. manifests and shipment reporting

### 11. `commerceUcp`

Required before starting:

- `commerce` checkout is stable
- security posture is acceptable

Build order:

1. API key and auth model
2. discovery endpoints
3. session access model
4. UCP checkout endpoints
5. admin monitoring and key management

Important note:

- this must live on the owning backend side, not as a website-local invention

### 12. `commerceWooSync` (Import Tooling Module, Not a Plugin)

Note: WooSync is commerce import tooling, not a user-facing plugin. It has no plugin toggle. It is admin-only operational tooling that lives under commerce operations.

Required before starting:

- `commerce` target schema is stable enough to import into

Build order:

1. connection management
2. job/mapping/log schema
3. product/category/customer imports
4. image queueing
5. order/review/coupon imports
6. retry and reconciliation tools

Important note:

- import-first, not promised bidirectional sync

---

## Shared Architecture Milestones

### Milestone A - Plugin Framework Ready For Commerce

Must be completed before any plugin implementation begins:

- registry patterns understood and extended
- settings defaults/validators/validation flow stable
- capability-registration pattern confirmed
- public plugin gating helper pattern decided

### Milestone B - Core Commerce Contracts Locked

Must be completed before `commerceSubscriptions`, `commerceReturns`, `commerceBundles`, `commerceDigital`, or `commerceUcp`:

- product model
- order model
- checkout session model
- payment transaction model
- customer identity linkage

### Milestone C - Entitlement Contract Locked

Must be completed before `membership` bridge work:

- subscription entitlement shape
- active/grace/revoked semantics
- source references

### Milestone D - Media Integration Contract Locked

Must be completed before `commerceDigital` and `commerceWooSync`:

- media ownership and storage path
- file authorization pattern
- derivative/preview handling expectations

---

## Stub Policy

### Allowed To Stub Early

- analytics dashboards
- advanced reporting
- polished search/filtering
- fancy admin dashboards
- marketing niceties
- bulk operations

### Not Allowed To Stub

- order correctness
- checkout totals correctness
- plugin gating
- entitlement shape
- access evaluator
- refund/renewal lifecycle correctness where those plugins exist

---

## Team-Oriented Work Breakdown

If this gets built by multiple contributors, ownership should split by system boundary, not by random screen.

### Backend Track

Own:

- schema
- Convex functions
- helper contracts
- jobs
- event/trigger points

### Admin Track

Own:

- admin routes
- admin components
- plugin settings and dashboards
- editors and moderation/operations views

### Website Track

Own:

- storefront pages
- customer account pages
- block/embed rendering
- gated UX and customer-facing flows

### Integration Track

Own:

- cross-plugin contracts
- event bridges
- entitlement mapping
- protocol/import boundaries

---

## Definition Of Ready For Actual Build

A plugin is ready to implement when all of these are true:

- its PRD exists
- its checklist exists
- its dependencies already have stable contracts
- its plugin boundary is explicit
- its Wave and milestone placement are explicit

At this point, all planned commerce plugins meet that bar.

---

## Definition Of Done For The Suite

The suite is "built out" when:

- all foundational plugins are live and stable
- Wave 2 and Wave 3 plugins operate as real extensions instead of speculative stubs
- Wave 4 integrations are optional but production-safe
- no plugin violates core ownership boundaries
- admin remains the only backend owner
- website remains a pure consumer-renderer

---

## Immediate Execution Recommendation

Stop writing net-new PRDs for now.

Start implementation in this order:

1. `commerce` Stage A through C
2. `commerceSubscriptions` Stage D through E
3. `membership` Stage F through G

Then move into:

4. `commerceDigital`
5. `commerceReviews`
6. `commerceReturns`

That is the shortest path to a real ConvexPress commerce platform.

