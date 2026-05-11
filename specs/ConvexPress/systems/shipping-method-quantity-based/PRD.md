# PRD B4 — Quantity-Based Shipping Method

**System ID:** `shipping-method-quantity-based`
**Layer:** B (Shipping Method Type)
**Status:** Draft
**Owner:** Commerce / Shipping
**Depends On:** PRD A1 (Shipping Zones), PRD A2 (Shipping Classes), PRD A6 (Shipping Rules Engine), PRD A7 (Rate Calculation Pipeline), PRD B2 (Weight-Based Shipping — sibling, same tier structure with item count as key)

---

## 1. Context & Intent

Quantity-Based Shipping charges the customer based on how many items are in the cart rather than how much those items weigh or cost. This is the shipping model that maps cleanly onto merchants whose fulfillment cost scales with item count: apparel stores that ship each garment in its own poly mailer, print-on-demand shops where each print is packed and shipped independently, small-goods merchants whose per-unit handling time is the dominant cost, and subscription-style stores with uniform-sized items.

**Where weight-based shipping (PRD B2) answers "what does this cart weigh?", quantity-based shipping answers "how many things are in this cart?"** The two are structurally identical — a tiered table with an open-ended top tier and optional incremental charge — but differ in the key used for tier lookup. A merchant selling 200 T-shirts of identical fulfillment cost does not want to maintain accurate per-SKU weights; they want to say "1 shirt = $5, 2–5 shirts = $8, 6+ = $12 plus $1 per extra shirt" and move on.

**ConvexPress currently has no quantity-based shipping method.** WooCommerce's "Table Rate Shipping" and Shopify's "Price/Weight/Item-count-based rates" both offer item-count as a first-class option, and merchants evaluating ConvexPress expect parity. Without this method, merchants whose businesses naturally price by quantity must either mis-model every SKU with contrived weights to approximate a count, or configure flat-rate shipping that loses money on multi-item carts. Both are non-starters.

This PRD specifies the Quantity-Based Shipping Method — a concrete method type that plugs into the shipping pipeline defined by PRD A7 (Rate Calculation Pipeline), attaches to zones defined by PRD A1 (Shipping Zones), and honors class-scoped count tables from PRD A2 (Shipping Classes) when the merchant wants per-class pricing. It intentionally mirrors PRD B2's tier semantics so merchants who understand one method understand both.

**Goals:**

- Full parity with WooCommerce Table Rate's "per item" and "per line item" conditions, and with Shopify's "Based on item count" rate rows.
- Three distinct count modes — total items, total distinct line items, and per-shipping-class count — to cover the range of real-world fulfillment models.
- Per-shipping-class override tables (same structural pattern as PRD B2), so that oversized or fragile classes can price on a separate count table.
- Open-ended top tier with per-unit incremental charge ("and $1 for each additional item above 5").
- Deterministic, side-effect-free calculation that fits inside the rate pipeline performance budget (sub-5 ms for typical carts).
- Zero rounding error — all monetary output is integer minor units (cents); no floating-point drift.

**Non-Goals:**

- Weight tiers — PRD B2 owns that key.
- Price tiers (cart subtotal) — PRD B5 (Price-Based Shipping) owns that key.
- Dimensional or volumetric pricing — PRDs B3/B4-Volumetric.
- Live carrier lookups — PRD B7.
- Free shipping thresholds — PRD B5.
- Handling fees and surcharges — applied by PRD A7 as pipeline steps, not inside this method.

---

## 2. Scope

### In Scope

- New Convex table `commerce_shipping_method_quantity_based` storing per-method tier tables keyed on item count.
- CRUD mutations and queries scoped to an administrator with `admin.shipping.methods.manage` capability.
- Tier table editor embedded inside the zone method editor from PRD A1 — same widget shape as PRD B2's weight-tier editor.
- `countMode` selector with three values: `total_items`, `total_line_items`, `per_shipping_class`.
- Tier matching algorithm (inclusive min, exclusive max, first-match-wins — same semantics as PRD B2).
- Open-ended top tier with `incrementalCost` and `incrementalCount` to charge "$X + $Y per additional Z items above the top boundary".
- Per-shipping-class override tables — each class may replace the full tier table for its subset of the cart. Available only when `countMode === "per_shipping_class"`.
- Preview panel showing "Cart has N items → tier K → $M.MM" with live recomputation as the merchant edits.
- `MethodRateCalculator` contract implementation so the method registers itself with the rate pipeline (PRD A7).
- Storefront label hints ("1 item", "2–5 items") driven by the matched tier.

### Out of Scope

