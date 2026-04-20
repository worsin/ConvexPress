# PRD B1 — Weight-Based Shipping Method

**System ID:** `shipping-method-weight-based`
**Layer:** B (Shipping Method Type)
**Status:** Draft
**Owner:** Commerce / Shipping
**Depends On:** PRD A1 (Shipping Zones), PRD A2 (Shipping Classes), PRD A3 (Shipping Packages), PRD A6 (Shipping Rules Engine), PRD A7 (Rate Calculation Pipeline)

---

## 1. Context & Intent

Weight-Based Shipping is the single most requested, most-used, and most widely deployed shipping method in e-commerce. It is the default configuration on approximately every WooCommerce store that does not use live carrier rates, and it is a first-class built-in option in Shopify, BigCommerce, Magento, Squarespace Commerce, and every other modern commerce platform. A merchant charging "$5 under 1lb, $10 under 5lb, $15 and up" is using weight-based tiered shipping, whether they know the term or not.

**ConvexPress currently has no weight-based shipping method.** This is a launch blocker. A commerce stack that cannot express "charge $X if the cart weighs under Y" is not a viable commerce stack, and it is the first question every merchant asks during evaluation. The current gap forces merchants to either pay for live-rate integrations they do not need, configure a flat rate that loses money on heavy orders, or abandon ConvexPress entirely in favor of WooCommerce.

This PRD specifies the Weight-Based Shipping Method — a concrete method type that plugs into the shipping pipeline defined by PRD A7 (Rate Calculation Pipeline), attaches to zones defined by PRD A1 (Shipping Zones), honors class overrides defined by PRD A2 (Shipping Classes), and consumes package tare weight contributed by PRD A3 (Shipping Packages). It is the flagship method of Layer B and the first one merchants will configure.

**Goals:**

- Full parity with the WooCommerce Weight Based Shipping plugin and Shopify weight-based rates.
- Any merchant-defined weight tier table is expressible in the schema, including open-ended top tier with per-unit incremental cost.
- Per-shipping-class override tables so that fragile or bulky classes can price independently.
- Mixed-unit tolerance (merchant enters tiers in lb, product weights in oz, conversion is automatic).
- Deterministic, side-effect-free calculation that fits inside the rate pipeline performance budget (sub-5ms for typical carts).
- Zero rounding error: monetary math routes through the shared currency helpers; no floating-point drift in the final quote.

**Non-Goals:**

- Dimensional weight (DIM weight) — that is PRD B3 (Dimensional Weight Shipping). Cart weight here is strictly physical weight.
- Volumetric pricing — that is a separate method type (PRD B4).
- Live carrier lookups — handled by PRD B7 (Live Rate Shipping).
- Handling fees, fuel surcharges, insurance — applied by PRD A7 as pipeline steps around the method, not inside this method.

---

## 2. Scope

### In Scope

- New Convex table `commerce_shipping_method_weight_based` storing per-method tier tables.
- CRUD mutations and queries scoped to an administrator with `admin.shipping.methods.manage` capability.
- Tier table editor embedded inside the zone method editor from PRD A1.
- Tier matching algorithm (inclusive min, exclusive max, first-match-wins).
- Open-ended top tier with `incrementalCost` and `incrementalWeight` to charge "$X + $Y per additional Z above the top boundary".
- Per-shipping-class override tables — each class can replace the full tier table for its subset of the cart.
- `includeTareWeight` toggle to add package tare weight (from PRD A3) into the cart weight used for tier lookup.
- Weight unit conversion helper for oz, g, lb, kg with deterministic rounding rules.
- `MethodRateCalculator` contract implementation so the method registers itself with the rate pipeline (PRD A7).
- Storefront label hints ("up to 5lb", "over 5lb") driven by the tier the cart matched.

### Out of Scope

- DIM weight, volumetric weight, girth — PRD B3/B4.
- Live carrier APIs (USPS, UPS, FedEx, DHL) — PRD B7.
- Flat-rate methods — PRD B2.
- Free shipping thresholds by cart subtotal — PRD B5.
- Per-item shipping overrides — PRD B6.
- Tax on shipping — handled by the Tax system, not here.
- Multi-package splitting strategy — handled by PRD A3; this method receives already-packaged shipments.

