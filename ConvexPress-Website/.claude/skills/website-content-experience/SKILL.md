---
name: website-content-experience
description: Use when the user asks to build, audit, debug, redesign, or improve public ConvexPress content pages: homepage content, static pages, blog posts, blog index, archives, categories, tags, author pages, comments, search results, structured content rendering, or post/page SEO on the Website.
---

# website-content-experience

Use this for public content routes. Design-specific rebuilds should also invoke
the matching `design-*` skill; this skill is for the route/data/rendering
workflow and integration with Admin content.

## System Map

- Routes:
  - `apps/web/src/routes/_marketing/index.tsx`
  - `apps/web/src/routes/_marketing/page/$.tsx`
  - `apps/web/src/routes/_marketing/blog/**`
  - `apps/web/src/routes/_marketing/archive.tsx`
  - `apps/web/src/routes/_marketing/category/$slug.tsx`
  - `apps/web/src/routes/_marketing/tag/$slug.tsx`
  - `apps/web/src/routes/_marketing/author/$slug.tsx`
  - `apps/web/src/routes/_marketing/search.tsx`
- Backend owner: `../ConvexPress-Admin/packages/backend/convex/posts`,
  `pages`, `comments`, `taxonomy`, `search`, `seo`.
- Block rendering: use `website-block-layout-rendering` when body/block output
  changes.

## Workflow

1. Identify route type: page, post, archive, taxonomy, author, search, or
   comments.
2. Read the route, loader/query usage, and backend query contract.
3. Preserve SSR prefetch, notFound states, loading/empty states, canonical URLs,
   SEO metadata, JSON-LD where present, and membership/restricted content.
4. For comments, preserve auth states, moderation/pending behavior, feeds, and
   spam restrictions.
5. For search/archive changes, verify pagination and result-type routing.
6. Do not add Convex functions here; add backend changes in Admin.

## Verification

Run Website checks and browser-smoke representative routes:

```bash
bun run check-types
bun run build
```

## Report

List routes changed, data contracts, SEO/canonical behavior, auth/restriction
states, and verification.
