# Shipping Classes System — PRD A2

**System ID:** `shipping-classes-system`
**PRD ID:** A2
**Layer:** A — Core Infrastructure
**Status:** Draft
**Owner:** Commerce / Shipping Domain
**Parity Target:** WooCommerce Shipping Classes (1:1 behavior)

---

## 1. Context & Intent

ConvexPress merchants need to differentiate shipping cost by product *type*, not just by destination or weight. A merchant selling a mix of small electronics, furniture, and hazardous liquids cannot reasonably charge the same flat rate for all three. Shipping Classes are the mechanism that lets a single shipping method (Flat Rate, Weight-Based, Dimensional, Table Rate) produce *different* rates based on what is in the cart.

This PRD introduces the **Shipping Classes System** — a foundational Layer A component that sits beneath every rate-calculating shipping method. It provides:

- A normalized catalog of named classes (e.g., "Fragile", "Heavy", "Hazmat", "Small Parcel", "Oversized") that merchants can create, rename, and retire.
- A single-class assignment on each product (and optionally on each variant) that overrides the parent's class.
- A stable identifier that shipping methods (PRDs B1, B2, B3, B9) can use to declare per-class rate overrides.
- A mixed-cart resolution rule (highest class wins vs. sum of class rates) that determines how carts containing multiple classes are priced.

This system is a direct port of WooCommerce's shipping-class concept, with only two deliberate deviations: (a) classes are stored in Convex with real-time reactivity so class edits propagate to open cart sessions instantly, and (b) variant-level overrides are first-class rather than a plugin feature.

Without this system, the only rate differentiation available to merchants is zone and weight — which is insufficient for any catalog with mixed product types. Shipping Classes are therefore a hard prerequisite for the first shipping-method PRD to ship.

### Intent in One Sentence

Give merchants a WordPress-familiar way to tag products with a shipping class so that shipping methods can charge different rates for different classes of goods.

---

## 2. Scope

### In Scope

- A new `commerce_shipping_classes` table storing the class catalog (name, slug, description, sort order, timestamps).
- A new optional `shippingClassId` field on `commerce_products` and `commerce_product_variants` pointing to a class.
- Variant inheritance: a variant with `shippingClassId = undefined` inherits its parent product's class; a variant with an explicit id overrides it.
- Admin CRUD at `/admin/commerce/settings/shipping/classes` modeled on WooCommerce's Shipping Classes screen: list table, inline edit, add-new row, delete with confirmation, usage counter per class.
- A bulk-assign action on the products list table (`/admin/commerce/products`) and variants UI for assigning classes to many products at once.
- Integration contract (query surface) that Flat Rate (B1), Weight-Based (B2), Dimensional (B3), Table Rate (B9), and the Rate Calculation Pipeline (A7) consume.
- A site-level **Mixed Cart Rule** setting: `"per_class_sum"` (add per-class costs together) or `"highest_class"` (apply only the highest-class cost). Merchant-configurable on the shipping settings page.
- Events published on class lifecycle changes for downstream caching and audit.
- Capability checks so only users with `commerce.shipping.manage` can mutate the class catalog.
- Usage protection: a class in use cannot be hard-deleted without a reassignment or confirmation step.

### Out of Scope

- Multi-class-per-product. WooCommerce parity is strict: one class per product, one per variant override. If a future need arises for a product to belong to multiple classes (e.g., "Fragile" AND "Oversized"), it will be handled by the Rate Calculation Pipeline (PRD A7) synthesizing effective class sets, not by making classes many-to-many on the product.
- Per-class tax behavior. Tax classes are a separate concept handled by the Tax System PRDs (outside this decomposition).
- Zone-specific class rates. A class rate applies inside a zone's method configuration; zones themselves are owned by the Shipping Zones System (PRD A1). This PRD only defines the class; the method PRDs define per-class overrides scoped to a zone+method.
- Automatic class assignment by rule (e.g., "auto-tag any product over 50 lb as Heavy"). That is a future enhancement and belongs to an automation system, not this one.
- Customer-facing shipping class labels on the storefront product page. Classes are internal categorization; their names may surface in checkout rate explanations (opt-in) but not on product pages.
- Bulk import of classes. Classes are few (typically 3-8 per merchant) and created by hand.

---

## 3. Dependencies

### Upstream (this system requires)