---

## 3. Dependencies

**Upstream (required before this method is functional):**

- **PRD A1 — Shipping Zones.** A weight-based method always attaches to exactly one zone. Without zones there is nowhere to configure a method.
- **PRD A2 — Shipping Classes.** Per-class overrides rely on the shipping class registry and the mixed-cart aggregation rule (`per_class_sum` or `highest_class`).
- **PRD A3 — Shipping Packages.** Package tare weight is the second addend in the cart-weight computation when `includeTareWeight` is true.
- **PRD A6 — Shipping Rules Engine.** Optional `ruleId` on the method gates availability via the rule engine (e.g., "only show this method if subtotal > $50").
- **PRD A7 — Rate Calculation Pipeline.** Defines the `MethodRateCalculator` contract, the cart model passed in, and the `Quote` return type.

**Downstream (consumers of this PRD):**

- None. This is a leaf method. Checkout reads quotes from the pipeline (A7), not directly from this method.

---

## 4. Schema

### Table: `commerce_shipping_method_weight_based`

Defined in `convex/schema/shipping.ts` and exported as part of `shippingTables`.

| Field | Type | Notes |
|-------|------|-------|
| `zoneId` | `v.id("commerce_shipping_zones")` | Required. Indexed. The zone this method belongs to. |
| `name` | `v.string()` | Internal admin-facing name, e.g., "Domestic Weight Rate". |
| `label` | `v.string()` | Customer-facing label at checkout, e.g., "Standard Shipping". |
| `description` | `v.optional(v.string())` | Optional customer-facing description. |
| `weightUnit` | `v.union(v.literal("oz"), v.literal("g"), v.literal("lb"), v.literal("kg"))` | Unit the tier boundaries and incremental weight are expressed in. |
| `tiers` | `v.array(tierValidator)` | Ordered list of tiers. See Tier shape below. |
| `classOverrides` | `v.array(classOverrideValidator)` | Optional per-class tier tables. Empty array = no overrides. |
| `includeTareWeight` | `v.boolean()` | If true, package tare weight from PRD A3 is added to cart weight. Default `true`. |
| `enabled` | `v.boolean()` | Merchant can disable without deleting. |
| `sortOrder` | `v.number()` | Display order within the zone. |
| `ruleId` | `v.optional(v.id("commerce_shipping_rules"))` | Optional PRD A6 rule gating availability. |
| `labelHintTemplate` | `v.optional(v.string())` | Optional template for appending tier hint to label, e.g., `"{label} (up to {maxWeight}{unit})"`. |
| `createdAt` | `v.number()` | |
| `updatedAt` | `v.number()` | |
| `createdBy` | `v.id("users")` | |

**Tier shape (`tierValidator`):**

| Field | Type | Notes |
|-------|------|-------|
| `minWeight` | `v.number()` | Inclusive lower bound, expressed in method's `weightUnit`. |
| `maxWeight` | `v.union(v.number(), v.null())` | Exclusive upper bound. `null` means open-ended (top tier). |
| `cost` | `v.number()` | Base cost for any cart landing in this tier. In the store's currency minor units (cents). |
| `incrementalCost` | `v.optional(v.number())` | Cost per `incrementalWeight` beyond `minWeight`. Only meaningful when `maxWeight` is `null` or for tiers that charge per-unit above the tier floor. |
| `incrementalWeight` | `v.optional(v.number())` | Size of the increment. Defaults to `1` in method's `weightUnit`. |
| `incrementalMode` | `v.optional(v.union(v.literal("above_min"), v.literal("above_max_of_previous")))` | Defaults to `"above_min"`. Controls whether incremental cost is measured from the tier's `minWeight` or from the previous tier's `maxWeight`. |

**ClassOverride shape (`classOverrideValidator`):**

| Field | Type | Notes |
|-------|------|-------|
| `classId` | `v.id("commerce_shipping_classes")` | References the class from PRD A2. |
| `tiers` | `v.array(tierValidator)` | Full replacement tier table for this class. |

