# Extension Architecture (v2 — scanner-based)

Every extension in ConvexPress consists of files in two coordinated
folders — one for the backend, one for the frontend manifest. Routes
live at their canonical TanStack Router path. Capabilities are surfaced
to the Role expert.

**v2 is additive only.** Extensions never modify shared registry files.
Discovery is automatic: scanners at build time pick up every manifest
and schema, merging them into the running registries. The legacy v1
"modify the hub files in place" approach is deprecated; existing
platform extensions remain hand-edited but new extensions use v2.

This doc explains the v2 layout and contracts. `CONTRACTS.md` turns
each into a verifiable rule. `WORKFLOW.md` orders them for execution.

---

## Where v2 extensions land

Two roots — one for **official** (maintainer-shipped, tracked in
upstream) extensions and one for **user** (local install, gitignored)
extensions. The contract is identical; only the gitignore status
differs.

```
Official (tracked):
├── apps/web/src/extensions/<id>/
│   ├── manifest.ts        — default-exports AdminPluginDefinition
│   └── nav.ts             — default-exports AdminNavSection (optional)
└── packages/backend/convex/extensions/<id>/
    ├── schema.ts          — exports `tables` (Convex table defs)
    ├── queries.ts         — public queries
    ├── mutations.ts       — write operations
    └── internals.ts       — optional system-to-system functions

User (gitignored, lives in extensions.local/):
├── apps/web/src/extensions.local/<id>/
│   ├── manifest.ts
│   └── nav.ts             (optional)
└── packages/backend/convex/extensions.local/<id>/
    ├── schema.ts
    ├── queries.ts
    ├── mutations.ts
    └── internals.ts       (optional)

Routes (either source — canonical location):
└── apps/web/src/routes/_authenticated/_admin/<route-prefix>/
    ├── index.tsx
    ├── new.tsx
    └── $<id>/edit.tsx
```

---

## The five v2 layers

### Layer 1 — Backend schema

**File:** `packages/backend/convex/extensions[.local]/<id>/schema.ts`
**Exports:** `tables` — a record of `defineTable(...)` calls

A codegen script (`packages/backend/scripts/generate-extension-index.mjs`)
runs as a `predev` / `predeploy` hook. It scans both extension roots,
imports every `schema.ts`'s `tables` export, and writes a single index
file at `packages/backend/convex/schema/_extensionsIndex.generated.ts`.
The main schema hub imports `extensionTables` from that index and
spreads it into `defineSchema`.

You never edit the index file. You never edit `schema.ts` (the hub).
The codegen runs automatically.

### Layer 2 — Convex queries

**File:** `packages/backend/convex/extensions[.local]/<id>/queries.ts`
**API path:** `api.extensions.<id>.queries.*` (Convex's automatic
path-based discovery handles this — no registration step).

Same rules as the rest of the codebase:
- Public-safe reads project explicit fields; no raw doc dumps
- Paginated reads use `paginationOpts`
- No query returns secrets to public callers

### Layer 3 — Convex mutations

**File:** `packages/backend/convex/extensions[.local]/<id>/mutations.ts`
**API path:** `api.extensions.<id>.mutations.*`

**Every** mutation handler must start with
`requireCan(ctx, "<capability>")`. State-changing mutations emit
`emitEvent(...)`. No exceptions.

### Layer 4 — Frontend manifest + optional nav

**Manifest file:** `apps/web/src/extensions[.local]/<id>/manifest.ts`
**Default export:** `AdminPluginDefinition`

The scanner in `apps/web/src/lib/plugins/registry.ts` globs every
`manifest.ts` in both extension roots and appends them to
`ADMIN_PLUGINS`. The manifest provides id, title, description, icon,
settingsKey, navSectionIds, adminAccessPrefixes, routePrefixes, and
an optional `defaultEnabled`.

**Nav file (optional):** `apps/web/src/extensions[.local]/<id>/nav.ts`
**Default export:** `AdminNavSection`

If the extension wants a sidebar section, default-export one here. The
scanner in `apps/web/src/lib/admin-shell/nav-config.ts` globs every
`nav.ts` and appends to `ADMIN_NAV_SECTIONS`. Omit the file if the
extension shouldn't appear in the sidebar (rare).

### Layer 5 — Admin UI routes (canonical TanStack Router path)

**Folder:** `apps/web/src/routes/_authenticated/_admin/<route-prefix>/`

Routes are NOT under the `extensions[.local]/` folders. They live at
their canonical TanStack Router path because the router's vite plugin
auto-discovers anything in `src/routes/`. For user extensions, the
route files are simply new untracked `.tsx` files — they survive
`git reset --hard` because they're untracked, and the router picks
them up automatically.

For toggleable extensions, every route component MUST wrap with
`<PluginGuard pluginId="<id>">`. See `references/admin-list-route.example.tsx`.

### Layer 6 (separate concern) — Capabilities

The extension defines what capabilities it uses (via `requireCan`
calls in Layer 3 and `<RoutePermissionGuard>` / `useCan` in Layer 5).
It does NOT add them to the central role registry — that's the Role &
Capability System Expert's domain.

Your generation report lists every new capability the extension
references so the Role expert can register them. Recommend role
grants per capability.

---

## Why this works for auto-updates

The in-app updater (`packages/desktop/electron/app-updater.ts`) does:

1. `git fetch` + `git reset --hard origin/<branch>`
2. `bun install`
3. `bun run codegen:extensions` (regen the schema index)
4. `bun run build`

`git reset --hard` only touches **tracked** files. User extensions in
`extensions.local/` are gitignored, so their files survive. Official
extensions in `extensions/` are tracked — they get updated by the
reset (which is correct; official updates ship via upstream).

After reset, the codegen step re-scans both roots and regenerates the
schema index. The build step picks up the new manifests via
`import.meta.glob`. User extensions stay wired in across updates.

---

## How v2 coexists with platform extensions

Platform extensions (commerce, kb, recipes, gallery, etc.) ship today
as **hand-edited** entries in `registry.ts`, `nav-config.ts`, and
`schema.ts`. These are NOT being migrated in this round — they stay as
v1.

The merged registries are:

```
ADMIN_PLUGINS = [
  ...PLATFORM_PLUGINS,           // v1 hand-edited
  ...OFFICIAL_EXTENSIONS,        // v2 from extensions/*/manifest.ts
  ...LOCAL_EXTENSIONS,           // v2 from extensions.local/*/manifest.ts
]

ADMIN_NAV_SECTIONS = [
  ...PLATFORM_NAV_SECTIONS,      // v1 hand-edited
  ...EXTENSION_NAV_SECTIONS,     // v2 from extensions[.local]/*/nav.ts
]

extensionTables (in schema.ts) = merged from both v2 roots
```

Consumers of `ADMIN_PLUGINS` and `ADMIN_NAV_SECTIONS` cannot tell the
difference. The `source` field on each plugin (`"platform"` /
`"official"` / `"local"`) is populated by the scanner for diagnostics.

---

## Type system notes

`AdminPluginId` is now `BuiltinAdminPluginId | (string & {})` — keeps
literal autocomplete on the builtins while accepting any string for
v2 extensions. `PluginSettingsValues` is
`BuiltinPluginSettingsValues & Record<string, boolean>` — strong types
on the builtins, open record for extension settings keys.

`DEFAULT_PLUGIN_SETTINGS` is built at module load: starts from the
platform defaults, then merges each v2 extension's
`defaultEnabled` (defaulting to `false` if omitted).
