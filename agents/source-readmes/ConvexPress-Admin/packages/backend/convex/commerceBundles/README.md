# Commerce Bundles System

## Bundle-Backed Product Model

Bundles are **standalone entities** in the `commerce_bundles` table. They are NOT sub-types of `commerce_products`. Each bundle has its own name, slug, status, pricing strategy, and component list.

Bundles do **not** currently have a `productId` field linking them to a `commerce_products` row. When a bundle is added to the cart, the cart item stores the bundle's own `_id` as the product reference and includes `metadata: { type: "bundle", bundleId }` to distinguish it from a regular product purchase.

If a future migration adds `productId` to bundles (to create a backing product row for unified order reporting), the `getStats` query already tracks `unlinked` bundles as a readiness metric.

## Canonical Cart/Order Metadata Shape

When a bundle is added to a cart item:

```json
{
  "productId": "<bundle._id>",
  "quantity": 1,
  "metadata": {
    "type": "bundle",
    "bundleId": "<bundle._id>"
  }
}
```

For configurable bundles (mix-and-match, BOGO), a `commerce_bundle_selections` row is created first via `saveSelection`, capturing the customer's exact component choices and the resolved total price. The selection's `cartItemId` links back to the cart item.

When the order is placed, `orderItemId` is stamped onto the selection to preserve the record as part of the completed purchase.

## Lifecycle Guards

- **Cannot delete a product that is a component in an active bundle.** The `removeComponent` mutation must be called first to detach it. (Note: this guard is not yet enforced at the product deletion level -- product system should query `commerce_bundle_components.by_product` before deleting.)
- **Cannot unpublish (archive) a component product that is in an active bundle.** Same as above -- product status transitions should check bundle membership.
- **Deleting a bundle cascades:** all `commerce_bundle_components` and `commerce_bundle_selections` for that bundle are deleted.

## Stock Semantics

Stock is tracked at the **component level**, not the bundle level:

- Each component references a `commerce_products` row (and optionally a `commerce_product_variants` row).
- The `checkAvailability` query walks each component and checks the underlying product/variant stock.
- The bundle-level `stockCount` / `trackInventory` fields are optional overrides for bundles that want an explicit cap on total bundle sales (independent of component stock).
- `allowPartialStock`: when `true`, the bundle can be purchased even if not all **optional** components are in stock. Required components must always be in stock. Only meaningful for configurable bundles.

## Bundle Types

| Type | Slug | Behavior |
|------|------|----------|
| Fixed | `fixed` | Pre-set components. Customer buys the bundle as-is. |
| Mix & Match | `mix_and_match` | Customer selects from available components, subject to `minItems`/`maxItems` constraints. |
| BOGO | `bogo` | Buy-one-get-one variant. Components define the "buy" and "get" items. |

## Pricing Strategies

| Strategy | Slug | Behavior |
|----------|------|----------|
| Component Sum | `component_sum` | Bundle price = sum of component prices (after per-component overrides/discounts). |
| Fixed Price | `fixed` | Bundle price = `fixedPrice` field, regardless of components. |
| Percent Off | `percent_off` | Bundle price = component sum minus `discountPercent`%. |
| Amount Off | `amount_off` | Bundle price = component sum minus `discountAmount` (in cents). |

Per-component pricing adjustments:
- `priceOverride`: absolute price override for this component (replaces product base price).
- `discountPercent`: percentage discount on the component's product price.

## commerce_bundle_selections Table

This table captures customer choices for configurable bundles during the cart flow:

- Created by `saveSelection` mutation when a customer configures a mix-and-match or BOGO bundle.
- Linked to a cart item via `cartItemId` (optional, set at creation).
- Linked to an order item via `orderItemId` (optional, stamped when order is placed).
- Rows without `orderItemId` that are older than 30 days are considered stale and can be pruned by `cleanupStaleBundleSelections` (internals.ts).

## Tables

| Table | Purpose |
|-------|---------|
| `commerce_bundles` | Bundle definitions (name, slug, type, pricing, status, computed prices) |
| `commerce_bundle_components` | Items that make up a bundle (product refs, quantities, pricing overrides) |
| `commerce_bundle_selections` | Customer's chosen components for configurable bundles (cart/order integration) |
