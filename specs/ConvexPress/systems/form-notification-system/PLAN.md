# PLAN: Form Notification System (LEAN implementation)

> Companion to `PRD.md`. This is the build sheet: ordered steps, exact file paths (verified against the real repo), and a verify checklist. Read the PRD §6/§8/§9 for intent; read **§0 Ground Truth** below for where the PRD pseudocode diverges from the actual codebase — those deltas are load-bearing.

**Repo root:** `/Users/worsin/Development/ConvexPress/ConvexPress-Admin`
**Backend root:** `packages/backend/convex/` (the PRD's `packages/backend/convex/...` is correct; the PRD's `apps/web/...` prefix maps to the real `apps/web/src/...`).
**This is a v2 extension** — backend lives at `packages/backend/convex/extensions/forms/`, frontend at `apps/web/src/extensions/forms/` + routes at `apps/web/src/routes/_authenticated/_admin/forms/`.

---

## 0. Ground Truth — where reality differs from the PRD pseudocode

Confirmed by reading the codebase. **Do not follow the PRD §8.3 pseudocode literally**; follow these:

1. **The schema table already exists** (`packages/backend/convex/extensions/forms/schema.ts`, lines 102–117). Its fields are **JSON-encoded strings**, not objects:
   - `toExpression`, `subjectTemplate`, `messageTemplate`: `v.optional(v.string())`
   - `conditionalLogic`: `v.optional(v.string())` (a JSON string, same convention as `fieldDefinitions.conditionalLogic`)
   - `triggerEventCode`: `v.string()`
   - Indexes present: `by_form`, `by_form_event`. **No `by_form_enabled`** (PRD §9.1 lists one that isn't there — don't depend on it; filter `enabled` in code).
   - **No `createdAt`/`updatedAt`/audit columns** on the table. Do **not** write them (the schema has none; writing unknown fields fails). Skip the PRD's `createdAt/updatedAt`.

2. **The Event Dispatcher invokes consumer handlers with `{ eventId }` ONLY** — NOT `{ eventCode, payload }`. See `events/internals.ts` line 205 (`const handlerArgs = { eventId: args.eventId }`). The dispatch handler must **load the event row itself** (`ctx.db.get("events", eventId)`), then `JSON.parse(event.payload)`. Mirror the email pattern `getEventRecord()` in `emails/internals.ts` lines 98–105 and the consumer shape of `emails/internals.ts` `onUserRegistered` (line 1129).

3. **The emitted `form.submitted` payload does NOT contain field values.** `extensions/forms/mutations.ts` line 717–724 emits `values: "<omitted-for-size>"` (the dispatcher enforces a 100 KB payload cap). Therefore the dispatch handler **MUST load answers from the DB**, not from the payload:
   - Query `fieldValues` by `withIndex("by_entity", q => q.eq("entityType","form_submission").eq("entityId", submissionId as string))` (see `extensions/forms/queries.ts` line 138 for the exact index/usage).
   - Build the `valueMap` as `fieldName -> value` AND `fieldKey -> value` (conditional logic references field **key**; merge tags reference field **name**). The `fieldValues` row carries both `fieldName` and `fieldKey`.
   - Payload reliably provides: `formId`, `submissionId`, `isComplete` (submitted); `resumeToken` (progress_saved); `actionId`/`error` (action_failed, once that producer exists).

4. **There is NO Merge Tags system / `resolveMergeTags` in the repo.** The PRD delegates templating to a "Form Merge Tags & Prefill System" that does not exist yet. The closest primitive is `helpers/notification.ts` `interpolateTemplate` (simple `{key}` replacement) and `emails` `renderTemplate`. **LEAN decision:** ship a small local resolver `extensions/forms/mergeTags.ts` in THIS build (see Step 4). It is the one piece of net-new logic. Keep it tiny and self-contained so a future Merge Tags system can replace it behind the same `resolveMergeTags(template, ctx)` signature.

