# PLAN: Form Field Engine (Shared) — Build Sequence

> Build-sequence companion to `PRD.md`. The PRD owns the *why* and the contract; this is the ordered, file-by-file *how* + verify checklist. Read `PRD.md` first.

---

## ARCHITECTURE CORRECTION (supersedes PRD §Integration / §3 / §11)

The PRD assumes one shared package importable by **both** apps. **That is wrong.** Ground truth as built:

- **ConvexPress-Admin** and **ConvexPress-Website** are **two separate Bun workspaces** with **no cross-app package link**. The Website is hard-disabled as a Convex *consumer only* (`dev:server` / `dev:setup` throw) and already keeps its **own copy** of the helpers at `ConvexPress-Website/apps/web/src/lib/customFields.ts` (the established duplication pattern).
- There is therefore **NO cross-app shared package**, and we are **not** creating one.

**Corrected plan:**

1. **Admin only** gets a real workspace package: **`ConvexPress-Admin/packages/field-engine/`** (Admin is already a `packages/*` workspace — see `packages/blocks-catalog/` for the exact shape). The Admin app (`apps/web`) imports it. The backend imports its pure `validate`/`serialize` modules.
2. **Website does NOT import it.** When the Form Renderer system is built, the Website **re-implements a lean renderer** under `ConvexPress-Website/apps/web/src/` mirroring the existing `lib/customFields.ts` duplication — reading the **same Convex data**. That work belongs to the Form Renderer PRD, not here. This plan only stubs/notes the seam (Step 8); it does not build the Website renderer.

Net: this is an **Admin-internal extraction** into a workspace package, plus a **known-bug fix**, with the cross-app story handled by deliberate duplication later.

---

## Source inventory (what we are extracting)

| Source (Admin) | Role | Portability |
|---|---|---|
| `apps/web/src/components/custom-fields/fields/index.ts` | `FIELD_RENDERERS` map + `FieldRendererProps` | portable (move) |
| `apps/web/src/components/custom-fields/fields/*.tsx` (33 renderers + `FieldWrapper`) | renderers | mostly portable; **5 relational + compound stubs need work** |
| `apps/web/src/components/custom-fields/ConditionalLogicBuilder.tsx` | writes rule JSON | **stays in app** (builder UI); engine gets a pure evaluator instead |
| `apps/web/src/components/custom-fields/metabox/MetaboxRenderer.tsx` | renders + evaluates logic + autosaves | **stays in app**; consumes engine |
| `packages/backend/convex/helpers/customFieldValidation.ts` | `validateFieldValue` | portable (re-export from engine) |
| `packages/backend/convex/customFields/validators.ts` | Convex arg validators | stays (Convex-specific) |

**Portability blockers found in renderers** (must be neutralized during the move):
- `@/lib/utils` (`cn`) — 9 files
- `@/components/ui/button` — 5 files (incl. `FieldRepeater`, `FieldFlexibleContent`)
- `convex-helpers/react/cache` + `@backend/convex/_generated/api` — **5 relational files**: `FieldPostObject`, `FieldPageLink`, `FieldRelationship`, `FieldTaxonomy`, `FieldUser`

**Consumers that must keep working** (regression surface):
- `apps/web/src/components/editor/EditorLayout.tsx` → uses `MetaboxRenderer`
- `apps/web/src/components/custom-fields/FieldSettingsPanel.tsx` → uses `ConditionalLogicBuilder`
- `packages/backend/convex/customFields/mutations.ts` → uses `validateFieldValue`

---

## KNOWN BUG (fix during extraction — do not drop stored rules)

`ConditionalLogicBuilder.tsx` **writes**:
```jsonc
{ "action": "show", "logic": "and", "rules": [{ "field": "<key>", "operator": "==", "value": "" }] }
```
— note: key is **`field`**, and there is **no `enabled` flag**.