- Weight, price, dimensional, volumetric keys — separate methods.
- Fractional quantities — the cart line-item quantity model is integer-only; this method does not attempt to support fractions and will reject non-integer quantities defensively.
- Per-SKU shipping overrides — PRD B6.
- Free shipping over N items — expressible via PRD A6 (Rules Engine) gating this method or a sibling method.
- Tax on shipping — handled by the Tax system.

---

## 3. Dependencies

**Upstream (required before this method is functional):**

- **PRD A1 — Shipping Zones.** A quantity-based method always attaches to exactly one zone. Without zones there is nowhere to configure a method.
- **PRD A2 — Shipping Classes.** Per-class overrides and the `per_shipping_class` count mode depend on the shipping class registry and the mixed-cart aggregation rule (`per_class_sum` or `highest_class`).
- **PRD A6 — Shipping Rules Engine.** Optional `ruleId` on the method gates availability via the rule engine (e.g., "only show this method if subtotal > $25").
- **PRD A7 — Rate Calculation Pipeline.** Defines the `MethodRateCalculator` contract, the cart model passed in, and the `Quote` return type.
- **PRD B2 — Weight-Based Shipping.** Sibling method. Shares the tier shape (`{minCount, maxCount, cost, incrementalCost, incrementalCount}` mirrors `{minWeight, maxWeight, cost, incrementalCost, incrementalWeight}`) and the validator/editor patterns. Any substantive change to tier semantics must be reflected in both PRDs.

**Downstream (consumers of this PRD):**

- None. This is a leaf method. Checkout reads quotes from the pipeline (A7), not directly from this method.

---

## 4. Schema

### Table: `commerce_shipping_method_quantity_based`

Defined in `convex/schema/shipping.ts` and exported as part of `shippingTables`.

| Field | Type | Notes |
|-------|------|-------|
| `zoneId` | `v.id("commerce_shipping_zones")` | Required. Indexed. The zone this method belongs to. |
| `name` | `v.string()` | Internal admin-facing name, e.g., "Apparel Per-Item Rate". |
| `label` | `v.string()` | Customer-facing label at checkout, e.g., "Standard Shipping". |
| `description` | `v.optional(v.string())` | Optional customer-facing description. |
| `countMode` | `v.union(v.literal("total_items"), v.literal("total_line_items"), v.literal("per_shipping_class"))` | Determines what is counted. See Section 5. |
| `tiers` | `v.array(tierValidator)` | Ordered list of tiers. See Tier shape below. Used when `countMode` is `total_items` or `total_line_items`, or as the default when `per_shipping_class` and a class has no override. |
| `classOverrides` | `v.array(classOverrideValidator)` | Per-class tier tables. Only evaluated when `countMode === "per_shipping_class"`. Empty array = no overrides (falls through to `tiers` for every class). |
| `enabled` | `v.boolean()` | Merchant can disable without deleting. |
| `sortOrder` | `v.number()` | Display order within the zone. |
| `ruleId` | `v.optional(v.id("commerce_shipping_rules"))` | Optional PRD A6 rule gating availability. |
| `labelHintTemplate` | `v.optional(v.string())` | Optional template for appending tier hint to label, e.g., `"{label} ({minCount}–{maxCount} items)"`. |
| `createdAt` | `v.number()` | |
| `updatedAt` | `v.number()` | |
| `createdBy` | `v.id("users")` | |

**Tier shape (`tierValidator`):**

| Field | Type | Notes |
|-------|------|-------|
| `minCount` | `v.number()` | Inclusive lower bound. Integer ≥ 0. |
| `maxCount` | `v.union(v.number(), v.null())` | Exclusive upper bound. `null` means open-ended (top tier). Integer ≥ `minCount + 1` when non-null. |
| `cost` | `v.number()` | Base cost for any cart landing in this tier. In store's currency minor units (cents). Non-negative integer. |
| `incrementalCost` | `v.optional(v.number())` | Cost per `incrementalCount` items beyond the anchor. Non-negative integer minor units. Only meaningful when `maxCount` is `null` or when the merchant wants per-unit markup within a closed tier. |
| `incrementalCount` | `v.optional(v.number())` | Size of the increment in items. Defaults to `1`. Positive integer. |
| `incrementalMode` | `v.optional(v.union(v.literal("above_min"), v.literal("above_max_of_previous")))` | Defaults to `"above_min"`. Controls whether incremental cost is measured from the tier's `minCount` or from the previous tier's `maxCount`. Direct analog of PRD B2. |

**ClassOverride shape (`classOverrideValidator`):**

