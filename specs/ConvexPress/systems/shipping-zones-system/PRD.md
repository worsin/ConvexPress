# Shipping Zones System — PRD A1

**System ID:** shipping-zones-system
**Layer:** A — Core Infrastructure (Foundational)
**PRD Position:** A1 of 25 in the Shipping System decomposition
**Status:** Design / Ready for Implementation
**Owner:** Commerce Domain — Shipping
**Modeled on:** WooCommerce Shipping Zones, with parity-first semantics

---

## 1. Context & Intent

A **Shipping Zone** is a named geographic region, defined by a combination of countries, states/provinces, and postcode rules. Zones are the primary mechanism by which ConvexPress decides *which shipping methods are available to a given customer at checkout*. Without a defined zone matching a customer's shipping address, no shipping method can be offered (except a "Rest of World" fallback zone, which is itself a zone).

This PRD establishes the foundational data structure, matching algorithm, admin UX, and public API surface for shipping zones. Every downstream shipping method PRD (B1–B10), provider integration (C1–C5), rate-calculation logic (A7), and tax/fulfillment system (D1–D7) assumes this PRD is implemented.

**Intent (in one sentence):** Merchants can define named geographic regions in the admin, attach shipping methods to them, and have the storefront automatically offer only the methods whose zone matches the customer's shipping address — in the same mental model WooCommerce merchants already understand.

ConvexPress already has a minimal baseline of this system in place:

- The table `commerce_shipping_zones` exists in `convex/schema/shipping.ts` (lines 133–142).
- An internal matching query `matchZoneForAddress` exists in `convex/shipping/internals.ts`.
- A helper `zoneMatchesAddress` exists in `convex/shipping/helpers.ts`.
- An admin route file exists at `apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.zones.tsx`.

This PRD **extends** that baseline into a production-grade system: it tightens the schema, documents postcode rule semantics, adds reorder and fallback-zone handling, defines explicit mutations/queries/events, describes the full admin UX, and specifies edge-case behavior.

---

## 2. Scope

### 2.1 In-Scope

1. **Zone CRUD** — create, read, update, delete shipping zones.
2. **Zone ordering** — each zone has a `sortOrder`; zones are evaluated in ascending order (lower runs first, WooCommerce convention), first match wins.
3. **Zone enable/disable** — disabled zones are skipped during matching but retained for future use.
4. **Zone geographic definition** — each zone stores `countries` (ISO 3166-1 alpha-2), `states` (optional, ISO 3166-2 subdivision code without the country prefix), and `postalCodeRules` (array of strings — see §5.3 for the grammar).
5. **Rest-of-World fallback zone** — a specially-flagged zone (`isFallback: true`) that matches *any* address whose country is not already matched by a prior zone. Exactly one fallback zone is permitted per store.
6. **Zone matching algorithm** — deterministic, pure function of `(zone, address)` → `boolean`. Exposed both as an internal Convex query and as a pure helper in `convex/shipping/helpers.ts`.
7. **Cascade on delete** — deleting a zone must cascade-delete its `commerce_shipping_zone_methods` rows (detailed in the method PRDs; this PRD defines the trigger).
8. **Admin UX** — list table with drag-to-reorder, enable/disable toggles, zone editor page, zone creation flow. Location: `/admin/commerce/settings/shipping/zones`.
9. **Events** — `shipping.zone.created`, `shipping.zone.updated`, `shipping.zone.deleted`, `shipping.zone.reordered`.
10. **Capabilities** — new capability `admin.shipping.zones.manage` (see §13).
11. **Audit log** — every zone mutation writes to the audit log (via the Audit Log System).
12. **Validation** — country codes validated against ISO 3166-1 alpha-2; state codes validated against the country's known subdivisions; postcode rules validated against the grammar in §5.3.

### 2.2 Out-of-Scope (Deferred to Other PRDs)

- **Shipping methods attaching to zones** — the join table `commerce_shipping_zone_methods` already exists in the schema, but its shape, semantics, and UX are owned by the method PRDs (B1–B10).
- **Rate calculation** — owned by Rate Calculation Pipeline (PRD A7).
- **Live carrier rates** — owned by Carrier Integration PRDs (C1–C5).
- **Shipping classes** — owned by Shipping Classes System (PRD A2).
- **Tax-by-zone** — the Tax System may consume the same zone matching helper but does not own it; tax zones are separate from shipping zones.
- **Customer-facing "estimate shipping" widget** — owned by Cart/Checkout UI PRDs.
- **Shipping insurance, signature requirement rules** — owned by Method Presentation Rules PRDs.

---

## 3. Dependencies

### 3.1 Upstream (This PRD depends on)

**None.** This is a Layer A foundational PRD. The only runtime dependencies are:

- **Settings System** (already built) — uses `convex/settings` for the "Default country" store setting, used as a UX convenience when creating new zones.
- **Role & Capability System** (already built) — for the `admin.shipping.zones.manage` capability check.
- **Event Dispatcher System** (already built) — for emitting zone lifecycle events.
- **Audit Log System** (already built) — for logging zone mutations.

These are not "upstream PRDs" in the shipping decomposition; they are core platform services.

### 3.2 Downstream (PRDs that depend on this)

All shipping method and provider PRDs consume zones via the join table `commerce_shipping_zone_methods`:

- **Shipping Classes System (PRD A2)** — classes can narrow method applicability within a zone.
- **Shipping Packaging System (PRD A3)** — zones are consulted to determine ship-from address parity.
- **Shipping Address Validation (PRD A4)** — the matching algorithm defined here is reused to validate addresses against serviceable zones.
- **Rate Request Context (PRD A5)** — rate requests carry the matched `zoneId`.
- **Rate Response Normalization (PRD A6)** — quotes are tagged with the originating `zoneId`.
- **Rate Calculation Pipeline (PRD A7)** — the pipeline calls `matchZoneForAddress` as its first step.
- **Flat Rate Shipping (PRD B1)** — method attached per zone.
- **Weight-Based Shipping (PRD B2)** — method attached per zone.
- **Price-Based Shipping (PRD B3)** — method attached per zone.
- **Free Shipping (PRD B4)** — method attached per zone.
- **Local Pickup (PRD B5)** — method attached per zone.
- **Table Rate Shipping (PRD B6)** — method attached per zone.
- **Live Rate — USPS (PRD B7), UPS (PRD B8), FedEx (PRD B9), DHL (PRD B10)** — each method attached per zone, with per-zone service filters.
- **ShipStation Integration (PRD C1)**, UPS Direct (C2), USPS Direct (C3), FedEx Direct (C4), DHL Direct (C5) — connection-level, but zones gate which accounts/services are offered.
- **Shipping Tax Correlation (PRD D3)** — shipping tax rates look up the matched zone.
- **Order Shipping Snapshot (PRD D5)** — orders store the `zoneId` that was matched at checkout, for audit.

---

## 4. Schema

### 4.1 Modular Schema Location

All changes live in `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts`, inside the exported `shippingTables` object. No new files are created in `convex/schema/`. The main `schema.ts` already spreads `shippingTables`.

### 4.2 Table: `commerce_shipping_zones` (Modified)

**Existing shape (baseline):**
```ts
commerce_shipping_zones: defineTable({
  name: v.string(),
  countries: v.array(v.string()),
  states: v.array(v.string()),
  postalCodeRules: v.array(v.string()),
  enabled: v.boolean(),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_sort", ["sortOrder"]);
```

**Target shape (this PRD):**
```ts
commerce_shipping_zones: defineTable({
  name: v.string(),                          // Merchant-facing label, e.g. "US Continental"
  slug: v.string(),                          // URL-safe, unique. Derived from name on create, editable.
  description: v.optional(v.string()),       // Merchant notes, optional.
  countries: v.array(v.string()),            // ISO 3166-1 alpha-2. Empty if isFallback=true.
  states: v.array(v.string()),               // ISO 3166-2 subdivision codes WITHOUT country prefix (e.g. "CA", "NY"). Empty = all states.
  postalCodeRules: v.array(v.string()),      // See §5.3 grammar. Empty = no postcode restriction.
  enabled: v.boolean(),
  isFallback: v.boolean(),                   // NEW: exactly one zone may have this true.
  sortOrder: v.number(),                     // Lower runs first. Fallback zone is forced to sortOrder = Number.MAX_SAFE_INTEGER at write time.
  createdAt: v.number(),
  createdBy: v.optional(v.id("users")),      // NEW
  updatedAt: v.number(),
  updatedBy: v.optional(v.id("users")),      // NEW
})
  .index("by_sort", ["sortOrder"])
  .index("by_slug", ["slug"])
  .index("by_fallback", ["isFallback"])
  .index("by_enabled_sort", ["enabled", "sortOrder"]);
```

**Migration notes:**
- Existing rows default `isFallback = false`, `slug = slugify(name)`, `description = undefined`, `createdBy = undefined`, `updatedBy = undefined`.
- `slug` uniqueness is enforced at the mutation layer (Convex does not support unique indexes); collision yields a trailing `-2`, `-3`, etc.

### 4.3 Validators (new file: `convex/shipping/zones/validators.ts`)

Exposed validators for reuse by method PRDs and the admin UI:

```ts
// Pseudo — the PRD specifies intent, not code.

zoneCountryCodeValidator    // v.string() with ISO-3166-1 alpha-2 regex /^[A-Z]{2}$/
zoneStateCodeValidator      // v.string(), 1-3 uppercase letters/digits
zonePostcodeRuleValidator   // v.string() matching postcode rule grammar (see §5.3)

createZoneArgs = v.object({
  name: v.string(),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  countries: v.array(zoneCountryCodeValidator),
  states: v.optional(v.array(zoneStateCodeValidator)),
  postalCodeRules: v.optional(v.array(zonePostcodeRuleValidator)),
  enabled: v.optional(v.boolean()),      // default true
  isFallback: v.optional(v.boolean()),   // default false
  sortOrder: v.optional(v.number()),     // default = max(existing sortOrders) + 10
})

updateZoneArgs = v.object({
  zoneId: v.id("commerce_shipping_zones"),
  patch: v.object({ /* partial of createZoneArgs */ }),
})

reorderZonesArgs = v.object({
  orderedIds: v.array(v.id("commerce_shipping_zones")),
})
```

### 4.4 Join Table (Referenced, Not Owned)

The `commerce_shipping_zone_methods` table is referenced here for completeness but owned by the method PRDs. This PRD guarantees:

- On zone delete, all rows in `commerce_shipping_zone_methods` with matching `zoneId` are cascade-deleted within the same mutation.
- On zone disable, rows are *not* deleted; method matching simply skips the disabled zone.

---

## 5. Data Model

### 5.1 Zone → Methods Relationship

- One zone has **zero-to-many** shipping methods (via `commerce_shipping_zone_methods.zoneId`).
- One method row exists per `(zoneId, methodCode, methodType)` triple. A method definition (e.g. "Flat Rate") can be attached to many zones; each attachment is a separate row with its own pricing rules.
- Methods inherit their display order from `commerce_shipping_zone_methods.sortOrder`, not from zone order.

### 5.2 Zone Matching Algorithm

