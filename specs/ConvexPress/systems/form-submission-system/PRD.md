# PRD: Form Submission System

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). Sits directly on the Form Field Engine; owns the entry data model + the public submit path that every other Forms system reads from or writes through.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** The **persistence + ingestion core** of the Forms extension. It owns the `form_submissions` parent table and the single **public, unauthenticated** submit mutation that turns a filled-in form into a stored entry. Every other Forms system reads from this table (Entry Management, Analytics), writes through this mutation (Renderer, Multi-Step), or reacts to the event it emits (Notifications, Actions & Feeds). It is backend-heavy and surfaces no dedicated routes of its own.

**Code lives at:** `packages/backend/convex/extensions/forms/submissions.ts` (the public `submit` mutation + admin queries), with the table defined in the extension's additive schema fragment `packages/backend/convex/extensions/forms/schema.ts` (merged by the scanner — never hand-edited into root `schema.ts`).

**Consumes these ConvexPress systems:**

- **Form Field Engine** (`field-engine`) — the *server-trusted validator* `validateFieldValue(type, value, settings, required)` is run per field on the submit boundary, and the `fieldValues` model stores every answer with `entityType: "form_submission"`, `entityId: <submissionId>`. This system **builds no parallel values table** — it reuses the engine's, which is the entire point of the engine extraction.
- **Event Dispatcher** — the submit mutation schedules `form.submitted` after a successful write; all downstream notifications/feeds hang off that event, not off the mutation directly.
- **Form Spam & Submission Security System** — rate-limiting, honeypot, and CAPTCHA verification are **delegated** here; the submit mutation calls into the Spam system's guard before persisting and is never itself capability-gated.

**WooCommerce / WordPress analog:** Gravity Forms' entry object (`GFAPI::add_entry` + the `wp_gf_entry` / `wp_gf_entry_meta` split) and its `gform_after_submission` hook — a parent entry row plus per-field meta, with a single post-submit event fan-out.

---

## 1. Overview

### 1.1 Purpose

Own the **submission/entry data model** and the **public submit pipeline**: accept an anonymous, unauthenticated POST of field values from the Website, validate every field server-side through the Field Engine, persist a `form_submissions` parent row plus per-field `fieldValues` rows, distinguish a **partial** (save-and-continue / multi-step in progress) entry from a **complete** one, and schedule the `form.submitted` event so notifications and feeds fire. The mutation is the security boundary: nothing the client sends about validity, conditional visibility, or completeness is trusted.

### 1.2 Scope

**In scope:**
- The `form_submissions` parent table (status union, timestamps, request metadata, optional `userId`, optional `resumeToken`, source/referrer, aggregate meta).
- The **public, unauthenticated** `submit` mutation called from the Website's `/forms/$slug` route (owned by the Renderer).
- Server-trusted per-field validation via `validateFieldValue`, including correct handling of hidden-but-required fields (server recomputes visibility — never trusts the client).
- Persisting answers through the engine's `fieldValues` model (`entityType: "form_submission"`).
- The **partial vs complete** state transition and the `saveDraft` / partial write path used by Multi-Step.
- Scheduling the `form.submitted` event after a successful complete (and the partial-save signal for resumable drafts).
- Admin read queries `listSubmissions` / `getSubmission` (the data layer Entry Management's UI sits on).

**Out of scope:**
- The public form UI, field rendering, and the `/forms/$slug` route itself (the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`)).
- Field types, renderers, conditional-logic evaluation, and the validator implementation (the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)).
- The admin entry inbox UI: list/detail screens, filters, bulk actions, export (the Form Entry Management System PRD (`specs/ConvexPress/systems/form-entry-management-system/PRD.md`)).
- Spam scoring, rate-limit windows, honeypot/CAPTCHA verification (the Form Spam & Submission Security System PRD (`specs/ConvexPress/systems/form-spam-security-system/PRD.md`)).
- Email/site notifications + their templates (the Form Notification System PRD (`specs/ConvexPress/systems/form-notification-system/PRD.md`)).
- Multi-page navigation + resume-token issuance UX (the Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`)).
- Form definitions themselves (`forms` table + builder authoring) — owned by the Builder/Renderer; this system holds only `formId` as a reference.

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Form Field Engine (`field-engine`) | `validateFieldValue` for server-trusted per-field checks; `fieldValues` model for answer storage; conditional-logic evaluator for server-side visibility recompute. |
| Event Dispatcher | Schedules `form.submitted` for the notification/feed fan-out. |
| Form Spam & Submission Security System | Guards the public mutation (rate-limit + honeypot + CAPTCHA) before any write. |

