# PRD — Flat Rate Shipping Method

**System ID:** `shipping-method-flat-rate`
**Layer:** B — Shipping Method Type (leaf)
**Status:** Draft v1
**Owners:** Commerce / Shipping Working Group
**Last Updated:** 2026-04-14

---

## 1. Context & Intent

Flat Rate Shipping is the simplest and most universally used shipping method in e-commerce. It charges a fixed, predictable cost for shipping regardless of weight, dimensions, destination precision, or real-time carrier rates. It is the baseline method that every ConvexPress store must be able to configure in under sixty seconds, and it serves as the default fallback when a merchant has not configured live carrier rates, weight-based tiers, or other advanced methods.

The intent of this system is to deliver WooCommerce-parity flat rate functionality:

- A fixed cost per order ("Shipping is $5 no matter what you buy").
- A per-item multiplier ("Shipping is $2 per item in the cart").
- A per-shipping-class mode ("Bulky items add $15, standard items add $5").
- Optional clamping ("Never more than $25, never less than $3").
- Zone attachment — the method only applies when the cart's destination falls inside the zone that owns the method instance.
- Optional rule attachment — the method only offers itself when the rule from PRD A6 evaluates true.

Flat Rate is a leaf method: it implements the `MethodRateCalculator` contract defined in PRD A7 (Rate Calculation Pipeline) and returns a quote. It does not dispatch to other methods, does not depend on carrier APIs, and does not own zone or class definitions.

The success bar for this PRD is that a non-technical merchant can set up "Flat Rate $5 on orders to the United States" in under sixty seconds, with zero calculation errors under the full test matrix, and that the rate calculation itself runs in under five milliseconds per cart evaluation.

---

## 2. Scope

### In-Scope

- A new Convex table `commerce_shipping_method_flat_rate` that stores one document per flat rate method instance attached to a zone.
- Three cost modes:
  - `per_order` — a single flat cost applied once to the cart.
  - `per_item` — the flat cost is multiplied by the total shippable quantity in the cart.
  - `per_shipping_class` — each distinct shipping class present in the cart contributes its own cost, summed together.
- A `classOverrides` array that defines the per-class cost used in `per_shipping_class` mode and optionally in `per_item` / `per_order` modes as an additive premium.
- Optional `minCost` and `maxCost` clamps applied as the final step of the calculation.
- A `taxable` flag controlling whether the returned shipping line is flagged as taxable.
- Standard method metadata: `name` (internal), `label` (customer-facing), `enabled`, `sortOrder`, optional `ruleId`.
- Admin UX embedded inside the Zone editor page: a list row for each method, a dedicated editor form per method, and a live preview widget that shows what the cost would be for a sample cart.
- Mutations for create, update, delete, reorder, and toggle-enabled.
- The `calculateFlatRate(methodConfig, cart)` internal function that the Rate Calculation Pipeline (PRD A7) invokes when collecting quotes.
- Emission of shared shipping method events: `shipping.method.created`, `shipping.method.updated`, `shipping.method.deleted`.

### Out-of-Scope

- Weight-based tiers — delivered by the separate "Weight-Based Shipping Method" PRD.
- Dimension-based or dimensional-weight tiers — separate method PRD.
- Price-bracket tiers ("free over $50", "add $10 under $25") — separate method PRD (typically implemented by the Free Shipping method with a threshold, plus a Table Rate method for tiered pricing).
- Live carrier rate fetching (UPS, USPS, FedEx, DHL) — each carrier has its own method PRD.
- Local Pickup, Local Delivery, or other pickup-style methods — separate PRDs.
- Zone geography editing, shipping class CRUD, rule DSL authoring — owned by PRD A1, A2, and A6 respectively.
- Tax calculation itself — the method only sets the `taxable` hint; the commerce tax subsystem consumes that hint.
- Currency conversion — costs are stored in the store's base currency; multi-currency display is handled by the commerce presentation layer.
- Rate caching strategy — handled centrally by PRD A7.
- Checkout UI rendering of the final chosen method — handled by the Checkout system.