- **Product Catalog** — the `commerce_products` and `commerce_product_variants` tables defined in `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts` must exist and support schema extension. This PRD adds `shippingClassId` to both.
- **Role & Capability System** — for the `commerce.shipping.manage` capability used to gate mutations.
- **Event Dispatcher System** — for emitting `shipping.class.*` events.
- **Settings System** — for storing the site-wide `shipping.mixedCartRule` setting.
- **Audit Log System** — class mutations produce audit entries.

### Downstream (consumers of this system)

- **Rate Calculation Pipeline (PRD A7)** — queries the class of every cart line to assemble the class set before invoking method rate resolvers.
- **Flat Rate Shipping (PRD B1)** — configures a default rate plus optional per-class rate overrides.
- **Weight-Based Shipping (PRD B2)** — uses class to pick the correct weight-band table.
- **Dimensional Shipping (PRD B3)** — uses class to select the dimensional divisor and surcharge profile.
- **Table Rate Shipping (PRD B9)** — uses class as a row dimension in the rate matrix.
- **Shipping Zones System (PRD A1)** — zones do not depend on classes, but the zone UI surfaces the per-class rate grid for each method attached to a zone.
- **Product List Table UI** — adds a "Shipping Class" column and bulk-assign action.
- **Product Editor UI** — adds a Shipping Class field in the product metabox (and on the variant row for variable products).

### Sibling / Coordinated

- **Shipping Zones System (PRD A1)** — parallel Layer A system. Zones and classes are orthogonal; they intersect only inside method configuration.

---

## 4. Schema

All schema additions live in `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts`. Modifications to `commerce_products` and `commerce_product_variants` live in `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts`.

### 4.1 New Table: `commerce_shipping_classes`

```
commerce_shipping_classes
  name: string                          // "Fragile", "Heavy", "Hazmat", display label
  slug: string                          // "fragile", "heavy", "hazmat", URL/machine safe, globally unique
  description: optional string          // Internal merchant notes, shown in admin only
  sortOrder: number                     // Ascending sort for admin list and method config UI; default 0
  createdAt: number                     // Unix ms
  updatedAt: number                     // Unix ms
  createdBy: id("users")                // Audit: who created it
  updatedBy: optional id("users")       // Audit: who last updated it

  indexes:
    by_slug              [slug]         // Unique slug lookup
    by_sort_order        [sortOrder, name]
    by_created_at        [createdAt]
```

### 4.2 Optional Table: `commerce_shipping_class_assignments`

**Decision: NOT introduced in the v1 of this PRD.**

Rationale: WooCommerce parity dictates one class per product. The assignment can therefore live as a direct `shippingClassId` field on `commerce_products` and `commerce_product_variants` without a join table. A join table would only be necessary if a product could belong to multiple classes, which is explicitly out of scope (Section 2).

If a future PRD ever introduces multi-class membership, that PRD — not this one — will add `commerce_shipping_class_assignments`.

### 4.3 Modifications to `commerce_products`

Add to the `commerce_products` table definition in `convex/schema/commerce.ts`:

```
shippingClassId: optional id("commerce_shipping_classes")
```

Index addition:

```
by_shipping_class    [shippingClassId]    // For "count products per class" and bulk operations
```

Semantics:
- `undefined` means the product has no class, which maps to the method's default rate.
- A valid id means the product belongs to that class.
- If the referenced class is deleted, migration policy is defined in Section 10 (Edge Cases).

### 4.4 Modifications to `commerce_product_variants`

Add to the variants table:

```
shippingClassId: optional id("commerce_shipping_classes")
```

Index:

```
by_shipping_class    [shippingClassId]
```

Semantics:
- `undefined` on a variant means the variant *inherits* from its parent product. This is different from the product-level `undefined`, which means "no class."
- A valid id on a variant overrides the parent's class for that variant only.
- Resolution happens at rate-calculation time: the pipeline (PRD A7) reads variant first, then falls back to parent product.

### 4.5 Settings Entry

A single settings row owned by the Settings System, keyed by:

```
key: "commerce.shipping.mixedCartRule"
value: "per_class_sum" | "highest_class"
default: "per_class_sum"
```

This drives the cart resolution rule in Section 5.3.

---

## 5. Data Model

### 5.1 Class Catalog

The class catalog is a flat list. No hierarchy, no parent classes, no nesting. Sort order is for merchant convenience when reading the list, not for cost rollups.

