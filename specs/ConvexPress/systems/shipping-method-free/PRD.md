# PRD B6 — Free Shipping Method

**System ID:** `shipping-method-free`
**Layer:** B (Shipping Method Type)
**Status:** Draft
**Owner:** Commerce / Shipping
**Depends On:** PRD A1 (Shipping Zones), PRD A2 (Shipping Classes), PRD A6 (Shipping Rules Engine), PRD A7 (Rate Calculation Pipeline)
**Sibling Of:** PRD B4 (Price-Based Shipping)

---

## 1. Context & Intent

Free Shipping is the single most visible promotional lever in e-commerce. It is the line item the customer looks for at checkout, the banner the marketing team mounts on the homepage, the trigger a shopper mentally uses to decide whether to add one more item to the cart. Every study of checkout conversion in the last decade converges on the same conclusion: a clearly communicated path to free shipping raises conversion rate and average order value, and its absence raises cart abandonment. A commerce platform that cannot express free shipping conditions cleanly is not a viable commerce platform.

Free Shipping as a method type is deceptively simple. The quote, when the method qualifies, is zero. The interesting part is the qualification — the set of conditions a cart must satisfy for free shipping to be offered at all. In WooCommerce, these conditions are: "always", "minimum order amount", "a valid free shipping coupon", "minimum order amount OR coupon", and "minimum order amount AND coupon". In Shopify, they are expressed as free shipping rules with minimum-order and customer-tag conditions. In most real-world stores they are some combination of the above plus shipping-class exclusions (e.g., "free shipping, except on oversized items").

**ConvexPress currently has no free shipping method.** This is a gap. A merchant cannot run a "Free shipping over $50" promotion, cannot issue a free-shipping coupon code, cannot say "free shipping for VIP customers", and cannot exclude bulky items from a free-shipping offer. The Price-Based method (PRD B4) covers tiered-by-subtotal pricing with a zero top tier, but it does not cover coupon-gated free shipping, customer-tag-gated free shipping, or rule-engine-driven free shipping. B4 and B6 are siblings, not substitutes.

This PRD specifies the Free Shipping Method — a concrete method type that plugs into the shipping pipeline defined by PRD A7, attaches to a zone defined by PRD A1, and evaluates a declarative condition set before returning a zero-cost quote. It is designed to coexist with paid methods in the same zone; when it qualifies, the customer sees both the free option and any paid options, and chooses. When it does not qualify, the method is silently omitted from the rate response and the customer sees only paid options.

**Goals:**

- Parity with the WooCommerce Free Shipping settings panel — the five condition types (always, min amount, coupon, min amount OR coupon, min amount AND coupon) are expressible directly, with no custom rule scripting required.
- Parity with Shopify free shipping rules — customer-tag and shipping-class conditions are first-class, not bolted on.
- Clean escape hatch for complex conditions via `ruleId` — hands off to PRD A6 when the five built-in condition types are insufficient.
- Coexistence with paid methods — a free shipping qualification does not remove paid methods from the rate response; the customer chooses.
- Deterministic, side-effect-free evaluation that fits inside the rate pipeline performance budget (sub-2ms for the zero-cost branch).
- Observable qualification — every cart evaluation emits an event describing whether free shipping qualified and, if not, which condition failed. This data drives the "Add $X for free shipping" progress hint on the storefront and the merchant-facing analytics on promotion effectiveness.
- Safe composition — if shipping-class exclusions are configured, the presence of any excluded class in the cart disqualifies free shipping immediately, regardless of how well the other conditions match.

**Non-Goals:**

- Tiered rates by subtotal (with a non-zero first tier and a zero top tier) — that is PRD B4 (Price-Based Shipping). B4 is used when the merchant wants paid shipping at low cart values and free shipping above a threshold, inside a single method. B6 is used when free shipping is a separate offer that may or may not appear alongside a paid method.
- Flat-rate shipping — PRD B2.
- Weight-driven rates — PRD B1.
- Dimensional or volumetric rates — PRD B3.
- Live carrier free-shipping promotions — those are negotiated with the carrier and delivered through PRD B7 (Live Rates).
- Discount coupons that apply to the cart subtotal — that is the Coupons system. Free shipping coupons are a *type* of coupon managed by the Coupons system; this PRD consumes the coupon flag on the applied coupon, it does not define coupons.
- Automatic coupon issuance, email, or marketing delivery — that is the Marketing system.

---

## 2. Scope

### In Scope

