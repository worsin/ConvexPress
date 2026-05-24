# VexCart Commerce Plugin Strategy

**System:** VexCart Commerce Migration Strategy
**Status:** Planned
**Priority:** P0 - Strategic
**Complexity:** Very Complex
**Layer:** Full Stack / Multi-Plugin
**Source Project:** `/Users/worsin/Development/VexCart`
**Target Project:** `ConvexPress`
**Last Authored:** 2026-04-06

---

## Intent

This document analyzes the existing `VexCart` project and defines the correct strategy for turning its commerce capabilities into ConvexPress plugins.

This is not a copy-paste exercise. `VexCart` is a full commerce platform with a broad schema, storefront surface, customer account surface, payment flows, and operational tooling. ConvexPress should absorb the portable commerce systems while explicitly excluding non-commerce systems that do not belong in a commerce plugin suite.

The strategy here is:

- preserve ConvexPress system boundaries
- avoid transplanting VexCart wholesale
- split VexCart into a **core commerce platform plugin** plus **optional extension plugins**
- keep admin-owned backend logic in `ConvexPress-Admin/`
- keep website rendering and storefront consumption in `ConvexPress-Website/`
- use ConvexPress plugin gating and capability systems from day one

---

## Executive Summary

VexCart should not become a single giant plugin.

The right architecture for ConvexPress is:

1. one required **Commerce Core** plugin
2. several optional commerce extension plugins built on top of that core
3. a strict exclusion list for systems that do not belong in the commerce suite

### Recommended Plugin Split

**Required foundation plugin**

- `commerce`

**Recommended extension plugins**

- `commerceSubscriptions`
- `commerceDigital`
- `commerceReviews`
- `commerceWishlists`
- `commerceBundles`
- `commerceReturns`

**Possible later plugins**

- `commerceFulfillment`
- `commerceUcp`

**Integration tooling (not plugins)**

- `commerceWooSync` - import/sync tooling module, admin-only, no plugin toggle

### Important Reality Check

Your prompt mentioned subscriptions and points.

Subscriptions exist in VexCart and are substantial.

A real points or loyalty engine does **not** appear to exist in VexCart. There are only superficial references such as notification copy mentioning rewards. There is no dedicated loyalty schema or backend module for points, wallet balances, loyalty accrual, redemption, or tiering.

That means:

- subscriptions should be treated as a migration target
- loyalty/points should be treated as a **new net-new plugin design**, not a VexCart extraction

---

## What VexCart Actually Contains

The `VexCart-Admin` backend under `/Users/worsin/Development/VexCart/VexCart-Admin/packages/backend/convex` contains these commerce-relevant domains:

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
- `shippingZones.ts`
- `shippingRates.ts`
- `shippingClasses.ts`
- `shippingPackages.ts`
- `shippingCarriers.ts`
- `tax.ts`
- `subscriptions.ts`
- `digitalProducts.ts`
- `wishlists.ts`
- `reviews.ts`
- `bundles.ts`
- `returns.ts`
- `fulfillment.ts`

It also contains adjacent systems that should not be pulled into the commerce plugin scope:

- `support.ts`
- `chat.ts`
- `contact.ts`
- `notifications.ts`
- `email.ts`
- `emailActions.ts`
- `analytics.ts`
- `sync/*`
- `woocommerce/*`
- `mcp/*`
- `ucp/*`

The website repo also confirms the customer-facing feature set:

- product catalog routes
- category routes
- cart
- checkout
- order confirmation and order tracking
- customer dashboard
- subscriptions dashboard
- downloads dashboard
- reviews
- wishlist
- account addresses/preferences

This confirms that VexCart is best treated as a **commerce platform decomposition**, not a simple checkout widget import.

---

## VexCart Feature Inventory

### 1. Commerce Foundation

These are the irreducible store primitives and should live in `commerce`:

- product catalog
- product categories
- variants and option types
- pricing and sale pricing
- inventory and stock reservations
- cart sessions and cart items
- checkout sessions
- order records and order items
- customer profiles and addresses
- payment provider configuration
- shipping method selection
- tax calculation
- discount/coupon application

This is the minimum set required for a real store.

### 2. Subscription Commerce

VexCart has a serious subscriptions system:

- subscription templates
- product-level subscription overrides
- recurring subscription records
- invoices
- invoice items
- status lifecycle
- dunning attempts
- entitlements
- idempotency keys
- pause / resume / cancel flows

This is too substantial to hide inside a generic cart plugin. It should be an extension plugin on top of Commerce Core.

