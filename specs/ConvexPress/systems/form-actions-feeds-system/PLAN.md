# PLAN: Form Actions & Feeds System (ConvexPress Forms v2)

Lean, ordered build plan for the post-submit action framework. PRD: `./PRD.md`.

> **Reality check — build on what EXISTS, not the PRD's idealized model.** The `form_actions` + `form_action_runs` tables are already declared in `packages/backend/convex/extensions/forms/schema.ts` and shipped. They differ from the PRD §4 sketch and **we do not rewrite them** (NEVER-remove-functionality rule + avoids a destructive migration). Concrete differences the runner code MUST honor:
> - `form_actions.config` is `v.string()` (JSON-encoded), **not** `v.any()`.
> - `form_actions.conditionalLogic` is `v.optional(v.string())` (JSON-encoded), **not** an object. This is exactly the shape the existing `evaluateConditionalLogic(jsonString, valueMap)` expects.
> - `form_action_runs.status` union is `pending | completed | failed | awaiting_payment` (NO `skipped`). Skips are recorded as terminal `completed` rows tagged in `result` JSON (`{"skipped":true,"reason":...}`), OR we add `skipped` to the union as an additive schema edit (see Step 0 decision). Default: **tag-in-result**, no schema change.
> - `form_action_runs` has NO `formId`, NO `order`, NO `nextAttemptAt`, NO `startedAt/completedAt` — only `createdAt`/`updatedAt`. Denormalize `formId` and retry timing into the `result`/`error` JSON, or add columns additively (Step 0). Default: **add the three columns additively** (`formId`, `nextAttemptAt`, optional) since they are load-bearing for the runner and the admin run-history view; this is a pure additive schema edit to the extension fragment, allowed by v2.
> - The runner sorts by the `order` column that already exists on `form_actions` (good — matches PRD).

> **Event payload reality.** `form.submitted` is emitted by `extensions/forms/mutations.ts:submit` with `values: "<omitted-for-size>"` (the 100KB dispatcher cap). The runner **MUST re-read the submission's answers** via an internal query over `fieldValues` (entityType="form_submission") — it cannot template from the event payload. This resolves PRD §14's "values vs re-read" Open Question in favor of re-read.

> **Listener wiring reality.** The real dispatcher (`events/internals.ts:processEvent`) invokes every handler with `{ eventId }` ONLY. Handlers load the event (`ctx.db.get("events", eventId)`) and `JSON.parse(event.payload)` themselves. Listeners are registered as rows in `bootstrap/registerListeners.ts` (the `LISTENER_DEFINITIONS` array), NOT via any decorator. So `runActions` takes `{ eventId }`, not the destructured payload the PRD §10.2 shows.

> **Emitting from an action.** `dispatchAction` is an `internalAction` (does I/O) and CANNOT call `emitEvent` (needs `MutationCtx`). Mirror the canonical pattern (`media/internals.ts:emitMediaEditedEvent`): a small `internalMutation` `emitActionEvent` that lazily imports `emitEvent` + `FORM_EVENTS`/`SYSTEM` and is called via `ctx.runMutation(internal.extensions.forms.actionRunner.emitActionEvent, …)`.

---

## File map (what gets created / touched)

| Path | Action |
|---|---|
| `packages/backend/convex/extensions/forms/schema.ts` | EDIT — additive columns on `form_action_runs` (`formId`, `nextAttemptAt`) + indexes `by_form_status`, `by_status`; add `by_form_enabled`/`by_form_order` on `form_actions` (currently only `by_form`). |
| `packages/backend/convex/extensions/forms/actionRegistry.ts` | NEW — `ActionTypeDefinition` interface + `registerActionType`/`getActionType`/`listActionTypes`. |
| `packages/backend/convex/extensions/forms/actionTypes.ts` | NEW — first-party P1 types (`webhook`, `lead_capture`, `email_marketing`) + their Zod config validators; calls `registerActionType` at module load. |
| `packages/backend/convex/extensions/forms/actions.ts` | NEW — config CRUD mutations + admin queries + `replayRun` (all `requireCan("form.manage_actions")`) + internal `getActionInternal`. |
| `packages/backend/convex/extensions/forms/actionRunner.ts` | NEW — `runActions` (internalMutation, `{eventId}`), `dispatchAction` (internalAction), helper internal mutations/queries (`getRun`, `markAttempt`, `scheduleRetry`, `finalizeRun`, `emitActionEvent`), internal `getSubmissionValues`. |
| `packages/backend/convex/events/constants.ts` | EDIT (hub) — add `ACTION_COMPLETED`/`ACTION_FAILED` to `FORM_EVENTS`. NOTE: hub file, not an extension file — see Step 6 caveat. |
| `packages/backend/convex/bootstrap/registerListeners.ts` | EDIT (hub) — add one `ListenerDef` row: `form.submitted` → `extensions/forms/actionRunner.runActions` (handlerType `internal`). |
| `apps/web/src/routes/_authenticated/_admin/forms/$formId/actions.tsx` | NEW — actions list (drag-reorder), per-type config editor, conditional-logic editor (reuse `ConditionalLogicBuilder`), run-history panel + replay button. |
| `apps/web/src/extensions/forms/nav.ts` | EDIT — add a child nav entry for the actions screen (optional; the route is reachable from the form edit screen regardless). |

