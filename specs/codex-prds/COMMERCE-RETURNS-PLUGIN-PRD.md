# Commerce Returns Plugin - PRD and Implementation Strategy

**System:** Commerce Returns Plugin
**Status:** Planned
**Priority:** P2 - Medium
**Complexity:** Medium / High
**Layer:** Full Stack / Plugin
**Source Blueprint:** `/Users/worsin/Development/VexCart`
**Target Project:** `ConvexPress`
**WordPress Equivalent:** WooCommerce RMA / returns-management extensions
**Last Authored:** 2026-04-07

---

## Intent

The Commerce Returns Plugin adds structured return and refund workflows to ConvexPress commerce.

It is built on top of the `commerce` plugin and owns:

- return request lifecycle
- item-level return requests
- approval and rejection workflow
- received/refunded/completed state transitions
- return-centric admin and customer views

This plugin is optional. Stores can run without returns tooling, but enterprise commerce needs a controlled RMA layer.

---

## Product Goals

1. Allow customers to request returns from their own eligible orders.
2. Give admins a clear approval, rejection, and refund workflow.
3. Preserve item-level quantities, reasons, notes, and status history.
4. Keep returns separate from generic support/ticketing.
5. Integrate safely with `commerce` orders, refunds, inventory, and customer account flows.

---

## Non-Goals

This plugin does **not** own:

- order creation
- payment capture
- general customer support
- warehouse fulfillment
- advanced exchange workflows as a required v1 feature

Those belong to `commerce`, `support`, or later operational plugins.

---

## Source Blueprint In VexCart

VexCart already contains a substantial return-management subsystem in:

- `VexCart-Admin/packages/backend/convex/returns.ts`

Observed capabilities include:

- customer return request creation
- lookups by return id and return number
- order-linked return records
- customer "my returns" queries
- admin approval and rejection
- mark received
- process refund
- complete return
- shipping label attachment
- notes and status tracking

Observed status flow in VexCart:

- `requested`
- `approved`
- `rejected`
- `received`
- `refunded`
- `completed`

ConvexPress should keep that lifecycle orientation and treat it as a true RMA plugin rather than burying it inside orders or tickets.

---

## Plugin Definition

### Plugin ID

- `commerceReturns`

### Required Dependency

- `commerce`

### Registry Integration

Add to:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Recommended metadata:

- `id`: `commerceReturns`
- `title`: `Commerce Returns`
- `description`: `RMA requests, return approvals, refund coordination, and return tracking`
- `settingsKey`: `commerceReturnsEnabled`
- `dependsOn`: `["commerce"]`
- `adminAccessPrefixes`: `["/admin/commerce/returns"]`
- `routePrefixes`: `["/account/returns"]`

### Plugin Gating Rule

If `commerceReturnsEnabled === false`:

- return-request UI must not render
- customer returns dashboard must not render
- admin returns routes must not render
- return creation and processing APIs must reject

---

## Architectural Position

### This Plugin Owns

- return requests
- return items and reasons
- return status lifecycle
- admin review workflow
- return notes and history

### This Plugin Depends On

- `commerce` orders
- `commerce` refund mechanisms
- `commerce` customer identities
- optional shipping/label tooling later

### This Plugin Does Not Replace

- customer support tickets
- refund APIs in `commerce`
- fulfillment/warehouse processing

---

## Core User Stories

### Customer

- View eligible past orders.
- Request a return for one or more order items.
- Specify quantities, reasons, and notes.
- Track return status from the account area.

### Admin

- Review return requests.
- Approve or reject requests.
- Mark returned goods as received.
- Process refund or partial refund.
- Complete the return record cleanly.

### Operations

- Maintain a stable return number for every RMA.
- Preserve item-level auditability and state changes.

---

## Domain Model

Recommended tables:

- `commerce_return_requests`
- `commerce_return_request_items`
- `commerce_return_history`

Optional later tables:

- `commerce_return_labels`
- `commerce_return_refund_links`

### `commerce_return_requests`

Recommended fields:

- `returnNumber`
- `orderId`
- `userId`
- `status`
- `requestedAt`
- `approvedAt?`
- `rejectedAt?`
- `receivedAt?`
- `refundedAt?`
- `completedAt?`
- `customerReasonSummary?`
- `customerNotes?`
- `adminNotes?`
- `refundAmount?`
- `currencyCode`
- `createdAt`
- `updatedAt`

### `commerce_return_request_items`

Recommended fields:

- `returnRequestId`
- `orderItemId`
- `productId`
- `variantId?`
- `quantityRequested`
- `quantityApproved?`
- `reasonCode`
- `reasonText?`
- `conditionCode?`
- `resolutionType`
- `createdAt`
- `updatedAt`

