# Shipping Packages & Box Templates System — PRD A3

**Status:** Draft
**Layer:** A — Core Infrastructure
**PRD ID:** A3
**System Slug:** `shipping-packages-system`
**Owner:** Commerce / Shipping
**Depends On:** A4 (Ship-From Locations)
**Consumers:** A7 (Rate Calculation Pipeline), B3 (Dimensional Shipping Method), B10 (Live Rate Method Base), C1–C5 (Carrier Live Rate Providers: USPS, UPS, FedEx, DHL, ShipStation), D1 (Labels System)

---

## 1. Context & Intent

### 1.1 Why This System Exists

ConvexPress must quote, purchase, and print shipping labels against real-world carrier APIs. Every carrier API — USPS, UPS, FedEx, DHL, ShipStation — requires the sender to describe the **physical package** being shipped. That description always includes three things:

1. **Outer dimensions** — length, width, height (inches or centimeters)
2. **Tare weight** — the empty weight of the box itself, which is added to the contents' weight to produce total shipment weight
3. **Package identity** — either a merchant-defined custom box or a carrier-native package code (for example, USPS `FLAT_RATE_ENVELOPE` or UPS `02` "Customer Supplied Package")

The current implementation in `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` hardcodes placeholder dimensions in two places:

- **DHL rates path (~line 1320):** package dimensions are hardcoded to `20 × 15 × 10` cm regardless of what is in the cart
- **USPS rates path (~line 861):** package dimensions are hardcoded to `0.1 × 0.1 × 0.1` inches (effectively "no dimensions given"), which forces USPS to return the widest possible rate band and often triggers API validation warnings

Both hardcodes produce wrong rates. USPS Priority Mail rates vary by up to 40% between a `4×4×4` and a `12×12×12` box to the same ZIP. Dimensional ("DIM") weight pricing for UPS and FedEx Ground is entirely derived from package dimensions — without dimensions the carrier returns the actual weight rate, which underquotes heavy-light items (pillows, boxed inventory) and overquotes dense-small items.

This PRD defines the **Shipping Packages & Box Templates System** — a reusable library of package definitions that eliminates the hardcodes and provides the foundation for (a) Dimensional Shipping (B3), (b) Live Rate carrier API calls (C1–C5), and (c) the "fit smallest box" bin-packing algorithm used during rate calculation.

### 1.2 Design Intent

A **package** in this system is a pure template. It has no stock, no location, no lifecycle — it describes a physical container merchants own (or the carrier provides) so the rate engine can say "this cart fits in a Medium Box (12×9×4, tare 8 oz) and therefore the billable weight is X and the DIM weight is Y."

Three population sources exist:

1. **Custom packages** — merchant-defined boxes from inventory (e.g., "Medium Shipper 12×9×4", "Poster Tube 36×3×3")
2. **Carrier-native packages** — seeded from a reference catalog: USPS Flat Rate family, UPS Express Boxes, FedEx One Rate packaging, DHL Express envelope/boxes
3. **Imported from ShipStation** — for merchants already using ShipStation, we can GET `/accounts/listtags` and `/carriers/listpackages` and import named packages verbatim so label purchases use the same package names the merchant already trained their warehouse on

Packages are opinionated but pluggable: every cart item either (a) links to a package via its `shippingClassId` → `preferredPackageId`, (b) links to a package via `product.preferredPackageId`, (c) is marked "ships in own box" and bypasses packing, or (d) falls through to the ship-from location's default package.

### 1.3 Strategic Positioning

This is Layer A foundational infrastructure. Nothing downstream works correctly without it:

- **B3 (Dimensional Shipping)** cannot compute DIM weight (`L × W × H / divisor`) without a package
- **B10/C1–C5 (Live Rates)** cannot call carrier APIs without package dimensions; hardcoded placeholders produce wrong quotes
- **D1 (Labels)** cannot purchase a label without telling the carrier what box the shipment is in
- **A7 (Rate Calculation Pipeline)** is the orchestrator that invokes bin-packing across this system and feeds the result to every method

Shipping accuracy is a **trust feature**. A merchant who ships a $4 item and charges the customer $12 shipping because we guessed the box wrong will lose that customer. A merchant who ships a $4 item and charges $6 because they paid the actual rate keeps that customer and does not eat the difference. This system is the first place inaccurate rates are prevented.

---

## 2. Scope

### 2.1 In-Scope

- Schema extensions to `commerce_shipping_packages` to support:
  - `packageSource` discriminator: `custom` | `shipstation` | `ups` | `usps` | `fedex` | `dhl`
  - Carrier-native package codes (e.g., `USPS_FLAT_RATE_ENVELOPE`, `UPS_EXPRESS_BOX_SMALL`)
  - Per-location `isDefault` designation
  - Tare weight field (`weight` already exists; clarified as tare)
  - Link to a ship-from location (`shipFromLocationId`, optional)
  - Dimension unit and weight unit on the package itself (inherits from location/profile but can override)
