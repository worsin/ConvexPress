# Shipping Method: Dimensional (DIM Weight) — PRD

**System ID:** B3
**Layer:** B (Shipping Method Calculator)
**Status:** Draft
**Owner:** Commerce / Shipping Subsystem
**Sibling Method:** B2 Weight-Based (shares tier table structure; swaps billable-weight input for actual-weight input)
**Upstream:** A1 Zones, A2 Classes, A3 Packages, A6 Rules, A7 Pipeline

---

## 1. Context & Intent

Carriers (UPS, FedEx, USPS Priority, DHL, and most regional/international couriers) do not bill purely on actual weight. They bill on **billable weight**, defined as:

> `billable_weight = MAX(actual_weight, dimensional_weight)`

Dimensional weight (DIM weight) converts the **volume** of a package into an equivalent weight using a carrier-published **divisor**:

> `dim_weight = (L × W × H) / divisor`

A bulky but light item — a 24×18×18 inch box of pillows weighing 4 lb — is a textbook case. The actual weight is 4 lb, but the DIM weight at the US domestic divisor of 139 (inches → lb) is:

> `(24 × 18 × 18) / 139 = 7776 / 139 = 55.94 → rounds up to 56 lb`

The merchant is billed by the carrier on 56 lb, not 4 lb. If ConvexPress only supported actual-weight tiers (B2), the merchant would undercharge the customer by the difference between the 4 lb tier and the 56 lb tier on every sale of that SKU — frequently a multi-dollar, multiply-compounded loss.

**Intent:** Provide a first-class shipping method calculator that models DIM weight natively, matches carrier billable-weight conventions to within 1 ounce, and shares the same tier-table user experience as B2 Weight-Based so merchants can migrate or run both side-by-side per zone.

**Non-goals:** Querying live carrier APIs, negotiating carrier contracts, printing labels, or discovering the "right" divisor dynamically. Divisors are merchant-configured. This method is a **rate calculator**, not a shipping integration.

---

## 2. Scope

### In Scope

- **DIM weight calculation** per package using `(L × W × H) / divisor`, unit-aware (inches vs centimeters).
- **Billable weight derivation** per package: `MAX(actual, DIM)`.
- **Tier table lookup** on the **sum of per-package billable weights** for the full cart.
- **Per-zone divisor override** — a single method may reuse the same tier ladder across zones A1, but domestic (A1.zoneId=US) uses divisor 139 while international (A1.zoneId=CA/MX/INTL) uses 166 or 5000.
- **Class override hooks** — A2 shipping classes can force a method, exclude items, or swap divisor (e.g., "oversized" class always uses carrier 139 regardless of zone default).
- **Rounding conventions** — per carrier: round UP to next whole lb (UPS/FedEx/USPS) or next 0.5 kg (DHL metric).
- **Admin worked-example preview** — editor shows a live sample computation using the current divisor and a user-entered L×W×H.
- **CRUD** for the method record, its tier ladder, and per-zone divisor overrides.
- **A7 pipeline integration** — bin-packed from A3 Packages, fed through this calculator, returned as a quote to the cart.

### Out of Scope

- Carrier API calls (no UPS Rating API, no FedEx Web Services, no USPS RateV4, no DHL XML-PI). Those are a future **Layer C** integration system.
- Automatic box selection beyond what A3 Packages provides. This method **consumes** packed packages; it does not pack.
- Label printing, manifesting, or tracking.
- Fuel surcharges, residential surcharges, address-correction fees, Saturday-delivery fees.
- Insurance/declared-value pricing.
- Oversize/overweight carrier penalties beyond the tier ladder the merchant configures.
- Negotiated-rate discounts tied to carrier account numbers.

---

## 3. Dependencies

| PRD ID | System | How Used |
|--------|--------|----------|
| A1 | Zones | Resolves destination → `zoneId`. Method has one row per zone; per-zone divisor override keyed on `zoneId`. |
| A2 | Shipping Classes | Class overrides can force divisor, exclude items, or route to a sibling method. |
| A3 | Packages | Source of packed box dimensions (L×W×H) and weight. Pipeline invokes packer before calling B3. |
| A6 | Rules | Pre- and post-calculation rules (e.g., "free DIM shipping over $200", "add $5 handling per package"). |
| A7 | Pipeline | Orchestrator that: (1) picks applicable methods for zone, (2) calls each method, (3) applies rules, (4) returns quote set. |
| B2 | Weight-Based | Sibling. Shares tier schema `shippingTier[]`. Shared validator in `convex/shipping/validators.ts`. B3 is effectively "B2 with billable weight as input." |
| Settings System | Site settings | Default divisor (139), default unit system (imperial/metric), rounding mode. |
| Role & Capability System | RBAC | `admin.shipping.methods.manage` capability gates CRUD. |
| Event Dispatcher System | Events | Emits shared `shipping.method.*` events (see §14). |
| Audit Log System | Audit | Divisor changes, tier edits, and enable/disable flips are audit-logged. |

