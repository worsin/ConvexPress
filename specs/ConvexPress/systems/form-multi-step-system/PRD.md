# PRD: Form Multi-Step & Save-Continue System

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). The wizard layer of the Forms tree; wraps the Form Renderer and drives the Form Submission System's partial-state path.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** The **multi-page wizard + save-and-continue orchestrator** that turns a single long form into a paginated, resumable experience on the Website. It is a **thin coordination layer**: it adds no submission table, no validator, and no new field renderers. It segments the form into steps from `page_break` fields, drives back/next navigation and a progress indicator, debounce-autosaves a draft through the existing partial-state submit path, and issues/consumes a `resumeToken` so a respondent can leave and return. It sits **on top of** the public Form Renderer (which still renders one step's fields) and **delegates every write** to the Form Submission System.

**Recommended home:** `ConvexPress-Website/apps/web/src/extensions/forms/` — a `FormWizard` host that wraps the existing `FormRenderer` (the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`) §6) plus the resume route under `_marketing`. The `page_break` field type is registered into the shared engine from the extension's engine-registration entry (the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`) §4) — not forked into a second registry. The reference implementation for the whole UX is the **EZ Entity Setup 9-step signup wizard**: numbered progress indicator, back-navigation, conditional step-skipping, ~1s debounced autosave, and resume-on-return.

**Consumes these ConvexPress systems:**

- **Form Renderer System** (`@convexpress/field-engine` host) — the wizard renders **one step at a time** by feeding `FormRenderer` the renderer's existing `step={ index, total, fieldKeys }` handoff seam (the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`) §2.3, §6 `FormProgress`). The renderer owns field rendering, inline UX validation, and conditional show/hide *within* a step; the wizard owns *which* fields constitute the current step and the navigation between steps.
- **Form Submission System** — every persistence call is the existing **public, unauthenticated** `submit` mutation with `isComplete: false` (autosave / per-step) and finally `isComplete: true` (final step). The wizard **never** invents a `saveDraft` mutation — `saveDraft` is `submit({ isComplete: false })` (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §8.2). The wizard reads back the `submissionId` + `resumeToken` from that call and reuses them on every subsequent autosave.
- **Form Field Engine** — registers the `page_break` field type (no stored value, layout-class) via the engine's `registerFieldType` registration API (the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`) §4, §6). The engine's validator + serializer already skip layout fields, so `page_break` stores nothing and never validates.
- **Form Spam & Submission Security System** — the autosave + resume calls are unauthenticated and therefore **rate-limited by the Spam guard** the submit mutation already invokes (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §5.1). The wizard adds no auth of its own; abuse control on the high-frequency autosave path is the Spam system's job.
- **Form Notification System** — the "Resume Your Form" email is owned + implemented there, triggered off the `form.progress_saved` event this system emits (see §8).
- **Public plugin gate** — both routes (`/forms/$slug`, `/forms/$slug/resume/$token`) wrap in `<PublicPluginGate pluginId="forms">`; a disabled `forms` extension 404s, exactly as the Renderer's hosted-form route does.

**WooCommerce / WordPress analog:** Gravity Forms' **Page** field + multi-page navigation (`gform_page`, the page-break-driven step model) combined with its **Save and Continue Later** feature (`GFFormDisplay` partial entries + the emailed resume link / `resume_token`). The page-break-as-delimiter model and the resume-token email are a direct parity.

---

## 1. Overview

### 1.1 Purpose

Turn a long single-page form into a **paginated wizard with save-and-resume**, without duplicating any of the rendering, validation, or persistence machinery that already exists. Concretely: split the form's field list into ordered **steps** at each `page_break` field; render exactly one step at a time through the existing `FormRenderer`; show a **progress indicator**; allow **back / next** navigation; **skip steps** whose every field is hidden by conditional logic; **debounce-autosave** the in-progress answers (~1s after the last keystroke) as a `partial` submission; and let the respondent **leave and return** via a `resumeToken` (deep-link `/forms/$slug/resume/$token` and an emailed "Resume Your Form" link). The final step calls the same submit mutation with `isComplete: true`, promoting the partial to a complete entry.

The bar for the entire UX is the **EZ Entity Setup 9-step signup wizard**: a numbered step indicator, free back-navigation to prior steps, steps that vanish when not applicable, autosave roughly one second after typing stops, and a draft that rehydrates exactly where the user left off when they return.

### 1.2 Scope

**In scope:**
- A **`FormWizard`** host that wraps `FormRenderer`, derives steps from `page_break` fields, and owns step state.
- The **step model**: deriving ordered steps from the form's `page_break` delimiters; the field-key set per step.
- A **wizard state machine**: `currentStep`, furthest-reached step, navigation guards (validate-current-before-next), `loading-draft` / `submitting` / `complete` states.
- **Back / next navigation** + a clickable/labeled **progress indicator**.
- **Conditional step-skipping**: a step whose every field evaluates hidden (via the engine's `evaluateConditionalLogic`) is skipped in both directions, client-side, mirrored server-side at completion.
- **Debounced autosave** (~1s) of the working value map to a `partial` submission via `submit({ isComplete:false })`, capturing `submissionId` + `resumeToken` + `currentStep`.
- The **resume flow**: the `/forms/$slug/resume/$token` route, draft rehydration into the value map + step position, and an **`AutosaveIndicator`** / **`ResumeBanner`**.
- Emitting **`form.progress_saved`** for the Notification System's "Resume Your Form" email.
- Registering the **`page_break`** field type into the shared engine (no value).

**Out of scope:**
- Field rendering, inline UX validation, per-field conditional show/hide **within** a step — owned by the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`) and the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`). The wizard reuses, it does not rebuild.
- The submit mutation, the `form_submissions` table, the `resumeToken` column, server-trusted validation, and the partial→complete promotion — owned by the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`). This system **calls** that path; it owns no submission schema.
- The server-side mirror of conditional logic + the rule that a server-hidden field is not required — owned by the Form Logic & Validation System PRD (`specs/ConvexPress/systems/form-logic-validation-system/PRD.md`). The wizard's client-side step-skip is the UX half of that contract; the server is authoritative on completion.
- Rate-limiting / honeypot / CAPTCHA on the autosave + resume calls — owned by the Form Spam & Submission Security System PRD (`specs/ConvexPress/systems/form-spam-security-system/PRD.md`). The wizard adds no auth and trusts the guard already wired into `submit`.
- The "Resume Your Form" email template + send — owned by the Form Notification System PRD (`specs/ConvexPress/systems/form-notification-system/PRD.md`). This system only emits the event.
- Post-completion confirmation message / redirect — owned by the Form Confirmation System PRD (`specs/ConvexPress/systems/form-confirmation-system/PRD.md`). The wizard hands off on the final submit exactly as a single-page render does.
- The admin builder UI for inserting `page_break` fields + ordering steps — owned by the Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`).
- Calculations/pricing/payment-step concerns (the Form Calculation & Pricing System PRD (`specs/ConvexPress/systems/form-calculation-pricing-system/PRD.md`)).

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Form Renderer System | The wizard wraps `FormRenderer` and drives it through the existing `step={index,total,fieldKeys}` + `FormProgress` handoff seam; the renderer still owns per-field render/validate/visibility. |
| Form Submission System | Provides the public unauthenticated `submit` mutation, the `partial` status, the `resumeToken` column, `currentStep`, and the partial→complete promotion. This system writes nothing of its own. |
| Form Field Engine | `registerFieldType` to add `page_break` (layout, no value); `evaluateConditionalLogic` (pure) to decide step-skip; the validator/serializer that already skip layout fields. |
| Form Spam & Submission Security System | Rate-limits the high-frequency autosave + the resume calls (already invoked inside `submit`). |

