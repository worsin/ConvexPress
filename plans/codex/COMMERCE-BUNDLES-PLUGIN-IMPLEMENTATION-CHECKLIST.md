# Commerce Bundles Plugin - Implementation Checklist

**System:** Commerce Bundles Plugin
**Status:** Planned
**Last Authored:** 2026-04-07
**Companion Spec:** `.codex/docs/COMMERCE-BUNDLES-PLUGIN-PRD.md`

---

## Working Rule

This checklist covers the `commerceBundles` plugin only.

Dependency:

- `commerce` must exist first

---

## Phase 1 - Plugin Foundation

### 1. Registry and Settings

Update:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
- shared settings defaults/validators/validation

Add:

- `commerceBundles`
- `commerceBundlesEnabled`

---

## Phase 2 - Schema

### 2. Schema File

Create:

- `ConvexPress-Admin/packages/backend/convex/schema/commerceBundles.ts`

Update:

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

Add tables:

- `commerce_product_bundles`
- `commerce_bundle_components`
- `commerce_bundle_component_options`

---

## Phase 3 - Backend Domain

### 3. Domain Module

Create:

- `ConvexPress-Admin/packages/backend/convex/commerceBundles/`

Suggested files:

- `helpers.ts`
- `validators.ts`
- `pricing.ts`
- `queries.ts`
- `mutations.ts`

### 4. Commerce Integration

Integrate with `commerce` for:

- product linkage
- pricing pipeline adapters
- cart line payload validation
- order line snapshot generation
- inventory expansion rules

### 5. Bundle Validation Layer

Add validation support for:

- required component rules
- min/max selection counts
- allowed product/variant options
- pricing mode completeness

---

## Phase 4 - Admin UI

### 6. Admin Routes

Create routes under:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/bundles/`

Suggested route files:

- `index.tsx`
- `new.tsx`
- `$bundleId.tsx`
- `settings.tsx`

### 7. Admin Components

Create:

- `ConvexPress-Admin/apps/web/src/components/commerce-bundles/`

Suggested groups:

- `lists/`
- `editor/`
- `components/`
- `settings/`

### 8. Product Authoring Integration

Extend core commerce product authoring to support:

- marking a product as a bundle-backed product
- linking bundle metadata to a storefront product record

---

## Phase 5 - Website UX

### 9. Website Routes

Create:

- `ConvexPress-Website/apps/web/src/routes/_marketing/bundles.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/bundles_.$slug.tsx`

### 10. Website Components

Create:

- `ConvexPress-Website/apps/web/src/components/commerce-bundles/`

Suggested groups:

- `archive/`
- `detail/`
- `configurator/`
- `cards/`

### 11. Cart UI Integration

Extend storefront cart and product detail flows with:

- bundle configuration payload creation
- bundle pricing summary rendering
- invalid configuration prevention

---

## Phase 6 - Orders And Operations

### 12. Order Rendering

Extend admin and customer order views to show:

- bundle parent line details
- selected component breakdown
- pricing summary

### 13. Inventory Rules

Integrate bundle purchase flows with:

- underlying product stock decrement
- availability checks before add-to-cart and checkout

---

## Phase 7 - Verification

### 14. Verification

- bundle CRUD works
- storefront bundle listing and detail pages render when enabled
- valid configurations add to cart
- invalid configurations are rejected server-side
- order line snapshots preserve bundle choices
- inventory behavior follows underlying products
- disabling plugin suppresses bundle behavior

