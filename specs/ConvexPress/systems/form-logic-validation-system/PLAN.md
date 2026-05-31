# PLAN: Form Logic & Validation System

> Lean build plan for the PRD in this folder. **Reuse-heavy**: the field-level
> conditional-logic evaluator already exists and is FIXED in three hand-mirrored
> copies. This system extends it to section/page scope, adds cross-field +
> conditional-required rules, and owns the server-trusted recompute→validate
> contract already partly present in `mutations.submit`.

## Ground truth (verified 2026-05-30)

- **No `@convexpress/field-engine` package exists.** The PRD's package home is
  aspirational. The evaluator is **three hand-mirrored copies** that must stay
  behaviorally byte-identical:
  - Admin: `ConvexPress-Admin/apps/web/src/components/custom-fields/conditionalLogic.ts`
  - Backend: `ConvexPress-Admin/packages/backend/convex/extensions/forms/conditionalLogic.ts`
  - Website: `ConvexPress-Website/apps/web/src/lib/forms/conditionalLogic.ts`
  New logic helpers are added **alongside each copy in the same dir**, mirrored
  the same way. No monorepo package extraction in scope.
- **Canonical rule shape already adopted** (`{action, logic, rules:[{field,operator,value}]}`,
  presence-of-rules = active, legacy `{fieldKey, enabled}` tolerated by the
  normalizer). §3.4 reconciliation is **already done** in all three copies —
  do NOT re-fix it; just confirm with a parity test.
- **`mutations.submit`** (`extensions/forms/mutations.ts`, lines ~525-737)
  already does field-scope recompute→validate. Steps (d)/(e)/(g) are the exact
  insertion points for scope + cross-field + required + zod.
- **`zod` is `catalog:`** in backend, admin web, and website web — no install.
- **No `page_break` / section `group` markers exist yet.** Page scope is a SOFT
  dependency (Multi-Step owns the marker). Build page-scope helpers
  present-but-inert; they no-op until markers land. Section scope uses the
  engine's existing `group` field-def container.
- **Backend tests** live in colocated `__tests__/` dirs (pattern:
  `convex/commerceSubscriptions/__tests__/*.test.ts`). Admin/website evaluator
  tests live next to the file (`conditionalLogic.test.ts`).
- **`ConditionalLogicBuilder.tsx`** (admin) is reused **verbatim** for per-field
  + per-rule authoring. Section/page/cross-field/`requiredWhen` are thin wrappers
  around it.

## Naming convention for new files

Each new helper is a sibling of `conditionalLogic.ts` named `formLogic.ts`
(one module per copy, to keep the mirror small and reviewable), exporting the
new pure functions. Three mirrored copies:
- Admin: `apps/web/src/components/custom-fields/formLogic.ts`
- Backend: `packages/backend/convex/extensions/forms/formLogic.ts`
- Website: `ConvexPress-Website/apps/web/src/lib/forms/formLogic.ts`

> Rationale: the PRD's `logic/*.ts` split (scope/cross-field/required/normalize/
> visibility/submit/zod) assumes a shared package. With three hand-mirrors, one
> `formLogic.ts` per copy is far less mirror surface. Keep functions
> individually exported so a future package extraction can re-split cleanly.

---

## Phase 0 — Confirm the canonical shape is already reconciled (no code)

The §3.4 bug is already fixed in all three evaluators. Verify, don't re-fix.

1. Read all three `conditionalLogic.ts` copies; confirm each reads
   `rule.field ?? rule.fieldKey`, treats absent `enabled` as active, and fails
   open. (Already true — this is a guard against regressing them.)

**Verify:** `bun test apps/web/src/components/custom-fields/conditionalLogic.test.ts`
passes (the existing regression suite). No edits expected in this phase.

---

## Phase 1 — Cross-field operand + conditional-required (pure, 3 mirrors)

Add the two new rule kinds as pure functions. These need NO new storage — they
extend the in-memory evaluation. Build in the **backend copy first** (it's the
server truth), then mirror to admin + website verbatim.