`MetaboxRenderer.isFieldVisible` **reads**:
```ts
if (!logic.enabled || !logic.rules || logic.rules.length === 0) return true; // BUG: enabled is never written → always true
... rule.fieldKey ...                                                        // BUG: written as `field`, read as `fieldKey`
```

**Effect:** every stored conditional rule is silently ignored — fields configured to hide/show always render. Both halves are wrong.

**Fix (in the extracted evaluator — one canonical shape):**
- Treat **missing `enabled` as enabled** when `rules.length > 0` (only `enabled === false` disables). This honors all currently-stored rules without a data migration.
- Read the rule's target key from **`rule.field ?? rule.fieldKey`** (accept both; prefer `field` since that is what is actually persisted).
- Keep the existing operator semantics (`==`, `!=`, `>`, `<`, `contains`, `empty`, `not_empty`) and `action`/`logic` (`show`/`hide` × `and`/`or`).
- The builder may keep writing `field` (no enabled). Do **not** rewrite stored data. Optionally have the builder also stamp `enabled: true` going forward (additive, harmless) — but the evaluator must not depend on it.

---

## Decisions

- **Package name:** `@convexpress-admin/field-engine` (matches `@convexpress-admin/blocks-catalog` convention). Working title `@convexpress/field-engine` from the PRD is **not** used.
- **Single package**, not split core/react (PRD §11 default). Pure modules (`conditional-logic`, `validate`, `serialize`, `types`, `registry`) and React modules (`renderers/`, `compound/`, `FieldRenderer`) live in one package but in separate files, so the Convex backend imports only the pure files (no React pulled into Convex bundle).
- **`source` export pattern**: like `blocks-catalog`, `exports` points at `./src/*.ts` directly (Bun/Vite/tsc resolve TS source; no build step). Add subpath exports so the backend can import `.../validate` and `.../serialize` without touching renderer/React code.
- **`cn` dependency:** inline a 3-line local `cn` in the package (`clsx` + `tailwind-merge`, both already in the app) rather than importing `@/lib/utils`. Add `clsx` + `tailwind-merge` to the package's deps.
- **`Button` dependency:** the 5 renderers using `@/components/ui/button` are kept working by having the package depend on... nothing app-specific — replace those usages with a plain styled `<button>` (the renderers are presentational; the shadcn Button is overkill). Keeps the package free of `@/` app coupling. (If parity risk is a concern, see Risks.)
- **Relational seam:** inject a `resolveRelation`/query-fn via render context instead of `@backend` import (PRD §3.2). Engine ships the relational renderers as **context-driven**; the Admin host wires the actual Convex queries.
- **No new tables, no schema edit, no nav/registry edit** (engine is a library; PRD §5/§7).

---

## Build Sequence

Each step lists files to **CREATE** / **EDIT** and what it proves. Verify gate after each: `cd ConvexPress-Admin && bun --filter web check-types` exits 0 (and `bun run check-types` for the whole workspace at the end).

### Step 0 — Baseline green
- **Run:** `cd ConvexPress-Admin && bun install && bun --filter web check-types` → record it exits **0** before any change.
- **Proves:** clean starting point; later failures are ours.

### Step 1 — Scaffold the empty package
- **CREATE** `packages/field-engine/package.json`
  - `"name": "@convexpress-admin/field-engine"`, `"private": true`, `"type": "module"`, `"version": "0.0.0"`
  - `main`/`types` → `./src/index.ts`; `exports`: `"."` → `./src/index.ts`, `"./validate"` → `./src/validate.ts`, `"./serialize"` → `./src/serialize.ts`, `"./conditional-logic"` → `./src/conditional-logic.ts`, `"./types"` → `./src/types.ts`
  - deps: `clsx`, `tailwind-merge`, `lucide-react`, `react` (peer or dep matching app `19.2.3`); devDeps: `typescript: catalog:`, `@types/react`
