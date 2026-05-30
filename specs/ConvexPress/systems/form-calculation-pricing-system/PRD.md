# PRD: Form Calculation & Pricing System

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). First system in the Forms dependency tree; everything else consumes it.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** A **calculation/pricing layer for the Forms extension**, built *on top of* the Form Field Engine. It is not a standalone CRUD system and not a new Convex module of its own — it ships as a pair of new field types **registered into the engine** (`registerFieldType`) plus a pure, dual-runtime formula module shared by Admin (builder + live preview) and Website (renderer + authoritative submit recompute).

**Recommended home:** the formula core lands in the shared field-engine package alongside `validate.ts` / `conditional-logic.ts` (working path `packages/field-engine/calc/`), so both hosts import the identical evaluator. The two registered field types live in the Forms extension (`apps/web/src/extensions/forms/fields/`) and call into that core. (Open question — see §11.)

**This is genuinely net-new work.** The `customFields` engine has **no** calculations, formulas, computed values, or dependency tracking today (the Field Engine PRD lists "Calculations/formulas" explicitly as out of scope — `specs/ConvexPress/systems/form-field-engine/PRD.md` §1.2). This system builds the formula grammar, the parser/AST, the dependency-graph resolver, circular-reference detection, and the recompute pipeline from scratch.

**Consumes these ConvexPress systems:**

- **Form Field Engine** (`specs/ConvexPress/systems/form-field-engine/PRD.md`) — the host. Provides `registerFieldType(def)`, the `FieldRendererProps` contract, the `fieldDefinitions` / `fieldValues` data model, the conditional-logic evaluator (a hidden operand reads as absent), and the compound (`repeater`) orchestration this system aggregates over. **No engine files are forked or edited** — the two field types are registered additively.
- **Form Submission System** (`specs/ConvexPress/systems/form-submission-system/PRD.md`) — the submit mutation calls this system's authoritative recompute before persisting `fieldValues`; computed values are stored as ordinary answers.
- **Form Commerce / Subscription Action** (`specs/ConvexPress/systems/form-commerce-subscription-action/PRD.md`) — reads the trusted, server-recomputed `product`/pricing totals (one-time subtotal + recurring schedule) to build the Stripe line items / subscription; this system never touches Stripe itself.

**WooCommerce / WordPress analog:** Gravity Forms' **Calculations** (number/product fields with `{Field:N}` merge-tag formulas) + the **Total** field + Gravity Forms' product/option/shipping/recurring pricing model. The reference capability bar is the **EZ Entity Setup** signup form's pricing engine (per-state filing-fee lookup, tiered packages, recurring add-ons, smart upsell, live totals — `EZ-Entity-Setup/ez-website/apps/web/src/lib/order-form/pricing.ts`), generalized into a config-driven formula system.

---

## 1. Overview

### 1.1 Purpose

Give the Forms builder **computed fields**: a field whose value is derived from other fields via a formula, recomputed live as the respondent types (UX) and recomputed authoritatively on the server at submit (trust). The formula references other fields by key (`{state_fee} + {package_price}`), supports arithmetic + a small function set (`sum`, `min`, `max`, `round`, …), aggregates across repeater rows, and — for commerce forms — carries **one-time vs. recurring** pricing semantics so a downstream action can build a Stripe charge + subscription. Evaluation order is driven by a **dependency graph** with **topological ordering** and **circular-reference rejection at save time**.

### 1.2 Scope

This system is **net-new relative to the Field Engine** — the engine ships zero calculation capability. Nothing here modifies the engine; it extends it through the public registration API.

