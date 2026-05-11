# Product Add-Ons System — PRD

**System ID:** product-addons-system
**Status:** Design / Ready for Implementation
**Owner:** Commerce Domain — Products
**Modeled on:** WooCommerce Product Add-Ons (Automattic), with superset features from Barn2 Product Options, YITH, Studio Wombat APF, and ThemeComplete EPO
**Depends on:** Product System, Cart & Checkout System, Settings System, Media System
**Related:** Product Variations System (orthogonal — see §12), Product Bundles System (orthogonal — see §12), Custom Field System (distinct — see §12)

---

## 1. Context & Intent

Product Add-Ons let a customer **personalize or enhance a single product** without creating new SKUs or separate products. A monogram on a wallet, gift wrap on a toy, an engraving on a watch, a photo upload for a custom mug, a rush-delivery surcharge, a tip on a service, a "name your price" donation — each of these attaches **free-form data and optional price deltas** to a single cart line item.

Variations handle **pre-defined combinatorial SKUs with stock** (Red/Large, Blue/Small). Bundles handle **multiple products sold together**. Add-ons handle **everything else** — anything free-form (text, file, date, number), anything that doesn't need its own stock, and anything that would cause a combinatorial explosion if modeled as variations.

**Intent:** mirror the WooCommerce Product Add-Ons plugin at the baseline (9 field types, 3 pricing models, per-product + global assignment), and match the depth of the top premium plugins where it materially benefits ConvexPress stores (conditional logic, formula/lookup pricing, repeater sections, role scoping, tabbed/accordion/popup layouts, cart-line editing). Because ConvexPress stores sync with WooCommerce via the import pipeline, **add-on definitions imported from WooCommerce Product Add-Ons must round-trip with zero field loss**.

This is a **commerce extension** (following the established pattern for Bundles, Digital, Reviews, Returns, Wishlists, Subscriptions) — schema-gated by a settings flag, navigable via the plugin registry, non-destructive to the core cart flow.

---

## 2. Scope

### 2.1 In-Scope

1. **Add-on field types (22)** — short text, long text, number, quantity, range slider, dropdown, multiselect, radio, checkbox, image swatch, color swatch, text/button swatch, file upload, date, time, datetime, customer-defined price, product/child-product selector, calculation display, heading, HTML/content block, hidden field.
2. **Pricing models (13)** — flat fee (once), flat fee × quantity, percentage of product, per-character, per-word, per-file, per-option (within multi-select), tiered "first N free", formula (math expression referencing other fields), lookup/matrix table, customer-defined price (with min/max), negative values (discounts), quantity-independent add-on.
3. **Conditional logic** — show/hide any field based on values of other fields within the same add-on group, with AND/OR grouping; optionally disable Add-to-Cart until rules satisfied.
4. **Add-on groups** — reusable containers of fields with their own assignment rules, conditional rules, and display layout. Fields live inside groups; groups attach to products.
5. **Assignment scope** — per-product, per-category, per-tag, per-role, global with exclusions. Priority resolution when multiple groups match.
6. **Repeater sections** — duplicate an entire group N times (manually via "+ Add another" or auto-tied to line quantity).
7. **Display layouts** — inline (default), accordion, tabs, popup, stepped wizard.
8. **Validation** — required/optional, min/max character limits, file type whitelist + size limits, min/max selections (checkbox/multiselect), min/max numeric, date ranges, regex for short text.
9. **Live price recomputation** — debounced running total visible on the product page as fields change.
10. **Cart line integration** — add-on selections snapshot into `commerce_cart_items.metadata.addOns[]`; `unitPriceAmount` includes add-on deltas; display `Label: Value` rows under the product title.
11. **Cart-page editing** — re-open the configurator for any cart line to edit add-ons without removing/re-adding.
12. **Order snapshot** — add-on selections + labels + prices copied from cart item into `commerce_order_items.metadata.addOns[]` at order creation; preserved for historical auditing.
13. **Order emails, invoices, admin order view** — add-on rows render in all downstream surfaces.
14. **File upload handling** — uploads stored via the Media System; URLs persist on the order; downloadable from admin order view.
15. **Admin authoring UX** — drag-drop group and field reordering; field duplication; group duplication; reusable group library; conditional-rule builder; pricing-rule builder with token picker for formulas; live preview pane.
16. **Import / export** — JSON export of groups, JSON import (for WooCommerce Product Add-Ons round-trip and for moving groups between ConvexPress sites).
17. **Role-based visibility** — optionally restrict a group to specific role(s) (e.g., wholesale only).
18. **WooCommerce parity** — import pipeline preserves every field from the WooCommerce Product Add-Ons plugin; defer premium-plugin-specific fields to a forward-compatible `sourceMeta` bag.
19. **Plugin enablement gate** — `commerceAddOnsEnabled` in Settings; guards on every mutation/query.
20. **Audit log** — group/field CRUD actions logged via the Audit Log System.
21. **Event hooks** — emit events for add-on group created/updated/deleted, add-on configured on line item, so other systems can subscribe.
22. **Internationalization** — group name, field label, option label are all translation-ready; prices are Money objects (amount + currencyCode).

