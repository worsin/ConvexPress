# Commerce Core Plugin - PRD and Implementation Strategy

**System:** Commerce Core Plugin
**Status:** Planned
**Priority:** P0 - Foundational
**Complexity:** Very Complex
**Layer:** Full Stack / Plugin
**Source Blueprint:** `/Users/worsin/Development/VexCart`
**Target Project:** `ConvexPress`
**WordPress Equivalent:** WooCommerce core
**Last Authored:** 2026-04-06

---

## Intent

The Commerce Core Plugin is the foundational store platform for ConvexPress. It brings product catalog, pricing, variants, inventory, cart, checkout, orders, customers, discounts, payments, shipping, and tax into ConvexPress as a first-class plugin-owned domain.

This is not meant to recreate the entire VexCart application inside ConvexPress. It is meant to extract and adapt the core commerce substrate from VexCart into ConvexPress’s architecture:

- `ConvexPress-Admin/` owns schema, Convex functions, settings, permissions, and admin UI
- `ConvexPress-Website/` consumes the public commerce API and renders storefront and customer account surfaces
- commerce must integrate with ConvexPress systems like media, pages, menus, SEO, search, auth, layout, and the content editor
- extension features such as subscriptions, digital products, reviews, wishlists, bundles, and returns are separate plugins layered on top of this core

This document covers only the **core commerce plugin**.

---

## Product Goals

1. Turn ConvexPress into a real purchasable storefront platform.
2. Support physical and basic digital-ready product cataloging.
3. Provide a complete buyer flow:
   - browse
   - view product
   - add to cart
   - checkout
   - pay
   - receive order confirmation
   - track order
4. Give administrators and store operators complete store management UI.
5. Integrate cleanly with ConvexPress themes, pages, menus, media, SEO, and content blocks.
6. Establish a strong plugin and capability boundary for all later commerce extensions.

---

## Non-Goals For This Plugin

The Commerce Core Plugin does **not** include:

- subscriptions
- downloads and license keys
- wishlists
- reviews
- bundles
- returns / RMAs
- fulfillment manifests and label management
- support/tickets/chat
- WooCommerce import
- AI/UCP/MCP protocol layers
- loyalty / points / store credit

Those belong to separate plugins or later phases.

---

## What VexCart Contributes To This Plugin

The relevant VexCart source domains are:

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

The Commerce Core Plugin should borrow:

- domain boundaries
- state transitions
- validation patterns
- pricing logic
- cart/checkout flow shape
- inventory reservation model
- payment transaction tracking
- shipping/tax composition
- order creation workflow

It should **not** copy VexCart route assumptions, auth assumptions, role checks, or file layout directly.

---

## Plugin Definition

### Plugin ID

- `commerce`

### Plugin Purpose

Provides the core store engine for ConvexPress.

### Required Dependency Status

This is a top-level plugin. Other commerce plugins depend on it.

### Registry Integration

Add to:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Recommended metadata:

- `id`: `commerce`
- `title`: `Commerce`
- `description`: `Products, cart, checkout, orders, payments, shipping, tax, and customer accounts`
- `settingsKey`: `commerceEnabled`
- `adminAccessPrefixes`: `["/admin/commerce"]`
- `routePrefixes`: `["/shop", "/products", "/cart", "/checkout", "/track"]`

### Plugin Gating Rule

If `commerceEnabled === false`:

- product archives must not render
- product detail routes must not resolve
- cart and checkout routes must not operate
- account commerce pages must not render
- commerce content blocks/shortcodes must fail closed

This plugin must use strong public gating from day one.

---

## Architectural Position In ConvexPress

### Systems This Plugin Owns

- products
- product categories
- product variants
- pricing
- inventory
- cart
- checkout
- orders
- customer commerce profile
- discounts
- payment settings and transaction records
- shipping settings and shipping rate selection
- tax settings and tax calculation
- commerce storefront routes
- commerce account routes
- commerce editor blocks and shortcode rendering