### Indexes

- `by_zone` on `["zoneId", "sortOrder"]` — lists methods inside a zone.
- `by_zone_enabled` on `["zoneId", "enabled"]` — rate pipeline (PRD A7) filters enabled methods per zone.
- `by_rule` on `["ruleId"]` — PRD A6 can invalidate dependent methods.

### Example Document

```
{
  zoneId: "zn_us_domestic",
  name: "USPS-style Weight Rate",
  label: "Standard Shipping",
  weightUnit: "lb",
  tiers: [
    { minWeight: 0, maxWeight: 1, cost: 500 },
    { minWeight: 1, maxWeight: 5, cost: 1000 },
    { minWeight: 5, maxWeight: null, cost: 1000, incrementalCost: 100, incrementalWeight: 1, incrementalMode: "above_min" }
  ],
  classOverrides: [],
  includeTareWeight: true,
  enabled: true,
  sortOrder: 0,
  labelHintTemplate: "{label} (up to {maxWeight}{unit})"
}
```

This document encodes "$5 under 1lb, $10 from 1lb to under 5lb, $10 + $1 per additional lb at 5lb and above" — the canonical example from the scope statement.

---

## 5. Data Model

### Tier Matching Algorithm

Given a resolved cart weight `W` (already unit-converted to the method's `weightUnit`), select the first tier where `tier.minWeight <= W < tier.maxWeight`. For the open-ended top tier (`maxWeight === null`), the match condition is `tier.minWeight <= W`.

Tiers are stored in insertion order; the editor enforces and the validator asserts that they are sorted ascending by `minWeight` and do not overlap. Because ranges are `[min, max)` and contiguous, first-match-wins and sorted-scan are equivalent — a binary search is allowed, but the n is small (typically 3–8 tiers) so linear scan is the reference implementation.

### Boundary Semantics

- **Inclusive min, exclusive max.** A cart weighing exactly `1.0 lb` with tiers `[0,1)` and `[1,5)` matches the second tier, not the first. Merchants universally expect "under 1lb" to mean strictly less than 1lb.
- **Top tier open-ended.** A tier with `maxWeight: null` catches any cart at or above `minWeight`. The merchant can also use a very large number (e.g., `9999`) for a closed top tier; validation permits both.
- **Exact-boundary tie-break.** Always resolves to the upper tier because of the exclusive-max rule. Documented and tested explicitly.

### Top-Tier Incremental Cost

When the matched tier has `incrementalCost` set, the final cost is:

```
baseCost = tier.cost
anchor = incrementalMode === "above_min" ? tier.minWeight : previousTier.maxWeight
overage = max(0, W - anchor)
increments = ceil(overage / tier.incrementalWeight)
finalCost = baseCost + increments * tier.incrementalCost
```

Ceiling rounding is the convention in every carrier's tariff — a 5.1 lb package is billed as a 6 lb package for the overage portion. The algorithm never produces a fractional increment. For the canonical example, a 7.3 lb cart matches the third tier: `overage = 7.3 - 5 = 2.3`, `increments = ceil(2.3 / 1) = 3`, `finalCost = 1000 + 3 * 100 = 1300` (i.e., $13.00).

### Per-Class Override Resolution

Per-class overrides replace the tier table — they do not merge. If class `fragile` has an override, its portion of the cart is priced against the override table, and the default tiers are ignored for that portion entirely. This is PRD A2's "full replace" semantic, chosen because partial merges are ambiguous (which side wins on a collision?) and merchants universally expect full replacement.

The aggregation rule across classes is inherited from the method's associated shipping class configuration (PRD A2):

- `per_class_sum` — compute a separate rate per class group, sum them. This is the default.
- `highest_class` — compute a rate per class group, take the highest single rate, discard the rest.

The method itself does not select the aggregation rule; it reports per-group costs to the pipeline (PRD A7), which applies the rule.

### Cart Weight Computation

```
computeCartWeight(items, packages, includeTare, targetUnit):
  itemsWeight = sum over items of (item.weight * item.quantity) in item's own unit, converted to targetUnit
  tareWeight = includeTare ? sum over packages of package.tareWeight, converted to targetUnit : 0
  return itemsWeight + tareWeight
```

Items without a `weight` field contribute zero. Virtual/digital items (PRD Commerce Products) always have zero weight — they do not cause a zero-weight error, they simply do not add.

### Weight Unit Conversion Table

All conversions go through grams as the canonical base unit. Conversion factors are exact rational numbers; no platform-specific `Intl` calls. Rounding on the final cart-weight value is to six decimal places to prevent tier-boundary flapping from float noise (e.g., `0.999999999999 lb` becoming `1.0 lb` via rounding).

| From | To grams (multiplier) |
|------|------------------------|
| `g` | 1 |
| `oz` | 28.349523125 |
| `lb` | 453.59237 |
| `kg` | 1000 |

Inverse conversions divide. A helper `convertWeight(value, fromUnit, toUnit)` lives in `convex/shipping/helpers/units.ts` and is reused by PRD A3 (package weight), PRD B3 (DIM weight), and any future method that needs unit math.

---

## 6. Functions / API

All functions live in `convex/shipping/methods/weightBased.ts` unless otherwise noted. Naming follows the per-system function-organization rules from the project CLAUDE.md.

### Mutations

- `create(zoneId, config)` — inserts a new method. Validates tier shape, sort, non-overlap, non-gap, weightUnit membership, class existence. Requires `admin.shipping.methods.manage`.
- `update(methodId, patch)` — partial update. Re-runs full validation on the merged document. Requires `admin.shipping.methods.manage`.
- `delete(methodId)` — soft or hard? Hard delete. Rate pipeline recomputes on next cart change; no referential integrity needed downstream. Requires `admin.shipping.methods.manage`.
- `reorder(zoneId, orderedIds)` — bulk update of `sortOrder` inside a zone.
- `setEnabled(methodId, enabled)` — convenience toggle without reshipping the whole document.
- `addTier(methodId, tier, position)`, `removeTier(methodId, index)`, `updateTier(methodId, index, patch)` — granular tier editors used by the admin UI to keep Convex writes small.
- `addClassOverride(methodId, classId)` / `removeClassOverride(methodId, classId)` / `updateClassOverrideTier(...)` — per-class table editors.

### Queries

- `listByZone(zoneId)` — returns methods in sort order. Consumed by admin UI and by the rate pipeline.
- `get(methodId)` — single-document fetch.

### Internal

- `calculateWeightBased(methodConfig, cart, packages)` — internal function registered with the rate pipeline. Returns a `Quote` matching PRD A7's shape: `{ methodId, label, amount, currency, meta: { matchedTier, cartWeight, weightUnit } }`. Pure function; does no database reads; receives pre-resolved config. This is the integration point with PRD A7.
- `computeCartWeight(items, packages, includeTare, targetUnit)` — helper in `convex/shipping/helpers/units.ts` (shared) or co-located here; preferred location is the shared helper so PRD B3 can reuse.
- `validateTierTable(tiers)` — internal validator returning an array of errors (empty = valid). Enforces: no negative weights, `minWeight < maxWeight` for closed tiers, no overlap, no gap, at most one open-ended tier and it must be last, monetary values are non-negative integers, `incrementalWeight > 0` when `incrementalCost` set.

### Method Registration

The method registers with the rate pipeline (PRD A7) by calling `registerMethodCalculator("weight_based", calculateWeightBased)` at module load time in `convex/shipping/methods/index.ts`. The registry is how PRD A7 dispatches to method-specific calculators without knowing about each one statically.

---

## 7. Admin UX

### Entry Point

From the Zone Editor (PRD A1), merchant clicks "Add Method" → selects "Weight-Based Shipping" from the method type picker. The method editor opens as a full page at `/admin/commerce/shipping/zones/$zoneId/methods/$methodId` — no modals, per the project UI rules.

### Layout

- **Header metabox:** `name`, `label`, `description`, `enabled` toggle, `weightUnit` selector, `includeTareWeight` checkbox with hint "Adds box weight from Shipping Packages (PRD A3) to cart weight for tier lookup."
- **Tier table editor:** the primary control. A table with one row per tier, columns: Min Weight, Max Weight, Cost, Incremental Cost, Incremental Weight. Buttons: "Add tier", drag-reorder handle, remove row. The last row may check "Open-ended" which disables Max Weight and enables the incremental columns.
- **Per-class overrides accordion:** a list of shipping classes (from PRD A2). Each class can be toggled on; when on, an embedded tier table editor appears (same widget as the default tier table).
- **Rule gate selector:** optional dropdown sourced from PRD A6 rules.
- **Label hint template:** text input with live preview. Shows "Standard Shipping (up to 5lb)" as the merchant types.
- **Preview panel:** fixed at the bottom of the editor. Input: a cart weight in any supported unit. Output: matched tier, converted cart weight in method unit, final cost. Updates reactively as the merchant edits tiers. This is the single most important feature of the editor — it closes the comprehension gap on "did I set this up right?"

### Validation Surfacing

- Inline row errors for overlaps, gaps, negative values, non-monotonic boundaries.
- Form-level errors for "at most one open-ended tier" and "open-ended tier must be last".
- Save button is disabled while any error is present.
- Server-side validation re-runs on every mutation and returns the same error shape so optimistic UI and server agree.

### Admin Preview Examples

The preview panel seeds with three example weights the first time the editor opens: `0.5 lb`, `2.5 lb`, `7.0 lb`. The merchant can edit them or add more. Each example renders as a row: input weight, matched tier index, computed cost, and the full formula trace (e.g., "1000 + ceil((7.0 - 5) / 1) × 100 = 1300").

---

## 8. Merchant Workflow

**Scenario:** "How do I charge $5 under 1lb, $10 under 5lb, $15 over 5lb?"

1. Admin → Commerce → Shipping → Zones → "United States" (or whichever zone applies).
2. Click "Add Method" → select "Weight-Based Shipping".
3. Set **Name** = "Standard USA", **Label** = "Standard Shipping", **Weight Unit** = "lb".
4. Tier table default has one row `[0, ∞)` at $0. Merchant edits:
   - Row 1: Min 0, Max 1, Cost $5.00.
   - Click "Add tier" → Row 2: Min 1, Max 5, Cost $10.00.
   - Click "Add tier" → Row 3: Min 5, Max ∞ (toggle Open-ended), Cost $15.00, Incremental $0, Incremental Weight 1.
5. Leave `includeTareWeight` on (default). Leave per-class overrides empty.
6. In the preview panel, type `0.5` → see "Tier 1, $5.00". Type `3` → "Tier 2, $10.00". Type `10` → "Tier 3, $15.00".
7. Save.

**Scenario variant — open-ended with per-pound markup:** at step 4 Row 3, set Cost $10.00, Incremental $1.00, Incremental Weight 1, Incremental Mode "above_min". This recovers the canonical "$10 base + $1/lb above 5lb" behavior.

**Scenario — fragile items priced higher:** after step 5, expand the "Per-Class Overrides" accordion, enable class "Fragile", and enter a tier table with higher costs. Save. Now any cart line item tagged Fragile is priced against the override table; everything else uses the default.

---

## 9. Storefront UX

### Checkout Display

During checkout (or in the cart estimator), the customer sees a shipping method row rendered from the method's resolved quote:

- **Label:** from `label` plus the optional `labelHintTemplate`. For the canonical example with `labelHintTemplate = "{label} (up to {maxWeight}{unit})"` and a 2 lb cart matching tier 2 `[1, 5)`, the rendered label is `"Standard Shipping (up to 5lb)"`.
- **Amount:** formatted currency from the quote's `amount`.
- **ETA:** not owned by this PRD; if the merchant supplies an ETA via the zone method record (PRD A1), it renders alongside.

For the open-ended top tier, `{maxWeight}` substitutes as "and up" (e.g., "Standard Shipping (5lb and up)"). Template tokens:

- `{label}` — method label.
- `{minWeight}`, `{maxWeight}` — matched tier boundaries, in method's unit, `maxWeight = null` substitutes "and up".
- `{unit}` — method's weight unit.
- `{cartWeight}` — the computed cart weight, formatted to one decimal.

### Fallback When Zone Matches Nothing

If the customer's address is outside every configured zone (PRD A1 owns that determination), this method is not considered. The storefront displays "No shipping available to this address" from the pipeline's zero-quote fallback, not from this method.

### Currency

This method emits amounts in the store's base currency. Multi-currency display conversion is handled downstream by the currency system, not here.

---

## 10. Edge Cases

### 10.1 Cart weight exactly on a tier boundary

A 1.000000 lb cart against tiers `[0,1)` and `[1,5)` resolves to the second tier (inclusive min, exclusive max). Documented; tested with both exact and floating-point-adjacent values (`0.9999999999`, `1.0000000001`).

### 10.2 Cart weighs 0

A cart containing only virtual/digital items has total weight 0. The cart still matches tier 1 `[0, …)` at $0.00 if the merchant configured it that way, or at $5.00 if tier 1 starts at $5. Merchants who want to suppress shipping entirely on virtual-only carts should use PRD A6 (Rules Engine) to gate the method off when `cart.has_only_virtual_items === true`. This method does not special-case zero weight — it is a valid cart weight like any other.

### 10.3 Cart weight exceeds all tiers (closed top tier)

If the top tier is closed (e.g., `[5, 20)`) and the cart weighs 25 lb, the method returns **no quote** — it is not in any tier. The pipeline (PRD A7) then either falls back to another method in the zone or surfaces "No shipping available". Validation warns the merchant at configuration time: "Cart weights above 20 lb will not match any tier. Consider using an open-ended top tier."

### 10.4 Cart weight exceeds open-ended top tier

Matches the top tier; incremental cost applies. See the 7.3 lb worked example in Section 5. No failure mode.

### 10.5 Unit mismatch (merchant uses oz, carrier/product uses lb)

Each product stores its weight with its own unit; each package stores tare weight with its own unit; the method has its own `weightUnit`. `computeCartWeight` converts every source weight into the method's unit before summing. Example: method in `lb`, three products at 8oz each, package tare 2oz, includeTare true. Cart weight = `(8*3 + 2) oz = 26 oz = 1.625 lb`. Matches tier 2 `[1, 5)` → $10.00.

### 10.6 Per-class override with a mixed cart

Cart contains 2 lb of default-class items and 1 lb of "Fragile" class items. Aggregation rule is `per_class_sum` (from PRD A2). Default group: 2 lb → tier 2 → $10. Fragile group: 1 lb → override tier (say, $15). Method returns two sub-quotes, pipeline sums to $25. If the rule were `highest_class`: pipeline takes max($10, $15) = $15.

### 10.7 Package tare weight pushes cart across a tier boundary

Items weigh 0.95 lb, package tare is 0.1 lb, `includeTareWeight = true`. Cart weight = 1.05 lb → tier 2 (not tier 1). If `includeTareWeight = false`, cart weight = 0.95 lb → tier 1. This is intentional and expected; the merchant's toggle explicitly controls this behavior.

### 10.8 Negative or malformed item weight

Validation at the product level (PRD Commerce Products) prevents negative weights. Defensively, the method clamps each item's weight to `max(0, weight)` before summing. A product with `undefined` or `null` weight contributes 0, not NaN.

### 10.9 Currency precision

All `cost` and `incrementalCost` values are stored as integer minor units (cents). The calculation `baseCost + increments * incrementalCost` is integer-only. No floating-point money, no rounding errors in the final amount. The only floating-point arithmetic is on the weight axis, which is rounded to six decimals before tier lookup.

### 10.10 Reordering tiers in the editor

The editor allows drag-reorder, but on save the server re-sorts tiers by `minWeight` regardless of drag order. This prevents a merchant from accidentally saving an unsorted table. Drag order during editing is purely a UX convenience for reading the table top-to-bottom.

### 10.11 Deleting a shipping class referenced by an override

PRD A2 emits `shipping.class.deleted`; this method subscribes and removes any `classOverrides` entries referencing the deleted class. Alternative considered: soft-delete with a warning. Rejected because stale overrides confuse the preview panel.

### 10.12 Disabling the method vs. deleting it

`enabled: false` preserves the configuration but excludes the method from pipeline dispatch. Useful for seasonal rates. The admin UI surfaces disabled methods as greyed with a "Disabled" chip.

### 10.13 Zone with no enabled weight-based methods

Not this method's concern — PRD A7 handles the "no quotes from any method" case.

### 10.14 Extremely heavy cart against incremental cost

A 5000 lb cart against `cost: 1000, incrementalCost: 100, incrementalWeight: 1`: `increments = ceil(4995 / 1) = 4995`, `finalCost = 1000 + 499500 = 500500` cents = $5,005.00. Arithmetic is safe — JavaScript's Number handles integers up to 2^53 without loss, and this value is six orders of magnitude below that. Documented as "no upper bound on output".

### 10.15 Multiple weight-based methods in the same zone

Fully supported. A zone can have "Standard Weight Rate", "Express Weight Rate", and "Overnight Weight Rate" all as weight-based methods with different tiers. The pipeline returns all of them; the customer picks one at checkout.

---

## 11. Testing Requirements

### Unit tests (pure functions)

- **Tier matching**
  - Weight in first tier, middle tier, top tier.
  - Exact lower-boundary weight (matches that tier).
  - Exact upper-boundary weight (matches next tier; or no match if top is closed).
  - Weight below first tier's min (no match; expected only if first tier doesn't start at 0).
  - Weight above closed top tier's max (no match).
  - Weight above open-ended top tier's min (matches, applies incremental).