- New Convex table `commerce_shipping_method_free` storing per-method configuration keyed to a zone.
- CRUD mutations and queries scoped to an administrator with the `admin.shipping.methods.manage` capability.
- Five declarative condition types, matching WooCommerce conventions:
  - `always` — qualifies on every cart.
  - `min_amount` — qualifies when cart subtotal is at or above `minAmount`.
  - `coupon` — qualifies when the cart has at least one applied coupon flagged as a free-shipping coupon.
  - `min_amount_or_coupon` — qualifies if either condition is met.
  - `min_amount_and_coupon` — qualifies only when both conditions are met.
- Sixth escape-hatch condition type `rule` — delegates qualification to a rule defined in PRD A6. When `conditionType === "rule"`, `ruleId` is required and the built-in `minAmount` / `couponCode` fields are ignored.
- `excludeShippingClasses` array — if *any* item in the cart has a shipping class in this list, free shipping is disqualified regardless of other conditions. This handles the ubiquitous "free shipping except on oversized items" pattern.
- `requireCustomerTags` array — the cart's customer must have *all* listed tags for free shipping to qualify. Empty array means "no tag requirement".
- `useDiscountedSubtotal` toggle — when TRUE, `min_amount` comparisons use the post-discount subtotal; when FALSE, they use the pre-discount subtotal. Default TRUE, matching modern merchant expectations and Shopify convention.
- `MethodRateCalculator` contract implementation so the method registers itself with the rate pipeline (PRD A7).
- Returns a single `Quote` with `cost: 0` and label = `label` field (default "Free Shipping") when qualified; returns empty rate set when disqualified.
- Coexistence with paid methods — a qualified free shipping quote is added alongside, not in place of, paid method quotes.
- Default sort order that places the free method at the top of the rate response when qualified (configurable per-method via `sortOrder`).
- Storefront progress hint data — emits the gap to the next free-shipping threshold for display ("Add $25 for free shipping") when `conditionType` is subtotal-based.
- Storefront label — exposes a human-readable label including the coupon code when applicable (e.g., "Free Shipping with FREESHIP").
- Events firing on every evaluation (qualified / disqualified) for analytics and progress-hint rendering.

### Out of Scope

- Tiered price-based shipping — PRD B4. B6 is binary free-or-not-available; B4 is a full tier ladder.
- Flat-rate methods — PRD B2.
- Weight-driven rates — PRD B1.
- Dimensional rates — PRD B3.
- Live carrier rates — PRD B7.
- Coupon definition and redemption mechanics — owned by the Coupons system. This method reads the "this applied coupon grants free shipping" flag; it does not create or validate coupons.
- Customer tag assignment — owned by the User Profile system. This method reads the tags; it does not assign them.
- Shipping class assignment on products — owned by PRD A2. This method reads product shipping classes; it does not assign them.
- Tax on shipping — owned by the Tax system. Free shipping has zero cost, so this is moot in practice, but any future tax-on-zero-shipping logic lives in the Tax system.
- Marketing delivery of free-shipping offers (banners, emails, on-site messaging beyond the progress hint) — owned by the Marketing system.

---

## 3. Dependencies

**Upstream (required before this method is functional):**

- **PRD A1 — Shipping Zones.** A free shipping method always attaches to exactly one zone via `zoneId`. Zones are the organizing primitive for all Layer B methods. A merchant who wants free shipping domestically but not internationally configures one method in the domestic zone and none in the international zone.
- **PRD A2 — Shipping Classes.** The `excludeShippingClasses` array references shipping class IDs owned by A2. When A2 flags an item's class, this method reads it. Without A2 the exclusion feature is inoperable but the rest of the method still functions.
- **PRD A6 — Shipping Rules Engine.** When `conditionType === "rule"`, the method delegates qualification to A6. For the five built-in condition types, A6 is not consulted.
- **PRD A7 — Rate Calculation Pipeline.** Defines the `MethodRateCalculator` contract this method implements, the cart model it receives (including `subtotal`, `discountedSubtotal`, `appliedCoupons`, `customerTags`, `itemShippingClasses`, `currencyCode`), and the `Quote` return type it produces.

**Sibling (coexists, not a dependency):**

- **PRD B4 — Price-Based Shipping.** Tiered rates by subtotal with a zero top tier. Overlaps conceptually with `conditionType === "min_amount"` but serves the "I want to charge $8 under $50 and free over $50 in the same method" use case. B4 and B6 can coexist in the same zone.
- **PRD B1, B2, B3, B7** — other method types that may coexist in the same zone.

**Downstream (consumers of this method):**

- Storefront checkout UI — renders the free shipping quote and the progress hint.
- Cart UI — renders the "Add $X for free shipping" hint based on events emitted by this method.
- Admin Zone Editor — embeds this method's editor inside the zone method list.
- Analytics — consumes `shipping.free_shipping.qualified` / `.disqualified` events to measure promotion effectiveness.

