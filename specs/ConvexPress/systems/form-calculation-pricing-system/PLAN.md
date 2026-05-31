# PLAN: Form Calculation & Pricing System

> Lean build plan for the PRD in this folder (`PRD.md`). Read that first.
> This plan is grounded in the **actual** repo, not the PRD's idealized package layout.

---

## 0. Reality reconciliation (READ BEFORE CODING)

The PRD assumes a shared `@convexpress/field-engine/calc` package with a `registerFieldType(def)`
runtime API. **Neither exists.** The real codebase:

- **No field-engine package, no `registerFieldType`.** Field types are a flat array +
  helper set in `ConvexPress-Admin/packages/backend/convex/customFields/validators.ts`
  (`SUPPORTED_FIELD_TYPES`, `FIELD_TYPE_SET`, `LAYOUT_FIELD_TYPES`, `COMPOUND_FIELD_TYPES`,
  `isValidFieldType`). Renderers dispatch by a `switch (field.type)` (no registry).
- **Two separate workspaces.** Admin (`@convexpress-admin/backend`) owns the real Convex
  functions. Website (`@convexpress-website/backend` = generated client only) does NOT import
  Admin code.
- **Established pattern for pure dual-runtime logic = verbatim triplication.** `conditionalLogic.ts`
  already exists 3× with a lockstep header comment:
  1. Admin frontend canonical → `ConvexPress-Admin/apps/web/src/components/custom-fields/conditionalLogic.ts`
  2. Admin backend mirror → `ConvexPress-Admin/packages/backend/convex/extensions/forms/conditionalLogic.ts`
  3. Website copy → `ConvexPress-Website/apps/web/src/lib/forms/conditionalLogic.ts`

**Decision: the calc core follows the same triplication pattern.** Author the canonical core ONCE
under the Admin backend forms extension as a `calc/` folder (so the server submit path imports it
directly), then mirror byte-for-byte-equivalent copies to Admin frontend and Website. A lockstep
header on every file points to the canonical source. No new package, no `registerFieldType`.

Field-type "registration" = **add `"calculation"` and `"product"` to the arrays in `validators.ts`**
+ **add `switch` cases to the two renderers** + **add palette entries**. That is the engine's real
extension surface.

**Money rule:** authoritative pricing computed/stored in **integer cents** server-side (PRD §8).
Client recompute is UX-only; the submit mutation overwrites every computed value + writes a pricing
summary. Tampered client values are ignored.

---

## Canonical file paths (single source of truth for this plan)

Core (canonical, authored once):
- `ConvexPress-Admin/packages/backend/convex/extensions/forms/calc/grammar.ts`
- `ConvexPress-Admin/packages/backend/convex/extensions/forms/calc/parse.ts`
- `ConvexPress-Admin/packages/backend/convex/extensions/forms/calc/evaluate.ts`
- `ConvexPress-Admin/packages/backend/convex/extensions/forms/calc/graph.ts`
- `ConvexPress-Admin/packages/backend/convex/extensions/forms/calc/recompute.ts`
- `ConvexPress-Admin/packages/backend/convex/extensions/forms/calc/format.ts`
- `ConvexPress-Admin/packages/backend/convex/extensions/forms/calc/index.ts` (barrel re-export)

Mirrors (verbatim-equivalent, lockstep header → canonical):
- Admin FE: `ConvexPress-Admin/apps/web/src/components/forms/calc/{grammar,parse,evaluate,graph,recompute,format,index}.ts`
- Website: `ConvexPress-Website/apps/web/src/lib/forms/calc/{grammar,parse,evaluate,graph,recompute,format,index}.ts`

Field-type registration (EDIT in place — these are existing files):
- `ConvexPress-Admin/packages/backend/convex/customFields/validators.ts` (add 2 slugs + a `COMPUTED_FIELD_TYPES` set)
- `ConvexPress-Admin/packages/backend/convex/helpers/customFieldValidation.ts` (add `calculation`/`product` validate cases)

Renderers + builder (Admin FE):
- `ConvexPress-Admin/apps/web/src/components/custom-fields/fields/FieldCalculation.tsx` (new)
- `ConvexPress-Admin/apps/web/src/components/custom-fields/fields/FieldProduct.tsx` (new)
- `ConvexPress-Admin/apps/web/src/components/custom-fields/FieldTypeSelector.tsx` (edit: palette + labels)
- `ConvexPress-Admin/apps/web/src/components/custom-fields/FieldSettingsPanel.tsx` (edit: route calc/product to editor)
- `ConvexPress-Admin/apps/web/src/components/forms/CalculationEditor.tsx` (new inspector panel)

