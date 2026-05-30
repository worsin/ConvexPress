# PLAN: Form Entry Management System

> Build-sequence doc for the ConvexPress Forms **v2 extension**, Admin side. The
> [PRD](./PRD.md) holds the *what/why*; this is the ordered, file-by-file *how* +
> a verify checklist. Read the PRD and the
> [Form Submission PRD](../form-submission-system/PRD.md) first.
>
> **Reality check before you start** (grounded in the current repo):
> - The schema fragment is **already written** — `packages/backend/convex/extensions/forms/schema.ts`
>   defines `forms`, `form_submissions` (with **non-optional** `read`/`starred`
>   booleans + `meta`), and `form_submission_notes` (with `by_submission`). Phase 1
>   is mostly **verify + add two indexes**, not create-from-scratch.
> - `listSubmissions` / `getSubmission` are owned by the **Form Submission System**
>   and **do not exist yet** (`extensions/forms/queries.ts` is absent). This system
>   either co-builds them or depends on that build landing first — call it out, do
>   not silently re-invent them.
> - There is **no shared `<DataTable>` component** in this repo. The kit's
>   list-route reference (`extension-kit/references/admin-list-route.example.tsx`)
>   composes an inline `<table>` per route. The PRD's `<DataTable>` is aspirational —
>   build the inline table per the reference; extract a local component only if it
>   earns its keep.
> - Backend file convention here is **`queries.ts` + `mutations.ts`** (kit Layers 2/3),
>   not the PRD's single `entries.ts`. Follow the kit.
> - **No `form.*` event codes and no `SYSTEM.FORM`** are registered in
>   `convex/events/constants.ts`. `emitEvent` only *warns* on unknown codes (it does
>   not throw), so the build is unblocked, but the registration is a **handoff** to
>   the Role/Events expert (see Phase 6).
>
> **Hard invariants** (from `extension-kit/CONTRACTS.md` + repo CLAUDE.md):
> - Additive-only. **Never** edit `convex/schema.ts`, `convex/schema/_extensionsIndex.generated.ts`,
>   `apps/web/src/lib/plugins/registry.ts`, or `apps/web/src/lib/admin-shell/nav-config.ts`.
> - Every mutation: `requireCan(ctx, "form.<cap>")` first line; state changes `emitEvent(...)` after the write.
> - Every route component wrapped in `<PluginGuard pluginId="forms">`.
> - UI from `@base-ui/react` only (no `@radix-ui/*`). No hardcoded color literals — CSS variables only.
> - Full-page navigation; the only popups are confirmation dialogs for destructive actions.
> - This skill does **not** deploy and does **not** register capabilities — it surfaces them.

---

## Capabilities used (surface to Role expert)

| Capability | CRUD | Used by | Default grant |
|---|---|---|---|
| `form.view_entries` | Read | both routes (render gate), `listNotes`, read queries | Administrator, Editor |
| `form.edit_entry` | Update | `updateEntry`, `addNote`, `updateEntryBulk`, auto-mark-read | Administrator, Editor |
| `form.delete_entry` | Delete (soft) | `deleteEntry`, `deleteEntryBulk` | Administrator, Editor |

## Events emitted (surface to Events expert)

| Code | System | Trigger | Payload |
|---|---|---|---|
| `form.entry_updated` | `form` | status/flag/value change, note added, restore | `{ formId, submissionId, updatedBy }` |
| `form.entry_deleted` | `form` | soft-delete (status → `deleted`) | `{ formId, submissionId, deletedBy }` |

Both scheduled **after** the DB write commits (via `emitEvent`, which schedules internally). Restore is an *update*, not a delete.

---

## Phase 1 — Entry-ops data model (verify + 2 indexes)

**Goal:** the persistence surface this system owns is correct and indexed for the filter tabs.

1. **Verify** `packages/backend/convex/extensions/forms/schema.ts` already defines:
   - `form_submissions` with `read: v.boolean()`, `starred: v.boolean()`, the `status` union (`partial|complete|spam|deleted`), and indexes `by_form`, `by_form_status`, `by_status`, `by_resumeToken`. **Do not redefine** — this table is co-owned; the Submission System owns the bulk of it.
   - `form_submission_notes` with `submissionId`, `body`, `authorId`, `createdAt` + `by_submission` index.