### 2.2 Systems that depend on this

| System | Integration point |
|---|---|
| Form Notification System | Subscribes to `form.progress_saved`; sends the "Resume Your Form" email to the respondent. |
| Form Builder System | Authors `page_break` fields + step order that this system reads; surfaces wizard settings (autosave on/off, resume expiry). |
| Form Confirmation System | Receives the final-step success handoff (message vs redirect) via the renderer's `onSubmitted`, unchanged from the single-page path. |

### 2.3 Integration shape

```typescript
// What the wizard host accepts (Website-side). It composes the renderer; it does
// not replace it. `form` is the SAME PublicFormDefinition the Renderer consumes.
interface FormWizardProps {
  form: PublicFormDefinition;           // from the Renderer's public getBySlug query
  // Resume entry point: when present, the wizard loads the draft for this token
  // and rehydrates the value map + step position before first paint.
  resumeToken?: string;
  // Seed values for a fresh start (Merge Tags & Prefill owns the source); ignored
  // when resumeToken hydrates an existing draft.
  initialValues?: Record<string, unknown>;
  // Final-step success handoff, forwarded straight to the Confirmation System.
  onSubmitted?: (result: SubmitResult) => void;
  // Wizard behaviour (authored in the Builder; sensible defaults here).
  options?: {
    autosave?: boolean;                 // default true
    autosaveDelayMs?: number;           // default ~1000 (EZ Entity Setup parity)
    showProgress?: boolean;             // default true
    allowBackNav?: boolean;             // default true
  };
}

// A derived step. Steps are computed from page_break delimiters, never stored as
// their own records — the page_break fields ARE the step boundaries.
interface WizardStep {
  index: number;                        // 0-based position among NON-skipped steps
  title?: string;                       // page_break field's label, if any
  fieldKeys: string[];                  // engine field keys rendered on this step
  isSkippable: boolean;                 // true if every field can be hidden by logic
}

// The shape the wizard reads back from a resume / draft load (projected by a
// public, no-auth query that re-reads the partial submission by token).
interface ResumeDraft {
  submissionId: string;                 // form_submissions _id (Submission System)
  formSlug: string;
  values: Record<string, unknown>;      // fieldName -> parsed value (engine-decoded)
  currentStep: number;                  // last persisted step position
  status: "partial";                    // only partial drafts are resumable
  expiresAt?: number;                   // resume-token TTL (see §9)
}
```

---

## 3. Architecture

### 3.1 The step model — derived from `page_break`, never stored

A multi-step form is **not** a new data structure. It is the *same* flat, ordered field list the renderer already consumes, **segmented at each `page_break` field**. The `page_break` fields are the delimiters; the steps are the runs of fields between them. Nothing about steps is persisted as its own record — re-deriving steps from the definition keeps the Builder, Renderer, and wizard in lockstep and means the engine's existing `menuOrder` is the single ordering source.

```
form.fields (menuOrder)                         derived steps
┌──────────────────────────┐
│  name      (text)        │  ┐
│  email     (email)       │  ├─ step 0  fieldKeys: [name, email]
│  ── page_break ──────────│  ┘
│  company   (text)        │  ┐
│  role      (select)      │  ├─ step 1  fieldKeys: [company, role, size]
│  size      (number)      │  │
│  ── page_break ──────────│  ┘
│  details   (textarea)    │  ┐  step 2  fieldKeys: [details]   (skippable if
│  ── page_break ──────────│  ┘            `details` is hidden by logic)
│  consent   (true_false)  │  ─  step 3  fieldKeys: [consent]
└──────────────────────────┘
```

```typescript
// Pure derivation — no I/O. A single page_break starts a new step. Leading /
// trailing page_breaks and consecutive page_breaks never produce empty steps.
function deriveSteps(fields: PublicFieldDefinition[]): WizardStep[] {
  const ordered = [...fields].sort((a, b) => a.menuOrder - b.menuOrder);
  const runs: PublicFieldDefinition[][] = [[]];
  let title: (string | undefined)[] = [undefined];

  for (const f of ordered) {
    if (f.type === "page_break") {
      runs.push([]);                 // begin a new step
      title.push(f.label);           // the break's label becomes the next step title
    } else {
      runs[runs.length - 1].push(f);
    }
  }

  return runs
    .map((run, i) => ({ run, title: title[i] }))
    .filter(({ run }) => run.length > 0)         // drop empty runs (consecutive breaks)
    .map(({ run, title }, index) => ({
      index,
      title,
      fieldKeys: run.map((f) => f.key),
      isSkippable: run.every((f) => f.conditionalLogic != null),
    }));
}
```