**In scope:**
- A safe **formula grammar** (operators, `{field_key}` references, function calls) — §3.1.
- A **parser → AST → evaluator** with **no `eval`/`Function`** of arbitrary JS (a restricted, allow-listed AST interpreter) — §3.3.
- A **dependency graph** built from field references, **topological evaluation order**, and **circular-reference detection** (reject at builder save; degrade safely at runtime) — §3.2.
- **Recompute-on-change** on the client (recompute only the dirty subgraph) — §3.4.
- **Authoritative recompute on the server** inside the submit mutation; the client value is never trusted for anything monetary — §8.
- **Recurring-pricing semantics:** a line can be one-time or recurring (interval + interval label), producing a one-time subtotal *and* a recurring schedule — §3.5.
- **Cross-repeater-row aggregation:** `sum/min/max/count/average` over a sub-field across N rows — §3.6.
- Two new field types registered into the engine: **`calculation`** and **`product`** (pricing) — §4.
- A **number-format** config for display (currency, decimals, separators, prefix/suffix) — §5.

**Out of scope:**
- The field registry / renderer contract / value model itself — owned by the Form Field Engine (`specs/ConvexPress/systems/form-field-engine/PRD.md`).
- The builder canvas UI chrome (drag/drop, field palette) — the Form Builder System (`specs/ConvexPress/systems/form-builder-system/PRD.md`); this system contributes only the *calculation editor* inspector panel for its two field types.
- Charging money / Stripe line items / subscription creation — the Form Commerce / Subscription Action (`specs/ConvexPress/systems/form-commerce-subscription-action/PRD.md`).
- Persisting the submission record — the Form Submission System (`specs/ConvexPress/systems/form-submission-system/PRD.md`).
- Conditional show/hide of fields — the Form Logic & Validation System; this system only *consumes* visibility (a hidden operand is absent).

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Form Field Engine (`specs/ConvexPress/systems/form-field-engine/PRD.md`) | Host. Provides `registerFieldType`, the renderer contract, the `fieldValues` model, repeater orchestration, and the conditional-logic evaluator. |
| Form Submission System (`specs/ConvexPress/systems/form-submission-system/PRD.md`) | Owns the submit mutation that invokes authoritative recompute and stores computed values. |

### 2.2 Systems that depend on this

| System | Integration point |
|---|---|
| Form Commerce / Subscription Action (`specs/ConvexPress/systems/form-commerce-subscription-action/PRD.md`) | Reads server-trusted one-time subtotal + recurring schedule to build Stripe charge/subscription. |
| Form Confirmation System (`specs/ConvexPress/systems/form-confirmation-system/PRD.md`) | Shows the computed total on the confirmation screen / receipt. |
| Form Merge-Tags & Prefill (`specs/ConvexPress/systems/form-merge-tags-prefill-system/PRD.md`) | Computed values are merge-taggable in notifications (`{total}`). |

### 2.3 Engine registration (the only integration surface in code)

```typescript
// apps/web/src/extensions/forms/fields/register-calc.ts
import { registerFieldType } from "@convexpress/field-engine";
import { CalculationField } from "./CalculationField";
import { ProductField } from "./ProductField";
import { calculationSettingsSchema, productSettingsSchema } from "./schemas";

// Additive only — no engine file is edited (Field Engine PRD §4).
registerFieldType({
  type: "calculation",
  category: "calculation",
  component: CalculationField,        // read-only display; never user-editable
  settingsSchema: calculationSettingsSchema,
  hasValue: true,                     // computed value persists in fieldValues
  computed: true,                     // marks this type for the recompute pipeline
});

registerFieldType({
  type: "product",
  category: "calculation",
  component: ProductField,            // price + qty UI; emits a priced line
  settingsSchema: productSettingsSchema,
  hasValue: true,
  computed: true,
});
```

---

## 3. Architecture

The system is four cooperating pure modules (parser, graph, evaluator, recurring/aggregation helpers) plus two thin React field components. The pure modules live in the shared engine package so Admin and Website run **identical** code.

