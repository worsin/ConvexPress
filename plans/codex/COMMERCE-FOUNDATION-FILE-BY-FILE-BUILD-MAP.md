# Commerce Foundation File-by-File Build Map

**System:** Commerce Foundation
**Status:** Planned
**Scope:** `commerce`, `commerceSubscriptions`, `membership`
**Target Project:** `ConvexPress`
**Last Authored:** 2026-04-07

---

## Purpose

This is the file-by-file build map for the first implementation wave.

It exists to answer:

- which files get touched first
- which directories must be created
- what belongs to admin backend vs admin UI vs website
- what order to implement the foundational plugins in

This is the immediate execution map.

---

## Sequence Overview

Build in this exact order:

1. shared plugin and settings infrastructure
2. `commerce` backend
3. `commerce` admin UI
4. `commerce` website minimum
5. `commerceSubscriptions` backend
6. `commerceSubscriptions` admin and website surfaces
7. `membership` backend
8. `membership` admin and website integration

---

## Step 1 - Shared Plugin Infrastructure

### Update Existing Files

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
- `ConvexPress-Admin/apps/web/src/lib/admin-shell/nav-config.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/validators.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/validation.ts`

### Add Shared Helpers If Needed

- `ConvexPress-Admin/packages/backend/convex/plugins/helpers.ts`

Purpose:

- register `commerce`
- register `commerceSubscriptions`
- register `membership`
- add enable/disable settings
- add dependency enforcement helpers

---

## Step 2 - `commerce` Backend

### Create Schema

- `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts`

### Update Schema Root

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

### Create Backend Domain Directory

- `ConvexPress-Admin/packages/backend/convex/commerce/`

### Create Initial Domain Files

- `ConvexPress-Admin/packages/backend/convex/commerce/helpers.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/validators.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/products.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/categories.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/cart.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/orders.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/customers.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/payments.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/discounts.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/inventory.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/shipping.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/tax.ts`

### Recommended Build Order Inside Backend

1. `helpers.ts`
2. `validators.ts`
3. `products.ts`
4. `categories.ts`
5. `customers.ts`
6. `cart.ts`
7. `shipping.ts`
8. `tax.ts`
9. `discounts.ts`
10. `checkout.ts`
11. `orders.ts`
12. `payments.ts`
13. `inventory.ts`

Reason:

- checkout depends on most of the others
- orders and payments need checkout contract stability
- inventory needs final reservation and order semantics

---

## Step 3 - `commerce` Admin UI

### Create Route Directory

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/`

### Create Admin Routes

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/index.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/products.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/products.$productId.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/categories.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/orders.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/orders.$orderId.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/customers.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/customers.$customerId.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.tsx`

### Create Component Directory

- `ConvexPress-Admin/apps/web/src/components/commerce/`

### Create Initial Component Groups

- `ConvexPress-Admin/apps/web/src/components/commerce/products/`
- `ConvexPress-Admin/apps/web/src/components/commerce/orders/`
- `ConvexPress-Admin/apps/web/src/components/commerce/customers/`
- `ConvexPress-Admin/apps/web/src/components/commerce/settings/`

### Minimum Admin UI Order

1. product list/editor
2. category management
3. order list/detail
4. customer detail shell
5. settings shell

---

## Step 4 - `commerce` Website Minimum

### Create Storefront Routes

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

### Create Account Routes

- `ConvexPress-Website/apps/web/src/routes/_dashboard/orders.tsx`
- `ConvexPress-Website/apps/web/src/routes/_dashboard/orders_.$orderId.tsx`
- `ConvexPress-Website/apps/web/src/routes/_dashboard/addresses.tsx`

### Create Component Directory

- `ConvexPress-Website/apps/web/src/components/commerce/`

### Create Initial Component Groups

- `ConvexPress-Website/apps/web/src/components/commerce/products/`
- `ConvexPress-Website/apps/web/src/components/commerce/cart/`
- `ConvexPress-Website/apps/web/src/components/commerce/checkout/`
- `ConvexPress-Website/apps/web/src/components/commerce/orders/`

### Minimum Website UI Order

1. product grid
2. product detail
3. cart
4. checkout
5. confirmation
6. order history/detail

---

## Step 5 - `commerceSubscriptions` Backend

### Create Schema

- `ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts`

### Update Schema Root

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

### Create Backend Domain Directory

- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/`

### Create Domain Files

- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/helpers.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/validators.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/templates.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/products.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/subscriptions.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/invoices.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/entitlements.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/dunning.ts`

### Required Cross-Edits To `commerce`

- `ConvexPress-Admin/packages/backend/convex/commerce/products.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/checkout.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/orders.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/payments.ts`

Purpose:

- add subscription purchase mode support
- create subscriptions from qualifying orders
- emit entitlement records
- hook renewal outcomes into payment results

---

## Step 6 - `commerceSubscriptions` Admin And Website

### Create Admin Routes

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/index.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/templates.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/templates.$templateId.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/$subscriptionId.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/invoices.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/settings.tsx`

### Create Admin Components

- `ConvexPress-Admin/apps/web/src/components/commerce-subscriptions/templates/`
- `ConvexPress-Admin/apps/web/src/components/commerce-subscriptions/subscriptions/`
- `ConvexPress-Admin/apps/web/src/components/commerce-subscriptions/invoices/`
- `ConvexPress-Admin/apps/web/src/components/commerce-subscriptions/settings/`

### Create Website Routes

- `ConvexPress-Website/apps/web/src/routes/_dashboard/subscriptions.tsx`
- `ConvexPress-Website/apps/web/src/routes/_dashboard/subscriptions_.$subscriptionId.tsx`

### Create Website Components

- `ConvexPress-Website/apps/web/src/components/commerce-subscriptions/account/`
- `ConvexPress-Website/apps/web/src/components/commerce-subscriptions/product/`
- `ConvexPress-Website/apps/web/src/components/commerce-subscriptions/billing/`

### Required Cross-Edits

- commerce product editor in admin
- commerce product page on website

Purpose:

- expose subscription-capable product authoring
- expose subscription purchase mode to customers

---

## Step 7 - `membership` Backend

### Create Schema

- `ConvexPress-Admin/packages/backend/convex/schema/membership.ts`

### Update Schema Root

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

### Create Backend Domain Directory

- `ConvexPress-Admin/packages/backend/convex/membership/`

### Create Domain Files

- `ConvexPress-Admin/packages/backend/convex/membership/helpers.ts`
- `ConvexPress-Admin/packages/backend/convex/membership/validators.ts`
- `ConvexPress-Admin/packages/backend/convex/membership/plans.ts`
- `ConvexPress-Admin/packages/backend/convex/membership/grants.ts`
- `ConvexPress-Admin/packages/backend/convex/membership/restrictions.ts`
- `ConvexPress-Admin/packages/backend/convex/membership/access.ts`

### Required Cross-Edits

- subscription entitlement source in `commerceSubscriptions/entitlements.ts`
- page/post loader integration points in website app

Purpose:

- normalize access evaluation
- consume subscription entitlements without owning subscription billing logic

---

## Step 8 - `membership` Admin And Website

### Create Admin Routes

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/membership/index.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/membership/plans.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/membership/plans.$planId.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/membership/grants.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/membership/grants.$grantId.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/membership/restrictions.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/membership/settings.tsx`

### Create Admin Components

- `ConvexPress-Admin/apps/web/src/components/membership/plans/`
- `ConvexPress-Admin/apps/web/src/components/membership/grants/`
- `ConvexPress-Admin/apps/web/src/components/membership/restrictions/`

### Create Website Routes

- `ConvexPress-Website/apps/web/src/routes/_dashboard/membership.tsx`

### Create Website Components

- `ConvexPress-Website/apps/web/src/components/membership/restrictions/`
- `ConvexPress-Website/apps/web/src/components/membership/account/`

### Required Cross-Edits

- page route loaders
- post route loaders
- editor document settings panels in admin

Purpose:

- enforce member-only access
- expose plan-aware restriction tooling
- provide customer/member status visibility

---

## Cross-Cutting Files Likely To Be Touched Repeatedly

These files will likely need edits across multiple foundational plugins:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
- `ConvexPress-Admin/apps/web/src/lib/admin-shell/nav-config.ts`
- `ConvexPress-Admin/packages/backend/convex/schema.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/validators.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/validation.ts`

Treat them as shared integration files and edit them carefully.

---

## First Real Build Sprint Recommendation

If implementation starts immediately, Sprint 1 should cover only this:

1. shared plugin/settings infrastructure
2. `commerce` schema
3. `commerce` backend helpers
4. `commerce` products/categories/cart/checkout skeleton
5. `commerce` admin route scaffolding

Do not start subscriptions or membership until that lands cleanly.

---

## Second Build Sprint Recommendation

Sprint 2 should cover:

1. `commerce` checkout/order/payment stabilization
2. `commerce` storefront minimum
3. `commerceSubscriptions` schema and backend skeleton
4. subscription product-overlay model

---

## Third Build Sprint Recommendation

Sprint 3 should cover:

1. subscription purchase mode end to end
2. entitlement emission
3. `membership` schema and access evaluator
4. manual grant flow

---

## Exit Criteria

This file-by-file map is complete when the team can start implementation without inventing the foundational sequence on the fly.

That bar is now met for:

- `commerce`
- `commerceSubscriptions`
- `membership`