A form with **zero** `page_break` fields yields exactly one step — i.e. the wizard degrades to the renderer's single-page behaviour, and `FormWizard` renders the same thing `FormRenderer` would alone (graceful no-op).

### 3.2 Wizard state machine

The wizard owns a small, explicit machine over the derived steps. It never owns field values authoritatively — those live in the renderer's value map, lifted to the wizard so autosave and step-validation can read them.

```
                 load (resumeToken?)            no token / fresh
                        │                              │
                        ▼                              ▼
                ┌───────────────┐               ┌───────────────┐
                │ loading-draft │ ───hydrated──▶ │   on-step(n)  │ ◀── back/next ──┐
                └───────┬───────┘               └───────┬───────┘                 │
                  fail/ │ expired                       │  next: validate current  │
                        ▼                               │  step (renderer rules);   │
                ┌───────────────┐                       │  if ok → advance to next  │
                │ draft-expired │                       │  NON-skipped step ───────┘
                └───────────────┘                       │
                                                        │ on final step → submit({isComplete:true})
                                                        ▼
                                                ┌───────────────┐
                                                │  submitting   │ ──ok──▶ complete (onSubmitted)
                                                └───────────────┘ ──err─▶ back to on-step(n) w/ errors

Cross-cutting (any on-step state):
- value change ──▶ schedule debounced autosave (~1s) ──▶ submit({isComplete:false})
                   ──▶ store submissionId + resumeToken + currentStep ──▶ AutosaveIndicator "Saved"
- the FURTHEST-reached step is tracked so the progress indicator can mark visited
  steps and (when allowBackNav) allow jumping back to any visited step.
```

State, in component terms:

```typescript
interface WizardState {
  stepIndex: number;                    // current NON-skipped step
  furthestStep: number;                 // max visited (gates forward jumps)
  values: Record<string, unknown>;      // lifted from the renderer's value map
  submissionId?: string;                // set by the first autosave / draft load
  resumeToken?: string;                 // set by the first autosave / draft load
  phase: "loading-draft" | "on-step" | "submitting" | "complete" | "draft-expired";
  saveState: "idle" | "saving" | "saved" | "save-error";
  errors: Record<string, string>;       // server field errors mapped on final submit
}
```

### 3.3 Conditional step-skipping

A step is **skipped** when *every* field in it is hidden by the engine's conditional logic for the current value map. Skipping is computed with the **same pure function the renderer uses** (`evaluateConditionalLogic`), so the wizard and the per-field renderer never disagree about visibility. Skipping applies in **both directions** (next skips forward past empty steps; back skips backward) and the **progress indicator collapses** to show only live steps.

```typescript
// Visible fields on a step, for the CURRENT value map. A step with no visible
// fields is skipped. Identical evaluator to the renderer (engine PRD §6).
function visibleFieldKeys(step: WizardStep, values: Record<string, unknown>, all: PublicFieldDefinition[]) {
  return step.fieldKeys.filter((k) => {
    const field = all.find((f) => f.key === k)!;
    return evaluateConditionalLogic(field, values);
  });
}

function isStepActive(step: WizardStep, values: Record<string, unknown>, all: PublicFieldDefinition[]) {
  return visibleFieldKeys(step, values, all).length > 0;
}

// next(): advance to the nearest higher-index ACTIVE step; if none, it's the end.
// prev(): retreat to the nearest lower-index ACTIVE step.
```

**Authority note:** client-side skipping decides only what the respondent *sees and steps through*. On the final `submit({ isComplete:true })`, the server re-derives visibility from the submitted values and a field on a server-*active* step that is required-and-missing still fails — exactly the Submission System's rule (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §9; the Form Logic & Validation System PRD (`specs/ConvexPress/systems/form-logic-validation-system/PRD.md`)). The wizard's skip is UX; the server is the source of truth.

### 3.4 Debounced autosave

