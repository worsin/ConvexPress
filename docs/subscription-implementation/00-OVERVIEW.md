# Subscription System Implementation Overview

> **Source PRD:** `../PRD-DRAFT-SUBSCRIPTION-PRODUCTS.md`
> **Created:** 2026-02-03
> **Status:** Ready for Implementation

---

## Executive Summary

This folder contains the phased implementation plan for the **Template-Driven Multi-Item Subscription Container Model**. The implementation is broken into 6 phases designed to integrate with the existing VexCart codebase.

---

## Existing Infrastructure Assessment

The VexCart codebase is **highly mature** with excellent foundations for subscription integration:

### What's Already Built

| Component | Status | Integration Impact |
|-----------|--------|-------------------|
| **Convex Schema** | 50+ tables | Add 7 new tables alongside existing |
| **Payment System** | Stripe/PayPal integrated | Extend for recurring billing |
| **User Profiles** | Clerk auth, user data | Add subscription fields |
| **Checkout Flow** | 3-step complete | Modify to handle subscriptions |
| **Products Table** | Full product management | Add subscription fields |
| **Webhook Handlers** | Payment webhooks ready | Add subscription webhooks |
| **Email System** | Templates + queue ready | Add subscription templates |
| **Admin Routes** | Orders, products, customers | Add subscription pages |
| **Customer Routes** | Account, orders | Add My Team portal |

### Existing Tables We'll Modify

| Table | Modification |
|-------|--------------|
| `products` | Add `isSubscriptionEnabled`, `subscriptionTemplateId`, `subscriptionOverrides` |
| `user_profiles` | Add `activeSubscriptionId`, `hasActiveSubscription` |
| `checkout_sessions` | Add `hasSubscriptionItems`, `subscriptionItems`, `subscriptionAction` |
| `cart_items` | Add `isSubscription`, `subscriptionConfig` |

### New Tables to Create

| Table | Purpose |
|-------|---------|
| `subscription_templates` | Centralized billing configurations |
| `subscriptions` | Billing containers (the main subscription) |
| `subscription_items` | Line items within subscriptions |
| `subscription_invoices` | Invoice records synced from Stripe |
| `subscription_invoice_items` | Line item breakdown on invoices |
| `subscription_history` | Audit trail for all changes |
| `subscription_bundle_items` | Bundle component tracking |

---

## Phase Breakdown

### Phase 1: Schema Foundation (1-2 days)
**Focus:** Database schema setup
- Create 7 new subscription tables with indexes
- Add subscription fields to existing tables (products, user_profiles, checkout_sessions)
- No business logic yet - just schema

**Integration Points:**
- Extends existing `schema.ts`
- Uses existing Convex patterns

### Phase 2: Template System & Stripe Setup (2-3 days)
**Focus:** Template CRUD + Stripe subscription products
- Template management mutations/queries
- Admin template management UI
- Sync templates to Stripe Products
- Product-template linkage

**Integration Points:**
- Uses existing admin route patterns
- Extends existing Stripe integration in `payments.ts`
- Follows existing admin UI patterns

### Phase 3: Core Subscription Mutations (3-4 days)
**Focus:** Business logic for subscriptions
- Create subscription from checkout
- Add/cancel items
- Pause/resume/cancel subscription
- Stripe multi-item subscription creation
- Webhook handlers for subscription events

**Integration Points:**
- Extends existing `checkout.ts` complete flow
- Adds to existing webhook handlers in `http.ts`
- Uses existing payment provider abstraction

### Phase 4: Customer Portal - My Team (2-3 days)
**Focus:** Customer-facing subscription management
- My Subscriptions page (My Team)
- Team member cards UI
- Add team member flow
- Cancel item flow
- Invoice history view

**Integration Points:**
- Uses existing `/_dashboard` layout
- Follows existing account page patterns
- Integrates with existing auth patterns

### Phase 5: Admin Dashboard (2-3 days)
**Focus:** Admin subscription management
- Subscriptions dashboard with metrics (MRR, churn)
- Subscription list with filters
- Subscription detail page
- Item management (add/cancel/price override)
- Internal notes and rep assignment

**Integration Points:**
- Uses existing admin layout patterns
- Follows existing data table patterns
- Uses existing form components