> The forms extension currently has NO `internalMutation`/`internalAction`/`internalQuery` imports anywhere; the new runner files import them from `../../_generated/server`.

---

## Build steps (ordered)

### Step 0 — Schema reconciliation (decide + additive edits)
File: `packages/backend/convex/extensions/forms/schema.ts`
- On `form_actions`, ADD indexes (additive): `.index("by_form_enabled", ["formId", "enabled"])` and `.index("by_form_order", ["formId", "order"])`. Keep existing `by_form`.
- On `form_action_runs`, ADD (additive, all optional so existing rows stay valid): `formId: v.optional(v.id("forms"))`, `nextAttemptAt: v.optional(v.number())`. ADD indexes `.index("by_form_status", ["formId", "status"])` and `.index("by_status", ["status"])`. Keep existing `by_submission`, `by_submission_action`.
- DO NOT change `config`/`conditionalLogic` types (stay JSON strings). DO NOT remove `awaiting_payment`. Decision: do **not** add a `skipped` status — record skips as terminal `completed` with `result = JSON.stringify({ skipped: true, reason })`. (If a later phase wants a distinct chip, add `skipped` to the union then; additive.)
- Run `bun run codegen:extensions` (regenerates `schema/_extensionsIndex.generated.ts`). Verify no `schema.ts` hub edit was needed.

