# PRD: Shipping Method — Table Rate (B6)

**System ID:** shipping-method-table-rate
**Layer:** B (Shipping Method Type)
**Status:** Draft — Production Target
**Owner:** Commerce / Shipping Subsystem
**Depends On:** A1 Zones, A2 Classes, A3 Packages, A6 Rules Engine, A7 Pipeline
**Reuses:** B1 Flat, B2 Weight, B3 Dimensional, B4 Price, B5 Quantity (cost formula modes)
**Last Updated:** 2026-04-14

---

## 1. Context & Intent

### 1.1 The "Big One"

Table Rate Shipping is **the** shipping method that keeps merchants on an e-commerce platform. In the WooCommerce ecosystem, the paid "Table Rate Shipping" plugin is the single most common reason a merchant cannot migrate away from WooCommerce — because no other built-in method lets them express the kind of multi-dimensional, conditional, priority-ordered rate logic that real-world fulfillment demands.

ConvexPress Table Rate (B6) is the answer to that gap. It is the method that replaces entire *stacks* of simpler methods. Where a merchant might previously configure:

- B1 Flat Rate for baseline shipping
- B2 Weight-Based for heavy orders
- B4 Price-Based for free-shipping thresholds
- B5 Quantity-Based for bulk discounts
- Custom per-zone overrides for each of the above

…Table Rate collapses all of this into **one method, one method definition, one admin screen**. Every pricing formula expressible by B1–B5 is expressible as a single row inside a Table Rate table. Every condition expressible by A6 Rules Engine is usable as a row gate. The merchant stops juggling five methods and starts authoring one rate table.

### 1.2 Why This Method Exists

This method is explicitly designed to meet three classes of merchant need that no simpler method can satisfy:

1. **Multi-dimensional pricing.** "Under 5lb *and* US-West *and* not fragile → $8. 5–10lb *or* contains fragile → $18." Every other method in B1–B5 pivots on a single dimension (weight, price, quantity). Table Rate pivots on arbitrary combinations.
2. **Priority-ordered fallbacks.** "Try the heavy-freight rate first, then the small-parcel rate, then the flat default." A rate table is an ordered decision list, not a flat lookup.
3. **Per-row mixed formulas.** One row charges flat ($15), another charges per-pound ($0.50/lb + $5 base), another charges a percentage of subtotal (3%), another charges per-item ($2/item capped at $20). Every row picks its own cost-computation mode.

### 1.3 Intent

Intent of this system, in priority order:

1. **100% coverage of WooCommerce Table Rate Shipping use cases.** Every plugin recipe from the WooCommerce documentation corpus must be expressible in this system.
2. **Admin-first.** No scripting. No code. No plugins. A merchant with zero development experience must be able to author a 30-row rate table through the admin UI in under 20 minutes.
3. **Deterministic.** Given a cart and a rate table, the result is fully reproducible. No randomness, no floating precedence.
4. **Auditable.** Every rate quote must be traceable: which row matched, what the condition AST evaluated to, what the formula produced, what the final cost was.
5. **Performant.** A 100-row table must evaluate in under 50ms against a typical cart.

### 1.4 Relationship to the Rest of Layer B

Table Rate is the **biggest consumer of A6 Rules Engine** in the entire commerce subsystem. Where B1–B5 use A6 Rules Engine only as an outer gate (a single rule that decides whether the method is available), B6 uses A6 on **every row**. A 50-row table evaluates 50 rule ASTs per quote. This makes B6 also the **stress-test customer** of A6 — performance and caching decisions in A6 are driven by B6's workload.

Table Rate is **not** a replacement for B1–B5. Those methods remain first-class citizens for merchants who want simpler UX. Table Rate is the escape hatch for complexity that simpler methods cannot express.

---

## 2. Scope

### 2.1 In Scope

- A new method type `table_rate` registered with the A7 Pipeline.
- A new table `commerce_shipping_method_table_rate` that stores one row per method instance, with an embedded `rows` array holding the rate table itself.
- A per-row condition AST (JSON, authored by the A6 Rules Engine RuleBuilder component).
- A per-row cost formula with four modes: `flat`, `per_weight`, `per_item`, `per_subtotal`.
- Three match modes: `first_match` (priority-ordered, first winner), `all_matches_sum` (sum costs of every matching row), `cheapest_match` (return the lowest cost of all matching rows).
- Integer priority on each row for deterministic ordering.
- Per-row `enabled` toggle for temporary disablement without deletion.
- Per-row `label` override that can replace the method's default label at checkout (so the customer sees the row's context, e.g., "Heavy Freight — 10lb+").
- Outer `ruleId` (standard across all Layer B methods) that gates whether the entire method is even considered.
- Admin UI: a spreadsheet-like editor where rows can be added, reordered by drag, duplicated, enabled/disabled, and filtered.
- Per-row RuleBuilder (reuses the A6 component).
- Per-row cost formula builder (four modes).
- Bulk import/export of rate tables as CSV.
- Row preview: given a sample cart, show which rows match and what each would cost.
- Events: standard `shipping.method.*` plus `shipping.table_rate.matched` with the matched row ID for debugging.

### 2.2 Out of Scope

