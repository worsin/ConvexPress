# PLAN: Form Merge Tags & Prefill System

> Lean, ordered build plan for the PRD in this folder (`PRD.md`). Two pure helpers, no new tables:
> a server-side **merge-tag resolver** and an SSR-safe **prefill parser**. Build in dependency order;
> each phase ends green (typecheck + that phase's unit tests).

---

## Ground-truth reconciliation (read before coding)

The PRD assumes a `@convexpress/field-engine` package with `parseFieldValue`/`encodeFieldValue` and an
`extensions/forms/` Website home. The repo does **not** have those. Build to what exists:

| PRD assumption | Repo reality (verified) | Plan adjustment |
|---|---|---|
| `@convexpress/field-engine` `parseFieldValue(type, raw)` | No field-engine package. Field type contract lives in `ConvexPress-Admin/packages/backend/convex/customFields/validators.ts`; the Website renderer encodes every value as a **string**. | Coerce to the **string encodings the renderer/submit already use** (below). No engine import. |
| Prefill home `…/extensions/forms/prefill/` | Renderer is at `ConvexPress-Website/apps/web/src/components/forms/FormRenderer.tsx`; route at `…/routes/_marketing/forms.$slug.tsx`. | Put the parser at `ConvexPress-Website/apps/web/src/lib/forms/prefill/` (sits beside the existing `lib/forms/conditionalLogic.ts`). |
| Renderer accepts `initialValues` | `FormRenderer` seeds `values` from `field.defaultValue` only; **no** `initialValues` prop yet; `PublicForm` has no `initialStep`. | Phase 3 adds an optional `initialValues?: Record<string,string>` prop (string map) + uses it as the seed override. |
| `PublicFieldDefinition` projection | `getBySlug` (`…/extensions/forms/queries.ts`) already projects per-field `key,type,label,defaultValue,settings(JSON string),conditionalLogic,menuOrder`. `PublicFormField` type in `FormFieldRenderer.tsx`. | **No query change.** `allowDynamicPopulation`/`paramName`/`defaultSource` are read out of the existing `field.settings` JSON. |
| Notification/Confirmation ship local interpolators to consolidate | Those systems aren't built yet; no interpolator exists. | This system is the **first** resolver; Phase 4 is wiring stubs/call-site contract, not a migration. |

**Canonical string value encodings the prefill parser must emit** (from `FormFieldRenderer.tsx` header + `customFields/validators.ts`):
`text/textarea/email/url` → plain string · `number` → numeric string · `date_picker` → `"YYYY-MM-DD"` ·
`select`(single)/`radio`/`button_group` → the chosen choice `value` · `select`(multiple)/`checkbox` → JSON array string of `value`s ·
`true_false` → `"1"`/`"0"`. Layout types `message/accordion/tab` (+ `password`) are never populated/rendered.

---

## File map (exact paths)

**Merge tags — server-side (Admin backend, the Convex module):**
- `ConvexPress-Admin/packages/backend/convex/extensions/forms/mergeTags.ts` — resolver + registry + `escapeForSink` (NEW)
- `ConvexPress-Admin/packages/backend/convex/extensions/forms/mergeTags.tokens.ts` — built-in token catalog (§4) registered into the registry (NEW)
- `ConvexPress-Admin/packages/backend/convex/extensions/forms/__tests__/mergeTags.test.ts` — unit tests (NEW)

**Prefill — SSR-safe (Website lib):**
- `ConvexPress-Website/apps/web/src/lib/forms/prefill/parsePrefill.ts` — `parsePrefill` entry + pipeline (NEW)
- `ConvexPress-Website/apps/web/src/lib/forms/prefill/sanitize.ts` — `sanitizeInput` + `sanitizeEnum` (EZ contract) (NEW)
- `ConvexPress-Website/apps/web/src/lib/forms/prefill/normalizers.ts` — normalizer registry: state, enum/slug, slug→id; `normalizeForField`; `REJECT` sentinel (NEW)
- `ConvexPress-Website/apps/web/src/lib/forms/prefill/states.ts` — US-state list + `normalizeStateName` (EZ contract) (NEW)
- `ConvexPress-Website/apps/web/src/lib/forms/prefill/initialStep.ts` — `resolveInitialStep` (EZ `getInitialStep` contract) (NEW)
- `ConvexPress-Website/apps/web/src/lib/forms/prefill/types.ts` — `PrefillResult`, `DynamicSource`, `PublicFormDefinition` (re-export `PublicFormField`) (NEW)
- `ConvexPress-Website/apps/web/src/lib/forms/prefill/__tests__/parsePrefill.test.ts` — unit tests (NEW)

**Integration (edits to existing files):**
- `ConvexPress-Website/apps/web/src/components/forms/FormRenderer.tsx` — add `initialValues?` prop, use as seed override (EDIT)
- `ConvexPress-Website/apps/web/src/routes/_marketing/forms.$slug.tsx` — read `useSearch()`, call `parsePrefill`, pass `initialValues` (EDIT)

**Reference (read-only, do not edit):**
- `EZ-Entity-Setup/ez-website/apps/web/src/lib/order-form/url-params.ts` — parity source for `sanitizeInput`/`sanitizeEnum`/`normalizeStateName`/`getInitialStep`
- `ConvexPress-Admin/packages/backend/convex/customFields/validators.ts` — field value contract the encodings must match

---

## Phase 1 — Merge-tag resolver (server-side, pure)

Lives entirely in the Admin backend module so it runs inside the Submission System's post-submit pipeline.

1. **`mergeTags.ts` core.** Define `MergeTagContext`, `MergeOutputSink = "plain"|"email-html"|"email-text"|"url"`, and `TokenDefinition { pattern: string|RegExp; description; sensitive?; resolve(ctx, arg?) }`.
   - `TOKEN_REGISTRY` (ordered list, allowlist) + `registerToken(def)` (§4.3 seam — additive, no fork).
   - `lookupToken(expr, ctx)`: match registry patterns first; then **field-key shorthand** `{<key>}` / `{field:<key>}` **only if `<key>` is a real `ctx.form.fields[].key`** (else null). Parse a trailing `:arg` (e.g. `date:mdy`).
   - `resolveMergeTags(template, ctx, opts={})`: single pass `template.replace(/\{([^{}]+)\}/g, …)` — unknown token → `""` (never reflect, never throw); `token.sensitive && isPublicSink(sink)` → `""`; else `escapeForSink(token.resolve(ctx,arg) ?? "", sink)`. Default sink `"plain"`.
2. **`escapeForSink(value, sink)`.** `email-html` → HTML-escape `& < > " '`; `url` → `encodeURIComponent`; `plain`/`email-text` → raw `String(value)`. This is the injection boundary — enforced here, not by callers.
3. **`mergeTags.tokens.ts` catalog (§4).** Register: `{field:<key>}` + `{<key>}` shorthand (value via display-format of the stored string), `{all_fields}` (sink-aware: HTML table for `email-html`, `Label: value` lines for text; skip layout + empty + `password`), `{form:title|id|slug}`, `{entry:id}`, `{entry:date}`/`{date}`/`{date:mdy|dmy|iso|long|now}` (bad format → default short, **not** empty), `{user:email|display_name|id|role}` (empty for guests; mark `id` sensitive), `{embed_url}`, `{referer}`, `{site:name|url}`.
   - **Blocklist by omission** (§4.1): no `{request:ip}`, no secret/credential tokens, no `{eval:…}`/`{php:…}`. `password`-type field values never rendered.
4. **Tests** (`mergeTags.test.ts`): unknown→empty; no expression eval; sink escaping (submitted `<script>`/`"` cannot inject HTML or break a URL); `{all_fields}` across sinks (golden); date-format matrix incl. bad arg→default; guest vs actor `{user:*}`; `sensitive`+public-sink→empty; `password` field skipped; `registerToken` extends the allowlist.

**Phase 1 gate:** `cd ConvexPress-Admin/packages/backend && bun test convex/extensions/forms/__tests__/mergeTags.test.ts` green; backend typecheck clean.

---

## Phase 2 — Prefill parser (SSR-safe, pure)

Lives Website-side beside the existing renderer/conditionalLogic. No `window` at module load; returns a fresh object.

1. **`types.ts`.** `PrefillResult { initialValues: Record<string,string>; initialStep?: string; applied: string[]; rejected: string[] }`; `DynamicSource { id; resolve(field): string|undefined }`; `PublicFormDefinition { fields: PublicFormField[]; steps?: string[] }` (reuse `PublicFormField` from `FormFieldRenderer.tsx`).
2. **`sanitize.ts`** (EZ parity): `sanitizeInput(raw)` — URL-decode in a try/catch (bad encoding → drop param), strip `<…>` tags + `javascript:` + `on\w+=` + `&lt;`/`&gt;`/`&#` + null bytes, allowlist safe chars, length-cap (200 default). `sanitizeEnum(value, allowed)` — lowercase+trim, match against allowed choice `value`s, else `undefined`.
3. **`states.ts`** (EZ parity): US-state list + `normalizeStateName(input)` — exact case-insensitive → prefix / two-letter-abbrev fallback (`"tx"`→`"Texas"`) → `null`.
4. **`normalizers.ts`.** `REJECT` sentinel; normalizer **registry** (extensible) keyed by field hint/choice-set: **state** (uses `states.ts`), **enum/slug** (`sanitizeEnum` against `field.settings.choices[].value`), **slug→id** (map slug to canonical id via choices or host resolver; no match → `REJECT`). `normalizeForField(field, cleanString)` dispatches by hint/choices, else falls back to the **string encoding** for `field.type` (per the encoding table above). Illegal value → `REJECT` (never coerce to junk). Multi-value fields produce the JSON-array-string encoding.
5. **`initialStep.ts`.** `resolveInitialStep(searchParams, formDef, initialValues)` (EZ `getInitialStep`): explicit `step=` **and** in `formDef.steps` allowlist → that step; else a smart-default predicate over coverage (predicate seam supplied by Multi-Step; default: furthest step whose prerequisite fields are filled); single-page (`!formDef.steps?.length`) → `undefined`. Unknown/out-of-range `step=` → ignored, fall to default.
6. **`parsePrefill.ts`.** Implements §8 pipeline: filter `eligible = fields.where settings.allowDynamicPopulation===true` (parse each `field.settings` JSON tolerantly) **and not hidden/admin-only/layout/password**; per field resolve `paramName` (case-insensitive, default `field.key`) from params → else `DynamicSource` (URL wins over source); `sanitizeInput` → `normalizeForField`; `REJECT`→`rejected.push(paramName)`, else `initialValues[field.key]=value; applied.push(key)`. Params matching no eligible field → `rejected`. Duplicate `paramName` → first-declared field wins, duplicate rejected. Then `initialStep = resolveInitialStep(...)`. Never throws (per-param try/catch like EZ).
7. **Tests** (`parsePrefill.test.ts`): XSS vectors + length-cap dropped; `state=tx`/`type=LLC`/`pkg=Premium` → canonical; bad-URL-encoding/oversized/illegal → `rejected`, rest still apply; `allowDynamicPopulation!==true` → rejected; hidden/admin-only/layout/password → never populated; slug-with-no-match → rejected; duplicate `paramName` → first wins; `step=payment` honored only if allowlisted, `step=<garbage>`→default; URL beats DynamicSource; single-page → `initialStep` undefined; SSR-safe (no `window` at import).

**Phase 2 gate:** `cd ConvexPress-Website && bun test apps/web/src/lib/forms/prefill/__tests__/parsePrefill.test.ts` green; Website typecheck clean.

---

## Phase 3 — Renderer integration (prefill → initialValues)

1. **`FormRenderer.tsx`:** add optional prop `initialValues?: Record<string, string>` to `FormRendererProps`. In the `useState` seed, after seeding each field from `defaultValue`, **override** with `initialValues?.[field.key]` when present (precedence: `defaultValue` < prefill). Hidden fields stay governed by conditional logic; layout/password untouched. (`initialStep` plumbing deferred to the Multi-Step System — leave a typed pass-through note, do not build step nav here.)
2. **`forms.$slug.tsx`:** in `FormPageInner`, read `const search = Route.useSearch()` (declare a permissive `validateSearch` on the route so arbitrary query params pass through as `Record<string,string>`), call `parsePrefill(search, { fields: form.fields }, [])`, and pass `initialValues={result.initialValues}` to `<FormRenderer>`. SSR-safe: `parsePrefill` runs identically in the SSR loader and browser.

**Phase 3 gate:** Website typecheck clean; manual/Playwright smoke — load `/forms/<slug>?<paramName>=value` for a form with an opted-in field and confirm the field renders prefilled; a non-opted-in param leaves its field at default.

---

## Phase 4 — Consumer call-site contracts (no migration; wire-up)

Notification/Confirmation aren't built yet, so this phase **establishes the contract**, not a port.

1. **Submission-System context assembly (contract note + helper).** Document in `mergeTags.ts` the `MergeTagContext` the post-submit pipeline must assemble (it owns `submission`; projects `form`/`user`/`request`/`site`). Optionally export a `buildMergeTagContext(...)` pure projector helper the Submission System can call. The resolver itself takes **no** `ctx: QueryCtx`.
2. **Notification** → `resolveMergeTags(subjectTemplate, ctx, {sink:"email-text"})` + `resolveMergeTags(messageTemplate, ctx, {sink: channel==="email" ? "email-html" : "plain"})`; resolve `form_notifications.toExpression` with `{sink:"plain"}`.
3. **Confirmation** → `resolveMergeTags(content, ctx, {sink:"plain"|"email-html"})` for the inline message; `resolveMergeTags(redirectUrl, ctx, {sink:"url"})` for the redirect (forces `encodeURIComponent`).
4. **Precedence policy (§6.2)** is owned here as the documented order `defaultValue < dynamicSource < urlParam < recoveredDraft`; **enforcement** belongs to the Multi-Step/Save-Continue System (recovered draft overrides prefill *after* URL init). Record it where Multi-Step will read it.

**Phase 4 gate:** backend typecheck clean; the contract note + (optional) projector compile; a sample notification+confirmation template resolves end-to-end in a unit test against a fixture `MergeTagContext`.

---

## Phase 5 — Hardening

1. Golden-file tests: `{all_fields}` across all four sinks; full date-format matrix; guest-vs-actor `{user:*}`.
2. Parameter-tampering matrix: blocked/hidden/admin-only field, duplicate `paramName`, slug-with-no-match, out-of-range `step`, oversized/illegal chars.
3. **Defense-in-depth check:** assert a crafted client that seeds a blocked field is still rejected by `forms.mutations.submit` server re-validation (the parser is not the only gate). Add/point to a test in the Submission System's suite.
4. Confirm both modules are import-pure: `mergeTags.ts` does no DB/network/`Date.now()` except via the explicit `{date:now}` resolver; `parsePrefill` touches no `window` at module load.

---

## Verify checklist (definition of done)

- [ ] `mergeTags.ts` + `mergeTags.tokens.ts` exist; `resolveMergeTags(template, ctx, {sink})` resolves the full §4 catalog; unknown token → `""`; never throws.
- [ ] `escapeForSink` enforced inside the resolver for every substitution (HTML-escape / `encodeURIComponent` / raw); injection tests pass.
- [ ] Sensitive/PII guard works (`sensitive` + public sink → empty); `{request:ip}` and secrets are absent from the registry; `password`-type fields never rendered.
- [ ] `registerToken` adds to the allowlist without forking; added tokens still obey sink escaping + sensitive rules.
- [ ] `parsePrefill(searchParams, formDef, sources?)` returns `{ initialValues, initialStep, applied, rejected }`; pure + SSR-safe; never throws.
- [ ] Only `allowDynamicPopulation===true`, non-hidden, non-layout, non-password fields are populated; everything else → `rejected`.
- [ ] `sanitizeInput`/`sanitizeEnum`/`normalizeStateName` match the EZ contract; `state=tx`/`type=LLC`/`pkg=Premium` normalize to canonical; illegal values → `rejected` (not coerced).
- [ ] Emitted values use the renderer's string encodings (single value / JSON-array string / `"1"`/`"0"` / `"YYYY-MM-DD"`); renderer prefills correctly.
- [ ] `resolveInitialStep`: allowlisted `step=` honored; garbage/out-of-range → smart default; single-page → `undefined`.
- [ ] `FormRenderer` accepts `initialValues` and applies precedence `defaultValue < prefill`; `forms.$slug.tsx` feeds `useSearch()` → `parsePrefill` → `initialValues`.
- [ ] Precedence policy `defaultValue < dynamicSource < urlParam < recoveredDraft` documented for Multi-Step to enforce.
- [ ] Notification + Confirmation call sites use the correct sinks (`email-html`/`email-text`/`plain`/`url`); resolver takes no Convex `ctx`.
- [ ] Server re-validation (`forms.mutations.submit`) still rejects a client that bypasses the parser to seed a blocked field.
- [ ] Admin backend typecheck clean; Website typecheck clean; both test suites green. (Convex TS2589 false positives suppressed with scoped `@ts-expect-error`, never `--typecheck=disable`.)

---

## Out of scope (owned by sibling systems — do not build here)

Renderer value-map/state & how `initialValues` is *applied* (Form Renderer System) · step navigation, step state, save-and-resume draft table + recovery (Multi-Step & Save-Continue System) · notification/confirmation **delivery** (Notification + Confirmation Systems) · field catalog / value (de)serialization / `defaultValue` semantics (Field Engine / customFields) · submission write + `form.submitted` event + server re-validation (Submission System) · authoring the `allowDynamicPopulation`/`paramName`/`defaultSource` toggles (Builder System). No new Convex tables — prefill config rides in `field.settings` JSON.