### Systems This Plugin Consumes

- Auth System
- Role & Capability System
- Settings System
- Media System
- SEO System
- Routing System
- Search System
- Website Layout UI
- Content Editor System
- Menu System
- User Profile System

### Systems This Plugin Must Not Replace

- support/tickets
- comments
- general analytics
- site notifications
- menus
- pages/posts
- global user profile ownership

The plugin extends ConvexPress. It does not become the new center of the whole application.

---

## Core User Stories

### Merchant / Admin

- Create and organize products with images, descriptions, prices, and inventory settings.
- Configure shipping, tax, and payment settings.
- Manage customer orders and update order status.
- Create coupons and discounts.
- Review customer profiles and addresses relevant to commerce.
- Embed products or product grids inside pages and marketing content.

### Shopper

- Browse products and categories.
- View product details, variants, pricing, stock state, and gallery.
- Add items to cart as guest or authenticated user.
- Proceed through checkout with shipping, payment, and review steps.
- Receive order confirmation and track order status.
- Access order history and saved addresses if authenticated.

### Content Editor / Marketer

- Insert product cards or product grids inside pages/posts using editor blocks.
- Use shortcode compatibility for product embeds and CTAs.
- Build landing pages that mix CMS content and commerce elements.

---

## Route Surface

This is the minimum route surface the plugin should own or influence.

### Website Marketing Routes

Suggested routes in `ConvexPress-Website/apps/web/src/routes/_marketing/`:

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

### Website Dashboard / Account Routes

Suggested routes in `ConvexPress-Website/apps/web/src/routes/_dashboard/`:

- `orders/index.tsx`
- `orders/$orderId.tsx`
- `addresses.tsx`
- `account.tsx`

### Admin Routes

Suggested routes in `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/`:

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

### Route Ownership Notes

- product archive and single-product routes belong to the plugin
- checkout routes belong to the plugin
- order tracking belongs to the plugin
- page/post routes do not belong to the plugin, but commerce blocks and shortcodes can render inside them

---

## Information Architecture

### Public IA

- Shop
- Categories
- Product Detail
- Cart
- Checkout
- Order Confirmation
- Order Tracking
- Customer Account
- Customer Orders
- Customer Addresses

### Admin IA

- Dashboard summary card(s)
- Products
- Categories
- Orders
- Customers
- Discounts
- Inventory
- Shipping
- Tax
- Payments
- Commerce Settings

### CMS Embedding IA

- Product block
- Product grid block
- Category showcase block
- Add-to-cart CTA block
- Shortcode compatibility

---

## Domain Model

The core plugin needs a clear and durable schema family.

### Product Model

Recommended tables:

- `commerce_product_categories`
- `commerce_products`
- `commerce_product_option_types`
- `commerce_product_option_values`
- `commerce_product_variants`

#### `commerce_products`

Recommended fields:

- `title`
- `slug`
- `sku`
- `description`
- `shortDescription`
- `status`: `draft | active | archived`
- `catalogVisibility`: `visible | hidden | search_only`
- `basePrice`
- `salePrice`
- `salePriceStartsAt`
- `salePriceEndsAt`
- `costPrice`
- `currency`
- `categoryIds`
- `tagSlugs` or taxonomy links later
- `primaryMediaId`
- `galleryMediaIds`
- `trackInventory`
- `stockCount`
- `reservedCount`
- `allowBackorder`
- `lowStockThreshold`
- `isShippable`
- `weight`
- `dimensions`
- `shippingClassId`
- `metaTitle`
- `metaDescription`
- `canonicalUrl`
- `viewCount`
- `purchaseCount`
- `createdAt`
- `updatedAt`
- `publishedAt`

#### `commerce_product_variants`

Recommended fields:

- `productId`
- `sku`
- `optionValueIds`
- `title`
- `priceOverride`
- `salePriceOverride`
- `stockCount`
- `reservedCount`
- `trackInventory`
- `allowBackorder`
- `sortOrder`
- `createdAt`
- `updatedAt`

### Cart Model

Recommended tables:

- `commerce_carts`
- `commerce_cart_items`

#### `commerce_carts`

Recommended fields:

- `userId?`
- `sessionToken`
- `status`: `active | converted | abandoned | expired`
- `shippingMethodId?`
- `currency`
- `createdAt`
- `updatedAt`
- `expiresAt?`

#### `commerce_cart_items`

Recommended fields:

- `cartId`
- `productId`
- `variantId?`
- `quantity`
- `unitPriceSnapshot`
- `addedAt`
- `updatedAt`

### Checkout Model

Recommended table:

- `commerce_checkout_sessions`

Recommended fields:

- `cartId`
- `userId?`
- `sessionToken`
- `status`: `incomplete | shipping | payment | review | processing | completed | expired | abandoned`
- `guestEmail?`
- `shippingAddress?`
- `billingAddress?`
- `shippingMethodId?`
- `paymentMethodType?`
- `discountCode?`
- `discountId?`
- `notes?`
- `subtotal`
- `shippingTotal`
- `taxTotal`
- `discountTotal`
- `grandTotal`
- `orderId?`
- `expiresAt`
- `createdAt`
- `updatedAt`

### Order Model

Recommended tables:

- `commerce_orders`
- `commerce_order_items`
- `commerce_order_history`

#### `commerce_orders`

Recommended fields:

- `orderNumber`
- `userId?`
- `guestEmail?`
- `status`: `pending | confirmed | processing | shipped | delivered | cancelled | refunded`
- `paymentStatus`: `pending | paid | failed | refunded | partially_refunded`
- `subtotal`
- `shippingTotal`
- `taxTotal`
- `discountTotal`
- `grandTotal`
- `currency`
- `billingAddress`
- `shippingAddress`
- `shippingMethod`
- `trackingToken`
- `trackingNumber?`
- `trackingUrl?`
- `discountCode?`
- `notes?`
- `placedAt`
- `updatedAt`

#### `commerce_order_items`

Recommended fields:

- `orderId`
- `productId?`
- `variantId?`
- `productTitleSnapshot`
- `skuSnapshot?`
- `unitPrice`
- `quantity`
- `lineTotal`
- `metadata?`

### Customer Commerce Model

Recommended tables:

- `commerce_customer_profiles`
- `commerce_customer_addresses`

This plugin should reference the broader user system but still own commerce-specific customer state.

#### `commerce_customer_profiles`

Recommended fields:

- `userId`
- `defaultShippingAddressId?`
- `defaultBillingAddressId?`
- `orderCount`
- `totalSpent`
- `lastOrderAt?`
- `isTaxExempt?`
- `taxExemptId?`
- `createdAt`
- `updatedAt`

#### `commerce_customer_addresses`

Recommended fields:

- `userId`
- `label?`
- `type`: `shipping | billing | both`
- `firstName`
- `lastName`
- `company?`
- `address1`
- `address2?`
- `city`
- `state`
- `postalCode`
- `country`
- `phone?`
- `isDefault?`
- `createdAt`
- `updatedAt`

### Discounts / Payments / Shipping / Tax

Recommended tables:

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

These should remain in the core plugin because checkout depends on them directly.

### Discount System Requirements

Discounts must be rule-driven rather than limited to simple coupon amounts. The core
system must support a broad set of merchant promotions without requiring custom code
for each campaign.

Required discount capabilities:

- Fixed cart amount, percentage, and fixed per-item discounts.
- Cart subtotal thresholds, for example "orders over $250 get $25 off."
- Cart quantity thresholds, for example "order 12 or more units and get 10% off."
- Product-specific and category-specific applicability.
- Excluded products and excluded categories.
- Tiered bulk discounts with multiple thresholds on a single code, for example:
  - 10+ units: 5% off
  - 25+ units: 10% off
  - 50+ units: 15% off
