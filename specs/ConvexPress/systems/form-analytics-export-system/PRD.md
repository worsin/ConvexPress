# PRD: Form Analytics & Export System

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). The reporting + extraction surface of the Forms tree: the conversion funnel on top of the public renderer + submission event, and CSV export over collected entries.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** The **measurement + extraction layer** of the Forms extension. It answers two questions the capture/inbox systems do not: *"how is this form converting?"* (a views → starts → completions → drop-off funnel) and *"give me the data out"* (a CSV export of collected entries). It is a thin, mostly-read system: it owns exactly **one** small counter table for the funnel and otherwise reads the Submission System's `form_submissions` and the Field Engine's `fieldValues`. The funnel is fed by lightweight tracking on the **public Website renderer** (views/starts) plus the Submission System's `form.submitted` event (completions) and a partial-expiry sweep (abandons). Export is a capability-gated admin action that streams existing rows to CSV — it invents no new store.

**Key product insight (drives the funnel design):** the reference EZ-signup flow captures the lead at the **Review step** — a *partial* submission is written even when the visitor abandons before final submit. That partial-capture-on-abandon behavior (owned by the Submission System's `isComplete:false` write + the Multi-Step system) is precisely what makes **drop-off / abandon analysis a first-class goal here**, not an afterthought: an abandoned funnel stage corresponds to a real `partial` row that never reached `complete`.

**Code lives at:**
- Admin route — `apps/web/src/routes/_authenticated/_admin/forms/$formId/analytics/index.tsx`, wrapped in `<PluginGuard pluginId="forms">`.
- Backend — `packages/backend/convex/extensions/forms/analytics.ts` (the `recordFunnel` internal mutation, the `getFunnel` query) and `packages/backend/convex/extensions/forms/export.ts` (the `exportEntries` action), with the additive `form_funnel_stats` table declared in the extension's schema fragment `packages/backend/convex/extensions/forms/schema.ts` (merged by the scanner — never hand-edited into root `schema.ts`).

**Consumes these ConvexPress systems:**

- **Form Submission System** (`form_submissions`) — completions come from its `form.submitted` event (`isComplete:true`); abandons come from sweeping its `partial` rows past a TTL; export reads its parent rows (and honors its `status` union — `spam`/`deleted` are excluded by default). See the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`).
- **Form Entry Management System** (`form_submissions` triage) — export **reuses the same `listSubmissions` filters + status semantics** the inbox exposes, so an export respects the trash/spam states that system manages. See the Form Entry Management System PRD (`specs/ConvexPress/systems/form-entry-management-system/PRD.md`).
- **Form Field Engine** (`field-engine`) — export columns are derived from the form's `fieldDefinitions`, and each answer cell is read from `fieldValues` (`entityType: "form_submission"`) and decoded via `parseFieldValue`. No parallel values store; same reader the metaboxes + entry inbox use.
- **Form Renderer System** — the **public** Website renderer calls `recordFunnel` to log a `viewed` (form rendered) and a `started` (first field interaction) signal. This is the only place public, unauthenticated funnel writes originate. See the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`).
- **Role & Capability System** — the export mutation opens with `requireCan(ctx, "form.export_entries")`; the analytics route resolves the same/adjacent caps for nav + visibility. Grants land on Administrator + Editor.
- **Event Dispatcher** — subscribes to `form.submitted` (to increment the `completed` counter) and emits `form.entries_exported` after an export action completes.

**WooCommerce / WordPress analog:** Gravity Forms' **Results / conversion** view plus its **Export Entries** screen (CSV with one column per form field) — and the well-known Gravity Forms "partial entries" add-on, which is exactly the abandon/drop-off mechanic this system reports on.

---

## 1. Overview

### 1.1 Purpose

Give admins (a) a **conversion funnel** per form — how many people *viewed* it, how many *started* filling it, how many *completed* it, and how many *abandoned* it (with drop-off rates between stages) — and (b) a one-click **CSV export** of a form's entries, one row per submission and one column per form field. The funnel is assembled from lightweight, privacy-light counters incremented by the public renderer (`viewed`/`started`), by the `form.submitted` event (`completed`), and by a scheduled sweep of expired partials (`abandoned`). Export streams the Submission System's rows joined to the Field Engine's `fieldValues`, projecting the form definition's fields into columns. The system owns one tiny counter table and otherwise reads what the capture + inbox systems already store.

### 1.2 Scope

