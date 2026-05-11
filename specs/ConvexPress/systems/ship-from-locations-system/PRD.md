# Ship-From Locations (Warehouses) System — PRD A4

**Layer:** A (Core Infrastructure)
**PRD Index:** A4 of 25
**Status:** Draft
**Owner:** Shipping domain
**Replaces:** Single-origin shipping assumption in `commerce_shipping_profiles.shipFromAddress` and `integrations.shipping.shipFrom*`

---

## 1. Context & Intent

ConvexPress commerce currently assumes a merchant ships every order from a single origin. The origin is stored two places at once and neither is authoritative:

- `commerce_shipping_profiles.shipFromAddress` (a `v.any()` blob on a profile that is flagged "default")
- `integrations.shipping` settings section (flat fields: `shipFromName`, `shipFromCompany`, `shipFromLine1`, `shipFromLine2`, `shipFromCity`, `shipFromState`, `shipFromPostalCode`, `shipFromCountryCode`)

This model collapses the moment a merchant has more than one physical origin. The most common scenarios that break it:

- A merchant operates a **Northeast warehouse** (e.g., Ohio) and a **West Coast warehouse** (e.g., California) and wants each coast's customers routed to the nearest origin for cheaper and faster delivery.
- A merchant has a **retail storefront** that also ships online orders, plus a **dedicated fulfillment warehouse**. Store-pickup orders must originate from the store; shipped orders originate from the warehouse.
- A merchant uses a **dropshipper** for a subset of SKUs. Those SKUs must rate and label from the dropshipper's address; everything else ships from the merchant's own warehouse.
- A merchant expands internationally and opens a **Toronto warehouse** for Canadian orders to avoid cross-border rates and duties on every shipment.

Without native multi-location support, merchants either (a) eat suboptimal rates, (b) build brittle out-of-band scripts, or (c) choose a different platform. This PRD defines the Ship-From Locations System: the authoritative model for every physical origin a merchant can ship from, the mapping of products and variants to those origins, and the algorithm that selects the right origin (or origins) for a given cart and destination.

This system is the foundation that the Rate Calculation Pipeline (A7), every live-rate provider (C1–C5), the Label system (D1), and the Manifest system (D3) build on. They all need to answer one question before doing their job: **which location is this shipment originating from?** Today that answer is hardcoded to "the one default address." After this PRD, the answer is computed per shipment.

### Intent summary

1. Replace the single-origin assumption with a first-class `commerce_ship_from_locations` table.
2. Map products and variants to one-or-more eligible locations.
3. Compute the optimal location (or split across locations) for every cart.
4. Make single-location merchants see zero friction: one auto-created location, transparent behavior.
5. Make multi-location merchants feel the benefit: correct rates, split shipments, per-origin labels.

---

## 2. Scope

### In scope

- New table `commerce_ship_from_locations` holding every merchant origin (warehouse, store, dropshipper, fulfillment center).
- CRUD functions for locations (create, update, archive, set default, activate/deactivate).
- Product-to-location mapping: a product (and optionally a variant) declares which locations can fulfill it.
- Variant-level override of the product-level mapping.
- Location selection algorithm: given a cart and a destination address, choose one location per cart line, then group lines into shipments per chosen location.
- Split-shipment math: when a cart's lines resolve to multiple locations, the cart becomes N shipments; rate calculation runs per shipment; totals sum.
- Admin list table, location editor, and bulk product-assignment UI at `/admin/commerce/settings/shipping/locations`.
- Migration of existing `commerce_shipping_profiles.shipFromAddress` and `integrations.shipping.shipFrom*` values into a single seeded "Primary Warehouse" location.
- Events emitted for create/update/delete/activate/deactivate.
- Role capabilities gated on shipping settings permissions.

### Out of scope (explicitly deferred)

- **Per-location inventory levels.** This PRD assumes the Inventory System owns the truth of "what is in stock where." We define the schema contract (`commerce_inventory_levels` keyed by location + product/variant) so Inventory System can adopt it, but we do not implement stock tracking here.
- **Real-time distance calculation via geocoding API.** The selection algorithm uses a rule-based priority order by default; distance-based optimization is a future enhancement that requires a geocoder choice (Mapbox, Google, etc.).
- **Split payment/checkout per shipment.** Cart totals may combine multiple shipment costs, but the customer pays one combined total at one checkout. The Order system fans out to per-location fulfillment records.
- **Store-pickup as a location type.** Pickup-in-store is a related concept but belongs to a separate "Pickup Locations" PRD (retail UX, time windows, staff notifications). This PRD models ship-from only.
- **Transfer orders between locations.** Merchants may want to move stock from WH-A to WH-B; that is the Inventory System's problem.

---

## 3. Dependencies

