---
name: design-not-found
description: Use when the user asks to design, redesign, build, regenerate, or restyle the 404 / not-found page. Triggers on "design the 404", "rebuild the not-found page", "redo the 404 template", "fix how 404 looks". Generates apps/web/src/templates/NotFoundTemplate.tsx (the component referenced by routes/__root.tsx as notFoundComponent).
---

# design-not-found

You are generating the **404 / not-found** template. Output: a complete
`apps/web/src/templates/NotFoundTemplate.tsx` (note: this is the one
legacy `templates/` file that stays, because it's already wired into
`routes/__root.tsx` as the `notFoundComponent`).

## Workflow

1. **Read the kit:** README, ARCHITECTURE, CONTRACTS, BRAND, and
   `references/not-found.example.tsx`.

2. **Pull brand + recent posts (for the hint):**
   ```bash
   bunx convex run settings:getBrand
   bunx convex run posts:queries:listPublished '{"paginationOpts":{"numItems":3,"cursor":null}}'
   ```

3. **Read** `apps/web/src/templates/NotFoundTemplate.tsx` and
   `apps/web/src/routes/__root.tsx` (to see where it's wired).

4. **Generate the new file** following the reference's structure:
   - Big "404" eyebrow + clear primary headline
   - Helpful guidance copy in brand voice
   - Two CTAs: Home + Search
   - Optional "recent posts" hint
   - Brand-consistent styling via CSS variables
   - Component reads as a `<main>`, not just a `<div>`, with `<h1>`

5. **Note:** the 404 template doesn't define its own `head:` — it's
   wired via `__root.tsx`'s notFoundComponent. If `noindex` isn't already
   set in the root for the not-found case, that's a separate fix to flag.

6. **Verify it compiles** and **record generation** (CONTRACTS §8).

## Output contract

- **File:** `apps/web/src/templates/NotFoundTemplate.tsx`
- **Required exports:** `NotFoundTemplate` (named export consumed by `__root.tsx`)
- **Must include:** semantic `<main>`, single `<h1>`, two CTAs to safe
  destinations, optional recent-content hint, responsive layout.

## When NOT to use this skill

- 500/error → that's a separate template (`ErrorTemplate.tsx`).