Typical starter catalog (not seeded — merchant creates manually):
- Small Parcel
- Standard
- Oversized
- Heavy
- Fragile
- Hazmat

Slugs must be unique and are validated against a `[a-z0-9-]+` regex. Name collisions on case-insensitive match are rejected. Slugs are editable; changing a slug does not rewrite references because references are by id, not slug.

### 5.2 Product/Variant → Class Relationship

Many-to-one: many products point to one class; a class has many products. The product side holds the id, keeping reads cheap (indexed lookup by `shippingClassId` on the products table).

Variant inheritance diagram (logical):

```
Product P     shippingClassId = "fragile_id"
  Variant V1  shippingClassId = undefined         → resolves to "fragile_id" (inherits)
  Variant V2  shippingClassId = "heavy_id"        → resolves to "heavy_id"   (overrides)
  Variant V3  shippingClassId = undefined         → resolves to "fragile_id"
```

Product with no class:

```
Product Q     shippingClassId = undefined
  Variant V1  shippingClassId = undefined         → resolves to undefined    (no class → method default)
  Variant V2  shippingClassId = "small_parcel_id" → resolves to "small_parcel_id"
```

### 5.3 Method Rate Overrides per Class

Each shipping method (owned by PRDs B1–B9) stores a configuration shape roughly:

```
methodConfig = {
  defaultRate: number,
  perClassRates: {
    [shippingClassId]: number   // Override for this class
  }
}
```

The keys of `perClassRates` are `Id<"commerce_shipping_classes">` values. Products without a class and products with a class not present in `perClassRates` both fall back to `defaultRate`.

This PRD defines the *shape* that method PRDs must honor, but does not implement the per-class editor UI — that belongs to each method PRD. This PRD only exposes the class list via a query surface the method editors consume.

### 5.4 Cart-Level Class Set

At rate-calculation time, the Rate Calculation Pipeline (PRD A7) walks the cart line items and assembles:

```
cartClassSet = [
  { classId: Id | undefined, lineItems: CartLine[], totalQuantity: number }
]
```

The pipeline then applies the Mixed Cart Rule:

**`"per_class_sum"`** (default, WooCommerce "Per class" behavior):
- For each distinct class present in cart, compute the method's class rate (or default if no override).
- Sum them.
- Items with no class contribute the default rate **once** (not per item) to the sum.

**`"highest_class"`** (WooCommerce "Per order" behavior):
- For each distinct class present in cart, compute the method's class rate.
- Apply only the single highest value.
- Items with no class count as `defaultRate`.

This rule is site-wide in v1. A future PRD may promote it to per-method configuration if merchants need mixed behavior.

### 5.5 Reactivity

Because classes live in Convex, any class mutation (rename, delete, sort reorder) propagates to open admin sessions and to cart rate quotes in real time. Merchants editing a class will see the Products list-table "Shipping Class" column update live.

---

## 6. Functions / API

All functions live in the new directory `ConvexPress-Admin/packages/backend/convex/shipping/classes/`:

- `mutations.ts` — public mutations
- `queries.ts` — public queries
- `internals.ts` — internal helpers used by the Rate Calculation Pipeline
- `validators.ts` — shared Zod/convex-values validators for class args

### 6.1 Mutations

All mutations require `commerce.shipping.manage` capability (Section 13).

**`shipping.classes.create`**
- Args: `{ name: string, slug?: string, description?: string, sortOrder?: number }`
- Behavior: auto-derives slug from name if not provided; rejects duplicates on `slug` or case-insensitive `name`; stamps `createdAt`, `createdBy`.
- Returns: `Id<"commerce_shipping_classes">`
- Emits: `shipping.class.created`

**`shipping.classes.update`**
- Args: `{ classId: Id, name?: string, slug?: string, description?: string, sortOrder?: number }`
- Behavior: partial update; slug uniqueness re-validated if changed; touches `updatedAt`, `updatedBy`.
- Emits: `shipping.class.updated`

**`shipping.classes.delete`**
- Args: `{ classId: Id, reassignTo?: Id | null }`
- Behavior:
  - If the class has any products or variants assigned and `reassignTo` is not supplied, the mutation rejects with a structured error listing usage counts.
  - If `reassignTo` is supplied (another class id or `null` meaning "no class"), the mutation first reassigns all products and variants, then deletes.
  - Deletion is also rejected if any shipping method has a per-class rate override keyed on this class id and the merchant has not confirmed (front-end passes `force: true` after a warning modal — see Section 10).
