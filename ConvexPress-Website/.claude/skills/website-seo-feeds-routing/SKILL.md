---
name: website-seo-feeds-routing
description: Use when the user asks to build, audit, debug, or improve public Website routing, SEO metadata, canonical URLs, robots.txt, sitemaps, RSS/Atom/comment feeds, tracking routes, redirects, 404/not-found behavior, or crawl/index output.
---

# website-seo-feeds-routing

Use this for public crawlability and route output.

## System Map

- SEO/crawl routes:
  - `apps/web/src/routes/api/robots.tsx`
  - `apps/web/src/routes/api/sitemap*.tsx`
  - `apps/web/src/routes/api/**/feed/**`
  - `apps/web/src/routes/_marketing/track.$token.tsx`
  - `apps/web/src/templates/NotFoundTemplate.tsx`
- Route metadata lives across marketing route `head` definitions and SEO helper
  libraries.
- Backend owner: Admin SEO/search/routing/feed data functions.
- Admin skill: use `seo-search-analytics` for backend/settings changes.

## Workflow

1. Identify output type: route metadata, canonical, robots, sitemap, feed,
   redirect/tracking, or not-found behavior.
2. Read the public route and source query.
3. Preserve noindex rules for search/404/private/preview routes.
4. Verify sitemaps and feeds exclude private, draft, restricted, or invalid
   records.
5. Preserve feed date ordering, stable item IDs, and escaped content.
6. For tracking/redirect routes, validate token lookup and failure states.

## Verification

Run Website checks and smoke the actual public URL:

```bash
bun run check-types
bun run build
```

Check `/api/robots`, `/api/sitemap.xml`, at least one feed, and any route
metadata changed.

## Report

List public URLs, metadata/canonical/noindex behavior, excluded content rules,
and verification.
