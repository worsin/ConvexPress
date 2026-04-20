# Shipping Method — Local Pickup (B6) PRD

System ID: shipping-method-local-pickup
Layer: B (Shipping Method Type)
Status: Draft
Owner: Shipping Platform
Related Layers: A1 (Zones), A4 (Ship-From Locations), A6 (Rules Engine), A7 (Rate Calculation Pipeline), D2 (Tracking)

---

## 1. Context & Intent

Local Pickup is a shipping method in which the customer retrieves their order in person from a merchant-operated location rather than having it delivered. The merchant does not pay a carrier, incurs no transit liability, and either absorbs a small handling cost or passes a flat handling fee to the customer. The customer avoids delivery fees, receives the order faster (often same day), and chooses their preferred pickup point.

For ConvexPress merchants — especially local retailers, bakeries, breweries, nurseries, regional hardware stores, and mixed-inventory small businesses — Local Pickup is not an optional nicety; it is often the primary or co-primary fulfillment mode. It is also a critical lever for merchants who want to reduce carrier fees on heavy, fragile, perishable, or locally produced goods. Offering Local Pickup aligned to a Zone (A1) and a Ship-From Location (A4) is table stakes for any modern commerce platform.

The intent of this PRD is to define a first-class Local Pickup method that:

- Reuses the Ship-From Location primitive (A4) rather than creating a parallel "pickup location" schema, so inventory, hours, and addressing stay in one place.
- Participates in the Rate Calculation Pipeline (A7) like any other method, with its availability gated by Zone (A1) and Rules Engine (A6) filters.
- Produces a clean handoff into a pickup-specific order workflow (pending to ready_for_pickup to picked_up) with a dedicated customer-facing "ready for pickup" notification.
- Supports multi-location merchants by letting a single Local Pickup method offer multiple eligible pickup points and letting the customer pick at checkout.

Out of scope for B6 are same-day courier delivery (covered by B8 Local Delivery) and appointment scheduling (slot booking, calendar inventory, capacity limits) — those belong to a later, richer Appointment Scheduling system.

Business justification:

- Merchants with a physical footprint avoid carrier fees entirely on pickup orders.
- Customers within a defined Zone get a "Free — Pickup Today" option, lifting conversion.
- Lower environmental impact (no last-mile vehicle) and lower packaging cost (minimal or no shipping packaging).
- Enables mixed baskets ("ship some items, pick up others") in later iterations without redesigning the method.

---

## 2. Scope

### In Scope

- A standalone shipping method type `local_pickup` definable per Zone (A1).
- Association of one or more Ship-From Locations (A4) to a single Local Pickup method as "eligible pickup locations". A Ship-From Location is marked pickup-enabled via the `isPickupEnabled` flag on the A4 record.
- Zone-restricted availability: Local Pickup is only offered at checkout when the destination address falls inside a Zone that has a Local Pickup method configured. This is the fundamental guardrail preventing "drive three states to pick up your order".
- Optional flat handling fee (default `0`) applied at the order level to cover bagging, staff time, or storage.
- Pickup instructions rich-text field, shown at checkout (collapsed), on the order confirmation page, and in the pickup-ready email.
- Per-location "instructions override" so a downtown store can say "Ring bell at side door" while the warehouse says "Use loading dock B".
- A `requirePickupLocationSelection` setting (default `true`) that forces the customer to pick a specific location at checkout when more than one is offered.
- Pickup-ready notification trigger: when the order's pickup status transitions to `ready_for_pickup`, the Email Notification System fires a "Your order is ready" email to the customer.
- Pickup status workflow: `pending` to `ready_for_pickup` to `picked_up`, tracked on the order.
- Admin UX to create, edit, enable/disable, sort, and delete Local Pickup methods.
- Merchant workflow to mark an order as "Ready for Pickup" and then as "Picked Up", with audit trail.
- Participation in the Rate Calculation Pipeline (A7) alongside other method types.
- Participation in the Rules Engine (A6) so merchants can restrict Local Pickup (e.g., "not available for shipping classes of type `hazmat-carrier-only`").

### Out of Scope

