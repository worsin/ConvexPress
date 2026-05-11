# Product Attributes System — PRD

**System ID:** product-attributes-system
**Status:** Design / Ready for Implementation
**Owner:** Commerce Domain — Products
**Modeled on:** WooCommerce Product Attributes, with exact behavioral parity

---

## 1. Context & Intent

Product attributes define the axes along which a variable product varies — Color, Size, Material, etc. In WooCommerce, attributes are a two-tier system: **global attributes** shared across all products (stored as WordPress taxonomies with the `pa_` prefix) and **product-level custom attributes** (stored as metadata on individual products). Each attribute has a set of terms/values (Red, Blue, Green for Color) and two independent boolean flags: `is_visible` (show on product page) and `is_variation` (use to create variations).

ConvexPress must implement this system identically so that WooCommerce stores can sync their full attribute taxonomy — including global shared attributes, per-product attribute configuration, term ordering, visibility flags, and the variation flag — without data loss.

**Intent:** Merchants can define reusable global attributes (Color, Size) with ordered terms, attach them to products with independent visibility and variation flags, and have the variation system consume only the attributes marked `is_variation` — exactly matching the WooCommerce mental model.

---

## 2. Scope

### 2.1 In-Scope

1. **Global attribute CRUD** — create, read, update, delete shared attribute definitions (equivalent to `wp_woocommerce_attribute_taxonomies`)
2. **Global attribute terms** — create, read, update, delete, reorder terms within a global attribute (equivalent to `wp_terms` + `wp_term_taxonomy` + `wp_termmeta`)
3. **Per-product attribute configuration** — attach global or custom attributes to a product, with independent `isVisible` and `isVariation` flags and position ordering (equivalent to `_product_attributes` postmeta)
4. **Term ordering** — support `menuOrder`, `name`, `nameNumeric`, and `id` sort modes per attribute
5. **Attribute types** — `select` (default, dropdown) and `text` (freeform). Extensible for future swatch types.
6. **Custom/local attributes** — per-product attributes not backed by a global taxonomy, with inline pipe-delimited values
7. **Default attributes** — store default attribute selections on variable products for frontend pre-selection (equivalent to `_default_attributes`)
8. **Admin UX** — global attribute management page, per-product attribute tab in product editor, term management
9. **WooCommerce sync** — import global attributes and terms from WooCommerce REST API, map to ConvexPress tables, preserve IDs for round-trip sync
10. **REST/HTTP API** — expose attributes and terms for external consumers

### 2.2 Out-of-Scope

- Variation creation from attributes (owned by Product Variations System PRD)
- Layered navigation / attribute filtering on storefront (future)
- Attribute archive pages (future)
- Swatch display types beyond select/text (future, extensible via attribute type)

---

## 3. Data Model

### 3.1 `commerce_product_attributes` Table (Global Attributes)

Equivalent to WooCommerce's `wp_woocommerce_attribute_taxonomies`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Machine-friendly slug (e.g., "color", "size"). Max 28 characters. |
| label | string | Yes | Human-readable display label (e.g., "Color", "Size") |
| type | union: "select" \| "text" | Yes | Attribute input type. Default: "select" |
| orderBy | union: "menu_order" \| "name" \| "name_num" \| "id" | Yes | How terms are sorted. Default: "menu_order" |
| hasArchives | boolean | Yes | Whether attribute archive pages are enabled. Default: false |
| slug | string | Yes | URL-friendly identifier, auto-generated from name if not provided |
| createdAt | number | Yes | Timestamp |
| updatedAt | number | Yes | Timestamp |

**Indexes:**
- `by_slug` [slug] — unique lookup
- `by_name` [name] — unique lookup

### 3.2 `commerce_product_attribute_terms` Table (Attribute Terms/Values)

