# PRD: Form Notification System

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). Sits on top of the Form Submission System; turns the events that system emits into admin + respondent emails and admin site notifications via the existing ConvexPress notification stack.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** A **per-form notification configuration layer + event→delivery glue**. It does **not** reinvent delivery. It owns one new table (`form_notifications`) that lets an admin declare, per form, *which* messages fire on *which* Forms event, to *whom*, with *what* template — and a single internal dispatch handler that, when a Forms event arrives, resolves those config rows, expands their templates with merge tags, and hands the finished message to the **existing ConvexPress Email Notification System** (Resend) and **Site Notification System**. Forms-specific config maps onto generic delivery; the wheel is reused, not rebuilt.

**Code lives at:** `packages/backend/convex/extensions/forms/notifications.ts` (config CRUD mutations/queries + the internal `dispatch` handler subscribed to the Forms events), with the `form_notifications` table defined in the extension's additive schema fragment `packages/backend/convex/extensions/forms/schema.ts` (merged by the v2 scanner — never hand-edited into root `schema.ts`). The admin UI lives at `apps/web/src/routes/_authenticated/_admin/forms/$formId/notifications.tsx`.

**Consumes these ConvexPress systems:**

- **Form Submission System** (`form_submissions`) — the upstream producer. This system **owns no events**; it subscribes to the events that system (and Multi-Step / Actions) emit: `form.submitted`, `form.progress_saved`, `form.action_failed`. The event payload's `values` map (`fieldName -> parsed value`) is the templating + recipient-resolution source. See the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`).
- **Email Notification System** (Resend provider) — the actual email sender. This system builds the resolved `{ to, subject, html }` and calls into it; it never touches Resend directly. See the Email Notification System PRD (`specs/ConvexPress/systems/email-notification-system/PRD.md`).
- **Site Notification System** — the in-app admin notification store/bell. This system creates the admin-facing site notification records through it. See the Site Notification System PRD (`specs/ConvexPress/systems/site-notification-system/PRD.md`).
- **Form Merge Tags & Prefill System** — the templating engine. Subject/message templates are expanded with merge tags (`{field:email}`, `{form:title}`, `{all_fields}`, …) by **delegating** to its resolver against the event payload; this system defines no token grammar of its own. See the Form Merge Tags & Prefill System PRD (`specs/ConvexPress/systems/form-merge-tags-prefill-system/PRD.md`).
- **Event Dispatcher** — the subscription substrate. The internal `dispatch` handler is registered as a consumer of the three Forms event codes; it is invoked by the dispatcher, never called inline from the submit path.
- **Form Field Engine** — indirectly: the designated respondent-email field is a field of type `email` in the form's field set; the engine's `fieldValues` are the source the event `values` map is decoded from.

**WooCommerce / WordPress analog:** Gravity Forms' **Notifications** tab (`gform_notification` + the per-form notification objects: event = "form is submitted", To = admin email or `{admin_email}` or a field merge tag, conditional logic gate, merge-tag subject/message) layered on top of `wp_mail`. We replace `wp_mail` with the ConvexPress Email System (Resend) and add a parallel in-app site notification.

---

## 1. Overview

### 1.1 Purpose

Let a site builder configure, **per form**, the notifications that fire when that form is submitted (or a draft is saved, or a feed/action fails) — without writing code and without re-implementing email/site delivery. Concretely: define `form_notifications` rows that each bind a **trigger event** → a **channel** (`email` | `site`) → a **recipient** (admin or respondent) → a **merge-tag subject/message template**, optionally gated by **conditional logic**; then run one internal **dispatch handler** that, on each subscribed Forms event, selects the enabled+matching rows, resolves recipients and templates, and emits through the existing Email and Site notification systems. The default install ships sensible rows (admin "new submission", respondent confirmation) so a freshly built form notifies correctly out of the box.

### 1.2 Scope

**In scope:**
- The `form_notifications` table: per-form notification instances (channel, recipientType, `toExpression`, subject/message templates, `triggerEventCode`, `conditionalLogic`, `enabled`, `order`).
- Config CRUD: create / update / reorder / enable-disable / delete notification rows, **capability-gated** (`form.manage_notifications`) under `_admin/Admin` auth.
- The admin route `/admin/forms/$formId/notifications` (list + editor) wrapped in `PluginGuard`.
- One internal **dispatch handler** subscribed (via the Event Dispatcher) to `form.submitted`, `form.progress_saved`, and `form.action_failed`.
- **Recipient resolution**: respondent email pulled from a designated email field via a `{field:…}` `toExpression`; admin recipients from site/form settings.
- **Template resolution**: delegate subject/message expansion to the Merge Tags system against the event payload.
- **Conditional firing**: reuse the Field Engine's conditional-logic shape to decide *whether each row fires* for a given submission.
- The default seeded notification rows for a new form (admin new-submission email + site notification; respondent confirmation email).
- Mapping each fired row onto the **existing** Email Notification System (Resend) or Site Notification System call.

