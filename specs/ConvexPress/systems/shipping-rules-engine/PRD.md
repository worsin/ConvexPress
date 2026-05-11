# Shipping Rules Engine — PRD

**System ID:** A-SHIP-RULES (Shipping Layer A, Core Infrastructure)
**Layer:** A — Core Infrastructure
**Status:** Proposed
**Depends on:** Shipping Zones (A1), Shipping Classes (A2)
**Depended on by:** Flat Rate (B1), Weight-Based (B2), Dimensional (B3), Price-Based (B4), Quantity-Based (B5), Free Shipping (B6), Local Delivery (B8), Table Rate (B9), Rate Calculation Pipeline (A7)

---

## 1. Context & Intent

### Why this system exists

Every shipping method in ConvexPress — from the simplest Flat Rate to the most elaborate Table Rate — needs to answer the same question in different ways:

> "Given the current cart, customer, and destination, does this method (or this rate tier) apply?"

Without a unified answer to that question, every method type ends up reinventing its own conditional logic. Flat Rate needs "only if subtotal > $X". Free Shipping needs "only if no fragile items and destination is domestic". Table Rate needs dozens of rate tiers each gated on weight ranges, item counts, and shipping class membership. Local Delivery needs "only within these ZIP codes and not after 6pm". If each method ships its own ad-hoc predicate code, we end up with:

- Five different syntaxes merchants must learn to express the same idea.
- Five different admin UIs for essentially the same builder.
- Five different test suites, each of which will miss different edge cases.
- No shared guarantees about type safety, depth limits, or evaluation performance.

### What this system is

The **Shipping Rules Engine** is a declarative, JSON-based predicate evaluator. A rule is a pure data structure — an abstract syntax tree (AST) of boolean operators and field comparisons. The engine takes a rule and a **cart context** and returns `true`/`false` plus a trace of which sub-rules matched.

The engine is:

- **Declarative.** Rules are JSON; no function references, no JavaScript strings, no `eval`.
- **Pure.** Evaluating the same rule against the same context always yields the same result.
- **Bounded.** Hard cap on AST depth (8 levels) prevents runaway rules.
- **Type-safe.** Every rule is validated against a Convex validator schema on save.
- **Shared.** Every method type in Layer B uses this engine; merchants learn one syntax, not nine.

### What this system is not

- **Not a scripting engine.** No loops, no variables, no function calls. Procedural logic is explicitly out of scope (see §2).
- **Not a rate calculator.** A rule returns `true`/`false`. Whether the matched rule yields a $5.99 rate, a 10% discount, or a per-pound multiplier is the concern of the owning method. Derived numeric outputs belong to method config, not to the rule.
- **Not Turing-complete.** Recursion, self-reference, and general computation are banned by design. See §10 for circular-reference handling.

### Design influences