```
@convexpress/field-engine/calc (shared, pure, dual-runtime)
├── grammar.ts        token + node types; the allow-listed operator/function set
├── parse.ts          tokenizer + Pratt parser  -> AST   (no eval)
├── graph.ts          buildDependencyGraph(fields) -> { order, cycles }
├── evaluate.ts       evalAst(ast, scope) -> number | {oneTime, recurring}
├── recompute.ts      recomputeForm(fields, values) -> Map<fieldKey, value>
└── format.ts         formatNumber(value, numberFormat) -> string (display only)

Forms extension (host bindings)
├── fields/CalculationField.tsx   read-only display of recompute output
├── fields/ProductField.tsx       price × qty input; contributes a priced line
└── builder/CalculationEditor.tsx inspector: formula textarea + token insert + live validate
```

### 3.1 Formula grammar

A formula is a single expression string stored in the field's `settings.formula`. The grammar is intentionally small and closed (anything not listed is a parse error):

**Operands**
- **Number literals:** `42`, `3.14`, `0.07`.
- **Field references:** `{field_key}` — resolves to the current numeric value of the field with that `key`. Non-numeric, empty, or conditionally-hidden operands resolve to `0` by default (configurable per formula via `treatBlankAs`).
- **Repeater sub-field references** inside aggregation: `{row.qty}` — only valid as the argument to an aggregate function (§3.6).
- **Parentheses** for grouping.

**Operators** (standard precedence; left-associative except `^`):

| Operator | Meaning | Precedence |
|---|---|---|
| `^` | power (right-assoc) | highest |
| `*` `/` `%` | multiply, divide, modulo | |
| `+` `-` | add, subtract | |
| `<` `<=` `>` `>=` `==` `!=` | comparison → `1`/`0` | |
| `&&` `\|\|` | logical → `1`/`0` | lowest |
| unary `-` | negate | (prefix) |

**Functions** (fixed allow-list; argument counts validated at parse time):

| Function | Arity | Notes |
|---|---|---|
| `sum(a, b, …)` / `sum({row.x})` | n-ary or 1 aggregate arg | over operands, or over repeater rows (§3.6) |
| `min(...)` / `max(...)` | n-ary or 1 aggregate arg | same dual form |
| `count({row.x})` | 1 aggregate arg | number of rows with a non-blank value |
| `average({row.x})` | 1 aggregate arg | `sum / count`, `0` if no rows |
| `round(x, places?)` | 1–2 | banker-safe half-up rounding |
| `ceil(x)` / `floor(x)` / `abs(x)` | 1 | |
| `if(cond, a, b)` | 3 | ternary; `cond != 0` ⇒ `a` |
| `lookup({key}, "table")` | 2 | resolve a value from a named lookup table in `settings.tables` (e.g. per-state filing fees) |

No identifiers, property access, indexing, string methods, or function values exist in the grammar — there is **nothing to escape into**. See §3.3.

### 3.2 Dependency graph + topological evaluation

Each `calculation`/`product` field declares (implicitly, by its `{refs}`) a set of inbound edges. `buildDependencyGraph(fields)` walks every formula's AST, collects referenced keys, and builds a DAG `ref -> computedField`.

