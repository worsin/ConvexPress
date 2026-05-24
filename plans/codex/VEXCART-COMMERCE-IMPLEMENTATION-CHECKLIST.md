# VexCart Commerce Plugin Suite - Implementation Checklist

**System:** VexCart Commerce Migration
**Status:** Planned
**Last Authored:** 2026-04-06
**Companion Spec:** `.codex/docs/VEXCART-COMMERCE-PLUGIN-STRATEGY.md`

---

## Working Rule

This checklist is the execution plan for building a ConvexPress commerce suite from VexCart concepts without transplanting VexCart wholesale.

Boundary reminder:

- `ConvexPress-Admin/` owns schema, Convex functions, settings, capabilities, and admin UI
- `ConvexPress-Website/` consumes the public commerce query layer and renders storefront/account routes
- commerce features should be plugin-gated
- extension plugins must depend on `commerce`

---

## Phase 1 - Commerce Plugin Foundation

### 1. Plugin Registry

Update:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Add plugin records for:

- `commerce`
- `commerceSubscriptions`
- `commerceDigital`
- `commerceReviews`
- `commerceWishlists`
- `commerceBundles`
- `commerceReturns`

### 2. Shared Plugin Settings

Update:

- `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/validators.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/validation.ts`

Add:

- `commerceEnabled`
- `commerceSubscriptionsEnabled`
- `commerceDigitalEnabled`
- `commerceReviewsEnabled`
- `commerceWishlistsEnabled`
- `commerceBundlesEnabled`
- `commerceReturnsEnabled`

### 3. Plugin Management UI

Review and update:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/plugins.tsx`
- supporting plugin UI components used by the plugins screen

Goal:

- installed plugin listing shows the commerce suite
- dependencies are visible
- extension plugins cannot be enabled unless `commerce` is enabled

---

## Phase 2 - Commerce Core Backend

### 4. Schema Files

Create:

- `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts`

Update:

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

Define at minimum:

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
- `commerce_inventory_adjustments`
- `commerce_stock_reservations`
- `commerce_discount_codes`
- `commerce_payment_transactions`
- `commerce_payment_refunds`
- `commerce_payment_settings`
- `commerce_shipping_methods`
- `commerce_shipping_zones`
- `commerce_shipping_zone_methods`
- `commerce_tax_rules`
- `commerce_customer_profiles`
- `commerce_customer_addresses`

### 5. Capability Registration

Review likely integration points:

- `ConvexPress-Admin/packages/backend/convex/types/capabilities.ts`
- capability registration helpers already used by plugin domains

Add core capabilities:

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
- `commerce.inventory.manage`
- `commerce.discounts.manage`
- `commerce.shipping.manage`
- `commerce.tax.manage`
- `commerce.payments.manage`

### 6. Backend Domain Modules

Create backend folders:

- `ConvexPress-Admin/packages/backend/convex/commerce/`

Recommended modules:

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

### 7. Public Plugin Gating

Every public query must fail closed when `commerceEnabled` is false.

Create helper(s) in:

- `ConvexPress-Admin/packages/backend/convex/commerce/helpers.ts`

Use for:

- product archives
- product singles
- cart bootstrap queries
- checkout queries
- order tracking
- account commerce queries

---

## Phase 3 - Admin Commerce UI

### 8. Admin Navigation

Update:

- `ConvexPress-Admin/apps/web/src/lib/admin-shell/nav-config.ts`

Add sections for:

- products
- orders
- customers
- discounts
- inventory
- shipping
- tax
- payments

### 9. Admin Routes

Create route group(s) under:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/`

Suggested route surface:

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

### 10. Admin Components

Create component domains:

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

### 11. Product Editor Integration

Use ConvexPress editor/media patterns instead of copying VexCart forms directly.

Requirements:

- product title / slug
- descriptions
- pricing
- category assignment
- media picker integration
- variant builder
- inventory settings
- shipping settings
- SEO fields

---

## Phase 4 - Website Storefront

### 12. Storefront Routes

Create website route surface under:

- `ConvexPress-Website/apps/web/src/routes/_marketing/`

Suggested routes:

- `shop.tsx`
- `products.tsx`
- `products_.$slug.tsx`
- `categories.tsx`
- `categories_.$slug.tsx`
- `cart.tsx`
- `checkout/index.tsx`
- `checkout/shipping.tsx`
- `checkout/payment.tsx`
- `checkout/review.tsx`
- `checkout/confirmation_.$orderId.tsx`
- `track.$token.tsx`

