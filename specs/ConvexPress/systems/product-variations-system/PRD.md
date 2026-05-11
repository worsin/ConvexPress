# Product Variations System — PRD

**System ID:** product-variations-system
**Status:** Design / Ready for Implementation
**Owner:** Commerce Domain — Products
**Modeled on:** WooCommerce Product Variations, with exact behavioral parity
**Depends on:** Product Attributes System (product-attributes-system)

---

## 1. Context & Intent

A product variation is a specific purchasable configuration of a variable product — "Red / Large T-Shirt" is a variation of "T-Shirt" with Color=Red and Size=Large. In WooCommerce, variations are first-class entities (stored as separate posts with `post_type = product_variation`) that carry their own price, stock, image, weight, dimensions, description, tax class, shipping class, and status — independently of the parent product.

ConvexPress must implement this system identically so that WooCommerce variable products sync with zero field loss, the admin can manage every per-variation field, the storefront displays variation-specific data (image switching, description switching, price updates, stock status), and the cart/checkout/order pipeline uses per-variation pricing, stock, and shipping data throughout.

**Intent:** Variable products work exactly like WooCommerce — every variation has its own price, sale schedule, stock management, image, weight, dimensions, description, and status. The admin editor exposes every field. The storefront dynamically updates when a customer selects a variation. Cart and orders use per-variation data. WooCommerce sync preserves every field.

---

## 2. Scope

### 2.1 In-Scope

1. **Variation data model** — every field WooCommerce stores per variation (see §3)
2. **Variation CRUD** — create, update, delete individual variations
3. **Batch generation** — "Create variations from all attributes" (cartesian product), max 50 per batch
4. **Bulk actions** — set price, sale price, stock, weight, dimensions, status, download settings across multiple variations
5. **Per-variation pricing** — regular price, sale price, scheduled sale dates, active price computation
6. **Per-variation inventory** — `manageStock` (yes/no/parent), `stockQuantity`, `stockStatus` (instock/outofstock/onbackorder), `backorders` (yes/no/notify), `lowStockAmount`
7. **Per-variation physical properties** — weight, length, width, height (inherit from parent when empty)
8. **Per-variation image** — featured image per variation, with frontend image switching
9. **Per-variation description** — text that displays when variation is selected
10. **Per-variation status** — publish/private/draft (the "Enabled" toggle)
11. **Per-variation shipping** — shipping class override
12. **Per-variation tax** — tax class override (or "parent" to inherit)
13. **Per-variation downloads** — virtual/downloadable flags, download files, limits, expiry
14. **"Any" variations** — empty attribute value means "matches any option for that attribute"
15. **Default variation** — pre-select attribute dropdowns on frontend from parent's `defaultAttributes`
16. **Display ordering** — `menuOrder` field for admin drag-and-drop reordering
17. **Price range display** — variable product shows min-max price range computed from visible variations
18. **Parent stock status sync** — parent's `stockStatus` derived from children (any instock → instock, else any onbackorder → onbackorder, else outofstock)
19. **Frontend variation form** — attribute dropdowns with dynamic option filtering, image/price/description switching, "Clear" link, stock status messaging
20. **Cart integration** — cart stores productId + variantId + selected attributes, validates variant still exists
21. **Order integration** — order items store variantId + per-attribute meta + snapshotted pricing/SKU
22. **WooCommerce sync** — import every variation field from WooCommerce REST API
23. **Admin UX** — variation editor with all fields, bulk actions, generation, pagination
24. **Variation integrity** — audit and repair tools for data consistency

### 2.2 Out-of-Scope

- Product attribute management (owned by Product Attributes System PRD)
- Subscription variations (owned by Subscriptions System, future)
- Composite/bundle variations (owned by Bundles System, already built)
- Image gallery per variation (WooCommerce only exposes single image in default UI; gallery requires paid extension)

---

## 3. Data Model

### 3.1 `commerce_product_variants` Table

Every field WooCommerce stores per variation.

