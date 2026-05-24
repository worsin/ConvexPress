# Commerce Fulfillment Plugin - Implementation Checklist

**System:** Commerce Fulfillment Plugin
**Status:** Planned
**Last Authored:** 2026-04-07
**Companion Spec:** `.codex/docs/COMMERCE-FULFILLMENT-PLUGIN-PRD.md`

---

## Working Rule

This checklist covers the `commerceFulfillment` plugin only.

Dependency:

- `commerce` must exist first

---

## Phase 1 - Plugin Foundation

### 1. Registry and Settings

Update:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
- shared settings defaults/validators/validation

Add:

- `commerceFulfillment`
- `commerceFulfillmentEnabled`

---

## Phase 2 - Schema

### 2. Schema File

Create:

- `ConvexPress-Admin/packages/backend/convex/schema/commerceFulfillment.ts`

Update:

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

Add tables:

- `commerce_fulfillment_orders`
- `commerce_shipping_manifests`

Optional later:

- `commerce_fulfillment_history`
- `commerce_shipments`

---

## Phase 3 - Backend Domain

### 3. Domain Module

Create:

- `ConvexPress-Admin/packages/backend/convex/commerceFulfillment/`

Suggested files:

- `helpers.ts`
- `validators.ts`
- `queries.ts`
- `mutations.ts`
- `manifests.ts`

### 4. Commerce Integration

Integrate with `commerce` for:

- order eligibility checks
- fulfillment-record creation on paid/processable orders
- order shipping-status synchronization
- shipping label lookups if available

### 5. Workflow Layer

Add support for:

- queue listing
- stats
- assignment
- notes
- ship-by-date and priority updates
- status transitions

---

## Phase 4 - Admin UI

### 6. Admin Routes

Create routes under:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/fulfillment/`

Suggested route files:

- `index.tsx`
- `$fulfillmentId.tsx`
- `manifests.tsx`
- `manifests_.$manifestId.tsx`
- `settings.tsx`

### 7. Admin Components

Create:

- `ConvexPress-Admin/apps/web/src/components/commerce-fulfillment/`

Suggested groups:

- `queue/`
- `detail/`
- `manifests/`
- `settings/`

---

## Phase 5 - Customer Order Integration

### 8. Commerce Order UI Integration

Extend customer and admin order views with:

- shipment-state display
- tracking summary
- partial-shipment handling if supported

No standalone storefront fulfillment routes are required in v1.

---

## Phase 6 - Notifications And Reporting

### 9. Notifications

Integrate with existing email/notification infrastructure for:

- shipped notification
- partial shipment notification
- internal overdue alerts later

### 10. Reporting

Add admin summaries for:

- pending fulfillment
- due today
- overdue
- shipped today
- carrier manifest counts

---

## Phase 7 - Verification

### 11. Verification

- fulfillment records generate from eligible orders
- assignment and status updates work
- order shipping state stays synchronized
- manifest creation and finalization work
- internal notes and packing notes persist
- disabling plugin suppresses fulfillment behavior