- CRUD mutations and queries for packages
- Seed data for carrier-native package catalog (USPS, UPS, FedEx, DHL)
- ShipStation package import action
- Bin-packing helper (`binPacking.ts`) — first-fit decreasing volume-based algorithm with multi-box splitting
- Product-to-package linking via `product.preferredPackageId` and `shippingClass.preferredPackageId`
- Admin UI at `/admin/commerce/settings/shipping/packages` (list + editor + import)
- Events fired on create / update / delete
- Replacement of the two hardcoded dimensions in `shipping/actions.ts` with bin-packing results

### 2.2 Out-of-Scope

- **Irregular-shape packing** (spheres, cylinders, L-shaped items). Algorithm treats all items as axis-aligned rectangular prisms.
- **Multi-axis rotation optimization** beyond simple fit-check. We do not run 3D bin-packing with rotation; we do volume-fit + longest-side-fit.
- **Real-time inventory tracking of packaging materials.** The system does not know how many Medium Boxes are on the shelf. That belongs to an inventory system.
- **Package recommendation AI.** We do not ML-rank which box is "best"; we use deterministic first-fit decreasing.
- **Poly mailers and flex packaging with variable dimensions.** Treated as fixed-dim approximations. Merchant enters the inflated/packed dimensions.
- **Dunnage and fill weight estimation.** Merchant may add a manual "padding allowance" to the package's tare weight; we do not compute bubble wrap volume.
- **Customs/dimensional declarations for international.** Customs data lives on the order/line; this system provides dimensions only.
- **Label purchase** — D1 owns that. This system only provides the package definition D1 passes to the carrier.

---

## 3. Dependencies

### 3.1 Upstream (this system depends on)

- **A4 — Ship-From Locations** — every package may be scoped to one ship-from location for "the default box at this warehouse" behavior. When a merchant runs two warehouses (US east and US west), each can have its own default package. A4 must ship before or alongside A3; if A4 is delayed, `shipFromLocationId` on package is nullable and system-wide default is used.

### 3.2 Downstream (consumers of this system)

- **A7 — Rate Calculation Pipeline** — orchestrates the bin-pack call, feeds `packedBoxes[]` to every registered method's `quote()` function.
- **B3 — Dimensional Shipping Method** — reads packed box dimensions to compute DIM weight `(L × W × H) / divisor`.
- **B10 — Live Rate Method Base** — the shared machinery under C1–C5. Maps packed box to carrier request payload.
- **C1 — USPS Live Rates** — maps `packageSource=usps` to USPS `MailClass`/`PackageType` enum; maps `packageSource=custom` to `RECTANGULAR` with explicit dimensions.
- **C2 — UPS Live Rates** — maps `packageSource=ups` to UPS `PackagingType` codes (`01` UPS Letter, `02` Customer Supplied, `2a` Express Box Small, etc.).
- **C3 — FedEx Live Rates** — maps `packageSource=fedex` to FedEx `PackagingType` (`FEDEX_ENVELOPE`, `FEDEX_BOX`, `FEDEX_SMALL_BOX`, `YOUR_PACKAGING`).
- **C4 — DHL Live Rates** — replaces the `20×15×10` hardcode with packed box dimensions.
- **C5 — ShipStation Live Rates** — passes package `code` directly to ShipStation; ShipStation resolves it against the merchant's carrier accounts.
- **D1 — Labels System** — when purchasing a label, references the package by `_id` so the purchased label's package matches the quoted package exactly.

### 3.3 Cross-Cutting

- **Settings System** — stores merchant-level dimension/weight unit preference (`in`/`cm`, `oz`/`lb`/`g`/`kg`)
- **Event Dispatcher** — fires lifecycle events
- **Role & Capability System** — `shipping.package.manage` capability gates all mutations

---

## 4. Schema

### 4.1 Existing Baseline (to extend)

The existing `commerce_shipping_packages` table in `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` (lines 115–131):

```
commerce_shipping_packages:
  code: string
  label: string
  packageType: string
  weight: optional<number>
  dimensions: optional<{ length, width, height }>
  carrierCode: optional<string>
  provider: optional<shippingProviderValidator>
  createdAt: number
  updatedAt: number
  index: by_code [code]
```

### 4.2 Extended Schema

Add the following fields and indices (all new fields must be `optional` for forward compatibility so existing rows read without migration):

**Fields added:**

