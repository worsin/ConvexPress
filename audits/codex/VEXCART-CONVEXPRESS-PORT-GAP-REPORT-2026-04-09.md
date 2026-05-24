# VexCart to ConvexPress Port Gap Report

Date: 2026-04-09
Source: `/Users/worsin/Development/VexCart`
Target: `/Users/worsin/Development/ConvexPress`

## Scope

This report compares the live VexCart commerce implementation against the live ConvexPress commerce/plugin implementation.

It is based on code, schema, routes, and plugin registration, not earlier planning docs.

## Bottom Line

ConvexPress is no longer at the "commerce foundation only" stage.

What is already materially ported:

- commerce catalog, cart, checkout, orders, payments, tax
- shipping runtime plus provider connection infrastructure
- subscriptions backend runtime
- digital downloads/licenses backend runtime
- reviews backend runtime
- wishlists backend runtime

What still has real gaps:

- bundles never made it over
- returns/RMA never made it over
- fulfillment operations never made it over as a first-class subsystem
- several advanced VexCart product/catalog features never made it over
- customer account/address management is still much thinner in ConvexPress
- some ported subsystems are stranded in backend/schema and not exposed through plugin settings or UI

## Status Matrix

| Area | Status | Notes |
| --- | --- | --- |
| Commerce core | Partial parity | Real runtime exists, but VexCart still has richer product, customer, and operations surface |
| Payments | Mostly ported | Backend is close; admin UX is much thinner |
| Tax | Mostly ported | Backend exists; no dedicated admin tax screen parity |
| Shipping | Partial parity | ConvexPress has stronger provider infrastructure, but some VexCart shipping admin/features are missing |
| Subscriptions | Backend ported, UI not finished | Runtime exists; admin and website screens are still scaffold-level |
| Digital products | Backend ported, UI/plugin exposure missing | Near 1:1 backend, but no product editor/admin/dashboard surfaces |
| Reviews | Backend ported, UI/plugin exposure missing | Near 1:1 backend, but no moderation or customer UI |
| Wishlists | Backend ported, UI/plugin exposure missing | Near 1:1 backend, but no storefront/dashboard/admin UI |
| Bundles | Not ported | No backend, schema, admin, or storefront equivalent found |
| Returns | Not ported | No backend, schema, admin, or customer return flow found |
| Fulfillment | Not ported as subsystem | ConvexPress has shipment updates/labels on orders, but not VexCart fulfillment domain |
| Membership | Net-new ConvexPress domain | Useful, but not a substitute for missing VexCart commerce features |

## Features That Did Not Make It Over

### 1. Bundles are absent

VexCart has a dedicated bundles domain with backend, admin routes, and storefront routes:

- backend: `bundles.ts`
- admin: `admin/bundles.tsx`, `admin/bundles_.$id.tsx`
- website: `_marketing/bundles.tsx`, `_marketing/bundles_.$slug.tsx`

ConvexPress has no equivalent backend module, schema, admin route, or storefront route for bundles.

### 2. Returns/RMA are absent

VexCart has a dedicated returns subsystem:

- backend: `returns.ts`
- admin: `admin/returns.tsx`
- website: `_dashboard/orders/$orderId_.return.tsx`
- schema surface includes `return_requests` and `return_labels`

ConvexPress has no `commerceReturns` plugin, no return schema, no admin returns route, and no customer return flow.

### 3. Fulfillment operations are absent as a first-class system

VexCart has a dedicated fulfillment module with:

- fulfillment orders
- assignment and priority
- manifests
- return labels
- shipping cost records
- shipping analytics

ConvexPress does have order shipment mutations and shipping-label-related fields inside order flows, but no dedicated fulfillment backend or UI comparable to VexCart's `fulfillment.ts`.

### 4. Advanced product/catalog features are missing

These VexCart product capabilities do not have matching ConvexPress equivalents:

- product option type/value management
- variant generation and variant CRUD
- product view tracking and viewer presence
- recommendations and personalized recommendations
- search suggestions and advanced search/filter APIs
- product comparison

Evidence:

- VexCart `products.ts` exports option, variant, recommendation, search, presence, and comparison-adjacent behavior.
- ConvexPress `commerce/products.ts` exports only list/count/get/listPublished/getBySlug/create/update.
- ConvexPress product/admin searches did not show meaningful variant option management outside schema references.

### 5. Abandoned-order operations are missing

VexCart has an explicit admin abandoned-orders route:

- `VexCart-Admin/apps/web/src/routes/admin/orders/abandoned.tsx`

No abandoned-order admin surface or commerce-specific abandoned-order runtime was found in ConvexPress.

### 6. Customer account depth is still behind VexCart

VexCart customer/account features include:

- address CRUD and default address management
- preferences and email preferences
- email change flow
- account deletion flow
- tax exemption controls
- richer customer stats/admin detail

ConvexPress commerce customer runtime is much thinner:

- backend: `commerce/customers.ts` only exposes `list` and `getMine`
- website addresses page is still a scaffold

This means customer account parity did not make it over.

## Features That Were Ported But Not Finished End-to-End

### 7. Subscriptions backend exists, but UI parity did not make it over

This is one of the biggest corrections to the earlier gap note.

ConvexPress now has a substantial subscriptions runtime:

- backend queries, mutations, internals, and actions under `commerceSubscriptions/`
- renewal processing
- dunning processing
- entitlement logic
- invoice queries