### 2.2 Out-of-Scope

- **Subscription add-ons recurrence choice** — handled by the Subscriptions extension; this system only provides a `recurring: boolean` flag on pricing.
- **Shopify app parity** (Infinite Options, Globo, Bold) — we borrow UX patterns but do not target feature parity with Shopify ecosystems.
- **Advanced visual configurators** (3D previews, image overlay composition) — future phase; this PRD defines the data contract so a visual-configurator extension can plug in later.
- **Shared add-on inventory** — add-ons do not consume stock. If a shopper needs a stocked "extra," use a Product-field add-on that selects a real stocked product, or use Bundles.
- **Per-line-item discount codes** — order-level discount system already handles this and add-on deltas are included in the taxable subtotal.

---

## 3. Data Model

Follows the modular schema pattern: new file `convex/schema/commerceAddOns.ts` exporting `commerceAddOnsTables`, spread into `convex/schema.ts`.

### 3.1 `commerce_addon_groups`

A group is the unit of authoring and assignment. Every add-on field lives inside exactly one group.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Internal admin label (e.g., "Monogram & Gift Wrap") |
| slug | string | Yes | URL-safe unique key |
| description | string | No | Admin-only description |
| status | "active" \| "inactive" \| "archived" | Yes | Only `active` groups render on storefront |
| displayLayout | "inline" \| "accordion" \| "tabs" \| "popup" \| "wizard" | Yes | How the group renders on the product page |
| displayPosition | "above_atc" \| "below_atc" \| "after_gallery" \| "after_description" | Yes | Where on the product page |
| sortOrder | number | Yes | Ordering when multiple groups apply to the same product |
| assignment | object | Yes | See §3.2 |
| conditions | array\<ConditionRule\> \| null | No | Group-level show/hide conditions (field-level conditions live on each field) |
| disableAddToCartWhenInvalid | boolean | Yes | EPO-style gate |
| allowRepeater | boolean | Yes | Whether the entire group can be repeated |
| repeaterMin | number | No | Min repetitions (default 1) |
| repeaterMax | number | No | Max repetitions (null = unlimited) |
| repeaterAutoFromQuantity | boolean | No | Auto-scale repetitions with line qty |
| roleRestriction | array\<Id\<roles\>\> \| null | No | If set, only these roles see the group |
| sourceMeta | any | No | Bag for fields from source plugins (WooCommerce PAO, EPO, etc.) that don't map to ConvexPress first-class fields; preserved on round-trip |
| createdBy | Id\<users\> | Yes | |
| createdAt | number | Yes | |
| updatedAt | number | Yes | |

**Indexes:** `by_slug` (unique), `by_status`, `by_sortOrder`, `by_createdAt`.

### 3.2 Assignment object

```ts
{
  scope: "all_products" | "specific" | "exclude",
  productIds: Id<commerce_products>[],    // used for "specific"
  categoryIds: Id<commerce_categories>[], // union with productIds when "specific"
  tagIds: Id<commerce_tags>[],            // union
  productTypes: ("simple" | "variable" | "external" | "bundle")[],
  excludeProductIds: Id<commerce_products>[],
  excludeCategoryIds: Id<commerce_categories>[],
}
```

Resolution rule: a product displays a group if `scope=all_products` OR the product matches any inclusion criterion; then exclusions are applied. Multiple matching groups sort by `sortOrder` ascending.

### 3.3 `commerce_addon_fields`

