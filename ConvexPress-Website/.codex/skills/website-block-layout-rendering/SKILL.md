---
name: website-block-layout-rendering
description: Use when the user asks to build, audit, debug, or improve public rendering for ConvexPress blocks, page bodies, layout assignments, themes, header/footer output, portable block renderers, structured content, or Website-side block compatibility.
---

# website-block-layout-rendering

Use this for the public rendering half of the block/layout/theme system. Admin
owns editing; Website owns rendering and route composition.

## System Map

- Public page routes: `apps/web/src/routes/_marketing/page/$.tsx` and named
  marketing overrides.
- Public block renderers: `apps/web/src/blocks/`, `blocks.local/`, and block
  rendering helpers.
- Layout/theme consumers: marketing layout, header/footer components, site
  identity/theme helpers.
- Admin owner:
  - `../ConvexPress-Admin/apps/web/src/blocks/`
  - `../ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/layouts/**`
  - `../ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/appearance/**`

## Workflow

1. Identify whether the task is block renderer, structured content rendering,
   layout assignment, theme token, header/footer, or compatibility/migration.
2. Read the Admin block schema/manifest and Website renderer together.
3. Keep block `name`, `version`, and schema shape aligned with Admin.
4. Render missing/old attrs defensively; saved content must not crash the public
   page.
5. Use theme CSS variables and existing design-kit rules; do not hardcode colors.
6. For new block types, use Admin `block-build` first, then implement Website
   rendering here.

## Verification

Run Website checks and browser-smoke a page containing the block/layout:

```bash
bun run check-types
bun run build
```

For block schema changes, also run Admin block verification.

## Report

List block/layout/theme components changed, schema compatibility, fallback
behavior, and verification.