---

## 3. Dependencies

### Upstream (required before this system can ship)

- **PRD A1 — Shipping Zones System** (`shipping-zones-system`). Every flat rate instance is scoped to exactly one `zoneId`. The zone defines the geographic match rules; this method does not re-implement them.
- **PRD A2 — Shipping Classes System** (`shipping-classes-system`). Per-class cost overrides reference `classId`. The `per_shipping_class` cost mode is unusable without classes existing.
- **PRD A6 — Shipping Rules Engine** (`shipping-rules-engine`). Optional `ruleId` on a method; if set, the pipeline evaluates the rule and skips the method when it returns false.
- **PRD A7 — Rate Calculation Pipeline** (`rate-calculation-pipeline`). Defines the `MethodRateCalculator` contract, the `QuoteResult` shape, the cart normalization step, the quote caching layer, and the final method-selection strategy. Flat Rate is one concrete implementation plugged into this pipeline.

### Downstream

- None. Flat Rate is a leaf method. It is consumed only by the Rate Calculation Pipeline (A7), which is invoked by the Checkout, Cart, and Order Preview surfaces.

### Cross-references

- **Role & Capability System** for the `admin.shipping.methods.manage` capability check.
- **Event Dispatcher System** for emitting `shipping.method.*` events.
- **Audit Log System** writes entries automatically via the event listeners registered by the Shipping Zones system.
- **Settings System** for the commerce-wide `shipping.taxable` override that can force all shipping taxable regardless of per-method flags.

---

## 4. Schema

All schema additions live in `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts`. They are exported alongside zones, classes, and other shipping method tables so the hub file (`schema.ts`) only imports once.

### New Table: `commerce_shipping_method_flat_rate`

One document per flat rate method instance. A single zone may own zero, one, or many flat rate instances (e.g., "Standard $5" and "Expedited $15" side by side).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `zoneId` | `v.id("commerce_shipping_zones")` | yes | The owning zone. Indexed. |
| `name` | `v.string()` | yes | Internal admin-facing identifier. Not shown to customers. Unique within a zone (enforced at mutation time). Max 80 chars. |
| `label` | `v.string()` | yes | Customer-facing label shown at checkout (e.g., "Standard Shipping"). Max 120 chars. |
| `baseCost` | `v.number()` | yes | The core cost, in minor units of the store's base currency (cents). Must be ≥ 0. |
| `costMode` | `v.union(v.literal("per_order"), v.literal("per_item"), v.literal("per_shipping_class"))` | yes | Determines how `baseCost` and `classOverrides` combine. |
| `classOverrides` | `v.array(v.object({ classId: v.id("commerce_shipping_classes"), cost: v.number() }))` | yes (may be empty) | Per-class cost contributions. Semantics vary by `costMode` — see §5. |
| `minCost` | `v.optional(v.number())` | no | Lower clamp. If set, the final cost is never below this. Must be ≥ 0. |
| `maxCost` | `v.optional(v.number())` | no | Upper clamp. If set, the final cost is never above this. Must be ≥ `minCost` when both set. |
| `taxable` | `v.boolean()` | yes | Whether the returned shipping line is flagged as taxable. Default `true`. |
| `enabled` | `v.boolean()` | yes | Soft toggle. Disabled methods are never returned by the pipeline. Default `true`. |
| `sortOrder` | `v.number()` | yes | Within a zone, controls the default order of quotes shown to customers. Lower sorts first. |
| `ruleId` | `v.optional(v.id("commerce_shipping_rules"))` | no | Optional rule from PRD A6. If set and the rule evaluates false, the method is skipped. |
| `createdAt` | `v.number()` | yes | Unix ms. |
| `updatedAt` | `v.number()` | yes | Unix ms. |
| `createdBy` | `v.id("users")` | yes | Stamped at creation. |
| `updatedBy` | `v.id("users")` | yes | Stamped on every update. |