Renderer (Website FE):
- `ConvexPress-Website/apps/web/src/components/forms/FormFieldRenderer.tsx` (edit: add 2 `switch` cases + recompute read)
- `ConvexPress-Website/apps/web/src/components/forms/FormRenderer.tsx` (edit: wire `recomputeForm` into value state)

Server hooks (Admin backend):
- `ConvexPress-Admin/packages/backend/convex/extensions/forms/mutations.ts` (edit: `submit` step (g) authoritative recompute + pricing summary; `create`/`update`/`publish` save-time graph validation)
- `ConvexPress-Admin/packages/backend/convex/extensions/forms/queries.ts` (edit: expose pricing summary read for commerce/confirmation)

Tests:
- `ConvexPress-Admin/packages/backend/convex/extensions/forms/calc/__tests__/calc.test.ts`

Reference (read-only, do NOT import — separate repo):
- `/Users/worsin/EZ-Entity-Setup/ez-website/apps/web/src/lib/order-form/pricing.ts`

---

## Phase 1 — Formula core (pure, dual-runtime, NO eval)

Author all of these under the **canonical** path (`.../extensions/forms/calc/`). Pure TS only:
no `window`, no `convex`, no React, no `eval`/`Function`/`setTimeout(string)`.

1. **`grammar.ts`** — node union + token kinds + tables:
   - `type Node` closed union: `num | ref({key}) | rowref({row.x}) | unary(-) | binary(op) | call(fn,args)`.
   - `BIN_PRECEDENCE` table: `^`(R-assoc, highest) → `* / %` → `+ -` → `< <= > >= == !=` → `&& ||`(lowest).
   - `FN_ARITY` allow-list: `sum/min/max` (n-ary OR 1 aggregate arg), `count/average` (1 aggregate),
     `round(1..2)`, `ceil/floor/abs(1)`, `if(3)`, `lookup(2)`. Anything else = parse error.
   - `MAX_NODES`, `MAX_DEPTH` caps (DoS guard).
2. **`parse.ts`** — tokenizer + Pratt parser → `Node`:
   - Recognize number literals, `{field_key}`, `{row.subKey}`, operators, parens, function calls.
   - Enforce arity from `FN_ARITY`; enforce `{row.x}` only inside an aggregate fn arg.
   - Enforce node-count/depth caps; throw `CalcError` with friendly message + position.
   - Export `parse(formula): Node` and `collectRefs(ast): { fieldRefs:Set<string>; rowRefs:Set<string> }`.
3. **`evaluate.ts`** — recursive AST walker (pure, deterministic):
   - `evalAst(node, scope): number`. `scope = { values: Record<key,unknown>; repeaters: Record<key, Array<Record<sub,unknown>>>; repeaterKey?: string; tables?: ...; treatBlankAs: number }`.
   - `toNumber(v, treatBlankAs)`: non-numeric/empty/`NaN` → `treatBlankAs` (default 0); never propagate `NaN`.
   - `applyBinOp`: guard `/0` and `%0` → `0`; comparisons/logical → `1`/`0`.
   - `FN_TABLE`: static hand-written impls incl. `lookup(ref, tableName)` against `scope.tables`,
     and aggregate fold (`sum/min/max/count/average`) over `scope.repeaters[repeaterKey]` for `{row.x}`.
   - `round` = half-up; integer-cents-safe (operate on the value passed in).
4. **`format.ts`** — `formatNumber(value, numberFormat)`:
   - `style: decimal|currency|percent`, `currency`, `decimals(0..4)`, `thousandsSeparator`, `prefix`, `suffix`.
   - Display only. Accepts the integer-minor-unit value and divides per `decimals` for presentation.
5. **`index.ts`** — barrel: re-export `parse`, `collectRefs`, `evalAst`, `formatNumber`, types, `CalcError`.

**Verify P1:**
- [ ] `cd ConvexPress-Admin/packages/backend && bunx tsc --noEmit` passes (or no NEW errors beyond known TS2589).
- [ ] CI grep guard returns nothing: `grep -rnE "\beval\b|new Function|setTimeout\([\"'\`]|require\(|import\(|window\.|globalThis|process\.|convex|react" ConvexPress-Admin/packages/backend/convex/extensions/forms/calc/ --include=*.ts | grep -v "__tests__"`
- [ ] Unit tests (write in this phase, see Phase 5) for parser + evaluator + every PRD §9 edge case green.

---

## Phase 2 — Dependency graph + recompute (canonical)

