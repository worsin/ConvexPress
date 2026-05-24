# Commerce Reviews Plugin - PRD and Implementation Strategy

**System:** Commerce Reviews Plugin
**Status:** Planned
**Priority:** P1 - High
**Complexity:** Medium
**Layer:** Full Stack / Plugin
**Source Blueprint:** `/Users/worsin/Development/VexCart`
**Target Project:** `ConvexPress`
**WordPress Equivalent:** WooCommerce Product Reviews
**Last Authored:** 2026-04-07

---

## Intent

The Commerce Reviews Plugin adds product-specific ratings and reviews to ConvexPress commerce.

It is built on top of the `commerce` plugin and owns:

- product review submission
- star ratings
- verified-purchase review logic
- review moderation
- helpful voting
- product rating aggregates
- customer “my reviews” account surfaces

This plugin is separate from the general ConvexPress Comment System. Product reviews are commerce-specific records with purchase awareness, rating semantics, and product aggregates.

---

## Product Goals

1. Allow customers to leave structured product reviews and ratings.
2. Support verified-purchase indicators tied to order history.
3. Give moderators/admins a review moderation workflow.
4. Expose rating aggregates for storefront cards, product pages, search, and schema markup.
5. Provide customers with a “my reviews” dashboard.

---

## Non-Goals

This plugin does **not** own:

- blog/article comments
- threaded discussion
- generic comment infrastructure
- forum/community features

Those belong to the Comment System or other community plugins.

---

## Source Blueprint In VexCart

VexCart already contains a product reviews subsystem in:

- `reviews.ts`

It supports:

- product reviews
- rating aggregates
- verified-purchase checks
- moderation queues
- helpful voting
- customer review management

This maps cleanly to a dedicated plugin in ConvexPress.

---

## Plugin Definition

### Plugin ID

- `commerceReviews`

### Required Dependency

- `commerce`

### Registry Integration

Add to:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Recommended metadata:

- `id`: `commerceReviews`
- `title`: `Commerce Reviews`
- `description`: `Product ratings, review moderation, verified purchase badges, and review aggregates`
- `settingsKey`: `commerceReviewsEnabled`
- `dependsOn`: `["commerce"]`
- `adminAccessPrefixes`: `["/admin/commerce/reviews"]`
- `routePrefixes`: `["/account/reviews"]`

### Plugin Gating Rule

If `commerceReviewsEnabled === false`:

- review UI must not render on product pages
- review submission must not be accepted
- review aggregates should not render publicly
- moderation routes must not render

---

## Architectural Position

### This Plugin Owns

- review records
- rating aggregates
- review moderation states
- helpful votes
- customer review history

### This Plugin Depends On

- `commerce`
- product records from `commerce`
- order history from `commerce`
- auth system
- settings system

### This Plugin Does Not Replace

- Comment System

Product reviews are not threaded site comments. Keep the systems separate.

---

## Core User Stories

### Customer

- Rate a purchased product.
- Optionally write title and body text.
- See whether the review is pending, approved, or rejected.
- Edit or delete their own review if policy allows.
- View all of their submitted reviews in account.

### Merchant / Moderator

- Review pending submissions.
- Approve or reject reviews.
- Delete abusive reviews.
- See aggregate rating metrics per product.

### Shopper

- View average rating and review count on product cards and product pages.
- Sort reviews by newest, oldest, highest, lowest, and most helpful.
- See verified-purchase badges where appropriate.
- vote reviews as helpful.

---

## Domain Model

Recommended tables:

- `commerce_review_items`
- `commerce_review_helpful_votes`

### `commerce_review_items`

Recommended fields:

- `productId`
- `userId`
- `orderId?`
- `rating`
- `title?`
- `content?`
- `status`: `pending | approved | rejected | spam | deleted`
- `isVerifiedPurchase`
- `helpfulCount`
- `rejectionReason?`
- `moderatedBy?`
- `moderatedAt?`
- `createdAt`
- `updatedAt`