| Field | Type | Notes |
|-------|------|-------|
| `classId` | `v.id("commerce_shipping_classes")` | References the class from PRD A2. |
| `tiers` | `v.array(tierValidator)` | Full replacement tier table for this class, keyed on that class's item count. |

### Indexes

- `by_zone` on `["zoneId", "sortOrder"]` — lists methods inside a zone.
- `by_zone_enabled` on `["zoneId", "enabled"]` — rate pipeline (PRD A7) filters enabled methods per zone.
- `by_rule` on `["ruleId"]` — PRD A6 can invalidate dependent methods.

### Example Document

```
{
  zoneId: "zn_us_domestic",
  name: "Apparel Per-Item Rate",
  label: "Standard Shipping",
  countMode: "total_items",
  tiers: [
    { minCount: 1, maxCount: 2,    cost: 500 },
    { minCount: 2, maxCount: 6,    cost: 800 },
    { minCount: 6, maxCount: null, cost: 1200, incrementalCost: 100, incrementalCount: 1, incrementalMode: "above_min" }
  ],
  classOverrides: [],
  enabled: true,
  sortOrder: 0,
  labelHintTemplate: "{label} ({minCount}-{maxCount} items)"
}
```

This document encodes the canonical "1 item = $5, 2–5 items = $8, 6+ = $12 + $1 per extra item" example from the scope statement.

---

## 5. Data Model

### Count Mode Semantics

`countMode` determines what integer N is fed to the tier-lookup algorithm. Three modes:

**`total_items`** — N is the sum of `item.quantity` across every line in the cart. A cart with `[{sku:A, qty:3}, {sku:B, qty:2}]` yields `N = 5`. This is the simplest and most common mode and mirrors WooCommerce's "Item count" condition.

**`total_line_items`** — N is the number of distinct lines in the cart, regardless of each line's quantity. The same cart yields `N = 2`. Used by merchants whose handling cost scales with SKU diversity (picking distinct items) rather than with unit count (e.g., fulfillment with pre-packed single-SKU boxes).