5. **Site-channel delivery is constrained.** `notifications/internals.send` (the site-notification creator) hard-rejects any `notificationKey` not in the closed `NOTIFICATION_KEY_SET` (`notifications/validators.ts` lines 49–122; `internals.ts` line 153). There are **no form_* keys** and the registry is **owned by the Role/Notification expert, not this extension** (see CLAUDE.md "You don't modify the Role/Capability registry" + the notification key registry is the same kind of closed system). So the form `site` channel cannot cleanly call `notifications.internals.send` for an arbitrary form notification today.
   - **LEAN decision:** for the `site` channel, write the in-app admin notification **directly** via a thin internal mutation in this extension that inserts a `notifications` row (or, if the `notifications` table insert shape is owned/guarded, defer the `site` channel to a follow-up and ship `email` channel first). Step 5 picks the direct-insert path and flags the registry dependency. Do **not** invent new global notification keys in `notifications/validators.ts` — that's the other expert's file.

6. **`form.action_failed` is not a registered event code.** `FORM_EVENTS` (`events/constants.ts` line 336) has `CREATED/UPDATED/DELETED/SUBMITTED/PROGRESS_SAVED/ENTRY_UPDATED/ENTRY_DELETED` — **no `action_failed`**. The producer (Form Actions & Feeds System) is out of scope here. Binding the consumer is still safe (data-driven listener). Step 1 adds `ACTION_FAILED: "form.action_failed"` to `FORM_EVENTS` so the listener + config validator have a canonical code; the producer lands later.

7. **Editor is full-page, not a drawer.** PRD §3 says "editor drawer," but the project rule (CLAUDE.md: *"Full-page navigation, no modal-based content editors. Confirmation dialogs are the only allowed popup."*) overrides. Build an inline/expand-in-place editor on the route, not a modal/drawer. There is no `Drawer`/`Sheet` primitive anyway (only `dialog.tsx`, reserved for confirmations).

8. **Capabilities are surfaced, not registered here.** `form.manage_notifications` is not yet in the closed `Capability` union (`types/capabilities.ts`). Follow the existing forms convention: a local `formCap(cap: string): Capability` cast at every call site (see `extensions/forms/mutations.ts` lines 56–58 and `apps/web/src/extensions/forms/nav.ts`). The Role expert registers it later; the cast becomes a no-op.

9. **Listener registration is a hub edit.** Consumers are registered in `bootstrap/registerListeners.ts` (the `LISTENER_DEFINITIONS` array). This is technically a "hub" file, but it's the **only** registration mechanism and every system (including commerce) edits it; the Forms `submit` mutation already emits its events. Adding three `ListenerDef` entries here is the accepted seam. Note it in the PR; it is not the same prohibition as `schema.ts`/`registry.ts`/`nav-config.ts` (which have scanners — this file has none).

---

## 1. Backend — schema check + event code

**No schema change needed** (table exists). Only:

- [ ] **`packages/backend/convex/extensions/forms/schema.ts`** — confirm the existing `form_notifications` block (lines 102–117) is sufficient. It is. Do not add columns. (If a `lastFiredAt`/`fireCount` observability counter is wanted per PRD §14, that is OUT of this lean scope — skip.)
- [ ] **`packages/backend/convex/events/constants.ts`** — add `ACTION_FAILED: "form.action_failed",` to the `FORM_EVENTS` object (line ~344). It is auto-included in `ALL_EVENT_CODES`/`EVENT_CODE_SET` via the existing spread (line 384). This makes the code known to `isValidEventCode` so the consumer doesn't warn.

---

## 2. Backend — config CRUD (capability-gated)

Create **`packages/backend/convex/extensions/forms/notifications.ts`**. API path: `api.extensions.forms.notifications.*`. Mirror the import + `formCap` + `requireCan` style of `extensions/forms/mutations.ts`.

Imports: `mutation, query, internalMutation, internalAction` from `../../_generated/server`; `internal` from `../../_generated/api`; `v`, `ConvexError` from `convex/values`; `requireCan` from `../../helpers/permissions`; `evaluateConditionalLogic` from `./conditionalLogic`; the new `resolveMergeTags`, `isValidEmail` from `./mergeTags` (Step 4); `FORM_EVENTS` from `../../events/constants`.

Build these exports (all CRUD gated by `requireCan(ctx, formCap("form.manage_notifications"))`):