- **Incremental cost**
  - Overage exactly on an increment boundary (`5.0 lb` against top tier starting at 5 with 1lb increments → `ceil(0/1) = 0` increments).
  - Fractional overage (`5.1 lb` → 1 increment).
  - Large overage (`100 lb` → 95 increments).
  - Incremental mode `"above_max_of_previous"` vs `"above_min"` produce different anchors; test both.
- **Per-class overrides**
  - Single-class cart using override.
  - Mixed-class cart with `per_class_sum` aggregation.
  - Mixed-class cart with `highest_class` aggregation.
  - Class without override falls through to default tiers.
- **Unit conversion**
  - oz → lb, g → kg, lb → kg, kg → oz, same-unit identity.
  - Round-trip conversion returns to original within 1e-9.
  - Per-item unit mismatch (item in g, method in lb).
- **Tare weight inclusion**
  - `includeTareWeight = true` vs `false` produces different cart weights and potentially different tiers.
  - Package with zero tare is a no-op regardless of toggle.
- **Validation**
  - Reject overlapping tiers.
  - Reject gap between tiers.
  - Reject non-monotonic tiers.
  - Reject multiple open-ended tiers.
  - Reject open-ended tier not at the end.
  - Reject negative cost, negative weight, zero incrementalWeight when incrementalCost set.
  - Reject unknown `weightUnit`.

