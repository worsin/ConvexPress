# Workflow — building a new extension end-to-end (v2)

The execution order for `extension:build`. Follow these phases in
order; each builds on the previous. Skipping ahead = an extension that
half-works.

---

## Phase 0 — Prerequisites & inputs

Before generating any code, gather:

1. **Extension id** (camelCase, e.g., `events`). Confirm uniqueness:
   - Not already in `apps/web/src/lib/plugins/registry.ts`'s
     `PLATFORM_PLUGINS` (platform-shipped)
   - Not already a folder name under `apps/web/src/extensions/` or
     `apps/web/src/extensions.local/`
2. **Distribution scope:**
   - **Official** (committed to upstream, maintainer-shipped) →
     `extensions/<id>/`
   - **Local** (user-installed, gitignored) → `extensions.local/<id>/`
3. **Display title** (e.g., "Events")
4. **One-line description** (for the `/plugins` toggle page)
5. **Lucide icon name** (suggest one based on the domain)
6. **Tables** the extension owns (names + main fields)
7. **Whether it has a public Website surface**, and if so, what URL prefix
8. **Whether it depends on another extension**
9. **Capabilities the extension defines** (e.g., `event.create`,
   `event.publish`)
10. **Default-enabled state** (`true` / `false`)

Ask if anything is unclear. Don't fabricate.

---

## Phase 1 — Read the kit

1. `extension-kit/README.md`
2. `extension-kit/ARCHITECTURE.md` (especially the 5 v2 layers)
3. `extension-kit/CONTRACTS.md`
4. `extension-kit/DATA-API.md`
5. Reference files:
   - `references/schema.example.ts`
   - `references/queries.example.ts`
   - `references/mutations.example.ts`
   - `references/manifest.example.ts`
   - `references/nav.example.ts`
   - `references/admin-list-route.example.tsx`

Skip the reading you've genuinely done this session.

---

## Phase 2 — Pick the root + create the folders

Based on Phase 0's distribution scope, pick ONE of:

- **Official:** `<root>` = `extensions`
- **Local:** `<root>` = `extensions.local`

Then create the two extension folders:

- `packages/backend/convex/<root>/<id>/`
- `apps/web/src/<root>/<id>/`

Both are new — `mkdir -p` if your tooling doesn't auto-create.

---

## Phase 3 — Backend (Layers 1-3)

Create the four backend files:

1. `packages/backend/convex/<root>/<id>/schema.ts` — exports `tables`
2. `packages/backend/convex/<root>/<id>/queries.ts` — public + admin queries
3. `packages/backend/convex/<root>/<id>/mutations.ts` — `requireCan` at top of every handler; `emitEvent` for state changes
4. `packages/backend/convex/<root>/<id>/internals.ts` — optional

Match the patterns in `references/schema.example.ts`,
`queries.example.ts`, `mutations.example.ts`.

If event constants need to be added for this extension's events (e.g.,
`EVENT_EVENTS.CREATED`), add them to
`packages/backend/convex/events/constants.ts` following the existing
naming pattern.

---

## Phase 4 — Frontend manifest + nav (Layer 4)

Create:

1. `apps/web/src/<root>/<id>/manifest.ts` — default-exports
   `AdminPluginDefinition`
2. `apps/web/src/<root>/<id>/nav.ts` — default-exports
   `AdminNavSection` (skip this file if the extension has no sidebar
   presence — set the manifest's `navSectionIds: []` instead)

Match the patterns in `references/manifest.example.ts` and
`references/nav.example.ts`.

---

## Phase 5 — Admin routes (Layer 5)

Create the admin routes at their CANONICAL TanStack Router path:

- `apps/web/src/routes/_authenticated/_admin/<route-prefix>/index.tsx` — list
- `apps/web/src/routes/_authenticated/_admin/<route-prefix>/new.tsx` — create
- `apps/web/src/routes/_authenticated/_admin/<route-prefix>/$<id>/edit.tsx` — edit
- `apps/web/src/routes/_authenticated/_admin/<route-prefix>/settings.tsx` — optional settings

Each wraps with `<PluginGuard pluginId="<id>">` as shown in
`references/admin-list-route.example.tsx`.

Routes live under their canonical path because TanStack Router's vite
plugin auto-discovers `src/routes/**`. Putting routes in
`extensions[.local]/<id>/` would NOT work — the router doesn't scan
there.

---

## Phase 6 — Capabilities (Layer 6 — surface only)

List every new capability the extension uses (via `requireCan` in your
mutations and `useCan` / `<RoutePermissionGuard>` in your routes).

Recommend role grants per capability. Default to administrator-only;
surface in the report which roles the maintainer might want to grant
broader access to.

You do NOT add capabilities to the central role registry. Surface them
in the report so `/experts:role-capability-system` can register them.

---

## Phase 7 — Codegen + verify

```bash
cd ConvexPress-Admin/packages/backend
bun run codegen:extensions
# Verify: convex/schema/_extensionsIndex.generated.ts now references
# your new extension's schema

cd ..
bun --filter web check-types
# Must exit 0
```

The codegen script imports + spreads your `schema.ts`'s `tables`
export into the generated index. If typecheck fails on a missing field
or type, fix it in your extension's files — never in the hubs.

The `_generated/api` types for `api.extensions.<id>.queries.*` will be
stale until the next Convex deploy. That's expected; surface it in the
report. The Convex Deployment Expert handles the deploy.

---

## Phase 8 — Report

Cover:

- **Distribution scope** (official vs local) and which root the files
  landed in
- **Files created** (full paths, both backend and frontend)
- **New capabilities** the Role expert needs to register, with
  recommended role grants
- **Public surface handoff** — if `routePrefixes` is non-empty, hand
  off to `/design:custom-post-type` in
  `ConvexPress-Website/.claude/skills/`
- **Codegen + typecheck status**
- **Deploy instructions** — explicit ask for
  `/experts:convex-deployment` to run `bun run deploy` in
  `packages/backend/` (which runs codegen + `convex deploy`)
- **Deviations from kit standard**, with justification

---

## When to invoke `extension:add-feature` instead

Don't use `extension:build` to add functionality to an existing
extension. Use `extension:add-feature` — it knows the extension's
folder structure and only adds the new mutation / query / route /
capability you specified.

---

## When to invoke `extension:audit` instead

If something feels off about an existing extension (codegen failing,
nav not appearing, mutations not gated), use `extension:audit`. It
walks the v2 5-layer contract and reports gaps without modifying
anything.

---

## Hand-edited platform extensions (v1)

The extensions that ship with the platform today (commerce, kb,
recipes, gallery, etc.) are v1 — hand-edited into the hub files. They
coexist with v2 via the merged registries. **Don't migrate them as
part of an `extension:build` run.** That's a separate migration
concern not covered by this skill.