Individual input inside a group.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| groupId | Id\<commerce_addon_groups\> | Yes | Parent group |
| fieldType | enum (22 types, see §4) | Yes | Which kind of field |
| label | string | Yes | Customer-facing label |
| slug | string | Yes | Internal key; stable across edits; referenced by formulas and conditions |
| description | string | No | Help text under the label |
| placeholder | string | No | Input placeholder |
| required | boolean | Yes | |
| sortOrder | number | Yes | Ordering within group |
| options | array\<AddOnFieldOption\> \| null | No | For dropdown/radio/checkbox/multiselect/swatches — see §3.4 |
| validation | object | No | See §3.5 |
| pricing | AddOnPricingRule | Yes | See §3.6 |
| conditions | array\<ConditionRule\> \| null | No | Field-level show/hide |
| displayHints | object | No | column width, tooltip text, icon, class overrides |
| sourceMeta | any | No | Round-trip preservation |
| createdAt | number | Yes | |
| updatedAt | number | Yes | |

**Indexes:** `by_group`, `by_group_sortOrder`, `by_slug`.

### 3.4 `AddOnFieldOption`

Used for dropdown, radio, checkbox, multiselect, image swatch, color swatch, text/button swatch.

```ts
{
  id: string,                  // stable ID (used in conditions/formulas)
  label: string,
  value: string,               // machine value (distinct from label for i18n)
  priceAmount: number,         // may be 0 or negative
  pricingType: AddOnPricingType,
  imageMediaId?: Id<media>,    // image swatch
  colorHex?: string,           // color swatch
  description?: string,
  isDefault?: boolean,
  sortOrder: number,
  productRef?: Id<commerce_products>, // for product/child-product selector
}
```

### 3.5 Validation object

```ts
{
  minLength?: number, maxLength?: number,  // text
  minValue?: number, maxValue?: number,    // number, range
  step?: number,                           // number, range
  minSelections?: number, maxSelections?: number, // checkbox, multiselect
  pattern?: string,                        // regex for short text
  formatHint?: "any" | "letters" | "numbers" | "letters_numbers" | "email" | "url",
  fileTypes?: string[],                    // e.g. ["image/jpeg","image/png","application/pdf"]
  fileMaxSizeBytes?: number,
  fileMaxCount?: number,
  dateMin?: number, dateMax?: number,      // timestamps
  customerPriceMin?: number, customerPriceMax?: number,
}
```

### 3.6 Pricing rule object

```ts
{
  type:
    | "none"
    | "flat_once"              // +$5 one time
    | "flat_per_quantity"      // +$2 × line qty
    | "percentage"             // +10% of product base
    | "per_character"          // $ × len(text)
    | "per_word"               // $ × words(text)
    | "per_file"               // $ × uploaded file count
    | "per_option"             // each selected option adds its own price (multi-select)
    | "tiered_first_n_free"    // first N free, rest priced per-option
    | "formula"                // JS-safe math expression
    | "lookup"                 // matrix table
    | "customer_defined",      // shopper enters price
  amount?: number,             // for flat/percentage/per-char/per-word/per-file
  currencyCode?: string,
  freeQuantity?: number,       // for tiered_first_n_free
  formula?: string,            // e.g. "width * height * 0.5 + base"
  lookup?: LookupTable,        // see §3.7
  isRecurring?: boolean,       // flags for Subscriptions integration
  quantityIndependent?: boolean, // EPO pattern — cost doesn't scale with line qty
}
```

### 3.7 Lookup table

```ts
{
  inputFieldSlugs: string[],   // e.g. ["width", "height"]
  rows: Array<{
    matches: Record<string, string | number | { min: number; max: number }>,
    priceAmount: number,
  }>,
  fallbackAmount?: number,
}
```

### 3.8 Condition rule

```ts
{
  combinator: "AND" | "OR",
  predicates: Array<{
    fieldSlug: string,
    operator: "equals" | "not_equals" | "contains" | "not_contains"
            | "greater_than" | "less_than" | "is_empty" | "is_not_empty"
            | "in" | "not_in",
    value: string | number | string[] | number[] | null,
  }>,
}
```

Multiple condition rules on the same field/group are OR'd at the top level (any satisfying rule shows the field); predicates within a rule combine per `combinator`.