### Integration tests (with Convex)

- CRUD roundtrip: create → update → list → delete.
- Rate pipeline integration (PRD A7): method registered, dispatched, returns quote with correct shape.
- Rule gate (PRD A6): method with `ruleId` pointing to "subtotal > $50" disappears for small carts.
- Class deletion event: override referencing a deleted class is cleaned up.
- Concurrent tier edits: last-write-wins with updatedAt monotonicity.

### Performance

- Calculation latency budget: <5 ms per call on a typical cart (10 items, 3 tiers, no overrides). Measured inside Convex function runtime.
- With 20 tiers and 10 class overrides (adversarial config), latency <15 ms.

### Regression scenarios

- Canonical example ($5 / $10 / $15 + $1/lb) reproduced end-to-end from admin UI save through checkout display.
- Floating-point boundary: `0.1 + 0.2 = 0.30000000000000004` must not cause tier-flap when the tier boundary is `0.3`.

---

## 12. Success Criteria

- **WooCommerce parity.** Every tier configuration expressible in the WooCommerce Weight Based Shipping plugin is expressible here: closed ranges, open-ended top, per-class overrides, per-unit markup, mixed weight units.
- **Shopify parity.** Shopify's weight-based rate bands (unlimited bands, min/max weight per band, flat price per band) are a strict subset of this schema.
- **Calculation latency.** 95th-percentile method calculation <5 ms on production-sized carts.
- **Zero rounding errors.** All monetary outputs are exact integer cents; a QA suite of 1,000 randomized tier configurations × 1,000 randomized carts shows zero drift vs. a reference Python implementation using `decimal`.
- **Editor usability.** A merchant can configure the canonical "$5/$10/$15+$1" example in under 60 seconds without documentation.
- **Preview panel accuracy.** The preview panel's computed cost for any input weight exactly matches the server-side quote for that same weight (bit-for-bit equality on the integer cents value).
- **Coverage.** Every edge case enumerated in Section 10 has at least one test case in Section 11.