Autosave mirrors the EZ Entity Setup cadence: **~1s after the last change**, the working value map is written as a `partial` submission. The first autosave creates the partial row and returns a `submissionId` + `resumeToken`; every later autosave **reuses** that `resumeToken` so all writes target the **same** draft (idempotent on the token, per the Submission System's resume branch). Autosave also fires on **step transition** (an immediate flush, not debounced) so a draft is never a keystroke behind when the user clicks Next.

```typescript
// Debounced autosave inside FormWizard. saveDraft IS submit({isComplete:false}).
const submit = useMutation(api.extensions.forms.public.submit); // Submission System
const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

function scheduleAutosave(next: Record<string, unknown>, stepIndex: number) {
  if (options?.autosave === false) return;
  setSaveState("saving");
  if (timer.current) clearTimeout(timer.current);
  timer.current = setTimeout(() => void flushAutosave(next, stepIndex),
    options?.autosaveDelayMs ?? 1000);                          // ~1s, EZ Entity parity
}

async function flushAutosave(values: Record<string, unknown>, stepIndex: number) {
  try {
    const res = await submit({
      formId: form._id,
      values,                       // untrusted; server re-validates shape, not required-ness
      isComplete: false,            // PARTIAL — required-ness NOT enforced (Submission §8.2)
      resumeToken: resumeTokenRef.current, // reuse so all autosaves hit ONE draft row
      // currentStep is stored on the partial so resume returns to the right page
      // (Submission System persists form_submissions.currentStep).
    });
    submissionIdRef.current = res.submissionId;
    resumeTokenRef.current = res.resumeToken ?? resumeTokenRef.current;
    setSaveState("saved");          // AutosaveIndicator → "Saved" / timestamp
  } catch {
    setSaveState("save-error");     // non-blocking: the respondent can keep filling
  }
}

// Flush immediately on step change so a draft is never behind the visible step.
function goNext() { void flushAutosave(values, nextActiveIndex); setStepIndex(nextActiveIndex); }
```

Autosave failures are **non-blocking** — a dropped autosave never stops the respondent from continuing; it surfaces a quiet "Couldn't save" state and retries on the next change/step. Required-ness is *not* enforced on these partial writes (the Submission System enforces required only on completion), which is what lets a half-filled step be saved.

### 3.5 Resume-token flow

The `resumeToken` is **issued by the Submission System** on the first partial write (the wizard does not mint it) and is the key for both deep-link resume and the emailed link.

```
fill step 0/1 ──▶ debounced autosave ──▶ submit({isComplete:false})
                                            │
                                            ├─▶ form_submissions row (status:"partial",
                                            │     resumeToken, currentStep)  ── Submission System
                                            └─▶ form.progress_saved event ── this system
                                                       │
                                                       ▼
                                         Notification System sends
                                         "Resume Your Form" email containing
                                         /forms/$slug/resume/$token

later ──▶ GET /forms/$slug/resume/$token ──▶ public no-auth resume query (by token)
              │
              ├─ token valid + status "partial" + not expired ──▶ ResumeDraft
              │      └─▶ FormWizard hydrates values + jumps to currentStep, shows ResumeBanner
              ├─ token unknown / not partial ──────────────────▶ NotFoundPage
              └─ token expired (TTL) ──────────────────────────▶ "this link expired" + start-fresh CTA
```

The resume read is a **public, unauthenticated** query (mirrors the renderer's `getBySlug`), projected to publish-safe + draft-owner-safe fields only. Knowledge of the opaque token *is* the authorization for an anonymous draft (there is no account to bind it to). On completion the token is consumed (the partial flips to `complete`; the Submission System clears/ignores `resumeToken` for completed rows), so a resumed-then-completed link can't reopen a finished entry (see §9, §10).

---

## 4. Field Types Added

### 4.1 `page_break` (registered into the shared engine)

This system contributes exactly **one** field type to the engine catalog, via the engine's registration API (the Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`) §4, §6 `registerFieldType`). It is **not** forked into a parallel registry.

| Property | Value |
|---|---|
| Type slug | `page_break` |
| Class | **Layout / no value** (like `message`, `accordion`, `tab`) |
| Stored value | **None.** The engine serializer + validator already skip layout fields, so a `page_break` produces no `fieldValues` row and never validates (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §8 explicitly lists `page_break` among skipped layout types). |
| Settings | `label` (becomes the step title), optional `nextLabel` / `prevLabel` button overrides, optional per-step description. |
| Role | A **delimiter** between steps. Its position in `menuOrder` is the only thing that matters; `deriveSteps` (§3.1) reads it. |

```typescript
// extension engine-registration entry (Website + Admin share the catalog).
// page_break renders NOTHING inline in the field flow — the WIZARD consumes its
// presence to segment steps. Outside a wizard it is a harmless no-op separator.
registerFieldType({
  type: "page_break",
  layout: true,            // no value; skipped by validate + serialize
  render: () => null,      // the wizard draws step UI; the field itself is invisible
  settingsSchema: {
    label: { type: "text", optional: true },        // step title
    nextLabel: { type: "text", optional: true },     // override "Next"
    prevLabel: { type: "text", optional: true },     // override "Back"
    description: { type: "textarea", optional: true },
  },
});
```

Because `page_break` registers through the engine, the Builder gets it in the field palette for free, the Renderer skips it for free, and the Submission System stores nothing for it for free — the wizard is the only system that assigns it meaning.

---

## 5. Data Model

**No new tables. The wizard owns zero schema.** It reuses the Form Submission System's `form_submissions` partial-state path wholesale:

- **`form_submissions.status = "partial"`** — every autosaved draft is a partial submission. The wizard creates/updates it only through `submit({ isComplete:false })`; on the final step `submit({ isComplete:true })` promotes it to `complete` (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §4.3 state machine).
- **`form_submissions.resumeToken`** — issued by the Submission System on the first partial write; the wizard reads it back and reuses it. Indexed `by_resumeToken` already (Submission §4.1) so the resume query is a single indexed lookup.
- **`form_submissions.currentStep`** — already present on the Submission table (Submission §4.1 `currentStep: v.optional(v.number())`). The wizard writes the **active step index** here on each autosave so resume returns to the right page. This is the one piece of "step position" state, and it lives on the **existing** column — no new field needed.
- **Answers → `fieldValues`** — per-field answers for an in-progress draft are stored exactly like a complete entry, through the engine's `fieldValues` model (`entityType: "form_submission"`, `entityId: <submissionId>`). There is **no draft-specific values table**; a partial entry's answers and a complete entry's answers are the same rows, only the parent `status` differs.

```
deriveSteps(form.fields)            (pure; no storage)
        │
   autosave / step change
        ▼
submit({ isComplete:false, resumeToken? })  ── Form Submission System ──▶
        ├─ form_submissions  (status:"partial", resumeToken, currentStep)   ◀── REUSED
        └─ fieldValues × N   (entityType:"form_submission")                  ◀── REUSED
        │
final step: submit({ isComplete:true }) ──▶ status:"complete", completedAt set
```

**Optional step-position note:** `currentStep` is sufficient for resume. If a form later needs richer wizard telemetry (e.g. furthest-reached step, per-step timestamps), that belongs in the Submission System's existing `meta: v.optional(v.any())` bag (Submission §4.1) — **not** a new table and **not** a new top-level column owned here. The wizard stays schema-free.

---

## 6. Routes

### 6.1 Public routes (Website app)

| Route | Path | Layout | App | Auth Required | Roles |
|---|---|---|---|---|---|
| Hosted Form (wizard) | `/forms/$slug` | `_marketing` | Website | No | Guest, Subscriber |
| Form Resume | `/forms/$slug/resume/$token` | `_marketing` | Website | No | Guest, Subscriber |

- **`/forms/$slug`** is the **same route the Form Renderer owns** (the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`) §4). The wizard does not add a second hosted-form route; it is the host the renderer route mounts when the form contains `page_break` fields (or always, degrading to single-step when there are none — §3.1). `auth=false`; `loginRequired` forms still additionally gate on a signed-in `Subscriber`, unchanged from the renderer.
- **`/forms/$slug/resume/$token`** is **new and owned by this system**. It is `auth=false` and public: the opaque token is the credential for an anonymous draft. It loads the partial via the public resume query, then mounts the same `FormWizard` pre-hydrated to `currentStep`.

**Plugin gate.** Both routes wrap in `<PublicPluginGate pluginId="forms">` (mirror the renderer + `signup.$offerId.tsx`): a disabled `forms` extension renders `<NotFoundPage />`.

### 6.2 Resume route — SSR prefetch + hydrate

The resume route prefetches the draft in its loader so SSR rehydrates the form at the right step without a spinner — the same `convexQuery` + `ensureQueryData` mechanic the renderer's hosted route uses.

```tsx
// ConvexPress-Website/apps/web/src/routes/_marketing/forms.$slug.resume.$token.tsx
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { FormWizard } from "@/extensions/forms/FormWizard";
import { DraftExpiredNotice } from "@/extensions/forms/DraftExpiredNotice";

export const Route = createFileRoute("/_marketing/forms/$slug/resume/$token")({
  loader: async ({ context: { queryClient }, params }) => {
    // Public, no-auth resume read: re-fetch the partial submission by token.
    await queryClient.ensureQueryData(
      convexQuery(api.extensions.forms.public.resume, { token: params.token }),
    );
    return { seoHead: { title: "Resume your form - ConvexPress" } };
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.seoHead.title }] }),
  component: ResumeFormPage,
});

