---
name: extension-build
description: Use when the user asks to build, create, scaffold, or add a new extension / plugin / feature module to the ConvexPress admin app. Triggers on phrases like "build an events extension", "add a new feature module for X", "create the Y extension", "scaffold an extension that does Z". Generates the full 7-layer extension: schema, queries, mutations, admin routes, plugin registry entry, nav entry, capability surfacing.
---

# extension-build

You are creating a **new extension** end-to-end. Output: code across 7
layers (schema, queries, mutations, admin routes) + targeted in-place
edits to two registry files (plugin registry, nav-config) + a clear
report listing new capabilities for the Role expert.

## Prerequisites

Before doing anything else, gather these from the user. **Don't
fabricate.** If unclear, ASK:

- **id** (camelCase, unique — e.g., `events`)
- **title** (display, e.g., "Events")
- **description** (one line, for the /plugins toggle page)
- **icon** (Lucide icon name — suggest one if user doesn't have a preference)
- **tables** (names + main fields — at minimum one primary table)
- **public surface?** yes/no; if yes, what URL prefix
- **dependency on another extension?** if yes, which
- **capabilities** the extension defines (e.g., `event.create`, `event.publish`)
- **default-enabled state** (usually `false`)

## Workflow

### Step 1 — Read the kit

In order:
1. `extension-kit/README.md`
2. `extension-kit/ARCHITECTURE.md`
3. `extension-kit/CONTRACTS.md`
4. `extension-kit/DATA-API.md`
5. `extension-kit/WORKFLOW.md` (your execution playbook)
6. `extension-kit/TROUBLESHOOTING.md` (skim for awareness)
7. Reference files:
   - `references/schema.example.ts`
   - `references/queries.example.ts`
   - `references/mutations.example.ts`
   - `references/admin-list-route.example.tsx`
   - `references/registry-entry.example.ts`

### Step 2 — Study a similar existing extension

Read the actual code of an existing extension that resembles what
you're building:
- Content-type-like (events, case studies, custom CPTs) → study `recipes` or `gallery`
- Commerce-related → study `commerceBundles` or `commerceReviews`
- KB-like → study `kb`

Open its schema, queries, mutations, an admin route, and confirm how it
appears in `plugins/registry.ts` and `admin-shell/nav-config.ts`.

### Step 3 — Generate Layer 1 (schema)

Create `packages/backend/convex/schema/<id>.ts` following
`references/schema.example.ts`. Then modify
`packages/backend/convex/schema.ts` to import + spread the new tables.

### Step 4 — Generate Layers 2-3 (queries + mutations)

Create:
- `packages/backend/convex/<id>/queries.ts`
- `packages/backend/convex/<id>/mutations.ts`

Every mutation MUST start with `requireCan(ctx, "<capability>")`. No
exceptions.

If event constants (`<EXT>_EVENTS.CREATED` etc.) don't exist in
`convex/events/constants.ts`, add them following the existing pattern.

### Step 5 — Generate Layer 4 (admin routes)

Create files under
`apps/web/src/routes/_authenticated/_admin/<id>/`:
- `index.tsx` — list page (study `references/admin-list-route.example.tsx`)
- `new.tsx` — create page
- `$<id>/edit.tsx` — edit page (substitute the param name)
- `settings.tsx` — optional, only if the extension has settings

Each component wraps with `<PluginGuard pluginId="<id>">` per the
CONTRACTS.md rule. No exceptions for toggleable extensions.

### Step 6 — Modify Layer 5 (plugin registry)

Open `apps/web/src/lib/plugins/registry.ts` and apply the five diffs
shown in `references/registry-entry.example.ts`:

1. Add the new id to `AdminPluginId` union
2. Add `<id>Enabled: boolean` to `PluginSettingsValues`
3. Push a new `AdminPluginDefinition` onto `ADMIN_PLUGINS`
4. Add `<id>Enabled` default to `DEFAULT_PLUGIN_SETTINGS`
5. Optional: `PLUGIN_PARENT` entry if there's a dependency

Don't replace the file. **Modify in place.**

### Step 7 — Modify Layer 6 (nav-config)

Open `apps/web/src/lib/admin-shell/nav-config.ts` and add a new entry
to `ADMIN_NAV_SECTIONS` with:
- `id` matching the registry's `navSectionIds[0]`
- `pluginId: "<id>"` — mandatory for auto-hide
- `capability` set to the highest required cap among children
- `children` listing the routes you created in Step 5

Import the Lucide icon at the top of the file if not already.

### Step 8 — Surface Layer 7 (capabilities)

You do NOT add capabilities to the role registry yourself. List them
in your generation report so `/experts:role-capability-system` can
add them.

For each capability, recommend which built-in roles should get it:
- Administrator: usually yes
- Editor / Author / Contributor: depends on the action
- Subscriber: rarely

### Step 9 — Verify

```bash
cd ConvexPress-Admin
bun --filter web check-types
```

Must exit 0. Fix any TS errors in place. The `_generated/api` types
will be stale for `api.<extension>.*` — that's expected and resolves
after the Convex Deployment Expert deploys. Don't deploy yourself.

### Step 10 — Report

Write the generation report covering:

- **Files created** (full paths, one per line)
- **Files modified in place** (`schema.ts`, `plugins/registry.ts`,
  `admin-shell/nav-config.ts`, optional `events/constants.ts`)
- **New capabilities the Role expert needs to add**, with recommended
  role grants per capability
- **Public surface handoff** — if the extension exposes Website routes,
  point the user at `/design:custom-post-type` in the Website repo
- **Deploy instructions** — explicit ask for
  `/experts:convex-deployment` to run the deploy, with the
  `--typecheck=disable` note about Convex's generated type lag
- **Deviations from the kit standard** (if any), with justification

## Output contract

- Files written per Steps 3-5
- Files modified in place per Steps 6-7
- TypeScript exits clean
- Report covers Step 10's bullet list

## When NOT to use this skill

- **Adding functionality to an existing extension** → use
  `extension:add-feature`. Don't re-scaffold.
- **Auditing an existing extension** → use `extension:audit`.
- **Generating Website templates for a CPT-style extension** → after
  building the admin side here, hand off to
  `/design:custom-post-type` in the Website repo.
- **Creating capabilities or modifying roles** → that's the Role
  expert's domain.
