---
name: design-archive
description: Use when the user asks to design, redesign, build, regenerate, or restyle any archive/index list page — the blog index, category archives, tag archives, author archives, recipes index, or similar listings of posts. Triggers on "design the blog index", "rebuild the post list", "redo category archives", "fix the tag pages". Generates one or more of apps/web/src/routes/_marketing/blog/index.tsx, category/$slug.tsx, tag/$slug.tsx, author/$slug.tsx.
---

# design-archive

You are generating an **archive** template — a paginated list of posts.
The same shape covers blog index, category archives, tag archives, and
author archives; the data source changes, the layout is consistent.

## Workflow

1. **Read the kit:** README, ARCHITECTURE, CONTRACTS, BRAND, and
   `references/archive.example.tsx`.

2. **Confirm scope with the user before generating multiple files.**
   If they said "the blog index," only generate that. If they said
   "all archives," generate all four. Ask if ambiguous.

3. **Pull brand + sample data:**
   ```bash
   bunx convex run settings:getBrand
   bunx convex run posts:queries:listPublished '{"paginationOpts":{"numItems":12,"cursor":null}}'
   bunx convex run categories:queries:list
   ```

4. **Read current files** for whichever archives you're regenerating.

5. **Generate each file** following the reference's structure:
   - SSR loader prefetches the first page of results + brand
   - Component renders header → optional filter chips → grid of cards
   - "Load more" pagination using `continueCursor`
   - Empty state when zero results
   - `head:` with archive title and canonical
   - For category/tag/author variants: pull the term first
     (`categories:queries:getBySlug`), then filter posts by it

6. **Verify it compiles** and **record generation** per file (see
   CONTRACTS §8) — one receipt per file written.

## Output contract per file

- **Files (one or more):**
  - Blog index: `apps/web/src/routes/_marketing/blog/index.tsx`
  - Category: `apps/web/src/routes/_marketing/category/$slug.tsx`
  - Tag: `apps/web/src/routes/_marketing/tag/$slug.tsx`
  - Author: `apps/web/src/routes/_marketing/author/$slug.tsx`
- **Required exports:** `Route`
- **Must include:** loader with paginated prefetch, `head:` with title +
  canonical, `<h1>`, grid + empty + skeleton states, pagination control.

## When NOT to use this skill

- Single post → `design:single-post`
- Product catalog → `design:catalog`
- Search → `design:search`