- [ ] `listForForm({ formId })` — **query**. Gate, then `query("form_notifications").withIndex("by_form", q => q.eq("formId", formId)).collect()`, sorted by `order` ascending. (Matches PRD §8.2; the public list stays gated.)
- [ ] `create({ formId, name, channel, recipientType, toExpression?, subjectTemplate?, messageTemplate?, triggerEventCode, conditionalLogic?, enabled? })` — **mutation**.
  - `channel`: `v.union(v.literal("email"), v.literal("site"))`.
  - `recipientType`: `v.union(v.literal("admin"), v.literal("customer"))`.
  - `triggerEventCode`: `v.union(v.literal("form.submitted"), v.literal("form.progress_saved"), v.literal("form.action_failed"))`.
  - `conditionalLogic`: `v.optional(v.string())` (JSON string — same shape `ConditionalLogicData` the field engine uses; validate parseable, else throw `VALIDATION_ERROR`).
  - Compute `order` = current sibling count (`by_form` collect length). Default `enabled` to `true`. **Do NOT write createdAt/updatedAt** (no such columns).
- [ ] `update({ notificationId, patch })` — **mutation**. `patch` is an object of all-optional config fields (same union types as create; `conditionalLogic` optional string). Patch only provided keys. (Covers enable/disable via `patch.enabled`.) **No updatedAt.**
- [ ] `reorder({ formId, orderedIds })` — **mutation**. `Promise.all(orderedIds.map((id, i) => ctx.db.patch(id, { order: i })))`.
- [ ] `remove({ notificationId })` — **mutation**. `ctx.db.delete(notificationId)`.
- [ ] `_enabledRowsForEvent({ formId, triggerEventCode })` — **internalQuery** (NOT exported to clients). Used by dispatch. `withIndex("by_form_event", q => q.eq("formId", formId).eq("triggerEventCode", triggerEventCode))`, filter `row.enabled === true`, sort by `order`. (PRD calls this `_enabledRows`; name it `_enabledRowsForEvent` and make it an `internalQuery` — the dispatch action calls it via `ctx.runQuery`.)

> TS note (per project MEMORY: "Typecheck must pass on deploy"): expect Convex TS2589 false positives on the generated-API union types. Suppress with scoped `// @ts-expect-error TS2589: ...` exactly as `notifications/internals.ts` and `emails/internals.ts` do — do NOT disable typecheck.

---

## 3. Backend — capability surface

- [ ] **`apps/web/src/extensions/forms/nav.ts`** — no change required for the route to work (the `/forms` prefix already grants admin access via `adminAccessPrefixes`), but optionally add a child nav link is unnecessary; the Notifications screen is reached from the form, not top-level nav. Skip nav edits.
- [ ] Capability `form.manage_notifications` is **surfaced** by the CRUD `requireCan` call sites (Step 2) via `formCap(...)`. **Do not** edit the Role/Capability registry or `types/capabilities.ts` (CLAUDE.md hard rule). Leave a one-line `// SURFACED capability: form.manage_notifications (registered by Role expert)` comment near the top of `notifications.ts`, matching the existing forms pattern.

---

## 4. Backend — local merge-tag resolver (the only net-new logic)

Create **`packages/backend/convex/extensions/forms/mergeTags.ts`**. Tiny, pure, dependency-light. Self-contained so a future Merge Tags system can swap it.

- [ ] `export function isValidEmail(s: string): boolean` — reuse the regex shape from `emails/actions.ts` line 7 (or import the existing `isValidEmail` from `helpers/email.ts` if exported — check; prefer reuse).
- [ ] `export interface MergeContext { form: Doc<"forms">; valueByName: Record<string,string>; payload: Record<string,unknown>; settings: { adminEmail: string } }`.
- [ ] `export function resolveMergeTags(template: string | undefined, ctx: MergeContext): string` — synchronous string→string. Support exactly the tokens the seeded defaults use (PRD §12), keep the grammar minimal:
  - `{field:<name>}` → `ctx.valueByName[name] ?? ""`
  - `{form:title}` → `ctx.form.title`
  - `{form:resume_url}` → built from `ctx.payload.resumeToken` (website forms URL + `?resume=<token>`; if no token, empty)
  - `{form:admin_entry_url}` → `/admin/forms/<formId>/entries/<submissionId>` (admin deep link)
  - `{settings:admin_notification_email}` → `ctx.settings.adminEmail`
  - `{submission:id}` → `payload.submissionId`; `{submission:date}` → formatted `submittedAt`
  - `{action:error}` → `payload.error ?? ""`
  - `{all_fields}` → a simple HTML/`<br>` list of `valueByName` entries (label optional; name is fine for lean)
  - Unknown/empty tokens → render empty string (don't crash, don't leave the literal). One regex pass over `\{([a-z_]+):([^}]+)\}` plus the no-arg `{all_fields}`.
