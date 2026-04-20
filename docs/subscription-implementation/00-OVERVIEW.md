# Subscription System Implementation Overview

> **Source PRDs:**  
> `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-PRD.md`  
> `../PRD-DRAFT-SUBSCRIPTION-PRODUCTS.md`  
> **Last Updated:** 2026-04-20  
> **Status:** Planning reset for multi-channel subscription acquisition

---

## Executive Summary

The subscription system must be implemented as a multi-channel subscription contract engine.

The cart is a supported acquisition channel, not the subscription foundation. Direct subscription order forms are also first-class, and admin/API provisioning must use the same trusted activation engine.

Canonical flow:

```text
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

---

## Current Reality

The current ConvexPress subscription implementation has useful scaffolding but is not production-ready.

Known problems to fix before broad rollout:

- client-callable creation can create active/trialing subscriptions without payment proof
- product money resolution treats commerce money objects incorrectly
- any active template can accidentally make products subscription-enabled
- checkout/payment success does not activate subscriptions
- renewal/dunning actions intentionally fail payment attempts
- entitlement queries are too permissive
- membership bridge functions exist but are not wired
- direct form-driven acquisition does not exist
- backend subscription files rely on `// @ts-nocheck`

---

## Architecture Rules

1. `ConvexPress-Admin/` owns Convex schema, functions, crons, webhooks, and admin UI.
2. `ConvexPress-Website/` renders website/customer UI and consumes the admin-owned backend.
3. Public clients may create form submissions, checkout intents, or payment sessions.
4. Public clients must not directly create active paid subscriptions.
5. Subscription activation must go through one internal trusted activation path.
6. Cart checkout, direct order forms, and admin/API provisioning must converge on the same contract/item/invoice/entitlement model.
7. Renewals are owned by the subscription engine, not by cart checkout.
8. Subscriptions emit entitlements; membership consumes them.

---

## Implementation Phases

### Phase 0 - Stabilize Current Surface

Goal: stop unsafe behavior before building new features.

Tasks:

- gate direct public activation
- secure entitlement reads
- fix money resolution
- require explicit offer/override for subscription enablement
- make renewal jobs disabled-safe until provider charging exists
- add initial tests for the fixed risks

### Phase 1 - Schema and Contract Model

Goal: update the model from product-only subscriptions to offer-driven contracts.

Tasks:

- add offers, offer items, order forms, form submissions, and checkout intents
- add source channel fields
- add item-level lifecycle fields
- add payment method continuity fields
- add pricing snapshots
- add indexes for due renewals, form lookup, submission lookup, and admin lists

### Phase 2 - Templates and Offers

Goal: make subscription packaging explicit.

Tasks:

- complete template CRUD
- build offer CRUD
- support product-backed, variant-backed, bundle-backed, and custom service-backed offers
- move product editor subscription behavior toward offer management
- expose safe public offer resolution

### Phase 3 - Direct Form Acquisition

Goal: support SaaS-style subscription signup without cart UI.

Tasks:

- build order form schema/admin editor
- build public form-by-slug query
- build direct form submission mutation
- build checkout intent creation for selected offers
- integrate payment or payment method setup
- activate only after trusted payment/approval result
- build website form renderer and `/subscribe/$formSlug` route

### Phase 4 - Trusted Activation Engine

Goal: one internal path creates the durable subscription contract.

Tasks:

- create customer/profile as needed
- create contract and items
- create initial invoice and invoice items
- attach payment method reference
- write history
- emit entitlements
- call membership grant bridge
- update source order/form/intent records
- make activation idempotent

### Phase 5 - Cart Acquisition

Goal: preserve ecommerce power without making cart required.

Tasks:

- detect selected subscription offers in cart/order items
- support mixed carts
- support variants and bundles
- create normal commerce order history
- activate subscriptions after payment success through the activation engine
- support add-to-existing subscription when compatible

### Phase 6 - Renewal Billing and Dunning

Goal: run ongoing billing independently from acquisition.

Tasks:

- generate renewal invoices from active subscription items
- charge reusable payment methods
- process provider success/failure webhooks idempotently
- schedule and process dunning attempts
- update entitlement grace/revocation state
- support customer payment recovery

### Phase 7 - Customer Portal

Goal: let customers manage active contracts.

Tasks:

- list subscriptions
- show detail, items, invoices, and next billing
- update payment method
- retry failed payment
- pause/resume/cancel where allowed
- cancel individual items where allowed
- add eligible offers/items to existing contracts

### Phase 8 - Admin Operations

Goal: give operators complete control.

Tasks:

- dashboard metrics
- subscription list/detail
- template management
- offer management
- order form management
- form submission review
- invoice and dunning queues
- manual/admin provisioning
- product editor extension
- settings

### Phase 9 - Verification and Rollout

Goal: ship only after the system is safe.

Tasks:

- backend tests for each acquisition channel
- tests for activation security and idempotency
- tests for renewal/dunning lifecycle
- tests for entitlements and membership bridge
- typecheck without subscription `// @ts-nocheck`
- staging rollout with renewal jobs disabled
- enable renewal jobs only after provider charging is verified

---

## New Files Expected

Backend:

- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/offers.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/forms.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/intents.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/activation.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/invoices.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/entitlements.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/dunning.ts`

Admin UI:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/offers.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/forms.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/submissions.tsx`
- subscription detail, invoice, settings, and editor components as needed

Website UI:

- `ConvexPress-Website/apps/web/src/routes/_marketing/subscribe.$formSlug.tsx`
- direct form renderer components
- payment/recovery components
- customer portal extensions

---

## Legacy Phase Files

The older phase files in this folder were originally written for a cart-first VexCart-style implementation. They may still contain useful examples, but the canonical implementation plan is now:

1. `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-PRD.md`
2. `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-IMPLEMENTATION-CHECKLIST.md`
3. this overview

When legacy phase files conflict with those documents, follow the newer PRD/checklist.

---

## Completion Definition

The system is complete when:

- cart checkout can start subscriptions
- direct forms can start subscriptions without cart sessions
- admin/API provisioning can start subscriptions through trusted activation
- all active subscriptions share the same contract/item/invoice/entitlement model
- renewals bill without cart checkout
- failed renewals enter dunning and recovery
- customers and admins can manage the lifecycle
- membership grants/revocations are wired
- subscription backend type checks without `// @ts-nocheck`
- subscription-specific tests pass
