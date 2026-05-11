# PRD — Local Delivery Shipping Method

**System ID:** `shipping-method-local-delivery`
**Layer:** B — Shipping Method Type (leaf)
**Status:** Draft v1
**Owners:** Commerce / Shipping Working Group
**Last Updated:** 2026-04-14

---

## 1. Context & Intent

Local Delivery is the shipping method a merchant uses to deliver physical goods themselves (or via their own fleet) to customers inside a restricted geographic area. It is the core shipping method for restaurants, florists, grocery stores, furniture showrooms, cannabis dispensaries, bakeries, breweries, appliance dealers, and any brick-and-mortar retailer that wants to offer same-day, next-day, or scheduled delivery from a single physical origin.

Local Delivery differs from Local Pickup (PRD B7) in one essential way: the merchant brings the order to the customer instead of the customer coming to the merchant. That inversion of flow changes almost every downstream decision — the method must validate the customer's delivery address, compute a distance or match a postcode allowlist, charge either a flat fee or a distance-based fee, let the customer pick a delivery window, and respect a same-day cutoff.

The intent of this system is to deliver first-class, WooCommerce-and-Shopify-parity local delivery functionality while staying firmly inside ConvexPress's own architecture:

- Restrict availability to a postcode allowlist **or** to a radius drawn from a ship-from location.
- Price the delivery as a flat cost **or** as a base-plus-per-kilometer distance formula with optional min/max clamping.
- Let the customer choose a delivery window from merchant-defined day-of-week time slots.
- Honor a same-day cutoff time so 4 PM orders do not promise 5 PM delivery.
- Honor a minimum order threshold so the merchant does not drive across town for a $3 muffin.
- Emit delivery-lifecycle events so Tracking (PRD D2), notifications, and the customer dashboard can show live status.

Local Delivery is a **leaf method**: it implements the `MethodRateCalculator` contract defined in PRD A7 (Rate Calculation Pipeline) and returns a quote. It does not dispatch to other methods, does not call third-party carrier APIs, and does not own zone, ship-from, or rule definitions — those come from upstream PRDs.

The success bar for this PRD is that a non-technical merchant can configure "Same-day delivery within 10 miles of the shop for $15, orders before 2 PM" in under two minutes, and that rate calculation completes in under ten milliseconds per cart evaluation including the haversine distance computation.

---

## 2. Scope

### In-Scope

- A new Convex table `commerce_shipping_method_local_delivery` that stores one document per local-delivery method instance attached to a zone.
- Two **restriction modes** controlling where the method is offered:
  - `postcode_allowlist` — the destination postcode must match one of the patterns listed on the method.
  - `radius` — the destination address must be within `radiusKm` kilometers of the configured ship-from location.
- Two **pricing modes** controlling what the method charges:
  - `flat` — one fixed cost per order regardless of distance.
  - `distance` — `baseCost + (distanceKm × perKmCost)`, clamped between `minCost` and `maxCost`.
- Attachment to a single `shipFromLocationId` (PRD A4) that supplies the origin latitude/longitude for distance calculation and the local timezone for cutoff evaluation.
- Optional `minOrderAmount` threshold — the cart subtotal must meet or exceed this value for the method to appear.
- `deliveryWindows` — an array of day-of-week + start-time + end-time slots the customer picks from at checkout (e.g., `{day: "monday", startTime: "10:00", endTime: "12:00"}`).
- Standard method metadata: `name` (internal), `label` (customer-facing), `enabled`, `sortOrder`, optional `ruleId` (PRD A6).
- Admin UX embedded inside the Zone editor page: a list row for each method, a dedicated editor form with conditional sub-fields keyed to the restriction and pricing modes, a postcode list editor, a radius control with a map preview, a pricing mode selector, a delivery window scheduler, and a live preview widget that resolves a sample address and shows the computed rate.
- Mutations for create, update, delete, reorder, and toggle-enabled.
- The `calculateLocalDelivery(methodConfig, cart, origin)` internal function invoked by the Rate Calculation Pipeline (PRD A7) when collecting quotes.
- Helper `computeDistanceKm(origin, destination)` using the haversine formula.
- Query `listAvailableDeliveryWindows(methodId, dateRange)` used by the storefront to render the picker.
- Emission of shared shipping method events (`shipping.method.created`, `shipping.method.updated`, `shipping.method.deleted`) plus three delivery-lifecycle events: `shipping.local_delivery.scheduled`, `shipping.local_delivery.out_for_delivery`, `shipping.local_delivery.delivered`.

### Out-of-Scope