### Phase 6: Checkout Integration & Polish (2-3 days)
**Focus:** End-to-end checkout + UCP
- Modify checkout to separate subscription items
- Add to existing subscription during checkout
- Bundle-to-subscription conversion
- UCP REST endpoints
- MCP tools for AI agent access
- Email notification templates

**Integration Points:**
- Modifies existing checkout mutations
- Uses existing email template system
- Adds UCP routes following existing patterns

---

## Integration Notes

### Things That Will Work Seamlessly

1. **Payment Processing** - Existing Stripe integration extends naturally to Stripe Subscriptions API
2. **User Authentication** - Clerk integration unchanged, just add subscription data to user profiles
3. **Admin UI Patterns** - Existing component library and layouts reused
4. **Email System** - Existing queue and template system supports subscription emails
5. **Webhook Infrastructure** - Existing HTTP handlers extend for subscription events

### Things Requiring Careful Integration

1. **Checkout Flow** - Must handle mixed carts (subscription + one-time items)
2. **Cart Logic** - Need to identify and separate subscription items
3. **Product Display** - Products need subscription pricing display option

### Things Not Covered by Existing Code

1. **Credit System** - Placeholder fields only; full implementation is future work
2. **Usage Metering** - Not part of current scope
3. **Dunning Management** - Basic retry logic only; advanced dunning is future

---

## Dependencies Between Phases

```
Phase 1: Schema
    │
    ├──> Phase 2: Templates + Stripe
    │        │
    │        └──> Phase 3: Core Mutations
    │                  │
    │                  ├──> Phase 4: Customer Portal
    │                  │
    │                  └──> Phase 5: Admin Dashboard
    │
    └──────────────────────> Phase 6: Checkout + Polish
```

- **Phases 1-3 are sequential** (each depends on previous)
- **Phases 4 & 5 can run in parallel** after Phase 3
- **Phase 6 depends on Phase 3** but can start alongside 4 & 5

---

## Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1: Schema | 1-2 days | 1-2 days |
| Phase 2: Templates | 2-3 days | 3-5 days |
| Phase 3: Mutations | 3-4 days | 6-9 days |
| Phase 4: Customer Portal | 2-3 days | 8-12 days |
| Phase 5: Admin Dashboard | 2-3 days | 8-12 days |
| Phase 6: Checkout + Polish | 2-3 days | 10-15 days |

**Total: 10-15 working days** (2-3 weeks)

*Phases 4 & 5 can overlap, reducing total time.*

---

## Files in This Folder

| File | Description |
|------|-------------|
| `00-OVERVIEW.md` | This document |
| `01-PHASE-SCHEMA.md` | Phase 1: Schema Foundation |
| `02-PHASE-TEMPLATES.md` | Phase 2: Template System & Stripe |
| `03-PHASE-MUTATIONS.md` | Phase 3: Core Subscription Logic |
| `04-PHASE-CUSTOMER-PORTAL.md` | Phase 4: Customer "My Team" UI |
| `05-PHASE-ADMIN-DASHBOARD.md` | Phase 5: Admin Management |
| `06-PHASE-CHECKOUT-POLISH.md` | Phase 6: Integration & Polish |

---

## Pre-Implementation Checklist

Before starting Phase 1:

- [ ] Stripe account upgraded for subscription billing (if needed)
- [ ] Stripe webhook endpoints configured for subscription events
- [ ] Review existing `schema.ts` for any conflicts
- [ ] Confirm admin-app is the Convex owner (deploy only from admin-app)
- [ ] Development environment running (`bun run dev`)

---

## Success Metrics

After full implementation:

1. **Customer can:**
   - Add multiple virtual employees to cart
   - Checkout creates single subscription with multiple items
   - View "My Team" with all active employees
   - Cancel individual employees without affecting others
   - View itemized invoices

2. **Admin can:**
   - Create/manage subscription templates
   - View all subscriptions with MRR metrics
   - Add/remove items from any subscription
   - Override prices with audit trail
   - Assign account representatives

3. **System handles:**
   - Monthly billing automatically via Stripe
   - Prorated charges for mid-cycle additions
   - Failed payment notifications and retries
   - Comprehensive audit trail

---

**Next Step:** Begin with [Phase 1: Schema Foundation](./01-PHASE-SCHEMA.md)