### 2.2 Systems that depend on this

| System | Integration point |
|---|---|
| Form Renderer System | Calls the public `submit` mutation; renders confirmation from its result. |
| Multi-Step & Save-Continue System | Uses the partial write path + `resumeToken`; promotes a partial to complete on final step. |
| Form Entry Management System | Reads `listSubmissions` / `getSubmission`; mutates status (spam/deleted) on the rows this system owns. |
| Form Notification System | Subscribes to `form.submitted`; sends admin + respondent emails and the admin site notification. |
| Form Actions & Feeds System | Subscribes to `form.submitted`; runs outbound feeds (webhooks, CRM, etc.). |
| Form Analytics & Export System | Aggregates over `form_submissions` (by_form, by_status). |

### 2.3 Integration hooks

```typescript
// Event emitted by the Form Submission System
type FormSubmissionEvents = "form.submitted";

// Shape downstream systems receive (brace-shorthand throughout this PRD)
interface FormSubmittedPayload {
  formId: Id<"forms">;
  submissionId: Id<"form_submissions">;
  isComplete: boolean;          // false for a partial save-and-continue write
  submittedAt: number;
  values: Record<string, unknown>; // fieldName -> parsed value, for templating/feeds
}
```

---

## 3. Routes

**No dedicated routes.** This system is the submit *mutation* plus the entry data model; it renders nothing and registers no admin screens of its own.

- The mutation is invoked from the **public `/forms/$slug` route owned by the Form Renderer System** (`specs/ConvexPress/systems/form-renderer-system/PRD.md`) on the Website. That route is unauthenticated; the mutation it calls is unauthenticated.
- Admin viewing of the rows this system owns happens under the Forms admin tree at `apps/web/src/routes/_authenticated/_admin/forms/` via the **Form Entry Management System** (`specs/ConvexPress/systems/form-entry-management-system/PRD.md`), which consumes `listSubmissions` / `getSubmission` defined here.