1. **Backend** `packages/backend/convex/extensions/forms/formLogic.ts`:
   - `resolveOperand(rule, valueMap)` → if `rule.operandKind === "field"`,
     return `valueMap[rule.value] ?? ""`; else return `rule.value` (literal).
     Default absent `operandKind` = `"literal"` (back-compat with today's data).
   - `evaluateRuleCF(rule, valueMap)` — same operator/coercion semantics as the
     engine's `evaluateRule` (`Number()` for `>`/`<`, string for `contains`,
     no throw on NaN/mismatch) but with the right operand from `resolveOperand`.
   - `evaluateLogicData(logic, valueMap)` — a cross-field-aware sibling of
     `evaluateConditionalLogic` that parses the same JSON, honors
     `action`/`logic`/`enabled`, and uses `evaluateRuleCF`. Reuse for all three
     scopes. (Field scope keeps calling the existing `evaluateConditionalLogic`
     for unchanged behavior; cross-field rules go through this one.)
   - `isFieldRequired(field, isVisible, valueMap)` — returns `false` if
     `!isVisible`; else `true` if static `field.required` OR
     (`field.settings.requiredWhen` present AND `evaluateLogicData` true). Parse
     `requiredWhen` out of the field's `settings` JSON.
2. **Admin** mirror → `apps/web/src/components/custom-fields/formLogic.ts` (verbatim).
3. **Website** mirror → `ConvexPress-Website/apps/web/src/lib/forms/formLogic.ts` (verbatim).
4. Extend the shared `ConditionalRule` interface in all three
   `conditionalLogic.ts` copies with `operandKind?: "literal" | "field"`
   (additive, optional — no behavior change for existing data).

**Verify:**
- `packages/backend/convex/extensions/forms/__tests__/formLogic.test.ts`:
  cross-field `endDate > startDate` true/false; `operandKind` absent = literal;
  NaN cross-field compare = `false` (no throw); `requiredWhen` makes a visible
  field required only when its trigger matches; hidden field never required.
- `bun test` green for the new backend suite + admin/website mirror suites.

---

## Phase 2 — Scope extension: section + page (pure, 3 mirrors)

Reuse `evaluateLogicData` for the two new scopes. No new storage — section logic
lives on a `group` field-def's `conditionalLogic`; page logic on a future
`page_break` marker's `settings.conditionalLogic` (inert until the marker exists).

1. **Backend** `formLogic.ts` add:
   - `evaluateSectionVisibility(groupField, valueMap)` — evaluate the group
     field's `conditionalLogic` via `evaluateLogicData`. A hidden group ⇒ every
     descendant field hidden (caller gates descendants by `parentFieldId`).
   - `evaluatePageVisibility(pageBreakMarker, valueMap)` — read
     `settings.conditionalLogic`; if no marker/no logic ⇒ visible (inert).
     Returns a boolean per page index.
   - Section gating overrides inner field rules: a field inside a hidden section
     is hidden regardless of its own field-level rule (PRD §10).
2. Mirror to admin + website verbatim.

**Verify:** backend `__tests__` — hidden `group` hides its children even when a
child's own field rule says show; page marker with `hide` logic removes its
fields; absent marker = all pages visible (single-page inert).

---

## Phase 3 — The server-trust contract (`recomputeVisibility` + `validateSubmission`)