### 3.9 `commerce_addon_selections` (audit/replay, optional)

Not required for pricing — selections snapshot lives in `commerce_cart_items.metadata.addOns` and `commerce_order_items.metadata.addOns`. This table is only used when an admin explicitly needs a normalized view for reporting. Default: **not created** unless analytics PRD requires it.

### 3.10 Snapshot shape inside line-item metadata

```ts
// commerce_cart_items.metadata.addOns and commerce_order_items.metadata.addOns
Array<{
  groupId: Id<commerce_addon_groups>,
  groupName: string,
  repeaterIndex?: number,       // for repeater sections
  fieldId: Id<commerce_addon_fields>,
  fieldSlug: string,
  fieldLabel: string,           // snapshot — survives group edits
  fieldType: AddOnFieldType,
  value: any,                   // text, number, selected option ids, file refs, etc.
  displayValue: string,         // pre-rendered label for email/invoice ("Red - $5.00")
  priceAmount: number,          // computed delta contribution in Money minor units
  currencyCode: string,
  fileRefs?: Array<{ mediaId: Id<media>, fileName: string, sizeBytes: number }>,
}>
```

Total add-on delta per line = sum of all `priceAmount` entries. Baked into `unitPriceAmount` (or surfaced separately — see §5.2 for the chosen approach).

---

## 4. Field Types (Canonical List)

| # | Type | Input UI | Compatible Pricing Models |
|---|------|----------|---------------------------|
| 1 | short_text | single-line input | flat_once, flat_per_quantity, per_character, per_word, formula |
| 2 | long_text | textarea | flat, per_character, per_word, formula |
| 3 | number | numeric input | flat, flat × qty, formula, lookup, per_unit |
| 4 | quantity | "how many" numeric | flat × qty, formula |
| 5 | range | slider | flat, formula, lookup |
| 6 | dropdown | select | per_option flat or % |
| 7 | multiselect | multi-select list | per_option, tiered_first_n_free |
| 8 | radio | radio buttons | per_option flat or % |
| 9 | checkbox | multi-checkbox | per_option, tiered_first_n_free |
| 10 | image_swatch | image grid | per_option |
| 11 | color_swatch | color grid | per_option |
| 12 | text_swatch | styled button chips | per_option |
| 13 | file_upload | dropzone | flat, per_file, formula |
| 14 | date | date picker | flat, formula |
| 15 | time | time picker | flat, formula |
| 16 | datetime | datetime picker | flat, formula |
| 17 | customer_defined_price | numeric input that SETS a price | customer_defined |
| 18 | product_selector | select from store products | inherits product price |
| 19 | calculation_display | read-only computed value | computed (formula) |
| 20 | heading | visual only | none |
| 21 | content_block | rich HTML | none |
| 22 | hidden | pre-filled, invisible | flat, formula |

---

## 5. Pricing Rules & Computation

### 5.1 Ordering of operations

1. Resolve **base product price** (variant salePrice → variant price → product salePrice → product basePrice) — unchanged from existing pipeline.
2. Resolve **bundle price** if product is a bundle — unchanged.
3. Collect **add-on contributions** for every active field in every matched group (using the selected values from cart item metadata).
4. For each field, apply its pricing model:
   - `flat_once` — `+= amount`
   - `flat_per_quantity` — `+= amount × lineQty`
   - `percentage` — `+= basePrice × (amount/100)`
   - `per_character` — `+= amount × len(text)`
   - `per_word` — `+= amount × words(text)`
   - `per_file` — `+= amount × uploadedFileCount`
   - `per_option` — `+= Σ option.priceAmount` for selected options
   - `tiered_first_n_free` — `+= Σ option.priceAmount` for (selectedCount − freeQuantity) cheapest-first excluded
   - `formula` — evaluate via sandboxed expression parser (never `eval`) with field slugs as variables
   - `lookup` — match input field values against matrix rows; fall back to `fallbackAmount` if no match
   - `customer_defined` — `= amount` shopper entered (no base product price for this field)
   - `quantityIndependent: true` means skip the `× lineQty` multiplier
5. Sum all contributions = **addOnDelta**.
6. **unitPriceAmount** = basePrice + addOnDelta (for `quantityIndependent` contributions, they are added to line total after `× qty` — see §5.2).
7. Discount code applied to (subtotal), then tax on (subtotal − discount), then shipping — unchanged.

