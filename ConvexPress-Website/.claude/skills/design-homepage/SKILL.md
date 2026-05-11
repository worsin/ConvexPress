---
name: design-homepage
description: Use when the user asks to design, redesign, build, regenerate, or restyle the homepage / home route / landing route of this site. Generates apps/web/src/routes/_marketing/index.tsx adapted to the current brand doc and featured content. Reads the design-kit before writing anything.
---

# design-homepage

You are generating (or regenerating) the **homepage** for this ConvexPress
Website. Output: a complete `apps/web/src/routes/_marketing/index.tsx`.

## Workflow

Follow these steps in order. Don't skip any.

### 1. Read the design-kit constitution

Before doing anything else, read in this order:

1. `design-kit/README.md`
2. `design-kit/ARCHITECTURE.md`
3. `design-kit/CONTRACTS.md`
4. `design-kit/BRAND.md`
5. `design-kit/references/homepage.example.tsx`

These are non-negotiable. If you've already read them in this session,
you may skip — but only if you actually have, not because you think you
already know the patterns.

### 2. Pull the brand doc

```bash
bunx convex run settings:getBrand
```

If the brand doc is `null` or missing, STOP. Report to the user:

> The brand doc isn't set up yet. Run `design:brand-discovery` first to
> author the brand, then re-run `design:homepage`.

Don't generate a homepage from defaults.

### 3. Pull a sample of the data this route uses

```bash
bunx convex run settings:getSiteIdentity
bunx convex run posts:queries:listFeatured '{"limit": 3}'
bunx convex run pages:queries:getFrontPage
```

Note any gaps (e.g., no featured posts exist). You'll either render
a clean empty state or design around the data that IS present. Don't
fabricate content.

### 4. Read the current homepage

Read `apps/web/src/routes/_marketing/index.tsx`. Know what's there. You
will replace it entirely — preserving nothing — but you should be aware
of what existed.

### 5. Generate the new file

Write `apps/web/src/routes/_marketing/index.tsx` from scratch. Use the
reference template's *structure* (loader, head, component, skeleton,
queries) and make every *visual* choice fresh based on the brand doc.

Your file MUST satisfy every item in `CONTRACTS.md`. Run through the
checklist mentally before declaring done.

### 6. Verify it compiles

```bash
cd ConvexPress-Website && bun --filter web check-types
```

If TypeScript errors appear, fix them. Don't ship a broken file.

### 7. Record the generation

Attempt to record via Convex:

```bash
bunx convex run designKit:mutations:recordGeneration '{
  "route": "/",
  "skill": "design:homepage",
  "filePath": "apps/web/src/routes/_marketing/index.tsx",
  "brandSnapshot": <the brand doc you read in step 2>,
  "notes": "<any data gaps or notable choices>"
}'
```

If this mutation does not exist yet (you'll get a "Could not find
function" error), append a JSON line to
`design-kit/.generations.log.jsonl` instead:

```jsonl
{"ts":"2026-05-11T...","route":"/","skill":"design:homepage","filePath":"apps/web/src/routes/_marketing/index.tsx","brand":{...},"notes":"..."}
```

### 8. Report back to the user

Brief summary:
- What you generated (file path)
- The key brand-driven choices (palette decisions, type pairing, layout style)
- Any data gaps flagged (e.g., "no featured posts yet — designed an empty
  state that invites authoring")
- Any contract conflicts and how you resolved them

## Output contract

- **File:** `apps/web/src/routes/_marketing/index.tsx`
- **Required exports:** `Route` (from `createFileRoute(...)`)
- **Must include:** loader with prefetch, `head:` with canonical + OG meta,
  semantic `<main>`/`<h1>`, skeleton state, empty state for featured content.
- **Must not include:** imports from `@/templates/*`, `@/template-parts/*`,
  `@/lib/template-registry`, `@/lib/template-part-registry`,
  `@/lib/theme-context`, or `@radix-ui/*`. No hardcoded color literals.

## When NOT to use this skill

- The user wants a **page** (e.g., About, Contact) — that's `design:single-page`.
- The user wants a **landing page for a campaign** (e.g., `/black-friday`) —
  also `design:single-page` (the front page is special, marketing landings
  are not).
- The user wants the site header or footer — those are separate skills.
