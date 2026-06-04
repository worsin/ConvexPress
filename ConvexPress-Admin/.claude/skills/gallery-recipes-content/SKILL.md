---
name: gallery-recipes-content
description: Use when the user asks to create, audit, debug, or improve ConvexPress galleries, gallery albums/categories, recipes, recipe categories, custom content media collections, public gallery/recipe routes, or related admin content workflows.
---

# gallery-recipes-content

Use this for media-rich custom content systems that are not generic posts/pages.

## System Map

- Gallery admin routes: `apps/web/src/routes/_authenticated/_admin/gallery/**`
- Recipe admin routes: `apps/web/src/routes/_authenticated/_admin/recipes/**`
- Backend domains: `packages/backend/convex/gallery`, `recipes`, categories,
  media references, SEO/search helpers.
- Website consumers:
  - `../ConvexPress-Website/apps/web/src/routes/_marketing/gallery/**`
  - `../ConvexPress-Website/apps/web/src/routes/_marketing/recipes/**`

## Workflow

1. Identify object: gallery album, gallery category, gallery media ordering,
   recipe, recipe category, or public template.
2. Read current admin route, backend functions, and public route when rendering
   changes.
3. Preserve slug uniqueness, publication/visibility state, SEO metadata, media
   references, sorting, and category links.
4. For galleries, verify image/video fallback behavior and album ordering.
5. For recipes, preserve ingredients/instructions/nutrition/metadata shape if
   present and public JSON-LD/search behavior.
6. If the request is a new custom content type rather than gallery/recipe, use
   `extension-build` or `design-custom-post-type` as appropriate.

## Verification

Run backend typecheck and smoke admin/public route pairs when touched:

```bash
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

## Report

List content type, media/slug/SEO effects, public route impact, and verification.
