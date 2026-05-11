---
name: extension-add-feature
description: Use when the user asks to add a new feature, function, mutation, query, route, or capability to an existing v2 extension. Triggers on "add bulk delete to events", "add a new admin page to my custom extension", "extend the X extension with Y", "the events extension needs an import button". Modifies the existing extension's files in place; does NOT re-scaffold or duplicate manifest entries.
---

# extension-add-feature

You are adding functionality to an extension that already exists.
Output: additions inside the existing extension's folders + a clear
report.

The v2 contract still holds: no edits to `schema.ts`,
`plugins/registry.ts`, or `nav-config.ts`. Everything goes in the
extension's own folders.

## Prerequisites

Confirm with the user:

- **Which extension** is being extended (the id)
- **Is it official or local?** (Lives in `extensions/<id>/` vs
  `extensions.local/<id>/` — affects whether changes get committed
  to upstream or are local-only.)
- **What the feature is** (e.g., "bulk publish", "ICS export endpoint",
  "venue manager sub-screen")
- **Layers it touches** (new mutation? new admin route? new capability?)

If unclear, ASK.

## Workflow

### Step 1 — Read the kit

Skim the relevant docs for the layers you're touching:
1. `extension-kit/README.md` (entry)
2. `extension-kit/ARCHITECTURE.md` (the 5 v2 layers)
3. `extension-kit/CONTRACTS.md` (rules still apply to additions)
4. `extension-kit/DATA-API.md`
5. The reference for each layer you're modifying

### Step 2 — Read the existing extension

Before writing anything, READ both folders:
- `packages/backend/convex/<root>/<id>/` — every file (`schema.ts`,
  `queries.ts`, `mutations.ts`, optional `internals.ts`)
- `apps/web/src/<root>/<id>/` — `manifest.ts`, `nav.ts` (if present)
- `apps/web/src/routes/_authenticated/_admin/<route-prefix>/` — all
  route files

Know what's already there. Match its style and conventions.

### Step 3 — Decide where the addition lives

| Addition | File to modify |
|---|---|
| New schema field | Patch the existing table in `convex/<root>/<id>/schema.ts`. Add optional fields (`v.optional(...)`); flag if a required field is needed (migration concern). |
| New query | Append to `convex/<root>/<id>/queries.ts`. |
| New mutation | Append to `convex/<root>/<id>/mutations.ts`. `requireCan` at the top. |
| New admin route | New file at `apps/web/src/routes/_authenticated/_admin/<route-prefix>/<new>.tsx`. Wrap with `<PluginGuard>`. |
| New nav child | Edit `apps/web/src/<root>/<id>/nav.ts` (the extension's own nav file — not the platform's). |
| New capability | Use it in your code; list in the report for the Role expert to register. |
| New settings field | Wire via `api.settings.queries.getBySection` + `updateSection`. Add a Settings page if not already present. |

**Don't touch:**
- `packages/backend/convex/schema.ts` (hub)
- `packages/backend/convex/schema/_extensionsIndex.generated.ts` (autogen)
- `apps/web/src/lib/plugins/registry.ts` (scanner appends to it)
- `apps/web/src/lib/admin-shell/nav-config.ts` (scanner appends to it)

If you need a change there, you're using v1 thinking. Stop and reread
ARCHITECTURE.md.

### Step 4 — Generate the additions

Write the new code following the same style as the existing extension.
Don't change formatting, naming conventions, or imports of unrelated
code.

### Step 5 — Re-run codegen if schema changed

If you modified `schema.ts`:

```bash
cd ConvexPress-Admin/packages/backend
bun run codegen:extensions
```

The generated index file's imports don't change (it imports from
`<root>/<id>/schema` regardless of what's inside), but running codegen
proves nothing else broke.

### Step 6 — Verify

```bash
cd ConvexPress-Admin
bun --filter web check-types
```

Must exit 0. Generated types may be stale for new queries/mutations —
expected; surface in report.

### Step 7 — Report

- Files modified (paths)
- New capabilities to register (if any)
- Schema migration concerns (if schema changed in a non-additive way)
- Whether existing tests still apply (don't write tests here)
- Deploy ask for `/experts:convex-deployment`

## Output contract

- Edits scoped to the existing extension's folders + canonical routes
- No new files outside the extension's scope
- **No edits to the hub registry files** (`schema.ts`, `registry.ts`,
  `nav-config.ts`)
- CONTRACTS.md rules satisfied for whichever layer you touched

## When NOT to use this skill

- **Building a brand new extension** → `extension:build`
- **Auditing wiring of an existing extension** → `extension:audit`
- **Adding capabilities to the role registry** → Role expert's domain
- **Generating Website-side templates** → handoff to design-kit
