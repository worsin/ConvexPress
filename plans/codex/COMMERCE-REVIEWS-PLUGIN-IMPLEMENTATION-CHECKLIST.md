# Commerce Reviews Plugin - Implementation Checklist

**System:** Commerce Reviews Plugin
**Status:** Planned
**Last Authored:** 2026-04-07
**Companion Spec:** `.codex/docs/COMMERCE-REVIEWS-PLUGIN-PRD.md`

---

## Working Rule

This checklist covers the `commerceReviews` plugin only.

Dependency:

- `commerce` must exist first

---

## Phase 1 - Plugin Foundation

### 1. Registry and Settings

Update:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
- shared settings defaults/validators/validation

Add:

- `commerceReviews`
- `commerceReviewsEnabled`

---

## Phase 2 - Schema

### 2. Schema File

Create:

- `ConvexPress-Admin/packages/backend/convex/schema/commerceReviews.ts`

Update:

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

Add tables:

- `commerce_review_items`
- `commerce_review_helpful_votes`

Update `commerce` product shape or supporting internals to support:

- `averageRating`
- `reviewCount`

---

## Phase 3 - Backend Domain

### 3. Domain Module

Create:

- `ConvexPress-Admin/packages/backend/convex/commerceReviews/`

Suggested files:

- `helpers.ts`
- `validators.ts`
- `queries.ts`
- `mutations.ts`
- `internals.ts`

### 4. Commerce Integration

Integrate with product/order data so that:

- verified purchase checks work
- product rating aggregates update correctly

### 5. Plugin Gating

Ensure all public review queries fail closed when disabled.

---

## Phase 4 - Admin UI

### 6. Admin Routes

Create routes under:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/reviews/`

Suggested route files:

- `index.tsx`
- `pending.tsx`
- `settings.tsx`

### 7. Admin Components

Create:

- `ConvexPress-Admin/apps/web/src/components/commerce-reviews/`

Suggested groups:

- `moderation/`
- `lists/`
- `settings/`

---

## Phase 5 - Website UX

### 8. Product Page Integration

Extend commerce product UI with:

- rating summary
- review list
- sorting
- review form
- helpful voting

### 9. Account Route

Create:

- `ConvexPress-Website/apps/web/src/routes/_dashboard/reviews.tsx`

### 10. Website Components

Create:

- `ConvexPress-Website/apps/web/src/components/commerce-reviews/`

Suggested groups:

- `product/`
- `account/`

---

## Phase 6 - Verification

### 11. Verification

- review submission works
- moderation works
- aggregates update correctly
- verified purchase flag works
- helpful voting works if enabled
- disabling plugin suppresses review behavior