| Field | Type | Required | WooCommerce Equivalent | Description |
|-------|------|----------|----------------------|-------------|
| productId | Id\<commerce_products\> | Yes | post_parent | Parent variable product |
| title | string | Yes | post_title | Auto-generated: "Product - Color: Red, Size: Large" |
| description | string | No | _variation_description | Variation-specific description shown on frontend |
| sku | string | No | _sku | Variant SKU (inherits from parent in display if empty) |
| globalUniqueId | string | No | _global_unique_id | GTIN / UPC / EAN / ISBN |
| optionSummary | string | Yes | post_excerpt | Human-readable: "Color: Red / Size: Large" |
| selections | array\<VariantSelection\> | No | attribute_pa_* meta rows | Which option was selected for each attribute |
| selectionKey | string | No | (computed) | Dedup key: "attrId:termId\|attrId:termId" |
| price | Money | Yes | _regular_price | Regular/base price |
| salePrice | Money | No | _sale_price | Discounted price |
| salePriceFrom | number | No | _sale_price_dates_from | Scheduled sale start (timestamp) |
| salePriceTo | number | No | _sale_price_dates_to | Scheduled sale end (timestamp) |
| manageStock | "yes" \| "no" \| "parent" | No | _manage_stock | Stock management mode. Default: "parent" |
| stockQuantity | number | No | _stock | Stock count (used when manageStock="yes") |
| stockStatus | "instock" \| "outofstock" \| "onbackorder" | No | _stock_status | Explicit stock status. Default: "instock" |
| backorders | "yes" \| "no" \| "notify" | No | _backorders | Backorder policy. Default: "no" |
| lowStockAmount | number | No | _low_stock_amount | Per-variation low stock threshold |
| weight | string | No | _weight | Weight (inherits from parent if empty) |
| shippingLengthIn | string | No | _length | Length (inherits from parent if empty) |
| shippingWidthIn | string | No | _width | Width (inherits from parent if empty) |
| shippingHeightIn | string | No | _height | Height (inherits from parent if empty) |
| shippingClassId | string | No | product_shipping_class | Shipping class override |
| taxClass | string | No | _tax_class | Tax class ("parent" to inherit) |
| isVirtual | boolean | No | _virtual | Virtual product (no shipping) |
| isDownloadable | boolean | No | _downloadable | Has downloadable files |
| downloadLimit | number | No | _download_limit | Max downloads (-1 = unlimited) |
| downloadExpiry | number | No | _download_expiry | Days until expiry (-1 = never) |
| featuredMediaId | Id\<media\> | No | _thumbnail_id | Variation image |
| galleryMediaIds | array\<Id\<media\>\> | No | _product_image_gallery | Gallery images |
| status | "publish" \| "private" \| "draft" | No | post_status | Variation visibility. Default: "publish" |
| menuOrder | number | No | menu_order | Display order in admin |
| isDefault | boolean | Yes | (derived from _default_attributes) | Whether this is the default variation |
| createdAt | number | Yes | post_date | Timestamp |
| updatedAt | number | Yes | post_modified | Timestamp |

**Indexes:**
- `by_product` [productId]
- `by_product_default` [productId, isDefault]
- `by_product_selection_key` [productId, selectionKey]
- `by_sku` [sku]
- `by_product_status` [productId, status]
- `by_product_menu_order` [productId, menuOrder]

### 3.2 VariantSelection Structure

Each element in the `selections` array:

| Field | Type | Description |
|-------|------|-------------|
| optionTypeId | string | Attribute identifier |
| optionTypeName | string | Attribute display name |
| optionValueId | string | Term/value identifier |
| optionValueLabel | string | Term/value display label |
| sortOrder | number | Position |

Empty `optionValueId`/`optionValueLabel` = "Any" (matches any customer selection for that attribute).

---

## 4. Behavioral Parity with WooCommerce

### 4.1 Inheritance

When a variation field is empty/null, it inherits from the parent product in display context:

| Field | Inheritance |
|-------|-------------|
| SKU | Variation if set, else parent |
| Weight | Variation if set, else parent |
| Dimensions (L/W/H) | Variation if set, else parent |
| Tax class | "parent" string → use parent's tax class |
| Image | Variation if set, else parent's featured image |
| Shipping class | Variation if set, else parent |
| Manage stock | "parent" → use parent's stock settings |
| Stock quantity | If manageStock="parent", use parent's stockQuantity |
| Backorders | If manageStock="parent", use parent's backorders |
| **Price** | **Never inherits** — variation MUST have its own price to be purchasable |
| **Description** | **Never inherits** — variation-specific only |