- **Multi-stop route optimization** — the order in which a driver visits multiple deliveries is a separate future PRD (provisional ID `shipping-route-optimization`). This PRD produces one delivery per order; sequencing is not its concern.
- **Third-party courier integration** — DoorDash Drive, Uber Direct, Shipday, Roadie, GoPeople, or any on-demand fleet API. Each courier platform is a distinct shipping method PRD in Layer B (e.g., `shipping-method-doordash-drive`). Local Delivery is explicitly the "merchant delivers themselves" method.
- **Live driver GPS tracking** — the merchant mobile app, ETA updates, and breadcrumb maps are owned by the Tracking system (PRD D2). This PRD only emits lifecycle events D2 can subscribe to.
- **Per-window capacity limiting** — v1 treats delivery windows as unlimited. Capacity (e.g., "only 6 deliveries per Monday 10–12 slot") is a v2 enhancement tracked in the Edge Cases section.
- **Dynamic same-day cutoff per window** — v1 uses one cutoff that applies to same-day windows only. Per-window cutoffs are a v2 enhancement.
- **Tipping** — the Cart/Checkout system owns tip capture; this method does not embed tip pricing.
- **Vehicle-type surcharges** — "refrigerated truck +$10" is modeled via a separate method instance or a per-shipping-class override, not a field on this method.
- **Zone geography editing, ship-from CRUD, rule DSL authoring** — owned by PRD A1, A4, and A6 respectively.
- **Tax calculation itself** — the method sets the `taxable` hint only; the tax subsystem consumes it.
- **Currency conversion** — costs are stored in the store's base currency.
- **Rate caching** — handled centrally by PRD A7.

---

## 3. Dependencies

### Upstream (required before this system can ship)

- **PRD A1 — Shipping Zones System** (`shipping-zones-system`). Every local-delivery instance is scoped to exactly one `zoneId`. The zone provides the coarse geographic filter (country/state) before this method's finer postcode/radius check runs. The zone also defines the postcode pattern syntax this method reuses.
- **PRD A4 — Ship-From Locations** (`ship-from-locations-system`). The `shipFromLocationId` supplies the delivery origin's latitude, longitude, timezone, and address. Without a resolved origin there is no distance calculation and no cutoff evaluation.
- **PRD A5 — Address Validation** (`address-validation-system`). The destination address must be geocoded (latitude/longitude) for radius mode to work. This method does **not** perform geocoding itself; it consumes the cached geocode A5 attaches to the cart's destination address. When the address has no geocode, the method falls back to postcode comparison if configured, and otherwise excludes itself from the offer list with a graceful error.
- **PRD A6 — Shipping Rules Engine** (`shipping-rules-engine`). Optional `ruleId` on a method; if set, the pipeline evaluates the rule and skips the method when it returns false.
- **PRD A7 — Rate Calculation Pipeline** (`rate-calculation-pipeline`). Defines the `MethodRateCalculator` contract, the `QuoteResult` shape, cart normalization, quote caching, and the final method-selection strategy.

### Downstream

- **PRD D2 — Tracking System** (`shipping-tracking-system`). Consumes `shipping.local_delivery.scheduled`, `shipping.local_delivery.out_for_delivery`, and `shipping.local_delivery.delivered` events to drive the customer-facing delivery status timeline.

### Cross-references

- **Role & Capability System** for the `admin.shipping.methods.manage` capability check on every mutation.
- **Event Dispatcher System** for emitting shared and method-specific events.
- **Audit Log System** writes entries automatically via the event listeners registered by the Shipping Zones system.
- **Site Notification System** may subscribe to `shipping.local_delivery.out_for_delivery` to push an in-app "Your order is on the way" badge.
- **Email Notification System** may subscribe to the same event for the delivery-dispatched transactional email.

---

## 4. Schema

The schema lives in `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` alongside the other shipping-method tables. The exported symbol is `shippingMethodLocalDeliveryTables` and is spread into the main `defineSchema` call from `schema.ts`.

