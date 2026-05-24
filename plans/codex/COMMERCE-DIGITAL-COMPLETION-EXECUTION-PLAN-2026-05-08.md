# Commerce Digital Completion Execution Plan

**Date:** 2026-05-08
**System:** Commerce Digital / Digital Products / Software Licensing
**Goal:** Finish ConvexPress digital products as a first-class software commerce system.

## Operating Philosophy

ConvexPress uses WordPress and WooCommerce as a product model, not as a constraint.
The finished system should keep the familiar merchant concepts where they help:

- products are the canonical sellable catalog entities
- virtual products do not require shipping
- downloadable products produce customer download access
- paid orders are the source of customer entitlements

But ConvexPress should improve on WooCommerce where the stack makes it practical:

- digital delivery and licensing are typed platform features, not scattered plugin metadata
- order fulfillment is idempotent and auditable
- software license activation is native
- customer downloads and license keys are unified
- admin recovery paths are explicit when fulfillment cannot complete automatically

## Current Reality

There is one product catalog:

- `commerce_products`
- `commerce_product_variants`

Digital products are not a second catalog. The current digital plugin attaches records to commerce products:

- `commerce_digital_files`
- `commerce_download_tokens`
- `commerce_download_log`
- `commerce_license_keys`
- `commerce_license_activations`

Current admin surfaces:

- product editor has `isVirtual` and `isDownloadable`
- `/commerce/digital` manages files and license keys

Current customer surface:

- `/dashboard/downloads` displays download tokens and license keys

The main incomplete area is paid-order digital fulfillment. The backend has internal helpers for token generation and license assignment, but checkout/payment/order status flows do not consistently call them.

## End State

A merchant can sell software as a normal commerce product. The setup flow should be:

1. Create/edit product.
2. Enable digital delivery.
3. Default shipping off for software-style products.
4. Attach one or more downloadable files.
5. Enable licensing when required.
6. Generate or import license keys.
7. Publish product.

The customer flow should be:

1. Buy the software product.
2. Payment succeeds.
3. Digital fulfillment runs exactly once.
4. Customer receives a download entitlement.
5. Customer receives a license key when licensing is required.
6. Customer can download from account.
7. Customer can view, copy, validate, activate, and deactivate license keys.

The admin recovery flow should be:

1. If fulfillment cannot finish, mark the order as needing digital review.
2. Show the reason.
3. Let admin generate/reissue tokens.
4. Let admin assign/import/revoke license keys.
5. Record every important action in order history/audit logs.

## Core Product Semantics

Use these meanings consistently:

- `isVirtual`: the product does not need shipping.
- `isDownloadable`: the product has digital delivery behavior.
- `requiresLicense`: the product or variant requires license key fulfillment.
- `digitalDeliveryMode`: one of `download`, `license`, `download_and_license`.

Recommended default:

- when a merchant enables digital delivery for a software product, default `isVirtual` to `true`
- allow hybrid physical plus digital products only as an explicit advanced case

Do not treat `isDownloadable` alone as "no shipping". Checkout should continue to use `isVirtual` for shipping decisions.

## Implementation Sequence

Follow this order. Each phase should leave the app in a coherent state and include tests for the behavior it introduces.

## Phase 1 - Add Digital Configuration Model

### Purpose

Give products and variants enough typed configuration to describe software delivery and license behavior without inferring everything from attached files.

### Backend Work

Update `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts`:

- add product-level optional fields:
  - `requiresLicense?: boolean`
  - `digitalDeliveryMode?: "download" | "license" | "download_and_license"`
  - `downloadLimit?: number`
  - `downloadExpiryDays?: number`
  - `licenseKeyType?: "single" | "multi" | "unlimited" | "subscription"`
  - `maxActivations?: number`
  - `licenseExpiresAfterDays?: number`
- add equivalent variant-level optional fields where variant override is required

Update validators in:

- `ConvexPress-Admin/packages/backend/convex/commerce/validators.ts`
- product create/update args
- variant create/update args

Update mutations in:

- `ConvexPress-Admin/packages/backend/convex/commerce/products.ts`

Rules:

- keep fields optional for migration safety
- default old products to non-licensed behavior
- when `isDownloadable` becomes true and `isVirtual` was not explicitly set, the UI should default to virtual, not the backend silently forcing it

### UI Work

Update:

- `ConvexPress-Admin/apps/web/src/components/commerce/CommerceProductEditor.tsx`

Add a product editor section named `Digital delivery` when `commerceDigital` is enabled:

- delivery enabled toggle
- no shipping required toggle
- delivery mode selector
- download limit
- download expiry
- requires license toggle
- license key type
- max activations
- license expiration
- file summary
- license inventory summary
- link/button to detailed digital manager

