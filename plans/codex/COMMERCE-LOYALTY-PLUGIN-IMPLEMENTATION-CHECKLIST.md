# Commerce Loyalty Plugin - Implementation Checklist

**System:** Commerce Loyalty Plugin
**Status:** Planned
**Last Authored:** 2026-04-07
**Companion Spec:** `.codex/docs/COMMERCE-LOYALTY-PLUGIN-PRD.md`

---

## Working Rule

This checklist covers the `commerceLoyalty` plugin only.

Dependency:

- `commerce` must exist first

---

## Phase 1 - Plugin Foundation

### 1. Registry and Settings

Update:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
- shared settings defaults/validators/validation

Add:

- `commerceLoyalty`
- `commerceLoyaltyEnabled`

---

## Phase 2 - Schema

### 2. Schema File

Create:

- `ConvexPress-Admin/packages/backend/convex/schema/commerceLoyalty.ts`

Update:

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

Add tables:

- `commerce_loyalty_accounts`
- `commerce_loyalty_ledger`
- `commerce_loyalty_rules`
- `commerce_loyalty_redemptions`

Optional later:

- `commerce_loyalty_tiers`

---

## Phase 3 - Backend Domain

### 3. Domain Module

Create:

- `ConvexPress-Admin/packages/backend/convex/commerceLoyalty/`

Suggested files:

- `helpers.ts`
- `validators.ts`
- `queries.ts`
- `mutations.ts`
- `rules.ts`
- `ledger.ts`

### 4. Commerce Integration

Integrate with `commerce` for:

- order-completion earning events
- checkout redemption validation
- refund and cancellation reversal rules

### 5. Ledger And Rule Layer

Add support for:

- account creation
- balance derivation
- manual adjustments
- rule evaluation
- redemption holds and finalization

---

## Phase 4 - Admin UI

### 6. Admin Routes

Create routes under:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/loyalty/`

Suggested route files:

- `index.tsx`
- `accounts.tsx`
- `accounts_.$accountId.tsx`
- `rules.tsx`
- `settings.tsx`

### 7. Admin Components

Create:

- `ConvexPress-Admin/apps/web/src/components/commerce-loyalty/`

Suggested groups:

- `dashboard/`
- `accounts/`
- `rules/`
- `settings/`

---

## Phase 5 - Website UX

### 8. Website Routes

Create:

- `ConvexPress-Website/apps/web/src/routes/_dashboard/loyalty.tsx`
- `ConvexPress-Website/apps/web/src/routes/_dashboard/loyalty-history.tsx`

### 9. Website Components

Create:

- `ConvexPress-Website/apps/web/src/components/commerce-loyalty/`

Suggested groups:

- `account/`
- `history/`
- `checkout/`

### 10. Checkout Integration

Extend checkout flows with:

- redeem-points UI
- points eligibility display
- order-summary redemption rendering

---

## Phase 6 - Reporting And Expiry

### 11. Reporting

Add admin summaries for:

- issued points
- redeemed points
- outstanding liability
- active loyalty accounts

### 12. Expiry And Reversal Rules

Add support for:

- point expiry jobs
- refund/cancel restoration logic
- reversal entries

---

## Phase 7 - Verification

### 13. Verification

- loyalty accounts and ledger entries work
- balances derive correctly from ledger records
- order completion can award points
- checkout redemption validates and finalizes correctly
- reversals restore or offset points correctly
- disabling plugin suppresses loyalty behavior
