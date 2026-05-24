# Phase 3 Detail: Direct Form Subscription Acquisition

> **Canonical PRD:** `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-PRD.md`  
> **Canonical Checklist:** `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-IMPLEMENTATION-CHECKLIST.md`  
> **Last Updated:** 2026-04-20  
> **Status:** Planned

---

## Objective

Build the form-driven subscription path so a website can sell subscriptions without cart UI.

This is required for SaaS-style pricing pages, onboarding flows, intake forms, and embedded paid signup forms.

The form path must activate subscriptions through the same internal activation engine used by cart checkout and admin/API provisioning.

---

## Required User Experience

Example flow:

1. Customer visits `/subscribe/growth-plans`.
2. Page shows three packages: Starter, Growth, Scale.
3. Customer selects one package.
4. Customer fills onboarding fields.
5. Customer creates an account or continues through an allowed guest/account-create path.
6. Customer enters payment details or payment method for trial.
7. Payment success or approved trial policy activates the subscription.
8. Customer lands on onboarding or dashboard.

No cart session, cart item, cart page, or "add to cart" step is required.

---

## Backend Tables

Direct form acquisition depends on:

- `commerce_subscription_offers`
- `commerce_subscription_offer_items`
- `commerce_subscription_order_forms`
- `commerce_subscription_form_submissions`
- `commerce_subscription_checkout_intents`
- `commerce_subscriptions`
- `commerce_subscription_items`
- `commerce_subscription_invoices`
- `commerce_subscription_invoice_items`
- `commerce_subscription_history`
- `commerce_subscription_entitlements`

---

## Backend Functions

Create or extend:

- `commerceSubscriptions/forms.ts`
- `commerceSubscriptions/offers.ts`
- `commerceSubscriptions/intents.ts`
- `commerceSubscriptions/activation.ts`

### Public Queries

Required:

- `forms.getPublicBySlug`
- `offers.listPublicForForm`
- `offers.resolvePublicPricing`

Public queries must only return active forms, active offers, safe display metadata, and server-resolved pricing.

### Public Mutations

Required:

- `forms.submit`
- `intents.startDirectFormCheckout`

These mutations may create:

- form submission
- checkout intent
- payment session/setup session

They must not create an active paid subscription.

### Internal Mutations

Required:

- `activation.activateFromIntent`
- `activation.markIntentPaymentSucceeded`
- `activation.markIntentPaymentFailed`
- `activation.approveManualIntent`

Only trusted payment webhooks, admin mutations, or internal actions may call activation.

---

## Direct Form State Machine

Form submission statuses:

```text
draft
submitted
payment_pending
approval_pending
approved
activated
rejected
expired
```

Checkout intent statuses:

```text
draft
payment_pending
payment_succeeded
approval_pending
activated
failed
expired
```

Subscription activation may only happen from:

- `payment_succeeded`
- `approval_pending` after admin approval
- configured no-payment/trial policy that explicitly permits activation

---

## Payment Modes

Order forms must support:

- `pay_now`: collect initial invoice amount before activation
- `trial_with_payment_method`: collect reusable payment method before trial activation
- `no_payment_required`: only for explicitly free/comped flows
- `admin_approval`: create pending submission for admin review

Payment mode is configured on the form and may be constrained by the selected offer.

---

## Pricing Requirements

The backend must compute:

- recurring amount
- setup fee amount
- initial amount due now
- future recurring amount
- trial end date
- currency
- line-item breakdown

The submitted client payload may identify selected offers and quantities, but must not be trusted for price values.

Store the computed pricing snapshot on the checkout intent and copy it to subscription items/invoices at activation.

---

## Admin UI

Create admin UI for:

- order form list
- order form editor
- form status
- form slug
- offer assignment
- selection mode
- field schema
- account mode
- payment mode
- success redirect
- submission list
- submission detail
- approve/reject where applicable

Suggested route files:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/forms.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/forms.$formId.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/submissions.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/submissions.$submissionId.tsx`

---

## Website UI

Create website UI for:

- public form route
- plan/package selector
- dynamic form fields
- account/login handoff
- payment step
- pending approval state
- success state
- error/recovery state

Suggested route:

- `ConvexPress-Website/apps/web/src/routes/_marketing/subscribe.$formSlug.tsx`

Suggested components:

- `SubscriptionOrderForm`
- `SubscriptionOfferSelector`
- `SubscriptionFormFields`
- `SubscriptionCheckoutStep`
- `SubscriptionSignupSuccess`

---

## Activation Output

When activation succeeds, it must:

- create or update customer profile
- create subscription contract
- create subscription items from selected offer items
- create initial invoice and line items
- attach saved payment method when applicable
- set current period and next billing date
- write history
- create entitlements
- call membership bridge functions
- mark checkout intent activated
- mark form submission activated

---

## Test Checklist

Backend tests:

- public form query hides inactive forms
- inactive offers cannot be selected
- client-submitted prices are ignored
- direct form creates submission and checkout intent
- direct form cannot create active paid subscription directly
- payment success activates subscription idempotently
- failed payment leaves subscription unactivated
- admin approval activates only allowed forms
- selected offers create expected subscription items
- entitlement and membership bridge calls are made

UI verification:

- single-offer form works
- three-package plan selector works
- required fields block submit
- payment-required form enters payment state
- approval-required form enters pending state
- success redirect works
- plugin-disabled state hides public form

---

## Completion Criteria

This phase is complete when a website can publish a SaaS-style subscription order form, collect plan selection and onboarding data, start payment or approval, and activate a subscription contract without touching the cart.