### Step 1 — Action-type registry
File: `actionRegistry.ts` (NEW)
- Define `ActionResult { ok: boolean; data?: unknown; error?: string; retryable?: boolean }`.
- Define `ActionRunContext { formId; submissionId; values: Record<string,string>; attempt: number }`. (Use `Record<string,string>` to match the `fieldValues`/evaluator value shape, not the PRD's `unknown`.)
- Define `ActionTypeDefinition<TConfig> { type; label; validateConfig(config): { valid; error? }; run(ctx, config): Promise<ActionResult> }`.
- Module-level `const REGISTRY = new Map<string, ActionTypeDefinition>()`. Export `registerActionType`, `getActionType`, `listActionTypes`. Idempotent re-register (overwrite by `type`) so HMR/re-import is safe.

### Step 2 — First-party P1 action types
File: `actionTypes.ts` (NEW)
- Implement `webhook`: `validateConfig` (Zod: `url` https required, optional `headers` record, optional `secret`, optional `bodyTemplate`); `run` does `fetch(url, { method:"POST", … })`, templates body from `ctx.values`, computes HMAC over the body when `secret` set, success = 2xx, returns `{ ok:false, retryable:true }` on 5xx/429/network and `{ ok:false, retryable:false }` on 4xx.
- Implement `lead_capture` and `email_marketing` as **provider-dispatch stubs with real `validateConfig`** (field→property map / list+merge-fields) and a `run` that POSTs to the configured provider endpoint or returns a clear `{ ok:false, retryable:false, error:"provider not configured" }` when creds are absent. (Full provider SDKs are out of P1 scope per PRD §5; the framework is what we're validating.)
- `account_registration`, `subscription`, `payment` are NOT implemented here (P2 / Commerce system).
- At the bottom: call `registerActionType(...)` for each P1 type. This module must be imported once so registration runs — import it from `actionRunner.ts` and `actions.ts` (side-effect import) so both the runner and the CRUD validator see the registry.

### Step 3 — Config CRUD + admin queries
File: `actions.ts` (NEW). Mirror `extensions/forms/mutations.ts` conventions exactly: `import { mutation, query, internalQuery } from "../../_generated/server"`, `requireCan` + `getUserIdentifier` from `../../helpers/permissions`, the local `formCap(cap)` cast helper, `ConvexError` for validation.
- `createAction({ formId, type, label, config (string), conditionalLogic? (string), enabled? })`: `requireCan(formCap("form.manage_actions"))`; `getActionType(type)` → 404 if unknown; `JSON.parse(config)` then `def.validateConfig(parsed)` → throw `ConvexError({code:"INVALID_CONFIG"})` if invalid; `order` = max(existing by_form_order) + 1; insert.
- `updateAction({ actionId, label?, config?, conditionalLogic?, enabled? })`: re-validate config through `getActionType(action.type).validateConfig` when `config` provided; patch provided fields.
- `reorderActions({ formId, orderedIds })`: patch each row `order = index`.
- `deleteAction({ actionId })`: delete the config row (run history retained).
- `listActions({ formId })`: `requireCan`, return `by_form_order` ascending.
- `listRunsForSubmission({ submissionId })`: `requireCan`, return `by_submission` rows.
- `listRecentRuns({ formId, status? })`: `requireCan`, return `by_form_status` (or `by_form` join) for the actions-screen history panel.
- `availableActionTypes()` (query): `requireCan`, return `listActionTypes().map(d => ({ type:d.type, label:d.label }))` for the editor's type picker.
- `replayRun({ runId })`: `requireCan`; no-op if `status==="completed"`; else patch `status:"pending", attempts:0, error:undefined, nextAttemptAt:Date.now(), updatedAt:now` and `ctx.scheduler.runAfter(0, internal.extensions.forms.actionRunner.dispatchAction, { runId })`.
- `getActionInternal` (internalQuery): `ctx.db.get(actionId)` — used by `dispatchAction` to re-read enabled/config mid-flight.

### Step 4 — The runner: `runActions` (internalMutation)
File: `actionRunner.ts` (NEW). Side-effect import `./actionTypes`. `import { internal } from "../../_generated/api"`, `evaluateConditionalLogic` from `./conditionalLogic`.
- Signature: `runActions({ eventId: v.id("events") })` — **load the event yourself**: `const event = await ctx.db.get("events", eventId); if (!event) return; const p = JSON.parse(event.payload);` Pull `formId`, `submissionId`, `isComplete`.
- `if (!p.isComplete) return;` (partials skipped).
- Re-read answers: query `fieldValues` by `(entityType="form_submission", entityId=submissionId)`, build `valueMap: Record<string,string>` of `fieldKey → value` (this is what `evaluateConditionalLogic` consumes; also passed to action `run`). Reuse the `by_entity` index from `queries.ts:getSubmission`.
- Load enabled actions: `by_form_enabled` (formId, enabled=true); `.sort((a,b)=>a.order-b.order)`.
- For each action, in order:
  - **Idempotency**: query `by_submission_action` (submissionId, formActionId). If a row exists and `status==="completed"`, `continue`.
  - **Conditional**: `const shouldRun = evaluateConditionalLogic(action.conditionalLogic, valueMap)` (string-in, fail-open — exactly the existing evaluator; `undefined` ⇒ always run).
  - **Skip path**: if `!shouldRun`, insert (when no prior row) a terminal `completed` run tagged `result: JSON.stringify({ skipped:true })` with `formId`, `type`, `attempts:0`; `continue`.
  - **Claim**: reuse a prior pending/failed row (`patch status:"pending", nextAttemptAt:now`) or insert a new run (`status:"pending", attempts:0, formId, type, createdAt/updatedAt:now, nextAttemptAt:now`).
  - **Isolation**: `ctx.scheduler.runAfter(0, internal.extensions.forms.actionRunner.dispatchAction, { runId })` — one job per action.

### Step 5 — The runner: `dispatchAction` (internalAction) + retry
File: `actionRunner.ts` (same file).
- `const MAX_ATTEMPTS = 4;` `const backoffMs = (n) => Math.min(30_000 * 2 ** (n-1), 600_000) + Math.floor(Math.random()*5_000);`
- `dispatchAction({ runId })`: `runQuery(getRun)` → bail if missing or `status` in `{completed}` (skipped is stored as completed, so also bail). Re-read action via `getActionInternal`; if missing/`!enabled`, return (leave run non-completed).
- `getActionType(run.type)` → if undefined: `finalizeRun(failed, "Unknown action type")` + `emitActionEvent(failed)`; return.
- `attempt = run.attempts + 1`; `markAttempt(runId, attempt)`.
- Re-read `valueMap` via internal `getSubmissionValues({ submissionId })` (same fieldValues read as Step 4, exposed as an internalQuery so the action can call it).
- `try { result = await def.run({ formId, submissionId, values, attempt }, JSON.parse(action.config)); } catch (err) { result = { ok:false, error:String(err?.message ?? err), retryable: isTransient(err) }; }`
- Success: `finalizeRun(completed, result.data)` then `emitActionEvent({ kind:"completed", formId, submissionId, actionType: run.type, result: result.data })`.
- Transient (`(result.retryable ?? true)` && `attempt < MAX_ATTEMPTS`): `scheduleRetry(runId, result.error, Date.now()+delay)` + `ctx.scheduler.runAfter(delay, …dispatchAction, { runId })`; **no event** (not terminal).
- Terminal failure: `finalizeRun(failed, undefined, result.error)` + `emitActionEvent({ kind:"failed", …, error })`.
- `isTransient(err)`: `status>=500 || status===429 ⇒ true`, otherwise `true` for network/unknown (matches PRD §10.2).
- Helper internal mutations/queries in this file:
  - `getRun` (internalQuery): `ctx.db.get(runId)`.
  - `markAttempt` (internalMutation): patch `attempts`, `updatedAt`.
  - `scheduleRetry` (internalMutation): patch `status:"pending"`, `error`, `nextAttemptAt`, `updatedAt`.
  - `finalizeRun` (internalMutation): patch `status`, `result?` (JSON.stringify), `error?`, `updatedAt`.
  - `getSubmissionValues` (internalQuery): returns `Record<string,string>` from `fieldValues`.
  - `emitActionEvent` (internalMutation): lazily `import("../../helpers/events")` + `import("../../events/constants")`; call `emitEvent(ctx, FORM_EVENTS.ACTION_COMPLETED|ACTION_FAILED, SYSTEM.FORMS, payload)`.

### Step 6 — Event codes + listener registration (hub edits)
- `events/constants.ts`: add to `FORM_EVENTS`: `ACTION_COMPLETED: "form.action_completed"`, `ACTION_FAILED: "form.action_failed"`. (Both are auto-picked into `ALL_EVENT_CODES`/`EVENT_CODES_BY_SYSTEM` since those spread `FORM_EVENTS`.) `emitEvent` only **warns** on unrecognized codes, so this is for catalog/type-safety hygiene, not a hard gate.
  - CAVEAT: `events/constants.ts` is a platform hub file, not an extension file. The v2 additive rule forbids extensions editing `schema.ts`/`registry.ts`/`nav-config.ts` — `constants.ts` is not on that list, and `FORM_EVENTS` already lives there (the Forms extension's other events are registered there too), so editing it is consistent with the existing forms wiring. Keep the diff to two added keys.
- `bootstrap/registerListeners.ts`: append ONE `ListenerDef` to `LISTENER_DEFINITIONS`:
  ```
  { eventCode: "form.submitted", name: "Forms: Run post-submit actions",
    handlerModule: "extensions/forms/actionRunner", handlerFunction: "runActions",
    handlerType: "internal", priority: 30, maxRetries: 3, retryDelayMs: 2000,
    retryBackoff: "exponential", system: "forms",
    description: "Loads enabled form actions, evaluates conditional logic, enqueues isolated per-action dispatch." }
  ```
  `resolveHandler` walks `internal.extensions.forms.actionRunner.runActions` from the `"extensions/forms/actionRunner"` path — confirm the module is in `_generated/api` after codegen.
- After deploy, the listener row must be inserted: run `internal.bootstrap.registerListeners.run` (idempotent). Note this in the verify checklist — without it, `form.submitted` never reaches `runActions`.

### Step 7 — Admin route: `/admin/forms/$formId/actions`
File: `apps/web/src/routes/_authenticated/_admin/forms/$formId/actions.tsx` (NEW). Mirror `forms/$formId/edit.tsx` + `forms/index.tsx`: wrap in `<PluginGuard pluginId="forms">`, `useCan(formCap("form.manage_actions"))`, `useQuery` from `convex-helpers/react/cache`, Base UI components (NO Radix), CSS-variable colors, full-page (no modal editors; confirm dialog only for delete).
- Sections: (1) ordered action list with enable toggle, type, label, conditional summary, drag-to-reorder → `reorderActions`; (2) "Add action" → type picker from `availableActionTypes`, then per-type config editor (form driven by the type's config schema) → `createAction`; (3) edit/delete per row; (4) run-history panel reading `listRecentRuns`/`listRunsForSubmission` with status chips (pending/completed/failed/skipped-from-result/awaiting_payment) + a **Replay** button on failed rows → `replayRun`.
- Conditional-logic editor: reuse the existing `ConditionalLogicBuilder` (`apps/web/src/components/custom-fields/conditionalLogic.ts` shape) so action gating uses the same UI + JSON shape the evaluator already parses.
- `nav.ts` (optional): add a `children` entry `{ id:"forms-actions", label:"Actions", to:"/forms/$formId/actions", capability: formCap("form.manage_actions") }` — but since it needs `$formId`, prefer surfacing the link from the form edit screen (a top tab) rather than the global nav.

---

## Verify checklist

**Backend types + schema**
- [ ] `bun run codegen:extensions` succeeds; `schema/_extensionsIndex.generated.ts` unchanged in structure (forms already present); root `schema.ts` NOT edited.
- [ ] `bunx convex dev` (or the deployment expert's deploy) compiles with NO `--typecheck=disable`. Suppress only genuine Convex TS2589/TS7006 false positives with scoped `@ts-expect-error` (matching `registerListeners.ts` precedent) — do not disable typecheck.
- [ ] `_generated/api.d.ts` lists `extensions/forms/actionRegistry`, `extensions/forms/actionTypes`, `extensions/forms/actions`, `extensions/forms/actionRunner`.
- [ ] `form_action_runs` additive columns (`formId`, `nextAttemptAt`) are optional → existing rows still validate. `awaiting_payment` still in the union.

**Frontend types**
- [ ] `cd apps/web && bun run check-types` (`tsc --noEmit`) passes.

**Wiring**
- [ ] After deploy, `internal.bootstrap.registerListeners.run` was executed and an `eventListeners` row exists for `form.submitted` → `extensions/forms/actionRunner.runActions` (query the table or re-run; it's idempotent).
- [ ] `availableActionTypes` returns `webhook`, `lead_capture`, `email_marketing` (proves `actionTypes.ts` side-effect import ran).

**Functional smoke (Playwright on the admin app, per hardening playbook)**
- [ ] On `/forms/$formId/actions`: add a `webhook` action (point at a request-bin/`https://httpbin.org/post`), enable it, save. Reorder two actions and confirm `order` persists on reload.
- [ ] Submit the published form (public path). Confirm a `form_action_runs` row goes `pending → completed`, the webhook bin received the POST with templated body, and a `form.action_completed` event row exists.
- [ ] Add a webhook pointing at a 500 endpoint; submit; confirm the run retries (attempts increment, `nextAttemptAt` advances) and lands `failed` after `MAX_ATTEMPTS` with ONE `form.action_failed` event (not one per retry). Click **Replay** → run re-enters `pending`.
- [ ] Add conditional logic (e.g. process-only-when a field == X); submit a non-matching entry; confirm a terminal run row tagged `{skipped:true}` and NO `action_failed`.
- [ ] Idempotency: re-emit `form.submitted` for the same submission (manual replay of the event, or re-run); confirm the already-`completed` webhook action does NOT fire twice (the bin gets no second POST).
- [ ] Per-action isolation: configure a failing action BEFORE a succeeding one in `order`; confirm the second still completes despite the first failing.

**Capability gate**
- [ ] As a role lacking `form.manage_actions` (e.g. Author), the actions route fails closed (PluginGuard/useCan) and the CRUD mutations throw on `requireCan`.

---

## Out of scope (do not build here)
- `subscription` / `payment` action `run()` + any Stripe code → Form Commerce & Subscription Action System (registers into this registry).
- The "Form Action Failed" email + site notification rendering/delivery → Form Notification System (this system only EMITS `form.action_failed`).
- The submit pipeline, field validation, `form.submitted` emission, `form_submissions`/`fieldValues` model → Form Submission System.
- The conditional-logic evaluator implementation → reused verbatim from `extensions/forms/conditionalLogic.ts` (do not fork).
- Registering the `form.manage_actions` capability into the Role union → Role/Capability expert (this system surfaces it via the `formCap` cast, mirroring the existing 7 form caps).