---

## 4. Schema

### 4.1 New table: `commerce_shipping_method_dimensional`

Lives in `convex/schema/shipping.ts` alongside B1 Flat-Rate, B2 Weight-Based, B4+ (free, local-pickup, etc.). Each row represents **one method configuration for one zone**.

```
commerce_shipping_method_dimensional
  _id:              Id<"commerce_shipping_method_dimensional">
  zoneId:           Id<"commerce_shipping_zones">       // A1
  name:             string                              // internal, e.g. "UPS Ground DIM - US"
  label:            string                              // customer-facing, e.g. "Standard Shipping"
  description:      optional<string>                    // shown in checkout
  divisor:          number                              // default 139
  weightUnit:       "lb" | "kg" | "oz" | "g"            // default from site settings
  dimensionUnit:    "in" | "cm"                         // must pair with divisor (see §4.3)
  roundingMode:     "up_whole" | "up_half" | "nearest"  // default "up_whole"
  minBillableWeight:optional<number>                    // floor per package (carrier minimum; e.g. UPS = 1 lb)
  tiers:            ShippingTier[]                      // same shape as B2
  classOverrides:   ClassOverride[]                     // see §4.2
  perZoneDivisors:  optional<PerZoneDivisor[]>          // see §4.2 - for methods that span multiple zones
  enabled:          boolean
  sortOrder:        number                              // display order at checkout
  ruleId:           optional<Id<"commerce_shipping_rules">> // optional A6 attachment
  createdBy:        Id<"users">
  createdAt:        number
  updatedBy:        Id<"users">
  updatedAt:        number

Indexes:
  by_zone:          ["zoneId"]
  by_zone_enabled:  ["zoneId", "enabled"]
  by_zone_sort:     ["zoneId", "sortOrder"]
  by_rule:          ["ruleId"]
```

### 4.2 Embedded types

```
ShippingTier (identical shape to B2; shared validator)
  minWeight:   number   // inclusive, in weightUnit
  maxWeight:   number   // exclusive; Infinity sentinel = 999999
  cost:        number   // minor units (cents)
  perUnitCost: optional<number>   // cents per weightUnit above minWeight
  label:       optional<string>   // e.g. "1-5 lb"

ClassOverride
  classId:     Id<"commerce_shipping_classes">
  action:      "exclude" | "force_divisor" | "force_tier" | "surcharge"
  divisor:     optional<number>   // when action = force_divisor
  tierIndex:   optional<number>   // when action = force_tier
  surcharge:   optional<number>   // cents, when action = surcharge

PerZoneDivisor
  zoneId:      Id<"commerce_shipping_zones">
  divisor:     number
  // used only when one method record spans multiple zones via a "zone group";
  // most merchants duplicate the method per zone instead
```

### 4.3 Divisor / unit pairing rules

The divisor's magnitude depends on the unit system. Cross-unit divisors produce garbage. The schema enforces a validator on `(dimensionUnit, divisor)`:

| `dimensionUnit` | Valid divisor range | Typical values |
|---|---|---|
| `in` | 100 - 250 | **139** (US domestic), **166** (international), **194** (legacy low-density) |
| `cm` | 3000 - 8000 | **5000** (DHL metric, most international), **6000** (legacy), **4000** (premium) |

A divisor of 139 with `dimensionUnit: "cm"` is rejected at the mutation validator layer. See §10 Edge Cases.

---

## 5. Data Model (Pipeline)

The A7 pipeline invokes B3 as part of the broader quote flow:

```
 Cart state                       A3 Packages                      B3 Dimensional
 ──────────                       ───────────                      ──────────────
 lineItems[]      ──packer──►     packages[] each has:    ──►      for each package p:
   qty, weight,                    boxId, L, W, H,                   billable(p) =
   L, W, H,                        actualWeight,                       MAX( actualWeight,
   classId,                        items[]                                  ceil((L×W×H)/divisor
   addons                                                                     , roundingMode) )
                                                                    totalBillable =
                                                                      Σ billable(p)
                                                                    tier = lookup(totalBillable)
                                                                    base = tier.cost +
                                                                           (totalBillable - tier.min)
                                                                            × tier.perUnitCost
                                                                    apply classOverrides
                                                                    apply A6 rules (pre-emit)
                                                                    emit quote {label, amount, method}
```