### 3. Digital Commerce

VexCart has a dedicated digital-goods layer:

- digital files per product and variant
- versioning
- preview flags
- download tokens
- download logs
- license keys
- license activations
- customer downloads

This is a distinct plugin candidate because many stores do not need licensing or downloads.

### 4. Customer Experience Extensions

These are meaningful but optional:

- wishlists
- reviews and moderation
- product bundles

They integrate tightly with products and orders, but they do not belong in the minimum viable commerce foundation.

### 5. Post-Purchase Operations

These are important for enterprise commerce but should not block a first release:

- returns / RMAs
- fulfillment orders
- labels / manifests / shipping cost records

These can be folded into `commerce` later or broken into separate operations plugins.

### 6. AI / Agent / Protocol Surfaces

VexCart includes:

- UCP discovery and checkout APIs
- MCP registry/tool definitions
- AI chat and escalation scaffolding

These are interesting, but they are not necessary to deliver ConvexPress commerce. They should be treated as late-stage add-ons, not core migration scope.

---

## Recommended ConvexPress Plugin Architecture

### Plugin 1: `commerce`

This is the required foundation.

It should own:

- product categories
- products
- variants and options
- pricing and sale pricing
- inventory counts and reservations
- cart sessions and cart items
- checkout sessions
- orders and order items
- customer commerce profile data
- discounts and coupons
- payment settings and transaction records
- shipping methods and basic shipping rate selection
- tax rules and tax calculation
- storefront routes and account routes for core commerce

This plugin is the base dependency for all other commerce plugins.

### Plugin 2: `commerceSubscriptions`

This extension depends on `commerce`.

It should own:

- subscription templates
- product subscription overrides
- subscription lifecycle
- recurring invoices
- dunning
- subscription entitlements
- customer subscription dashboard

This should remain optional because many stores need one-time checkout only.

### Plugin 3: `commerceDigital`

This extension depends on `commerce`.

It should own:

- digital file records
- download token generation
- download logs
- customer downloads
- license keys
- license activation / validation

This is the cleanest way to support software, media, and licensed digital products without burdening physical-product stores.

### Plugin 4: `commerceReviews`

This extension depends on `commerce`.

It should own:

- product reviews
- verified-purchase review gating
- moderation
- helpful voting
- product rating aggregates

### Plugin 5: `commerceWishlists`

This extension depends on `commerce`.

It should own:

- wishlists
- wishlist items
- shared wishlist links
- guest-to-account wishlist merge

### Plugin 6: `commerceBundles`

This extension depends on `commerce`.

It should own:

- bundle products
- bundle components
- selection logic
- bundle pricing rules

### Plugin 7: `commerceReturns`

This extension depends on `commerce`.

It should own:

- return requests
- return notes
- refund coordination
- return labels

### Defer These

These plugins should not be in v1:

- `commerceFulfillment`
- `commerceUcp`
- loyalty / points / store credit

These are integration tooling, not plugins (no plugin toggle):

- `commerceWooSync` - import/sync tooling module, admin-only

---

## Why One Core Plugin Plus Extensions Is Better Than Many Tiny Plugins

There are two bad extremes:

1. one massive `vexcart` plugin that drags in everything
2. dozens of tiny plugins where checkout depends on half the registry

The correct middle ground is:

- one **Commerce Core** platform plugin for store fundamentals
- a handful of optional feature plugins for major product/business models

This aligns with enterprise reality:

- checkout depends on payments, discounts, tax, shipping, orders, and inventory
- those should not be individually optional if the store is active
- subscriptions, downloads, wishlists, and reviews can be optional

---

## Systems That Should Be Excluded

These VexCart systems should not be imported as commerce plugins in ConvexPress:

### Exclude Entirely From Commerce Scope

- support tickets
- support chat
- contact submissions
- generic notification center
- generic email template system
- general analytics/reporting
- role system copies
- route permission copies
- AI chat assistant
- MCP tool registry
- WooCommerce import tooling

### Why

ConvexPress already has or will have separate systems for:

- support
- notifications
- email
- analytics
- auth
- capabilities
- admin shell
- plugin registry

Porting those from VexCart would create duplication and architectural drift.

---

## Key Architectural Differences To Respect

### 1. ConvexPress Is Content-First, VexCart Is Commerce-First

VexCart is fundamentally a storefront platform.

ConvexPress is fundamentally a content/CMS platform with growing plugin domains.

That means the commerce system in ConvexPress must integrate with:

- pages
- posts
- content editor
- shortcodes / embeds where appropriate
- media system
- SEO system
- menus
- themes and templates

