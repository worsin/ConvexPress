# PLAN: Form Submission System

> Build-sequence doc for the PRD in this folder (`./PRD.md`). The PRD owns the *why* and the full API sketch; this PLAN is the ordered, file-by-file *how* + the verify checklist. Read the PRD first.
>
> **Scope of this PLAN:** the `form_submissions` data layer + the public unauthenticated `submit` mutation (which doubles as `saveDraft` via `isComplete:false`) + admin read queries (`listSubmissions`/`getSubmission`) + the `form.submitted` event registration. Backend only — no routes, no UI.

---

## Ground truth (verified against the codebase — read before coding)

These are the *real* facts on disk. Where the PRD's §8 code sketch diverges from reality, **this section wins** — the sketch is illustrative pseudocode, not the contract.

- **Backend root:** `ConvexPress-Admin/packages/backend/convex/`. Helpers import from `../../helpers/...` (two levels up from `extensions/forms/`).
- **Schema already done.** `extensions/forms/schema.ts` already exports `tables` with `forms`, `form_submissions` (status `partial|complete|spam|deleted`, `resumeToken`, `currentStep`, `read`, `starred`, `meta`, `submittedAt`/`completedAt` both optional, plus `createdAt`/`updatedAt`), and `form_submission_notes`. Indexes present: `by_form`, `by_form_status`, `by_status`, `by_resumeToken`. **No schema additions required for this system.** The codegen script (`scripts/generate-extension-index.mjs`) merges `tables` into the hub — never hand-edit root `schema.ts`.
- **Validator is real and server-side already:** `helpers/customFieldValidation.ts` →
  `validateFieldValue(type: string, value: string, settings: Record<string, unknown>, required: boolean): { valid: boolean; error?: string }`.
  - It takes the **stored string** value (JSON-encoded), not a raw JS value, and a **parsed** settings object.
  - Empty/`""`/`"[]"`/`"{}"` + `required:true` → `{valid:false}`; empty + optional → `{valid:true}`. Layout types (`message|accordion|tab`) → always `{valid:true}`.
- **`fieldValues` is the answer store (reuse, do NOT create a table).** Schema at `convex/schema/customFields.ts`:
  - Columns: `entityType: string`, `entityId: string`, `fieldKey: string`, `fieldName: string`, `value: string` (JSON-encoded), `updatedBy: string` (**required**), `updatedAt: number`.
  - Indexes: `by_entity ["entityType","entityId"]`, `by_entity_field ["entityType","entityId","fieldKey"]`, `by_field_key`.
  - Upsert pattern (mirror `customFields/mutations.ts` `setFieldValue`): query `by_entity_field`, `.unique()`, then `patch` or `insert`. For our entity: `entityType:"form_submission"`, `entityId: <submissionId>`.
  - **`updatedBy` is required** → for anonymous submits use a sentinel string (e.g. `"guest"`); when a session exists use the resolved user identifier. Never omit it.
- **`fieldDefinitions`** (`convex/schema/customFields.ts`): `groupId`, `label`, `name`, `key`, `type`, `required: boolean`, `settings: string` (JSON), `conditionalLogic?: string` (JSON), `menuOrder`, `parentFieldId?`. Index `by_group ["groupId","menuOrder"]`. A form's fields = `fieldDefinitions` where `groupId === forms.fieldGroupId`.
- **`forms.fieldGroupId` is OPTIONAL.** A published form may have no field group → treat as zero fields (a complete submit with no required fields succeeds; values map empty).
- **Events:** `helpers/events.ts` → `emitEvent(ctx, code, system, payload, options?)`. It warns (does not throw) on unregistered codes, so **register `form.submitted` first** for cleanliness + type-safety. Event constants live in `convex/events/constants.ts` (`SYSTEM`, per-system `*_EVENTS`, `ALL_EVENT_CODES`, `EVENT_CODES_BY_SYSTEM`). There is **no `FORM` system / `FORM_EVENTS` yet** — add them.
- **Reality gaps vs. PRD §8 sketch (do NOT copy the sketch blindly):**
  - There is **no `@convexpress/field-engine` package** and **no backend `evaluateConditionalLogic` / `encodeFieldValue` / `parseFieldValue`**. The conditional-logic evaluator currently lives only in the *frontend* admin (`apps/web/src/components/custom-fields/...`). → We add a tiny **backend** conditional-logic helper (Step 2) and use plain `JSON.stringify` / `JSON.parse` for encode/parse. `validateFieldValue` is imported from `helpers/customFieldValidation.ts`.
  - PRD sketch references `internal.extensions.forms.spam.guardSubmission` and `internal.events.dispatch`. The Spam system is a **separate, later** system — wire a **guard seam** (Step 3) that is a no-op stub now and becomes a real `ctx.runMutation` when Spam lands. For event emission, use the existing `emitEvent` helper but schedule it via `ctx.scheduler.runAfter(0, ...)` per the PRD's "event after commit" rule (see Step 4 note on the inline-vs-scheduled decision).

