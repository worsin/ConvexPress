# Commerce Bundles Production Implementation Plan

Date: 2026-04-10
Scope: Product bundles only
Owner workspace: `ConvexPress-Admin/` owns schema, Convex functions, and deployment
Consumer workspace: `ConvexPress-Website/` consumes the admin-owned Convex deployment

## Purpose

This document replaces the stale "planned" bundle checklist as the execution plan
for bringing the product bundles system to production quality.

The key conclusion from the audit:

- the bundle module exists
- the admin route exists
- the storefront routes exist
- the surrounding commerce systems do not currently treat bundles as a valid,
  purchasable line type

As implemented today, bundles are not production-ready because the system does not
have a coherent contract connecting bundle configuration, cart persistence,
checkout, order snapshots, and inventory operations.

## Current State Summary

### What exists

- bundle schema in `packages/backend/convex/schema/commerceBundles.ts`
- bundle Convex queries and mutations in `packages/backend/convex/commerceBundles/`
- admin bundle management route
- storefront bundle archive and detail routes
- plugin registry entry and plugin setting

### What is broken

- bundle detail page calls the normal cart API with a bundle document ID instead
  of a `commerce_products` ID
- bundle detail page does not pass the required `sessionToken` to the cart API
- bundle selections are saved as detached records and are not reliably linked to
  cart items or order items
- checkout does not copy bundle metadata or selection snapshots into order items
- core inventory logic allocates against order item `productId` only and has no
  bundle expansion layer
- public plugin gating for bundles is incomplete on the website
- pricing and availability logic are inconsistent with component overrides,
  variants, and configurable selection semantics
- the admin UI only exposes a small subset of the schema fields that affect
  bundle behavior
- there are no bundle-focused tests

## Production Target

Bundles must become a first-class commerce extension with these properties:

1. A bundle is purchasable through the same cart and checkout pipeline as normal
   products.
2. A bundle line persists a full server-validated configuration snapshot.
3. Orders preserve the exact selected components and resolved pricing at the
   time of purchase.
4. Inventory reservation, allocation, cancellation, and refund flows operate on
   the underlying component products and variants.
5. Public and admin behavior respect plugin enablement and bundle lifecycle
   state.
6. The admin authoring UI exposes every supported capability and no unsupported
   dead fields.

## Architectural Decision

### Adopt bundle-backed commerce products

Bundles should not be inserted into carts directly as `commerce_bundles` rows.
The core commerce system already assumes that purchasable line items are
`commerce_products`.

The production model should be:

- one `commerce_products` row is the canonical purchasable item
- one `commerce_bundles` row defines bundle-specific configuration and pricing
- the bundle row links to its owning product row via `productId`
- carts and orders store the owning product ID plus typed bundle metadata

This preserves the core commerce ownership model while letting bundles extend it.

### Why this model

- existing cart, checkout, and order schemas already depend on `productId`
- storefront and admin product infrastructure can be reused
- shipping, tax, and order history stay aligned with the core commerce model
- bundle-specific logic can live in the plugin boundary without rewriting the
  entire commerce stack

## Required Runtime Contract

Every bundle cart line must carry one canonical bundle snapshot payload.

Recommended cart/order item metadata shape:

```ts
type BundleLineMetadata = {
  lineType: "bundle";
  bundleId: Id<"commerce_bundles">;
  bundleSlug: string;
  bundleName: string;
  owningProductId: Id<"commerce_products">;
  bundleType: "fixed" | "mix_and_match" | "bogo";
  pricingType: "fixed" | "percent_off" | "amount_off" | "component_sum";
  regularPriceAmount: number;
  resolvedBundlePriceAmount: number;
  selections: Array<{
    componentId: Id<"commerce_bundle_components">;
    componentLabel?: string;
    productId: Id<"commerce_products">;
    productTitle: string;
    variantId?: Id<"commerce_product_variants">;
    variantTitle?: string;
    quantity: number;
    unitPriceAmount: number;
    lineTotalAmount: number;
  }>;
};
```

This metadata must be:

- created server-side
- validated server-side
- persisted on cart items
- copied forward to order items unchanged except for any additional order-level
  fields

## Workstream 1: Schema and Data Model

### Goal

Create a stable data model that lets bundles participate in the commerce runtime.

### Changes