### Indexes

- `by_zone` on `["zoneId", "sortOrder"]` — primary read path from the zone editor and the pipeline.
- `by_zone_enabled` on `["zoneId", "enabled", "sortOrder"]` — fast filter for the pipeline's "enabled methods only" query.
- `by_rule` on `["ruleId"]` — lets the rules system detect methods that reference a rule being deleted.

### Validators

All mutations share validator objects exported from `convex/shipping/methods/flatRate/validators.ts`:

- `flatRateConfigValidator` — full write shape.
- `flatRatePatchValidator` — partial update shape (all fields optional except identity).
- `classOverrideValidator` — the `{ classId, cost }` pair.

---

## 5. Data Model

### Method Instances per Zone

A zone owns zero or more flat rate instances. The admin UX makes it trivial to have, for example, inside the "United States — Continental" zone:

- "Standard Shipping" — $5 flat, `per_order`.
- "Expedited Shipping" — $15 flat, `per_order`.
- "Oversized Items" — `per_shipping_class` with class overrides for `oversized=$25`, `standard=$0`.

Each instance is independent. The customer will see every enabled, rule-passing instance as a separate radio option at checkout.

### Cost Mode Semantics

Let `Q` = total shippable quantity in the cart (sum of line item quantities where the product is flagged shippable), and let `C` = the set of distinct shipping class IDs present in the cart.

- **`per_order`** — `cost = baseCost`. `classOverrides` is ignored unless the merchant has explicitly opted to additively include them (see "Additive overrides" below).
- **`per_item`** — `cost = baseCost × Q`. Again, `classOverrides` is ignored in the pure form.
- **`per_shipping_class`** — `cost = Σ (override.cost for each class present in C)`. `baseCost` acts as the fallback cost for any class that is present in the cart but not listed in `classOverrides`. Items with no shipping class assigned use `baseCost`.

### Additive Overrides (WooCommerce Parity)

WooCommerce allows class overrides to be additive to the base cost in `per_order` and `per_item` modes. To preserve parity and avoid creating a separate method type, ConvexPress treats a non-empty `classOverrides` array as additive when `costMode` is `per_order` or `per_item`:

- `per_order` with overrides: `cost = baseCost + Σ (override.cost for each class present in C)`.
- `per_item` with overrides: `cost = baseCost × Q + Σ (override.cost × quantityOfThatClass)`.

Merchants who want the override-only behavior set `costMode` to `per_shipping_class`. Merchants who want the purely flat behavior leave `classOverrides` empty.

### Clamping

After the mode calculation produces a candidate cost, clamping is applied:

1. If `minCost` is set and candidate < `minCost`, candidate = `minCost`.
2. If `maxCost` is set and candidate > `maxCost`, candidate = `maxCost`.
3. Negative results are floored at 0 unconditionally (defensive guard).

### Taxable Flag

The returned `QuoteResult` carries `taxable: boolean`. The commerce tax subsystem reads it. A store-wide setting `shipping.forceTaxable` can override all per-method flags; the method never enforces this itself.

### Cart Shape Assumptions

The method consumes the normalized cart produced by PRD A7:

```
NormalizedCart {
  items: Array<{ productId, variantId?, quantity, shippingClassId?, shippable: boolean, unitPrice, weight?, dimensions? }>,
  subtotal, itemCount, shippableItemCount,
  destination: { country, region, postalCode, ... },
  currency,
}
```

Flat Rate uses only `items[].quantity`, `items[].shippingClassId`, `items[].shippable`, and `shippableItemCount`. Non-shippable items (downloads, gift cards without physical delivery) are excluded from `Q` and from `C`.

---

## 6. Functions / API

All functions live in `ConvexPress-Admin/packages/backend/convex/shipping/methods/flatRate/`.

### Public Mutations (`mutations.ts`)

