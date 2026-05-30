# PRD: Form Entry Management System

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). The admin-side counterpart to the Form Submission System: the entry inbox where collected submissions are read, triaged, annotated, and managed.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** The **admin entry inbox** of the Forms extension. Where the Form Submission System owns the data model and the public write path, this system owns the *human* read/triage/manage path: a per-form list of entries, a single-entry detail view, internal notes, read/star flags, status changes, and bulk actions. It is a UI-heavy, capability-gated admin surface that sits on top of the submission read queries and the engine's `fieldValues` reader — it invents almost no new persistence, only a thin "entry-ops" layer (notes + flags) bolted onto the rows the Submission System already defines.

**Code lives at:**
- Admin routes — `apps/web/src/routes/_authenticated/_admin/forms/$formId/entries/` (list + `$entryId` detail), every route wrapped in `<PluginGuard pluginId="forms">`.
- Backend — `packages/backend/convex/extensions/forms/entries.ts` (admin queries + the entry-ops mutations), with the additive `form_submission_notes` table and the `read`/`starred` flag fields declared in the extension's schema fragment `packages/backend/convex/extensions/forms/schema.ts` (merged by the scanner — never hand-edited into root `schema.ts`).

**Consumes these ConvexPress systems:**

- **Form Submission System** (`form_submissions`) — the parent table this UI reads. `listSubmissions` (paginated, status-filtered) and `getSubmission` (parent row + `fieldValues`) are **defined there**; this system calls them and layers entry-ops mutations on the rows they return. Soft-delete reuses the Submission System's `status: "deleted"` trash state — this system never hard-deletes. See the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`).
- **Form Field Engine** (`field-engine`) — entry detail renders answers from the engine's `fieldValues` model (`entityType: "form_submission"`, `entityId: <submissionId>`) and decodes them with `parseFieldValue` for display. No parallel values store; this is the same reader the metaboxes use.
- **Role & Capability System** — every mutation opens with `requireCan(ctx, "form.<cap>")`; routes resolve the same caps for nav/visibility. Grants land on Administrator + Editor.
- **Event Dispatcher** — entry-ops mutations schedule `form.entry_updated` / `form.entry_deleted` after their writes commit, for audit + any downstream listeners.
- **Admin list-table / detail primitives** — REUSES the existing admin shell's list-table (column defs, pagination, row selection, bulk-action bar) and detail-page scaffolding rather than building bespoke tables.

**WooCommerce / WordPress analog:** Gravity Forms' **Entries** screen — the per-form entry list (with read/unread, star, bulk Trash/Spam, search), the single-entry detail view with the **Notes** metabox, and the entry status filter tabs (All / Unread / Starred / Trash).

---

## 1. Overview

### 1.1 Purpose

Give admins a first-class **inbox for form submissions**: per form, list every entry with the most useful field columns, search and filter (by status, read/star, date, and field-value text), open a single entry to see all answers, leave internal **notes**, toggle **read** / **starred** flags, change **status** (e.g. move to trash / restore / mark spam), edit answer values when a correction is needed, and run **bulk actions** across a selection. The system is the operational layer over the entries the public submit path collects — read-and-triage, not capture. It writes only a thin entry-ops surface (notes + flags) and otherwise reads through the Submission System and the Field Engine.

### 1.2 Scope

**In scope:**
- Two admin routes under the Forms tree: the **Form Entries list** (`/admin/forms/$formId/entries`) and the **Entry Detail** (`/admin/forms/$formId/entries/$entryId`), both `_admin`, both `auth=true`, both `<PluginGuard pluginId="forms">`.
- `EntriesTable` — paginated list with status-filter tabs, read/star indicators, field-value **search**, column selection, row selection, and a **bulk-action** bar (mark read/unread, star/unstar, trash/restore, mark spam).
- `EntryDetail` — single-entry view rendering all answers from `fieldValues` (decoded via `parseFieldValue`), submission metadata (status, timestamps, source/referrer, IP/UA, respondent identity), `StatusControls`, and the notes panel.
- `EntryNotes` — list + add internal notes against an entry (`form_submission_notes`).
- The thin **entry-ops** layer: `read` / `starred` flags on the submission row, the `form_submission_notes` table, and the mutations that drive them.
- Capability-gated admin mutations: `updateEntry` (status/flags/value edits), `deleteEntry` (soft-delete via status), `addNote` — each `requireCan` + `emitEvent`.
- Soft-delete + restore via the Submission System's `status: "deleted"` trash state; bulk variants of the same.

