# PRD: Form Actions & Feeds System

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). The integration backbone of the Forms tree — Gravity Forms "feeds" — layered on the Form Submission System: after `form.submitted`, a form runs ordered, conditional post-submit actions.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** The **post-submit integration backbone** of the Forms extension — the framework, registry, and runtime that turn a stored submission into outbound side effects (subscription signup, account registration, payment, webhook, lead/CRM capture, email-marketing sync). This is ConvexPress's analog to **Gravity Forms feeds**: per-form, ordered, conditionally-gated actions that fire after a submission completes. This system **builds the framework** — the action-type registry, the ordered/conditional execution engine, the per-action run log, and the retry/idempotency machinery. It does **not** implement the money-moving subscription/payment action itself; that concrete action is owned by the **Form Commerce & Subscription Action System** (`specs/ConvexPress/systems/form-commerce-subscription-action/PRD.md`), which registers into this framework like any other action type. Think "platform, not plugin": this PRD is the socket; concrete actions are the plugs.

**Code lives at:** `packages/backend/convex/extensions/forms/actions.ts` (config CRUD mutations + admin queries), `packages/backend/convex/extensions/forms/actionRunner.ts` (the internal `runActions` handler subscribed to `form.submitted` + per-action dispatch + retry), and `packages/backend/convex/extensions/forms/actionRegistry.ts` (the action-type interface + registry). Tables are declared in the extension's additive schema fragment `packages/backend/convex/extensions/forms/schema.ts` (merged by the scanner — never hand-edited into root `schema.ts`). Admin UI lives at `apps/web/src/routes/_authenticated/_admin/forms/$formId/actions.tsx`.

**Consumes these ConvexPress systems:**

