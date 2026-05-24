# PRD: Subscription Entitlement System

> **Project:** ConvexPress — unified CMS + commerce.
> **Two-app architecture:** Admin (Convex Auth) + Website (Clerk).
> **Roles:** WordPress-standard.
> **Stack:** Bun, Base UI, Tailwind v4, Stripe.
> **Canonical path:** `specs/ConvexPress/systems/subscription-entitlement-system/PRD.md`
> **Airtable Record:** `[redacted-airtable-record-id]`
> **Expert:** Co-owned by `/experts:commerce-subscriptions-system` + `/experts:membership-plan-system`.
> **Status:** Shipped as the **bridge layer** between Commerce Subscriptions and Membership Plans. Wave 7 wired `syncEntitlementsForStatus`; Wave 10.4 added `linkedRoleId` role elevation. ~95% feature-complete.

---

## Relationship to sibling systems

This system is the **bridge contract** between three sibling systems:

- **Commerce Subscriptions** — owns contract lifecycle + billing (recurring revenue side).
- **Membership Plan** — owns grant + restriction rule evaluation (access side).
- **Subscription Entitlement** (this) — the wire between them. Defines `entitlementCode` strings on subscriptions + `linkedSubscriptionCode` strings on plans, and the bridge logic (`syncEntitlementsForStatus`) that propagates status.

In code this all lives in `convex/commerceSubscriptions/internals.ts` (`syncEntitlementsForStatus`, `decideBridgeCall` — Wave 4) + `convex/membership/internals.ts` (`grantFromSubscription`, `revokeFromSubscription`, `moveGrantToGrace` — Wave 4 bridge).

**Consolidation path:** After Wave 11 and operator validation, this record can be retired in favor of a "Bridge" section inside the Commerce Subscriptions PRD + the Membership Plan PRD. For now it exists as the formal contract between the two.

---

## Integration with ConvexPress

**Positioning:** bridge layer. Not a standalone extension — lives inside `commerceSubscriptions` + `membership` modules.
**Code lives at:**
- `convex/commerceSubscriptions/internals.ts` — `syncEntitlementsForStatus`, `decideBridgeCall`
- `convex/commerceSubscriptions/bridgeDecisions.ts` — pure decision helper
- `convex/membership/internals.ts` — `grantFromSubscription`, `revokeFromSubscription`, `moveGrantToGrace`
- `convex/helpers/permissions.ts:resolveUserRole` — Wave 10.4 `linkedRoleId` elevation

**Consumes these ConvexPress systems:**

- **Commerce Subscriptions** — reads `commerce_subscriptions.status` + `commerce_subscription_entitlements.entitlementCode`.
- **Membership Plan** — writes `membership_grants` keyed by `planId` + `linkedSubscriptionCode` match.
- **Role & Capability** — `linkedRoleId` + `linkedCapabilities` on plans feed the effective-role resolver.
- **Event Dispatcher** — emits `membership.grant_created / renewed / moved_to_grace / revoked` (from the membership side) on every bridge action.

**WooCommerce analog:** WooCommerce Subscriptions + WooCommerce Memberships integration (by Skyverge). Our architecture mirrors theirs: plans own access rules, subscriptions pay for plan membership via shared codes, status transitions propagate.

---

## 1. Overview

### 1.1 Purpose

Define and enforce the string-code contract by which **buying a
subscription grants access to a membership plan**. A subscription offer
carries `entitlementCodes: string[]`; a membership plan carries
`linkedSubscriptionCode: string`. When a subscription activates, any
matching code triggers a `membership_grants` write. Status transitions
(trial → active → past_due → cancelled) propagate to grant status
(active / grace / revoked). When grants are active, `linkedCapabilities`
elevate permissions and `linkedRoleId` can elevate the effective role.

### 1.2 Scope

**In Scope:**
- String-code contract: `entitlementCodes` (on subs) ↔ `linkedSubscriptionCode` (on plans).
- Bridge `syncEntitlementsForStatus(subscription, config)` run on every status transition.
- Pure decision helper `decideBridgeCall(subscription, entitlement, gracePeriodDays)` returning `{ action: "grant"|"moveToGrace"|"revoke"|"noop", args }`.
- Membership-side internals: `grantFromSubscription`, `moveGrantToGrace`, `revokeFromSubscription`.
- Plugin-gated bridge via `isBridgeEnabled(ctx)` — both `commerceSubscriptionsEnabled` + `membershipEnabled` + `membership.acceptSubscriptionGrants` flag (default true).
- Capability elevation via `linkedCapabilities` (Wave 4).
- Role elevation via `linkedRoleId` (Wave 10.4) through `pickHighestRole`.
- Public `checkEntitlement(code)` query — for direct entitlement checks without going through membership.

