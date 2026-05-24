# ConvexPress Website Route Inventory

**Generated:** 2026-05-12
**Source:** `apps/web/src/routeTree.gen.ts` (authoritative)
**Total routes:** 87

## Criticality definitions

- **P0** — Auth flows, root dashboard, revenue-critical pages (orders, payments, checkout). Outage = nobody can use the app.
- **P1** — Core CRUD lists/details (posts, pages, products, users, comments, media, customers). Outage = primary workflow broken.
- **P2** — Settings, tools, integrations, analytics, edge utilities. Outage = friction but workable.

## Summary

| Criticality | Count |
|-------------|-------|
| P0          | 9 |
| P1          | 20 |
| P2          | 58 |
| **Total**   | **87** |

## P0 — Critical paths

| Route | Auth Required |
|-------|---------------|
| `/` | N |
| `/cart` | N |
| `/checkout` | N |
| `/dashboard` | Y |
| `/dashboard/orders` | Y |
| `/login` | N |
| `/products` | N |
| `/register` | N |
| `/shop` | N |

## P1 — Core CRUD

| Route | Auth Required |
|-------|---------------|
| `/categories` | N |
| `/dashboard/addresses` | Y |
| `/dashboard/comments` | Y |
| `/dashboard/downloads` | Y |
| `/dashboard/membership` | Y |
| `/dashboard/notifications` | Y |
| `/dashboard/orders/$orderId` | Y |
| `/dashboard/orders/$orderId/return` | Y |
| `/dashboard/posts` | Y |
| `/dashboard/profile` | Y |
| `/dashboard/returns` | Y |
| `/dashboard/returns/$returnId` | Y |
| `/dashboard/reviews` | Y |
| `/dashboard/security` | Y |
| `/dashboard/settings` | Y |
| `/dashboard/subscriptions` | Y |
| `/dashboard/subscriptions/$subscriptionId` | Y |
| `/dashboard/wishlist` | Y |
| `/gallery` | N |
| `/recipes` | N |

## P2 — Settings / Tools / Edge

| Route | Auth Required |
|-------|---------------|
| `/api/auth/callback` | N |
| `/api/author/$slug/feed` | N |
| `/api/author/$slug/feed/atom` | N |
| `/api/blog/$slug/feed` | N |
| `/api/blog/$slug/feed/atom` | N |
| `/api/category/$slug/feed` | N |
| `/api/category/$slug/feed/atom` | N |
| `/api/comments/feed` | N |
| `/api/comments/feed/atom` | N |
| `/api/feed` | N |
| `/api/feed/atom` | N |
| `/api/feed/rss2` | N |
| `/api/robots` | N |
| `/api/sitemap-$type-$page/xml` | N |
| `/api/sitemap-style/xsl` | N |
| `/api/sitemap/xml` | N |
| `/api/tag/$slug/feed` | N |
| `/api/tag/$slug/feed/atom` | N |
| `/archive` | N |
| `/archives/$id` | N |
| `/author/$slug` | N |
| `/blog` | N |
| `/blog/$slug` | N |
| `/blog/$year/$month/$day/$slug` | N |
| `/blog/$year/$month/$slug` | N |
| `/bundles` | N |
| `/bundles/$slug` | N |
| `/categories/$slug` | N |
| `/category/$slug` | N |
| `/checkout/confirmation/$orderId` | N |
| `/checkout/payment` | N |
| `/checkout/review` | N |
| `/checkout/shipping` | N |
| `/forgot-password` | N |
| `/gallery/$slug` | N |
| `/gallery/category/$slug` | N |
| `/help` | N |
| `/help/$categorySlug` | N |
| `/help/$categorySlug/$articleSlug` | N |
| `/help/collections/$slug` | N |
| `/help/search` | N |
| `/logout` | N |
| `/page/$` | N |
| `/pricing` | N |
| `/products/$slug` | N |
| `/recipes/$slug` | N |
| `/recipes/category/$slug` | N |
| `/reset-password` | N |
| `/search` | N |
| `/signup/$offerId` | N |
| `/support` | N |
| `/support/new` | N |
| `/support/tickets` | N |
| `/support/tickets/$ticketId` | N |
| `/tag/$slug` | N |
| `/track/$token` | N |
| `/verify-email` | N |
| `/wishlist/$token` | N |