**Out of scope:**
- Email transport, templating-of-the-shell, deliverability, Resend keys/retries (the Email Notification System PRD (`specs/ConvexPress/systems/email-notification-system/PRD.md`)).
- The in-app notification store, bell UI, read/unread state (the Site Notification System PRD (`specs/ConvexPress/systems/site-notification-system/PRD.md`)).
- The merge-tag token grammar, the prefill side, and the tag resolver implementation (the Form Merge Tags & Prefill System PRD (`specs/ConvexPress/systems/form-merge-tags-prefill-system/PRD.md`)).
- Emitting `form.submitted` / `form.progress_saved` — those are produced by Submission and Multi-Step; this system only consumes (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) and the Multi-Step & Save-Continue System PRD (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`)).
- Outbound webhooks / CRM / Slack / Zapier feeds and emitting `form.action_failed` (the Form Actions & Feeds System PRD (`specs/ConvexPress/systems/form-actions-feeds-system/PRD.md`)). This system *consumes* `form.action_failed` to notify the admin, but does not own feed execution.
- The post-submit confirmation message/redirect shown in the browser (the Form Confirmation System PRD (`specs/ConvexPress/systems/form-confirmation-system/PRD.md`)).
- Field types, the conditional-logic evaluator implementation, and the value model (the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)).

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Form Submission System (`form_submissions`) | Emits `form.submitted` (and the partial-save signal); supplies the event `values` payload used for recipient + template resolution. The root upstream producer. |
| Event Dispatcher | The subscription substrate; invokes the internal `dispatch` handler for each subscribed Forms event code. |
| Email Notification System (Resend) | The actual email sender this system hands resolved `{ to, subject, html }` to. Not reinvented here. |
| Site Notification System | The in-app admin notification store this system writes to for site-channel rows. |
| Form Merge Tags & Prefill System | Resolves `{field:…}` / `{form:…}` / `{all_fields}` tokens in `toExpression` + subject/message templates against the event payload. |
| Form Field Engine | Provides the conditional-logic shape reused by `conditionalLogic`, and the `email`-typed field that backs respondent resolution. |
| Role & Capability System | Defines `form.manage_notifications`; `requireCan` gates config mutations. |

### 2.2 Systems that depend on this

| System | Integration point |
|---|---|
| Form Submission System | Indirect: emits `form.submitted`; this system is its primary consumer for notifications. |
| Multi-Step & Save-Continue System | Emits `form.progress_saved`; this system sends the "Resume Your Form" respondent email off it. |
| Form Actions & Feeds System | Emits `form.action_failed`; this system sends the admin failure email + site notification off it. |
| Form Builder System | Surfaces a "Notifications" tab linking to `/admin/forms/$formId/notifications`; seeds default rows when a form is created. |

### 2.3 Integration hooks

```typescript
// This system OWNS NO events. It is a pure consumer. The payloads it relies on
// are produced upstream (brace-shorthand throughout this PRD):

// from the Form Submission System:
interface FormSubmittedPayload {
  formId: Id<"forms">;
  submissionId: Id<"form_submissions">;
  isComplete: boolean;               // notifications generally fire only when true
  submittedAt: number;
  values: Record<string, unknown>;   // fieldName -> parsed value (templating + recipient source)
}

// from the Multi-Step & Save-Continue System (save-and-continue draft written):
interface FormProgressSavedPayload {
  formId: Id<"forms">;
  submissionId: Id<"form_submissions">;
  resumeToken: string;               // backs the {form:resume_url} merge tag
  currentStep?: number;
  values: Record<string, unknown>;
}

// from the Form Actions & Feeds System (an outbound feed failed):
interface FormActionFailedPayload {
  formId: Id<"forms">;
  submissionId: Id<"form_submissions">;
  actionId: string;                  // which feed/action failed
  actionType: string;                // "webhook" | "crm" | ...
  error: string;                     // human-readable failure reason
  attemptedAt: number;
}

// What this system hands DOWNSTREAM (it consumes the systems, not events):
//   Email: ctx.runAction(internal.emailNotifications.send, { to, subject, html, ... })
//   Site:  ctx.runMutation(internal.siteNotifications.create, { recipientUserId|role, type, title, body, link })
```

---

## 3. Routes

### 3.1 Admin route (Admin app)

| Route | Path | Layout | Auth | Roles | Guard |
|---|---|---|---|---|---|
| Form Notifications | `/admin/forms/$formId/notifications` | `_admin` / `Admin` (Convex Auth) | Yes | Administrator, Editor | `PluginGuard` (Forms extension enabled) → then `form.manage_notifications` |

- File: `apps/web/src/routes/_authenticated/_admin/forms/$formId/notifications.tsx`.
- The route is wrapped in **`PluginGuard`** so it 404s/redirects cleanly when the Forms extension is disabled, exactly like every other Forms admin route (additive-only; the route tree is scanner-merged, not hand-wired into `nav-config.ts`).
- The page lists the form's `form_notifications` rows (drag-to-reorder, enable toggle) and opens an editor drawer per row (channel, recipient, To expression, subject/message template with a merge-tag picker, conditional-logic builder, trigger event).
- **No public/Website route.** Notifications are server-side reactions to events; the Website never calls this system. (Mirrors the deliberately backend-heavy posture of the Submission System.)

---

## 4. Actions

### 4.1 Admin actions (capability-gated)

| Action | Code | Description | Roles | `requireCan` |
|---|---|---|---|---|
| Configure notifications | `form.manage_notifications` | Create / update / reorder / enable / delete `form_notifications` rows for a form | Administrator, Editor | **Yes** — every config mutation calls `requireCan(ctx, "form.manage_notifications")` |

Per the Forms action map, `form.manage_notifications` is the **single** capability this system owns; the editor labels it "Configure". All four config mutations in §8.2 (`create`, `update`, `reorder`, `remove`) are gated by it. There is **no public action** here — unlike the Submission System's public `submit`, this system exposes nothing to guests; its only runtime entry point besides admin CRUD is the **internal** dispatch handler invoked by the Event Dispatcher (not a user action, not capability-gated, runs in system context).

### 4.2 System action (internal, not capability-gated)

| Action | Code | Description | Triggered By |
|---|---|---|---|
| Dispatch notifications | *(internal)* `form.dispatch_notifications` | For an inbound Forms event, select matching enabled rows, resolve recipients + templates, emit via Email/Site systems | Event Dispatcher (on `form.submitted` / `form.progress_saved` / `form.action_failed`) |

This is an `internalMutation`/`internalAction` — never exposed to clients, never `requireCan`'d (it runs in trusted system context off the dispatcher, the same pattern as the Submission System scheduling its event after commit).

---

## 5. Events

### 5.1 Events emitted

**None.** This system owns no events. It is a pure consumer. (This mirrors the Field Engine's deliberately empty events posture, but for the opposite reason: the engine is too low-level to emit; this system is a terminal sink — it reacts and sends, producing no new domain events.)

### 5.2 Events consumed

| Event | Code | Source System | Handler behavior |
|---|---|---|---|
| Form Submitted | `form.submitted` | Form Submission System | Fire all enabled rows whose `triggerEventCode = "form.submitted"` **and** whose conditional logic matches **and** (for most rows) `isComplete === true`. Drives the admin "New Form Submission" email + site notification and the respondent "Form Confirmation" email. |
| Form Progress Saved | `form.progress_saved` | Multi-Step & Save-Continue System | Fire enabled rows with `triggerEventCode = "form.progress_saved"`. Drives the respondent "Resume Your Form" email (uses `{form:resume_url}` built from `resumeToken`). |
| Form Action Failed | `form.action_failed` | Form Actions & Feeds System | Fire enabled rows with `triggerEventCode = "form.action_failed"`. Drives the admin "Form Action Failed" email + site notification (operational alert). |

> Note on event naming: the Submission System PRD currently models partial saves as `form.submitted` with `isComplete:false` and flags `form.progress_saved` vs `form.partial_saved` as an open question (that PRD §12). This PRD subscribes to the **`form.progress_saved`** code per the Forms event map; whichever code that open question resolves to, the dispatch handler binds to it via the `triggerEventCode` column — config is data, so a code rename is a data migration, not a code change. See §11 Open Questions.

---

## 6. Notifications

This system **owns the configuration for** the following notifications. Each row below is a *seeded default* `form_notifications` instance created for a new form; an admin can edit, disable, duplicate, or add more on the `/admin/forms/$formId/notifications` screen. Delivery is performed by the Email / Site Notification systems — this system only resolves and dispatches.

### 6.1 Email notifications (channel `email`)

| Name | Recipient (`recipientType`) | Trigger Event | Priority | `toExpression` (default) |
|---|---|---|---|---|
| New Form Submission (Admin) | Admin | `form.submitted` | Immediate | `{settings:admin_notification_email}` (falls back to site admin email) |
| Form Confirmation (Respondent) | Customer | `form.submitted` | Immediate | `{field:email}` — the form's **designated respondent-email field** |
| Resume Your Form (Respondent) | Customer | `form.progress_saved` | Immediate | `{field:email}` |
| Form Action Failed (Admin) | Admin | `form.action_failed` | Immediate | `{settings:admin_notification_email}` |

### 6.2 Site notifications (channel `site`, in-app admin bell)

| Name | Recipient (`recipientType`) | Trigger Event | Type |
|---|---|---|---|
| New Form Submission | Admin | `form.submitted` | Info |
| Form Action Failed | Admin | `form.action_failed` | Error |

> **Firing rules (encoded as data on each row, enforced by the dispatch handler):**
> - Submission-triggered rows fire only when `isComplete === true` (partial saves don't notify the admin of a "submission"); the **Resume Your Form** row is the deliberate exception — it's bound to `form.progress_saved`, not `form.submitted`.
> - Any **respondent** (`Customer`) row requires a *resolvable* recipient: the `{field:email}` `toExpression` must yield a non-empty, valid email from the submission's values, or the row is skipped (logged, not errored — see §10).
> - Every row additionally passes through its `conditionalLogic` gate (§7) before firing.
> - These six are *defaults*; the **Site Notification** records they map onto are owned by the Site Notification System, and the **Email** records by the Email Notification System — this table is the Forms-side binding, not a parallel notification store.

---

## 7. Conditional Routing

A notification row may carry **conditional logic** that decides *whether it fires* for a given submission — the per-form equivalent of Gravity Forms' "Send this notification if…". We **reuse the Form Field Engine's conditional-logic shape and evaluator wholesale** rather than inventing a second rules language; the same JSON an admin authors to show/hide a field is what gates a notification.

### 7.1 Shape (reused, not redefined)

```typescript
// Identical to the engine's ConditionalLogicData (the Form Field Engine PRD,
// specs/ConvexPress/systems/form-field-engine/PRD.md §6). Stored on the row.
interface NotificationConditionalLogic {
  enabled: boolean;
  action: "fire" | "skip";          // analog of the engine's "show" | "hide"
  match: "and" | "or";
  rules: Array<{
    fieldName: string;              // a field in this form
    operator: "is" | "isNot" | "contains" | "isEmpty" | "isNotEmpty"
            | "greaterThan" | "lessThan";
    value?: unknown;
  }>;
}
```

### 7.2 Evaluation

- The dispatch handler builds the same `valueMap` (`fieldName -> parsed value`) the engine expects — it already *is* the event payload's `values`.
- It calls the engine's pure `evaluateConditionalLogic(rules, valueMap)` (same function the renderer + the submit boundary use), so behavior is identical to field visibility — no drift, no second implementation.
- If `conditionalLogic.enabled` is false (the default), the row always fires (subject to the §6 firing rules). If enabled, the boolean result of `evaluateConditionalLogic` decides `fire` vs `skip`.
- **Examples:** "email the sales team only if `{field:budget} greaterThan 10000`"; "send the partner CC only if `{field:inquiry_type} is 'partnership'`"; "skip the respondent confirmation if `{field:marketing_optin} isNot true`".

This is the whole reason the engine extracted its evaluator as a pure function: routing reuses it for free, exactly as the submit boundary recomputes visibility server-side.

---

## 8. API Design

### 8.1 Data contract recap

A `form_notifications` row is *config*, not a sent message. At runtime the dispatch handler (§8.3) turns a matching row + an event payload into a call to the Email or Site system. Two layers, cleanly split: **author config** (capability-gated CRUD) and **resolve+send** (internal, off the dispatcher).

### 8.2 Config CRUD mutations/queries (capability-gated)

```typescript
// packages/backend/convex/extensions/forms/notifications.ts
import { mutation, query, internalMutation, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { requireCan } from "../../lib/rbac";          // Role & Capability System
import { evaluateConditionalLogic } from "@convexpress/field-engine"; // pure, reused
// merge-tag resolver delegated to the Merge Tags system:
import { resolveMergeTags } from "../../extensions/forms/mergeTags";

const conditionalLogicValidator = v.optional(
  v.object({
    enabled: v.boolean(),
    action: v.union(v.literal("fire"), v.literal("skip")),
    match: v.union(v.literal("and"), v.literal("or")),
    rules: v.array(
      v.object({
        fieldName: v.string(),
        operator: v.string(),
        value: v.optional(v.any()),
      }),
    ),
  }),
);

// LIST — read config for the editor screen
export const listForForm = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_notifications");
    return await ctx.db
      .query("form_notifications")
      .withIndex("by_form", (q) => q.eq("formId", args.formId))
      .collect()
      .then((rows) => rows.sort((a, b) => a.order - b.order));
  },
});

