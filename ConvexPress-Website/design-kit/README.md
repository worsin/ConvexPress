# Design Kit

This folder is Claude's brain for designing the front end of this site.

**Who reads this:** Claude, when invoked via any `design:*` skill in
`.claude/skills/`. The user never reads or edits this folder directly.

**What lives here:**

```
design-kit/
├── README.md           ← you are here
├── ARCHITECTURE.md     ← how this site is wired (data, routing, SSR, styling, auth)
├── CONTRACTS.md        ← what a template MUST satisfy to be considered done
├── BRAND.md            ← shape of the brand doc + how brand inputs drive design
├── DATA-API.md         ← the verified Convex API surface (every callable query/mutation)
├── WORKFLOW.md         ← end-to-end sequence for a new site
├── TROUBLESHOOTING.md  ← failure modes + fixes
└── references/         ← real, working example templates (read these to learn patterns)
    ├── homepage.example.tsx
    ├── single-post.example.tsx
    ├── single-page.example.tsx
    ├── archive.example.tsx
    ├── single-product.example.tsx
    ├── catalog.example.tsx
    ├── search.example.tsx
    ├── header.example.tsx
    ├── footer.example.tsx
    └── not-found.example.tsx
```

## Reading order for any `design:*` invocation

1. **`ARCHITECTURE.md`** — site-wide truth: routing, SSR loader pattern,
   Convex client, Tailwind v4 conventions, Base UI rules, Clerk auth.
   Read this once per session; the patterns apply to every template.

2. **`CONTRACTS.md`** — the validation checklist. Every template you write
   must satisfy these. Treat each item as a hard requirement.

3. **`BRAND.md`** — the brand doc shape and the mapping table from brand
   fields to design choices (palette, typography, density, voice). This
   tells you HOW to translate the site's brand into visual decisions.

4. **`DATA-API.md`** — the **verified** Convex queries and mutations you
   can call. **If a name isn't on this list, it doesn't exist.** Always
   check here before writing a Convex call into a template.

5. **The relevant reference in `references/`** — this is your working
   example. Copy its structure (loader, SEO, layout, query patterns).
   Replace its visuals with whatever the brand calls for.

6. **The brand doc itself** — pull it live from Convex:
   ```bash
   bunx convex run settings:queries:getBySection '{"section":"brand"}'
   ```
   See `BRAND.md` for the schema; see `DATA-API.md` for why this is the
   correct call (and not the imaginary `settings:getBrand`).

7. **The current state of the file you're writing** — read what exists in
   `apps/web/src/routes/...` for the route you're regenerating. You don't
   have to preserve it, but be aware of what's there before you replace it.

## When something goes wrong

See **`TROUBLESHOOTING.md`**. Covers: missing Convex functions, null
brand doc, type errors after generation, blank pages, deprecated-module
leaks, and what to do when no skill matches a request.

## End-to-end pipeline for a new site

See **`WORKFLOW.md`**. The order is: prerequisites → brand discovery →
chrome (header/footer) → core body templates → commerce → audit.

## What you write

Every `design:*` skill writes one or more files in
`apps/web/src/routes/...`. The output contract is defined in each skill's
`SKILL.md` (file path, required exports, validation).

## What you don't do

- **Don't edit `design-kit/` itself** during a design run. It's the
  constitution, not a working file.
- **Don't add new "section types" or build a section enum.** The whole
  point of this kit is that each route is bespoke React. There is no
  fixed component library to compose from.
- **Don't import from the legacy admin theme system.** Anything under
  `ConvexPress-Admin/.../themes/`, `appearance/`, or `layouts/` is
  deprecated and must not be referenced.
- **Don't hardcode colors.** Use the CSS variable system documented in
  `ARCHITECTURE.md`. Brand colors propagate through variables, not literals.
- **Don't drop popups/modals for content management.** This is a Website
  consumer — visitor-facing only. The admin handles content management
  separately and is not part of this repo's concern.