**In scope:**
- One additive counter table, `form_funnel_stats` (per `formId`, per `day`, per `stage`, a `count`), and its read/write surface.
- A **public-safe** `recordFunnel` internal mutation that increments `viewed` / `started`, callable from the **unauthenticated** Website renderer (privacy-light, rate-sane — §9).
- Incrementing the `completed` stage from the Submission System's `form.submitted` event (only when `isComplete:true`).
- Incrementing the `abandoned` stage from a scheduled sweep of `partial` `form_submissions` rows that pass their TTL without completing.
- A `getFunnel` admin query returning per-stage totals + drop-off rates over a date range, for one form.
- The admin **analytics route** (`/admin/forms/$formId/analytics`), `_admin`, `auth=true`, wrapped in `<PluginGuard pluginId="forms">`, gated on a view cap.
- The capability-gated `exportEntries` **action** → CSV: column set derived from the form's `fieldDefinitions`, cells from `fieldValues` (decoded via `parseFieldValue`), streamed/paginated for large forms, emitting `form.entries_exported`.
- Respecting field **projection** + entry **status filters** on export (reuses the inbox's filter/status semantics).

**Out of scope:**
- The `form_submissions` table, the public `submit` mutation, and `listSubmissions` / `getSubmission` (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) — owned there, consumed here).
- The entry inbox UI: list/detail, notes, read/star, bulk triage (the Form Entry Management System PRD (`specs/ConvexPress/systems/form-entry-management-system/PRD.md`)).
- Field types, renderers, the validator, conditional logic, and value (de)serialization (the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)).
- The public form UI + the `/forms/$slug` route that *calls* `recordFunnel` (the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`)).
- Multi-step navigation + the partial-write/resume mechanics themselves — this system only *reads* the resulting partials to compute abandons (the Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`)).
- Spam scoring + the spam verdict; bot detection beyond the funnel's coarse dedup (the Form Spam & Submission Security System PRD (`specs/ConvexPress/systems/form-spam-security-system/PRD.md`)).
- Email / site notifications — this system sends none (§7).
- Excel / scheduled / S3-delivered exports and cross-form aggregate dashboards — v1 is on-demand CSV for one form (§12).

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Form Submission System | Source of completions (`form.submitted`, `isComplete:true`), abandons (`partial` rows past TTL), and export rows (`form_submissions` + the `status` union). |
| Form Entry Management System | Export reuses its `listSubmissions` filters + status semantics, so exports honor the trash/spam states it manages. |
| Form Field Engine (`field-engine`) | Export column derivation from `fieldDefinitions`; answer cells from `fieldValues` decoded via `parseFieldValue`. |
| Form Renderer System | Public renderer calls `recordFunnel` to log `viewed` / `started`. |
| Role & Capability System | `requireCan(ctx, "form.export_entries")` on export; cap resolution for the analytics route/nav. |
| Event Dispatcher | Subscribes to `form.submitted` (completed counter); emits `form.entries_exported`. |

### 2.2 Systems that depend on this

| System | Integration point |
|---|---|
| Form Builder System | Links from a form's admin view to its analytics tab (`/admin/forms/$formId/analytics`). |
| Form Renderer System | Calls `recordFunnel`; the funnel is only as good as the renderer's view/start instrumentation. |

(This system is a leaf of the Forms tree: things depend on its *route entry*, not on new persistence it exposes.)

### 2.3 Integration hooks

```typescript
// Event emitted by the Form Analytics & Export System (brace-shorthand throughout)
type FormAnalyticsEvents = "form.entries_exported";

interface FormEntriesExportedPayload {
  formId: Id<"forms">;
  count: number;            // number of entries written to the file
  format: "csv";            // v1 is CSV-only; union widens if Excel lands (§12)
  exportedBy: Id<"users">;  // the admin who ran the export
}

// Event CONSUMED from the Form Submission System (not redefined here):
//   form.submitted { formId, submissionId, isComplete, submittedAt, values }
//   -> on isComplete:true, increment form_funnel_stats stage "completed".

// Read surfaces CONSUMED (not redefined here):
//   listSubmissions({ formId, status?, search?, paginationOpts }) // Submission System
//   getSubmission({ submissionId }) -> { ...row, values: fieldValues[] }
//   fieldDefinitions by_group + parseFieldValue                    // Field Engine
```

---

## 3. Routes

One admin route, under the canonical Forms admin tree, admin-only, auth-required, wrapped in `<PluginGuard pluginId="forms">`. Navigation is **full-page** (TanStack Router). The route is read-only reporting; the only write it can trigger is the export action (via a button), which is itself capability-gated.

| Route | Path | File | Layout | Auth | Guard | Capability |
|---|---|---|---|---|---|---|
| Form Analytics | `/admin/forms/$formId/analytics` | `_authenticated/_admin/forms/$formId/analytics/index.tsx` | `_admin` | `true` | `pluginId="forms"` | `form.view_analytics` |

```tsx
// apps/web/src/routes/_authenticated/_admin/forms/$formId/analytics/index.tsx
// Additive-only: the scanner registers this route + its nav entry; we never
// hand-edit nav-config.ts or the plugin registry.
export const Route = createFileRoute(
  "/_authenticated/_admin/forms/$formId/analytics/",
)({
  component: () => (
    <PluginGuard pluginId="forms">
      <FormAnalyticsPage />
    </PluginGuard>
  ),
});
```