The core deliverable. Two pure functions in the **backend** `formLogic.ts`
(the server is the only place these MUST run; the website may import its mirror
later for live UX parity, but that's Phase 5-optional).

1. **`recomputeVisibility(fieldDefs, valueMap)`** → `{ visibleFieldKeys: Set,
   hiddenFieldKeys: Set, visiblePageIndexes: Set }`:
   - Resolve **page** visibility first (skipped page ⇒ its fields' controlling
     values treated as empty downstream — PRD §10).
   - Resolve **section** (`group`) visibility next; a hidden section marks all
     descendants hidden.
   - Resolve **field** visibility last via `evaluateConditionalLogic` /
     `evaluateLogicData`, AND-gated by the field's section + page visibility.
   - Defensive cycle handling: an unresolved dependency cycle fails **open**
     (treat node as "show") so the form stays submittable (PRD §9).
2. **`validateSubmission(fieldDefs, valueMap, visibility)`** →
   `{ ok: boolean, errors: Record<fieldKey, string> }`:
   - For each **visible** field: compute `isFieldRequired`, then call the
     engine's `validateFieldValue(type, value, settings, required)` verbatim.
   - Run **cross-field** rules over visible fields (a rule referencing a hidden
     field ⇒ empty operand ⇒ vacuously satisfied; PRD §10).
   - Skip layout types (`message`/`accordion`/`tab`).
3. **`compileZodFromVisibleFields(fieldDefs, visibility)`** → a `z.object`
   built from the visible defs (string/optional per type + required presence);
   run `.safeParse(valueMap)` at the boundary alongside the imperative checks.
   Both must pass. Keep it structural (presence/shape) — imperative checks stay
   the source of truth for type-specific rules.

**Verify:** backend `__tests__/serverTrust.test.ts` — adversarial cases:
- hidden required field ⇒ submission accepted (not blocked);
- spoofed value for a server-hidden field ⇒ dropped from `validateSubmission` +
  not in `visibleFieldKeys`;
- omitted value for a server-visible required field ⇒ `ok:false` with its error;
- cross-page conditional resolves deterministically (controlling field on a
  skipped page ⇒ empty operand);
- zod failure and imperative failure each independently flip `ok:false`.

---

## Phase 4 — Wire the contract into `mutations.submit` (backend)

Replace the field-only recompute in `extensions/forms/mutations.ts` with the
full contract. **Do not change the mutation's public args or return shape** —
the Submission System owns the mutation; this system owns the functions it calls.

1. Import `recomputeVisibility`, `validateSubmission`, `compileZodFromVisibleFields`
   from `./formLogic` (keep the existing `./conditionalLogic` import for the
   unchanged field-scope primitive).
2. Step (d): replace the inline `visibleDefs = fieldDefs.filter(evaluateConditionalLogic…)`
   with `const visibility = recomputeVisibility(fieldDefs, valueMap)` and derive
   `visibleDefs` from `visibility.visibleFieldKeys`.
3. Step (e): replace the per-field validation loop with a single
   `const result = validateSubmission(fieldDefs, valueMap, visibility)`; on
   `!result.ok`, throw the existing `VALIDATION_ERROR` ConvexError mapping
   `result.errors` into the current `errors: [{fieldKey, label, error}]` array
   shape (preserve the wire contract — re-attach `label` from the def).
4. Step (e+): run `compileZodFromVisibleFields(...).safeParse(valueMap)`; fold
   any failures into the same `errors` payload.
5. Step (g): persistence already drops non-visible/unknown keys via
   `visibleByKey`; re-source `visibleByKey` from `visibility.visibleFieldKeys`
   so section/page-hidden values are dropped too (PRD §9 "hidden ⇒ omitted").

**Verify:**
- `bun run typecheck` (or the backend tsc target) passes — **no `--typecheck=disable`**.
  Expect possible TS2589 Convex false positives; suppress with a scoped
  `@ts-expect-error`, do NOT alter logic (per project memory).
- The submit mutation's existing behavior tests (if any) still pass; the
  VALIDATION_ERROR `errors[]` shape is unchanged.

---

## Phase 5 — Authoring UI (admin, reuse `ConditionalLogicBuilder`)

No new full-page editor; plug into existing surfaces. Confirmation dialogs are
the only allowed popup; full-page navigation otherwise (admin hard rules).

1. **Cross-field operand** — extend `ConditionalLogicBuilder.tsx` minimally: add
   an operand-kind toggle (`literal | field`) per rule; when `field`, swap the
   value text input for a sibling-field `<select>` (reuse the existing
   `siblingFields` prop). Keep `onChange` emitting the same JSON + new
   `operandKind`. Additive, back-compatible.
2. **Section scope** — surface a `ConditionalLogicBuilder` inside the `group`
   field's settings in `FieldGroupBuilder` (the form edit route
   `forms/$formId/edit.tsx` already renders `FieldGroupBuilder`), writing to the
   group field-def's `conditionalLogic`.
3. **Conditional-required** — add a `requiredWhen` builder (another
   `ConditionalLogicBuilder` instance) to a field's settings drawer, persisted
   into the field-def `settings.requiredWhen` JSON.
4. **Page scope** — when a `page_break` marker exists, attach a
   `ConditionalLogicBuilder` writing to `settings.conditionalLogic`. Gate behind
   the marker's existence (inert until Multi-Step ships it).
5. **Global settings route** — `forms/settings.tsx` currently shows only a
   Security placeholder and **gates on `form.manage_security`**. Logic/validation
   authoring is per-form (lives in the field/group drawers above), so no new
   global panel is required here; leave `settings.tsx` as-is unless a global
   "validation defaults" panel is later requested.

