# PRD B4 — Price-Based Shipping Method

**System ID:** `shipping-method-price-based`
**Layer:** B (Shipping Method Type)
**Status:** Draft
**Owner:** Commerce / Shipping
**Depends On:** PRD A1 (Shipping Zones), PRD A6 (Shipping Rules Engine), PRD A7 (Rate Calculation Pipeline)
**Sibling Of:** PRD B6 (Free Shipping)

---

## 1. Context & Intent

Price-Based Shipping charges a rate that varies by the cart subtotal. It is the second most common shipping pattern in e-commerce after weight-based pricing, and it is the single most common way merchants implement "free shipping over $100" promotions. A merchant who says "I charge $8 on small orders, $5 on medium orders, and free shipping once you hit a hundred bucks" is describing a price-based tier table, whether they call it that or not.

This is the economic lever merchants reach for when they want to incentivize cart-value growth. Every study of checkout conversion in the last decade has landed on the same finding: a visible free-shipping threshold measurably raises average order value, because shoppers will add one more item to clear it. Price-Based Shipping is how that threshold is implemented mechanically — the cart subtotal is evaluated, the matching tier is selected, and the rate is quoted. When the top tier is zero, the effect is "free shipping over $X" for that zone.

**ConvexPress currently has no price-based shipping method.** This is a gap. A store that cannot express "free shipping over $100" is missing the most common growth lever in the entire commerce playbook, and merchants will not migrate to a platform that forces them to give up this tool. Flat-rate (PRD B2) is not a substitute, because flat-rate ignores cart value. Free Shipping (PRD B6) is adjacent but distinct — B6 is a single conditional "free or nothing" gate, whereas B4 is a full tier table where each tier can have its own non-zero rate.

This PRD specifies the Price-Based Shipping Method — a concrete method type that plugs into the shipping pipeline defined by PRD A7, attaches to a zone defined by PRD A1, and optionally gates availability via PRD A6. It coexists with the Free Shipping method (PRD B6) and is the preferred tool whenever a merchant wants a sliding scale of rates rather than a single threshold.

**Goals:**

- Parity with the WooCommerce Free Shipping "minimum order amount" feature and Shopify's price-based shipping rates.
- Any merchant-defined price tier table is expressible in the schema, including open-ended top tier with per-dollar incremental cost.
- Consistent behavior with other tiered methods (B1 Weight-Based, B3 Dimensional) — same tier structure, same first-match-wins semantics, same open-ended top-tier contract.
- Configurable pre-discount vs post-discount subtotal so merchants can choose whether promo codes count toward the free-shipping threshold.
- Deterministic, side-effect-free calculation that fits inside the rate pipeline performance budget (sub-5ms for typical carts).
- Zero rounding error: all monetary math routes through shared currency helpers; no floating-point drift in the final quote.

**Non-Goals:**

- Single-threshold conditional free shipping — that is PRD B6 (Free Shipping), which exposes a simpler UI for the common "free over $X" case. B4 and B6 coexist; merchants pick whichever better matches their mental model.
- Weight-driven rates — PRD B1 (Weight-Based Shipping).
- Dimensional or volumetric rates — PRD B3.
- Live carrier lookups — PRD B7.
- Tax on shipping — owned by the Tax system, not this method.
- Currency conversion — the method operates in the cart currency and rejects mismatched configurations; FX is not a shipping concern.

---

## 2. Scope

### In Scope

- New Convex table `commerce_shipping_method_price_based` storing per-method tier tables keyed to a zone.
- CRUD mutations and queries scoped to an administrator with the `admin.shipping.methods.manage` capability.
- Tier table editor embedded inside the zone method editor from PRD A1.
- Tier matching algorithm (inclusive `minSubtotal`, exclusive `maxSubtotal`, first-match-wins ordered by `minSubtotal` ascending).
- Open-ended top tier with `incrementalCost` and `incrementalSubtotal` — charges "base + $Y per additional $Z above the top boundary" for high-value carts.
- `useDiscountedSubtotal` toggle controlling whether cart discounts are applied before tier lookup. Default TRUE, matching modern merchant expectations.
- Pre-tax subtotal by default, matching the WooCommerce convention. Tax on shipping is a separate pipeline concern handled by the Tax system.
- `currencyCode` field enforcing that the configured method matches the cart currency.
- `MethodRateCalculator` contract implementation so the method registers itself with the rate pipeline (PRD A7).
- Storefront label hints driven by the matched tier (e.g., "Free over $100", "Standard $5").
- Optional "Add $X for free shipping" hint for carts that would reach a cheaper tier with more spend (driven by the next-cheaper tier, regardless of whether that tier is literally zero).
- Tiered rates by subtotal with optional incremental cost above the top boundary.