For variants:

- expose variant override fields only in the variant area
- keep variant UI compact
- indicate inherited product defaults

### Tests

Add product editor helper tests where applicable:

- digital product payload persists settings
- enabling digital defaults UI to no shipping
- hybrid product remains possible

## Phase 2 - Create Canonical Digital Fulfillment Runtime

### Purpose

Create a single internal routine that can fulfill digital goods for any paid order, regardless of how the order became paid.

### Backend Work

Create a runtime module, likely:

- `ConvexPress-Admin/packages/backend/convex/commerceDigital/fulfillment.ts`

Add an internal mutation:

- `fulfillOrderDigitalEntitlements`

Input:

- `orderId`
- optional `actorUserId`
- optional `reason`

Responsibilities:

1. require `commerceDigital` plugin enabled
2. load order
3. skip if order is not paid/processing/completed as appropriate
4. load order items
5. for each item, resolve product and variant
6. decide whether the line requires digital fulfillment
7. create download tokens for latest applicable files
8. assign license keys when required
9. handle quantity correctly
10. write order history
11. store fulfillment state
12. return a structured result

### Idempotency Rules

The routine must be safe to call repeatedly.

Before creating a token:

- check existing `commerce_download_tokens` by order/order item/file
- do not create duplicate token for the same order item and file

Before assigning a key:

- check existing `commerce_license_keys` assigned to same order/product/variant/user
- do not assign another key unless quantity requires it

For quantity:

- v1 default: one license key per purchased quantity unit
- future option can allow one key with quantity-derived activations

### Schema Work

Add indexes if needed:

- download tokens by `orderId`
- download tokens by `orderItemId`
- license keys by `orderId`
- license keys by `userId`

If current indexes are insufficient for idempotency, add the missing ones.

Consider adding order-level or side-table fulfillment state:

- simplest path: order optional fields
  - `digitalFulfillmentStatus?: "not_required" | "pending" | "completed" | "partial" | "needs_review" | "failed"`
  - `digitalFulfilledAt?: number`
  - `digitalFulfillmentError?: string`
- more detailed path: create `commerce_digital_fulfillments`

Prefer the simplest path unless detailed per-line recovery requires a separate table.

### Failure Policy

Payment success must not be undone because digital fulfillment failed.

If no license key is available:

- mark digital fulfillment `needs_review`
- record order history
- expose admin remediation
- customer dashboard should show pending license if possible

If no file is attached to a downloadable product:

- mark `needs_review`
- record a clear missing-file error

## Phase 3 - Wire Fulfillment Into Paid Order Paths

### Purpose

Every path that makes an order paid must invoke the same digital fulfillment routine.

### Required Integration Points

Update:

- `ConvexPress-Admin/packages/backend/convex/commerce/payments.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/orders.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts`

Call digital fulfillment after:

- Stripe/PayPal success marks order paid
- manual payment capture marks order paid
- admin status update marks order paid
- non-card checkout creates an immediately paid order, if that behavior exists

Do not duplicate fulfillment logic in these files. They should only call the canonical internal mutation/runtime.

### Tests

Add backend tests for:

- webhook success triggers fulfillment
- manual capture triggers fulfillment
- admin paid status triggers fulfillment
- repeated calls do not duplicate tokens or keys

## Phase 4 - Apply Download Policy Correctly

### Purpose

Generated tokens should reflect product, variant, and global settings.

### Resolution Order

When creating a token:

1. variant setting
2. product setting
3. digital plugin settings
4. fallback defaults

Policy fields:

- max downloads
- expiry days

Use `downloadExpiryDays` semantics consistently. Avoid mixing absolute timestamps and day counts in product configuration.

### Tests

Add cases for:

- product-level limit
- variant override
- no expiry
- no limit
- exhausted token cannot download
- expired token cannot download

## Phase 5 - License Fulfillment And Activation

### Purpose

Make license keys a reliable, first-class software commerce capability.

### Assignment Rules

A line requires license assignment when:

- product/variant `requiresLicense` is true
- or `digitalDeliveryMode` is `license`
- or `digitalDeliveryMode` is `download_and_license`
- or attached file requires license and product policy allows file-driven licensing

Prefer typed product/variant policy over inferring only from file flags.

### Key Selection

Find keys in this order:

1. exact product and variant
2. product-level key without variant

Only select `status: "available"`.

On assignment:

- set `orderId`
- set `userId`
- set `status: "assigned"`
- set expiration if policy requires it and key has no explicit expiration
- record history

### Activation API

