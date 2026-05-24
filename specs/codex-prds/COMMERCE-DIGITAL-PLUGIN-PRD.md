# Commerce Digital Plugin - PRD and Implementation Strategy

**System:** Commerce Digital Plugin
**Status:** Planned
**Priority:** P1 - High
**Complexity:** Complex
**Layer:** Full Stack / Plugin
**Source Blueprint:** `/Users/worsin/Development/VexCart`
**Target Project:** `ConvexPress`
**WordPress Equivalent:** WooCommerce Downloads + software licensing add-ons
**Last Authored:** 2026-04-07

---

## Intent

The Commerce Digital Plugin adds digital goods delivery to ConvexPress commerce.

It is built on top of the `commerce` plugin and owns:

- digital product files
- versioned downloadable assets
- download token issuance and validation
- download history
- customer download dashboard
- optional software license key management and activation flows

This plugin must reuse the existing ConvexPress Media System and file storage infrastructure wherever practical. It should not create a second standalone asset library.

---

## Product Goals

1. Sell downloadable products through ConvexPress commerce.
2. Attach one or more digital files to products and optionally to variants.
3. Generate secure, limited download access after purchase.
4. Provide a customer dashboard for downloads and license keys.
5. Support optional license-key workflows for software-style products.

---

## Non-Goals

This plugin does **not** own:

- core product catalog
- checkout or order creation
- recurring billing
- content membership gating
- DRM or advanced piracy prevention
- arbitrary cloud file sync outside the media/file system

---

## Source Blueprint In VexCart

VexCart already contains a substantial digital goods module in:

- `digitalProducts.ts`

The existing behavior includes:

- digital file upload per product and variant
- file versioning
- preview flags
- download token generation
- download logging
- customer download listing
- license key import/generation/assignment
- activation/deactivation/validation

This is a real subsystem and should map cleanly to a dedicated plugin in ConvexPress.

---

## Plugin Definition

### Plugin ID

- `commerceDigital`

### Required Dependency

- `commerce`

### Registry Integration

Add to:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Recommended metadata:

- `id`: `commerceDigital`
- `title`: `Commerce Digital`
- `description`: `Downloads, digital file delivery, and optional software license management`
- `settingsKey`: `commerceDigitalEnabled`
- `dependsOn`: `["commerce"]`
- `adminAccessPrefixes`: `["/admin/commerce/digital"]`
- `routePrefixes`: `["/account/downloads"]`

### Plugin Gating Rule

If `commerceDigitalEnabled === false`:

- digital product delivery must not render
- download dashboards must not render
- license operations must not run
- digital entitlement generation after checkout must be skipped

---

## Architectural Position

### This Plugin Owns

- digital file records
- product-to-file relationships
- download tokens
- download log
- license keys
- license activations
- customer download account surfaces

### This Plugin Depends On

- `commerce`
- order completion events / hooks from `commerce`
- media/file storage system
- auth system
- user profile system
- settings system

### This Plugin Must Not Duplicate

- media upload infrastructure
- generic file storage abstraction
- product catalog ownership

---

## Core User Stories

### Merchant / Admin

- Upload digital files to a product.
- Version those files over time.
- Decide whether a file is previewable.
- Configure whether a digital item requires a license key.
- See available and assigned license key inventory.

### Customer

- Purchase a digital product.
- Access downloads from their account.
- Download within token/limit rules.
- View license keys for products that require them.
- Activate/deactivate licenses for software products where supported.

### Support / Operations

- Inspect download history.
- Inspect assigned licenses and activation state.

---

## Key Architectural Rule

Use the existing Media System as the canonical asset and storage layer.

### What This Means

- digital files should reference Media or storage-backed records
- file uploads should reuse established upload patterns where possible
- image/document metadata should come from the Media System when appropriate
- digital delivery rules belong here, but file storage ownership does not

### Why

ConvexPress already has:

- file storage
- media metadata
- processing infrastructure
- upload permissions

This plugin should add commerce-specific delivery semantics, not a duplicate library.

---

## Product Model

Digital behavior attaches to commerce products and variants.

### Digital Product Rules

Each product may be:

- physical only
- digital only
- hybrid later if needed

Recommended product-facing fields:

- `isDigital`
- `digitalDeliveryMode`: `download | license | both`
- `digitalAccessNote?`

These can live on the product or be derived from linked digital file records, but the plugin owns the semantics.

---

## Domain Model

Recommended tables:

- `commerce_digital_files`
- `commerce_download_tokens`
- `commerce_download_log`
- `commerce_license_keys`
- `commerce_license_activations`

### `commerce_digital_files`

Recommended fields:

- `productId`
- `variantId?`
- `mediaId?`
- `storageId?`
- `title`
- `fileName`
- `mimeType`
- `fileSize`
- `checksum?`
- `version`
- `releaseNotes?`
- `isLatest`
- `isPreviewable`
- `requiresLicense`
- `sortOrder`
- `createdAt`
- `updatedAt`

### `commerce_download_tokens`

Recommended fields:

- `digitalFileId`
- `orderId`
- `orderItemId`
- `userId?`
- `token`
- `status`: `active | expired | revoked | exhausted`
- `maxDownloads?`
- `downloadCount`
- `expiresAt?`
- `lastDownloadedAt?`
- `createdAt`
- `updatedAt`

### `commerce_download_log`

Recommended fields:

- `downloadTokenId`
- `digitalFileId`
- `userId?`
- `orderId`
- `downloadedAt`
- `ipAddress?`
- `userAgent?`

### `commerce_license_keys`

Recommended fields:

- `productId`
- `orderId?`
- `userId?`
- `keyType`: `single | multi | lifetime | trial`
- `licenseKey`
- `status`: `available | assigned | active | revoked | expired`
- `maxActivations?`
- `expiresAt?`
- `assignedAt?`
- `activatedAt?`
- `revokedAt?`
- `metadata?`
- `createdAt`
- `updatedAt`

### `commerce_license_activations`

Recommended fields:

- `licenseKeyId`
- `userId?`
- `machineId?`
- `hostName?`
- `ipAddress?`
- `status`: `active | revoked`
- `activatedAt`
- `revokedAt?`
- `metadata?`

---

## Delivery Model

### Purchase To Delivery Flow

1. customer purchases digital product
2. `commerce` completes order
3. `commerceDigital` generates download token(s)
4. if licensing is enabled, assign license key(s)
5. customer sees assets in `/account/downloads`
6. download requests validate token state and limits
7. successful downloads are logged

### Important Rules

- delivery only after valid purchase completion
- tokens must be revocable
- download count and expiry must be enforceable
- customer dashboard should never expose raw storage ids/secrets directly

---

## Licensing Model

Licensing should be optional.

### Supported Use Cases

- software license key delivery
- activation-limited licenses
- manual inventory import
- generated keys for simple cases

### License Operations

- generate keys
- import keys
- assign key to purchase
- list my keys
- activate key
- deactivate key
- validate key
- revoke key

### Design Rule

License validation logic belongs here, but this plugin should remain practical rather than attempting a full enterprise license server in v1.

---

## Admin UX Requirements

### Admin Routes

Suggested routes:

- `/admin/commerce/digital`
- `/admin/commerce/digital/files`
- `/admin/commerce/digital/licenses`
- `/admin/commerce/digital/licenses/$licenseId`
- `/admin/commerce/digital/downloads`
- `/admin/commerce/digital/settings`

### Product Editor Extensions

When the plugin is enabled, product editing in `commerce` should gain:

- mark as digital
- attach digital files
- version management
- previewable toggle
- requires-license toggle
- license inventory section

### Admin Features

- digital file manager
- version list per product
- download history views
- license inventory and assignment management

---

## Website UX Requirements

### Account Routes

Suggested website routes:

- `/_dashboard/downloads.tsx`
- later optional `/_dashboard/licenses.tsx`

### Customer Dashboard Features

- downloads list
- version / file metadata
- remaining download count where applicable
- expiry messaging
- license key list
- copy-to-clipboard key UX
- activation status visibility where applicable

### Product Page UX

Digital products should be clearly labeled:

- instant download
- license included where applicable
- version/release note messaging later if useful

---

## Settings Model

Add:

- `commerceDigitalEnabled`

Recommended digital settings:

- default token expiry days
- default max downloads
- allow preview downloads
- license key auto-generation defaults
- download security policy

---

## Capability Model

Recommended capabilities:

- `commerce.digital.view`
- `commerce.digital.manage`
- `commerce.digital.licenses.manage`
- `commerce.digital.downloads.view`
- `commerce.digital.settings.manage`

Customer access is owner-or-purchase based, not admin-capability based.

---

## Media System Integration

This plugin must explicitly align with the Media System.

### Recommended Pattern

- digital file records reference `mediaId` where possible
- for pure storage-backed assets, `storageId` may still be needed
- metadata display should reuse media/file metadata patterns

### Do Not Do

- separate upload stack
- separate file browser for no reason
- duplicate alt/title/caption semantics unless needed for delivery metadata

---

## Security Requirements

### Download Security

- tokenized access only
- token expiry support
- download count enforcement
- revocation support
- optional user ownership check

### License Security

- keys should not be guessable
- activation endpoints must validate ownership or key legitimacy
- revoked or expired keys must fail validation

### Important Reality Check

This plugin can reduce casual abuse, but it should not pretend to provide perfect anti-piracy guarantees.

---

## Rollout Plan

### Phase 1

- plugin registration
- schema
- file attachment to products
- download token generation on completed orders
- customer downloads dashboard

### Phase 2

- versioning UI
- download logging and limits
- admin download visibility

### Phase 3

- license key generation/import/assignment
- customer license dashboard
- activation/deactivation/validation

### Phase 4

- richer operational reporting
- hybrid product support improvements

---

## Acceptance Criteria

The plugin is successful when:

- admins can attach digital files to products
- completed purchases produce valid download access
- customers can see and use their downloads
- download history is recorded
- optional license workflows operate cleanly
- disabling the plugin removes digital delivery behavior without breaking core commerce