- [ ] Add a 1-file unit test seam later if time permits (`extensions/forms/__tests__/mergeTags.test.ts`), mirroring `helpers/__tests__/notification.test.ts`. Optional for MVP.

---

## 5. Backend — the internal dispatch handler (reuse delivery)

Add to **`packages/backend/convex/extensions/forms/notifications.ts`** an `internalAction` named `dispatch`. This is the handler `bootstrap/registerListeners.ts` will point at (`handlerModule: "extensions/forms/notifications"`, `handlerFunction: "dispatch"`).

- [ ] **Signature:** `export const dispatch = internalAction({ args: { eventId: v.id("events") }, handler: async (ctx, { eventId }) => {...} })`. **Not** `{ eventCode, payload }` (Ground Truth #2). `handlerType` will be `"action"` because it calls `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction` (an action, not a mutation) — actions can fan out to multiple sub-mutations for per-row isolation.
- [ ] **Load event:** `const event = await ctx.runQuery(internal.events.internals.??)` — there's no internal event getter; instead read via a tiny `internalQuery` you add here, `_getEvent({ eventId })`, returning `{ code, payload, actorId }` from `ctx.db.get("events", eventId)`. (Action can't touch `ctx.db` directly.) Parse `payload` JSON. If event missing → return.
- [ ] **Derive:** `eventCode = event.code`; `{ formId, submissionId }` from payload.
- [ ] **Load enabled rows:** `ctx.runQuery(internal.extensions.forms.notifications._enabledRowsForEvent, { formId, triggerEventCode: eventCode })`. If empty → return.
- [ ] **Load form:** add/​reuse an internalQuery `_getForm({ formId })` (or fold into `_getEvent`'s sibling) → `ctx.db.get(formId)`. If null → return (deleted-form edge case, PRD §11).
- [ ] **Load answers (CRITICAL, Ground Truth #3):** internalQuery `_getSubmissionValues({ submissionId })` → query `fieldValues` by `by_entity` index; return array of `{ fieldName, fieldKey, value }`. Build `valueByName` and `valueByKey` maps.
- [ ] **Load settings:** `ctx.runQuery(internal.settings.internals.getInternal, { section: "general" })` → read `adminEmail` (Ground Truth: `adminEmail` lives in the `general` section; `settings/defaults.ts` line 771, `settings/validators.ts` line 72). Per-form override (PRD §10): if `JSON.parse(form.settings).adminNotificationEmail` is set, prefer it.
- [ ] **Per-row loop** (in `order`):
  1. **Firing rule:** `if (eventCode === "form.submitted" && payload.isComplete !== true) continue;` (PRD §6 firing rules — partials don't notify "submissions").
  2. **Conditional gate:** if `row.conditionalLogic` present, call `evaluateConditionalLogic(row.conditionalLogic, valueByKey)` (the existing pure evaluator in `./conditionalLogic.ts`, which takes a **JSON string** + a `fieldKey->value` map and returns a boolean — note its semantics are `show/hide`, not `fire/skip`; treat a `true` result as "fire", `false` as "skip"). If result is "skip" → `continue`. (This reuses the engine wholesale per PRD §7; the row's stored JSON should use the same `{action,logic,rules}` shape the `ConditionalLogicBuilder` writes.)
  3. **Resolve:** build `MergeContext` and compute `to = resolveMergeTags(row.toExpression, ctx)`, `subject = resolveMergeTags(row.subjectTemplate, ctx)`, `body = resolveMergeTags(row.messageTemplate, ctx)`.
  4. **Deliver — wrap each in try/catch (per-row isolation, PRD §10 "failures are logged, isolated, non-fatal"):**
     - `channel === "email"`: if `!to || !isValidEmail(to)` → log skip (`console.warn("[FormNotification] skip no_recipient ...")`) + `continue`. Else `await ctx.runMutation(internal.emails.internals.queueRenderedEmail, { recipientEmail: to, subject: subject || `${form.title} — notification`, bodyHtml: body, templateSlug: "form_notification", templateVariables: "{}", priority: "immediate", eventId })`. (Exact args from `emails/validators.ts` `queueRenderedEmailArgs` lines 221–235 — `recipientEmail`, `subject`, `bodyHtml`, `templateSlug`, `templateVariables` are required.) This reuses the Email system + Resend; we never touch Resend (PRD §10).
     - `channel === "site"`: **Ground Truth #5** — `notifications.internals.send` rejects unknown keys. LEAN: write a thin `internalMutation` `_createSiteNotificationForAdmins({ formId, submissionId, type, title, body })` in `notifications.ts` that resolves admin user ids via the existing helper `resolveNotificationRecipients(ctx, "admin", {})` (`helpers/notification.ts`) and inserts a `notifications` row per admin directly (match the `notifications` table insert shape used by `notifications/internals.send` — read it for the exact required fields before writing). `type` = `eventCode === "form.action_failed" ? "error" : "info"`. If the `notifications` insert shape proves to require a registered `notificationKey` validator at the DB layer, **defer the `site` channel** to a follow-up and ship `email`-only for MVP — note it loudly in the PR and in the seeded defaults (Step 7 still seeds the site rows as `enabled: false` so they're visible-but-inert until the key is registered).
  5. **catch** → `console.warn("[FormNotification] delivery failed ...", err)`; never rethrow (must not abort sibling rows or roll back the committed submission).

> Reuse boundary stays exactly as PRD §8.3 intends: conditional logic = `evaluateConditionalLogic` (existing), email = `emails.internals.queueRenderedEmail` (existing), templating = local `resolveMergeTags` (new, minimal). Selection/iteration glue is the only orchestration we own.

---

## 6. Backend — register the three event listeners

Edit **`packages/backend/convex/bootstrap/registerListeners.ts`**. Add a new section to the `LISTENER_DEFINITIONS` array (mirror the existing block style, e.g. the commerce subscriptions block lines 1026–1109):

- [ ] Three entries, one per event code (`form.submitted`, `form.progress_saved`, `form.action_failed`), each:
  ```
  { eventCode: "form.submitted", name: "Form Notifications: Submitted",
    handlerModule: "extensions/forms/notifications", handlerFunction: "dispatch",
    handlerType: "action", priority: 20, maxRetries: 3, retryDelayMs: 2000,
    retryBackoff: "exponential", system: "forms",
    description: "Resolves + sends configured form notifications on submission." }
  ```
  (`priority: 20` = after site notifications/audit, alongside other email handlers.) `handlerType: "action"` because `dispatch` is an `internalAction`.
- [ ] Confirm `resolveHandler` (`events/internals.ts` line 43) will resolve `internal.extensions.forms.notifications.dispatch` from `handlerModule: "extensions/forms/notifications"` + `handlerFunction: "dispatch"` (it splits on `/` and walks the `internal` tree — `internal.extensions.forms.notifications.dispatch` exists once the file is created and codegen runs).
- [ ] **Registration is not automatic.** `registerListeners.run` is an idempotent internal mutation that must be invoked once after deploy (Convex dashboard → run `bootstrap.registerListeners.run`, or it's already part of the deploy bootstrap). The Convex-deployment expert handles running it; flag in the PR that new listeners require a `registerListeners.run`.

---

## 7. Backend — seed default rows on form creation

PRD §6 + §10 ("defaults on form creation"). The form `create` mutation lives in `extensions/forms/mutations.ts` (line 129).

- [ ] In `extensions/forms/mutations.ts` `create` handler, after inserting the form (after line 191, before/after `emitEvent`), insert the seeded `form_notifications` rows for the new `formId`. Keep it inline + minimal (or a small local helper `seedDefaultNotifications(ctx, formId, formTitle)` in `mutations.ts`). Seed exactly the PRD §6 rows:
  - **Email / admin / `form.submitted`** — "New Form Submission (Admin)", `toExpression: "{settings:admin_notification_email}"`, `subjectTemplate: "New {form:title} submission"`, `messageTemplate: "<p>A new submission was received.</p>{all_fields}"`, `enabled: true`, `order: 0`.
  - **Email / customer / `form.submitted`** — "Form Confirmation (Respondent)", `toExpression: "{field:email}"`, subject `"We received your submission"`, body confirmation copy, `enabled: true`, `order: 1`. (If no email field exists at submit time, dispatch skips it gracefully — Ground Truth #3 / PRD §11.)
  - **Email / customer / `form.progress_saved`** — "Resume Your Form", `toExpression: "{field:email}"`, body with `{form:resume_url}`, `enabled: true`, `order: 2`.
  - **Email / admin / `form.action_failed`** — "Form Action Failed (Admin)", `toExpression: "{settings:admin_notification_email}"`, body with `{action:error}`, `enabled: true`, `order: 3`. (Inert until the Actions & Feeds producer emits the event.)
  - **Site / admin / `form.submitted`** — "New Form Submission", `messageTemplate` short, `enabled:` **`true` if the `site` channel shipped in Step 5, else `false`** (Ground Truth #5), `order: 4`.
  - **Site / admin / `form.action_failed`** — "Form Action Failed", `enabled:` same conditional as above, `order: 5`.
- [ ] Do NOT seed these in `duplicate` (line 396) for MVP unless trivial — a duplicated form copies fields but not notifications in this lean pass; note as a known gap. (Optional: copy notifications too if time permits.)

---

## 8. Frontend — the admin route

Create **`apps/web/src/routes/_authenticated/_admin/forms/$formId/notifications.tsx`**. Mirror `apps/web/src/routes/_authenticated/_admin/forms/$formId/edit.tsx` exactly for the shell (route id, `PluginGuard`, params, loading/not-found states) and `settings.tsx` for the capability gate.

- [ ] `createFileRoute("/_authenticated/_admin/forms/$formId/notifications")` (the route tree is scanner-merged; no `nav-config.ts` edit).
- [ ] Component wraps content in `<PluginGuard pluginId="forms">` (import from `@/components/plugins/PluginGuard`).
- [ ] In-page capability gate: `const canManage = useCan(formCap("form.manage_notifications"))` (import `useCan` from `@/hooks/useCan`; local `formCap` cast like `settings.tsx` lines 9–15). Show the "Insufficient permissions" card (copy from `settings.tsx`) when false.
- [ ] **Data:** `useQuery(api.extensions.forms.notifications.listForForm, { formId })`; mutations via `useMutation(api.extensions.forms.notifications.create | update | reorder | remove)`. Use the cached `useQuery` from `convex-helpers/react/cache` (as `edit.tsx` line 4 does).
- [ ] **List UI:** rows show name, channel badge, trigger event, enable toggle (`update` with `{ patch: { enabled } }`), edit/delete. **Drag-reorder** by reusing the existing dnd-kit pattern already in the app — copy the approach from `apps/web/src/components/custom-fields/SortableFieldRow.tsx` + `FieldGroupBuilder.tsx` (or `components/menus/MenuItemList.tsx`). On drop → call `reorder({ formId, orderedIds })`.
- [ ] **Editor (full-page / expand-in-place, NOT a drawer — Ground Truth #7):** fields = name, channel (`email|site` select), recipientType (`admin|customer`), `toExpression` (text; show a small merge-tag hint/picker listing the §12 tokens), `subjectTemplate` (text, email only), `messageTemplate` (textarea), trigger event (select of the 3 codes), and an optional conditional-logic builder. **Reuse `apps/web/src/components/custom-fields/ConditionalLogicBuilder.tsx`** for the CL gate — it already emits the canonical `{action,logic,rules}` JSON string that `evaluateConditionalLogic` consumes; store its output straight into `conditionalLogic`. Save → `create` or `update`.
- [ ] UI primitives: `Button`, `Input`, `Select`, `Skeleton`, `Switch`/toggle from `@/components/ui/*` (all exist; `edit.tsx`/`settings.tsx` import them). `toast` from `sonner` for success/error. No hardcoded colors (CSS vars only — CLAUDE.md).
- [ ] **Link in from the Builder:** add a "Notifications" link/tab on `apps/web/src/routes/_authenticated/_admin/forms/$formId/edit.tsx` pointing to `/forms/$formId/notifications` (a `<Link to="/forms/$formId/notifications" params={{ formId }}>` button near the existing "Back to Forms" header, line ~127). Satisfies PRD §13 Phase 2 "surface the Notifications tab."

---

## 9. Verify checklist

Backend (types + logic):
- [ ] `bun run -F @convexpress-admin/backend typecheck` (or the repo's Convex typecheck task) passes. Scoped `@ts-expect-error TS2589` only — never `--typecheck=disable` (MEMORY rule).
- [ ] `api.extensions.forms.notifications.{listForForm,create,update,reorder,remove}` appear in generated API; `internal.extensions.forms.notifications.dispatch` resolves.
- [ ] CRUD mutations all call `requireCan(ctx, formCap("form.manage_notifications"))` (grep to confirm 5 call sites). `dispatch` and the `_*` internals have NO `requireCan`.
- [ ] `resolveMergeTags` unit-resolves `{field:email}`, `{form:title}`, `{settings:admin_notification_email}`, `{all_fields}`, unknown token → empty (manual or test file).

Frontend:
- [ ] `bun run -F web typecheck` + `bun run -F web build` pass; route `/forms/$formId/notifications` compiles into the tree.
- [ ] Visit `/admin/forms/<id>/notifications` (Electron/dev): seeded rows render; toggle enable persists; reorder persists; create/edit/delete a row works; permission card shows for a non-capable role; page 404s/redirects when Forms extension disabled (PluginGuard).
- [ ] "Notifications" link reachable from the form edit page.

End-to-end (per PRD §13 Phase 4) — run `bootstrap.registerListeners.run` first (or confirm the deploy bootstrap did):
- [ ] Publish a form with an `email` field → submit it (complete) → admin "New Form Submission" email is queued (`emailQueue` row) AND respondent confirmation email queued to the submitted address.
- [ ] Submit with `isComplete:false` (save-and-continue) → submission rows do NOT fire; only `form.progress_saved` row queues a "Resume Your Form" email.
- [ ] Submit a form with **no email field** → respondent row is skipped + logged (`[FormNotification] skip no_recipient`), admin row still fires, no crash.
- [ ] Disable a row → it does not fire. Add a conditional-logic gate that evaluates false → that row does not fire; sibling rows still fire.
- [ ] Force a delivery error in one row (e.g. bad template) → caught + logged; remaining rows still fire; submission stays committed.
- [ ] (If `site` channel shipped) admin bell shows the in-app "New Form Submission" notification; else confirm the two site rows are seeded `enabled:false` and the PR notes the registry dependency.

---

## 10. Out of scope (do not build in this pass)
- Email transport / Resend keys / deliverability (Email Notification System owns it).
- The notification key registry edits / `types/capabilities.ts` registration (Role/Notification expert).
- A full Merge Tags grammar/prefill engine — only the minimal local resolver above.
- `form.action_failed` **producer** (Form Actions & Feeds System emits it; we only bind the consumer).
- A `form_notification_log` / observability counter (PRD §9.2/§14 — explicitly deferred).
- Copying notifications on form `duplicate` (note as a known gap).
- CC/BCC columns, dedupe windows, rich WYSIWYG body editor (PRD §14 open questions — defer).

## 11. Files touched (summary)
**New:**
- `packages/backend/convex/extensions/forms/notifications.ts` (CRUD + internals + `dispatch`)
- `packages/backend/convex/extensions/forms/mergeTags.ts` (local resolver)
- `apps/web/src/routes/_authenticated/_admin/forms/$formId/notifications.tsx` (admin UI)

**Edited:**
- `packages/backend/convex/events/constants.ts` (+`FORM_EVENTS.ACTION_FAILED`)
- `packages/backend/convex/bootstrap/registerListeners.ts` (+3 listener defs)
- `packages/backend/convex/extensions/forms/mutations.ts` (seed defaults in `create`)
- `apps/web/src/routes/_authenticated/_admin/forms/$formId/edit.tsx` (+Notifications link)

**Unchanged (confirmed sufficient):**
- `packages/backend/convex/extensions/forms/schema.ts` (`form_notifications` already defined)