function ResumeFormPage() {
  const { slug, token } = Route.useParams();
  const { data: draft } = useTanStackQuery(
    convexQuery(api.extensions.forms.public.resume, { token }),
  );
  const { data: form } = useTanStackQuery(
    convexQuery(api.extensions.forms.public.getBySlug, { slug }), // renderer's query
  );

  return (
    <PublicPluginGate pluginId="forms">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12 md:py-16">
        {draft === undefined || form === undefined ? (
          <FormSkeleton />
        ) : draft === null || form === null || form.status !== "published" ? (
          <NotFoundPage />
        ) : draft.status !== "partial" || (draft.expiresAt && draft.expiresAt < Date.now()) ? (
          <DraftExpiredNotice slug={slug} /> // expired / already-completed → start-fresh CTA
        ) : (
          <FormWizard
            form={form}
            resumeToken={token}
            initialValues={draft.values}        // rehydrate answers; wizard jumps to draft.currentStep
          />
        )}
      </main>
    </PublicPluginGate>
  );
}
```

---

## 7. Actions

### 7.1 Public actions (NOT capability-gated)

Both actions are **public** — callable by any role **and anonymous guests** — exactly as the Submission System's `submit` is. They carry **no `requireCan`**. Abuse control on these (especially the high-frequency autosave) is the **Form Spam & Submission Security System**'s job via the rate-limit + honeypot guard already wired into `submit` (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §5.1, §9), **not** authorization.

| Action | Code | Verb | Description | Roles | Triggers Events |
|---|---|---|---|---|---|
| Save progress | `form.save_progress` | Update | Debounce-autosave / per-step write of the working value map as a `partial` submission; issue/reuse `resumeToken`, persist `currentStep`. **Is** `submit({ isComplete:false })` — not a new mutation. | **All roles AND anonymous / guests** | `form.progress_saved` |
| Resume | `form.resume` | Read | Load a `partial` submission by `resumeToken` (publish-safe + draft projection) so the wizard can rehydrate values + step. Public, no-auth. | **All roles AND anonymous / guests** | — |

**Implementation note — `save_progress` is not a new mutation.** Per the Submission System's contract (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §8.2), `saveDraft` *is* `submit({ isComplete:false })`; this keeps a single validated ingestion path and avoids draft/final drift. `form.save_progress` is this system's **logical action name** for that call (it is what emits `form.progress_saved`), not a second backend mutation. The only genuinely new backend surface this system adds is the public **`resume`** read query.

```typescript
// packages/backend/convex/extensions/forms/resume.ts  (the ONE new backend fn)
import { query } from "../../_generated/server";
import { v } from "convex/values";
import { parseFieldValue } from "@convexpress/field-engine";