**Out of Scope (owned by sibling systems):**
- Restriction rule evaluation (Content Restriction System).
- Access log writes / retention (Membership Plan System).
- Renewal charging (Subscription Billing System).
- Usage metering (Wave 10.6 deferred).

---

## 2. Data Model (shared)

### 2.1 `commerce_subscription_entitlements` (exists)

```ts
commerce_subscription_entitlements: defineTable({
  subscriptionId: v.id("commerce_subscriptions"),
  userId: v.id("users"),
  entitlementCode: v.string(),
  status: v.union(v.literal("active"), v.literal("grace"), v.literal("revoked"), v.literal("expired")),
  startsAt: v.number(),
  endsAt: v.optional(v.number()),
  graceEndsAt: v.optional(v.number()),
  metadata: v.optional(v.any()),
  ...
}).index("by_subscription", ...).index("by_user", ...).index("by_code", ...);
```

### 2.2 `commerce_subscription_offers.entitlementCodes` (exists)
`v.optional(v.array(v.string()))` — the string codes an offer grants.

### 2.3 `membership_plans.linkedSubscriptionCode` (exists)
`v.optional(v.string())` — the code that, if present on any of a user's active entitlements, grants this plan.

### 2.4 `membership_plans.linkedRoleId` + `linkedCapabilities` (exists)

Drives Wave 10.4 role elevation via `helpers/permissions.pickHighestRole`.

---

## 3. Functions

### 3.1 Exists
- `commerceSubscriptions.internals.syncEntitlementsForStatus` — runs on every status transition; loops entitlements + invokes bridge decision.
- `commerceSubscriptions.bridgeDecisions.decideBridgeCall` — pure decision function, unit-tested.
- `membership.internals.grantFromSubscription`, `moveGrantToGrace`, `revokeFromSubscription`.
- `commerceSubscriptions.queries.checkEntitlement(code)` — public query (Wave 7).
- `helpers/permissions.resolveUserRole` — reads active grants' `linkedRoleId`.
- `helpers/permissions.userHasMembershipCapability` — reads active grants' `linkedCapabilities`.

### 3.2 Wave 11 (minor polish)
- Add `listEntitlementsForUser(userId)` admin query for support/debugging.
- Add `listBridgeHistory(subscriptionId)` — returns the audit log of every bridge call (reads `commerce_subscription_history` filtered by eventType).
- Add `admin.forceRevokeBridge(grantId, reason)` — manual break-glass when a bridge fires incorrectly.

---

## 4. Events

- `membership.grant_created / renewed / moved_to_grace / revoked` — emitted from membership side on each bridge action.
- `commerce.subscription_entitlement_status_changed` — NEW: optional detailed event for support tooling.

---

## 5. Acceptance criteria

### 5.1 Existing (must not regress)
- [x] Bridge activates grants on subscription `active` transition (Wave 4 tests).
- [x] Bridge moves grants to grace on `past_due` (Wave 4 tests).
- [x] Bridge revokes grants on `cancelled` / `expired` (Wave 4 tests).
- [x] `linkedCapabilities` elevation via `userHasMembershipCapability` (Wave 4).
- [x] `linkedRoleId` elevation via `pickHighestRole` (Wave 10.4).
- [x] Public `checkEntitlement` query.
- [x] Double plugin-gate via `isBridgeEnabled`.
- [x] `acceptSubscriptionGrants` settings opt-out.

### 5.2 Wave 11 polish
- [ ] `listEntitlementsForUser` admin query
- [ ] `listBridgeHistory(subscriptionId)` admin query
- [ ] `admin.forceRevokeBridge` break-glass mutation with capability `commerce.bridge.manage`
- [ ] `commerce.subscription_entitlement_status_changed` event emission + listener for Audit Log

---

## 6. Definition of Done

1. Wave 11 polish items ticked.
2. Existing 95%-complete bridge tests keep passing (Wave 4 coverage + Wave 10.4 `pickHighestRole` tests).
3. Documentation consolidation decision made: either retire this Airtable record + fold into sibling PRDs, OR keep as the formal bridge contract.

---

## 7. References

- Code: `commerceSubscriptions/internals.ts:syncEntitlementsForStatus`, `bridgeDecisions.ts`, `membership/internals.ts`, `helpers/permissions.ts`
- Tests: `commerceSubscriptions/__tests__/bridge.test.ts`, `membership/__tests__/bridge.test.ts`, `helpers/__tests__/linkedRole.test.ts`
- Sibling PRDs: `subscription-system`, `subscription-billing-system`, `membership-plan-system`, `content-restriction-system`, `role-capability-system`
- Acceptance history: `audits/superpowers/2026-04-21-membership-subscriptions-acceptance.md` (Wave 4 + Wave 10.4 addenda)
- Airtable: `[redacted-airtable-base-id]` / Systems / `[redacted-airtable-record-id]`
