---
name: content-editorial-workflow
description: Use when the user asks to create, edit, audit, debug, import, or improve ConvexPress posts, pages, comments, categories, tags, menus, custom fields, revisions, SEO tabs on content, traffic/engagement tabs, page blocks, or editorial publishing workflows in Admin.
---

# content-editorial-workflow

Use this for core WordPress-like content management in `ConvexPress-Admin/`.
This is distinct from public template design; Admin owns editorial data,
structured content, block editing, revisions, comments, and publish workflow.

## System Map

- Posts: `apps/web/src/routes/_authenticated/_admin/posts/**`
- Pages: `apps/web/src/routes/_authenticated/_admin/pages/**`
- Comments: `apps/web/src/routes/_authenticated/_admin/comments/**`
- Menus: `apps/web/src/routes/_authenticated/_admin/menus/**`
- Custom fields: `apps/web/src/routes/_authenticated/_admin/custom-fields/**`
- Backend domains: `packages/backend/convex/posts`, `pages`, `comments`,
  `menus`, `customFields`, `revisions`, `seo`, and related schema files.
- Blocks:
  - Admin block registry/editor: `apps/web/src/blocks/`,
    `apps/web/src/blocks.local/`, `apps/web/src/lib/blocks/`
  - Use `block-build`, `block-add-feature`, or `block-audit` for block module
    creation or block-specific changes.
- Public consumers: Website blog/page/archive routes and block renderers.

## Workflow

1. Identify the editorial object: post, page, comment, taxonomy, menu, custom
   field group, revision, block, or analytics/SEO tab.
2. Read the admin route and backend functions before editing. Do not infer data
   shape from UI labels alone.
3. Preserve content lifecycle semantics: draft, published, scheduled/archived if
   present, slug uniqueness, author ownership, revision history, SEO metadata,
   and search indexing.
4. For page/post editors, keep full-page editor navigation and autosave/dirty
   state behavior; do not replace content editors with modal flows.
5. For taxonomies and menus, verify slug/path stability and public route impact.
6. For comments, preserve moderation state, author metadata, spam/pending states,
   and public comment feeds.
7. If the change affects public rendering, update Website routes/components and
   use `website-content-experience` or `website-block-layout-rendering`.

## Verification

Run focused backend tests if present, plus backend and app typechecks when data
contracts move:

```bash
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

For UI changes, smoke the edited admin route and the corresponding public
Website route.

## Report

List object type, lifecycle/slug/revision effects, public rendering effects,
and verification.
