# PLAN: Form Analytics & Export System

> Lean build plan for the **PRD** in this folder. v2 Forms extension. Backend at
> `packages/backend/convex/extensions/forms/`, admin UI at `apps/web/src/`.
> **Table already exists** — `form_funnel_stats` is live in `extensions/forms/schema.ts`.
> Read the PRD first; this file is the ordered build + file paths + verify checklist only.

## Pre-flight: facts that override the PRD pseudocode

The PRD's code samples drift from the real repo. Build against these REAL facts:

1. **Index name.** `form_funnel_stats` already exists with **one** index:
   `.index("by_form_day", ["formId", "day", "stage"])` (NOT the two indexes
   `by_form_day` + `by_form_day_stage` in PRD §4.1). The 3-col index serves BOTH
   the upsert lookup (`eq formId, eq day, eq stage`) and the range read
   (`eq formId, gte/lte day`). Do **not** add a second index. Do **not** edit the table.
2. **No `updatedAt` on the row.** The live schema has `{formId, day, stage, count}` —
   **no `updatedAt` field**. The PRD pseudocode patches `updatedAt`; omit it (patching an
   undeclared field fails the validator). Patch `count` only.
3. **`meta` is a JSON string.** `form_submissions.meta` is `v.optional(v.string())`
   (JSON-encoded), NOT an object. The sweep's `meta.abandonCounted` marker must
   `JSON.parse` → set flag → `JSON.stringify` back. Never `row.meta?.abandonCounted` directly.
4. **No `@convexpress/field-engine` package.** `parseFieldValue` does not exist as an
   import. `fieldValues.value` is a **JSON-encoded string**; decode with a local
   `decodeCell(value)` helper (`JSON.parse`, then flatten arrays/objects to a CSV-safe
   scalar). Field defs come from the `fieldDefinitions` table via index `by_group`
   (`["groupId", "menuOrder"]`) — already sorted by menuOrder.
5. **`form.submitted` already fires** with the right payload. `mutations.ts` submit()
   emits `FORM_EVENTS.SUBMITTED` = `"form.submitted"` with
   `{formId, submissionId, isComplete, submittedAt, valueCount}`. The completed counter
   listens to this; **no change to mutations.ts**.
6. **Event emit from an action** uses a thin `internalMutation` wrapper +
   `ctx.runMutation`. Copy the established pattern in
   `convex/auditLogs/internals.ts` → `emitExportEvent` (an action cannot call
   `emitEvent` directly — `emitEvent` needs a `MutationCtx`).
7. **`requireCan(ctx, cap)`** lives in `convex/helpers/permissions.ts`. The `form.*`
   caps are not yet in the closed `Capability` union, so **cast**:
   `requireCan(ctx, "form.view_analytics" as Capability)` (mirrors the existing cast
   convention documented at the top of `extensions/forms/mutations.ts`).
8. **Listener registration is a hub edit, but an ALLOWED one.** Wiring `completed`
   means adding a `ListenerDef` row to
   `convex/bootstrap/registerListeners.ts`. This is the standard per-system pattern
   (search, sitemap, menu all do it) and is **not** one of the three additive-only
   forbidden files (`schema.ts`, `lib/plugins/registry.ts`, `lib/admin-shell/nav-config.ts`).
   Crons + listener-bootstrap are platform hub files every system appends to.
9. **Layout/no-value field types** to exclude from columns:
   `message`, `accordion`, `tab`, `page_break` (matches submit()'s skip list, which also
   skips `page_break` implicitly by storing no value).

---

## Build steps (ordered)

### Step 1 — Backend: `analytics.ts` (counter writes + funnel read)
**File (NEW):** `packages/backend/convex/extensions/forms/analytics.ts`

Export, in this file:
- `incrementStage(ctx, formId, day, stage)` — module-local helper. Upsert via
  `by_form_day` index (`eq formId, eq day, eq stage`).first(); patch `count+1` or
  insert `{formId, day, stage, count: 1}`. **No `updatedAt`.**