- **Form Submission System** (`specs/ConvexPress/systems/form-submission-system/PRD.md`) — the *trigger source*. This system subscribes to the `form.submitted` event it emits and reads its `{ formId, submissionId, isComplete, submittedAt, values }` payload. It never re-validates fields or re-reads the submit path; it consumes the committed entry. The `values` map (fieldName → parsed value, decoded via the engine's `parseFieldValue`) is the data feed for templating webhook bodies, CRM fields, and marketing payloads.
- **Form Field Engine** (`specs/ConvexPress/systems/form-field-engine/PRD.md`) — the **conditional-logic evaluator** `evaluateConditionalLogic(rule, valueMap)` is reused verbatim to decide whether each action runs for a given submission. Action conditional logic is the *same shape* as field conditional logic (`{ enabled, action: "process"|"skip", logicType: "all"|"any", rules: [{ fieldName, operator, value }] }`), so the engine's pure evaluator is the single source of truth — no parallel conditional implementation.
- **Event Dispatcher** — the `runActions` handler is wired to `form.submitted` through the dispatcher (not called inline by the submit mutation), and this system emits `form.action_completed` / `form.action_failed` back through the dispatcher after each action settles.
- **Form Notification System** (`specs/ConvexPress/systems/form-notification-system/PRD.md`) — owns/implements the "Form Action Failed" admin email + site notification keyed off `form.action_failed`. This system only emits the event with a complete payload; it sends nothing itself (symmetric with how the Submission System delegates its notifications).
- **Form Commerce & Subscription Action System** (`specs/ConvexPress/systems/form-commerce-subscription-action/PRD.md`) — registers the concrete `subscription` and `payment` action types into this framework's registry. All money movement (Stripe, subscriptions, order creation) is **delegated** there; this framework only invokes the registered `run()` and records the result. It never touches Stripe directly.

**WooCommerce / WordPress analog:** Gravity Forms **Feeds** — the `GFFeedAddOn` framework: per-form feed config rows, ordered processing, per-feed conditional logic (`is_feed_condition_met`), and the `gform_after_submission` → `process_feed()` fan-out. Each Gravity add-on (Stripe, Mailchimp, User Registration, Zapier/webhooks, HubSpot) registers a feed type; the core add-on framework runs them in order with conditional gating. This system is that framework; the concrete actions are the add-ons.

---

## 1. Overview

### 1.1 Purpose

Provide a **pluggable post-submit action framework** so a single form can fan a completed submission out to multiple destinations in a defined order, each gated by its own conditional logic, each recorded as an idempotent, retryable run. Concretely: own the **action-type registry** (a stable interface every action type implements), the **ordered + conditional execution engine** (subscribed to `form.submitted`), the **`form_actions` config model** (what runs, in what order, under what conditions), and the **`form_action_runs` log** (one row per action per submission, the basis for idempotency, retry, and admin visibility). The framework guarantees that adding a new action type is *registration*, not a fork — and that a flaky webhook never blocks a payment, double-charges a card, or loses a CRM lead.

### 1.2 Scope

**In scope:**
- The **action-type registry** + interface: `{ type, label, validateConfig(config), run(ctx, submission, config) -> ActionResult }`, plus a `registerActionType(def)` API so other systems (Commerce & Subscription, future add-ons) plug in without editing this system.
- The **`form_actions` table** — per-form action config: `type`, `label`, `config` (JSON, action-type-specific), `order`, `conditionalLogic` (reuses the engine's shape), `enabled`.
- The **`form_action_runs` table** — one row per action per submission: `status` (`pending`/`completed`/`failed`), `attempts`, `error`, `result`, timestamps — the durable substrate for idempotency + retry + admin audit.
- The **internal `runActions` handler** subscribed to `form.submitted`: loads enabled actions for the form, sorts by `order`, evaluates each action's conditional logic against the submission's `values`, runs each in order, writes a run row, and emits `form.action_completed` / `form.action_failed` per action.
- **Idempotency** keyed on `submissionId + formActionId`: an action that already has a `completed` run for a submission is never re-run.
- **Retry with backoff** for transient failures (network/5xx/timeout), capped attempts, exponential backoff via the Convex scheduler; permanent failures (validation/4xx) are not retried.
- **Per-action failure isolation:** one action throwing/timing out does not abort the remaining actions.
- Admin **config CRUD** mutations + queries (`requireCan` `form.manage_actions`) and the run-log read layer the actions UI sits on.
- Concrete **first-party action types** owned here: `webhook`, `lead_capture`, `email_marketing`, `account_registration` (see §5 for P1 vs later phasing).

**Out of scope:**
- The concrete **subscription** / **payment** action implementation — money movement, Stripe calls, order/subscription creation (the Form Commerce & Subscription Action System PRD (`specs/ConvexPress/systems/form-commerce-subscription-action/PRD.md`)). This system invokes the registered `run()`; it does not implement it.
- The **submit pipeline**, field validation, the `form.submitted` event itself, and the `form_submissions` / `fieldValues` data model (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`)).
- **Field types / renderers / the conditional-logic evaluator implementation** (the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)) — this system *reuses* the evaluator, it does not own it.
- **Email/site notification templates + delivery** (the Form Notification System PRD (`specs/ConvexPress/systems/form-notification-system/PRD.md`)) — this system emits `form.action_failed`; Notifications renders + sends.
- The **builder/renderer** of the form definition and the public form UI (the Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`), the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`)).
- Submission-confirmation UX shown to the respondent (the Form Confirmation System PRD (`specs/ConvexPress/systems/form-confirmation-system/PRD.md`)).

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Form Submission System (`specs/ConvexPress/systems/form-submission-system/PRD.md`) | Emits `form.submitted` (the sole trigger) with the `{ formId, submissionId, isComplete, values }` payload this engine consumes; owns the entry rows actions read. |
| Form Field Engine (`specs/ConvexPress/systems/form-field-engine/PRD.md`) | Provides `evaluateConditionalLogic` (reused verbatim to gate each action) and `parseFieldValue` (the `values` map shape feeds templating). |
| Event Dispatcher | Delivers `form.submitted` to the `runActions` handler and carries this system's `form.action_completed` / `form.action_failed` events outward. |

### 2.2 Systems that depend on this

| System | Integration point |
|---|---|
| Form Commerce & Subscription Action System | Registers `subscription` + `payment` action types into this registry; relies on this system's run-log/idempotency/retry so a charge is never duplicated. |
| Form Notification System | Subscribes to `form.action_failed`; sends the admin "Form Action Failed" email + site notification. |
| Form Entry Management System | Surfaces the per-submission action-run history (`form_action_runs`) inside an entry's detail view (read-only consumer of this system's run log). |
| Form Analytics & Export System | May aggregate action success/failure rates over `form_action_runs` (by_type, by_status). |

### 2.3 Integration hooks

```typescript
// Event consumed (emitted by the Form Submission System):
//   form.submitted -> runActions handler
interface FormSubmittedPayload {
  formId: Id<"forms">;
  submissionId: Id<"form_submissions">;
  isComplete: boolean;               // actions run on completion; partials are ignored by default
  submittedAt: number;
  values: Record<string, unknown>;   // fieldName -> parsed value (for conditional logic + templating)
}

// Events emitted by the Form Actions & Feeds System (brace-shorthand throughout):
type FormActionEvents = "form.action_completed" | "form.action_failed";

interface FormActionCompletedPayload {
  formId: Id<"forms">;
  submissionId: Id<"form_submissions">;
  actionType: string;                // e.g. "webhook", "subscription", "lead_capture"
  result: unknown;                   // ActionResult.data (action-type-specific summary)
}

interface FormActionFailedPayload {
  formId: Id<"forms">;
  submissionId: Id<"form_submissions">;
  actionType: string;
  error: string;                     // human-readable failure reason (final, after retries)
}
```

---

## 3. Architecture

### 3.1 The three pieces

```
┌──────────────────────────────────────────────────────────────────────┐
│  form.submitted  (Event Dispatcher)                                    │
│        │  { formId, submissionId, isComplete, values }                 │
│        ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ runActions (internalMutation, subscribed via dispatcher)       │     │
│  │  1. if !isComplete -> return (partials skipped by default)     │     │
│  │  2. load enabled form_actions by_form, sort by `order` asc     │     │
│  │  3. for each action, in order:                                 │     │
│  │       a. idempotency: skip if a completed run already exists   │     │
│  │       b. conditional: evaluateConditionalLogic(rule, values)   │     │
│  │          -> skip (record "skipped") if not met                 │     │
│  │       c. insert/patch form_action_runs row -> "pending"        │     │
│  │       d. schedule dispatchAction(runId) (isolated per action)  │     │
│  └──────────────────────────────────────────────────────────────┘     │
│        │ (one scheduled job per action -> isolation)                    │
│        ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ dispatchAction (internalAction, per run)                       │     │
│  │  - look up registry[run.type]                                  │     │
│  │  - call def.run(ctx, submission, config)                       │     │
│  │  - on success -> run "completed" + emit action_completed       │     │
│  │  - on transient error + attempts<max -> reschedule w/ backoff  │     │
│  │  - on permanent error / attempts exhausted -> "failed" +       │     │
│  │    emit action_failed                                          │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                        │
│  Registry (in-process):  actionRegistry.ts                            │
│    type -> { type, label, validateConfig, run }                       │
│    populated by registerActionType(def) at module load                │
│    (webhook/lead_capture/email_marketing/account_registration here;   │
│     subscription/payment registered by the Commerce action system)    │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 The action-type interface (the contract)

Every action type — first-party here or registered by another system — implements one interface. This is the seam that makes the framework pluggable.

```typescript
// packages/backend/convex/extensions/forms/actionRegistry.ts

export interface ActionResult {
  ok: boolean;
  data?: unknown;            // action-type-specific success summary (-> action_completed payload)
  error?: string;           // failure reason (-> action_failed payload)
  retryable?: boolean;      // hint: transient (true) vs permanent (false). Default heuristic if omitted.
}

export interface ActionRunContext {
  // A Convex action ctx (run() may do I/O: fetch, runMutation, runAction).
  // Money actions get a full ActionCtx so they can call Stripe via the Commerce system.
  formId: Id<"forms">;
  submissionId: Id<"form_submissions">;
  values: Record<string, unknown>;   // parsed answers, for templating destination payloads
  attempt: number;                   // 1-based; lets run() behave idempotently across retries
}

export interface ActionTypeDefinition<TConfig = Record<string, unknown>> {
  type: string;                                  // unique slug, e.g. "webhook"
  label: string;                                 // admin-facing name
  // Pure config validation at save time (wrap with Zod at the boundary):
  validateConfig: (config: TConfig) => { valid: boolean; error?: string };
  // The side effect. MUST be idempotent w.r.t. (submissionId, formActionId):
  run: (ctx: ActionRunContext, config: TConfig) => Promise<ActionResult>;
}

// Registration API — how every action type joins the framework. Additive: this
// system registers its first-party types; the Commerce system registers payment/
// subscription; future add-ons register their own — none edit this file's core.
export function registerActionType<T>(def: ActionTypeDefinition<T>): void;
export function getActionType(type: string): ActionTypeDefinition | undefined;
export function listActionTypes(): ActionTypeDefinition[];
```

### 3.3 Ordered + conditional execution

- **Order** is an explicit integer `order` on each `form_actions` row; the runner sorts ascending. Admin drag-reorder rewrites `order`. Order matters: e.g. `account_registration` (create the user) before `subscription` (attach a customer to that user) before `email_marketing` (sync the now-known contact).
- **Conditional logic** reuses the Field Engine's evaluator against the submission `values`. An action whose condition is not met is **skipped** (recorded as a terminal `skipped` outcome on its run row, not `failed`), and the engine continues to the next action. The conditional shape is identical to field conditional logic so the builder UI and the evaluator are shared.
- **Isolation** is structural: each action's `run()` executes in its **own scheduled job** keyed by its run row. A throw, a timeout, or a retry loop in one action cannot abort or delay the others — the runner has already enqueued them all.

### 3.4 Idempotency via `form_action_runs`

The `(submissionId, formActionId)` pair is the **idempotency key**, materialized as a unique-ish index on `form_action_runs`. Before dispatching, the runner checks for an existing `completed` run for that pair; if present, it does nothing. A `pending`/`failed` run can be retried; a `completed` run is final. This is what makes the whole system safe to re-trigger: a redelivered `form.submitted`, a manual replay, or a scheduler retry all converge on "run each action exactly once to completion."

### 3.5 Retry with backoff

`dispatchAction` distinguishes **transient** failures (network error, HTTP 5xx, timeout, explicit `retryable: true`) from **permanent** ones (config/validation error, HTTP 4xx, explicit `retryable: false`). Transient + `attempts < maxAttempts` → reschedule via `ctx.scheduler.runAfter(backoff(attempt), ...)` with exponential backoff (e.g. 30s, 2m, 10m, capped) and jitter. Permanent, or attempts exhausted → mark `failed`, record `error`, emit `form.action_failed`. `maxAttempts` defaults framework-wide (e.g. 4) and is overridable per action type. Money actions delegate their own idempotency to the Commerce system but still benefit from this retry envelope (the Commerce `run()` is required idempotent so a retry never double-charges).

---

## 4. Data Model

### 4.1 `form_actions` (owned by this system)

```typescript
// packages/backend/convex/extensions/forms/schema.ts
// Additive fragment — merged into the root schema by the v2 scanner.

form_actions: defineTable({
  // The form this action belongs to (definition owned by Builder/Renderer).
  formId: v.id("forms"),

  // Action-type slug — must match a registered ActionTypeDefinition.type.
  type: v.union(
    v.literal("subscription"),         // -> Commerce & Subscription Action system (delegated)
    v.literal("account_registration"), // create/link a ConvexPress user
    v.literal("payment"),              // -> Commerce & Subscription Action system (delegated)
    v.literal("webhook"),              // outbound HTTP POST to an arbitrary URL
    v.literal("lead_capture"),         // push a lead to a CRM
    v.literal("email_marketing")       // sync a contact to an email-marketing provider
  ),

  // Admin-facing label for this configured instance (e.g. "Notify Slack").
  label: v.string(),

  // Action-type-specific configuration. Shape validated by the type's
  // validateConfig at save time; stored opaque here.
  config: v.any(),

  // Explicit execution order within the form (ascending). Drag-reorder rewrites this.
  order: v.number(),

  // Per-action conditional gate — SAME shape as field conditional logic
  // (reuses the Field Engine's evaluator). Optional => always runs.
  conditionalLogic: v.optional(v.object({
    enabled: v.boolean(),
    action: v.union(v.literal("process"), v.literal("skip")), // process-when / skip-when
    logicType: v.union(v.literal("all"), v.literal("any")),   // AND / OR
    rules: v.array(v.object({
      fieldName: v.string(),
      operator: v.string(),   // is / is_not / contains / greater_than / ... (engine operators)
      value: v.any(),
    })),
  })),

  // Master on/off for this action (disabled actions are skipped entirely).
  enabled: v.boolean(),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_form", ["formId"])
  .index("by_form_enabled", ["formId", "enabled"])
  .index("by_form_order", ["formId", "order"]),
```

### 4.2 `form_action_runs` (owned by this system) — idempotency + retry + audit

```typescript
// packages/backend/convex/extensions/forms/schema.ts (same additive fragment)
// One row per (submission, action). The durable substrate for idempotency,
// retry bookkeeping, and the admin run-history view.

form_action_runs: defineTable({
  // Idempotency key components:
  submissionId: v.id("form_submissions"),
  formActionId: v.id("form_actions"),

  // Denormalized for filtering/audit without joining form_actions
  // (and so history survives if the action config is later edited/deleted).
  formId: v.id("forms"),
  type: v.string(),                  // action-type slug at run time

  status: v.union(
    v.literal("pending"),    // claimed, dispatch scheduled / in flight (incl. between retries)
    v.literal("completed"),  // run() returned ok:true — TERMINAL, never re-run
    v.literal("failed"),     // permanent error or attempts exhausted — TERMINAL (manual replay only)
    v.literal("skipped")     // conditional logic not met (or action disabled) — TERMINAL
  ),

  attempts: v.number(),              // incremented each dispatch; drives backoff + cap
  error: v.optional(v.string()),     // last/final failure reason
  result: v.optional(v.any()),       // ActionResult.data on success (summary, not the full payload)

  // Retry scheduling
  nextAttemptAt: v.optional(v.number()), // when the next retry is scheduled (for visibility)

  // Timestamps
  createdAt: v.number(),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),   // set when status becomes completed/failed/skipped
})
  // The idempotency lookup: does a run already exist for this (submission, action)?
  .index("by_submission_action", ["submissionId", "formActionId"])
  .index("by_submission", ["submissionId"])          // entry-detail action history
  .index("by_form_status", ["formId", "status"])     // analytics / failure dashboards
  .index("by_status", ["status"]),                   // sweep stuck/retryable runs
```

### 4.3 Run state machine

```
            runActions claims the (submission, action) pair
                            │
            conditional met?│ no ──────────────► ┌──────────┐
                            │ yes                 │ skipped  │ (terminal)
                            ▼                     └──────────┘
                     ┌──────────────┐
                     │   pending    │ ◄──────────────┐
                     └──────┬───────┘                │ transient fail
                            │ dispatchAction          │ & attempts<max
            ┌───────────────┼───────────────┐        │ (reschedule w/ backoff)
            ▼               │               ▼        │
      run() ok:true         │         run() error ───┘
            │               │               │
            ▼               │               ▼ permanent OR attempts exhausted
     ┌──────────────┐       │        ┌──────────────┐
     │  completed   │       │        │   failed     │  -> emit form.action_failed
     └──────────────┘       │        └──────────────┘
      emit                  │
      action_completed      │   (manual replay re-enters at pending)
```

---

## 5. Action Types

The framework ships first-party types and accepts registered ones. Each is one `ActionTypeDefinition` (`type` / `label` / `validateConfig` / `run`). Phasing marks what lands with the framework (P1) vs. later.

| Type | Owner | `run()` does | Phase |
|---|---|---|---|
| **`webhook`** | This system | POST the submission (`values` + metadata, templated body, configurable headers/secret HMAC) to an arbitrary URL; success = 2xx. The canonical transient-retry case (5xx/timeout → retry; 4xx → permanent). The Zapier/Make/n8n bridge. | **P1** |
| **`lead_capture`** | This system | Map form fields → a CRM contact/lead and push via the CRM's API (provider chosen in `config`: HubSpot/Pipedrive/etc.). Mapping config is field→property pairs. | **P1** |
| **`email_marketing`** | This system | Subscribe/sync the respondent (email + mapped merge fields + list/tags) to an email-marketing provider (Mailchimp/Klaviyo/etc., selected in `config`). | **P1** |
| **`account_registration`** | This system | Create or link a ConvexPress `users` record from mapped fields (email/name/role), optionally signing the respondent in / sending an invite. Ordered **before** money actions so a subscription can attach to the new user. | Later (P2) |
| **`subscription`** | **Form Commerce & Subscription Action System** (`specs/ConvexPress/systems/form-commerce-subscription-action/PRD.md`) | Start a Stripe subscription / recurring plan for the respondent. **Money movement, delegated.** This framework only invokes the registered `run()` and records the result; idempotency inside `run()` is the Commerce system's responsibility. | Later (P2, cross-system) |
| **`payment`** | **Form Commerce & Subscription Action System** (`specs/ConvexPress/systems/form-commerce-subscription-action/PRD.md`) | Take a one-time payment for the submission (Stripe PaymentIntent), optionally materialize an order. **Money movement, delegated** — same contract as `subscription`. | Later (P2, cross-system) |

> **P1 cut:** `webhook` + `lead_capture` + `email_marketing` validate the whole framework — registry, ordered/conditional execution, run log, retry/idempotency — without any money-handling risk. `account_registration` follows once user-linking semantics are settled. The money actions (`subscription`/`payment`) ship with the Commerce system, which registers them into the registry built here; this system's only obligation to them is a correct, idempotent, isolated run envelope.

---

## 6. Routes

### 6.1 Admin routes (Admin app)

| Route | Path | Layout | Auth Required | Roles |
|---|---|---|---|---|
| Form Actions | `/admin/forms/$formId/actions` | `_admin` / `Admin` (`auth`) | Yes | Administrator, Editor |

Canonical file path (v2 additive — registered via the scanner, never hand-wired into `nav-config.ts`):
`apps/web/src/routes/_authenticated/_admin/forms/$formId/actions.tsx`.

The screen lists the form's configured actions in `order` (drag to reorder), shows each action's `enabled` toggle, type, label, and conditional summary, and opens a per-type config editor (the editor form is driven by the action type's `validateConfig` contract). It also surfaces the **run history** for recent submissions (read from `form_action_runs`) with status chips and a **retry** affordance for `failed` runs. No public/Website route — actions are server-side side effects, never rendered to the respondent.

---

## 7. Actions

### 7.1 Admin actions (capability-gated)

| Action | Code | Description | Roles | Triggers Events |
|---|---|---|---|---|
| Configure form actions | `form.manage_actions` | Create / edit / reorder / enable-disable / delete a form's actions; replay a failed run | **Administrator, Editor** | — |

Every config mutation and the manual-replay mutation call `requireCan(ctx, "form.manage_actions")`. This single capability (Admin + Editor) gates all authoring and operational control of the action framework, mirroring how WordPress restricts Gravity Forms feed settings to form-managing roles.

### 7.2 System actions (not user-invoked)

| Action | Code | Description | Triggered By |
|---|---|---|---|
| Run actions for a submission | `form.run_actions` | Load enabled actions, evaluate conditions, enqueue per-action dispatch | `form.submitted` (via dispatcher) |
| Dispatch one action | `form.dispatch_action` | Execute one action's `run()`, record the run, retry/finalize | `runActions` + scheduler (retries) |

These are internal handlers (no capability check, never client-callable) — the runtime of the framework, not user actions.

---

## 8. Events

### 8.1 Events emitted

| Event | Code | Trigger | Payload |
|---|---|---|---|
| Form Action Completed | `form.action_completed` | An action's `run()` returns `ok:true` | `{ formId, submissionId, actionType, result }` |
| Form Action Failed | `form.action_failed` | An action permanently fails (4xx / non-retryable / attempts exhausted) | `{ formId, submissionId, actionType, error }` |

Both are scheduled via `ctx.scheduler.runAfter(0, internal.events.dispatch, ...)` **after** the corresponding `form_action_runs` row is written — never inline, never before the run row commits. `form.action_completed` fires once per action per submission (idempotency guarantees no duplicates). `form.action_failed` fires only on a **terminal** failure, not on each transient retry — so the admin is alerted once a real problem is confirmed, not on every flaky attempt.

### 8.2 Events consumed

| Event | Source System | Handler |
|---|---|---|
| `form.submitted` | Form Submission System | `runActions` — load + evaluate + enqueue actions |

The handler ignores partial submissions (`isComplete: false`) by default; actions run on completion. (A future per-action "run on partial" opt-in is an Open Question — §11.)

---

## 9. Notifications

Both are triggered by `form.action_failed` and are **owned/implemented by the Form Notification System** (`specs/ConvexPress/systems/form-notification-system/PRD.md`). This system's only obligation is to emit `form.action_failed` with a complete payload; it sends nothing itself.

### 9.1 Email notifications

| Name | Trigger Event | Recipient | Priority |
|---|---|---|---|
| Form Action Failed | `form.action_failed` | Admin | Immediate |

### 9.2 Site notifications

| Name | Trigger Event | Recipient | Type |
|---|---|---|---|
| Form Action Failed | `form.action_failed` | Admin | Error |

> A failed *money* action (a delegated `payment`/`subscription`) is the highest-signal case — the respondent likely expected a charge to succeed. The Notification System keys both alerts off the event payload's `actionType` so it can escalate or specialize copy for money actions vs. a flaky webhook. The respondent is **not** notified by this system; respondent-facing confirmation/error UX is the Confirmation System's concern.

---

## 10. API Design

### 10.1 Config CRUD (capability-gated) — `actions.ts`

```typescript
// packages/backend/convex/extensions/forms/actions.ts
import { mutation, query } from "../../_generated/server";
import { v } from "convex/values";
import { requireCan } from "../../lib/auth/capabilities"; // ConvexPress Role & Capability System
import { getActionType } from "./actionRegistry";

const conditionalLogicValidator = v.optional(v.object({
  enabled: v.boolean(),
  action: v.union(v.literal("process"), v.literal("skip")),
  logicType: v.union(v.literal("all"), v.literal("any")),
  rules: v.array(v.object({
    fieldName: v.string(),
    operator: v.string(),
    value: v.any(),
  })),
}));

// CREATE — appends an action at the end of the form's order.
export const createAction = mutation({
  args: {
    formId: v.id("forms"),
    type: v.string(),
    label: v.string(),
    config: v.any(),
    conditionalLogic: conditionalLogicValidator,
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_actions");

    // Validate the config through the registered action type — NOT trusted raw.
    const def = getActionType(args.type);
    if (!def) throw new Error(`Unknown action type: ${args.type}`);
    const check = def.validateConfig(args.config);
    if (!check.valid) {
      throw new ConvexError({ code: "INVALID_CONFIG", error: check.error });
    }

    // Next order = (max existing order for this form) + 1.
    const existing = await ctx.db
      .query("form_actions")
      .withIndex("by_form_order", (q) => q.eq("formId", args.formId))
      .order("desc")
      .first();
    const nextOrder = existing ? existing.order + 1 : 0;

    const now = Date.now();
    return await ctx.db.insert("form_actions", {
      formId: args.formId,
      type: args.type as any,
      label: args.label,
      config: args.config,
      order: nextOrder,
      conditionalLogic: args.conditionalLogic,
      enabled: args.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// UPDATE — re-validates config on every save.
export const updateAction = mutation({
  args: {
    actionId: v.id("form_actions"),
    label: v.optional(v.string()),
    config: v.optional(v.any()),
    conditionalLogic: conditionalLogicValidator,
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_actions");
    const action = await ctx.db.get(args.actionId);
    if (!action) throw new Error("Action not found");

    if (args.config !== undefined) {
      const def = getActionType(action.type);
      const check = def?.validateConfig(args.config) ?? { valid: false, error: "Unknown type" };
      if (!check.valid) throw new ConvexError({ code: "INVALID_CONFIG", error: check.error });
    }

    await ctx.db.patch(args.actionId, {
      ...(args.label !== undefined ? { label: args.label } : {}),
      ...(args.config !== undefined ? { config: args.config } : {}),
      ...(args.conditionalLogic !== undefined ? { conditionalLogic: args.conditionalLogic } : {}),
      ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
      updatedAt: Date.now(),
    });
  },
});

// REORDER — rewrites `order` for a form's actions from an ordered id list.
export const reorderActions = mutation({
  args: { formId: v.id("forms"), orderedIds: v.array(v.id("form_actions")) },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_actions");
    for (let i = 0; i < args.orderedIds.length; i++) {
      await ctx.db.patch(args.orderedIds[i], { order: i, updatedAt: Date.now() });
    }
  },
});

// DELETE — removes config; run history (form_action_runs) is retained for audit.
export const deleteAction = mutation({
  args: { actionId: v.id("form_actions") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_actions");
    await ctx.db.delete(args.actionId);
  },
});

// READ — the actions list + available registered types for the editor UI.
export const listActions = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_actions");
    return await ctx.db
      .query("form_actions")
      .withIndex("by_form_order", (q) => q.eq("formId", args.formId))
      .order("asc")
      .collect();
  },
});

// READ — per-submission run history for the entry detail / actions screen.
export const listRunsForSubmission = query({
  args: { submissionId: v.id("form_submissions") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_actions");
    return await ctx.db
      .query("form_action_runs")
      .withIndex("by_submission", (q) => q.eq("submissionId", args.submissionId))
      .collect();
  },
});

// MANUAL REPLAY — re-enqueue a failed run (admin button on the actions screen).
export const replayRun = mutation({
  args: { runId: v.id("form_action_runs") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "form.manage_actions");
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");
    if (run.status === "completed") return; // idempotent: never replay a completed run
    await ctx.db.patch(args.runId, {
      status: "pending", attempts: 0, error: undefined,
      nextAttemptAt: Date.now(), startedAt: undefined, completedAt: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.extensions.forms.actionRunner.dispatchAction, {
      runId: args.runId,
    });
  },
});
```

### 10.2 The runner — `runActions` subscribed to `form.submitted` — `actionRunner.ts`

```typescript
// packages/backend/convex/extensions/forms/actionRunner.ts
import { internalMutation, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { evaluateConditionalLogic } from "@convexpress/field-engine"; // pure, reused
import { getActionType } from "./actionRegistry";

const MAX_ATTEMPTS = 4;
const backoffMs = (attempt: number) =>
  Math.min(30_000 * 2 ** (attempt - 1), 10 * 60_000) + Math.floor(Math.random() * 5_000);

// SUBSCRIBED to form.submitted (wired through the Event Dispatcher, NOT called
// inline by the submit mutation). Loads enabled actions, gates each on its
// conditional logic, and enqueues an isolated dispatch per action.
export const runActions = internalMutation({
  args: {
    formId: v.id("forms"),
    submissionId: v.id("form_submissions"),
    isComplete: v.boolean(),
    values: v.any(), // fieldName -> parsed value, from the form.submitted payload
  },
  handler: async (ctx, args) => {
    // Actions run on completion only; partials are ignored by default.
    if (!args.isComplete) return;

    const actions = await ctx.db
      .query("form_actions")
      .withIndex("by_form_enabled", (q) => q.eq("formId", args.formId).eq("enabled", true))
      .collect();
    actions.sort((a, b) => a.order - b.order); // explicit order

    for (const action of actions) {
      // IDEMPOTENCY: never re-process a (submission, action) already settled.
      const prior = await ctx.db
        .query("form_action_runs")
        .withIndex("by_submission_action", (q) =>
          q.eq("submissionId", args.submissionId).eq("formActionId", action._id))
        .first();
      if (prior && prior.status === "completed") continue;

      // CONDITIONAL: reuse the Field Engine evaluator against the submission values.
      const shouldRun = action.conditionalLogic?.enabled
        ? evaluateConditionalLogic(action.conditionalLogic, args.values)
        : true;

      const now = Date.now();
      if (!shouldRun) {
        // Record a terminal "skipped" outcome (not a failure) and move on.
        if (!prior) {
          await ctx.db.insert("form_action_runs", {
            submissionId: args.submissionId, formActionId: action._id,
            formId: args.formId, type: action.type,
            status: "skipped", attempts: 0, completedAt: now, createdAt: now,
          });
        }
        continue;
      }

      // Claim the run (or reuse a prior pending/failed row) and enqueue dispatch.
      let runId = prior?._id;
      if (!runId) {
        runId = await ctx.db.insert("form_action_runs", {
          submissionId: args.submissionId, formActionId: action._id,
          formId: args.formId, type: action.type,
          status: "pending", attempts: 0, createdAt: now, nextAttemptAt: now,
        });
      } else {
        await ctx.db.patch(runId, { status: "pending", nextAttemptAt: now });
      }

      // ISOLATION: one scheduled job per action. A failure here can't abort siblings.
      await ctx.scheduler.runAfter(0, internal.extensions.forms.actionRunner.dispatchAction, {
        runId,
      });
    }
  },
});

// Executes ONE action's run(), records the outcome, retries transient failures
// with backoff, finalizes + emits the event on success or terminal failure.
export const dispatchAction = internalAction({
  args: { runId: v.id("form_action_runs") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.runQuery(internal.extensions.forms.actionRunner.getRun, { runId });
    if (!run || run.status === "completed" || run.status === "skipped") return; // idempotent guard

    const action = await ctx.runQuery(internal.extensions.forms.actions.getActionInternal, {
      actionId: run.formActionId,
    });
    if (!action || !action.enabled) {
      // Action disabled/deleted mid-flight: do not run; leave run as-is (or mark skipped).
      return;
    }

    const def = getActionType(run.type);
    if (!def) {
      await ctx.runMutation(internal.extensions.forms.actionRunner.finalizeRun, {
        runId, status: "failed", error: `Unknown action type: ${run.type}`,
      });
      await emitFailed(ctx, run, `Unknown action type: ${run.type}`);
      return;
    }

    const attempt = run.attempts + 1;
    await ctx.runMutation(internal.extensions.forms.actionRunner.markAttempt, { runId, attempt });

    // Load the submission's parsed values for templating (from the event payload
    // mirror or re-read via the Submission system's getSubmission).
    const submission = await ctx.runQuery(
      internal.extensions.forms.submissions.getSubmissionInternal,
      { submissionId: run.submissionId },
    );

    let result: { ok: boolean; data?: unknown; error?: string; retryable?: boolean };
    try {
      result = await def.run(
        {
          formId: run.formId,
          submissionId: run.submissionId,
          values: submission?.valuesMap ?? {},
          attempt,
        },
        action.config,
      );
    } catch (err: any) {
      result = { ok: false, error: String(err?.message ?? err), retryable: isTransient(err) };
    }

    if (result.ok) {
      await ctx.runMutation(internal.extensions.forms.actionRunner.finalizeRun, {
        runId, status: "completed", result: result.data,
      });
      await ctx.runMutation(internal.events.dispatch, {
        eventCode: "form.action_completed",
        payload: { formId: run.formId, submissionId: run.submissionId,
                   actionType: run.type, result: result.data },
      });
      return;
    }

    const retryable = result.retryable ?? true; // default: assume transient unless told otherwise
    if (retryable && attempt < MAX_ATTEMPTS) {
      const delay = backoffMs(attempt);
      await ctx.runMutation(internal.extensions.forms.actionRunner.scheduleRetry, {
        runId, error: result.error, nextAttemptAt: Date.now() + delay,
      });
      await ctx.scheduler.runAfter(delay, internal.extensions.forms.actionRunner.dispatchAction, {
        runId,
      });
      return; // NOT a terminal failure — no action_failed event yet.
    }

    // Terminal failure: record + alert ONCE.
    await ctx.runMutation(internal.extensions.forms.actionRunner.finalizeRun, {
      runId, status: "failed", error: result.error,
    });
    await emitFailed(ctx, run, result.error ?? "Action failed");
  },
});

// helper: classify thrown errors as transient (retry) vs permanent.
function isTransient(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  if (typeof status === "number") return status >= 500 || status === 429;
  return true; // network/timeout/unknown -> transient by default
}
```

> The small `internalMutation`/`internalQuery` helpers referenced above (`getRun`, `markAttempt`, `scheduleRetry`, `finalizeRun`, `getActionInternal`, `emitFailed`) live alongside the runner; they are thin DB writes/reads split out so the `internalAction` (which can do I/O but not touch `ctx.db` directly) can mutate via `ctx.runMutation`. `finalizeRun` sets `status` + `completedAt`; `scheduleRetry` keeps `status: "pending"` and records `error` + `nextAttemptAt`.

### 10.3 Wiring to `form.submitted`

The runner is **not** invoked inline by the submit mutation — it is registered as a subscriber to `form.submitted` through the Event Dispatcher (same pattern the Notification System uses). The dispatcher delivers the `{ formId, submissionId, isComplete, values }` payload to `runActions`. This keeps the public submit path (Submission System §8) ignorant of actions entirely: it emits one event; this system, Notifications, and Analytics each react independently.

---

## 11. Business Rules & Constraints

- **Idempotency key = `submissionId + formActionId`.** Each action runs **at most once to completion** per submission. The `by_submission_action` index is the guard; a `completed` run is terminal and never re-executed (not on redelivery, not on retry, not on manual replay). This is the contract money actions rely on.
- **Partial failures are isolated per action.** Each action's `run()` executes in its own scheduled job. One action throwing, timing out, or exhausting retries never aborts, blocks, or rolls back the others. There is no all-or-nothing transaction across actions — by design, a failed CRM push must not undo a successful payment.
- **Money actions are delegated, never duplicated.** `subscription` and `payment` are implemented by the Form Commerce & Subscription Action System; this framework only invokes their registered `run()` and records the result. Their `run()` MUST be idempotent w.r.t. `(submissionId, formActionId)` so this system's retry envelope can never double-charge. This system contains zero Stripe code.
- **Conditional logic reuses the Field Engine evaluator.** Action gating uses the exact same `evaluateConditionalLogic` + shape as field logic — no parallel conditional implementation. An action whose condition is unmet is `skipped` (terminal, not a failure) and does not emit `action_failed`.
- **Order is explicit and honored.** Actions run in ascending `order`. The runner enqueues per-action jobs in order, but because jobs are isolated, ordering is a *dispatch* ordering, not a strict happens-before barrier; actions with a hard dependency (e.g. user must exist before subscription) document that dependency and the Commerce action re-reads state at run time rather than assuming a prior action's in-memory result.
- **Config is validated through the registered type.** `createAction` / `updateAction` call the action type's `validateConfig` (Zod-wrapped at the boundary); an unknown `type` or invalid `config` is rejected at save time, never discovered at run time.
- **Retry only transient failures, with capped backoff.** 5xx / 429 / network / timeout → retry with exponential backoff + jitter, up to `MAX_ATTEMPTS`. 4xx / validation / explicit `retryable:false` → fail immediately. `action_failed` fires once, on terminal failure only — never per retry.
- **Actions run on completion.** The runner ignores `isComplete: false` (partial / save-and-continue) submissions by default; a per-action "process on partial" opt-in is parked (§13).
- **Event after the run row commits.** `action_completed` / `action_failed` are scheduled with `runAfter(0, ...)` after `form_action_runs` is written — never inline, never before persistence.
- **Run history outlives config.** Deleting/editing a `form_actions` row does not delete its `form_action_runs`; runs denormalize `formId` + `type` so the audit trail survives config changes. (`form_action_runs` is append-mostly; rows are patched for status/attempts, never deleted by this system.)
- **Capability-gated authoring; ungated runtime.** All config + replay mutations require `form.manage_actions` (Admin/Editor). The runtime handlers (`runActions`/`dispatchAction`) are internal-only and never client-callable.
- **Additive-only (v2).** `form_actions` + `form_action_runs` are declared in the extension's schema fragment and merged by the scanner; this system never edits root `schema.ts`, `registry.ts`, or `nav-config.ts`.

---

## 12. Edge Cases

| Scenario | Handling |
|---|---|
| Action `run()` throws | Caught; classified via `isTransient`; transient → retry w/ backoff, permanent → `failed` + `action_failed`. Never bubbles out to abort siblings. |
| External call times out / 5xx / 429 | Transient → retry with exponential backoff + jitter up to `MAX_ATTEMPTS`, then terminal `failed`. |
| External call returns 4xx (bad request, auth) | Permanent → `failed` immediately, `action_failed` emitted; no retry (retrying won't fix a bad config/token). |
| Retry storm (many submissions hit a failing endpoint) | Per-run capped attempts + jittered backoff bound the load; terminal failures stop retrying. Each run is independent so one bad endpoint can't starve unrelated actions. (Provider-level circuit-breaking is an Open Question — §13.) |
| Action disabled / deleted mid-run | `dispatchAction` re-reads the action; if `enabled` is false or it's gone, it does not run (leaves/marks the run non-`completed`). New submissions skip a disabled action entirely in `runActions`. |
| Duplicate / redelivered `form.submitted` | Idempotency on `(submissionId, formActionId)`: a `completed` run is skipped; a `pending`/`failed` run is reused, not duplicated. No double side effects. |
| Two `dispatchAction` jobs race for one run | The `completed`/`skipped` guard at the top of `dispatchAction` + the terminal-status check make a second runner a no-op once the first finalizes; money-action idempotency in `run()` is the backstop. |
| Conditional logic references a field not in the submission | The engine evaluator treats a missing field per its operator semantics (e.g. `is_empty` true); action is `skipped` or runs accordingly — no throw. |
| Partial (save-and-continue) submission | Ignored by default (`isComplete:false`); no runs created. |
| Money action partially succeeds then this system retries | The Commerce `run()` is required idempotent (keyed on `submissionId+formActionId`), so the retry recognizes the prior charge and returns `ok` without re-charging. This system never invents its own charge dedup. |
| Submission deleted/trashed after submit but before dispatch | `dispatchAction` re-reads the submission; if absent, the action fails permanently (`failed`, no retry) — nothing to act on. |
| `form.action_completed` / `action_failed` dispatch fails after the run row is written | The run row is the source of truth; the event is rescheduled by the scheduler. Notifications may be delayed, never the run state. |
| Unknown action `type` at dispatch (type unregistered after config saved) | `failed` with `Unknown action type`; surfaced to admin via `action_failed`. Caught at save time normally; this is the defense-in-depth path. |

---

## 13. Implementation Checklist

**Phase 1 — framework (registry + data model)**
- [ ] Add `form_actions` + `form_action_runs` to the Forms extension schema fragment with the indexes in §4 (esp. `by_submission_action` for idempotency).
- [ ] Implement `actionRegistry.ts`: the `ActionTypeDefinition` interface + `registerActionType` / `getActionType` / `listActionTypes`.
- [ ] Implement config CRUD in `actions.ts` (`createAction`/`updateAction`/`reorderActions`/`deleteAction`/`listActions`), each `requireCan("form.manage_actions")` + `validateConfig` on save.

**Phase 2 — execution engine**
- [ ] Implement `runActions` (internalMutation) subscribed to `form.submitted` via the dispatcher: load enabled actions, sort by `order`, idempotency check, conditional gate (reuse `evaluateConditionalLogic`), enqueue isolated `dispatchAction` per action.
- [ ] Implement `dispatchAction` (internalAction): registry lookup, attempt bookkeeping, `run()`, success/transient/permanent branching, `finalizeRun`/`scheduleRetry` helpers.
- [ ] Emit `form.action_completed` / `form.action_failed` after the run row commits (terminal failure only for `action_failed`).
- [ ] Implement retry with exponential backoff + jitter + `MAX_ATTEMPTS`; transient vs permanent classification.

**Phase 3 — first-party P1 action types**
- [ ] `webhook` action type (templated body, headers, HMAC secret, 2xx success, 5xx/timeout retry).
- [ ] `lead_capture` action type (field→CRM-property mapping, provider in config).
- [ ] `email_marketing` action type (email + merge fields + list/tags, provider in config).

**Phase 4 — admin UI + ops**
- [ ] Build `/admin/forms/$formId/actions` route: ordered list (drag-reorder), enable toggles, per-type config editor, conditional-logic editor (shared with field logic).
- [ ] Surface `form_action_runs` history per submission (status chips) + the `replayRun` failed-run retry button.
- [ ] Verify the Notification System renders the "Form Action Failed" admin email + site notification off `form.action_failed`.

**Phase 5 — money actions (cross-system) + later types**
- [ ] Verify the Form Commerce & Subscription Action System registers `subscription` + `payment` into this registry and that its `run()` is idempotent under this system's retry.
- [ ] `account_registration` action type (P2): create/link `users`, optional sign-in/invite, ordered before money actions.

---

## 14. Open Questions

- **Run-on-partial opt-in:** should an action be configurable to run on a *partial* submission (e.g. abandoned-cart-style email_marketing on first save), or is completion-only the permanent contract? Default: completion-only; revisit with Multi-Step + email_marketing use cases.
- **Provider-level circuit breaking:** beyond per-run capped retries, do we want a per-endpoint/per-provider breaker that pauses dispatch after N consecutive failures across submissions? Parked pending real failure-rate data; per-run caps + jitter are the v1 bound.
- **Ordering guarantees:** dispatch is ordered but isolated (not a strict barrier). If a future action type needs a hard happens-before on a prior action (beyond Commerce re-reading state), do we add an optional "await previous action" mode that chains dispatch? Default: re-read state in `run()`; revisit only if a concrete need appears.
- **`values` payload vs re-read:** the runner can template from the `form.submitted` `values` map or re-read `getSubmission`. Heavy file/relational answers argue for re-read; scalar-heavy CRM/marketing maps argue for the event payload. Default: re-read the submission inside `dispatchAction` for correctness; confirm payload-size tradeoff with the Submission System's Open Question on `values` size.
- **Retry tuning:** `MAX_ATTEMPTS` (4) and the backoff schedule (30s/2m/10m cap) are starting defaults — confirm against real webhook/CRM provider rate limits; consider per-action-type overrides.
- **Manual replay scope:** replay re-runs a single failed run; do we also want a "replay all failed for this submission" or "replay all failed for this form" bulk op for ops recovery after a provider outage? Parked.

---

## 15. Cross-References

- Triggered by (event source + entry model): Form Submission System (`specs/ConvexPress/systems/form-submission-system/PRD.md`)
- Concrete money actions delegated to: Form Commerce & Subscription Action System (`specs/ConvexPress/systems/form-commerce-subscription-action/PRD.md`)
- Failure notifications owned by: Form Notification System (`specs/ConvexPress/systems/form-notification-system/PRD.md`)
- Conditional-logic evaluator reused from: Form Field Engine (`specs/ConvexPress/systems/form-field-engine/PRD.md`)
- Run history surfaced by: Form Entry Management System (`specs/ConvexPress/systems/form-entry-management-system/PRD.md`)
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Actions & Feeds System · **Plugin:** ConvexPress Forms (v2)
