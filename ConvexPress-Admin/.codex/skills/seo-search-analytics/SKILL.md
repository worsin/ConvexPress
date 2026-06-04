---
name: seo-search-analytics
description: Use when the user asks to build, audit, debug, or improve ConvexPress SEO, sitemap, robots, redirects, 404 logs, search indexing/results, GA4 analytics, traffic/engagement dashboards, metadata, canonical URLs, feeds, or content discovery.
---

# seo-search-analytics

Use this for discoverability, indexing, analytics, and route hygiene. It spans
Admin settings/tools plus Website SEO/feed output.

## System Map

- Admin SEO routes: `apps/web/src/routes/_authenticated/_admin/seo/**`
- Admin tools: `tools/404-log.tsx`, `tools/redirects/**`,
  `tools/routes.tsx`
- Settings: `settings/search.tsx`, `settings/analytics.tsx`,
  `settings/analytics.ga4.tsx`, `settings/permalinks.tsx`
- Content analytics tabs: `posts/$postId/traffic.tsx`,
  `pages/$pageId/traffic.tsx`, engagement tabs.
- Backend domains: `packages/backend/convex/search`, `seo`, `sitemap`,
  `routing`, `analytics`, `redirects`, and related schema.
- Website output:
  - `../ConvexPress-Website/apps/web/src/routes/api/sitemap*`
  - `../ConvexPress-Website/apps/web/src/routes/api/robots.tsx`
  - `../ConvexPress-Website/apps/web/src/routes/api/**/feed/**`
  - `../ConvexPress-Website/apps/web/src/routes/_marketing/search.tsx`

## Workflow

1. Classify the task: metadata, sitemap, robots, redirects, 404s, search index,
   GA4, traffic/engagement, canonical URL, or feed output.
2. Trace the source of truth: content record fields, settings section, route
   registry, or analytics event table.
3. Preserve canonical URL and redirect behavior; avoid duplicate indexable URLs.
4. For search, verify indexing writes and public search result type routing.
5. For sitemaps/feeds, verify pagination, content type filtering, and hidden or
   restricted content exclusion.
6. For GA4/analytics, keep provider config separate from event capture and do
   not hardcode tracking IDs.
7. If public output changes, also use `website-seo-feeds-routing`.

## Verification

Use focused typechecks and browser/API smoke:

```bash
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

Smoke relevant public URLs such as `/api/sitemap.xml`, `/api/robots`,
`/search?q=...`, and redirect/404 paths when touched.

## Report

List affected discoverability surface, source of truth, public URLs checked,
and indexing/analytics risks.