1. Update `ConvexPress-Admin/packages/backend/convex/schema/commerceBundles.ts`
   to add:
   - `productId: v.id("commerce_products")`

2. Decide whether `commerce_bundle_selections` remains necessary.
   Recommended:
   - keep it only as an optional staging/logging table during migration
   - make cart item metadata and order item metadata the canonical snapshots

3. Update `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts`
   documentation and typing expectations around:
   - `commerce_cart_items.metadata`
   - `commerce_order_items.metadata`

4. Add invariants in runtime:
   - a bundle cannot be activated without an owning product
   - a bundle owning product cannot be trash/deleted while the bundle is active
   - one bundle owns one product and one product backs at most one bundle

### Deliverables

- schema updated
- migration or backfill plan for existing bundle rows
- canonical metadata contract documented in code comments or adjacent docs

## Workstream 2: Product Linkage

### Goal

Make bundles visible to the core commerce product system.

### Changes

1. Extend bundle creation so it either:
   - creates an owning `commerce_products` row automatically, or
   - requires selecting an existing product to convert into a bundle-backed
     product

2. Add explicit bundle linkage read helpers in:
   - `packages/backend/convex/commerce/products.ts`
   - `packages/backend/convex/commerceBundles/queries.ts`

3. Add admin affordances so merchants can navigate between:
   - product editor
   - bundle editor

### Production recommendation

For v1 production hardening, auto-create the owning product row when a bundle is
created. This reduces invalid intermediate states.

## Workstream 3: Pricing Engine Rewrite

### Goal

Make all bundle prices come from one correct backend implementation.

### Problems to fix

- `calculatePrice` computes a resolved `price` but adds base product price
  instead of the resolved price
- `recalculateBundlePrice` ignores component-level overrides and discounts
- pricing behavior differs between admin display, storefront display, and saved
  selection totals

### Changes

1. Extract a shared bundle pricing helper module, for example:
   - `packages/backend/convex/commerceBundles/pricing.ts`

2. That helper must:
   - resolve base price from selected product or variant
   - apply component `priceOverride`
   - apply component `discountPercent`
   - apply bundle pricing mode
   - return:
     - regular total
     - resolved bundle total
     - savings amount
     - savings percent
     - per-selection unit and line totals

3. Make these call the same helper:
   - `queries.calculatePrice`
   - `mutations.saveSelection`
   - bundle price recalculation after component changes

4. Define display semantics for `component_sum` bundles with optional choices.
   Recommended:
   - if no shopper choice exists yet, show "price varies" unless a meaningful
     deterministic default configuration exists

### Deliverables

- one shared pricing implementation
- no duplicate pricing formulas in routes or mutations

## Workstream 4: Validation Layer Rewrite

### Goal

Reject invalid bundle configurations server-side and enforce all bundle rules.

### Rules to enforce

1. Selected component must belong to the bundle.
2. Selected product must match the component's allowed product.
   If later multi-option components are introduced, validate against that
   allowed option set.
3. Selected variant must belong to the selected product.
4. Variant substitution only allowed when `allowVariantChange` permits it.
5. Required components must be present.
6. Per-component quantity must respect:
   - `minQuantity`
   - `maxQuantity`
7. Bundle-wide item count must respect:
   - `minItems`
   - `maxItems`
8. Bundle must be active and plugin-enabled for public purchase flows.
9. Bundle component products must still exist and be purchasable.

### Changes

1. Add a dedicated validation helper module, for example:
   - `packages/backend/convex/commerceBundles/validation.ts`

2. Use it in:
   - public price calculation
   - add-to-cart bundle flow
   - availability checks
   - checkout revalidation before order creation if needed

3. Update `getBySlug` to reject non-active bundles for public routes.

## Workstream 5: Cart Integration

### Goal

Make bundles a typed and valid cart line.

### Changes

1. Extend `addCartItemArgs` in
   `ConvexPress-Admin/packages/backend/convex/commerce/validators.ts`
   with optional bundle metadata input.

2. Update `commerce/cart.ts` `addItem` to:
   - require `sessionToken` for public route usage
   - accept only owning `commerce_products` IDs
   - detect when a product is bundle-backed
   - validate bundle input through the bundle validation layer
   - compute line price from resolved bundle pricing
   - persist typed bundle metadata on `commerce_cart_items.metadata`

