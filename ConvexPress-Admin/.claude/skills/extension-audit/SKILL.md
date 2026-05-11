---
name: extension-audit
description: Use when the user asks to audit, verify, check, or validate an existing extension's wiring against the kit standard. Triggers on "audit the events extension", "is the gallery extension wired correctly", "check if recipes follows the standard", "verify our extension contracts". Reports gaps across the 7 layers without modifying any code.
---

# extension-audit

You are auditing an existing extension against the kit standard.
Output: a structured report of gaps; no file modifications.

This skill is read-only. Find problems, surface them. Don't fix them
in this skill — use `extension:add-feature` or invoke the right expert
to fix what the audit finds.

## Workflow

### Step 1 — Inputs

Confirm with the user:

- **Which extension** to audit (the id, e.g., `events`)
- **Audit scope** (all 7 layers? a specific layer? a specific concern?)

Default: full 7-layer audit.

### Step 2 — Read the kit

1. `extension-kit/ARCHITECTURE.md` (the 7 layers)
2. `extension-kit/CONTRACTS.md` (the validation rules)
3. `extension-kit/DATA-API.md`

### Step 3 — Walk the 7 layers

For each layer, check whether the extension satisfies its
CONTRACTS.md rules. Don't infer — open every file and check.

#### Layer 1 — Schema
- [ ] `packages/backend/convex/schema/<ext>.ts` exists
- [ ] Exports a named tables object
- [ ] Object is spread into the root `schema.ts`
- [ ] Every table has at least one explicit index
- [ ] No `v.any` without inline justification

#### Layer 2 — Queries
- [ ] `packages/backend/convex/<ext>/queries.ts` exists
- [ ] At minimum: `list` + `getBySlug` (or domain-equivalent)
- [ ] Public-safe queries project fields (no raw doc returns)
- [ ] Paginated queries use `paginationOpts`

#### Layer 3 — Mutations
- [ ] `packages/backend/convex/<ext>/mutations.ts` exists
- [ ] **Every** mutation has `requireCan(ctx, "...")` at the top of
  the handler — grep for this; no exceptions allowed
- [ ] State-changing mutations call `emitEvent(...)`
- [ ] Inputs validated with `v.*` (no `v.any` unless justified)

#### Layer 4 — Admin UI
- [ ] Routes exist under `apps/web/src/routes/_authenticated/_admin/<ext>/`
- [ ] If toggleable: every route component wraps with `<PluginGuard>`
- [ ] No imports from `@radix-ui/*` (must use `@base-ui/react`)
- [ ] No hardcoded color literals
- [ ] Content management uses full-page navigation (no modal editors)

#### Layer 5 — Registry
- [ ] Extension's id is in `AdminPluginId` union in `plugins/registry.ts`
- [ ] `<id>Enabled` is in `PluginSettingsValues` interface
- [ ] An `AdminPluginDefinition` entry exists in `ADMIN_PLUGINS`
- [ ] `<id>Enabled` is in `DEFAULT_PLUGIN_SETTINGS`
- [ ] `navSectionIds[0]` matches the nav section's `id` (string equality)
- [ ] `adminAccessPrefixes` matches actual admin route URLs
- [ ] `routePrefixes` matches actual Website route URLs (or `[]`)
- [ ] If dependency: entry exists in `PLUGIN_PARENT`

#### Layer 6 — Nav config
- [ ] Section exists in `ADMIN_NAV_SECTIONS` in `nav-config.ts`
- [ ] `pluginId` is set (mandatory for auto-hide)
- [ ] `capability` is set to a sensible cap
- [ ] Children list every admin route the extension exposes

#### Layer 7 — Capabilities
- [ ] Every `requireCan(ctx, "...")` call in the extension's mutations
  references a capability that exists in the role registry. Cross-check
  by grep'ing the role registry / capability list. Flag any cap that's
  used but not registered.
- [ ] No mutation gated solely by `isInternal === true` (legacy
  pattern) — must use capability check.

### Step 4 — Cross-layer consistency

Beyond per-layer rules, check:

- [ ] Toggling the extension off in `/plugins` actually hides the nav
  AND blocks the admin route (verify by checking that `<PluginGuard>`
  wraps every route in Layer 4, and that the nav section has `pluginId`)
- [ ] `adminAccessPrefixes` in Layer 5 covers all actual admin routes
  in Layer 4
- [ ] If `routePrefixes` is non-empty, confirm a Website-side surface
  exists in `ConvexPress-Website/apps/web/src/routes/_marketing/`
  matching those prefixes; if not, flag as half-built
- [ ] Settings page (if any) uses the standard `useSettingsForm` +
  `SettingsPageLayout` primitives

### Step 5 — Report

Produce a structured report:

```
📋 Extension Audit — <extension id>
   2026-05-11

LAYER 1 (Schema)
  ✅ All rules pass

LAYER 2 (Queries)
  ⚠️  listPublished doesn't project — returns raw docs
      File: packages/backend/convex/events/queries.ts:42
      Fix: project to public-safe shape (drop createdBy, _creationTime, etc.)

LAYER 3 (Mutations)
  🔴 BROKEN — mutations.archiveEvent has no requireCan call
      File: packages/backend/convex/events/mutations.ts:117
      Fix: add `const user = await requireCan(ctx, "event.delete");` at top
  🔴 BROKEN — mutations.publish doesn't emit event
      File: packages/backend/convex/events/mutations.ts:88
      Fix: add `await emitEvent(ctx, EVENT_EVENTS.PUBLISHED, SYSTEM.EVENTS, {...});`

LAYER 4 (Admin UI)
  ✅ All rules pass

LAYER 5 (Registry)
  ⚠️  navSectionIds is ["events-section"] but nav-config.ts has id "events"
      String mismatch breaks auto-hide.

LAYER 6 (Nav)
  ✅ All rules pass

LAYER 7 (Capabilities)
  🔴 event.publish is used in mutations but not in the role registry
      Action: invoke /experts:role-capability-system to register

CROSS-LAYER
  ⚠️  routePrefixes claims ["/events"] but no Website route exists at
      /events. Either remove the prefix or generate the templates via
      /design:custom-post-type in ConvexPress-Website/.

SUMMARY
  ✅ Clean: 4 layers
  ⚠️  Issues: 3
  🔴 Broken: 3
  → Recommended fixes (in order): see notes per finding above.
```

Use the icons:
- ✅ Layer passes all rules
- ⚠️  Issue worth fixing but doesn't crash anything
- 🔴 Broken — extension does NOT meet the contract

## Output contract

- **No file modifications.** Pure report.
- Findings are concrete: file path + line number + specific fix
  recommendation
- Findings are categorized (clean / warning / broken)
- Summary at the bottom

## When NOT to use this skill

- Fixing what the audit finds → use `extension:add-feature` or invoke
  the appropriate expert
- Building a brand new extension → `extension:build`
- Auditing the Role/capability system itself → that's the Role expert