This section is intentionally route-free to keep the system a pure data + ingestion layer (mirrors the Field Engine's deliberately empty routes section).

---

## 4. Data Model

### 4.1 `form_submissions` (owned by this system)

```typescript
// packages/backend/convex/extensions/forms/schema.ts
// Additive fragment — merged into the root schema by the v2 scanner.
// This system OWNS this table. Per-field answers do NOT live here; see §4.2.

form_submissions: defineTable({
  // Reference to the form definition (owned by Builder/Renderer)
  formId: v.id("forms"),

  // Lifecycle status
  status: v.union(
    v.literal("partial"),   // save-and-continue / multi-step in progress
    v.literal("complete"),  // fully submitted, all required fields satisfied
    v.literal("spam"),      // flagged by the Spam & Security system
    v.literal("deleted")    // soft-deleted (trash); never hard-deleted on submit
  ),

  // Timestamps
  submittedAt: v.number(),            // first write (partial or complete)
  completedAt: v.optional(v.number()), // set when status flips to "complete"

  // Request metadata (captured server-side; never trusted from the client body)
  ip: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  source: v.optional(v.string()),     // page URL the form was submitted from
  referrer: v.optional(v.string()),

  // Optional identity — public submits are anonymous; set only if a session exists
  userId: v.optional(v.id("users")),

  // Save-and-continue (issued/consumed by the Multi-Step system)
  resumeToken: v.optional(v.string()),
  currentStep: v.optional(v.number()), // for multi-step partials

  // Aggregate meta (denormalized for the entry inbox + analytics; no parallel values store)
  fieldCount: v.optional(v.number()),    // number of answered fields at last write
  paymentTotal: v.optional(v.number()),  // in cents; populated by the Commerce action, if any
  meta: v.optional(v.any()),             // extensible bag for downstream systems

  // Spam scoring is written by the Spam & Security system, not here
  spamScore: v.optional(v.number()),
})
  .index("by_form", ["formId"])
  .index("by_status", ["status"])
  .index("by_form_status", ["formId", "status"])
  .index("by_resumeToken", ["resumeToken"]),
```

### 4.2 Answers reuse the Field Engine's `fieldValues` (do NOT invent a parallel table)

Per-field answers are stored exclusively through the engine's existing `fieldValues` model — the same generic value table the Custom Field System and metaboxes use. There is **no `submission_values` table**; inventing one would fork the engine and break the extraction's whole rationale (see the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`) §5).

```typescript
// Provided by the Field Engine — referenced, NOT redefined here:
// fieldValues: {
//   entityType: string,   // <- "form_submission"
//   entityId: string,     // <- the form_submissions _id
//   fieldKey: string,
//   fieldName: string,
//   value: any,           // JSON, per-type encoded via encodeFieldValue
//   updatedBy, updatedAt
// }  indexed by_entity ["entityType", "entityId"]
```

So one submission = one `form_submissions` row + N `fieldValues` rows keyed `entityType: "form_submission"`, `entityId: <submissionId>`. Reading an entry = load the parent row, then query `fieldValues` by entity. This is symmetric with how a post's metabox values are stored, which is why Entry Management and the engine's existing readers compose for free.

### 4.3 Submission state machine

```
        submit({ ..., isComplete:false })        submit({ ..., isComplete:true })
                    │                                         │
                    ▼                                         ▼
            ┌───────────────┐   promote (final step)  ┌───────────────┐
            │    partial    │ ──────────────────────▶ │   complete    │
            └───────┬───────┘                         └───────┬───────┘
                    │                                         │
   Spam guard flags │                        Entry Mgmt marks │ (or Spam guard)
                    ▼                                         ▼
            ┌───────────────┐                         ┌───────────────┐
            │     spam      │                         │    deleted    │ (soft / trash)
            └───────────────┘                         └───────────────┘

Notes:
- "complete" schedules form.submitted with isComplete:true.
- "partial" schedules form.submitted with isComplete:false (notifications generally
  ignore partials; feeds may opt in).
- spam/deleted are terminal-ish admin states owned downstream; this system only
  defines the union + indexes and exposes the parent row.
```

---

## 5. Actions

### 5.1 Public action (NOT capability-gated)

| Action | Code | Description | Roles | Triggers Events |
|---|---|---|---|---|
| Submit form | `form.submit` | Validate + persist a form entry (partial or complete) | **All roles AND anonymous / guests** | `form.submitted` |

`form.submit` is **public**. It has **no `requireCan` / capability check** — anyone, signed-in or not, may submit a public form, exactly as a WordPress front-end form accepts anonymous input. Abuse control is **not** a capability concern; it is enforced by the **Form Spam & Submission Security System** (`specs/ConvexPress/systems/form-spam-security-system/PRD.md`) via rate-limit + honeypot + CAPTCHA invoked inside the mutation before any write. Authorization gating would be the wrong tool and would break public forms.

### 5.2 System / admin actions

| Action | Code | Description | Triggered By |
|---|---|---|---|
| Save draft | `form.save_draft` | Write/update a `partial` submission + issue/refresh `resumeToken` | Multi-Step (per-step) |
| Promote to complete | `form.complete` | Flip a `partial` → `complete`, set `completedAt`, emit `form.submitted` | Multi-Step (final step) |
| List submissions | `form.list_submissions` | Read entries for a form (paged, filtered) | Entry Management UI |
| Get submission | `form.get_submission` | Read one entry + its `fieldValues` | Entry Management UI |

(The status-mutating admin actions — flag spam, trash/restore — are owned by Entry Management + Spam; they operate on the table this system defines.)

---

## 6. Events

### 6.1 Events emitted

| Event | Code | Trigger | Payload |
|---|---|---|---|
| Form Submitted | `form.submitted` | A submission is persisted (partial write or completion) | `{ formId, submissionId, isComplete, submittedAt, values }` |

`values` is a `fieldName -> parsed value` map (decoded via the engine's `parseFieldValue`) so notification merge-tags and outbound feeds can template without re-reading `fieldValues`. The event is **always** scheduled via `ctx.scheduler.runAfter(0, ...)` **after** the DB writes commit — never inline, never before persistence.

### 6.2 Events consumed

None. This system is a producer; it does not subscribe to other systems' events. (Downstream consumers of `form.submitted` are listed in §2.2.)

---

## 7. Notifications

All three are triggered by the single `form.submitted` event and are **owned/implemented by the Form Notification System** (`specs/ConvexPress/systems/form-notification-system/PRD.md`). This system's only obligation is to emit the event with a complete payload; it sends nothing itself.

### 7.1 Email notifications

| Name | Trigger Event | Recipient | Priority |
|---|---|---|---|
| New Form Submission (Admin) | `form.submitted` | Admin | Immediate |
| Form Confirmation (Respondent) | `form.submitted` | Customer (respondent) | Immediate |

### 7.2 Site notifications

| Name | Trigger Event | Recipient | Type |
|---|---|---|---|
| New Form Submission | `form.submitted` | Admin | Info |

> Notification handlers generally act on `isComplete: true` and ignore partial writes; the respondent confirmation additionally requires a resolvable respondent email field. Those rules live in the Notification System, keyed off the event payload above.

---

## 8. API Design

### 8.1 Public mutation — `submit` (unauthenticated)

The security boundary. It is callable by guests, runs the spam guard, recomputes conditional visibility server-side, validates every field via the engine, writes the parent row + `fieldValues`, then schedules the event. It carries **no `requireCan`** — by design.

```typescript
// packages/backend/convex/extensions/forms/submissions.ts
import { mutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import {
  validateFieldValue,
  evaluateConditionalLogic,
  encodeFieldValue,
  parseFieldValue,
} from "@convexpress/field-engine"; // pure, server-importable

// PUBLIC: no auth, no capability gate. Abuse control is delegated to the
// Spam & Security system (called below), NOT to authorization.
export const submit = mutation({
  args: {
    formId: v.id("forms"),
    // fieldName -> raw client value. Treated as untrusted input.
    values: v.record(v.string(), v.any()),
    isComplete: v.optional(v.boolean()),  // false => partial / save-and-continue
    resumeToken: v.optional(v.string()),  // resume an existing partial
    // anti-spam envelope (verified by the Spam system, not trusted here):
    honeypot: v.optional(v.string()),
    captchaToken: v.optional(v.string()),
    // request context the client may supply but the server still re-derives:
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const isComplete = args.isComplete ?? true;

    // 1) Load the form definition + its field set (owned by Builder/Renderer).
    const form = await ctx.db.get(args.formId);
    if (!form || form.status !== "published") {
      throw new Error("Form not available");
    }
    const fields = await ctx.db
      .query("fieldDefinitions")
      .withIndex("by_group", (q) => q.eq("groupId", form.fieldGroupId))
      .collect();

    // 2) DELEGATE abuse control to the Spam & Security system. This is the
    //    ONLY gate on a public submit — rate-limit + honeypot + CAPTCHA.
    //    It throws (or returns a spam verdict) before anything is persisted.
    const guard = await ctx.runMutation(internal.extensions.forms.spam.guardSubmission, {
      formId: args.formId,
      honeypot: args.honeypot,
      captchaToken: args.captchaToken,
      ip: undefined, // derived inside the guard from request context
    });
    if (guard.block) throw new Error("Submission rejected");

    // 3) Server-trusted validation. NEVER trust client conditional visibility:
    //    recompute which fields are visible from the submitted values, then a
    //    hidden field is treated as not-required and its value dropped.
    const valueMap = args.values;
    const errors: Record<string, string> = {};
    const accepted: Array<{ field: typeof fields[number]; value: unknown }> = [];

    for (const field of fields) {
      // Layout/no-value fields (message/accordion/tab/page_break) store nothing.
      if (isLayoutField(field.type)) continue;

      const visible = evaluateConditionalLogic(field, valueMap); // pure, server-side
      if (!visible) {
        // Hidden-but-"required": correctly NOT required; ignore any smuggled value.
        continue;
      }

      const raw = valueMap[field.name];
      // For partial writes, only validate fields that were actually provided;
      // required-ness is enforced on completion, not on every draft save.
      const enforceRequired = isComplete && field.required;

      const result = validateFieldValue(field.type, raw, field.settings, enforceRequired);
      if (!result.valid) {
        errors[field.name] = result.error ?? "Invalid value";
        continue;
      }
      if (raw !== undefined) accepted.push({ field, value: raw });
    }

    if (Object.keys(errors).length > 0) {
      // Surfaced back to the Renderer for inline display.
      throw new ConvexError({ code: "VALIDATION", fields: errors });
    }

    const now = Date.now();

    // 4) Resume an existing partial, or create the parent row.
    let submissionId;
    if (args.resumeToken) {
      const existing = await ctx.db
        .query("form_submissions")
        .withIndex("by_resumeToken", (q) => q.eq("resumeToken", args.resumeToken))
        .first();
      if (!existing || existing.formId !== args.formId) {
        throw new Error("Invalid resume token");
      }
      submissionId = existing._id;
      await ctx.db.patch(submissionId, {
        status: isComplete ? "complete" : "partial",
        completedAt: isComplete ? now : existing.completedAt,
        fieldCount: accepted.length,
        spamScore: guard.score,
      });
    } else {
      submissionId = await ctx.db.insert("form_submissions", {
        formId: args.formId,
        status: isComplete ? "complete" : "partial",
        submittedAt: now,
        completedAt: isComplete ? now : undefined,
        ip: undefined,        // set from request context inside the mutation
        userAgent: undefined, // ""
        source: args.source,
        referrer: undefined,
        userId: (await ctx.auth.getUserIdentity()) ? await resolveUserId(ctx) : undefined,
        resumeToken: isComplete ? undefined : generateResumeToken(),
        fieldCount: accepted.length,
        spamScore: guard.score,
      });
    }

    // 5) Persist answers via the engine's fieldValues model — NOT a parallel table.
    for (const { field, value } of accepted) {
      await upsertFieldValue(ctx, {
        entityType: "form_submission",
        entityId: submissionId,
        fieldKey: field.key,
        fieldName: field.name,
        value: encodeFieldValue(field.type, value),
        updatedAt: now,
      });
    }

    // 6) Emit the event AFTER the writes commit (scheduler, not inline).
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "form.submitted",
      payload: {
        formId: args.formId,
        submissionId,
        isComplete,
        submittedAt: now,
        values: buildValuesMap(accepted, parseFieldValue), // fieldName -> parsed
      },
    });

    return {
      submissionId,
      isComplete,
      resumeToken: isComplete ? undefined : /* re-read */ undefined,
    };
  },
});
```

### 8.2 The partial / save-draft path (note)

`saveDraft` is **not a separate mutation** — it is `submit` with `isComplete: false`. That keeps one validated ingestion path and avoids drift between draft and final writes. The behavioral deltas, all handled by the branches above:

- Required fields are **not** enforced on a partial write (`enforceRequired = isComplete && field.required`); they are enforced only on the completing call.
- A partial write issues a `resumeToken` (or reuses the one passed in) and may store `currentStep`; the Multi-Step system (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`) owns when to call with `isComplete: false` vs `true`.
- `form.submitted` still fires for partials with `isComplete: false`; notifications ignore those, feeds may opt in.