But the admin and website surfaces are still placeholders/scaffolds:

- admin subscriptions page says lifecycle management "will be built here"
- website subscriptions pages say runtime "will render here once connected"

So subscriptions are not missing, but UI parity is still incomplete.

### 8. Digital products were ported deeply in backend/schema, but not exposed

ConvexPress has strong digital backend parity:

- file upload/update/delete
- download token generation and validation
- download history
- license key generation/import/assignment/revocation
- activation/deactivation and validation

This is close to VexCart's `digitalProducts.ts`.

What did not make it over:

- no plugin registration/default/settings support for a real `commerceDigital` toggle
- no ConvexPress admin product editor equivalent to VexCart's `digital-files-manager.tsx`
- no customer downloads dashboard route

### 9. Reviews were ported in backend/schema, but not exposed

ConvexPress reviews backend is also near-parity:

- submit/update/remove
- helpful voting
- moderation queues
- bulk approve/reject
- stats and rating aggregation queries

What did not make it over:

- no plugin registration/default/settings support for reviews
- no admin moderation route equivalent to VexCart `admin/reviews.tsx`
- no customer dashboard reviews route equivalent to VexCart `_dashboard/reviews.tsx`
- no storefront product review UI

### 10. Wishlists were ported in backend/schema, but not exposed

ConvexPress wishlists backend is likewise near-parity:

- create/update/delete wishlist
- add/remove items
- move to cart
- sharing
- guest merge
- analytics/popular/recent queries

What did not make it over:

- no plugin registration/default/settings support for wishlists
- no customer dashboard wishlist route
- no shared public wishlist route like VexCart `_marketing/wishlist.$token.tsx`
- no storefront wishlist controls
- no admin wishlist analytics page like VexCart `admin/analytics/wishlists.tsx`

## Plugin-System Gap

ConvexPress has a plugin-system mismatch that strands ported commerce code:

- plugin registry only defines `commerce`, `commerceSubscriptions`, and `membership` as real commerce plugins
- plugin settings validators/defaults only include `commerceEnabled` and `commerceSubscriptionsEnabled`
- backend helper checks exist for `commerceReviewsEnabled` and `commerceWishlistsEnabled`, but those settings are not actually defined in plugin settings

That means several VexCart-derived commerce subsystems exist in code but are not fully wired into the plugin manager or settings model.

## Important Corrections To Earlier ConvexPress Commerce Notes

The earlier Codex gap note understates how much was ported in backend/schema.

These areas are no longer "missing" in the strict sense:

- payments runtime
- tax runtime
- subscriptions runtime
- digital backend
- reviews backend
- wishlists backend

The real issue now is narrower:

- some VexCart domains truly never landed
- some domains landed only as backend/schema without admin/storefront/plugin completion

## Highest-Signal True Gaps

If the question is "what from VexCart never actually made it over into ConvexPress in usable form?", the clearest answers are:

1. bundles
2. returns/RMA
3. fulfillment operations
4. advanced product variants/options/recommendations/comparisons/presence features
5. abandoned-order admin workflows
6. richer customer self-service/account management
7. admin/storefront/plugin exposure for digital, reviews, and wishlists
8. finished subscription admin/storefront UI

## Evidence Files

ConvexPress evidence:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/validators.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/products.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/payments.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/*`
- `ConvexPress-Admin/packages/backend/convex/commerceDigital/*`
- `ConvexPress-Admin/packages/backend/convex/commerceReviews/*`
- `ConvexPress-Admin/packages/backend/convex/commerceWishlists/*`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/index.tsx`
- `ConvexPress-Website/apps/web/src/routes/dashboard/subscriptions.tsx`
- `ConvexPress-Website/apps/web/src/routes/dashboard/subscriptions.$subscriptionId.tsx`
- `ConvexPress-Website/apps/web/src/routes/dashboard/addresses.tsx`

VexCart evidence:

- `VexCart-Admin/packages/backend/convex/bundles.ts`
- `VexCart-Admin/packages/backend/convex/returns.ts`
- `VexCart-Admin/packages/backend/convex/fulfillment.ts`
- `VexCart-Admin/packages/backend/convex/products.ts`
- `VexCart-Admin/packages/backend/convex/digitalProducts.ts`
- `VexCart-Admin/packages/backend/convex/reviews.ts`
- `VexCart-Admin/packages/backend/convex/wishlists.ts`
- `VexCart-Admin/apps/web/src/routes/admin/bundles.tsx`
- `VexCart-Admin/apps/web/src/routes/admin/returns.tsx`
- `VexCart-Admin/apps/web/src/routes/admin/reviews.tsx`
- `VexCart-Admin/apps/web/src/routes/admin/analytics/wishlists.tsx`
- `VexCart-Admin/apps/web/src/routes/admin/orders/abandoned.tsx`
- `VexCart-Website/apps/web/src/routes/_dashboard/wishlist.tsx`
- `VexCart-Website/apps/web/src/routes/_dashboard/reviews.tsx`
- `VexCart-Website/apps/web/src/routes/_dashboard/orders/$orderId_.return.tsx`
- `VexCart-Website/apps/web/src/routes/_marketing/bundles.tsx`
- `VexCart-Website/apps/web/src/routes/_marketing/wishlist.$token.tsx`