- Tiered subtotal discounts with multiple spend thresholds.
- Product-scoped quantity tiers, for example "buy 6+ of product A, get $3 off each."
- Best-tier selection: when multiple tiers qualify, the highest qualifying tier wins unless a future rule explicitly chooses cumulative behavior.
- Date windows and total usage limits.
- Deterministic recalculation when cart contents, quantities, prices, or discount rules change.
- Clear rejection behavior when a code exists but cart requirements are not met.

Discount rule model:

- `discountType`: `fixed_cart | percent | fixed_product`
- `amount`: default discount amount used when no tier overrides it
- `minimumSubtotalAmount?`
- `minimumQuantity?`
- `applicability`: `cart | matching_items`
- `productIds?`
- `categoryIds?`
- `excludedProductIds?`
- `excludedCategoryIds?`
- `tiers?`: ordered threshold rows, each with:
  - `label?`
  - `minQuantity?`
  - `minSubtotalAmount?`
  - `discountType`
  - `amount`
- `maxDiscountAmount?`

Implementation rules:

- Product/category constraints define the eligible item set.
- Minimum thresholds are evaluated against the eligible item set.
- For `fixed_cart`, cap the discount at the eligible subtotal.
- For `percent`, apply percentage to eligible subtotal and cap by `maxDiscountAmount` if present.
- For `fixed_product`, multiply by eligible quantity and cap at eligible subtotal.
- If no tiers are configured, apply the base `discountType` and `amount`.
- If tiers are configured, select the qualifying tier with the highest threshold.
- A discount that is active but not qualified must not silently apply a zero discount as success during explicit code application.

---

## Product Detail Requirements

Each product detail page should support:

- title
- price display
- sale display
- stock status
- primary image and gallery
- variant selector where applicable
- category breadcrumbs
- add-to-cart action
- shipping/tax messaging hooks
- related products later
- SEO metadata

Product details should integrate with the Media System rather than owning a separate upload implementation.

---

## Cart Requirements

The cart system must support:

- guest carts
- authenticated carts
- cart merge on sign-in
- quantity updates
- item removal
- cart clearing
- stock validation
- variant-aware items
- shipping method preselection if desired
- cart badge/header integration

### Cart Behavior Rules

- adding an inactive product must fail
- stock validation must happen on add and again on checkout
- guest carts need stable browser session tokens
- signed-in users should recover their existing cart
- merge behavior must be deterministic on sign-in

---

## Checkout Requirements

Checkout is a multi-step workflow, not a single form.

### Steps

1. Start / session bootstrap
2. Shipping information
3. Payment method
4. Review and confirm
5. Complete / create order

### Required Capabilities

- guest checkout optional, driven by settings
- saved address reuse for signed-in users
- shipping method selection
- discount code application/removal
- buyer notes
- order total recomputation on every meaningful step
- expired or abandoned checkout handling

### Checkout Failure Modes

The system must account for:

- inventory no longer available
- product price changed since cart add
- shipping unavailable
- tax calculation failure
- payment authorization failure
- expired checkout session

---

## Payment Requirements

The core plugin must support a payment abstraction even if only one provider is initially enabled.

### v1 Recommendation

Support:

- Stripe
- optional PayPal later if the project wants parity with VexCart

### Payment Responsibilities

- public publishable settings query
- available methods query
- payment intent or provider-order creation
- transaction logging
- webhook handling
- refund recording
- payment status propagation to checkout and orders

### Payment Data Rules

- store provider transaction ids
- never expose secrets in public queries
- preserve auditability of status changes
- keep payment transaction history separate from order status history

---

## Shipping Requirements

The core plugin should include a practical but disciplined shipping model.

### v1 Scope

- shipping methods
- basic shipping zone support
- configurable rates
- free shipping threshold support
- shipping selection in checkout

