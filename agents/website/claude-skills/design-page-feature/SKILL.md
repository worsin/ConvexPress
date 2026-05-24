---
name: design-page-feature
description: Use when the user asks to add custom functionality, an interactive widget, a form, a calculator, a map, a locator, a filter UI, or any bespoke React below or alongside the content of a specific Page record. Triggers on "build the contact page with a form", "design the find-a-dealer page with a map", "make the pricing page have a calculator", "the /integrations page needs a filterable grid". Generates a named route override at apps/web/src/routes/_marketing/<slug>.tsx that pulls the Page record from admin and layers custom UI on top.
---

# design-page-feature

You are generating a **named route override** for a specific Page that
needs custom front-end functionality beyond just rendering its content
block. Output: `apps/web/src/routes/_marketing/<slug>.tsx`.

This skill handles Pattern 3 in `design-kit/EXTENDING.md`. The Page
record continues to exist in admin (so menus, SEO, and intro copy stay
editable there); the named route file overrides the catch-all
`/page/$` for that specific URL.

## Workflow

1. **Read the kit:**
   - `design-kit/README.md`
   - `design-kit/ARCHITECTURE.md` (especially routing precedence)
   - `design-kit/CONTRACTS.md`
   - `design-kit/BRAND.md`
   - `design-kit/EXTENDING.md` (Pattern 3 specifically)
   - `design-kit/references/single-page.example.tsx` (the baseline)
   - `design-kit/references/page-feature.example.tsx` (the custom-UI pattern)

2. **Gather inputs from the user:**
   - The page's URL slug (e.g., `find-a-dealer`, `contact`, `pricing`).
   - A clear description of the custom functionality — interactive
     calculator, filterable grid, contact form, embedded map, etc.
   - What data the custom UI needs (if any). If it needs Convex data
     beyond the Page record, identify which queries (and verify they
     exist via `DATA-API.md`).

3. **Confirm the Page record exists:**
   ```bash
   bunx convex run pages:queries:getByPath '{"path":"/<slug>"}'
   ```
   If `null`, ask the user to create the Page in admin first (they'll
   want it for the menu, SEO, and intro copy). Don't proceed without it.

4. **Pull brand + page record:**
   ```bash
   bunx convex run settings:queries:getBySection '{"section":"brand"}'
   bunx convex run pages:queries:getByPath '{"path":"/<slug>"}'
   ```

5. **Check whether the file already exists** at
   `apps/web/src/routes/_marketing/<slug>.tsx`. If it does, read it.

6. **Generate the new file:**
   - File path: `apps/web/src/routes/_marketing/<slug>.tsx`
   - Standard SSR pattern: loader prefetches the page record + brand +
     any custom-feature queries
   - `head:` pulls title/description from the page record so the editor
     stays in control of SEO
   - Component layout (in order):
     - **Page header** — title + intro from the page record's
       title/subtitle/content
     - **Custom feature** — the bespoke React widget the user requested
     - Optional **rest of page content** below the feature, if the
       Page record's content block has more to render
   - All standard contracts apply (skeleton, notFound, semantic HTML,
     CSS variables only, no hardcoded colors)

7. **Important — routing precedence:**
   TanStack Router resolves more-specific routes first. A file at
   `_marketing/<slug>.tsx` wins over the catch-all `/page/$` for that
   exact URL. **Do not** modify the catch-all; just create the named
   file. The router handles the rest.

8. **Verify it compiles:**
   ```bash
   cd ConvexPress-Website && bun --filter web check-types
   ```

9. **Record the generation** per `CONTRACTS.md` §8 with notes
   describing the feature.

10. **Report back:**
    - File path written
    - Confirmation the Page record is in place and still owns title /
      SEO / intro
    - Description of the custom feature you implemented
    - Any backend gaps the feature surfaced (e.g., a query you needed
      that doesn't exist yet)

## Output contract

- **File:** `apps/web/src/routes/_marketing/<slug>.tsx`
- **Required exports:** `Route`
- **Must include:**
  - Loader that prefetches the page record (title/SEO/content) plus
    brand plus whatever the custom UI needs
  - `head:` driven by the page record's title + description
  - Page record's title rendered as the `<h1>`
  - Page record's intro copy rendered above the custom feature
  - The custom feature implemented in bespoke React (no fixed section
    composer; no enum)
  - Skeleton + notFound states
  - All standard CONTRACTS.md requirements

## When NOT to use this skill

- **Vanilla page** with no custom UI → `design:single-page` (the
  catch-all is fine).
- **Many instances of the same shape** → `design:custom-post-type`. A
  single page-with-feature is bespoke; many of them with the same
  feature is a CPT.
- **Custom UI that applies to every page** → that's a layout-level
  concern; either bake it into the marketing layout
  (`_marketing.tsx`) or rework `design:single-page` itself.
- **A feature with no editable page wrapper** (e.g., a tool that has
  no SEO/intro/menu need) → just create the route file directly. You
  don't need a Page record. (But then think hard about whether it
  belongs in menus — usually yes, which means Pattern 3 again.)