### 13. Website Commerce Components

Create:

- `ConvexPress-Website/apps/web/src/components/commerce/`

Suggested component groups:

- `products/`
- `cart/`
- `checkout/`
- `orders/`
- `account/`
- `pricing/`

### 14. Website Contexts / State

Create:

- `ConvexPress-Website/apps/web/src/contexts/cart-context.tsx`
- `ConvexPress-Website/apps/web/src/contexts/checkout-context.tsx`

These should be adapted from VexCart concepts, not copied blindly.

### 15. Public Convex Consumer Layer

Use the website backend consumer package only.

Review and update:

- `ConvexPress-Website/packages/backend/`
- route loaders and query helpers

Goal:

- website consumes admin-owned commerce APIs
- website never defines schema/functions

---

## Phase 5 - CMS Integration

### 16. Product Blocks

Add editor-native blocks in the admin editor for:

- product embed
- featured product
- product grid
- category grid
- add-to-cart CTA

Likely integration points:

- `ConvexPress-Admin/apps/web/src/components/editor/`
- custom block registration and inserter configuration files already used by the editor

### 17. Shortcode Compatibility

Create a narrow commerce shortcode layer on the website.

Support at least:

- `[products]`
- `[product]`
- `[add_to_cart]`

Likely website integration points:

- content renderer
- shortcode resolver utilities

### 18. Content-Type Integration

Add commerce-aware rendering to:

- pages
- posts
- reusable content blocks if supported

---

## Phase 6 - Commerce Extension Plugins

### 19. `commerceReviews`

Backend:

- `ConvexPress-Admin/packages/backend/convex/commerceReviews/`
- schema additions in `schema/commerceReviews.ts`

Website:

- product review UI
- review moderation-aware rendering

Admin:

- review moderation queue

### 20. `commerceWishlists`

Backend:

- `ConvexPress-Admin/packages/backend/convex/commerceWishlists/`
- schema additions in `schema/commerceWishlists.ts`

Website:

- wishlist page
- product wishlist button
- guest-to-account merge

### 21. `commerceSubscriptions`

Backend:

- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/`
- schema additions in `schema/commerceSubscriptions.ts`

Website:

- subscription selectors on product pages
- account subscriptions dashboard

Admin:

- subscription templates
- product subscription overrides
- subscription list / detail screens

### 22. `commerceDigital`

Backend:

- `ConvexPress-Admin/packages/backend/convex/commerceDigital/`
- schema additions in `schema/commerceDigital.ts`

Website:

- downloads dashboard
- license key rendering

Admin:

- digital file manager in product editor
- license inventory management

### 23. `commerceBundles`

Backend:

- `ConvexPress-Admin/packages/backend/convex/commerceBundles/`
- schema additions in `schema/commerceBundles.ts`

Website:

- bundle detail page behavior
- bundle selection UI

### 24. `commerceReturns`

Backend:

- `ConvexPress-Admin/packages/backend/convex/commerceReturns/`
- schema additions in `schema/commerceReturns.ts`

Website:

- account return request flow

Admin:

- return request queue
- refund coordination UI

---

## Phase 7 - Deferred Systems

### 25. Do Not Pull These Into Early Implementation

Exclude from initial commerce build:

- support/chat/contact
- AI chat assistant
- MCP registry
- UCP HTTP protocol
- WooCommerce sync/import
- general analytics/reporting
- generic notification system copy

If later needed, design these as separate ConvexPress-native plugins or system integrations.

### 26. Loyalty / Points

Do not model a points plugin as part of the VexCart migration checklist.

Reason:

- VexCart does not contain a real loyalty backend
- this requires net-new ConvexPress design

Possible later document:

- `.codex/docs/COMMERCE-LOYALTY-SYSTEM.md`

---

## Verification Requirements

### 27. Backend Verification

For each plugin phase:

- schema compiles
- Convex codegen succeeds
- public queries enforce plugin gating
- permissions enforce capabilities
- disabled plugins fail closed

### 28. Website Verification

For each storefront phase:

- product routes render
- cart survives guest sessions
- checkout handles validation correctly
- order confirmation and tracking work
- account routes hide when plugin disabled

### 29. CMS Verification

- product blocks render correctly
- shortcode output matches block output
- embeds fail safely when product/plugin missing or disabled

### 30. Extension Verification

- subscriptions do not leak into stores where plugin is disabled
- digital downloads are only visible for valid purchases
- reviews respect verified-purchase and moderation rules
- wishlists merge correctly from guest to signed-in state