- Emits: `shipping.class.deleted`

**`shipping.classes.reorder`**
- Args: `{ order: Array<{ classId: Id, sortOrder: number }> }`
- Behavior: batch-updates `sortOrder` on all supplied classes in one mutation.
- Emits: `shipping.class.updated` once per changed row (batched).

**`shipping.classes.assignToProduct`**
- Args: `{ productId: Id, classId: Id | null }`
- Behavior: sets or clears `shippingClassId` on one product. `null` clears the field.
- Emits: `shipping.class.assigned` (with `target: "product"`)

**`shipping.classes.assignToVariant`**
- Args: `{ variantId: Id, classId: Id | null | "inherit" }`
- Behavior: `"inherit"` sets the variant's `shippingClassId` to `undefined` (parent inheritance). `null` explicitly means "no class on this variant, do not inherit." A concrete id overrides.
- Emits: `shipping.class.assigned` (with `target: "variant"`)

**`shipping.classes.bulkAssignToProducts`**
- Args: `{ productIds: Id[], classId: Id | null }`
- Behavior: applies to all products in one batch; skips products the user cannot edit; returns counts of updated/skipped.
- Emits: `shipping.class.assigned` with `bulk: true` and count.

### 6.2 Queries

Most queries require `commerce.read` or are unauthenticated read-only inside rate calculation contexts.

**`shipping.classes.list`**
- Args: `{ search?: string }`
- Returns: `Array<ShippingClass>` sorted by `sortOrder, name`. Optional search does case-insensitive substring match on name and slug.

**`shipping.classes.get`**
- Args: `{ classId: Id }`
- Returns: `ShippingClass | null`

**`shipping.classes.getBySlug`**
- Args: `{ slug: string }`
- Returns: `ShippingClass | null`

