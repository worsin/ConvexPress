---
name: design-custom-post-type
description: Use when the user asks to design, build, regenerate, or restyle the templates for a custom post type (CPT) — a user-defined content type other than the built-in post/page/product. Triggers on "design the case studies templates", "build the team members pages", "regenerate the events route", "add templates for my <thing> content type". Generates the archive (index) and single ($slug) routes for that CPT.
---

# design-custom-post-type

You are generating both **archive** and **single** templates for a
custom post type. Output: two files under
`apps/web/src/routes/_marketing/<cpt-plural>/`.

This skill handles Pattern 4 in `design-kit/EXTENDING.md`. If the user
is asking for one of the other patterns, route there instead.

## Prerequisites

The CPT **must already exist on the admin backend** with public queries
exposed. This skill does NOT create the CPT itself — that's an
admin-side concern, handled by the `extension-kit` in the Admin repo.

Confirm before doing anything else:

```bash
# Replace <cpt> with the type's system name, e.g. "caseStudies"
bunx convex run <cpt>:queries:listPublished '{"paginationOpts":{"numItems":1,"cursor":null}}'
bunx convex run <cpt>:queries:getBySlug '{"slug":"<any real slug>"}'
```

If either query doesn't exist or errors with "Could not find function":
**STOP**. Report to the user:

> The CPT `<cpt>` doesn't have public queries on the admin backend yet.
> Build that first via the `extension-kit` in `ConvexPress-Admin/`, then
> re-run `design:custom-post-type`.

Don't fabricate the queries in the Website template.

## Workflow

1. **Read the kit:**
   - `design-kit/README.md`
   - `design-kit/ARCHITECTURE.md`
   - `design-kit/CONTRACTS.md`
   - `design-kit/BRAND.md`
   - `design-kit/DATA-API.md` (especially the section on listing public APIs)
   - `design-kit/EXTENDING.md` (Pattern 4 specifically)
   - `design-kit/references/archive.example.tsx` — your archive pattern
   - `design-kit/references/single-post.example.tsx` — your single pattern
     (single-post is the closest analog; adapt accordingly)
   - `design-kit/references/custom-post-type-archive.example.tsx` — CPT-specific
   - `design-kit/references/custom-post-type-single.example.tsx` — CPT-specific

2. **Gather inputs from the user:**
   - The CPT's system name (e.g., `caseStudies`, `events`, `teamMembers`)
   - The CPT's plural URL slug (e.g., `case-studies`, `events`, `team`)
   - The CPT's singular display name (e.g., "Case Study", "Event")
   - Any CPT-specific fields the archive should expose as filters
     (e.g., events have a `date` field; case studies might have an
     `industry` field)

3. **Pull brand + sample data:**
   ```bash
   bunx convex run settings:queries:getBySection '{"section":"brand"}'
   bunx convex run <cpt>:queries:listPublished '{"paginationOpts":{"numItems":3,"cursor":null}}'
   ```

4. **Read current files** if they exist:
   - `apps/web/src/routes/_marketing/<cpt-plural>/index.tsx`
   - `apps/web/src/routes/_marketing/<cpt-plural>/$slug.tsx`

5. **Generate the archive** at
   `apps/web/src/routes/_marketing/<cpt-plural>/index.tsx`:
   - SSR loader prefetches `<cpt>.queries.listPublished` + brand
   - `head:` with title, description, canonical, JSON-LD CollectionPage
   - Component: header → optional filter chips (if user specified
     filterable fields) → paginated grid of cards → "Load more"
   - Empty state, skeleton state

6. **Generate the single** at
   `apps/web/src/routes/_marketing/<cpt-plural>/$slug.tsx`:
   - Zod-validated `slug` param
   - SSR loader prefetches `<cpt>.queries.getBySlug({slug})` + brand
   - `head:` with per-item title, description, canonical, OG meta,
     JSON-LD (Article or CreativeWork shape depending on CPT)
   - Component: header → featured image (if present) → body content →
     CPT-specific sections (e.g., event date+venue block, team member
     bio+social block)
   - Skeleton + `throw notFound()` states

7. **Verify it compiles:**
   ```bash
   cd ConvexPress-Website && bun --filter web check-types
   ```

8. **Record two generation entries** — one per file, per `CONTRACTS.md` §8.

9. **Report back:**
   - Both file paths
   - Key brand-driven decisions
   - Any CPT field gaps you flagged (e.g., "the schema has `industry`
     but no records use it yet — designed without that filter")
   - Whether the backend exposes everything the templates expect

## Output contract

- **Files (two):**
  - `apps/web/src/routes/_marketing/<cpt-plural>/index.tsx`
  - `apps/web/src/routes/_marketing/<cpt-plural>/$slug.tsx`
- **Required exports:** `Route` in each
- **Must include:** all standard requirements from `CONTRACTS.md`,
  plus correct linking between archive and single (the archive's cards
  link to the single via the correct `to` and `params`).

## When NOT to use this skill

- **Blog posts** → `design:single-post` + `design:archive`. Posts are
  built-in, not a CPT.
- **A single named page** (one instance only) → `design:single-page` or
  `design:page-feature`.
- **Creating the CPT itself** (schema, admin UI, queries) → not this
  skill. Use `extension-kit` in the Admin repo to build the CPT's
  extension first, then run this skill.
