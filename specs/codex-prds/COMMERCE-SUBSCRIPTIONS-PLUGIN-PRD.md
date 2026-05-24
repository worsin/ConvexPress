# Commerce Subscriptions Plugin - PRD

**System:** Commerce Subscriptions Plugin  
**Plugin ID:** `commerceSubscriptions`  
**Status:** Planning reset for multi-channel acquisition  
**Priority:** P1 - High  
**Complexity:** Very Complex  
**Target Project:** ConvexPress  
**Last Updated:** 2026-04-20  

---

## 1. Product Decision

The subscription system is a durable subscription contract engine with multiple acquisition channels.

Commerce products, variants, and bundles remain the merchandising layer. The cart remains a supported acquisition path, but subscriptions must not require cart checkout. Direct form-driven subscription signup is a first-class acquisition path for SaaS-style pricing pages, onboarding funnels, intake flows, embedded subscription forms, and landing pages.

The system must support this model:

```text
Commerce Product / Variant / Bundle
        |
Subscription Offer
        |
Acquisition Channel
  - cart checkout
  - direct subscription order form
  - admin/manual/API provisioning
        |
Trusted payment, approval, or provisioning event
        |
Subscription Contract
        |
Subscription Items
        |
Invoices, Entitlements, Renewals, Dunning
```

The cart starts subscriptions when ecommerce checkout is the right experience. Direct order forms start subscriptions when marketing, onboarding, or SaaS signup flows need a faster path. Admin/API provisioning starts subscriptions when a human or trusted integration creates the contract.

All paths must activate the same subscription contract model.

---

## 2. Goals

1. Sell subscription-capable commerce products, variants, and bundles.
2. Sell subscription offers through cart checkout or direct form-driven signup without using cart sessions.
3. Support multi-item subscription contracts with one renewal invoice per billing period.
4. Support SaaS-style order forms that let customers choose between plans or packages and submit onboarding fields.
5. Secure subscription activation so client code cannot directly create active paid subscriptions.
6. Persist billing, payment method, invoice, dunning, and entitlement state independently from the original acquisition channel.
7. Give admins tools to manage templates, offers, order forms, subscriptions, invoices, submissions, and recovery flows.
8. Give customers account tools to view subscriptions, update payment methods, view invoices, pause/resume/cancel when allowed, and recover failed payments.
9. Emit entitlement signals that downstream systems, especially `membership`, can consume without making subscription billing own access policy.

---

## 3. Non-Goals

This plugin does not own:

- content restriction rules
- member-only page gating
- role assignment policy
- digital download delivery
- loyalty points
- support ticket workflows
- product catalog authoring outside subscription-specific offer configuration
- a second unrelated product catalog

The plugin may create subscription offers that reference products, variants, bundles, or explicit offer item definitions. It must not create a competing general-purpose catalog.

---

## 4. Workspace Boundaries

ConvexPress is one workspace with two app monorepos:

- `ConvexPress-Admin/` owns Convex schema, functions, crons, payment webhooks, admin UI, and deployment.
- `ConvexPress-Website/` consumes the admin-owned Convex deployment and renders public/customer subscription UI.

The website app must not define or deploy Convex schema or functions.

---

## 5. Core Concepts

### 5.1 Subscription Template

A template defines reusable billing behavior:

- billing interval and interval count
- trial policy
- grace period
- dunning policy
- pause/cancel rules
- proration defaults
- renewal timing
- versioned behavior for future subscriptions

Templates are not sellable by themselves.

### 5.2 Subscription Offer

An offer is the sellable subscription package. It is the package a customer sees as "Starter", "Growth", "Scale", "Website Care Pro", or "Premium Support".

An offer may be backed by:

- one product
- one product variant
- one bundle
- multiple offer items
- a product-backed service package with custom offer metadata

An offer defines:

- public title, slug, description, display metadata, and status
- template reference
- channel availability: cart, direct form, admin/API
- recurring price, setup fee, trial policy, and currency
- quantity behavior
- included items and entitlement mappings
- whether it can be used to create a new subscription, add to an existing subscription, or both

Product subscription overrides are convenience configuration for product pages and cart behavior. Offers are the canonical acquisition objects.

### 5.3 Subscription Order Form

A subscription order form is a public or embedded frontend configuration for direct subscription signup without the cart.

An order form defines:

- slug and public route behavior
- available offers
- single-select or multi-select package choice
- required and optional fields
- onboarding questions
- account creation/login behavior
- whether payment is required immediately
- whether a payment method is required for trials
- whether admin approval is required before activation
- redirect/success behavior
- allowed discounts or promotion codes
- anti-abuse/rate-limit behavior

Order forms are acquisition channels. They do not own subscription lifecycle after activation.

### 5.4 Subscription Checkout Intent

A checkout intent is a trusted server-side record that captures the selected offer(s), pricing snapshot, customer identity, onboarding data, and payment state before activation.

Cart checkout and direct order forms may both create checkout intents, but direct form checkout must not require a cart session.

### 5.5 Subscription Contract

A subscription contract is the durable billing container. It owns:

- customer/user identity
- source channel and acquisition references
- status
- billing cadence
- current period
- next billing date
- default payment method reference
- recurring totals
- lifecycle settings snapshot
- subscription items
- invoices
- dunning state
- entitlement state

Contracts must remain valid even if the originating product, offer, order form, or cart changes later.

### 5.6 Subscription Item

A subscription item is a billable line inside a contract. It can represent:

- a product
- a variant
- a bundle parent
- a bundle component
- a service item from an offer
- an add-on

Items need their own lifecycle fields so customers/admins can add, remove, schedule cancellation, or change quantities without always canceling the whole contract.

---

## 6. Acquisition Channels

### 6.1 Cart Checkout

Use cart checkout when the customer experience is ecommerce-oriented:

- mixed carts with one-time and subscription items
- product browsing and "subscribe and save" flows
- physical goods plus subscription services
- bundles sold through the shop
- normal commerce discounts, tax, shipping, and order history

Required behavior:

- cart line items can carry one-time or subscription purchase mode
- checkout must separate one-time amount, setup amount, initial recurring amount, and future recurring amount
- successful payment creates a normal order and activates subscriptions from eligible paid order items
- if a customer already has a compatible subscription, cart checkout can add items to that contract when allowed

### 6.2 Direct Subscription Order Form

Use direct forms when the customer experience is SaaS/onboarding-oriented:

- pricing page with three monthly packages
- paid signup form
- service intake form
- embedded subscription order section
- trial signup with payment method capture
- marketing funnel that should not show cart UI

Required behavior:

- customer selects one or more offers from a configured form
- frontend submits form values to a subscription form mutation
- backend resolves offers and creates a checkout intent with a pricing snapshot
- payment provider collects payment and/or reusable payment method
- activation happens only after trusted payment success, admin approval, or explicit trusted provisioning
- onboarding data remains attached to the submission and contract source metadata

Direct forms must not call a mutation that creates an active paid subscription directly.

### 6.3 Admin, Manual, and API Provisioning

Admins and trusted integrations need controlled provisioning for:

- comped subscriptions
- sales-assisted subscriptions
- enterprise contracts
- migrations
- support adjustments
- Airtable/CRM-driven workflows
- internal testing

Required behavior:

- admin/API flows must identify a source channel and actor
- paid subscriptions still need a payment method or clear manual billing policy
- comped/manual subscriptions must be visibly marked and auditable
- activation must write history and entitlements using the same internal activation path

---

## 7. Domain Model

Recommended tables owned by `commerceSubscriptions`:

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

### 7.1 Templates

Recommended fields:

- `title`
- `slug`
- `status`: `draft | active | archived`
- `billingInterval`: `week | month | year`
- `billingIntervalCount`
- `trialDays?`
- `gracePeriodDays?`
- `pausable`
- `maxPauseDays?`
- `cancelAtPeriodEndDefault`
- `customerCanCancel`
- `prorationBehavior`
- `dunningPolicyCode?`
- `version`
- `createdAt`
- `updatedAt`

### 7.2 Offers

Recommended fields:

- `title`
- `slug`
- `status`: `draft | active | archived`
- `templateId`
- `description?`
- `publicSummary?`
- `sourceType`: `product | variant | bundle | custom`
- `productId?`
- `variantId?`
- `bundleId?`
- `availableInCart`
- `availableInDirectForms`
- `availableForAdminProvisioning`
- `createNewSubscription`
- `allowAddToExistingSubscription`
- `currencyCode`
- `recurringAmount`
- `setupFeeAmount?`
- `trialDaysOverride?`
- `minimumQuantity?`
- `maximumQuantity?`
- `entitlementCodes?`
- `metadata?`
- `createdAt`
- `updatedAt`

### 7.3 Offer Items

Recommended fields:

- `offerId`
- `itemType`: `product | variant | bundle_component | service | entitlement`
- `productId?`
- `variantId?`
- `bundleId?`
- `title`
- `quantity`
- `recurringAmount`
- `setupFeeAmount?`
- `entitlementCodes?`
- `metadata?`
- `createdAt`
- `updatedAt`

### 7.4 Order Forms

Recommended fields:

- `title`
- `slug`
- `status`: `draft | active | archived`
- `selectionMode`: `single_offer | multiple_offers`
- `offerIds`
- `fieldSchema`
- `accountMode`: `require_login | allow_guest_create_account | guest_allowed`
- `paymentMode`: `pay_now | trial_with_payment_method | no_payment_required | admin_approval`
- `successRedirectUrl?`
- `successMessage?`
- `allowedDiscountCodes?`
- `rateLimitKey?`
- `metadata?`
- `createdAt`
- `updatedAt`

### 7.5 Form Submissions

Recommended fields:

- `formId`
- `status`: `draft | submitted | payment_pending | approved | activated | rejected | expired`
- `userId?`
- `customerId?`
- `email`
- `selectedOfferIds`
- `fieldValues`
- `checkoutIntentId?`
- `subscriptionId?`
- `ipHash?`
- `userAgent?`
- `createdAt`
- `updatedAt`

### 7.6 Checkout Intents

Recommended fields:

- `sourceChannel`: `cart | direct_form | admin | api`
- `status`: `draft | payment_pending | payment_succeeded | approval_pending | activated | failed | expired`
- `userId?`
- `customerId?`
- `email?`
- `orderId?`
- `orderItemIds?`
- `formId?`
- `formSubmissionId?`
- `selectedOfferIds`
- `pricingSnapshot`
- `initialAmount`
- `recurringAmount`
- `setupFeeAmount`
- `currencyCode`
- `paymentProvider?`
- `paymentTransactionId?`
- `savedPaymentMethodId?`
- `subscriptionId?`
- `idempotencyKey?`
- `expiresAt?`
- `createdAt`
- `updatedAt`

### 7.7 Subscriptions

Recommended fields:

- `subscriptionNumber`
- `customerId?`
- `userId?`
- `sourceChannel`
- `sourceCheckoutIntentId?`
- `sourceOrderId?`
- `sourceFormSubmissionId?`
- `templateId?`
- `templateVersion?`
- `status`: `draft | trialing | active | past_due | paused | pending_cancel | canceled | expired`
- `currencyCode`
- `recurringAmount`
- `setupFeeAmount?`
- `billingInterval`
- `billingIntervalCount`
- `currentPeriodStartAt?`
- `currentPeriodEndAt?`
- `nextBillingAt?`
- `trialEndsAt?`
- `cancelAtPeriodEnd`
- `cancelScheduledAt?`
- `canceledAt?`
- `pausedAt?`
- `gracePeriodEndsAt?`
- `defaultPaymentMethodId?`
- `lastInvoiceId?`
- `manualBilling`
- `createdAt`
- `updatedAt`

### 7.8 Subscription Items

Recommended fields:

- `subscriptionId`
- `sourceOfferId?`
- `sourceOfferItemId?`
- `productId?`
- `variantId?`
- `bundleId?`
- `titleSnapshot`
- `quantity`
- `unitRecurringAmount`
- `unitSetupFeeAmount?`
- `currencyCode`
- `status`: `active | pending_cancel | canceled | expired`
- `startsAt`
- `currentPeriodEndAt?`
- `cancelAtPeriodEnd`
- `canceledAt?`
- `entitlementCodes?`
- `metadata?`
- `createdAt`
- `updatedAt`

### 7.9 Invoices and Invoice Items

Invoices must support initial charges, renewal charges, setup fees, manual adjustments, proration charges, proration credits, and retry attempts.

Invoices should link to `commerce_payment_transactions` where available.

### 7.10 Entitlements

Entitlements are the output contract for downstream systems.

Recommended fields:

- `subscriptionId`
- `subscriptionItemId?`
- `customerId?`
- `userId?`
- `sourceType`
- `sourceRef`
- `code`
- `status`: `active | grace | revoked`
- `startsAt`
- `endsAt?`
- `revokedAt?`
- `metadata?`
- `createdAt`
- `updatedAt`

---

## 8. Security Rules