- **Evaluation order** is a **topological sort** (Kahn's algorithm) of the computed-field subgraph. Plain input fields are sources (in-degree contributions only). A computed field that references another computed field (e.g. `grand_total` references `subtotal`) evaluates *after* its dependency.
- **Circular references** (`a → b → a`, or self-reference `a → a`) make the topo sort fail (a residual node set with nonzero in-degree). The builder **rejects the save** and names the cycle (§8). At runtime, a cycle that somehow slips through resolves the offending nodes to `0` and surfaces a non-throwing error marker — the renderer never crashes (Field Engine §9: "never throw in the public renderer").

```typescript
// graph.ts (sketch)
export function buildDependencyGraph(fields: FieldDefinition[]): {
  order: string[];                      // topo order of computed field keys
  cycles: string[][];                   // [] when acyclic; else each cycle's keys
} {
  const computed = fields.filter((f) => f.settings?.computed);
  const refsOf = new Map<string, Set<string>>();   // key -> referenced keys
  const indeg = new Map<string, number>();
  for (const f of computed) {
    const ast = parse(f.settings.formula);          // cached per field
    const refs = collectRefs(ast);                  // {field_key} leaves only
    refsOf.set(f.key, refs);
    indeg.set(f.key, 0);
  }
  // edges only between computed fields; input refs are sources
  for (const [key, refs] of refsOf) {
    for (const r of refs) {
      if (refsOf.has(r)) indeg.set(key, (indeg.get(key) ?? 0) + 1);
    }
  }
  const queue = [...indeg].filter(([, d]) => d === 0).map(([k]) => k);
  const order: string[] = [];
  while (queue.length) {
    const k = queue.shift()!;
    order.push(k);
    for (const [other, refs] of refsOf) {
      if (refs.has(k)) {
        indeg.set(other, indeg.get(other)! - 1);
        if (indeg.get(other) === 0) queue.push(other);
      }
    }
  }
  const cycles = order.length === computed.length ? [] : findCycles(refsOf, order);
  return { order, cycles };
}
```

### 3.3 Safe evaluation (NO raw eval)

**Hard rule: the formula is never passed to `eval`, `new Function`, `setTimeout(string)`, or any dynamic code path.** The evaluator is a recursive AST walker over a closed node union:

```typescript
type Node =
  | { kind: "num"; value: number }
  | { kind: "ref"; key: string }              // {field_key}
  | { kind: "rowref"; key: string }           // {row.x} (aggregate scope only)
  | { kind: "unary"; op: "-"; arg: Node }
  | { kind: "binary"; op: BinOp; left: Node; right: Node }
  | { kind: "call"; fn: FnName; args: Node[] };  // FnName ∈ fixed allow-list

// evaluate.ts (sketch) — pure, deterministic, side-effect free
function evalAst(n: Node, scope: Scope): number {
  switch (n.kind) {
    case "num":   return n.value;
    case "ref":   return toNumber(scope.values[n.key], scope.treatBlankAs);
    case "unary": return -evalAst(n.arg, scope);
    case "binary": {
      const l = evalAst(n.left, scope), r = evalAst(n.right, scope);
      return applyBinOp(n.op, l, r);            // guards /0, %0 -> 0; see §9
    }
    case "call":  return applyFn(n.fn, n.args, scope);  // FN_TABLE[n.fn] only
    case "rowref": throw new CalcError("row ref outside aggregate"); // parse-caught
  }
}
```

`FN_TABLE` is a static record of named, hand-written implementations; `applyBinOp` is a `switch` over the allow-listed operators. There is no path from formula text to host capabilities. The parser additionally enforces a **max node count / max depth** to bound evaluation cost (DoS guard).

### 3.4 Recompute-on-change (client, UX)

On every keystroke/selection, the renderer calls `recomputeForm(fields, values)` (memoized). Recompute walks the topo `order`; for performance it recomputes only the **dirty subgraph** — the changed key plus its transitive dependents — and writes results back into the value map so dependent computed fields (e.g. `subtotal → grand_total`) cascade in one pass. Computed fields are **read-only** in the UI (no `onChange` from the user); their value is owned by the engine.

### 3.5 Recurring-pricing semantics

A `product` line (or a `calculation` flagged `priceKind: "recurring"`) carries an interval. Recompute therefore returns a **two-channel total**, not a scalar:

```typescript
interface PricingResult {
  oneTime: number;                 // sum of all one-time lines + one-time portion of recurring lines
  recurring: Array<{              // grouped by interval
    interval: "month" | "year";
    amount: number;               // recurring amount per interval
    label?: string;               // e.g. "first year, then $199/yr"
  }>;
}
```

The EZ model is the reference: Registered Agent / Worry-Free Compliance bill `$99` **first year** then `$199/yr` — the first-year `$99` lands in `oneTime`, while `{ interval: "year", amount: 199 }` lands in `recurring`. A `Total` field can be configured to show the one-time subtotal, the recurring schedule, or both. The downstream commerce action consumes both channels.

### 3.6 Cross-repeater-row aggregation

When an aggregate function's argument is a `{row.subKey}` reference, the evaluator resolves the **enclosing repeater** (the calculation field's `settings.repeaterKey`) and folds the sub-field across all current rows:

```typescript
// sum({row.line_total})  over repeater "items"
function aggregate(fn, rowKey, scope) {
  const rows = scope.repeaters[scope.repeaterKey] ?? [];   // array of row value maps
  const vals = rows.map((row) => toNumber(row[rowKey], scope.treatBlankAs));
  switch (fn) {
    case "sum":     return vals.reduce((a, b) => a + b, 0);
    case "min":     return vals.length ? Math.min(...vals) : 0;
    case "max":     return vals.length ? Math.max(...vals) : 0;
    case "count":   return vals.filter((v) => v !== 0).length;
    case "average": return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }
}
```

Rows added/removed mid-fill simply change the fold input; recompute reruns on the repeater's change event (§9).

---

## 4. Field Types Added

Both are registered into the engine catalog (Field Engine §4 lists `calculation` and `product` as "owned by other systems, registered into this catalog"). Neither is user-editable for its computed output.

| Type | Category | Value stored | Purpose |
|---|---|---|---|
| `calculation` | calculation | `number` | A derived number from a formula. Display-only. The general-purpose computed field (totals, derived values, scores). |
| `product` | calculation | `{ unitPrice, quantity, lineTotal, priceKind, interval? }` (JSON) | A priced line item: fixed/user-defined/calculated unit price × quantity, optionally recurring. Feeds pricing aggregation. |

A conventional **Total** is just a `calculation` field whose formula sums product lines (e.g. `sum({row.line_total}) + {state_fee} + {package_price}`) — there is no separate "total" type, matching Gravity Forms where Total is a product-field sub-type.

---

## 5. Data Model

**No new tables.** Everything rides the engine's existing schema (`specs/ConvexPress/systems/form-field-engine/PRD.md` §5):

- **Definition** lives in `fieldDefinitions.settings` (JSON) for a `calculation`/`product` field. The shape (Zod-validated at save):

```typescript
// calculationSettingsSchema (settings JSON on a `calculation` field)
const calculationSettingsSchema = z.object({
  computed: z.literal(true),
  formula: z.string().min(1),               // "{state_fee} + {package_price} + sum({row.line_total})"
  treatBlankAs: z.number().default(0),       // missing/hidden operand value
  repeaterKey: z.string().optional(),        // enclosing repeater for {row.*} aggregation
  priceKind: z.enum(["none", "oneTime", "recurring"]).default("none"),
  interval: z.enum(["month", "year"]).optional(),   // when recurring
  tables: z.record(z.string(), z.record(z.string(), z.number())).optional(), // lookup() tables, e.g. state fees
  numberFormat: z.object({
    style: z.enum(["decimal", "currency", "percent"]).default("decimal"),
    currency: z.string().default("USD"),
    decimals: z.number().int().min(0).max(4).default(2),
    thousandsSeparator: z.boolean().default(true),
    prefix: z.string().optional(),           // e.g. "$"
    suffix: z.string().optional(),           // e.g. "/yr"
  }).default({}),
});

// productSettingsSchema (settings JSON on a `product` field)
const productSettingsSchema = z.object({
  computed: z.literal(true),
  priceMode: z.enum(["fixed", "userDefined", "calculated"]),
  unitPrice: z.number().optional(),          // when fixed
  unitPriceFormula: z.string().optional(),   // when calculated
  quantityFieldKey: z.string().optional(),   // qty driven by another field; default 1
  priceKind: z.enum(["oneTime", "recurring"]).default("oneTime"),
  interval: z.enum(["month", "year"]).optional(),
  recurringLabel: z.string().optional(),     // "first year, then $199/yr"
  numberFormat: calculationSettingsSchema.shape.numberFormat,
});
```