### Upstream (this system depends on)

- **Product Catalog (A2)** — source of products and variants that get mapped to locations. Product deletion must cascade to location mappings.
- **Inventory System (A5, deferred)** — stock levels per location gate whether a location can fulfill a line. Until inventory exists, the system treats every assigned location as "can fulfill."
- **Shipping Zones System (A6)** — a location can only ship to destinations covered by at least one of its active zone methods. Zones scope by destination, not origin, but origin still matters because the origin's configured zones define reachable destinations.
- **Settings System** — existing `integrations.shipping.shipFrom*` keys are read once during migration, then deprecated.

### Downstream (these systems depend on this)

- **Rate Calculation Pipeline (A7)** — must call the location selection algorithm before any rate call. Every rate request now carries an origin location ID.
- **Live Rate Providers (C1–C5)** — ShipStation, UPS, USPS, FedEx, DHL rate calls accept `shipFrom` address; that address now comes from the selected location, not from settings.
- **Labels System (D1)** — labels are purchased per shipment; the `shipFrom` on the label is the location's address.
- **Manifests System (D3)** — end-of-day manifests group shipments by origin location, not by merchant.
- **Checkout** — presents one shipping line per shipment if the cart splits; falls back to one shipping line if single-location.
- **Orders** — fulfillment records are split by location; each gets its own tracking, label, and status progression.

---

## 4. Schema

### New table: `commerce_ship_from_locations`

File: `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts`

```
commerce_ship_from_locations: defineTable({
  // Identity
  name: v.string(),                        // "Main Warehouse (OH)"
  code: v.string(),                        // "WH-OH-01" — merchant-defined unique code
  locationType: v.union(
    v.literal("warehouse"),
    v.literal("retail_store"),
    v.literal("dropshipper"),
    v.literal("fulfillment_center"),
    v.literal("other"),
  ),

  // Address
  address: v.object({
    contactName: v.string(),               // person/role, "Warehouse Manager"
    companyName: v.optional(v.string()),
    line1: v.string(),
    line2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    postalCode: v.string(),
    countryCode: v.string(),               // ISO-3166-1 alpha-2
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  }),

  // Optional geocode (nullable until a geocoder is wired)
  geocode: v.optional(v.object({
    lat: v.number(),
    lng: v.number(),
    accuracy: v.string(),                   // "rooftop" | "postal" | "city"
    geocodedAt: v.number(),
  })),

  // Behavior flags
  isActive: v.boolean(),                   // inactive = hidden from selection algorithm
  isDefault: v.boolean(),                  // exactly one location has this true
  isArchived: v.boolean(),                 // soft-deleted; never selected

  // Fulfillment hints
  timezone: v.string(),                    // "America/New_York"
  cutoffTime: v.optional(v.string()),      // "15:00" — orders after this ship next business day
  operatingDays: v.optional(v.array(v.number())), // [1,2,3,4,5] = Mon–Fri
  operatingHours: v.optional(v.object({
    open: v.string(),                      // "08:00"
    close: v.string(),                     // "17:00"
  })),
  handlingTimeDays: v.optional(v.number()),// days added to carrier transit time

  // Rate-shopping priority (lower = preferred when rules tie)
  priority: v.number(),                    // default 100

  // Provider account preference (optional)
  preferredProviderAccountIds: v.optional(v.array(v.id("shipping_provider_accounts"))),

  // Audit
  createdAt: v.number(),
  updatedAt: v.number(),
  createdByUserId: v.optional(v.id("users")),
  updatedByUserId: v.optional(v.id("users")),
})
  .index("by_active", ["isActive"])
  .index("by_default", ["isDefault"])
  .index("by_archived", ["isArchived"])
  .index("by_code", ["code"])
  .index("by_priority", ["priority"]),
```

### New table: `commerce_product_location_fulfillment`

Many-to-many mapping of products (and optional variants) to locations. A row says "this product-or-variant can ship from this location."

```
commerce_product_location_fulfillment: defineTable({
  productId: v.id("commerce_products"),
  variantId: v.optional(v.id("commerce_product_variants")),
  locationId: v.id("commerce_ship_from_locations"),

  // If variantId is null, the row is a product-level mapping and applies to every
  // variant that does not have its own mapping row.
  // If variantId is set, the row is a variant-level override.

  priority: v.optional(v.number()),        // per-mapping override of location priority
  enabled: v.boolean(),                    // false = explicit exclusion
  notes: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_product", ["productId"])
  .index("by_product_variant", ["productId", "variantId"])
  .index("by_location", ["locationId"])
  .index("by_product_location", ["productId", "locationId"])
  .index("by_variant_location", ["variantId", "locationId"]),
```

### Extension: `commerce_products` and `commerce_product_variants`