### Table: `commerce_shipping_method_local_delivery`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `zoneId` | `v.id("commerce_shipping_zones")` | yes | Parent zone. Indexed. |
| `shipFromLocationId` | `v.id("commerce_ship_from_locations")` | yes | Origin for distance + cutoff timezone. |
| `name` | `v.string()` | yes | Internal name, 1–60 characters. |
| `label` | `v.string()` | yes | Customer-facing label, 1–80 characters. |
| `restrictionMode` | `v.union(v.literal("postcode_allowlist"), v.literal("radius"))` | yes | How availability is gated. |
| `allowedPostcodes` | `v.array(v.string())` | conditional | Required when `restrictionMode === "postcode_allowlist"`. Postcode patterns, same syntax as zone postcode rules (PRD A1): exact match, wildcard suffix (`902*`), range (`90210...90299`), or comma-less individual lines. Max 5,000 entries. May also be populated in `radius` mode to create an allowlist-wins override set. |
| `radiusKm` | `v.number()` | conditional | Required when `restrictionMode === "radius"`. 0.1 to 500. |
| `pricingMode` | `v.union(v.literal("flat"), v.literal("distance"))` | yes | How cost is computed. |
| `flatCost` | `v.number()` | conditional | Required when `pricingMode === "flat"`. ≥ 0, stored in base currency minor-unit-safe decimal. |
| `distancePricing` | `v.optional(v.object({ baseCost: v.number(), perKmCost: v.number(), minCost: v.optional(v.number()), maxCost: v.optional(v.number()) }))` | conditional | Required when `pricingMode === "distance"`. All sub-values ≥ 0. |
| `minOrderAmount` | `v.optional(v.number())` | no | Cart subtotal threshold in base currency. Method excluded if cart is below this value. |
| `deliveryWindows` | `v.array(v.object({ id: v.string(), day: v.union(v.literal("monday"), v.literal("tuesday"), v.literal("wednesday"), v.literal("thursday"), v.literal("friday"), v.literal("saturday"), v.literal("sunday")), startTime: v.string(), endTime: v.string(), isSameDayEligible: v.boolean(), sortOrder: v.number() }))` | yes | Zero or more slots. `startTime` / `endTime` are `HH:MM` 24-hour strings in the ship-from location's local timezone. If the array is empty the method defaults to "ASAP / next available." |
| `sameDayCutoffTime` | `v.optional(v.string())` | no | `HH:MM` in origin timezone. Orders placed after this local time are ineligible for same-day windows. Default `14:00` when omitted and at least one window has `isSameDayEligible: true`. |
| `taxable` | `v.boolean()` | yes | Propagated to the quote result. |
| `enabled` | `v.boolean()` | yes | Disabled methods are never offered. |
| `sortOrder` | `v.number()` | yes | Ascending display order inside the zone. |
| `ruleId` | `v.optional(v.id("commerce_shipping_rules"))` | no | Optional gating rule. |
| `createdAt` | `v.number()` | yes | Unix ms. |
| `updatedAt` | `v.number()` | yes | Unix ms. |
| `createdBy` | `v.id("users")` | yes | Auth subject at creation. |
| `updatedBy` | `v.id("users")` | yes | Auth subject at last edit. |

### Indexes

- `by_zone` on `["zoneId", "sortOrder"]` — every rate lookup is scoped to one zone and sorted.
- `by_ship_from` on `["shipFromLocationId"]` — reverse lookup used by ship-from deletion guards.
- `by_zone_enabled` on `["zoneId", "enabled"]` — fast filter for the offer list.
- `by_rule` on `["ruleId"]` — rule-deletion referential-integrity check.

### Validator exports

`ConvexPress-Admin/packages/backend/convex/shipping/validators.ts` exports `localDeliveryConfigValidator`, `localDeliveryWindowValidator`, `localDeliveryDistancePricingValidator`, and `localDeliveryRestrictionModeValidator` for reuse by mutations, the pipeline, and tests.

---

## 5. Data Model

### Availability check (match)

A cart is **eligible** for a local-delivery method when **every** condition passes:

1. The cart's destination resolves inside the zone owning the method (PRD A1 does this — by the time this method runs, zone membership is guaranteed).
2. The method is `enabled`.
3. `ruleId`, if set, evaluates true against the current cart (PRD A6).
4. `minOrderAmount`, if set, is ≤ the cart subtotal.
5. **Restriction match**:
   - If `allowedPostcodes` is non-empty and contains a pattern matching the destination postcode: **match (allowlist wins)**.
   - Else if `restrictionMode === "postcode_allowlist"`: no match → not eligible.
   - Else if `restrictionMode === "radius"`:
     - If the destination has a cached geocode (PRD A5): compute `distanceKm` via haversine; eligible iff `distanceKm ≤ radiusKm`.
     - If the destination has **no** geocode: not eligible; the pipeline adds a soft-warning `"address_not_geocoded"` to the quote-result diagnostics.

The **allowlist-wins** rule is load-bearing: merchants frequently want "everything within 5 miles, plus these three outlying postcodes we still service." Populating `allowedPostcodes` in `radius` mode yields exactly that: the postcode is checked first and short-circuits the distance test. This is documented in both the admin UX and the schema field description.

### Distance calculation

`computeDistanceKm(origin, destination)` lives in `ConvexPress-Admin/packages/backend/convex/shipping/helpers/distance.ts` and implements the standard haversine formula:

- Earth radius constant `R = 6371` km.
- Inputs: `{lat: number, lng: number}` pairs in decimal degrees.
- Returns: distance in kilometers, rounded to three decimals for deterministic caching.

The helper is pure, synchronous, and has no Convex dependencies — it is trivially unit-testable. Callers outside this method (e.g., future "nearest-store lookup") may reuse it.

### Pricing calculation

Once the method is eligible:

- `pricingMode === "flat"` → `cost = flatCost`.
- `pricingMode === "distance"` →
  - `rawCost = distancePricing.baseCost + (distanceKm × distancePricing.perKmCost)`
  - If `distancePricing.minCost` defined: `cost = max(rawCost, minCost)`.
  - If `distancePricing.maxCost` defined: `cost = min(cost, maxCost)`.

Final cost is rounded to two decimals and returned in the `QuoteResult` shape defined by PRD A7.

### Delivery window selection

The storefront calls `listAvailableDeliveryWindows(methodId, dateRange)` (default range: today through +14 days). For each window in `deliveryWindows`, for each matching day-of-week inside the range:

- Compute the concrete local-time slot (`date + startTime` through `date + endTime`) in the ship-from timezone.
- If the slot is in the past → exclude.
- If `isSameDayEligible === true` and the slot's date equals today and "now" in origin timezone is after `sameDayCutoffTime` → exclude.
- Otherwise → include.

The customer selects one included slot; its stringified window ID is attached to the order as `metadata.localDeliveryWindowId` at checkout. The method calculator itself does not enforce window selection — that is a checkout-form validation responsibility — but the quote-result metadata carries the current eligibility snapshot so the checkout can render correctly.

---

## 6. Functions / API

All Convex functions live under `ConvexPress-Admin/packages/backend/convex/shipping/methods/localDelivery.ts` (handler + mutations + queries) and `ConvexPress-Admin/packages/backend/convex/shipping/helpers/distance.ts` (pure helper).

### Mutations (client-callable; require `admin.shipping.methods.manage`)

- `shipping.methods.localDelivery.create(zoneId, config)` — inserts a new row. Validates config exhaustively (see Validation below). Emits `shipping.method.created`. Returns the new document ID.
- `shipping.methods.localDelivery.update(methodId, partialConfig)` — patches an existing row. Re-validates the merged config. Emits `shipping.method.updated` with a diff payload.
- `shipping.methods.localDelivery.delete(methodId)` — hard-deletes the row. Emits `shipping.method.deleted`.
- `shipping.methods.localDelivery.reorder(zoneId, orderedIds)` — bulk-patches `sortOrder` for a set of IDs in one transaction.
- `shipping.methods.localDelivery.setEnabled(methodId, enabled)` — toggles `enabled` and emits `shipping.method.updated`.

### Queries (client-callable; read-scoped to caller's capabilities)

- `shipping.methods.localDelivery.listByZone(zoneId)` — all methods for a zone, sorted by `sortOrder`. Admin-only.
- `shipping.methods.localDelivery.get(methodId)` — single document. Admin-only.
- `shipping.methods.localDelivery.listAvailableDeliveryWindows(methodId, rangeStart, rangeEnd)` — public, used by the storefront delivery-window picker. Returns `{ windowId, start: number (unix ms), end: number, day: string, label: string, isSameDayEligible: boolean }[]`.
- `shipping.methods.localDelivery.previewRate(methodId, sampleCart, sampleDestination)` — admin-only live preview used by the editor widget. Returns the full `QuoteResult` or a structured non-match reason.

### Internal functions

- `internal.shipping.methods.localDelivery.calculate(methodConfig, cart, origin)` — the entrypoint the Rate Calculation Pipeline (A7) invokes. Pure function of its inputs. Returns `QuoteResult | null` where `null` means "not eligible, skip."
- `internal.shipping.methods.localDelivery.markScheduled(orderId, methodId, windowId)` — called by the Order system after checkout completion; persists the chosen window and emits `shipping.local_delivery.scheduled`.
- `internal.shipping.methods.localDelivery.markOutForDelivery(orderId)` — called by merchant dispatch actions; emits `shipping.local_delivery.out_for_delivery`.
- `internal.shipping.methods.localDelivery.markDelivered(orderId, deliveredAt)` — closes the delivery lifecycle; emits `shipping.local_delivery.delivered`.

### Helper

- `computeDistanceKm(origin: {lat, lng}, destination: {lat, lng}): number` — haversine, pure, exported for reuse.

### Validation rules (enforced in mutations)

- `name` 1–60 chars, trimmed, non-empty.
- `label` 1–80 chars.
- `restrictionMode === "postcode_allowlist"` → `allowedPostcodes.length ≥ 1`.
- `restrictionMode === "radius"` → `radiusKm > 0 && radiusKm ≤ 500`.
- `pricingMode === "flat"` → `flatCost ≥ 0`.
- `pricingMode === "distance"` → all of `distancePricing.{baseCost, perKmCost} ≥ 0`; if both `minCost` and `maxCost` provided, `minCost ≤ maxCost`.
- `deliveryWindows[].startTime` < `deliveryWindows[].endTime`, both valid `HH:MM`.
- `sameDayCutoffTime` valid `HH:MM` when present.
- `shipFromLocationId` must exist and belong to the same store.
- `zoneId` must exist and be active.

Validation failures return a structured `ShippingMethodValidationError` consumed by the admin form to highlight fields.

---

## 7. Admin UX

The admin UX is embedded in the Zone editor page defined by PRD A1 (`/admin/commerce/shipping/zones/$zoneId`). A "Local Delivery" row appears in the zone's methods list alongside Flat Rate, Free Shipping, etc. Clicking it opens a full-page editor at `/admin/commerce/shipping/zones/$zoneId/methods/local-delivery/$methodId` — per the project rule that content management is full-page, not modal.

### Editor layout

The editor uses the standard admin form layout (PRD "Admin Settings & Forms UI"): left-hand primary column, right-hand publish/enable sidebar.

**Primary column sections, top to bottom:**