2. **Edit** `extensions/forms/schema.ts` — add the two triage indexes the PRD §4.2 recommends so the Unread/Starred tabs are index-backed, not full-scan filters:
   ```ts
   .index("by_form_read", ["formId", "read"])
   .index("by_form_starred", ["formId", "starred"])
   ```
   (Append to the existing `form_submissions` index chain — additive, no field changes.)
3. **Verify** the engine's value store: `convex/schema/customFields.ts` `fieldValues` has `by_entity ["entityType","entityId"]` (confirmed present). Answers for an entry = `entityType: "form_submission"`, `entityId: <submissionId>`. **No new values table.**

**Proves:** the entry-ops layer (two flags already in place + notes table + the indexes the inbox tabs query) exists and the answer reader is `fieldValues.by_entity`.
**Verify:** `bun run codegen:extensions` (in `packages/backend/`) regenerates `_extensionsIndex.generated.ts` clean; `bun --filter web check-types` (repo root) exits 0.

---

## Phase 2 — Read layer (queries.ts)

**Goal:** the data the UI sits on. Mind the ownership boundary with the Submission System.

**File:** `packages/backend/convex/extensions/forms/queries.ts` (create) — API path `api.extensions.forms.queries.*`.

1. **`listSubmissions`** (paginated) — `args: { formId: v.id("forms"), status?: <union>, search?: v.optional(v.string()), paginationOpts }`.
   - Index path: `by_form_status` when `status` set, else `by_form`; `.order("desc").paginate(...)`. Read/Starred tabs map to `by_form_read` / `by_form_starred`.
   - `search` (optional): substring match over decoded `fieldValues` for the page's rows (PRD §9, Open Q §11 — substring for v1). Keep it a thin post-filter; do not build full-text now.
   - **Ownership note:** the Submission PRD §8.3 declares `listSubmissions`/`getSubmission` as *its* exports. If that system has already shipped them, **re-export / call** rather than duplicate. If not yet shipped, define them here as the agreed data contract and leave a `// CONTRACT: owned by Form Submission System` marker so the two converge. Pick one home — never two copies.
2. **`getSubmission`** — `args: { submissionId }`; returns `{ ...submissionRow, values: fieldValues[] }` via `fieldValues.by_entity`. Same ownership note.
3. **`listNotes`** — `args: { submissionId }`; `form_submission_notes.by_submission`, newest-first; resolve `authorId → authorName` (join `users`). This one **is** this system's own query (notes are its table).
4. Reads authenticate via `ctx.auth.getUserIdentity()`; the **route guards** + `form.view_entries` enforce capability for the UI (kit pattern — queries authenticate, routes authorize).

**Proves:** the inbox can list rows by form+status, open one entry with all decoded answers, and read its notes.
**Verify:** codegen + `check-types` exit 0. Optional: `bunx convex run extensions:forms:queries:listSubmissions '{"formId":"…","paginationOpts":{"numItems":3,"cursor":null}}'` after a deploy by the Convex expert.

---

## Phase 3 — Entry-ops mutations (mutations.ts)

**Goal:** every capability-gated write, each `requireCan` + `emitEvent`, each form-scoped.

**File:** `packages/backend/convex/extensions/forms/mutations.ts` (create) — API path `api.extensions.forms.mutations.*`.
Imports: `requireCan` from `../../helpers/permissions`, `emitEvent` from `../../helpers/events`, field-engine helpers from `../../helpers/customFieldValidation` + `../../customFields/mutations` (validate/encode/parse — confirm exact exported names when wiring value edits).

Shared guard for every handler: load `row = ctx.db.get(submissionId)`; assert `row && row.formId === args.formId` (PRD §9 form-scope check) before any write; else `ConvexError("Entry not found for this form")`.

1. **`updateEntry`** — `requireCan(ctx, "form.edit_entry")`. `args: { formId, submissionId, patch: { read?, starred?, status? }, valueEdits?: Array<{ fieldKey, value }> }`.
   - Patch `read`/`starred`/`status` (status restricted to `complete|partial|spam|deleted`); set `updatedAt`.
   - For `valueEdits`: re-validate via the engine's `validateFieldValue` and re-encode via `encodeFieldValue`, then upsert `fieldValues` (`entityType:"form_submission"`). Invalid value → `ConvexError({code:"VALIDATION", …})`, persist nothing (PRD §9, §10).
   - After commit: `emitEvent(ctx, "form.entry_updated", "form", { formId, submissionId, updatedBy: user._id })`.
