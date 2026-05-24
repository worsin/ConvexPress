# Commerce Wishlists Plugin - PRD and Implementation Strategy

**System:** Commerce Wishlists Plugin
**Status:** Planned
**Priority:** P2 - Medium
**Complexity:** Medium
**Layer:** Full Stack / Plugin
**Source Blueprint:** `/Users/worsin/Development/VexCart`
**Target Project:** `ConvexPress`
**WordPress Equivalent:** WooCommerce Wishlists / YITH Wishlist-style feature
**Last Authored:** 2026-04-07

---

## Intent

The Commerce Wishlists Plugin adds saved-item and shareable wishlist functionality to ConvexPress commerce.

It is built on top of the `commerce` plugin and owns:

- persistent wishlists for authenticated users
- guest wishlist state and merge behavior
- multiple wishlists per user if enabled
- shared/public wishlist pages
- move-to-cart behavior
- wishlist-oriented customer experience surfaces

This plugin is intentionally optional. It improves shopping experience and retention, but it is not required for checkout.

---

## Product Goals

1. Allow customers to save products for later.
2. Support both guest and authenticated wishlist behavior.
3. Merge guest wishlist state into an account after sign-in.
4. Allow customers to organize items into one or more wishlists.
5. Support shareable/public wishlists for social use cases.
6. Make it easy to move wishlist items into the cart.

---

## Non-Goals

This plugin does **not** own:

- core cart behavior
- price alerts as a required v1 feature
- back-in-stock notifications as a required v1 feature
- recommendation engine behavior

Those can be layered on later.

---

## Source Blueprint In VexCart

VexCart already contains a meaningful wishlist subsystem in:

- `wishlists.ts`

The website also includes:

- guest wishlist local state
- wishlist button on products
- account wishlist page
- shareable public wishlist route
- merge-on-login behavior

This is a clean candidate for a dedicated plugin in ConvexPress.

---

## Plugin Definition

### Plugin ID

- `commerceWishlists`

### Required Dependency

- `commerce`

### Registry Integration

Add to:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Recommended metadata:

- `id`: `commerceWishlists`
- `title`: `Commerce Wishlists`
- `description`: `Saved items, public wishlists, and move-to-cart flows`
- `settingsKey`: `commerceWishlistsEnabled`
- `dependsOn`: `["commerce"]`
- `adminAccessPrefixes`: `["/admin/commerce/wishlists"]`
- `routePrefixes`: `["/account/wishlist", "/wishlist"]`

### Plugin Gating Rule

If `commerceWishlistsEnabled === false`:

- wishlist buttons must not render
- wishlist dashboard routes must not render
- public shared wishlist routes must not render
- guest wishlist merge behavior must be disabled

---

## Architectural Position

### This Plugin Owns

- wishlists
- wishlist items
- share tokens
- guest merge logic
- move-to-cart convenience behavior

### This Plugin Depends On

- `commerce`
- customer auth/user profile systems
- cart APIs from `commerce`

### This Plugin Does Not Replace

- cart
- product comparison
- marketing recommendation systems

---

## Core User Stories

### Guest Shopper

- Save a product to a temporary guest wishlist.
- Keep saved items across page views on the same device.
- Merge saved items into account wishlist after sign-in.

### Authenticated Customer

- Add/remove products from wishlist.
- Create one or more wishlists.
- Name and describe a wishlist.
- Make a wishlist public or private.
- Share a public wishlist URL.
- Move wishlist items into cart.

### Public Viewer

- View a shared wishlist if it is public.

---

## Domain Model

Recommended tables:

- `commerce_wishlists`
- `commerce_wishlist_items`

### `commerce_wishlists`

Recommended fields:

- `userId`
- `name`
- `description?`
- `isDefault`
- `isPublic`
- `shareToken`
- `createdAt`
- `updatedAt`

### `commerce_wishlist_items`

Recommended fields:

- `wishlistId`
- `productId`
- `variantId?`
- `addedAt`

### v1 Design Choice

Guest wishlist state should remain client-side local state rather than stored server-side.

Reason:

- simpler anonymous experience
- avoids creating server records for users who may never sign in
- mirrors the VexCart pattern cleanly

---

## Wishlist Behavior Model

### Authenticated Behavior

- query existing wishlists
- add item to default wishlist by default
- allow moving item between wishlists later

### Guest Behavior

- local storage-backed saved items
- same product/variant dedupe behavior
- merge into account on successful sign-in

### Merge Behavior

On sign-in:

- merge guest items into a default or chosen wishlist
- dedupe identical product/variant entries
- clear guest store on success

---

## Sharing Model

Wishlists may be private or public.

### Public Wishlist Requirements

- stable `shareToken`
- public route by token
- owner name displayed in limited form
- no account-private data leaked

### Suggested Public Route

- `/wishlist/$token`

### Recommendation

Public wishlists should be read-only.

No editing, no collaborative behavior in v1.

---

## Product Integration

Wishlists are deeply tied to storefront product UX.

### Product Card / Product Page Features

- save/remove wishlist button
- authenticated and guest-aware behavior
- clear visual saved state

### Wishlist Item Enrichment

Each item should resolve:

- product title
- slug
- image
- effective price
- availability state

### Move To Cart

If the product is available:

- move-to-cart should add the item to the cart
- optionally remove it from wishlist in the same action

This should use the `commerce` cart API, not duplicate cart logic.

---

## Website UX Requirements

### Account Route

Suggested website route:

- `/_dashboard/wishlist.tsx`

### Public Route

Suggested website route:

- `/_marketing/wishlist.$token.tsx`

### Customer Features

- list wishlists
- create/edit/delete wishlist
- toggle public/private
- copy share link
- remove item
- move item to cart

### v1 Recommendation

Multiple wishlists should be supported because VexCart already modeled them and it is a useful product separator.

If simplification is needed, start with:

- one default wishlist
- schema still flexible enough to support many later

---

## Admin UX Requirements

This plugin needs lighter admin tooling than some others, but not zero tooling.

### Admin Routes

Suggested routes:

- `/admin/commerce/wishlists`
- `/admin/commerce/wishlists/settings`

### Admin Features

- global wishlist metrics
- inspection of public wishlist usage later
- plugin settings

v1 can keep this modest.

---

## Settings Model

Add:

- `commerceWishlistsEnabled`

Recommended wishlist settings:

- `wishlistsAllowGuests`
- `wishlistsAllowMultiple`
- `wishlistsAllowPublicSharing`
- `wishlistsDefaultPrivacy`

Optional later:

- price drop alerts
- back-in-stock alerts

---

## Capability Model

Recommended capabilities:

- `commerce.wishlists.view`
- `commerce.wishlists.manage`
- `commerce.wishlists.settings.manage`

Most wishlist behavior is customer self-service and should be ownership-driven, not admin-capability driven.

---

## User Profile Integration

This plugin should consume the existing user identity/profile system.

It should not create a second customer identity model.

Wishlist ownership should attach to the existing user document identity path used throughout ConvexPress.

---

## Rollout Plan

### Phase 1

- plugin registration
- schema
- authenticated wishlists
- product save/remove buttons
- account wishlist page

### Phase 2

- guest wishlist local state
- merge-on-login
- public sharing route

### Phase 3

- improved admin visibility
- optional notifications later

---

## Acceptance Criteria

The plugin is successful when:

- users can save/remove products from wishlists
- authenticated users can manage wishlist contents
- guest state can merge into account state
- public sharing works when enabled
- move-to-cart works correctly
- disabling the plugin fully suppresses wishlist behavior

