# Commerce Loyalty Plugin - PRD and Implementation Strategy

**System:** Commerce Loyalty Plugin
**Status:** Planned
**Priority:** P3 - Optional / Growth
**Complexity:** Medium / High
**Layer:** Full Stack / Plugin
**Source Blueprint:** ConvexPress-native design informed by VexCart gaps
**Target Project:** `ConvexPress`
**WordPress Equivalent:** WooCommerce Points and Rewards / store-credit extensions
**Last Authored:** 2026-04-07

---

## Intent

The Commerce Loyalty Plugin adds points, rewards, and optional store-credit style incentives to ConvexPress commerce.

It is built on top of the `commerce` plugin and owns:

- loyalty accounts
- points accrual and redemption rules
- ledger-style point transactions
- loyalty-oriented customer account experiences
- reward-tier and earning-policy administration

This plugin is optional. It is a retention and growth layer, not a core checkout requirement.

---

## Product Goals

1. Allow merchants to award points for orders and qualifying behaviors.
2. Let customers see balances, history, and redemption opportunities.
3. Support rule-driven earning and redemption without compromising order integrity.
4. Keep loyalty separate from discounts, subscriptions, and memberships.
5. Use a proper ledger model rather than mutable balance-only logic.

---

## Source-System Reality

VexCart does **not** appear to contain a meaningful loyalty or points subsystem.

There are incidental references to “rewards” in copy and docs, but no real points ledger, loyalty account, or redemption engine surfaced in the codebase review.

That means:

- this plugin is not an extraction from VexCart
- it should be treated as ConvexPress-native net-new design
- it should still fit the broader WooCommerce-style plugin suite

---

## Non-Goals

This plugin does **not** own:

- subscriptions
- memberships
- coupon ownership
- gift cards
- affiliate systems

Those are related but distinct systems.

Store credit may be supported later, but points-ledger design should come first.

---

## Plugin Definition

### Plugin ID

- `commerceLoyalty`

### Required Dependency

- `commerce`

### Registry Integration

Add to:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Recommended metadata:

- `id`: `commerceLoyalty`
- `title`: `Commerce Loyalty`
- `description`: `Points, reward rules, loyalty balances, and redemption flows`
- `settingsKey`: `commerceLoyaltyEnabled`
- `dependsOn`: `["commerce"]`
- `adminAccessPrefixes`: `["/admin/commerce/loyalty"]`
- `routePrefixes`: `["/account/loyalty"]`

### Plugin Gating Rule

If `commerceLoyaltyEnabled === false`:

- no points should accrue
- no redemption UI should render
- customer loyalty routes must not render
- loyalty mutations and jobs must reject

---

## Architectural Position

### This Plugin Owns

- loyalty accounts
- point ledger transactions
- earning rules
- redemption rules
- loyalty customer dashboard

### This Plugin Depends On

- `commerce` orders
- `commerce` customers
- discount application surfaces in `commerce`

### This Plugin Does Not Replace

- coupons
- discounts
- subscriptions
- memberships

---

## Core User Stories

### Merchant

- Configure how points are earned.
- Configure how points are redeemed.
- Award or adjust points manually.
- View top loyalty customers and liability.

### Customer

- See current points balance.
- Review a history of earned, redeemed, expired, and adjusted points.
- Redeem points at checkout when eligible.

### Finance / Operations

- Preserve an auditable ledger of all loyalty transactions.
- Understand outstanding loyalty liability.

---

## Domain Model

Recommended tables:

- `commerce_loyalty_accounts`
- `commerce_loyalty_ledger`
- `commerce_loyalty_rules`
- `commerce_loyalty_redemptions`

Optional later tables:

- `commerce_loyalty_tiers`
- `commerce_store_credit_accounts`

### `commerce_loyalty_accounts`

Recommended fields:

- `userId`
- `pointsBalance`
- `lifetimeEarned`
- `lifetimeRedeemed`
- `lastActivityAt?`
- `createdAt`
- `updatedAt`

### `commerce_loyalty_ledger`

Recommended fields:

- `accountId`
- `userId`
- `entryType`
- `points`
- `sourceType`
- `sourceId?`
- `expiresAt?`
- `metadata?`
- `createdBy?`
- `createdAt`

### `commerce_loyalty_rules`

Recommended fields:

- `name`
- `isActive`
- `triggerType`
- `calculationType`
- `value`
- `conditions?`
- `priority`
- `createdAt`
- `updatedAt`

### `commerce_loyalty_redemptions`

Recommended fields:

- `accountId`
- `orderId?`
- `pointsRedeemed`
- `discountAmount`
- `currencyCode`
- `status`
- `createdAt`
- `updatedAt`

---

## Ledger Model

The loyalty system should be ledger-first.

Rules:

- balances are derived from ledger entries
- manual balances without entries are not allowed
- reversals must create offsetting entries
- expiration should be represented explicitly

This is required for enterprise-grade correctness and auditability.

---

## Earning Model

Recommended v1 earning triggers:

- order completed / paid
- account signup
- manual admin adjustment

Optional later triggers:

- review submitted
- referral conversion
- birthday or anniversary rewards

The initial implementation should avoid too many marketing rules until the ledger and checkout integration are stable.

---

## Redemption Model

Recommended v1 redemption model:

- customer applies points during checkout
- points convert into a capped monetary discount
- redemption amount must be validated server-side
- redeemed points become a pending hold until order completion

Failure handling:

- canceled or refunded orders should restore points based on configurable policy

Store credit should remain a later extension unless required immediately.

---

## Admin UX

### Admin Routes

Recommended routes:

- `/admin/commerce/loyalty`
- `/admin/commerce/loyalty/accounts`
- `/admin/commerce/loyalty/accounts/$accountId`
- `/admin/commerce/loyalty/rules`
- `/admin/commerce/loyalty/settings`

### Admin Screens

#### Loyalty Dashboard

- total active accounts
- outstanding points liability
- recent activity
- top earners

#### Account Detail

- current balance
- ledger history
- manual adjustment tools
- notes and audit context

#### Rules

- earning triggers
- redemption conversion rules
- expiration defaults

#### Settings

- plugin enablement
- earn/redeem toggle defaults
- order-status trigger rules
- point expiry policy

---

## Customer UX

### Website Routes

Recommended routes:

- `ConvexPress-Website/apps/web/src/routes/_dashboard/loyalty.tsx`
- `ConvexPress-Website/apps/web/src/routes/_dashboard/loyalty-history.tsx`

### Customer Experience Requirements

- points balance in account area
- loyalty history timeline
- checkout redemption component
- clear explanation of how points are earned and redeemed

---

## Checkout Integration

The plugin should integrate with the `commerce` checkout pipeline without owning checkout itself.

Required behaviors:

- compute eligible redemption amount
- reserve/release redeemed points
- finalize earn and redeem entries after successful order completion
- restore points on failed or canceled orders according to policy

---

## Permissions

Recommended capabilities:

- `commerce.loyalty.view`
- `commerce.loyalty.manageAccounts`
- `commerce.loyalty.adjustBalances`
- `commerce.loyalty.manageRules`
- `commerce.loyalty.manageSettings`

Customer-side access should be scoped to the authenticated owner of the loyalty account.

---

## Analytics And Reporting

Recommended reporting:

- points issued
- points redeemed
- expiry volume
- outstanding liability
- active loyalty customers
- order uplift from redemption usage

---

## Testing Strategy

Required test areas:

- ledger integrity
- balance derivation
- earning rule execution
- redemption validation
- point restoration on order failure/refund
- plugin-disabled behavior

---

## Rollout Plan

### Phase 1

- plugin registration and settings
- loyalty account and ledger schema
- manual adjustments
- customer account balance views

### Phase 2

- order-based earning
- checkout redemption
- redemption hold/release/finalize flows

### Phase 3

- advanced rules
- expiry
- reporting

---

## Acceptance Criteria

The plugin is successful when:

- loyalty balances are derived from an auditable ledger
- orders can award points through clear server-side rules
- customers can redeem eligible points safely at checkout
- point restoration and reversals are handled correctly
- disabling the plugin cleanly suppresses loyalty behavior