3. Define merge behavior.
   Recommended:
   - fixed bundles with identical snapshot can merge
   - configurable bundles merge only when the selection snapshot is identical
   - otherwise create a new cart item

4. Update `getMine` to return metadata needed for website cart rendering.

### Deliverables

- one supported add-to-cart flow for bundles
- no detached selection records required for normal cart usage

## Workstream 6: Storefront Bundle UX Fixes

### Goal

Make the public bundle flow use the commerce runtime correctly.

### Changes

1. Update
   `ConvexPress-Website/apps/web/src/routes/_marketing/bundles/$slug.tsx`
   to:
   - use `useCommerceSessionToken`
   - require readiness before add-to-cart
   - pass owning product ID, not bundle ID
   - send a typed bundle payload to the cart mutation
   - optionally run `checkAvailability` before enabling purchase

2. Update website cart rendering in
   `ConvexPress-Website/apps/web/src/routes/_marketing/cart.tsx`
   to:
   - recognize bundle lines
   - render bundle title and selected component breakdown
   - preserve shopper clarity around bundle pricing

3. Update checkout review and order display if needed so bundle summaries are
   visible to the customer.

## Workstream 7: Checkout and Order Snapshot Integration

### Goal

Preserve bundle state from cart through completed order.

### Changes

1. Update `ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts`
   so cart item metadata is copied into `commerce_order_items.metadata`.

2. For bundle lines, persist:
   - bundle identity
   - resolved component snapshot
   - resolved line pricing

3. Add bundle-aware order enrichment helpers so admin and customer order views
   can render bundle details consistently.

4. If `commerce_bundle_selections` is retained, add explicit linkage from the
   created order item to the saved selection record, but do not rely on that
   table as the only source of truth.

### Deliverables

- order item snapshot fidelity
- support/refund workflows can inspect exactly what was purchased

## Workstream 8: Inventory Integration

### Goal

Make bundle purchases affect underlying product inventory correctly.

### Current problem

The inventory and order allocation code operates on order item `productId`
directly. That only works for normal products. Bundles need expansion into their
component products and variants.

### Changes

1. Add a bundle inventory expansion helper, for example:
   - `packages/backend/convex/commerceBundles/inventory.ts`

2. It must convert a bundle cart or order line into normalized inventory
   allocations:
   - productId
   - variantId
   - quantity

3. Update inventory-sensitive flows in:
   - `commerce/inventory.ts`
   - `commerce/orders.ts`
   - any checkout reservation flow added later

4. Apply expansion consistently for:
   - availability checks
   - reservation
   - payment capture / allocation
   - cancellation / failure release
   - refund restock

5. Decide the role of bundle-level stock fields:
   - `stockCount`
   - `trackInventory`
   - `allowPartialStock`

Production recommendation:

- underlying component inventory is canonical
- bundle-level stock should either be removed for v1 or clearly defined as an
  optional merchandising cap on top of component stock

## Workstream 9: Plugin Gating and Public Settings

### Goal

Make bundle availability consistent with plugin enablement.

### Changes

1. Update
   `ConvexPress-Website/apps/web/src/components/plugins/PublicPluginGate.tsx`
   to support `commerceBundles`.

2. Update
   `ConvexPress-Website/apps/web/src/contexts/SettingsContext.tsx`
   typings to include:
   - `commerceBundlesEnabled`
   - any other already-exposed public plugin settings currently missing

3. Wrap public bundle routes with `PublicPluginGate`.

4. Keep backend gating in `requireCommerceBundlesEnabled`.

### Deliverables

- disabled plugin means bundle pages and buy flows are unavailable everywhere

## Workstream 10: Admin Authoring Completion

### Goal

Expose every supported bundle capability in the admin UI and remove unsupported
dead fields.

### Current UI gaps

The current route only supports:

- basic bundle creation
- limited pricing edits
- basic component add/remove/reorder

It does not fully manage:

- owning product link
- bundle min/max items
- category/tag assignments
- SEO metadata
- variant selection
- per-component min/max quantity
- component price overrides
- component discount percent
- allow variant changes
- allow partial stock behavior

### Changes

1. Expand the admin bundle route or split it into focused sections/components.
2. Add a clear authoring flow:
   - create bundle
   - attach or create owning product
   - configure pricing
   - configure bundle rules
   - configure components
   - publish
3. Add UI validation that matches backend rules but never replaces backend
   validation.
