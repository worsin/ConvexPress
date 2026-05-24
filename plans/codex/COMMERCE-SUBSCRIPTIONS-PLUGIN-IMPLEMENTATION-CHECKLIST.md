# Commerce Subscriptions Plugin - Implementation Checklist

**System:** Commerce Subscriptions Plugin  
**Plugin ID:** `commerceSubscriptions`  
**Status:** Phase 0 stabilization in progress  
**Last Updated:** 2026-04-20  
**Companion Spec:** `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-PRD.md`

---

## Working Rule

This checklist covers the `commerceSubscriptions` plugin only.

The subscription system must support three acquisition channels:

- cart checkout
- direct subscription order forms
- admin/manual/API provisioning

All acquisition channels must activate the same subscription contract model.

Client-facing code may create submissions, checkout intents, or payment sessions. Client-facing code must not directly create active paid subscriptions.

---

## Phase 0 - Stabilize Current Surface

Progress:

- [x] Public/client callers can no longer use the legacy create mutation to directly activate paid subscriptions; it is admin/manual provisioning only.
- [x] Product subscription enablement now requires an explicit product subscription override instead of falling back to any active template.
- [x] Product and variant money objects are resolved to numeric cent amounts before recurring totals are calculated.
- [x] Public entitlement reads are scoped to the current user unless the caller has admin capability; internal entitlement checks use internal functions.
- [x] Renewal and dunning actions now no-op with a configuration-missing result instead of simulating success or mutating customers to failed states before provider charging exists.

### 0.1 Gate Existing Unsafe Creation

Update current subscription creation flow so public/client callers cannot create active subscriptions directly.

Required changes:

- replace direct public activation with pending checkout intent or admin-only provisioning
- require trusted payment success, approved trial policy, admin action, or trusted internal action before activation
- preserve existing customer dashboard behavior where possible
- add idempotency to activation

### 0.2 Fix Existing Pricing Resolution

Correct current money handling before building on it.

Required changes:

- resolve commerce product `basePrice` money objects correctly
- resolve variant price money objects correctly
- do not read nonexistent top-level product currency fields
- require explicit offer or product override before treating a product as subscription-enabled
- store pricing snapshots on intents, subscriptions, and subscription items

### 0.3 Secure Entitlement Queries

Required changes:

- current-user entitlement checks only return the caller's own data
- admin list queries require subscription admin capability
- internal entitlement checks use internal functions
- arbitrary `userId` entitlement checks are not public

### 0.4 Disable Unsafe Renewal Charging Until Provider Flow Exists

Required changes:

- renewal cron must not intentionally fail invoices in production mode
- if payment provider charging is not implemented, jobs should no-op safely or mark configuration missing without mutating customer subscription state
- renewal charging must use saved reusable payment method references when implemented

---

## Phase 1 - Schema and Core Contracts

Progress:

- [x] Added core offer, offer item, order form, form submission, and checkout intent tables to the admin-owned Convex schema.
- [x] Added source channel support for subscription contracts and checkout intents.
- [x] Added item lifecycle, offer references, bundle references, pricing snapshots, entitlement code snapshots, and cancellation fields to subscription items.
- [x] Added payment continuity fields for contracts, checkout intents, and invoices.
- [x] Updated legacy admin/manual provisioning to write source channel, billing cadence, setup fee, payment continuity, pricing snapshot, and item lifecycle fields.

### 1.1 Add or Migrate Core Tables

Own schema in:

- `ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts`

Ensure the schema supports:

- `commerce_subscription_templates`
- `commerce_subscription_offers`
- `commerce_subscription_offer_items`
- `commerce_subscription_order_forms`
- `commerce_subscription_form_submissions`
- `commerce_subscription_checkout_intents`
- `commerce_product_subscription_overrides`
- `commerce_subscriptions`
- `commerce_subscription_items`
- `commerce_subscription_invoices`
- `commerce_subscription_invoice_items`
- `commerce_subscription_history`
- `commerce_subscription_entitlements`
- `commerce_subscription_dunning_attempts`
- `commerce_subscription_idempotency_keys`

### 1.2 Add Source Channel Fields

Subscriptions and checkout intents must record acquisition source:

- `cart`
- `direct_form`
- `admin`
- `api`

### 1.3 Add Item-Level Lifecycle

Subscription items need:

- active/pending-cancel/canceled/expired status
- quantity
- price snapshot
- setup fee snapshot
- source offer references
- product/variant/bundle references where applicable
- entitlement code snapshots

### 1.4 Add Payment Continuity Fields

Subscriptions and checkout intents need:

- provider
- payment transaction reference
- saved/default payment method reference
- manual billing flag
- initial amount
- recurring amount
- setup fee amount
- currency

---

## Phase 2 - Offers and Templates

### 2.1 Template CRUD

Admin features:

- list templates
- create/edit/archive templates
- version lifecycle-impacting template changes
- expose active templates for offer/product configuration

### 2.2 Offer CRUD

Admin features:

- list offers
- create/edit/archive offers
- define source type: product, variant, bundle, or custom
- attach template
- configure channel availability
- configure recurring amount, setup fee, trial override, quantity limits
- configure included offer items
- configure entitlement codes

### 2.3 Product Editor Integration

Product editor behavior:

- enabling subscription on a product creates or links a product-backed offer
- allow one-time purchase remains a product/offer setting
- product pages consume offer data
- product overrides must not bypass offer validation

---

## Phase 3 - Direct Form Acquisition

### 3.1 Order Form Admin

Create admin tools for:

- order form list
- order form editor
- offer selection configuration
- field schema builder
- account mode
- payment mode
- redirect/success behavior
- submission review

### 3.2 Public Form Queries

Website/public queries must:

- fetch active form by slug
- fetch allowed active offers
- resolve pricing server-side
- expose only safe public metadata

### 3.3 Form Submission Flow

Direct form flow:

1. customer opens `/subscribe/$formSlug` or embedded form
2. customer selects offer(s) and fills fields
3. backend validates form, offer availability, and required fields
4. backend creates form submission
5. backend creates checkout intent with pricing snapshot
6. payment session or payment method setup starts when required
7. trusted payment/admin/internal result activates subscription

### 3.4 Direct Form UI

Website features:

- SaaS-style plan selector
- configurable fields
- onboarding/intake fields
- account creation or login path
- payment step integration
- success/redirect state
- error and recovery states

---

## Phase 4 - Activation Engine

### 4.1 Internal Activation Function

Implement a single internal activation path that accepts a validated checkout intent or trusted admin/API provisioning request.

Activation must:

- create or update customer profile
- create subscription contract
- create subscription items
- create initial invoice and invoice items
- attach payment method reference
- write subscription history
- emit entitlements
- call membership grant bridge when applicable
- update source order/form/intent references
- be idempotent

### 4.2 Cart Activation

Update commerce checkout/payment success paths so paid cart order items activate subscriptions through the same internal activation function.

Required behavior:

- detect subscription offers on cart/order items
- support mixed one-time and subscription orders
- support bundles and variants
- create normal order history
- activate subscription only after payment success or approved zero-dollar/trial policy

### 4.3 Admin/API Activation

Admin/API provisioning must:

- use explicit source channel
- require subscription management capability or service authorization
- support comped/manual-billing contracts
- require actor/source metadata
- write audit history

---

## Phase 5 - Renewal Billing and Dunning

### 5.1 Invoice Generation

Implement renewal invoice generation from active subscription items.

Required behavior:

- use indexed due subscription queries
- produce itemized invoice lines
- include proration, setup fees, credits, adjustments where applicable
- link invoices to subscription and payment transactions

### 5.2 Payment Charging

Implement provider charging for renewals.

Required behavior:

- use saved reusable payment method
- record payment transaction
- handle provider success/failure webhooks idempotently
- never use cart checkout for renewals

### 5.3 Dunning

Dunning must:

- schedule retries from a policy
- avoid double-counting attempts
- transition subscription status consistently
- move entitlements to grace/revoked according to policy
- notify customers and admins
- allow customer payment recovery

---

## Phase 6 - Customer Portal

Website customer features:

- list subscriptions
- view subscription detail
- view subscription items
- view invoices
- update payment method
- retry failed payment
- pause/resume where allowed
- cancel subscription where allowed
- cancel item where allowed
- add allowed offer/item to an existing subscription

Routes should live under:

- `ConvexPress-Website/apps/web/src/routes/dashboard/subscriptions.tsx`
- `ConvexPress-Website/apps/web/src/routes/dashboard/subscriptions.$subscriptionId.tsx`
- additional payment/recovery/add-item routes as needed

---

## Phase 7 - Admin Operations UI

Admin features:

- dashboard metrics
- subscription list/detail
- item management
- invoice list/detail
- failed payment/dunning queue
- template management
- offer management
- direct order form management
- form submission management
- product editor extension
- settings

Routes should live under:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/`

---

## Phase 8 - Membership and Entitlements

Required behavior:

- map active/trialing subscription items to active entitlements
- map past_due/paused to grace entitlements where policy allows
- map canceled/expired/revoked items to revoked entitlements
- call membership `grantFromSubscription` and `revokeFromSubscription` internals
- make entitlement checks safe for current-user, admin, and internal use cases

---

## Phase 9 - Verification

### Backend Tests

Cover:

- direct form intent creation
- cart activation after payment success
- public client cannot create active paid subscription
- admin provisioning
- offer pricing snapshots
- product money resolution
- renewal invoice generation
- dunning retry sequencing
- entitlement ownership rules
- membership bridge calls
- idempotent activation/payment results

### UI Verification

Cover:

- direct form plan selection
- direct form payment/start flow
- cart subscription checkout
- customer portal
- admin offer/form/subscription management

### Type Safety

Required:

- remove `// @ts-nocheck` from subscription backend files
- remove avoidable `(api as any)` subscription calls
- subscription backend type check passes
- website/admin routes compile against generated API types

---

## Phase 10 - Rollout

Rollout sequence:

1. deploy schema and disabled-safe backend
2. migrate existing subscription records into contract/item shape if needed
3. enable admin-only provisioning in staging
4. enable direct form checkout in staging
5. enable cart subscription checkout in staging
6. enable renewal jobs after payment provider charging is verified
7. enable production plugin setting
8. monitor renewals, failures, entitlements, and payment recovery

Do not enable renewal cron mutation behavior until provider charging and dunning tests pass.