Add a fulfillment-mode flag (stored on the product) so we can distinguish "all locations" from "restricted to specific locations":

```
fulfillmentMode: v.union(
  v.literal("all_locations"),              // default: any active location can fulfill
  v.literal("restricted"),                 // use commerce_product_location_fulfillment rows
),
fulfillmentVariantOverrides: v.optional(v.boolean()), // true if any variant has its own mapping
```

Adding these fields is non-breaking (optional + default computed). Existing products become `"all_locations"` on migration.

### Extension: `commerce_shipping_profiles`

The `shipFromAddress` field is deprecated. It is left in the schema for one release cycle, written only during migration fallback, and removed in the follow-up PRD. Shipping profiles become **shipping-behavior profiles** (weight/dim units, default package, labeling defaults) and no longer carry an origin.

### Inventory contract (defined here, owned by Inventory System)

```
// OWNED BY INVENTORY SYSTEM — documented here for the integration contract
commerce_inventory_levels: defineTable({
  productId: v.id("commerce_products"),
  variantId: v.optional(v.id("commerce_product_variants")),
  locationId: v.id("commerce_ship_from_locations"),
  quantityOnHand: v.number(),
  quantityReserved: v.number(),
  quantityAvailable: v.number(),
  // ...
})
```

Until that table exists, the Ship-From Locations System treats "assigned to location" as a sufficient proxy for "can fulfill from location." When the table exists, selection filters by `quantityAvailable >= lineQuantity`.

### Settings deprecation

`integrations.shipping` fields `shipFromName`, `shipFromCompany`, `shipFromLine1`, `shipFromLine2`, `shipFromCity`, `shipFromState`, `shipFromPostalCode`, `shipFromCountryCode` are marked deprecated. They remain in the settings section for one release cycle to power the migration, then are removed. A new field `defaultLocationId: v.id("commerce_ship_from_locations")` replaces them.

---

## 5. Data Model

### Invariants

1. **Exactly one location has `isDefault: true`** at any time (across non-archived rows). Setting a new default atomically clears the old one.
2. **Archived locations never appear in selection.** Archiving is permanent; to "undo" an archive, create a new location.
3. **A product in `all_locations` mode ignores `commerce_product_location_fulfillment` rows.** Switching to `restricted` activates them.
4. **Variant-level rows win over product-level rows.** A variant has a mapping ⇒ the product-level mapping does not apply to that variant.
5. **`enabled: false` is an explicit exclusion**, used to carve out "this product ships from the 3 warehouses *except* LA."
6. **Codes are unique** across non-archived locations.

### Relationships

- Location → Products: many-to-many via `commerce_product_location_fulfillment`.
- Location → Variants: many-to-many via the same table, with `variantId` set.
- Location → Zones: indirect — a location is reachable to a destination if any of the configured `commerce_shipping_zones` covers the destination. Zones are merchant-global; per-location zone overrides are a future enhancement.
- Location → Provider Accounts: optional preference list; allows "WH-OH prefers UPS, WH-CA prefers USPS."
- Order → Location(s): an order is split into N order-fulfillments, one per selected location; defined in the Orders PRD.

### Location Selection Algorithm

Given:
- `cart`: ordered list of `(productId, variantId?, quantity)`
- `destination`: parsed shipping address

Output:
- `shipmentGroups`: list of `{ locationId, lines }` where every line in the cart appears in exactly one group.

Steps:

1. **Resolve candidates per line.** For each cart line, determine the set of locations that could fulfill it:
   - If `product.fulfillmentMode === "all_locations"`, candidates = all active, non-archived locations.
   - If `"restricted"`, candidates = locations in `commerce_product_location_fulfillment` where `enabled = true`, with variant overrides applied.

2. **Filter by reachability.** For each candidate, check that at least one active `commerce_shipping_zone` covers `destination.countryCode`/`state`/`postalCode`. Drop candidates with no zone coverage.

3. **Filter by stock (when Inventory exists).** For each candidate, require `quantityAvailable >= quantity`. Without Inventory System, this step is a no-op.

4. **Score candidates.** Apply scoring rules in order of decreasing weight:
   - **Merchant override rule** (highest): explicit rule "orders to state X use location Y" (optional rules table, future; not required for v1).
   - **Location priority**: lower numeric `priority` wins.
   - **Geographic proximity**: if both origin and destination have geocodes, haversine distance wins; otherwise skip.
   - **Default location tiebreaker**: if tied, `isDefault` wins.
   - **Lowest ID tiebreaker**: deterministic fallback.

5. **Group by location.** After each line has a chosen location, group lines that share a location. The number of distinct locations = number of shipments.