### 5.1 Per-package vs whole-cart billable weight

**Carrier behavior:** carriers bill per-package (per-shipment). A 4 lb pillow box and a 50 lb weight plate ship as two packages and are billed independently, then summed.

**B3 mirrors this:** DIM is computed **per package**, then `MAX(actual, dim)` per package, then summed. Summing actual weights first and then taking a single MAX with a single DIM is **wrong** — it understates on mixed carts of dense + bulky.

### 5.2 Rounding order of operations

1. Compute raw DIM: `raw = (L × W × H) / divisor` — floating point, unrounded.
2. Compute raw billable: `raw_billable = MAX(actualWeight, raw_dim)` — floating point.
3. Apply `roundingMode`:
   - `up_whole` → `Math.ceil(raw_billable)` (UPS/FedEx/USPS imperial)
   - `up_half` → `Math.ceil(raw_billable * 2) / 2` (DHL metric, 0.5 kg steps)
   - `nearest` → `Math.round(raw_billable)` (rare; some freight)
4. Apply `minBillableWeight` floor per package.
5. Sum rounded per-package billables → `totalBillable`.
6. Look up tier on `totalBillable`.

**Do not round before the MAX.** Rounding 3.4 lb actual up to 4 lb and then taking MAX with 3.9 lb DIM gives 4 lb when the correct answer (post-MAX, post-round) is `ceil(MAX(3.4, 3.9)) = 4`. Same here, but the general rule matters: round last.

### 5.3 Tier lookup (identical to B2)

```
for tier in tiers (sorted ascending by minWeight):
  if totalBillable >= tier.minWeight AND totalBillable < tier.maxWeight:
    cost = tier.cost
    if tier.perUnitCost:
      cost += (totalBillable - tier.minWeight) × tier.perUnitCost
    return cost

// overflow: totalBillable exceeds last tier
// behavior = method.overflowBehavior (future): "use_last" | "reject" | "quote_with_surcharge"
// v1: use_last
```

---

## 6. Functions / API

All live under `convex/shipping/methods/dimensional.ts` with shared helpers in `convex/shipping/helpers/dimWeight.ts`.

### 6.1 Public mutations (client-callable, RBAC-gated)

```
shipping.methods.dimensional.create
  args: {
    zoneId, name, label, description?, divisor, weightUnit, dimensionUnit,
    roundingMode?, minBillableWeight?, tiers, classOverrides?,
    perZoneDivisors?, enabled?, sortOrder?, ruleId?
  }
  capability: admin.shipping.methods.manage
  emits: shipping.method.created
  returns: Id<"commerce_shipping_method_dimensional">

shipping.methods.dimensional.update
  args: { id, patch: Partial<above> }
  capability: admin.shipping.methods.manage
  emits: shipping.method.updated
  audit: before/after snapshot

shipping.methods.dimensional.remove
  args: { id }
  capability: admin.shipping.methods.manage
  emits: shipping.method.deleted
  soft-delete preferred if referenced by historical orders

shipping.methods.dimensional.duplicate
  args: { id, newZoneId?, newName? }
  capability: admin.shipping.methods.manage
  // clones the method into another zone; common workflow for "copy US config to CA, bump divisor to 166"

shipping.methods.dimensional.setEnabled
  args: { id, enabled }
  capability: admin.shipping.methods.manage
  emits: shipping.method.enabled | shipping.method.disabled

shipping.methods.dimensional.reorder
  args: { zoneId, orderedIds: Id[] }
  capability: admin.shipping.methods.manage
```

### 6.2 Public queries

```
shipping.methods.dimensional.list
  args: { zoneId?, enabledOnly? }
  returns: DimensionalMethod[]

shipping.methods.dimensional.get
  args: { id }

shipping.methods.dimensional.preview
  args: { id, sampleCart: { packages: {L,W,H,weight}[] } }
  // Admin-only. Runs the full calculation and returns a breakdown:
  //   per-package DIM, per-package billable, totalBillable, tier hit, final cost.
```

### 6.3 Internal functions (pipeline-callable, not client-callable)

