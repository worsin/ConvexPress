# Commerce Woo Sync - PRD and Implementation Strategy

> **Note:** WooSync is commerce import/sync tooling, not a user-facing plugin. It has no plugin toggle in the plugin manager. It is admin-only operational tooling that lives under commerce operations. References to "plugin" in this document are historical and should be read as "tooling module."

**System:** Commerce Woo Sync Tooling Module
**Status:** Planned
**Priority:** P3 - Optional / Migration
**Complexity:** High
**Layer:** Integration / Migration Tooling
**Source Blueprint:** `/Users/worsin/Development/VexCart`
**Target Project:** `ConvexPress`
**WordPress Equivalent:** WooCommerce migration and sync tooling
**Last Authored:** 2026-04-07

---

## Intent

The Commerce Woo Sync module connects ConvexPress commerce to an existing WooCommerce store for import, mapping, and migration workflows.

It is built on top of the `commerce` domain and owns:

- WooCommerce store connection management
- import job orchestration
- entity mapping between WooCommerce IDs and ConvexPress records
- import logs and progress tracking
- image queueing for imported assets

This module is optional. It is primarily for onboarding, migration, and interoperability rather than day-to-day storefront operation. It is available when the `commerce` system is enabled, with no separate toggle.

---

## Product Goals

1. Allow a merchant to connect a WooCommerce store using official REST API credentials.
2. Import catalog, customers, orders, reviews, coupons, and categories into ConvexPress.
3. Preserve source-to-target ID mappings for repeat-safe imports and reconciliation.
4. Give admins a clear import dashboard with progress, logs, and recoverable jobs.
5. Reuse ConvexPress-native content and commerce systems rather than mirroring Woo structures forever.

---

## Non-Goals

This tooling module does **not** own:

- the live storefront
- canonical product ownership after import
- WooCommerce plugin execution
- ongoing bidirectional sync as a guaranteed v1 feature

This should start as import-first, not as a permanent two-way synchronization promise.

---

## Source Blueprint In VexCart

VexCart already contains a meaningful WooCommerce integration subsystem in:

- `VexCart-Admin/packages/backend/convex/woocommerce/connection.ts`
- `VexCart-Admin/packages/backend/convex/woocommerce/jobs.ts`
- `VexCart-Admin/packages/backend/convex/woocommerce/import.ts`
- `VexCart-Admin/packages/backend/convex/woocommerce/progress.ts`
- `VexCart-Admin/packages/backend/convex/woocommerce/images.ts`

The admin UI also includes:

- `VexCart-Admin/apps/web/src/routes/admin/settings/woocommerce.tsx`

Observed capabilities include:

- connection creation and connection testing
- import jobs by type
- progress tracking
- entity mappings
- import logs
- image queueing
- pause and cancel controls
- full-store import flow

Observed import entity coverage in VexCart:

- categories
- products
- orders
- customers
- reviews
- coupons
- images

ConvexPress should preserve that import-job architecture and adapt the import target records to ConvexPress-native commerce and CMS structures.

---

## Module Definition

### Module ID

- `commerceWooSync`

### Required Parent Plugin

- `commerce` (WooSync is available when commerce is enabled; no separate toggle)

### Optional Helpful Dependencies

- `commerceReviews`
- `media`

### Registry Integration

WooSync does NOT get its own entry in the plugin registry (`registry.ts`). It is admin-only tooling under commerce operations, not a user-facing plugin.

### Access Control

WooSync admin routes are gated by `commerce` plugin enablement and admin capability checks (e.g., `commerce.wooSync.manageConnections`). There is no separate plugin toggle.

---

## Architectural Position

### This Module Owns

- external Woo connection metadata
- job lifecycle
- source-target mappings
- import logs and progress
- image import queueing

### This Module Depends On

- `commerce` products
- `commerce` orders
- `commerce` customers
- media library / media import support
- optional `commerceReviews` if reviews are imported

### This Module Does Not Replace

- native ConvexPress authoring
- core data ownership
- long-term commerce source of truth

---

## Core User Stories

### Merchant / Admin

- Connect an existing WooCommerce store.
- Test connectivity before importing.
- Start a full import or selected entity import.
- Watch job progress in real time.
- Review failures and rerun import safely.

### Migration Operator

- Preserve the mapping from Woo IDs to ConvexPress IDs.
- Skip duplicates or update existing records according to policy.
- Retry failed image imports without redoing the whole migration.

### Platform

- Import large stores in background batches.
- Fail safely and log enough detail to recover.

---

## Domain Model

Recommended tables:

- `commerce_woo_connections`
- `commerce_woo_import_jobs`
- `commerce_woo_id_map`
- `commerce_woo_import_logs`
- `commerce_woo_image_queue`

### `commerce_woo_connections`

Recommended fields:

- `storeUrl`
- `consumerKey`
- `consumerSecret`
- `status`
- `lastTestedAt?`
- `errorMessage?`
- `storeName?`
- `storeVersion?`
- `wcVersion?`
- `currency?`
- `currencySymbol?`
- `productCount?`
- `orderCount?`
- `customerCount?`
- `createdBy`
- `createdAt`
- `updatedAt`

### `commerce_woo_import_jobs`

Recommended fields:

- `connectionId`
- `jobType`
- `status`
- `totalRecords`
- `processedRecords`
- `failedRecords`
- `skippedRecords`
- `startedAt?`
- `completedAt?`
- `createdBy`
- `createdAt`
- `updatedAt`

### `commerce_woo_id_map`

Recommended fields:

- `connectionId`
- `wcEntityType`
- `wcEntityId`
- `convexEntityType`
- `convexEntityId`
- `createdAt`
- `updatedAt`

### `commerce_woo_import_logs`

Recommended fields:

- `jobId`
- `wcEntityType`
- `wcEntityId?`
- `action`
- `message`
- `metadata?`
- `createdAt`

### `commerce_woo_image_queue`

Recommended fields:

- `jobId`
- `entityType`
- `entityId`
- `sourceUrl`
- `status`
- `errorMessage?`
- `createdAt`
- `updatedAt`

---

## Job Model

Recommended job types for v1:

- `full`
- `categories`
- `products`
- `orders`
- `customers`
- `reviews`
- `coupons`
- `images`

Recommended job states:

- `pending`
- `running`
- `paused`
- `completed`
- `failed`
- `cancelled`

The import system should stay batch-oriented and scheduler-driven, matching the VexCart pattern.

---

## Import Rules

### General Rules

- imports must be idempotent where possible
- imports must create or update based on mapping state and configured strategy
- image imports should be decoupled from record creation through a queue
- failures should log per record without forcing whole-job collapse unless the connection is invalid

### Entity Rules

#### Categories

- map Woo product categories into ConvexPress commerce taxonomy or category systems

#### Products

- map Woo products and variations into ConvexPress product and variant models
- import pricing, SKU, inventory data, and media references

#### Orders

- import historical orders only if the project wants data continuity
- imported orders should be clearly marked as migrated data

#### Customers

- map customer records carefully to existing auth/user boundaries
- avoid accidental account duplication where matching by email is possible

#### Reviews

- import only if `commerceReviews` exists or planned compatibility is defined

#### Coupons

- map Woo coupons into ConvexPress discount/coupon systems

---

## Admin UX

### Admin Routes

Recommended routes:

- `/admin/commerce/woo-sync`
- `/admin/commerce/woo-sync/jobs`
- `/admin/commerce/woo-sync/jobs/$jobId`
- `/admin/commerce/woo-sync/mappings`
- `/admin/commerce/woo-sync/settings`

### Admin Screens

#### Connection Screen

- create connection
- edit credentials
- test connection
- show store metadata

#### Import Dashboard

- running jobs
- dashboard stats
- last completed import
- entity counts
- import controls

#### Job Detail

- progress bar
- ETA
- processed/skipped/failed counts
- recent logs
- image queue status
- pause/cancel controls

#### Settings

- plugin enablement
- import strategy defaults
- duplicate handling rules
- review import toggle
- image import behavior

---

## CMS And Commerce Integration

This module must adapt to ConvexPress-native structures.

That means:

- products import into `commerce`
- imported media enters the central media system
- reviews integrate with `commerceReviews` if enabled
- imported categories align with the project’s category/taxonomy model

This module should not create a parallel Woo-shaped runtime inside ConvexPress.

---

## Security Requirements

Required controls:

- stored Woo credentials must be treated as secrets
- admin-only access to sync operations
- connection test failures should not leak secrets
- import logs must avoid exposing sensitive credentials or personal data unnecessarily

---

## Permissions

Recommended capabilities:

- `commerce.wooSync.view`
- `commerce.wooSync.manageConnections`
- `commerce.wooSync.startJobs`
- `commerce.wooSync.pauseJobs`
- `commerce.wooSync.cancelJobs`
- `commerce.wooSync.viewLogs`
- `commerce.wooSync.manageSettings`

---

## Testing Strategy

Required test areas:

- connection validation
- idempotent re-import behavior
- mapping correctness
- image queue retry behavior
- pause/cancel behavior
- plugin-disabled behavior

---

## Rollout Plan

### Phase 1

- tooling registration and settings
- connection management
- job and mapping schema
- import dashboard scaffolding

### Phase 2

- product/category/customer import
- logs and progress tracking
- image queueing

### Phase 3

- orders, reviews, and coupons import
- reconciliation tooling
- rerun / retry tools

---

## Acceptance Criteria

The module is successful when:

- admins can connect to a WooCommerce store and validate credentials
- import jobs run in the background with visible progress and logs
- imported entities map cleanly into ConvexPress-native systems
- reruns do not create uncontrolled duplicates
- disabling the `commerce` parent plugin suppresses all Woo sync behavior