**Out of scope:**
- The `form_submissions` table definition, the public `submit` mutation, and `listSubmissions` / `getSubmission` themselves (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) — owned there, consumed here).
- Field types, renderers, the validator, conditional logic, and value (de)serialization (the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)).
- CSV / Excel export, scheduled exports, and cross-form aggregate reporting (the Form Analytics & Export System PRD (`specs/ConvexPress/systems/form-analytics-export-system/PRD.md`)).
- Spam scoring, the spam **verdict**, rate-limit windows, honeypot/CAPTCHA (the Form Spam & Submission Security System PRD (`specs/ConvexPress/systems/form-spam-security-system/PRD.md`)). This system only flips a row to `status: "spam"` as an admin action over the rows the Spam system scores.
- Email / site notifications to admins or respondents (the Form Notification System PRD (`specs/ConvexPress/systems/form-notification-system/PRD.md`)). Entry-ops emit audit events; they send no notifications (§7).
- Form definitions + builder authoring (`forms` table) — owned by the Builder/Renderer; this system holds only `formId` to scope the inbox.

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Form Submission System | Owns `form_submissions` + the `listSubmissions` / `getSubmission` read queries this UI sits on; defines the `status` union whose `deleted` value is the trash state and `spam` value this system can set. |
| Form Field Engine (`field-engine`) | `fieldValues` model + `parseFieldValue` to render/decode answers in the detail view. |
| Role & Capability System | `requireCan(ctx, "form.<cap>")` gating on every mutation; cap resolution for route/nav visibility. |
| Event Dispatcher | Schedules `form.entry_updated` / `form.entry_deleted` audit events. |
| Admin list-table / detail primitives | Reused for `EntriesTable` + `EntryDetail` (pagination, selection, bulk bar, detail scaffold). |

### 2.2 Systems that depend on this

| System | Integration point |
|---|---|
| Form Analytics & Export System | Reuses the same `listSubmissions` filters + status semantics; export honors the trash/spam states this system manages. |
| Form Spam & Submission Security System | Scores entries + sets `spam`; this system surfaces the spam filter tab and the manual "mark spam / not spam" admin action over those rows. |
| Form Builder System | Links from a form's admin view to its entries inbox (`/admin/forms/$formId/entries`). |

### 2.3 Integration hooks

```typescript
// Events emitted by the Form Entry Management System (brace-shorthand throughout)
type FormEntryEvents = "form.entry_updated" | "form.entry_deleted";

interface FormEntryUpdatedPayload {
  formId: Id<"forms">;
  submissionId: Id<"form_submissions">;
  updatedBy: Id<"users">;        // the admin who made the change
}

interface FormEntryDeletedPayload {
  formId: Id<"forms">;
  submissionId: Id<"form_submissions">;
  deletedBy: Id<"users">;        // soft-delete: status -> "deleted"
}

// Read queries CONSUMED from the Form Submission System (not redefined here):
//   listSubmissions({ formId, status?, paginationOpts }) -> paginated parent rows
//   getSubmission({ submissionId }) -> { ...parentRow, values: fieldValues[] }
```

---

## 3. Routes

Both routes live under the canonical Forms admin tree, are admin-only, require auth, and are wrapped in `<PluginGuard pluginId="forms">`. Navigation is **full-page** (TanStack Router), with **confirmation dialogs only** for destructive actions (trash, bulk trash, mark spam) — no slide-overs, no modals for primary flows.