- **JSON Logic** (<https://jsonlogic.com/>) — AST shape, operator vocabulary, JSON-only guarantee.
- **Shopify Functions `shipping.run`** — the "pure function from cart to boolean/discount" model.
- **Stripe Payment Intent conditions / automations** — condition expression style, merchant UX for "when X, then Y".
- **Cloudflare Workers routing rules** — nested AND/OR predicate UI, field+operator+value triplet pattern.
- **WooCommerce Table Rate Shipping (paid plugin)** — rule row UX, shipping class membership tests, zone-aware conditions.

---

## 2. Scope

### In scope

- **Rule definition.** A documented JSON AST schema covering every operator and field listed in §5. Validators that reject malformed rules on save.
- **Rule evaluation.** A pure `evaluateRule(ast, context)` function that returns `{ matched: boolean, trace: EvaluationTrace }`. Must complete in < 10 ms for realistic rules (see §12).
- **Rule validation.** A `validateRuleAST(ast)` helper that checks structural correctness, depth limit, field whitelist, operator whitelist, and value-type compatibility before a rule is accepted by a method config.
- **Rule storage.** A `commerce_shipping_rules` table for named, reusable rules, plus an embedded-JSON pattern for method-local rules (see §4 for the hybrid model).
- **Rule admin UX.** A reusable `RuleBuilder` React component that produces/consumes the AST and supports nested AND/OR groups, field dropdowns, operator dropdowns, typed value inputs, and a "test against sample cart" preview (§7).
- **Rule events.** Lifecycle events emitted for created/updated/deleted rules and for `evaluation_failed` diagnostics (§14).
- **Rule role/capability.** `admin.shipping.rules.manage` gates write access (§13).

### Out of scope

- **Procedural scripting.** No `for`, `while`, `if/else` statements, or custom step sequences. Rules are pure predicates.
- **Turing-complete logic.** No recursion, no self-reference, no general computation. If you need "loop over line items and sum …", that is a **field** (e.g., `cart.subtotalAmount`, `cart.weightOz`) computed upstream by the cart context builder, not a rule primitive.
- **Custom JS.** Merchants cannot write JavaScript, TypeScript, or any scripting language. No `eval`, no `Function()`, no remote code.
- **Numeric output / rate derivation.** Rules return booleans. The method config (e.g., Table Rate's rate tiers, Free Shipping's `cost: 0`) decides what to do when a rule matches.
- **Cross-cart rules / lookback.** No "customer spent more than $X in the last 30 days across all carts" beyond what is already projected onto `customer.totalLifetimeAmount` and `customer.totalOrdersCount`.
- **Tax or payment rules.** Those systems have their own PRDs. Rules Engine is for shipping only; the primitives may be extracted into a generic rules library in a future revision but that is explicitly deferred.

---

## 3. Dependencies

### Upstream (this system consumes)

| Dependency | PRD ID | What we use |
|---|---|---|
| Shipping Zones | A1 | `shipping.zoneId`, `shipping.zoneName`, `shipping.destinationCountryCode`, `shipping.destinationPostalCode` surfaced into the cart context. Zones must be matched before rules run so that zone-aware fields are populated. |
| Shipping Classes | A2 | `cart.shippingClasses` — the deduped set of class slugs present in the cart. Classes must be resolved per line item before rules run. |
| Cart / Checkout | Commerce Cart | Source of `cart.*` fields (subtotal, weight, item count, currency, applied discounts, product IDs, product tags). |
| Customer / Auth | Auth + User Profile | Source of `customer.*` fields (userId, tags, isGuest, lifetime totals). |
| Event Dispatcher | Event Dispatcher System | Emission of rule lifecycle events. |
| Role & Capability System | Role & Capability | `admin.shipping.rules.manage` capability check. |

### Downstream (these systems consume Rules Engine)

| Consumer | PRD ID | How it uses rules |
|---|---|---|
| Rate Calculation Pipeline | A7 | Orchestrates: for each enabled method in the matched zone, evaluate its gating rule; if `true`, call the method's rate function. |
| Flat Rate Shipping | B1 | Optional availability rule ("only if subtotal > $20"). |
| Weight-Based Shipping | B2 | Availability rule + per-tier gating rules. |
| Dimensional Shipping | B3 | Availability rule + package-size gating. |
| Price-Based Shipping | B4 | Tier selection via rules over `cart.subtotalAmount`. |
| Quantity-Based Shipping | B5 | Tier selection via rules over `cart.itemCount`. |
| Free Shipping | B6 | **Primary conditional consumer.** "Free when subtotal ≥ $75 AND no fragile class AND destination is domestic." |
| Local Delivery | B8 | ZIP whitelist/blacklist, postal code patterns, distance proxies. |
| Table Rate Shipping | B9 | **Heaviest consumer.** Every rate row has a gating rule. |

Rules Engine is a Layer A prerequisite: no downstream method can ship to production until this system is in place.

---

## 4. Schema

The Rules Engine supports two storage modes in parallel.

### Mode 1 — Named reusable rules (`commerce_shipping_rules` table)

For rules merchants want to reuse across multiple methods (e.g., "Domestic, no fragile"), a named rule lives in its own table and is referenced by ID from method configs.

**Table: `commerce_shipping_rules`**

```
{
  _id: Id<"commerce_shipping_rules">,
  _creationTime: number,

  // Identity
  name: v.string(),                            // Human label, e.g. "Domestic, no fragile"
  slug: v.string(),                            // URL/key-safe identifier, unique per tenant
  description: v.optional(v.string()),

  // The rule AST (validated against RuleNode validator on save)
  ruleDefinition: v.any(),                     // See §5 — typed via runtime validator

  // Applicability
  appliesTo: v.array(
    v.union(
      v.literal("flat_rate"),
      v.literal("weight_based"),
      v.literal("dimensional"),
      v.literal("price_based"),
      v.literal("quantity_based"),
      v.literal("free_shipping"),
      v.literal("local_delivery"),
      v.literal("table_rate"),
      v.literal("any")                         // Special wildcard
    )
  ),

  // Ordering when multiple rules match in selection contexts
  priority: v.number(),                        // Lower = higher priority; default 100

  // Versioning & migrations
  schemaVersion: v.number(),                   // Current: 1 (see §10 migrations)

  // Lifecycle
  isActive: v.boolean(),
  createdBy: v.id("users"),
  updatedBy: v.optional(v.id("users")),
  updatedAt: v.number(),
}

Indexes:
- by_slug: ["slug"]                            // Unique lookup
- by_appliesTo: ["appliesTo"]                  // For admin filtering
- by_active_priority: ["isActive", "priority"] // Evaluator ordering
```

### Mode 2 — Embedded rule AST (per method config)

For rules tightly coupled to a specific method (e.g., a single Free Shipping method's one condition, or a Table Rate rate row's gating expression), the AST is stored **inline** in that method's config JSON. This avoids noise in the named-rules table and keeps the method self-contained.

Example, embedded in a hypothetical `commerce_shipping_method_free` config:

```
{
  // ... method config fields ...
  availabilityRule: { /* RuleNode AST */ } | null,
}
```

Example, embedded in each row of a `tableRateRows` array inside a `commerce_shipping_method_table_rate` config:

```
{
  tableRateRows: [
    { gatingRule: { /* RuleNode AST */ }, rateCents: 599, label: "Standard" },
    { gatingRule: { /* RuleNode AST */ }, rateCents: 1299, label: "Express" },
  ]
}
```

### When to use which mode

| Use Mode 1 (named) when… | Use Mode 2 (embedded) when… |
|---|---|
| Rule is used by two or more methods. | Rule exists only inside one method's config. |
| Merchant wants to name and manage it in a central "Shipping Rules" admin page. | Rule is a small implementation detail of that method. |
| Rule is shared between Free Shipping and a Flat Rate promo. | Rule gates a single row in a Table Rate. |
| Rule needs its own audit trail, lifecycle events, and RBAC surface. | Rule should be copied, not linked, when the method is duplicated. |

Both modes share the **same AST schema, validator, and evaluator**. The only difference is storage location.

### Schema file placement

Per project convention (`.claude/CLAUDE.md` — modular schema):

- **File:** `convex/schema/shipping.ts`
- **Exported object:** `shippingTables` — spreads into the root `schema.ts`.
- Any embedded rule-AST columns live inside other shipping-related tables defined in the same file.

---

## 5. Data Model — The Rule AST

### 5.1 Top-level node

A rule is a single `RuleNode`. Every node has an `op` discriminator:

```
RuleNode =
  | LogicalNode
  | ComparisonNode
  | MembershipNode
  | StringNode
  | RangeNode
  | ExistenceNode
  | NotNode
```

### 5.2 Logical nodes (AND / OR)

```
LogicalNode = {
  op: "and" | "or",
  rules: RuleNode[],       // 1..N children; empty array is a validation error
}
```

### 5.3 Not node (unary)

```
NotNode = {
  op: "not",
  rule: RuleNode,
}
```

### 5.4 Comparison nodes

```
ComparisonNode = {
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte",
  field: FieldPath,        // See §5.10
  value: Scalar,           // string | number | boolean — must match field's declared type
}
```

### 5.5 Membership nodes

```
MembershipNode = {
  op: "in" | "not_in",
  field: FieldPath,        // Scalar field
  values: Scalar[],        // All same type as field; 1..100 entries
}
```

Note: `in` / `not_in` test a **scalar** field against a **set** of values. For the inverse ("is this value in this array field?"), use `contains` / `not_contains`.

### 5.6 Array-containment nodes

```
ContainmentNode = {
  op: "contains" | "not_contains",
  field: FieldPath,        // Must be an array-typed field (§5.10)
  value: Scalar,           // Checked against array membership
}
```

### 5.7 String nodes

```
StringNode = {
  op: "starts_with",
  field: FieldPath,        // String-typed field
  value: string,
}

RegexNode = {
  op: "regex_match",
  field: FieldPath,        // String-typed field
  pattern: string,         // RE2-compatible subset; no lookahead/lookbehind
  flags: "i" | "" ,        // Case-insensitive flag only
}
```

The regex engine uses a **safe subset** (linear-time; no catastrophic backtracking). Unsafe patterns are rejected at save time (§10).

### 5.8 Range node

```
RangeNode = {
  op: "between",
  field: FieldPath,        // Numeric field
  min: number,             // Inclusive
  max: number,             // Inclusive
  // Validation: min <= max
}
```

### 5.9 Existence node

```
ExistenceNode = {
  op: "exists",
  field: FieldPath,
  present: boolean,        // true => field is defined and non-null/empty
}
```

### 5.10 Field path reference

Every `FieldPath` is a dot-notation string resolved against the cart/session context. Unknown paths are rejected at save time; at evaluation time they produce a controlled "missing field" result (§10).

| Field path | Type | Meaning |
|---|---|---|
| `cart.subtotalAmount` | number (minor units, integer cents) | Cart subtotal, in cart currency, before shipping and tax. |
| `cart.weightOz` | number (integer ounces) | Total cart weight across all line items. |
| `cart.itemCount` | number (integer) | Total count of units (line-item quantities summed). |
| `cart.lineItemCount` | number (integer) | Distinct line-items (not summed across quantity). |
| `cart.currencyCode` | string (ISO 4217, uppercase) | `"USD"`, `"EUR"`, etc. |
| `cart.appliedDiscountCode` | string \| null | Currently applied discount/coupon code; null if none. |
| `cart.shippingClasses` | string[] | Deduped array of shipping class slugs present in cart. |
| `cart.productIds` | string[] | Array of product IDs in the cart. |
| `cart.productTags` | string[] | Deduped array of product tag slugs across all line items. |
| `shipping.destinationCountryCode` | string (ISO 3166-1 alpha-2) | Destination country. |
| `shipping.destinationStateCode` | string \| null | Destination state/region code. |
| `shipping.destinationPostalCode` | string \| null | Destination postal code. |
| `shipping.zoneId` | string \| null | Matched zone ID from Zones (A1); null if unmatched. |
| `shipping.zoneName` | string \| null | Matched zone display name. |
| `customer.userId` | string \| null | Authenticated user ID; null for guests. |
| `customer.tags` | string[] | Customer-level tags (e.g., "wholesale", "vip"). |
| `customer.isGuest` | boolean | True when checkout is guest. |
| `customer.totalOrdersCount` | number (integer) | Lifetime successful orders. |
| `customer.totalLifetimeAmount` | number (minor units) | Lifetime successful spend, in site base currency. |

Any path not in this table is a validation error. The table is the **exhaustive allowlist** for version 1 of the engine.

### 5.11 Depth cap

`validateRuleAST` walks the tree and rejects any rule whose logical nesting depth exceeds **8 levels** (AND/OR/NOT each count as a level; leaf comparisons do not). Rationale: 8 levels covers every realistic merchant scenario while guaranteeing worst-case evaluation stays well under the 10 ms budget (§12).

### 5.12 Example rules

**Example A — Free shipping when subtotal ≥ $75 AND no fragile items:**

```
{
  "op": "and",
  "rules": [
    { "op": "gte", "field": "cart.subtotalAmount", "value": 7500 },
    { "op": "not_contains", "field": "cart.shippingClasses", "value": "fragile" }
  ]
}
```

**Example B — Heavy items rate tier (40 lb – 80 lb, domestic only):**

```
{
  "op": "and",
  "rules": [
    { "op": "between", "field": "cart.weightOz", "min": 640, "max": 1280 },
    { "op": "eq", "field": "shipping.destinationCountryCode", "value": "US" }
  ]
}
```

**Example C — VIP customer OR wholesale tag, with at least 5 items:**

```
{
  "op": "and",
  "rules": [
    { "op": "gte", "field": "cart.itemCount", "value": 5 },
    {
      "op": "or",
      "rules": [
        { "op": "contains", "field": "customer.tags", "value": "vip" },
        { "op": "contains", "field": "customer.tags", "value": "wholesale" }
      ]
    }
  ]
}
```

**Example D — Local delivery within a ZIP prefix, non-guest, excluding perishables:**

```
{
  "op": "and",
  "rules": [
    { "op": "eq", "field": "customer.isGuest", "value": false },
    { "op": "starts_with", "field": "shipping.destinationPostalCode", "value": "021" },
    { "op": "not_contains", "field": "cart.shippingClasses", "value": "perishable" }
  ]
}
```

### 5.13 Convex validators

`convex/shipping/rulesEngine/types.ts` exports a recursive `v.union()` validator that mirrors the AST exactly. Convex's built-in validator runtime is the primary guarantor that a rule saved to the database is structurally well-formed. The higher-level `validateRuleAST` helper adds the semantic checks (depth cap, field whitelist, operator/field type compatibility, regex safety).

---

## 6. Functions / API

All function files live under `convex/shipping/rulesEngine/` and `convex/shipping/` per project convention.

### 6.1 Internal evaluator

**`evaluateRule(ruleAST, context): EvaluationResult`**

- **File:** `convex/shipping/rulesEngine/evaluator.ts`
- **Purity:** Pure function, no I/O, no `ctx` access. Takes a validated AST and a plain context object.
- **Return:**
  ```
  EvaluationResult = {
    matched: boolean,
    trace: EvaluationTraceNode,     // Mirrors AST shape, with per-node matched booleans
    missingFields: string[],        // Field paths that were undefined at eval time
    evaluationTimeMs: number,
  }
  ```
- **Behavior:** Short-circuits AND on first `false`, OR on first `true`. Missing fields cause the leaf to evaluate to `false` and append the path to `missingFields`; the evaluation does not throw.
- **Callers:** Rate Calculation Pipeline (A7) and method-specific handlers.

### 6.2 Internal validator

**`validateRuleAST(ast): ValidationResult`**

- **File:** `convex/shipping/rulesEngine/validator.ts`
- **Checks:**
  - Convex validator conformance.
  - Depth ≤ 8.
  - Every `field` is in the §5.10 allowlist.
  - Every `op` is compatible with the `field`'s declared type (e.g., `gt` only on numeric fields; `starts_with` only on string fields; `contains` only on array fields).
  - Every `value` / `values` / `min` / `max` matches the field's declared type.
  - Regex patterns are in the safe subset.
  - Logical nodes have ≥ 1 child (empty `and`/`or` is an error; use literal `true`/`false` patterns instead — or just omit the rule).
- **Return:** `{ valid: true }` or `{ valid: false, errors: ValidationError[] }` with machine- and human-readable error entries (path, code, message).
- **Callers:** `saveRule` mutation, Free Shipping / Table Rate / etc. config save mutations (before they persist an embedded rule), and the admin RuleBuilder live-validation.

### 6.3 Public mutations

**`shipping.rules.saveRule`**

- **File:** `convex/shipping/rulesEngine/mutations.ts`
- **Capability:** `admin.shipping.rules.manage`.
- **Args:** `{ ruleId?: Id<"commerce_shipping_rules">, name, slug, description?, ruleDefinition, appliesTo, priority?, isActive? }`
- **Behavior:**
  1. Calls `validateRuleAST(args.ruleDefinition)`; returns validation errors on failure.
  2. Enforces slug uniqueness.
  3. Upserts the row, stamps `updatedBy`/`updatedAt`, `schemaVersion = 1`.
  4. Emits `shipping.rule.created` or `shipping.rule.updated`.

**`shipping.rules.deleteRule`**

- **Capability:** `admin.shipping.rules.manage`.
- **Args:** `{ ruleId }`
- **Behavior:**
  1. Soft-deletes by setting `isActive = false` (hard-delete available via a force flag for administrators — see §13).
  2. Refuses if any active method config references the named rule (returns a list of blocking references).
  3. Emits `shipping.rule.deleted`.

**`shipping.rules.duplicateRule`**

- **Capability:** `admin.shipping.rules.manage`.
- **Args:** `{ ruleId, newName, newSlug }`
- **Behavior:** Deep-copies the AST; creates a new row; emits `shipping.rule.created`.

### 6.4 Public queries

**`shipping.rules.listRules`**

- **Args:** `{ appliesTo?, isActive?, search? }`
- **Capability:** `admin.shipping.rules.manage` (or read-only variant for merchants with view access).
- **Return:** Paginated list of rules sorted by `priority`, then `name`.

**`shipping.rules.getRule`**

- **Args:** `{ ruleId | slug }`
- **Return:** Single row or null.

**`shipping.rules.getReferences`**

- **Args:** `{ ruleId }`
- **Return:** `{ methods: Array<{ methodId, methodType, methodName }> }` — all methods referencing this named rule. Used by delete-blocking and by the admin "Used by" panel.

### 6.5 Preview / test endpoint

**`shipping.rules.testRule`** (action or query)

- **Args:** `{ ruleDefinition, sampleContext }`
- **Capability:** `admin.shipping.rules.manage`.
- **Behavior:** Runs `evaluateRule` against a merchant-supplied sample context and returns the full `EvaluationResult`, including the trace, so the admin UI can highlight which branches matched.
- **Note:** `sampleContext` is validated against the context schema — fields not in §5.10 are dropped and reported.

### 6.6 Context builder (contract, not this PRD's responsibility)

The Rate Calculation Pipeline (A7) owns the `buildShippingContext(ctx, cart, shippingAddress, customer)` helper that produces the context object this engine consumes. Its contract, from the engine's point of view, is: "populate every field in §5.10 with a value matching the declared type, or leave it undefined."

---

## 7. Admin UX

### 7.1 Entry points

- **Standalone admin page:** `/admin/commerce/shipping/rules` lists all named rules (Mode 1). Supports create/edit/duplicate/delete, filter by `appliesTo`, search by name/slug.
- **Embedded RuleBuilder:** Method-editor pages (Free Shipping, Table Rate rows, etc.) embed `<RuleBuilder />` inline for Mode 2 AST authoring.

### 7.2 RuleBuilder component

- **File:** `apps/web/src/components/shipping/RuleBuilder.tsx`
- **Reuse:** One component, same UX everywhere. Consumers pass `value: RuleNode | null` and `onChange: (ast) => void`.
- **Layout:** Nested group rows mirroring AST structure.

**Group row (AND / OR / NOT):**
- Drop-down to switch operator (`AND` ↔ `OR` ↔ `NOT`).
- For AND/OR: list of child rows, each with a drag handle, and an "Add condition" / "Add group" pair at the bottom.
- For NOT: exactly one child row.
- Group rows are color-banded by depth to make nesting legible.
- Depth indicator; when a user tries to add a 9th level, the "Add group" button disables with a tooltip: "Maximum rule depth is 8 levels."

**Condition row (leaf):**
- **Field dropdown** — grouped by `cart`, `shipping`, `customer`; only fields from §5.10.
- **Operator dropdown** — filtered to operators compatible with the selected field's type (e.g., selecting `cart.shippingClasses` restricts the operator list to `contains`, `not_contains`, `exists`).
- **Value input** — type-aware:
  - Numeric field → number input; if a money field (`cart.subtotalAmount`, `customer.totalLifetimeAmount`), renders a currency helper and stores minor units.
  - Weight field → input with unit toggle (oz/lb), stored as oz.
  - String field → text input; for enumerated values (country code, currency code), a searchable select.
  - Array-typed field → for `shippingClasses`/`productTags`, a select populated from the live taxonomy; for `productIds`, a product picker.
- **Remove-row button.**

**Range operator (`between`):** two numeric inputs (min/max) with min ≤ max validation.

**Regex operator:** text input with live preview (shows which sample inputs from the test panel match) and a warning if the pattern is rejected by the safe-subset linter.

### 7.3 Test panel

Every RuleBuilder instance has a collapsible **"Test your rule"** panel that shows:

- A sample-cart form with inputs for every field in §5.10.
- A "Use a real recent cart" button that populates from any recent test cart (admin permission required).
- A Run button that calls `shipping.rules.testRule`.
- Result: large PASS/FAIL banner plus an indented trace tree mirroring the AST, with every leaf marked ✓/✗ and every missing field highlighted.
- "Save as preset" to persist frequently-used sample contexts per user.

### 7.4 Validation feedback

- Validation runs on every keystroke (client-side mirror of `validateRuleAST`) and on save (server-side authoritative).
- Errors surface inline on the offending row with a red left-border, an error icon, and a hoverable message.
- The Save button is disabled while any error is outstanding.
- On server save failure, the response's `errors[].path` maps back to the specific RuleBuilder row and scrolls it into view.

### 7.5 Rule list page

- Table columns: Name, Slug, Applies to (chips), Priority, Active, Updated.
- Row action menu: Edit, Duplicate, View uses ("Used by 3 methods" popover), Deactivate, Delete.
- Bulk actions: Activate / Deactivate / Export JSON (so merchants can back up and share rules between sites in multi-site deployments).
- "Import JSON" in the toolbar re-validates on import.

---

## 8. Merchant Workflow

### Scenario: "Free shipping when cart subtotal is above $75 AND the cart doesn't contain fragile items"

**Option 1 — Inline on the Free Shipping method (Mode 2):**

1. Navigate to **Commerce → Shipping → Methods → Free Shipping**.
2. In the method editor, find the **Availability rule** section and click **Add rule**.
3. The RuleBuilder expands with a default single AND group.
4. Click **Add condition**:
   - Field: `Cart → Subtotal`
   - Operator: `≥ (greater than or equal to)`
   - Value: `$75.00` (builder converts to `7500` minor units).
5. Click **Add condition** again:
   - Field: `Cart → Shipping classes`
   - Operator: `does not contain`
   - Value: select `fragile` from the class dropdown.
6. Open the **Test your rule** panel. Input a sample cart: subtotal `$80`, no fragile class → sees PASS, both leaves green. Change subtotal to `$60` → FAIL, first leaf red. Add `fragile` class → FAIL, second leaf red.
7. Save the Free Shipping method. The AST is embedded in the method's config.

**Option 2 — Promote to a named reusable rule (Mode 1):**

If the merchant wants the same rule on Free Shipping and on a discounted Flat Rate:

1. In the RuleBuilder, click the **⋯ menu → Save as named rule**.
2. Provide `name: "Qualifying domestic cart"`, `slug: "qualifying-domestic-cart"`.
3. The rule is saved to `commerce_shipping_rules` with `appliesTo: ["free_shipping", "flat_rate"]`.
4. The Free Shipping method now stores a reference to the named rule instead of an embedded AST.
5. On the Flat Rate method editor, the merchant picks the named rule from a dropdown instead of rebuilding it.

### Scenario: "Table Rate — $4.99 up to 5 lb, $9.99 up to 20 lb, not available above 20 lb for international"

1. Create a Table Rate method.
2. Add rate row 1: label `"Standard ≤ 5 lb"`, rate `$4.99`, gating rule via the embedded RuleBuilder — `cart.weightOz` between 0 and 80.
3. Add rate row 2: label `"Standard 5–20 lb"`, rate `$9.99`, gating rule — `cart.weightOz` between 81 and 320.
4. Add rate row 3: label `"Heavy, US only"`, rate `$39.99`, gating rule — `cart.weightOz > 320 AND shipping.destinationCountryCode == "US"`.
5. The merchant can drag rows to reorder — first matching row wins.

---

## 9. Storefront UX

### Invisible by design

Rule evaluation happens in the Rate Calculation Pipeline (A7) during checkout; the storefront never shows the rule itself. The customer sees only the resulting list of available shipping methods and their rates.

### When rules exclude a method

If a merchant has configured a rule but no method matches the current cart:

- **Default behavior:** The method silently disappears from the checkout rate list.
- **Optional "unavailability reason":** Each method config may include a merchant-authored `unavailableReason` string. When the method is excluded because its availability rule returned `false`, the checkout UI can optionally display:
  > *This shipping method is not available for your order.*
  >
  > *Reason: "Free shipping is available when your cart is over $75 and does not contain fragile items."*
- This is rendered as a dismissable info note under the rates list, not as a blocking error. The reason text is never dynamic (no leaking of internal rule structure); it is merchant-authored copy.

### Fallback when **all** methods are excluded

The Rate Calculation Pipeline (A7) handles the "no methods available" case (fallback copy, a "get in touch" link). The Rules Engine's sole contribution is the matched/unmatched boolean plus trace that the pipeline uses for diagnostics.

---

## 10. Edge Cases

### 10.1 Malformed rule JSON at save time

- Convex validator rejects the mutation with a structured error.
- Admin UI surfaces a row-level error on the offending node.
- No partial save — the mutation is atomic.

### 10.2 Malformed rule JSON at evaluation time (defense in depth)

- `evaluateRule` re-checks the top-level node shape. If a rule was somehow persisted in a broken state (manual DB edit, migration bug), evaluation returns `{ matched: false, trace: null, missingFields: [], error: "malformed_ast" }` and emits `shipping.rule.evaluation_failed` (§14).
- The containing method is treated as unavailable for this request. The pipeline logs the failure and surfaces it on the method's admin page as a health warning.

### 10.3 Missing field in context

- Treated as a controlled, expected condition — not an error.
- Leaf evaluates to `false`.
- Field path added to `missingFields`.
- Trace node marks the leaf as `"missing_field"` so the admin test panel can distinguish "false because comparison failed" from "false because the field was absent."

### 10.4 Division by zero / computed rules

- Version 1 has **no computed/derived operators** — no `divide`, `multiply`, `add`, `subtract`. Every leaf is field-vs-value. This is an intentional design constraint that avoids every class of arithmetic edge case at the rule layer. Method configs do math; rules do comparison.

### 10.5 Circular rule references (named rules)

- Version 1 AST does **not** support "include rule by reference" inside another rule's AST. A named rule's AST is leaf-only (no rule-reference node).
- Where method configs reference a named rule, they do so at the top level, not inside another rule's tree. This makes cycles structurally impossible.
- If a future version introduces a `{op: "rule_ref", ruleId}` node, the validator must perform a cycle check via DFS with a visited set and reject cycles at save time. This is explicitly deferred.

### 10.6 Rule version migrations

- Every row stores `schemaVersion: number`. Version 1 is the initial release.
- When the AST schema evolves (new operator, new field, renamed field), a migration internal action:
  1. Reads all rules with `schemaVersion < current`.
  2. Transforms the AST with a per-version upgrade function.
  3. Re-runs `validateRuleAST`.
  4. Writes back with the new `schemaVersion`.
- The evaluator is **pinned** to one schema version per deployment; it refuses to evaluate rules whose `schemaVersion > engine.version` and emits `shipping.rule.evaluation_failed`.
- Embedded rules (Mode 2) carry their `schemaVersion` at the top of the AST when needed; migrations traverse method-config tables to update them.

### 10.7 Very deeply nested rules

- Hard cap: 8 levels. Enforced at save (§5.11).
- Evaluator additionally has a runtime recursion guard; if somehow a rule exceeds the cap (e.g., from a corrupt import), evaluation aborts and emits `shipping.rule.evaluation_failed`.

### 10.8 Regex denial of service

- Only a safe, RE2-style subset is accepted (`validator.ts` uses a pattern linter that rejects nested quantifiers, backreferences, lookahead/lookbehind).
- At evaluation time, a per-regex 1 ms timeout is enforced. A timeout → leaf is `false`, path added to `missingFields` with a `"regex_timeout"` annotation, event emitted.

### 10.9 Currency mismatch

- `cart.currencyCode` is part of the context. A rule comparing `cart.subtotalAmount ≥ 7500` always uses cart currency minor units. The merchant is responsible for pairing currency-aware rules (e.g., rule chains like "currency == USD AND subtotal ≥ 7500").
- Admin UI offers a "currency-aware" quick-pick template that builds the AND wrapper automatically.

### 10.10 Very large string / array inputs

- Evaluator has input-size guards: arrays in context capped at 10,000 entries (practical checkout maximum is far lower); string fields capped at 4 KB. Over-limit → field treated as missing; event emitted.

### 10.11 Deleting a rule referenced by a method

- `deleteRule` refuses and returns the reference list (see §6.3). Merchants must first detach or replace.
- `isActive = false` is always allowed; an inactive named rule referenced by a method behaves as "always false" (method is unavailable); a warning is shown on both the rule page and the referring method's page.

### 10.12 Partial context (rate previews)

- Admin "preview rates" UI may provide an incomplete context (e.g., no customer when simulating a guest). Missing fields behave per §10.3; the test panel clearly indicates which leaves were affected.

---

## 11. Testing Requirements

The Rules Engine is foundational; its test coverage must be **exhaustive** before Layer B methods begin integration.

### 11.1 Unit tests — operators

One or more tests per operator, against every compatible field type:

- `eq`, `neq` — strings, numbers, booleans, currency codes, country codes.
- `gt`, `gte`, `lt`, `lte` — positive, zero, negative, boundary values.
- `in`, `not_in` — hit, miss, empty values list (rejected at validate), 100-entry boundary.
- `contains`, `not_contains` — hit, miss, empty array, deduped array.
- `starts_with` — hit, miss, case, empty string.
- `regex_match` — hit, miss, unsafe pattern rejected, timeout path.
- `between` — inclusive boundaries, min == max, min > max (rejected at validate).
- `exists` — present true, present false, null, undefined.
- `and` — all true, one false, short-circuit on first false verified.
- `or` — all false, one true, short-circuit on first true verified.
- `not` — boolean inversion, interaction with missing fields.

### 11.2 Unit tests — fields

One or more tests per field in §5.10, exercising its declared type boundaries.

### 11.3 Compound rule tests

- Nested AND/OR/NOT trees up to depth 8.
- Realistic examples from §5.12 (A–D) plus the Table Rate row scenarios from §8.
- Mixed field categories (cart + shipping + customer) in a single rule.

### 11.4 Validator tests

- Every validation error code has a test (unknown field, bad op/field combo, depth > 8, empty `rules`, `between.min > max`, unsafe regex, type-mismatched value).
- Round-trip: every valid example serializes, deserializes, and revalidates identically.

### 11.5 Performance tests

- Evaluator must complete depth-8, 50-leaf rules in < 10 ms on target hardware (p99).
- Regression benchmark in CI; fails if p99 regresses by > 25%.

### 11.6 Property-based tests

- Generator produces random valid ASTs (bounded by depth and field allowlist).
- Properties verified:
  - `eval(rule, ctx) === eval(rule, ctx)` (determinism).
  - `eval(not(rule), ctx) === !eval(rule, ctx)` for totally-defined contexts.
  - De Morgan: `eval(not(and(a,b)), ctx) === eval(or(not(a), not(b)), ctx)`.

### 11.7 Migration tests

- For every introduced `schemaVersion > 1`, a regression test upgrades a corpus of version-1 rules and verifies semantic equivalence on a context battery.

### 11.8 Admin UI tests

- RuleBuilder renders every example in §5.12 from AST and produces the same AST back.
- Depth cap disables the "Add group" button at level 8.
- Type-aware operator filtering — selecting `cart.shippingClasses` exposes only array operators.
- Test panel round-trips sample contexts.

### 11.9 Integration tests

- End-to-end: Free Shipping method with a saved rule is evaluated by the Rate Calculation Pipeline (A7) against a real cart; passing/failing carts yield correct availability.
- Table Rate method with 5 rate rows, each with a different gating rule; verify first-match-wins ordering.

---

## 12. Success Criteria

- **Performance:** `evaluateRule` p99 < 10 ms on a depth-8, 50-leaf rule against a fully-populated context, on the target Convex runtime.
- **Coverage:** Every use case documented in the WooCommerce Table Rate Shipping (paid plugin) documentation is expressible as a rule in this engine without resorting to custom logic. Concretely: weight-based tiering, subtotal-based tiering, item-count tiering, shipping-class membership conditions, per-class rates, destination-country conditions, postal-code prefix conditions, per-customer-tag exclusions, coupon-code gating.
- **Correctness:** Zero `shipping.rule.evaluation_failed` events in production over a 30-day window after Layer B rollout, excluding intentional merchant misconfigurations surfaced through the admin health warnings.
- **Adoption:** All nine downstream method types (§3) use the engine; none implements its own predicate system.
- **Usability:** A new merchant can compose Example A from §5.12 in the RuleBuilder in under 60 seconds without consulting documentation.
- **Safety:** No unbounded regex, no stack overflow, no evaluation path > 50 ms, even under adversarial fuzz inputs.
- **Determinism:** Evaluating the same rule against the same context on two different Convex instances yields identical `matched` and `trace`.

---

## 13. Roles & Capabilities

### New capability

| Capability key | Description | Default grants |
|---|---|---|
| `admin.shipping.rules.manage` | Create, read, update, delete named shipping rules. Required to save method configs that embed an AST. | Administrator, and any custom role with Commerce management. |

### Capability scope

- **Administrator:** Full manage; may also force-hard-delete rules (bypasses the "soft delete only" default by passing an explicit `force: true`).
- **Editor / Author / Contributor / Subscriber:** No shipping capabilities by default.
- **Read-only future extension:** A `admin.shipping.rules.view` capability may be split out if merchants want to delegate auditing without granting edit. Deferred.

### Enforcement

- All mutations/queries in §6 call `requireCan(ctx, "admin.shipping.rules.manage")` (or the read variant when introduced).
- The RuleBuilder is rendered read-only if the viewing user lacks the manage capability.

---

## 14. Events Fired

All events go through the Event Dispatcher System using the project's `emitEvent` helper.

| Event key | When emitted | Payload |
|---|---|---|
| `shipping.rule.created` | New named rule persisted via `saveRule`. | `{ ruleId, slug, name, appliesTo, createdBy }` |
| `shipping.rule.updated` | Existing named rule updated via `saveRule` or `activation` toggle. | `{ ruleId, slug, changedFields, updatedBy }` |
| `shipping.rule.deleted` | Named rule deleted (soft or hard) via `deleteRule`. | `{ ruleId, slug, hard: boolean, deletedBy }` |
| `shipping.rule.evaluation_failed` | Evaluator encountered a malformed AST, unsupported `schemaVersion`, regex timeout, input-size violation, or recursion-guard trip. | `{ ruleId?, methodId?, methodType?, reason: "malformed_ast" \| "unsupported_version" \| "regex_timeout" \| "input_too_large" \| "depth_exceeded", detail? }` |

Embedded rules (Mode 2) do not fire create/update/delete events from this system — the owning method's save mutation emits its own `shipping.method.*` events; the rule is part of that method's diff. However, `shipping.rule.evaluation_failed` fires for both Mode 1 and Mode 2 rules, keyed by `methodId` when applicable.

---

## 15. References

- **JSON Logic** — <https://jsonlogic.com/> — AST shape, operator naming, JSON-only guarantee, de-referenced safety model.
- **Shopify Functions — `shipping.run`** — <https://shopify.dev/docs/api/functions/reference/delivery-customization> — The "pure function from cart to boolean/discount" design pattern and the decoupling of "does this apply?" from "what's the rate?"
- **Stripe — condition expressions in Automations** — condition builder UX, field/operator/value triplet, preview-against-sample pattern.
- **Cloudflare Workers Routing Rules** — nested AND/OR predicate UI, drag-to-reorder rows, type-aware operator filtering.
- **WooCommerce Table Rate Shipping (paid plugin)** — reference for merchant expectations: weight tiers, class membership gating, zone-aware availability, first-match-wins row ordering.
- **RE2** — <https://github.com/google/re2/wiki/Syntax> — the safe regex subset used by the safe-pattern linter (no backreferences, no lookaround, linear-time guarantee).

---

## Cross-Reference Summary

| Referenced system | PRD ID | Relationship |
|---|---|---|
| Shipping Zones | A1 | Upstream; provides `shipping.zone*` context fields. |
| Shipping Classes | A2 | Upstream; provides `cart.shippingClasses` context field. |
| Rate Calculation Pipeline | A7 | Downstream orchestrator; owns `buildShippingContext` and calls the evaluator. |
| Flat Rate | B1 | Consumer — optional availability rule. |
| Weight-Based | B2 | Consumer — availability and per-tier gating. |
| Dimensional | B3 | Consumer — package-size gating. |
| Price-Based | B4 | Consumer — tier selection. |
| Quantity-Based | B5 | Consumer — tier selection. |
| Free Shipping | B6 | Primary conditional consumer. |
| Local Delivery | B8 | Consumer — ZIP/postal filters. |
| Table Rate | B9 | Heaviest consumer — one rule per rate row. |
| Event Dispatcher | Event Dispatcher System | Emits lifecycle and failure events. |
| Role & Capability | Role & Capability System | `admin.shipping.rules.manage`. |
| Audit Log | Audit Log System | Rule lifecycle events are audit-logged. |