---

## 13. Roles & Capabilities

All capabilities follow the project's role/capability conventions.

| Capability | Administrator | Editor | Author | Contributor | Subscriber |
|------------|:-:|:-:|:-:|:-:|:-:|
| `admin.shipping.methods.manage` (create/update/delete methods) | Yes | No | No | No | No |
| `admin.shipping.methods.read` (read admin config) | Yes | Yes | No | No | No |
| `admin.shipping.methods.quote` (invoke rate pipeline, indirectly) | Yes | Yes | Yes | Yes | Yes (public checkout) |

Storefront checkout does not require `admin.shipping.methods.manage`; it invokes the pipeline (PRD A7), which consumes the method's config read-only.

---

## 14. Events Fired

This method reuses the shared `shipping.method.*` event namespace defined by PRD A7 — it does not introduce method-type-specific events. The shared events are:

- `shipping.method.created` — payload: `{ methodId, zoneId, type: "weight_based" }`.
- `shipping.method.updated` — payload: `{ methodId, zoneId, type, changedFields }`.
- `shipping.method.deleted` — payload: `{ methodId, zoneId, type }`.
- `shipping.method.enabled` / `shipping.method.disabled` — payloads include `{ methodId }`.
- `shipping.quote.calculated` (emitted by PRD A7, not here) — observable by analytics/audit.