---

## Build sequence

Each step lists the **exact file(s)**, what to put there, and **what it proves**. Steps are ordered so the thing compiles and is verifiable at each gate.

### Step 1 — Register the `form.submitted` event
**Edit:** `convex/events/constants.ts`
- Add `FORM: "form"` to the `SYSTEM` object.
- Add `export const FORM_EVENTS = { SUBMITTED: "form.submitted" } as const;` next to the other `*_EVENTS` blocks.
- Spread `...Object.values(FORM_EVENTS)` into `ALL_EVENT_CODES`.
- Add `[SYSTEM.FORM]: Object.values(FORM_EVENTS),` to `EVENT_CODES_BY_SYSTEM`.

**Proves:** `form.submitted` is a recognized code, so `emitEvent` won't warn and downstream Notification/Feed subscribers can target it. Pure additive edit to a hub the extension is *allowed* to touch (it's the event catalog, not `schema.ts`/`registry.ts`/`nav-config.ts`).

### Step 2 — Backend conditional-logic + field-value helpers
**Create:** `extensions/forms/helpers.ts` (extension-local helpers; keep the public-submit logic testable + out of the mutation body)
- `evaluateConditionalLogic(field, valueMap): boolean` — pure. Parse `field.conditionalLogic` (JSON string) → if none, return `true` (always visible). Implement `show`/`hide` action with `and`/`or` groups and the standard operators (`==`, `!=`, `contains`, empty/not-empty, `>`,`<`). **Port the operator semantics from the existing frontend evaluator** in `apps/web/src/components/custom-fields/` so admin-preview visibility and server-trusted visibility agree exactly. SSR/Node-safe (no `window`).
- `isLayoutField(type): boolean` — `true` for `message|accordion|tab|page_break` (these store no value).
- `encodeFieldValue(value): string` — JSON-encode a raw client value to the `fieldValues.value` string shape (objects/arrays → `JSON.stringify`; primitives → string form consistent with how the metabox writes values). `parseFieldValue(value): unknown` — inverse, for the event `values` map.
- `generateResumeToken(): string` — opaque random token (e.g. `crypto.randomUUID()`), used for partials.

**Proves:** the server can recompute visibility and (de)serialize answers without importing any frontend/admin code and without a not-yet-existing engine package. Unit-testable in isolation.

### Step 3 — Spam guard seam (stub now, real later)
**Create:** `extensions/forms/spam.ts` (placeholder owned long-term by the Spam & Security system)
- Export an internal helper the submit mutation calls **before any write**, returning `{ block: boolean; score?: number }`. For now: read `honeypot` (non-empty ⇒ `block:true`) as a trivial guard and otherwise `{ block:false }`. Leave a `// TODO(Spam System): replace with ctx.runMutation(internal.extensions.forms.spam.guardSubmission, …)` marker.
- This isolates the **security delegation** boundary from day one so `submit` is never itself capability-gated and the real guard drops in without touching the mutation's control flow.

**Proves:** the public mutation has exactly one abuse-control chokepoint, satisfying the PRD rule "abuse control is delegated, not authorization." Keeps `submit` shippable before the Spam system exists.

### Step 4 — The public `submit` mutation (also the saveDraft path)
**Create:** `extensions/forms/mutations.ts`
- `import { mutation } from "../../_generated/server"; import { v } from "convex/values";`
- `import { validateFieldValue } from "../../helpers/customFieldValidation";`
- `import { emitEvent } from "../../helpers/events"; import { FORM_EVENTS, SYSTEM } from "../../events/constants";`
- `import { evaluateConditionalLogic, isLayoutField, encodeFieldValue, parseFieldValue, generateResumeToken } from "./helpers"; import { guardSubmission } from "./spam";`

`export const submit = mutation({ ... })` — **PUBLIC: no `requireCan`, no auth gate.** Args: `formId: v.id("forms")`, `values: v.record(v.string(), v.any())`, `isComplete: v.optional(v.boolean())`, `resumeToken: v.optional(v.string())`, `honeypot: v.optional(v.string())`, `captchaToken: v.optional(v.string())`, `source: v.optional(v.string())`. Handler order (this *is* the security boundary):

