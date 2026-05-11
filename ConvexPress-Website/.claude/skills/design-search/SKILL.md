---
name: design-search
description: Use when the user asks to design, redesign, build, regenerate, or restyle the site search / search results page. Triggers on "design the search page", "rebuild search results", "redo the site search", "fix how search looks". Generates apps/web/src/routes/_marketing/search.tsx.
---

# design-search

You are generating the **search results** template. Output:
`apps/web/src/routes/_marketing/search.tsx`.

## Workflow

1. **Read the kit:** README, ARCHITECTURE, CONTRACTS, BRAND, and
   `references/search.example.tsx`.

2. **Pull brand + run a sample search:**
   ```bash
   bunx convex run settings:getBrand
   bunx convex run search:queries:search '{"query":"the"}'
   ```

3. **Read current file** at `apps/web/src/routes/_marketing/search.tsx`.

4. **Generate the new file** following the reference's structure:
   - `validateSearch` with Zod for the `q` search param
   - `loaderDeps` to gate refetch on `q` change
   - Conditional loader prefetch (only if `q` is present)
   - `head:` includes `<meta name="robots" content="noindex, follow" />`
   - Component renders three states:
     - No query yet → search prompt
     - Loading → skeleton
     - Has query, has results → result list
     - Has query, no results → empty state
   - Each result row shows type badge + title + excerpt + link
   - Multi-type results (posts + products + pages) routed to correct paths

5. **Verify it compiles** and **record generation** (CONTRACTS §8).

## Output contract

- **File:** `apps/web/src/routes/_marketing/search.tsx`
- **Required exports:** `Route`
- **Must include:** Zod-validated search params, conditional loader,
  `head:` with noindex, `<h1>`, all four UI states (empty prompt / loading /
  results / no-results), per-result-type routing.

## When NOT to use this skill

- Search UI inside the header (the magnifying-glass button) → that's
  part of `design:header`.