### 8.3 Admin queries

```typescript
// Read layer the Entry Management UI sits on. These ARE access-controlled
// (admin context), unlike the public submit. Capability checks live in the
// Entry Management system; signatures shown here for the data contract.

export const listSubmissions = query({
  args: {
    formId: v.id("forms"),
    status: v.optional(v.union(
      v.literal("partial"), v.literal("complete"),
      v.literal("spam"), v.literal("deleted"),
    )),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const q = args.status
      ? ctx.db.query("form_submissions")
          .withIndex("by_form_status", (i) =>
            i.eq("formId", args.formId).eq("status", args.status!))
      : ctx.db.query("form_submissions")
          .withIndex("by_form", (i) => i.eq("formId", args.formId));
    // Newest first; entry-row only (values loaded lazily in getSubmission).
    return await q.order("desc").paginate(args.paginationOpts);
  },
});

export const getSubmission = query({
  args: { submissionId: v.id("form_submissions") },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) return null;
    // Answers come from the engine's fieldValues — one query by entity.
    const values = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity", (i) =>
        i.eq("entityType", "form_submission").eq("entityId", args.submissionId))
      .collect();
    return { ...submission, values };
  },
});
```

---

## 9. Business Rules & Constraints

- **Public, never capability-gated.** `submit` runs without auth and without `requireCan`. A logged-out visitor must be able to submit. Authorization is the wrong layer for spam; do not add a capability check to "lock down" the endpoint.
- **Server-trusted validation, always.** Client-side validation is UX only. The mutation re-runs `validateFieldValue` for every visible field. The stored entry reflects what the server accepted, not what the client claimed.
- **Never trust client conditional visibility.** Visibility is **recomputed server-side** via `evaluateConditionalLogic` from the submitted values. A field the client marked hidden but sent a value for has its value dropped; a field the client hid that the server computes as *visible and required* still fails validation. A field the server computes as hidden is treated as not-required (mirrors the Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`) §8 rule).
- **Required only at completion.** Partial writes (`isComplete: false`) validate the *shape* of provided fields but do not enforce required-ness; required is enforced when the entry is completed.
- **Answers reuse `fieldValues`.** No parallel values table. One submission = one parent row + N `fieldValues` rows (`entityType: "form_submission"`).
- **Spam / rate-limit is delegated.** The mutation calls the Spam & Security guard (`specs/ConvexPress/systems/form-spam-security-system/PRD.md`) before persisting; rate-limit windows, honeypot, and CAPTCHA verification all live there. This system stores the resulting `spamScore` / `status: "spam"` but does not compute them.
- **Event after commit.** `form.submitted` is scheduled with `runAfter(0, ...)` only after the parent + value writes succeed — never inline, never on a path that might roll back.
- **Request metadata is server-derived.** `ip` / `userAgent` / `referrer` are captured server-side, not trusted from the client body, so they cannot be spoofed in the payload.
- **Soft-delete only.** Submissions are never hard-deleted by the submit path; the `deleted` status is a trash state owned by Entry Management.
- **Additive-only (v2).** The `form_submissions` table is declared in the extension's schema fragment and merged by the scanner; this system never edits root `schema.ts`, `registry.ts`, or `nav-config.ts`.

---

## 10. Edge Cases

| Scenario | Handling |
|---|---|
| Guest (no auth) submits | Accepted; `userId` left undefined. This is the default path. |
| Client hides a required field, omits its value | Server recomputes visibility; if computed hidden → not required (ok). If computed visible → validation fails. |
| Client hides a field but smuggles a value | Server computes hidden → value ignored / not stored. |
| Required field missing on a **partial** save | Allowed; required enforced only at completion. |
| Required field missing on a **complete** submit | `ConvexError({ code:"VALIDATION", fields })`; nothing persisted. |
| Resume token invalid / for a different form | Reject; do not silently start a new submission. |
| Duplicate / double-click submit | Idempotency keyed on `resumeToken` for partials; complete-without-token inserts a new row (dedup heuristics owned by Spam). |
| Form unpublished/deleted mid-fill | `submit` rejects (`form.status !== "published"`). |
| Spam guard blocks | Throw before any write; no `form_submissions` row, no event. |
| Layout field (message/accordion/tab/page_break) in payload | Skipped by validator + serializer; stores no value (Field Engine §9). |
| Oversized file/relational value | File/relational rules enforced by the engine's per-type validator; oversize rejected as a field error. |
| Event dispatch fails after a successful write | Entry persists; dispatch retried by the scheduler. The write is the source of truth, not the event. |

---

## 11. Implementation Checklist

**Phase 1 — data model**
- [ ] Add `form_submissions` to the Forms extension schema fragment with the status union + `by_form`, `by_status`, `by_form_status`, `by_resumeToken` indexes.
- [ ] Confirm the engine's `fieldValues` `by_entity` index covers `entityType: "form_submission"` reads (no new table).

**Phase 2 — public submit**
- [ ] Implement the unauthenticated `submit` mutation (no `requireCan`).
- [ ] Wire the Spam & Security guard call before persistence.
- [ ] Recompute conditional visibility server-side via `evaluateConditionalLogic`.
- [ ] Run `validateFieldValue` per visible field; aggregate field errors into a `ConvexError`.
- [ ] Persist parent row + `fieldValues` via `encodeFieldValue`.
- [ ] Schedule `form.submitted` (with `parseFieldValue`'d `values`) after commit.

**Phase 3 — partial / save-and-continue**
- [ ] Branch `submit` on `isComplete`; relax required-ness for partials.
- [ ] Issue/consume `resumeToken`; persist `currentStep`.
- [ ] Implement the `partial → complete` promotion (set `completedAt`, emit event).

**Phase 4 — admin read layer**
- [ ] Implement `listSubmissions` (paged, status-filtered) and `getSubmission` (parent + `fieldValues`).
- [ ] Verify Entry Management consumes them without a parallel values store.

---

## 12. Open Questions

- **Resume-token model:** opaque random token (current sketch) vs. signed/expiring token. Default: opaque + TTL; revisit with the Multi-Step system, which owns issuance UX.
- **Partial event noise:** should partials emit `form.submitted` at all, or a distinct `form.partial_saved`? Current decision: one event with `isComplete:false` to keep the contract single; downstream filters on the flag. Reopen if feeds need finer signals.
- **`values` payload size:** large file/relational answers bloat the event payload. Default: send scalar/answer summaries in `values`, let feeds re-read `fieldValues` for heavy fields. Confirm with Actions & Feeds.
- **Idempotency for token-less completes:** beyond the Spam system's dedup, do we want an optional client idempotency key on completing submits? Parked pending abuse data.

---

## 13. Cross-References

- Depends on: Form Field Engine (`specs/ConvexPress/systems/form-field-engine/PRD.md`)
- Submit invoked from: Form Renderer System (`specs/ConvexPress/systems/form-renderer-system/PRD.md`)
- Read by: Form Entry Management System (`specs/ConvexPress/systems/form-entry-management-system/PRD.md`)
- Abuse control delegated to: Form Spam & Submission Security System (`specs/ConvexPress/systems/form-spam-security-system/PRD.md`)
- Event consumed by: Form Notification System (`specs/ConvexPress/systems/form-notification-system/PRD.md`)
- Partial path driven by: Multi-Step & Save-Continue System (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`)
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Submission System · **Plugin:** ConvexPress Forms (v2)