### 5.2 Line-total formula

```
lineSubtotal = (unitPriceAmount × qty) + sum(quantityIndependent addOnDelta)
```

The `quantityIndependent` bucket is a **line-level** surcharge (e.g., a $25 rush fee applied once even when qty = 5). Store it separately in `metadata.addOnsLineSurcharge: number` and include in `lineTotalAmount` so the math is auditable.

### 5.3 Negative prices

All pricing models support negative amounts (e.g., `percentage: -10` = 10% discount). The total add-on delta may be negative, but **unitPriceAmount is floored at 0** — the system never produces a negative line.

### 5.4 Formula evaluator

- Use a sandboxed math parser (e.g., `expr-eval`, `mathjs` strict mode) — never native `eval`.
- Available tokens: any `field.slug` in the same group, `base` (product base price), `qty` (line quantity).
- Supported operators: `+ - * / ^ ( ) min() max() round() ceil() floor() if(cond, a, b)`.
- Fails closed: any error → `priceAmount: 0` + log to audit system.

### 5.5 Tax & discount interaction

- Add-on deltas are part of the taxable subtotal. Existing `computeTaxForAddress` receives the full `unitPriceAmount × qty + quantityIndependent` as input.
- Discounts of type `percent` apply to `unitPriceAmount × qty` including add-on deltas.
- Discounts of type `fixed_product` apply to the full line including add-ons.

---

## 6. API & Integration Points

### 6.1 Convex functions

```
convex/commerceAddOns/
  mutations.ts
    - createGroup(args)
    - updateGroup(args)
    - archiveGroup({ groupId })
    - duplicateGroup({ groupId })
    - reorderGroups({ orderedIds })
    - createField(args)
    - updateField(args)
    - deleteField({ fieldId })
    - duplicateField({ fieldId })
    - reorderFields({ groupId, orderedIds })
    - importGroups({ payload })     // JSON import (Woo + self)
    - assignGroupToProducts(args)   // bulk assign helper
  queries.ts
    - listGroups({ filters, paginationOpts })
    - getGroup({ groupId })
    - getFieldsForGroup({ groupId })
    - resolveGroupsForProduct({ productId }) // public: what shows on the storefront
    - exportGroups({ groupIds })    // JSON export
  helpers.ts
    - isCommerceAddOnsEnabled / requireCommerceAddOnsEnabled
    - resolveAssignedGroups(ctx, product) // single source of truth
  runtime.ts
    - evaluateFormula(expr, scope)
    - evaluateLookup(table, scope)
    - computeAddOnContributions(fields, selections, basePrice, qty) → { perUnit, lineSurcharge, breakdown[] }
    - validateSelections(fields, selections) → { ok, errors[] }
  internals.ts
    - internal migrations
    - internal WooCommerce import adapter
```

### 6.2 Cart integration

- `api.commerce.cart.addItem` **extended** to accept `addOnSelections: AddOnSelectionInput[]`.
- On add: server-side re-resolves the canonical groups for the product, validates selections against field definitions, computes contributions via `computeAddOnContributions`, snapshots into `metadata.addOns` + `metadata.addOnsLineSurcharge`.
- `api.commerce.cart.updateItem` gains a `replaceAddOnSelections` path for cart-page editing.
- `api.commerce.cart.validateItem` (new or existing) re-runs validation — used when groups change after cart add.

### 6.3 Checkout integration

- No new checkout mutations. Existing flow calls `buildOrderItemMetadata` which already spreads `item.metadata`, preserving `addOns` and `addOnsLineSurcharge`.
- `orderBundleHelpers.buildOrderItemMetadata` extended to also snapshot an `addOnSummary: string` convenience field for fast rendering in emails/lists.

### 6.4 Admin routes (TanStack Router)

```
/admin/commerce/addons                     # list all groups
/admin/commerce/addons/new                 # create group
/admin/commerce/addons/$groupId            # edit group (tabs: Fields, Assignment, Display, Conditions, Settings)
/admin/commerce/addons/$groupId/preview    # live preview with mock product
/admin/commerce/addons/settings            # global settings (validation defaults, file-upload limits)
```