1. **Identity**
   - `name` text input (internal).
   - `label` text input (customer-facing).
   - `shipFromLocationId` combobox populated from PRD A4. Helper text: "Deliveries start from this address. Distance is measured from here."

2. **Availability**
   - `restrictionMode` segmented control: `Postcode allowlist` / `Radius`.
   - **Conditional sub-field — postcode allowlist** (shown when `postcode_allowlist` selected, and also shown as an optional override when `radius` selected):
     - Multi-line text editor accepting one postcode pattern per line. Same syntax as zone postcode rules (PRD A1).
     - Inline validator highlights invalid patterns.
     - Helper text in radius mode: "Optional. Any postcode listed here overrides the radius check — useful for outlying neighborhoods you still service."
   - **Conditional sub-field — radius** (shown when `radius` selected):
     - Numeric input for `radiusKm` with unit toggle (km / mi). The stored value is always km; mi is display-only.
     - Leaflet-based map preview centered on the ship-from location's coordinates, with a translucent circle drawn at the configured radius. The map is read-only in v1 — no drag-to-resize.
     - Small diagnostic block: "Ship-from: *Main Street Bakery, 123 Main St…* — covers approximately X postcodes inside this radius" (computed server-side from the zone's postcode list).

3. **Pricing**
   - `pricingMode` segmented control: `Flat` / `Distance-based`.
   - **Conditional sub-field — flat**: single `flatCost` currency input.
   - **Conditional sub-field — distance**:
     - `baseCost` currency input ("Starting fee regardless of distance").
     - `perKmCost` currency input (unit follows the radius unit toggle).
     - `minCost` optional currency input ("Never charge less than…").
     - `maxCost` optional currency input ("Never charge more than…").
     - Inline preview table: for distances 1, 5, 10, and 25 km, show computed cost.

4. **Delivery windows**
   - Day-of-week grid (Mon–Sun). For each day, an "Add slot" button creates a row with `startTime`, `endTime`, and an `isSameDayEligible` checkbox.
   - Rows are reorderable within a day via drag handles.
   - A `sameDayCutoffTime` input sits at the top of the section with helper text: "Orders placed after this local time can't pick a same-day slot."
   - Timezone badge reflects the ship-from location: "All times are America/New_York (−04:00)."

5. **Thresholds**
   - `minOrderAmount` optional currency input ("Only offer this method when the cart is at least…").

6. **Rule** (collapsed by default)
   - `ruleId` combobox of PRD A6 rules with a "Create rule" shortcut.

**Right sidebar:**

- `enabled` toggle.
- Live preview widget: merchant types a destination address, the widget geocodes via A5, runs `previewRate`, and shows the rate or the non-match reason ("Address is 14.3 km from the shop, outside the 10 km radius. Add its postcode to the allowlist?").
- "Copy method" action that deep-links the create flow for another zone prefilled with the same config.

### List-row presentation

Inside the zone's methods list, a Local Delivery row shows:

- Label + internal name.
- Mode pills: "Radius 10 km" or "Postcode: 12 areas" and "Flat $15" or "Distance $5 + $1.20/km".
- Delivery-windows summary: "7 windows across 5 days."
- Enabled toggle inline.
- Drag handle for reordering.

---

## 8. Merchant Workflow

**Primary scenario — "How do I offer same-day delivery within 10 miles of my store for $15?"**

1. The merchant navigates to *Commerce → Shipping → Zones* and opens their "Local" zone (scoped to their city or region).
2. Inside the zone they click *Add method → Local Delivery*.
3. They name it `Same-day local`, label it `Same-day local delivery ($15)`.
4. They pick their shop from the *Ship-from location* combobox (configured previously in PRD A4).
5. They pick *Restriction mode → Radius*, toggle the unit to `mi`, type `10`. The map preview draws a 10-mile circle around the shop.
6. They pick *Pricing mode → Flat*, type `15`.
7. They configure seven delivery windows, Mon–Fri 10:00–12:00, 13:00–15:00, 16:00–18:00, each marked `isSameDayEligible`. Saturday 10:00–14:00 same-day-eligible. They set `sameDayCutoffTime` to `14:00`.
8. They set `minOrderAmount` to `25` so the driver does not cross town for a single cookie.
9. They flip `enabled` to on, click *Save*. The system emits `shipping.method.created`; the audit log records the capability check.
10. In the live preview they paste a customer address two miles away, see "*Rate: $15.00 — delivery window required.*" They paste a 15-mile address, see "*Address is 15.2 miles from ship-from, outside the 10 mile radius.*" They add the neighboring postcode to `allowedPostcodes` and re-preview — it now offers the rate.

**Secondary scenario — same-day cutoff tuning.** The merchant realizes 2 PM is too aggressive; they bump `sameDayCutoffTime` to `11:00` and save. Cached storefront quotes are invalidated via PRD A7's cache-key-by-config hash.

**Secondary scenario — distance pricing for furniture.** A furniture store prices `baseCost = 25`, `perKmCost = 3`, `minCost = 35`, `maxCost = 150`. The editor's preview table shows: 1 km → $35 (clamped up), 5 km → $40, 25 km → $100, 50 km → $150 (clamped down).

---

## 9. Storefront UX

Local Delivery affects the storefront in three surfaces: cart, checkout, and post-order status.

### Cart / shipping-estimator widget

When the customer has entered a postcode (and optionally a full address), the cart's rate widget calls PRD A7, which collects quotes from all methods including Local Delivery:

- If eligible → the method appears with its label, cost, and a small "*Choose a delivery window at checkout*" note.
- If not eligible (outside radius, no matching postcode, below minimum) → the method is omitted silently; the cart does not shout at the customer. If no methods are eligible at all, the cart falls through to PRD A7's empty-offer-list handling.

### Checkout

On the shipping-method step, Local Delivery is shown in the offer list with its computed cost (distance-based costs reflect the already-computed distance). When selected, a **Delivery window picker** appears inline:

- Grouped by day of week for the next 14 days.
- Each group shows only slots returned by `listAvailableDeliveryWindows`.
- Same-day windows are visually tagged (`Today — before cutoff`) and auto-disable once cutoff passes.
- The customer must pick exactly one window to proceed. If `deliveryWindows` is empty the picker collapses to "*We'll deliver as soon as possible and notify you when the driver is out.*"
- Selected window ID is attached to the order on submit.

### Mixed-cart messaging

If the cart contains items marked pickup-only or ship-to-store-only (flagged by the Product system), Local Delivery is excluded and the checkout renders the PRD A7 standard "Some items in your cart can't be delivered. Choose pickup or split your order" banner. Splitting is owned by the Cart/Checkout system, not this PRD.

### Customer dashboard / order detail

Once the order is placed, the customer's order detail page shows a delivery timeline driven by events:

- "Scheduled for Monday 10:00–12:00" → from `shipping.local_delivery.scheduled`.
- "Out for delivery" → from `shipping.local_delivery.out_for_delivery`.
- "Delivered" → from `shipping.local_delivery.delivered`.

The timeline UI is owned by PRD D2 (Tracking). This PRD only emits the events.

---

## 10. Edge Cases

1. **Destination has no geocode.** PRD A5 could not resolve lat/lng (typo, PO box, newly built address). In `radius` mode the method is ineligible and the pipeline diagnostic `"address_not_geocoded"` is attached to the quote result so the admin preview can surface it. In `postcode_allowlist` mode the method is fully usable because it never needs a geocode. If both are configured (allowlist in radius mode), the allowlist check runs first and can succeed independently.

2. **Address outside radius but in allowed postcode list.** Allowlist wins. The method is offered. Explicitly documented in both schema comment and admin helper text so merchants can deliberately use this pattern.

3. **Address inside radius but in an explicit denylist.** Not a v1 feature. A merchant who wants "radius except postcodes X, Y, Z" must either shrink the radius or use the rules engine (PRD A6) with a postcode-not-in predicate. Documented in "Known Limitations" of the admin help drawer.

4. **Delivery window is full (capacity).** Not enforced in v1 — windows are unlimited. The v2 extension path is a `capacity` number per window plus an index on scheduled orders to count usage. The schema field `deliveryWindows[].id` is stable so v2 can migrate without breaking existing orders.

5. **Same-day cutoff time has passed.** The `listAvailableDeliveryWindows` query filters out any same-day slot where `isSameDayEligible === true` and the origin-timezone now-time is after `sameDayCutoffTime`. Next-day and later slots are unaffected. Origin timezone always comes from the ship-from location, never from the customer or the browser, to avoid cross-timezone confusion.

6. **Minimum order not met.** The method is silently excluded from the offer list at rate time. If the customer adds more to the cart and the subtotal crosses the threshold, the next PRD A7 re-evaluation (triggered by cart-mutation) offers the method.

7. **Mixed cart with pickup-only items.** PRD A7 short-circuits the whole delivery-capable method class when any line item is flagged `fulfillmentRestriction: "pickup_only"`. This method never sees such carts.

8. **Ship-from location is deleted.** The `by_ship_from` index drives a referential-integrity check in the ship-from delete mutation (PRD A4). Delete is blocked with a structured error listing affected methods. Merchant must reassign or disable them first.

9. **Zone is deleted.** PRD A1's cascade-delete flow removes this method (owned entity) and emits `shipping.method.deleted` for each.

10. **Store currency changes.** Local-delivery costs are in base currency. Currency migration is a store-wide concern owned by the commerce core, not this PRD.

11. **Ship-from timezone changes** (merchant relocates the shop). New orders use the new timezone. In-flight orders with a selected window retain their original stringified window-start unix-ms timestamp (captured at checkout), so a timezone change does not retroactively shift a customer's Tuesday 10 AM slot.

12. **Haversine near antimeridian or poles.** Haversine is accurate to within ~0.5% globally. For the practical scope of local delivery (≤500 km radius, no pole-crossing), errors are sub-meter and negligible. No special-casing required.

13. **Radius of 0.** Disallowed by validation. `radiusKm > 0`.

14. **Extremely large postcode allowlist** (e.g., 5,000+ patterns). Hard-capped at 5,000. Admin UX warns at 1,000 and blocks at 5,000. Pattern matching is linear; merchants with more than 5,000 postcodes should either expand to a second method or use the zone's built-in postcode rules at the zone level (PRD A1).

15. **Customer changes delivery address after placing the order.** Out of scope for this PRD. Order-edit flows are owned by Orders; if a merchant re-runs shipping calculation, the method re-evaluates on the new address and can either still be eligible or be replaced.

---

## 11. Testing Requirements

### Unit tests (`packages/backend/convex/shipping/methods/__tests__/localDelivery.test.ts`)

- **Haversine correctness**: known pairs (NYC–LA ~3,944 km, London–Paris ~344 km, Sydney–Melbourne ~714 km) with ±1 km tolerance.
- **Haversine identity**: same point returns 0.
- **Haversine symmetry**: `compute(a, b) === compute(b, a)` to 3 decimals.
- **Availability matrix**:
  - postcode allowlist mode with matching postcode → eligible.
  - postcode allowlist mode with non-matching postcode → ineligible.
  - radius mode inside radius → eligible.
  - radius mode outside radius → ineligible.
  - radius mode + allowlist override with matching postcode outside radius → eligible (allowlist wins).
  - radius mode + allowlist populated but no match + inside radius → eligible.
  - radius mode with no geocode → ineligible + diagnostic attached.
  - disabled → ineligible.
  - minimum order not met → ineligible.
  - rule returns false → ineligible.
- **Pricing matrix**:
  - flat → flatCost.
  - distance → baseCost + distance*perKm.
  - distance + minCost clamp triggered.
  - distance + maxCost clamp triggered.
  - distance + both clamps with distance between them → raw value.
- **Window query**:
  - returns slots in requested range only.
  - excludes past slots.
  - excludes same-day slots after cutoff.
  - respects origin timezone (freeze-time test across DST boundary).
  - returns stable `windowId` across calls.

### Integration tests

- End-to-end rate request through PRD A7 with a seeded zone, ship-from, and method, asserting the quote shows in the offer list with correct cost and metadata.
- Mutation CRUD with capability check (unauthorized user is rejected with `FORBIDDEN`).
- Event emission assertions for all six events (method lifecycle + delivery lifecycle).
- Audit-log entries created for every mutation.
- Cache invalidation: changing `sameDayCutoffTime` invalidates the PRD A7 cache key for that method.

### Performance tests

- Single rate calculation < 10 ms including haversine.
- Rate calculation across 50 configured local-delivery methods in one zone < 150 ms.
- `listAvailableDeliveryWindows` for a 14-day range with 21 windows < 20 ms.

### Admin UX tests (Playwright)

- Full merchant workflow from Section 8 completes and persists.
- Live preview returns both match and non-match structured reasons.
- Conditional field visibility (pricing mode toggle, restriction mode toggle) behaves correctly.
- Validation errors highlight the right fields.

### Storefront tests (Playwright)

- Eligible address shows the method with correct cost.
- Ineligible address silently omits the method.
- Delivery-window picker renders only allowed slots, greys out past-cutoff same-day slots.
- Submitting checkout without picking a window is blocked with the correct validation message.

---

## 12. Success Criteria

The system is considered complete and production-ready when all of the following are demonstrably true:

1. A merchant can configure the primary workflow from Section 8 in under two minutes with no documentation.
2. All unit, integration, performance, and end-to-end tests from Section 11 pass in CI, and coverage for `localDelivery.ts` plus `distance.ts` is ≥ 95% line coverage.
3. Rate calculation p95 latency is under 10 ms per cart evaluation, measured over 10,000 calls against a representative fixture set.
4. Delivery-lifecycle events fire exactly once per lifecycle transition and are consumed without error by PRD D2's subscribers.
5. Allowlist-wins behavior is documented in admin help text, in schema JSDoc, and in at least three unit tests.
6. Validation rejects every failure case listed in Section 6 with a structured, actionable error payload.
7. The admin live-preview widget returns a human-readable match / non-match reason within 300 ms of address entry.
8. No references exist in this system to third-party courier APIs, route optimization, WorkOS, themes, widgets, or plugins (enforced by a repo-wide `scripts/lint-forbidden-terms.ts` check already required by the project).
9. The schema file conforms to the modular schema convention: one exported `shippingMethodLocalDeliveryTables` object, spread from `schema.ts`, zero direct table definitions in `schema.ts`.
10. All mutations run through `requireCan(ctx, "admin.shipping.methods.manage")`; no function bypasses the capability check.

---

## 13. Roles & Capabilities

The capability required for all mutations and admin-scoped queries is `admin.shipping.methods.manage`, defined by the Role & Capability System and shared across every Layer B shipping method PRD.

Default role mapping (per PRD "Role & Capability System"):

| Role | `admin.shipping.methods.manage` | Notes |
|------|--------------------------------|-------|
| Administrator | yes | Full CRUD, reorder, enable/disable. |
| Editor | no | Editors do not configure shipping. |
| Author | no | — |
| Contributor | no | — |
| Subscriber | no | — |

Storefront queries (`listAvailableDeliveryWindows`, rate evaluation through PRD A7) are publicly callable — they are part of the shopping experience and do not leak admin-only data. Admin-only queries (`listByZone`, `get`, `previewRate`) require the capability.

The internal-only lifecycle functions (`markScheduled`, `markOutForDelivery`, `markDelivered`) are not client-callable. They are invoked by the Orders system (scheduled) and the Order Fulfillment admin actions (out-for-delivery, delivered), both of which already gate on their own capabilities (`admin.orders.fulfill`).

---

## 14. Events Fired

All events are dispatched through the Event Dispatcher System. Listeners are registered declaratively per PRD "Event Dispatcher System."

### Shared shipping-method events (inherited from the Layer B shared contract)

| Event | Payload | When |
|-------|---------|------|
| `shipping.method.created` | `{ methodId, methodType: "local_delivery", zoneId, actorUserId }` | After `create` mutation commits. |
| `shipping.method.updated` | `{ methodId, methodType: "local_delivery", zoneId, actorUserId, diff }` | After `update` or `setEnabled` mutation commits. `diff` is a shallow field-level delta. |
| `shipping.method.deleted` | `{ methodId, methodType: "local_delivery", zoneId, actorUserId }` | After `delete` mutation commits, and via cascade when a parent zone is deleted. |

### Local-delivery lifecycle events (specific to this PRD)

| Event | Payload | When |
|-------|---------|------|
| `shipping.local_delivery.scheduled` | `{ orderId, methodId, windowId, windowStart: number, windowEnd: number, shipFromLocationId }` | After the order is placed with a local-delivery method selected and a window chosen. Emitted by `internal.markScheduled`. |
| `shipping.local_delivery.out_for_delivery` | `{ orderId, methodId, dispatchedAt: number, driverRef?: string }` | When the merchant marks the order out-for-delivery via the order dashboard. Emitted by `internal.markOutForDelivery`. |
| `shipping.local_delivery.delivered` | `{ orderId, methodId, deliveredAt: number, proofRef?: string }` | When the merchant marks the order delivered (or the mobile driver app confirms it). Emitted by `internal.markDelivered`. |

### Known subscribers

- **PRD D2 Tracking** subscribes to all three lifecycle events to drive the customer-facing delivery timeline.
- **Email Notification System** subscribes to `scheduled` (confirmation email), `out_for_delivery` ("your order is on the way"), and `delivered` ("how did we do?" survey hook).
- **Site Notification System** subscribes to `out_for_delivery` and `delivered` for the in-app bell badge.
- **Audit Log System** subscribes to all `shipping.method.*` events via the shared Layer B audit listener; no per-method audit wiring is required.

### Event-emission guarantees

- Every event is emitted inside the same Convex mutation that caused the state change, so the event and the data are atomically consistent.
- Events are idempotent-safe for consumers: a delivered order re-marked delivered emits a second `shipping.local_delivery.delivered` only if the underlying state actually changed (guarded by `deliveredAt == null` check in the internal function).

---

## 15. References

- **WooCommerce — Local Delivery** (legacy core, now in the "WooCommerce Shipping — legacy methods" repository). Established the postcode-allowlist + flat-fee pattern that is now the de-facto merchant expectation. Reference: `woocommerce/legacy-shipping-methods/local-delivery`.
- **WooCommerce — Local Pickup Plus extension.** Though a pickup extension, its scheduling UI is the prior art for the delivery-window grid pattern this PRD adopts.
- **Shopify — Local Delivery** (`https://help.shopify.com/en/manual/shipping/setting-up-and-managing-your-shipping/local-methods/local-delivery`). Established the radius-from-a-retail-location pattern, the "delivery area" map preview, same-day cutoff concept, and the minimum-order threshold. Shopify caps radius at 100 km for most merchants; ConvexPress caps at 500 km to accommodate rural delivery fleets.
- **Shopify — Delivery Dates and Pickup Dates app.** Prior art for the day-of-week delivery-window picker on checkout.
- **BigCommerce — Local Delivery by Zone shipping method.** Establishes the zone-scoped rather than store-global pattern ConvexPress follows (the method instance lives inside a zone, not at the store root).
- **BigCommerce — In-Store Pickup and Local Delivery documentation** for the mixed-cart fulfillment-restriction UX pattern referenced in Section 9.
- **Haversine formula** — R. W. Sinnott, "Virtues of the Haversine," *Sky and Telescope*, 1984. Standard reference for great-circle distance.
- **PRD cross-references** — A1 Shipping Zones, A4 Ship-From Locations, A5 Address Validation, A6 Shipping Rules Engine, A7 Rate Calculation Pipeline, B1 Flat Rate Shipping Method, B7 Local Pickup Shipping Method, D2 Shipping Tracking System, Role & Capability System, Event Dispatcher System, Audit Log System.
