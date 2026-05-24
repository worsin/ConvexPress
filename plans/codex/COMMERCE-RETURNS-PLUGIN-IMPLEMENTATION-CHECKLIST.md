# Commerce Returns Plugin - Implementation Checklist

**System:** Commerce Returns Plugin
**Status:** Planned
**Last Authored:** 2026-04-07
**Companion Spec:** `.codex/docs/COMMERCE-RETURNS-PLUGIN-PRD.md`

---

## Working Rule

This checklist covers the `commerceReturns` plugin only.

Dependency:

- `commerce` must exist first

---

## Phase 1 - Plugin Foundation

### 1. Registry and Settings

Update:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
- shared settings defaults/validators/validation

Add:

- `commerceReturns`
- `commerceReturnsEnabled`

---

## Phase 2 - Schema

### 2. Schema File

Create:

- `ConvexPress-Admin/packages/backend/convex/schema/commerceReturns.ts`

Update:

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

Add tables:

- `commerce_return_requests`
- `commerce_return_request_items`
- `commerce_return_history`

Optional later:

- `commerce_return_labels`

---

## Phase 3 - Backend Domain

### 3. Domain Module

Create:

- `ConvexPress-Admin/packages/backend/convex/commerceReturns/`

Suggested files:

- `helpers.ts`
- `validators.ts`
- `eligibility.ts`
- `queries.ts`
- `mutations.ts`

### 4. Commerce Integration

Integrate with `commerce` for:

- order ownership checks
- order item lookups
- refund service calls
- optional restock coordination

### 5. Return Lifecycle Layer

Add support for:

- request creation
- approval
- rejection
- mark received
- process refund
- complete return
- history event recording

---

## Phase 4 - Admin UI

### 6. Admin Routes

Create routes under:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/returns/`

Suggested route files:

- `index.tsx`
- `$returnId.tsx`
- `settings.tsx`

### 7. Admin Components

Create:

- `ConvexPress-Admin/apps/web/src/components/commerce-returns/`

Suggested groups:

- `queue/`
- `detail/`
- `history/`
- `settings/`

---

## Phase 5 - Website UX

### 8. Website Routes

Create:

- `ConvexPress-Website/apps/web/src/routes/_dashboard/returns.tsx`
- `ConvexPress-Website/apps/web/src/routes/_dashboard/returns_.$returnId.tsx`
- `ConvexPress-Website/apps/web/src/routes/_dashboard/orders/$orderId_.return.tsx`

### 9. Website Components

Create:

- `ConvexPress-Website/apps/web/src/components/commerce-returns/`

Suggested groups:

- `forms/`
- `account/`
- `timelines/`

### 10. Customer Order Integration

Extend account order detail UI with:

- return eligibility indicator
- request return CTA
- submitted return status links

---

## Phase 6 - Notifications And Reporting

### 11. Notifications

Integrate with existing notification/email infrastructure for:

- request received
- request approved
- request rejected
- refund processed

### 12. Reporting

Add admin summaries for:

- open returns
- approval/rejection counts
- refund totals
- top reason codes

---

## Phase 7 - Verification

### 13. Verification

- customer can request returns only for eligible items
- state transitions are enforced server-side
- return detail pages are owner-scoped
- admin workflow actions work
- refund coordination with `commerce` succeeds
- return history is recorded
- disabling plugin suppresses return behavior