**Contract:** `matchZoneForAddress({countryCode, state?, postalCode?}) → { zone, methods } | null`.

**Steps:**
1. Load all zones, filter to `enabled === true`.
2. Sort ascending by `sortOrder`. Ties broken by `_creationTime` (earlier first).
3. Separate out the fallback zone (`isFallback === true`), if any. It is not part of the iteration below.
4. For each non-fallback zone, evaluate `zoneMatchesAddress(zone, address)`:
   - **Country check:** `zone.countries` MUST include `address.countryCode`. If not, skip.
   - **State check:** If `zone.states` is non-empty, `address.state` MUST be present and included in `zone.states`. Otherwise skip.
   - **Postcode check:** If `zone.postalCodeRules` is non-empty, `address.postalCode` MUST match at least one rule (§5.3). Otherwise skip.
   - If all three pass, zone matches.
5. **First match wins.** Return `{ zone, methods }`.
6. If no non-fallback zone matched and a fallback zone exists, return `{ zone: fallback, methods }` for the fallback.
7. If neither matched, return `null`. Callers MUST treat `null` as "no shipping available to this address."

**Determinism:** given the same zone list and address, the algorithm ALWAYS returns the same result. No randomness, no time-of-day behavior.

### 5.3 Postcode Rule Grammar

Each entry in `postalCodeRules` is a single rule string. Rules are evaluated in order; the first match short-circuits. The grammar supports four forms, aligned with WooCommerce:

| Form       | Syntax                 | Example           | Matches                           |
|------------|------------------------|-------------------|-----------------------------------|
| Exact      | `<code>`               | `90210`           | `90210` only                      |
| Wildcard   | `<prefix>*`            | `902*`            | any code starting with `902`      |
| Range      | `<low>...<high>`       | `90000...90099`   | numeric codes in `[90000, 90099]` |
| CSV (any)  | `<a>,<b>,<c>`          | `90210,90211,90212` | equivalent to three exact rules |

**Normalization before matching:**
- Strip whitespace from both rule and input.
- Uppercase both (handles UK/Canadian postcodes like `SW1A 1AA`).
- For range form, both sides MUST be numeric (all digits). Non-numeric ranges are rejected at save time.
- CSV entries are internally split; each child entry is re-validated against the other three forms.

**Examples:**

```
"90210"                          Exact US ZIP
"902*"                           All LA-area ZIPs starting 902
"90000...96199"                  All California ZIPs (numeric range)
"SW1A*"                          All London SW1A postcodes
"M5V*,M6G*"                      Two downtown Toronto FSAs
"90210,90211,K1A 0B1"            Mixed CSV
```

**Rejected at save time:**

```
"SW1A...SW1Z"    Non-numeric range — rejected.
"**"             Wildcard-only — rejected (use empty rules array instead).
""               Empty rule — rejected.
"90*10"          Wildcard in middle — rejected; only suffix wildcard allowed.
```

### 5.4 State Code Handling