6. **Fallback when no candidate exists.** If any line has zero candidates after filters, the algorithm returns a structured error (not a thrown exception). The rate pipeline surfaces this as "We can't ship this item to your address" with the offending line identified. Checkout blocks.

7. **Single-location merchants short-circuit.** If the merchant has exactly one active location, steps 1–5 collapse to "every line ships from the one location" and the function returns immediately.

### Algorithmic complexity

Worst case: `O(lines × locations)` for candidate resolution, `O(lines × zones)` for reachability, `O(lines)` for scoring once candidates are filtered. For realistic caps (≤50 lines, ≤20 locations, ≤30 zones) this is sub-millisecond.

---

## 6. Functions / API

All functions live under `ConvexPress-Admin/packages/backend/convex/shipping/locations/`.

### `mutations.ts`

- `createLocation(input)` — creates a new location. Validates code uniqueness, sets `isActive` to true by default. If this is the first location and no default exists, also sets `isDefault: true`. Emits `shipping.location.created`. Requires capability `shipping.manage`.
- `updateLocation(locationId, patch)` — partial update. Cannot change `isDefault` to false directly (use `setDefaultLocation`). Emits `shipping.location.updated`.
- `archiveLocation(locationId)` — soft-delete. Blocks if location has open orders pending fulfillment; returns structured error listing the orders. Blocks if this is the default and another active location has not been promoted. Emits `shipping.location.deleted`.
- `setDefaultLocation(locationId)` — atomically clears the old default and sets the new one. Emits `shipping.location.updated` for both affected rows.
- `activateLocation(locationId)` — flips `isActive: true`. Emits `shipping.location.activated`.
- `deactivateLocation(locationId)` — flips `isActive: false`. Same guard as archive for open orders assigned to this location. Emits `shipping.location.deactivated`.
- `assignProductToLocations(productId, { mode, locationIds, variantOverrides? })` — writes product-level mappings. If `mode = "all_locations"`, deletes all existing rows. If `mode = "restricted"`, upserts the specified rows.
- `bulkAssignProducts({ productIds, mode, locationIds })` — batch version of the above for the admin bulk UI. Emits one aggregate event.
- `setVariantLocationOverride(productId, variantId, { locationIds })` — writes a variant-level override row.
- `clearVariantLocationOverride(productId, variantId)` — removes variant-level rows; variant falls back to product-level.

### `queries.ts`

- `listLocations({ includeArchived?, includeInactive? })` — returns all locations with counts of mapped products and open orders.
- `getLocation(locationId)` — full location record plus derived "products assigned" count.
- `getDefaultLocation()` — returns the single default or null.
- `listLocationsForProduct(productId)` — returns which locations can fulfill a product (expanded: product mode + active variant overrides merged).
- `listProductsAtLocation(locationId, { paginationOpts })` — list-table feed for the "products at this location" view.

### `selection.ts` (internal)

- `internal.shipping.locations.selection.selectForCart({ cartLines, destination })` — the algorithm. Returns `shipmentGroups` or a structured error. Not client-callable.
- `internal.shipping.locations.selection.explainSelection({ cartLines, destination })` — debugging endpoint that returns per-line candidate sets, filter results, and scoring breakdown. Used by the admin "Why this location?" diagnostic tool.

### `migrations.ts`

- `internal.shipping.locations.migrations.seedFromLegacySettings()` — reads `integrations.shipping` shipFrom fields and any `commerce_shipping_profiles.shipFromAddress`, creates one "Primary Warehouse" location, flags it default, updates all existing products to `fulfillmentMode: "all_locations"`, writes `defaultLocationId` to settings. Idempotent. Logged via audit log.

### `validators.ts`

Shared argument validators for address, location-create input, product-assignment input.

---

## 7. Admin UX

Route root: `/admin/commerce/settings/shipping/locations`

### List view — `.../locations`

File: `apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.locations.tsx`

WordPress-style list table. Columns:

- Name (link to editor) + location type badge
- Code
- Address (city, state, country)
- Products assigned (count, link filtered to that location)
- Open orders (count)
- Status: Active / Inactive / Archived
- Default badge (if default)
- Actions: Edit, Set Default, Activate/Deactivate, Archive

Header:
- "Ship-From Locations" title
- "Add Location" primary button → `.../locations/new`
- Filter: status (All / Active / Inactive / Archived), type
- Search: name, code, city, postal

Empty state: if zero non-archived locations, show migration CTA "Import from legacy shipping settings" which runs the seeding migration.

### Editor — `.../locations/new` and `.../locations/:locationId`

Full-page editor (never a modal — per CLAUDE.md, content management is always full-page).

Tabs or sections on a single page:

1. **General** — name, code, type, priority, timezone.
2. **Address** — full address form with country-aware state/postal validation.
3. **Operations** — cutoff time, operating days, hours, handling time.
4. **Providers** — preferred provider accounts (multiselect from connected `shipping_provider_accounts`).
5. **Products** — searchable list of products assigned to this location, with "Add products" action. Supports bulk unassign.
6. **Danger Zone** — deactivate, archive, set default.

Publish metabox (right column) — `isActive`, `isDefault`, "Save", "Save & Duplicate".

### Bulk product assignment — `/admin/commerce/products` (existing)

Add a bulk action to the products list table: "Set fulfillment locations…" which opens a full-page bulk editor at `/admin/commerce/products/bulk/locations` with:

- Selected product list (chip display)
- Radio: "All locations" vs "Restricted to specific locations"
- If restricted: checklist of locations
- "Apply to variants" options (inherit vs per-variant)
- "Apply" button → `bulkAssignProducts` mutation.

### Product editor — `.../products/:productId/edit`

Add a "Fulfillment" metabox to the existing tabbed product editor. Contents:

- Mode radio: All / Restricted.
- If restricted: checklist of active locations.
- "Customize per variant" toggle → opens a per-variant location override subpanel.
- Read-only display of which locations have stock (when Inventory System lands).

### Diagnostics view — `.../locations/diagnostics`

Internal debugging page for admins:
- Input a fake shipping address + cart contents (paste JSON or pick a recent cart).
- Click "Run selection" → see the step-by-step algorithm output from `explainSelection`.
- Useful for answering "Why did WH-CA get picked instead of WH-OH?"

### Breadcrumbs and nav

Sidebar entry under **Commerce → Settings → Shipping → Locations** (alongside Zones, Packages, Classes). Breadcrumbs reflect the same hierarchy.

---

## 8. Merchant Workflow — "How do I add a second warehouse in Ohio and route east-coast orders through it?"