- **CREATE** `packages/field-engine/tsconfig.json` (copy `packages/blocks-catalog/tsconfig.json`; add `"jsx": "react-jsx"` and `"lib": ["ES2022","DOM"]`)
- **CREATE** `packages/field-engine/src/index.ts` (empty barrel for now: `export {}`)
- **EDIT** `apps/web/package.json` → add `"@convexpress-admin/field-engine": "workspace:*"` to `dependencies`
- **Run:** `bun install` (links workspace), then `bun --filter web check-types`
- **Proves:** package resolves in the workspace and the app can import it.

### Step 2 — Port the contract + pure logic (no React, no app imports)
- **CREATE** `packages/field-engine/src/types.ts`
  - `FieldRendererProps` (moved from `fields/index.ts`), `FieldDefinition`, `FieldValue`, `ConditionalLogicData`, `ConditionalRule`, `FieldRenderContext` (new: carries `resolveRelation`/query fns + compound-orchestration callback), `SUPPORTED_FIELD_TYPES` const (the 33-type list).
- **CREATE** `packages/field-engine/src/conditional-logic.ts`
  - `evaluateConditionalLogic(field, valueMap): boolean` — the **normalized** evaluator implementing the BUG FIX (missing `enabled` ⇒ enabled; `rule.field ?? rule.fieldKey`). Pure, no `window`.
- **CREATE** `packages/field-engine/src/validate.ts`
  - Move the body of `helpers/customFieldValidation.ts` verbatim (`validateFieldValue`, `ValidationResult`, all per-type validators). Pure, server-importable.
- **CREATE** `packages/field-engine/src/serialize.ts`
  - `parseFieldValue(value, type)` (lift the switch from `Website/.../lib/customFields.ts` lines 67–133, but **without** the Zod `parseLinkField`/`parseRepeaterField` website deps — return parsed JSON / primitives; keep it dependency-free) + `encodeFieldValue` (inverse/`JSON.stringify` per type). Layout types → `null`/skip.
- **EDIT** `packages/field-engine/src/index.ts` → re-export from the four modules above.
- **Run:** `bun --filter web check-types`
- **Proves:** the pure core compiles standalone with zero `@/` or `@backend` imports.

### Step 3 — Backend consumes the engine validator (no behavior change)
- **EDIT** `packages/backend/convex/helpers/customFieldValidation.ts`
  - Replace the implementation with a **re-export**: `export * from "@convexpress-admin/field-engine/validate";` (keeps the import path stable for `mutations.ts`). If the backend tsconfig can't resolve the workspace subpath, fall back to re-export via relative path or add the path mapping — confirm `mutations.ts` still type-checks.
- **EDIT** `packages/backend/package.json` → add `"@convexpress-admin/field-engine": "workspace:*"` if needed for resolution.
- **Run:** `bun run check-types` (whole workspace — exercises the Convex package too)
- **Proves:** server validation now flows through the engine; one source of truth; Convex bundle pulls only `./validate` (no React).

### Step 4 — Move the simple/portable renderers (17 simple + layout + `FieldWrapper`)
- **CREATE** `packages/field-engine/src/renderers/` and move the **non-relational, non-compound** renderers: `FieldText, FieldTextarea, FieldNumber, FieldRange, FieldEmail, FieldUrl, FieldPassword, FieldImage, FieldFile, FieldWysiwyg, FieldOembed, FieldGallery, FieldSelect, FieldCheckbox, FieldRadio, FieldButtonGroup, FieldTrueFalse, FieldDatePicker, FieldDateTimePicker, FieldTimePicker, FieldColorPicker, FieldMessage, FieldAccordion, FieldTab`, plus `FieldWrapper.tsx`.
- **CREATE** `packages/field-engine/src/cn.ts` (local `cn` = `twMerge(clsx(...))`). Rewrite the moved files' `@/lib/utils` import → `../cn`. Rewrite `import type { FieldRendererProps } from "./index"` → `from "../types"`.
- **Note:** `FieldImage/FieldFile/FieldGallery` reference media upload — verify whether they import `@backend`/upload hooks; if so, push that to context (treat like relational, Step 6) or keep a thin app-side wrapper. Inspect before moving.
- **Run:** `bun --filter web check-types` (the old `fields/index.ts` still points at old paths — expect to update it in Step 7; until then keep the moved files compiling in isolation).
- **Proves:** the bulk of the catalog is portable with no app coupling.