### Later Scope

- carrier accounts
- label generation
- packing algorithms
- manifests

Those later concerns should not block core checkout.

---

## Tax Requirements

The tax layer should support:

- rule-based tax calculation
- configurable jurisdictions
- tax-inclusive or tax-exclusive pricing mode later if needed
- recalculation at checkout
- tax-exempt customers

Keep this deterministic and explicit. Do not hide tax logic in frontend-only calculations.

---

## Inventory Requirements

Inventory is part of the core plugin because cart and checkout depend on reservation behavior.

### Requirements

- current stock counts
- reservation records for active carts/checkouts
- release of expired reservations
- commit of stock on successful order creation
- low stock threshold support
- backorder support
- inventory adjustment history

### Inventory Integrity Rules

- reservations must expire
- successful checkout must commit inventory atomically enough to prevent double-sell patterns
- cart views should reflect real availability as closely as practical

---

## CMS Integration Requirements

The core commerce plugin must feel native inside ConvexPress content authoring.

### Editor Blocks

Add block types for:

- product embed
- product grid
- featured products
- category showcase
- add-to-cart CTA

### Shortcode Compatibility

Support a narrow shortcode layer:

- `[product id="..."]`
- `[product slug="..."]`
- `[products category="..." limit="8"]`
- `[add_to_cart product="..."]`

### Authoring Principle

Use:

- block-first authoring
- shortcode as compatibility and power-user path

Do not make shortcode parsing the primary editor UX.

---

## Search, SEO, and Routing Requirements

### Search

Commerce products must be searchable through the public search experience.

Recommended features:

- product archive filtering
- basic search relevance
- category filtering
- price sorting

### SEO

Products and categories must support:

- titles
- meta descriptions
- canonical URLs
- structured breadcrumbs
- sitemap inclusion
- noindex for hidden/unpublished products

### Routing

Products should use stable, CMS-friendly routes:

- `/products/:slug`
- `/categories/:slug`
- optional `/shop`

The plugin must work with the Routing System rather than introducing separate routing logic outside ConvexPress conventions.

---

## Settings Model

Add plugin-aware settings under the shared settings system.

### Core Plugin Toggle

- `commerceEnabled`

### Store Settings

- storeName
- defaultCurrency
- allowGuestCheckout
- cartReservationMinutes
- defaultLowStockThreshold
- orderNumberPrefix

### Payment Settings

- stripeEnabled
- stripePublishableKey
- stripeSecretConfigured state
- paypalEnabled later if chosen
- paymentMethodOrder

### Shipping Settings

- originAddress
- freeShippingThreshold
- enabledShippingModes

### Tax Settings

- defaultTaxRegion
- taxMode

---

## Capability Model

Use ConvexPress capabilities, not VexCart’s inline role checks.

### Core Capabilities

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

### Public Access Rules

- public product browsing does not require auth
- cart and checkout should allow guest mode if enabled
- account orders and saved addresses require auth
- admin routes require appropriate capabilities

---

## Admin UX Requirements

The admin interface should feel like a serious store back office, not a thin settings page.

### Product Editor

Needs:

- title / slug
- descriptions
- pricing
- sale controls
- media picker
- category assignment
- variant management
- inventory controls
- shipping controls
- SEO controls
- publish/archive controls

### Product List

Needs:

- status filters
- category filter
- stock visibility
- search
- bulk actions
- quick row actions

### Order Detail

Needs:

- order metadata
- line items
- totals
- addresses
- payment state
- status history
- internal notes
- tracking information

### Customer Detail

Needs:

- commerce summary
- total spent
- order count
- recent orders
- saved addresses

### Settings Screens

Needs:

- payment settings
- shipping settings
- tax settings
- store settings

---

## Website UX Requirements

### Shop / Archive

- product cards
- sorting
- filtering later
- empty state
- pagination or load-more

### Product Page

- image gallery
- price
- availability
- variant selection
- add to cart