```
shipping.methods.dimensional.calculateDimensional  (internalQuery)
  args: {
    methodId,
    zoneId,
    packages: PackedPackage[],   // from A3
    classesInCart: Id<"commerce_shipping_classes">[],
  }
  returns: {
    methodId,
    quoteAmount: number,   // cents
    breakdown: {
      perPackage: { packageIndex, L, W, H, actualWeight, dimWeight, billable }[],
      totalBillable: number,
      tierHit: ShippingTier,
      classAdjustments: { classId, action, delta }[],
    }
  }
  // Consumed by A7 pipeline.
```

### 6.4 Shared helpers (`convex/shipping/helpers/dimWeight.ts`)

```
computeDimWeight(L, W, H, divisor): number
  // Pure. Returns raw (unrounded) DIM weight.
  // Throws if any dimension <= 0.

computeBillableWeight(pkg: {L,W,H,weight}, divisor, roundingMode, minBillable?): number
  // Returns rounded, floored billable weight for one package.

resolveDivisor(method, zoneId, classId?): number
  // Priority order:
  //   1. classOverride.divisor for this classId
  //   2. perZoneDivisors[zoneId]
  //   3. method.divisor
  // Returns the effective divisor for this (method, zone, class) tuple.

validateDivisorUnitPair(divisor, dimensionUnit): void
  // Throws ConvexError if out of range for the unit system.

sumBillableAcrossPackages(packages, divisor, roundingMode, minBillable?): number
```

### 6.5 Validators

Shared Zod-style argument validators in `convex/shipping/validators.ts`:

- `shippingTierValidator` — reused by B2 and B3.
- `dimensionalMethodCreateArgs` — full create-args shape.
- `dimensionalMethodUpdateArgs` — partial update shape.
- `classOverrideValidator` — reused across B2/B3/B4.

---

## 7. Admin UX

Route: `/admin/commerce/shipping/zones/$zoneId/methods/$methodId/edit`
Full-page editor (no modals — project rule).

### 7.1 Editor layout

```
┌─ Method: Dimensional (DIM Weight) ─────────────────────────────┐
│  [ General ] [ Divisor & Units ] [ Tiers ] [ Class Overrides ] │
│  [ Preview ]                                                   │
└────────────────────────────────────────────────────────────────┘
```

**Tab: General**
- Name (internal), Label (customer-facing), Description.
- Enabled toggle.
- Sort order.
- Attach rule (optional, dropdown of A6 rules).

**Tab: Divisor & Units**
- Weight unit: `lb | kg | oz | g` (default = site setting).
- Dimension unit: `in | cm` (default = site setting).
- **Divisor field** with a helper dropdown:
  - 139 - US Domestic (UPS/FedEx/USPS, inches)
  - 166 - International Express (inches)
  - 194 - Legacy low-density (inches)
  - 5000 - DHL Metric (cm)
  - 6000 - Legacy metric (cm)
  - Custom...
- Rounding mode: `Round up to next whole unit` / `Round up to next half unit` / `Round to nearest`.
- Minimum billable weight per package (optional, carrier minimum — e.g. 1 lb for UPS).
- **Live validation:** if dimension unit and divisor mismatch (cm + 139), show inline warning with "use 5000 for cm" suggestion.

**Tab: Tiers** (identical UI to B2)
- Table with columns: `Min Weight | Max Weight | Base Cost | Per-Unit Cost | Label`
- Add row, drag to reorder, delete row.
- Validation: no gaps, no overlaps, ascending order, last row max = ∞ sentinel.
- Inline column header says "Billable Weight" (not "Weight") — this is the disambiguator from B2.

**Tab: Class Overrides**
- Per-class rule matrix: for each A2 class used on site, optional override of action (exclude, force divisor, force tier, surcharge).

**Tab: Preview** (worked example)
- Live calculator:
  - Enter L, W, H, actual weight for 1-N packages.
  - Live output:
    - Raw DIM per package
    - Billable per package (post-round)
    - Total billable
    - Tier hit (highlighted in Tiers tab)
    - Final cost breakdown
  - A "Copy cart from order #..." shortcut: load a real historical order's packed packages and see what the method would quote.

### 7.2 List view

Route: `/admin/commerce/shipping/zones/$zoneId` (zone detail page; shares chrome with B1/B2/B4+)

Methods appear as sortable cards/rows:
```
  ┌─────────────────────────────────────────────────────────┐
  │ [↕] Standard Shipping (Dimensional, divisor 139)  [ON]  │
  │     5 tiers · 1-50 lb billable · $8.99-$42.00          │
  │     [Edit] [Duplicate] [Delete]                         │
  └─────────────────────────────────────────────────────────┘
```

