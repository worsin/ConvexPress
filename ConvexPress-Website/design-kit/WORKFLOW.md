# Workflow — from empty site to fully designed

The end-to-end sequence for taking a fresh ConvexPress Website clone to
a fully designed site. This is what a future Claude (or a future you)
should follow in order.

If you're answering a *targeted* request ("just redo the homepage"), you
don't need this whole flow — invoke the single relevant `design:*`
skill. This doc is the **full pipeline** for new sites.

---

## Phase 0 — Prerequisites

Before any `design:*` skill runs, confirm:

1. **The Website repo is cloned** and you have an open Claude Code
   session in its root.
2. **Convex env vars are configured** in
   `apps/web/.env` (`VITE_CONVEX_URL`, `CONVEX_DEPLOY_KEY`). Without
   these, `bunx convex run` won't reach the admin's backend.
3. **The admin app's backend is deployed and reachable.** Quick check:
   ```bash
   cd ConvexPress-Admin/packages/backend
   bunx convex run healthCheck:get
   ```
4. **Read the kit constitution at least once this session:**
   `README.md → ARCHITECTURE.md → CONTRACTS.md → BRAND.md → DATA-API.md`.

If any prerequisite fails, stop and surface it — don't proceed and hope.

---

## Phase 1 — Brand discovery

The brand doc drives every visual decision the other skills make. It
must exist before any per-route skill runs.

```
design:brand-discovery
```

Outcome: an object stored at `settings(section="brand")` matching the
schema in `BRAND.md`. Verify with:

```bash
bunx convex run settings:queries:getBySection '{"section":"brand"}'
```

If you skip this, every other skill will halt with a "brand doc not
set up" message — by design.

---

## Phase 2 — Chrome first

The header and footer are shared across every route. Build them before
body templates so per-route work doesn't reference a header/footer that
hasn't been authored yet.

Order:

```
1. design:header
2. design:footer
```

After both run, navigate the Website manually and confirm the chrome
looks right at desktop, tablet, and mobile widths.

---

## Phase 3 — Core body templates

Generate the templates a typical site visitor lands on first.

Order:

```
3. design:homepage
4. design:single-post
5. design:single-page
6. design:archive            ← blog index variant
7. design:search
8. design:not-found
```

After each: skim the generated file, confirm it compiles
(`bun --filter web check-types`), and click through the resulting page
once in the browser.

---

## Phase 4 — Commerce templates (skip if no commerce)

Only if the site has products:

```
9. design:catalog
10. design:single-product
```

Confirm products are pulling from `api.commerce.products.*`. If the
admin has zero products yet, render an empty state — do not fabricate
sample products in the template.

---

## Phase 5 — Secondary archives

After the core blog index works, generate any additional archive
variants the site needs:

- Category archive (`/category/$slug`)
- Tag archive (`/tag/$slug`)
- Author archive (`/author/$slug`)

All three are `design:archive` — run it once per variant, confirming
scope with the user before each.

---

## Phase 6 — Audit + record

```
design:data-audit
```

Walks every generated file and reports any drift between what the
template expects from Convex and what's actually exposed. Lands in the
console as a structured report — no auto-fixes.

If anything is "stale" or "broken," fix it by re-running the relevant
`design:*` skill.

---

## Phase 7 — Done

A finished site has:

- A brand doc at `settings(section="brand")`
- Header + footer rendered everywhere via the marketing layout
- A homepage that pulls real data (sticky posts + brand mood)
- Single-post, single-page, archive, search, 404 generated
- (If commerce) catalog + single-product
- No imports from deprecated modules
- All routes typecheck clean
- `design-kit/.generations.log.jsonl` has one entry per generated file

Anything else (sitemaps, RSS, OG image generation, email templates) is
out of scope for the design kit and lives in admin-side systems.

---

## When something goes wrong

See `TROUBLESHOOTING.md`. Common failure modes:

- "Could not find function" — see DATA-API.md, the query doesn't exist
  or you used the wrong path.
- "Brand doc returns null" — Phase 1 wasn't run.
- "Type errors after generation" — read the errors, fix them in the
  generated file, re-run typecheck.

---

## When to redesign

You're not done at first generation. Redesign cycles happen because:

- Brand updates → `design:brand-discovery` then `design:regenerate-all`
- Schema changes → `design:data-audit` first to find drift, then
  per-route regen
- New content type added → write the corresponding `design:*` skill
  (or extend an existing one) and add a reference

Regen is cheap. The skill kit is built for it.