- `createFlatRateMethod({ zoneId, name, label, baseCost, costMode, classOverrides, minCost?, maxCost?, taxable, enabled, sortOrder?, ruleId? })`
  - Requires capability `admin.shipping.methods.manage`.
  - Validates that `zoneId` exists.
  - Validates each `classOverrides[i].classId` exists.
  - Validates `ruleId` exists and is of the correct type if provided.
  - Enforces `name` uniqueness within the zone.
  - Defaults `sortOrder` to `(max existing sortOrder in zone) + 10` if not provided.
  - Emits `shipping.method.created`.
  - Returns the new document `_id`.

- `updateFlatRateMethod({ id, patch })`
  - Requires `admin.shipping.methods.manage`.
  - Applies partial patch. Validates all referenced IDs exist.
  - Re-validates `minCost ≤ maxCost` if either is in the patch.
  - Emits `shipping.method.updated` with before/after snapshot.

- `deleteFlatRateMethod({ id })`
  - Requires `admin.shipping.methods.manage`.
  - Hard delete (method instances are configuration, not historical data; historical shipping charges are immortalized on the order record itself).
  - Emits `shipping.method.deleted`.

- `reorderFlatRateMethods({ zoneId, orderedIds })`
  - Requires `admin.shipping.methods.manage`.
  - Rewrites `sortOrder` for every ID in the array with step = 10.
  - Single transactional write.

- `toggleFlatRateMethodEnabled({ id, enabled })`
  - Requires `admin.shipping.methods.manage`.
  - Convenience wrapper emitting `shipping.method.updated`.

### Public Queries (`queries.ts`)

- `listFlatRateMethodsForZone({ zoneId })` — returns all instances in sort order, including disabled ones (admin-only view).
- `getFlatRateMethod({ id })` — single record fetch.

### Internal Functions (`internals.ts`)

- `calculateFlatRate({ methodId, cart })` — internal query used by the pipeline. Loads the method config and invokes `computeFlatRateCost(methodConfig, cart)`. Returns a `QuoteResult`:
  ```
  QuoteResult {
    methodType: "flat_rate",
    methodInstanceId: Id<"commerce_shipping_method_flat_rate">,
    label: string,
    cost: number,
    currency: string,
    taxable: boolean,
    sortOrder: number,
    meta: { costMode, breakdown: Array<{ label, amount }> },
  }
  ```

- `computeFlatRateCost(methodConfig, cart)` — pure function (no `ctx`), unit-testable. Implements the math in §5. Returns `{ cost, breakdown }`.

- `listEnabledFlatRateMethodsForZone({ zoneId })` — internal query used by the pipeline during quote collection.

### Contract Compliance

The pipeline registers a `MethodRateCalculator` entry for `method_type = "flat_rate"`. The entry has:

- `listInstances(ctx, zoneId)` → `listEnabledFlatRateMethodsForZone`.
- `quote(ctx, instance, cart)` → `computeFlatRateCost` plus `QuoteResult` wrapping.

This is the only interface the pipeline cares about; the method can evolve internally without pipeline changes.

---

## 7. Admin UX

All admin UI is embedded inside the Zone editor page (owned by PRD A1). This PRD contributes components, not a standalone route.

### Method List (inside the Zone editor)

Below the zone's geography configuration, a list section shows all shipping methods attached to the zone, flat rate and otherwise. Flat Rate rows display:

- Drag handle (reorder).
- Enabled toggle.
- Method type badge: "Flat Rate".
- Name (internal) and, in smaller muted text, the customer label.
- A compact cost summary: "$5.00 per order", "$2.00 per item", or "Per class — 3 overrides".
- Rule badge if `ruleId` is set ("Rule: Orders over $50").
- Actions menu: Edit, Duplicate, Delete.

At the bottom of the list: an "Add method" button that opens a picker. Selecting "Flat Rate" navigates to the flat rate editor.

### Flat Rate Editor Form

Full-page editor at `/admin/commerce/shipping/zones/$zoneId/methods/$methodId` (and `/new` for creation). No modals. Form sections:

1. **Identity**
   - `Name` (internal) — text input.
   - `Label` (customer-facing) — text input.
   - `Enabled` — toggle.

2. **Cost Mode**
   - Radio group: Per order / Per item / Per shipping class.
   - Inline helper text describing what each mode does.

3. **Base Cost**
   - Currency input. Stored and displayed in the store's base currency. Minor-unit precision.
   - Helper text adapts to mode ("Charged once per order", "Charged per item × quantity", "Fallback cost for items with no matching class override").

4. **Class Overrides**
   - A repeatable row editor. Each row: a class picker (populated from PRD A2), a cost input, and a remove button.
   - "Add class override" button appends a row.
   - In `per_shipping_class` mode, helper text: "Each class present in the cart contributes its cost. Items with no matching override use the base cost above."
   - In `per_order` / `per_item` mode, helper text: "These costs are added to the base cost for each matching class in the cart."

5. **Clamps**
   - `Minimum cost` (optional) — currency input.
   - `Maximum cost` (optional) — currency input.
   - Validation: max ≥ min when both set.

6. **Tax**
   - `Shipping is taxable` — toggle. Default on.
   - Muted footnote: "Your store-wide tax settings may override this."

7. **Availability Rule (optional)**
   - Rule picker (populated from PRD A6).
   - "Clear rule" link.

8. **Sort Order**
   - Not shown as a number input; reordering is handled via drag-and-drop in the list.

### Preview Widget

A right-column (or below-form on narrow screens) live preview titled "Quote Preview". Merchant enters a synthetic cart:

- Item count.
- Subtotal.
- Optional shipping class dropdown for the "mostly-this-class" scenario, plus a "Mixed classes" toggle that reveals per-class quantity rows.

As the merchant edits the form, the preview recalculates in real time (client-side reuse of `computeFlatRateCost`) and shows:

- "If cart contains 3 items totaling $60 of class Standard, cost = $5.00."
- A breakdown table when `per_shipping_class` or overrides are in play.

The preview must recalculate in under sixteen milliseconds to feel instant at sixty frames per second. Since the math is trivial and pure, this is well within budget.

### Save & Navigate

- "Save" applies the mutation and stays on the editor.
- "Save and return to zone" applies and navigates back to the zone editor.
- "Delete" opens a confirmation dialog (the only acceptable popup per project UI rules).
- Unsaved-changes guard prevents accidental navigation away.

### Validation Surface

- Inline errors on each field.
- A top-of-form error banner only for cross-field issues (e.g., "Maximum cost must be greater than minimum cost").

---

## 8. Merchant Workflow

The golden-path workflow: **"How do I add $5 flat shipping to my US Continental zone?"**

1. Admin navigates to Settings → Commerce → Shipping → Zones.
2. Clicks "United States — Continental" (a zone previously created per PRD A1).
3. Scrolls to the "Shipping Methods" section.
4. Clicks "Add method".
5. Selects "Flat Rate" from the picker.
6. Lands on the Flat Rate editor, pre-associated with the zone.
7. Types `Standard` for Name and `Standard Shipping` for Label.
8. Leaves Cost Mode as the default "Per order".
9. Types `5.00` into Base Cost.
10. Leaves everything else at defaults.
11. Clicks "Save and return to zone".

Total elapsed time target: under sixty seconds from step 1.

Secondary workflow: **"Make oversized items $25 flat while everything else ships for $5."**

1. In the same zone, click "Add method" → "Flat Rate".
2. Name `With Oversized Surcharge`, Label `Standard Shipping`.
3. Cost Mode: `Per shipping class`.
4. Base Cost: `5.00` (fallback for items with no class).
5. Class Overrides: add `Oversized → 25.00`, add `Standard → 5.00`.
6. Save.

Tertiary workflow: **"Charge $2 per item, but never more than $20 and never less than $4."**

1. New Flat Rate method.
2. Cost Mode: `Per item`. Base Cost: `2.00`. Min: `4.00`. Max: `20.00`. Save.