**`shipping.classes.getForProduct`**
- Args: `{ productId: Id }`
- Returns: `ShippingClass | null` — the effective class (the product's own, or null if unset). Does not look at variants.

**`shipping.classes.getForVariant`**
- Args: `{ variantId: Id }`
- Returns: `{ effective: ShippingClass | null, inheritedFromParent: boolean }` — resolves variant → parent inheritance.

**`shipping.classes.countProductsByClass`**
- Args: `{}`
- Returns: `Array<{ classId: Id, productCount: number, variantCount: number }>` — drives the usage column in the admin list. Variant count only includes variants that *override* (not inheritors).

**`shipping.classes.listWithUsage`**
- Args: `{}`
- Returns: `Array<ShippingClass & { productCount, variantCount, methodOverrideCount }>` — single round-trip for the admin list table.

### 6.3 Internal Functions

**`internal.shipping.classes.resolveForCartLine`**
- Args: `{ productId: Id, variantId?: Id }`
- Returns: `Id<"commerce_shipping_classes"> | null`
- Used by the Rate Calculation Pipeline (PRD A7). Implements variant-override-then-parent fallback.

**`internal.shipping.classes.resolveBatch`**
- Args: `{ lines: Array<{ productId: Id, variantId?: Id }> }`
- Returns: `Array<Id | null>` in the same order.
- Batched variant of the above to avoid N+1 reads when the cart has many lines.

### 6.4 Validators

Shared validators in `validators.ts`:
- `shippingClassNameValidator` — 1–60 chars, trimmed.
- `shippingClassSlugValidator` — `/^[a-z0-9]+(-[a-z0-9]+)*$/`, 1–60 chars.
- `shippingClassDescriptionValidator` — optional, 0–500 chars.

---

## 7. Admin UX

### 7.1 Class List & Editor

Route: `/admin/commerce/settings/shipping/classes`
File: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.classes.tsx` (new)

Modeled on WooCommerce's `WooCommerce → Settings → Shipping → Shipping classes` screen.

Layout:
- Page header: "Shipping classes" with description "Shipping classes can be used to provide different rates to different classes of product such as heavy items."
- Admin List Table (per admin-list-table-ui conventions):
  - Columns: `Name`, `Slug`, `Description`, `Products`, `Actions`
  - `Products` column shows the count from `listWithUsage`, with a link filtering the products list by that class.
  - `Actions` column: `Edit`, `Delete`, drag handle for sort order.
- Below the table, an "Add shipping class" inline form row with `Name`, `Slug` (auto-derived, editable), `Description`, and `Save` button. Matches WooCommerce's inline add pattern.
- Inline edit: clicking `Edit` converts the row into an editable form in place. No modal.
- Delete: confirmation dialog (the one allowed popup per UI Rules) showing usage counts and — if non-zero — a reassignment dropdown ("Move products to...") before destructive action.
- Drag-and-drop reorder on the drag handle column; reorder calls `shipping.classes.reorder`.

### 7.2 Product Editor Integration

In the product edit screen (`/admin/commerce/products/$productId/edit`), add a **Shipping Class** field inside the Shipping metabox (or the general product data panel, matching WooCommerce's "Shipping" product-data tab).

Field: a searchable select populated by `shipping.classes.list`, with a `— No shipping class —` option at the top. Saving calls `shipping.classes.assignToProduct`.

For variable products, each variant row gets its own Shipping Class select with three options: `Same as parent`, `No shipping class`, and each concrete class. Saving calls `shipping.classes.assignToVariant`.

### 7.3 Products List Table Integration

On `/admin/commerce/products` (the All Products list table):
- New sortable, filterable column `Shipping Class` showing the class name (or `—` for none).
- A filter dropdown `Filter by shipping class` above the table.
- A bulk action `Set shipping class` that, when chosen with rows selected, reveals a class picker and calls `shipping.classes.bulkAssignToProducts`.

### 7.4 Method Config Integration (contract only)

This PRD does not render the per-class rate grid — that is owned by the method PRDs. It does guarantee that method editors receive a stable class list via `shipping.classes.list` that they render as rows in their rate grid. A consistent empty state (`No shipping classes configured yet — add one on the Shipping Classes screen`) should be used by all method editors.

### 7.5 Settings Integration

A single control on `/admin/commerce/settings/shipping`:
- Label: "Shipping calculations for multi-class carts"
- Options: `Sum of per-class rates` (default) / `Charge the highest class's rate only`
- Help text matching WooCommerce's wording where possible, rewritten for ConvexPress terminology.

---

## 8. Merchant Workflow

**Scenario:** A merchant sells glassware and wants to charge +$10 on every order that contains fragile items, on top of a $5 base flat rate.

1. Merchant navigates to `Commerce → Settings → Shipping → Shipping classes`.
2. Clicks **Add shipping class**, enters `Name: Fragile`, accepts auto-slug `fragile`, saves.
3. Navigates to `Commerce → Products`, filters to glassware, selects all, chooses bulk action `Set shipping class → Fragile`, applies.
4. Navigates to `Commerce → Settings → Shipping → Zones → United States → Flat Rate`.
5. In the Flat Rate editor (delivered by PRD B1), sets:
   - `Default rate: $5`
   - Per-class overrides: `Fragile → $15` (the merchant enters the *effective* rate for fragile, not the delta).
6. On `Commerce → Settings → Shipping`, leaves the Mixed Cart Rule at `Sum of per-class rates`.
7. Tests by adding a glassware item plus a non-fragile item to a cart. Checkout quote shows `$15 (Fragile) + $5 (default) = $20`.

**Alternative workflow — variant override:**

A merchant has a t-shirt product ("Standard" class) but one specific oversized 5XL variant needs to ship as Heavy. On the product editor's variants panel, the merchant sets the 5XL row's Shipping Class to `Heavy`, overriding the parent's `Standard`. All other variants continue to inherit `Standard`.

**Alternative workflow — deleting a class in use:**

Merchant renames their catalog and wants to remove the "Hazmat" class.
1. Clicks Delete on the Hazmat row.
2. Confirmation dialog appears: "Hazmat is assigned to 4 products and 2 variants, and is used by 1 shipping method. Reassign to another class:" with dropdown including `— No shipping class —`.
3. Merchant picks `No shipping class`, confirms. All 4 products and 2 variants have their `shippingClassId` cleared. The Hazmat row in any method's per-class grid is removed. The class record is deleted.

---

## 9. Storefront UX

Shipping classes are an internal taxonomy. They have no required customer-facing presentation.

- **Product page:** No class badge or label appears by default. A future PRD may introduce an opt-in "Shipping notes" block where a class's `description` surfaces, but this PRD does not require it.
- **Cart page:** No class information shown.
- **Checkout → shipping rate selection:** The rate line items are labeled by method name ("Flat Rate — $20"), not by class. If the merchant enables the optional "Show rate breakdown" setting (owned by PRD A7), the breakdown may expose class-level contributions: `Fragile (1 item) — $15, Standard (1 item) — $5`. This PRD exposes class names to that breakdown but does not render it.
- **Order emails & receipts:** Same — method name only, unless the rate breakdown is enabled.

Class names must therefore be written assuming they might be shown to customers eventually. The admin UI includes a small hint: `This name may appear on checkout if rate breakdown is enabled.`

---

## 10. Edge Cases

**10.1 Product with no class**
Resolution returns `null`. Rate pipeline uses method's `defaultRate`. No error, no warning — this is the standard path for merchants who do not use classes at all.

**10.2 Variant with no override**
Variant's `shippingClassId = undefined`. Pipeline walks up to parent product. If parent also has `undefined`, behaves as 10.1.

**10.3 Variant explicitly with no class, parent has class**
Variant's `shippingClassId = null` (explicit, not `undefined`). Convex cannot distinguish `null` from `undefined` in an optional field directly, so v1 uses a convention: variant UI's `No shipping class` selection writes `shippingClassId = undefined` and expects the parent to also be unset, or accepts inheritance. If a merchant genuinely wants "variant has no class even though parent does," they must clear the parent first, or PRD B1+ will apply an explicit "skip inheritance" sentinel. **Decision: v1 does not support explicit-null-override-of-parent.** The three variant states are `inherit`, `no class (only if parent has no class)`, and `explicit class id`. This matches WooCommerce behavior.

**10.4 Deleting a class that is in use by products**
Blocked without a reassignment. See mutation `shipping.classes.delete` (Section 6.1). Reassignment options: another class id, or `null` (clear assignment).

**10.5 Deleting a class that is referenced by a shipping method's per-class rate override**
The method's `perClassRates[classId]` entry becomes orphaned. Delete mutation detects this and returns a warning listing affected methods; the admin UI shows which methods will lose their override. On confirmation, method PRDs are responsible for garbage-collecting stale keys lazily — their rate resolvers must ignore per-class entries whose `classId` no longer exists in `commerce_shipping_classes`. This PRD publishes a `shipping.class.deleted` event that method systems subscribe to for proactive cleanup if desired.

**10.6 Cart with mixed classes**
See Section 5.3. Governed by `commerce.shipping.mixedCartRule`.

**10.7 Cart with some classed items and some unclassed items**
- Under `per_class_sum`: the unclassed items contribute `defaultRate` once, added to the class sum. (Not once per unclassed item — once total.)
- Under `highest_class`: the unclassed items' `defaultRate` enters the max() comparison alongside class rates. If no class has an override above `defaultRate`, `defaultRate` wins.

**10.8 Variant inherits from a parent whose class was deleted**
After class deletion with reassignment, parent's `shippingClassId` is updated (to the reassign target or cleared). Variant inheritance now resolves to the new value. No variant-level action needed.

**10.9 Class name collision**
Case-insensitive name collisions are rejected. Slugs are validated for uniqueness by index. Attempting to create "Fragile" when "fragile" exists returns a validation error; frontend shows a field error.

**10.10 Slug containing uppercase, spaces, or special characters**
Rejected by `shippingClassSlugValidator`. Auto-derivation from name lowercases, replaces spaces with hyphens, and strips non-`[a-z0-9-]` characters.

**10.11 Deleting the last class**
Allowed. The system has no minimum. With zero classes, all products resolve to "no class" and all rate calculations use method defaults.

**10.12 Product imported from WooCommerce with class name but no class record yet**
The WordPress Sync / Website Import tool (already present in the admin) must either (a) create the missing class record on the fly during import or (b) queue import errors listing unknown classes. This PRD exposes `shipping.classes.create` for the importer to call. Defining import behavior is out of scope for this PRD but the interface supports it.

**10.13 Very large product catalog (100k+ products) and bulk-assign**
`shipping.classes.bulkAssignToProducts` must chunk internally (Convex mutation size limits). v1 chunks at 500 products per mutation call; the admin UI wraps larger selections in a progress bar invoking the mutation repeatedly. Chunking policy is implementation detail for the builder expert.

**10.14 Race condition: class deleted while a checkout is in flight**
The rate calculation pipeline (PRD A7) snapshots the class ids it resolves at the start of a quote. If a class is deleted mid-calculation, the pipeline's in-memory `perClassRates[deletedId]` lookup returns undefined and falls back to `defaultRate`. Quotes already rendered to the customer remain valid for their cached TTL; the next quote refresh uses the updated state. No user-visible error.

**10.15 Sort order collision**
Two classes with identical `sortOrder` are allowed. Ties break by `name` ascending (per the compound index). Reorder mutation always rewrites contiguous integers starting at 0 to prevent drift.

---

## 11. Testing Requirements

### 11.1 Unit Tests (Convex functions)

- `create` rejects duplicate slug.
- `create` rejects case-insensitive duplicate name.
- `create` auto-derives valid slug from name with spaces/uppercase/special chars.
- `update` allows renaming without slug change.
- `update` validates slug on change.
- `delete` without `reassignTo` fails when class has assignments; error payload lists counts.
- `delete` with `reassignTo` updates all products and variants atomically.
- `delete` with `reassignTo = null` clears all references.
- `reorder` applies new sort order to all listed classes; untouched classes unchanged.
- `assignToProduct` with `null` clears.
- `assignToVariant` with `"inherit"` sets variant field to `undefined`.
- `bulkAssignToProducts` chunks at 500, returns accurate counts.
- `getForProduct` returns null when unset.
- `getForVariant` returns parent's class with `inheritedFromParent: true` when variant is unset.
- `getForVariant` returns variant's class with `inheritedFromParent: false` when variant overrides.
- `countProductsByClass` counts variant overrides separately from product totals.
- `resolveBatch` handles 1000-line cart without N+1 reads (measured query count ≤ 3).

### 11.2 Integration Tests

- End-to-end merchant flow from PRD Section 8 (Fragile + $10 scenario) produces expected checkout total.
- Mixed-cart `per_class_sum` math for cart with 3 classes + unclassed items.
- Mixed-cart `highest_class` math for same cart.
- Variant override precedence over parent in rate calculation.
- Class deletion with reassignment preserves all downstream calculations.
- Event emissions: every mutation listed in Section 14 fires the correct event with the correct payload.

### 11.3 UI Tests (Playwright)

- Create a class from the inline add-new row, see it appear in the list without refresh.
- Edit a class inline, observe name update in the Products list table column live.
- Delete a class with usage, confirm the reassignment dialog blocks raw delete.
- Bulk-assign 20 products from the products list; verify the Shipping Class column updates.
- Variant editor: toggle a variant between `Same as parent` / `No shipping class` / concrete class; verify persisted state on reload.
- Settings: toggle Mixed Cart Rule; verify checkout rate recalculates.

### 11.4 Performance

- `listWithUsage` on a catalog of 100k products, 20 classes, returns under 500 ms (indexed aggregate).
- `resolveBatch` for a 50-line cart returns under 50 ms.

### 11.5 Capability Tests

- Non-admin without `commerce.shipping.manage` cannot call any mutation.
- Editor role can read classes but cannot mutate.
- Author role cannot even read via admin queries.

---

## 12. Success Criteria

The Shipping Classes System is considered complete when:

1. **Schema deployed.** `commerce_shipping_classes` table and the `shippingClassId` fields on products and variants exist in the production Convex schema with their indexes.
2. **CRUD working.** Merchants can create, rename, reorder, and delete classes via the admin UI without developer help.
3. **Assignment working.** Merchants can assign a class to a product individually, to a variant individually, and to many products at once via bulk action.
4. **Query surface stable.** `shipping.classes.list`, `resolveForCartLine`, and `resolveBatch` are callable and documented; PRDs B1, B2, B3, B9, and A7 are unblocked.
5. **Events firing.** All four events in Section 14 are published and observable in the Event Dispatcher's listener console.
6. **Mixed cart rule applied.** Both `per_class_sum` and `highest_class` behaviors pass their integration tests.
7. **Deletion safety enforced.** Attempting to delete an in-use class through the API or UI always presents reassignment before destruction.
8. **Variant inheritance correct.** `getForVariant` returns the documented precedence: variant override > parent product > null.
9. **Parity verified.** A WooCommerce merchant migrating in can replicate their Shipping Classes configuration 1:1 in ConvexPress.
10. **No downstream blockers.** PRD A7 (Rate Calculation Pipeline) can be implemented on top of this system without requiring schema or API changes here.

---

## 13. Roles & Capabilities

All new capabilities are registered by the Role & Capability System. These are the only capabilities this PRD introduces or requires:

| Capability | Description | Default Roles |
|---|---|---|
| `commerce.shipping.manage` | Create, edit, delete shipping classes; configure mixed-cart rule; bulk-assign. | Administrator |
| `commerce.shipping.read` | Read the class list and usage counts. | Administrator, Editor |
| `commerce.product.edit` (existing) | Required in addition to `commerce.shipping.manage` for bulk-assign on products — the bulk operation respects per-product edit permissions. | Administrator, Editor, Author (own products only) |

Role matrix for the class admin page:

| Role | View list | Create | Edit | Delete | Reorder | Bulk assign | Mixed-cart rule |
|---|---|---|---|---|---|---|---|
| Administrator | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Editor | Yes | No | No | No | No | Yes (on products they can edit) | No |
| Author | No | No | No | No | No | Only on own products | No |
| Contributor | No | No | No | No | No | No | No |
| Subscriber | No | No | No | No | No | No | No |

The products list table's Shipping Class column is readable by anyone with `commerce.product.read`.

---

## 14. Events Fired

All events use the Event Dispatcher System and follow the `{domain}.{entity}.{action}` naming convention.

**`shipping.class.created`**
- Payload: `{ classId: Id, name: string, slug: string, createdBy: Id<"users">, createdAt: number }`
- Emitted by: `shipping.classes.create`
- Subscribers (expected): Audit Log, any in-memory cache of the class list in the admin UI.

**`shipping.class.updated`**
- Payload: `{ classId: Id, changes: Partial<ShippingClass>, updatedBy: Id<"users">, updatedAt: number }`
- Emitted by: `shipping.classes.update`, `shipping.classes.reorder`
- Subscribers: Audit Log, rate-quote cache invalidator (classes renamed do not change math but may change breakdown labels).

**`shipping.class.deleted`**
- Payload: `{ classId: Id, name: string, slug: string, reassignedTo: Id | null, affectedProductCount: number, affectedVariantCount: number, affectedMethodIds: Id[], deletedBy: Id<"users"> }`
- Emitted by: `shipping.classes.delete`
- Subscribers: Audit Log, method PRDs (for optional eager cleanup of `perClassRates[deletedId]` keys), Rate Calculation Pipeline (cache invalidation).

**`shipping.class.assigned`**
- Payload: `{ target: "product" | "variant", targetId: Id, previousClassId: Id | null, newClassId: Id | null, bulk: boolean, bulkCount?: number, assignedBy: Id<"users"> }`
- Emitted by: `shipping.classes.assignToProduct`, `shipping.classes.assignToVariant`, `shipping.classes.bulkAssignToProducts` (once per operation with `bulk: true` and `bulkCount` set).
- Subscribers: Audit Log, rate-quote cache invalidator, Search System (if shipping class becomes a facet).

Events are fire-and-forget from the mutation's perspective. Listener failures do not roll back the mutation.

---

## 15. References

### WooCommerce

- WooCommerce Shipping Classes docs: https://woocommerce.com/document/product-shipping-classes/
- WooCommerce REST API Shipping Classes endpoint — used as reference for field shapes (`name`, `slug`, `description`).
- WooCommerce `WC_Shipping_Flat_Rate` class — source of the "Per class" vs "Per order" calculation type; ported here as `per_class_sum` vs `highest_class`.

### Shopify (for contrast)

- Shopify's "shipping requirements" per product (weight, country of origin, HS code) rather than a named class taxonomy. ConvexPress follows the WooCommerce model because it gives merchants explicit control of class names, which is what WooCommerce migrants expect.

### Internal

- `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` — target file for new schema.
- `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts` — target file for product/variant field additions.
- `specs/ConvexPress/systems/shipping-zones-system/PRD.md` — sibling Layer A PRD (A1).
- PRD A7 — Rate Calculation Pipeline (downstream consumer; orchestrates class resolution at quote time).
- PRD B1 — Flat Rate Shipping (first method to exercise per-class overrides).
- PRD B2 — Weight-Based Shipping.
- PRD B3 — Dimensional Shipping.
- PRD B9 — Table Rate Shipping.

### Conventions

- ConvexPress `CLAUDE.md` — modular schema rules (Section "Convex Backend Conventions"). This PRD adds files to `convex/schema/shipping.ts` (existing) and creates `convex/shipping/classes/` (new).
- ConvexPress `CLAUDE.md` — UI rules: Base UI only, no popups for content management (confirmation dialogs exempt), full-page admin patterns.

---

**End of PRD A2 — Shipping Classes System**