// PUBLIC: no auth. The opaque token is the credential for an anonymous draft.
// Projects only resume-safe fields; never leaks admin authoring metadata.
export const resume = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("form_submissions")
      .withIndex("by_resumeToken", (q) => q.eq("resumeToken", args.token)) // Submission index
      .first();
    // Only partial drafts are resumable; completed/spam/deleted are not.
    if (!sub || sub.status !== "partial") return null;
    if (sub.expiresAt && sub.expiresAt < Date.now()) return { status: "expired" as const };

    const form = await ctx.db.get(sub.formId);
    if (!form || form.status !== "published") return null;

    // Answers come from the engine's fieldValues — decoded for the value map.
    const rows = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "form_submission").eq("entityId", sub._id))
      .collect();

    return {
      submissionId: sub._id,
      formSlug: form.slug,
      status: "partial" as const,
      currentStep: sub.currentStep ?? 0,
      expiresAt: sub.expiresAt,
      values: Object.fromEntries(rows.map((r) => [r.fieldName, parseFieldValue(r.value)])),
    };
  },
});
```

> `expiresAt` is referenced here as the resume-token TTL. It lives on the Submission System's `form_submissions` row (either a dedicated optional column the Submission System adds, or computed from `submittedAt + TTL`); this system *reads and enforces* it but does not own the column — see §9 and Open Questions.

---

## 8. Events

### 8.1 Events emitted

| Event | Code | Trigger | Payload |
|---|---|---|---|
| Progress Saved | `form.progress_saved` | A `partial` submission is written/updated via the autosave / per-step path | `{ formId, submissionId, resumeToken, step, email }` |

- `step` is the active step index persisted as `currentStep`.
- `email` is the respondent's email **if** an email-type field has been answered by the time of the save — it is the address the "Resume Your Form" email is sent to. When no email is known yet, `email` is omitted and the Notification System cannot (and does not) send a resume email for that save.
- The event is scheduled with `ctx.scheduler.runAfter(0, ...)` **after** the partial write commits — never inline, never before persistence (same discipline as `form.submitted`).

**Relationship to `form.submitted`.** The Submission System already emits `form.submitted` with `isComplete:false` for partial writes (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §6, §12). `form.progress_saved` is the **wizard-specific, resume-oriented** signal carrying the `resumeToken` + `step` + `email` that the resume email needs — data not present in the generic `form.submitted` payload. Notifications key the resume email off `form.progress_saved`; they continue to ignore `form.submitted{isComplete:false}` for the admin/respondent confirmation emails. (Whether `form.progress_saved` is emitted by this system's autosave path or folded into the Submission mutation's partial branch is an Open Question — §11 — but the payload contract above is fixed.)

### 8.2 Events consumed

None. This system is a producer. The final-step completion goes through the Submission System's `submit({isComplete:true})`, which emits `form.submitted{isComplete:true}` itself — the wizard does not re-emit it.

---

## 9. Notifications

Owned + implemented by the **Form Notification System** (`specs/ConvexPress/systems/form-notification-system/PRD.md`); this system's only obligation is to emit `form.progress_saved` with a complete payload (including a resolvable `email`). It sends nothing itself.

### 9.1 Email notifications

| Name | Trigger Event | Recipient | Priority |
|---|---|---|---|
| Resume Your Form | `form.progress_saved` | Customer (respondent) | Immediate |

- **Body:** a friendly "pick up where you left off" message containing the deep link `/forms/$slug/resume/$token` built from the event's `resumeToken`.
- **Send condition:** only when `email` is present in the payload (an email field has been answered). The Notification System should **debounce / de-duplicate** so a respondent who autosaves repeatedly does not receive a resume email on every keystroke-batch — typically one resume email per draft per quiet-period, or only on explicit "save and finish later". That throttling rule lives in the Notification System, keyed off this event.

---

## 10. UI Components

**Website (public) components — all SSR-safe, theme-token colours only:**

- [ ] **`FormWizard`** — the host. Derives steps (`deriveSteps`), owns `WizardState` (§3.2), lifts the value map out of `FormRenderer`, computes active/skipped steps (§3.3), runs debounced autosave (§3.4), and on the final step calls `submit({isComplete:true})` and forwards `onSubmitted`. Renders the current step by passing `FormRenderer` a `step={ index: liveIndex, total: liveTotal, fieldKeys: visibleKeys }` — **reusing** the renderer, not replacing it. When the form has no `page_break`, it renders exactly one step (degrades to plain renderer behaviour).
- [ ] **`StepProgress`** — the progress indicator. Renders the **live** (non-skipped) steps as numbered/labeled segments with current + visited + upcoming states, "Step X of N", and (when `allowBackNav`) clickable visited steps. Collapses as steps are skipped by logic so the count never lies. Drives — and is the richer form of — the renderer's `FormProgress` seam. Accessible: `aria-current="step"` on the active segment; not colour-only.
- [ ] **`StepNav`** — the **Back / Next** controls. **Next** validates the current step's visible fields (via the renderer's existing `validateFieldValue` UX checks) before advancing, flushes an immediate autosave, then jumps to the next **active** step; on the final step **Next** becomes the **Submit** control (pending spinner + disabled, mirroring the renderer's `SubmitButton`). **Back** retreats to the previous active step (gated by `allowBackNav`); back-nav never re-validates (you can always go back). Honors `page_break` `nextLabel` / `prevLabel` overrides.
- [ ] **`AutosaveIndicator`** — a quiet status line reflecting `saveState`: "Saving…", "Saved" (with relative timestamp), or "Couldn't save — we'll retry". Uses `role="status"` so it's announced politely without stealing focus. Never blocks input.
- [ ] **`ResumeBanner`** — shown when the wizard mounts from a resume token: "Welcome back — we restored your progress. Continue from step X." Dismissible; `role="status"`. Appears only on the resume path, not on a fresh start.
- [ ] **`DraftExpiredNotice`** — shown by the resume route when the token is expired / already completed / unknown-as-partial: explains the link is no longer valid and offers a **start-fresh** CTA back to `/forms/$slug`.

**Host composition sketch (wraps the renderer; reuses its submit/pending/error conventions):**

```tsx
// ConvexPress-Website/apps/web/src/extensions/forms/FormWizard.tsx
import { useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { evaluateConditionalLogic } from "@convexpress/field-engine";
import { api } from "@convexpress-website/backend/generated/api";

import { FormRenderer } from "@/extensions/forms/FormRenderer";   // REUSED, not rebuilt
import { StepProgress } from "@/extensions/forms/StepProgress";
import { StepNav } from "@/extensions/forms/StepNav";
import { AutosaveIndicator } from "@/extensions/forms/AutosaveIndicator";
import { ResumeBanner } from "@/extensions/forms/ResumeBanner";

export function FormWizard({ form, resumeToken, initialValues = {}, onSubmitted, options }: FormWizardProps) {
  const submit = useMutation(api.extensions.forms.public.submit); // Submission System

  const steps = useMemo(() => deriveSteps(form.fields), [form.fields]);     // §3.1
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [stepIndex, setStepIndex] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "save-error">("idle");
  const resumeTokenRef = useRef<string | undefined>(resumeToken);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ACTIVE (non-skipped) steps for the current value map — both nav + progress
  // read this so a step hidden by logic is never shown or counted (§3.3).
  const activeSteps = useMemo(
    () => steps.filter((s) => isStepActive(s, values, form.fields)),
    [steps, values, form.fields],
  );
  const current = activeSteps[stepIndex];
  const isFinal = stepIndex === activeSteps.length - 1;

  function onValuesChange(next: Record<string, unknown>) {
    setValues(next);
    scheduleAutosave(next, stepIndex); // debounced ~1s (§3.4)
  }

  return (
    <div className="flex flex-col gap-6">
      {resumeToken ? <ResumeBanner step={stepIndex + 1} /> : null}
      {options?.showProgress !== false ? (
        <StepProgress steps={activeSteps} current={stepIndex} allowBackNav={options?.allowBackNav !== false} />
      ) : null}

      {/* ONE step's fields, rendered by the EXISTING renderer via its step seam. */}
      <FormRenderer
        form={form}
        initialValues={values}
        step={{ index: stepIndex, total: activeSteps.length, fieldKeys: current.fieldKeys }}
        // value changes lifted up so the wizard can autosave + drive nav
        onValuesChange={onValuesChange}
        // the renderer's own submit is suppressed mid-wizard; the wizard owns final submit
      />

      <div className="flex items-center justify-between">
        <StepNav
          canBack={stepIndex > 0 && options?.allowBackNav !== false}
          isFinal={isFinal}
          onBack={() => setStepIndex((i) => Math.max(0, i - 1))}
          onNext={() => { void flushAutosave(values, stepIndex); setStepIndex((i) => i + 1); }}
          onSubmit={async () => {
            const res = await submit({ formId: form._id, values, isComplete: true,
              resumeToken: resumeTokenRef.current });           // promote partial → complete
            if (res?.ok !== false) onSubmitted?.(res);          // hand off to Confirmation System
          }}
        />
        <AutosaveIndicator state={saveState} />
      </div>
    </div>
  );
}
```

> The renderer gains one additive prop — `onValuesChange` (lift the value map) — and a way to suppress its built-in single-page submit when hosted inside a wizard. Both are small, additive seams that complement the renderer's already-declared `step` + `FormProgress` handoff (the Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`) §2.3, §6); they are noted as the renderer's integration point, not a rewrite of it.