New tab in `CommerceProductEditor`:
- **Add-Ons** tab shows all groups that currently match this product, lets admin override ordering at product level, and lets admin create a product-scoped group inline.

### 6.5 Website integration

- New component: `ProductAddOnsSection` rendered in `/routes/_marketing/products/$slug.tsx` between attribute pickers and Add-to-Cart.
- Query: `api.commerce.addOns.resolveGroupsForProduct({ productId })`.
- Form state: React state tree keyed by `groupId → fieldSlug → value` (repeater: `groupId → repeaterIndex → fieldSlug → value`).
- Live price: debounced client-side call to `api.commerce.addOns.previewPrice` (or pure client-side compute using the same `runtime.ts` functions exported as a shared package).
- Validation: client-side for UX, server-side for authority.

### 6.6 Event hooks (Event Dispatcher System)

- `commerce.addons.group.created`
- `commerce.addons.group.updated`
- `commerce.addons.group.deleted`
- `commerce.addons.line.configured` — fires on cart add with full snapshot
- `commerce.addons.line.edited` — fires on cart-page edit

---

## 7. Admin UX & Flows

### 7.1 Add-Ons list page

WordPress-style list table: columns = Name, Status, # Fields, Assignment Summary, Sort, Last Updated. Filters: status, assignment type. Bulk actions: archive, duplicate, export.

### 7.2 Group edit page (tabbed)

**Tab 1 — Fields.** Drag-drop list of fields inside the group. "+ Add Field" opens a field-type picker. Each field inline-edits label, required, sort; "Advanced" opens the full field editor sheet (pricing, validation, conditions, display hints, options).

**Tab 2 — Assignment.** Radio: Specific products / Categories / Tags / All products. Product picker (searchable). Category picker (tree). Role restriction (multi-select). Exclusions (products + categories).

**Tab 3 — Display.** Layout (inline, accordion, tabs, popup, wizard), position (above/below ATC, etc.), sort order, repeater settings.

**Tab 4 — Conditions.** Group-level show/hide builder (the same rule UI used per-field).

**Tab 5 — Settings.** `disableAddToCartWhenInvalid`, status, slug, description, audit-log visibility.

### 7.3 Field editor sheet

Two columns:
- Left: **Basics** (label, slug, description, placeholder, required, sort order) + **Options** (if applicable — drag-drop with CSV-import paste).
- Right: **Pricing** (type selector reveals relevant sub-fields; formula field gets a token picker) + **Validation** + **Conditions** + **Display hints**.

### 7.4 Live preview pane

Side panel renders the current group as it would appear on the storefront, using a selectable mock product for realistic pricing. Live price updates as the admin fills the preview form. Toggles: desktop/mobile, currency, logged-in-as-role.

### 7.5 Import / Export

- **Export:** select groups → JSON file with full definitions + referenced media asset references (not file bodies). Portable across ConvexPress sites.
- **Import from WooCommerce:** admin uploads a WooCommerce Product Add-Ons REST export (or runs the WooCommerce import pipeline which auto-invokes this). Adapter maps Woo fields → ConvexPress fields; unknown fields go to `sourceMeta`. Dry-run mode reports any warnings.
- **Import from ConvexPress export:** straight paste.

### 7.6 Product editor integration

New "Add-Ons" tab in `CommerceProductEditor`:
- Shows all groups matching this product (with inheritance badges: "from category Books", "global").
- "Override ordering for this product" toggle.
- "+ Create group just for this product" inline action (creates a group pre-scoped to `specific: [thisProductId]`).
- Live price preview using the product's own data.

---

## 8. Storefront & Checkout

### 8.1 Product page rendering

1. Query groups via `resolveGroupsForProduct`.
2. Sort by group `sortOrder`.
3. For each group, render its layout (inline/accordion/tabs/popup/wizard) at its `displayPosition`.
4. Render fields inside, honoring `conditions` (reactive).
5. Show a running price total near Add-to-Cart: **Base price + Add-ons subtotal = Line total**.
6. Validation on blur; if `disableAddToCartWhenInvalid`, grey out Add-to-Cart with a tooltip listing missing fields.

### 8.2 Cart display

Each line shows:
```
Product Title — Variant (option summary)
    • Monogram: "MJW" — $3.00
    • Gift Wrap: Premium — $5.00
    • Rush Delivery — $25.00 (once)
$73.00 × 1 = $73.00
```