- Same-day / local delivery by courier or merchant vehicle. That is B8 Local Delivery and is a distinct shipping method type.
- Appointment / time-slot scheduling with capacity limits, calendar inventory, or SMS reminders. Initial B6 uses a simple "Ready when we say it's ready" model. A future Appointment Scheduling system can layer on top of B6.
- Locker / third-party pickup networks (USPS Post Office, Amazon Hub, UPS Access Point). Those are distinct integrations, not B6.
- Real-time per-location inventory gating at checkout. B6 v1 lets the customer pick any eligible location; the merchant handles inventory mismatches operationally. A future enhancement (flagged in Edge Cases) will gate location availability by live stock.
- Pickup-only product flag enforcement logic in the cart. B6 defines the data shape; cart-level enforcement ("this item must be picked up, so your cart must use Local Pickup") is owned by the Cart/Checkout system and references B6.
- Payment-on-pickup / pay-in-store collection flows. Orders are paid online at checkout; pickup is only the fulfillment handoff.

---

## 3. Dependencies

### Upstream (B6 consumes)

- A1 Shipping Zones — determines whether Local Pickup is even offered for a given destination. A method is always scoped to exactly one zone.
- A4 Ship-From Locations — the source of truth for pickup locations. B6 does not create a second "pickup_locations" table; it references A4 records flagged `isPickupEnabled: true`.
- A6 Shipping Rules Engine — evaluates method-level conditions (cart composition, shipping classes, customer role, date/time windows) before the method is exposed to the customer.
- A7 Rate Calculation Pipeline — orchestrates method evaluation. B6 registers a `calculateLocalPickup` handler that the pipeline invokes during the rating pass.

### Downstream (consumes B6)

- D2 Tracking & Status — owns the pickup status workflow UI (status chip on the order, status transitions, merchant "Mark Ready" / "Mark Picked Up" controls). B6 defines the state model and the event payload; D2 renders and operates it.
- Email Notification System — subscribes to `shipping.pickup.ready` and `shipping.pickup.completed` events to send customer emails.
- Site Notification System — subscribes to the same events for in-dashboard customer notifications.
- Order / Cart System — records `pickupLocationId` on line items or on the order, and surfaces pickup details on the customer's order history page.
- Audit Log System — records status transitions, method config changes, and pickup completions.

### Cross-system dependencies

- A4 Ship-From Locations must expose fields needed by B6: public-facing name, address, geocoded coordinates, hours, contact phone, pickup instructions override, and the `isPickupEnabled` flag.
- A6 Rules Engine must support method-type-specific rule targeting (e.g., a rule that applies only to Local Pickup methods).

---

## 4. Schema

### New Table: `commerce_shipping_method_local_pickup`

File: `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` (added to the shared `shippingTables` export).

Fields:

