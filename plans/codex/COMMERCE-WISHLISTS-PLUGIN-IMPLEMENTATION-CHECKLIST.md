# Commerce Wishlists Plugin - Implementation Checklist

**System:** Commerce Wishlists Plugin
**Status:** Planned
**Last Authored:** 2026-04-07
**Companion Spec:** `.codex/docs/COMMERCE-WISHLISTS-PLUGIN-PRD.md`

---

## Working Rule

This checklist covers the `commerceWishlists` plugin only.

Dependency:

- `commerce` must exist first

---

## Phase 1 - Plugin Foundation

### 1. Registry and Settings

Update:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
- shared settings defaults/validators/validation

Add:

- `commerceWishlists`
- `commerceWishlistsEnabled`

---

## Phase 2 - Schema

### 2. Schema File

Create:

- `ConvexPress-Admin/packages/backend/convex/schema/commerceWishlists.ts`

Update:

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

Add tables:

- `commerce_wishlists`
- `commerce_wishlist_items`

---

## Phase 3 - Backend Domain

### 3. Domain Module

Create:

- `ConvexPress-Admin/packages/backend/convex/commerceWishlists/`

Suggested files:

- `helpers.ts`
- `validators.ts`
- `queries.ts`
- `mutations.ts`

### 4. Commerce Integration

Integrate with `commerce` cart APIs for:

- move-to-cart behavior

### 5. Guest Merge Flow

Add mutation support for:

- merging guest wishlist items into account state on sign-in

---

## Phase 4 - Admin UI

### 6. Admin Routes

Create routes under:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/wishlists/`

Suggested route files:

- `index.tsx`
- `settings.tsx`

### 7. Admin Components

Create:

- `ConvexPress-Admin/apps/web/src/components/commerce-wishlists/`

Suggested groups:

- `lists/`
- `settings/`

---

## Phase 5 - Website UX

### 8. Website Routes

Create:

- `ConvexPress-Website/apps/web/src/routes/_dashboard/wishlist.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/wishlist.$token.tsx`

### 9. Website Components

Create:

- `ConvexPress-Website/apps/web/src/components/commerce-wishlists/`

Suggested groups:

- `buttons/`
- `account/`
- `shared/`

### 10. Guest Wishlist Local State

Create:

- guest wishlist hook/store in website app

Implement:

- add/remove
- contains check
- merge helpers

### 11. Product UI Integration

Extend commerce product card and product page UI with:

- wishlist button
- saved state rendering

---

## Phase 6 - Verification

### 12. Verification

- authenticated wishlist CRUD works
- guest save state works
- merge-on-login works
- public share route works when enabled
- move-to-cart works
- disabling plugin suppresses wishlist behavior