The product model cannot be the only first-class content model.

### 2. Products Should Behave Like Plugin-Owned Content Types

Products in ConvexPress should be treated more like:

- a plugin-owned content entity
- with archives, single routes, SEO, media, and embeds

This is closer to WordPress + WooCommerce than to a standalone storefront app.

### 3. The Website Must Render, Not Own

Just like the gallery system:

- `ConvexPress-Admin/` owns schema and functions
- `ConvexPress-Website/` consumes the public query layer

The website should not define commerce schema or functions locally.

### 4. Plugin Gating Must Be Strong

This migration should use the stronger pattern:

- disabled commerce plugin means no public product routes
- disabled subscription plugin means no subscription options or subscription routes
- disabled digital plugin means no downloads/license surfaces
- disabled review plugin means product reviews disappear from public rendering

Do not repeat the weaker “admin visibility only” plugin pattern.

---

## ConvexPress Feature Mapping

### Best Mapping For Commerce Core

**Admin responsibilities**

- product CRUD
- category CRUD
- variant management
- pricing
- stock management
- coupon management
- payment settings
- shipping settings
- tax settings
- order management
- customer management

**Website responsibilities**

- product archive route
- product single route
- category archive route
- cart drawer / cart page
- checkout route stack
- order confirmation
- order tracking
- account orders
- account addresses

### Best Mapping For Content Integration

ConvexPress should also add CMS-native insertion points:

- product showcase block
- product grid block
- featured products block
- category carousel block
- buy button / add-to-cart block
- shortcode compatibility for common commerce embeds

Examples:

- `[products category=\"shirts\" limit=\"8\"]`
- `[product id=\"...\"]`
- `[add_to_cart product=\"...\"]`

These should follow the same principle as the Gallery System:

- block-first authoring
- shortcode compatibility layer second

---

## Recommended Commerce Domain Boundaries

### `commerce` Must Include

- products
- product categories
- product variants
- cart
- checkout
- orders
- customers
- discounts
- payments
- shipping
- tax
- inventory

### `commerce` May Include In Phase 2

- bundles
- order tracking
- simple returns

### Keep Separate From `commerce`

- subscriptions
- digital downloads and licensing
- reviews
- wishlists
- advanced fulfillment
- AI/UCP/protocol layers

---

## Suggested Data Ownership In ConvexPress

### Core Commerce Tables

Create new plugin-owned schema files under the admin backend.

Recommended table families:

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

### Extension Plugin Tables

`commerceSubscriptions`

- `commerce_subscription_templates`
- `commerce_product_subscription_overrides`
- `commerce_subscriptions`
- `commerce_subscription_items`
- `commerce_subscription_invoices`
- `commerce_subscription_invoice_items`
- `commerce_subscription_history`
- `commerce_subscription_entitlements`
- `commerce_subscription_dunning_attempts`
- `commerce_subscription_idempotency_keys`

`commerceDigital`

- `commerce_digital_files`
- `commerce_download_tokens`
- `commerce_download_log`
- `commerce_license_keys`
- `commerce_license_activations`

`commerceReviews`

- `commerce_review_items`
- `commerce_review_helpful_votes`

`commerceWishlists`

- `commerce_wishlists`
- `commerce_wishlist_items`

`commerceBundles`

- `commerce_product_bundles`
- `commerce_bundle_components`
- `commerce_bundle_selections`

`commerceReturns`

- `commerce_return_requests`
- `commerce_return_labels`

This naming keeps the system obviously plugin-owned and prevents collisions with other ConvexPress domains.

---

## Capabilities and Permissions

Commerce cannot ship with ad hoc role checks copied from VexCart.

It needs proper ConvexPress capability integration.

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

### Extension Capabilities

- `commerce.subscriptions.manage`
- `commerce.digital.manage`
- `commerce.reviews.moderate`
- `commerce.wishlists.manage`
- `commerce.returns.manage`

---

## Plugin Settings Model

The plugin suite needs layered settings:

### Global Plugin Toggles

- `commerceEnabled`
- `commerceSubscriptionsEnabled`
- `commerceDigitalEnabled`
- `commerceReviewsEnabled`
- `commerceWishlistsEnabled`
- `commerceBundlesEnabled`
- `commerceReturnsEnabled`

### Commerce Core Settings

- store name
- default currency
- checkout mode
- guest checkout allowed
- inventory reservation timeout
- low stock threshold defaults
- order numbering format

### Payment Settings