---

## 9. Storefront UX

The Flat Rate method contributes a single quote line to the shipping chooser rendered by the Checkout system. That system owns rendering; this PRD specifies only what gets emitted.

Typical appearance in the checkout shipping step:

- Radio option labeled exactly as the method's `label` field (e.g., "Standard Shipping").
- Price on the right, formatted in the cart's display currency (converted by the commerce presentation layer if different from the base currency).
- When multiple flat rate instances are enabled in the same zone (e.g., Standard $5 and Expedited $15), both appear as separate radio options.

The customer never sees the mode (`per_order` / `per_item` / `per_class`), the base cost, the class overrides, or any of the internal knobs. They see only `label` and the final cost.

Order confirmation emails and order detail pages display the selected method's `label` plus the cost line — both are owned by the Order and Email Notification systems consuming the order's immortalized shipping line, not by this PRD.

---

## 10. Edge Cases

- **Cart with items from multiple classes in `per_shipping_class` mode.** Every distinct class present contributes its override cost. A cart containing one Standard item and one Oversized item with overrides `Standard=$5` and `Oversized=$25` yields $30. If only Standard is overridden and Oversized is not, Oversized falls back to `baseCost`.
- **Empty cart.** The pipeline short-circuits and never calls the method. Defensive: if called, `computeFlatRateCost` returns `{ cost: 0 }` with an empty breakdown rather than throwing.
- **Cart with only non-shippable items.** `shippableItemCount = 0`. The pipeline should not request shipping quotes at all; if it does, `per_item` returns 0 and `per_order` still returns `baseCost` unless `baseCost` is also 0. Merchants who want zero shipping on all-digital carts should configure a rule via PRD A6.
- **`minCost` and `maxCost` clamping.** Applied after all mode math. If `minCost > maxCost`, mutation validation rejects; never reachable at calc time.
- **Zero-cost flat rate.** `baseCost = 0` with `per_order` and no overrides is valid — this is effectively "free shipping". The method returns cost `0` with the configured label. The store-wide "Free Shipping" method remains a separate PRD, intended for threshold-based free shipping.
- **Method attached to a deleted zone.** The zone system's delete cascade (PRD A1) deletes all attached methods. If that cascade is bypassed or races, the method's `zoneId` becomes dangling; the pipeline's enabled-methods query is joined from the zone side, so orphans are invisible and harmless until cleanup.
- **`classOverrides` references a deleted class.** The shipping classes system emits `shipping.class.deleted`; a listener scrubs matching entries from every `classOverrides` array in this table. If a stale reference survives, `computeFlatRateCost` skips the entry with a warning in the breakdown (`meta.warnings`) and the pipeline logs for operator visibility.
- **Rule references a deleted rule.** The rules engine emits `shipping.rule.deleted`; a listener nulls `ruleId` on affected methods. Until then, the pipeline treats a missing rule as "skip this method" conservatively.
- **Negative cost calculation.** Impossible in the stored config (validators reject negative costs), but if a class override is somehow negative and combines to push the result below zero, the floor-at-zero guard in §5 prevents negative quotes.
- **Multi-currency.** Costs are stored in base currency. Multi-currency display is the presentation layer's job; quotes emit `currency = cart.currency` after conversion. This PRD does not own conversion logic.
- **Huge carts.** 1000-item cart in `per_item` mode: single multiplication, no per-line iteration, O(1). In `per_shipping_class` mode with additive overrides, a single pass over items bucketed by class is O(n). Both comfortably within the 5ms budget.
- **Duplicate name within a zone.** Rejected at mutation time with a specific error code the admin form can surface inline on the Name field.
- **Rule returns false for every cart.** The method simply never appears as a quote. This is not an error; merchants may use rule attachment to create seasonal or conditional methods.
- **`taxable = false` with store override `forceTaxable = true`.** The store setting wins. The pipeline or tax layer handles this merge; the method reports its own flag truthfully.
- **Reorder with partial ID list.** `reorderFlatRateMethods` rejects if the provided `orderedIds` set does not match the full set of existing IDs for the zone. No implicit behavior.