- **Computed value** persists in `fieldValues` exactly like any other answer — `entityType: "form_submission"`, `entityId: <submissionId>`, `fieldKey`, `value` (JSON: a `number` for `calculation`, the line object for `product`). It is written **by the submit mutation after authoritative recompute**, never from the client payload (§8). Storing the computed value (rather than recomputing on read) freezes the price at submit time, which is the audit/receipt source of truth.

The submit path also persists a small **pricing summary** alongside the answers (one-time subtotal + recurring schedule) so the commerce action and confirmation screen read a single trusted object rather than re-walking the graph.

---

## 6. Routes

| Route | Path | App | Auth | Notes |
|---|---|---|---|---|
| Form builder edit | `/admin/forms/$formId/edit` | Admin | Administrator / Editor | Calculations are **authored here** — the `CalculationEditor` inspector panel renders for `calculation`/`product` fields on the builder canvas. |

This system owns **no public route**. Computed fields render inside the public form via the Form Renderer (`specs/ConvexPress/systems/form-renderer-system/PRD.md`); their display is part of that route, not a new one.

---

## 7. Actions / Events / Notifications

**None owned.** Calculation is a **field behavior**, not a user capability:

- **Actions:** none. Recompute is automatic (client) and an internal step of the submit mutation (server); it is not a user-invokable capability and registers nothing in `lib/plugins/registry.ts`.
- **Events:** none emitted. The submit event is owned by the Form Submission System; downstream consumers read the persisted pricing summary, not a calc-specific event.
- **Notifications:** none. Computed values become merge tags (e.g. `{total}`) for notifications owned by the Form Notification System (`specs/ConvexPress/systems/form-notification-system/PRD.md`).

This section is intentionally empty of owned items to keep the system a pure field-behavior extension.

---

## 8. Business Rules & Constraints