2. **`deleteEntry`** — `requireCan(ctx, "form.delete_entry")`. `args: { formId, submissionId }`. **Soft-delete only:** patch `status:"deleted"`; never remove the row, its `fieldValues`, or notes. Emit `form.entry_deleted`.
3. **`addNote`** — `requireCan(ctx, "form.edit_entry")`. `args: { formId, submissionId, body }`. Reject empty/whitespace `body` server-side. Insert `form_submission_notes { submissionId, body: body.trim(), authorId: user._id, createdAt: now }`. Emit `form.entry_updated`. (No separate note cap — PRD §5.2.)
4. **Restore** is just `updateEntry({ patch: { status: "complete" } })` — emits `form.entry_updated`, **not** a delete event (PRD §6.1, §10).

**Proves:** all single-entry triage writes are gated, form-scoped, audited, soft-delete-only, and value edits round-trip through the engine validator.
**Verify:** codegen + `check-types` exit 0. Grep self-check: every `export const … = mutation` in this file has `requireCan` as its first handler statement.

---

## Phase 4 — Routes + UI components

**Goal:** the two admin screens, wrapped + gated, reusing the kit list/detail pattern.

### 4a. Routes (canonical TanStack path — auto-discovered, untracked-or-tracked per kit)

- **Create** `apps/web/src/routes/_authenticated/_admin/forms/$formId/entries/index.tsx`
  - `createFileRoute("/_authenticated/_admin/forms/$formId/entries/")`; component returns `<PluginGuard pluginId="forms"><FormEntriesPage formId={…} /></PluginGuard>`.
  - Read `$formId` from route params; gate visible affordances with `useCan("form.edit_entry")` / `useCan("form.delete_entry")`.
- **Create** `apps/web/src/routes/_authenticated/_admin/forms/$formId/entries/$entryId.tsx`
  - Same `PluginGuard`; renders `<EntryDetail entryId formId />`.

### 4b. Components — `apps/web/src/extensions/forms/components/` (create)

Compose the **inline table per the kit reference** (no shared `DataTable`); `@base-ui/react` for any interactive bits (menus, dialogs, toggles); CSS-variable colors only.

- **`EntriesTable.tsx`** — `usePaginatedQuery(api.extensions.forms.queries.listSubmissions, { formId, status, search }, { initialNumItems: 25 })`. Holds `statusTab`, `search`, `selected:Set`. Renders: `EntryStatusTabs`, `EntrySearchBar`, conditional `EntryBulkActionBar`, the rows (star toggle, summary fields, status badge, `submittedAt`; unread rows bold), empty state, load-more.
- **`EntryStatusTabs.tsx`** — All / Unread / Starred / Complete / Partial / Spam / Trash → maps to `listSubmissions` args (`tabToStatus`).
- **`EntrySearchBar.tsx`** — debounced free-text → `search` arg.
- **`EntryDetail.tsx`** — `useQuery(getSubmission)`; `undefined → skeleton`, `null` or `formId` mismatch → not-found surface (PRD §10). Layout: `StatusControls` + `EntryAnswerList` (main) and `EntryMetaPanel` + `EntryNotes` (aside). **Auto-mark-read** on first load: `useEffect` calls `updateEntry({ patch:{ read:true } })` only if `!entry.read` and the user `useCan("form.edit_entry")` (idempotent + gated — PRD §9; silently skip if no edit cap).
- **`EntryAnswerList.tsx`** — render each `entry.values` answer decoded via the engine's `parseFieldValue`; optional in-place edit dispatches `updateEntry({ valueEdits })`.
- **`EntryMetaPanel.tsx`** — status, submitted/completed timestamps, source/referrer, IP/UA, `userId` identity (read-only).
- **`StatusControls.tsx`** — read/star toggles (immediate `updateEntry`); status menu (Complete/Partial/Spam/Trash). Trash + Mark-spam route through a confirmation dialog; everything else applies immediately. Re-render is reactive from Convex.
- **`EntryNotes.tsx`** — `listNotes` list + composer; composer rejects empty/whitespace client-side before `addNote`.

**Proves:** an admin can open a form's inbox, filter/search/select, open an entry, read every answer + metadata + notes, leave a note, toggle read/star, change status, and edit a value — all behind the plugin guard and capability gates.
**Verify:** `bun --filter web check-types` exits 0. Manual (Playwright/Electron) smoke once the Convex expert deploys: list renders, detail opens, auto-read flips the unread bold, a note appears, trash routes back to the list and the row leaves the default view.