### Cart

- drawer or page
- quantity editing
- removal
- subtotal display
- checkout CTA

### Checkout

- clear step structure
- validation feedback
- order summary
- coupon support
- shipping selection
- payment collection

### Account Surfaces

- order history
- order detail
- address management

---

## Data Flow Overview

### Product Purchase Flow

1. Shopper views product archive
2. Shopper views product detail
3. Shopper adds product/variant to cart
4. Cart validates availability
5. Shopper starts checkout
6. Checkout collects shipping and payment info
7. Totals are recomputed with shipping/tax/discount
8. Payment is authorized
9. Order is created
10. Inventory is committed
11. Checkout session is completed
12. Shopper sees confirmation

### Admin Product Flow

1. Admin creates product
2. Admin assigns media, categories, pricing, inventory rules
3. Admin publishes product
4. Public routes and embedded blocks can render the product

---

## Public API / Backend Module Shape

Recommended admin backend module:

- `ConvexPress-Admin/packages/backend/convex/commerce/`

Suggested files:

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

### Public Query Families

- product archive and single-product queries
- cart bootstrap and item count queries
- checkout session queries
- shipping methods query
- payment settings/methods query
- order tracking query
- account order/address queries

### Admin Query / Mutation Families

- product CRUD
- variant CRUD
- category CRUD
- stock adjustment
- order state changes
- tracking updates
- discount CRUD
- payment settings updates
- shipping/tax CRUD

---

## Performance Requirements

The plugin must be practical at scale.

### Requirements

- denormalize counters where useful
- avoid N+1 product/category/media resolution in public archives
- use snapshot pricing on cart/order items
- keep checkout totals deterministic
- index slug/status/order/payment queries correctly
- limit heavy admin list queries with pagination

### v1 Threshold Guidance

- archives should paginate
- order lists should paginate
- admin tables should use list-table patterns
- product media should use the Media System’s derivative strategy

---

## Security and Integrity Requirements

### Security

- guest checkout must be explicit and settings-driven
- payment secrets must stay server-side only
- order/account data must enforce owner-or-admin access
- admin operations must be capability-gated

### Integrity

- checkout should fail on stale inventory or invalid prices
- order creation must persist snapshots of titles/prices/SKUs
- disabled plugin must fail closed
- hidden/unpublished products must never render publicly

---

## Rollout Plan

### Phase 1 - Core Catalog and Admin Backbone

Build:

- plugin registration
- schema
- product/category CRUD
- admin lists and editor
- public product archive and product single route

### Phase 2 - Cart and Checkout

Build:

- cart context
- cart mutations
- checkout sessions
- shipping/tax/discount composition
- payment intent/provider integration
- order creation

### Phase 3 - Account and Order Management

Build:

- account orders
- order detail
- order tracking
- customer admin detail
- payment/refund admin views

### Phase 4 - CMS Integration

Build:

- product embed blocks
- product grid blocks
- shortcode compatibility
- landing-page integration

### Phase 5 - Hardening

Build:

- abandoned/expired cart handling
- low-stock alerts
- richer filtering
- stronger analytics hooks

---

## Acceptance Criteria

The Commerce Core Plugin is successful when:

- products can be created, published, and rendered publicly
- customers can add products to a cart and complete checkout
- orders are persisted with correct totals and snapshots
- admins can manage orders, products, and settings
- product and store elements can be embedded inside ConvexPress content
- plugin disablement fully removes public commerce behavior
- future commerce plugins can depend on this core without redefining core tables

---

## Final Recommendation

Build the Commerce Core Plugin as the equivalent of WooCommerce core for ConvexPress.

Keep it focused on:

- catalog
- cart
- checkout
- orders
- customers
- discounts
- payments
- shipping
- tax
- inventory
- CMS integration

Do not pollute it with subscriptions, reviews, wishlists, returns, support, or loyalty. Those belong on top of this foundation, not inside it.