- `utcDay(ms): string` — module-local; `new Date(ms).toISOString().slice(0,10)` → `"YYYY-MM-DD"`.
- `recordFunnel` — **`internalMutation`**. Args `{formId, stage: v.union(literal "viewed", literal "started"), sessionNonce: v.optional(v.string())}`.
  Guard: `const form = await ctx.db.get(formId); if (!form || form.status !== "published") return;` (silent no-op, never throw).
  Then `incrementStage(ctx, formId, utcDay(Date.now()), stage)`. (Dedup/clamp = TODO seam, see Step 8.)
- `getFunnel` — **`query`**. Args `{formId, from: v.string(), to: v.string()}`.
  `await requireCan(ctx, "form.view_analytics" as Capability)`. Read via `by_form_day`
  (`eq formId, gte day from, lte day to`).collect(). Sum into
  `totals = {viewed, started, completed, abandoned}`. Compute `rates` with a
  divide-by-zero guard (`den > 0 ? num/den : 0`): `startRate, completionRate, overallRate,
  dropOff (= 1 - overallRate), abandoned`. Return `{ totals, rates, byDay }` where
  `byDay` groups rows by `day` (sparse; client zero-fills).
- `onFormSubmitted` — **`internalMutation`**. Args `{eventId: v.id("events")}` (event-handler
  shape — see `search/eventHandlers.ts`). Body: `const ev = await ctx.db.get(args.eventId); if (!ev) return; const p = JSON.parse(ev.payload); if (!p.isComplete) return; await incrementStage(ctx, p.formId, utcDay(p.submittedAt), "completed");`

> The PRD shows `onFormSubmitted` taking `{formId, isComplete, submittedAt}` directly;
> the real dispatcher invokes listeners with `{eventId}` and the handler reads the
> payload. Use the `{eventId}` form.

### Step 2 — Backend: public wrapper for the renderer
**File:** `packages/backend/convex/extensions/forms/analytics.ts` (same file, append)
- `recordFunnelPublic` — **`mutation`** (public, NO `requireCan`, NO auth). Same args as
  `recordFunnel`. Body: `await ctx.runMutation` is not needed — just inline the same logic
  OR call the shared `incrementStage` directly (a `mutation` is a write ctx). Keep the
  published-form guard. This is the ONLY public funnel write surface; it is
  `api.extensions.forms.analytics.recordFunnelPublic` (matches the renderer call site the
  PRD §11.3 documents). `recordFunnel` (internal) stays for system/test use.

> Rationale: the renderer (Website app, Clerk, read-only consumer) needs a **public**
> `mutation`, not an `internalMutation`. Exposing one thin public mutation that increments
> only `viewed`/`started` keeps the table write-only from outside and unreadable publicly.

### Step 3 — Backend: cron sweep for `abandoned`
**File:** `packages/backend/convex/extensions/forms/analytics.ts` (same file, append)
- `sweepAbandoned` — **`internalMutation`**, args `{}`. Constants at top of file:
  `ABANDON_TTL_MS = 24 * 60 * 60 * 1000`, `SWEEP_BATCH = 100`.
  Query `form_submissions` via `by_status` (`eq status "partial"`),
  `.filter(q => q.lt(q.field("submittedAt"), Date.now() - ABANDON_TTL_MS))`, `.take(SWEEP_BATCH)`.
  For each row: parse meta (`const meta = row.meta ? JSON.parse(row.meta) : {}`);
  `if (meta.abandonCounted) continue;`
  `await incrementStage(ctx, row.formId, utcDay(row.submittedAt ?? row.createdAt), "abandoned");`
  `await ctx.db.patch(row._id, { meta: JSON.stringify({ ...meta, abandonCounted: true }) });`
  Return `{ swept: rows.length }`. (Does NOT delete or re-status the row.)