1. Client-facing mutations may create submissions, checkout intents, or payment sessions.
2. Client-facing mutations must not create active paid subscriptions directly.
3. Active/trialing subscription activation must happen through an internal activation function after trusted payment, trusted admin action, approved free trial policy, or approved manual provisioning.
4. Public entitlement queries must only return the current caller's entitlement state unless called by an internal function or authorized admin.
5. Order form pricing must be resolved server-side from active offers.
6. Pricing snapshots must be stored on checkout intents and subscription items.
7. Idempotency keys are required for payment confirmation, subscription activation, renewal, and dunning result handling.
8. Admin/manual activation must write history with actor and source channel.

---

## 9. Payment Requirements

The plugin depends on commerce payment infrastructure but owns recurring billing orchestration.

Required behavior:

- store reusable payment method references for off-session renewals when provider supports them
- support direct form initial payments
- support trial signup with payment method capture when configured
- support no-payment/admin-approval forms only when explicitly configured
- link subscription invoices to commerce payment transactions
- record payment failures separately from invoice status
- support customer recovery when default payment method fails
- avoid creating active paid subscriptions until the initial payment or approved trial policy is confirmed

---

## 10. Lifecycle Requirements

Subscription-level actions:

- activate from checkout intent
- pause
- resume
- schedule cancel
- cancel immediately
- expire
- mark past due
- recover from past due
- update default payment method

Item-level actions:

- add item
- schedule item cancellation
- cancel item immediately
- reactivate item
- change quantity
- change price by admin adjustment

Billing actions:

- create initial invoice
- create renewal invoice
- process renewal payment result
- schedule dunning retry
- process dunning retry result
- write invoice history

---

## 11. Admin UX

Required admin areas:

- subscription dashboard and metrics
- subscription list and detail
- subscription item management
- subscription template list/editor
- subscription offer list/editor
- direct order form list/editor
- form submission list/detail
- invoice list/detail
- dunning/recovery queue
- subscription settings
- product editor subscription section

Product editor integration should create or manage product-backed offers instead of writing incomplete subscription state directly to products.

---

## 12. Website UX

Required website areas:

- product page subscription purchase mode where enabled
- cart checkout support for subscription items
- direct subscription order form route, such as `/subscribe/$formSlug`
- embeddable subscription order form component for marketing pages
- customer subscription dashboard under `/dashboard/subscriptions`
- subscription detail page
- invoice history
- payment method recovery/update flow
- cancel/pause/resume flows where allowed

Direct form pages should support SaaS-style plan selection without cart UI.

---

## 13. Membership Integration

Subscriptions are not memberships.

This plugin emits entitlement state. The `membership` plugin consumes entitlement state and decides access policy.

Required behavior:

- active/trialing subscriptions emit active entitlements
- past_due/paused may emit grace entitlements according to policy
- canceled/expired/revoked items revoke entitlements
- subscription item changes update item-specific entitlements
- membership grant/revoke bridge functions are called from subscription activation and lifecycle transitions

---

## 14. Current Implementation Remediation

The existing implementation must be corrected before production use:

- replace client-callable direct active subscription creation with checkout intent and internal activation
- fix money resolution to use commerce money objects correctly
- stop enabling every product by default when any active template exists
- wire payment success to subscription activation
- replace stubbed renewal/dunning payment failure behavior with real provider charging or disabled-safe behavior
- secure entitlement queries by ownership/admin/internal access
- wire membership grant/revoke internals
- add offer and direct order form models
- remove `// @ts-nocheck` from subscription modules
- add focused tests for creation, activation, renewal, dunning, entitlements, and access control

---

## 15. Acceptance Criteria

The system is complete when:

- admins can create templates, offers, and direct subscription order forms
- a pricing page can render a form where customers choose between multiple monthly packages without cart UI
- direct form submission creates a pending intent, collects payment or payment method according to policy, then activates a subscription through an internal trusted path
- cart checkout can still create subscriptions from subscription-capable products, variants, or bundles
- admin/manual/API provisioning uses the same activation path and writes audit history
- active subscriptions renew through the subscription engine without needing a cart
- failed renewals enter dunning and customer recovery flows
- customers can manage subscriptions from their dashboard
- entitlements are emitted and membership bridge functions are invoked correctly
- disabling `commerceSubscriptions` removes subscription UX and stops subscription jobs without breaking core commerce
- subscription backend type checks pass without `// @ts-nocheck`
- subscription-specific tests cover security, pricing snapshots, activation channels, lifecycle, renewal, dunning, and entitlements