A pencil icon next to add-on rows opens the cart-line edit flyout (re-uses `ProductAddOnsSection` component).

### 8.3 Checkout & order pages

Same `Label: Value` rows as cart. Order confirmation email + PDF invoice + admin order view all render from the same `metadata.addOns` array.

### 8.4 File uploads

- On field interaction: file chosen → immediately uploaded via the Media System (drag-drop to `/api/media/upload` equivalent) → returned `mediaId` stored in the selection.
- Admin order view shows thumbnail + download link; non-admin users see their own uploads only on their dashboard.
- File retention: bound to order lifecycle (same retention as order records).

---

## 9. Commerce Extension Registry Integration

### 9.1 Settings flag

Extend `PluginsSettings` in `settings/defaults.ts`:
```ts
commerceAddOnsEnabled: boolean  // default: false
```

### 9.2 Plugin registry

Extend `apps/web/src/lib/plugins/registry.ts`:
- Add `"commerceAddOns"` to `AdminPluginId` union.
- Add to `PluginSettingsValues`: `commerceAddOnsEnabled: boolean`.
- Add `ADMIN_PLUGINS` entry with `id, title, description, icon: Puzzle, settingsKey: "commerceAddOnsEnabled", adminAccessPrefixes: ["/admin/commerce/addons"]`.

### 9.3 Admin navigation

Extend `nav-config.ts` commerce parent to include:
```
{ id: "commerce-addons", label: "Product Add-Ons", to: "/commerce/addons", pluginId: "commerceAddOns" }
```

### 9.4 Guards

Every mutation and every public query in `commerceAddOns/*` calls `requireCommerceAddOnsEnabled(ctx)` first. Admin UI hides the nav item when disabled via the existing plugin-registry mechanism.

---

## 10. WooCommerce Parity

The official WooCommerce Product Add-Ons plugin exposes the following surfaces that we must round-trip:

| WooCommerce concept | ConvexPress equivalent |
|---------------------|------------------------|
| Global add-on group (`wc_product_add_ons`) with category scope | `commerce_addon_groups` with `assignment.scope = "all_products"` + `categoryIds` |
| Per-product add-on group | `commerce_addon_groups` with `assignment.scope = "specific"` + single `productId` |
| Field types: multiple_choice, checkbox, custom_text, custom_textarea, file_upload, custom_price, input_multiplier, heading, datepicker | Maps directly to our 22-type list |
| Price prefix (`flat_fee`, `quantity_based`, `percentage_based`) | `pricing.type` flat_once / flat_per_quantity / percentage |
| `min` / `max` | `validation.minValue` / `maxValue` |
| `restrictions` (letters, numbers, letters_numbers, email) | `validation.formatHint` |
| `position` (order within product) | `sortOrder` |
| Negative prices for discount | Supported natively |
| REST API `v3/products/{id}` `addons` + `exclude_global_add_ons` | Our `sourceMeta.woo.excludeGlobal` preserved + mirror REST endpoint in API System |

Premium-plugin concepts (conditional logic, formulas, lookup, repeaters, tabs/popup) have **no WooCommerce-native field** and must be preserved in `sourceMeta` when importing from those plugins, and rendered from first-class fields when authored inside ConvexPress.

---

## 11. Performance & Scale

- **Server:** `resolveGroupsForProduct` indexed on `assignment.productIds`, `assignment.categoryIds`, `assignment.scope` (inequality) — target p95 ≤ 30ms for a product with ≤ 10 matched groups.
- **Client:** groups lazy-loaded on product-page mount; do not block initial render.
- **Formula eval:** capped at 1000 ops per field evaluation (sandbox limit); precomputed when possible.
- **File uploads:** streaming directly to Media System; no buffering through Convex action memory.
- **Admin editor:** virtualized list when a group has >50 fields; debounced save.
- **Cart snapshot size:** soft cap of 50 add-on entries per line item; warn admin if a group's max combinatorial expansion exceeds this.

---

## 12. Distinction from Related Systems