4. If any fields are intentionally not shipping in v1, delete or defer them in
   schema rather than leaving them half-implemented.

## Workstream 11: Operational Metrics and Maintenance

### Goal

Remove dead counters and add the small operational features needed for production.

### Changes

1. Either wire `purchaseCount` to completed order flows or remove it for now.
2. Add bundle usage/admin summary metrics only after the underlying order
   integration is correct.
3. Add cleanup rules for orphaned staging records if `commerce_bundle_selections`
   remains in any form.

## Workstream 12: Type Safety and Code Quality

### Goal

Reduce runtime risk in the bundle system itself.

### Changes

1. Remove `// @ts-nocheck` from bundle backend files.
2. Replace `as any` in bundle route call sites with generated API types where
   possible.
3. Move route-local pricing and validation assumptions into typed backend helpers.
4. Keep bundle logic in small focused modules:
   - helpers
   - validation
   - pricing
   - inventory expansion

This work should stay bundle-scoped and not expand into unrelated repo-wide type
debt.

## Recommended Implementation Sequence

### Phase 1: Contracts and schema

1. Add owning product linkage to bundles.
2. Define canonical bundle line metadata shape.
3. Decide whether `commerce_bundle_selections` is canonical or transitional.

### Phase 2: Pricing and validation core

1. Extract shared pricing helper.
2. Extract shared validation helper.
3. Fix `calculatePrice`, `saveSelection`, and admin recalculation paths.

### Phase 3: Cart integration

1. Extend cart validator and mutation contract.
2. Add bundle-aware add-to-cart handling.
3. Update storefront bundle detail route to use the new contract.

### Phase 4: Checkout, orders, and inventory

1. Persist bundle metadata through checkout to order items.
2. Add inventory expansion layer.
3. Update allocation and release flows.

### Phase 5: Admin and storefront completion

1. Finish admin authoring coverage.
2. Update cart/order rendering for bundle lines.
3. Fix public plugin gating and route protection.

### Phase 6: Verification and hardening

1. Add tests.
2. Remove bundle-specific type escapes.
3. Audit production edge cases and regressions.

## Test Plan

### Backend tests

1. Bundle creation requires an owning product or creates one automatically.
2. Fixed bundle pricing is computed correctly.
3. Configurable bundle pricing honors:
   - variant prices
   - component overrides
   - component discounts
   - bundle pricing mode
4. Invalid selections are rejected:
   - missing required component
   - wrong product for component
   - wrong variant for product
   - quantity below min
   - quantity above max
   - bundle below minItems
   - bundle above maxItems
5. Cart add item stores correct bundle metadata.
6. Checkout copies bundle metadata to order items.
7. Inventory reservation and allocation expand correctly to underlying products.
8. Cancellation and refund restore stock correctly.

### Website tests

1. Public bundle routes are hidden when plugin is disabled.
2. Bundle detail page cannot add to cart without a session token.
3. Valid bundle configuration adds successfully.
4. Cart renders bundle selection summary correctly.
5. Checkout review and order screens show bundle line details correctly.

### Admin tests

1. Admin can author a complete bundle configuration.
2. Admin edits persist all supported bundle fields.
3. Publishing rules prevent invalid live bundles.

## Acceptance Criteria

The bundle system is production-ready only when all of the following are true:

1. A shopper can configure and purchase a bundle through the normal cart and
   checkout flow.
2. The cart line is backed by a `commerce_products` row and carries a typed
   bundle snapshot.
3. The order item preserves the exact purchased configuration.
4. Inventory operations affect underlying component stock correctly.
5. Public pages never expose disabled, draft, or archived bundles.
6. Admin UI exposes all supported v1 behavior and no unsupported dead paths.
7. Automated tests cover the end-to-end bundle contract.

## Explicit Non-Goals For This Remediation

To keep this production hardening focused, this plan does not expand the bundle
feature into:

- advanced CPQ
- arbitrary multi-option component pools beyond the current schema
- promotions-engine replacement
- subscriptions integration
- digital products integration
- unrelated commerce type-system cleanup outside bundle touchpoints

## Next Execution Step

Start Phase 1 by changing the schema and runtime contract:

1. add `productId` to `commerce_bundles`
2. define the canonical bundle metadata payload
3. upgrade the cart mutation contract so bundle lines can be stored safely

That is the first point where the system begins to converge on a coherent
production architecture.