**External systems consumed:**

- **Coupons system** — supplies the "grants free shipping" flag on applied coupons.
- **User Profile system** — supplies customer tags.

---

## 4. Schema

New modular schema file: `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` (additive — this file may already contain other shipping tables; this PRD adds one table to the `shippingTables` export).

### Table: `commerce_shipping_method_free`

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `zoneId` | `v.id("commerce_shipping_zones")` | Yes | The zone this method attaches to. One method, one zone. Multiple free shipping methods per zone are allowed (e.g., "Free US shipping over $50" and "Free US shipping for VIPs"), each with its own conditions. |
| `name` | `v.string()` | Yes | Internal admin-only name, e.g., "Domestic Free Over $75". Not shown to customers. |
| `label` | `v.string()` | Yes | Customer-facing label rendered at checkout. Default "Free Shipping". May include placeholders like `{coupon}` which are expanded at render time to the matched coupon code. |
| `conditionType` | `v.union(v.literal("always"), v.literal("min_amount"), v.literal("coupon"), v.literal("min_amount_or_coupon"), v.literal("min_amount_and_coupon"), v.literal("rule"))` | Yes | The qualification mode. Determines which of the condition fields below are consulted. |
| `minAmount` | `v.optional(v.number())` | Conditional | Required when `conditionType` is `min_amount`, `min_amount_or_coupon`, or `min_amount_and_coupon`. Monetary value in minor units of the zone's currency. |
| `couponCode` | `v.optional(v.string())` | Conditional | Optional filter when `conditionType` is `coupon`, `min_amount_or_coupon`, or `min_amount_and_coupon`. When set, *that specific coupon code* (case-insensitive) must be applied. When unset, *any* applied coupon with the free-shipping flag qualifies. This matches the WooCommerce pattern where merchants can either allow any free-shipping coupon or lock to a named code. |
| `useDiscountedSubtotal` | `v.boolean()` | Yes | TRUE → `minAmount` compared to post-discount subtotal. FALSE → compared to pre-discount subtotal. Default TRUE. |
| `ruleId` | `v.optional(v.id("commerce_shipping_rules"))` | Conditional | Required when `conditionType === "rule"`, forbidden otherwise. Delegates qualification to PRD A6. |
| `excludeShippingClasses` | `v.array(v.id("commerce_shipping_classes"))` | Yes | If any item in the cart has a class in this list, free shipping is disqualified. Empty array = no exclusions. |
| `requireCustomerTags` | `v.array(v.string())` | Yes | Customer must have *all* tags in this list. Empty array = no tag requirement. Tag strings match the exact tag values stored by the User Profile system. |
| `currencyCode` | `v.string()` | Yes | ISO 4217 code. Must match the cart currency. Mismatch disqualifies the method and logs a configuration warning. |
| `enabled` | `v.boolean()` | Yes | When FALSE, method is never considered by the pipeline regardless of conditions. |
| `sortOrder` | `v.number()` | Yes | Lower value = higher in the rendered rate list. Default 0, which in practice places free shipping at the top when it qualifies. |
| `createdBy` | `v.id("users")` | Yes | Admin who created the method. Audit trail. |
| `updatedBy` | `v.optional(v.id("users"))` | No | Admin who last updated. |
| `createdAt` | `v.number()` | Yes | Unix ms. |
| `updatedAt` | `v.number()` | Yes | Unix ms. |

### Indexes

- `by_zone` on `["zoneId"]` — primary lookup for the rate pipeline.
- `by_zone_enabled` on `["zoneId", "enabled"]` — filtered lookup during rate calculation to skip disabled methods at the index level.
- `by_zone_sort` on `["zoneId", "sortOrder"]` — rendering order.
- `by_rule` on `["ruleId"]` — reverse lookup so that A6 rule deletion can find dependent methods and block or cascade.

### Integrity Rules

- `zoneId` must reference an existing zone. Deleting a zone cascades to all free shipping methods in that zone (owned by the zone).
- `ruleId`, when set, must reference an existing rule. Deleting a rule that is referenced by a `conditionType === "rule"` method is blocked until the method is either reconfigured or deleted.
- `couponCode`, when set, is stored in uppercase for case-insensitive matching.
- `minAmount`, when set, must be `>= 0`.
- `currencyCode` must match the currency of the referenced zone (enforced at mutation time).
- `conditionType` transitions that would leave required fields unset are rejected at the mutation layer (e.g., moving from `always` to `min_amount` without providing `minAmount`).