- The route resolves `form.view_analytics` before render; a user lacking it gets the standard admin not-authorized surface, and the analytics nav entry is hidden by the same cap.
- `$formId` scopes the funnel query + the export to **one form** (mirrors Gravity Forms' per-form Results/Export). A cross-form roll-up, if ever wanted, is a v2 concern (§12).
- The **Export** button on this page invokes the `exportEntries` action, which is separately gated on `form.export_entries` (a viewer who can read the funnel but not export sees the page without an enabled export control).

---

## 4. Data Model

This system adds **exactly one** small table: a per-day, per-stage funnel counter. **Everything else is read** from the Submission System (`form_submissions`) and the Field Engine (`fieldValues`). There is **no new entries/values store** — export derives entirely from existing tables (inventing one would fork the engine extraction; the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`) §5).

### 4.1 `form_funnel_stats` (owned by this system)

A lightweight counter, bucketed by **UTC day** so the table stays tiny (at most `forms × days × 4 stages` rows) and so a date-range funnel is a bounded index scan rather than a scan over every submission/view. One row per `(formId, day, stage)`; `recordFunnel` and the event/sweep handlers **upsert-and-increment** it.

```typescript
// packages/backend/convex/extensions/forms/schema.ts
// Additive fragment — merged into the root schema by the v2 scanner.
// This system OWNS this table.

form_funnel_stats: defineTable({
  formId: v.id("forms"),
  // UTC day bucket, "YYYY-MM-DD". Day-granularity keeps the table tiny and the
  // range query bounded; finer granularity is an open question (§12).
  day: v.string(),
  stage: v.union(
    v.literal("viewed"),     // renderer mounted the form (public)
    v.literal("started"),    // first field interaction (public)
    v.literal("completed"),  // form.submitted with isComplete:true
    v.literal("abandoned"),  // a partial submission expired without completing
  ),
  count: v.number(),         // monotonically incremented per event in this bucket
  updatedAt: v.number(),
})
  // Primary read path: one form's funnel over a [from, to] day range.
  .index("by_form_day", ["formId", "day"])
  // Upsert lookup: find/create the exact (form, day, stage) counter row.
  .index("by_form_day_stage", ["formId", "day", "stage"]),
```

### 4.2 Export reads existing tables (no new store)

Export joins three things that already exist:

```
Export of one form's entries  =
   form.fieldDefinitions   (Field Engine; defines the COLUMN set + order)
      ×
   form_submissions rows   (Submission System; one ROW per entry, status-filtered)
      ⋈ on submissionId
   fieldValues rows        (Field Engine; the answer CELLS, entityType "form_submission")
                            decoded via parseFieldValue
```

- **Columns** come from the form's `fieldDefinitions` (the same set the renderer/builder use), in `menuOrder`, plus a stable set of **metadata columns** prepended (entry id, status, submitted/completed timestamps, source/referrer — never the funnel table).
- **Rows** come from the Submission System's `listSubmissions` (paginated), filtered to the requested `status` set (default: `complete` only; `spam`/`deleted` excluded unless explicitly requested).
- **Cells** come from `fieldValues` keyed `entityType: "form_submission"`, `entityId: <submissionId>`, decoded via `parseFieldValue` and CSV-encoded. Layout/no-value fields (`message`/`accordion`/`tab`/`page_break`) produce **no column** (mirrors the Field Engine §9 + Submission §10 rule).

There is deliberately **no `form_exports` table** in v1: exports are streamed in the action's response (or to a one-shot file blob), not persisted as records. Persisted/scheduled exports are an open question (§12).

---

## 5. Actions

The funnel writes are **system-driven** (renderer-triggered, event-triggered, sweep-triggered) and carry **no capability check** by design (a public view/start cannot require admin auth — §9). The only **user** action is export, which **is** capability-gated and audited.

### 5.1 Admin action (capability-gated)

| Action | Capability | Kind | Description | Roles (default grant) | Triggers Events |
|---|---|---|---|---|---|
| Export entries | `form.export_entries` | Action | Stream a form's entries to CSV (columns from the form definition, status-filtered) | Administrator, Editor | `form.entries_exported` |
| View analytics | `form.view_analytics` | Query (read) | Read the conversion funnel for a form | Administrator, Editor | — |

```typescript
// Capability map (resolved by the Role & Capability System; additive via the
// extension manifest, never hand-edited into a core registry):
const FORM_ANALYTICS_CAPS = {
  "form.view_analytics":  ["administrator", "editor"], // read the funnel
  "form.export_entries":  ["administrator", "editor"], // run the CSV export
} as const;
```

### 5.2 System funnel writes (NOT capability-gated)

| Write | Stage | Source | Auth |
|---|---|---|---|
| Record view | `viewed` | Public renderer `onMount` → `recordFunnel` | **Public / unauthenticated** |
| Record start | `started` | Public renderer first field interaction → `recordFunnel` | **Public / unauthenticated** |
| Record completion | `completed` | `form.submitted` event handler (`isComplete:true`) | System (event) |
| Record abandon | `abandoned` | Scheduled sweep of expired `partial` rows | System (cron) |

`recordFunnel` is **public-safe** for the `viewed`/`started` stages only — exactly like the public `submit` mutation, a logged-out visitor must be able to trigger it, so it carries **no `requireCan`**. It is *not* the wrong place for authorization (authorization would break the funnel); abuse is mitigated by the privacy-light, rate-sane rules in §9, not by a capability gate. The `completed`/`abandoned` writes are reached only via the event dispatcher / scheduler, never directly from a client.

---

## 6. Events

### 6.1 Events emitted

| Event | Code | Trigger | Payload |
|---|---|---|---|
| Entries Exported | `form.entries_exported` | An `exportEntries` action completes successfully | `{ formId, count, format, exportedBy }` |

`form.entries_exported` is scheduled with `ctx.scheduler.runAfter(0, ...)` **after** the file is produced — it is an **audit signal** (who exported how many entries, in what format), not a notification trigger. No notification handler is required to consume it (§7); an audit-log viewer may subscribe. `count` is the number of entry rows actually written (post-status-filter), and `format` is `"csv"` in v1.

### 6.2 Events consumed

| Event | Source System | Handler |
|---|---|---|
| `form.submitted` | Form Submission System | On `isComplete:true`, increment `form_funnel_stats` stage `completed` for `(formId, today)`. Partial writes (`isComplete:false`) are **ignored** here — they are counted as abandons only if they later expire (§7 / §8.4). |

This system consumes one event and otherwise pulls data directly via queries; it does not react to the inbox's `form.entry_updated` / `form.entry_deleted`.

---

## 7. Notifications

**None.** This system sends no email and no site notifications. Submission-time notifications (admin "new submission", respondent confirmation) are owned by the Form Notification System (`specs/ConvexPress/systems/form-notification-system/PRD.md`) and fire off the Submission System's `form.submitted` event. Recording a funnel view/start, computing drop-off, or exporting a CSV must **not** notify anyone or spam the admin inbox. The only outward signal this system produces is the `form.entries_exported` audit event in §6, which has no notification handler.

| Channel | Status |
|---|---|
| Email notifications | None — owned by the Form Notification System |
| Site notifications | None |

---

## 8. API Design

Three backend surfaces: `recordFunnel` (public-safe internal mutation; view/start increment), `getFunnel` (admin query; per-stage totals + drop-off), and `exportEntries` (capability-gated action → CSV). The completed/abandoned increments are shown as the event handler + the scheduled sweep.

### 8.1 `recordFunnel` — public-safe funnel increment

Called from the **unauthenticated** Website renderer for `viewed` / `started`. It is an `internalMutation` exposed to the public renderer through the renderer's own thin public wrapper (so the table stays write-only from outside and cannot be read by the public). It carries **no `requireCan`** — and it is **privacy-light**: it stores **no IP, no userAgent, no identity, no per-visitor row** — only a per-day, per-stage counter increment (§9).

```typescript
// packages/backend/convex/extensions/forms/analytics.ts
import { internalMutation, query } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";

// PUBLIC-SAFE for "viewed"/"started": no auth, no capability gate, no PII.
// Reached from the public renderer; abuse is bounded by §9 (dedup + clamp),
// NOT by authorization.
export const recordFunnel = internalMutation({
  args: {
    formId: v.id("forms"),
    stage: v.union(v.literal("viewed"), v.literal("started")), // public stages ONLY
    // Coarse, anonymous client-render token used ONLY for same-day dedup of the
    // started stage (see §9). NOT persisted as a row; not an identity.
    sessionNonce: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Guard: only published forms accrue funnel data (mirrors submit()).
    const form = await ctx.db.get(args.formId);
    if (!form || form.status !== "published") return; // silent no-op, never throw

    const day = utcDay(Date.now()); // "YYYY-MM-DD"
    await incrementStage(ctx, args.formId, day, args.stage); // upsert + count+1
  },
});

// Internal helper: find-or-create the (form, day, stage) counter and increment.
async function incrementStage(
  ctx: MutationCtx,
  formId: Id<"forms">,
  day: string,
  stage: "viewed" | "started" | "completed" | "abandoned",
) {
  const existing = await ctx.db
    .query("form_funnel_stats")
    .withIndex("by_form_day_stage", (q) =>
      q.eq("formId", formId).eq("day", day).eq("stage", stage))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      count: existing.count + 1,
      updatedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("form_funnel_stats", {
      formId, day, stage, count: 1, updatedAt: Date.now(),
    });
  }
}
```

### 8.2 `getFunnel` — the conversion funnel query

Admin read for the analytics route. Sums the per-day counters over a `[from, to]` range and computes the drop-off rates between stages. It is access-controlled by the route's `form.view_analytics` cap (the query asserts it).

```typescript
// packages/backend/convex/extensions/forms/analytics.ts
export const getFunnel = query({
  args: {
    formId: v.id("forms"),
    from: v.string(), // inclusive UTC day "YYYY-MM-DD"
    to: v.string(),   // inclusive UTC day
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.view_analytics"); // route-aligned read gate

    const rows = await ctx.db
      .query("form_funnel_stats")
      .withIndex("by_form_day", (q) =>
        q.eq("formId", args.formId).gte("day", args.from).lte("day", args.to))
      .collect();

    const totals = { viewed: 0, started: 0, completed: 0, abandoned: 0 };
    for (const r of rows) totals[r.stage] += r.count;

    // Drop-off rates. Guard divide-by-zero (a form with no views — §10).
    const pct = (num: number, den: number) => (den > 0 ? num / den : 0);
    return {
      totals,
      rates: {
        startRate:      pct(totals.started,   totals.viewed),    // viewed -> started
        completionRate: pct(totals.completed, totals.started),   // started -> completed
        overallRate:    pct(totals.completed, totals.viewed),    // viewed -> completed
        // Drop-off between viewed and completed; abandoned is reported alongside
        // (it is the subset of starts that wrote a partial that later expired).
        dropOff:        1 - pct(totals.completed, totals.viewed),
        abandoned:      totals.abandoned,
      },
      // Daily series for the chart (sparse days zero-filled client-side).
      byDay: groupByDay(rows),
    };
  },
});
```

### 8.3 `exportEntries` — CSV export (capability-gated, streamed)

An **action** (not a mutation) because it does large, paginated reads and assembles a file — the read fan-out over `fieldValues` is unbounded by entry count, so it must page rather than collect in one transaction. It opens with `requireCan(ctx, "form.export_entries")`, derives columns from the form definition, streams rows from `listSubmissions`, decodes each cell via `parseFieldValue`, and emits `form.entries_exported` on completion.

```typescript
// packages/backend/convex/extensions/forms/export.ts
import { action } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { v } from "convex/values";
import { parseFieldValue } from "@convexpress/field-engine";

export const exportEntries = action({
  args: {
    formId: v.id("forms"),
    // Status projection — reuses the inbox/Submission filter semantics.
    // Default: complete-only; spam/deleted excluded unless explicitly asked.
    statuses: v.optional(v.array(v.union(
      v.literal("complete"), v.literal("partial"),
      v.literal("spam"), v.literal("deleted"),
    ))),
    // Field projection — explicit subset/order of field NAMES; omit = all
    // non-layout fields in menuOrder (§9 "export respects field projection").
    fields: v.optional(v.array(v.string())),
    format: v.optional(v.literal("csv")), // v1: CSV only
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.export_entries"); // GATE — unlike recordFunnel

    // 1) Column set from the form definition (Field Engine), not from any row.
    const columns = await ctx.runQuery(
      internal.extensions.forms.export.resolveColumns,
      { formId: args.formId, fields: args.fields },
    ); // [{ name, label }] in menuOrder; layout/no-value fields excluded.

    // 2) Stable metadata columns prepended (never the funnel table).
    const header = ["entry_id", "status", "submitted_at", "completed_at", "source",
      ...columns.map((c) => c.label)];

    // 3) Stream rows page-by-page; never collect all entries into one txn.
    let cursor: string | null = null;
    let count = 0;
    const chunks: string[] = [csvRow(header)];
    do {
      const page = await ctx.runQuery(
        api.extensions.forms.submissions.listSubmissions,
        {
          formId: args.formId,
          // Default complete-only; honor explicit status projection.
          status: undefined, // multi-status handled server-side from args.statuses
          paginationOpts: { cursor, numItems: EXPORT_PAGE_SIZE }, // e.g. 500
        },
      );
      for (const row of filterByStatuses(page.page, args.statuses)) {
        // Per-entry answers from fieldValues (Field Engine), decoded.
        const entry = await ctx.runQuery(
          api.extensions.forms.submissions.getSubmission,
          { submissionId: row._id },
        );
        const byName = indexAnswers(entry.values, parseFieldValue); // name -> string
        chunks.push(csvRow([
          shortId(row._id), row.status,
          iso(row.submittedAt), iso(row.completedAt), row.source ?? "",
          ...columns.map((c) => csvCell(byName[c.name])), // union over time — §10
        ]));
        count++;
      }
      cursor = page.isDone ? null : page.continueCursor;
    } while (cursor);

    const csv = chunks.join("\n");

    // 4) Emit the audit event AFTER the file is assembled.
    await ctx.runMutation(internal.events.dispatchFromAction, {
      eventCode: "form.entries_exported",
      payload: {
        formId: args.formId,
        count,
        format: "csv",
        exportedBy: await resolveUserId(ctx),
      },
    });

    // Returned to the admin client for download (or stored as a one-shot blob —
    // persisted/scheduled delivery is an open question, §12).
    return { format: "csv" as const, count, filename: exportFilename(args.formId), csv };
  },
});
```

### 8.4 The `completed` + `abandoned` increments

`completed` is incremented by the **`form.submitted` event handler** (only on `isComplete:true`); `abandoned` is incremented by a **scheduled sweep** of partials past their TTL. Both reuse the same `incrementStage` helper as `recordFunnel`.

```typescript
// Event-driven completed increment (subscribes to form.submitted).
export const onFormSubmitted = internalMutation({
  args: { formId: v.id("forms"), isComplete: v.boolean(), submittedAt: v.number() },
  handler: async (ctx, args) => {
    if (!args.isComplete) return; // partials are NOT completions; see sweep below.
    await incrementStage(ctx, args.formId, utcDay(args.submittedAt), "completed");
  },
});

// Scheduled sweep: a partial that never completed and is older than the TTL is an
// abandon. Counted ONCE (mark the row so re-sweeps don't double count — §10).
export const sweepAbandoned = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ABANDON_TTL_MS; // e.g. 24h after last write
    const stale = await ctx.db
      .query("form_submissions")
      .withIndex("by_status", (q) => q.eq("status", "partial"))
      .filter((q) => q.lt(q.field("submittedAt"), cutoff))
      .take(SWEEP_BATCH); // bounded batch; cron re-runs until drained
    for (const row of stale) {
      if (row.meta?.abandonCounted) continue; // idempotent guard
      await incrementStage(ctx, row.formId, utcDay(row.submittedAt), "abandoned");
      await ctx.db.patch(row._id, { meta: { ...(row.meta ?? {}), abandonCounted: true } });
    }
    return { swept: stale.length };
  },
});
```

> The sweep **does not delete or re-status** the partial — it only counts it once (Entry Management owns the row's lifecycle; the partial stays visible in the inbox under the Partial tab). The `abandonCounted` marker lives in the Submission System's existing extensible `meta` bag, so this system adds no field to `form_submissions`.

---

## 9. Business Rules & Constraints

- **Funnel writes are public-safe + never capability-gated.** `recordFunnel` (`viewed`/`started`) runs without auth and without `requireCan`, exactly like the public `submit` mutation — a logged-out visitor must be able to trigger it. Authorization is the wrong layer; abuse is handled by the dedup/clamp rules below, not by a gate.
- **Tracking is privacy-light (no PII).** The funnel stores **only counters** — no IP, no userAgent, no identity, no per-visitor rows. `viewed`/`started` increment a `(formId, day, stage)` bucket and nothing else. This is the deliberate inverse of the Submission System, which *does* capture (server-derived) request metadata on an actual entry; the *funnel* never does. No consent banner is required for an anonymous, identity-free counter.
- **Tracking is rate-sane (coarse dedup + clamp).** `started` is deduped per coarse client `sessionNonce` per day so one visitor poking a field repeatedly counts as a single start; `viewed` may be deduped per page-load. A per-form, per-window write clamp caps how fast the public stages can be incremented (defense against trivial inflation), and the published-form guard means unpublished/deleted forms accrue nothing. `recordFunnel` **never throws** to the public — over-limit calls are silent no-ops.
- **Completed comes from the event, not the renderer.** The `completed` stage is incremented **only** from `form.submitted` with `isComplete:true` — a server-trusted signal — never from a client claim of success. This keeps completion honest even if the client lies about finishing.
- **Abandoned = a started-but-never-completed partial that expired.** An abandon corresponds to a real `partial` `form_submissions` row that passed its TTL without flipping to `complete` (the EZ-signup "captured at Review, abandoned before submit" case). It is counted **once** via the `meta.abandonCounted` idempotency marker; the sweep never double counts and never mutates the row's status.
- **Export respects field projection.** When `fields` is supplied, the CSV contains exactly those field columns, in that order; when omitted, all **non-layout** fields in `menuOrder`. Layout/no-value fields (`message`/`accordion`/`tab`/`page_break`) are **never** columns (Field Engine §9). Metadata columns (entry id/status/timestamps/source) are always prepended.
- **Export respects entry status (reuses inbox semantics).** Default export is **complete-only**; `spam` and `deleted` rows are excluded unless explicitly requested via `statuses`, matching the Entry Management filter semantics (the Form Entry Management System PRD (`specs/ConvexPress/systems/form-entry-management-system/PRD.md`)). This system does not invent its own status filter.
- **Large exports stream / paginate.** Export is an **action** that pages `listSubmissions` (bounded `numItems`) and reads `fieldValues` per entry, assembling the CSV incrementally — it never `collect()`s every entry into a single transaction. This is the reason export is not a mutation.
- **Export reads existing tables only.** Columns from `fieldDefinitions`, cells from `fieldValues` (decoded via `parseFieldValue`), rows from `form_submissions`. No `submission_values` and no `form_exports` table in v1 (the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`) §5).
- **Funnel table is day-bucketed + tiny.** At most `forms × days × 4` rows; the range query is a bounded index scan, not a scan over every view/submission. Finer-than-day granularity is deferred (§12).
- **Events after the work commits.** `form.entries_exported` is scheduled only after the file is assembled; the `completed`/`abandoned` increments happen inside their handler/sweep before any downstream signal. The counter row is the source of truth, not the event.
- **Additive-only (v2).** The `form_funnel_stats` table, the analytics route, and the `form.view_analytics` / `form.export_entries` caps are declared in the extension's schema/manifest fragments and merged by the scanner. This system never edits root `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts`. The abandon idempotency marker lives in the Submission System's existing `meta` bag — no field added to `form_submissions`.