### `commerce_return_history`

Recommended fields:

- `returnRequestId`
- `actorUserId?`
- `actorType`
- `eventType`
- `note?`
- `metadata?`
- `createdAt`

---

## Status Model

Recommended v1 status flow:

- `requested`
- `approved`
- `rejected`
- `received`
- `refunded`
- `completed`

### State Transition Rules

- only `requested` can become `approved` or `rejected`
- only `approved` can become `received`
- only `received` can become `refunded`
- only `refunded` can become `completed`

Admin-only override paths can exist later, but v1 should favor strict transitions for auditability.

---

## Return Eligibility Model

The plugin should support configurable eligibility rules, but not own the entire order-policy engine.

Recommended initial rules:

- order belongs to current user
- order status is eligible for returns
- item quantity has not already been fully returned
- item is within return window
- product is not explicitly marked non-returnable

These rules should be evaluated through helper utilities in the plugin and surfaced in customer account UI before the request is submitted.

---

## Refund Coordination

Refund ownership remains in `commerce`.

The `commerceReturns` plugin should:

- request refund calculations
- store expected refund amounts
- call into `commerce` refund services when admin processes the refund
- preserve the link between the return request and the resulting refund record

This keeps:

- money movement centralized
- gateway integrations isolated
- return workflow cleanly layered on top

---

## Inventory And Restocking Rules

Recommended v1 behavior:

- inventory changes do not happen at return request creation
- optional restock occurs only after goods are marked `received`
- restock policy may depend on item condition and resolution type

Possible resolution types:

- `refund`
- `storeCredit`
- `replacement`

Only `refund` needs to be fully supported in v1.

---

## Admin UX

### Admin Routes

Recommended routes:

- `/admin/commerce/returns`
- `/admin/commerce/returns/$returnId`
- `/admin/commerce/returns/settings`

### Admin Screens

#### Returns Queue

- status filters
- search by return number
- order lookup
- customer lookup
- aging/priority indicators

#### Return Detail

- return summary
- requested items
- order context
- customer notes
- admin notes
- status history
- approval / rejection / receive / refund actions

#### Settings

- plugin enablement
- default return window
- non-returnable product rules
- restock defaults
- refund workflow defaults

---

## Customer UX

### Website Routes

Recommended routes:

- `ConvexPress-Website/apps/web/src/routes/_dashboard/returns.tsx`
- `ConvexPress-Website/apps/web/src/routes/_dashboard/returns_.$returnId.tsx`
- `ConvexPress-Website/apps/web/src/routes/_dashboard/orders/$orderId_.return.tsx`

### Customer Experience Requirements

- visible "request return" CTA only when eligible
- clear quantity and reason form
- explanation of return status
- return detail page with timeline
- no access to other users' returns

---

## Separation From Support

This plugin must stay separate from generic support/ticket systems.

Reason:

- RMAs are operational order workflows
- support tickets are unstructured customer conversations

An implementation may later create cross-links between a return request and a support ticket, but the systems should remain independent.

---

## Permissions

Recommended capabilities:

- `commerce.returns.view`
- `commerce.returns.review`
- `commerce.returns.approve`
- `commerce.returns.reject`
- `commerce.returns.receive`
- `commerce.returns.refund`
- `commerce.returns.manageSettings`

Customer-side access should be scoped to the authenticated owner of the original order.

---

## Notifications

Recommended notifications:

- return requested
- return approved
- return rejected
- item received
- refund processed
- return completed

Notification delivery itself should rely on the project’s broader notification/email infrastructure rather than be reimplemented here.

---

## Analytics

Recommended analytics and reporting:

- return request volume
- approval rate
- rejection rate
- refund totals
- top return reasons
- average time to resolution

---

## Testing Strategy

Required test areas:

- customer eligibility checks
- item quantity validation
- state transition enforcement
- refund coordination with `commerce`
- return access control
- plugin-disabled behavior
- return-number generation uniqueness

---

## Rollout Plan

### Phase 1

- plugin registration and settings
- schema
- backend return lifecycle and validation
- customer request flow

### Phase 2

- admin queue and detail workflow
- refund coordination
- return history and notes

### Phase 3

- notifications
- analytics/reporting
- optional label metadata

---

## Acceptance Criteria

The plugin is successful when:

- customers can request returns only for eligible items from their own orders
- admins can review and process return requests through a clear lifecycle
- refund coordination uses core `commerce` payment/refund services
- every return keeps stable item, status, and audit history
- disabling the plugin cleanly removes return behavior