- `packageSource: v.union(v.literal("custom"), v.literal("shipstation"), v.literal("ups"), v.literal("usps"), v.literal("fedex"), v.literal("dhl"))` — discriminator for where this package originated and how its code is interpreted by carrier APIs. Required on all new rows. Backfill existing rows to `"custom"` if `provider` is null, otherwise map `provider` → source.
- `carrierPackageCode: optional<string>` — the carrier's own native code (e.g., `FLAT_RATE_ENVELOPE`, `UPS_EXPRESS_BOX_SMALL`, `FEDEX_SMALL_BOX`, `DHL_EXPRESS_ENVELOPE`). Null for `packageSource=custom`.
- `shipFromLocationId: optional<v.id("commerce_ship_from_locations")>` — if set, this package is scoped to one location. If null, the package is globally available.
- `isDefault: optional<boolean>` — when true, this is the default package for the scope (per-location if `shipFromLocationId` set, else global). Exactly one default per scope is enforced in the mutation.
- `dimensionUnit: v.union(v.literal("in"), v.literal("cm"))` — required; describes how `dimensions.length/width/height` are interpreted. Inherits from ship-from location at creation but can be overridden.
- `weightUnit: v.union(v.literal("oz"), v.literal("lb"), v.literal("g"), v.literal("kg"))` — required; describes how `weight` (tare) is interpreted.
- `tareWeight: optional<number>` — clarified alias for `weight`. The empty weight of the box. If both `weight` and `tareWeight` exist (legacy rows), `tareWeight` wins.
- `maxLoadWeight: optional<number>` — optional maximum weight the box can safely hold in the configured `weightUnit`. Bin-packer respects this if set.
- `innerDimensions: optional<{ length, width, height }>` — optional usable internal dimensions. If absent, `dimensions` are used as both outer and inner with a fixed safety shrink (see §5.3).
- `shipStationPackageId: optional<string>` — when `packageSource=shipstation`, the ShipStation `packageId` used for label purchase.
- `shipStationCarrierCode: optional<string>` — when `packageSource=shipstation`, the ShipStation carrier the package belongs to.
- `isArchived: optional<boolean>` — soft-delete. Archived packages are hidden from selectors but retained for historical label references.
- `notes: optional<string>` — free-form merchant notes ("bulk-buy from Uline item #S-123").
- `sortOrder: optional<number>` — admin list ordering.

**Indices added:**

- `by_source_location` on `[packageSource, shipFromLocationId]`
- `by_default_scope` on `[shipFromLocationId, isDefault]`
- `by_carrier_code` on `[packageSource, carrierPackageCode]`
- `by_archived` on `[isArchived]`

**Migration note:** all additions are `optional`. A one-time migration script fills `packageSource` on existing rows based on current `provider` field mapping; this is a light migration that the Convex Deployment Expert runs.

### 4.3 Related Schema Touches

On `commerce_products`:

- Add `preferredPackageId: optional<v.id("commerce_shipping_packages"))` — per-product override.
- Add `shipsInOwnBox: optional<boolean>` — when true, the product's own dimensions are the shipment dimensions and bin-packing is skipped for this item (monitors, furniture, anything already boxed by the manufacturer).

On `commerce_shipping_classes` (PRD reference — defined in Shipping Classes System):

- Add `preferredPackageId: optional<v.id("commerce_shipping_packages"))` — class-level override ("all Electronics ship in a Medium Box unless product overrides").

Resolution order in bin-packer: `product.preferredPackageId` → `shippingClass.preferredPackageId` → ship-from location default → global default.

---

## 5. Data Model

### 5.1 Package Identity Semantics

The `(packageSource, carrierPackageCode)` tuple is the canonical identity for carrier-native packages. For custom packages, `_id` is the identity and `code` is a merchant-visible slug (e.g., `medium-shipper`) unique across all packages.

### 5.2 Product-to-Package Linking

Four resolution layers, evaluated in order:

1. **Product-level override.** If `product.preferredPackageId` is set, that package is used for the product regardless of class.
2. **Shipping class default.** If the product's `shippingClass.preferredPackageId` is set, that package is used.
3. **Ship-from location default.** The `isDefault=true` package scoped to the cart's ship-from location.
4. **Global default.** The `isDefault=true` package with `shipFromLocationId=null`.

If none of the above exist, the rate calculation pipeline (A7) returns a `NO_PACKAGE_CONFIGURED` error and the cart cannot be quoted. The admin UI surfaces this as a blocking setup warning on the shipping dashboard.

### 5.3 Bin-Packing Algorithm Overview

The bin-packer is a helper in `convex/shipping/helpers/binPacking.ts`. It runs during rate calculation (A7). Input: an array of cart items with per-item `{ length, width, height, weight, quantity, preferredPackageId?, shipsInOwnBox? }`. Output: an array of **packed boxes** `{ packageId, contents: ItemRef[], totalWeight, outerDimensions, fillEfficiency }`.

**Algorithm: First-Fit Decreasing by Volume (FFD-V)**

1. **Partition items** into three buckets:
   - `ownBox[]` — items with `shipsInOwnBox=true`. Each becomes its own packed box using the product's own dimensions; tare weight 0.
   - `preferred[]` — items with a resolved `preferredPackageId` (from product or class). Grouped by `preferredPackageId`.
   - `general[]` — everything else, uses ship-from location default or global default package.

2. **Expand quantities.** An item with `quantity=3` becomes three packing units. Each unit's dimensions are the item's own (not cubed volume across quantity).

3. **Sort descending by volume.** For each bucket, sort packing units by `length × width × height` descending. FFD starts placing the biggest items first; empirically this gives near-optimal fill on e-commerce carts.

4. **Place into boxes.** For each bucket:
   - Pop the largest remaining unit.
   - Check every currently open box: does the unit fit dimensionally (longest side of unit ≤ longest inner side of box, AND remaining volume ≥ unit volume, AND `currentWeight + unitWeight ≤ maxLoadWeight` if set)?
   - If yes, place it; decrement remaining volume; increment `currentWeight`.
   - If no, open a new box of the bucket's assigned package template.
   - Repeat until bucket is empty.