1. `const isComplete = args.isComplete ?? true;`
2. **Load form**: `ctx.db.get(args.formId)`; reject if missing or `status !== "published"` (PRD edge case: unpublished mid-fill). Load fields: if `form.fieldGroupId` set, query `fieldDefinitions` `by_group` (`q.eq("groupId", form.fieldGroupId)`); else `fields = []`.
3. **Spam guard** (Step 3) before any write: `const guard = await guardSubmission(ctx, { honeypot, captchaToken });` — `if (guard.block) throw new Error("Submission rejected");` (no row, no event).
4. **Server-trusted validation loop** over `fields`:
   - skip `isLayoutField(field.type)`.
   - `const visible = evaluateConditionalLogic(field, args.values);` — if **not** visible: `continue` (hidden ⇒ not required; any smuggled value is simply never read/stored).
   - `const raw = args.values[field.name];`
   - `const encoded = raw === undefined ? "" : encodeFieldValue(raw);`
   - `const settings = field.settings ? JSON.parse(field.settings) : {};`
   - `const enforceRequired = isComplete && field.required;` (required enforced **only** on completion).
   - `const res = validateFieldValue(field.type, encoded, settings, enforceRequired);` → on `!res.valid` collect `errors[field.name] = res.error ?? "Invalid value"`.
   - else if `raw !== undefined` push `{ field, encoded }` to `accepted`.
   - After loop: if `Object.keys(errors).length` → `throw new ConvexError({ code: "VALIDATION", fields: errors })` (import `ConvexError` from `convex/values`). Nothing persisted.
5. **Persist parent row** (`now = Date.now()`):
   - If `args.resumeToken`: load via `by_resumeToken`, `.first()`; reject if missing or `formId` mismatch ("Invalid resume token"). `patch` status (`isComplete?"complete":"partial"`), `completedAt: isComplete ? now : existing.completedAt`, `updatedAt: now`. Keep its `resumeToken`.
   - Else `insert("form_submissions", { formId, status: isComplete?"complete":"partial", submittedAt: now, completedAt: isComplete?now:undefined, ip: undefined, userAgent: undefined, referrer: undefined, userId: <resolved-if-session-else-undefined>, resumeToken: isComplete?undefined:generateResumeToken(), currentStep: args.currentStep, read: false, starred: false, createdAt: now, updatedAt: now })`. (Schema has no top-level `source`/`fieldCount`/`spamScore` columns — stash extras like `source`, `spamScore`, `guard.score` in the `meta` JSON bag if needed; do not invent columns.)
6. **Persist answers via `fieldValues`** — loop `accepted`, upsert with the `setFieldValue` pattern: `by_entity_field` `.unique()` → patch/insert with `entityType:"form_submission"`, `entityId: submissionId`, `fieldKey: field.key`, `fieldName: field.name`, `value: encoded`, `updatedBy: <"guest"|user-id>`, `updatedAt: now`. **No parallel table.**
7. **Emit after commit**: `await ctx.scheduler.runAfter(0, internal.events.<dispatch-fn>, { … })` carrying payload `{ formId, submissionId, isComplete, submittedAt: now, values: Object.fromEntries(accepted.map(a => [a.field.name, parseFieldValue(a.encoded)])) }`.
   - **Decision (resolve while coding):** existing systems call `emitEvent(ctx, code, system, payload)` **inline** at the end of a mutation (see `customFields/mutations.ts`). The PRD mandates `scheduler.runAfter(0, …)` strictly *after* writes commit. Prefer the PRD's scheduled form **if** an internal `events`-dispatch entry exists to schedule; if the only available primitive is the inline `emitEvent` helper, call it as the **last** statement (post-writes) and leave a `// PRD prefers runAfter(0); inline emit is last-statement, post-commit` note. Either way: **never** before the writes, never on a path that can roll back.
8. `return { submissionId, isComplete, resumeToken: isComplete ? undefined : <the-token> };`

**Proves:** the entire ingestion contract — public/unauthenticated, spam-guarded-first, server-recomputed visibility, server-trusted per-field validation, `fieldValues`-only persistence, partial-vs-complete, event fan-out. `saveDraft` needs no separate mutation: it's `submit({ isComplete:false })` (relaxed required-ness + token issuance fall out of the branches above), per PRD §8.2.