6. **`graph.ts`** — `buildDependencyGraph(fields): { order: string[]; cycles: string[][] }`:
   - Filter computed fields (type ∈ `{calculation, product}` OR `settings.computed === true`).
   - Per field: `parse(formula)` (memoize), `collectRefs` → edges only between computed fields
     (plain inputs are sources). Kahn topo sort (in-degree queue).
   - `order.length < computed.length` ⇒ residual cycle: run `findCycles` (DFS) → named cycles.
   - Also export `collectUnknownRefs(fields)` → refs that match no field `key` (save-time error).
7. **`recompute.ts`** — `recomputeForm(fields, values, repeaters): RecomputeResult`:
   - Walk topo `order`; eval each computed field; write result back into a working value map so
     dependents (`subtotal → grand_total`) cascade in one pass.
   - **Two-channel `PricingResult`** (PRD §3.5): `{ oneTime: number; recurring: Array<{interval:"month"|"year"; amount:number; label?:string}> }`.
     `product` lines + `calculation` w/ `priceKind` split into one-time vs per-interval recurring buckets.
   - `product` value object: `{ unitPrice, quantity, lineTotal, priceKind, interval? }` (PRD §4/§5).
   - Cross-repeater aggregation via `scope.repeaters[settings.repeaterKey]` (PRD §3.6).
   - Runtime cycle fallback: offending nodes → `0` + non-throwing error marker (never throw).
   - Export a **server entry** `recomputeAuthoritative(fields, valueMap)` returning computed values
     **in integer cents** + the `PricingResult` summary (the submit mutation calls this).
   - Optional `recomputeDirty(...)` (dirty-subgraph) for client perf — full recompute is acceptable for v1; ship dirty only if memo profiling shows need.

**Verify P2:**
- [ ] Topo order test: `grand_total` evaluates after `subtotal`.
- [ ] Cycle test: `a→b→a` and self-ref `a→a` return non-empty `cycles` with named keys.
- [ ] Unknown-ref test: `collectUnknownRefs` flags `{nope}`.
- [ ] EZ worked example (PRD §10) returns `{ oneTime: 74600, recurring: [{interval:"year", amount:39800, ...}] }` in cents.

---

## Phase 3 — Field-type registration + validation (Admin backend EDITS)

8. **`validators.ts`** — add to `SUPPORTED_FIELD_TYPES` array: `"calculation"`, `"product"`.
   Add a new exported set `COMPUTED_FIELD_TYPES = new Set(["calculation","product"])`.
   (`FIELD_TYPE_SET`/`isValidFieldType` derive automatically, so `create`/`update` accept them.)
9. **`helpers/customFieldValidation.ts`** — add `validateFieldValue` cases:
   - `calculation`: read-only/computed → always `{valid:true}` (server overwrites it anyway; never user-required).
   - `product`: validate only the user-editable parts (quantity/option), never the computed `lineTotal`.