---

## 5. Data Model

### Condition Evaluation

The method exposes a single internal function, `evaluateFreeShipping`, which takes the hydrated cart context from PRD A7 and returns either `{ qualified: true, quote }` or `{ qualified: false, reason }`. The pipeline calls this function; if qualified, the quote is appended to the rate response, if not, the method silently drops out.

Evaluation proceeds in a fixed order, short-circuiting on the first failure:

1. **Method enabled check.** If `enabled === false`, disqualify with reason `"disabled"`. No event emitted (this is an admin state, not a customer-facing disqualification).
2. **Currency match.** If `currencyCode !== cart.currencyCode`, disqualify with reason `"currency_mismatch"` and emit an administrator-facing warning. Customer-facing events are not emitted for configuration errors.
3. **Shipping class exclusion.** If any item in `cart.items` has a shipping class in `excludeShippingClasses`, disqualify with reason `"excluded_shipping_class"`. This is checked early because it is the most common merchant-intended disqualifier for bulky goods.
4. **Customer tag requirement.** If `requireCustomerTags` is non-empty, and `cart.customerTags` does not contain all listed tags, disqualify with reason `"missing_customer_tag"`.
5. **Condition type evaluation:**
    - `always` — always qualifies (subject to the earlier checks).
    - `min_amount` — qualifies iff `subtotal >= minAmount`, where `subtotal` is `cart.discountedSubtotal` when `useDiscountedSubtotal === true` else `cart.subtotal`. Disqualification reason `"below_min_amount"`.
    - `coupon` — qualifies iff `cart.appliedCoupons` contains at least one coupon with `grantsFreeShipping === true`, and (when `couponCode` is set on the method) the coupon's code equals `couponCode` (case-insensitive). Disqualification reason `"missing_free_shipping_coupon"`.
    - `min_amount_or_coupon` — qualifies iff either the `min_amount` check or the `coupon` check passes. Disqualification reason reflects the failing side that is closer to passing (`"below_min_amount"` if subtotal is the nearer gate).
    - `min_amount_and_coupon` — qualifies iff both pass. Disqualification reason is the first failing check in the order (min amount first, then coupon).
    - `rule` — delegates to PRD A6. The rule is invoked with the full cart context; its boolean return qualifies or disqualifies the method. Disqualification reason `"rule_failed"` with the rule ID.
6. **Qualification.** If all checks pass, produce a `Quote` with `cost: 0`, `label` expanded (placeholders replaced), `methodId` set, and `sortOrder` from the method.

### Coexistence with Paid Methods

This method never removes other methods from the rate response. When free shipping qualifies, the customer sees both the free option and any paid options from B1, B2, B3, B4, or B7 in the same zone. This is deliberate — some customers may prefer a paid expedited option over the free standard option, and merchants universally want to preserve that choice. The default `sortOrder` of 0 typically surfaces free shipping at the top of the list, but a merchant may configure a higher `sortOrder` to push the free option below a "Standard" paid method if they have a specific merchandising reason.

### Progress Hint Data

When `conditionType` includes a `min_amount` component and the cart disqualifies specifically because `subtotal < minAmount`, the evaluator emits the gap (`minAmount - subtotal`) in the disqualification event. The storefront consumes this event to render the familiar "Add $25 for free shipping" hint. No UI logic lives in this method — it emits the signal; the UI renders.

### Event Semantics

Every evaluation — qualified or disqualified — emits one of the shared `shipping.method.*` events from PRD A7 plus a method-specific event (`shipping.free_shipping.qualified` or `.disqualified`). Evaluation is pure and deterministic; events carry outcome, not state mutation.

### Idempotency and Caching

Evaluation is pure with respect to inputs. Given identical cart, method configuration, and coupon state, the outcome is identical. The rate pipeline in PRD A7 handles memoization; this method does not cache internally.

---

## 6. Functions / API

### Mutations (`convex/shipping/methods/free.ts`)

- `createFreeShipping` — creates a method. Capability: `admin.shipping.methods.manage`. Validates the `conditionType` invariants (e.g., `minAmount` required for `min_amount`, `ruleId` required for `rule`). Normalizes `couponCode` to uppercase. Enforces currency match with the zone. Emits `shipping.method.created`.
- `updateFreeShipping` — partial update by method ID. Capability: `admin.shipping.methods.manage`. Revalidates all invariants on every update (condition transitions can invalidate previously-optional fields). Emits `shipping.method.updated`.
- `deleteFreeShipping` — soft or hard delete per platform convention (pipeline is documented elsewhere). Capability: `admin.shipping.methods.manage`. Emits `shipping.method.deleted`.
- `duplicateFreeShipping` — clones an existing method into the same or a different zone. Convenience for merchants who run a standard free-shipping offer across multiple zones.
- `reorderFreeShipping` — updates `sortOrder` on one or more methods in a zone atomically.

