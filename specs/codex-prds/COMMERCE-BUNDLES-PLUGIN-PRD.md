# Commerce Bundles Plugin - PRD and Implementation Strategy

**System:** Commerce Bundles Plugin
**Status:** Planned
**Priority:** P2 - Medium
**Complexity:** Medium / High
**Layer:** Full Stack / Plugin
**Source Blueprint:** `/Users/worsin/Development/VexCart`
**Target Project:** `ConvexPress`
**WordPress Equivalent:** WooCommerce Product Bundles / Mix and Match / bundle extensions
**Last Authored:** 2026-04-07

---

## Intent

The Commerce Bundles Plugin adds curated multi-product selling models to ConvexPress commerce.

It is built on top of the `commerce` plugin and owns:

- bundle definitions
- bundle component rules
- bundle pricing logic
- customer component selections
- bundle-specific storefront and admin editing flows

This plugin is optional. It should make bundle-style merchandising possible without bloating core product or cart logic.

---

## Product Goals

1. Allow merchants to sell grouped products as a single purchasable offer.
2. Support curated fixed bundles, configurable bundles, and mix-and-match style bundles.
3. Support bundle-level pricing strategies without corrupting core product pricing.
4. Preserve clear cart, order, tax, shipping, and inventory behavior for bundled products.
5. Let the storefront present bundles as first-class product experiences.

---

## Non-Goals

This plugin does **not** own:

- the base product catalog
- cart ownership
- order ownership
- subscription ownership
- complex quote-builder or CPQ workflows

Those belong to `commerce` or later specialty plugins.

---

## Source Blueprint In VexCart

VexCart already contains a meaningful bundle subsystem in:

- `VexCart-Admin/packages/backend/convex/bundles.ts`

That source model already includes:

- bundle records
- component definitions
- customer selections
- bundle pricing strategies
- storefront bundle listing and detail pages

Observed pricing types in VexCart:

- `fixed`
- `percent_off`
- `amount_off`
- `component_sum`

Observed bundle types in VexCart:

- `fixed`
- `mix_and_match`
- `bogo`

ConvexPress should keep the good bundle semantics, but reshape them around the ConvexPress plugin boundary and WooCommerce-style product architecture.

---

## Plugin Definition

### Plugin ID

- `commerceBundles`

### Required Dependency

- `commerce`

### Registry Integration

Add to:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Recommended metadata:

- `id`: `commerceBundles`
- `title`: `Commerce Bundles`
- `description`: `Product bundles, configurable bundle offers, and bundle pricing rules`
- `settingsKey`: `commerceBundlesEnabled`
- `dependsOn`: `["commerce"]`
- `adminAccessPrefixes`: `["/admin/commerce/bundles"]`
- `routePrefixes`: `["/bundles"]`

### Plugin Gating Rule

If `commerceBundlesEnabled === false`:

- bundle product authoring must be hidden
- bundle storefront routes must not render
- bundle-specific buy boxes must not render
- bundle pricing and validation must not execute in cart flows

---

## Architectural Position

### This Plugin Owns

- bundle product overlays
- component requirement rules
- bundle pricing resolution
- bundle selection validation
- bundle-specific merchandising

### This Plugin Depends On

- `commerce` products
- `commerce` pricing and totals services
- `commerce` cart APIs
- `commerce` inventory policy

### This Plugin Does Not Replace

- variable products
- kits built manually with separate cart lines
- advanced custom product configurators

---

## Core User Stories

### Merchant

- Create a fixed bundle composed of multiple existing products.
- Create a configurable bundle where customers must choose from allowed component options.
- Set minimum and maximum required selections per component group.
- Define bundle pricing as fixed price, discount-from-components, or component sum.
- Publish a bundle as a storefront offer with its own description and imagery.

### Shopper

- Browse bundle listing and bundle detail pages.
- Understand what is included and what must be selected.
- Configure required selections without invalid combinations.
- Add the configured bundle to cart as a coherent purchasable unit.

### Operations / Admin

- See bundle composition inside orders.
- Understand whether stock is reserved from underlying products.
- Refund or adjust bundles without losing the original component snapshot.

---

## Domain Model

Recommended tables:

- `commerce_product_bundles`
- `commerce_bundle_components`
- `commerce_bundle_component_options`

Optional order/cart snapshot records are likely stored inside `commerce` cart and order line metadata rather than new top-level tables.

### `commerce_product_bundles`

Recommended fields:

- `productId`
- `bundleType`
- `pricingType`
- `fixedPrice?`
- `discountPercent?`
- `discountAmount?`
- `isActive`
- `displaySubtitle?`
- `displayHighlights?`
- `selectionSummaryMode`
- `createdAt`
- `updatedAt`

### `commerce_bundle_components`

Recommended fields:

- `bundleId`
- `name`
- `description?`
- `selectionMode`
- `isRequired`
- `minSelections`
- `maxSelections`
- `sortOrder`
- `createdAt`
- `updatedAt`

### `commerce_bundle_component_options`

Recommended fields:

- `componentId`
- `productId`
- `variantId?`
- `defaultQuantity`
- `minQuantity`
- `maxQuantity`
- `isDefault`
- `sortOrder`
- `createdAt`
- `updatedAt`

---

## Bundle Model

Recommended supported bundle types for v1:

- `fixed`
  - predefined components, no shopper choice or very limited choice
- `configurable`
  - shopper selects from permitted options within one or more component groups
- `mixAndMatch`
  - shopper fills required slot counts from a pool or pools

`bogo` should not be the required v1 bundle type.

Reason:

- `bogo` is closer to promotions and discount rules than curated bundle merchandising
- it is better treated as a future `commercePromotions` concern unless VexCart’s exact bundle semantics require it

---

## Pricing Model

Recommended pricing modes:

- `fixed`
  - bundle total is an explicit price
- `componentSum`
  - bundle total equals selected item totals
- `percentOff`
  - bundle total equals selected item totals minus a bundle discount percent
- `amountOff`
  - bundle total equals selected item totals minus a fixed discount amount

### Rule

Bundle pricing should resolve through the core `commerce` pricing pipeline, but the bundle plugin should provide the pricing input adapter.

That keeps:

- tax calculations centralized
- discounts consistent
- order totals stable

---

## Cart Representation

Recommended v1 representation:

- one cart line for the bundle parent
- bundle configuration snapshot stored on the line
- underlying component details stored as normalized metadata

Why:

- simpler storefront and checkout presentation
- cleaner quantity handling
- easier order readability
- preserves the exact customer configuration at purchase time

Core line metadata should include:

- `bundleId`
- `bundleSnapshot`
- `selectedComponents`
- `underlyingProductIds`
- `pricingBreakdown`

---

## Order Representation

Orders should preserve:

- bundle parent line item
- selected component snapshot
- per-component quantity details
- resolved pricing mode and pricing math

The order detail page must show:

- bundle title
- component selections
- quantities
- any customization summary

This is required for support, returns, and fulfillment accuracy.

---

## Inventory And Fulfillment Rules

Recommended default:

- inventory is reserved and decremented from underlying products and variants
- bundle parent product is virtual from an inventory standpoint unless explicit bundle stock is added later

This avoids duplicated stock accounting.

Future enhancement:

- optional bundle-level inventory caps for merchants who pre-pack bundles

That should be deferred unless there is a clear operational need.

---

## Admin UX

### Admin Routes

Recommended routes:

- `/admin/commerce/bundles`
- `/admin/commerce/bundles/new`
- `/admin/commerce/bundles/$bundleId`
- `/admin/commerce/bundles/settings`

### Admin Screens

#### Bundle Index

- search/filter bundles
- status badges
- bundle type
- product linkage
- active/inactive state

#### Bundle Editor

- linked product selector
- bundle type selector
- pricing mode selector
- component group builder
- component option selector
- min/max validation
- merchandising content fields
- preview summary

#### Settings

- plugin enablement
- allowed bundle types
- default inventory resolution mode
- default storefront presentation options

---

## Storefront UX

### Public Routes

Recommended routes:

- `/bundles`
- `/bundles/$slug`

If bundle products also live under regular product routes, the standalone `/bundles` surface should still exist for archive and discovery.

### Storefront Components

Suggested component groups:

- `BundleCard`
- `BundleDetail`
- `BundleConfigurator`
- `BundleComponentGroup`
- `BundlePricingSummary`
- `BundleIncludedProducts`

### Storefront Requirements

- clear bundle summary
- responsive selection UI
- disabled add-to-cart until valid configuration is complete
- real-time bundle total updates
- mobile-safe configuration controls

---

## CMS Integration

This plugin should integrate with ConvexPress CMS surfaces.

Recommended additions:

- product/bundle showcase blocks
- shortcode or dynamic embed support later if the project continues that pattern

Possible block shapes:

- `bundleGrid`
- `bundleCard`
- `featuredBundle`

These should remain optional and depend on storefront component maturity.

---

## Validation Rules

At minimum validate:

- bundle product exists and is purchasable
- selected options belong to the selected bundle
- required components are satisfied
- quantity limits are respected
- pricing mode has all required parameters
- underlying products are active and allowed

Cart and checkout must reject invalid bundle payloads even if the UI allowed them.

---

## Permissions

Recommended capabilities:

- `commerce.bundles.view`
- `commerce.bundles.create`
- `commerce.bundles.edit`
- `commerce.bundles.delete`
- `commerce.bundles.publish`
- `commerce.bundles.manageSettings`

---

## Analytics

Recommended analytics events:

- bundle viewed
- bundle configured
- bundle added to cart
- bundle purchase completed
- bundle configuration abandoned

---

## Testing Strategy

Required test areas:

- pricing math per bundle pricing mode
- component validation rules
- invalid selection rejection
- cart persistence of bundle metadata
- order snapshot accuracy
- plugin-disabled behavior
- inventory interaction on purchase

---

## Rollout Plan

### Phase 1

- plugin registration and settings
- schema
- backend bundle CRUD and validation
- admin editor for bundles

### Phase 2

- storefront bundle listing and detail routes
- bundle configurator UI
- add-to-cart integration

### Phase 3

- order presentation
- analytics
- CMS block integration

---

## Acceptance Criteria

The plugin is successful when:

- merchants can create bundle offers from existing products
- shoppers can configure valid bundles on the storefront
- bundles add to cart through a stable validated contract
- orders preserve exact bundle composition
- inventory uses the underlying products correctly
- disabling the plugin cleanly removes bundle behavior

