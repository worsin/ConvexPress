# PLAN: Form Builder System

> Build-sequence companion to `PRD.md`. The PRD holds the *what/why*; this PLAN is the **ordered, file-by-file build + verify checklist**. Read the PRD first. Read the Field Engine PRD (`../form-field-engine/PRD.md`) — the builder canvas *reuses* that package and **builds no field-rendering code of its own**.
>
> **What this is:** v2 extension, Admin side, `pluginId: "forms"`. The `forms` table already exists in `convex/extensions/forms/schema.ts` (`fieldGroupId -> fieldGroups._id`; `settings` is a **JSON string**, not a `v.object`). This PLAN adds queries, mutations, the manifest/nav, and the 4 admin routes around it.

---

## 0. Ground rules (verified against the codebase — do not deviate)

- **Paths.** Backend lives at `packages/backend/convex/extensions/forms/` → API path `api.extensions.forms.<file>.<fn>`. Manifest/nav at `apps/web/src/extensions/forms/`. Routes at the **canonical** `apps/web/src/routes/_authenticated/_admin/forms/` (NOT under `extensions/`).
- **Helper imports (from a file two levels under `convex/`):**
  - `import { requireCan } from "../../helpers/permissions"` → returns `UserDoc` (use `user._id`).
  - `import { emitEvent } from "../../helpers/events"` → signature is **`emitEvent(ctx, code, system, payload, options?)`** (5-arg; `system` is the 3rd arg — the PRD §6/§11 sketch omits it, follow the real signature).
  - `import { requirePluginEnabled } from "../../helpers/plugins"` → call `requirePluginEnabled(ctx, "forms")` at the top of every mutation/query (precedes `requireCan`), matching `customFields`.