### 7.3 Duplicate-to-zone quick action

Common merchant workflow:
1. Configure US method with divisor 139, 5 tiers.
2. Click **Duplicate → Canada zone**.
3. Editor opens pre-filled with divisor auto-suggested as 166 (international), tiers copied, name bumped to "Standard Shipping - CA".
4. Merchant adjusts and saves.

---

## 8. Merchant Workflow

### 8.1 Initial setup (single zone, US domestic)

1. Merchant goes to **Commerce → Shipping → Zones → United States**.
2. Clicks **Add Method → Dimensional (DIM Weight)**.
3. Names it "UPS Ground" (internal) and "Standard Shipping" (customer-facing).
4. Divisor & Units tab: leaves defaults (139, inches, pounds, round up whole).
5. Tiers tab: enters carrier rate card:
   - 0-1 lb: $8.99
   - 1-5 lb: $10.99
   - 5-10 lb: $14.99
   - 10-25 lb: $22.99
   - 25-50 lb: $34.99
   - 50+ lb: $42.00 + $0.50/lb
6. Preview tab: enters a 24×18×18 in, 4 lb test package. Sees: DIM = 56 lb, billable = 56 lb, tier = 50+, cost = $45.00. Confirms this matches UPS's real-world invoice for that shipment.
7. Enables the method. Saves.

### 8.2 Expanding to international

1. On the US zone method list, click **Duplicate** on "UPS Ground" method, pick zone "Canada".
2. Editor opens with divisor auto-suggested as **166**.
3. Merchant bumps tier costs upward to account for international rates.
4. Saves.

### 8.3 Running alongside B2 Weight-Based

Some merchants use B2 for small/dense products (apparel) and B3 for bulky products (home goods). Two methods, same zone, different `sortOrder`. Classes (A2) can steer items to one or the other via `classOverrides.action = "exclude"`.

### 8.4 Carrier migration (annual divisor changes)

DIM divisors change. UPS moved from 166 to 139 in 2017 for domestic packages ≤ 1 cubic foot. When a carrier changes its divisor:
1. Merchant edits the method, updates divisor.
2. Preview tab recalculates against a handful of saved test packages.
3. Saves. All future quotes use the new divisor. Historical orders are unaffected (quote was frozen at order time).

---

## 9. Storefront UX

B3 is invisible to the shopper beyond the label and the quoted amount. The cart/checkout sees only the quote produced by A7 pipeline:

```
  Shipping:
    (•) Standard Shipping - $18.99  (3-5 business days)
    ( ) Expedited Shipping - $34.99  (2 business days)
```

Whether the $18.99 was produced by B1 Flat, B2 Weight, or B3 Dimensional is opaque to the customer. No DIM math is ever exposed at the storefront.

**Cart reactivity:** Convex's reactive queries mean that editing a line item quantity or removing an item triggers A3 re-pack → A7 re-quote → B3 re-calc → new amount renders. No polling, no refresh.

**Quote freeze at order creation:** when the order is placed, the chosen quote's `amount`, `methodId`, and `breakdown` are copied onto the order record. Subsequent method edits (divisor changes, tier edits) do not retroactively affect placed orders.

---

## 10. Edge Cases

### 10.1 Items without dimensions

If a product or its variant has no `length`, `width`, or `height`:
- A3 Packages will either use the default box dimensions or flag the item.
- B3 receives a package with dims set to the default box dims (not 0).
- If A3 emits a package with a missing dimension (all zero or null), B3 falls back to `billable = actualWeight` for that package and logs a warning to the event stream. This prevents free shipping from a math error (e.g. `0 / 139 = 0`).

### 10.2 Multi-package shipments

Per §5.1, DIM is computed per package, then summed. A cart that packs into 3 boxes produces `Σ billable_i`, not a single MAX over a fictional combined box.

### 10.3 Mixed units

The admin setting pairs `(dimensionUnit, weightUnit, divisor)`. The calculation is executed entirely in those units; no implicit conversion. If a product stores dims in cm but the method uses inches, A3 Packages is responsible for converting during packing, and A3 emits packages in the method's native unit.

### 10.4 Divisor / unit mismatch

Enforced at the validator layer (§4.3). Rejected at mutation time with `ConvexError("Divisor 139 is invalid for dimensionUnit=cm; use 5000 or switch to inches")`.

### 10.5 Rounding up to next whole unit