- `zoneId: v.id("commerce_shipping_zones")` — Zone this method belongs to. Required. A method is scoped to exactly one zone.
- `name: v.string()` — Internal name, admin-only (e.g., "Local Pickup — NYC metro").
- `label: v.string()` — Customer-facing label at checkout (e.g., "Local Pickup", "Pick up in store").
- `allowedPickupLocationIds: v.array(v.id("commerce_ship_from_locations"))` — One or more Ship-From Locations offered as pickup points. Each referenced location must have `isPickupEnabled: true` at the time of selection (validated at rate time, not at save time, so the merchant can toggle pickup on/off without breaking this reference).
- `handlingFee: v.number()` — Flat handling charge in the store's currency's minor units (cents). Default `0`. Added once per order, not per line item.
- `pickupInstructions: v.optional(v.string())` — Rich-text (HTML) instructions shown at checkout, on order confirmation, and in the pickup-ready email. Method-level fallback used when the selected pickup location does not provide its own instructions override.
- `requirePickupLocationSelection: v.boolean()` — If `true` and `allowedPickupLocationIds.length > 1`, checkout must force the customer to pick one. If `false`, the first location is auto-selected. Default `true`.
- `enabled: v.boolean()` — If `false`, method is never returned by the pipeline even when its zone matches. Default `true`.
- `sortOrder: v.number()` — Display order among methods within the same zone. Lower numbers first.
- `ruleId: v.optional(v.id("commerce_shipping_rules"))` — Optional link to an A6 Shipping Rule that gates availability beyond simple zone matching.
- Standard system fields: `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.

Indexes:

- `.index("by_zone", ["zoneId"])` — fast zone filter during rating.
- `.index("by_zone_and_enabled", ["zoneId", "enabled"])` — skip disabled methods without a second pass.
- `.index("by_zone_and_sort", ["zoneId", "sortOrder"])` — admin listing.

### Modifications to `commerce_ship_from_locations` (A4)

A4 already exists. B6 requires the following fields on that table (to be added by A4, not B6):

- `isPickupEnabled: v.boolean()` — Gates whether this location can be offered as a pickup point. Default `false`.
- `pickupHours: v.optional(v.object({ ... }))` — Weekly open hours with holiday overrides. Shape owned by A4.
- `pickupInstructionsOverride: v.optional(v.string())` — Per-location instructions that, when present, replace the method-level instructions.
- `pickupContactPhone: v.optional(v.string())` — Customer-visible phone for pickup questions.
- `pickupContactEmail: v.optional(v.string())` — Customer-visible email.

B6's PRD references these but A4's PRD owns them. The Ship-From Locations expert adds the fields.

### Modifications to `commerce_orders`

Added by the Order system, referenced by B6:

- `pickupLocationId: v.optional(v.id("commerce_ship_from_locations"))` — Selected pickup location, set at checkout when Local Pickup is chosen.
- `pickupStatus: v.optional(v.union(v.literal("pending"), v.literal("ready_for_pickup"), v.literal("picked_up")))` — Pickup workflow state. Absent on non-pickup orders.
- `pickupReadyAt: v.optional(v.number())` — Timestamp of transition to `ready_for_pickup`.
- `pickupCompletedAt: v.optional(v.number())` — Timestamp of transition to `picked_up`.
- `pickupCompletedBy: v.optional(v.id("users"))` — Staff user who marked the order picked up.

---

## 5. Data Model

### Core relationships

- A Zone (A1) has zero or more Local Pickup methods. A method belongs to exactly one zone.
- A Local Pickup method references one or more Ship-From Locations (A4). A Ship-From Location can be referenced by multiple Local Pickup methods across multiple zones (e.g., a downtown store may serve two adjacent zones).
- A Ship-From Location is eligible for pickup only if `isPickupEnabled === true`.
- An order that used Local Pickup stores `pickupLocationId` pointing at exactly one Ship-From Location. There is no split-pickup in v1; the entire order is picked up at one location.

### Why reuse A4 Ship-From Locations

Merchants manage physical locations as a single concept: the same address that ships outbound parcels is usually the same address where walk-in customers pick up. Introducing a parallel "pickup_locations" table would force merchants to maintain two lists, two address records, two hour schedules, and two inventory targets that must stay in sync. Instead, A4 owns the address record, hours, contact info, and pickup-specific flags, and B6 references A4.

The `isPickupEnabled` flag lets a merchant use a location for outbound shipping only (dark warehouse) without exposing it as a pickup point. Turning the flag off hides the location from all Local Pickup methods immediately; existing in-flight pickup orders retain their assignment and are unaffected.

### At checkout

1. The pipeline (A7) receives the cart and destination address.
2. Zone resolution (A1) identifies the zone.
3. The pipeline fetches all methods for that zone, including Local Pickup methods.
4. For each Local Pickup method, the `calculateLocalPickup` handler:
   - Filters `allowedPickupLocationIds` to the subset that currently have `isPickupEnabled: true`.
   - Returns a rate quote with:
     - `cost = handlingFee`
     - `method = "local_pickup"`
     - `methodId = <doc id>`
     - `availablePickupLocations = [...]` — array of `{ locationId, name, address, hours, instructionsOverride, contactPhone }` for checkout to render.
     - `requirePickupLocationSelection` propagated from the method.
   - If the filtered location list is empty, the method is suppressed from the rate set.
5. Rules Engine (A6) evaluates `ruleId` against the cart and may filter the method out.
6. The surviving method list is returned to checkout.

### At order placement

1. Customer selects Local Pickup and a specific `pickupLocationId`.
2. Checkout writes `order.shippingMethod = "local_pickup"`, `order.pickupLocationId`, `order.pickupStatus = "pending"`, `order.shippingCost = handlingFee`.
3. Normal payment flow proceeds.

### At fulfillment

1. Merchant prepares the order at the selected location.
2. Merchant transitions `pickupStatus` from `pending` to `ready_for_pickup`.
3. Email Notification System fires the pickup-ready email.
4. Customer arrives; merchant transitions `pickupStatus` to `picked_up`.
5. Order completion flow fires order-complete events.

---

## 6. Functions / API

File: `ConvexPress-Admin/packages/backend/convex/shipping/methods/localPickup.ts`

### Public mutations

- `createLocalPickupMethod({ zoneId, name, label, allowedPickupLocationIds, handlingFee, pickupInstructions, requirePickupLocationSelection, enabled, sortOrder, ruleId })` — Admin only. Validates each location ID resolves to a Ship-From Location within the same store.
- `updateLocalPickupMethod({ methodId, patch })` — Admin only. Partial update.
- `deleteLocalPickupMethod({ methodId })` — Admin only. Soft delete by setting `enabled: false` is preferred for audit; hard delete is allowed if no orders reference the method.
- `reorderLocalPickupMethods({ zoneId, orderedIds })` — Admin only. Atomically rewrites `sortOrder`.
- `markOrderReadyForPickup({ orderId })` — Merchant staff with `admin.shipping.methods.manage`. Validates `order.shippingMethod === "local_pickup"` and `pickupStatus === "pending"`. Transitions to `ready_for_pickup`, stamps `pickupReadyAt`, emits `shipping.pickup.ready`.
- `markOrderPickedUp({ orderId })` — Merchant staff with `admin.shipping.methods.manage`. Validates `pickupStatus === "ready_for_pickup"`. Transitions to `picked_up`, stamps `pickupCompletedAt` and `pickupCompletedBy`, emits `shipping.pickup.completed`.

### Public queries

- `listLocalPickupMethods({ zoneId })` — Admin. Returns methods sorted by `sortOrder` with hydrated Ship-From Location summaries.
- `getLocalPickupMethod({ methodId })` — Admin.
- `listAvailablePickupLocations({ methodId, destinationAddress })` — Storefront. Runs the same filter logic the pipeline uses (eligibility, enabled, zone match on the destination address) and returns the picker payload. Used by checkout to refresh the location list if the customer changes address.

### Internal functions

- `calculateLocalPickup({ cart, destinationAddress, zoneId, methodId })` — Called by A7 Rate Calculation Pipeline. Produces a single rate quote or `null` if the method is not eligible. Pure read-only.
- `resolveEligiblePickupLocations({ methodId })` — Internal helper. Returns the `allowedPickupLocationIds` filtered by current `isPickupEnabled`.
- `validatePickupLocationSelection({ orderId, pickupLocationId })` — Internal. Ensures the chosen location is still eligible at the moment of order placement; used by the checkout commit path.
- `emitPickupStatusEvent({ orderId, status })` — Internal. Central place for firing pickup events so D2 and notifications subscribe to one source.

### Validators

Shared in `convex/shipping/methods/validators.ts`:

- `localPickupMethodInput` — zod-equivalent Convex validator for create/update payloads.
- `pickupStatusValidator` — union of the three pickup status literals, reused by orders, D2, and notifications.

---

## 7. Admin UX

Local Pickup methods are edited inside the Zone editor (A1), alongside other method types, using the shared Admin Settings & Forms UI patterns and the shared List Table patterns. No modals.

### Method editor (full page)

Route: `/admin/commerce/shipping/zones/$zoneId/methods/local-pickup/$methodId`

Sections:

1. Identity
   - Internal name (admin-only).
   - Customer-facing label.
   - Enabled toggle.
   - Sort order.

2. Pickup locations
   - A picker listing every Ship-From Location (A4) in the store, grouped by "Pickup-enabled" and "Not pickup-enabled". Non-pickup-enabled locations are shown disabled with an inline link "Enable pickup on this location" that deep-links into the A4 editor.
   - Multi-select; selected locations appear as chips in order of admin preference (drag to reorder — determines default selection order at checkout when only one is offered).
   - Empty-state guidance: if the store has zero pickup-enabled locations, the editor shows a prominent CTA to create or enable one.

3. Customer experience
   - Handling fee (currency input, supports `0`).
   - Require customer to choose a pickup location (toggle, default on).
   - Pickup instructions (rich text). Help text: "Shown at checkout, on the order confirmation, and in the pickup-ready email. Location-specific instructions can be set on each Ship-From Location and will override these."

4. Availability rules (optional)
   - Link to a Shipping Rule (A6) or "Create new rule from this method" button.
   - Inline summary of the linked rule's conditions.

5. Per-location hours (read-only preview)
   - Table of each selected location's pickup hours, contact info, and instructions override, sourced from A4.
   - "Edit this location" deep link.

Save produces a single atomic mutation. Validation errors surface inline under the relevant field.

### Method list table

Inside the Zone editor, a list table of all methods in the zone (across all method types). Columns: Label, Type, Enabled, Sort, Cost summary, Actions. Local Pickup rows show "Local Pickup" as type and "Free" or "+$X.XX handling" as cost summary.

### Order-level pickup controls

On the order detail page (owned by the Order system, surfaced via D2):

- A Pickup Status panel replaces the standard Shipping panel when `shippingMethod === "local_pickup"`.
- Shows: selected pickup location (with address and hours), status chip (pending / ready_for_pickup / picked_up), timestamps, and buttons "Mark Ready for Pickup" and "Mark Picked Up".
- Buttons are gated by the `admin.shipping.methods.manage` capability and by current status (you cannot mark picked up before mark ready).
- A status history list shows who transitioned what, when.

---

## 8. Merchant Workflow

> "How do I offer local pickup from my downtown store?"

1. Enable pickup on the location.
   - Navigate to Commerce to Shipping to Ship-From Locations.
   - Open the "Downtown Store" location.
   - Toggle "Enable local pickup at this location" on.
   - Fill in pickup hours, contact phone/email, and any location-specific instructions ("Ring bell at side door").
   - Save.

2. Ensure a Zone covers the customers you want to allow.
   - Open Commerce to Shipping to Zones.
   - Confirm there is a Zone (e.g., "NYC Metro") containing the postal codes of customers who should be able to pick up.
   - If no such zone exists, create one.

3. Add a Local Pickup method to the Zone.
   - Inside the Zone editor, click "Add Method" to "Local Pickup".
   - Name the method (e.g., "NYC Pickup").
   - Set the customer-facing label ("Pick up in store").
   - Select "Downtown Store" (and any other pickup-enabled locations you want to offer).
   - Leave handling fee at 0 or set it to cover your handling cost.
   - Write clear pickup instructions — required parking, check-in procedure, ID requirements.
   - Save.

4. Test the experience.
   - In the storefront, add an item to cart and enter a delivery address inside the zone.
   - Confirm "Pick up in store — Free" appears at checkout with the location picker.
   - Place a test order.

5. Fulfill the first real pickup order.
   - When an order with shipping method Local Pickup lands, prepare the items at the specified location.
   - On the order page, click "Mark Ready for Pickup". The customer receives the pickup-ready email automatically.
   - When the customer arrives, verify identity and click "Mark Picked Up". The order is now closed.

### Common variations

- Multiple stores: repeat step 1 for each store, then step 3 once per zone, selecting all relevant stores on the method.
- Regional warehouse: enable pickup on a warehouse Ship-From Location and create a wider zone (e.g., statewide) with its own method.
- Pickup with fee: set `handlingFee` to cover staff time (commonly $1 to $5).
- Pickup-only products: the product (Catalog) marks itself pickup-only; cart enforcement falls to the Cart system using the B6 data model as reference.

---

## 9. Storefront UX

### Checkout — method selection

When the customer's destination address resolves to a zone with a Local Pickup method:

- The method appears in the shipping methods list as a radio option.
- Label: the configured `label` (e.g., "Pick up in store").
- Price: "FREE" if `handlingFee === 0`, otherwise "+$X.XX handling" in the customer's currency.
- Expand icon reveals a short description: "Pick up your order at one of our locations. We'll email you when it's ready."

### Checkout — pickup location picker

Immediately under the selected Local Pickup method:

- If `requirePickupLocationSelection === true` and multiple eligible locations exist, a radio list of locations is required before the order can be placed.
- Each location card shows: name, street address, "X miles away" distance (when address geocoding is available), today's hours ("Open until 7 PM" / "Closed today"), and an expand affordance for full weekly hours, contact phone, and any instructions override.
- If only one eligible location exists, it is auto-selected and shown in a compact summary.
- Pickup instructions (method-level or location-override) appear in a collapsed "Pickup details" disclosure.

### Order confirmation page

The shipping summary replaces the delivery address with a Pickup Summary:

- "You will pick up this order."
- Full pickup location name and address.
- Today's hours and phone.
- Pickup instructions rendered inline.
- Status chip: "Preparing — we'll email when ready."

### Customer email — pickup ready

Subject: "Your order #1234 is ready for pickup"

Body includes: order number, pickup location name and address, a map link, hours (today and next two days), pickup instructions, contact phone, and any ID-required note. Triggered by the `shipping.pickup.ready` event.

### Customer email — pickup completed

Optional receipt-style email triggered by `shipping.pickup.completed`, confirming pickup and linking to the order in the customer dashboard.

### Customer dashboard — My Orders

Pickup orders show a pickup-aware status column: "Preparing", "Ready for Pickup", "Picked Up". Tapping a ready-for-pickup order reopens the pickup details (address, hours, instructions) so the customer has them on arrival.

---

## 10. Edge Cases

1. No pickup-enabled locations exist in the store.
   - The Local Pickup method editor cannot be saved with an empty `allowedPickupLocationIds`. The save button is disabled with guidance.
   - Existing methods whose locations have all been disabled (all references now have `isPickupEnabled: false`) are filtered out of the rate set at checkout; customers never see them. Admin sees a warning badge on the method in the list.

2. Customer's destination falls outside every Local Pickup zone.
   - Local Pickup is not offered at checkout. Standard non-pickup methods apply. No error.

3. A selected pickup location is temporarily closed (e.g., holiday).
   - Closure is represented via the location's `pickupHours` holiday overrides (owned by A4).
   - The pipeline filters closed-today locations only if a future setting "hide-closed-locations-from-picker" is on. Default is to show them with a "Closed today" badge; the customer can still pick them because the order will be ready later.
   - If the entire location is indefinitely closed, the merchant disables `isPickupEnabled` temporarily; it is then suppressed from the picker entirely.

4. Multiple pickup locations in the same zone.
   - All eligible locations are shown in the picker. Customer selects one.
   - If the merchant sets `requirePickupLocationSelection = false`, checkout auto-selects the first in admin-defined order.

5. Item not available at the selected location (per-location inventory mismatch).
   - v1 behavior: the order is accepted and the merchant resolves the mismatch operationally (transfer stock, contact customer).
   - v2 enhancement (flagged): a future flag `gatePickupLocationsByInventory` will filter the picker to locations that have all cart items in stock. v2 requires per-location inventory (owned by Inventory System, not B6) and is deliberately deferred.

6. Pickup-only items mixed with shippable-only items in one cart.
   - v1 behavior: B6 does not enforce this. The cart must resolve it before checkout (either require all items to use the same method, or offer split shipments — a Cart/Checkout responsibility that references the B6 data model).
   - B6 only guarantees that if the cart sends a Local Pickup order through, the pickup workflow runs correctly for the whole order.

7. Customer edits their address after selecting Local Pickup.
   - Checkout re-runs the pipeline. If the new address still resolves to a zone with the same Local Pickup method and the chosen location is still eligible, the selection persists.
   - If the new address no longer qualifies, the selection clears and the customer is shown the updated method list (likely without Local Pickup). A non-blocking toast explains the change.

8. Handling fee changes between cart creation and payment.
   - The rate snapshot taken at order placement is authoritative. Subsequent admin changes do not retroactively modify paid orders.

9. Merchant deletes a Local Pickup method while orders are in flight.
   - Hard delete is blocked if any order references the method with `pickupStatus !== "picked_up"`. The admin is instructed to disable the method instead, or wait for in-flight pickups to complete.
   - Soft delete (disable) never affects in-flight orders.

10. Merchant disables `isPickupEnabled` on a location with ready-for-pickup orders.
    - In-flight orders retain their assignment and full workflow.
    - The location disappears from new checkouts immediately.
    - A warning banner on the location editor shows the count of in-flight pickups.

11. Customer never picks up the order.
    - v1 has no automatic stale-order handler. The merchant manually decides to contact, refund, or restock. A future enhancement can add a configurable "stale pickup" auto-action after N days.

12. Two customers both in a zone, one inside pickup range, one outside.
    - The same zone applies to both; both see Local Pickup at checkout. v1 does not implement per-customer distance caps. If a merchant needs a tighter radius, they define a narrower Zone.

13. Accessibility of pickup locations.
    - Accessibility metadata (wheelchair access, ground-floor entrance) belongs to A4. B6 surfaces whatever A4 exposes in the picker.

14. Timezone handling for hours.
    - Each Ship-From Location stores its own timezone (A4). "Open until 7 PM" is computed in the location's local time, not the customer's browser time. B6 must render hours in the location's timezone with an explicit label.

---

## 11. Testing Requirements

### Unit tests

- `calculateLocalPickup` returns a rate with `cost = handlingFee` for a valid zone + eligible location.
- `calculateLocalPickup` returns `null` when all `allowedPickupLocationIds` have `isPickupEnabled: false`.
- `calculateLocalPickup` returns `null` when the method is disabled.
- `resolveEligiblePickupLocations` correctly filters by the current `isPickupEnabled` flag.
- `validatePickupLocationSelection` rejects locations not in `allowedPickupLocationIds`, not pickup-enabled, or not in the method's zone.
- Status transition guards: cannot transition `picked_up` from `pending`; cannot transition `pending` from `picked_up`; cannot transition twice.
- Capability gating: non-staff users cannot call `markOrderReadyForPickup` or `markOrderPickedUp`.

### Integration tests

- End-to-end create Local Pickup method: admin mutation creates the row with correct defaults and indexes.
- Pipeline integration: a cart with a destination in a pickup zone returns the Local Pickup rate alongside other methods, in correct sort order.
- Rule filtering: a linked A6 Rule correctly suppresses or allows the method based on cart contents.
- Order placement with Local Pickup writes `pickupLocationId` and `pickupStatus = "pending"` atomically.
- Transition `pending` to `ready_for_pickup` fires `shipping.pickup.ready`, which enqueues the email and the site notification.
- Transition `ready_for_pickup` to `picked_up` fires `shipping.pickup.completed` and records `pickupCompletedBy`.
- Soft-deleting a method mid-flight does not break existing orders.
- Disabling `isPickupEnabled` on a location removes it from new checkouts but leaves in-flight orders intact.

### End-to-end tests

- New merchant enables pickup on one location, creates a Zone, creates a Local Pickup method, and completes a test order through pickup-ready and pickup-completed.
- Customer in zone sees "Pick up in store — Free" at checkout and completes order.
- Customer outside zone never sees Local Pickup at checkout.
- Multi-location picker: two pickup-enabled locations in one zone both appear; customer must choose; choice is persisted.
- Pickup-ready email is received and contains correct location, hours, and instructions.
- Order detail page correctly transitions status chips as merchant clicks the two workflow buttons.
- Audit log records every method config change and every status transition.

### Performance tests

- Rating a cart with 1 Local Pickup method plus 5 other method types completes within the A7 pipeline latency budget.
- Zone with 50 pickup-enabled locations renders the picker in under 300 ms on a typical mobile connection.

### Accessibility tests

- Location picker is operable by keyboard only.
- Radio cards are screen-reader labeled with full address, hours, and distance.
- Pickup status chips meet contrast standards against all theme backgrounds.

---

## 12. Success Criteria

- Merchants can configure a working Local Pickup method in under two minutes once they have a Ship-From Location and a Zone.
- At least 95% of checkouts in zones with pickup configured render the pickup option without console errors.
- The "pickup ready" email is delivered within 60 seconds of the merchant clicking "Mark Ready".
- Admin and storefront flows contain zero modals for Local Pickup configuration and fulfillment (full-page only, per UI rules).
- All B6 mutations are gated by the correct role/capability checks (see Section 13).
- Zero orphaned references: deleting a Ship-From Location that is referenced by any Local Pickup method is either blocked or triggers a guided cleanup flow.
- 100% of fired events (`shipping.pickup.ready`, `shipping.pickup.completed`) have corresponding audit log entries.
- The Rate Calculation Pipeline (A7) treats Local Pickup as a first-class method — no special-case branching outside the registered handler.
- The Email Notification System (via shared templates) renders pickup-ready emails with correct location, hours, and instructions for 100% of orders in a 1,000-order smoke test.

---

## 13. Roles & Capabilities

Following the WordPress-standard role structure already defined in the ConvexPress role and capability system:

| Capability | Administrator | Shop Manager | Editor | Author | Contributor | Subscriber |
|---|---|---|---|---|---|---|
| `admin.shipping.methods.create` | yes | yes | no | no | no | no |
| `admin.shipping.methods.update` | yes | yes | no | no | no | no |
| `admin.shipping.methods.delete` | yes | yes | no | no | no | no |
| `admin.shipping.methods.view` | yes | yes | yes (read-only) | no | no | no |
| `admin.shipping.methods.manage` | yes | yes | no | no | no | no |
| `shipping.pickup.view_own_order` | n/a | n/a | n/a | n/a | n/a | yes (only their own orders) |

Notes:

- `admin.shipping.methods.manage` covers both "Mark Ready for Pickup" and "Mark Picked Up". A future iteration may split it if merchants want to delegate the ready-signal to floor staff while reserving completion to managers.
- The customer-facing pickup status view is part of the standard "view own order" capability and is not a B6-specific capability.
- All mutations must call `requireCan(ctx, "<capability>")` as the first step of the handler.

---

## 14. Events Fired

All events flow through the Event Dispatcher System. B6 fires:

### Shared shipping method lifecycle events

Inherited from the shipping method base contract — same payload shape across all method types.

- `shipping.method.created` — `{ methodId, methodType: "local_pickup", zoneId, createdBy }`
- `shipping.method.updated` — `{ methodId, methodType: "local_pickup", zoneId, changedFields: string[], updatedBy }`
- `shipping.method.deleted` — `{ methodId, methodType: "local_pickup", zoneId, deletedBy, soft: boolean }`
- `shipping.method.enabled` — `{ methodId, methodType: "local_pickup", zoneId }`
- `shipping.method.disabled` — `{ methodId, methodType: "local_pickup", zoneId }`

### Pickup-specific events

- `shipping.pickup.ready` — Fired when an order transitions to `ready_for_pickup`.
  - Payload: `{ orderId, customerId, pickupLocationId, methodId, pickupReadyAt, storeId }`
  - Subscribers: Email Notification System (pickup-ready email), Site Notification System (in-dashboard notice), Audit Log, Analytics.

- `shipping.pickup.completed` — Fired when an order transitions to `picked_up`.
  - Payload: `{ orderId, customerId, pickupLocationId, methodId, pickupCompletedAt, pickupCompletedBy, storeId }`
  - Subscribers: Email Notification System (optional receipt), Audit Log, Analytics, Order System (may trigger order-complete side effects).

### Events consumed (for context)

- `ship_from_location.updated` with a change to `isPickupEnabled` — B6 uses this to invalidate cached eligibility (if/when rate caching is introduced) and to surface admin warning badges on methods whose locations are now ineligible.
- `order.created` — the Order System fires this; B6's pipeline handler does not directly subscribe but the Order System ensures `pickupStatus = "pending"` is set on creation when the chosen method is `local_pickup`.

---

## 15. References

### Prior-art platforms studied

- WooCommerce Local Pickup — reference for the zone-scoped method model, per-zone instruction text, and tax handling at the pickup location. ConvexPress B6 improves on WooCommerce by reusing Ship-From Locations instead of defining pickup locations only as free-text instructions.
- Shopify Local Pickup — reference for the multi-location picker UX, the "Ready for pickup" email trigger, and the explicit pickup status workflow. ConvexPress B6 follows Shopify's status model (pending to ready to picked up) closely because it matches real-world merchant operations.
- BigCommerce Pickup in Store — reference for per-location hours, contact info, and the "Choose a pickup location" checkout step.
- Square Online Pickup — reference for the pickup-instructions rich text pattern and the "Ready for Pickup" customer email layout.

### Related ConvexPress systems

- A1 Shipping Zones PRD — `specs/ConvexPress/systems/shipping-zones-system/PRD.md`
- A4 Ship-From Locations PRD — `specs/ConvexPress/systems/ship-from-locations-system/PRD.md`
- A6 Shipping Rules Engine PRD — `specs/ConvexPress/systems/shipping-rules-engine/PRD.md`
- A7 Rate Calculation Pipeline PRD — `specs/ConvexPress/systems/rate-calculation-pipeline/PRD.md`
- Email Notification System — `.claude/docs/EMAIL-NOTIFICATION-SYSTEM.md`
- Site Notification System — `.claude/docs/SITE-NOTIFICATION-SYSTEM.md`
- Audit Log System — `.claude/docs/AUDIT-LOG-SYSTEM.md`
- Event Dispatcher System — `.claude/docs/EVENT-DISPATCHER-SYSTEM.md`
- Role & Capability System — `.claude/docs/ROLE-CAPABILITY-SYSTEM.md`

### Source files (to be created during implementation)

- Schema: `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` (add `commerce_shipping_method_local_pickup` to the existing `shippingTables` export).
- Handler: `ConvexPress-Admin/packages/backend/convex/shipping/methods/localPickup.ts`.
- Validators: `ConvexPress-Admin/packages/backend/convex/shipping/methods/validators.ts` (shared).
- Admin route: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/shipping/zones/$zoneId/methods/local-pickup/$methodId.tsx`.
- Order pickup panel: integrated by D2 Tracking in the order detail route.

### Airtable blueprint references

- Systems table `tblmiSawf6mIf56V8` — this PRD corresponds to the B6 record.
- Actions table `tblQTSboBXFiXSP3O` — `admin.shipping.methods.create`, `admin.shipping.methods.manage`, etc.
- Events table `tblDQOlXXJO1aQapT` — `shipping.pickup.ready`, `shipping.pickup.completed`.
- Email Notifications table `tbl5UW9iMJynfVUGG` — the pickup-ready and pickup-completed email templates.