Harden existing functions:

- validate license
- activate license
- deactivate license

Rules:

- available keys cannot activate
- revoked keys cannot validate or activate
- expired keys cannot validate or activate
- activation count is enforced
- repeated activation on same device updates last seen, not duplicate activation

### Tests

Add cases for:

- successful assignment
- no available key
- duplicate fulfillment does not consume another key
- max activations enforced
- same-device activation idempotent
- revoked key rejected
- expired key rejected

## Phase 6 - Customer Account Experience

### Purpose

Make purchased software self-service.

### Website Work

Update:

- `ConvexPress-Website/apps/web/src/routes/dashboard/downloads.tsx`
- customer order detail routes/components if present

Customer should see:

- product
- order
- file version
- download button
- remaining download count
- expiration
- license key
- key status
- activation count
- activated devices
- deactivate device action

Add order detail integration:

- downloads for each digital line
- license keys for each licensed line
- pending/needs-review messaging

### Customer Pending State

If digital fulfillment is `needs_review`:

- show that access is pending
- avoid exposing internal error text to customers
- allow support/admin to resolve

## Phase 7 - Admin Operations And Recovery

### Purpose

Admins need clear tools for real support cases.

### Admin Digital Dashboard

Update:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/digital.tsx`

Add filters:

- downloadable products
- products missing files
- products requiring license
- products with low license inventory
- products with no available license keys
- orders needing digital review

Add actions:

- upload file
- archive file
- mark latest
- generate keys
- import keys
- revoke keys
- assign key to order/user
- reissue download token
- revoke download token
- inspect download log
- inspect license activations

### Order Admin Integration

In order detail:

- show digital fulfillment status
- show generated tokens
- show assigned keys
- show fulfillment errors
- add retry digital fulfillment action

## Phase 8 - Public Product And Checkout UX

### Product Detail

Update public product pages to show:

- digital download
- license key included
- no shipping required
- activation count if useful
- version/release info if configured

### Cart And Checkout

Line items should display:

- digital delivery
- license included
- no shipping required

Checkout should:

- skip shipping when all items are virtual
- require shipping when any item is physical/hybrid
- continue tax calculation according to settings

## Phase 9 - Email And Notifications

### Customer Email

After digital fulfillment completes, send a fulfillment email containing:

- order number
- product name
- account download link
- license key when applicable
- basic activation guidance

Prefer account links over direct raw token links unless direct token links are intentionally supported.

### Admin Notifications

When fulfillment needs review:

- create admin notification if notification system is available
- record order history
- expose in dashboard

## Phase 10 - WooCommerce Import Compatibility

### Preserve Current Mapping

Woo fields already mapped:

- `virtual`
- `downloadable`
- `download_limit`
- `download_expiry`

Keep those mappings.

### Improve Download Import

For Woo `downloads[]`:

- preserve raw source metadata
- optionally create digital file stubs
- do not mark files locally deliverable unless imported into storage/media

### License Imports

Do not assume generic Woo license keys exist. Woo license data usually comes from third-party plugins.

If the source plugin is known:

- build plugin-specific importer
- map external keys to `commerce_license_keys`
- preserve source IDs

## Phase 11 - Verification Matrix

Before considering the system complete, verify these flows end to end:

1. Simple downloadable software, no license.
2. Simple downloadable software with license.
3. Variable software product with variant-specific file and key pool.
4. Mixed cart with software and physical product.
5. Digital-only cart with no shipping.
6. Payment webhook duplicate.
7. Manual payment capture.
8. Admin marks order paid.
9. License inventory exhausted.
10. Customer downloads file.
11. Customer activates license.
12. Customer deactivates device.
13. Admin revokes license.
14. Revoked key validation fails.
15. Expired download token fails.

## Non-Negotiable Completion Criteria

The section is not complete until all of these are true:

- a software product can be configured from the product editor
- a file can be attached to the product or variant
- license keys can be generated or imported
- a paid order automatically creates download access
- a paid order automatically assigns license keys when required
- duplicate paid events do not duplicate entitlements
- the customer dashboard shows downloads and keys
- the app-facing license validation/activation flow works
- admin can recover failed fulfillment
- digital-only orders do not require shipping
- tests cover the critical backend fulfillment paths

## First Code Entry Point

Start with backend fulfillment, not UI polish.

The first implementation pass should:

1. add missing product/variant digital policy fields
2. add `commerceDigital/fulfillment.ts`
3. add idempotent order fulfillment logic
4. wire payment success/manual paid paths into it
5. add focused backend tests

Once paid-order fulfillment is reliable, build the richer admin and customer surfaces on top of real entitlements.
