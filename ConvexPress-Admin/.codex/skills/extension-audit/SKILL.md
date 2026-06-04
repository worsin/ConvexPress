---
name: extension-audit
description: Use when the user asks to audit, verify, check, or validate an existing extension's wiring against the v2 kit standard. Triggers on "audit the events extension", "is my custom extension wired correctly", "check if X follows the standard", "verify our extension contracts". Walks the v2 5-layer contract for any extension (official or local) and reports gaps without modifying any code.
---

# extension-audit

You are auditing an existing v2 extension against the kit standard.
Output: a structured report of gaps; no file modifications.

This skill is **read-only**. Find problems, surface them. Don't fix
them in this skill — use `extension:add-feature` or the appropriate
expert to fix what the audit finds.

## Workflow

### Step 1 — Inputs

Confirm with the user:

- **Which extension** to audit (the id, e.g., `events`)
- **Distribution scope** — official (`extensions/<id>/`) or local
  (`extensions.local/<id>/`)
- **Audit scope** — full 5-layer audit (default) or a specific layer

### Step 2 — Read the kit

1. `extension-kit/ARCHITECTURE.md` (the 5 v2 layers + capabilities)
2. `extension-kit/CONTRACTS.md`
3. `extension-kit/DATA-API.md`

### Step 3 — Walk the 5 layers + capabilities

For each layer, check whether the extension satisfies its CONTRACTS.md
rules. Don't infer — open every file.

#### Layer 1 — Schema
- [ ] `packages/backend/convex/<root>/<id>/schema.ts` exists
- [ ] Exports a named `tables` export (NOT `<id>Tables` — v2 uses the
  literal name `tables`)
- [ ] Every table has at least one explicit index
- [ ] Table names are globally unique (grep both extension roots and
  `convex/schema/`)
- [ ] No `v.any` without inline justification
- [ ] The extension does NOT modify `packages/backend/convex/schema.ts`
  or the generated `_extensionsIndex.generated.ts`

#### Layer 2 — Queries
- [ ] `packages/backend/convex/<root>/<id>/queries.ts` exists
- [ ] At minimum: `list` + `getBySlug` (or domain-equivalent)
- [ ] Public-safe queries project fields (no raw doc returns)
- [ ] Paginated queries use `paginationOpts`
- [ ] Imports use `../../helpers/...` (two levels up)

#### Layer 3 — Mutations
- [ ] `packages/backend/convex/<root>/<id>/mutations.ts` exists
- [ ] **Every** mutation has `requireCan(ctx, "...")` at the top
- [ ] State-changing mutations call `emitEvent(...)`
- [ ] Inputs validated with `v.*`
- [ ] Imports use `../../helpers/...`

#### Layer 4a — Manifest
- [ ] `apps/web/src/<root>/<id>/manifest.ts` exists
- [ ] Default-exports an `AdminPluginDefinition`
- [ ] `id` matches the folder name
- [ ] `settingsKey` follows `<id>Enabled` convention
- [ ] Icon imported from `lucide-react`

#### Layer 4b — Nav (optional)
If `nav.ts` exists:
- [ ] `apps/web/src/<root>/<id>/nav.ts` default-exports `AdminNavSection`
- [ ] `pluginId` matches the manifest's `id` (string equality)
- [ ] Section `id` matches manifest's `navSectionIds[0]`
- [ ] `capability` is set sensibly

If `nav.ts` doesn't exist:
- [ ] Manifest's `navSectionIds` is `[]` (the contract requires consistency)

#### Layer 5 — Admin UI routes
- [ ] Routes exist under
  `apps/web/src/routes/_authenticated/_admin/<route-prefix>/`
- [ ] **NOT** under `extensions[.local]/<id>/` — routes always live at
  the canonical TanStack Router path
- [ ] Every route component wraps with `<PluginGuard pluginId="<id>">`
  or has `requirePluginEnabled` in `beforeLoad`