1. **Open Locations.** Merchant clicks Commerce → Settings → Shipping → Locations. List shows the default Primary Warehouse (California).
2. **Add location.** Clicks "Add Location." Fills out:
   - Name: "Ohio Warehouse"
   - Code: `WH-OH-01`
   - Type: Warehouse
   - Address: 100 Industrial Pkwy, Columbus, OH 43215, US
   - Timezone: America/New_York
   - Cutoff: 15:00
   - Operating days: Mon–Fri
   - Priority: 50 (lower than California's 100 so Ohio wins ties)
3. **Save.** Location is created with `isActive: true`, `isDefault: false`. Event fires.
4. **Assign products.** Opens the new Ohio location's Products tab, clicks "Add products," searches for the SKUs stocked in Ohio, selects them, applies. Each selected product's fulfillment mode flips to `"restricted"` and gets rows for both CA and OH (unless the merchant deselects CA).
5. **Verify routing.** Opens Diagnostics view. Enters a test address in New York and the cart `[{productId: sku-123, qty: 1}]`. Clicks Run Selection. Sees:
   - Candidates: CA, OH
   - Reachability: both reach NY
   - Stock: (not checked until Inventory lands)
   - Score: OH priority 50 < CA priority 100, OH wins.
   - Result: 1 shipment from OH.
6. **Done.** All east-coast-ish orders now quote and fulfill from Ohio. The merchant did not have to touch checkout, rate rules, or product pricing.

### Alternate workflow — adding a dropshipper

1. Create a location with type `dropshipper`, its own address, priority 200 (lower preference unless only it can fulfill).
2. For each dropshipped SKU, open the product editor → Fulfillment metabox → Restricted → check only the dropshipper location.
3. When a cart contains a dropshipped SKU plus an in-house SKU, the cart automatically splits into two shipments at rate time.

### Alternate workflow — closing a warehouse

1. Open the location. Click Archive.
2. System checks open orders assigned to this location. If any exist, the archive is blocked with a list of order IDs and a link to reassign or fulfill them first.
3. Once orders are clear, archive succeeds. All product mappings pointing only to this location require remediation: the editor surfaces a "these products have no active location" warning and links to a bulk reassignment screen.

---

## 9. Storefront UX

The storefront generally does not expose location identity to the customer, but several touch points benefit from it:

- **Estimated delivery date on PDP**: if a product is mapped to a single location and the customer has a known shipping address (saved or geolocated), the PDP can show "Ships from Columbus, OH — arrives in 2–4 days." Pulled from the selection algorithm + carrier transit estimate.
- **Cart drawer**: if the cart splits across locations, the cart drawer shows a line "This order will ship in 2 packages" with a small disclosure. No location names by default — merchants enable verbose labels via a setting.
- **Checkout shipping step**: when the cart splits, the shipping method selector shows a group per shipment ("Package 1 of 2 — from Ohio" / "Package 2 of 2 — from California") with its own rate options, summed into the cart total.
- **Order confirmation email**: lists shipments separately with origin city and expected tracking.

All storefront exposure of location details is gated by a merchant setting `integrations.shipping.exposeOriginToCustomers: boolean`, defaulted false. Merchants that don't want customers to see "Ships from California" (e.g., white-label dropship scenarios) can keep it off.

---

## 10. Edge Cases

### E1. Product's only location can't ship to destination

**Scenario:** Cart has SKU-A, mapped only to WH-CA. Customer ships to Germany. WH-CA's active zones don't cover Germany.

**Behavior:** Selection returns a structured error `LOCATION_UNREACHABLE` with the offending line. Rate pipeline surfaces "We can't ship this item to Germany" at the cart/checkout level. Checkout is blocked until the line is removed or the destination changed.

### E2. Cart lines resolve to multiple locations

**Scenario:** Cart has SKU-A (only at WH-OH) and SKU-B (only at WH-CA). Customer in Texas.

**Behavior:** Selection returns two shipment groups. Rate pipeline runs twice (once per group) with each group's origin address. Checkout displays two shipping rate selectors, each independently chosen by the customer. Total shipping = sum. Order creates two fulfillment records with independent tracking.

### E3. Location marked inactive mid-session

**Scenario:** Customer is in checkout with a quoted rate. An admin deactivates the location that rate came from.

**Behavior:** On checkout submit, the rate pipeline revalidates selection. If the previously selected location is now inactive, re-run selection, re-quote rates, and require the customer to re-confirm the shipping method. Quoted-rate cache (`commerce_shipping_rate_quotes`) is invalidated for any quote whose origin is inactive.

### E4. Closing a location with open orders

**Scenario:** Merchant archives WH-CA but 42 orders are still in "awaiting fulfillment" status assigned to WH-CA.

**Behavior:** Archive is blocked. Merchant must first: (a) mark orders fulfilled, or (b) bulk-reassign orders to another location. The Orders system exposes a bulk "Reassign origin location" action for this case.

### E5. Single-location merchant

**Scenario:** Merchant has never added a second location. Primary Warehouse is the only row.

**Behavior:** Every cart ships from Primary Warehouse without the algorithm running meaningful work. The admin never sees multi-location UI (the Products list's "Fulfillment locations" column is hidden when `locationCount <= 1`). Performance cost is effectively zero.

### E6. Product with `all_locations` mode and no active locations

**Scenario:** Misconfiguration — merchant archived every location.

**Behavior:** Selection returns `NO_ACTIVE_LOCATION` error. Rate pipeline fails gracefully. Admin dashboard shows a critical warning ("Your store has no active ship-from locations; checkout is broken"). Prevention: `archiveLocation` refuses to archive the last active location without an explicit override.

### E7. Variant override contradicts product mode

**Scenario:** Product mode is `all_locations` but a variant has explicit override rows.

**Behavior:** Variant rows are ignored while product is in `all_locations` mode. On switching the product to `restricted`, the variant rows become effective. Admin UI warns the merchant on mode-switch: "This product has 3 variants with specific location overrides. They'll take effect now."

### E8. Two locations tie on every scoring rule

**Scenario:** Two locations, same priority, no geocodes, neither is default.

**Behavior:** Deterministic tiebreaker: lowest location ID wins. Documented in selection algorithm. Merchants who care should set priorities.

### E9. Cart-split produces more shipments than merchant permits

**Scenario:** Merchant sets `maxShipmentsPerOrder: 2` (a future setting); cart splits into 3.

**Behavior:** Out of scope for v1. Documented as a future enhancement. For v1, there is no limit on shipment count.

### E10. Location address is invalid

**Scenario:** Merchant mistypes a postal code, or the address fails carrier validation.

**Behavior:** Save is blocked with validation error. Rate calls with an invalid origin are refused by the carrier; we surface the carrier error verbatim plus a "Fix this location's address" action.

### E11. Product deleted while assigned to locations

**Scenario:** Product is hard-deleted from the catalog.

**Behavior:** Cascade deletion of rows in `commerce_product_location_fulfillment` where `productId = deletedId`. Handled by a hook in the Post/Product System; failure logged to audit.

### E12. Currency or country change in store settings

**Scenario:** Merchant relocates the business and changes `integrations.shipping.defaultCountryCode` from US to CA.

**Behavior:** Does not automatically move any location. Locations keep their own country codes. Rate pipeline honors per-location origin. Merchant must explicitly edit or add locations.

### E13. Migration runs twice

**Scenario:** `seedFromLegacySettings` invoked after the default location already exists.

**Behavior:** Idempotent — detects existing default and no-ops. Audit log records "migration already applied; skipped."

---

## 11. Testing Requirements

### Unit tests — selection algorithm

- Single location, single line → single shipment from that location.
- Two locations, product mapped to both, priorities differ → lower priority wins.
- Two locations, product mapped to only one → that one wins.
- Two locations, product mapped to both, one can't reach destination → reachable one wins.
- Two locations, product mapped to both, both reach destination, both have stock, tie on priority → default location wins.
- Cart with two lines mapped to two different locations → two shipment groups.
- Product in `all_locations` mode → candidates = all active locations.
- Product switched to `restricted` with no location rows → `NO_CANDIDATE` error.
- Variant override overrides product-level mapping.
- Inactive location excluded from candidates.
- Archived location excluded from candidates.

### Unit tests — mutations

- Creating the first location auto-sets `isDefault: true`.
- Creating a second location does not change the default.
- Setting a new default clears the old default atomically.
- Archive blocks when open orders reference the location.
- Archive blocks when this is the last active location.
- Deactivate blocks on open orders.
- Bulk-assign writes N mapping rows and emits one aggregate event.

### Integration tests

- End-to-end: create two locations, assign products, build a cart that splits, run rate pipeline, assert two `rate_quotes` rows written with distinct origins.
- Migration test: seed legacy `integrations.shipping` values, run `seedFromLegacySettings`, assert one location exists, flagged default, with those address values.
- Legacy profile with `shipFromAddress` migrates into the same seeded location (not a duplicate).

### UI tests (Playwright)

- Locations list renders, shows default badge, status filters work.
- Add Location form validates required fields and country-specific postal formats.
- Product editor Fulfillment metabox saves mode change and checklist state.
- Bulk product assignment applies to 10+ products and reflects on re-open.
- Diagnostics view returns the expected algorithm output for a manually-constructed cart.

### Performance tests

- Selection algorithm executes in <5ms for cart of 50 lines against 20 locations and 30 zones.
- Locations list query returns in <100ms for stores with 50 locations.
- Bulk product assignment for 1000 products completes within 10 seconds (may batch).

### Regression guards

- Existing single-location stores (post-migration) produce identical rates and labels to pre-migration baseline for a fixed test cart.
- No rate call is ever made without an origin location ID; enforced by a unit test that asserts every call site in the rate pipeline passes one.

---

## 12. Success Criteria

1. **Multi-location capable.** A merchant can define ≥2 ship-from locations and a cart correctly routes lines to the right origin.
2. **Single-location transparent.** Existing single-origin stores continue to function with zero merchant action beyond the one-time migration.
3. **Split shipments priced correctly.** A two-location cart generates two rate quotes and the customer pays the sum.
4. **Orders fulfill per location.** An order with two shipments produces two order-fulfillment records, each with its own tracking and label.
5. **No rate call without an origin.** Every carrier API invocation carries a specific location address, not the legacy settings block.
6. **Migration is non-destructive.** Running the migration produces a seeded location that exactly matches the merchant's prior settings and leaves legacy fields intact for one release cycle.
7. **Algorithm is explainable.** The diagnostics view returns a step-by-step trace for any cart + destination.
8. **Admin UI is WordPress-modeled.** List table + full-page editor, no modals for content management.
9. **Events fire reliably.** Every create/update/archive/activate/deactivate emits the documented event with the expected payload.
10. **Performance meets bar.** Selection algorithm runs sub-5ms for realistic carts.

---

## 13. Roles & Capabilities

New capabilities, registered with the Role & Capability System:

- `shipping.locations.read` — view locations and mappings.
- `shipping.locations.create` — create new locations.
- `shipping.locations.update` — update existing locations.
- `shipping.locations.archive` — archive a location.
- `shipping.locations.set_default` — change the default location.
- `shipping.locations.assign_products` — write product-to-location mappings.
- `shipping.locations.bulk_assign` — run bulk product assignment.
- `shipping.locations.diagnose` — use the diagnostics/explain tool.

Default role grants:

| Capability | Administrator | Editor | Author | Contributor | Subscriber |
|---|---|---|---|---|---|
| `shipping.locations.read` | yes | yes | no | no | no |
| `shipping.locations.create` | yes | no | no | no | no |
| `shipping.locations.update` | yes | no | no | no | no |
| `shipping.locations.archive` | yes | no | no | no | no |
| `shipping.locations.set_default` | yes | no | no | no | no |
| `shipping.locations.assign_products` | yes | yes | no | no | no |
| `shipping.locations.bulk_assign` | yes | yes | no | no | no |
| `shipping.locations.diagnose` | yes | yes | no | no | no |

Editors can see locations and manage product-to-location assignments (they work with catalog day-to-day) but cannot create, edit, or archive locations themselves — that is an administrator action, aligned with other shipping-infrastructure controls.

---

## 14. Events Fired

All events follow the Event Dispatcher System's naming convention and are registered in the Airtable event table.

| Event | Payload | Fired when |
|---|---|---|
| `shipping.location.created` | `{ locationId, code, name, locationType, isDefault, actorUserId }` | `createLocation` succeeds |
| `shipping.location.updated` | `{ locationId, changedFields, actorUserId }` | `updateLocation` or `setDefaultLocation` succeeds |
| `shipping.location.deleted` | `{ locationId, code, name, actorUserId }` | `archiveLocation` succeeds |
| `shipping.location.activated` | `{ locationId, actorUserId }` | `activateLocation` succeeds |
| `shipping.location.deactivated` | `{ locationId, actorUserId }` | `deactivateLocation` succeeds |
| `shipping.location.default_changed` | `{ previousLocationId, newLocationId, actorUserId }` | `setDefaultLocation` succeeds |
| `shipping.location.product_assignment_changed` | `{ productId, mode, locationIds, variantScope, actorUserId }` | `assignProductToLocations` or `setVariantLocationOverride` succeeds |
| `shipping.location.bulk_assignment_completed` | `{ productCount, mode, locationIds, actorUserId }` | `bulkAssignProducts` succeeds |
| `shipping.location.migration_completed` | `{ seededLocationId, sourceLegacyAddress, productsUpdated }` | `seedFromLegacySettings` succeeds |

Downstream subscribers:

- **Audit Log System** — subscribes to all events for admin activity trail.
- **Rate Cache** — subscribes to `location.updated`, `activated`, `deactivated`, `deleted` to invalidate `commerce_shipping_rate_quotes` rows keyed by the location.
- **Inventory System** — subscribes to `location.created` to initialize zero-quantity inventory rows per existing product.
- **Site Notifications** — optional merchant notification on `location.created` ("New ship-from location added").

---

## 15. References

### Internal references

- `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` — current single-origin schema (replaced by this PRD).
- `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts` — `SHIPPING_INTEGRATION_DEFAULTS` containing the legacy `shipFrom*` fields (deprecated by this PRD).
- `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts` — product schema, extended with `fulfillmentMode`.
- `specs/ConvexPress/systems/shipping-zones-system/PRD.md` — zones scope destinations and couple to locations for reachability.
- `specs/ConvexPress/systems/shipping-packages-system/PRD.md` — packages remain merchant-global; a future enhancement may scope packages per location.
- `specs/ConvexPress/systems/shipping-classes-system/PRD.md` — classes are orthogonal to locations.
- PRD A7 — Rate Calculation Pipeline (consumer of selection algorithm).
- PRDs C1–C5 — ShipStation, UPS, USPS, FedEx, DHL rate providers.
- PRDs D1, D3 — Labels and Manifests.

### External references (prior art)

- **Shopify Locations** — https://help.shopify.com/en/manual/locations — multi-location inventory, per-location fulfillment priority, shipping from specific locations, location-based tax rates. Shopify's `primary_location_id` and per-location inventory model are the closest analog; we mirror the priority-based selection and the cart-split behavior.
- **WooCommerce Multi-Warehouse extensions** (e.g., "WooCommerce Multi-Warehouse & Store Locator," "Multi-Vendor Marketplace" partial overlap) — none is built in. Third-party plugins vary in quality; most handle location-per-product mapping but few handle split shipments cleanly. We improve on this by making split shipments a first-class flow rather than an afterthought.
- **BigCommerce Multi-Location Inventory** — https://support.bigcommerce.com/s/article/Multi-Location-Inventory — per-location inventory, transfer orders, location-scoped fulfillment. Their routing algorithm considers inventory availability and distance; we adopt the same pattern but defer geocoded distance to a future iteration.
- **ShipStation Warehouses** — https://help.shipstation.com/hc/en-us/articles/360025870311-Ship-From-Locations — ShipStation itself supports multiple ship-from addresses and lets you choose one per label. Our model aligns so that when merchants have ShipStation connected, each ConvexPress location can optionally map to a ShipStation ship-from address (stored as `preferredProviderAccountIds` context plus an optional provider-specific mapping table, future work).
- **Amazon Multi-Channel Fulfillment / FBA** — conceptually similar: Amazon chooses the closest fulfillment center. We borrow the "merchant defines; system selects" split.

### Design notes on selection rule ordering

The chosen rule order (merchant override → priority → proximity → default → lowest ID) mirrors Shopify's published logic with one deviation: we place explicit priority above proximity. Reasoning: merchants often have contractual obligations (e.g., "dropshipper handles only SKU-X") that must trump geography. Merchants who want geography to dominate set every location to the same priority and rely on the proximity step. This keeps the default behavior predictable and the advanced behavior opt-in.