10. **Save-time graph validation** in `extensions/forms/mutations.ts` (`create`, `update`, and
    `publish` — wherever the form's field set is persisted/published):
    - After assembling the form's `fieldDefinitions`, call `buildDependencyGraph` + `collectUnknownRefs`.
    - If `cycles.length > 0` OR unknown refs exist → `throw new ConvexError({ code: "VALIDATION_ERROR", message: "<named cycle / unknown ref>" })`. A cyclic/invalid form can never publish (PRD §8).

**Verify P3:**
- [ ] `bunx tsc --noEmit` (backend) clean.
- [ ] Creating a `calculation` field via `customFields` mutation succeeds (type accepted).
- [ ] Publishing a form with `grand_total ↔ subtotal` cycle is rejected with the named cycle.

---

## Phase 4 — Authoritative server recompute at submit (Admin backend EDIT)

11. **`extensions/forms/mutations.ts` → `submit`**, insert between step (e) validate and step (g) persist:
    - Build `valueMap` (already present) + a `repeaters` map from any repeater answers.
    - Call `recomputeAuthoritative(visibleDefs, valueMap)` → `{ computed: Record<key, value>, pricing: PricingResult }` (cents).
    - **Overwrite** every computed field's entry in the persisted `fieldValues` with the server value
      (ignore client-sent computed values entirely — PRD §8). Store `product`/`calculation` values as JSON.
    - Persist the **pricing summary** alongside answers: write to `form_submissions.meta` (existing
      JSON bag — schema §"meta") as `{ pricing: {...} }`, so commerce/confirmation read ONE trusted
      object without re-walking the graph (PRD §5). **No new table** (matches PRD + memory rule).
12. **`extensions/forms/queries.ts`** — add/extend a submission read that surfaces `meta.pricing`
    (the Commerce/Subscription Action + Confirmation consume this).

**Verify P4:**
- [ ] Submit the EZ form payload → stored computed `fieldValues` + `meta.pricing` match the §10 figures in cents.
- [ ] Tamper test: client sends a bogus `subtotal_one_time` value → server overwrites it; stored value is the recomputed one, not the tampered one.

---

## Phase 5 — Renderers + builder editor (Admin FE + Website FE)

13. **Mirror the calc core** (verbatim-equivalent, lockstep header → canonical) into:
    - `ConvexPress-Admin/apps/web/src/components/forms/calc/*`
    - `ConvexPress-Website/apps/web/src/lib/forms/calc/*`
14. **Admin FE renderers** `FieldCalculation.tsx` / `FieldProduct.tsx`:
    - `FieldCalculation`: read-only display of recompute output via `formatNumber` (no user `onChange`).
    - `FieldProduct`: price × qty UI (qty/option input only); emits a priced line; recurring label support.
    - Wire both into the Admin custom-fields renderer `switch` (follow existing `fields/Field*.tsx` dispatch
      in `FieldGroupBuilder`/`CustomFieldsMetabox`), `FieldTypeSelector.tsx` palette (new "Calculation"
      category with the 2 types + `FIELD_TYPE_LABELS`), and `FieldSettingsPanel.tsx` (route the 2 types to `CalculationEditor`).
15. **`CalculationEditor.tsx`** inspector (Base UI only, no Radix; CSS vars only — repo hard rules):
    - Formula textarea + `{field}` token inserter + function helper.
    - Live validate (`parse` + `buildDependencyGraph`) with inline cycle/unknown-ref warning.
    - `numberFormat` controls + lookup-table (`settings.tables`) editor + `priceKind`/`interval`/`recurringLabel`.
    - Persists to `fieldDefinitions.settings` JSON via existing field-update mutation (Zod-shaped per PRD §5).
16. **Website FE** `FormFieldRenderer.tsx`: add `case "calculation"` (read-only display) + `case "product"`
    (qty input + line display) to the existing `switch (field.type)`.
17. **Website FE** `FormRenderer.tsx`: after the `values`/`visibleFields` memo, compute
    `recomputeForm(fields, values, repeaters)` (memoized on `[fields, values]`) and feed computed values
    into the renderer for the 2 new types. Computed fields are read-only — never added to user `onChange`.
    Submit still sends raw inputs; server re-derives authoritatively (client values are UX only).

**Verify P5:**
- [ ] Admin `web` + Website `web`: `bunx tsc --noEmit` clean.
- [ ] Build the EZ form in the Admin builder; `CalculationEditor` saves formulas; invalid formula shows inline error.
- [ ] Playwright (per global rules — do not make the user the tester): on the public form, check
      Registered Agent + Compliance + EIN for NY/Advanced → live total reads **"$746 due today, then $398/yr"**.
- [ ] Confirm computed fields are non-editable in both renderers.

---

## Final verification checklist (gate before "done")

- [ ] **No-eval guard** passes over `calc/` in all 3 locations (grep from P1).
- [ ] **Triplication parity**: the 3 calc copies are behaviorally identical (diff core logic; only header comment differs). Lockstep header present on every mirrored file.
- [ ] **Typecheck**: backend + Admin web + Website web all `bunx tsc --noEmit` clean (suppress only known Convex TS2589 with scoped `@ts-expect-error`; never `--typecheck=disable` — memory rule).
- [ ] **No new tables** (pricing summary in `form_submissions.meta`; formula config in `fieldDefinitions.settings`).
- [ ] **No edits** to `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` (v2 additive-only).
- [ ] **Server authoritative**: tamper test (P4) proves client computed values are discarded.
- [ ] **Cycle rejection**: cyclic form cannot publish (P3); runtime cycle never throws in the public renderer.
- [ ] EZ §10 worked example reproduced end-to-end (builder → client live total → server-stored cents).
- [ ] All §9 edge cases covered by tests: blank/missing operand → 0, unknown ref, /0 & %0 → 0, NaN coercion,
      circular ref, repeater row add/remove, mixed recurring+one-time, multi-interval, oversize formula (DoS cap), currency rounding.
- [ ] **No Radix imports** anywhere in new FE files; **no hardcoded color literals** (Base UI + CSS vars only).

---

## Notes / deferred (do NOT gold-plate)

- **Dirty-subgraph recompute** (PRD §3.4): ship full recompute first; add `recomputeDirty` only if profiling shows a real lag. Memoize the client call.
- **`tableRef` indirection** for shared lookup tables (PRD §12): inline `settings.tables` only for v1.
- **Multi-currency minor-unit scaling** (PRD §12): default 2-decimal cents; generalize when a non-USD form appears.
- **Stripe / proration / trials**: out of scope here — owned by the Commerce/Subscription Action, which only reads `meta.pricing`.