### Out of Scope

- Conditional free shipping with a single threshold and no tier ladder — PRD B6 (Free Shipping). B4 is tiered by price; B6 is a single gate. Merchants pick one or the other per zone, or stack them at different priorities.
- Weight-driven rates — PRD B1.
- Dimensional-weight and volumetric rates — PRD B3.
- Flat-rate, single-cost methods — PRD B2.
- Live carrier APIs — PRD B7.
- Per-item shipping overrides — owned by the product-level shipping configuration.
- Multi-currency / FX conversion inside the method — the method requires currency match and returns an error otherwise; FX is out of scope.
- Handling fees, fuel surcharges, insurance — applied by PRD A7 as pipeline steps around the method, not inside this method.

---

## 3. Dependencies

**Upstream (required before this method is functional):**

- **PRD A1 — Shipping Zones.** A price-based method always attaches to exactly one zone via `zoneId`. Zones are the organizing primitive for all Layer B methods; without them the method has no scope of applicability.
- **PRD A6 — Shipping Rules Engine.** Optional `ruleId` on the method gates availability via the rule engine (e.g., "only show this method on weekdays", "only for B2B carts"). The rule is evaluated by A7 before the method is asked for a quote; this PRD does not re-implement rule logic.
- **PRD A7 — Rate Calculation Pipeline.** Defines the `MethodRateCalculator` contract this method implements, the cart model it receives (including `subtotal`, `discountedSubtotal`, `currencyCode`), and the `Quote` return type it produces.

**Sibling (coexists, not dependency):**

- **PRD B6 — Free Shipping Method.** B6 is the simpler single-threshold conditional method. Both methods may be attached to the same zone and returned from the pipeline in the same quote list; the checkout UI presents whichever the customer selects. This PRD does not reference B6 at runtime.
- **PRD B1 — Weight-Based Shipping, PRD B3 — Dimensional Shipping.** Same tier structure and first-match-wins semantics. B4 intentionally mirrors their shape so that future tiered methods share a common editor pattern.

**Downstream (consumers of this PRD):**

- None. This is a leaf method. Checkout reads quotes from the pipeline (A7), not directly from this method.

---

## 4. Schema

**New table:** `commerce_shipping_method_price_based`

**Location:** `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` (added to the shared shipping schema file alongside peer method tables).

**Fields:**

- `zoneId: v.id("commerce_shipping_zones")` — required. The zone this method belongs to. Deletion of the zone cascades to deletion of its methods (enforced by PRD A1).
- `name: v.string()` — internal merchant-facing name, e.g., "Standard — Price Tiered". Unique within the zone; not shown to customers.
- `label: v.string()` — customer-facing label shown at checkout, e.g., "Standard Shipping". Non-unique across zones.
- `currencyCode: v.string()` — ISO 4217 code (e.g., "USD", "EUR"). Tiers are interpreted in this currency. Must match the cart currency at quote time or the method returns no quote.
- `tiers: v.array(v.object({ minSubtotal: v.number(), maxSubtotal: v.union(v.number(), v.null()), cost: v.number(), incrementalCost: v.optional(v.number()), incrementalSubtotal: v.optional(v.number()) }))` — tier table. All monetary values are in the smallest currency unit (cents for USD) to avoid floating-point error. A `maxSubtotal: null` denotes an open-ended top tier; at most one tier may have `maxSubtotal: null`, and it must be the highest by `minSubtotal`.
- `useDiscountedSubtotal: v.boolean()` — when true, tier lookup uses the post-discount subtotal from the cart model. When false, it uses the pre-discount subtotal. Default TRUE on creation.
- `enabled: v.boolean()` — merchant toggle to disable the method without deleting it. Disabled methods are skipped by the pipeline.
- `sortOrder: v.number()` — integer used to order methods within a zone in the admin UI and (stably) in the storefront quote list when two methods tie on cost. Lower sorts first.
- `ruleId: v.optional(v.id("commerce_shipping_rules"))` — optional reference to a PRD A6 rule. When present, the pipeline evaluates the rule before calling this method; when the rule returns false the method is skipped.

**Indexes:**

- `by_zone` on `["zoneId"]` — primary lookup during rate calculation.
- `by_zone_enabled` on `["zoneId", "enabled"]` — lets the pipeline filter enabled methods without a post-fetch scan.
- `by_zone_sortOrder` on `["zoneId", "sortOrder"]` — stable list ordering in the admin UI.