5. **Apply safety shrink.** Inner box dimensions default to `outer × 0.95` (5% safety margin for walls, dunnage, tape) if `innerDimensions` is not explicitly set.

6. **Add tare weight.** Each packed box's `totalWeight = Σ(itemWeights) + package.tareWeight`.

7. **Compute fillEfficiency.** `Σ(itemVolumes) / boxInnerVolume`. Emitted for analytics; not used in rate calculation.

**Longest-side check.** We reject a placement if `max(unitL, unitU, unitH) > max(innerL, innerW, innerH)`. This catches the obvious "36-inch poster won't fit in a 12-inch box" case without running full 3D packing.

**Multi-box splitting.** If no single package template in the bucket can hold the entire set, FFD naturally opens multiple boxes of the same template. Downstream methods (B10/C1–C5) handle multi-box shipments by making one rate call per box and summing, or by using carrier multi-piece APIs where supported.

**Degenerate cases** — covered in §10.

### 5.4 Carrier-Native Package Catalog

Seed data populated by a one-time internal mutation `packages.seedCarrierCatalog`. Contents:

**USPS:**
- `USPS_FLAT_RATE_ENVELOPE` — 12.5 × 9.5 × 0.75 in, tare 0.3 oz
- `USPS_LEGAL_FLAT_RATE_ENVELOPE` — 15 × 9.5 × 0.75 in
- `USPS_PADDED_FLAT_RATE_ENVELOPE` — 12.5 × 9.5 × 1 in
- `USPS_SMALL_FLAT_RATE_BOX` — 8.6875 × 5.4375 × 1.75 in, tare 5 oz
- `USPS_MEDIUM_FLAT_RATE_BOX_1` — 11.25 × 8.75 × 6 in (top-load), tare 13 oz
- `USPS_MEDIUM_FLAT_RATE_BOX_2` — 14 × 12 × 3.5 in (side-load)
- `USPS_LARGE_FLAT_RATE_BOX` — 12.25 × 12.25 × 6 in, tare 1 lb 3 oz
- `USPS_REGIONAL_RATE_BOX_A` — multiple sub-variants
- `USPS_REGIONAL_RATE_BOX_B` — multiple sub-variants

**UPS:**
- `UPS_LETTER` — 12.5 × 9.5 × 0.25 in
- `UPS_EXPRESS_BOX_SMALL` — 13 × 11 × 2 in
- `UPS_EXPRESS_BOX_MEDIUM` — 15 × 11 × 3 in
- `UPS_EXPRESS_BOX_LARGE` — 18 × 13 × 3 in
- `UPS_PAK` — soft envelope
- `UPS_TUBE` — 38 × 6 × 6 in

**FedEx:**
- `FEDEX_ENVELOPE`
- `FEDEX_PAK`
- `FEDEX_SMALL_BOX` — 12.375 × 10.875 × 1.5 in
- `FEDEX_MEDIUM_BOX` — 13.25 × 11.5 × 2.375 in
- `FEDEX_LARGE_BOX` — 17.875 × 12.375 × 3 in
- `FEDEX_EXTRA_LARGE_BOX` — 11.875 × 11 × 10.75 in
- `FEDEX_TUBE` — 38 × 6 × 6 in
- `FEDEX_10KG_BOX`, `FEDEX_25KG_BOX` — international only

**DHL:**
- `DHL_EXPRESS_ENVELOPE` — 13 × 9 in
- `DHL_EXPRESS_BOX_2` — 13.5 × 11.5 × 2 in
- `DHL_EXPRESS_BOX_3` — 15.25 × 13.5 × 3 in
- `DHL_EXPRESS_BOX_4` — 15.75 × 15.25 × 5 in
- `DHL_EXPRESS_BOX_5` — 20 × 15.25 × 10 in

Exact dimensions at seed time are sourced from each carrier's official specification sheet (§15 References). Carrier-native packages seed with `packageSource=<carrier>`, `carrierPackageCode=<CODE>`, `dimensions` set, `tareWeight` set where published, `isDefault=false`, `shipFromLocationId=null`.

### 5.5 Settings Unit Conventions

All algorithm inputs are normalized to a single unit pair `(in, oz)` inside the bin-packer to simplify arithmetic, then re-projected to the carrier's expected units at the method boundary. The normalization function lives in `convex/shipping/helpers/units.ts` and is covered by unit tests.

---

## 6. Functions / API

All functions live in `ConvexPress-Admin/packages/backend/convex/shipping/packages/`.

### 6.1 Mutations (`packages/mutations.ts`)

**`packages.create`**
- Args: `{ label, code, packageSource, carrierPackageCode?, dimensions, innerDimensions?, tareWeight, dimensionUnit, weightUnit, maxLoadWeight?, shipFromLocationId?, isDefault?, notes?, sortOrder? }`
- Capability: `shipping.package.manage`
- Validates: `code` unique; if `isDefault=true`, clears `isDefault` on sibling packages in the same scope; if `packageSource !== "custom"`, `carrierPackageCode` is required.
- Emits: `shipping.package.created`