---

## Phase 5 — Bulk actions + manifest/nav + confirmations

**Goal:** selection-driven bulk ops and the extension's registration surface.

1. **Bulk mutations** — append to `mutations.ts`:
   - **`updateEntryBulk`** — `requireCan(ctx, "form.edit_entry")`. `args: { formId, ids: Id[], patch }`. Loop ids; per-row form-scope assert; apply patch; emit one `form.entry_updated` per affected row. Collect failed ids; return `{ ok: Id[], failed: Id[] }` (best-effort + report — PRD §9, Open Q §12).
   - **`deleteEntryBulk`** — `requireCan(ctx, "form.delete_entry")`; same shape; soft-delete each; one `form.entry_deleted` per row; return failed-ids report.
   - Per-row `requireCan` semantics: caps are role-level here, so the top-of-handler `requireCan` covers all rows; the per-row work is the form-scope assert + the failed-ids report (PRD §10 "skipped + reported").
2. **`EntryBulkActionBar.tsx`** + **`ConfirmDeleteDialog.tsx`** / **`ConfirmBulkDialog.tsx`** — Mark read/unread, Star/Unstar, Trash/Restore, Mark spam/Not spam. Trash + bulk-trash + mark-spam confirm via dialog (`@base-ui/react`), then call the bulk mutation; show the failed-ids result if any.
3. **Manifest** — `apps/web/src/extensions/forms/manifest.ts` (create if absent) — default-export `AdminPluginDefinition`: `id:"forms"`, `settingsKey:"formsEnabled"`, `adminAccessPrefixes` covering `/admin/forms`, icon from `lucide-react`. (Coordinate with the broader Forms build — Builder/Renderer share this manifest; do not clobber theirs if present.)
4. **Nav** — `apps/web/src/extensions/forms/nav.ts` (if absent) — default-export `AdminNavSection` with `pluginId:"forms"`, `capability:"form.view_entries"`, a child entry pointing at the entries inbox. The scanner appends it — **never** hand-edit `nav-config.ts`.

**Proves:** multi-row triage in one round-trip with partial-failure reporting; the extension is discoverable + toggleable + nav-visible, all gated by `form.view_entries`.
**Verify:** codegen + `check-types` exit 0. Bulk-select two rows → trash → both leave the default list; a row that fails surfaces in the report.

---

## Phase 6 — Registration handoff + final verify

**Goal:** close the loop on the two things this skill surfaces but does not own.

1. **Capabilities** → Role & Capability expert: register `form.view_entries`, `form.edit_entry`, `form.delete_entry`; grant **Administrator + Editor**; Author/Contributor/Subscriber none (PRD §5).
2. **Events** → Events expert: add `SYSTEM.FORM = "form"` and a `FORM_EVENTS = { ENTRY_UPDATED:"form.entry_updated", ENTRY_DELETED:"form.entry_deleted", … }` block in `convex/events/constants.ts`, wired into `EVENT_CODES_BY_SYSTEM`, so the codes leave the "unrecognized" warn path and gain type safety. (Until then `emitEvent` warns but still emits — build is not blocked.)
3. **Generation report** (per `CONTRACTS.md` §9): list every file created/edited (absolute paths), the caps above with grants, the events above, and confirm codegen + typecheck pass.

**Final verify (the gate):**
```
cd packages/backend && bun run codegen:extensions     # exit 0, valid generated index
cd <repo root>      && bun --filter web check-types    # exit 0
```
Both must exit 0. Do **not** disable typecheck; Convex TS2589 false positives get a scoped `@ts-expect-error`, not a downgrade.

---

## Build order (one line)

1 schema verify + 2 indexes → 2 `queries.ts` (listSubmissions/getSubmission ownership-aware, listNotes) → 3 `mutations.ts` (updateEntry/deleteEntry/addNote, gated+scoped+audited) → 4 routes + detail/list components → 5 bulk mutations + bulk bar + confirm dialogs + manifest/nav → 6 cap/event handoff + final codegen & check-types.

## Out of scope (do not build here)

`form_submissions` core / public `submit` (Submission System) · field types, renderers, the validator impl (Field Engine) · CSV/Excel export + aggregate reporting (Analytics) · spam scoring/verdict/rate-limit/CAPTCHA (Spam & Security — this system only flips `status:"spam"` as a manual action) · email/site notifications (Notification System) · form definitions + builder (Builder/Renderer).