UPS, FedEx Ground/Express, and USPS all round the billable weight **up to the next whole pound** (or next whole kilogram internationally). DHL Express rounds up to the next **0.5 kg**. Merchants pick `roundingMode` to match their carrier. Documented in §11 Testing Requirements.

### 10.6 Very small packages (under carrier minimum)

Most carriers bill at a 1 lb minimum. `minBillableWeight` floor handles this: a 3×3×3 in, 4 oz package computes `raw_dim = 27/139 = 0.19 lb`, `billable = MAX(0.25, 0.19) = 0.25`, floored to `minBillableWeight = 1 lb`, tier lookup happens at 1 lb.

### 10.7 Extreme aspect ratios (long tubes, flat envelopes)

A 60×3×3 in poster tube: DIM = `540 / 139 = 3.89 → 4 lb`. Actual = 1 lb. Billable = 4 lb. Correctly captured. No special case needed — the math handles it.

### 10.8 Zero-weight digital-but-packaged items

A bundled physical + digital product where the shippable portion has actual weight 0 but real dimensions: `billable = MAX(0, dim) = dim`. Correct behavior — merchant pays to ship the box.

### 10.9 Very large DIM (volumetric outliers)

A 48×40×60 in furniture box at divisor 139: DIM = `115200 / 139 = 828.78 → 829 lb`. This likely exceeds every tier. `overflowBehavior = use_last` (v1) returns the last tier's cost plus `perUnitCost × overflow`. Alternative `overflowBehavior = reject` (v2) causes the method to decline, letting A7 fall back to another method or show "contact us for freight quote".

### 10.10 Negative / zero dims

Guard in `computeDimWeight` — throws. Upstream validator in A3 Packages should prevent this.

### 10.11 Floating-point precision

`(24 * 18 * 18) / 139` is exact in IEEE 754. `(24.5 * 18.25 * 18.75) / 139` is not. Round at the end per §5.2. All intermediate arithmetic stays in floating point; rounding only at the final rounding step.

### 10.12 Class override interactions

- `exclude` on a class: items of that class bypass B3 entirely. If the cart is **all** excluded items, B3 returns no quote (A7 uses a different method).
- `force_divisor`: overrides method.divisor for packages containing that class's items. If packages contain mixed classes, the divisor for that package is the **smallest** divisor among the classes present (conservative — smallest divisor = highest DIM weight).
- `force_tier`: skips tier lookup, uses the specified tier directly for that cart.
- `surcharge`: adds cents to the final quote post-tier-lookup.

### 10.13 Running concurrently with B2

If a zone has both B2 and B3 enabled and no class exclusions, both produce quotes. A7 surfaces both at checkout. Merchants who want single-method behavior configure class overrides or disable one.

---

## 11. Testing Requirements

### 11.1 Unit tests (`convex/shipping/helpers/dimWeight.test.ts`)

Required coverage on `computeDimWeight`, `computeBillableWeight`, `resolveDivisor`, `validateDivisorUnitPair`, `sumBillableAcrossPackages`.

### 11.2 Worked examples (must pass as fixtures)

The following five examples are locked as test fixtures. Any change to the DIM calc must keep these green.

**Example 1: The pillow box (UPS Ground US)**
- Package: 24 × 18 × 18 in, actual weight 4 lb
- Divisor: 139, rounding `up_whole`
- Raw DIM: `7776 / 139 = 55.9424...`
- Billable: `MAX(4, 55.9424) = 55.9424` → ceil → **56 lb**

**Example 2: The dense shipment (UPS Ground US)**
- Package: 10 × 8 × 6 in, actual weight 12 lb
- Divisor: 139, rounding `up_whole`
- Raw DIM: `480 / 139 = 3.4532`
- Billable: `MAX(12, 3.45) = 12` → ceil → **12 lb**
- Demonstrates: actual wins when dense; no DIM penalty.

**Example 3: The tube (USPS Priority US)**
- Package: 36 × 4 × 4 in, actual weight 0.75 lb
- Divisor: 166 (USPS uses 166 for oversize as of 2023)
- Raw DIM: `576 / 166 = 3.4698`
- Billable: `MAX(0.75, 3.47) = 3.47` → ceil → **4 lb**

**Example 4: DHL international metric**
- Package: 40 × 30 × 20 cm, actual weight 3 kg
- Divisor: 5000, dimensionUnit cm, weightUnit kg, rounding `up_half`
- Raw DIM: `24000 / 5000 = 4.8 kg`
- Billable: `MAX(3, 4.8) = 4.8` → round up to next 0.5 kg → **5.0 kg**