**File:** `packages/backend/convex/crons.ts` (hub append — allowed)
- Add a `crons.daily("forms:sweep-abandoned-partials", { hourUTC: 2, minuteUTC: 45 },
  internal.extensions.forms.analytics.sweepAbandoned, {})` entry under a
  `// ─── Forms Analytics ───` banner. Pick a minute not already taken (2:45 is free;
  2:30 = event cleanup, 3:00 = tickets). Use the `internal.extensions.forms.analytics.*`
  path (cast with `(internal as any)` only if codegen hasn't run yet — prefer the typed path).

### Step 4 — Backend: `export.ts` (CSV action)
**File (NEW):** `packages/backend/convex/extensions/forms/export.ts`

- Constant `EXPORT_PAGE_SIZE = 500`.
- `resolveColumns` — **`internalQuery`**. Args `{formId, fields: v.optional(v.array(v.string()))}`.
  Load form → `fieldGroupId`. If no group, return `[]`. Query `fieldDefinitions` by
  `by_group` (`eq groupId`) (already menuOrder-sorted). Drop layout types
  (`message|accordion|tab|page_break`). If `fields` provided, filter+order to those `name`s
  (silently drop names with no matching def — collect dropped names for a `warnings` array).
  Return `{ columns: [{name, label, key}], warnings: string[] }`.
- `decodeCell(raw: string | undefined): string` — module-local. `if (raw == null) return "";`
  `try { const v = JSON.parse(raw); ... }`; flatten: array → `join("; ")`, object → `JSON.stringify`,
  scalar → `String(v)`. Fallback to the raw string if parse throws.
- `csvCell(s)` / `csvRow(arr)` — module-local CSV encoders (quote if contains `,"\n`,
  double internal quotes). Header row = `["entry_id","status","submitted_at","completed_at","source", ...columns.map(c=>c.label)]`.
- `exportEntries` — **`action`**. Args
  `{formId, statuses: v.optional(v.array(v.union(literal complete, partial, spam, deleted))), fields: v.optional(v.array(v.string())), format: v.optional(v.literal("csv"))}`.
  1. `await requireCan(ctx, "form.export_entries" as Capability)` — actions CAN call
     requireCan (it takes an `AuthReadCtx`). If the cast/ctx typing fights, fall back to
     `await ctx.runQuery(internal...assertCanExport)` thin wrapper. Prefer inline.
  2. `const { columns, warnings } = await ctx.runQuery(internal.extensions.forms.export.resolveColumns, {formId, fields})`.
  3. Page `listSubmissions` (`api.extensions.forms.queries.listSubmissions`) with
     `paginationOpts {cursor, numItems: EXPORT_PAGE_SIZE}`, `status: undefined` (multi-status
     filtered client-side). Default status filter = `["complete"]` when `statuses` omitted;
     otherwise the given set. Filter `page.page` by that set.
  4. For each kept row: `const sub = await ctx.runQuery(api.extensions.forms.queries.getSubmission, {id: row._id})`
     (returns `{submission, values, notes}`). Build `byKey`/`byName` map from `sub.values`
     (`{fieldKey, fieldName, value}`). Emit a CSV row:
     `[shortId(row._id), row.status, iso(row.submittedAt), iso(row.completedAt), row.referrer ?? "", ...columns.map(c => csvCell(decodeCell(byName[c.name])))]`.
     (Note: PRD says `row.source`; the real column is `referrer`. Use `referrer`.)
  5. Loop until `page.isDone`. Join chunks with `"\n"`.
  6. Emit audit event AFTER assembly via the wrapper from Step 5:
     `await ctx.runMutation(internal.extensions.forms.export.emitExported, {formId, count, exportedBy})`.
  7. Return `{ format: "csv" as const, count, filename: \`form-${formId}-entries.csv\`, csv, warnings }`.
  - Header-only CSV when `count === 0` (still returns + still emits — Edge Case row 1).

### Step 5 — Backend: audit-event emit wrapper
**File:** `packages/backend/convex/extensions/forms/export.ts` (same file, append)
- `emitExported` — **`internalMutation`**, args `{formId: v.id("forms"), count: v.number(),
  exportedBy: v.optional(v.string())}`. Body: `await emitEvent(ctx, "form.entries_exported",
  SYSTEM.FORMS, {formId, count, format: "csv", exportedBy})`. Mirror
  `auditLogs/internals.ts → emitExportEvent`.
- `resolveUserId` for `exportedBy`: in the action, get it via
  `ctx.runQuery(api...currentUser)` OR pass `undefined` and let `emitEvent` auto-resolve the
  actor from `ctx.auth` inside the wrapper (preferred — `emitEvent` already auto-resolves
  `actorId` from ctx.auth). So `exportedBy` can be omitted; the wrapper relies on emitEvent's
  actor resolution.

### Step 6 — Backend: register the event code + completed listener
**File:** `packages/backend/convex/events/constants.ts`
- Add `ENTRIES_EXPORTED: "form.entries_exported"` to the `FORM_EVENTS` object (so
  `isValidEventCode` stops warning; keeps it in `ALL_EVENT_CODES`).

**File:** `packages/backend/convex/bootstrap/registerListeners.ts` (hub append — allowed)
- Add ONE `ListenerDef` under a `// ─── FORMS ANALYTICS ───` banner:
  ```
  {
    eventCode: "form.submitted",
    name: "Forms Analytics: Increment completed funnel stage",
    handlerModule: "extensions/forms/analytics",
    handlerFunction: "onFormSubmitted",
    handlerType: "internal",
    priority: 50,            // analytics tier (after notifications/email)
    maxRetries: 3, retryDelayMs: 2000, retryBackoff: "exponential",
    system: "forms",
    description: "Increments form_funnel_stats 'completed' on form.submitted when isComplete:true.",
  }
  ```
- NOTE: this listener row only takes effect after `bootstrap.registerListeners.run`
  is executed (idempotent). Flag in the verify checklist that the deploy expert must run it.

### Step 7 — Backend: capability surfacing (manifest-side, no registry edit)
- The two caps `form.view_analytics` + `form.export_entries` are SURFACED here, REGISTERED
  by the Role/Capability expert (per repo rule — do NOT edit the capability registry).
- Confirm both strings are referenced (they are, via the `as Capability` casts in Steps 1/4).
- Add them to the Forms nav so the analytics entry shows + the cap is discoverable
  (Step 9). No change to `types/capabilities.ts` (the expert owns the union).

### Step 8 — Backend: dedup/clamp seam (lean, documented TODO)
- In `recordFunnelPublic` (Step 2), leave a clearly-commented seam for §9 rate-sanity:
  `started` dedup per `sessionNonce`/day + per-form per-window clamp. v1 may ship the
  published-form guard + silent-no-op only, with a `// TODO(§9): coarse dedup + write clamp`
  marker. Do **not** add a new table for this in v1 (the Spam system owns
  `form_submission_attempts`). Keep it a no-throw path.

### Step 9 — Admin: nav entry (additive, scanner-merged)
**File:** `apps/web/src/extensions/forms/nav.ts` (EDIT — this is the extension's own nav fragment, allowed)
- Under the existing `children`, add an Analytics child. Because analytics is **per-form**
  (`$formId`), it can't be a static top-level nav link; instead expose it as a section child
  pointing at the forms list, OR (preferred) wire the link from the form's edit/detail view
  (Step 11). Minimum: add a `formCap("form.view_analytics")` reference so the cap is known to
  the nav layer. If a static entry is undesired, skip the nav child and rely on the in-page
  link (Step 11) — document the choice.

### Step 10 — Admin: the analytics route
**File (NEW):** `apps/web/src/routes/_authenticated/_admin/forms/$formId/analytics/index.tsx`
- `export const Route = createFileRoute("/_authenticated/_admin/forms/$formId/analytics/")({ component })`.
- Component wraps children in `<PluginGuard pluginId="forms">` (copy the pattern from the
  sibling `forms/$formId/edit.tsx`). Renders `<FormAnalyticsPage formId={...} />`.
- Use `useQuery` from `convex-helpers/react/cache` (repo convention), not raw `convex/react`,
  for `getFunnel`. Use `useAction(api.extensions.forms.export.exportEntries)` for export.

### Step 11 — Admin: components
**File (NEW):** `apps/web/src/extensions/forms/components/FormAnalyticsPage.tsx`
Co-locate small subcomponents in this one file (lean — split later only if it grows):
- `FormAnalyticsPage` — `Route.useParams()` → `formId`; `range` state (default last 30 UTC
  days via a local `defaultRange()`); `getFunnel` query; skeleton while `undefined`;
  `EmptyAnalytics` when `totals.viewed === 0 && totals.completed === 0`.
- `FunnelSummaryCards` — 4 stat cards (Viewed/Started/Completed/Abandoned) + between-stage
  rates. Reuse the `StatCard` pattern from `routes/_authenticated/_admin/tickets/analytics.tsx`.
- `FunnelChart` — viewed→started→completed bars + daily series (zero-fill sparse days
  client-side from `byDay`). Keep simple (CSS bars) unless a chart primitive already exists.
- `DropOffCallout` — highlights the largest between-stage drop.
- `DateRangePicker` — `[from,to]` UTC-day `<Input type="date">` pair driving `getFunnel`.
- `ExportButton` + `ExportOptions` — gated on `form.export_entries` (hide/disable if the
  user lacks it; resolve via the same cap-check hook the admin shell uses). On export:
  `await exportEntries({formId, ...opts})` then `downloadCsv(res.filename, res.csv)`
  (local helper: `Blob` → object URL → anchor click). Surface `res.warnings` as a toast.
- `EmptyAnalytics` — empty state with a link back to the form.
- Base UI + Tailwind v4 only. No `@radix-ui/*`. No hardcoded color literals (CSS vars).
- Add the in-page entry point: from `forms/$formId/edit.tsx` (or the form detail view) add a
  `<Link to="/forms/$formId/analytics" params={{formId}}>Analytics</Link>` so the per-form
  route is reachable (covers Step 9's per-form nav gap).

### Step 12 — Website: renderer call site (CONTRACT ONLY — owned by Renderer system)
- This system does NOT own the renderer. Document (do not implement here) that the public
  renderer at `ConvexPress-Website/` calls
  `api.extensions.forms.analytics.recordFunnelPublic`:
  `{formId, stage:"viewed"}` on mount; `{formId, stage:"started", sessionNonce}` on first
  field interaction (deduped client-side via a `useOnce`). Completion is NOT recorded here
  (flows from `submit()` → `form.submitted` → `onFormSubmitted`). Add a one-line note/stub in
  the PRD cross-ref; leave the actual wiring to the Renderer build.

---

## Verify checklist

Backend (run from `packages/backend/`):
- [ ] `bunx convex codegen` regenerates `_generated/api` with
      `extensions.forms.analytics` + `extensions.forms.export` modules (and the new
      internal fns: `recordFunnel`, `onFormSubmitted`, `sweepAbandoned`, `resolveColumns`,
      `emitExported`). One command, foreground, not in background.
- [ ] Typecheck passes: `bunx tsc --noEmit` (or the repo's typecheck script). Expect only
      Convex TS2589 false positives — suppress with scoped `@ts-expect-error`, never
      `--typecheck=disable`. The `as Capability` casts must compile.
- [ ] `form_funnel_stats` is **untouched** in `extensions/forms/schema.ts` (diff shows no
      schema change). No second index added. No `updatedAt` field referenced anywhere.
- [ ] `crons.ts` has exactly one new `forms:sweep-abandoned-partials` entry; minute slot
      (2:45) collides with nothing else.
- [ ] `bootstrap/registerListeners.ts` has exactly one new `form.submitted` listener row;
      `handlerModule: "extensions/forms/analytics"`, `handlerFunction: "onFormSubmitted"`.
- [ ] `events/constants.ts` `FORM_EVENTS` includes `ENTRIES_EXPORTED: "form.entries_exported"`.
- [ ] **No edits** to root `convex/schema.ts`, `lib/plugins/registry.ts`,
      `lib/admin-shell/nav-config.ts`, or `types/capabilities.ts`.
- [ ] **No edits** to `extensions/forms/mutations.ts` (submit already emits `form.submitted`).

Behavior (Convex dashboard or a scratch test):
- [ ] `recordFunnelPublic({formId, stage:"viewed"})` on a **published** form inserts/increments
      one `form_funnel_stats` row for today; on a **draft** form it is a silent no-op (0 rows).
- [ ] Submitting a form with `isComplete:true` → after listeners run, a `completed` row exists
      for today. (Requires `bootstrap.registerListeners.run` to have been executed.)
- [ ] Insert a `partial` `form_submissions` row with `submittedAt` > 24h ago, run
      `sweepAbandoned` → one `abandoned` increment + the row's `meta` now has
      `{"abandonCounted":true}`. Run it a 2nd time → no double count (idempotent).
- [ ] `getFunnel({formId, from, to})` requires `form.view_analytics` (throws FORBIDDEN
      without it); returns `totals` + `rates` with **no `NaN`** when `viewed:0`
      (divide-by-zero guarded).
- [ ] `exportEntries({formId})` requires `form.export_entries`; returns a CSV string whose
      header = metadata cols + one col per non-layout field (in menuOrder); default body =
      complete-only rows; `count` matches body rows; emits `form.entries_exported`.
- [ ] Export with `statuses:["deleted"]` includes trashed rows; with a `fields:[...]`
      projection naming a removed field, that column is dropped and `warnings` is non-empty
      (export still succeeds).
- [ ] Export of a form with **zero** matching entries returns a header-only CSV (`count:0`)
      and still emits the audit event.

Admin UI (Playwright smoke — drive it yourself, do not hand off to the user):
- [ ] `/admin/forms/<id>/analytics` renders behind auth + `PluginGuard`; a user lacking
      `form.view_analytics` hits the not-authorized surface.
- [ ] Funnel cards + chart render for a form with data; `EmptyAnalytics` shows for a form
      with none.
- [ ] The Export button is hidden/disabled for a user without `form.export_entries`; for a
      user with it, clicking downloads a `.csv` (verify a file lands / the Blob anchor fires).
- [ ] Date-range change re-runs `getFunnel` and updates the cards.
- [ ] No `@radix-ui/*` imports; no hardcoded color literals; full-page nav (no modal editor —
      the only popup allowed is a confirm dialog, and export uses inline progress/toast).

Deploy handoff (not done by this build):
- [ ] Note for `/experts:convex-deployment`: run `internal.bootstrap.registerListeners.run`
      once post-deploy so the `completed` listener activates.
- [ ] Note for `/experts:role-capability-system`: register `form.view_analytics` +
      `form.export_entries` on Administrator + Editor, and add them to the `Capability` union
      (which turns the `as Capability` casts into no-ops).

---

## File manifest (quick reference)

| Action | Path |
|---|---|
| NEW | `packages/backend/convex/extensions/forms/analytics.ts` (recordFunnel, recordFunnelPublic, getFunnel, onFormSubmitted, sweepAbandoned, incrementStage, utcDay) |
| NEW | `packages/backend/convex/extensions/forms/export.ts` (exportEntries action, resolveColumns, emitExported, decodeCell, csv helpers) |
| EDIT (hub, allowed) | `packages/backend/convex/crons.ts` (one daily sweep entry) |
| EDIT (hub, allowed) | `packages/backend/convex/bootstrap/registerListeners.ts` (one form.submitted listener) |
| EDIT (hub, allowed) | `packages/backend/convex/events/constants.ts` (FORM_EVENTS.ENTRIES_EXPORTED) |
| NEW | `apps/web/src/routes/_authenticated/_admin/forms/$formId/analytics/index.tsx` |
| NEW | `apps/web/src/extensions/forms/components/FormAnalyticsPage.tsx` (+ co-located subcomponents) |
| EDIT (extension fragment, allowed) | `apps/web/src/extensions/forms/nav.ts` (surface form.view_analytics cap) |
| EDIT (in-page link) | `apps/web/src/routes/_authenticated/_admin/forms/$formId/edit.tsx` (Link to analytics) |
| DO NOT TOUCH | `extensions/forms/schema.ts` · root `schema.ts` · `lib/plugins/registry.ts` · `lib/admin-shell/nav-config.ts` · `types/capabilities.ts` · `extensions/forms/mutations.ts` |

**PLAN Version:** 1.0 · **For PRD:** Form Analytics & Export System v1.0 · **Created:** 2026-05-30