Equivalent to WooCommerce's `wp_terms` + `wp_term_taxonomy` + `wp_termmeta` for attribute taxonomies.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| attributeId | Id\<commerce_product_attributes\> | Yes | Parent attribute |
| name | string | Yes | Display name (e.g., "Red", "Large") |
| slug | string | Yes | URL-friendly slug (e.g., "red", "large") |
| description | string | No | Term description |
| menuOrder | number | Yes | Custom sort position. Default: 0 |
| productCount | number | Yes | Number of products using this term. Default: 0 |
| createdAt | number | Yes | Timestamp |
| updatedAt | number | Yes | Timestamp |

**Indexes:**
- `by_attribute` [attributeId] — list terms for an attribute
- `by_attribute_slug` [attributeId, slug] — unique term lookup within attribute
- `by_attribute_order` [attributeId, menuOrder] — ordered term listing

### 3.3 Per-Product Attribute Configuration (on `commerce_products`)

Stored as `productAttributes` field on the product (equivalent to WooCommerce's `_product_attributes` serialized postmeta).

```typescript
productAttributes: v.optional(v.array(v.object({
  attributeId: v.optional(v.id("commerce_product_attributes")), // null for custom/local
  name: v.string(),           // taxonomy slug for global, display name for custom
  isGlobal: v.boolean(),      // true = global attribute, false = custom/local
  isVisible: v.boolean(),     // show on product page "Additional Information"
  isVariation: v.boolean(),   // use for creating variations
  position: v.number(),       // display order (0-based)
  options: v.array(v.string()), // term slugs (global) or raw string values (custom)
})))
```

**WooCommerce field mapping:**

| WooCommerce Field | ConvexPress Field | Notes |
|---|---|---|
| `name` (pa_color or Custom) | `name` | Same semantics |
| `is_taxonomy` (0/1) | `isGlobal` | Renamed for clarity |
| `is_visible` (0/1) | `isVisible` | Same semantics |
| `is_variation` (0/1) | `isVariation` | Same semantics |
| `position` (int) | `position` | Same semantics |
| `value` (pipe-delimited) | `options` (array) | Stored as array, not pipe string |
| attribute_id | `attributeId` | Reference to global attribute table |

### 3.4 Default Attributes (on `commerce_products`)

Stored as `defaultAttributes` field on the product (equivalent to WooCommerce's `_default_attributes`).

```typescript
defaultAttributes: v.optional(v.array(v.object({
  attributeId: v.optional(v.id("commerce_product_attributes")),
  name: v.string(),       // attribute slug/name
  option: v.string(),     // selected term slug or value
})))
```

This pre-selects variant dropdowns on the frontend when a customer visits a variable product page.

---

## 4. Mutations

### 4.1 Global Attributes

| Mutation | Args | Behavior |
|----------|------|----------|
| `createAttribute` | name, label, type?, orderBy?, hasArchives? | Create global attribute. Validates name uniqueness and max 28 chars. |
| `updateAttribute` | attributeId, label?, type?, orderBy?, hasArchives? | Update global attribute properties. Name/slug cannot change (matches WooCommerce behavior where slug changes break variations). |
| `deleteAttribute` | attributeId | Delete global attribute AND all its terms. Warns if products reference it. |

### 4.2 Attribute Terms

| Mutation | Args | Behavior |
|----------|------|----------|
| `createTerm` | attributeId, name, slug?, description?, menuOrder? | Create term within an attribute. Auto-generate slug from name. |
| `updateTerm` | termId, name?, slug?, description?, menuOrder? | Update term properties. |
| `deleteTerm` | termId | Delete term. Removes from all products' options arrays. |
| `reorderTerms` | attributeId, termIds[] | Set menuOrder for all terms in order. |

### 4.3 Per-Product Attributes

| Mutation | Args | Behavior |
|----------|------|----------|
| `setProductAttributes` | productId, attributes[] | Replace the product's entire `productAttributes` array. Each entry specifies attributeId (or null for custom), name, isGlobal, isVisible, isVariation, position, options[]. |
| `setDefaultAttributes` | productId, defaults[] | Set the `defaultAttributes` array on a variable product. |

---

## 5. Queries

| Query | Args | Returns |
|-------|------|---------|
| `listAttributes` | — | All global attributes, sorted by label |
| `getAttribute` | attributeId | Single attribute with its terms |
| `listTerms` | attributeId | All terms for an attribute, respecting orderBy setting |
| `getProductAttributes` | productId | Product's `productAttributes` array, with global attribute labels resolved |
| `getProductDefaultAttributes` | productId | Product's `defaultAttributes` array |

---

## 6. WooCommerce Sync Mapping

### 6.1 Global Attribute Import

When syncing from WooCommerce:
1. Call `GET /wp-json/wc/v3/products/attributes` to get all global attributes
2. For each attribute, upsert into `commerce_product_attributes` with ID mapping
3. Call `GET /wp-json/wc/v3/products/attributes/{id}/terms` to get all terms
4. Upsert terms into `commerce_product_attribute_terms` with ID mapping

### 6.2 Product Attribute Import

When syncing a product:
1. Read the product's `attributes[]` from the WooCommerce REST API response
2. For each attribute:
   - If `id > 0`: it's a global attribute — look up the ConvexPress attribute by WooCommerce ID mapping
   - If `id == 0`: it's a custom/local attribute — store inline
   - Map `visible` → `isVisible`, `variation` → `isVariation`, `position` → `position`
   - Map `options[]` (array of term names/values) → `options[]`

### 6.3 Default Attribute Import

Map WooCommerce's `default_attributes[]` array directly:
- `id` → `attributeId` (via ID mapping)
- `name` → `name`
- `option` → `option` (term slug)

---

## 7. Admin UX

### 7.1 Global Attributes Page

**Route:** `/admin/commerce/attributes`

- Left panel: "Add new attribute" form (Name, Slug, Type dropdown, Sort order dropdown, Archives checkbox)
- Right panel: Table of existing attributes (Name, Slug, Type, Terms count, Actions: Edit, Delete, Manage Terms)
- Click "Manage Terms" → opens term management for that attribute

### 7.2 Term Management Page

**Route:** `/admin/commerce/attributes/{attributeId}/terms`

- Left panel: "Add new term" form (Name, Slug, Description)
- Right panel: Draggable table of terms (Name, Slug, Count, Actions: Edit, Delete)
- Drag-and-drop reordering when orderBy is `menu_order`

### 7.3 Product Editor — Attributes Tab

On the product editor, an "Attributes" section:
- Dropdown to select existing global attributes or "Add custom attribute"
- For global attributes: multi-select of terms to include on this product, or "Select all"
- For custom attributes: text input with pipe-separated values
- Checkbox: "Visible on the product page" (`isVisible`)
- Checkbox: "Used for variations" (`isVariation`)
- Drag-and-drop reordering of attributes
- "Save attributes" button

---

## 8. Relationship to Variations System

This system provides the **inputs** to the Product Variations System:

1. Only attributes with `isVariation = true` feed into the variation creation UI
2. The Variations System reads `productAttributes` to determine which dropdowns to show
3. Each variation stores which term was selected for each variation-enabled attribute
4. `defaultAttributes` controls which variation is pre-selected on frontend load

The Attributes System does NOT create, manage, or display variations. It only defines the dimensions along which products can vary.

---

## 9. Invariants

1. Global attribute `name` (slug) must be unique across all attributes and max 28 characters
2. Term `slug` must be unique within its parent attribute
3. `isVisible` and `isVariation` are fully independent — all four combinations are valid
4. Products can mix global and custom attributes in the same `productAttributes` array
5. Deleting a global attribute removes it from all products' `productAttributes` (cascade)
6. Deleting a term removes it from all products' `options` arrays (cascade)
7. Renaming a global attribute's label is safe; changing its slug is destructive (breaks variation references)
8. A variable product must have at least one attribute with `isVariation = true` to create variations