### Queries

- `getFreeShipping` — by method ID. No capability required (read is governed by zone visibility rules).
- `listFreeShippingByZone` — by zone ID. Returns methods ordered by `sortOrder`.
- `listFreeShippingForRulePreview` — returns methods referencing a given `ruleId`. Used by the A6 rule editor to show impact before deletion.

### Internal Functions

- `evaluateFreeShipping` — the single entry point called by the PRD A7 pipeline. Pure, synchronous with respect to its inputs. Reads method configuration, evaluates conditions, emits events, returns the result tuple. Not client-callable.
- `expandLabel` — replaces `{coupon}`, `{minAmount}`, and `{currency}` placeholders in the `label` string. Pure helper.

### Validators

- Shared validators for the `conditionType` enum and condition-field invariants live in `convex/shipping/methods/free.validators.ts` and are consumed by both the create and update mutations to keep validation rules in a single place.

---

## 7. Admin UX

The Free Shipping method editor is embedded inside the zone method list from PRD A1. A merchant opens a zone, clicks "Add method", chooses "Free Shipping" from the method-type picker, and lands on a full-page editor (no modals, per ConvexPress UI rules).

### Editor Layout

- **Name** — internal label field.
- **Customer-facing label** — text field, default "Free Shipping". Placeholder hints displayed below: `{coupon}`, `{minAmount}`, `{currency}`.
- **Condition type** — segmented control with six options: Always, Minimum order amount, Coupon, Minimum amount OR coupon, Minimum amount AND coupon, Custom rule.
- **Conditional sub-fields** — the editor shows only the fields relevant to the chosen condition type:
  - `min_amount` families: numeric "Minimum order amount" field with currency suffix, and a "Use discounted subtotal" toggle.
  - `coupon` families: a "Coupon code (optional)" text field. When left blank, the editor renders the clarifying caption "Any coupon flagged as free shipping will qualify."
  - `rule`: a rule picker that lists existing rules from PRD A6 with a link to create a new rule.
- **Shipping class exclusions** — multi-select populated from PRD A2. Empty by default.
- **Customer tag requirements** — chip-style tag editor. Empty by default.
- **Currency** — read-only, inherited from the zone.
- **Enabled toggle.**
- **Sort order** — numeric input.

### Preview Panel

A live-updating preview panel on the right side of the editor describes the configured method in plain language. Examples:

- `always` → "Customer gets free shipping on every order."
- `min_amount` at $75 → "Customer gets free shipping when cart subtotal is $75 or more (after discounts)."
- `min_amount_and_coupon` at $75 with code `FREESHIP` → "Customer gets free shipping when cart $75+ AND uses coupon FREESHIP."
- `coupon` with no code → "Customer gets free shipping when any free-shipping coupon is applied."
- `rule` → "Customer gets free shipping when the custom rule '{rule name}' passes."
- With exclusions: appends "…unless the cart contains Oversized or Hazmat items."
- With tag requirements: appends "…and the customer is tagged vip."

The preview is not a simulator — it does not evaluate against a sample cart — it is a human-readable restatement of the configuration. A separate "Test this method" panel (owned by PRD A7) runs a real evaluation against a sample cart.

### Validation

- Condition-type change that invalidates an optional-but-now-required field blocks save with an inline error on the affected field.
- Currency mismatch with the zone is impossible because currency is read-only and inherited.
- Saving a method that references a disabled or deleted coupon code emits a non-blocking warning ("This coupon does not currently exist in the Coupons system — the method will never qualify until the coupon is created"). This is a warning, not an error, because merchants often configure the shipping method before the coupon.

### List View

The zone method list displays Free Shipping methods inline with other method types, sorted by `sortOrder`. Each row shows method name, condition summary, enabled state, and quick actions (edit, duplicate, delete).

---

## 8. Merchant Workflow

**"How do I offer free shipping on orders over $50?"**

1. Admin → Commerce → Shipping → Zones.
2. Open the zone (e.g., "United States").
3. Click "Add method", choose "Free Shipping".
4. Name: "Free over $50".
5. Condition type: Minimum order amount.
6. Minimum amount: 50.00.
7. Use discounted subtotal: ON.
8. Save.

The method is live. The next cart evaluated in the US zone with subtotal at or above $50 sees the free option alongside any paid methods already configured in the zone. Carts below $50 see only the paid methods; those carts also receive the progress-hint event, which the storefront renders as "Add $X for free shipping".