---

## 11. Testing Requirements

A production-grade test suite lives alongside the handler in `convex/shipping/methods/flatRate/flatRate.test.ts` plus component tests for the admin form.

### Unit tests (pure `computeFlatRateCost`)

- `per_order`, empty overrides, single item, cart of 10 items → cost = `baseCost` every time.
- `per_item`, `baseCost = 200` (i.e., $2), `Q = 0 | 1 | 7 | 1000` → expected multiplication.
- `per_shipping_class` with:
  - cart entirely of one class with an override.
  - cart entirely of one class with no override (falls back to `baseCost`).
  - cart of two classes both overridden.
  - cart of three classes, two overridden, one falling back.
  - cart of zero shippable items.
- Additive overrides in `per_order` mode: `baseCost + Σ overrides`.
- Additive overrides in `per_item` mode: `baseCost × Q + Σ (override × classQuantity)`.
- `minCost` clamp: candidate below floor → clamped. Candidate at floor → unchanged. Candidate above floor → unchanged.
- `maxCost` clamp: mirror of the above.
- Both clamps simultaneously.
- Negative candidate defense: synthesized malformed config must not produce negative cost.
- Missing `shippingClassId` on items → treated as the "no class" bucket consistently.

### Mutation tests

- `createFlatRateMethod` happy path; capability denial; invalid `zoneId`; invalid `classId`; invalid `ruleId`; duplicate name within zone; cross-zone duplicate names allowed.
- `updateFlatRateMethod` partial patches; cross-field validation (`min ≤ max`); event emission.
- `deleteFlatRateMethod` emits event; removes the row.
- `reorderFlatRateMethods` rejects partial lists; rejects IDs from another zone; writes correct sortOrder values.
- `toggleFlatRateMethodEnabled` updates `enabled` and stamps `updatedBy` / `updatedAt`.

### Pipeline integration tests

- Zone + one flat rate method → quote appears.
- Zone + disabled flat rate method → quote hidden.
- Zone + rule-gated flat rate method where rule returns false → quote hidden.
- Two flat rate methods in same zone → both quotes appear, ordered by `sortOrder`.
- Cart destination outside zone → method not considered at all.
- Multiple zones matching cart destination → zone resolution per PRD A1 + all matching methods from the winning zone.

### Admin UI tests

- Editor form: field validation inline errors.
- Preview widget matches `computeFlatRateCost` for every mode.
- Drag-to-reorder persists correctly.
- Class picker only shows classes that exist (PRD A2 contract).
- Unsaved-changes guard triggers on navigation attempt.

### Performance tests

- `computeFlatRateCost` on a 1000-item multi-class cart: < 1ms median, < 5ms p99.
- End-to-end `calculateFlatRate` (Convex query): < 5ms p50 against a warm cache, < 15ms p99.

### Property-based tests

A small fast-check (or equivalent) suite over random carts and random method configs, asserting:

- Cost is never negative.
- Cost is always between `minCost` (if set) and `maxCost` (if set).
- `per_order` cost is independent of quantity when `classOverrides` is empty.
- `per_item` cost is monotonically non-decreasing in quantity.

---

## 12. Success Criteria

- A non-technical merchant can set up "Flat Rate $5 on the US Continental zone" in under sixty seconds, measured from first click on the zone to confirmed save.
- Zero calculation errors across the full unit + property-based test matrix in CI.
- `computeFlatRateCost` runs in under 5ms at the 99th percentile on a 1000-item cart.
- `calculateFlatRate` Convex query runs in under 5ms median end-to-end (including document fetch).
- The preview widget reflects the same math as the server calculation — verified by a shared test matrix that runs against both implementations.
- The method integrates with PRD A7 by implementing the `MethodRateCalculator` contract exactly, with no pipeline changes required to add or remove flat rate instances.
- Class and rule deletions automatically scrub references without manual intervention.
- All mutations are permission-gated; no unauthenticated caller can read or write flat rate configuration.
- The admin form renders with no hardcoded colors, no Radix imports, and no modal dialogs for content management (delete confirmation excepted).
- Duplicate-name-within-zone is prevented; cross-zone name collisions are allowed.

