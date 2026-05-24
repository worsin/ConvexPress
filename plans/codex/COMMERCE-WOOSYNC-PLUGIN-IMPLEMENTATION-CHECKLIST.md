# Commerce Woo Sync - Implementation Checklist

> **Note:** WooSync is commerce import/sync tooling, not a user-facing plugin. It has no plugin toggle in the plugin manager. It is admin-only operational tooling that lives under commerce operations.

**System:** Commerce Woo Sync Tooling Module
**Status:** Planned
**Last Authored:** 2026-04-07
**Companion Spec:** `.codex/docs/COMMERCE-WOOSYNC-PLUGIN-PRD.md`

---

## Working Rule

This checklist covers the `commerceWooSync` tooling module only.

Dependency:

- `commerce` must exist and be enabled first

---

## Phase 1 - Module Foundation

### 1. Settings and Capability Registration

WooSync does NOT get its own entry in the plugin registry. It is admin-only tooling under commerce operations.

Add:

- capability registrations for `commerce.wooSync.*`
- admin navigation entry under commerce operations (visible when `commerce` is enabled)
- settings section for WooSync connection config

---

## Phase 2 - Schema

### 2. Schema File

Create:

- `ConvexPress-Admin/packages/backend/convex/schema/commerceWooSync.ts`

Update:

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

Add tables:

- `commerce_woo_connections`
- `commerce_woo_import_jobs`
- `commerce_woo_id_map`
- `commerce_woo_import_logs`
- `commerce_woo_image_queue`

---

## Phase 3 - Backend Domain

### 3. Domain Module

Create:

- `ConvexPress-Admin/packages/backend/convex/commerceWooSync/`

Suggested files:

- `helpers.ts`
- `connection.ts`
- `jobs.ts`
- `import.ts`
- `progress.ts`
- `images.ts`

### 4. Commerce Integration

Integrate with `commerce` and related systems for:

- product import targets
- customer import targets
- order import targets
- coupon import targets
- review import targets if `commerceReviews` exists
- media import targets

### 5. Scheduler And Batch Flows

Add support for:

- full import jobs
- per-entity import jobs
- image queue processing
- retry handling

---

## Phase 4 - Admin UI

### 6. Admin Routes

Create routes under:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/woo-sync/`

Suggested route files:

- `index.tsx`
- `jobs.tsx`
- `jobs_.$jobId.tsx`
- `mappings.tsx`
- `settings.tsx`

### 7. Admin Components

Create:

- `ConvexPress-Admin/apps/web/src/components/commerce-woo-sync/`

Suggested groups:

- `connection/`
- `dashboard/`
- `jobs/`
- `logs/`
- `settings/`

---

## Phase 5 - Reconciliation And Recovery

### 8. Mapping Tools

Add admin tooling for:

- viewing source-target mappings
- conflict visibility
- rerun-safe import diagnostics

### 9. Retry Tools

Add support for:

- retrying failed images
- retrying failed batches
- restarting failed jobs safely

---

## Phase 6 - Verification

### 10. Verification

- Woo connection can be created and tested
- full import jobs can start and report progress
- logs and counters are visible
- mappings prevent uncontrolled duplicate imports
- image queue retries work
- disabling the `commerce` parent plugin suppresses Woo sync behavior