**"How do I run a coupon-gated free shipping promotion?"**

1. Go to the Coupons system and create a coupon with the "grants free shipping" flag set, code `FREESHIP`.
2. Go to the zone's shipping method list.
3. Add Free Shipping method.
4. Condition type: Coupon.
5. Coupon code: FREESHIP (or leave blank to allow any free-shipping coupon).
6. Save.

**"How do I offer free shipping to VIP customers, except on oversized items?"**

1. Ensure the `vip` customer tag exists in the User Profile system and is applied to the target customers.
2. Ensure the `oversized` shipping class exists in PRD A2 and is applied to the relevant products.
3. Add Free Shipping method in the zone.
4. Condition type: Always.
5. Customer tag requirements: `vip`.
6. Shipping class exclusions: `oversized`.
7. Save.

**"How do I do something complicated that none of the five conditions cover?"**

1. Go to PRD A6 and build the rule (e.g., "weekdays only, B2B accounts, cart has at least one item from the Apparel category").
2. Add Free Shipping method in the zone.
3. Condition type: Custom rule.
4. Select the rule.
5. Save.

---

## 9. Storefront UX

### Rate List

When free shipping qualifies, the checkout rate selector renders the `label` ("Free Shipping" by default) with a cost of "FREE" or "$0.00" depending on the storefront theme convention. Free shipping is positioned per its `sortOrder`, which by default places it at the top of the list. Paid methods in the same zone render below.

When free shipping does not qualify, the method is absent from the rate list. The customer sees only the paid methods. There is no "Free shipping unavailable" line item — WooCommerce's approach is consistent here, and negative signaling at the rate list is an anti-pattern.

### Progress Hint

When the only reason for disqualification is `below_min_amount`, the storefront renders a hint in the cart and checkout summary panels: "Add $25.00 for free shipping." The hint is driven by the disqualification event payload, which includes the gap. When the gap closes to zero and the method qualifies, the hint disappears and the free option appears in the rate list.

The storefront may render a progress bar using the same event data. This is a theme-level decision; the method supplies the signal.

### Label Expansion

When the `label` includes `{coupon}` and the qualifying condition involves a coupon match, the placeholder is expanded to the coupon code. Example: a `min_amount_and_coupon` method with `label = "Free Shipping with {coupon}"` and coupon `FREESHIP` renders "Free Shipping with FREESHIP" to the customer.

### Multiple Free Shipping Methods

A zone may have more than one qualifying free shipping method (e.g., a `min_amount` method at $50 and a `coupon` method). When both qualify, both appear in the rate list. The customer sees only one free option if the theme collapses equal-cost methods, or two if the theme surfaces them — this is a theme-level rendering decision. Each qualifying method emits its own qualified event.

---

## 10. Edge Cases

- **Cart exactly at `minAmount` boundary.** `subtotal >= minAmount` uses `>=`, so $50.00 qualifies for a $50 threshold. Monetary math uses minor units throughout to avoid floating-point drift.
- **Coupon applied, then removed.** Each cart mutation triggers a fresh rate evaluation via PRD A7. When the coupon is removed, the method re-evaluates; if no longer qualifying, it drops out of the rate list on the next checkout render. The storefront reconciles the selected rate — if the customer had selected free shipping and it is no longer available, the storefront falls back to the next available method and surfaces a neutral "Your shipping option was updated" indicator. Reconciliation is owned by PRD A7 / the checkout system, not this method.
- **Excluded shipping class present.** Disqualifies immediately, before coupon or amount checks. This is intentional — a merchant who says "free shipping except on oversized items" expects that rule to be absolute.
- **`useDiscountedSubtotal` interaction with coupon-gated free shipping.** If the customer applies a percentage discount that drops `discountedSubtotal` below `minAmount`, and the method is configured to use the discounted subtotal, the method disqualifies — even if the pre-discount subtotal was above the threshold. This is the merchant's explicit choice via the toggle, and matches Shopify's default. Merchants who prefer the WooCommerce "pre-discount" behavior set the toggle to FALSE.
- **Customer tags partially match.** `requireCustomerTags` is an AND gate. Any missing tag disqualifies. Merchants who want OR semantics express it via a rule in PRD A6.
- **Zero-amount cart.** A cart with `subtotal === 0` never qualifies for `min_amount` methods (unless `minAmount === 0`, in which case the merchant has effectively configured `always` and should be advised to use that condition type for clarity — the admin editor surfaces this as a warning). It does qualify for `always` methods, which is correct but of limited real-world use since a zero-cost cart is rare outside of gift-only or digital-only orders.
- **Currency mismatch.** Disqualifies with an administrator-facing warning in the audit log. Customers see no free-shipping option. The admin editor prevents misconfiguration by inheriting currency from the zone.
- **Rule returns an error.** If the PRD A6 rule evaluation throws, the method treats it as a disqualification (fail-closed) and logs the error. The customer never sees free shipping on a broken rule, which is the correct behavior — showing free shipping that cannot be fulfilled is worse than hiding it.
- **Multiple applied coupons.** Qualification requires at least one applied coupon with the free-shipping flag. Additional non-free-shipping coupons on the cart are irrelevant. When `couponCode` is set, the match is against that specific coupon among the free-shipping-flagged ones.
- **Case-insensitive coupon matching.** `couponCode` is stored uppercase and compared case-insensitively. A customer typing `freeship` matches a method configured with `FREESHIP`.
- **Disabling a method while a checkout is in flight.** An in-flight checkout that had selected the now-disabled method falls back on the next rate evaluation, per the reconciliation policy owned by PRD A7.
- **Deleting the rule that a `conditionType === "rule"` method references.** Blocked by the reverse-index integrity check in PRD A6. The merchant is told which methods depend on the rule and must reconfigure or delete them first.
- **Stale cached quotes.** Any cart-state mutation (line-item change, coupon add/remove, tag change on the customer) invalidates the rate cache in PRD A7. This method never returns a stale quote.