**`packages.update`**
- Args: `{ packageId, patch: Partial<PackageFields> }`
- Capability: `shipping.package.manage`
- Enforces unique-default-per-scope invariant on `isDefault` flip.
- Emits: `shipping.package.updated`

**`packages.archive`**
- Args: `{ packageId }`
- Soft-delete: sets `isArchived=true`. Retained for historical label references; hidden from selectors.
- Capability: `shipping.package.manage`
- Emits: `shipping.package.updated` with `{ action: "archived" }`

**`packages.delete`**
- Args: `{ packageId, force?: boolean }`
- Hard delete only allowed if no label in `commerce_shipping_labels` references it; otherwise rejects and instructs caller to archive.
- Capability: `shipping.package.manage` (+ `shipping.package.hardDelete` for `force=true`)
- Emits: `shipping.package.deleted`

**`packages.setDefault`**
- Args: `{ packageId, scope: "global" | "location", shipFromLocationId? }`
- Atomically flips default within the scope.
- Capability: `shipping.package.manage`
- Emits: `shipping.package.updated`

**`packages.importShipStationPackages`** (action, not mutation — network call)
- Args: `{ accountId }`
- Calls ShipStation `GET /carriers/listpackages` for each registered carrier on the account, upserts rows with `packageSource="shipstation"`.
- Capability: `shipping.package.manage`
- Emits `shipping.package.created` per imported row.

**`packages.seedCarrierCatalog`** (internal mutation)
- No args. Idempotent. Populates the carrier-native catalog (§5.4) on first run; no-op thereafter.

### 6.2 Queries (`packages/queries.ts`)

**`packages.list`**
- Args: `{ packageSource?, shipFromLocationId?, includeArchived?: boolean }`
- Returns: sorted list by `sortOrder` then `label`.

**`packages.get`**
- Args: `{ packageId }` or `{ code }`
- Returns: single package or null.

**`packages.getDefault`**
- Args: `{ shipFromLocationId? }`
- Returns: the default package for the given scope, falling back to global default.

**`packages.listCandidatesForCart`**
- Args: `{ cartId }`
- Returns: list of packages reachable from the cart via the resolution order in §5.2. Used by admin debugging tools and by A7 when preparing a rate call.

### 6.3 Internal (`packages/internals.ts`)

**`packages.resolvePackageForItem`** (internalQuery)
- Args: `{ productId, shippingClassId?, shipFromLocationId? }`
- Returns: `{ package, source: "product" | "class" | "location" | "global" | null }`
- Pure resolution function used by the bin-packer.

### 6.4 Helper (`convex/shipping/helpers/binPacking.ts`)

**`packItemsIntoBoxes`** — pure function, no DB access; receives expanded item list + resolved package templates and returns packed boxes. Used by A7.

**`normalizeUnits`** — converts any `(dim, weight)` input to the canonical `(in, oz)` working unit.

**`projectUnitsForCarrier`** — reverses normalization into the unit the target carrier API expects.

---

## 7. Admin UX

### 7.1 Route

`/admin/commerce/settings/shipping/packages` — stub exists at `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.packages.tsx`. This PRD fills the stub.

### 7.2 List View