### 4.2 Stock Management Modes

**manageStock = "yes":** Variation tracks its own `stockQuantity`. The variation's `backorders` and `lowStockAmount` settings apply.

**manageStock = "no":** No stock tracking. Variation is always considered in-stock unless manually set to `stockStatus = "outofstock"`.

**manageStock = "parent":** Delegates to the parent product's `trackInventory`, `stockQuantity`, `allowBackorders`. Stock decrements happen against the parent's quantity, not the variation's.

### 4.3 Backorder Modes

**"no":** Do not allow backorders. When stock reaches 0, variation shows "Out of stock."

**"yes":** Allow backorders silently. Customer can purchase even when stock is 0. No messaging.

**"notify":** Allow backorders AND display "Available on backorder" message to customer on the product page. Customer can still purchase.

### 4.4 Parent Stock Status Sync

After any variation's stock status changes, the parent's `stockStatus` must sync:

1. If ANY child variation has `stockStatus = "instock"` → parent = "instock"
2. Else if ANY child has `stockStatus = "onbackorder"` → parent = "onbackorder"
3. Else (all children outofstock) → parent = "outofstock"

### 4.5 Scheduled Sales

When `salePriceFrom` and/or `salePriceTo` are set:
- Before `salePriceFrom`: use regular `price` as active price
- Between `salePriceFrom` and `salePriceTo`: use `salePrice` as active price
- After `salePriceTo`: revert to regular `price`, clear `salePrice` and date fields

A scheduled job (cron) must check for starting/ending sales and update the active price.

### 4.6 Price Range Display

The parent variable product's displayed price is computed from all visible (status="publish", priced) variations:

- If min price ≠ max price: show range "$X – $Y"
- If all same price, some on sale: show strikethrough "$X ~~$Y~~"
- If all same price, none on sale: show single price "$X"

### 4.7 "Any" Variations

A variation with an empty `optionValueId` for an attribute matches ANY customer selection for that attribute. This is a wildcard.

When matching customer selections to variations, empty values on the variation are treated as wildcards. The first matching variation wins (order matters — `menuOrder`).

### 4.8 Variation Generation

"Create variations from all attributes" generates the cartesian product of all terms from all `isVariation=true` attributes. Limited to 50 per batch (configurable). Only creates combinations that don't already exist (matched by selectionKey).

### 4.9 Purchasability

A variation is purchasable when ALL of:
1. `status = "publish"` (enabled)
2. Has a non-empty `price`
3. Parent product is published
4. Stock allows it (instock, or backorders allowed)

---

## 5. Mutations

### 5.1 Variation CRUD

| Mutation | Args | Behavior |
|----------|------|----------|
| `createVariant` | productId, ALL fields from §3.1 | Create variation with full field set. Auto-generates selectionKey from selections. Validates selections against product's attributes. Sets manageStock default to "parent". |
| `updateVariant` | variantId, any field from §3.1 (optional) | Update variation fields. Recomputes selectionKey if selections change. Recomputes optionSummary if selections change. |
| `deleteVariant` | variantId | Delete if not referenced by cart/order/wishlist. Reverts parent to "simple" if last variation. |
| `generateVariants` | productId, basePriceAmount? | Cartesian product of all isVariation attributes. Max 50 per call. Skips existing selectionKeys. |
| `reorderVariants` | productId, variantIds[] | Set menuOrder sequentially. |

### 5.2 Bulk Actions

| Mutation | Args | Behavior |
|----------|------|----------|
| `bulkUpdateVariants` | productId, variantIds[], fields | Set price, salePrice, stockQuantity, weight, dimensions, status, manageStock, backorders, downloadSettings on multiple variants at once. |

### 5.3 Inventory

| Mutation | Args | Behavior |
|----------|------|----------|
| `adjustVariantStock` | variantId, delta, reason | Adjust stock by delta. Syncs parent stockStatus. Creates inventory adjustment record. |
| `syncParentStockStatus` | productId | Recompute parent's stockStatus from children. |

---

## 6. Queries

