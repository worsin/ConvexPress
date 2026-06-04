---
name: website-gallery-recipes-experience
description: Use when the user asks to build, audit, debug, redesign, or improve public gallery pages, gallery album/category routes, recipe index/detail/category routes, media-rich custom content rendering, recipe SEO/schema, or gallery/recipe discovery on the ConvexPress Website.
---

# website-gallery-recipes-experience

Use this for public gallery and recipe routes.

## System Map

- Gallery routes: `apps/web/src/routes/_marketing/gallery/**`
- Recipe routes: `apps/web/src/routes/_marketing/recipes/**`
- Backend owner: `../ConvexPress-Admin/packages/backend/convex/gallery`,
  `recipes`, media, taxonomy, SEO/search.
- Admin skill: use `gallery-recipes-content` for backend/admin edits.

## Workflow

1. Identify content type: gallery index, album detail, gallery category, recipe
   index, recipe detail, or recipe category.
2. Read the route and backend query contract.
3. Preserve slug/canonical behavior, notFound states, media fallbacks,
   responsive image/video rendering, and pagination.
4. For recipes, preserve ingredient/instruction rendering, metadata, JSON-LD if
   present, and category navigation.
5. For galleries, preserve ordering, captions/alt text, and accessible media
   navigation.
6. Do not add backend functions in Website; add them in Admin.

## Verification

Run Website checks and smoke representative gallery/recipe routes:

```bash
bun run check-types
bun run build
```

## Report

List routes, media/SEO behavior, backend contracts, and verification.