### `commerce_review_helpful_votes`

Recommended fields:

- `reviewId`
- `userId`
- `createdAt`

### Denormalized Product Fields

The `commerce` product model should expose:

- `averageRating`
- `reviewCount`

These should be updated by this plugin, not manually edited.

---

## Verified Purchase Model

This is one of the most important review semantics.

### Rule

A review may be marked `isVerifiedPurchase` if the user purchased the product through `commerce` and the order reached a qualifying state.

### Recommended Qualifying States

- `delivered`
- optionally `completed` if such a state exists in final commerce implementation

### Recommendation

Allow configuration for:

- verified purchase required to review
- verified purchase optional but badge shown when present

WooCommerce-style default should be:

- optional to review
- verified purchase badge when applicable

---

## Moderation Model

Reviews need their own moderation workflow.

### Statuses

- `pending`
- `approved`
- `rejected`
- `spam`
- `deleted`

### Admin Actions

- approve
- reject
- mark spam
- delete
- bulk approve
- bulk reject

### Customer Edit Policy

Recommended v1:

- customers may edit/delete their own reviews
- editing resets review back to `pending` if moderation is enabled

---

## Helpful Voting

Helpful voting is not essential for v1, but VexCart already has it and it is useful.

### Behavior

- authenticated users can vote a review helpful
- one vote per user per review
- toggling removes/adds the vote
- aggregate count is denormalized on the review

This improves review sorting and trust signals.

---

## Product Page Integration

The plugin must enrich commerce product pages.

### Product Page Features

- average rating summary
- distribution histogram
- review list
- sort options
- review form
- verified purchase badge
- helpful vote button

### Product Card / Grid Features

- average rating
- review count

### SEO / Schema Features

Product structured data should include:

- aggregate rating
- review count

Do not emit bogus schema when there are no approved reviews.

---

## Customer Account UX

Suggested website route:

- `/_dashboard/reviews.tsx`

### Customer Features

- list my reviews
- filter by status
- edit review
- delete review
- link back to product detail

This is important because product reviews are customer-generated content tied to their purchase history.

---

## Admin UX Requirements

### Admin Routes

Suggested routes:

- `/admin/commerce/reviews`
- `/admin/commerce/reviews/pending`
- `/admin/commerce/reviews/settings`

### Admin Features

- pending moderation queue
- review list with search/filter
- product and customer context on each review
- moderation actions
- aggregate stats

---

## Settings Model

Add:

- `commerceReviewsEnabled`

Recommended settings:

- `reviewsRequireModeration`
- `reviewsRequirePurchase`
- `allowReviewEditing`
- `allowHelpfulVoting`
- `maxReviewLength`

---

## Capability Model

Recommended capabilities:

- `commerce.reviews.view`
- `commerce.reviews.moderate`
- `commerce.reviews.delete`
- `commerce.reviews.settings.manage`

Customer submission/edit/delete should rely on owner checks and policy rules, not admin capabilities.

---

## Relationship To Comment System

Keep this plugin separate from the generic Comment System.

### Why

Comments are:

- threaded discussion
- site-content oriented
- general-purpose conversation

Product reviews are:

- one review per user/product policy
- rating-based
- verified-purchase aware
- part of commerce SEO and product scoring

Trying to merge these systems would create a worse model for both.

---

## Rollout Plan

### Phase 1

- plugin registration
- schema
- product rating aggregates
- public read queries
- review submission

### Phase 2

- moderation queue
- customer reviews dashboard
- helpful voting

### Phase 3

- richer filters/sorting
- schema integration
- notification hooks later if needed

---

## Acceptance Criteria

The plugin is successful when:

- customers can submit product reviews
- approved reviews render on product pages
- average rating and review count update correctly
- moderators can approve/reject reviews
- verified purchase badges work
- customer review history is available
- disabling the plugin fully suppresses review behavior

