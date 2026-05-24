# Commerce Fulfillment Plugin - PRD and Implementation Strategy

**System:** Commerce Fulfillment Plugin
**Status:** Planned
**Priority:** P2 - Medium
**Complexity:** High
**Layer:** Full Stack / Plugin
**Source Blueprint:** `/Users/worsin/Development/VexCart`
**Target Project:** `ConvexPress`
**WordPress Equivalent:** WooCommerce fulfillment / shipping-operations extensions
**Last Authored:** 2026-04-07

---

## Intent

The Commerce Fulfillment Plugin adds post-order warehouse and shipping-operations workflows to ConvexPress commerce.

It is built on top of the `commerce` plugin and owns:

- fulfillment order records
- warehouse-style fulfillment queues
- assignment, packing, and shipping status workflows
- shipping manifest management
- shipment-operations views for internal users

This plugin is optional. Small stores can run only `commerce`, but larger operations need a dedicated fulfillment layer.

---

## Product Goals

1. Turn paid and ready orders into operational fulfillment work items.
2. Give internal staff a clean queue for packing and shipping work.
3. Preserve timestamps, assignment, notes, and shipment status transitions.
4. Support manifest-oriented outbound workflows for carriers.
5. Keep fulfillment separate from storefront checkout and customer support concerns.

---

## Non-Goals

This plugin does **not** own:

- checkout
- payment capture
- core shipping-rate calculation
- customer-facing order placement
- full warehouse management system behavior

Those belong to `commerce`, shipping configuration, or a later warehouse plugin.

---

## Source Blueprint In VexCart

VexCart already contains a substantial fulfillment subsystem in:

- `VexCart-Admin/packages/backend/convex/fulfillment.ts`

Observed capabilities include:

- fulfillment queue listing with status, priority, assignment, and pagination
- get-by-order lookup
- fulfillment stats
- internal fulfillment-order creation from completed orders
- assignment to internal users
- status transitions such as `pending`, `processing`, `packed`, `ready_to_ship`, `shipped`, `partially_shipped`, `on_hold`
- notes and ship-by-date management
- shipping manifest creation and finalization

The source also integrates with:

- `shipping_labels`
- shipping methods and order shipping state
- notification emails on shipment

ConvexPress should adopt that operational shape, but keep the system clearly layered as an optional plugin on top of `commerce`.

---

## Plugin Definition

### Plugin ID

- `commerceFulfillment`

### Required Dependency

- `commerce`

### Registry Integration

Add to:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Recommended metadata:

- `id`: `commerceFulfillment`
- `title`: `Commerce Fulfillment`
- `description`: `Fulfillment queues, packing workflows, shipment operations, and manifests`
- `settingsKey`: `commerceFulfillmentEnabled`
- `dependsOn`: `["commerce"]`
- `adminAccessPrefixes`: `["/admin/commerce/fulfillment"]`
- `routePrefixes`: `[]`

### Plugin Gating Rule

If `commerceFulfillmentEnabled === false`:

- fulfillment orders must not be created
- admin fulfillment routes must not render
- manifest creation must not run
- shipment-operation actions must reject

---

## Architectural Position

### This Plugin Owns

- fulfillment work records
- internal assignment
- packing and shipping workflow state
- shipment manifest records
- fulfillment dashboards and queue views

### This Plugin Depends On

- `commerce` orders
- `commerce` order items
- `commerce` shipping data
- optional label-generation capabilities if present

### This Plugin Does Not Replace

- shipping method setup
- storefront order tracking pages
- returns processing
- warehouse inventory-location management

---

## Core User Stories

### Merchant / Operations Lead

- View all orders that require fulfillment.
- Sort by priority and ship-by date.
- Assign work to internal staff.
- Track bottlenecks and overdue shipments.

### Fulfillment Staff

- Pull assigned orders from the queue.
- Move work from pending to processing to packed to shipped.
- Add internal packing notes.
- Confirm shipment once labels and packages are ready.

### Admin

- Review fulfillment stats.
- Reassign work.
- Adjust ship-by dates and priorities.
- Generate and finalize carrier manifests.

---

## Domain Model

Recommended tables:

- `commerce_fulfillment_orders`
- `commerce_shipping_manifests`

Optional later tables:

- `commerce_fulfillment_history`
- `commerce_shipments`
- `commerce_package_scans`

### `commerce_fulfillment_orders`

Recommended fields:

- `orderId`
- `status`
- `priority`
- `assignedTo?`
- `assignedAt?`
- `shipByDate`
- `internalNotes?`
- `packingNotes?`
- `startedAt?`
- `packedAt?`
- `shippedAt?`
- `createdAt`
- `updatedAt`

### `commerce_shipping_manifests`

Recommended fields:

- `carrier`
- `manifestDate`
- `labels`
- `labelCount`
- `totalWeight`
- `status`
- `createdBy`
- `createdAt`
- `finalizedAt?`
- `manifestId?`
- `manifestUrl?`

---

## Status Model

Recommended v1 fulfillment status flow:

- `pending`
- `processing`
- `packed`
- `readyToShip`
- `shipped`
- `partiallyShipped`
- `onHold`

### State Transition Rule

The plugin should enforce explicit allowed transitions rather than free-form status patching.

Suggested transition model:

- `pending -> processing | onHold`
- `processing -> packed | onHold`
- `packed -> readyToShip | onHold`
- `readyToShip -> shipped | partiallyShipped | onHold`
- `partiallyShipped -> shipped | onHold`

---

## Fulfillment Creation Model

Recommended default:

- `commerce` creates the fulfillment record when an order becomes fulfillable

Typical triggers:

- payment captured
- order marked processing/ready-for-fulfillment
- product mix includes shippable goods

This should be implemented as an internal mutation or event-driven bridge, not a storefront action.

---

## Shipping And Label Boundaries

This plugin should integrate with shipping labels and shipment metadata if those features exist, but should not own carrier-rate setup.

Recommended boundary:

- `commerce` owns shipping method and checkout shipping selections
- shipping-label service owns label procurement
- `commerceFulfillment` owns operational use of those labels during pack/ship workflows

---

## Admin UX

### Admin Routes

Recommended routes:

- `/admin/commerce/fulfillment`
- `/admin/commerce/fulfillment/$fulfillmentId`
- `/admin/commerce/fulfillment/manifests`
- `/admin/commerce/fulfillment/manifests/$manifestId`
- `/admin/commerce/fulfillment/settings`

### Admin Screens

#### Fulfillment Queue

- status filters
- priority filters
- assignment filters
- overdue indicators
- due-today indicators
- bulk assignment and workflow actions later

#### Fulfillment Detail

- order summary
- shipping address summary
- line items
- internal notes
- packing notes
- label summary
- assignment and priority controls
- status action bar

#### Manifest Screens

- manifest list
- draft manifest detail
- finalize manifest action
- carrier/date grouping

#### Settings

- plugin enablement
- default ship-by rules
- default priority rules
- notification defaults

---

## Customer-Facing UX

This plugin is primarily operational and admin-focused.

Customer-facing pages should remain minimal and integrate through `commerce` order history.

Allowed customer-facing outputs:

- order status progression
- tracking information
- shipment confirmations

These should appear through `commerce` order pages rather than standalone fulfillment pages.

---

## Permissions

Recommended capabilities:

- `commerce.fulfillment.view`
- `commerce.fulfillment.assign`
- `commerce.fulfillment.process`
- `commerce.fulfillment.ship`
- `commerce.fulfillment.manageManifests`
- `commerce.fulfillment.manageSettings`

---

## Notifications

Recommended notifications:

- shipment created
- order shipped
- partial shipment
- overdue fulfillment warning for staff

Email delivery should use the broader system notification infrastructure, not custom one-off transport logic in the plugin.

---

## Analytics And Reporting

Recommended reporting:

- pending fulfillment count
- overdue shipments
- average time from order to ship
- staff workload
- carrier volume by day
- manifest counts

---

## Testing Strategy

Required test areas:

- fulfillment creation from eligible orders
- assignment rules
- status transition enforcement
- manifest creation and finalization rules
- plugin-disabled behavior
- shipment status sync back into `commerce` orders

---

## Rollout Plan

### Phase 1

- plugin registration and settings
- schema
- fulfillment-order creation bridge from `commerce`
- queue queries and stats

### Phase 2

- admin queue and detail screens
- assignment, notes, priority, and ship-by actions
- shipment status transitions

### Phase 3

- manifests
- notifications
- reporting

---

## Acceptance Criteria

The plugin is successful when:

- fulfillable orders generate operational fulfillment records
- internal staff can manage work from a dedicated queue
- packing and shipping transitions are controlled and auditable
- manifest workflows exist for carriers
- disabling the plugin removes fulfillment-specific behavior cleanly

