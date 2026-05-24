# Commerce Core Plugin - Implementation Checklist

**System:** Commerce Core Plugin
**Status:** Planned
**Last Authored:** 2026-04-06
**Companion Spec:** `.codex/docs/COMMERCE-CORE-PLUGIN-PRD.md`

---

## Working Rule

This is the execution checklist for the ConvexPress `commerce` plugin only.

Boundary reminder:

- admin owns schema, backend, capabilities, settings, and admin UI
- website consumes public queries and renders storefront/account routes
- the website must not define or deploy Convex schema/functions
- subscriptions, digital, reviews, wishlists, bundles, and returns are not part of this checklist

---

## Phase 1 - Plugin Foundation

### 1. Plugin Registry

Update:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Add:

- `commerce`

### 2. Shared Settings

Update:

- `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/validators.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/validation.ts`

Add:

- `commerceEnabled`
- store settings keys
- payment settings keys
- shipping settings keys
- tax settings keys

### 3. Plugin UI

Update:

- plugin management route/components

Goal:

- commerce can be enabled/disabled
- plugin description and route scope are visible

---

## Phase 2 - Schema

### 4. Core Schema File

Create:

- `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts`

Update:

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

Add tables:

- `commerce_product_categories`
- `commerce_products`
- `commerce_product_option_types`
- `commerce_product_option_values`
- `commerce_product_variants`
- `commerce_carts`
- `commerce_cart_items`
- `commerce_checkout_sessions`
- `commerce_orders`
- `commerce_order_items`
- `commerce_order_history`
- `commerce_customer_profiles`
- `commerce_customer_addresses`
- `commerce_discount_codes`
- `commerce_payment_transactions`
- `commerce_payment_refunds`
- `commerce_payment_settings`
- `commerce_shipping_methods`
- `commerce_shipping_zones`
- `commerce_shipping_zone_methods`
- `commerce_tax_rules`
- `commerce_inventory_adjustments`
- `commerce_stock_reservations`

---

## Phase 3 - Backend Domain Modules

### 5. Create Commerce Domain

Create:

- `ConvexPress-Admin/packages/backend/convex/commerce/`

Recommended files:

- `helpers.ts`
- `validators.ts`
- `products.ts`
- `categories.ts`
- `cart.ts`
- `checkout.ts`
- `orders.ts`
- `customers.ts`
- `payments.ts`
- `discounts.ts`
- `inventory.ts`
- `shipping.ts`
- `tax.ts`

### 5A. Robust Discount Engine

Update:

- `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/validators.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/discounts.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/cart.ts`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/discounts.tsx`

Implement:

- fixed cart, percent, and fixed per-item discount types
- minimum subtotal and minimum quantity requirements
- product/category include and exclude constraints
- tiered quantity thresholds for bulk ordering
- tiered subtotal thresholds for spend-based discounts
- deterministic best-tier selection
- explicit invalid/not-qualified errors when a shopper applies a code
- unit tests for tier selection, scoped eligibility, and threshold rejection

### 6. Plugin Gating

Implement `requireCommerceEnabled()` and public fail-closed helpers in:

- `ConvexPress-Admin/packages/backend/convex/commerce/helpers.ts`

### 7. Capabilities

Update role/capability sources to add:

- `commerce.products.view`
- `commerce.products.create`
- `commerce.products.edit`
- `commerce.products.delete`
- `commerce.products.publish`
- `commerce.orders.view`
- `commerce.orders.edit`
- `commerce.orders.cancel`
- `commerce.orders.refund`
- `commerce.customers.view`
- `commerce.customers.edit`
- `commerce.discounts.manage`
- `commerce.inventory.manage`
- `commerce.shipping.manage`
- `commerce.tax.manage`
- `commerce.payments.manage`
- `commerce.settings.manage`

---

## Phase 4 - Admin UI

### 8. Navigation

Update:

- `ConvexPress-Admin/apps/web/src/lib/admin-shell/nav-config.ts`

Add commerce nav groups:

- products
- orders
- customers
- discounts
- inventory
- shipping
- tax
- payments
- settings

### 9. Routes

Create:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/`

Suggested route files:

- `index.tsx`
- `products.tsx`
- `products.$productId.tsx`
- `categories.tsx`
- `orders.tsx`
- `orders.$orderId.tsx`
- `customers.tsx`
- `customers.$customerId.tsx`
- `discounts.tsx`
- `inventory.tsx`
- `shipping.tsx`
- `tax.tsx`
- `payments.tsx`
- `settings.tsx`

### 10. Components

Create:

- `ConvexPress-Admin/apps/web/src/components/commerce/`

Suggested component groups:

- `products/`
- `orders/`
- `customers/`
- `discounts/`
- `inventory/`
- `shipping/`
- `tax/`
- `payments/`

---

## Phase 5 - Website Storefront

### 11. Marketing Routes

Create:

- `ConvexPress-Website/apps/web/src/routes/_marketing/shop.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/products.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/products_.$slug.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/categories.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/categories_.$slug.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/cart.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/checkout/index.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/checkout/shipping.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/checkout/payment.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/checkout/review.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/checkout/confirmation_.$orderId.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/track.$token.tsx`

### 12. Dashboard Routes

Create:

- `ConvexPress-Website/apps/web/src/routes/_dashboard/orders/index.tsx`
- `ConvexPress-Website/apps/web/src/routes/_dashboard/orders/$orderId.tsx`
- `ConvexPress-Website/apps/web/src/routes/_dashboard/addresses.tsx`
- `ConvexPress-Website/apps/web/src/routes/_dashboard/account.tsx`

### 13. Website Components

Create:

- `ConvexPress-Website/apps/web/src/components/commerce/`

Suggested groups:

- `products/`
- `cart/`
- `checkout/`
- `orders/`
- `account/`

### 14. Website Contexts

Create:

- `ConvexPress-Website/apps/web/src/contexts/cart-context.tsx`
- `ConvexPress-Website/apps/web/src/contexts/checkout-context.tsx`

---

## Phase 6 - CMS Integration

### 15. Editor Blocks

Add block support in the admin editor for:

- product embed
- product grid
- featured products
- category showcase
- add-to-cart CTA

### 16. Shortcode Layer

Add website rendering support for:

- `[product]`
- `[products]`
- `[add_to_cart]`

### 17. Content Rendering

Ensure product blocks and shortcodes render correctly inside:

- pages
- posts
- reusable content blocks if applicable

---

## Phase 7 - Verification

### 18. Backend Verification

- schema compiles
- codegen succeeds when environment allows
- public queries fail closed when plugin disabled
- permission checks enforce capabilities

### 19. Website Verification

- product archive and single routes render
- cart works for guest and signed-in flows
- checkout reaches order confirmation
- order tracking works
- account routes require auth

### 20. CMS Verification

- product blocks render correctly
- shortcode output matches block output
- disabled plugin suppresses embeds