- **Server is authoritative for any value that drives money or commerce.** The client recompute is **UX only** — instant feedback as the user fills the form. At submit, the Form Submission mutation re-runs `recomputeForm` server-side over the validated input values and **overwrites** every computed field + the pricing summary. The client-sent computed values are ignored. The Commerce Action consumes only the server figure.
- **Reject circular references at save time.** `POST`/`PATCH` of a form definition runs `buildDependencyGraph`; if `cycles.length > 0`, the save is rejected with the offending field keys named (e.g. "`grand_total → subtotal → grand_total`"). A form can never be published with a cyclic graph.
- **Computed fields are read-only.** They never accept user input; the engine renders them display-only. A `product` field accepts only its quantity/option input, never its computed `lineTotal`.
- **Safe-eval is non-negotiable.** No formula ever reaches a dynamic JS execution path. CI guard: the `calc/` module must not import or reference `eval`/`Function`. Parser enforces node-count + depth caps.
- **Pure + dual-runtime.** The `calc/` core has no `window`, no Convex, no React imports — it runs unchanged in the browser and in the Convex mutation (mirrors Field Engine §8 "SSR-safe", "no admin coupling").
- **Money in integer minor units server-side.** Authoritative pricing is computed/stored in cents (matching the Checkout System's `unit_amount` convention) to avoid float drift; the display formatter divides for presentation.
- **Hidden operands are absent.** A field hidden by conditional logic contributes `treatBlankAs` (default `0`) — consistent with the Field Engine rule that a hidden field is not-required and its value is not submitted.

---

## 9. Edge Cases

| Scenario | Handling |
|---|---|
| Missing / empty operand | Resolves to `treatBlankAs` (default `0`); never `NaN` propagation. |
| Reference to a non-existent field key | Save-time validation error in the builder (unknown ref); at runtime resolves to `0` + marks the field with a non-throwing error badge. |
| Divide-by-zero / modulo-by-zero | `applyBinOp` returns `0` (not `Infinity`/`NaN`) and flags the line; configurable to "blank" per formula. |
| `NaN` from a non-numeric input | `toNumber()` coerces non-numeric → `treatBlankAs`; result is always a finite number. |
| Circular reference | Rejected at save (named cycle). Runtime fallback: offending nodes → `0`, error marker, renderer does not throw. |
| Repeater row added mid-fill | Aggregate refolds on the repeater change event; totals update live. |
| Repeater row removed mid-fill | Removed row drops out of the fold; `count`/`average` adjust; empty repeater ⇒ aggregates → `0`. |
| Recurring vs one-time mixed in one form | Two-channel result (§3.5): one-time lines + per-interval recurring buckets kept separate; never summed into one scalar. |
| Multiple recurring intervals (monthly + yearly) | Grouped into separate `recurring[]` buckets by interval; the commerce action creates the appropriate Stripe subscription items. |
| Formula too large / deeply nested | Parser rejects past node-count/depth caps (DoS guard) with a builder error. |
| Float rounding on currency | Server computes in integer cents; `round()` uses half-up; display formats from the integer. |
| Unknown field type at render (engine fallback) | Inherited from the engine — safe fallback, never throw (Field Engine §9). |

---

## 10. Worked Example — reproducing the EZ Entity Setup pricing

A form models the EZ signup: business state, package tier, and recurring add-ons, with a live grand total carrying a recurring line. Fields and `settings.formula`:

**Inputs**
- `state` — a `select` of US states.
- `package` — a `radio`: Starter / Advanced / Premium.
- `addon_registered_agent`, `addon_compliance` — `true_false` (recurring add-ons).
- `addon_ein` — `true_false` (one-time add-on).

**Lookup-driven derived fields** (`calculation`, using `lookup()` + a `tables` map):
- `state_fee` → `lookup({state}, "filingFees")` with `tables.filingFees = { "New York": 200, "Texas": 300, "Wyoming": 100, … }`.
- `package_price` → `lookup({package}, "packages")` with `tables.packages = { "Starter": 0, "Advanced": 249, "Premium": 399 }`.

**Product lines** (`product`, `priceKind: "recurring"`, `interval: "year"`, `recurringLabel: "first year, then $199/yr"`):
- `line_registered_agent` → `priceMode: "calculated"`, `unitPriceFormula: "if({addon_registered_agent}, 99, 0)"`, recurring `$199/yr`.
- `line_compliance` → same shape, `$99` first year then `$199/yr`.

**One-time product line:**
- `line_ein` → `if({addon_ein}, 99, 0)`, `priceKind: "oneTime"`.

**Totals** (`calculation`):
- `subtotal_one_time` → `{state_fee} + {package_price} + sum({row.first_year_amount})` *(or, without a repeater, the explicit sum of one-time lines)* — the first-year cash due today.
- `recurring_yearly` → `if({addon_registered_agent}, 199, 0) + if({addon_compliance}, 199, 0)` — the per-year recurring, `numberFormat.suffix = "/yr"`.

**Concrete run** — New York, Advanced package, Registered Agent + Worry-Free Compliance + EIN:

| Line | One-time (today) | Recurring |
|---|---|---|
| State filing fee (NY) | `$200` | — |
| Advanced package | `$249` | — |
| Registered Agent | `$99` (first year) | `$199 / year` |
| Worry-Free Compliance | `$99` (first year) | `$199 / year` |
| EIN | `$99` | — |
| **Subtotal (due today)** | **`$746`** | |
| **Recurring** | | **`$398 / year`** (renews after year 1) |

The dependency graph evaluates `state_fee`, `package_price`, and the `line_*` fields first (sources → computed), then `subtotal_one_time` and `recurring_yearly` (which depend on them). The client shows `$746 due today, then $398/yr` live as boxes are checked. At submit, the server re-derives the same `PricingResult` ( `{ oneTime: 74600, recurring: [{ interval: "year", amount: 39800, label: "renews after year 1" }] }` in cents) and the Commerce Action builds a Stripe charge for `$746` + a `$398/yr` subscription starting next year. The **smart upsell** (e.g. "Premium already includes these add-ons — save $X") is a `calculation` comparing `subtotal_one_time` against an alternate-package formula and surfacing the delta — the same logic as `detectUpsellOpportunity` in the EZ engine, expressed as a formula instead of bespoke code.

---

## 11. Implementation Checklist

**Phase 1 — formula core (pure, dual-runtime)**
- [ ] `grammar.ts`: node union, operator precedence table, function allow-list.
- [ ] `parse.ts`: tokenizer + Pratt parser → AST; `{field_key}` and `{row.x}` leaves; node-count/depth caps; friendly parse errors.
- [ ] `evaluate.ts`: AST walker, `applyBinOp` (guards /0, %0), `FN_TABLE`, `toNumber` coercion.
- [ ] `format.ts`: currency/decimal/percent display from integer minor units.
- [ ] CI guard: `calc/` imports no `eval`/`Function`, no `window`, no Convex, no React.
- [ ] Unit tests incl. the EZ worked example and every §9 edge case.

**Phase 2 — graph + recompute**
- [ ] `graph.ts`: `buildDependencyGraph`, Kahn topo sort, `collectRefs`, `findCycles`.
- [ ] `recompute.ts`: full + dirty-subgraph recompute; two-channel `PricingResult`; repeater aggregation.
- [ ] Save-time validation: reject unknown refs + cyclic graphs with named cycle.

**Phase 3 — engine registration + builder UI**
- [ ] Register `calculation` + `product` via `registerFieldType` (additive; no engine edits).
- [ ] `CalculationField` / `ProductField` renderers (read-only output; product qty/option input).
- [ ] `CalculationEditor` inspector: formula textarea, `{field}` token inserter, function helper, live validate + cycle warning, number-format controls, lookup-table editor.

**Phase 4 — authoritative server recompute**
- [ ] Hook `recomputeForm` into the Form Submission mutation; overwrite computed `fieldValues`; persist the pricing summary (cents).
- [ ] Expose the trusted `PricingResult` to the Commerce Action; verify against a client/server mismatch test (tampered client value is ignored).

---

## 12. Open Questions

- **Core home:** ship the `calc/` module inside `@convexpress/field-engine` (so both hosts get it free, alongside `validate.ts`/`conditional-logic.ts`) vs. a sibling `@convexpress/form-calc` package the Forms extension owns. Default: inside the engine package as a `calc/` subpath, since the engine already owns the dual-runtime pure-function boundary. Revisit if a non-Forms host wants calculations without the renderer set.
- **Lookup tables — inline vs. referenced:** small tables (per-state fees) live inline in `settings.tables`; large/shared tables (a full 50-state fee table reused across forms) may warrant a referenced source. Inline for v1; add a `tableRef` indirection later if duplication appears.
- **Currency math granularity:** integer cents covers USD-style 2-decimal currencies; zero-decimal (JPY) and 3-decimal currencies need the formatter's `decimals` to drive the minor-unit scale. Default to 2; generalize when multi-currency forms appear.
- **Proration / trials on recurring lines:** the EZ model is "first year flat, then $X/yr" (no proration). Stripe-side proration/trial config is the Commerce Action's concern; this system only emits interval + amount + label.

---

## 13. Cross-References

- Host: Form Field Engine PRD (`specs/ConvexPress/systems/form-field-engine/PRD.md`)
- Authoring surface: Form Builder System PRD (`specs/ConvexPress/systems/form-builder-system/PRD.md`)
- Runtime surface: Form Renderer System PRD (`specs/ConvexPress/systems/form-renderer-system/PRD.md`)
- Consumer (money): Form Commerce / Subscription Action PRD (`specs/ConvexPress/systems/form-commerce-subscription-action/PRD.md`)
- Persistence: Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`)
- Reference engine: `EZ-Entity-Setup/ez-website/apps/web/src/lib/order-form/pricing.ts`
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Calculation & Pricing System · **Plugin:** ConvexPress Forms (v2) · **Airtable:** Content & Marketing / Full Stack / Epic / P2 - Medium