- **Capabilities** (`form.create/update/delete/duplicate/view`) are granted to **Administrator + Editor**. `requireCan` is the only enforcement point; UI gating (`useCan`) is convenience.
- **Field reuse — no new field tables.** A Form's fields are `customFields` `fieldDefinitions` on a backing `fieldGroups` row, linked by `forms.fieldGroupId`. Reuse these existing `convex/customFields/mutations.ts` + `queries.ts` exports:
  - `createGroup` (backing group on create; requires a non-empty `locationRules` — use a single rule that targets this form), `getFieldsByGroup` (canvas list), `createField` / `updateField` / `deleteField` / `reorderFields` (palette + settings panel + drag-reorder), **`duplicateGroup`** (deep-clones definitions recursively incl. `parentFieldId` and returns `newGroupId` — this is `form.duplicate`'s field clone, do NOT hand-roll it).
- **UI.** Base UI (`@base-ui/react`) — NOT Radix. Tailwind v4, **no hardcoded colors** (use theme tokens: `bg-primary/10`, `text-muted-foreground`, etc.). Full-page router navigation; **dialogs are confirmation-only** (Archive / Duplicate / Unpublish). Queries via `useQuery` from `convex-helpers/react/cache`.
- **Additive-only.** Never hand-edit `convex/schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts`. Scanners + codegen merge the manifest/nav/schema. `registry.ts` widens `AdminPluginId` to any string at runtime, so `pluginId="forms"` needs no edit there.
- **Kit references to copy from** (canonical patterns, substitute names): `extension-kit/references/{queries,mutations,manifest,nav,admin-list-route,schema}.example.*`.

---

## Step 1 — Event constants + verify the schema fragment

**Edit** `packages/backend/convex/events/constants.ts` (additive):
- Add `FORM: "form"` to the `SYSTEM` const.
- Add `FORM_EVENTS = { CREATED: "form.created", UPDATED: "form.updated", DELETED: "form.deleted" }` (lowercase `system.action`, two segments — `emitEvent` rejects otherwise).

**Verify (no edit)** `convex/extensions/forms/schema.ts` already exports `tables.forms` with `by_slug` + `by_status` + `by_createdBy`, `fieldGroupId: v.optional(v.id("fieldGroups"))`, and `settings: v.string()`. Do **not** re-add it.

**Proves:** event codes pass `emitEvent`'s validator (no "Unrecognized event code" warning); the owner table + indexes exist.

---

## Step 2 — Queries (`convex/extensions/forms/queries.ts`)

**Create** the file. Pattern: `extension-kit/references/queries.example.ts`. Every handler: `await requirePluginEnabled(ctx, "forms")` → `await requireCan(ctx, "form.view")` → indexed read (no full scans).

- `listForms({ status?: "draft"|"published"|"archived" })` — when `status` given, `withIndex("by_status", q => q.eq("status", status))`; default (no status) lists all then `.filter(q.neq(status, "archived"))`. Decorate each row with `fieldCount` (count `fieldDefinitions` for the form's `fieldGroupId`, or 0 if unset). Powers `FormsList`.
- `getForm({ formId })` — `ctx.db.get(formId)`; if null return null; else return `{ ...form, fields }` where `fields = getFieldsByGroup(form.fieldGroupId)` (or `[]`). Powers builder + settings.

**Proves:** the admin table + builder/settings screens can read forms and their attached field-sets, gated by `form.view`.

---

## Step 3 — Mutations (`convex/extensions/forms/mutations.ts`)

**Create** the file. Pattern: `extension-kit/references/mutations.example.ts`. Every handler opens with `requirePluginEnabled(ctx, "forms")` + `requireCan(...)` and (state-changers) closes with `emitEvent(...)`. Add slug helpers in the same file: `slugify`, `ensureUniqueSlug(ctx, base)` (suffix `-2`, `-3`… via `by_slug`), `assertSlugFree(ctx, slug, exceptFormId)` (throws `ConvexError` on collision).

| Export | Cap | Body sketch | Emits |
|---|---|---|---|
| `create({ title, slug?, description? })` | `form.create` | `ensureUniqueSlug`; insert `forms` row (`status:"draft"`, `settings: JSON.stringify({ requireLogin:false })`, audit fields with `user._id`); call `createGroup` for the backing group; `ctx.db.patch(formId, { fieldGroupId })`. Return `{ formId }`. | `form.created` |
| `update({ formId, patch?, reorder? })` | `form.update` | Load form (throw if missing). Build `changedFields[]`. On `patch.slug` change → `assertSlugFree`. Apply `title/description/settings/status`. On `status:"published"` → assert ≥1 non-layout field (rule 9.3). `ctx.db.patch`. If `reorder` (array of `fieldDefinitions` ids) → `reorderFields` (writes `menuOrder`), push `"fields"`. | `form.updated` |
| `remove({ formId })` | `form.delete` | **Soft-delete:** `ctx.db.patch(formId, { status:"archived", ... })`. Never `ctx.db.delete`. | `form.deleted` |
| `duplicate({ formId })` | `form.duplicate` | Load source. `ensureUniqueSlug(\`${source.slug}-copy\`)`. Insert new draft row copying `settings`/`description`. If source has `fieldGroupId` → `duplicateGroup({ groupId })`, patch new row's `fieldGroupId = newGroupId`. Return `{ formId: newFormId }`. | `form.created` |

> `settings` is a **string** on disk: `JSON.parse` on read, `JSON.stringify` on write; validate the parsed shape (entryLimit positive int; `scheduleEnd >= scheduleStart`) before stringifying (rule 9.4).

**Proves:** full admin CRUD with slug uniqueness, soft-delete, deep-duplicate (nested fields via `duplicateGroup`), publish gating, and lifecycle events — the entire backend contract.

**Gate:** run the verify checklist (§Verify) now — backend must be green before any UI.

---

## Step 4 — Extension manifest + nav

**Create** `apps/web/src/extensions/forms/manifest.ts` — default-export `AdminPluginDefinition` (pattern: `manifest.example.ts`). `id:"forms"`, `title:"Forms"`, `icon` from lucide (e.g. `FileText`), `settingsKey:"formsEnabled"`, `navSectionIds:["forms"]`, `adminAccessPrefixes:["/forms"]`, `routePrefixes:["/forms"]`, `defaultEnabled:false`.

**Create** `apps/web/src/extensions/forms/nav.ts` — default-export `AdminNavSection` (pattern: `nav.example.ts`). `id:"forms"` (must equal `navSectionIds[0]`), `pluginId:"forms"` (mandatory for auto-hide), `to:"/forms"`, `capability:"form.view"`. Children: All Forms (`/forms`, `exact`), Add New (`/forms/new`, `isAddNew`, cap `form.create`).

**Proves:** the scanner (`import.meta.glob`) merges Forms into `/plugins` toggle + sidebar with zero edits to `registry.ts`/`nav-config.ts`; disabling Forms auto-hides the section.

---

## Step 5 — Routes (`apps/web/src/routes/_authenticated/_admin/forms/`)

Pattern: `extension-kit/references/admin-list-route.example.tsx`. Each route: `createFileRoute("/_authenticated/_admin/forms/...")`, component wraps tree in **`<PluginGuard pluginId="forms">`**, `useCan("form.<cap>")` for conditional buttons, `useQuery` from `convex-helpers/react/cache`. Base UI only; full-page nav; confirm-dialogs only.

1. **`index.tsx`** — `FormsList`. Table (title, slug, status badge, updated-at, `fieldCount`) from `api.extensions.forms.queries.listForms`. Row actions: Open → `/forms/$formId/edit`, Settings → `/forms/$formId/settings`, Duplicate (confirm → `mutations.duplicate`), Archive (confirm → `mutations.remove`). Status filter; empty state "Create your first form." **Proves:** list + lifecycle actions end-to-end.
2. **`new.tsx`** — `NewFormForm`. Title input + auto-slug (editable). Submit → `mutations.create` → `navigate("/forms/$formId/edit")`. **Proves:** create → builder handoff.
3. **`$formId/edit.tsx`** — `FormBuilderCanvas` (PRD §8.2). `getForm` + engine field list. 3-col grid: LEFT engine **field palette** (`SUPPORTED_FIELD_TYPES`, add → `createField`); CENTER **Fields/Logic/Calculations** tab chrome (in-page state, not routes) — Fields tab = engine sortable list via `FIELD_RENDERERS` preview, reorder → `mutations.update({ reorder })`; Logic/Calculations tabs render placeholders now (bodies owned by the Logic & Calculation systems later). RIGHT `FieldSettingsPanel` (non-modal slide-over) editing the selected def via `createField`/`updateField`/`deleteField`. Plus `BuilderToolbar` (inline title, status pill, Publish/Unpublish, Preview deep-link). **Proves:** the high-leverage reuse — builder is a thin host over the Field Engine; place/reorder/configure fields; publish gating surfaces.
4. **`$formId/settings.tsx`** — `FormSettingsForm`. Edits the parsed `settings`: schedule start/end, entryLimit, requireLogin toggle, confirmation/notification ref pickers, status control (draft⇄published, archive/restore). Save → `mutations.update({ patch:{ settings, status } })`. **Proves:** per-form settings + status lifecycle persist.

> **Builder depends on the Field Engine package** (`@convexpress/field-engine`, or its pre-extraction source under `apps/web/src/components/custom-fields/`). Import `SUPPORTED_FIELD_TYPES`, `FIELD_RENDERERS`/`FieldRenderer` from there. If the extraction (`../form-field-engine/PRD.md`) is not yet done, the Fields tab is **blocked** on it — build routes 1/2/4 + the builder shell/toolbar first, then drop in the palette + sortable list once the package exports land.

---

## Step 6 — Rules + polish

- Enforce publish rule (≥1 non-layout field) in `update` **and** disable the toolbar Publish with a reason when unmet.
- Settings validation (entryLimit positive int; schedule window order) at the mutation boundary.
- Loading/skeleton/empty states on all 4 routes; status filter; `fieldCount` decoration.
- Edge cases (PRD §10): slug-collision typed error surfaced as "Slug already in use"; unknown/layout field types render a safe fallback (never throw); `PluginGuard` fail-closed when disabled mid-edit.

---

## Verify checklist (must pass — run after Step 3, again after Steps 4–6)

From `ConvexPress-Admin/packages/backend`:
1. `node scripts/generate-extension-index.mjs` (a.k.a. `bun run codegen:extensions`) — merges the `forms` schema fragment. **Exit 0.**
2. `bunx convex codegen` — regenerates `_generated/api` so `api.extensions.forms.queries.*` / `mutations.*` resolve. **Exit 0.**

From repo root `ConvexPress-Admin`:
3. `bun run check-types` (`turbo check-types` → backend + web `tsc --noEmit`). **Exit 0.**
   - Convex `TS2589` "type instantiation excessively deep" on generated-API unions are known false positives — suppress with a scoped `// @ts-expect-error TS2589` (as `customFields/mutations.ts` does), never `--typecheck=disable`.

Manual (Playwright, per PRD §12 Phase 4) — only once the Field Engine palette is wired:
4. Create form → place fields → publish → duplicate → archive. Confirm soft-delete (row persists as `archived`), duplicate deep-clones nested fields (new unique `-copy` slug, draft), and `PluginGuard` 404s when Forms is disabled.

---

## Build order at a glance

```
1. events/constants.ts (FORM_EVENTS + SYSTEM.FORM)   ── schema fragment already exists
2. extensions/forms/queries.ts        (listForms, getForm)            ── gate: view
3. extensions/forms/mutations.ts       (create/update/remove/duplicate + slug helpers)  ── gate: caps + emitEvent
   └─ VERIFY (codegen ×2 + check-types = exit 0)
4. extensions/forms/{manifest.ts, nav.ts}            ── scanner merges; pluginId "forms"
5. routes …/_admin/forms/{index, new, $formId/edit, $formId/settings}.tsx   ── PluginGuard each
   └─ edit.tsx canvas DEPENDS ON the Field Engine package (palette + FIELD_RENDERERS)
6. rules + polish (publish gate, settings validation, skeleton/empty, edge cases)
   └─ VERIFY again + Playwright smoke
```

---

**Dependency callout:** This system is the **second** in the Forms tree and is **hard-blocked on the Form Field Engine extraction** for the builder canvas (palette, `FIELD_RENDERERS`, field-definition model). Backend CRUD (Steps 1–3) and routes 1/2/4 (Step 5) can ship ahead of the extraction; only the **Fields tab** of `edit.tsx` requires the package. A Form = a thin `forms` owner row + one backing `fieldGroups` (`forms.fieldGroupId`) holding the engine's `fieldDefinitions` — **no parallel field store, no field-rendering code built here.**

**PLAN Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Builder System · **Companion to:** PRD.md v1.0