### Step 5 — Admin read queries
**Create:** `extensions/forms/queries.ts`
- `import { query } from "../../_generated/server"; import { v } from "convex/values"; import { paginationOptsValidator } from "convex/server";`
- `export const listSubmissions = query({ args: { formId: v.id("forms"), status: v.optional(v.union(v.literal("partial"),v.literal("complete"),v.literal("spam"),v.literal("deleted"))), paginationOpts: paginationOptsValidator }, … })` — if `status` given use index `by_form_status` (`q.eq("formId",…).eq("status",…)`), else `by_form` (`q.eq("formId",…)`); `.order("desc").paginate(args.paginationOpts)`. Parent rows only (values loaded lazily in `getSubmission`).
- `export const getSubmission = query({ args: { submissionId: v.id("form_submissions") }, … })` — `ctx.db.get`; if null return null; load answers via `fieldValues` `by_entity` (`q.eq("entityType","form_submission").eq("entityId", args.submissionId)`).`collect()`; return `{ ...submission, values }`.
- **Auth note:** these are the data contract Entry Management's UI sits on; the actual `requireCan` capability check is added by the **Entry Management system** (which owns the admin screens). Leave a `// TODO(Entry Management): requireCan("form.view_entries")` marker; do **not** add it here (it would over-couple this data layer, and the Role expert registers the capability separately).

**Proves:** Entry Management can list (paged, status-filtered) and read one entry + its answers with **zero parallel value store** — the read side composes for free off `fieldValues`, symmetric with metabox reads.

---

## Verify checklist (all must pass — evidence before "done")

Run from `ConvexPress-Admin/packages/backend/`:

1. **Codegen merges the extension cleanly:**
   `node scripts/generate-extension-index.mjs` (a.k.a. `bun run codegen:extensions`) → **exit 0**, and `convex/schema/_extensionsIndex.generated.ts` references `forms`' `tables`. (No schema change this system, but confirm the generated index still builds with the new files present.)
2. **Types pass with no new errors:** from repo root `ConvexPress-Admin/`, `bun run check-types` (turbo → backend) → **exit 0**.
   - Per the project rule: do **not** pass `--typecheck=disable`. If a Convex `TS2589` "type instantiation is excessively deep" false-positive appears on the deep `fieldValues`/record generics, suppress with a **scoped** `// @ts-expect-error` at the exact line — never globally, never as a code fix.
3. **Public-submit security invariants hold** (read-through review, since these can't be type-checked):
   - `submit` has **no** `requireCan` / no auth gate.
   - The spam guard (`guardSubmission`) is called **before** any `ctx.db.insert/patch`.
   - Visibility is **recomputed** via `evaluateConditionalLogic` — the client's `values` are never trusted for which fields are required; hidden fields are skipped (value dropped).
   - Required-ness is enforced **only** when `isComplete` (`enforceRequired = isComplete && field.required`).
   - Answers are written **only** to `fieldValues` (`entityType:"form_submission"`) — no new table, no `submission_values`.
   - `form.submitted` is emitted **after** the writes (scheduled `runAfter(0)`, or inline as the final post-commit statement) with the full `{ formId, submissionId, isComplete, submittedAt, values }` payload.
   - `ip`/`userAgent`/`referrer` are server-side (`undefined`/server-derived), never read from the client body.
4. **Event registered:** `form.submitted` is in `ALL_EVENT_CODES` and under `SYSTEM.FORM` in `EVENT_CODES_BY_SYSTEM` (so `isValidEventCode("form.submitted") === true`).

---

## Files touched (summary)

| File | Action | Purpose |
|---|---|---|
| `convex/events/constants.ts` | edit | Register `SYSTEM.FORM` + `FORM_EVENTS.SUBMITTED` into catalog + groups |
| `convex/extensions/forms/schema.ts` | none | Already defines `forms` / `form_submissions` / `form_submission_notes` + indexes |
| `convex/extensions/forms/helpers.ts` | create | Backend `evaluateConditionalLogic`, `isLayoutField`, `encode`/`parseFieldValue`, `generateResumeToken` |
| `convex/extensions/forms/spam.ts` | create | Guard seam (stub now → real Spam-system `runMutation` later) |
| `convex/extensions/forms/mutations.ts` | create | Public unauthenticated `submit` (== `saveDraft` when `isComplete:false`) |
| `convex/extensions/forms/queries.ts` | create | `listSubmissions` (paged/filtered) + `getSubmission` (parent + `fieldValues`) |

**Out of scope here (own PRDs/systems):** the `/forms/$slug` renderer, field renderers/types, the entry inbox UI + status-mutating admin actions, real spam scoring/rate-limit/CAPTCHA, notification sending, multi-step UX/resume-token issuance, and the `forms` builder authoring. This system emits the event and owns the data; everyone else hangs off it.