---

## 11. Testing Requirements

### Unit Tests

- Each of the six `conditionType` values evaluates correctly against a canonical cart fixture set.
- `useDiscountedSubtotal` flips comparison basis correctly for all `min_amount` families.
- `excludeShippingClasses` short-circuits for each condition type.
- `requireCustomerTags` AND semantics verified: all-present passes, any-missing fails, empty-list no-ops.
- Coupon matching is case-insensitive.
- `couponCode` blank allows any free-shipping-flagged coupon.
- Currency mismatch disqualifies silently to the customer and audibly to the admin log.
- Rule-based condition defers to A6 and fails closed on rule error.
- `minAmount` boundary (`>=`) verified with minor-unit inputs.
- Label expansion replaces all documented placeholders.

### Integration Tests

- Full rate-pipeline test: free shipping method added to a zone, cart evaluated, free quote returned alongside paid quotes with correct sort order.
- Cart mutation re-evaluation: add item → qualifies; remove coupon → disqualifies; add excluded class → disqualifies.
- Coupon system integration: newly created free-shipping coupon is immediately honored on the next evaluation.
- Customer tag integration: tagging a customer mid-session enables VIP free shipping on next evaluation.
- Event emission: every qualification and disqualification emits the correct event with the correct payload, including progress-hint gap for `below_min_amount` disqualifications.
- Multiple qualifying free methods in the same zone both appear.
- Coexistence: free and paid methods both appear when free qualifies; only paid methods appear when free does not qualify.

### Regression / Contract Tests

- `MethodRateCalculator` contract from PRD A7 is honored (method registers, is invoked, returns a well-formed `Quote` or empty).
- Cascade delete: deleting a zone removes all free shipping methods in that zone.
- Rule integrity: deleting a rule referenced by a `rule`-type method is blocked.

### Performance Tests

- Single evaluation completes in under 2ms for the hot path (qualified, no rule).
- Rule-type evaluation budget inherits from PRD A6 (documented there).
- Bulk evaluation of 100 methods in a zone (theoretical upper bound) completes under 50ms.

### Admin UX Tests

- Condition type switching shows and hides the correct sub-fields.
- Preview panel updates live on every field change and reflects all documented phrasings.
- Save blocks on missing required fields for the chosen condition type.
- Non-blocking warnings surface for missing coupon, zero `minAmount` with non-`always` condition, etc.

---

## 12. Success Criteria

- A merchant can configure "free shipping over $X" in under 30 seconds starting from the zone editor.
- All five WooCommerce condition types are expressible via the built-in enum with no scripting.
- All Shopify free-shipping-rule patterns (customer tag, subtotal, shipping class) are expressible.
- The ConvexPress shipping admin is considered feature-complete for free shipping by merchants migrating from WooCommerce or Shopify, measured by migration feedback surveys.
- The storefront renders a progress hint ("Add $X for free shipping") on carts that are only below the threshold — measured by the presence of the `shipping.free_shipping.disqualified` event with `reason === "below_min_amount"` and a non-zero gap, and the corresponding UI surface.
- Average checkout conversion rate for zones with at least one free shipping method is measurably higher than zones without, once the analytics dashboard is live — this is a sanity check, not a pass/fail gate for this PRD.
- Zero runtime errors from this method in the pipeline logs during normal operation.
- Free shipping method evaluation never produces a non-zero cost under any input combination.
- Free shipping method never appears in the rate list when its conditions are not met.
- Coexistence with paid methods verified across all supported method types.