### Step 5 — Compound orchestration as a host interface
- **CREATE** `packages/field-engine/src/compound/FieldGroup.tsx`, `FieldRepeater.tsx`, `FieldFlexibleContent.tsx`
  - Move the presentational shells. Replace the stub comment ("Sub-fields … render here") with a call to a **`renderSubField`** callback supplied via `FieldRenderContext` (the host decides how to render N rows of sub-fields — Admin uses `MetaboxRenderer`, future Website uses its own). Replace `@/components/ui/button` with a plain `<button>` (or a tiny local `Button` in the package).
- **EDIT** `packages/field-engine/src/types.ts` → finalize `FieldRenderContext` with `renderSubField(parentField, rowIndex, subFields): ReactNode`.
- **Run:** `bun --filter web check-types`
- **Proves:** compound rendering is host-agnostic (PRD §3.2, §6); no admin-only stub left in the package.

### Step 6 — Relational renderers via injected `resolveRelation`
- **CREATE** in `packages/field-engine/src/renderers/`: `FieldPostObject, FieldPageLink, FieldRelationship, FieldTaxonomy, FieldUser, FieldLink`.
  - Remove `useQuery(api...)` + `@backend` imports. Each pulls its option list from `context.resolveRelation(kind, params)` passed through props/context. The engine defines the `resolveRelation` signature; it never imports a generated API (PRD §8 "no admin coupling").
- **Run:** `bun --filter web check-types`
- **Proves:** the package imports **zero** `@backend` / `convex-helpers` — the core CI invariant (PRD §8, §10 Phase-1 guard).