---

## 10. Edge Cases

| Scenario | Handling |
|---|---|
| Form with **no submissions** | Funnel shows whatever views/starts were recorded with `completed:0`; `getFunnel` guards divide-by-zero (rates → 0, no `NaN`). Export writes a **header-only** CSV (`count:0`) and still emits `form.entries_exported` with `count:0`. |
| Form with **no views** but some completions (e.g. tracking added later) | `startRate`/`overallRate` denominators are 0 → rates report 0 rather than `NaN`/Infinity; `completed` total still shown. Funnel is honest about missing top-of-funnel data. |
| **Fields added/removed over time** → column set drift | Columns are the **union/current definition** from `fieldDefinitions`; an entry missing a (newer) field gets an **empty cell**, an entry that has a (since-removed) field's value is shown only if that field is still in the chosen column set. The header is stable for one export; older entries don't break it. |
| **Bot views inflating** the funnel | Public stages are deduped per coarse `sessionNonce`/page-load + clamped per window (§9); the published-form guard blocks unpublished forms. Bots that get through inflate only `viewed`/`started` — `completed` stays trustworthy (event-sourced). Deep bot detection is the Spam system's job, not the funnel's. |
| A **partial** completes after being swept as abandoned | Cannot double-count completion: `completed` is event-sourced from `form.submitted`. The earlier abandon stays counted (it *was* abandoned at sweep time). If a resume later completes, both an abandon and a completion exist — acceptable; documented as the resume case (§12 may net these). |
| Sweep runs **twice** over the same partial | `meta.abandonCounted` makes the abandon increment idempotent; the second pass skips it. |
| Export of a **huge** form (100k+ entries) | Action pages `listSubmissions` in bounded batches; CSV assembled incrementally. If a single response would exceed limits, the file is written to a one-shot blob and a download link returned (delivery mechanism is §12). |
| Export requested with `statuses:["deleted"]` | Honored (explicit opt-in); the export contains trashed entries. Default never includes them. |
| Export with a `fields` projection naming a **removed** field | That column is dropped (no matching `fieldDefinition`); a warning is included in the result rather than failing the whole export. |
| Layout field (`message`/`accordion`/`tab`/`page_break`) in the form | Produces no funnel effect and **no export column** (Field Engine §9 / Submission §10). |
| Form **deleted** while the analytics route is open | `getFunnel` returns whatever counters exist (rows aren't cascaded); the page surfaces an empty/last-known state rather than erroring. New `recordFunnel` calls no-op (published-form guard). |
| `recordFunnel` called for an **unpublished/draft** form | Silent no-op (guard); drafts accrue no funnel data, so preview/testing doesn't pollute conversion numbers. |
| Two admins **export simultaneously** | Independent actions; each reads consistently and emits its own `form.entries_exported`. No shared mutable state. |

---

## 11. UI Components

The analytics route reuses the admin shell's chart/stat primitives (Base UI + Tailwind v4); the funnel is a small set of stat cards + a stage chart, and export is a single gated button. Navigation is full-page; there are no modals for the primary flow (export shows inline progress/toast).

### 11.1 Component inventory

**Admin (Forms extension):**
- [ ] `FormAnalyticsPage` — the analytics route shell: date-range picker + funnel + export control.
- [ ] `FunnelSummaryCards` — four stat cards (Viewed / Started / Completed / Abandoned) with the between-stage rates from `getFunnel`.
- [ ] `FunnelChart` — the viewed → started → completed funnel (+ drop-off), with the daily series (zero-filled).
- [ ] `DropOffCallout` — highlights the largest drop-off stage (the EZ-signup "lost at Review" signal made visible).
- [ ] `DateRangePicker` — `[from, to]` UTC-day range driving `getFunnel`.
- [ ] `ExportButton` — gated on `form.export_entries`; opens `ExportOptions`, invokes the `exportEntries` action, triggers download.
- [ ] `ExportOptions` — status projection (default complete-only) + field projection (default all non-layout, in `menuOrder`).
- [ ] `EmptyAnalytics` — empty state for a form with no funnel data yet.

### 11.2 `FormAnalyticsPage` — funnel + export

```tsx
// apps/web/src/extensions/forms/components/FormAnalyticsPage.tsx
function FormAnalyticsPage() {
  const { formId } = Route.useParams();
  const [range, setRange] = useState(defaultRange()); // last 30 UTC days

  // getFunnel is owned by THIS system; access-gated on form.view_analytics.
  const funnel = useQuery(api.extensions.forms.analytics.getFunnel, {
    formId, from: range.from, to: range.to,
  });

  // exportEntries is an action (paginated read + file assembly).
  const exportEntries = useAction(api.extensions.forms.export.exportEntries);

  if (funnel === undefined) return <AnalyticsSkeleton />;
  if (funnel.totals.viewed === 0 && funnel.totals.completed === 0) {
    return <EmptyAnalytics formId={formId} />;
  }

  return (
    <DetailLayout
      title="Analytics"
      actions={
        <ExportButton
          // Hidden/disabled if the user lacks form.export_entries.
          onExport={async (opts) => {
            const res = await exportEntries({ formId, ...opts });
            downloadCsv(res.filename, res.csv); // count:0 still downloads a header
          }}
        />
      }
    >
      <DateRangePicker value={range} onChange={setRange} />
      <FunnelSummaryCards totals={funnel.totals} rates={funnel.rates} />
      <DropOffCallout rates={funnel.rates} />            {/* "biggest drop-off" */}
      <FunnelChart byDay={funnel.byDay} totals={funnel.totals} />
    </DetailLayout>
  );
}
```

### 11.3 Renderer instrumentation (lives in the Renderer system, shown for the contract)

```tsx
// The PUBLIC renderer (Form Renderer System) calls recordFunnel. Shown here only
// to document the contract; the call site is owned there, not by this system.
function PublicFormRenderer({ formId }: { formId: Id<"forms"> }) {
  const recordFunnel = usePublicMutation(api.extensions.forms.analytics.recordFunnelPublic);
  const nonce = useSessionNonce(); // coarse, anonymous, per-tab; NOT an identity

  useEffect(() => { recordFunnel({ formId, stage: "viewed" }); }, [formId]);
  const onFirstInteraction = useOnce(() =>
    recordFunnel({ formId, stage: "started", sessionNonce: nonce }));
  // ...fields call onFirstInteraction on first focus/change; completion is NOT
  // recorded here — it flows from submit() -> form.submitted -> the event handler.
}
```

---

## 12. Open Questions

- **Funnel granularity:** day buckets (current sketch) vs. hour buckets vs. a raw event log rolled up by a cron. Default: UTC-day counters for a tiny table + bounded queries; move to finer granularity only if hourly trends are needed. A raw per-view event log would enable cohorting but reintroduces a PII/volume concern the counter design deliberately avoids.
- **Abandon TTL + net-of-resume:** how long after the last partial write before it counts as abandoned (sketch: 24h), and whether a later resume-to-complete should *net out* the earlier abandon. Default: fixed TTL, **do not** net (an abandon that later recovered still happened). Reopen with the Multi-Step system, which owns resume.
- **`started` definition:** first field focus vs. first value change vs. reaching step 2 of a multi-step form. Default: first field interaction (focus or change), deduped per `sessionNonce`/day. The multi-step "reached Review" milestone (the EZ-signup capture point) may warrant its own intermediate stage later.
- **Export delivery + persistence:** inline response download (current sketch for modest sizes) vs. a one-shot file blob + link vs. a persisted `form_exports` record with history/re-download. Default: inline/one-shot, no history table in v1; add a record + retention if audited re-download or scheduled exports are required (overlaps with Entry Management's GDPR-purge open question).
- **Export format breadth:** CSV-only in v1. Excel (`.xlsx`) / JSON / Google-Sheets push are deferred; the `format` field + the `form.entries_exported` payload already leave room for the union to widen.
- **Bot-view suppression depth:** coarse dedup + clamp (current) vs. sharing the Spam system's bot signals to discount inflated `viewed`/`started`. Default: keep the funnel's own light dedup; consult the Spam system only if inflation becomes material. `completed` is event-sourced and unaffected either way.
- **Cross-form / aggregate view:** v1 is strictly per-form (per the route's `$formId`). A site-wide "all forms" conversion roll-up + a comparison table is a plausible v2; it would read the same `form_funnel_stats` table grouped without a `formId` filter.

---

## 13. Cross-References

- Depends on: Form Submission System (`specs/ConvexPress/systems/form-submission-system/PRD.md`) — source of completions (`form.submitted`), abandons (expired `partial` rows), and export rows (`form_submissions` + the `status` union).
- Depends on: Form Entry Management System (`specs/ConvexPress/systems/form-entry-management-system/PRD.md`) — export reuses its `listSubmissions` filters + status semantics (trash/spam honored).
- Reads answers/columns via: Form Field Engine (`specs/ConvexPress/systems/form-field-engine/PRD.md`) — `fieldDefinitions` for columns; `fieldValues` + `parseFieldValue` for cells.
- Funnel fed by: Form Renderer System (`specs/ConvexPress/systems/form-renderer-system/PRD.md`) — the public renderer calls `recordFunnel` for `viewed` / `started`.
- Abandon semantics tied to: Multi-Step & Save-Continue System (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`) — partial-on-abandon capture (the EZ-signup Review-step lead).
- Bot/spam signals owned by: Form Spam & Submission Security System (`specs/ConvexPress/systems/form-spam-security-system/PRD.md`) — the funnel does only coarse dedup.
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Analytics & Export System · **Plugin:** ConvexPress Forms (v2)
