# PLAN: Form Multi-Step & Save-Continue System — Build Sequence

> Build-sequence companion to `PRD.md`. The PRD holds the full spec; this is the **ordered, file-by-file build order + verify checklist** for the multi-step wizard, which is almost entirely the **PUBLIC renderer layer on the ConvexPress-Website app** plus **one new backend read query on ConvexPress-Admin**.
>
> Read first: `./PRD.md`, `../form-renderer-system/PLAN.md` (the renderer this wizard wraps), and `../form-submission-system/PLAN.md` (the `submit` mutation + `resumeToken` this wizard consumes).

---

## 0. Architecture decision — wrap what exists; own the wizard + one query, nothing else

This is the single most important section. **The wizard is a thin coordination layer.** It adds no submission table, no validator, no field renderers, no second registry. Before writing any plan step I verified the on-disk reality, which diverges from the PRD's idealized code in ways that drive every step below.

**Ground truth (verified on disk, 2026-05-30):**

1. **The renderer the wizard wraps is `ConvexPress-Website/apps/web/src/components/forms/FormRenderer.tsx`** (committed), *not* the `extensions/forms/FormRenderer.tsx` the PRD sketches. The Website has **no `extensions/forms/` dir yet** — the renderer PLAN creates it. The wizard lands in `extensions/forms/` alongside the renderer's in-progress move; co-locate but do not block on it (see §0.A).
2. **The submit contract is `(api as any).extensions.forms.mutations.submit`** (committed `mutations.ts`) — `values` is an **array of `{ fieldKey, value }`**, both strings; returns `{ submissionId, isComplete }`. The PRD/renderer sketches show `extensions.forms.public.submit` with a `values` Record. **Anchor to the on-disk array contract.** It already accepts `isComplete`, `resumeToken`, `captchaToken`, `honeypot` and upserts a partial by `resumeToken` — so autosave works against it today.
3. **The public form read is `(api as any).extensions.forms.queries.getBySlug`** (committed `queries.ts`), returning `{ _id, title, slug, description, settings, fields: [...] }` where each field has `{ _id, label, name, key, type, instructions, required, defaultValue, settings, conditionalLogic, parentFieldId, menuOrder }`. The wizard derives steps from exactly this `fields` array.
4. **The conditional evaluator is `@/lib/forms/conditionalLogic.ts`** → `evaluateConditionalLogic(conditionalLogic: string | null, valueMap: Record<string,string>): boolean`. Signature is **(serialized-JSON, value-map)**, NOT the PRD's `(field, values)`. The wizard MUST call it with this real signature so step-skip matches the renderer's per-field show/hide and the server's recompute byte-for-byte. **Do not re-implement; import it.**
5. **The value map is `Record<string, string>` keyed by `field.key`** — strings, because `fieldValues.value` is a string column. The wizard's lifted value map is `Record<string, string>`, not `Record<string, unknown>`.
6. **`page_break` is registered nowhere yet** (grep clean in both apps). There is also **no `@convexpress/field-engine` package and no client-side field-type "registry"** on the Website — `FormFieldRenderer.tsx` dispatches on `field.type` with a hardcoded `switch` + a `LAYOUT_TYPES` set. So "register `page_break`" Website-side = **add it to the renderer's layout-skip sets** (it renders nothing and never validates). The engine-level registration the PRD §4 describes is the Admin/Builder story, tracked separately.

**Backend dependencies the wizard CONSUMES (owned by the Form Submission System, partly still on its to-do list):** The committed `submit` does **not** yet (a) **mint** a `resumeToken` on first partial insert, (b) accept/persist a **`currentStep`** arg, or (c) **return** the `resumeToken`. The Submission System PLAN (lines 86, 90) explicitly owns adding `generateResumeToken()`, a `currentStep` arg, and `return { …, resumeToken }`. **The wizard does not re-own these.** It is built to be **resilient** if they land later: it can mint a client-side token as a fallback so autosave + resume work end-to-end before the Submission System rewrite ships (§0.B). The **one** genuinely new backend surface this system owns is the public **`resume`** query (PRD §7).

### 0.A — Where the wizard files live