### Step 7 — Build the registry + `FieldRenderer`, point the app at the package
- **CREATE** `packages/field-engine/src/registry.ts` — `FIELD_RENDERERS` map (moved from old `fields/index.ts`) wiring all renderers from `renderers/` + `compound/`; plus `registerFieldType(slug, component)` for additive types (`page_break`, `calculation`, `captcha`, `payment` — PRD §4, §6).
- **CREATE** `packages/field-engine/src/FieldRenderer.tsx` — single-field entry: looks up `FIELD_RENDERERS[type]`, renders safe fallback for unknown type (PRD §9 — never throw).
- **EDIT** `packages/field-engine/src/index.ts` → export `FIELD_RENDERERS`, `registerFieldType`, `FieldRenderer`, `SUPPORTED_FIELD_TYPES`, `evaluateConditionalLogic`, `validateFieldValue`, `parseFieldValue`, `encodeFieldValue`, types (PRD §6 public API).
- **EDIT** `apps/web/src/components/custom-fields/metabox/MetaboxRenderer.tsx`
  - Import `FIELD_RENDERERS` + `evaluateConditionalLogic` from `@convexpress-admin/field-engine`. **Delete the local `isFieldVisible`** and call `evaluateConditionalLogic(field, valueMap)` (this is where the bug fix takes effect at runtime). Provide the `FieldRenderContext` (Convex-backed `resolveRelation` + a `renderSubField` that recurses through `MetaboxRenderer`'s row logic for compounds).
- **EDIT** `apps/web/src/components/custom-fields/FieldSettingsPanel.tsx` — if it imports `FieldRendererProps`/types from the old `fields/index.ts`, repoint to the package. (Optionally stamp `enabled: true` in the builder write — additive only.)
- **DELETE** `apps/web/src/components/custom-fields/fields/` once nothing references it (or convert `fields/index.ts` to a thin re-export of the package during a transition, then remove). Verify `EditorLayout.tsx` still resolves.
- **Run:** `bun --filter web check-types` then `bun run check-types`
- **Proves:** the Admin app renders custom fields entirely through the package; old in-app engine deleted; no duplicate registry.

### Step 8 — CI guard + Website seam note (no Website code)
- **EDIT** `scripts/admin/check-admin-guardrails.mjs` — add a check: **no file under `packages/field-engine/src/` may contain** `@backend/` or `convex-helpers` or `@/` (the "shared package imports no admin/app code" invariant; PRD §8, §10). Fail the guardrail otherwise.
- **DOC ONLY:** add a short comment/README note in `packages/field-engine/` stating the Website does **not** consume this package and will re-implement a lean renderer in `ConvexPress-Website/apps/web/src/` (mirroring `lib/customFields.ts`) when the Form Renderer system is built. **No Website files are created in this plan.**
- **Run:** `node scripts/admin/check-admin-guardrails.mjs` (from `ConvexPress-Admin/`)
- **Proves:** the decoupling is enforced mechanically, and the cross-app boundary is documented where the next implementer will look.

---

## Verify Checklist (gate for "done")

- [ ] `cd ConvexPress-Admin && bun --filter web check-types` exits **0**.
- [ ] `cd ConvexPress-Admin && bun run check-types` exits **0** (whole workspace incl. backend/Convex).
- [ ] `node scripts/admin/check-admin-guardrails.mjs` passes, including the new field-engine import guard.
- [ ] `grep -rE "@backend/|convex-helpers|@/(lib|components)/" ConvexPress-Admin/packages/field-engine/src` returns **nothing**.
- [ ] **customFields still renders**: launch the Admin app, open a post/page in the editor (`EditorLayout` → `MetaboxRenderer`), confirm a metabox with mixed field types renders, accepts input, and autosaves (no console errors).
- [ ] **Bug fix verified**: create/load a field with conditional logic (e.g. "show this field when <sibling> == X"); toggling the sibling now actually shows/hides the dependent field (previously always-visible). Confirm **pre-existing** stored rules (key `field`, no `enabled`) are honored without editing them.
- [ ] Backend submit path: a `setValues` mutation still validates via `validateFieldValue` (required/per-type errors still fire) — unchanged behavior, now sourced from the engine.
- [ ] No leftover references to `apps/web/src/components/custom-fields/fields/*` outside the package (grep clean); `EditorLayout.tsx` + `FieldSettingsPanel.tsx` compile against the package.

---

## Risks / Notes

- **`Button` swap parity (Step 4/5):** replacing shadcn `Button` with plain `<button>` in `FieldRepeater`/`FieldFlexibleContent` is a visual change. If pixel parity matters, instead ship a minimal local `Button` in the package mirroring the shadcn variant classes (no `@/` import). Decide before Step 5; default = plain styled button.
- **Media renderers (`FieldImage/File/Gallery`):** these may reach into Convex file storage / upload hooks. Inspect before moving (Step 4). If coupled, treat their data access like relational (context injection) or keep a thin app-side wrapper that injects the upload handler — do **not** import `@backend` into the package.
- **Convex bundle hygiene:** the backend must import only `@convexpress-admin/field-engine/validate` (and possibly `/serialize`/`/conditional-logic`) — never the package root (which pulls React/renderers). The subpath exports in Step 1 make this enforceable; spot-check the Convex build doesn't bloat.
- **`verbatimModuleSyntax`** is on in the web app tsconfig — moved files must use `import type` for type-only imports (the existing renderers already do; preserve it).
- **No data migration:** the bug fix is read-side only. Existing `conditionalLogic` JSON (key `field`, no `enabled`) is honored as-is. Never rewrite stored rules (per project rule: never drop functionality/data).
- **Website renderer is out of scope here** — it is the Form Renderer PRD's job, implemented as deliberate duplication in the Website repo. This plan only leaves the documented seam (Step 8).
- **Additive registry (`registerFieldType`)** is built in Step 7 but only *proven* when the Multi-Step system adds `page_break` (PRD §10 Phase-3) — out of scope for this plan; the API surface is delivered and unit-checkable.
