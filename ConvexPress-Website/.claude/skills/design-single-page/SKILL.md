---
name: design-single-page
description: Use when the user asks to design, redesign, build, regenerate, or restyle a static page route — About, Contact, Services, marketing landing pages, or any page authored in the Pages system. Triggers on phrases like "design the page template", "rebuild the page route", "redo static pages", "fix how pages look". Generates apps/web/src/routes/_marketing/page/$.tsx.
---

# design-single-page

You are generating the **single-page** template — the catch-all route that
renders any static page authored in the Pages system by its path. Output:
a complete `apps/web/src/routes/_marketing/page/$.tsx`.

## Workflow

1. **Read the kit:** README, ARCHITECTURE, CONTRACTS, BRAND, and
   `references/single-page.example.tsx`.

2. **Pull brand + sample data:**
   ```bash
   bunx convex run settings:getBrand
   bunx convex run pages:queries:getByPath '{"path":"/about"}'
   ```
   (Substitute a real path if `/about` doesn't exist. List pages with
   `pages:queries:list` if needed.)

3. **Read current file** at `apps/web/src/routes/_marketing/page/$.tsx`.

4. **Generate the new file** following the reference's structure:
   - Catch-all `$` param using `_splat`
   - Loader prefetches `pages.queries.getByPath` + brand
   - `head:` sets per-page title/description from the page data
   - Component: header (title, optional subtitle) → page body rendered via
     the existing structured-content renderer / `PageRenderer` component
   - Skeleton + notFound() states

5. **Use existing components** for body rendering. There may be a
   `<PageRenderer>` already — prefer it.

6. **Verify it compiles** and **record generation** (see CONTRACTS §8).

## Output contract

- **File:** `apps/web/src/routes/_marketing/page/$.tsx`
- **Required exports:** `Route`
- **Must include:** catch-all param handling, loader prefetch, `head:`
  with per-page title/description/canonical, semantic `<main>` + `<h1>`,
  skeleton + notFound.

## When NOT to use this skill

- Homepage → `design:homepage`
- Blog post → `design:single-post`
- Product → `design:single-product`