- [ ] No imports from `@radix-ui/*` (must use `@base-ui/react`)
- [ ] No hardcoded color literals
- [ ] Content management uses full-page navigation (no modal editors)

#### Layer 6 (separate) — Capabilities
- [ ] Every `requireCan(ctx, "...")` call references a capability that
  exists in the role registry (cross-check by greping the role
  registry; flag any cap used but not registered)
- [ ] No mutation gated solely by `isInternal === true` — capability
  check is mandatory

### Step 4 — v2-specific consistency checks

These are unique to the v2 contract:

- [ ] Extension does NOT have entries in `PLATFORM_PLUGINS` (the
  hand-edited array in `apps/web/src/lib/plugins/registry.ts`)
- [ ] Extension does NOT have entries in `PLATFORM_NAV_SECTIONS` (the
  hand-edited array in `apps/web/src/lib/admin-shell/nav-config.ts`)
- [ ] Extension's tables are NOT hand-imported in
  `packages/backend/convex/schema.ts`
- [ ] Generated index `convex/schema/_extensionsIndex.generated.ts`
  contains an entry for this extension (run codegen first to refresh)

If ANY of these "NOT" checks fail, the extension is mixing v1 and v2.
Surface as a 🔴 BROKEN finding.

### Step 5 — Cross-layer consistency

- [ ] Toggling the extension off at `/plugins` hides the nav AND blocks
  admin routes (verify `<PluginGuard>` on every route + manifest's
  `navSectionIds[0]` matches the section's `id`)
- [ ] `adminAccessPrefixes` in the manifest covers all actual admin
  routes
- [ ] If `routePrefixes` is non-empty, a Website-side surface exists
  in `ConvexPress-Website/apps/web/src/routes/_marketing/` matching
  those prefixes; if not, flag as half-built (handoff to design-kit)

### Step 6 — Report

Structured report:

```
📋 Extension Audit — <extension id> (<root>)
   2026-XX-XX

LAYER 1 (Schema)
  ✅ All rules pass

LAYER 2 (Queries)
  ⚠️  listPublished doesn't project — returns raw docs
      File: packages/backend/convex/extensions/events/queries.ts:42
      Fix: project to public-safe shape

LAYER 3 (Mutations)
  🔴 BROKEN — mutations.archiveEvent has no requireCan call
      File: packages/backend/convex/extensions/events/mutations.ts:117
      Fix: add `await requireCan(ctx, "event.delete");` at top

LAYER 4 (Manifest + Nav)
  ✅ All rules pass

LAYER 5 (Admin UI)
  ⚠️  Edit route doesn't wrap with PluginGuard
      File: apps/web/src/routes/_authenticated/_admin/events/$id/edit.tsx
      Fix: wrap the component with <PluginGuard pluginId="events">

CAPABILITIES
  🔴 event.publish used in mutations but not in role registry
      Action: invoke /experts:role-capability-system

v2 INVARIANTS
  ✅ Extension is fully scanner-discovered (no hand-edited entries
     in hub files)

CROSS-LAYER
  ⚠️  routePrefixes claims ["/events"] but no Website route exists
      → invoke /design:custom-post-type in the Website repo

SUMMARY
  ✅ Clean: 3 layers
  ⚠️  Issues: 3
  🔴 Broken: 2
  → Recommended fixes (in order): see notes per finding
```

Icon legend:
- ✅ Layer passes
- ⚠️ Issue worth fixing, doesn't break runtime
- 🔴 Broken — extension does NOT meet the contract

## Output contract

- **No file modifications.** Pure read + report.
- Findings are concrete: file path + line number + specific fix
  recommendation
- Findings are categorized (clean / warning / broken)
- Summary at the bottom

## When NOT to use this skill

- Fixing what the audit finds → use `extension:add-feature` or invoke
  the appropriate expert
- Building a new extension → `extension:build`
- Auditing the role/capability registry itself → that's the Role expert
- Auditing v1 platform extensions (commerce, kb, recipes, gallery,
  etc.) — they live in the hub files, not in the v2 folders. They're
  out of scope for this skill.