---

## 13. Roles & Capabilities

| Capability | Purpose | Default Roles |
|-----------|---------|---------------|
| `admin.shipping.methods.manage` | Create, update, delete, reorder free shipping methods. Same capability gates all shipping method administration across Layer B. | Administrator, Shop Manager |
| `admin.shipping.methods.read` | Read-only access to free shipping method configuration. Used by the zone editor and the admin list views. | Administrator, Shop Manager, Editor |

No new capabilities are introduced by this PRD. Free shipping method administration is gated by the shared Layer B capability.

Customer-side access is governed by the storefront; there is no per-customer read control at the method layer beyond what PRD A7 and A1 enforce.

---

## 14. Events Fired

This method emits the shared Layer B events from PRD A7 plus two method-specific events.

### Shared Shipping Method Events

- `shipping.method.created` — emitted on successful method creation. Payload: method ID, zone ID, type (`free`), admin user ID.
- `shipping.method.updated` — emitted on successful method update. Payload: method ID, changed fields.
- `shipping.method.deleted` — emitted on successful method deletion. Payload: method ID, zone ID.
- `shipping.method.evaluated` — emitted on every pipeline evaluation. Payload: method ID, cart ID, qualified boolean, duration.

### Free Shipping Specific Events

- `shipping.free_shipping.qualified` — emitted when a cart evaluation qualifies for this method. Payload: method ID, cart ID, customer ID (if signed in), matched `conditionType`, matched coupon code (if applicable), subtotal at evaluation. Consumed by analytics (promotion effectiveness measurement).
- `shipping.free_shipping.disqualified` — emitted when a cart evaluation does not qualify. Payload: method ID, cart ID, customer ID (if signed in), `reason` (one of `disabled`, `currency_mismatch`, `excluded_shipping_class`, `missing_customer_tag`, `below_min_amount`, `missing_free_shipping_coupon`, `rule_failed`), optional `gap` (when `reason === "below_min_amount"`), optional `failingRuleId`. Consumed by the storefront progress-hint renderer and by analytics (drop-off measurement).

All events go through the Event Dispatcher system. Listeners are not defined here; any system (analytics, marketing, storefront) subscribes via the standard dispatcher mechanism.

---

## 15. References

### Upstream ConvexPress PRDs

- PRD A1 — Shipping Zones System (`specs/ConvexPress/systems/shipping-zones-system/PRD.md`).
- PRD A2 — Shipping Classes System (`specs/ConvexPress/systems/shipping-classes-system/PRD.md`).
- PRD A6 — Shipping Rules Engine (`specs/ConvexPress/systems/shipping-rules-engine/PRD.md`).
- PRD A7 — Rate Calculation Pipeline (within the shipping pipeline PRD family).

### Sibling PRDs

- PRD B1 — Weight-Based Shipping Method.
- PRD B2 — Flat-Rate Shipping Method (`specs/ConvexPress/systems/shipping-method-flat-rate/PRD.md`).
- PRD B3 — Dimensional Shipping Method (`specs/ConvexPress/systems/shipping-method-dimensional/PRD.md`).
- PRD B4 — Price-Based Shipping Method (`specs/ConvexPress/systems/shipping-method-price-based/PRD.md`).
- PRD B5 — Quantity-Based Shipping Method (`specs/ConvexPress/systems/shipping-method-quantity-based/PRD.md`).

### External References

- WooCommerce Free Shipping documentation — the canonical reference for the five built-in condition types. ConvexPress B6 deliberately mirrors this UX so that migrating merchants recognize the configuration flow immediately.
- WooCommerce Free Shipping source (`plugins/woocommerce/includes/shipping/free-shipping/class-wc-shipping-free-shipping.php`) — reference implementation for condition evaluation order and coupon integration semantics.
- Shopify free shipping rules and shipping profiles documentation — reference for customer-tag and minimum-order-amount conditions, and for the "free shipping coexists with paid options" model.
- Shopify Functions API for delivery customization — reference for the rule-engine escape hatch pattern, informing the `conditionType === "rule"` design in this PRD.
- Baymard Institute checkout research — reference for the conversion impact of visible free-shipping thresholds and the "Add $X for free shipping" progress-hint pattern.

---

**End of PRD B6 — Free Shipping Method.**