---

## 13. Roles & Capabilities

A single capability gates all writes:

- `admin.shipping.methods.manage` — create, update, delete, reorder, toggle. Shared across every Layer B method (Flat Rate, Free Shipping, Table Rate, Weight-Based, carrier integrations). A merchant who can manage one method type can manage all of them.

Reads are gated by the broader `admin.shipping.view` capability (owned by PRD A1). No public client-facing query exposes raw flat rate configuration; storefronts see only the derived quote.

Default role grants:

| Role | `admin.shipping.methods.manage` | `admin.shipping.view` |
|------|---|---|
| Administrator | yes | yes |
| Editor | no | yes (read-only) |
| Author | no | no |
| Contributor | no | no |
| Subscriber | no | no |

---

## 14. Events Fired

This method type emits the shared Layer B events. Exact event names, payload shapes, and emission timing are coordinated with the Event Dispatcher System and with sibling method PRDs to ensure cross-method consistency.

- `shipping.method.created` — payload: `{ methodType: "flat_rate", methodId, zoneId, actorUserId, snapshot }`.
- `shipping.method.updated` — payload: `{ methodType: "flat_rate", methodId, zoneId, actorUserId, before, after, changedFields }`.
- `shipping.method.deleted` — payload: `{ methodType: "flat_rate", methodId, zoneId, actorUserId, snapshot }`.

Events are emitted via the `emitEvent` helper in a transaction with the mutation, so listeners never observe divergent state.

Listeners already wired by upstream systems:

- **Audit Log** subscribes to all three to immortalize changes.
- **Site Notifications** optionally notifies other administrators of critical changes (configurable).
- **Cache invalidation** for PRD A7's quote cache subscribes to `updated` and `deleted` to purge relevant entries.

No events are fired at quote time — quotes are computed pure-functionally per cart and are not persisted.

---

## 15. References

- **ConvexPress internal PRDs:**
  - A1 — Shipping Zones System — `specs/ConvexPress/systems/shipping-zones-system/PRD.md`
  - A2 — Shipping Classes System — `specs/ConvexPress/systems/shipping-classes-system/PRD.md`
  - A6 — Shipping Rules Engine — `specs/ConvexPress/systems/shipping-rules-engine/PRD.md`
  - A7 — Rate Calculation Pipeline — `specs/ConvexPress/systems/rate-calculation-pipeline/PRD.md`
  - Role & Capability System — `specs/ConvexPress/systems/role-capability-system/PRD.md`
  - Event Dispatcher System — `specs/ConvexPress/systems/event-dispatcher-system/PRD.md`
  - Audit Log System — `specs/ConvexPress/systems/audit-log-system/PRD.md`

- **External references (for parity and design inspiration):**
  - WooCommerce — "Flat Rate Shipping" settings documentation (cost, cost per class, shipping class costs, `[qty]` placeholder semantics, min/max amount extensions).
  - Shopify — "Flat rate shipping" help article (per-order and price/weight-based modes at the platform level).
  - BigCommerce — "Per Order" and "Per Item" shipping method configuration.
  - Magento 2 — "Flat Rate" shipping method (`carriers/flatrate` configuration), per-order and per-item modes.

- **Related ConvexPress assets:**
  - Schema hub — `ConvexPress-Admin/packages/backend/convex/schema.ts`
  - Shipping schema module — `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts`
  - Handler module — `ConvexPress-Admin/packages/backend/convex/shipping/methods/flatRate/` (new)
  - Admin zone editor route (parent surface) — `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/shipping/zones/$zoneId/` (to be extended by this PRD's UI contributions)