Land all wizard UI in `ConvexPress-Website/apps/web/src/extensions/forms/` (the renderer PLAN's new home). If that dir does not exist yet when this work starts, **create it** — the wizard and the renderer co-habit it. The wizard imports the renderer from wherever it currently resolves: today `@/components/forms/FormRenderer`; if the renderer has moved to `@/extensions/forms/FormRenderer` by then, import from there. Keep this the **only** import line that knows the renderer's location (one seam to flip).

### 0.B — Resume-token resiliency contract (the one subtle bit)

`submit` upserts a partial by `resumeToken` **today**, but only if the client *sends* one (it does not mint its own). So:

- On the **first** autosave the wizard generates an opaque token client-side (`crypto.randomUUID()`, SSR-guarded — effects/handlers only, never at module load) and passes it as `resumeToken`. All later autosaves reuse it → one draft row, matching the upsert branch.
- When the Submission System rewrite lands (mints server-side + returns `resumeToken`), the wizard **prefers the server-returned token** if present (`res.resumeToken ?? localToken`), so it transparently upgrades with no wizard code change. This is the PRD §3.4 "reuse the token" contract, made resilient to either ordering of the two builds.
- `currentStep`: pass it as an arg on every autosave. Until `submit` accepts it, it is silently ignored by Convex arg validation **only if** added to the validator — so **guard it**: send `currentStep` only behind the same "is the rewrite live" reality. Simplest lean approach: include `currentStep` in the call; if the deployed validator rejects unknown args, fall back to omitting it (the resume route then clamps to step 0). Document this as the one place coupled to the Submission System's progress.

**Hard rules inherited** (`ConvexPress-Website/.claude/CLAUDE.md`): no `@radix-ui/*` (use `@base-ui/react`), no hardcoded color literals (theme tokens only), no `@/templates/*`, **never deploy Convex from the Website repo**. SSR-safe: no `window`/`crypto` at module load.

Scope guard — owned elsewhere, do NOT build here: field rendering + per-field validation + in-step show/hide (Renderer); the `submit` mutation + `form_submissions` + `resumeToken` minting + `currentStep` persistence + partial→complete promotion (Submission System); the "Resume Your Form" email (Notification System); rate-limit/honeypot/CAPTCHA (Spam System); confirmation/redirect (Confirmation System); the Builder UI for inserting `page_break` + per-form wizard settings (Builder System); engine-level `registerFieldType` for `page_break` (Field Engine / Admin).

---

## 1. Build order at a glance

| Step | File | App | Proves |
|---|---|---|---|
| 1 | `extensions/forms/wizardSteps.ts` (new) | Website | Pure `deriveSteps` + active/skip helpers — zero React/Convex |
| 2 | `components/forms/FormFieldRenderer.tsx` (edit) | Website | `page_break` is a layout/no-value type (renders null, never validates) |
| 3 | `components/forms/FormRenderer.tsx` (edit) | Website | Additive seams: `step`, `onValuesChange`, suppress built-in submit |
| 4 | `extensions/forms/StepProgress.tsx` (new) | Website | Live (skip-aware) progress indicator, a11y `aria-current` |
| 5 | `extensions/forms/StepNav.tsx` (new) | Website | Back / Next / final-Submit, validate-before-next, label overrides |
| 6 | `extensions/forms/AutosaveIndicator.tsx` + `ResumeBanner.tsx` + `DraftExpiredNotice.tsx` (new) | Website | Quiet status surfaces (`role="status"`), non-blocking |
| 7 | `extensions/forms/FormWizard.tsx` (new) | Website | The host: state machine, lifted value map, debounced autosave, final submit |
| 8 | `extensions/forms/forms.$slug.resume.$token.tsx` route (new) | Website | Public no-auth resume route, SSR prefetch, gate, rehydrate + clamp |
| 9 | `routes/_marketing/forms.$slug.tsx` (edit) | Website | Mount `FormWizard` instead of bare `FormRenderer` (graceful single-step degrade) |
| 10 | `packages/backend/convex/extensions/forms/queries.ts` (edit) | **Admin** | New public `resume` query (the ONE new backend fn) |
| 11 | (consume) Submission System `submit` upgrades | Admin | `resumeToken` returned + `currentStep` persisted — dependency, not owned |

Steps 1–9 are Website; step 10 is the only Admin code; step 11 is a cross-system dependency to verify, not author. Each step is independently type-checkable. Run `bun run check-types` after steps 1–3, 4–7, 8–9 (Website) and after step 10 (Admin).

---

## 2. Step detail

### Step 1 — Pure step model
**File:** `apps/web/src/extensions/forms/wizardSteps.ts` (NEW)

Pure, synchronous, no React, no Convex — the heart of the system, fully unit-testable.

- `WizardStep` type: `{ index: number; title?: string; fieldKeys: string[]; isSkippable: boolean }`.
- `deriveSteps(fields)` — input is the `getBySlug` field array. Sort by `menuOrder` (default 0, matching the renderer's `(a.menuOrder ?? 0)`), split into runs at each `type === "page_break"`, the break's `label` becomes the **next** step's title, drop empty runs (leading/trailing/consecutive breaks → no empty steps, no off-by-one). Zero `page_break` ⇒ exactly one step (single-page degrade). `isSkippable = run.every(f => f.conditionalLogic != null)`.
- `visibleFieldKeys(step, values, fields)` — filter `step.fieldKeys` by `evaluateConditionalLogic(field.conditionalLogic, values)` **using the real `@/lib/forms/conditionalLogic` signature** (serialized JSON + value map). Import it; do not re-implement.
- `isStepActive(step, values, fields)` — `visibleFieldKeys(...).length > 0`.
- `computeActiveSteps(steps, values, fields)` — the live, non-skipped list both nav and progress read.

**Proves:** the step segmentation + skip logic exist as pure functions that provably agree with the renderer's evaluator. This is the file to cover with `*.test.ts` (the Website already runs vitest — see `products/-variantSelection.test.ts`).

---

### Step 2 — Register `page_break` as a layout/no-value type
**File:** `apps/web/src/components/forms/FormFieldRenderer.tsx` (EDIT)

The Website has no engine registry; "register `page_break`" here means: make the existing renderer treat it as layout.

- Add `"page_break"` to the `LAYOUT_TYPES` set (the same set in **both** `FormFieldRenderer.tsx` and `FormRenderer.tsx` — update both; see Step 3). A `page_break` then renders **nothing interactive** and is never validated/submitted, exactly like `message`/`accordion`/`tab`.
- Optional: in the layout branch, render `null` for `page_break` specifically (its label is consumed by the wizard as the step title, not shown inline as field copy). A `message` still shows its copy; `page_break` is invisible in the field flow.

**Proves:** a `page_break` in the field list contributes zero value rows and never blocks validation — the wizard is the only consumer that assigns it meaning. Mirrors the backend, which already skips `message|accordion|tab` (and treats unknown types as a no-op in `validateFieldValue` `default`), so a `page_break` reaching `submit` is harmless even before any Admin-side engine registration.

**Cross-ref (not owned here):** the engine-level `registerFieldType({ type: "page_break", layout: true, ... })` + Builder palette entry (PRD §4) is the Admin/Field-Engine task. Flag it for that system; the Website degrade above is sufficient for the wizard to function.

---

### Step 3 — Additive renderer seams
**File:** `apps/web/src/components/forms/FormRenderer.tsx` (EDIT — additive only, never remove existing single-page behavior)

The renderer must stay fully functional standalone (single-page path) while gaining the seams the wizard drives. All three are additive props/branches:

- **`step?: { index: number; total: number; fieldKeys: string[] }`** — when present, the renderer restricts its rendered + validated + submitted fields to `step.fieldKeys` (intersected with its existing `visibleFields` conditional filter). When absent, behavior is exactly today's (whole form). The renderer already sorts by `menuOrder` and computes `visibleFields`; this is a `.filter(f => !step || step.fieldKeys.includes(f.key))` on top.
- **`onValuesChange?: (values: Record<string, string>) => void`** — called from `setFieldValue` after the local state update so the wizard can lift the value map for autosave + step gating. No-op when absent.
- **Suppress built-in submit when hosted:** add `hideSubmit?: boolean` (or infer from `step` presence). When set, the renderer does NOT render its own `<Button type="submit">` and does NOT own the submit lifecycle — the wizard's `StepNav` owns Back/Next/Submit. The renderer still exposes its per-step `validate()` so the wizard can validate-before-next (lift it via an `onReady`/imperative ref, or — leaner — re-run the same `validateFieldValue` rules in `StepNav` over the current step's visible fields; pick the ref approach to avoid duplicating the required-check logic).
- **`initialValues?: Record<string, string>`** — seed the value map from this instead of (or merged over) per-field `defaultValue`, so the wizard can rehydrate a resumed draft. The renderer currently seeds only from `defaultValue`; make the seed `{ ...defaultSeed, ...initialValues }`.

Keep the renderer's existing server-error parsing (`parseSubmitError`) — the wizard reuses it on final submit to map field errors back to steps.

**Proves:** the renderer is reusable inside the wizard via small additive seams without forking it. This is the renderer's declared integration point (Renderer PRD §2.3 `step`, §6 `FormProgress`), realized against the on-disk component. **If the renderer is mid-move to `extensions/forms/`, apply these edits to whichever copy is canonical and keep the wizard's single import seam (§0.A) pointed at it.**

---

### Step 4 — Step progress indicator
**File:** `apps/web/src/extensions/forms/StepProgress.tsx` (NEW)

- Renders the **live** (`computeActiveSteps`) steps as numbered/labeled segments: current / visited / upcoming states, plus a "Step X of N" label where N is the live count (collapses as logic skips steps — the count never lies).
- `aria-current="step"` on the active segment; state conveyed by more than color (icon/number + text), per a11y. Theme tokens only.
- When `allowBackNav`, visited segments (index ≤ furthest reached) are clickable buttons that jump back; upcoming segments are non-interactive.
- Hidden entirely for a one-step form (single-page degrade shows no progress bar — PRD §12).

**Proves:** the progress UI is honest under conditional skipping and is keyboard/AT-navigable. This is the richer form of the renderer's `FormProgress` seam.

---

### Step 5 — Back / Next / Submit controls
**File:** `apps/web/src/extensions/forms/StepNav.tsx` (NEW)

- Props: `{ canBack, isFinal, onBack, onNext, onSubmit, isSubmitting, nextLabel?, prevLabel? }`.
- **Next**: validate the current step's visible fields (via the renderer's lifted `validate()` from Step 3) → on fail, surface inline errors (renderer owns display) and do not advance → on pass, trigger an **immediate** autosave flush then advance to the next **active** step.
- On the **final** step, Next becomes **Submit** (spinner + disabled while pending, mirroring the renderer's existing `Loader2` submit button styling).
- **Back**: retreats to the previous active step, gated by `allowBackNav`; back never re-validates (you can always go back).
- Honors `page_break` `nextLabel` / `prevLabel` overrides (read from the current/next break field's parsed `settings`).

**Proves:** navigation enforces validate-before-advance for UX while leaving authoritative validation to the server on completion.

---

### Step 6 — Status surfaces
**Files (NEW):** `apps/web/src/extensions/forms/AutosaveIndicator.tsx`, `ResumeBanner.tsx`, `DraftExpiredNotice.tsx`

- **`AutosaveIndicator`** — reflects `saveState` (`idle` | `saving` | `saved` | `save-error`): "Saving…", "Saved" (relative timestamp), "Couldn't save — we'll retry". `role="status"` (polite), never steals focus, never blocks input.
- **`ResumeBanner`** — shown only on the resume path: "Welcome back — we restored your progress. Continue from step X." Dismissible, `role="status"`.
- **`DraftExpiredNotice`** — shown by the resume route for expired / already-completed / unknown-as-partial tokens: explains the link is no longer valid + a **start-fresh** CTA (`<Link to="/forms/$slug">`). Theme tokens, no color-only signaling.

**Proves:** all the quiet wizard chrome exists, is accessible, and is non-blocking.

---

### Step 7 — The wizard host
**File:** `apps/web/src/extensions/forms/FormWizard.tsx` (NEW)

The orchestrator. Implements PRD §3.2 state machine + §3.4 autosave + §10 composition, adapted to the **real** imports/contract.

- **Props:** `{ form, resumeToken?, initialValues?, onSubmitted?, options? }` where `form` is the `getBySlug` shape and `options = { autosave=true, autosaveDelayMs=1000, showProgress=true, allowBackNav=true }`.
- **State:** `values: Record<string,string>` (seeded from `initialValues` ?? defaults), `stepIndex`, `furthestStep`, `saveState`, plus refs `resumeTokenRef` (seeded from the `resumeToken` prop), `submissionIdRef`, debounce `timer`.
- **Derived:** `steps = useMemo(deriveSteps(form.fields))`; `activeSteps = useMemo(computeActiveSteps(steps, values, form.fields))`; `current = activeSteps[stepIndex]`; `isFinal = stepIndex === activeSteps.length - 1`. On every value change recompute `activeSteps` and **clamp** `stepIndex` into `[0, activeSteps.length-1]` so a step emptied by logic never strands the user (PRD §12).
- **Lifted value map:** pass `onValuesChange={onValuesChange}` to the renderer; `onValuesChange` sets `values` and calls `scheduleAutosave`.
- **Debounced autosave (~1s):** `scheduleAutosave` clears+sets a timer; `flushAutosave` builds the **array** payload `visibleEntries = current/all-visible fields → { fieldKey: f.key, value: values[f.key] ?? "" }` (matching the on-disk `submit` arg shape — NOT a Record), calls `submit({ formId: form._id, values: <array>, isComplete: false, resumeToken: resumeTokenRef.current ?? mintToken(), currentStep: stepIndex })`, then `submissionIdRef = res.submissionId` and `resumeTokenRef = res.resumeToken ?? resumeTokenRef.current` (§0.B). On step change, flush **immediately** (not debounced). Failures set `save-error` and are **non-blocking** (no throw to the user; retry on next change/step).
- **`mintToken()`** — `crypto.randomUUID()`, called lazily inside the handler (SSR-safe), only when no token exists yet (§0.B). Used as the resume key until/unless the server returns its own.
- **Autosave payload note:** send the **whole** working value map (all visible fields filled so far across steps), not just the current step's, so resume rehydrates everything. The server already drops hidden/unknown fields.
- **Final submit:** `StepNav.onSubmit` → `submit({ formId, values: <array>, isComplete: true, resumeToken: resumeTokenRef.current })` → on success `onSubmitted?.(res)` (hand to Confirmation System, unchanged from single-page) → on `ConvexError` field errors, reuse the renderer's `parseSubmitError`, map each `fieldKey` to the **step that owns it**, jump to the **first** offending step, show inline errors, and do **not** treat as complete.
- **Render:** `ResumeBanner` (if `resumeToken`) → `StepProgress` (if `showProgress` and `activeSteps.length > 1`) → `FormRenderer` with `step={{ index: stepIndex, total: activeSteps.length, fieldKeys: current.fieldKeys }}`, `initialValues={values}`, `onValuesChange`, `hideSubmit` → `StepNav` + `AutosaveIndicator`.
- **Single-step degrade:** when `activeSteps.length === 1`, render the one step with no progress bar and a plain Submit — behaves like bare `FormRenderer` (PRD §11, §12).

**Proves:** end-to-end orchestration (derive → render one step → autosave → navigate → final submit → handoff) against the real renderer + real submit contract, resilient to the Submission System's token/step upgrades.

---

### Step 8 — Public resume route
**File:** `apps/web/src/routes/_marketing/forms.$slug.resume.$token.tsx` (NEW)

Flat dotted route file (repo convention: `wishlist.$token.tsx`, `track.$token.tsx`) → URL `/forms/$slug/resume/$token`. Mirror the **existing** `forms.$slug.tsx` route's structure exactly.

- `Route = createFileRoute("/_marketing/forms/$slug/resume/$token")` with a `loader` that `queryClient.ensureQueryData(convexQuery((api as any).extensions.forms.queries.resume, { token: params.token }))` **and** prefetches `getBySlug({ slug })` for SSR-first paint (no spinner). `head` sets a `noindex` title (forms are conversion surfaces, like the base route).
- Component: read both queries via `useSuspenseQuery`/`useTanStackQuery`, wrap in `<PublicPluginGate pluginId="forms">`. Branch:
  - `draft`/`form` loading → `FormSkeleton` (reuse the base route's skeleton/pattern).
  - `form == null` or `form.status !== "published"` or `draft == null` → `<NotFoundPage />`.
  - `draft.status === "expired"` (the marker the `resume` query returns past TTL) or non-`partial` → `<DraftExpiredNotice slug={slug} />`.
  - else → `<FormWizard form={form} resumeToken={token} initialValues={draft.values} />` (the wizard clamps `stepIndex` to `min(draft.currentStep, activeSteps.length-1)`).
- Use `(api as any).extensions.forms.queries.*` (house pattern for not-yet-typed extension APIs — the consumer `generated/api.d.ts` does not type `extensions.forms`; do not block on regenerating it).

**Proves:** a tokened deep-link rehydrates the form at the right step, SSR-first, gated on the extension flag + publish status, with correct expired/completed/unknown handling — the same `convexQuery` + `ensureQueryData` mechanic the base form route uses.

---

### Step 9 — Mount the wizard on the hosted form route
**File:** `apps/web/src/routes/_marketing/forms.$slug.tsx` (EDIT)

- Swap `<FormRenderer form={form} />` for `<FormWizard form={form} />` in `FormPageInner`. This is the §6.1 PRD contract: `/forms/$slug` is the same route; the wizard is what it mounts, degrading to single-page when the form has no `page_break`.
- Everything else on this route is unchanged (loader, SEO `noindex`, `PublicPluginGate`, `NotFoundPage` on null/unpublished).

**Proves:** every hosted form now flows through the wizard, with zero behavior change for single-page forms and automatic multi-step for forms containing `page_break` fields.

---

### Step 10 — The one new backend function: public `resume` query
**File:** `packages/backend/convex/extensions/forms/queries.ts` (EDIT — append; **ConvexPress-Admin**, the DB owner)

The wizard's only new backend surface (PRD §7; the Submission System PLAN confirms `resume` is **not** in its scope). Mirror the existing public `getBySlug` shape + projection discipline.

- `export const resume = query({ args: { token: v.string() }, handler })`:
  1. `by_resumeToken` lookup `.first()` on `form_submissions`. If missing or `status !== "partial"` → `return null` (completed/spam/deleted are not resumable → route shows NotFound/Expired).
  2. **Expiry:** if a TTL applies, `return { status: "expired" as const }`. The schema has **no `expiresAt` column today** (verified) — so for v1 compute expiry from `submittedAt + DEFAULT_TTL_MS` (30 days, PRD §11) at read time. (If/when the Submission System adds an explicit `form_submissions.expiresAt`, read that instead — owned there, not here.)
  3. Load the parent `form`; if missing or `status !== "published"` → `null`.
  4. Read answers from `fieldValues` by `withIndex("by_entity", q => q.eq("entityType","form_submission").eq("entityId", sub._id))`.
  5. Project **resume-safe only** (never admin authoring metadata): `{ submissionId, formSlug: form.slug, status: "partial", currentStep: sub.currentStep ?? 0, expiresAt?, values: Object.fromEntries(rows.map(r => [r.fieldKey, r.value])) }`. **Key `values` by `fieldKey`** (string→string) so it drops straight into the wizard's `Record<string,string>` value map and the renderer's `key`-keyed state — values are already strings in `fieldValues.value`, so no engine decode is needed (do NOT introduce a `parseFieldValue` import the Website renderer doesn't use).
- No `requireCan`, no auth: the opaque token **is** the credential for an anonymous draft (PRD §7, §11). Abuse control on reads is the Spam System's job on the underlying surface.

**Proves:** an anonymous respondent can re-fetch exactly their own partial draft by token, expiry-enforced server-side, with zero leakage of authoring metadata and a value map that needs no client transform. **Admin does not deploy** — code ends at "written + types pass"; deployment is the convex-deployment agent's job.

---

### Step 11 — Consume (do NOT author): Submission System `submit` upgrades
**File:** (owned by Form Submission System) `packages/backend/convex/extensions/forms/mutations.ts`

This system **depends on** but does **not own** these. Verify they land (Submission System PLAN lines 86, 90) and confirm the wizard's resiliency (§0.B) bridges the gap until they do:

- `submit` **mints** `resumeToken` (`generateResumeToken()`) on first partial insert and **returns** it (`{ submissionId, isComplete, resumeToken }`).
- `submit` accepts a **`currentStep: v.optional(v.number())`** arg and persists it on insert + patch (so resume returns to the right page). The committed insert already writes `currentStep: undefined`; the rewrite wires the arg through.
- The `form.progress_saved` event payload gains **`step`** (the persisted `currentStep`, not the stale `existing?.currentStep`) and **`email`** (resolved from an answered email-type field when present) so the Notification System can send "Resume Your Form" (PRD §8, §9). The event already fires on the `!isComplete` branch (`FORM_EVENTS.PROGRESS_SAVED`); this enriches its payload.

**If these are not yet live when the wizard ships:** autosave still works (the wizard mints its own token and the upsert-by-token branch already exists); `currentStep` round-trips as 0 until the arg is accepted; the resume **email** simply isn't sent (no `email` in payload) — the deep-link resume path still works. No wizard rework needed when the upgrades land — the wizard prefers server values when present.

---

## 3. Verify checklist

**Website** — run from `ConvexPress-Website/apps/web` (**never deploy Convex from this repo**):

Per-batch type gate (after steps 1–3, 4–7, 8–9):
- [ ] `bun run check-types` — `tsc --noEmit` clean. (`(api as any)` casts mean the unbuilt `resume`/`submit` upgrades do not break types.)

Full Website verify (after step 9):
- [ ] `bun run check-types` — clean.
- [ ] `bun run lint` — oxlint clean (no `@radix-ui/*`, no hardcoded colors, no `@/templates/*`).
- [ ] `bun run smoke:ssr` — `/forms/$slug` and `/forms/$slug/resume/$token` SSR without throwing (no `window`/`crypto` at module load).
- [ ] Grep guard: no `@convexpress/field-engine` import (does not exist); no `@backend/convex` admin-API import under `extensions/forms/`.
- [ ] Unit: `wizardSteps.test.ts` covers — no breaks → 1 step; leading/trailing/consecutive breaks → no empty steps; N breaks → N+1 steps with correct `fieldKeys` + titles; skip when every field hidden; `computeActiveSteps` matches `evaluateConditionalLogic`.

**Admin** — run from `ConvexPress-Admin` (after step 10):
- [ ] `bun run check-types` (or the repo's typecheck) clean — **never `--typecheck=disable`**; Convex TS2589 false positives get a scoped `@ts-expect-error`, not a flag.
- [ ] `resume` projects only resume-safe fields (grep the handler — no `createdBy`/`updatedBy`/`ip`/`meta`/authoring fields in the return).

**Behavior verify (Playwright / browser, once `getBySlug` + `submit` + `resume` are deployed):**
- [ ] Form with no `page_break` → renders as one page, no progress bar, single Submit (identical to bare renderer).
- [ ] Form with `page_break`s → steps split at breaks; "Step X of N" correct; Back/Next move between steps; break `label` is the step title.
- [ ] Conditional skip: answers that hide every field on a step collapse it from the progress bar and skip it in both directions; current-step-emptied clamps to nearest active step (no blank page).
- [ ] Next with a required-empty visible field → inline error, no advance; Back never blocks.
- [ ] Type, pause ~1s → `AutosaveIndicator` shows "Saving…" → "Saved"; one `form_submissions` partial row created (not duplicated across saves).
- [ ] Step change flushes an immediate save (draft never a keystroke behind).
- [ ] Autosave network failure → "Couldn't save", input still works, values retained, next change retries.
- [ ] Resume deep-link `/forms/$slug/resume/$token` → SSR rehydrates values + jumps to `currentStep`; `ResumeBanner` shows.
- [ ] Resume after completion / unknown token → `DraftExpiredNotice` or `NotFoundPage`; a finished entry can't reopen.
- [ ] Expired draft (past TTL) → `resume` refuses server-side → `DraftExpiredNotice` + start-fresh CTA; no stale data.
- [ ] Final submit with a server-required field on a server-active step missing → server rejects; wizard jumps to first offending step with inline errors; partial NOT promoted.
- [ ] Final submit success → `onSubmitted` fires (Confirmation handoff); partial flips to complete.
- [ ] `forms` extension disabled → both `/forms/$slug` and the resume route render `NotFoundPage`.

---

## 4. File manifest

**New (Website — `ConvexPress-Website/apps/web/src/`):**
```
extensions/forms/wizardSteps.ts               # deriveSteps + active/skip helpers (pure)
extensions/forms/wizardSteps.test.ts          # step-model unit tests
extensions/forms/StepProgress.tsx             # live, skip-aware progress indicator
extensions/forms/StepNav.tsx                  # Back / Next / final-Submit, validate-before-next
extensions/forms/AutosaveIndicator.tsx        # saving / saved / couldn't-save (role=status)
extensions/forms/ResumeBanner.tsx             # "welcome back" banner (resume path only)
extensions/forms/DraftExpiredNotice.tsx       # expired/completed/unknown → start-fresh CTA
extensions/forms/FormWizard.tsx               # the host (state machine, autosave, final submit)
routes/_marketing/forms.$slug.resume.$token.tsx  # public no-auth resume route + SSR prefetch
```

**Edited (Website):**
```
components/forms/FormFieldRenderer.tsx        # add "page_break" to LAYOUT_TYPES (renders null)
components/forms/FormRenderer.tsx             # add step / onValuesChange / hideSubmit / initialValues seams; +"page_break" in its LAYOUT_TYPES
routes/_marketing/forms.$slug.tsx            # mount <FormWizard> instead of <FormRenderer>
```

**New + edited (Admin — `ConvexPress-Admin/packages/backend/convex/extensions/forms/`):**
```
queries.ts                                    # EDIT: append public `resume` query (the ONE new backend fn)
```

**Consumed (owned by other PRDs — NOT created here):**
```
(api as any).extensions.forms.queries.getBySlug   # Renderer/Submission — public form read (on disk)
(api as any).extensions.forms.mutations.submit    # Submission System — public unauth write (on disk; array values)
@/components/forms/FormRenderer                    # Form Renderer System — wrapped, not rebuilt
@/lib/forms/conditionalLogic.evaluateConditionalLogic  # shared evaluator (serialized-JSON + value-map signature)
mutations.submit → resumeToken return + currentStep arg + progress_saved {step,email}  # Submission System upgrades (Step 11 dependency)
form.progress_saved → "Resume Your Form" email     # Notification System
```

---

## 5. Why this order

1 builds the **pure step model** first — the one piece with real algorithmic content, type-checkable and unit-testable with zero React/Convex, and the contract every UI piece below reads.
2–3 prepare the **renderer** to be wrapped (layout-skip `page_break`, additive `step`/`onValuesChange`/`hideSubmit`/`initialValues` seams) **without breaking its standalone single-page path** — the deal-breaker "never remove functionality" rule.
4–6 build the **leaf UI** (progress, nav, status surfaces) bottom-up so the host composes ready parts.
7 assembles the **host** (state machine + autosave + final submit) against the real renderer + real array-shaped `submit`, made resilient to the Submission System's pending token/step upgrades.
8–9 expose the wizard through the **resume route** and the **hosted form route**, proving one host, two entry points (fresh + resumed), gated and SSR-first.
10 adds the **single new backend function** (`resume`) on the DB-owning Admin app, projection-safe and expiry-enforced.
11 is a **dependency to verify, not author** — the wizard already works via client-minted tokens and upgrades transparently when the Submission System returns server tokens + persists `currentStep`.

Throughout: the wizard **wraps** the renderer (never forks it), **imports** the shared evaluator (never re-implements it), **anchors to the on-disk array `submit` contract** (not the PRD's Record sketch), owns **zero submission schema** and exactly **one** new query, and degrades to plain single-page rendering when a form has no `page_break`. Lean, concrete, decoupled, additive-only.

---

**PLAN Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Multi-Step & Save-Continue System · **Apps:** ConvexPress-Website (wizard) + ConvexPress-Admin (`resume` query) · **Extension:** ConvexPress Forms (v2)