**Validation (enforced in mutation handlers, not schema):**

- `tiers` is non-empty.
- Tiers are ordered ascending by `minSubtotal`; the mutation sorts them server-side before writing.
- No two tiers overlap — for any adjacent pair, `tier[i].maxSubtotal <= tier[i+1].minSubtotal`.
- At most one tier may have `maxSubtotal === null`; if present it must be the last tier by `minSubtotal`.
- If `incrementalCost` or `incrementalSubtotal` is present on a tier, the tier must be the open-ended top tier (`maxSubtotal === null`). Both must be present together or both absent.
- `incrementalSubtotal > 0` when present (no division by zero).
- `minSubtotal >= 0`, `maxSubtotal > minSubtotal` when not null.
- `cost >= 0`. A `cost` of `0` is explicitly legal and represents a free tier.
- `currencyCode` is a valid ISO 4217 code from the platform's allowed-currency list (owned by the Settings system).

**Soft delete / audit:**

- No soft delete column on this table — parent zone carries the authoritative lifecycle. Deleting a method is immediate; merchants are warned in the UI.
- Writes emit events via PRD A7's event bus (see Section 14).

---

## 5. Data Model

**Tier matching.** Given an input subtotal `S` (in minor units, same currency as the method):

1. Apply `useDiscountedSubtotal` to pick `S` from the cart model: use `cart.discountedSubtotal` when true, else `cart.subtotal`. Both are pre-tax by default (Section 1).
2. Walk tiers in ascending `minSubtotal` order; select the first tier where `minSubtotal <= S` AND (`maxSubtotal === null` OR `S < maxSubtotal`). Inclusive min, exclusive max. This matches the semantics used by PRD B1 Weight-Based.
3. If no tier matches (`S` falls below the first tier's `minSubtotal`), the method returns no quote. Merchants are warned at save time if their tier table does not start at `minSubtotal = 0`.
4. If the matched tier is open-ended (`maxSubtotal === null`) and has `incrementalCost`/`incrementalSubtotal`, compute:
   `finalCost = cost + ceil((S - minSubtotal) / incrementalSubtotal) * incrementalCost`.
   This charges the base cost plus one increment per full `incrementalSubtotal` block above the tier floor. Rounding is `ceil` so a single cent over a boundary triggers the next increment — matching WooCommerce plugin semantics.
5. Otherwise, `finalCost = cost`.

**Pre- vs post-discount subtotal.** The `useDiscountedSubtotal` flag is the hinge of merchant intent:

- `true` (default): a $120 cart with a $30 coupon is evaluated at $90. It pays the $90 tier rate. This is the modern Shopify / BigCommerce default and matches most merchants' mental model ("the free-shipping threshold is what you actually pay").
- `false`: the same cart is evaluated at $120. It pays the $120 tier rate (likely free). This matches some WooCommerce deployments and is often preferred when promotions are stackable and the merchant doesn't want coupons to "steal" shipping eligibility.

The UI surfaces this toggle with plain-English help text and shows both preview outcomes side-by-side when a discount is present in the preview cart.

**Open-ended top tier.** The top tier's `maxSubtotal` may be `null` to represent "everything above `minSubtotal`". When `incrementalCost`/`incrementalSubtotal` are set, the rate grows linearly above the floor. When they are absent, the rate is flat for all high-value carts. Both patterns are common; the editor supports either.

**Zero-cost tier.** A tier with `cost: 0` and no incremental fields represents free shipping within that subtotal band. This is the "free shipping over $100" idiom when used on the top tier, and is also valid on any other tier (e.g., merchants offering free shipping on a narrow promotional band).

**Currency match.** The method's `currencyCode` must equal the cart's `currencyCode` at quote time. Mismatches produce no quote (never an exception) and log a `shipping.method.currency_mismatch` warning. The pipeline treats "no quote" as a skip, not a failure, so a mismatched method simply disappears from the customer's options.

**Stability.** Matching is pure and deterministic for a given `(cart subtotal, discount flag, tier table)`. No randomness, no time-based branching, no database reads beyond the method row itself. This lets PRD A7 cache quotes by cart hash.

**Worked examples.**

- **Three-tier ladder.** Tiers: `[0–50 → $8, 50–100 → $5, 100+ → free]`. Cart subtotal $35 → tier 1 → $8. Cart subtotal $50 → tier 2 → $5 (exclusive max on tier 1). Cart subtotal $99.99 → tier 2 → $5. Cart subtotal $100 → tier 3 → free. Cart subtotal $1,000 → tier 3 → free.
- **Open-ended incremental.** Tiers: `[0–100 → $10, 100+ → $10 base + $2 per additional $50]`. Cart subtotal $100 → tier 2, `ceil((100 - 100) / 50) = 0` increments → $10. Cart subtotal $150 → `ceil((150 - 100) / 50) = 1` → $12. Cart subtotal $150.01 → `ceil(50.01 / 50) = 2` → $14 (one cent over triggers next increment, by design). Cart subtotal $300 → `ceil(200 / 50) = 4` → $18.
- **Pre- vs post-discount divergence.** Tiers: `[0–100 → $8, 100+ → free]`. Cart subtotal $120, coupon –$30. With `useDiscountedSubtotal = true`: evaluated at $90 → tier 1 → $8. With `useDiscountedSubtotal = false`: evaluated at $120 → tier 2 → free.
- **Gap in table.** Tiers: `[0–50 → $8, 100+ → free]`. Cart subtotal $75 → no tier matches → method returns null → method absent from customer options. (Merchant saw the warning at save time and chose to keep the gap.)

**Relationship to B6 at runtime.** When both B4 and B6 are attached to the same zone, the pipeline asks each independently for a quote. There is no communication between them. A customer with a $120 cart on a zone that has B4 (tier table ending in "$100+ → free") and B6 (minimum order amount $150) sees two options: B4's "Standard Shipping — Free" and — because their cart is below B6's threshold — no B6 option. If B6's threshold were $100 instead, the customer would see both "Standard Shipping — Free" (B4) and "Free Shipping" (B6), letting them pick by label. Merchants who don't want two free options simply disable one.

---

## 6. Functions / API

**Location:** `ConvexPress-Admin/packages/backend/convex/shipping/methods/priceBased.ts`.

**Mutations (admin-only, gated by `admin.shipping.methods.manage`):**

- `createPriceBasedMethod({ zoneId, name, label, currencyCode, tiers, useDiscountedSubtotal?, enabled?, sortOrder?, ruleId? })` — validates input, sorts tiers, inserts the row, emits `shipping.method.created`. Returns the new method ID.
- `updatePriceBasedMethod({ methodId, patch })` — partial update of any field. Re-validates the full tier table on any tier change. Emits `shipping.method.updated` with a before/after diff for audit logging.
- `deletePriceBasedMethod({ methodId })` — hard delete. Emits `shipping.method.deleted`. Idempotent on already-deleted IDs (returns null).
- `toggleEnabled({ methodId, enabled })` — convenience for the admin list's per-row toggle. Emits `shipping.method.updated`.
- `reorderMethods({ zoneId, orderedMethodIds })` — bulk update of `sortOrder` across sibling methods; accepts price-based IDs and is also the shared reorder endpoint for all Layer B methods within a zone (exposed under a shared mutation owned by PRD A1).

**Queries (admin-only, `admin.shipping.methods.manage`):**

- `listByZone({ zoneId })` — returns all price-based methods for a zone, ordered by `sortOrder` then `_creationTime`. Includes enabled and disabled.
- `getById({ methodId })` — single row fetch for the editor.

**Internal functions (server-only, not client-callable):**

- `calculatePriceBased(ctx, { methodId, cart })` — the `MethodRateCalculator` implementation. Called by PRD A7 during rate calculation. Returns either a `Quote { methodId, label, cost, currencyCode, tierIndex, hint? }` or `null` (no quote).
- `previewRate(ctx, { methodId, previewCart })` — internal helper used by the admin UI preview widget. Runs the same calculation against a synthetic cart and returns the result plus the matched tier index. Not reachable by the storefront.

**Contract implementation.** The method registers itself with PRD A7's method registry at startup by exporting a `priceBasedMethodHandler` object that satisfies the `MethodRateCalculator` interface defined by A7. This is the same registration pattern used by B1/B2/B3.

**No public queries or mutations from the storefront.** The storefront never reads this table directly; it reads quotes from the pipeline. The only externally reachable outputs are the quote objects returned through A7.

---

## 7. Admin UX

**Where it lives.** The price-based method editor is embedded inside the zone editor from PRD A1. From the zone detail page, an administrator clicks "Add method" → "Price-Based", and the editor opens as a full page (per ConvexPress UI rules — no modals for content management). Editing an existing method navigates to a full page keyed on the method ID.

**Editor layout.** A single scrollable page with the following sections, top to bottom:

1. **Identity.** `name` (internal), `label` (customer-facing), `enabled` toggle.
2. **Currency.** `currencyCode` selector, defaulted to the site's primary currency from Settings. Inline warning if the selected currency does not match any enabled currency in Settings.
3. **Tier table.** A spreadsheet-style editor (not a modal picker — a full editable table). Each row has columns: `Min subtotal`, `Max subtotal`, `Cost`, `Incremental` (appears only on the open-ended top row). Rows are draggable by a grab handle for reordering; the save path re-sorts by `minSubtotal` and rejects overlaps. "Add tier" button appends a row. "Remove" removes the row. The top row offers an "Open-ended" checkbox that clears `maxSubtotal` and reveals the incremental fields.
4. **Subtotal source.** The `useDiscountedSubtotal` toggle with explanatory text: "Apply discounts and coupons before deciding which tier the cart falls into". Below the toggle, a small side-by-side preview: "Cart $120 with $30 coupon → $90 tier" vs "→ $120 tier". Default ON.
5. **Availability rule.** Optional `ruleId` dropdown populated from PRD A6 rules belonging to this zone. "No rule" means the method is always available within its zone.
6. **Preview.** A live preview widget: merchant enters a test subtotal, the editor shows "Cart $75 → Tier 2 ($50–$100) → $5". The preview runs `previewRate` internally. Preview updates as the tier table is edited.
7. **Danger zone.** Delete button with confirmation dialog (the one permitted use of a dialog — destructive confirmation).

**Validation surfacing.** All server-side validation rules (Section 4) are enforced client-side first for instant feedback, then re-enforced on the mutation. Inline errors appear under the offending row:

- "Tiers overlap" highlights both offending rows.
- "Only the last tier can be open-ended" appears when a non-top row has `maxSubtotal` cleared.
- "Incremental fields require an open-ended top tier" appears when the admin sets incremental on a closed tier.
- "Top tier has no `maxSubtotal` — carts above $X will match this tier" is shown as an informational warning, not an error. Merchants are expected to choose whether to close the top tier or leave it open; a blunt warning calls attention without blocking save.
- "Tier table does not start at $0 — carts under $X will receive no quote" is a warning, not an error. Some merchants intentionally want this behavior to hide the method from small carts.

**List view.** The zone's method list shows all methods (flat, weight-based, price-based, free, etc.) in a unified table with columns: label, type (badge), rate summary, rule, enabled, sort-handle. The rate summary for a price-based method condenses the tier table, e.g., "$0–50: $8 / $50–100: $5 / $100+: Free".

**No themes, widgets, or plugins.** The editor is a single first-party full-page React component. There are no extension points, third-party shipping plugins, or widget areas. Merchants configure via the built-in admin.

---

## 8. Merchant Workflow

**Canonical walkthrough.** A new merchant wants to offer: "$8 shipping under $50, $5 between $50 and $100, free shipping over $100." They take the following path:

1. Navigate to **Commerce → Shipping → Zones**, open the zone for the United States.
2. Click **Add method → Price-Based**.
3. Set `name` = "Standard tiered", `label` = "Standard Shipping".
4. `currencyCode` is pre-filled with USD (the store's primary currency).
5. In the tier table, enter:
   - Row 1: min `0.00`, max `50.00`, cost `8.00`.
   - Row 2: min `50.00`, max `100.00`, cost `5.00`.
   - Row 3: min `100.00`, max empty (open-ended checked), cost `0.00`.
6. Leave `useDiscountedSubtotal` ON — coupons should count toward the free-shipping threshold.
7. Leave the availability rule blank.
8. Enter `75.00` in the preview; editor shows "Tier 2 ($50–$100) → $5.00 USD". Enter `150.00`; editor shows "Tier 3 ($100+) → Free".
9. Save. The method is immediately live on the storefront.

**Alternative patterns the merchant may configure:**

- **Pure free-shipping threshold (no tiers).** Two rows: `$0–100 = $8`, `$100+ = $0`. This is the "free over $100" pattern and is the single most common real-world use of B4. If the merchant prefers the simpler mental model of B6 (Free Shipping) with a minimum-order-amount rule, both methods produce an equivalent customer outcome; B4 wins when the merchant also wants a paid tier below the threshold.
- **Incremental high-value tier.** Top row open-ended with `cost: 10`, `incrementalCost: 2`, `incrementalSubtotal: 100`. Above $500, charge $10 + $2 per additional $100. Used by merchants selling large or heavy goods who want shipping to scale with cart value.
- **Pre-discount evaluation.** Merchant turns `useDiscountedSubtotal` OFF so that coupon codes don't push shoppers under the free-shipping line. Common in stacked-promo stores.
- **Coexistence with B6.** Merchant configures both B4 and B6 on the same zone; B6 offers a named "Free Shipping" option visible only when the cart clears its threshold, while B4 provides the continuous rate ladder. Customer sees two options and picks one at checkout.

---

## 9. Storefront UX

**Customer sees the final rate.** At the checkout shipping step, the customer sees the method's `label` and its computed `cost` for the current cart. No tier structure is exposed; the tier table is a merchant-facing concept. If the merchant's top tier is $0, the rate is simply displayed as "Free".

**Next-tier hint.** If the cart is currently matched to a tier whose cost is greater than the cost of the next tier up (by `minSubtotal`), the storefront shows an optional informational hint:

- "Add $25.00 to get free shipping" — when the next cheaper tier's cost is 0.
- "Add $25.00 to reduce shipping to $5.00" — when the next cheaper tier's cost is non-zero.

The hint is driven by the returned `hint` field on the quote (Section 6), which is computed inside `calculatePriceBased` using only the tier table and the current subtotal — no extra database lookups. The hint is opt-in per method: a `showUpsellHint` field on the method controls whether the storefront renders it. Default ON, because the upsell hint is the point of this method.

**Currency display.** The cost is formatted in `currencyCode` using the site's active locale. The site's currency display rules (symbol placement, decimal separator, minor-unit formatting) are owned by the Settings system; this method returns raw minor units plus `currencyCode` and lets the storefront format.

**Ordering among multiple methods.** When multiple methods quote for the same cart (e.g., B4 and B6 both available, or B4 and B1 both available), the storefront orders them by (cost ascending, sortOrder ascending, label ascending). Merchants can influence the order via `sortOrder` when costs tie.

**Unavailable method.** If the cart subtotal falls below the first tier's `minSubtotal`, the method returns no quote and is simply absent from the customer's options. No error is shown. The customer sees only the methods that actually apply to their cart.

---

## 10. Edge Cases

- **Only-discounted items in cart.** When every line in the cart carries an item-level discount, the pre-discount and post-discount subtotals diverge maximally. The `useDiscountedSubtotal` flag determines which is used; behavior is documented, not silently ambiguous.
- **Discount brings cart below a tier boundary.** With `useDiscountedSubtotal = true`, a cart at $110 with a $15 coupon ($95 discounted) falls into the $50–$100 tier, not the $100+ free tier. The method matches by discounted subtotal and charges $5. With `useDiscountedSubtotal = false`, the same cart matches the $100+ tier and ships free. Merchants must pick the intent explicitly; the UI makes the difference visible in the preview.
- **Currency mismatch.** Cart currency is EUR, method is configured for USD. Method returns no quote; the pipeline skips it; a `shipping.method.currency_mismatch` warning is logged for merchant visibility. No exception is thrown — a misconfigured method should not break checkout.
- **Zero-cost tier = free.** A tier with `cost: 0` is free shipping for that band. The storefront displays "Free" (not "$0.00") for zero-cost quotes, per the shared money-formatting rules owned by Settings. This is valid on any tier, not only the top tier.
- **Boundary values.** A cart subtotal exactly equal to a tier boundary (e.g., $50.00 on a `max: 50.00` row) matches the next tier up (exclusive max). This is the same convention used by PRD B1 Weight-Based; the shared rule is "inclusive min, exclusive max, first-match-wins". Merchants are informed via inline help text in the tier editor.
- **Empty cart.** A cart with subtotal $0 (e.g., pure gift-card redemption) matches the first tier if it starts at $0. If merchants don't want to quote for $0 carts, they either set the first tier's `minSubtotal > 0` (method returns no quote on empty carts) or attach a rule (PRD A6) that hides the method when subtotal is zero.
- **Gap in tier table.** If the merchant saves `$0–50` and `$100+` with no middle tier, carts between $50 (exclusive) and $100 (exclusive) receive no quote. The save-time warning calls this out, but does not block, because some merchants intentionally want gaps (e.g., to force a specific order size range toward a different method).
- **Incremental overflow.** A cart 10,000× above the top-tier floor with `incrementalCost: 1, incrementalSubtotal: 1` does not overflow — all math is integer minor units with Convex's number type (safe integer range), and the `ceil` division is done in integer arithmetic. A hardcoded sanity cap (e.g., $1M) is enforced in `calculatePriceBased`; above the cap the method returns no quote and logs a warning, so pathological inputs cannot stall checkout.
- **Tier table edited while a cart is active.** The pipeline re-fetches the method row on every quote, so admin edits take effect on the customer's next render. No stale-quote hazard.
- **Method disabled while a cart is active.** Same behavior as above. The pipeline filters by `enabled: true`; a just-disabled method disappears from the customer's options on next render.
- **Rule returns false.** PRD A6 owns this path. The pipeline skips the method before it is called; `calculatePriceBased` is never invoked for that cart. No action required in this PRD.
- **Very small currencies.** For JPY (no minor unit), minor-unit storage still applies — cents helpers in the currency module handle zero-decimal currencies. Tier thresholds entered as `100` become `100` in the stored integer (not `10000`). This is owned by the shared currency helper, not duplicated here.
- **Negative subtotal.** Not possible from the cart model (A7 guarantees non-negative subtotals), but defensively, a negative input is treated the same as `0` and may return no quote if the first tier's `minSubtotal > 0`.

**Over-discounted cart.** Some stores allow coupon stacking that could theoretically drive the discounted subtotal below zero. The cart model floors at zero (owned by A7). This method sees a non-negative discounted subtotal and behaves normally. No additional handling is required here.

**Gift cards.** Gift-card redemption is applied by the Tax/Totals system downstream of the shipping quote. The subtotal this method sees is the pre-gift-card, pre-tax value. Gift cards never change which tier applies, by design — they affect the payable total, not the cart's economic value for shipping purposes.

**Mixed-vendor carts.** Out of scope at this layer. When a cart contains items from multiple vendors and the platform splits it into multiple shipments, each shipment is quoted independently by A7 with its own subtotal. This method operates on whatever subtotal A7 hands it.

**Concurrent edits.** Two administrators editing the same method simultaneously are resolved by last-write-wins on Convex mutation commit. The event bus emits `shipping.method.updated` for each commit, so a merchant viewing the audit log sees both changes. No optimistic locking is implemented; shipping-method edits are infrequent and the risk of silent clobbering is low.

---

## 11. Testing Requirements

**Unit tests (`priceBased.test.ts`):**

- Tier matching with every boundary combination: below first tier, inside each tier, on each boundary, above the open-ended top.
- Open-ended top tier with and without incremental fields; incremental rounding on boundary values (exactly one increment, one-cent-over-boundary forces next increment).
- `useDiscountedSubtotal` both values, producing the documented divergence.
- Currency mismatch returns null and logs the warning.
- Zero-cost tier returns a quote with `cost: 0`.
- Gap between tiers returns null for subtotals in the gap.
- Negative subtotal treated as zero.

**Mutation tests (`priceBased.mutations.test.ts`):**

- Create rejects overlapping tiers.
- Create rejects multiple open-ended tiers.
- Create rejects incremental fields on a closed tier.
- Create rejects incremental fields with missing pair member (`incrementalCost` without `incrementalSubtotal`).
- Update re-validates the full tier table on any tier change.
- Delete is idempotent on missing IDs.
- All mutations require the `admin.shipping.methods.manage` capability; anonymous and under-privileged callers receive 403.
- Reorder updates `sortOrder` atomically across siblings.

**Integration tests (with PRD A7 pipeline):**

- A zone with one B4 method returns the correct quote for a range of cart subtotals.
- A zone with both B4 and B6 returns two quotes for eligible carts, one quote for ineligible.
- A B4 method with a PRD A6 rule returning false is absent from the quote list.
- A disabled B4 method is absent from the quote list.
- Currency mismatch between cart and method returns no quote and does not block other methods.

**Admin UI tests (Playwright):**

- Creating a three-tier table via the editor and verifying it renders correctly on page reload.
- Preview widget updates live as the merchant edits the tier table.
- Overlap error highlights both offending rows and blocks save.
- Toggling `useDiscountedSubtotal` flips the side-by-side preview output.
- Deleting the method returns the admin to the zone detail page with the method removed from the list.

**Performance tests:**

- `calculatePriceBased` runs in under 1ms for a 20-tier table against a 10,000-tier-value synthetic sweep.
- Full pipeline (A7 + B4) stays under 5ms for typical carts on the target Convex runtime.

**Migration tests:**

- The schema is additive — no existing row is mutated on deploy.
- A fresh install creates zero B4 rows; merchants add them post-install.

---

## 12. Success Criteria

- A merchant can express "free shipping over $100, $5 between $50 and $100, $8 below $50" end-to-end in the admin UI and have a customer at checkout see the correct rate.
- The tier editor refuses to save an invalid configuration (overlaps, gaps in incremental fields, multiple open-ended rows) with inline, row-level error messages.
- `useDiscountedSubtotal` produces the documented divergence in the side-by-side preview and at checkout.
- `calculatePriceBased` is pure, deterministic, and cache-keyable by `(methodId, subtotal, useDiscountedSubtotal)`.
- Currency mismatches never throw; they return null and log.
- Upsell hints ("Add $X for free shipping") render at checkout when the next cheaper tier exists.
- Zero regressions in sibling methods (B1, B2, B3, B6) after deploy — shared pipeline contract remains backward compatible.
- End-to-end performance budget: quote generation stays under 5ms for a cart with up to three price-based methods on its zone.
- Parity audit against WooCommerce "Free Shipping minimum amount" and Shopify "price-based rates" shows the same outcome for equivalent configurations.

---

## 13. Roles & Capabilities

- **Administrator (level 100).** Full CRUD over price-based methods. Can enable, disable, reorder, and delete.
- **Shop Manager (custom role if defined by the Commerce system).** Full CRUD scoped to shipping. Granted `admin.shipping.methods.manage`.
- **Editor (level 80), Author (level 60), Contributor (level 40), Subscriber (level 20).** No access. Shipping configuration is infrastructure, not content.

**Capability:** `admin.shipping.methods.manage` — required for every mutation and admin query in this PRD. Registered by the Commerce system's capability bootstrap; this PRD does not define new capabilities.

**Storefront (unauthenticated customers).** No direct access. Storefronts receive quotes via the pipeline (A7); this method's table is never readable from public queries.

---

## 14. Events Fired

The method participates in the shared `shipping.method.*` event namespace owned by PRD A7. It does not define new event names; it emits the shared ones with `methodType: "price_based"` in the payload.

- `shipping.method.created` — emitted after a successful `createPriceBasedMethod`. Payload: `{ methodId, methodType: "price_based", zoneId, label, currencyCode }`.
- `shipping.method.updated` — emitted after a successful `updatePriceBasedMethod` (including `toggleEnabled` and `reorderMethods` when they touch B4 rows). Payload includes a before/after diff for audit logging.
- `shipping.method.deleted` — emitted after a successful delete. Payload: `{ methodId, methodType: "price_based", zoneId }`.
- `shipping.method.quoted` — emitted by the pipeline (A7), not by this method directly, each time a quote is produced. Included here for reference because the method's `tierIndex` is part of the payload.
- `shipping.method.currency_mismatch` — warning-level event emitted from `calculatePriceBased` when the cart currency does not match the method's `currencyCode`. Used by merchant dashboards to surface configuration errors.

**Subscribers.** Audit Log System (PRD — Audit Log), Site Notification System (merchant alerts on currency mismatch), Analytics System (quote-rate tracking). This PRD does not own any subscriber; it only emits.

---

## 15. References

- **WooCommerce Free Shipping — Minimum order amount.** The canonical reference for price-based free-shipping thresholds. `useDiscountedSubtotal = true` in B4 matches the WooCommerce "apply before coupon" behavior; `useDiscountedSubtotal = false` matches the "apply after coupon" behavior. Both are configurable in WooCommerce, and both must be configurable in ConvexPress.
- **WooCommerce Weight Based Shipping plugin.** The tier structure, first-match-wins semantics, and open-ended top tier with incremental cost are all drawn from this plugin's table model. B4 intentionally mirrors B1's tier shape so that both methods share the same editor UX.
- **Shopify — Price-based shipping rates.** Shopify's built-in "set up rates based on order price" feature. Provides the precedent for multiple tiers per zone, pre-tax subtotal evaluation, and storefront display of "Free" for zero-cost tiers.
- **Shopify — Free shipping threshold in checkout.** Precedent for the "Add $X for free shipping" upsell hint. B4's `hint` field on the quote object is modeled on Shopify's storefront behavior.
- **BigCommerce — Price-based shipping rules.** Reference for the coexistence of tiered price-based shipping and named free-shipping methods on the same zone.
- **PRD A1 — Shipping Zones.** Upstream. Defines `zoneId` and the method-within-zone relationship.
- **PRD A6 — Shipping Rules Engine.** Upstream. Defines the optional `ruleId` contract.
- **PRD A7 — Rate Calculation Pipeline.** Upstream. Defines the `MethodRateCalculator` contract, the cart model, the `Quote` return type, and the shared `shipping.method.*` event namespace.
- **PRD B1 — Weight-Based Shipping.** Sibling. Shares tier structure and first-match-wins semantics; any deviation between B1 and B4 tier semantics is a bug in one of the two.
- **PRD B3 — Dimensional Weight Shipping.** Sibling. Same tier pattern, different input axis.
- **PRD B6 — Free Shipping Method.** Sibling. Simpler single-threshold alternative. Coexists with B4 on the same zone; merchants choose per store.