**Verify:** `bun run typecheck` for admin web passes; manual Playwright smoke on
`/admin/forms/$formId/edit` — add a cross-field rule + a `requiredWhen` rule,
save, reload, confirm the JSON round-trips. (Use the hardening playbook smoke
pattern.)

---

## Phase 6 — Authoring-time guards (save-side validation)

Reject bad rule graphs when the author saves, so respondents never hit an
unresolvable form. These run in the **field/group persistence mutations** in
`customFields` (or a thin validator imported by them) — additive checks only.

1. **Circular-condition rejection** — build the field/section/page dependency
   graph from the rule operands; reject on a cycle (A shows-if B, B shows-if A)
   with a `VALIDATION_ERROR` naming the offending field keys. Pure helper
   `detectRuleCycle(fieldDefs)` in `formLogic.ts` (mirrored), called at save.
2. **Dangling reference** — a rule referencing an unknown/deleted field key is
   flagged at save; author must repoint or remove.
3. **Operator/type sanity (warning only)** — surface a non-blocking warning when
   an operator is unlikely for the operand's type (e.g. `>` on `true_false`).
   Runtime still never throws (lenient coercion, PRD §10).

**Verify:** backend `__tests__` — `detectRuleCycle` flags a 2-node and 3-node
cycle, passes an acyclic graph; dangling-key rule rejected at save; runtime
evaluation of a (hypothetically persisted) cycle fails open and stays
submittable.

---

## Phase 7 — Parity + final verification

1. **Client/server parity test** — one form exercising all three scopes + both
   new rule kinds; assert the website `formLogic` mirror and the backend
   `formLogic` produce identical `visibleFieldKeys` / required decisions for the
   same `valueMap`. (Mirror-equivalence is the whole "one engine, two callers"
   invariant.)
2. Run the full evaluator regression suite across all three copies.
3. `bun run typecheck` clean in backend + admin web + website web.

**Final verify checklist (all must pass):**
- [ ] Phase 0: existing `conditionalLogic.test.ts` regression suite green.
- [ ] Cross-field rule (`operandKind:"field"`) evaluates correctly; absent kind = literal.
- [ ] `requiredWhen`: visible field required only on trigger match; hidden ⇒ never required.
- [ ] Section (`group`) hidden ⇒ all descendants hidden, overriding inner rules.
- [ ] Page marker hidden ⇒ its fields excluded; absent marker = inert (single-page).
- [ ] `recomputeVisibility` returns correct `{visible, hidden, visiblePages}`; cycle fails open.
- [ ] `validateSubmission`: hidden-required accepted; spoofed-hidden dropped; omitted-visible-required rejected.
- [ ] `compileZodFromVisibleFields` runs alongside imperative checks; both gate `ok`.
- [ ] `mutations.submit` wired to the contract; public args + `errors[]` wire shape unchanged.
- [ ] Hidden (field/section/page) values omitted from persisted `fieldValues`.
- [ ] `ConditionalLogicBuilder` reused for cross-field + section + `requiredWhen`; JSON round-trips on `/admin/forms/$formId/edit`.
- [ ] `requireCan(ctx, "form.manage_settings")` on every rule-persisting mutation (admin authoring path).
- [ ] Circular + dangling-reference rejected at save; operator/type sanity warns only.
- [ ] Client/server parity test green over all three scopes + both rule kinds.
- [ ] `bun run typecheck` clean in backend + admin web + website web (no `--typecheck=disable`; scoped `@ts-expect-error` only for TS2589).
- [ ] All three `formLogic.ts` mirrors stay behaviorally identical (mirror-equivalence asserted).

---

## Out of scope (owned elsewhere — do not build here)

- The field-level evaluator, `validateFieldValue`, `ConditionalLogicBuilder`
  themselves (Form Field Engine — reuse only).
- The submit mutation, entry write, event emission (Form Submission System —
  this supplies the functions it calls).
- Live rendering, show/hide animation, inline error display (Form Renderer).
- Page navigation, step state, save-and-resume, the `page_break` marker itself
  (Form Multi-Step).
- Capability **registration** for `form.manage_settings` (Role/Capability expert
  registers; this system only calls `requireCan`).
- Calculated values as rule operands (Form Calculation & Pricing — deferred,
  PRD §12).
- Convex deployment (the convex-deployment expert; work ends at "code + types pass").