Subscribers of interest:

- Audit Log System (PRD Audit Log) — records every create/update/delete.
- Analytics System — tracks which methods are actually chosen at checkout to flag misconfigured rates.
- PRD A6 (Rules Engine) — invalidates rule caches when methods change.

This method itself subscribes to:

- `shipping.class.deleted` (PRD A2) — prune stale `classOverrides`.
- `shipping.package.updated` (PRD A3) — no data migration needed; package tare is read lazily on quote, not cached here.

---

## 15. References

- **WooCommerce Weight Based Shipping plugin** — tier configuration UI, mixed-cart class behavior, per-condition rate rows. Reference implementation for parity.
- **Shopify weight-based shipping rates** — unlimited rate bands, min/max weight per band, flat per-band pricing. Shopify help docs "Setting up shipping rates".
- **BigCommerce shipping by weight** — documentation on weight ranges and fallthrough behavior.
- **Magento 2 Shipping by Weight** — tier table with "and above" top row; design parallel to this PRD's open-ended tier.
- **USPS Retail Ground tariffs** — real-world example of ceiling-rounded incremental pricing per pound over a base weight.
- **UPS Ground rates** — tariff structure validating the ceiling-based incremental model.
- **FedEx Ground weight-based pricing** — confirms `above_max_of_previous` as a second common increment anchor.
- **PRD A1 — Shipping Zones** — zone-method relationship, method ordering inside a zone.
- **PRD A2 — Shipping Classes** — class registry, mixed-cart aggregation rules (`per_class_sum`, `highest_class`).
- **PRD A3 — Shipping Packages** — package tare weight source, shipment-splitting semantics.
- **PRD A6 — Shipping Rules Engine** — optional `ruleId` gate on method availability.
- **PRD A7 — Rate Calculation Pipeline** — `MethodRateCalculator` contract, `Quote` shape, dispatcher registration.

---