---

## 11. Business Rules & Constraints

- **Autosave cadence ~1s, non-blocking.** Autosave fires ~1s after the last change (EZ Entity Setup parity), plus an immediate flush on every step transition. A failed autosave never blocks the respondent — it surfaces a quiet "couldn't save" state and retries on the next change/step. Required-ness is **not** enforced on autosaves (they are `isComplete:false` partial writes; the Submission System enforces required only on completion).
- **One draft per token.** The first autosave creates the partial + `resumeToken`; every later autosave reuses that token so all writes target the **same** `form_submissions` row (idempotent on the token, per the Submission resume branch). The wizard never creates a second draft for the same in-progress fill.
- **Client step-skip is UX only — server re-validates per-page on final submit.** The wizard skips steps and validates-before-next purely for experience. On `submit({isComplete:true})`, the server re-derives visibility from the submitted values and re-validates every server-visible field; a required field on a server-active step that's missing still fails, and a server-hidden field is treated as not-required (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §9; the Form Logic & Validation System PRD (`specs/ConvexPress/systems/form-logic-validation-system/PRD.md`)). A malicious client cannot skip a server-required step.
- **Resume token security.** The `resumeToken` is **opaque and unguessable** (high-entropy random; never sequential, never derived from `submissionId`). Possession of the token is the only credential for an anonymous draft — so it must be treated like a bearer secret: delivered only to the respondent's own email, never logged in plaintext, never exposed in a public list query. The `resume` query returns **only** draft-safe fields and never admin authoring metadata.
- **Resume token expiry.** Drafts expire after a TTL (default proposal: 30 days, mirroring Gravity Forms' partial-entry retention; configurable per form in the Builder). After expiry the `resume` query refuses to rehydrate and the route shows `DraftExpiredNotice`. Expiry is enforced on **read** (server-side `expiresAt` check) so an old link can't reopen stale data even if the row still exists.
- **Completion consumes the draft.** Promoting `partial → complete` is terminal for the token: the Submission System clears/ignores `resumeToken` on completed rows, so a previously-emailed resume link can't reopen a finished entry (the `resume` query returns `null` for non-`partial` status).
- **Public, never capability-gated.** Neither `save_progress` nor `resume` carries `requireCan`. Anonymous respondents must be able to autosave and resume. Abuse control is the Spam & Security system's rate-limit on the underlying `submit` + a sensible cap on resume reads — not authorization.
- **Steps derive from the definition, never stored.** `deriveSteps` recomputes steps from `page_break` delimiters on every load; there is no `form_steps` table. This keeps Builder/Renderer/wizard consistent and means re-ordering fields in the Builder re-segments steps automatically.
- **Graceful single-step degrade.** A form with zero `page_break` fields renders as one step — `FormWizard` behaves identically to `FormRenderer`. Multi-step is purely additive; it never changes single-page behaviour.
- **No new submission schema.** The wizard reuses `form_submissions` (`status:"partial"`, `resumeToken`, `currentStep`) + `fieldValues`. It adds **no** table and **no** owned column. Any richer telemetry goes in the Submission System's existing `meta` bag.
- **SSR-safe.** No `window` at module load (timers/effects only); the resume route SSR-prefetches the draft so the rehydrated step renders server-side (the Website runs TanStack Start SSR).

---

## 12. Edge Cases

| Scenario | Handling |
|---|---|
| Form has no `page_break` | `deriveSteps` yields one step; the wizard renders the whole form as a single page (degrades to plain `FormRenderer`). No progress bar shown for a one-step form. |
| Leading / trailing / consecutive `page_break` | `deriveSteps` drops empty runs — no empty steps, no off-by-one in "Step X of N". |
| Token reuse (same token, multiple autosaves) | Intended path: all writes hit the same partial row (idempotent on `resumeToken`); not a duplicate. |
| Token reuse after completion | The partial flipped to `complete`; `resume` returns `null` (only `partial` is resumable) → `DraftExpiredNotice` / `NotFoundPage`. A finished entry can't be reopened. |
| Expired draft (past TTL) | `resume` refuses on the server-side `expiresAt` check and returns an expired marker → `DraftExpiredNotice` with a start-fresh CTA. No stale data rehydrated. |
| Step removed by logic while on it | If the respondent's earlier answers make the **current** step's fields all hidden, the wizard recomputes `activeSteps`, drops the now-empty step, and clamps `stepIndex` to the nearest active step (never strands the user on a blank page). |
| `currentStep` points past the live step count on resume | Clamp the rehydrated `stepIndex` into `[0, activeSteps.length - 1]` (logic-driven skips may have shrunk the live step list since the draft was saved). |
| Browser refresh mid-wizard (no resume route) | The last debounced autosave already persisted a partial; on a plain reload the wizard starts fresh **unless** a resume token is in the URL. The resume **link** (email/deep-link) is the supported recovery path; in-tab refresh recovery is an Open Question (§13). |
| Autosave fails (network) | Non-blocking: `AutosaveIndicator` shows "couldn't save", the respondent keeps filling, and the next change/step retries. No data loss in-tab (values stay in state). |
| Final submit fails server validation | Server returns field errors; the wizard maps them to the step(s) that own those fields, jumps to the **first** offending step, and shows inline errors (the renderer's error display) — the partial is **not** promoted. |
| Respondent edits an earlier step after reaching a later one | Back-nav allowed; edits autosave to the same draft; forward returns through the (possibly re-computed) active steps. Furthest-reached tracking keeps the progress bar honest. |
| Spam guard rate-limits a burst of autosaves | The underlying `submit` is throttled by the Spam system; the wizard treats a throttled save as a transient "couldn't save" and backs off to the debounce interval. |
| `page_break` appears in the submitted payload | Skipped by the engine validator + serializer (layout/no-value); stores nothing (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`) §8, §10). |
| Extension disabled | `PublicPluginGate` 404s both `/forms/$slug` and the resume route. |

---

## 13. Implementation Checklist

**Phase 1 — step model + page_break**
- [ ] Register the `page_break` field type into the shared engine (layout/no-value, `render: () => null`, settings: `label`/`nextLabel`/`prevLabel`/`description`).
- [ ] Implement pure `deriveSteps(fields)` (page_break delimiters → ordered steps; drop empty runs; one-step degrade).
- [ ] Confirm the engine validator/serializer skip `page_break` (no `fieldValues` row).

**Phase 2 — wizard host + navigation**
- [ ] Build `FormWizard` wrapping `FormRenderer` via the `step={index,total,fieldKeys}` seam; lift the value map (`onValuesChange`); suppress the renderer's single-page submit when hosted.
- [ ] `StepProgress` (live/skipped-aware, "Step X of N", `aria-current`, visited-step nav) + `StepNav` (Back / Next / final-Submit, validate-before-next, `nextLabel`/`prevLabel`).
- [ ] Implement `WizardState` machine: current/furthest step, validate-before-next, clamp on resume, recompute active steps on value change.

**Phase 3 — conditional step-skip**
- [ ] Compute active vs skipped steps via the engine's `evaluateConditionalLogic` (same evaluator as the renderer); skip in both directions; collapse the progress indicator.
- [ ] Handle "current step becomes empty" → clamp `stepIndex` to nearest active step.

**Phase 4 — debounced autosave + draft**
- [ ] Debounced (~1s) autosave + immediate flush on step change, calling `submit({ isComplete:false })`.
- [ ] Capture + reuse `submissionId` + `resumeToken`; persist active step into `form_submissions.currentStep`.
- [ ] `AutosaveIndicator` (saving / saved+timestamp / couldn't-save); non-blocking retry.

**Phase 5 — resume flow + event**
- [ ] Implement the public no-auth `resume` query (by `resumeToken`, partial-only, `expiresAt` enforced, `fieldValues`-decoded value map).
- [ ] Add the `/forms/$slug/resume/$token` route with SSR prefetch + `<PublicPluginGate>`; rehydrate values + clamp to `currentStep`; `ResumeBanner` / `DraftExpiredNotice`.
- [ ] Emit `form.progress_saved { formId, submissionId, resumeToken, step, email }` after a partial write commits (resolve `email` from an answered email field when present).
- [ ] Verify the Notification System sends the "Resume Your Form" email off the event (debounced, email-present only).

**Phase 6 — final submit + handoff**
- [ ] Final-step `submit({ isComplete:true })` promotes the partial → complete; map server field errors back to the owning step (jump to first offending step).
- [ ] Forward `onSubmitted` to the Confirmation System (unchanged from single-page).

---

## 14. Open Questions

- **Who emits `form.progress_saved`?** This system's autosave path, or the Submission System's `submit` partial branch (since it already does the write)? Default: emit from the partial branch where the `resumeToken` is freshly known, but keep the payload contract (`{ formId, submissionId, resumeToken, step, email }`) owned by this PRD. Resolve with the Submission System owner.
- **Resume-token TTL ownership + storage:** does the Submission System add an explicit `form_submissions.expiresAt` column, or is expiry computed from `submittedAt + TTL` at read time? This system reads/enforces it either way; the column (if any) is the Submission System's. Default proposal: explicit `expiresAt`, default 30 days, per-form override in the Builder.
- **In-tab refresh recovery (no resume link):** should a plain browser refresh auto-resume the last partial (e.g. via a short-lived token in `localStorage` / a cookie), or is the emailed/deep-link the only recovery path? Default: emailed/deep-link only for v1 (simplest, no client token storage); revisit if drop-off data justifies in-tab recovery. (The EZ Entity Setup reference resumes on return via a stored session — parity may want this later.)
- **Resume email throttling:** one resume email per draft, per quiet-period, or only on an explicit "save and finish later" button vs. every autosave? Default: Notification-System-owned debounce, one email per draft per quiet-period; confirm UX with the Notification System.
- **Per-step vs whole-form validation on Next:** validate only the current step's visible fields on Next (current sketch), or also re-run cross-step logic? Default: per-step on Next (fast UX), full re-validation server-side on completion (authoritative).
- **`page_break` settings surface in the Builder:** which overrides are worth authoring (`nextLabel`/`prevLabel`/per-step description/required-to-advance)? Parked pending the Builder PRD's field-settings contract.

---

## 15. Cross-References

- Wraps (host): Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`)
- Persistence (partial + resumeToken + currentStep): Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`)
- Server-side logic/validation mirror: Form Logic & Validation System PRD (`specs/ConvexPress/systems/form-logic-validation-system/PRD.md`)
- `page_break` registration + evaluator + serializer: Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)
- "Resume Your Form" email: Form Notification System PRD (`specs/ConvexPress/systems/form-notification-system/PRD.md`)
- Abuse control on autosave/resume: Form Spam & Submission Security System PRD (`specs/ConvexPress/systems/form-spam-security-system/PRD.md`)
- Success handoff: Form Confirmation System PRD (`specs/ConvexPress/systems/form-confirmation-system/PRD.md`)
- Authoring counterpart (page_break insertion + step order): Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`)
- UX reference bar: EZ Entity Setup 9-step signup wizard (progress indicator, back-nav, conditional step-skip, ~1s debounced autosave, resume-on-return)
- Public-surface pattern: `ConvexPress-Website/apps/web/src/components/plugins/PublicPluginGate.tsx`, `ConvexPress-Website/apps/web/src/routes/signup.$offerId.tsx`
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Multi-Step & Save-Continue System · **Plugin:** ConvexPress Forms (v2)