- **Scripting.** No JavaScript, no expression strings, no eval. All conditions must be authored as A6 Rules Engine AST. Merchants who need logic beyond the AST must either extend the AST (handled in A6) or fall through to carrier-calculated rates.
- **Per-row package splitting.** Package splitting is owned by A3 Packages and happens before B6 is called. A rate table row does not re-split packages.
- **Per-row currency.** A single method instance operates in a single currency (the store's currency). Multi-currency stores instantiate Table Rate once per currency.
- **Carrier integration.** Table Rate is a *computed* method. Live carrier rates are a separate method type (future B7 Carrier-Calculated, not covered here).
- **Time-based conditions inside a row.** "Only on Tuesdays" is expressible via A6 Rules Engine predicates, not as a Table Rate-specific feature. If A6 does not support time predicates, that is an A6 gap, not a B6 gap.
- **Per-row rate negotiation / dynamic cost.** Row costs are deterministic functions of cart context. They do not call external APIs.
- **Row-level discounts.** Free shipping thresholds are expressed as rows that compute cost = 0. There is no separate discount mechanism.

### 2.3 Non-Goals

- This system is not a rules engine. It is a **consumer** of A6 Rules Engine. It adds table-shaped configuration on top of A6's predicate language.
- This system is not a pricing engine. It produces a single shipping cost per quote; it does not touch cart discounts, tax, or other pricing.
- This system is not a zone manager. Zone membership is determined by A1; Table Rate is instantiated per zone.

---

## 3. Dependencies

### 3.1 Upstream (this system requires)

| Dependency | Used For |
|---|---|
| **A1 Zones** | Every Table Rate method instance is scoped to a zone. The zone determines which destinations can reach this method. |
| **A2 Shipping Classes** | Row conditions can reference shipping class membership of cart items (e.g., "contains class = fragile"). |
| **A3 Packages** | The cart context passed to Table Rate is already packaged by A3. Row conditions operate on a packaged cart. |
| **A6 Rules Engine** | Every row's `conditionAST` is an A6 rule AST. The outer `ruleId` is also an A6 rule. The admin UI embeds the A6 RuleBuilder component. |
| **A7 Pipeline** | Registers `table_rate` as a method type. Invokes the method handler during the quote phase. |

### 3.2 Downstream (this system enables)

| Consumer | Consumes |
|---|---|
| Checkout quote flow | The computed cost and label returned by Table Rate. |
| Admin shipping dashboard | Per-method statistics (rows, matches, average cost). |
| Audit log system | `shipping.table_rate.matched` events for debugging merchant-reported issues. |
| Analytics | Row-match frequency, enabling merchants to identify dead rows. |

### 3.3 Cross-References to Reused Layer B Logic

Table Rate's cost formula modes **reuse the computation logic** from simpler methods (not the schema, not the UI, but the math):

- `flat` mode mirrors **B1 Flat Rate**.
- `per_weight` mode mirrors **B2 Weight-Based**.
- `per_item` mode mirrors **B5 Quantity-Based**.
- `per_subtotal` mode is a percentage-of-subtotal formula (conceptually similar to **B4 Price-Based** but as a continuous function rather than a tier lookup).
- **B3 Dimensional** is not directly a cost mode — dimensional weight is a property of the *cart context* (computed by A3 Packages) that row conditions can read.

The shared math library (`convex/shipping/formulas.ts`) exposes each formula as a pure function. B1–B5 and B6 all call into it.

---

## 4. Schema

### 4.1 New Table: `commerce_shipping_method_table_rate`

Defined in `convex/schema/shipping.ts` alongside the other Layer B method tables.

**Fields:**

| Field | Type | Description |
|---|---|---|
| `_id` | `Id<"commerce_shipping_method_table_rate">` | Primary key. |
| `_creationTime` | `number` | Convex-managed. |
| `zoneId` | `Id<"commerce_shipping_zones">` | Which zone this method instance serves (from A1). |
| `name` | `string` | Internal name for merchant reference. Required. |
| `label` | `string` | Default customer-facing label. May be overridden per row. Required. |
| `matchMode` | `enum("first_match", "all_matches_sum", "cheapest_match")` | How multiple matches are resolved. Default `first_match`. |
| `rows` | `array<TableRateRow>` | The rate table itself. See 4.2. |
| `enabled` | `boolean` | Whether the method is active. If false, A7 Pipeline skips it. |
| `sortOrder` | `number` | Display order among methods available in the same zone. |
| `ruleId` | `Id<"commerce_shipping_rules"> \| null` | Outer gate. If set and evaluates false against cart context, the whole method is skipped before any row is evaluated. |
| `currency` | `string` (ISO 4217) | Operating currency. |
| `taxStatus` | `enum("taxable", "none")` | Whether the computed cost is taxable. Mirrors other Layer B methods. |
| `createdBy` | `Id<"users">` | Audit trail. |
| `updatedAt` | `number` | Last modification timestamp. |
| `updatedBy` | `Id<"users">` | Last modifier. |

**Indexes:**

- `by_zone` on `["zoneId"]` — primary lookup during quote.
- `by_zone_enabled` on `["zoneId", "enabled"]` — quote-time filter.
- `by_rule` on `["ruleId"]` — for rule-impact analysis (when a rule changes, which methods are affected).

### 4.2 Embedded Type: `TableRateRow`

Each row in the `rows` array:

| Field | Type | Description |
|---|---|---|
| `id` | `string` (nanoid) | Stable row identifier for events, analytics, audit. Not a Convex `Id` — these rows are embedded, not a separate table. |
| `priority` | `number` (integer) | Ordering key. Lower numbers evaluate first. Ties broken by array position. |
| `conditionAST` | `object` (A6 rule AST JSON) | The predicate that gates this row. `null` is not allowed — use an "always true" AST for a catch-all row. |
| `costFormula` | `CostFormula` | How cost is computed if this row matches. See 4.3. |
| `label` | `string \| null` | Optional customer-facing label override. If null, the method's default label is used. |
| `enabled` | `boolean` | Per-row kill switch. If false, the row is skipped as if it didn't exist. |
| `notes` | `string \| null` | Merchant-only note for the row (e.g., "Heavy freight carrier fallback — 2024 rate card"). |

**Constraints:**

- Row `id` is unique within the method's `rows` array.
- `priority` is an integer; the UI normalizes user reordering to evenly spaced integers (10, 20, 30…) so new rows can slot between.
- `rows` array is capped at 500 entries per method (see §10 Edge Cases).

### 4.3 Embedded Type: `CostFormula`

| Field | Type | Description |
|---|---|---|
| `mode` | `enum("flat", "per_weight", "per_item", "per_subtotal")` | Which formula to apply. |
| `baseCost` | `number` | Fixed amount added regardless of units. Can be zero. |
| `perUnitCost` | `number` | Amount per unit (unit meaning depends on mode). Can be zero. |
| `unitCap` | `number \| null` | Maximum number of units to charge for. If set, caps `perUnitCost × units`. |
| `minCost` | `number \| null` | Floor. If computed cost is below this, returns `minCost`. |
| `maxCost` | `number \| null` | Ceiling. If computed cost exceeds this, returns `maxCost`. |

**Semantics per mode:**

- `flat`: cost = `baseCost`. `perUnitCost` and `unitCap` ignored.
- `per_weight`: cost = `baseCost + perUnitCost × min(weight, unitCap ?? weight)`. Weight is in the store's configured unit (lb or kg).
- `per_item`: cost = `baseCost + perUnitCost × min(itemCount, unitCap ?? itemCount)`.
- `per_subtotal`: cost = `baseCost + perUnitCost × (subtotal / 100)` (i.e., `perUnitCost` is a percentage). `unitCap` is treated as a max subtotal dollar amount.
- After any formula, `minCost` and `maxCost` are applied as a final clamp.

### 4.4 Schema Invariants

Enforced by the mutation layer, not by Convex's type system:

1. At least one row with an "always true" condition is **recommended** (not required) as a catch-all. The UI warns if absent.
2. `priority` values must be unique within a method (UI enforces by auto-renumbering on save).
3. `currency` cannot change once the method has been used in a completed order (prevents retroactive currency shifts).
4. `rows.length <= 500`.
5. Row `conditionAST` must be a valid A6 rule AST (validated via A6's schema validator at write time).

---

## 5. Data Model & Evaluation Semantics

### 5.1 Inputs to Evaluation

At quote time, A7 Pipeline hands the method handler the following context:

- **Cart context**: line items, quantities, subtotal, total weight, item count, shipping class membership, dimensional weight (from A3), customer tags, coupon codes applied, destination address.
- **Zone**: the resolved A1 zone (already matched to destination).
- **Package**: the specific A3 package being quoted (if the cart was split across multiple packages, the handler is called once per package).

### 5.2 Evaluation Order

```
1. Is method.enabled? If no → return null (method unavailable).
2. Is method.ruleId set? If yes, evaluate it against cart context.
   - If false → return null (method unavailable).
3. Filter rows where row.enabled === true.
4. Sort rows by priority ascending, then by array index for ties.
5. For each row in sorted order:
   a. Evaluate row.conditionAST against cart context via A6.
   b. If true → this row is a "match". Compute cost from row.costFormula.
6. Resolve matches by matchMode:
   - first_match: take the first (lowest-priority-number) match. Return its cost and label.
   - all_matches_sum: sum costs of ALL matches. Return sum + the label of the highest-priority matching row (or a merged label if multiple; see §9).
   - cheapest_match: of all matches, return the one with the lowest computed cost.
7. If zero matches → return null (method unavailable for this cart).
8. Fire `shipping.table_rate.matched` event with matched row ID(s) and final cost.
9. Return { methodId, label, cost, taxStatus, currency, metadata: { matchedRowIds } }.
```

### 5.3 Cost Computation Deep Dive

Cost computation is a pure function: `(CostFormula, CartContext) → number`.

For each mode, the handler reads the appropriate dimension from `CartContext`:

- `flat`: reads nothing; returns `baseCost`.
- `per_weight`: reads `cartContext.totalWeight` (in the method's unit system, already normalized by A3).
- `per_item`: reads `cartContext.itemCount` (sum of quantities across all line items).
- `per_subtotal`: reads `cartContext.subtotal` (pre-tax, pre-shipping, post-discount).

The unit definitions are **deliberately stable** and must match those used in B2, B5, B4. Changing them is a breaking change across all Layer B methods.

### 5.4 Match Mode Semantics

**`first_match`** (default, safest, WooCommerce parity):
- Deterministic. Highest-priority (lowest `priority` integer) matching row wins.
- Use case: overlapping rules where more specific rules should win over general fallbacks.
- Example: Row 1 (priority 10): "weight > 10lb AND zone = US-West" → $30. Row 2 (priority 100): "always true" → $10. A 12lb cart in US-West gets $30; a 12lb cart in US-East gets $10.

**`all_matches_sum`**:
- Every matching row contributes its cost; the final shipping cost is the sum.
- Use case: stackable surcharges. "Base rate $10" + "+$5 if contains fragile" + "+$15 if remote area".
- Warning: order of rows is irrelevant to the sum, but matters for the label (see §9).

**`cheapest_match`**:
- Every row is evaluated; the lowest computed cost among matches wins.
- Use case: merchant-biased discounts. "Customer gets the best available rate regardless of which rule triggered it."
- Guards against priority ordering errors — merchant doesn't need to carefully sequence rows.

### 5.5 Determinism Guarantees

Given identical inputs (cart snapshot + rate table snapshot), the same match result must be produced every time. This requires:

1. A6 Rules Engine evaluation is deterministic (guaranteed by A6).
2. Priority ordering is fully specified (priority int, then array index).
3. Cost formulas are pure arithmetic.
4. No time-of-day, no randomness, no external API calls during evaluation.

This determinism is **tested** (see §11) via snapshot tests: a cart + table combination produces the same quote hash across runs.

---

## 6. Functions & API

All functions live under `convex/shipping/methods/tableRate.ts` (handler) and `convex/shipping/tableRate/` (admin CRUD).

### 6.1 Public Mutations (admin-only, gated by `admin.shipping.methods.manage`)

| Function | Purpose |
|---|---|
| `tableRate.create` | Create a new Table Rate method instance in a zone. Requires `zoneId`, `name`, `label`, `currency`, initial `matchMode`. Starts with an empty `rows` array. |
| `tableRate.update` | Update method-level fields: `name`, `label`, `matchMode`, `enabled`, `sortOrder`, `ruleId`, `taxStatus`. Does not modify `rows`. |
| `tableRate.delete` | Soft-delete (sets `enabled = false` and flags for cleanup) or hard-delete if no historical orders reference this method. |
| `tableRate.duplicate` | Clone an existing method including all rows into the same or different zone. |
| `tableRate.addRow` | Append a new row. Requires at minimum `conditionAST` and `costFormula`. Assigns next priority (max existing + 10). |
| `tableRate.updateRow` | Update a single row by `row.id`. |
| `tableRate.deleteRow` | Remove a row by `row.id`. |
| `tableRate.reorderRows` | Bulk update priorities. Accepts array of `{ rowId, priority }`. Validates uniqueness, then persists. |
| `tableRate.duplicateRow` | Clone a row with a new `id` and `priority = original + 1` (renumbered on next reorder). |
| `tableRate.toggleRow` | Flip `row.enabled`. |
| `tableRate.replaceRows` | Wholesale replacement of `rows` array. Used by CSV import after validation. |

### 6.2 Public Queries

| Function | Purpose |
|---|---|
| `tableRate.get` | Fetch a method instance by ID. |
| `tableRate.listByZone` | All Table Rate methods in a zone, sorted by `sortOrder`. |
| `tableRate.preview` | Dry-run: takes a method ID and a sample cart payload; returns which rows matched, each row's computed cost, and the final quote the match mode would produce. **Does not fire events.** Used by the admin row preview UI. |

### 6.3 Internal Functions (pipeline & system-to-system)

| Function | Purpose |
|---|---|
| `calculateTableRate(ctx, method, cart)` | The core handler. Takes a method record and a cart context, returns a quote or null. Called by A7 Pipeline. |
| `evaluateRows(ctx, rows, cart)` | Internal helper. Returns the list of matching rows (after condition AST evaluation), in priority order. |
| `computeFormula(formula, cart)` | Pure function. Given a cost formula and cart context, returns a number. No side effects. |
| `resolveMatches(matches, mode)` | Given matching rows and their computed costs, apply match mode to select the final cost and label. |
| `validateCSVImport(csv)` | Parses CSV, validates schema, returns either a `rows` array or a list of row-level errors. |
| `serializeToCSV(rows)` | Inverse of the above. Used by export. |

### 6.4 Event-Emitting Points

- `shipping.method.created` / `shipping.method.updated` / `shipping.method.deleted` — shared across all Layer B methods (emitted by the CRUD mutations).
- `shipping.method.quoted` — emitted by A7 Pipeline wrapping the handler; not specific to Table Rate.
- `shipping.table_rate.matched` — Table Rate-specific. Payload includes `methodId`, `matchedRowIds` (array, plural for `all_matches_sum` and `cheapest_match`), `matchMode`, `computedCost`, `cartSnapshotHash`.
- `shipping.table_rate.no_match` — Table Rate-specific. Emitted when zero rows match a cart and the method returns null. Useful for diagnosing "why isn't shipping showing up" merchant reports.

### 6.5 Capability Gates

All write operations require `admin.shipping.methods.manage` (see §13).
`tableRate.preview` requires `admin.shipping.methods.read`.
`tableRate.listByZone` requires `admin.shipping.methods.read`.

---

## 7. Admin UX

The admin UI is where Table Rate's "big one" reputation is earned or lost. This is a power-user tool, but it must remain legible to merchants who are not developers.

### 7.1 Location

Full-page route (per ConvexPress's "no popups for content management" rule):
- `/admin/commerce/shipping/zones/:zoneId/methods/:methodId/edit` — when editing a Table Rate method.
- `/admin/commerce/shipping/zones/:zoneId/methods/new?type=table_rate` — creating.

### 7.2 Editor Component: `TableRateEditor.tsx`

Located at `apps/web/src/components/shipping/TableRateEditor.tsx`. Three panes top-to-bottom:

1. **Method Header Pane** — name, label, match mode, enabled toggle, outer rule dropdown, currency badge, tax status toggle.
2. **Rows Pane** — the spreadsheet-like table of rows. This is the core of the UI.
3. **Preview Pane** — a sample-cart input form that runs `tableRate.preview` and displays which rows match.

### 7.3 Rows Pane — The Spreadsheet Experience

Each row is a horizontally-scrolling data row with the following cells:

| Column | Content |
|---|---|
| Drag handle | Vertical drag to reorder (changes `priority`). |
| Priority | Numeric, editable. Auto-renumbered on save. |
| Condition | A compact visual summary of the row's `conditionAST`, generated by A6's RuleSummary component. Click to open the full RuleBuilder. |
| Formula | A compact summary: "Flat $15" or "$0.50/lb + $5 base, cap 50lb". Click to open the formula builder. |
| Label | Inline text input. Defaults to showing `(method default)` placeholder if null. |
| Enabled | Toggle switch. |
| Actions | Duplicate, delete, notes icon (click to reveal `notes` textarea). |

**Row operations:**

- **Add row**: button at the bottom adds a blank row with "always true" condition, `flat` formula with $0 base, enabled. Priority = max + 10.
- **Drag to reorder**: reorders visually and updates priority values. Debounced save.
- **Bulk actions**: checkboxes on each row; bulk enable/disable/delete.
- **Filter**: a search box that filters rows by label, notes, or condition summary text.
- **Sort**: click column headers to sort (but the persisted order is priority; this is view-only).

### 7.4 Row Condition Editor (Modal-Free)

When the merchant clicks the condition cell, a right-side panel slides in (not a modal; the Rows Pane remains visible). This panel embeds the **A6 RuleBuilder** component in "inline" mode. The RuleBuilder exposes all A6 predicates:

- Weight comparisons
- Price/subtotal comparisons
- Item count comparisons
- Shipping class membership
- Destination predicates (country, state, postal code, zone membership)
- Customer tag membership
- Coupon presence
- AND/OR/NOT combinators

The merchant composes an AST using the RuleBuilder's drag-and-drop + dropdown UX. The AST is written to `row.conditionAST` on save.

### 7.5 Row Formula Editor

When the merchant clicks the formula cell, a similar right-side panel slides in with:

- **Mode selector**: radio group for `flat` / `per_weight` / `per_item` / `per_subtotal`.
- **Base cost**: numeric input with currency badge.
- **Per-unit cost**: numeric input with unit badge (`/lb`, `/item`, `%`).
- **Unit cap**: optional numeric input.
- **Min cost / max cost**: optional numeric inputs.
- **Live preview**: shows the formula as a human-readable sentence ("Charge $5 base plus $0.50 per pound, up to 50 pounds") as the merchant types.

### 7.6 Preview Pane

Below the rows, a "Preview Against Sample Cart" card. Form fields:

- Destination (autocomplete to country/state/postal code)
- Subtotal
- Weight
- Item count
- Shipping classes present (multi-select from A2)
- Customer tags (multi-select)
- Coupon applied (optional)

Click "Run Preview". The UI calls `tableRate.preview` and displays:

- For every row: match/no-match indicator with a diff-style rendering of why.
- For matching rows: the computed cost.
- The match-mode-resolved final quote.
- The time taken to evaluate (for performance sanity checks).

This is the single most important admin-experience feature. It lets merchants verify their rate table without creating test orders.

### 7.7 Bulk Import / Export (CSV)

**Export:**
- Button in the method header: "Export rows as CSV".
- Columns: `priority`, `condition_summary` (human-readable, not round-trippable), `condition_json` (the AST, machine round-trippable), `mode`, `base_cost`, `per_unit_cost`, `unit_cap`, `min_cost`, `max_cost`, `label`, `enabled`, `notes`.

**Import:**
- Button: "Import rows from CSV".
- Drops a file-picker; parses; validates every row via `validateCSVImport`.
- **Validation results screen**: shows a per-row pass/fail list. Merchant sees errors like "Row 12: condition_json is not valid A6 AST" or "Row 34: unit_cap must be a positive number".
- On success, the merchant picks one of: **replace all rows** / **append to existing rows**.
- Never silently clobbers. Confirmation required on replace.

### 7.8 Inline Warnings and Guardrails

The editor surfaces warnings when:

- No row has an "always true" condition (the method will return null for non-matching carts — sometimes intentional, often a bug).
- A row is unreachable because an earlier row with a superset condition has higher priority (static analysis, best-effort).
- Match mode is `all_matches_sum` and rows have wildly disparate costs (risk of huge accidental sums).
- More than 100 rows exist (performance advisory).
- A row's condition references a zone that isn't this method's `zoneId` (harmless but suspicious).

Warnings are non-blocking. Errors (invalid AST, negative costs where positive required) are blocking.

---

## 8. Merchant Workflow

Concrete walkthrough of the canonical use case.

### 8.1 "Set up tiered rates by weight and destination"

Scenario: *Flat $10 for under 5lb US, $20 for 5–10lb US, $30 for 10+lb US, $50 for international.*

**Step 1: Create the method.**
1. Navigate to `/admin/commerce/shipping/zones`.
2. Select or create the US zone.
3. Click "Add method" → choose type "Table Rate".
4. Fill in: name = "US Tiered", label = "Standard Shipping", match mode = `first_match`, currency = USD.
5. Save. Now on the editor screen with zero rows.

**Step 2: Build the three US tiers.**

Row 1:
- Priority: 10
- Condition: `weight < 5 lb`
- Formula: `flat $10`
- Label: (uses method default)
- Enabled: yes

Row 2:
- Priority: 20
- Condition: `weight >= 5 lb AND weight < 10 lb`
- Formula: `flat $20`

Row 3:
- Priority: 30
- Condition: `weight >= 10 lb`
- Formula: `flat $30`

**Step 3: International tier.**

The US zone (A1) may or may not include international destinations. If the merchant's zone strategy scopes this method to US-only, they create a second Table Rate method in the International zone:

Row 1:
- Priority: 10
- Condition: `always true`
- Formula: `flat $50`
- Label: "International Shipping"

Alternative: a single Table Rate method in a "Worldwide" zone with four rows, using destination predicates in conditions.

**Step 4: Verify.**

In the Preview Pane:
- Cart: 3lb, US address → should match Row 1, $10. Verify.
- Cart: 7lb, US address → should match Row 2, $20. Verify.
- Cart: 12lb, US address → should match Row 3, $30. Verify.

**Step 5: Enable the method.**

Toggle the method header's `enabled` switch.

### 8.2 "Add a fragile surcharge"

Extends the scenario: *Add $15 if the cart contains any item in the `fragile` shipping class, on top of the regular tier.*

This requires changing the method's match mode to `all_matches_sum`, OR adding the surcharge into each tier's condition.

**Clean approach (match mode = `all_matches_sum`):**

Keep the three tier rows. Add a fourth row:
- Priority: 40
- Condition: `cart contains class = fragile`
- Formula: `flat $15`
- Label: "Fragile Handling"

Switch method `matchMode` to `all_matches_sum`.

Now a 7lb cart with fragile items → Row 2 ($20) + Row 4 ($15) = $35.

### 8.3 "B2B customers get a different table"

Scenario: *Wholesale customers (tagged `b2b`) get free shipping over $500 and flat $5 otherwise. Regular customers see the tiered table.*

**Approach:**

Create two Table Rate methods in the same zone:

Method A ("Retail Rates"):
- Outer ruleId: `customer.tag NOT contains "b2b"` (from A6)
- Rows: the three tiers from §8.1.

Method B ("Wholesale Rates"):
- Outer ruleId: `customer.tag contains "b2b"`
- Rows:
  - Priority 10: `subtotal >= 500` → `flat $0`
  - Priority 20: `always true` → `flat $5`

Retail customers never see Method B (outer rule blocks it) and vice versa.

### 8.4 "Cheapest-rate guarantee"

Scenario: *Give the customer the cheapest rate across multiple overlapping rules, whichever wins.*

Set `matchMode = cheapest_match`. Add rows with overlapping conditions; the system picks the row that produces the lowest cost for the given cart. Merchant doesn't have to worry about priority order.

---

## 9. Storefront UX

### 9.1 What the Customer Sees

The customer sees a single shipping option per available method per package. Table Rate presents as one line item in the shipping options list (just like any other method). The customer does not see rows, conditions, or match modes — those are implementation details.

Displayed fields:
- **Label**: Either the method's `label` or, if the matching row has a `label` override, the row's label. For `all_matches_sum` with multiple matching rows, the label of the **highest-priority matching row** is used (or a merged label if more than one row has an override — concatenated with " + ").
- **Cost**: The final computed cost in the method's currency, formatted by the storefront locale.
- **Estimated delivery**: Not a Table Rate concern; owned by carrier integrations if present.

### 9.2 Label Override Examples

- Method default label: "Standard Shipping"
- Row 4 has label override: "Fragile Handling"
- `first_match` mode, Row 4 wins → customer sees "Fragile Handling".
- `all_matches_sum` mode, Row 2 (no override) and Row 4 match → customer sees "Standard Shipping + Fragile Handling" OR just "Standard Shipping" depending on the merchant's configured label-merge preference (a method-level setting, `labelMergeStrategy: "highest" | "concat"`, default `highest`).

### 9.3 When No Rows Match

If zero rows match and the method is the only one available for the zone, the customer sees **no shipping options available** for that zone — typically surfaced by checkout as an error asking them to contact the merchant. This is a supported state; see §10.1.

### 9.4 Transparency vs. Opacity

Merchants may optionally enable a debug label (admin-only preview) showing which row matched. This is **never** shown to customers — it's an admin-side preview feature inside the checkout preview tool.

---

## 10. Edge Cases

### 10.1 Zero Rows Match

**Behavior:** Method returns null. A7 Pipeline treats this as "method unavailable." If no other method is available in the zone, the customer sees a shipping error.

**Event:** `shipping.table_rate.no_match` fires with cart snapshot and method ID.

**Admin UX:** Warning shown in editor if no catch-all row exists.

### 10.2 Multiple Rows Match in `first_match` Mode

Highest-priority (lowest `priority` integer) row wins. Ties (same `priority`) are broken by array index (earlier entries win). Merchants are encouraged to avoid ties; the UI auto-renumbers on save.

### 10.3 `all_matches_sum` with Disparate Currencies

Not possible at the data layer: a method has a single `currency` field and all costs are in that currency. A multi-currency store uses one Table Rate method per currency, scoped by zone.

If the cart's resolved currency (from tax/locale) differs from the method's currency, A7 Pipeline rejects the method before it's even called. This is pipeline-level behavior, not B6-level.

### 10.4 Circular Conditions

A6 Rules Engine is a pure expression language — no rule references another rule by ID in a way that could cycle. Outer `ruleId` is evaluated exactly once before rows are considered. Row `conditionAST`s are self-contained. Therefore **cycles are structurally impossible**. If A6 ever introduces rule references that could cycle, A6 owns detection.

### 10.5 Very Large Tables (> 100 Rows)

- **Performance target:** 100 rows must evaluate in < 50ms. See §12.
- **Warning threshold:** admin UI shows a performance advisory at > 100 rows.
- **Hard cap:** 500 rows. Above that, the mutation rejects. Merchants with legitimate need for > 500 rows are architecting in the wrong layer — they should split by zone or by sub-method.
- **Optimization:** A6 evaluator caches sub-expression results within a single quote, so repeated predicates across rows (e.g., "weight > 5lb" reused in many rows) compute once.

### 10.6 Row With Invalid AST

Write-time: `validateRuleAST` (from A6) is called during `addRow` / `updateRow`. Invalid AST rejects with a field-level error. The UI highlights the offending row.

Read-time (defense in depth): if a row's AST is somehow invalid at evaluation time (e.g., A6 schema changed between writes), the row is treated as non-matching, an error event fires, and evaluation continues. The method never crashes on bad data.

### 10.7 Import Validation

- **Column schema mismatch:** reject with row 0 error.
- **Invalid AST in `condition_json`:** per-row error; import aborts entirely unless merchant clicks "skip invalid rows" in the confirmation.
- **Negative costs where disallowed:** per-row error. (Negative cost is not a supported "discount" pattern — use a separate discount system.)
- **Missing required columns:** reject before row-level validation.
- **Unknown mode:** per-row error with the allowed enum listed.

### 10.8 Rule Changes Invalidate Methods

If A6 rule with ID `X` is deleted and method's `ruleId = X`, the method's `ruleId` is set to null and method is disabled until merchant re-assigns. An event fires. This behavior is governed by A6's referential integrity rules.

Row `conditionAST` is **inlined**, not referential — it's a copy of the AST, not a pointer. So A6 rule deletion does not cascade into rows. (Merchants who want a shared condition across rows must manually keep them in sync. A future enhancement could introduce named-rule references inside row AST; out of scope for B6 v1.)

### 10.9 Currency Change After Orders Placed

`currency` is immutable once the method has been used in a completed order. Mutation rejects the change with a clear error. Merchants must create a new method if they want to change currency.

### 10.10 Concurrent Row Edits

Two merchants editing the same method's rows simultaneously: standard Convex optimistic concurrency applies. The second writer gets a conflict error and must refresh. UI surfaces this clearly.

### 10.11 Cart Context Missing a Dimension

If `per_weight` mode references `totalWeight` but the cart has no weight data (all items are digital / weightless), `totalWeight` is zero. Cost = `baseCost + 0 = baseCost`. The row matches if its condition matches; it just produces only the base cost. This is correct behavior.

If the merchant intended digital items to skip this row, the row's condition should include `weight > 0`.

### 10.12 Row Priority Collisions on Import

On CSV import, duplicate priorities are auto-renumbered (evenly spaced) with a warning. The merchant is informed in the import summary.

### 10.13 Rounding

Cost values are stored as numbers (with currency-aware precision). Final cost is rounded to the currency's minor unit (cents for USD) at the very end of evaluation, **never** mid-formula. This prevents compounding rounding errors when multiple formulas sum.

### 10.14 Negative `minCost` or `maxCost`

Rejected at write time. Both must be non-negative. `minCost = 0` is valid (useful for free shipping).

### 10.15 `all_matches_sum` With No Matches

Sum of an empty set is zero, but that is **not** treated as "cost = 0 and method available." Zero matches → method unavailable (consistent with `first_match` and `cheapest_match`). Merchants who want a true "always $0" fallback add an explicit catch-all row.

---

## 11. Testing Requirements

Table Rate is the most complex shipping method. Testing is correspondingly extensive.

### 11.1 Unit Tests — Cost Formulas

For each of the four modes, test:

- Zero base cost, zero per-unit cost → cost = 0.
- Positive base only → cost = base.
- Positive per-unit only with non-zero unit → cost = perUnit × unit.
- Both base and per-unit → sum.
- With `unitCap`: unit below cap (no effect), at cap (no effect), above cap (capped).
- With `minCost`: computed below min (clamped up), at min (unchanged), above min (unchanged).
- With `maxCost`: computed above max (clamped down), at max (unchanged), below max (unchanged).
- Edge units: zero, negative rejected, very large.

### 11.2 Unit Tests — Match Modes

For each match mode, test:

- Zero matches → null.
- Exactly one match → that match's cost.
- Multiple matches → correct resolution per mode.
- `first_match`: ties broken by array index, verified.
- `all_matches_sum`: commutative (order doesn't affect sum).
- `cheapest_match`: handles negative differences, handles ties (first lowest wins).

### 11.3 Integration Tests — Every Mode × Match Mode Cross Product

Every combination of cost formula mode (4) × match mode (3) = 12 scenarios. For each, a representative cart produces the expected quote. This is the core regression suite.

### 11.4 Integration Tests — Rule Engine Coverage

For every A6 predicate type, a Table Rate row using it evaluates correctly against a representative cart:

- Weight predicates
- Subtotal predicates
- Item count predicates
- Shipping class predicates
- Destination predicates (country, state, postal, zone)
- Customer tag predicates
- Coupon predicates
- AND/OR/NOT combinations

### 11.5 Admin UI Tests (Playwright)

- Create a Table Rate method end-to-end.
- Add, edit, duplicate, delete rows.
- Drag-reorder rows; verify priority persists.
- Toggle a row; verify it disappears from preview matches.
- Run preview with sample cart; verify matched-row highlighting.
- Import a CSV and see validation errors.
- Import a valid CSV; verify rows appear.
- Export and re-import round-trip; verify identical rate table.
- Switch match mode; verify preview result changes predictably.
- Edit a row's condition via embedded RuleBuilder; verify AST is saved.

### 11.6 Performance Tests

- **100-row table evaluation:** must complete in < 50ms p95 against a standard cart.
- **500-row table evaluation:** must complete in < 250ms p95 (informational; 500 is the hard cap).
- **Repeated predicate optimization:** a table where 50 rows share the same weight predicate must not evaluate it 50 times (cache hit verified via metrics).

### 11.7 Determinism / Snapshot Tests

- For a set of curated (cart, table) pairs, the quote result is hashed.
- Hashes are checked in.
- Any quote drift (same input, different output) fails CI.

### 11.8 Concurrency Tests

- Two concurrent `updateRow` mutations on the same row → one wins, one gets conflict error.
- Concurrent `addRow` mutations → both succeed with distinct row IDs and priorities.
- Import while editing → import either wins completely or fails cleanly; never partial.

### 11.9 Edge Case Test Checklist

Every edge case in §10 has a dedicated test:

- 10.1 zero matches → method unavailable + `no_match` event.
- 10.2 `first_match` tie-breaking.
- 10.5 500 rows import.
- 10.6 invalid AST rejection.
- 10.11 weightless cart with `per_weight` formula.
- 10.13 rounding precision.
- 10.14 negative min/max cost rejection.
- 10.15 `all_matches_sum` zero matches → null, not $0.

### 11.10 Event Firing Tests

- Every mutation fires its expected `shipping.method.*` event.
- Every successful match fires `shipping.table_rate.matched` with the correct row IDs.
- Every non-match fires `shipping.table_rate.no_match`.
- Event payloads match the documented schema exactly.

---

## 12. Success Criteria

### 12.1 Functional Completeness

1. **100% of WooCommerce Table Rate Shipping plugin use cases** from its published documentation are expressible in this system. This is the gold-standard coverage bar and is enumerated as a test corpus:
   - Weight-tiered rates per zone.
   - Price-tiered rates per zone.
   - Quantity-tiered rates per zone.
   - Shipping-class-based surcharges.
   - Destination-specific overrides.
   - Combined multi-condition rules.
   - Free shipping thresholds.
   - Per-row cost caps.
   - Per-row min/max costs.
   - Match-first vs. match-all-sum modes.
2. **Every in-scope feature from §2.1 is implemented and tested.**
3. **Every edge case from §10 has a passing test.**

### 12.2 Performance

1. 100-row table: < 50ms p95 evaluation.
2. 500-row table: < 250ms p95 evaluation.
3. Admin editor with 100 rows: < 200ms to first paint, < 16ms per interaction.
4. CSV import of 500 rows: < 3 seconds end-to-end.

### 12.3 Admin Experience

1. A merchant with no development experience can configure §8.1 (the tiered rates scenario) in < 20 minutes with no external documentation.
2. Preview Pane correctly identifies matches for any cart context in < 1 second.
3. CSV export / import round-trip produces byte-identical tables when no edits occur.
4. Warnings and errors are legible (no raw AST or stack traces leak to the UI).

### 12.4 Data Integrity

1. No orphan rows (rows with invalid ASTs that slipped past validation).
2. Currency immutability after use is enforced and tested.
3. Row IDs are stable across updates (events referencing them remain valid).

### 12.5 Observability

1. Every rate quote is traceable to a matched row ID via audit events.
2. Merchants can diagnose "shipping isn't showing up" complaints using the `no_match` event log without developer assistance.
3. Row-match frequency metrics are exposed to identify dead rows.

---

## 13. Roles & Capabilities

### 13.1 Capabilities Introduced

No new capabilities beyond the shared Layer B set:

| Capability | Description |
|---|---|
| `admin.shipping.methods.manage` | Create, update, delete, import/export Table Rate methods and their rows. |
| `admin.shipping.methods.read` | View methods, run preview, read rate tables. |

Capabilities are defined in the Role & Capability System. Table Rate does not introduce capabilities specific to itself — table-rate-specific powers fold into the generic `admin.shipping.methods.manage`.

### 13.2 Role Matrix

| Role | `admin.shipping.methods.manage` | `admin.shipping.methods.read` |
|---|---|---|
| Administrator | yes | yes |
| Editor | no | yes |
| Author | no | no |
| Contributor | no | no |
| Subscriber | no | no |

Editors can review and preview rate tables for debugging but cannot modify them. Authors and below have no shipping access.

### 13.3 API Gate Enforcement

Every mutation enforces via `requireCan(ctx, "admin.shipping.methods.manage")`. Every query enforces via `requireCan(ctx, "admin.shipping.methods.read")`. Unauthorized calls throw a standardized error. These gates are tested (positive and negative cases).

### 13.4 Customer-Facing Operations

None. The only customer-side surface is the quote result at checkout, and that is generated by A7 Pipeline calling into this method — customers never call Table Rate mutations or queries directly.

---

## 14. Events Fired

### 14.1 Shared Layer B Events

Fired by CRUD mutations (consistent across all Layer B methods):

| Event | When | Payload |
|---|---|---|
| `shipping.method.created` | On `tableRate.create` | `{ methodId, methodType: "table_rate", zoneId, createdBy }` |
| `shipping.method.updated` | On any update mutation | `{ methodId, methodType: "table_rate", changedFields: [...], updatedBy }` |
| `shipping.method.deleted` | On `tableRate.delete` | `{ methodId, methodType: "table_rate", zoneId, deletedBy, softDelete: boolean }` |
| `shipping.method.enabled` | On toggle to enabled=true | `{ methodId, methodType }` |
| `shipping.method.disabled` | On toggle to enabled=false | `{ methodId, methodType }` |
| `shipping.method.quoted` | By A7 Pipeline wrapping the handler | `{ methodId, methodType, quoted: boolean, cost?, currency? }` |

### 14.2 Table Rate-Specific Events

| Event | When | Payload |
|---|---|---|
| `shipping.table_rate.matched` | On successful match (method returns a quote) | `{ methodId, matchMode, matchedRowIds: string[], computedCost: number, currency, cartSnapshotHash, evaluationTimeMs }` |
| `shipping.table_rate.no_match` | On zero matches (method returns null) | `{ methodId, cartSnapshotHash, evaluatedRowCount, outerRulePassed: boolean }` |
| `shipping.table_rate.row_added` | On `addRow` | `{ methodId, rowId, priority, addedBy }` |
| `shipping.table_rate.row_updated` | On `updateRow` | `{ methodId, rowId, changedFields, updatedBy }` |
| `shipping.table_rate.row_deleted` | On `deleteRow` | `{ methodId, rowId, deletedBy }` |
| `shipping.table_rate.rows_reordered` | On `reorderRows` | `{ methodId, priorityChanges: [{ rowId, oldPriority, newPriority }], reorderedBy }` |
| `shipping.table_rate.imported` | On CSV import | `{ methodId, rowCount, mode: "replace" | "append", importedBy }` |
| `shipping.table_rate.exported` | On CSV export | `{ methodId, rowCount, exportedBy }` |

### 14.3 Consumers

- **Audit Log System**: records every mutation event for compliance.
- **Analytics**: `matched` events feed row-match-frequency metrics.
- **Site Notification System**: subscribes to `no_match` for operational alerting when a specific zone has chronic no-match rates.
- **Email Notification System**: not a direct consumer, but can be wired to alert merchants when `no_match` rate exceeds a threshold.

### 14.4 Event Schema Stability

All event payloads are versioned. Adding fields is non-breaking; removing or renaming fields requires a major version bump on the event. Schemas are defined in the Event Dispatcher System's event catalog.

---

## 15. References

### 15.1 Primary References

- **WooCommerce Table Rate Shipping plugin** (the commercial plugin by WooCommerce). Its documentation corpus is the coverage bar for §12.1.
- **WooCommerce Table Rate Shipping by BE** (alternative community plugin). Useful for edge-case parity checking.
- **Shopify Carrier Calculated Shipping** with custom rule scripts. Influences the match-mode vocabulary and the "cheapest match" pattern.
- **ShipperHQ Rules Engine**. Informs the AST-based condition authoring pattern.

### 15.2 Internal References (Upstream PRDs)

- **A1 Shipping Zones** — `specs/ConvexPress/systems/shipping-zones-system/PRD.md`
- **A2 Shipping Classes** — `specs/ConvexPress/systems/shipping-classes-system/PRD.md`
- **A3 Shipping Packages** — `specs/ConvexPress/systems/shipping-packages-system/PRD.md`
- **A6 Shipping Rules Engine** — `specs/ConvexPress/systems/shipping-rules-engine/PRD.md` (heaviest dependency)
- **A7 Rate Calculation Pipeline** — `specs/ConvexPress/systems/rate-calculation-pipeline/PRD.md`

### 15.3 Internal References (Sibling Layer B PRDs)

- **B1 Flat Rate** — `specs/ConvexPress/systems/shipping-method-flat-rate/PRD.md`
- **B2 Weight-Based** — `specs/ConvexPress/systems/shipping-method-weight-based/PRD.md`
- **B3 Dimensional** — `specs/ConvexPress/systems/shipping-method-dimensional/PRD.md`
- **B4 Price-Based** — `specs/ConvexPress/systems/shipping-method-price-based/PRD.md`
- **B5 Quantity-Based** — `specs/ConvexPress/systems/shipping-method-quantity-based/PRD.md`

### 15.4 Related Infrastructure

- **Role & Capability System** — defines `admin.shipping.methods.manage`, `admin.shipping.methods.read`.
- **Event Dispatcher System** — registers event schemas, delivers subscriptions.
- **Audit Log System** — consumes all mutation events.
- **Settings System** — store-level configuration for currency, weight unit.

### 15.5 File Locations (Implementation Map)

| Concern | Path |
|---|---|
| Schema | `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` |
| Handler | `ConvexPress-Admin/packages/backend/convex/shipping/methods/tableRate.ts` |
| CRUD mutations | `ConvexPress-Admin/packages/backend/convex/shipping/tableRate/mutations.ts` |
| Queries | `ConvexPress-Admin/packages/backend/convex/shipping/tableRate/queries.ts` |
| Internals | `ConvexPress-Admin/packages/backend/convex/shipping/tableRate/internals.ts` |
| Validators | `ConvexPress-Admin/packages/backend/convex/shipping/tableRate/validators.ts` |
| Shared math | `ConvexPress-Admin/packages/backend/convex/shipping/formulas.ts` |
| Admin editor UI | `ConvexPress-Admin/apps/web/src/components/shipping/TableRateEditor.tsx` |
| Row editor panel | `ConvexPress-Admin/apps/web/src/components/shipping/TableRateRowEditor.tsx` |
| Formula editor panel | `ConvexPress-Admin/apps/web/src/components/shipping/TableRateFormulaEditor.tsx` |
| Preview pane | `ConvexPress-Admin/apps/web/src/components/shipping/TableRatePreview.tsx` |
| CSV import/export | `ConvexPress-Admin/apps/web/src/components/shipping/TableRateCSV.tsx` |

---

## Appendix A: Canonical Example Tables

For documentation, onboarding, and test fixtures, the following canonical tables are shipped with the system and importable via a "Starter Templates" button in the admin.

### A.1 Tiered Weight (US)

Three-row weight tier as documented in §8.1. Catch-all fourth row returning `flat $40` for overweight edge cases.

### A.2 Free Shipping Over Threshold

- Row 1 (priority 10): `subtotal >= 75` → `flat $0` — label "Free Shipping".
- Row 2 (priority 20): `always true` → `flat $8` — label "Standard Shipping".

### A.3 B2B Wholesale

As documented in §8.3.

### A.4 Fragile Surcharge Stacking

`all_matches_sum` mode with base tier + fragile surcharge + remote-area surcharge.

### A.5 International Zones

Multi-row table using destination predicates to produce different rates for Canada, Mexico, EU, UK, APAC, and rest-of-world.

---

## Appendix B: Non-Negotiables

These are the rules that cannot be violated under any circumstance during implementation or maintenance:

1. **No scripting.** Conditions are A6 AST. Period. No string expressions, no eval, no JavaScript hooks inside rows.
2. **Deterministic.** Same inputs → same outputs. Always.
3. **Cost never goes negative.** `minCost` floors at zero by default.
4. **Currency is immutable post-use.** Period.
5. **No popups for row editing.** Row editors are slide-in panels. Confirmation dialogs for deletes only.
6. **Base UI only.** Every component in `TableRateEditor.tsx` uses `@base-ui/react`. No Radix.
7. **System expert does not deploy.** The Convex Deployment Expert deploys after this system is written.
8. **100% WooCommerce Table Rate coverage is the bar.** Anything that plugin does, this system does.

---

*End of PRD.*