- Stripe enabled
- Stripe keys
- PayPal enabled
- PayPal credentials
- method order

### Shipping Settings

- default shipping origin
- enabled shipping methods
- free shipping thresholds

### Tax Settings

- default tax region
- tax inclusive / exclusive mode

### Extension Settings

- subscription dunning defaults
- download expiry defaults
- review moderation defaults
- wishlist sharing defaults

---

## Website Rendering Strategy

The website side should be plugin-driven but CMS-native.

### Core Commerce Website Responsibilities

- `/products`
- `/products/$slug`
- `/shop`
- `/categories/$slug`
- `/cart`
- `/checkout`
- `/checkout/shipping`
- `/checkout/payment`
- `/checkout/review`
- `/checkout/confirmation/$orderId`
- `/track/$token`
- `/account/orders`
- `/account/addresses`

### Extension Website Responsibilities

`commerceSubscriptions`

- subscription details on product pages
- account subscriptions dashboard

`commerceDigital`

- account downloads
- license key views

`commerceReviews`

- product review blocks

`commerceWishlists`

- wishlist page
- wishlist sharing routes

### CMS Embedding Responsibilities

The website should render:

- product embed blocks
- product grid blocks
- category blocks
- featured collection blocks
- shortcode fallback rendering for store widgets

---

## Migration Guidance From VexCart

### Do Not Port VexCart File-For-File

That would carry over:

- VexCart naming assumptions
- VexCart auth assumptions
- VexCart route assumptions
- VexCart role system duplication
- VexCart support/chat concerns

Instead:

- port the business logic
- adapt the schema to ConvexPress naming and plugin boundaries
- reimplement UI in ConvexPress admin and website patterns

### What To Reuse Conceptually

- domain shapes
- lifecycle rules
- validation rules
- state transitions
- denormalization strategy
- operational workflows

### What To Rewrite Natively

- plugin registration
- capabilities
- settings
- admin shell navigation
- website route integration
- CMS blocks and shortcode rendering

---

## Rollout Phases

### Phase 1: Commerce Core Foundation

Build:

- plugin registration
- schema
- products/categories/variants
- cart
- checkout
- orders
- payments
- shipping
- tax
- customer addresses

This phase should produce a real purchasable store.

### Phase 2: CMS Integration

Build:

- product blocks
- product shortcodes
- featured product embeds
- archive integration
- menu and SEO integration

This is where commerce becomes truly native to ConvexPress.

### Phase 3: Experience Extensions

Build:

- reviews
- wishlists
- bundles

### Phase 4: Revenue Extensions

Build:

- subscriptions
- digital products

### Phase 5: Operations Extensions

Build:

- returns
- advanced fulfillment

### Phase 6: Advanced Protocols And Integrations

Build only if justified:

- UCP (plugin)
- WooCommerce migration/import (tooling module, not a plugin)
- AI commerce agent tooling

---

## Recommended Initial Build Order

If the goal is practical momentum with low architectural risk, build in this order:

1. `commerce`
2. `commerceReviews`
3. `commerceWishlists`
4. `commerceSubscriptions`
5. `commerceDigital`
6. `commerceBundles`
7. `commerceReturns`

Reasoning:

- `commerce` creates the substrate everything else depends on
- reviews and wishlists are relatively low-risk customer experience extensions
- subscriptions and digital products are higher-value but materially more complex
- bundles and returns can follow after the core purchasing path is stable

---

## Recommendation On Loyalty / Points

Because VexCart does not contain a real points engine, do not pretend this is part of the migration.

Recommended path:

- finish commerce extraction first
- design loyalty as a separate ConvexPress-native plugin later

Possible future plugin:

- `commerceLoyalty`

Likely responsibilities:

- points ledger
- accrual rules
- redemption rules
- coupon conversion
- tier membership
- customer rewards dashboard

But this is a new product design, not a VexCart port.

---

## Final Recommendation

Treat VexCart as the blueprint for a ConvexPress commerce suite.

Do **not** build:

- one monolithic `vexcart` plugin
- or dozens of tiny toggles

Build:

- one strong `commerce` platform plugin
- several optional extension plugins on top of that foundation
- clear exclusions for support, chat, analytics, and protocol tooling
- integration tooling (sync, shipping adapters, support bridge) classified as subsystems, not plugins

That approach gives ConvexPress:

- a full-blown shopping cart and store system
- room to add subscriptions and digital products cleanly
- strong plugin boundaries
- a WordPress-like plugin mental model
- a maintainable path to enterprise commerce instead of a fragile transplant