**Example 5: Multi-package cart**
- Package A: 24 × 18 × 18 in, 4 lb → billable 56 lb (example 1)
- Package B: 10 × 8 × 6 in, 12 lb → billable 12 lb (example 2)
- Total billable: **68 lb**
- Tier ladder: last tier "50+ lb at $42 + $0.50/lb"
- Cost: `42.00 + (68 - 50) × 0.50 = 42.00 + 9.00 = $51.00`
- Demonstrates per-package MAX before sum.

### 11.3 Integration tests

- Create method → list it → preview → calculate via internal pipeline → verify quote.
- Divisor / unit mismatch rejected at mutation.
- Class override `exclude` removes items from the billable sum.
- Class override `force_divisor` changes per-package divisor only for affected packages.
- Class override `surcharge` adds to final quote, not to billable weight.
- Reactivity: edit tier cost → client receives new quote without refetch.
- Duplicate-to-zone copies tiers, bumps divisor suggestion.

### 11.4 Per-carrier convention smoke tests

For each of UPS Ground, FedEx Home Delivery, USPS Priority, DHL Express, one real-world rate-card shipment is run through B3 and the quote must match the carrier's published invoice amount within **1 ounce** of billable weight and **5 cents** of final price (accounting for zone-specific surcharges which are out-of-scope).

### 11.5 Performance

- `calculateDimensional` internal function must return in **<10 ms** for carts of up to 20 packages. Measured via Convex function timing.
- No database reads beyond the method record itself in the hot path (class overrides and tiers are embedded on the record).

### 11.6 RBAC tests

- `admin.shipping.methods.manage` required for all mutations.
- Queries are read-unrestricted for `admin.shipping.methods.read` (admin-side).
- `preview` requires `admin.shipping.methods.manage` (admin-only; not exposed to storefront).

---

## 12. Success Criteria

1. **Accuracy:** Billable weight for any (L, W, H, actualWeight, divisor, roundingMode) tuple matches the carrier's invoiced billable weight within **1 ounce** (or 0.03 kg metric).
2. **Performance:** `calculateDimensional` completes in **<10 ms** p95 for carts up to 20 packages.
3. **Zero undercharge:** Merchants migrating from B2 Weight-Based to B3 Dimensional on bulky SKUs see their shipping-revenue gap close on the first month's P&L. Targeted SKU categories: bedding, lampshades, lightweight home decor, apparel in oversized boxes.
4. **Zero overcharge on dense SKUs:** For SKUs where `actualWeight > dimWeight`, the B3 quote equals the B2 quote (billable defaults to actual; no penalty).
5. **Merchant trust:** The admin Preview tab matches carrier rate-card math exactly, demonstrated side-by-side with carrier quoting tools.
6. **Migration:** Any existing B2 Weight-Based method can be copied into B3 form by `duplicate-to-method-type` (future v2), preserving tiers.
7. **Quote stability:** Placed orders snapshot their quote; divisor edits do not retroactively change order shipping totals.

---

## 13. Roles & Capabilities

| Capability | Administrator | Editor | Author | Contributor | Subscriber |
|---|---|---|---|---|---|
| `admin.shipping.methods.manage` (CRUD, duplicate, enable/disable) | ✓ | ✗ | ✗ | ✗ | ✗ |
| `admin.shipping.methods.read` (list/get in admin) | ✓ | ✓ | ✗ | ✗ | ✗ |
| `admin.shipping.methods.preview` | ✓ | ✓ | ✗ | ✗ | ✗ |
| Use quoted rate at checkout (storefront) | ✓ (all authenticated + guest) | ✓ | ✓ | ✓ | ✓ |

Capabilities registered in the Role & Capability System seed data. The storefront path uses the internal `calculateDimensional` function which is not RBAC-gated (called by A7 pipeline, not by the client directly).

---

## 14. Events Fired

Shared `shipping.method.*` event namespace with B1/B2/B4+ (one event taxonomy for all method types, `methodType` field distinguishes).