| Query | Args | Returns |
|-------|------|---------|
| `listVariants` | productId | All variations sorted by menuOrder, with resolved inheritance |
| `getVariant` | variantId | Single variation with resolved inheritance |
| `getAvailableVariations` | productId | Only purchasable variations (status=publish, has price, in stock or backorderable), with image data and display prices — equivalent to WooCommerce's `get_available_variations()` |
| `getVariationPrices` | productId | Price ranges: {min, max, minRegular, maxRegular} from visible variations |

---

## 7. Frontend Behavior

### 7.1 Variation Form

On the product detail page for variable products:

1. Render a dropdown (`<select>`) for each attribute with `isVariation = true`
2. Each dropdown contains the attribute's terms as options
3. If `defaultAttributes` are set, pre-select those values and load the matching variation
4. When customer changes a selection:
   - Filter other dropdowns to show only available combinations (grey out unavailable)
   - If all attributes selected and a matching variation exists:
     - Update price display to variation's active price
     - Switch main image to variation's `featuredMediaId` (or revert to parent if none)
     - Show variation's `description` below the selectors
     - Update SKU display
     - Show stock status messaging ("In stock", "Out of stock", "Available on backorder")
     - Enable "Add to cart" button
   - If no matching variation: show "This combination is unavailable" and disable add-to-cart
5. "Clear" link resets all selections to empty, reverts image/price/description to parent defaults

### 7.2 Stock Status Messaging

| stockStatus | backorders | Display |
|-------------|-----------|---------|
| instock | any | "In stock" (or "X in stock" if showing quantities) |
| outofstock | any | "Out of stock" — disable add-to-cart |
| onbackorder | "yes" | No special message, add-to-cart enabled |
| onbackorder | "notify" | "Available on backorder" message shown, add-to-cart enabled |

### 7.3 Price Display

- Single variation selected: show that variation's price (with sale strikethrough if applicable)
- No variation selected: show parent's price range ("$X – $Y" or "From $X")
- Scheduled sale active: show strikethrough regular price + sale price

---

## 8. Cart Integration

### 8.1 Add to Cart

When adding a variable product to cart:
- `productId` (parent) and `variantId` (specific variation) are both required
- Selected attribute values are stored in cart item metadata
- `unitPriceAmount` comes from the variation's active price (salePrice if on sale, else price)
- Validation: variant must exist, belong to the product, be purchasable, and have sufficient stock

### 8.2 Cart Item Data

| Field | Source |
|-------|--------|
| productId | Parent variable product |
| variantId | Specific variation |
| unitPriceAmount | Variation's active price |
| metadata.variantTitle | Variation title |
| metadata.optionSummary | "Color: Red / Size: Large" |
| metadata.variantSku | Variation SKU |
| metadata.selections | Array of selected attributes |

### 8.3 Quantity Updates

When customer changes cart quantity:
- Re-validate stock against variation's current stockQuantity
- Refresh unitPriceAmount from variation's current price (in case admin changed it)

---

## 9. Order Integration

### 9.1 Order Item Creation

When checkout creates order items:
- Store `variantId` on the order item
- Use `buildOrderItemTitle()` — "Product - Variation Title"
- Store variant SKU (not product SKU)
- Store variation metadata: variantTitle, optionSummary, variantSku, selected attributes
- Use variation's price for `unitPriceAmount`

### 9.2 Order Item Display

Admin and customer order views show:
- Product title with variant title
- Selected attribute values (e.g., "Color: Red, Size: Large")
- Variant SKU
- Variant-specific price

---

## 10. WooCommerce Sync

### 10.1 Variation Field Mapping