- WordPress-style list table
- Columns: `Label`, `Code`, `Source` (badge: Custom / USPS / UPS / FedEx / DHL / ShipStation), `Dimensions` (formatted in the merchant's unit), `Tare`, `Location` (ship-from location name or "Global"), `Default` (star icon when `isDefault`), `Actions` (Edit / Archive / Delete)
- Top-right buttons: `Add Package` (full page), `Import from ShipStation` (opens a full-page import flow — never a modal), `Seed Carrier Catalog` (one-time action, hidden after first run)
- Filters: `Source`, `Location`, `Archived`
- Bulk actions: `Archive`, `Delete` (delete rejects if any row has a referenced label)

### 7.3 Package Editor

Route `/admin/commerce/settings/shipping/packages/$packageId/edit` (and `/new`). Full page, never a modal (per UI Rules).

Sections:

1. **Identity** — `Label`, `Code` (slug, auto-suggested from label), `Source` (radio: Custom / USPS / UPS / FedEx / DHL / ShipStation). If non-custom, show `Carrier Package Code` dropdown populated from the carrier catalog (§5.4).
2. **Dimensions** — three number inputs for L × W × H, unit toggle (`in`/`cm`). Optional collapsible "Advanced: Inner dimensions" for merchants who want explicit internal usable space.
3. **Weight** — `Tare Weight` number input, unit toggle (`oz`/`lb`/`g`/`kg`). Optional `Max Load Weight`.
4. **Scope** — `Location` selector (Global or one ship-from location), `Set as default for this scope` toggle.
5. **Notes** — free-form textarea.
6. **Archive / Delete** — action row at the bottom.

Save returns to list. All writes emit events.

### 7.4 Import from ShipStation

Full-page flow:

1. Select a ShipStation account (from accounts registered in C5).
2. Preview list of packages fetched from ShipStation `/carriers/listpackages`.
3. Checkbox multiselect; default all checked.
4. `Import Selected` button — server-side upsert; returns per-row result (created / updated / skipped).
5. Success page links to list view.

### 7.5 Setup Warning Surface

The shipping overview dashboard at `/admin/commerce/settings/shipping` renders a banner:

- If no default package exists globally AND no ship-from location has a default → **blocking** red banner: "No default package configured. Shipping rates cannot be calculated."
- If some products have `preferredPackageId` pointing to an archived package → **warning** amber banner listing affected products.

---

## 8. Merchant Workflow

### Scenario: "I want to add a Medium Box and use it as the default for Electronics products"

1. Merchant navigates to `/admin/commerce/settings/shipping/packages` → clicks `Add Package`.
2. Fills in: Label `Medium Shipper`, Code `medium-shipper`, Source `Custom`, dimensions `12 × 9 × 4 in`, tare `8 oz`. Leaves Location as Global.
3. Saves. List now shows `Medium Shipper`.
4. Merchant navigates to `/admin/commerce/settings/shipping/classes` (Shipping Classes System), opens the `Electronics` class, sets `Preferred Package` to `Medium Shipper`, saves.
5. All existing products assigned to the `Electronics` class now resolve to `Medium Shipper` via the class default (§5.2 layer 2). No per-product edits required.
6. Optionally, merchant edits one specific product (a large monitor) and sets `Ships in own box: true` so the bin-packer skips packing it and uses the product's own dimensions.

From the merchant's view, this is a three-click operation per package + one-click per shipping class. No code, no JSON.

### Scenario: "I already use ShipStation; don't make me re-enter my boxes"

1. Merchant navigates to `/admin/commerce/settings/shipping/packages` → clicks `Import from ShipStation`.
2. Selects their ShipStation account.
3. Reviews the preview (20 packages listed, all checked).
4. Clicks `Import Selected`. System upserts with `packageSource=shipstation`.
5. Merchant assigns one as global default.

### Scenario: "I want USPS Flat Rate for all small items"

1. Merchant clicks `Seed Carrier Catalog` (one-time). System populates the USPS/UPS/FedEx/DHL catalog from §5.4.
2. Merchant opens `USPS Medium Flat Rate Box 1` → sets `Default for global scope`.
3. Products without per-product or per-class overrides now quote against USPS Medium Flat Rate.

---

## 9. Storefront UX

This system is **invisible to the end customer**. Customers do not see package names or dimensions. What they see is the downstream effect: accurate shipping rate options at checkout.

Indirect effects visible to customers:

- **Rate accuracy at checkout.** `$6.95 USPS Priority Mail` replaces `$12.50 USPS Priority Mail (widest band fallback)`.
- **Multi-box disclosure (optional).** When the bin-packer produces >1 box for a cart, the checkout can optionally display "Ships in 2 boxes" below the rate line. Controlled by a merchant setting `shipping.showMultiBoxNotice` (default off).
- **Delivery time accuracy.** Because the carrier receives correct dimensions, the carrier's returned transit-time estimate is more accurate.

No direct UI surface in this PRD.

---

## 10. Edge Cases

### 10.1 Cart Too Large for Any Available Package

- **Detection:** during bin-pack, an item's longest side exceeds every candidate package's longest inner side.
- **Behavior:** the pipeline (A7) returns a structured error `ITEM_EXCEEDS_ALL_PACKAGES` with the offending `productId`. Checkout surfaces a friendly "Contact us for a shipping quote on this item" message and disables live rates for the cart.
- **Admin remediation:** the merchant can either (a) mark the product `shipsInOwnBox=true` and supply product dimensions, or (b) create a larger custom package.

### 10.2 Items Without Dimensions

- **Detection:** `product.length` or `width` or `height` is null/zero.
- **Behavior:** the pipeline substitutes a **dimension proxy** derived from weight using a heuristic density constant (default 20 lb/ft³, configurable in Settings). A warning is logged. Rates quoted under proxy mode are suffixed internally with `proxied=true` and admins see a "Some products are missing dimensions" banner.
- **Never:** we never hardcode `0.1 × 0.1 × 0.1` — the proxy is a real volume derived from real weight.

### 10.3 `shipsInOwnBox` Items

- Bypass bin-packer entirely. Each unit becomes its own packed box with `packageId=null`, `outerDimensions = product.dimensions`, `tareWeight = product.boxTareWeight || 0`.
- Carrier APIs receive these as individual shipments in a multi-piece call where supported, or separate rate calls summed where not.

### 10.4 Irregular / Long Items (Tubes, Posters)

- Bin-packer uses only longest-side + volume checks. A 36-inch poster in a 38-inch tube fits because longest-side passes; a 36-inch poster in a 12×12×12 box does not (longest-side fails).
- Merchants should create dedicated tube packages and link via product or class preference.

### 10.5 Mixed Ship-From Locations in One Cart

- Out of scope for A3 bin-packer; A7 splits the cart by location and calls bin-pack per sub-cart. Each sub-cart resolves defaults against its own location (§5.2 layer 3).

### 10.6 Archived Default Package

- If a merchant archives the package marked `isDefault`, the mutation refuses with `CANNOT_ARCHIVE_DEFAULT` unless another package is promoted to default first in the same scope.

### 10.7 Conflicting Per-Product Package Scope

- If `product.preferredPackageId` points to a package whose `shipFromLocationId` does not match the cart's ship-from location, the resolver logs a warning and falls through to the class default. This prevents shipping a warehouse-scoped package from the wrong warehouse.

### 10.8 Zero-Weight Tare

- Allowed. Flat-rate envelopes are effectively weightless. Tare `0` is legal.

### 10.9 Overweight for Max Load

- If no box's `maxLoadWeight` can accommodate the next item, bin-packer opens a new box. If the item alone exceeds every box's `maxLoadWeight`, same error path as §10.1 (`ITEM_EXCEEDS_ALL_PACKAGES`) with reason `weight`.

### 10.10 Unit Mismatch Between Product and Package

- The normalizer (`helpers/units.ts`) handles all conversion. Any unit combination on inputs is valid.

### 10.11 Carrier Catalog Updates

- Carrier-native package specs change rarely but non-never (USPS revised Medium Flat Rate 1 inner dimensions in 2022). `seedCarrierCatalog` is idempotent on `(packageSource, carrierPackageCode)` but **does not overwrite** merchant-edited rows. Admin sees an out-of-date banner with a "Refresh catalog" action that re-runs seed with `force=true` (merchant confirms before overwrite).

### 10.12 Deletion of Package Referenced by Historical Labels

- `packages.delete` refuses if any label row references the package. `packages.archive` is the only supported path. Archived packages continue to be readable by the label history view.

---

## 11. Testing Requirements

### 11.1 Unit Tests (Bin-Packer)

Located in `ConvexPress-Admin/packages/backend/convex/shipping/helpers/__tests__/binPacking.test.ts`.

- **Single item fits in single default box** — exact dim match.
- **Single item longer than every box → error** — `ITEM_EXCEEDS_ALL_PACKAGES`.
- **Multiple small items fill one box by volume** — 10 items at 1 in³ each into a 12 in³ box produces one packed box with `fillEfficiency ≈ 0.83`.
- **Items overflow one box → two boxes** — same template, split.
- **`shipsInOwnBox` bypass** — item exits packing directly, `packageId=null`, `outerDimensions` equal to product dims.
- **Preferred package precedence** — product-level beats class-level beats location default beats global default.
- **Max load weight respected** — heavy items force new box even with volume remaining.
- **Longest-side rejection** — 36 in item rejected from 12 in box even if volume fits.
- **Unit normalization** — mixed `(cm, g)` product + `(in, oz)` package produces identical packed result as all-`(in, oz)` inputs.
- **Zero-dimension product → proxy substitution** — volume from weight, `proxied=true` flag set.

### 11.2 Integration Tests

- **Replacement of DHL hardcode.** Test that the DHL rates action (`shipping/actions.ts`) receives bin-packed dimensions instead of `20 × 15 × 10`. Fixture: 2 products at 5 × 5 × 5 cm, 100 g each, in a Medium Box (12 × 9 × 4 in). Assert request body to DHL sandbox contains the Medium Box dimensions in cm.
- **Replacement of USPS hardcode.** Same fixture. Assert USPS request body contains `12 × 9 × 4 in`, not `0.1 × 0.1 × 0.1`.
- **ShipStation import round-trip.** Mock ShipStation `/carriers/listpackages`; assert upsert creates rows with `packageSource=shipstation`.

### 11.3 Carrier Sandbox Tests

Run against each carrier's sandbox environment:

- **USPS sandbox: quote with `USPS_FLAT_RATE_ENVELOPE`.** Confirm returned rate matches published flat rate (±0 — flat rate is deterministic).
- **USPS sandbox: quote with custom box.** Confirm rate varies by dimensions.
- **UPS sandbox: quote with `UPS_EXPRESS_BOX_SMALL`.** Confirm `PackagingType=2a` in request, rate returned.
- **FedEx sandbox: quote with `FEDEX_SMALL_BOX`.** Confirm `PackagingType=FEDEX_SMALL_BOX` in request.
- **DHL sandbox: quote with `DHL_EXPRESS_BOX_3`.** Confirm dimensions passed match seed catalog, not `20 × 15 × 10`.

### 11.4 Admin UI Tests (Playwright)

- Create custom package → appears in list → set as default → default badge renders.
- Import from ShipStation (mocked API) → preview → select → import → list updated.
- Archive default → error toast, prevented.
- Delete package with label reference → error toast, prevented.

### 11.5 Performance

- Bin-pack 200 items across 5 package templates → completes in <50 ms (in-memory, no DB).
- `packages.list` with 100 rows → <20 ms p95 in Convex function profiler.

---

## 12. Success Criteria

1. **Rate accuracy** — for a representative 10-cart test set across 4 carriers and 20 ZIPs, the quoted rate is within **2%** of the actual carrier-delivered rate. Current state (hardcoded dimensions) exhibits 8–40% drift.
2. **Zero API errors** attributable to missing or invalid dimensions in carrier sandbox regression tests.
3. **Zero hardcoded dimensions** remain in `shipping/actions.ts`. Grep confirms `20, 15, 10` and `0.1, 0.1, 0.1` strings are removed.
4. **Merchant self-service** — a merchant can add a custom package end-to-end without engineering involvement.
5. **ShipStation import** — a merchant with 20 existing ShipStation packages imports all of them in one action.
6. **Catalog seed** — carrier-native catalog seeds with 30+ entries covering USPS, UPS, FedEx, DHL.
7. **Bin-packer correctness** — 100% pass on the test matrix in §11.1.
8. **Events fire** — all three lifecycle events reach the Event Dispatcher in integration tests.
9. **Archival safety** — no merchant has ever lost a package reference on a historical label.
10. **Setup warning coverage** — no cart reaches checkout in a state where `NO_PACKAGE_CONFIGURED` would fire without first surfacing the blocking admin banner.

---

## 13. Roles & Capabilities

New capabilities (added to Role & Capability System):

| Capability | Description | Default Roles |
|------------|-------------|---------------|
| `shipping.package.view` | Read packages, list default | Administrator, Editor, Author (read-only) |
| `shipping.package.manage` | Create, update, archive packages; set defaults; import from ShipStation | Administrator, Editor |
| `shipping.package.hardDelete` | Hard-delete a package (destructive) | Administrator only |
| `shipping.catalog.seed` | Run carrier-native catalog seed/refresh | Administrator only |

All mutations and the import action enforce the appropriate capability via the standard `requireCan(ctx, "shipping.package.manage")` pattern. List and get queries require at minimum `shipping.package.view`.

---

## 14. Events Fired

All events route through the Event Dispatcher System. Payloads follow the system convention of `{ actorId, timestamp, entity, change }`.

**`shipping.package.created`**
- Payload: `{ packageId, label, code, packageSource, carrierPackageCode?, shipFromLocationId?, isDefault, actorId }`
- Fired by: `packages.create`, `packages.importShipStationPackages` (per imported row), `packages.seedCarrierCatalog` (per seeded row, first run only)

**`shipping.package.updated`**
- Payload: `{ packageId, changedFields: string[], previousValues: Record<string, any>, nextValues: Record<string, any>, actorId, action?: "archived" | "defaultSet" }`
- Fired by: `packages.update`, `packages.archive`, `packages.setDefault`

**`shipping.package.deleted`**
- Payload: `{ packageId, code, label, actorId, hadHistoricalLabelReferences: boolean }`
- Fired by: `packages.delete`

Downstream listeners (not in this PRD):

- **Audit Log System** — persists all three events.
- **A7 Rate Calculation Pipeline** — invalidates any cached per-cart bin-pack result on any event.
- **Settings Dashboard Notifications** — surfaces "Package `X` was archived by `user`" as in-app notifications for administrators.

---

## 15. References

### External

- **USPS Flat Rate Catalog** — `https://www.usps.com/ship/priority-mail.htm`; official dimension spec for flat rate envelopes and boxes. Source of truth for USPS seed data in §5.4.
- **USPS Web Tools API — Rate Calculator v4** — `PackageType` enum values used in C1 mapping.
- **UPS Packaging Types Reference** — `https://developer.ups.com/` → Rating API → `PackagingType` codes (`01`–`62`). Source for UPS seed data.
- **UPS Standard Packaging Dimensions** — official UPS Express Box Small/Medium/Large outer/inner dim spec sheet.
- **FedEx Developer — Rate API** — `packagingType` enum (`FEDEX_ENVELOPE`, `FEDEX_SMALL_BOX`, etc.); FedEx One Rate eligibility matrix.
- **DHL Express MyDHL API — Rate Request** — `packages[].dimensions` schema; DHL Express Box 2/3/4/5 spec sheet.
- **ShipStation API v1 — `GET /carriers/listpackages`** — package schema used by the import action.

### Prior Art

- **WooCommerce Weight Based Shipping & Box Packing extensions** — `https://wordpress.org/plugins/woocommerce-shipping-box-packer/`. ConvexPress adopts the mental model (custom packages + product-preferred packages + first-fit-decreasing bin-packing) but not the code.
- **Shopify Package Templates** — `https://help.shopify.com/en/manual/shipping/setting-up-and-managing-your-shipping/packages`. ConvexPress matches the "template library + default per location" UX, extends with carrier-native catalog.
- **EasyPost `Parcel` object** — validation of how carriers expect dimensions; used as reference for our normalizer output shape.
- **3D bin-packing literature — Martello, Pisinger, Vigo (2000)** — canonical FFD-V is documented here; our implementation is the simpler volume-only variant with longest-side guard.

### Internal

- `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` (lines 115–131) — baseline `commerce_shipping_packages` table.
- `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` — current DHL rates hardcode (~line 1320), current USPS rates hardcode (~line 861). Both removed in the C1/C4 PRDs; this PRD provides the replacement data source.
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.packages.tsx` — stub admin route to be filled.
- PRD A4 — Ship-From Locations — upstream dependency.
- PRD A7 — Rate Calculation Pipeline — orchestrator.
- PRD B3 — Dimensional Shipping Method — DIM weight consumer.
- PRDs C1–C5 — carrier live rate providers — primary consumers of the bin-packer output.
- PRD D1 — Labels System — label purchase references packages by `_id`.

---

*End of PRD A3 — Shipping Packages & Box Templates System.*