**`per_shipping_class`** — N is computed per shipping class. For each class represented in the cart, the method computes `N_class = sum of item.quantity for items tagged with that class`, looks up the tier table for that class (either the class's override or the default `tiers` if no override), computes a sub-cost, and reports one sub-quote per class group to the pipeline. The pipeline (PRD A7) then applies the class aggregation rule from PRD A2 (`per_class_sum` or `highest_class`).

Merchant-facing phrasing in the UI:

- `total_items` — "Count total number of items (sum of quantities)."
- `total_line_items` — "Count distinct line items (ignore quantities)."
- `per_shipping_class` — "Count per shipping class with a separate tier table per class."

### Tier Matching Algorithm

Given a resolved item count `N` (integer ≥ 0), select the first tier where `tier.minCount <= N < tier.maxCount`. For the open-ended top tier (`maxCount === null`), the match condition is `tier.minCount <= N`.

Tiers are stored in insertion order; the editor enforces and the validator asserts that they are sorted ascending by `minCount`, do not overlap, and do not leave unintended gaps (gaps are permitted — a count in a gap simply does not match). Because the domain is integers and typically small (1–20 tiers), linear scan is the reference implementation.

### Boundary Semantics

- **Inclusive min, exclusive max** — exactly matches PRD B2. A cart with `N = 2` against tiers `[1,2)` and `[2,6)` matches the second tier.
- **Top tier open-ended** — `maxCount: null` catches any cart at or above `minCount`. A merchant may also use a large integer (e.g., 99999) for a closed top tier; both are permitted by validation but the UI recommends open-ended.
- **Exact-boundary tie-break** — always resolves to the upper tier because of the exclusive-max rule. Documented and tested explicitly.

### Top-Tier Incremental Cost

When the matched tier has `incrementalCost` set, the final cost is:

```
baseCost = tier.cost
anchor = incrementalMode === "above_min" ? tier.minCount : previousTier.maxCount
overage = max(0, N - anchor)
increments = ceil(overage / tier.incrementalCount)
finalCost = baseCost + increments * tier.incrementalCost
```

Because `N` and `incrementalCount` are both integers, `overage / incrementalCount` is a rational with an integer ceiling; the math is exact. For the canonical example, a cart with 9 items matches the third tier: `overage = 9 - 6 = 3`, `increments = ceil(3 / 1) = 3`, `finalCost = 1200 + 3 * 100 = 1500` cents ($15.00).

### Per-Class Override Resolution

Available only when `countMode === "per_shipping_class"`. Overrides replace the tier table for the matched class — they do not merge. This matches PRD B2's "full replace" semantic. Classes without an override use the top-level `tiers` array.

The cross-class aggregation rule (`per_class_sum` or `highest_class`) comes from PRD A2 and is applied by the pipeline (PRD A7), not this method. The method reports one `{classId, count, cost}` record per class group.

### Cart Count Computation

```
computeCartCount(items, mode, classId?):
  switch mode:
    case "total_items":
      return sum over items of item.quantity
    case "total_line_items":
      return items.length
    case "per_shipping_class":
      require classId argument
      return sum over items where item.shippingClassId === classId of item.quantity
```

Items with `quantity <= 0` are defensively filtered out (they should never appear in a valid cart but the method does not trust upstream). Items with `quantity` that is not a finite integer are clamped to `Math.max(0, Math.floor(quantity))` before summing; non-integer quantities should have been rejected upstream in cart validation, but this method clamps to avoid NaN propagation.

### No Unit Conversion Layer

Unlike PRD B2, there is no unit-conversion step — item count is a dimensionless integer. This eliminates an entire class of float edge cases that PRD B2 has to reason about (0.1 + 0.2 drift). Tier boundaries are integers, cart counts are integers, comparison is exact.

---

## 6. Functions / API

All functions live in `convex/shipping/methods/quantityBased.ts` unless otherwise noted. Naming follows the per-system function-organization rules from the project CLAUDE.md.

### Mutations

- `create(zoneId, config)` — inserts a new method. Validates tier shape, sort, non-overlap, `countMode` membership, integer-ness of count fields, class existence for overrides. Requires `admin.shipping.methods.manage`.
- `update(methodId, patch)` — partial update. Re-runs full validation on the merged document. Requires `admin.shipping.methods.manage`.
- `delete(methodId)` — hard delete. No referential integrity concern downstream; pipeline recomputes on next cart change. Requires `admin.shipping.methods.manage`.
- `reorder(zoneId, orderedIds)` — bulk update of `sortOrder` inside a zone.
- `setEnabled(methodId, enabled)` — convenience toggle.
- `addTier(methodId, tier, position)`, `removeTier(methodId, index)`, `updateTier(methodId, index, patch)` — granular tier editors used by the admin UI to keep Convex writes small.
- `setCountMode(methodId, countMode)` — convenience endpoint; changing count mode may invalidate `classOverrides` (they are preserved on the document but become inert when mode is not `per_shipping_class`).
- `addClassOverride(methodId, classId)` / `removeClassOverride(methodId, classId)` / `updateClassOverrideTier(...)` — per-class table editors; gated to `per_shipping_class` mode at the UI layer but server-side accepts regardless so mode flips don't destroy data.

### Queries

- `listByZone(zoneId)` — returns methods in sort order. Consumed by admin UI and by the rate pipeline.
- `get(methodId)` — single-document fetch.

### Internal

- `calculateQuantityBased(methodConfig, cart)` — internal function registered with the rate pipeline. Pure function; does no database reads; receives pre-resolved config. Returns a `Quote` matching PRD A7's shape: `{ methodId, label, amount, currency, meta: { countMode, matchedTier, cartCount, classBreakdown? } }`. For `per_shipping_class` mode, `classBreakdown` is an array of `{ classId, count, matchedTierIndex, cost }` sub-records that the pipeline uses to apply aggregation.
- `computeCartCount(items, mode, classId?)` — helper. Lives in `convex/shipping/helpers/count.ts` or co-located; shared with any future count-consuming method.
- `matchTier(tiers, count)` — pure tier lookup; returns matched tier index or `null`.
- `computeTierCost(tier, previousTier, count)` — pure cost calculation including incremental logic. Re-used identically by the preview panel and the pipeline calculator.
- `validateTierTable(tiers)` — internal validator returning an array of errors (empty = valid). Enforces: integer non-negative counts, `minCount < maxCount` for closed tiers, no overlap, monotonic ordering, at most one open-ended tier and it must be last, monetary values are non-negative integers, `incrementalCount > 0` when `incrementalCost` set, `incrementalCost` is non-negative integer.

### Method Registration

The method registers with the rate pipeline (PRD A7) by calling `registerMethodCalculator("quantity_based", calculateQuantityBased)` at module load time in `convex/shipping/methods/index.ts`. This is the same registration point PRD B2 uses; both methods co-exist and are dispatched side-by-side.

---

## 7. Admin UX

### Entry Point

From the Zone Editor (PRD A1), merchant clicks "Add Method" → selects "Quantity-Based Shipping" from the method type picker. The method editor opens as a full page at `/admin/commerce/shipping/zones/$zoneId/methods/$methodId` — no modals, per the project UI rules.

### Layout

- **Header metabox:** `name`, `label`, `description`, `enabled` toggle.
- **Count mode selector:** three-option segmented control with inline hints:
  - "Total items (sum of quantities)"
  - "Distinct line items (ignore quantities)"
  - "Per shipping class (separate table per class)"
  - Switching to `per_shipping_class` reveals the per-class overrides section below; switching away hides it but preserves the data.
- **Tier table editor:** primary control. One row per tier, columns: Min Count, Max Count, Cost, Incremental Cost, Incremental Count. Buttons: "Add tier", drag-reorder handle, remove row. The last row may check "Open-ended" which disables Max Count and enables the incremental columns.
- **Per-class overrides accordion:** only visible when `countMode === "per_shipping_class"`. A list of shipping classes (from PRD A2). Each class can be toggled on; when on, an embedded tier table editor appears (same widget as the default tier table). A class with no override falls through to the default `tiers` — the UI states this explicitly.
- **Rule gate selector:** optional dropdown sourced from PRD A6 rules.
- **Label hint template:** text input with live preview.
- **Preview panel:** fixed at the bottom of the editor. Inputs depend on count mode:
  - `total_items`: a single integer "cart item count".
  - `total_line_items`: a single integer "distinct line count".
  - `per_shipping_class`: a grid where the merchant enters a count per configured class.
  - Output: matched tier per group, computed cost, and the full formula trace (e.g., "1200 + ceil((9 − 6) / 1) × 100 = 1500").

### Validation Surfacing

- Inline row errors for overlaps, non-monotonic boundaries, non-integer values, negative values.
- Form-level errors for "at most one open-ended tier" and "open-ended tier must be last".
- Mode-specific errors: class overrides present while not in `per_shipping_class` mode render as a warning (data retained but inert), not an error.
- Save button is disabled while any blocking error is present.
- Server-side validation re-runs on every mutation and returns the same error shape so optimistic UI and server agree.

### Admin Preview Examples

The preview seeds with three example counts the first time the editor opens: `1`, `3`, `9`. The merchant can edit them or add more. Each example renders as a row: input count, matched tier index, computed cost, and the formula trace.

---

## 8. Merchant Workflow

**Scenario:** "How do I charge $5 for 1 item, $8 for 2–5 items, $12 for 6+ with $1 per additional item?"

1. Admin → Commerce → Shipping → Zones → "United States" (or whichever zone applies).
2. Click "Add Method" → select "Quantity-Based Shipping".
3. Set **Name** = "Apparel Per-Item", **Label** = "Standard Shipping".
4. Leave **Count mode** on the default "Total items (sum of quantities)".
5. Tier table defaults to a single row `[1, ∞)` at $0. Merchant edits:
   - Row 1: Min 1, Max 2, Cost $5.00.
   - Click "Add tier" → Row 2: Min 2, Max 6, Cost $8.00.
   - Click "Add tier" → Row 3: Min 6, Max ∞ (toggle Open-ended), Cost $12.00, Incremental $1.00, Incremental Count 1, Mode "above_min".
6. In the preview panel, type `1` → "Tier 1, $5.00". Type `3` → "Tier 2, $8.00". Type `9` → "Tier 3, $12.00 + ceil(3/1) × $1.00 = $15.00".
7. Save.

**Scenario variant — count by distinct lines:** at step 4, switch mode to "Distinct line items". Now a cart of `[{sku:A, qty:10}]` is `N = 1` (one line), not 10. Useful for merchants whose cost scales with SKU picking rather than unit count.

**Scenario variant — per-class pricing for oversized items:** at step 4, switch mode to "Per shipping class". In the per-class overrides accordion, enable class "Oversized" and give it a steeper tier table (e.g., $15 for 1, $25 for 2–3, $40 for 4+ with $10 per extra). A cart with 2 standard items and 1 oversized item emits two sub-quotes (one per class) and the pipeline aggregates per the rule configured in PRD A2.

---

## 9. Storefront UX

### Checkout Display

During checkout (or in the cart estimator), the customer sees a shipping method row rendered from the method's resolved quote:

- **Label:** from `label` plus the optional `labelHintTemplate`. For the canonical example with `labelHintTemplate = "{label} ({minCount}-{maxCount} items)"` and a 3-item cart matching tier 2 `[2,6)`, the rendered label is `"Standard Shipping (2-5 items)"` (the editor renders `maxCount` minus 1 in hint text because the range is exclusive-max — see Section 10.1).
- **Amount:** formatted currency from the quote's `amount`.
- **ETA:** not owned by this PRD; rendered alongside if supplied by PRD A1.

For the open-ended top tier, `{maxCount}` substitutes as "and up" (e.g., "Standard Shipping (6+ items)"). Template tokens:

- `{label}` — method label.
- `{minCount}` — matched tier's inclusive lower bound.
- `{maxCount}` — matched tier's display upper bound (`maxCount - 1` for human display, "and up" when `null`).
- `{cartCount}` — the computed cart count (mode-dependent).

### Fallback When Zone Matches Nothing

If the customer's address is outside every configured zone (PRD A1 owns that determination), this method is not considered. The storefront displays "No shipping available to this address" from the pipeline's zero-quote fallback, not from this method.

### Currency

This method emits amounts in the store's base currency. Multi-currency display conversion is handled downstream by the currency system, not here.

---

## 10. Edge Cases

### 10.1 Inclusive-min / exclusive-max display gap

Because tiers are `[min, max)`, the human-readable range is "min through max − 1". A tier `[2, 6)` covers counts 2, 3, 4, 5 — the merchant writes "2–5 items" in plain English. The label hint template handles this automatically by subtracting 1 from `maxCount` when substituting `{maxCount}`. Documented and tested so merchants don't type "2–6" and get confused.

### 10.2 Cart has zero items

Counts are always computed on a cart that the pipeline has decided is shippable. A zero-item cart should never reach the rate calculation step (the pipeline short-circuits earlier). Defensively, if `N = 0` is passed in, the method returns no quote (no tier matches because typical tier 1 starts at `minCount = 1`). If a merchant intentionally configures a tier starting at `minCount = 0`, that tier matches and emits its configured cost. No special-case; zero is a valid count like any other.

### 10.3 Very large item counts

A wholesale cart with 10,000 items against the canonical tiers matches tier 3: `overage = 10000 - 6 = 9994`, `increments = 9994`, `finalCost = 1200 + 9994 * 100 = 1,000,600` cents = $10,006.00. Arithmetic is safe — integer math up to 2^53 is lossless in JavaScript's Number, and this value is far below that ceiling. Documented as "no upper bound on output".

### 10.4 Fractional quantities

Not representable. The cart schema enforces integer quantities upstream (PRD Commerce Products / Cart). Defensively, `computeCartCount` applies `Math.max(0, Math.floor(quantity))` to every line item's quantity before summing, so a corrupted float quantity cannot cause NaN or tier-flap. The method's tier editor rejects non-integer `minCount`, `maxCount`, `incrementalCount` values at validation time.

### 10.5 Boundary conditions (exact integer match)

A cart with `N = 2` against tiers `[1, 2)` and `[2, 6)` matches the second tier (exclusive-max). A cart with `N = 6` against `[2, 6)` and `[6, null)` matches the third tier. Because counts are integers, there is no floating-point adjacency concern — `N` is exactly what it is.

### 10.6 Per-class mode with mixed cart

Cart contains 3 items in class "Standard" and 2 items in class "Oversized". `countMode = per_shipping_class`, aggregation rule from PRD A2 is `per_class_sum`. The method reports two sub-records: `{class: Standard, count: 3, cost: 800}` and `{class: Oversized, count: 2, cost: tier-from-override}`. The pipeline sums them. If the rule were `highest_class`, the pipeline takes the max.

### 10.7 Per-class mode with an unclassified item

An item with no `shippingClassId` in a cart processed with `countMode = per_shipping_class` is treated as belonging to a synthetic "default" group that uses the top-level `tiers` table. This mirrors PRD A2's default-class fallback and ensures no item is dropped silently from the count.

### 10.8 `countMode = total_line_items` with mixed-quantity lines

A cart with `[{sku:A, qty:1}, {sku:B, qty:10}, {sku:C, qty:5}]` has `N = 3` (three distinct lines). Tier lookup uses 3, not 16. This is the defining behavior of the mode and is the reason it exists as a distinct option rather than being collapsed with `total_items`.

### 10.9 Closed top tier and a count above the max

If the merchant configures tier 3 as `[6, 10)` (closed) and the cart has `N = 15`, no tier matches and the method returns no quote. Validation warns at configuration time: "Counts above 10 will not match any tier. Consider using an open-ended top tier." Pipeline falls back to other methods or to "No shipping available".

### 10.10 Empty `tiers` array

Validation rejects. A quantity-based method must have at least one tier. The default when adding a new method is a single `[1, ∞)` row at $0 which the merchant is expected to edit.

### 10.11 Class override references a deleted class

PRD A2 emits `shipping.class.deleted`. This method subscribes and removes any `classOverrides` entries referencing the deleted class. Same behavior as PRD B2.

### 10.12 Switching `countMode` after configuration

Switching `total_items` ↔ `total_line_items` is safe — the tier table is still meaningful; only the interpretation of N changes. Switching to or from `per_shipping_class` does not mutate `classOverrides` — they are preserved on the document but become inert when the mode is not `per_shipping_class`. The UI surfaces this as a non-blocking warning so the merchant is aware.

### 10.13 Disabling the method vs. deleting it

`enabled: false` preserves configuration but excludes the method from pipeline dispatch. Admin UI surfaces disabled methods greyed out with a "Disabled" chip.

### 10.14 Multiple quantity-based methods in the same zone

Fully supported. A zone may have "Standard Per-Item", "Expedited Per-Item", and "Overnight Per-Item" as three separate quantity-based methods with different tiers; all are offered to the customer.

### 10.15 Incremental anchor modes differ between tiers

`incrementalMode` is per-tier, so a merchant can choose "above_min" for one tier and "above_max_of_previous" for another. Unusual but permitted; the formula in Section 5 is parameterized on the per-tier value.

### 10.16 `total_line_items` with shipping-class per-line conflict

If a merchant selects `total_line_items` but still has `classOverrides` configured, the overrides are inert (the mode doesn't read per-class counts). The admin UI surfaces this as a non-blocking warning. The data is preserved so the merchant can switch back to `per_shipping_class` without losing their override tables.

---

## 11. Testing Requirements

### Unit tests (pure functions)

- **Tier matching**
  - Count in first tier, middle tier, top tier.
  - Exact lower-boundary count (matches that tier).
  - Exact upper-boundary count (matches next tier; or no match if top is closed).
  - Count below first tier's min (no match; expected only if first tier doesn't start at 0).
  - Count above closed top tier's max (no match).
  - Count above open-ended top tier's min (matches, applies incremental).
- **Incremental cost**
  - Overage exactly on an increment boundary (`N = 6` against top tier starting at 6 with 1-unit increments → `ceil(0/1) = 0` increments, baseCost only).
  - Overage of 1 (`N = 7` → 1 increment).
  - Large overage (`N = 1000` → 994 increments).
  - Non-1 `incrementalCount` (e.g., "$2 per 3 additional items"): `N = 10` against tier `[6, null)` with increment 3 → `ceil(4/3) = 2` increments.
  - `incrementalMode: "above_max_of_previous"` vs `"above_min"` produce different anchors; test both.
- **Count mode**
  - `total_items`: cart `[{qty:3},{qty:2}]` → N = 5.
  - `total_line_items`: same cart → N = 2.
  - `per_shipping_class`: mixed-class cart produces per-class sub-quotes.
  - `per_shipping_class` with no overrides: every class uses default `tiers`.
  - `per_shipping_class` with an unclassified item: defaults to the top-level table.
- **Per-class overrides**
  - Single-class cart using override.
  - Mixed-class cart with `per_class_sum` aggregation.
  - Mixed-class cart with `highest_class` aggregation.
  - Class without override falls through to default tiers.
  - Override with only one tier (open-ended) — covers the entire count domain at one price.
- **Defensive clamping**
  - Item with `quantity = 0` → contributes 0.
  - Item with `quantity = 2.7` → treated as 2 (floor).
  - Item with `quantity = -3` → clamped to 0.
  - Item with `quantity = NaN` → clamped to 0.
- **Validation**
  - Reject overlapping tiers.
  - Reject non-monotonic tiers.
  - Reject non-integer `minCount`, `maxCount`, `incrementalCount`.
  - Reject multiple open-ended tiers.
  - Reject open-ended tier not at the end.
  - Reject negative cost, negative count, zero `incrementalCount` when `incrementalCost` set.
  - Reject unknown `countMode`.
  - Empty tiers array rejected.

### Integration tests (with Convex)

- CRUD roundtrip: create → update → list → delete.
- Rate pipeline integration (PRD A7): method registered, dispatched, returns quote with correct shape.
- Rule gate (PRD A6): method with `ruleId` pointing to "subtotal > $25" disappears for small carts.
- Class deletion event: override referencing a deleted class is cleaned up.
- Concurrent tier edits: last-write-wins with `updatedAt` monotonicity.
- Mode-switch preserves data: set `per_shipping_class` with overrides → switch to `total_items` → switch back → overrides still present.

### Performance

- Calculation latency budget: <5 ms per call on a typical cart (10 line items, 3 tiers, no overrides). Measured inside Convex function runtime.
- Adversarial: 50 line items, 20 tiers, 10 class overrides — <15 ms.

### Regression scenarios

- Canonical example ($5/$8/$12 + $1/item) reproduced end-to-end from admin UI save through checkout display.
- `total_line_items` vs `total_items` on the same cart produce different (correct) quotes.
- Preview-panel output matches server-side quote bit-for-bit for the same input count.

---

## 12. Success Criteria

- **WooCommerce Table Rate parity.** Any "per item" or "per line item" condition expressible in WooCommerce Table Rate is expressible here, including open-ended top, per-class tables, and per-unit markup.
- **Shopify parity.** Shopify's "Based on item count" rate rows (unlimited rows, min/max per row, flat price per row) are a strict subset of this schema.
- **Calculation latency.** 95th-percentile method calculation <5 ms on production-sized carts.
- **Zero rounding errors.** All monetary outputs are exact integer cents; a QA suite of 1,000 randomized tier configurations × 1,000 randomized carts shows zero drift vs. a reference Python implementation using `decimal`.
- **Editor usability.** A merchant can configure the canonical "$5/$8/$12+$1" example in under 60 seconds without documentation.
- **Preview panel accuracy.** The preview panel's computed cost for any input count exactly matches the server-side quote for that same count (bit-for-bit equality on the integer cents value).
- **Structural parity with PRD B2.** A developer who has internalized PRD B2 can implement this method in a single session; tier validation, matching, and incremental math reuse the same code shape.
- **Coverage.** Every edge case enumerated in Section 10 has at least one test case in Section 11.

---

## 13. Roles & Capabilities

All capabilities follow the project's role/capability conventions and mirror PRD B2.

| Capability | Administrator | Editor | Author | Contributor | Subscriber |
|------------|:-:|:-:|:-:|:-:|:-:|
| `admin.shipping.methods.manage` (create/update/delete methods) | Yes | No | No | No | No |
| `admin.shipping.methods.read` (read admin config) | Yes | Yes | No | No | No |
| `admin.shipping.methods.quote` (invoke rate pipeline, indirectly) | Yes | Yes | Yes | Yes | Yes (public checkout) |

Storefront checkout does not require `admin.shipping.methods.manage`; it invokes the pipeline (PRD A7), which consumes the method's config read-only.

---

## 14. Events Fired

This method reuses the shared `shipping.method.*` event namespace defined by PRD A7 — it does not introduce method-type-specific events. The shared events are:

- `shipping.method.created` — payload: `{ methodId, zoneId, type: "quantity_based" }`.
- `shipping.method.updated` — payload: `{ methodId, zoneId, type, changedFields }`.
- `shipping.method.deleted` — payload: `{ methodId, zoneId, type }`.
- `shipping.method.enabled` / `shipping.method.disabled` — payloads include `{ methodId }`.
- `shipping.quote.calculated` (emitted by PRD A7, not here) — observable by analytics/audit.

Subscribers of interest:

- Audit Log System — records every create/update/delete.
- Analytics System — tracks which methods are actually chosen at checkout to flag misconfigured rates.
- PRD A6 (Rules Engine) — invalidates rule caches when methods change.

This method itself subscribes to:

- `shipping.class.deleted` (PRD A2) — prune stale `classOverrides`.

---

## 15. References

- **WooCommerce Table Rate Shipping** — "per item" and "per line item" conditions, tier row configuration UI. Reference implementation for parity.
- **WooCommerce Advanced Shipping Packages / Flexible Shipping** — precedent for per-class item-count pricing.
- **Shopify per-item rates** — Shopify help docs "Setting up shipping rates → Item count-based". Reference for the unlimited-rate-rows pattern.
- **BigCommerce "By Order Total" and "By Item Count"** — documentation on item-count shipping rates.
- **Magento 2 Shipping by Quantity extensions** — tier table with "and above" top row; design parallel to this PRD's open-ended tier.
- **PRD A1 — Shipping Zones** — zone-method relationship, method ordering inside a zone.
- **PRD A2 — Shipping Classes** — class registry, `per_class_sum` / `highest_class` aggregation rules.
- **PRD A6 — Shipping Rules Engine** — optional `ruleId` gate on method availability.
- **PRD A7 — Rate Calculation Pipeline** — `MethodRateCalculator` contract, `Quote` shape, dispatcher registration.
- **PRD B2 — Weight-Based Shipping** — sibling method; identical tier structure with weight as the key. Any substantive change to tier semantics must be reflected in both PRDs.

---