// CREATE
export const create = mutation({
  args: {
    formId: v.id("forms"),
    name: v.string(),
    channel: v.union(v.literal("email"), v.literal("site")),
    recipientType: v.union(v.literal("admin"), v.literal("customer")),
    toExpression: v.string(),          // merge-tag expr, e.g. "{field:email}"
    subjectTemplate: v.optional(v.string()), // email only
    messageTemplate: v.string(),       // merge-tag body
    triggerEventCode: v.union(
      v.literal("form.submitted"),
      v.literal("form.progress_saved"),
      v.literal("form.action_failed"),
    ),
    conditionalLogic: conditionalLogicValidator,
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_notifications");      // gated
    const siblings = await ctx.db
      .query("form_notifications")
      .withIndex("by_form", (q) => q.eq("formId", args.formId))
      .collect();
    return await ctx.db.insert("form_notifications", {
      ...args,
      enabled: args.enabled ?? true,
      order: siblings.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// UPDATE (partial patch of any config field, incl. enable/disable)
export const update = mutation({
  args: {
    notificationId: v.id("form_notifications"),
    patch: v.object({
      name: v.optional(v.string()),
      channel: v.optional(v.union(v.literal("email"), v.literal("site"))),
      recipientType: v.optional(v.union(v.literal("admin"), v.literal("customer"))),
      toExpression: v.optional(v.string()),
      subjectTemplate: v.optional(v.string()),
      messageTemplate: v.optional(v.string()),
      triggerEventCode: v.optional(v.string()),
      conditionalLogic: conditionalLogicValidator,
      enabled: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_notifications");      // gated
    await ctx.db.patch(args.notificationId, { ...args.patch, updatedAt: Date.now() });
  },
});

// REORDER (drag-to-sort the list)
export const reorder = mutation({
  args: { formId: v.id("forms"), orderedIds: v.array(v.id("form_notifications")) },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_notifications");      // gated
    await Promise.all(
      args.orderedIds.map((id, i) => ctx.db.patch(id, { order: i, updatedAt: Date.now() })),
    );
  },
});

// REMOVE
export const remove = mutation({
  args: { notificationId: v.id("form_notifications") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_notifications");      // gated
    await ctx.db.delete(args.notificationId);
  },
});
```

### 8.3 Internal dispatch handler (subscribed to events; not capability-gated)

The runtime heart of the system. Registered with the Event Dispatcher as a consumer of the three Forms event codes. For each event it loads the form's enabled notification rows for that `triggerEventCode`, applies the firing rules + conditional logic, resolves recipients + templates via the Merge Tags system, and hands each finished message to the Email or Site system. It runs in trusted system context — **no `requireCan`**, exactly like the Submission System's post-commit scheduling.

```typescript
// Registered as a consumer of: form.submitted, form.progress_saved, form.action_failed.
// Invoked by the Event Dispatcher, never inline from submit.
export const dispatch = internalAction({
  args: {
    eventCode: v.string(),
    payload: v.any(),   // one of the §2.3 payload shapes, keyed by eventCode
  },
  handler: async (ctx, { eventCode, payload }) => {
    const { formId, submissionId } = payload;

    // 1) Load enabled rows for THIS form + THIS event, in author order.
    const rows = await ctx.runQuery(internal.extensions.forms.notifications._enabledRows, {
      formId,
      triggerEventCode: eventCode,
    });
    if (rows.length === 0) return;

    const form = await ctx.runQuery(internal.extensions.forms.forms._get, { formId });
    const valueMap: Record<string, unknown> = payload.values ?? {};

    for (const row of rows) {
      // 2) Firing rules (data-encoded). Submission rows require completion;
      //    progress_saved / action_failed bypass the isComplete gate.
      if (eventCode === "form.submitted" && payload.isComplete !== true) continue;

      // 3) Conditional routing — reuse the engine's evaluator (the Field Engine §6).
      const cl = row.conditionalLogic;
      if (cl?.enabled) {
        const matched = evaluateConditionalLogic(
          { conditionalLogic: { logic: cl.match, rules: cl.rules } } as any,
          valueMap,
        );
        const shouldFire = cl.action === "fire" ? matched : !matched;
        if (!shouldFire) continue;
      }

      // 4) Resolve recipient — delegate token expansion to the Merge Tags system.
      //    Admin rows usually resolve {settings:admin_notification_email};
      //    respondent rows resolve {field:email} from the submission values.
      const to = await resolveMergeTags(row.toExpression, { form, valueMap, payload });

      // 5) Resolve templates (subject/body) the same way.
      const subject = row.subjectTemplate
        ? await resolveMergeTags(row.subjectTemplate, { form, valueMap, payload })
        : undefined;
      const body = await resolveMergeTags(row.messageTemplate, { form, valueMap, payload });

      // 6) Hand off to the EXISTING delivery systems — do NOT reinvent delivery.
      try {
        if (row.channel === "email") {
          if (!to || !isValidEmail(to)) {
            // Missing/invalid respondent (or admin) email: skip, don't crash. (§10)
            await logNotificationSkipped(ctx, { row, submissionId, reason: "no_recipient" });
            continue;
          }
          await ctx.runAction(internal.emailNotifications.send, {
            to,
            subject: subject ?? `${form.title} — notification`,
            html: body,
            source: "form_notification",
            meta: { formId, submissionId, notificationId: row._id },
          });
        } else {
          // channel === "site": admin in-app notification via the Site system.
          await ctx.runMutation(internal.siteNotifications.create, {
            role: "Administrator",           // admin-recipient site notifications
            type: eventCode === "form.action_failed" ? "error" : "info",
            title: subject ?? row.name,
            body,
            link: `/admin/forms/${formId}/entries/${submissionId}`,
            meta: { formId, submissionId, notificationId: row._id },
          });
        }
      } catch (err) {
        // Delivery failure must not blow up the whole fan-out. Log + continue. (§10)
        await logNotificationFailed(ctx, { row, submissionId, error: String(err) });
      }
    }
  },
});

// Internal read used by dispatch (kept internal so the public list stays gated).
export const _enabledRows = internalMutation({ /* query enabled rows by_form_event */ });
```

> **Reuse boundary (explicit):** steps 4–5 call `resolveMergeTags` (Merge Tags system), step 6 calls `internal.emailNotifications.send` (Email system) and `internal.siteNotifications.create` (Site system), and step 3 calls `evaluateConditionalLogic` (Field Engine). The **only** net-new logic this system builds is the selection/iteration glue and the `form_notifications` config — everything load-bearing is delegated.

---

## 9. Data Model

### 9.1 `form_notifications` (owned by this system)

```typescript
// packages/backend/convex/extensions/forms/schema.ts
// Additive fragment — merged into the root schema by the v2 scanner.
// This system OWNS this table. It is per-form CONFIG; it is not a sent-message log.

form_notifications: defineTable({
  // Which form this notification belongs to (definition owned by Builder/Renderer).
  formId: v.id("forms"),

  // Human label shown in the editor list (e.g. "New Form Submission (Admin)").
  name: v.string(),

  // Delivery channel — maps onto an existing ConvexPress notification system.
  channel: v.union(
    v.literal("email"),   // -> Email Notification System (Resend)
    v.literal("site"),    // -> Site Notification System (in-app admin bell)
  ),

  // Who receives it. Drives default recipient resolution + UI affordances.
  recipientType: v.union(
    v.literal("admin"),     // -> site/form admin recipients (from settings)
    v.literal("customer"),  // -> the respondent (from a designated email field)
  ),

  // Recipient address as a merge-tag expression, resolved at dispatch time:
  //   admin:     "{settings:admin_notification_email}"
  //   respondent:"{field:email}"  (the form's designated email field)
  // Email rows require this to resolve to a valid address; site rows ignore it
  // (recipient is the admin role) but the column is kept uniform.
  toExpression: v.string(),

  // Templates expanded by the Merge Tags system at dispatch:
  subjectTemplate: v.optional(v.string()), // email channel only
  messageTemplate: v.string(),             // email body / site notification body

  // Which consumed event fires this row.
  triggerEventCode: v.union(
    v.literal("form.submitted"),
    v.literal("form.progress_saved"),
    v.literal("form.action_failed"),
  ),

  // Whether-it-fires gate. Reuses the Field Engine's conditional-logic SHAPE
  // (see §7); evaluated by the engine's pure evaluator at dispatch time.
  conditionalLogic: v.optional(
    v.object({
      enabled: v.boolean(),
      action: v.union(v.literal("fire"), v.literal("skip")),
      match: v.union(v.literal("and"), v.literal("or")),
      rules: v.array(
        v.object({
          fieldName: v.string(),
          operator: v.string(),
          value: v.optional(v.any()),
        }),
      ),
    }),
  ),

  // On/off without deleting; default true.
  enabled: v.boolean(),

  // Display + evaluation order within a form.
  order: v.number(),

  // Audit.
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_form", ["formId"])
  .index("by_form_event", ["formId", "triggerEventCode"])
  .index("by_form_enabled", ["formId", "enabled"]),
```

### 9.2 Mapping onto the global notification systems (no parallel store)

Each `form_notifications` row is a **binding**, not a message log. When it fires:

- `channel: "email"` → one call to the **Email Notification System** (`internal.emailNotifications.send`, Resend under the hood). That system owns the actual delivery record, retries, and deliverability. This system writes **no** email log of its own.
- `channel: "site"` → one call to the **Site Notification System** (`internal.siteNotifications.create`). That system owns the in-app notification record, read/unread state, and the bell UI.

So the "New Form Submission (Admin)" *email record* lives in the Email system; the "New Form Submission" *site record* lives in the Site system; `form_notifications` holds only the per-form **config** that produced them. Inventing a `form_notification_log` table would duplicate what the two delivery systems already persist — explicitly out of scope (see §11 for the optional observability counter).

### 9.3 Dispatch flow (event → fan-out)

```
  form.submitted / form.progress_saved / form.action_failed
                          │  (Event Dispatcher)
                          ▼
              ┌───────────────────────────┐
              │  notifications.dispatch    │  internal, system ctx, no requireCan
              └─────────────┬─────────────┘
                            │ load enabled rows by_form_event
                            ▼
        for each row:  firing rules ─► conditional logic ─► resolve recipient/templates
                            │ (skip if isComplete:false, no recipient, or CL says skip)
              ┌─────────────┴───────────────┐
              ▼                              ▼
   channel:"email"                   channel:"site"
   Email Notification System         Site Notification System
   (Resend) — owns delivery          (in-app bell) — owns record

Failure of any single row is logged and does NOT abort the remaining rows.
```

---

## 10. Business Rules & Constraints

- **Reuse delivery; never reinvent it.** Email goes out through the Email Notification System (Resend); site notifications through the Site Notification System. This system resolves config + templates and calls them — it owns no transport, no Resend keys, no deliverability logic, no bell UI.
- **This system owns no events.** It is a terminal consumer of `form.submitted`, `form.progress_saved`, `form.action_failed`. It must never emit a Forms domain event (it would create a loop / phantom signal).
- **Respondent email comes from a designated field.** A `Customer`-recipient row resolves its recipient from a `{field:…}` `toExpression` pointing at the form's designated **email-typed** field. If the form has no such field, or the field is empty for this submission, the respondent row is **skipped and logged** — never sent to a blank/garbage address, never thrown as a hard error that would abort sibling rows.
- **Admin recipients come from settings.** `Admin`-recipient rows resolve `{settings:admin_notification_email}` (per-form override falling back to the site-wide admin notification email). Site-channel admin rows target the `Administrator` role in the Site system.
- **Templates are merge-tag expanded, delegated.** Subject/message/`toExpression` are expanded by the Merge Tags system against the event `values`. This system defines no token grammar; it passes strings through `resolveMergeTags`.
- **Conditional routing reuses the engine.** Whether a row fires is decided by the Field Engine's pure `evaluateConditionalLogic` over the same `valueMap` the renderer/submit use (§7). No second rules engine.
- **Partials don't notify "submissions".** Rows on `form.submitted` fire only when `isComplete === true`. The save-and-continue nudge is a separate row bound to `form.progress_saved`.
- **Failures are logged, isolated, non-fatal.** A single row's resolution/delivery failure (missing recipient, Resend error, bad template) is caught, logged, and **does not** abort the remaining rows in the fan-out. The upstream submission is already committed; notification failure must never roll it back or surface to the public submitter.
- **Config is capability-gated; dispatch is not.** All CRUD calls `requireCan(ctx, "form.manage_notifications")` under Admin auth + `PluginGuard`. The internal `dispatch` runs in system context off the dispatcher with no capability check (there is no user on that path).
- **Additive-only (v2).** `form_notifications` is declared in the extension's schema fragment and merged by the scanner; the route is scanner-merged into the admin tree. This system never edits root `schema.ts`, `registry.ts`, or `nav-config.ts`.
- **Defaults on form creation.** When the Builder creates a form, it seeds the §6 default rows so a new form notifies the admin (and confirms to the respondent, if an email field exists) without manual setup.

---

## 11. Edge Cases

| Scenario | Handling |
|---|---|
| Respondent row, form has **no email field** | `{field:email}` resolves empty → row skipped + logged (`reason: "no_recipient"`). Admin rows unaffected. |
| Respondent row, email field present but **empty** for this submission | Same: skip + log; never send to a blank address. |
| Respondent row, email field present but **invalid** value | `isValidEmail(to)` fails → skip + log; don't hand a garbage address to Resend. |
| Notification **disabled** (`enabled:false`) | Excluded by the `_enabledRows` query — never evaluated, never sent. |
| Template references a **missing/unknown token** | Delegated to the Merge Tags resolver's policy (default: render an empty string / leave literal per that system); dispatch does not crash on an unresolved token. |
| Conditional logic says **skip** | Row skipped silently (expected control flow, not an error). |
| Partial save arrives as `form.submitted` w/ `isComplete:false` | Submission-triggered rows skip (firing rule); only `form.progress_saved` rows act. |
| Email **delivery fails** (Resend down / bounce) | Caught per-row, logged via the Email system's own failure handling; remaining rows still fire; submission stays committed. |
| Two rows resolve to the **same admin email** | Both send (admin opted into both, e.g. an extra CC row); de-dup is an author concern, not enforced here. |
| Event arrives for a **deleted form** | Form lookup returns null → dispatch no-ops gracefully (no rows / guarded). |
| `form.action_failed` for a feed with **no failure notification configured** | No matching enabled row → dispatch returns early; failure is still recorded by Actions & Feeds. |
| Event code renamed upstream (e.g. `form.progress_saved` ↔ `form.partial_saved`) | Binding is the `triggerEventCode` **data** column → fix is a data migration on existing rows, not a code change. |
| Dispatch handler throws unexpectedly | Scheduler/dispatcher retry semantics apply (same as any consumer); the committed submission is the source of truth, not the notification. |

---

## 12. Merge Tags

Templating is **delegated** to the Form Merge Tags & Prefill System (`specs/ConvexPress/systems/form-merge-tags-prefill-system/PRD.md`); this system defines no token grammar and ships no resolver. It only *uses* `resolveMergeTags(template, ctx)` against the event payload at dispatch time, for three string slots: `toExpression`, `subjectTemplate`, `messageTemplate`. Common tokens an author will reach for:

| Token | Resolves to | Typical use |
|---|---|---|
| `{field:<name>}` | A single field's submitted value | Respondent address (`{field:email}`), greeting (`Hi {field:first_name}`) |
| `{all_fields}` | A formatted table/list of every answered field | Admin "New Submission" email body |
| `{form:title}` | The form's title | Subject lines (`New {form:title} submission`) |
| `{form:resume_url}` | The save-and-continue resume link (from `resumeToken`) | "Resume Your Form" respondent email |
| `{form:admin_entry_url}` | Deep link to the entry in the admin inbox | Admin email / site notification CTA |
| `{settings:admin_notification_email}` | Configured admin recipient(s) | Admin `toExpression` |
| `{submission:id}` / `{submission:date}` | Entry id / submitted timestamp | Reference lines, audit |
| `{action:error}` | The failure reason (on `form.action_failed`) | Admin "Action Failed" body |

The resolver's behavior for unknown/empty tokens, escaping, and formatting of `{all_fields}` is owned by the Merge Tags system; this PRD only commits to *passing the strings through it*.

---

## 13. Implementation Checklist

**Phase 1 — config data model + CRUD**
- [ ] Add `form_notifications` to the Forms extension schema fragment with `by_form`, `by_form_event`, `by_form_enabled` indexes.
- [ ] Implement `listForForm` / `create` / `update` / `reorder` / `remove`, each gated by `requireCan(ctx, "form.manage_notifications")`.
- [ ] Register the `form.manage_notifications` capability for Administrator + Editor.

**Phase 2 — admin UI**
- [ ] Build `/admin/forms/$formId/notifications` route under `_authenticated/_admin/forms/`, wrapped in `PluginGuard`.
- [ ] List with drag-reorder + enable toggle; editor drawer for channel / recipient / To expression / subject / message (with a merge-tag picker) / conditional-logic builder / trigger event.
- [ ] Surface the "Notifications" tab/link from the Builder.

**Phase 3 — dispatch glue (reuse delivery)**
- [ ] Implement the internal `dispatch` handler; register it as an Event Dispatcher consumer of `form.submitted`, `form.progress_saved`, `form.action_failed`.
- [ ] Apply firing rules (`isComplete` gate) + conditional logic via the engine's `evaluateConditionalLogic`.
- [ ] Resolve `toExpression` / subject / message via the Merge Tags system's `resolveMergeTags`.
- [ ] Hand `email` rows to `internal.emailNotifications.send` (Resend) and `site` rows to `internal.siteNotifications.create`.
- [ ] Per-row try/catch: skip-on-missing-recipient + log; never abort sibling rows; never roll back the submission.

**Phase 4 — defaults + verification**
- [ ] Seed the §6 default rows on form creation (admin email + site notification; respondent confirmation when an email field exists).
- [ ] Verify end-to-end: submit a form → admin email + admin bell + respondent confirmation; save-and-continue → "Resume Your Form" email; simulate a feed failure → admin "Action Failed" email + error site notification.
- [ ] Verify a disabled row and a conditional `skip` row do not fire; verify a form with no email field skips the respondent row without erroring.

---

## 14. Open Questions

- **Progress-saved event code:** the Submission System (§12 of its PRD) hasn't finalized `form.progress_saved` vs `form.partial_saved` vs reusing `form.submitted{isComplete:false}`. We bind via the `triggerEventCode` data column so a rename is a migration; the **default seeded "Resume Your Form" row** must point at whichever wins. Track with Multi-Step (which owns issuance).
- **Per-form vs site-wide admin recipients:** `{settings:admin_notification_email}` falls back site→form. Do we also want an explicit multi-recipient list / CC / BCC on the row (extra `cc`/`bcc` columns) vs. authoring multiple rows? Default: multiple rows + a single `toExpression`; revisit if authors ask for CC.
- **Observability:** §9.2 deliberately keeps no `form_notification_log` (Email/Site systems persist delivery). Do we want a lightweight per-row **counter** (`lastFiredAt`, `fireCount`, `lastSkipReason`) on `form_notifications` for the editor's "last sent / why skipped" UX? Leaning yes (cheap, on the row); parked pending the editor design.
- **Throttling identical sends:** double-submits (handled upstream by the Submission/Spam systems) shouldn't double-notify. Rely on upstream idempotency, or add a short dedupe window keyed on `submissionId + notificationId`? Default: rely on upstream; reopen if duplicates appear.
- **Respondent confirmations on `form.action_failed`:** currently admin-only. Should a respondent ever be told "we hit a snag processing your submission"? Default: no (operational noise to end users); revisit per form type.
- **Rich vs plain email body:** `messageTemplate` resolves to the email `html`. Do we expose a WYSIWYG/HTML mode vs. a plain-text-with-tokens box in the editor? Defer to the Email Notification System's templating capabilities.

---

## 15. Cross-References

- **Depends on (upstream producer):** Form Submission System (`specs/ConvexPress/systems/form-submission-system/PRD.md`)
- **Templating delegated to:** Form Merge Tags & Prefill System (`specs/ConvexPress/systems/form-merge-tags-prefill-system/PRD.md`)
- **Failure events consumed from:** Form Actions & Feeds System (`specs/ConvexPress/systems/form-actions-feeds-system/PRD.md`)
- **Progress-saved events consumed from:** Multi-Step & Save-Continue System (`specs/ConvexPress/systems/form-multi-step-system/PRD.md`)
- **Delivery reused from:** Email Notification System (`specs/ConvexPress/systems/email-notification-system/PRD.md`) · Site Notification System (`specs/ConvexPress/systems/site-notification-system/PRD.md`)
- **Conditional-logic shape/evaluator reused from:** Form Field Engine (`specs/ConvexPress/systems/form-field-engine/PRD.md`)
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Notification System · **Plugin:** ConvexPress Forms (v2)
