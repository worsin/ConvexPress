---
name: extension-build
description: Use when the user asks to build, create, scaffold, or add a new extension / plugin / feature module to the ConvexPress admin app. Triggers on phrases like "build an events extension", "add a new feature module for X", "create the Y extension", "scaffold an extension that does Z". Generates the v2 scanner-discovered extension layout under extensions/<id>/ (official) or extensions.local/<id>/ (user) — no shared registry files are modified.
---

# extension-build

You are creating a **new v2 extension** end-to-end. Output: code in two
coordinated folders (backend at `convex/extensions[.local]/<id>/`,
frontend at `apps/web/src/extensions[.local]/<id>/`) plus admin routes
at their canonical TanStack Router path. **You do NOT modify**
`schema.ts`, `plugins/registry.ts`, or `nav-config.ts` — those are
scanner-merged from your extension's manifest/nav/schema files.

## Prerequisites — gather from the user

Don't fabricate. Ask if unclear:

- **id** (camelCase, unique — e.g., `events`). Confirm uniqueness:
  - Not already in `apps/web/src/lib/plugins/registry.ts`'s
    `PLATFORM_PLUGINS` (platform v1)
  - Not already a folder under `apps/web/src/extensions/` (official v2)
  - Not already a folder under `apps/web/src/extensions.local/` (user v2)
- **distribution scope:**
  - **Official** (committed to upstream, ships with platform) → goes in
    `extensions/<id>/`
  - **Local** (user install, gitignored) → goes in `extensions.local/<id>/`
  - If unclear, default to `extensions.local/` and offer to move it later
- **title** + **description** + **Lucide icon**
- **tables** (names + main fields)
- **public Website surface?** yes/no; if yes, the URL prefix
- **dependency on another extension?**
- **capabilities** the extension defines
- **defaultEnabled state** (`false` is typical)

## Workflow

### Step 1 — Read the kit

In order:
1. `extension-kit/README.md`
2. `extension-kit/ARCHITECTURE.md` (especially the 5 v2 layers)
3. `extension-kit/CONTRACTS.md`
4. `extension-kit/DATA-API.md`
5. `extension-kit/WORKFLOW.md` (your execution playbook)
6. `extension-kit/TROUBLESHOOTING.md` (skim)
7. Reference files:
   - `references/schema.example.ts`
   - `references/queries.example.ts`
   - `references/mutations.example.ts`
   - `references/manifest.example.ts`
   - `references/nav.example.ts`
   - `references/admin-list-route.example.tsx`

### Step 2 — Pick the root + create the folders

Pick `<root>` = `extensions` (official) or `extensions.local` (user).

Create:
- `packages/backend/convex/<root>/<id>/`
- `apps/web/src/<root>/<id>/`

### Step 3 — Backend (Layers 1-3)

Create the four backend files in `packages/backend/convex/<root>/<id>/`:

1. `schema.ts` — exports `tables` (named export — codegen scanner uses this exact name)
2. `queries.ts` — `list`, `getBySlug`, plus domain-specific reads
3. `mutations.ts` — every handler starts with `requireCan(ctx, "...")` and emits events
4. `internals.ts` — optional system-to-system functions

Helper imports use `../../helpers/...` (two levels up; extensions are
deeper than legacy systems).

If event constants need adding, update
`packages/backend/convex/events/constants.ts` following existing
naming.

### Step 4 — Frontend manifest + optional nav (Layer 4)

Create in `apps/web/src/<root>/<id>/`:

1. `manifest.ts` — default-exports `AdminPluginDefinition`
2. `nav.ts` — default-exports `AdminNavSection` (omit if no sidebar
   presence; set manifest's `navSectionIds: []`)

Match `references/manifest.example.ts` and `references/nav.example.ts`.

### Step 5 — Admin routes (Layer 5 — canonical path)

Create routes at the standard TanStack Router location:

- `apps/web/src/routes/_authenticated/_admin/<route-prefix>/index.tsx`
- `apps/web/src/routes/_authenticated/_admin/<route-prefix>/new.tsx`
- `apps/web/src/routes/_authenticated/_admin/<route-prefix>/$<id>/edit.tsx`
- `apps/web/src/routes/_authenticated/_admin/<route-prefix>/settings.tsx`
  (optional)

Each route component MUST wrap with `<PluginGuard pluginId="<id>">` —
see `references/admin-list-route.example.tsx`.

For user extensions (`<root>` = `extensions.local`), these route files
will be untracked. TanStack Router's vite plugin auto-discovers them.

### Step 6 — Surface capabilities (Layer 6)

Don't add to the central role registry yourself. In the report, list
every new capability with recommended role grants:
- Administrator: usually yes
- Editor / Author / Contributor: depends on the action
- Subscriber: rarely

### Step 7 — Codegen + typecheck

```bash
cd ConvexPress-Admin/packages/backend
bun run codegen:extensions
# Verify: convex/schema/_extensionsIndex.generated.ts references your new schema

cd ..
bun --filter web check-types
# Must exit 0
```

The Convex `_generated/api.d.ts` will be stale for
`api.extensions.<id>.queries.*` until next deploy — that's expected.

### Step 8 — Report

Cover:
- **Distribution scope** (official vs local)
- **Files created** — full paths, backend and frontend
- **Capabilities to register** — with role-grant recommendations
- **Public Website surface handoff** — if `routePrefixes` non-empty,
  invoke `/design:custom-post-type` in the Website repo next
- **Codegen + typecheck status**
- **Deploy ask** — `/experts:convex-deployment` runs
  `bun run deploy` in `packages/backend/` (codegen + `convex deploy`)
- **Deviations from kit standard** with justification

## Output contract

- Files written under `convex/<root>/<id>/` and `apps/web/src/<root>/<id>/`
- Route files written at canonical TanStack Router paths
- **No edits** to `convex/schema.ts`, `plugins/registry.ts`, or
  `nav-config.ts`
- TypeScript exits 0
- Report covers Step 8's bullets

## When NOT to use this skill

- **Adding functionality to an existing extension** → use
  `extension:add-feature`
- **Auditing an existing extension** → use `extension:audit`
- **Migrating a v1 platform extension to v2** → not this skill;
  separate migration concern
- **Generating Website-side templates** → after building the admin
  side, hand off to `/design:custom-post-type` in the Website repo
- **Adding capabilities to the role registry** → that's the Role
  expert's domain; this skill only surfaces them
