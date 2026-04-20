# Production Readiness Master Plan

> Combined audit from Claude Code + ChatGPT, cross-referenced and deduplicated.

**Goal:** Close every gap between ConvexPress and production-ready status.

**Current state:** All backends are ported from VexCart (payments, tax, inventory, subscriptions, digital, reviews, wishlists, bundles, returns). The gaps are: UI pages, plugin wiring, cron jobs, and advanced product features.

---

## Corrected Status (post-port)

ChatGPT's report predates the final file sync. These are now RESOLVED:
- ~~Bundles absent~~ → Backend ported (3 files in commerceBundles/)
- ~~Returns absent~~ → Backend ported (3 files in commerceReturns/)
- ~~Customer thin (26 lines)~~ → Expanded to 1,045 lines with full CRUD
- ~~Inventory missing~~ → Ported (1,076 lines)

---

## Combined Gap List — Ranked by Priority

### TIER 1: CRITICAL (blocks launch, <1 hour each)

| # | Gap | Source | Effort | Fix |
|---|-----|--------|--------|-----|
| 1 | Subscription crons not scheduled | Claude | 15 min | Add 3 entries to crons.ts: renewals (hourly), dunning (4hr), expiry (daily) |
| 2 | Reservation cleanup cron missing | Claude | 5 min | Add expired reservation release to crons.ts |
| 3 | Plugin registration for 5 extensions | Both | 30 min | Add commerceDigital, commerceReviews, commerceWishlists, commerceBundles, commerceReturns to registry.ts + settings defaults/validators |

### TIER 2: HIGH (blocks feature completeness, 1-3 hours each)

| # | Gap | Source | Effort | Fix |
|---|-----|--------|--------|-----|
| 4 | Shop page is placeholder | Both | 2 hr | Wire product grid with listPublished query, category filtering, search |
| 5 | Membership admin pages (2 stubs) | Both | 2 hr | Build plan list table + plan editor for /admin/membership |
| 6 | Subscription admin page stub | Both | 2 hr | Build subscription list table + detail view for /admin/commerce/subscriptions |
| 7 | Subscription customer dashboard stub | Both | 1.5 hr | Build customer subscription list + detail + cancel/pause for /dashboard/subscriptions |
| 8 | Digital products admin UI | ChatGPT | 2 hr | Build file manager, download token admin for /admin/commerce/digital |
| 9 | Digital products customer downloads page | ChatGPT | 1.5 hr | Build downloads list for /dashboard/downloads |
| 10 | Reviews admin moderation page | ChatGPT | 2 hr | Build review list with approve/reject for /admin/commerce/reviews |
| 11 | Reviews storefront product display | ChatGPT | 1.5 hr | Add review section to product detail page |
| 12 | Reviews customer dashboard page | ChatGPT | 1 hr | Build my-reviews list for /dashboard/reviews |
| 13 | Wishlists customer dashboard page | ChatGPT | 1.5 hr | Build wishlist manager for /dashboard/wishlist |
| 14 | Wishlists shared public page | ChatGPT | 1 hr | Build /wishlist/:token public view |
| 15 | Wishlists storefront controls | ChatGPT | 1 hr | Add "add to wishlist" button on product pages |
| 16 | Bundles admin UI | ChatGPT | 2 hr | Build bundle editor + component manager for /admin/commerce/bundles |
| 17 | Bundles storefront pages | ChatGPT | 1.5 hr | Build bundle browse + detail pages |
| 18 | Returns admin UI | ChatGPT | 2 hr | Build return list + approval workflow for /admin/commerce/returns |
| 19 | Returns customer flow | ChatGPT | 1.5 hr | Build return request form on /dashboard/orders/:orderId/return |
| 20 | Customer addresses page (website) | ChatGPT | 1.5 hr | Wire up address CRUD for /dashboard/addresses |

### TIER 3: MEDIUM (improves product completeness, 2-4 hours each)

| # | Gap | Source | Effort | Fix |
|---|-----|--------|--------|-----|
| 21 | Advanced product variant/option management | ChatGPT | 3 hr | Port VexCart option type/value CRUD, variant generation into products.ts |
| 22 | Abandoned order admin page | ChatGPT | 2 hr | Build /admin/commerce/orders/abandoned with recovery actions |
| 23 | Fulfillment operations subsystem | ChatGPT | 3 hr | Port VexCart fulfillment.ts — fulfillment orders, assignments, manifests |
| 24 | Payments admin UI | ChatGPT | 2 hr | Build transaction list + detail + stats dashboard for /admin/commerce/payments |
| 25 | Tax admin page | Claude | 1.5 hr | Build tax rule CRUD for /admin/commerce/settings/tax |
| 26 | Shipping packages admin page | Claude | 1 hr | Build package template CRUD (replace placeholder) |
| 27 | Wishlists admin analytics | ChatGPT | 1 hr | Build /admin/commerce/analytics/wishlists |
| 28 | Product search/filter enhancements | ChatGPT | 2 hr | Port VexCart search suggestions, advanced filtering |
| 29 | Product recommendations | ChatGPT | 2 hr | Port VexCart recommendation engine |

### TIER 4: LOW (quality/polish, ongoing)

| # | Gap | Source | Effort | Fix |
|---|-----|--------|--------|-----|
| 30 | Commerce test coverage | Claude | 4+ hr | Add tests for payment flows, checkout, tax, subscriptions |
| 31 | Deployment hardening | Claude | 2 hr | .env.example, remove hardcoded deploy key, production config |
| 32 | Product view tracking/presence | ChatGPT | 2 hr | Port VexCart product analytics features |
| 33 | Product comparison | ChatGPT | 2 hr | Port VexCart comparison feature |

---

## Execution Strategy

### Wave 1: Quick Fixes (30 minutes)
Items 1-3. Cron jobs + plugin registration. Unblocks subscriptions and extension plugins.

### Wave 2: Storefront & Core Admin (1 day)
Items 4-7. Shop page, membership admin, subscription admin + customer pages. These are the pages real users hit first.

### Wave 3: Extension Plugin UIs (2 days)
Items 8-20. Admin and customer pages for digital, reviews, wishlists, bundles, returns, addresses. Each is a self-contained page build using existing backend queries/mutations.

### Wave 4: Advanced Features (2 days)
Items 21-29. Variant management, fulfillment, abandoned orders, payment admin, tax admin, search enhancements.

### Wave 5: Quality (ongoing)
Items 30-33. Test coverage, deployment hardening, analytics features.

---

## Execution Rules

1. **Every page build uses existing backend queries/mutations.** The backends are done. This is purely UI work.
2. **Port admin pages from VexCart where they exist.** VexCart has working admin pages for bundles, returns, reviews, wishlists, abandoned orders — adapt, don't rebuild.
3. **One agent at a time.** No parallel dispatches (memory constraint).
4. **Each item gets a commit.** Small, verifiable increments.
5. **Plugin registration includes settings defaults + validators.** Not just registry.ts.