| Route | Path | File | Layout | Auth | Guard | Capability |
|---|---|---|---|---|---|---|
| Form Entries | `/admin/forms/$formId/entries` | `_authenticated/_admin/forms/$formId/entries/index.tsx` | `_admin` | `true` | `pluginId="forms"` | `form.view_entries` |
| Entry Detail | `/admin/forms/$formId/entries/$entryId` | `_authenticated/_admin/forms/$formId/entries/$entryId.tsx` | `_admin` | `true` | `pluginId="forms"` | `form.view_entries` |

```tsx
// apps/web/src/routes/_authenticated/_admin/forms/$formId/entries/index.tsx
// Additive-only: the scanner registers this route + its nav entry; we never
// hand-edit nav-config.ts or the plugin registry.
export const Route = createFileRoute(
  "/_authenticated/_admin/forms/$formId/entries/",
)({
  component: () => (
    <PluginGuard pluginId="forms">
      <FormEntriesPage />
    </PluginGuard>
  ),
});
```

- Both routes resolve `form.view_entries` before render; a user lacking it gets the standard admin not-authorized surface, and the Forms nav entry is hidden by the same cap.
- `$formId` scopes every query/mutation to one form — the inbox is always per-form (mirrors Gravity Forms' per-form Entries screen). A cross-form view, if ever wanted, is the Analytics system's job, not this one.
- Editing answer values and changing status happen **in place** on the detail route, persisted by `updateEntry`; deletion is a soft-delete confirmed by dialog, then routes back to the list.

---

## 4. Data Model

This system adds the **smallest possible** entry-ops layer: two read/star flags on the existing submission row and one notes table. Everything else is read from the Submission System and the Field Engine. There is **no parallel values store** and **no second entries table** — that would fork the Submission System and the engine extraction (the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`) §5).

### 4.1 `form_submission_notes` (owned by this system)

```typescript
// packages/backend/convex/extensions/forms/schema.ts
// Additive fragment — merged into the root schema by the v2 scanner.
// This system OWNS this table.

form_submission_notes: defineTable({
  submissionId: v.id("form_submissions"), // entry the note is attached to
  body: v.string(),                        // the internal note text (admin-only)
  authorId: v.id("users"),                 // admin who wrote it
  createdAt: v.number(),
})
  .index("by_submission", ["submissionId"]),
```

### 4.2 Read/star flags (added to `form_submissions`)

The `read` and `starred` flags are lightweight per-entry triage state. They are declared as **optional additive fields** on the `form_submissions` table the Submission System owns — added through the same extension schema fragment, not a separate table (a one-row-per-entry side table would be wasteful for two booleans).

```typescript
// Additive fields on form_submissions (declared alongside the table in the
// Forms extension schema fragment). Optional so existing rows default cleanly:
//   read:    v.optional(v.boolean())   // default false / unread
//   starred: v.optional(v.boolean())   // default false / unstarred
//
// Recommended supporting indexes for the inbox filter tabs:
//   .index("by_form_read",    ["formId", "read"])
//   .index("by_form_starred", ["formId", "starred"])
//
// NOTE: the canonical owner of form_submissions is the Form Submission System;
// these two flag fields + their indexes are this system's additive contribution
// to that same fragment. Soft-delete continues to use the existing
// status: "deleted" union value — no new "deleted" boolean.
```

### 4.3 Answers + soft-delete reuse existing models

- **Answers** are read exclusively from the engine's `fieldValues` (`entityType: "form_submission"`, `entityId: <submissionId>`), decoded via `parseFieldValue`. An in-place value **edit** writes back through the same `fieldValues` model (re-encoded via `encodeFieldValue`) — never to a new table.
- **Soft-delete** sets `form_submissions.status = "deleted"` (the Submission System's trash state). **Restore** sets it back to `complete` (or `partial` for a draft). Entries are **never hard-deleted** by this system.
- **Mark spam / not spam** sets `status = "spam"` / back to `complete`. The spam *score* is owned by the Spam system; this system only sets the status as a manual admin action.

```
One entry, as this system sees it:
   form_submissions row  (status, read, starred, timestamps, source, userId, ...)
        ├── N × fieldValues  (answers; read via getSubmission, decoded by parseFieldValue)
        └── M × form_submission_notes  (internal admin notes; THIS system's table)
```

---

## 5. Actions

Every admin mutation begins with `requireCan(ctx, "form.<cap>")` and ends by scheduling its event. Capability grants land on **Administrator** and **Editor** (the two roles that triage entries); Author/Contributor/Subscriber get none of these by default.

### 5.1 Admin actions (capability-gated)

| Action | Capability | CRUD | Description | Roles (default grant) | Triggers Events |
|---|---|---|---|---|---|
| View entries | `form.view_entries` | Read | List entries + open an entry's detail and notes | Administrator, Editor | — |
| Edit entry | `form.edit_entry` | Update | Change status, toggle read/starred, edit answer values, add note | Administrator, Editor | `form.entry_updated` |
| Delete entry | `form.delete_entry` | Delete | **Soft-delete** (status → `deleted`); restore is an `edit_entry` status change | Administrator, Editor | `form.entry_deleted` |

```typescript
// Capability map (resolved by the Role & Capability System; additive via the
// extension manifest, never hand-edited into a core registry):
const FORM_ENTRY_CAPS = {
  "form.view_entries": ["administrator", "editor"], // Read
  "form.edit_entry":   ["administrator", "editor"], // Update
  "form.delete_entry": ["administrator", "editor"], // Delete (soft)
} as const;
```

### 5.2 Notes on the action surface

- **Adding a note** is an `addNote` mutation gated by `form.edit_entry` (writing a note mutates entry-ops state); it emits `form.entry_updated`. There is no separate "note" capability — notes are part of editing an entry.
- **Read / starred toggles** are `updateEntry` calls gated by `form.edit_entry`; each emits `form.entry_updated`. Marking-read on open is a low-friction `updateEntry` (see §9 for the auto-read rule).
- **Bulk actions** call the same single-entry mutations per selected row inside one server round-trip (`updateEntryBulk` / `deleteEntryBulk`), each performing its own `requireCan` and emitting one event per affected entry (§8.4).
- There is deliberately **no hard-delete capability**. Permanent deletion, if ever needed, would be a separate explicitly-gated admin action; the default contract is soft-delete only (§9).

---

## 6. Events

### 6.1 Events emitted

| Event | Code | Trigger | Payload |
|---|---|---|---|
| Entry Updated | `form.entry_updated` | Status change, read/star toggle, value edit, or note added | `{ formId, submissionId, updatedBy }` |
| Entry Deleted | `form.entry_deleted` | Soft-delete (status → `deleted`) | `{ formId, submissionId, deletedBy }` |

Both events are scheduled with `ctx.scheduler.runAfter(0, ...)` **after** the DB writes commit — never inline. They are primarily an **audit trail** of admin actions on entries; no notification handler is required to consume them (§7), but downstream systems (e.g. an audit-log viewer or the Analytics system) may subscribe. A **restore** (status `deleted` → `complete`) is a status change and therefore emits `form.entry_updated`, not a delete event.

### 6.2 Events consumed

None. This system is an audit-event producer over admin actions; it does not subscribe to other systems' events. (It *calls* the Submission System's read queries directly rather than reacting to `form.submitted`.)

---

## 7. Notifications

**None.** This system sends no email and no site notifications. Submission-time notifications (admin "new submission", respondent confirmation) are owned by the Form Notification System (`specs/ConvexPress/systems/form-notification-system/PRD.md`) and fire off the Submission System's `form.submitted` event — not off any admin triage action here. Marking an entry read, starring it, leaving a note, changing its status, or trashing it must **not** notify the respondent or spam the admin inbox. The only outward signal these actions produce is the audit event in §6, which has no notification handler.

| Channel | Status |
|---|---|
| Email notifications | None — owned by the Form Notification System |
| Site notifications | None |

---

## 8. UI Components

Components reuse the admin shell's existing **list-table** and **detail** primitives (Base UI + Tailwind v4), so column rendering, pagination, row selection, and the bulk-action bar are not rebuilt. Navigation is full-page; the only overlays are **confirmation dialogs** for destructive actions.

### 8.1 Component inventory

**Admin (Forms extension):**
- [ ] `EntriesTable` — the inbox list (search + filter tabs + bulk bar + selectable rows).
- [ ] `EntryStatusTabs` — All / Unread / Starred / Complete / Partial / Spam / Trash filter tabs.
- [ ] `EntrySearchBar` — free-text search over field values (+ optional per-field scope).
- [ ] `EntryBulkActionBar` — appears on selection: Mark read/unread, Star/Unstar, Trash/Restore, Mark spam/Not spam.
- [ ] `EntryDetail` — single-entry page: answers + metadata + `StatusControls` + `EntryNotes`.
- [ ] `EntryAnswerList` — renders each `fieldValues` answer (decoded via `parseFieldValue`), with optional in-place edit.
- [ ] `EntryMetaPanel` — status, submitted/completed timestamps, source/referrer, IP/UA, respondent identity (`userId` if any).
- [ ] `StatusControls` — change status (Complete / Partial / Spam / Trash), toggle read + starred.
- [ ] `EntryNotes` — note list + add-note composer (`form_submission_notes`).
- [ ] `ConfirmDeleteDialog` / `ConfirmBulkDialog` — confirmation dialogs for trash + bulk destructive ops.

### 8.2 `EntriesTable` — list, search, filter, bulk

```tsx
// apps/web/src/extensions/forms/components/EntriesTable.tsx
// Reuses the admin shell's <DataTable> primitive (column defs, pagination,
// selection, bulk bar). Data comes from the Submission System's paginated query.
function EntriesTable({ formId }: { formId: Id<"forms"> }) {
  const [statusTab, setStatusTab] = useState<EntryStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<Id<"form_submissions">>>(new Set());

  // listSubmissions is owned by the Form Submission System; this UI consumes it.
  const { results, status, loadMore } = usePaginatedQuery(
    api.extensions.forms.submissions.listSubmissions,
    { formId, status: tabToStatus(statusTab), search: search || undefined },
    { initialNumItems: 25 },
  );

  const updateBulk = useMutation(api.extensions.forms.entries.updateEntryBulk);
  const deleteBulk = useMutation(api.extensions.forms.entries.deleteEntryBulk);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <EntryStatusTabs value={statusTab} onChange={setStatusTab} />
        <EntrySearchBar value={search} onChange={setSearch} />
      </div>

      {selected.size > 0 && (
        <EntryBulkActionBar
          count={selected.size}
          onMarkRead={(read) =>
            updateBulk({ ids: [...selected], patch: { read } })}
          onStar={(starred) =>
            updateBulk({ ids: [...selected], patch: { starred } })}
          onTrash={() => /* opens ConfirmBulkDialog -> deleteBulk */ undefined}
          onMarkSpam={(spam) =>
            updateBulk({ ids: [...selected], patch: { status: spam ? "spam" : "complete" } })}
        />
      )}

      <DataTable
        rows={results}
        getRowId={(r) => r._id}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        rowClassName={(r) => (r.read ? "" : "font-semibold")} // unread = bold
        columns={entryColumns(formId)} // star toggle, summary fields, status, submittedAt
        emptyState={<EmptyEntries statusTab={statusTab} />}
        onLoadMore={loadMore}
        loadingMore={status === "LoadingMore"}
      />
    </div>
  );
}
```

### 8.3 `EntryDetail` + `EntryNotes`

```tsx
// apps/web/src/extensions/forms/components/EntryDetail.tsx
function EntryDetail({ entryId, formId }: {
  entryId: Id<"form_submissions">; formId: Id<"forms">;
}) {
  // getSubmission is owned by the Submission System: parent row + fieldValues.
  const entry = useQuery(api.extensions.forms.submissions.getSubmission, {
    submissionId: entryId,
  });
  const updateEntry = useMutation(api.extensions.forms.entries.updateEntry);

  // Auto-mark-read on first open (idempotent; see §9).
  useEffect(() => {
    if (entry && !entry.read) {
      updateEntry({ submissionId: entryId, patch: { read: true } });
    }
  }, [entry?._id]);

  if (entry === undefined) return <DetailSkeleton />;
  if (entry === null) return <EntryNotFound formId={formId} />;

  return (
    <DetailLayout
      title={`Entry #${shortId(entry._id)}`}
      aside={
        <>
          <EntryMetaPanel entry={entry} />
          <EntryNotes submissionId={entryId} />
        </>
      }
    >
      <StatusControls entry={entry} formId={formId} />
      <EntryAnswerList values={entry.values} /> {/* decoded via parseFieldValue */}
    </DetailLayout>
  );
}

// EntryNotes — internal admin notes on form_submission_notes.
function EntryNotes({ submissionId }: { submissionId: Id<"form_submissions"> }) {
  const notes = useQuery(api.extensions.forms.entries.listNotes, { submissionId });
  const addNote = useMutation(api.extensions.forms.entries.addNote);
  const [draft, setDraft] = useState("");

  return (
    <section className="rounded-lg border p-4">
      <h3 className="mb-3 font-semibold">Notes</h3>
      <ul className="space-y-3">
        {notes?.map((n) => (
          <li key={n._id} className="text-sm">
            <p>{n.body}</p>
            <p className="text-muted-foreground">
              {n.authorName} · {formatDate(n.createdAt)}
            </p>
          </li>
        ))}
      </ul>
      <NoteComposer
        value={draft}
        onChange={setDraft}
        onSubmit={async () => {
          if (!draft.trim()) return;
          await addNote({ submissionId, body: draft.trim() });
          setDraft("");
        }}
      />
    </section>
  );
}
```

### 8.4 `StatusControls`

`StatusControls` exposes the read/star toggles and the status menu (Complete / Partial / Spam / Trash). Trash and Mark-spam route through a confirmation dialog; read/star toggle immediately. Every change calls `updateEntry` (or `deleteEntry` for trash) and the table/detail re-render reactively from Convex.

---

## 9. Business Rules & Constraints

- **Soft-delete only.** `deleteEntry` sets `form_submissions.status = "deleted"`; it never removes the row or its `fieldValues`/notes. Restore is an `updateEntry` status change back to `complete`/`partial`. No hard-delete capability exists by default (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §9 establishes soft-delete as the contract).
- **Every mutation is capability-gated.** `updateEntry` / `deleteEntry` / `addNote` (and their bulk variants) each start with `requireCan(ctx, "form.<cap>")` — `form.edit_entry` for updates + notes, `form.delete_entry` for trash. Reads require `form.view_entries`. No admin entry action is ungated.
- **Form-scoped + ownership checks.** Every mutation re-loads the target `form_submissions` row and asserts `row.formId === args.formId` before writing, so an entry cannot be mutated through the wrong form's inbox (and the `$formId` route param cannot be abused to cross forms).
- **Search is over field values.** Entry search matches against the entry's `fieldValues` (decoded), not just the parent row. The Submission System's `listSubmissions` is extended with an optional `search` arg; matching joins through `fieldValues` server-side (default: substring match on string/number answers; full-text is an open question, §11).
- **Bulk ops are per-row, transactional-per-call, and audited.** A bulk action applies the same single-entry mutation to each selected id within one server call; each affected entry gets its own `requireCan` evaluation and emits its own `form.entry_updated` / `form.entry_deleted`. A partial failure surfaces which ids failed; it does not silently succeed.
- **Auto-mark-read is idempotent and gated.** Opening an entry marks it `read: true` via `updateEntry` only if currently unread; it requires `form.edit_entry`. A viewer with read-but-not-edit access still sees the entry (it simply stays unread). This keeps the unread count meaningful without a separate capability.
- **Notes are internal + immutable-by-default.** `form_submission_notes` are admin-only, never shown to the respondent, and are append-only in v1 (no edit/delete of a note). They carry `authorId` + `createdAt` for accountability.
- **Value edits write back through the engine.** Editing an answer re-encodes via the Field Engine's `encodeFieldValue` and writes the engine's `fieldValues` — never a new table. Edits are server-validated through `validateFieldValue` exactly as the submit path is, so an admin edit cannot store an invalid value.
- **Status semantics are shared, not redefined.** This system sets `complete` / `partial` / `spam` / `deleted` on the Submission System's existing union; it does not invent statuses. The spam *score* remains owned by the Spam & Security system (the Form Spam & Submission Security System PRD (`specs/ConvexPress/systems/form-spam-security-system/PRD.md`)).
- **Events after commit.** `form.entry_updated` / `form.entry_deleted` are scheduled only after writes succeed; the row is the source of truth, not the event.
- **Additive-only (v2).** The `form_submission_notes` table, the `read`/`starred` flag fields, and the entry routes are all declared in the extension's schema/manifest fragments and merged by the scanner. This system never edits root `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts`.

---

## 10. Edge Cases

| Scenario | Handling |
|---|---|
| Open an entry whose `formId` ≠ route `$formId` | `getSubmission` returns the row, but the detail asserts the form match and shows not-found; mutations reject (form-scope check). |
| Entry soft-deleted, then opened via a stale link | Detail still loads (row exists with `status: "deleted"`); banner offers **Restore**; it is excluded from default (All-minus-Trash) list views. |
| Bulk action where caller lacks the cap for some rows | Each row is `requireCan`-checked; unauthorized rows are skipped and reported, authorized rows still apply. |
| Marking-read on open without `form.edit_entry` | Auto-read is skipped silently; the entry renders read-only and remains unread. |
| Editing an answer to an invalid value | `validateFieldValue` rejects in `updateEntry`; the field error surfaces inline; nothing is persisted. |
| Note submitted empty / whitespace-only | Rejected client-side and server-side; no `form_submission_notes` row written. |
| Search matches a file/relational field | Default search covers scalar (string/number) answers; heavy field types are out of scope for substring search (see §11). |
| Partial (save-and-continue) entry in the inbox | Shown under the **Partial** tab; answers render as far as collected; editable + trashable like any entry. |
| Spam entry opened | Renders normally under the **Spam** tab with a **Not spam** action (status → `complete`); the spam score is read-only here. |
| Concurrent edits to the same entry by two admins | Last write wins per field (Convex mutation serialization); both edits emit `form.entry_updated` for the audit trail. |
| Form deleted while its inbox is open | List/detail queries return empty/not-found; the inbox surfaces an empty state rather than erroring. |
| Restoring a trashed entry | `updateEntry` sets `status` back to `complete`/`partial`; emits `form.entry_updated` (a restore is an update, not a delete). |

---

## 11. Implementation Checklist

**Phase 1 — entry-ops data model**
- [ ] Add `form_submission_notes` to the Forms extension schema fragment with the `by_submission` index.
- [ ] Add optional `read` / `starred` fields (+ `by_form_read`, `by_form_starred` indexes) to `form_submissions` via the same fragment.
- [ ] Confirm the engine's `fieldValues` `by_entity` reader covers `entityType: "form_submission"` (no new table).

**Phase 2 — admin read + routes**
- [ ] Add the two routes under `_authenticated/_admin/forms/$formId/entries/`, each wrapped in `<PluginGuard pluginId="forms">`, gated on `form.view_entries`.
- [ ] Extend the Submission System's `listSubmissions` with an optional `search` arg (field-value match) — coordinate with that system as the query owner.
- [ ] Build `EntriesTable` on the reused `DataTable` primitive: status tabs, search bar, selection, bulk bar.
- [ ] Build `EntryDetail` on the reused detail scaffold: `EntryMetaPanel` + `EntryAnswerList` (decoded via `parseFieldValue`) + `StatusControls`.

**Phase 3 — entry-ops mutations (capability-gated + audited)**
- [ ] `updateEntry` — `requireCan("form.edit_entry")`; patch `read`/`starred`/`status` and/or edit answer values (re-validated via `validateFieldValue`, re-encoded via `encodeFieldValue`); emit `form.entry_updated`.
- [ ] `deleteEntry` — `requireCan("form.delete_entry")`; soft-delete (`status: "deleted"`); emit `form.entry_deleted`.
- [ ] `addNote` — `requireCan("form.edit_entry")`; insert `form_submission_notes`; emit `form.entry_updated`.
- [ ] `listNotes` — `requireCan("form.view_entries")`; notes by submission, author-name resolved.
- [ ] Form-scope assertion (`row.formId === args.formId`) in every mutation.
- [ ] Wire auto-mark-read on detail open (idempotent, gated).

**Phase 4 — bulk + triage UX**
- [ ] `updateEntryBulk` / `deleteEntryBulk` — per-row `requireCan` + per-row event; partial-failure reporting.
- [ ] `EntryBulkActionBar` + confirmation dialogs (trash, bulk trash, mark spam).
- [ ] `EntryNotes` composer + restore-from-trash flow.
- [ ] Register `form.view_entries` / `form.edit_entry` / `form.delete_entry` grants (Administrator + Editor) via the extension manifest.

---

## 12. Open Questions

- **Search depth:** substring match over scalar `fieldValues` (current sketch) vs. a Convex full-text search index over a denormalized answer blob. Default: substring for v1; revisit if entry volumes make it slow. Coordinate with the Submission System (owner of `listSubmissions`) and the Analytics system, which may want the same index.
- **Bulk atomicity:** apply-all-or-nothing vs. best-effort-with-report (current sketch is best-effort, per-row events). Default: best-effort + a failed-ids report; reopen if an all-or-nothing guarantee is required.
- **Note editing/deletion:** v1 notes are append-only. Add edit/delete (with its own audit event) if admins ask — likely a `form.edit_entry` sub-action rather than a new capability.
- **Permanent delete:** soft-delete is the only delete in v1. If a hard "delete forever" is needed (e.g. GDPR erasure), it should be a separate, explicitly-gated `form.purge_entry` action that also removes the entry's `fieldValues` + notes — parked until a compliance requirement lands. (This overlaps with the Analytics/Export system's retention policy.)
- **Read state granularity:** a single `read` boolean (current) vs. per-admin read state. Default: a shared `read` flag (matches Gravity Forms); per-user read tracking is likely overkill for the admin team size.

---

## 13. Cross-References

- Depends on: Form Submission System (`specs/ConvexPress/systems/form-submission-system/PRD.md`) — owns `form_submissions`, `listSubmissions`, `getSubmission`, the `status` union, and soft-delete.
- Renders answers via: Form Field Engine (`specs/ConvexPress/systems/form-field-engine/PRD.md`) — `fieldValues` + `parseFieldValue` / `encodeFieldValue` / `validateFieldValue`.
- Shares filters/status with: Form Analytics & Export System (`specs/ConvexPress/systems/form-analytics-export-system/PRD.md`) — export honors trash/spam states; CSV/Excel export is owned there, not here.
- Spam verdict owned by: Form Spam & Submission Security System (`specs/ConvexPress/systems/form-spam-security-system/PRD.md`) — this system only flips status manually.
- Submission-time notifications owned by: Form Notification System (`specs/ConvexPress/systems/form-notification-system/PRD.md`) — entry-ops send none.
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Entry Management System · **Plugin:** ConvexPress Forms (v2)