- **Product Variations System** — pre-defined SKU permutations with stock. Use when each combination is a real, stocked SKU. Use add-ons when there's free-form input or when the combination would produce >50 SKUs with no per-combo stock.
- **Product Bundles System** — multiple distinct products sold together. Use when each component is a real stocked product. Use add-ons when the extras are modifiers, not products.
- **Custom Field System** — admin/internal metadata attached to content entities. Use for data *about* a product (ISBN, manufacturer). Use add-ons for data *collected from the customer at purchase*.
- **Composition** — all three (variations + bundles + add-ons) can apply to the same product. A variable bundle product may also have add-on groups. The systems are orthogonal; nothing in add-ons modifies variation or bundle behavior.

---

## 13. Security & Authorization

- Admin mutations require capability `manage_options` (standard commerce gate).
- Public mutations (cart add with selections) are authenticated via session token; unauthenticated sessions allowed for guest checkout.
- Formula evaluator is sandboxed — never `eval`, never function constructors, expression AST only.
- File uploads enforce `validation.fileTypes` server-side (magic-byte sniff, not trust Content-Type).
- Customer-defined price enforced to `[customerPriceMin, customerPriceMax]` server-side; client display is advisory only.
- All admin actions audit-logged with before/after snapshots.

---

## 14. Metrics & Analytics

Emit events consumed by Analytics System:
- `addon.impression` — group shown on a product page
- `addon.selection` — customer selected a value
- `addon.purchase` — add-on completed a purchase (from order snapshot)
- `addon.revenue` — `Σ priceAmount` aggregated by group and field

Reports:
- Top-earning add-on groups
- Conversion lift (products with add-ons vs without)
- Field abandonment (customers who engaged a field but didn't complete checkout)
- Most-common selections per field

---

## 15. Acceptance Criteria

1. Admin can create an add-on group, author all 22 field types, assign it per-product / per-category / globally, and publish it.
2. All 13 pricing models produce correct line totals in cart, checkout, and order snapshot.
3. Conditional logic correctly shows/hides fields reactively on the storefront and gates Add-to-Cart when configured.
4. Repeater sections duplicate correctly, both manually and auto-tied to quantity.
5. File uploads persist through cart → order → admin order view → order email, with the customer able to re-download their own uploads from the website dashboard.
6. WooCommerce Product Add-Ons JSON imports round-trip — re-exporting yields the same normalized structure.
7. Cart-page editing of an add-on updates `unitPriceAmount` and `lineTotalAmount` correctly.
8. Plugin disable flag hides the nav item, blocks all mutations/public queries, and existing cart data remains readable (no destructive hide).
9. Formula evaluator rejects malicious input (prototype pollution, infinite loops) — covered by unit tests.
10. Performance: product page with 3 add-on groups and 15 total fields loads add-ons in ≤ 100ms p95; cart re-price on field change ≤ 50ms p95.
11. Multi-site parity: exporting groups from Site A and importing into Site B preserves all definitions and referenced media assets.
12. All admin mutations audit-logged; event hooks fire for group CRUD and line configuration.

---

## 16. Open Questions / Deferred

- Visual configurator (image overlay composition) — separate future system; this PRD defines the data contract to keep it possible.
- Subscription add-on recurrence semantics — handled when Subscriptions extension matures; `isRecurring` flag already in schema.
- Analytics normalized table vs event-sourced aggregates — decide during Analytics System build.
- Shopify app import — not in scope; revisit if market demand surfaces.

---

## 17. References

- WooCommerce Product Add-Ons: https://woocommerce.com/document/product-add-ons/
- WooCommerce Add-Ons REST API: https://woocommerce.com/document/product-add-ons-rest-api-reference/
- Barn2 Product Options: https://barn2.com/wordpress-plugins/woocommerce-product-options/
- YITH Add-Ons & Extra Options: https://yithemes.com/themes/plugins/yith-woocommerce-product-add-ons/
- Studio Wombat APF: https://studiowombat.com/plugins/advanced-product-fields-for-woocommerce/
- ThemeComplete EPO: https://codecanyon.net/item/woocommerce-extra-product-options/7908619
- Plugin Republic Ultimate: https://pluginrepublic.com/wordpress-plugins/woocommerce-product-add-ons-ultimate/
- ConvexPress Variations PRD (adjacent system): `specs/ConvexPress/systems/product-variations-system/PRD.md`
- ConvexPress Bundles Extension (pattern reference): `ConvexPress-Admin/packages/backend/convex/commerceBundles/README.md`
