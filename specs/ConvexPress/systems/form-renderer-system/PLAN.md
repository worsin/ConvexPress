# PLAN: Form Renderer System (Public) — Build Sequence

> Build-sequence companion to `PRD.md`. The PRD holds the full spec; this is the **ordered, file-by-file build order + verify checklist** for the PUBLIC renderer on the **ConvexPress-Website** app.
>
> Read first: `./PRD.md` and `../form-field-engine/PRD.md`.

---

## 0. Architecture decision — NO shared package. Re-implement lean.

This is the single most important fact for the build. **Do not import `@convexpress/field-engine`.**

- That package **does not exist yet** (`find … -name field-engine` → nothing; the Website imports nothing from it). Treating it as a dependency would block the entire renderer on an unbuilt extraction.
- ConvexPress-Website is a **separate app** (TanStack Start SSR, Clerk, Convex consumer-only — it owns no schema, deploys no Convex). It already follows a **deliberate duplication pattern**: `ConvexPress-Website/apps/web/src/lib/customFields.ts` re-implements `parseFieldValue` + the SSR field helpers rather than importing the admin engine. We mirror that exact pattern here.
- The engine PRD's "host-agnostic package" is the *eventual* Admin-side story. The Website renderer is a **lean re-implementation** of only what the public render path needs: parse/encode, validate (UX-only), conditional-logic eval, and a small simple-field renderer set. When the shared package eventually ships, these files become its thin Website binding — but the renderer must stand alone today.

**Consequences that shape every step below:**

1. **Field logic lives in `apps/web/src/lib/`**, extending the existing `customFields.ts` (which already owns `parseFieldValue`). New siblings: `formFields.ts` (encode + validate + types), `formLogic.ts` (conditional eval).
2. **Renderers live in `apps/web/src/extensions/forms/`** (new dir — the Website has no `extensions/` folder yet; we create the first one). React + presentational only, SSR-safe, theme-token colors only.
3. **The backend contract is consumed via `(api as any).extensions.forms.public.*`** — the house pattern for not-yet-typed extension APIs (see `start.ts` `routing.public`, `commerceWishlists`, `commerceReviews`). The consumer `generated/api.d.ts` does **not** yet type `extensions.forms`; do not block on regenerating it.
4. **We own zero mutations/queries.** `getBySlug` (read) and `submit` (write) are owned by the Form Submission System PRD. The renderer is a pure **caller**. If those server functions are not deployed yet, the renderer still type-checks (`anyApi`), and the route degrades to `NotFoundPage` / a submit error — no build break.
5. **No `@radix-ui/*`, no hardcoded colors, no `@/templates/*`.** Per `ConvexPress-Website/.claude/CLAUDE.md` hard rules.

Scope guard (owned elsewhere, do NOT build here): the submit mutation + entry storage + server re-validation (Submission System), confirmation/redirect (Confirmation System), step navigation/resume (Multi-Step System), prefill source (Merge Tags & Prefill). The renderer exposes **seams** (`onSubmitted`, `step`, `initialValues`) but implements none of those systems.

---

## 1. Build order at a glance

| Step | File | Proves |
|---|---|---|
| 1 | `lib/plugins/public.ts` (edit) | `forms` is a gateable public plugin id |
| 2 | `lib/formFields.ts` (new) | Public field types + `encodeFieldValue` + `validateFieldValue` (UX) |
| 3 | `lib/formLogic.ts` (new) | Pure `evaluateConditionalLogic(field, valueMap)` |
| 4 | `extensions/forms/types.ts` (new) | `PublicFormDefinition`, `PublicFieldDefinition`, `FormRendererProps`, `SubmitResult` |
| 5 | `extensions/forms/resolveRelation.ts` (new) | Website-bound public relational seam (no admin API) |
| 6 | `extensions/forms/fields/` (new) | Lean simple-field renderer set + safe fallback |
| 7 | `extensions/forms/FieldRenderer.tsx` (new) | One field → control, dispatched by type |
| 8 | `extensions/forms/ConditionalSection.tsx` (new) | Mount/unmount by logic; hidden ⇒ omitted |
| 9 | `extensions/forms/CompoundFieldHost.tsx` (new) | Repeater/group rows, recursive |
| 10 | `extensions/forms/StateNotices.tsx` (new) | Disabled / closed / limit / login notices |
| 11 | `extensions/forms/FormRenderer.tsx` (new) | The host: value map, visibility, validate, submit lifecycle |
| 12 | `routes/_marketing/forms.$slug.tsx` (new) | Standalone gated route + SSR prefetch |
| 13 | (verify) embedded-via-page path | Same host under page-feature, `form={prefetched}` |