| WooCommerce Field | ConvexPress Field | Transform |
|---|---|---|
| id | (mapped via idMapping) | Store WooCommerce variation ID |
| description | description | Direct |
| sku | sku | Direct |
| global_unique_id | globalUniqueId | Direct |
| regular_price | price.amount | parseFloat * 100 (cents) |
| sale_price | salePrice.amount | parseFloat * 100 (cents) |
| date_on_sale_from | salePriceFrom | new Date().getTime() |
| date_on_sale_to | salePriceTo | new Date().getTime() |
| manage_stock | manageStock | true→"yes", false→"no", "parent"→"parent" |
| stock_quantity | stockQuantity | Direct |
| stock_status | stockStatus | Direct |
| backorders | backorders | Direct |
| low_stock_amount | lowStockAmount | Direct |
| weight | weight | Direct string |
| dimensions.length | shippingLengthIn | Direct string |
| dimensions.width | shippingWidthIn | Direct string |
| dimensions.height | shippingHeightIn | Direct string |
| shipping_class_id | shippingClassId | String(id) |
| virtual | isVirtual | Direct boolean |
| downloadable | isDownloadable | Direct boolean |
| download_limit | downloadLimit | Direct |
| download_expiry | downloadExpiry | Direct |
| tax_class | taxClass | Direct (or "parent") |
| image.id | featuredMediaId | Resolve via media sync/idMapping |
| status | status | Direct |
| menu_order | menuOrder | Direct |
| attributes[].option | selections[].optionValueLabel | Map via attribute matching |

### 10.2 WooClient Type

The `WooProductVariation` interface must include ALL fields from the WooCommerce REST API response — not just the subset currently defined. See §3.1 for the complete field list.

---

## 11. Admin UX

### 11.1 Variation Editor (Product Editor → Variations Section)

For each variation, an expandable panel showing:

**Row 1 — Header:** Attribute selections (one dropdown per variation attribute), Enabled toggle, Image thumbnail

**Row 2 — Pricing:**
- Regular price (required)
- Sale price
- Sale schedule (from/to date pickers)

**Row 3 — Inventory:**
- Manage stock dropdown (Yes / No / Parent)
- If "Yes": Stock quantity input, Allow backorders dropdown (No / Yes / Notify), Low stock threshold
- If "No": Stock status dropdown (In stock / Out of stock / On backorder)
- If "Parent": No fields (inherits)

**Row 4 — Shipping:**
- Weight, Length, Width, Height inputs
- Shipping class dropdown
- Virtual checkbox (hides shipping fields when checked)

**Row 5 — Downloads (if downloadable):**
- Downloadable checkbox
- File list (name + URL rows)
- Download limit
- Download expiry

**Row 6 — Other:**
- SKU
- GTIN/UPC/EAN/ISBN
- Tax class dropdown (Parent / Standard / Reduced rate / etc.)
- Description textarea

### 11.2 Bulk Actions Bar

Dropdown with actions matching WooCommerce:
- Toggle enabled
- Set regular prices / sale prices
- Set stock quantity / stock status
- Set weight / dimensions
- Set shipping class
- Toggle virtual / downloadable

### 11.3 Generation

"Create variations from all attributes" button:
- Generates cartesian product from all `isVariation=true` attributes
- Max 50 per batch, shows count created
- Skips existing selectionKeys

### 11.4 Pagination & Ordering

- 15 variations per page in admin (matching WooCommerce)
- Drag-and-drop reordering via menuOrder
- Manual position input

---

## 12. Integrity & Maintenance

### 12.1 Audit

The `auditVariantIntegrity` query checks:
- Duplicate selectionKeys within a product
- Missing/multiple default variants
- Variable products with 0 variations
- Non-variable products with variations (type drift)
- Missing selections
- Invalid selections (reference nonexistent attributes/terms)
- Stale selectionKeys
- Broken references across cart/order/wishlist tables
- Orphaned variations (parent deleted)

### 12.2 Repair

The `repairVariantIntegrity` mutation (with dry-run support):
- Promotes type drift products to "variable"
- Infers selections from optionSummary
- Recomputes selectionKeys
- Fixes single-default invariant
- Logs repairs via Event Dispatcher

---

## 13. Invariants

1. Every variable product must have at least one variation to be published
2. Every variation must have a `price` to be purchasable
3. Exactly one variation per product may be marked `isDefault` (derived from parent's `defaultAttributes`)
4. `selectionKey` must be unique within a product
5. Variation `status` controls frontend visibility: only `publish` variations are shown to customers
6. `manageStock = "parent"` delegates all stock operations to the parent product
7. Parent `stockStatus` must stay in sync with children (any instock → instock)
8. Deleting a variation referenced by cart/order/wishlist items is blocked
9. Removing the last variation reverts the parent to `productType = "simple"`
10. A variation without a price is stored but NOT shown on the frontend and NOT purchasable
