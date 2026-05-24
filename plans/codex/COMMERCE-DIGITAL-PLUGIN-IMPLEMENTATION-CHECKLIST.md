# Commerce Digital Plugin - Implementation Checklist

**System:** Commerce Digital Plugin
**Status:** Planned
**Last Authored:** 2026-04-07
**Companion Spec:** `.codex/docs/COMMERCE-DIGITAL-PLUGIN-PRD.md`

---

## Working Rule

This checklist covers the `commerceDigital` plugin only.

Dependency:

- `commerce` must exist first

---

## Phase 1 - Plugin Foundation

### 1. Registry and Settings

Update:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
- shared settings defaults/validators/validation

Add:

- `commerceDigital`
- `commerceDigitalEnabled`

### 2. Dependency Enforcement

Ensure:

- `commerceDigital` cannot be enabled without `commerce`

---

## Phase 2 - Schema

### 3. Schema File

Create:

- `ConvexPress-Admin/packages/backend/convex/schema/commerceDigital.ts`

Update:

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

Add tables:

- `commerce_digital_files`
- `commerce_download_tokens`
- `commerce_download_log`
- `commerce_license_keys`
- `commerce_license_activations`

---

## Phase 3 - Backend Domain

### 4. Domain Module

Create:

- `ConvexPress-Admin/packages/backend/convex/commerceDigital/`

Suggested files:

- `helpers.ts`
- `validators.ts`
- `files.ts`
- `downloads.ts`
- `licenses.ts`

### 5. Commerce Integration

Integrate with `commerce` order completion so that:

- digital purchases generate download access
- license assignment occurs where required

### 6. Media Integration

Integrate with the existing media upload/storage model.

Do not create a parallel file library.

---

## Phase 4 - Admin UI

### 7. Admin Routes

Create routes under:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/digital/`

Suggested route files:

- `index.tsx`
- `files.tsx`
- `licenses.tsx`
- `licenses.$licenseId.tsx`
- `downloads.tsx`
- `settings.tsx`

### 8. Admin Components

Create:

- `ConvexPress-Admin/apps/web/src/components/commerce-digital/`

Suggested groups:

- `files/`
- `downloads/`
- `licenses/`

### 9. Product Editor Extension

Extend `commerce` product editor with:

- digital toggle
- digital file attachment UI
- version controls
- preview toggle
- requires-license toggle
- license inventory section

---

## Phase 5 - Website UX

### 10. Account Route

Create:

- `ConvexPress-Website/apps/web/src/routes/_dashboard/downloads.tsx`

### 11. Website Components

Create:

- `ConvexPress-Website/apps/web/src/components/commerce-digital/`

Suggested groups:

- `downloads/`
- `licenses/`

### 12. Dashboard Features

Implement:

- my downloads list
- my license keys list
- copy key UX
- download action with logging

---

## Phase 6 - Verification

### 13. Verification

- digital files can be attached to products
- completed orders generate downloads
- customer dashboard shows downloads
- download limits and expiry are enforced
- license flows work when enabled
- disabling plugin suppresses digital delivery behavior