- `states` stores the subdivision code *without* the country prefix. For US California: `"CA"`, not `"US-CA"`.
- If a zone has multiple countries, state codes apply *only within their native country*. This is a known WooCommerce quirk preserved for parity: a zone `{ countries: ["US", "CA"], states: ["CA"] }` matches California (US) OR Alberta (Canada's "AB"… actually `"CA"` collides). **To prevent collision, the admin UI disallows selecting states when more than one country is chosen**, and the mutation rejects such input.
- Country codes are `"GB"` (not `"UK"`), `"US"`, `"CA"`, `"AU"`, etc. ISO 3166-1 alpha-2 strict.

### 5.5 Example Zone Definitions

**Example 1 — US Continental (48 states, no AK/HI):**
```json
{
  "name": "US Continental",
  "slug": "us-continental",
  "countries": ["US"],
  "states": ["AL","AR","AZ","CA","CO","CT","DE","FL","GA","IA","ID","IL","IN","KS","KY","LA","MA","MD","ME","MI","MN","MO","MS","MT","NC","ND","NE","NH","NJ","NM","NV","NY","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA","WI","WV","WY","DC"],
  "postalCodeRules": [],
  "enabled": true,
  "isFallback": false,
  "sortOrder": 10
}
```

**Example 2 — California Only, by postcode range:**
```json
{
  "name": "California",
  "slug": "california",
  "countries": ["US"],
  "states": ["CA"],
  "postalCodeRules": ["90000...96199"],
  "enabled": true,
  "isFallback": false,
  "sortOrder": 5
}
```

**Example 3 — EU Zone:**
```json
{
  "name": "European Union",
  "slug": "eu",
  "countries": ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"],
  "states": [],
  "postalCodeRules": [],
  "enabled": true,
  "isFallback": false,
  "sortOrder": 20
}
```

**Example 4 — Rest of World fallback:**
```json
{
  "name": "Rest of World",
  "slug": "rest-of-world",
  "countries": [],
  "states": [],
  "postalCodeRules": [],
  "enabled": true,
  "isFallback": true,
  "sortOrder": 9007199254740991
}
```

---

## 6. Functions / API

### 6.1 File Layout

New subdirectory: `ConvexPress-Admin/packages/backend/convex/shipping/zones/`

```
convex/shipping/zones/
├── mutations.ts     # createZone, updateZone, deleteZone, reorderZones, setFallbackZone
├── queries.ts       # listZones, getZone, getZoneBySlug, matchZoneForAddress (public)
├── internals.ts     # internal helpers; cascadeDeleteZone; promoteOrDemoteFallback
└── validators.ts    # shared arg validators (see §4.3)
```

The existing `convex/shipping/internals.ts` retains its `matchZoneForAddress` internal query for backward compatibility; the new `convex/shipping/zones/queries.ts` exposes a public-facing `matchZoneForAddress` that wraps the same helper with commerce-enabled guards.

### 6.2 Mutations

All mutations require capability `admin.shipping.zones.manage` via `requireCan(ctx, "admin.shipping.zones.manage")`. All mutations emit an audit log entry and fire the corresponding event.

| Mutation           | Args                                      | Returns                   | Events emitted                | Notes |
|--------------------|-------------------------------------------|---------------------------|-------------------------------|-------|
| `createZone`       | `createZoneArgs`                          | `Id<"commerce_shipping_zones">` | `shipping.zone.created` | Auto-assigns `sortOrder` if not provided. Slug uniqueness enforced. Validates postcode rules. |
| `updateZone`       | `updateZoneArgs`                          | `Id<"commerce_shipping_zones">` | `shipping.zone.updated` | Partial patch. Cannot change `isFallback` via this mutation (use `setFallbackZone`). |
| `deleteZone`       | `{ zoneId }`                              | `{ deleted: boolean, cascadedMethodCount: number }` | `shipping.zone.deleted` | Cascades to `commerce_shipping_zone_methods`. Forbidden if zone is fallback and other zones exist (unset fallback first). |
| `reorderZones`     | `{ orderedIds: Id<"commerce_shipping_zones">[] }` | `{ updated: number }` | `shipping.zone.reordered` | Rewrites `sortOrder` to `index * 10` for each id. Fallback zone is excluded from input; its sortOrder is left at MAX_SAFE_INTEGER. |
| `setFallbackZone`  | `{ zoneId: Id \| null }`                  | `{ previousFallbackId, currentFallbackId }` | `shipping.zone.updated` (for both affected zones) | Unsets prior fallback; sets new one; or clears fallback entirely when null. |
| `toggleZoneEnabled`| `{ zoneId, enabled }`                     | `Id<"commerce_shipping_zones">` | `shipping.zone.updated` | Convenience wrapper around `updateZone`. |

### 6.3 Queries

| Query                    | Args                                      | Returns                                                  | Auth              |
|--------------------------|-------------------------------------------|----------------------------------------------------------|-------------------|
| `listZones`              | `{ includeDisabled?: boolean }`           | `Array<Zone & { methodCount: number }>` sorted by sortOrder | `admin.shipping.zones.manage` |
| `getZone`                | `{ zoneId }`                              | `Zone \| null`                                           | `admin.shipping.zones.manage` |
| `getZoneBySlug`          | `{ slug }`                                | `Zone \| null`                                           | `admin.shipping.zones.manage` |
| `matchZoneForAddress`    | `{ countryCode, state?, postalCode? }`    | `{ zoneId, methodCount } \| null`                        | Public (checkout) — commerce must be enabled |
| `countZones`             | `{}`                                      | `{ total: number, enabled: number, disabled: number }`   | `admin.shipping.zones.manage` |

Note: the public `matchZoneForAddress` returns only the zone identity and method count, not method rows. Methods are fetched via the Rate Calculation Pipeline (PRD A7). This keeps the public surface small and avoids leaking internal method configuration.

### 6.4 Internal Functions

- `internalZones.cascadeDeleteZone` — invoked by `deleteZone`; removes `commerce_shipping_zone_methods` rows.
- `internalZones.normalizeSlug(name, existingSlugs)` — slug generator.
- `internalZones.validatePostcodeRules(rules)` — throws `ConvexError` on invalid grammar.
- `internalZones.demoteFallbackBeforeDelete(zoneId)` — safety net.

### 6.5 Error Codes

All mutations throw `ConvexError` with a structured payload:

| Code                                 | HTTP-equivalent | Meaning                                                  |
|--------------------------------------|-----------------|----------------------------------------------------------|
| `SHIPPING_ZONE_NOT_FOUND`            | 404             | `zoneId` does not exist.                                 |
| `SHIPPING_ZONE_SLUG_CONFLICT`        | 409             | Slug already in use.                                     |
| `SHIPPING_ZONE_INVALID_COUNTRY`      | 422             | Country code is not ISO 3166-1 alpha-2.                  |
| `SHIPPING_ZONE_INVALID_STATE`        | 422             | State code not recognized for any of the zone's countries.|
| `SHIPPING_ZONE_INVALID_POSTCODE_RULE`| 422             | Postcode rule violates grammar (§5.3).                   |
| `SHIPPING_ZONE_STATES_MULTI_COUNTRY` | 422             | States supplied with more than one country.              |
| `SHIPPING_ZONE_FALLBACK_CONFLICT`    | 409             | Another zone is already the fallback.                    |
| `SHIPPING_ZONE_FALLBACK_HAS_GEO`     | 422             | Fallback zone must have empty countries/states/postcodes.|
| `SHIPPING_ZONE_DELETE_LAST`          | 422             | Cannot delete the only remaining zone — add another first.|

---

## 7. Admin UX

### 7.1 Routes

| Route | File | Purpose |
|-------|------|---------|
| `/admin/commerce/settings/shipping/zones` | `apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.zones.tsx` (already exists — to be rebuilt per this spec) | List table of all zones |
| `/admin/commerce/settings/shipping/zones/new` | new file | Create-zone page |
| `/admin/commerce/settings/shipping/zones/$zoneId` | new file | Edit-zone page |

All three are full-page routes. No modals are used for zone editing, per ConvexPress UI rules.

### 7.2 List Table (`/admin/commerce/settings/shipping/zones`)

Built on the Admin List Table UI primitives.

**Columns:**
1. **Drag handle** (icon) — click-and-drag to reorder. Updates `sortOrder` via `reorderZones` on drop.
2. **Zone name** (link to edit page) — bold if `isFallback=true`; italic "(Fallback)" suffix.
3. **Region summary** — e.g. "US, CA" (countries); "California, Nevada" (states); "+3 postcode rules"; compact rendering.
4. **Methods** — count badge (e.g. "3 methods"). Zero-count zones display a muted "No methods configured" with a CTA link.
5. **Status** — enabled/disabled pill.
6. **Row actions** — Edit, Duplicate, Delete.

**Bulk actions:** Enable, Disable, Delete. (No bulk reorder.)

**Filters:** Enabled/Disabled/All. Country filter (multi-select).

**Empty state:** "No shipping zones yet. Create your first zone to start offering shipping." + primary "Add Zone" CTA.

**Fallback zone pinning:** The fallback zone row is always pinned to the bottom of the table, not draggable. Its drag handle is replaced with a lock icon and a tooltip: "This is your Rest-of-World zone — it always runs last."

### 7.3 Create / Edit Zone Page

Single full page with the following sections, stacked vertically:

1. **Header:** Zone name input, slug (auto-filled, editable), enabled toggle, fallback-zone checkbox (disabled if another zone already holds it).
2. **Description:** Optional multiline text.
3. **Countries:** Multi-select with ISO 3166-1 alpha-2. Search box. Flag icons. "Select all EU", "Select all Americas" quick actions.
4. **States / Provinces:** Appears only when exactly one country is selected and that country has defined subdivisions. Multi-select with "Select all" / "Clear". Hidden if zero or multiple countries selected.
5. **Postcode rules:** Repeater input. Each row is a single rule string. Live validation beneath the input showing: matched format, normalized form, and example codes that would match.
6. **Priority (sort order):** Displayed read-only for new zones ("will be added at position N"). Editable numeric for existing zones.
7. **Methods section:** Placeholder for the methods sub-UI, owned by method PRDs. For this PRD, a CTA link "Add shipping methods to this zone →" leading to `/admin/commerce/settings/shipping/zones/$zoneId/methods`.
8. **Danger zone:** Delete button with confirmation dialog (the only permitted popup, per platform rules).

**Save behavior:** All fields saved atomically via `updateZone` (or `createZone`). On success, toast "Zone saved." and stay on the edit page; on create, redirect to edit page with new zoneId.

### 7.4 Drag-to-Reorder Interaction

- Drag handle is a grab cursor icon on the leftmost column of each row.
- Drop target is the gap between any two rows (excluding the fallback row).
- On drop, the UI optimistically reorders and calls `reorderZones` with the new id array (excluding fallback).
- On failure, the UI reverts to the server order and shows a toast.
- Keyboard-accessible reordering: `Alt+Up` / `Alt+Down` on a focused row moves it one step.

### 7.5 Validation & Inline Errors

- Country / state / postcode validators run client-side (mirroring server rules) for instant feedback.
- Server-side errors (from `ConvexError`) map to field-level inline errors via the form's error adapter.
- Slug collision: the input field turns red and shows "Slug already in use — try 'us-continental-2'."

### 7.6 Admin Nav

Under Commerce → Settings → Shipping → Zones. Add to `apps/web/src/lib/admin-shell/nav-config.ts` (the existing nav-config) under the "shipping" group if not already present.

---

## 8. Merchant Workflow

**Scenario:** Acme Goods wants to offer USPS Priority Mail to the continental US, Free Shipping for California orders above $75, and block shipping everywhere else.

### Step-by-step (Merchant perspective)

1. **Navigate** to `Admin → Commerce → Settings → Shipping → Zones`. Empty state shown.
2. **Click "Add Zone".**
3. **Name:** "US Continental." Slug auto-fills to `us-continental`.
4. **Countries:** select "United States" from multi-select.
5. **States:** the states multi-select appears (one country selected). Merchant clicks "Select all" then unticks Alaska and Hawaii.
6. **Postcode rules:** leave empty (all continental US addresses accepted).
7. **Priority:** defaults to 10 (first real zone).
8. **Save.** Merchant is redirected to edit page. Toast: "Zone saved."
9. **Click "Add shipping methods to this zone".** (Owned by method PRDs — out of scope for A1, but the flow continues for context.) Merchant adds "USPS Priority Mail" live-rate method.
10. **Back to zones list.** Merchant clicks "Add Zone" again.
11. **Name:** "California." Slug `california`. Countries `US`. States `California` only.
12. **Save.** Merchant adds Free Shipping method with `min_order: 75.00`.
13. **Priority management:** back on the zones list, merchant drags "California" above "US Continental" so California is evaluated first. Because of first-match-wins, a California customer ordering $100 now gets only the Free Shipping option, not USPS Priority.
14. **Add a fallback-zone step is SKIPPED** — because the merchant wants shipping only to US continental + California. No fallback zone = no shipping offered anywhere else. Checkout will show "No shipping methods available" for out-of-zone addresses.
15. **Alternative:** if the merchant later decides to offer international shipping, they create a "Rest of World" zone with `isFallback=true`, add a single Flat Rate method at $50, and save.

### Time to configure

For a simple "one country, multiple states" setup, a merchant familiar with WooCommerce should complete this in under two minutes. No documentation lookup required.

---

## 9. Storefront UX

**Zones are invisible to the customer.** The storefront never renders "You are in zone X" or similar. Zones are pure routing logic for the rate calculator.

### 9.1 Checkout flow

1. Customer enters shipping address (country + state + postcode).
2. Checkout page calls `matchZoneForAddress({ countryCode, state, postalCode })` via the public query.
3. If a zone is returned, the Rate Calculation Pipeline (PRD A7) fetches methods for that zone and presents them as shipping options.
4. If `null` is returned, the checkout page displays: "We don't currently ship to this address. Please try a different address or contact support." The "Continue to payment" button is disabled.

### 9.2 Address-change reactivity

- As the customer edits their address, the zone match re-runs with each meaningful change (country, state, postcode prefix). Convex's reactivity handles this automatically.
- The UI debounces postcode input by 300ms to avoid thrashing.
- If the matched zone changes, the list of shipping methods swaps in place. Previously selected method is retained if still available in the new zone; otherwise cleared.

### 9.3 Cart "Shipping estimate" widget

- Pre-checkout cart pages may offer a "Calculate shipping" widget that collects country + state + postcode and calls `matchZoneForAddress` plus the rate pipeline.
- This widget is owned by the Cart UI PRD; this PRD just provides the query it calls.

### 9.4 No customer-facing labels

The zone `name` and `description` are for merchant use only. They are NEVER rendered on the storefront. Method names and carrier names are what customers see.

---

## 10. Edge Cases

### 10.1 Overlapping zones

Two zones both match the same address.

**Resolution:** The zone with the lower `sortOrder` wins. Ties (equal `sortOrder`) broken by earlier `_creationTime`. Merchants are expected to manage priorities; the UI pins a sort order column and encourages explicit ordering.

### 10.2 No zone matches

No enabled zone (including fallback) matches the address.

**Resolution:** `matchZoneForAddress` returns `null`. Checkout disables the "Continue to payment" CTA and shows a "No shipping available" message. Order cannot be placed with this address.

### 10.3 Unknown country codes

Customer's address has a country code not recognized by ISO 3166-1 (e.g. due to stale browser locale or bad input upstream).

**Resolution:** The matching function treats the country as "no match" — returns `null`. Address validation (PRD A4) should reject the code earlier, but the zone system does not crash on unknown codes.

### 10.4 Postcode wildcards at start

The grammar forbids leading wildcards (`*210`). This is enforced at save time. Existing legacy data entered before the validator shipped is migrated by trimming leading `*`s and logging a warning.

### 10.5 Postcode range across formats

A numeric range (`90000...99999`) is evaluated as integers after stripping non-digit characters. A Canadian-style rule (`K1A...M5V`) is rejected at save time. Mixed-format CSV (`90210, K1A 0B1`) is allowed — each CSV child is evaluated individually.

### 10.6 Empty zone (no countries, not fallback)

A zone with `countries: []` and `isFallback: false` can never match any address.

**Resolution:** The save mutation REJECTS this with `SHIPPING_ZONE_INVALID_COUNTRY` unless `isFallback=true`. A zone must have either at least one country OR be the fallback zone.

### 10.7 Fallback zone with geography

A fallback zone with any countries, states, or postcode rules defined.

**Resolution:** Rejected at save time with `SHIPPING_ZONE_FALLBACK_HAS_GEO`. The fallback is by definition "everything not already matched."

### 10.8 Two fallback zones

Merchant attempts to set `isFallback=true` on a second zone.

**Resolution:** Rejected with `SHIPPING_ZONE_FALLBACK_CONFLICT`. The merchant must first unset the existing fallback via `setFallbackZone({ zoneId: null })` or by editing the current fallback zone.

### 10.9 Deleting the only zone

Merchant deletes the last remaining zone.

**Resolution:** Allowed. Checkout will then return `null` for every address — effectively disabling shipping. No implicit "undelete" or "re-create default." Merchants are responsible for creating zones.

### 10.10 Deleting a zone with active methods

Zone has `commerce_shipping_zone_methods` rows.

**Resolution:** Delete cascades. A confirmation dialog shows the method count: "This zone has 3 methods configured. They will also be deleted. Continue?" No soft-delete or recovery.

### 10.11 Zone disabled while customers have it selected

Customer has a checkout session with a shipping method tied to a zone that just got disabled.

**Resolution:** On the next rate re-quote (triggered by any cart/address change), the zone is skipped, a different zone may match, and the method list refreshes. If the customer has already placed the order and it's in payment phase, the snapshot on the order (PRD D5) preserves the original zone/method — historical integrity.

### 10.12 Country-only zone matching a state-less address

Zone `{ countries: ["JP"], states: [], postalCodeRules: [] }`. Customer enters a Japanese address with no state provided (Japan uses prefectures but many checkout forms omit them).

**Resolution:** State check is SKIPPED when `zone.states` is empty. Match succeeds on country alone.

### 10.13 Concurrent reorder

Two admins simultaneously drag-reorder zones.

**Resolution:** Last write wins. Convex serializes mutations. The second admin's optimistic UI will briefly show the wrong order, then Convex's reactive query pushes the authoritative order to both clients. No data corruption.

### 10.14 Slug collision on duplicate

Merchant clicks "Duplicate" on a zone.

**Resolution:** The duplicate mutation appends `-copy`, then `-copy-2`, etc., until the slug is unique. Name gets `" (Copy)"` appended.

### 10.15 Postcode case sensitivity

UK postcode `sw1a 1aa` vs zone rule `SW1A*`.

**Resolution:** Both are uppercased before matching. Input is also whitespace-trimmed. Both match.

---

## 11. Testing Requirements

### 11.1 Unit tests — `zoneMatchesAddress` helper (pure function)

Test cases, at minimum:

1. US + California address → zone `{countries:["US"], states:["CA"]}` → MATCH.
2. US + Oregon address → zone `{countries:["US"], states:["CA"]}` → NO MATCH.
3. US address with postcode `90210` → zone `{countries:["US"], postalCodeRules:["90*"]}` → MATCH.
4. US address with postcode `12345` → zone `{countries:["US"], postalCodeRules:["90*"]}` → NO MATCH.
5. US address with postcode `95000` → zone `{countries:["US"], postalCodeRules:["90000...95000"]}` → MATCH (inclusive).
6. US address with postcode `95001` → zone `{countries:["US"], postalCodeRules:["90000...95000"]}` → NO MATCH.
7. UK address with postcode `SW1A 1AA` → zone `{countries:["GB"], postalCodeRules:["SW1A*"]}` → MATCH (case-insensitive, whitespace-tolerant).
8. US address, country-only zone `{countries:["US"], states:[], postalCodeRules:[]}` → MATCH.
9. Empty-country fallback zone handled via matching algorithm (not helper) — helper returns false for empty country list.
10. CSV rule `"90210,90211,K1A 0B1"` matches each entry individually.
11. Leading-zero postcode `"07001"` matches range `"00000...10000"` without octal interpretation.

### 11.2 Integration tests — `matchZoneForAddress` query

1. Two overlapping zones: lower `sortOrder` wins.
2. Disabled zone skipped even if it would match.
3. Fallback zone matches when no other zone matches.
4. Fallback zone NOT used when another zone matches.
5. No fallback + no match → returns `null`.
6. Zone deleted mid-query-replay: results exclude deleted zone in next tick.

### 11.3 Mutation tests

1. `createZone` with valid args → succeeds, emits event.
2. `createZone` with duplicate slug → slug auto-suffixed.
3. `createZone` with invalid country code → `SHIPPING_ZONE_INVALID_COUNTRY`.
4. `createZone` with invalid postcode rule → `SHIPPING_ZONE_INVALID_POSTCODE_RULE`.
5. `createZone` with multi-country + states → `SHIPPING_ZONE_STATES_MULTI_COUNTRY`.
6. `createZone` with isFallback=true when fallback exists → `SHIPPING_ZONE_FALLBACK_CONFLICT`.
7. `updateZone` cascades slug change uniquely.
8. `deleteZone` cascades method rows.
9. `deleteZone` on fallback-with-other-zones → succeeds (fallback removal is allowed).
10. `reorderZones` rewrites sortOrder deterministically.
11. Unauthenticated caller → `requireCan` throws.
12. Caller without `admin.shipping.zones.manage` capability → throws.

### 11.4 Admin UX tests (Playwright)

1. Create a zone via the "Add Zone" flow end-to-end.
2. Drag-reorder two zones and verify order persists on reload.
3. Delete a zone with methods; confirmation dialog appears and cascade works.
4. Toggle enable/disable and verify checkout immediately reflects change.
5. Attempt to save invalid postcode rule; inline error shown.
6. Slug collision handled gracefully.

### 11.5 Performance

- `matchZoneForAddress` MUST complete in < 20 ms for a merchant with up to 50 zones and 1000 postcode rules across all zones. Achieved via in-memory evaluation — Convex `.collect()` on `commerce_shipping_zones` is O(n) where n is zone count; acceptable below 1000 zones.
- `listZones` MUST return within 50 ms for 50 zones.

### 11.6 Data migration test

- Start with the legacy schema shape. Run migration. Assert all existing zones have `isFallback=false`, `slug` populated, `description=undefined`, `createdBy=undefined`, `updatedBy=undefined`, and matching behavior is unchanged.

---

## 12. Success Criteria

The Shipping Zones System is considered complete when:

1. **Schema deployed.** `commerce_shipping_zones` has the target shape from §4.2. All indexes present. Migration of existing rows complete.
2. **Mutations implemented.** All six mutations in §6.2 pass their test suite. Error codes match §6.5.
3. **Queries implemented.** All five queries in §6.3 return correct data. Public `matchZoneForAddress` gated by `requireCommerceEnabled`.
4. **Admin UX shipped.** The list table, create page, and edit page exist at the routes in §7.1, pass visual QA, and honor keyboard accessibility.
5. **Drag-to-reorder works.** Including optimistic update, server reconciliation, keyboard fallback, and fallback-zone pinning.
6. **Postcode grammar enforced.** All four forms in §5.3 validate correctly both client- and server-side. Invalid rules rejected with clear inline errors.
7. **Fallback zone semantics correct.** Exactly one permitted; required-empty geography enforced; forced to last in evaluation order.
8. **Events fire.** All four events in §14 emit on the correct mutations with correct payloads. Verified via the Event Dispatcher System's listener test harness.
9. **Capability wired.** `admin.shipping.zones.manage` exists in the Role & Capability System, assigned by default to Administrator, and required by every mutation.
10. **Audit log entries written.** Every mutation produces a structured audit log entry.
11. **Checkout integration verified.** Replacing a zone mid-checkout updates available methods in real time.
12. **Parity smoke-test with WooCommerce.** A sample WooCommerce zones export (10 zones, mixed geography, fallback) imports cleanly into ConvexPress zones and produces identical match outcomes for a battery of 50 sample addresses.

---

## 13. Roles & Capabilities

### 13.1 New Capability

**`admin.shipping.zones.manage`** — full control over shipping zones (create, update, delete, reorder, enable/disable, set fallback).

### 13.2 Default Role Assignment

| Role           | `admin.shipping.zones.manage` |
|----------------|-------------------------------|
| Administrator  | Yes                           |
| Editor         | No                            |
| Author         | No                            |
| Contributor    | No                            |
| Subscriber     | No                            |

Shipping configuration is store-management-level. Only administrators touch it by default. Merchants running multi-admin stores can explicitly grant this capability to a custom role via the Role & Capability System admin UI (no code change required).

### 13.3 Read-only Access

There is no separate `admin.shipping.zones.view` capability. The list and detail queries reuse `admin.shipping.zones.manage`. Future PRDs may introduce a read-only capability if a "shipping analyst" role emerges.

### 13.4 Public Access

`matchZoneForAddress` (public query) is callable by any authenticated or unauthenticated storefront visitor, subject only to `requireCommerceEnabled`. It returns zone identity + method count — no merchant-internal data.

---

## 14. Events Fired

All events flow through the Event Dispatcher System (`convex/helpers/events.ts::emitEvent`). Payloads are typed and stable.

### 14.1 `shipping.zone.created`

**When:** After successful `createZone` insert.

**Payload:**
```json
{
  "zoneId": "Id<commerce_shipping_zones>",
  "name": "string",
  "slug": "string",
  "countries": ["string"],
  "stateCount": 0,
  "postcodeRuleCount": 0,
  "isFallback": false,
  "sortOrder": 10,
  "createdBy": "Id<users> | null",
  "createdAt": 0
}
```

### 14.2 `shipping.zone.updated`

**When:** After successful `updateZone`, `setFallbackZone` (for both affected zones), or `toggleZoneEnabled`.

**Payload:**
```json
{
  "zoneId": "Id<commerce_shipping_zones>",
  "changedFields": ["countries", "enabled"],
  "previous": { "enabled": true, "...": "..." },
  "current": { "enabled": false, "...": "..." },
  "updatedBy": "Id<users> | null",
  "updatedAt": 0
}
```

### 14.3 `shipping.zone.deleted`

**When:** After successful `deleteZone`.

**Payload:**
```json
{
  "zoneId": "Id<commerce_shipping_zones>",
  "name": "string",
  "slug": "string",
  "cascadedMethodCount": 0,
  "deletedBy": "Id<users> | null",
  "deletedAt": 0
}
```

### 14.4 `shipping.zone.reordered`

**When:** After successful `reorderZones`.

**Payload:**
```json
{
  "orderedZoneIds": ["Id<commerce_shipping_zones>"],
  "previousOrder": ["Id<commerce_shipping_zones>"],
  "reorderedBy": "Id<users> | null",
  "reorderedAt": 0
}
```

### 14.5 Event Consumers (Known)

- **Audit Log System** — writes all four events to the audit trail.
- **Rate Cache Invalidation (future PRD A7 concern)** — on any zone event, invalidate cached `commerce_shipping_rate_quotes` that were derived from the affected zone.
- **Admin notification (future)** — site notification to all admins when the fallback zone is disabled, warning that international shipping is effectively off.

---

## 15. References

### 15.1 WooCommerce (primary model)

- WooCommerce Shipping Zones documentation: `https://woocommerce.com/document/setting-up-shipping-zones/`
- WooCommerce REST API `shipping/zones` endpoint: `https://woocommerce.github.io/woocommerce-rest-api-docs/#shipping-zones`
- WooCommerce core source, `includes/class-wc-shipping-zones.php` and `includes/class-wc-shipping-zone.php` — the canonical matching algorithm, especially `get_matching_zone`.

### 15.2 Shopify

- Shopify Shipping Profiles and Zones: `https://help.shopify.com/en/manual/shipping/understanding-shipping/shipping-zones`. ConvexPress follows WooCommerce semantics, not Shopify's "profiles per product" model. Shopify is referenced for storefront UX cues only.

### 15.3 BigCommerce

- BigCommerce Shipping Zones: `https://support.bigcommerce.com/s/article/Shipping-Settings`. Again, used for UX comparison, not schema.

### 15.4 ISO Standards

- ISO 3166-1 alpha-2 — country codes.
- ISO 3166-2 — subdivision codes (used minus the country prefix).

### 15.5 Internal ConvexPress References

- `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` — existing schema (§4.2 extends).
- `ConvexPress-Admin/packages/backend/convex/shipping/internals.ts` — existing `matchZoneForAddress` (§6.3 formalizes).
- `ConvexPress-Admin/packages/backend/convex/shipping/helpers.ts` — existing `zoneMatchesAddress` (§5.2 re-specifies).
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.zones.tsx` — existing route (§7.1 rebuilds).
- Event Dispatcher System (`specs/ConvexPress/systems/event-dispatcher-system/PRD.md`) — upstream platform service.
- Role & Capability System (`specs/ConvexPress/systems/role-capability-system/PRD.md`) — upstream platform service.
- Audit Log System (`specs/ConvexPress/systems/audit-log-system/PRD.md`) — upstream platform service.

### 15.6 Related Shipping PRDs in This Set

- Shipping Classes System (PRD A2) — class-based overlay on top of zones.
- Shipping Packaging System (PRD A3).
- Shipping Address Validation (PRD A4).
- Rate Request Context (PRD A5).
- Rate Response Normalization (PRD A6).
- Rate Calculation Pipeline (PRD A7).
- Flat Rate Shipping (PRD B1).
- Weight-Based Shipping (PRD B2).
- Price-Based Shipping (PRD B3).
- Free Shipping (PRD B4).
- Local Pickup (PRD B5).
- Table Rate Shipping (PRD B6).
- Live Rate — USPS (PRD B7), UPS (PRD B8), FedEx (PRD B9), DHL (PRD B10).
- ShipStation Integration (PRD C1), UPS Direct (C2), USPS Direct (C3), FedEx Direct (C4), DHL Direct (C5).
- Order Shipping Snapshot (PRD D5), Shipping Tax Correlation (PRD D3).

---

**End of PRD A1 — Shipping Zones System.**