Each step is independently type-checkable. Do `bun run check-types` after each batch (steps 1–3, then 4–7, then 8–11, then 12).

---

## 2. Step detail

### Step 1 — Register the `forms` public plugin id
**File:** `apps/web/src/lib/plugins/public.ts` (EDIT existing)

- Add `"forms"` to the `PublicPluginId` union.
- Add `formsEnabled?: boolean` to `PublicPluginSettings.plugins`.
- Add a `case "forms": return settings.plugins?.formsEnabled === true;` to `isPublicPluginEnabled`.

**Proves:** `<PublicPluginGate pluginId="forms">` type-checks and 404s the route when the extension is off. Mirrors every existing commerce id (`commerceSubscriptions`, etc.).
**Note:** this is an *additive edit* to a Website lib (the Website has no scanner; the gate is a hand-maintained allow-list here, unlike Admin's v2 codegen). The Admin side wires the actual `formsEnabled` setting; the Website only reads `settings.queries.getPublic`.

---

### Step 2 — Public field value layer
**File:** `apps/web/src/lib/formFields.ts` (NEW — sibling of `customFields.ts`)

Re-implement, lean, only what the renderer needs. Reuse `parseFieldValue` from `customFields.ts` (do NOT duplicate it — `import { parseFieldValue } from "@/lib/customFields"`).

- `encodeFieldValue(type, value): string` — inverse of `parseFieldValue`: numbers/booleans/arrays/objects → JSON-or-scalar string the submit mutation expects. Layout types (`message`/`accordion`/`tab`) → skip (return `undefined`, caller omits).
- `validateFieldValue(type, value, settings, required): string | null` — UX-only per-type checks (required-empty, email shape, url shape, number range, min/max length). Returns a message or `null`. **Explicitly commented as non-authoritative** — the server re-validates.
- `SUPPORTED_FORM_FIELD_TYPES` — the public subset of the 30-type catalog this renderer handles directly (basic + content + choice + date/time + layout). Relational handled via Step 5; compound via Step 9.

**Proves:** value (de)serialization + inline validation exist Website-side with zero admin coupling. Pure functions, server-importable shape (though they run client-side here).

---

### Step 3 — Conditional-logic evaluator
**File:** `apps/web/src/lib/formLogic.ts` (NEW)

- `evaluateConditionalLogic(field: PublicFieldDefinition, valueMap: Record<string, unknown>): boolean` — pure, synchronous. Parses the field's `conditionalLogic` JSON (`{ action: "show"|"hide", logicType: "and"|"or", rules: [{ field, operator, value }] }`), evaluates each rule against `valueMap`, combines per `and`/`or`, applies `show`/`hide`. No rules / no logic ⇒ visible.
- Operator set mirrors the engine PRD: `==`, `!=`, `contains`, `>`, `<`, empty/not-empty.

**Proves:** live show/hide can be computed every render from the value map, with no React and no Convex. This is the client UX half of the Logic & Validation contract (server owns the authoritative mirror).

---

### Step 4 — Renderer types
**File:** `apps/web/src/extensions/forms/types.ts` (NEW)

Port the PRD §2.3 contracts verbatim as the Website-local source of truth:
- `PublicFieldDefinition` — the engine `fieldDefinitions` projection: `{ _id, groupId, label, name, key, type, instructions?, required, defaultValue?, settings (parsed object), conditionalLogic (parsed), menuOrder, parentFieldId? }`.
- `PublicFormDefinition` — `{ _id, slug, title, description?, status, fields: PublicFieldDefinition[], settings: { submitLabel?, confirmation?, schedule?, entryLimit?, loginRequired?, disabled? } }`.
- `FormRendererProps` — `{ formSlug?, form?, initialValues?, step?, onSubmitted? }`.
- `SubmitResult` — `{ ok, entryId?, confirmation?, errors? }`.

**Proves:** the read-only shape the renderer consumes is explicit and decoupled from the admin authoring shape. These are the types `(api as any).extensions.forms.public.getBySlug` is cast/validated against.

---

### Step 5 — Public relational seam
**File:** `apps/web/src/extensions/forms/resolveRelation.ts` (NEW)

- `resolvePublicRelation(kind, query)` — bound to **public Website Convex queries only** (e.g. posts/pages/products lookups already exposed to the consumer). Minimal public allow-list per PRD Open Question; unsupported kinds (e.g. `user`, `taxonomy` if admin-only) return a safe empty result so the field falls back to the safe renderer.
- **Never imports `@backend/convex` admin API.** This is the host-side fulfillment of the engine's injected-relation contract.

**Proves:** relational fields can resolve on the public site without admin coupling. Passed to `FieldRenderer` via `context={{ resolveRelation: resolvePublicRelation }}`.
**Note:** thin/minimal for MVP — wire only the relational kinds actually valid on a public form; expand later.

---

### Step 6 — Lean simple-field renderers
**Dir:** `apps/web/src/extensions/forms/fields/` (NEW)

One small component per supported control, presentational only, each taking `(field, value, onChange, error)`:
- `TextField` (text/email/url/password/number/range — via input `type`), `TextareaField`, `SelectField`, `CheckboxField`, `RadioField`, `ButtonGroupField`, `TrueFalseField`, date/time inputs, `ColorField`, content fields (image/file/wysiwyg/oembed/gallery — minimal public-read presentation), and **`UnknownField`** (safe fallback — renders nothing interactive + logs; **never throws**, per PRD edge case).
- Reuse `@/components/ui/{input,label,button,checkbox}` (confirmed to exist). Theme tokens only.
- Each pairs a `<label htmlFor>` + control, sets `aria-required`, `aria-invalid`, `aria-describedby` for errors (a11y baseline lives in the renderers, not bolted on later).

**Proves:** the catalog renders as real, accessible, SSR-safe HTML. Lean: cover the common types well; lean on `UnknownField` for the long tail rather than stubbing all 30 up front.

---

### Step 7 — Field dispatcher
**File:** `apps/web/src/extensions/forms/FieldRenderer.tsx` (NEW)

- `FieldRenderer({ field, value, onChange, error, context })` — switches on `field.type`, renders the Step 6 component (or `CompoundFieldHost` for `group`/`repeater`/`flexible_content`, or a relational renderer using `context.resolveRelation`), falling back to `UnknownField`.

**Proves:** the host renders any field through one entry point — the same seam the eventual shared `FieldRenderer` will expose. Keeps `FormRenderer` ignorant of per-type detail.

---

### Step 8 — Conditional wrapper
**File:** `apps/web/src/extensions/forms/ConditionalSection.tsx` (NEW)

- Thin wrapper that calls `evaluateConditionalLogic(field, values)` and **unmounts** (not CSS-hides) when false, so hidden fields leave the a11y tree AND are naturally excluded from the submitted payload (PRD §8/§9: hidden ⇒ omitted). Wraps single fields and logic-grouped clusters.

**Proves:** live visibility + the "hidden fields never submit" rule, enforced structurally (unmounted fields can't contribute to the value map collection in Step 11).

---

### Step 9 — Compound host
**File:** `apps/web/src/extensions/forms/CompoundFieldHost.tsx` (NEW)

- Host-side implementation of the engine's compound contract: renders N rows of sub-fields for `repeater`/`group`/`flexible_content`, with **add / remove / reorder row**, and **recurses** (`CompoundFieldHost` inside `FieldRenderer` inside `CompoundFieldHost`) for nested compounds. Keyboard-operable controls, no traps (PRD a11y).

**Proves:** the one piece the engine ships as a *contract* not a Website renderer is filled in. Repeater-in-repeater works (PRD edge case).
**Note:** MVP can ship `group` + single-level `repeater` first; recursion + `flexible_content` are additive within this same file.

---

### Step 10 — State notices
**File:** `apps/web/src/extensions/forms/StateNotices.tsx` (NEW)

- `FormDisabledNotice`, `FormClosedNotice` (schedule not-yet-open vs now-closed), `FormLimitReachedNotice`, plus an `isFormClosed(form)` helper returning `{ reason, message }` from `settings.disabled` / `settings.schedule` / `settings.entryLimit`. Presentational, `role="status"`, theme tokens.
- Login-required: a sign-in **prompt** (not 404) gating submit when `settings.loginRequired` and the visitor is not a signed-in Subscriber (Clerk `useAuth`).

**Proves:** all closed/gated states render correctly client-side. **Server stays authoritative** — these only disable the UI; the submit mutation re-checks window/limit/login (race-safe).

---

### Step 11 — The host component
**File:** `apps/web/src/extensions/forms/FormRenderer.tsx` (NEW)

Implement per PRD §6 sketch (adapted to the lean local imports, not `@convexpress/field-engine`):
- State: `values` (seeded from `initialValues`), `errors`, `isSubmitting`, `formError`, `firstErrorRef`.
- `visibleFields = useMemo(...)` — filter by `step?.fieldKeys` then by `evaluateConditionalLogic`.
- `setValue` clears the field's error on change.
- `validateVisible()` — `validateFieldValue` per visible field.
- `handleSubmit` — validate → focus first error on failure → encode **visible** values via `encodeFieldValue` → call `(api as any).extensions.forms.public.submit({ slug, values })` → on `!ok` map `result.errors` to inline + focus → on `ok` call `onSubmitted(result)` (Confirmation handoff) → minimal built-in success state if no handler → `catch` surfaces `role="alert"` via a local `extractErrorMessage` (copy the `SignupForm` helper).
- Renders header, `isFormClosed` notice OR the `ConditionalSection`-wrapped `FieldRenderer` list + `SubmitButton` (Loader2 spinner + "Processing…", `disabled` while submitting/closed).
- Accepts **both** `form={…}` (embedded) and is rendered with a fetched form by the route (standalone) — one component, two surfaces.
- `noValidate` on `<form>`; a11y: focus-to-first-error, success focus, live regions, label/error association inherited from Step 6.

**Proves:** end-to-end orchestration — load→render→logic→validate→submit→handoff — in a single host, mirroring `SignupForm`'s submit/error/pending conventions.

---

### Step 12 — Standalone public route
**File:** `apps/web/src/routes/_marketing/forms.$slug.tsx` (NEW)

Per PRD §4.2 (the repo route convention is flat dotted files under `_marketing/`, e.g. `track.$token.tsx`, `wishlist.$token.tsx`, `signup.$offerId.tsx` — so `forms.$slug.tsx`, NOT a `forms/$slug` subdir):
- `Route = createFileRoute("/_marketing/forms/$slug")` with a `loader` that `queryClient.ensureQueryData(convexQuery((api as any).extensions.forms.public.getBySlug, { slug }))` for SSR.
- `head` sets the title from loader data.
- Component: `useTanStackQuery(convexQuery(...))`, wrapped in `<PublicPluginGate pluginId="forms">`; render `FormSkeleton` while `undefined`, `<NotFoundPage />` when `null` or `status !== "published"`, else `<FormRenderer form={form} />`.
- Inherits the `_marketing.tsx` Outlet shell (header/footer). Imports confirmed: `PublicPluginGate`, `NotFoundPage`, `Skeleton`.

**Proves:** SSR-first paint of a real form (not a spinner), gated on the extension flag and publish status, with seamless hydration — the same `convexQuery` + `ensureQueryData` mechanic the page routes use.

---

### Step 13 — Embedded-via-page (verify, minimal code)
**Reference:** `design-kit/references/page-feature.example.tsx`

- Confirm `<FormRenderer form={prefetchedForm} />` renders below page content when a `design:page-feature` route prefetches both the Page record and `getBySlug`. **No second renderer** — same host, `form` prop instead of route fetch.
- No new file required for the renderer itself; this is a usage proof + a note for whoever authors the embedding page route/block.

**Proves:** the host powers both surfaces (PRD §4.1), satisfying the dual-surface requirement.

---

## 3. Verify checklist

Run from `ConvexPress-Website/apps/web` (the Website owns these scripts; **never deploy Convex from this repo**).

**Per-batch gate (after steps 1–3, 4–7, 8–11, 12):**
- [ ] `bun run check-types` — `tsc --noEmit` passes. (The `(api as any)` casts mean unbuilt server functions do not break types.)

**Full verify (after step 12):**
- [ ] `bun run check-types` — clean.
- [ ] `bun run lint` — oxlint clean (no `@radix-ui/*` imports, no hardcoded colors, no `@/templates/*`).
- [ ] `bun run smoke:ssr` — `/forms/$slug` SSRs without throwing (server gets semantic label+input HTML pre-hydration).
- [ ] Grep guard: no import of `@backend/convex` or admin-shell anywhere under `extensions/forms/` or the new `lib/form*.ts` (enforces the no-admin-coupling rule).
- [ ] Grep guard: no import of `@convexpress/field-engine` (the package does not exist; the re-impl is intentional).

**Behavior verify (Playwright / browser, once `getBySlug` + `submit` are live):**
- [ ] Disabled extension → `/forms/$slug` renders `NotFoundPage`.
- [ ] Unknown / unpublished slug → `NotFoundPage`.
- [ ] Published form → fields render in `menuOrder`; conditional fields show/hide live as you type; hidden fields are absent from the submitted payload.
- [ ] Required-empty submit → inline errors + focus jumps to first error; no native bubbles.
- [ ] Successful submit → `onSubmitted` fires (or minimal built-in success state); focus moves to confirmation region.
- [ ] Network error on submit → `role="alert"` message, entered values retained (no re-entry).
- [ ] `loginRequired` form as guest → sign-in prompt (not 404), submit gated until authenticated.
- [ ] Closed/scheduled/limit states → correct notice, submit disabled.

---

## 4. File manifest (all under `ConvexPress-Website/apps/web/src/`)

**New:**
```
lib/formFields.ts                         # encode + validateFieldValue (UX) + supported types
lib/formLogic.ts                          # evaluateConditionalLogic (pure)
extensions/forms/types.ts                 # PublicFormDefinition + props + SubmitResult
extensions/forms/resolveRelation.ts       # public relational seam (no admin API)
extensions/forms/fields/                  # lean simple-field renderers + UnknownField fallback
extensions/forms/FieldRenderer.tsx        # type → control dispatcher
extensions/forms/ConditionalSection.tsx   # unmount-on-hidden wrapper
extensions/forms/CompoundFieldHost.tsx    # repeater/group rows, recursive
extensions/forms/StateNotices.tsx         # disabled/closed/limit/login notices + isFormClosed
extensions/forms/FormRenderer.tsx         # the host (value map, logic, validate, submit)
routes/_marketing/forms.$slug.tsx         # standalone gated route + SSR prefetch
```

**Edited:**
```
lib/plugins/public.ts                     # add "forms" plugin id + formsEnabled flag
```

**Consumed (owned by other PRDs — NOT created here):**
```
(api as any).extensions.forms.public.getBySlug   # Form Submission System — read-only public query
(api as any).extensions.forms.public.submit      # Form Submission System — public unauth mutation
parseFieldValue                                   # reused from existing lib/customFields.ts
```

---

## 5. Why this order

1–3 establish the **pure, framework-free core** (plugin gate + value layer + logic) — type-checkable with zero React/Convex.
4–7 build the **render path** bottom-up (types → seam → leaf renderers → dispatcher) so each layer compiles against the one below.
8–11 add **orchestration** (visibility, compounds, states) and assemble the **host**.
12–13 expose the host through the **standalone route** and verify the **embedded surface** — proving one renderer, two surfaces, gated and SSR-safe.

Throughout: the Website **re-implements** (mirroring `lib/customFields.ts`), imports **no shared engine package**, imports **no admin API**, owns **zero mutations**, and calls the Submission System's public functions via `anyApi`. Lean, concrete, decoupled.

---

**PLAN Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Renderer System (Public) · **App:** ConvexPress-Website · **Extension:** ConvexPress Forms (v2)