| Event | Emitted When | Payload |
|---|---|---|
| `shipping.method.created` | After `create` mutation commits | `{ methodId, methodType: "dimensional", zoneId, name, divisor, userId }` |
| `shipping.method.updated` | After `update` mutation commits | `{ methodId, methodType, zoneId, changedFields[], userId }` |
| `shipping.method.deleted` | After `remove` mutation commits | `{ methodId, methodType, zoneId, userId }` |
| `shipping.method.enabled` | After `setEnabled(true)` | `{ methodId, methodType, zoneId, userId }` |
| `shipping.method.disabled` | After `setEnabled(false)` | `{ methodId, methodType, zoneId, userId }` |
| `shipping.method.duplicated` | After `duplicate` mutation commits | `{ sourceMethodId, newMethodId, fromZoneId, toZoneId, userId }` |
| `shipping.method.quoted` | Each successful `calculateDimensional` invocation | `{ methodId, methodType, zoneId, cartId?, totalBillable, quoteAmount, breakdown }` (high-frequency; sampled at 1% for event listeners) |
| `shipping.method.quote_failed` | Calculation errors (missing dims, tier overflow with `reject`) | `{ methodId, methodType, zoneId, reason, packages }` |
| `shipping.method.divisor_warning` | Divisor/unit mismatch detected at runtime (defensive; should not fire if validators work) | `{ methodId, divisor, dimensionUnit }` |

All events flow through the Event Dispatcher System and are subscribable by merchants via the event listener UI for analytics integrations.

Mutations that change `divisor`, `tiers`, `classOverrides`, or `enabled` are also written to the Audit Log System with a before/after diff.

---

## 15. References

### 15.1 Carrier divisor documentation

| Carrier | Divisor (inches/lb) | Divisor (cm/kg) | Notes |
|---|---|---|---|
| UPS Domestic (US) | 139 | 5000 | Effective 2017; was 166. Applies to all UPS Ground, Air, SurePost. |
| UPS International | 139 | 5000 | Aligned with domestic post-2017. |
| FedEx Ground (US) | 139 | 5000 | Matches UPS as of 2017. |
| FedEx Express (US domestic) | 139 | 5000 | |
| FedEx International | 139 | 5000 | |
| USPS Priority Mail | 166 | — | Only applies to packages >1 cu ft and zones 1-4 exempt. |
| USPS Priority Mail Cubic | n/a | n/a | Cubic pricing uses a different formula (girth + length). |
| DHL Express | — | 5000 | Worldwide standard. Rounds up to next 0.5 kg. |
| DHL Parcel (EU) | — | 5000 | |
| Canada Post | 166 | 6000 | |
| Royal Mail | — | 5000 | |
| Legacy (pre-2007) | 194 | 6000 | Still referenced in some freight contracts. |

### 15.2 Carrier DIM policy links (maintained in merchant docs, not seeded in code)

- UPS: Dimensional Weight Calculator and Service Guide
- FedEx: Dimensional Weight Explanation, Rate Sheet
- USPS: Publication 52 (Hazardous, Restricted, and Perishable Mail) appendix on Dimensional Weight; Priority Mail rate card
- DHL: Volumetric Weight Guidance (DHL Express global)

Merchants are expected to verify the current divisor against their carrier's current published rate card each contract cycle. ConvexPress does not auto-update divisors.

### 15.3 Related ConvexPress PRDs

- A1 Zones PRD — `specs/ConvexPress/systems/shipping-zones/PRD.md`
- A2 Classes PRD — `specs/ConvexPress/systems/shipping-classes/PRD.md`
- A3 Packages PRD — `specs/ConvexPress/systems/shipping-packages/PRD.md`
- A6 Rules PRD — `specs/ConvexPress/systems/shipping-rules/PRD.md`
- A7 Pipeline PRD — `specs/ConvexPress/systems/shipping-pipeline/PRD.md`
- B2 Weight-Based PRD — `specs/ConvexPress/systems/shipping-method-weight-based/PRD.md` (tier structure source of truth)
- B1 Flat-Rate PRD — `specs/ConvexPress/systems/shipping-method-flat-rate/PRD.md`

### 15.4 File locations (for implementing expert)

- Schema: `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` (add `commerce_shipping_method_dimensional` table)
- Handler: `ConvexPress-Admin/packages/backend/convex/shipping/methods/dimensional.ts`
- Shared helper: `ConvexPress-Admin/packages/backend/convex/shipping/helpers/dimWeight.ts`
- Shared validators: `ConvexPress-Admin/packages/backend/convex/shipping/validators.ts` (extend, shared with B2)
- Admin editor: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/shipping/zones/$zoneId/methods/$methodId.tsx` (polymorphic; dispatches to method-type editor component)
- Editor component: `ConvexPress-Admin/apps/web/src/components/commerce/shipping/methods/DimensionalMethodEditor.tsx`
- Preview component: `ConvexPress-Admin/apps/web/src/components/commerce/shipping/methods/DimensionalMethodPreview.tsx`
