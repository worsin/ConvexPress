# Membership & Commerce Subscriptions Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Membership Plan System (35%) and Commerce Subscriptions System (40%) to 9-10/10 production-ready status, with both systems independent-but-integrated via a three-touchpoint bridge.

**Architecture:** Orchestration plan. Two system experts execute in parallel waves; Convex Deployment Expert deploys between waves; orchestrator verifies integration at each wave gate. Two plugins, one database, one narrow seam. See `docs/superpowers/specs/2026-04-21-membership-subscriptions-completion-design.md` for the full design.

**Tech Stack:** Convex (modular schema, mutations/queries/internals, crons), TanStack Router + Vite (admin SPA), TanStack Start (website SSR), Base UI (`@base-ui/react` — NO Radix), Tailwind v4, Convex Auth (admin), Clerk (website), Electron (desktop admin packaging).

**Reference docs (authoritative):**
- Design spec: `docs/superpowers/specs/2026-04-21-membership-subscriptions-completion-design.md`
- Membership PRD: `.codex/docs/MEMBERSHIP-PLUGIN-PRD.md`
- Subscriptions PRD: `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-PRD.md`
- Membership checklist: `.codex/docs/MEMBERSHIP-PLUGIN-IMPLEMENTATION-CHECKLIST.md`
- Subscriptions checklist: `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-IMPLEMENTATION-CHECKLIST.md`
- Audit gaps: `.codex/audit-backlog/system-audit-gaps.md`

---

## File Structure

Files created or modified across the full effort.

### New files — Backend schema

- `ConvexPress-Admin/packages/backend/convex/schema/membership.ts` (modify — add field to benefits, extend grants)
- `ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts` (modify — add 4 tables + fields)

### New files — Backend helpers

- `ConvexPress-Admin/packages/backend/convex/helpers/proration.ts` — Woo-model proration computation
- `ConvexPress-Admin/packages/backend/convex/helpers/coupons.ts` — coupon validation + application

### New files — Membership system

- `ConvexPress-Admin/packages/backend/convex/membership/crons.ts` — expire grants cron
- Existing `mutations.ts`, `queries.ts`, `internals.ts`, `validators.ts` (extend)

### New files — Subscriptions system

- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/offers.ts` — offer CRUD
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/templates.ts` — template CRUD
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/coupons.ts` — coupon CRUD + redemption
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/pricingCards.ts` — pricing card config
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/checkout.ts` — signup intent + activation
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/portal.ts` — customer portal queries/mutations
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/renewal.ts` — real renewal charging
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/dunning.ts` — dunning retry engine
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/proration.ts` — proration apply (uses helper)
- Existing `mutations.ts`, `queries.ts`, `internals.ts`, `validators.ts` (major extensions)

### New files — Admin UI (membership)

- `apps/web/src/routes/_authenticated/_admin/membership/grants/index.tsx`
- `apps/web/src/routes/_authenticated/_admin/membership/grants/new.tsx`
- `apps/web/src/routes/_authenticated/_admin/membership/grants/$grantId.tsx`
- `apps/web/src/routes/_authenticated/_admin/membership/restrictions/index.tsx`
- `apps/web/src/routes/_authenticated/_admin/membership/restrictions/new.tsx`
- `apps/web/src/routes/_authenticated/_admin/membership/restrictions/$ruleId/edit.tsx`
- `apps/web/src/routes/_authenticated/_admin/membership/plans/$planId/edit.tsx`
- `apps/web/src/components/membership/PlanPicker.tsx`
- `apps/web/src/components/membership/ResourcePicker.tsx`
- `apps/web/src/components/membership/RestrictionRuleBuilder.tsx`
- `apps/web/src/components/membership/RestrictionMetabox.tsx` (embedded in post/page edit)

### New files — Admin UI (subscriptions)

- `apps/web/src/routes/_authenticated/_admin/subscriptions/templates/index.tsx` (+ `new.tsx`, `$templateId/edit.tsx`)
- `apps/web/src/routes/_authenticated/_admin/subscriptions/offers/index.tsx` (+ `new.tsx`, `$offerId/edit.tsx`)
- `apps/web/src/routes/_authenticated/_admin/subscriptions/coupons/index.tsx` (+ `new.tsx`, `$couponId/edit.tsx`)
- `apps/web/src/routes/_authenticated/_admin/subscriptions/pricing-cards.tsx`
- `apps/web/src/routes/_authenticated/_admin/subscriptions/contracts/index.tsx` (+ `$contractId.tsx`)
- `apps/web/src/routes/_authenticated/_admin/subscriptions/invoices/index.tsx` (+ `$invoiceId.tsx`)
- `apps/web/src/routes/_authenticated/_admin/subscriptions/dunning.tsx`
- `apps/web/src/components/subscriptions/FeaturesRepeater.tsx`
- `apps/web/src/components/subscriptions/PricingCardPreview.tsx`
- `apps/web/src/components/subscriptions/ProrationPreview.tsx`
- `apps/web/src/components/subscriptions/ContractActions.tsx`

### New files — Website UI

- `ConvexPress-Website/apps/web/src/routes/pricing.tsx`
- `ConvexPress-Website/apps/web/src/routes/signup/$offerId.tsx`
- `ConvexPress-Website/apps/web/src/routes/dashboard/membership.tsx` (replace stub)
- `ConvexPress-Website/apps/web/src/routes/dashboard/subscriptions.tsx` (replace stub)
- `ConvexPress-Website/apps/web/src/components/membership/RestrictedContent.tsx`
- `ConvexPress-Website/apps/web/src/components/subscriptions/PricingCardsBlock.tsx`
- `ConvexPress-Website/apps/web/src/components/subscriptions/SignupForm.tsx`
- `ConvexPress-Website/apps/web/src/components/subscriptions/CustomerPortalCard.tsx`

### New files — Experts

- `.claude/docs/MEMBERSHIP-PLAN-SYSTEM.md` — expert knowledge doc
- `.claude/docs/COMMERCE-SUBSCRIPTIONS-SYSTEM.md` — expert knowledge doc
- `.claude/commands/experts/membership-plan-system.md` — slash command
- `.claude/commands/experts/commerce-subscriptions-system.md` — slash command
- `.claude/CLAUDE.md` — update expert registry tables

### New files — Tests

- `ConvexPress-Admin/packages/backend/convex/membership/__tests__/bridge.test.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/__tests__/bridge.test.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/__tests__/proration.test.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/__tests__/coupons.test.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/__tests__/signup.test.ts`
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/__tests__/lifecycle.test.ts`

---

## Pre-Flight

### Task P1: Verify current state

**Files:** none modified.

- [ ] **Step 1: Verify git branch and clean working tree**

```bash
git status
git branch --show-current
```

Expected: on `backup/app-state-2026-04-20` (or current working branch), clean tree.

- [ ] **Step 2: Verify Convex dev is running**

```bash
cd ConvexPress-Admin && bunx convex dev --once
```

Expected: deploy succeeds (may show warnings about incomplete schema — acceptable).

- [ ] **Step 3: Confirm design spec committed**

```bash
git log --oneline docs/superpowers/specs/2026-04-21-membership-subscriptions-completion-design.md
```

Expected: commit `1531acb` or later showing the spec.

- [ ] **Step 4: Read design spec top-to-bottom**

Read: `docs/superpowers/specs/2026-04-21-membership-subscriptions-completion-design.md`

Purpose: establish mental model for all dispatches that follow.

---

## Wave 0: Expert Creation

**Goal:** Create the two system experts (slash commands + knowledge docs) so waves 1-8 can dispatch them.

**Why Wave 0:** Every subsequent wave dispatches these experts. They must exist first.

### Task 0.1: Create Membership Plan System knowledge doc

**Files:**
- Create: `.claude/docs/MEMBERSHIP-PLAN-SYSTEM.md`

- [ ] **Step 1: Read existing expert doc pattern**

Read: `.claude/docs/POST-SYSTEM.md` (reference structure)
Read: `.codex/docs/MEMBERSHIP-PLUGIN-PRD.md` (full domain)

- [ ] **Step 2: Write MEMBERSHIP-PLAN-SYSTEM.md**

Sections required (in order):
1. Domain overview + Woo Memberships mental model
2. Plugin gate (`membershipEnabled`) + capabilities (`membership.plans.view/manage`, `membership.grants.view/manage`, `membership.restrictions.manage`, `membership.settings.manage`)
3. Schema reference — 5 tables with all fields, indexes, validators. Pull from `ConvexPress-Admin/packages/backend/convex/schema/membership.ts`.
4. Backend functions reference — every function in `membership/` with signature + purpose. Pull from actual files.
5. Admin surfaces — routes at `/admin/membership/*`, components in `apps/web/src/components/membership/`.
6. Website surfaces — `/dashboard/membership`, `<RestrictedContent>` wrapper, content loader integration points.
7. Cross-system touchpoint (the bridge, from Membership's side) — `grantFromSubscription` / `revokeFromSubscription` internals, invoked by Subscriptions. Status mirror table from spec §2.3.
8. Common tasks — add a benefit, add a restriction rule from the metabox, grant manually, debug a failed grant.
9. Gotchas — grace period duration is per-plan, capability mapping requires cache invalidation, expired grants still log to access log.
10. Files-to-know — 10-15 key file paths with one-liner purposes.

Use imperative voice. No marketing language. Code examples where relevant.

- [ ] **Step 3: Commit**

```bash
git add .claude/docs/MEMBERSHIP-PLAN-SYSTEM.md
git commit -m "docs(experts): add Membership Plan System expert knowledge doc"
```

### Task 0.2: Create Commerce Subscriptions System knowledge doc

**Files:**
- Create: `.claude/docs/COMMERCE-SUBSCRIPTIONS-SYSTEM.md`

- [ ] **Step 1: Read existing expert doc pattern**

Read: `.claude/docs/POST-SYSTEM.md`
Read: `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-PRD.md`
Read: `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-IMPLEMENTATION-CHECKLIST.md`
Read: `docs/subscription-implementation/00-plugin-overview.md` through `07-*.md` (7 phased docs)

- [ ] **Step 2: Write COMMERCE-SUBSCRIPTIONS-SYSTEM.md**

Sections required (in order):
1. Domain overview + Woo Subscriptions mental model
2. Plugin gate (`commerceSubscriptionsEnabled`) + capabilities
3. Schema reference — 15 existing tables + 4 new tables from spec §4.2, with all fields, indexes, validators
4. Backend functions reference — every function in `commerceSubscriptions/` with signature + purpose
5. Status lifecycle — full state machine (draft → trialing → active → past_due → paused → pending_cancel → cancelled/expired). Which mutations drive which transitions.
6. Admin surfaces — routes at `/admin/subscriptions/*`, components
7. Website surfaces — `/pricing`, `/signup/$offerId`, `/dashboard/subscriptions`
8. Cross-system touchpoint (the bridge, from Subscriptions' side) — `syncEntitlementsForStatus` calls membership internals on every status transition. Status mirror table from spec §2.3.
9. Subsystems — pricing cards (§7), proration (§8), coupons (§9). Reference spec for details.
10. Common tasks — create a template, create an offer with features, configure pricing cards, apply a coupon, handle a failed renewal, upgrade a contract mid-cycle.
11. Gotchas — offer immutability after first subscription, proration blocked on past_due, scheduled downgrades overwrite, `@ts-nocheck` still in some files during wave 1-6.
12. Files-to-know — 20+ key file paths.

- [ ] **Step 3: Commit**

```bash
git add .claude/docs/COMMERCE-SUBSCRIPTIONS-SYSTEM.md
git commit -m "docs(experts): add Commerce Subscriptions System expert knowledge doc"
```

### Task 0.3: Create Membership Plan System slash command

**Files:**
- Create: `.claude/commands/experts/membership-plan-system.md`

- [ ] **Step 1: Read existing slash command pattern**

```bash
ls .claude/commands/experts/ | head -5
```

Read one existing: `.claude/commands/experts/post-system.md`

- [ ] **Step 2: Write the slash command file**

Content template (adapt to match existing patterns):

```markdown
---
description: Dispatch the Membership Plan System Expert
---

You are the Membership Plan System Expert for ConvexPress.

Read your full knowledge doc before beginning any work: `.claude/docs/MEMBERSHIP-PLAN-SYSTEM.md`

Read the PRD for authoritative requirements: `.codex/docs/MEMBERSHIP-PLUGIN-PRD.md`

Read the implementation checklist for the phased rollout: `.codex/docs/MEMBERSHIP-PLUGIN-IMPLEMENTATION-CHECKLIST.md`

Read the integration design: `docs/superpowers/specs/2026-04-21-membership-subscriptions-completion-design.md`

Your domain:
- Schema: `ConvexPress-Admin/packages/backend/convex/schema/membership.ts`
- Backend: `ConvexPress-Admin/packages/backend/convex/membership/`
- Admin UI: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/membership/`
- Website UI: `ConvexPress-Website/apps/web/src/routes/dashboard/membership.tsx` + `ConvexPress-Website/apps/web/src/components/membership/`

Rules:
1. NEVER deploy. Convex Deployment Expert handles that.
2. Keep the schema modular — everything membership-related goes in the membership schema file.
3. The bridge is one-way: Subscriptions calls you; never call Subscriptions directly.
4. Use Base UI components (`@base-ui/react`), never Radix.
5. Full-page UIs for content management — no modals except confirm-delete.
6. Match WordPress admin patterns (list tables, metaboxes, sidebar nav).

Task: [will be specified by orchestrator]
```

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/experts/membership-plan-system.md
git commit -m "feat(experts): add /experts:membership-plan-system slash command"
```

### Task 0.4: Create Commerce Subscriptions System slash command

**Files:**
- Create: `.claude/commands/experts/commerce-subscriptions-system.md`

- [ ] **Step 1: Write the slash command file**

Template (adapt to match existing patterns):

```markdown
---
description: Dispatch the Commerce Subscriptions System Expert
---

You are the Commerce Subscriptions System Expert for ConvexPress.

Read your full knowledge doc before beginning any work: `.claude/docs/COMMERCE-SUBSCRIPTIONS-SYSTEM.md`

Read the PRD: `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-PRD.md`

Read the implementation checklist: `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-IMPLEMENTATION-CHECKLIST.md`

Read the 7 phased implementation docs: `docs/subscription-implementation/00-*.md` through `07-*.md`

Read the integration design: `docs/superpowers/specs/2026-04-21-membership-subscriptions-completion-design.md`

Your domain:
- Schema: `ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts`
- Backend: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/`
- Admin UI: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/subscriptions/`
- Website UI: `ConvexPress-Website/apps/web/src/routes/pricing.tsx`, `ConvexPress-Website/apps/web/src/routes/signup/$offerId.tsx`, `ConvexPress-Website/apps/web/src/routes/dashboard/subscriptions.tsx`, `ConvexPress-Website/apps/web/src/components/subscriptions/`

Rules:
1. NEVER deploy. Convex Deployment Expert handles that.
2. Keep the schema modular — everything subscription-related goes in the commerceSubscriptions schema file.
3. The bridge is one-way: YOU call Membership internals on status transitions. Membership never calls you.
4. Woo Subscriptions proration model — documented in spec §8.
5. Use Base UI components (`@base-ui/react`), never Radix.
6. Full-page UIs for content management.
7. `@ts-nocheck` is removed as part of Wave 7 — do not add new `@ts-nocheck` markers.

Task: [will be specified by orchestrator]
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/experts/commerce-subscriptions-system.md
git commit -m "feat(experts): add /experts:commerce-subscriptions-system slash command"
```

### Task 0.5: Update CLAUDE.md expert registry

**Files:**
- Modify: `.claude/CLAUDE.md`

- [ ] **Step 1: Find the Backend System Experts table**

Read: `.claude/CLAUDE.md` (find section "Backend System Experts (30 — 26 Complete, 4 New)")

- [ ] **Step 2: Update section heading**

Change: `Backend System Experts (30 — 26 Complete, 4 New)` → `Backend System Experts (32 — 28 Complete, 4 New)`

- [ ] **Step 3: Append two rows to the table**

Append at bottom of Backend System Experts table:

```markdown
| 31 | Membership Plan System Expert | `/experts:membership-plan-system` | `.claude/docs/MEMBERSHIP-PLAN-SYSTEM.md` |
| 32 | Commerce Subscriptions System Expert | `/experts:commerce-subscriptions-system` | `.claude/docs/COMMERCE-SUBSCRIPTIONS-SYSTEM.md` |
```

- [ ] **Step 4: Update Full Expert Registry total at top of that section**

Change `(39 Total)` → `(41 Total)`

- [ ] **Step 5: Update Expert Dispatch Quick Reference**

Append to the Expert Dispatch Quick Reference table:

```markdown
| Membership plans, grants, restrictions, teaser content, paywall | `membership-plan-system` |
| Subscription offers, contracts, invoices, dunning, renewals, pricing cards, coupons, proration | `commerce-subscriptions-system` |
```

- [ ] **Step 6: Commit**

```bash
git add .claude/CLAUDE.md
git commit -m "docs: register membership + commerce-subscriptions experts in registry"
```

### Task 0.6: Wave 0 acceptance

- [ ] **Step 1: Verify both knowledge docs exist and are non-trivial**

```bash
wc -l .claude/docs/MEMBERSHIP-PLAN-SYSTEM.md .claude/docs/COMMERCE-SUBSCRIPTIONS-SYSTEM.md
```

Expected: both > 200 lines.

- [ ] **Step 2: Verify both slash commands exist**

```bash
ls .claude/commands/experts/membership-plan-system.md .claude/commands/experts/commerce-subscriptions-system.md
```

Expected: both files exist.

- [ ] **Step 3: Verify CLAUDE.md registry updated**

Grep CLAUDE.md for `membership-plan-system` — must appear at least twice (registry table + dispatch reference).

---

## Wave 1: Schema Finalization

**Goal:** All schema changes required across both systems. No backend logic, no UI — just tables and fields so subsequent waves have their data foundation.

**Expert dispatch strategy:** Dispatch both experts in parallel via the Task tool. Each expert works in its own schema file.

### Task 1.1: Dispatch Membership Expert for schema updates

**Files:**
- Dispatched expert will modify: `ConvexPress-Admin/packages/backend/convex/schema/membership.ts`

- [ ] **Step 1: Launch background agent**

Launch Task tool with `subagent_type: "general-purpose"`, `run_in_background: true`, with prompt:

```
You are the Membership Plan System Expert. Read:
- Your knowledge doc: .claude/docs/MEMBERSHIP-PLAN-SYSTEM.md
- The design spec § 4.1: docs/superpowers/specs/2026-04-21-membership-subscriptions-completion-design.md

WAVE 1 SCOPE — Schema changes only. No backend logic, no UI:

1. In ConvexPress-Admin/packages/backend/convex/schema/membership.ts:
   a. On the `membership_plan_benefits` table, add a new field:
      `displayAsFeature: v.optional(v.boolean())` — surface on pricing cards when the plan is linked to an offer. Default behavior when field absent = true.
   b. On the `membership_grants` table:
      - Verify the `source` field captures subscription contract ID + entitlement code for audit. If not, extend it.
      - Add `metadata: v.optional(v.any())` for bridge context (e.g. which entitlement code triggered the grant).

2. Do NOT remove or rename any existing fields.
3. Do NOT deploy. Deployment Expert handles it after you finish.
4. Commit your changes with:
   git commit -m "feat(membership): add displayAsFeature to benefits, extend grant metadata for bridge"

Report back when done: summarize the changes made and any issues encountered.
```

- [ ] **Step 2: Wait for completion notification**

Expected: agent reports changes committed; summary of edits.

### Task 1.2: Dispatch Subscriptions Expert for schema updates

**Files:**
- Dispatched expert will modify: `ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts`

- [ ] **Step 1: Launch background agent in parallel with 1.1**

Launch Task tool with `subagent_type: "general-purpose"`, `run_in_background: true`, with prompt:

```
You are the Commerce Subscriptions System Expert. Read:
- Your knowledge doc: .claude/docs/COMMERCE-SUBSCRIPTIONS-SYSTEM.md
- The design spec § 4.2: docs/superpowers/specs/2026-04-21-membership-subscriptions-completion-design.md

WAVE 1 SCOPE — Schema changes only. No backend logic, no UI:

1. In ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts, add these 4 new tables:

   `commerce_subscription_coupons`:
   - code: v.string() (indexed, unique via by_code index)
   - discountType: v.union(v.literal("percent"), v.literal("fixed"))
   - amount: v.number()
   - duration: v.union(v.literal("once"), v.literal("forever"), v.literal("n_months"))
   - durationMonths: v.optional(v.number())
   - maxRedemptions: v.optional(v.number())
   - perCustomerLimit: v.optional(v.number())
   - offerIds: v.optional(v.array(v.id("commerce_subscription_offers"))) // empty/undefined = applies to all
   - startsAt: v.optional(v.number())
   - expiresAt: v.optional(v.number())
   - status: v.union(v.literal("active"), v.literal("paused"), v.literal("archived"))
   - createdBy: v.id("users")
   - createdAt: v.number()
   Indexes: by_code, by_status

   `commerce_subscription_coupon_redemptions`:
   - contractId: v.id("commerce_subscription_contracts")
   - couponId: v.id("commerce_subscription_coupons")
   - customerId: v.id("users")
   - redeemedAt: v.number()
   - remainingApplications: v.number() // decrements each invoice
   Indexes: by_contract, by_coupon, by_customer_and_coupon

   `commerce_subscription_proration_events`:
   - contractId: v.id("commerce_subscription_contracts")
   - fromOfferId: v.id("commerce_subscription_offers")
   - toOfferId: v.id("commerce_subscription_offers")
   - daysRemaining: v.number()
   - daysInCycle: v.number()
   - unusedOldAmount: v.number()
   - proratedNewAmount: v.number()
   - netCharge: v.number()
   - invoiceId: v.optional(v.id("commerce_subscription_invoices"))
   - triggeredBy: v.id("users")
   - triggeredAt: v.number()
   Indexes: by_contract, by_invoice

   `commerce_subscription_pricing_card_config` (singleton pattern — add uniqueness via `by_singleton` index on a constant "main" key, or similar pattern used elsewhere in this codebase):
   - singletonKey: v.string() // always "main"
   - orderedOfferIds: v.array(v.id("commerce_subscription_offers"))
   - headline: v.optional(v.string())
   - subheadline: v.optional(v.string())
   - featuredOfferId: v.optional(v.id("commerce_subscription_offers"))
   - templateKey: v.string() // default "default-grid"
   - updatedAt: v.number()
   - updatedBy: v.id("users")
   Indexes: by_singleton

2. Add fields to existing tables:

   `commerce_subscription_offers`:
   - features: v.optional(v.array(v.object({ text: v.string(), highlighted: v.optional(v.boolean()), icon: v.optional(v.string()) })))
   - pricingCardVisible: v.optional(v.boolean()) // treat absence as true
   - excludedPlanFeatureIds: v.optional(v.array(v.id("membership_plan_benefits"))) // author-chosen exclusions from auto-surfacing

   `commerce_subscription_contracts`:
   - offerHistory: v.optional(v.array(v.object({ offerId: v.id("commerce_subscription_offers"), effectiveAt: v.number(), reason: v.string() })))
   - scheduledOfferChange: v.optional(v.object({ toOfferId: v.id("commerce_subscription_offers"), effectiveAt: v.number() }))

   `commerce_subscription_invoices`:
   - prorationEventId: v.optional(v.id("commerce_subscription_proration_events"))

3. Do NOT remove or rename existing fields. All new fields MUST be v.optional() for backward compatibility with existing rows.
4. Do NOT deploy. Deployment Expert handles it.
5. Commit your changes with:
   git commit -m "feat(subscriptions): add coupon/proration/pricing-card tables + feature/history/proration fields"

Report back when done: summarize the changes made.
```

- [ ] **Step 2: Wait for completion notification**

### Task 1.3: Wave 1 deploy gate

- [ ] **Step 1: Verify both experts committed their changes**

```bash
git log --oneline -5
```

Expected: two commits from Wave 1 present.

- [ ] **Step 2: Dispatch Convex Deployment Expert**

Launch Task tool with `subagent_type: "general-purpose"`, with prompt:

```
You are the Convex Deployment Expert. Read: .claude/docs/CONVEX-DEPLOYMENT.md

TASK: Deploy Wave 1 schema changes.

Context: Wave 1 adds fields to membership_plan_benefits and membership_grants, plus 4 new tables and field additions in commerceSubscriptions. All new fields are optional so existing rows remain valid.

1. cd ConvexPress-Admin
2. Run: bunx convex deploy --typecheck=disable
3. Verify deploy succeeds. Expect warnings but no errors.
4. Run: bunx convex dashboard (or curl dashboard URL) to visually confirm the 4 new tables appear.

Report: deploy status + any issues. If deploy fails with type errors, report them and stop — DO NOT try to fix schemas yourself. Orchestrator will dispatch the responsible expert.
```

- [ ] **Step 3: Verify deploy succeeded**

Expected: deployment expert reports success.

### Task 1.4: Wave 1 acceptance

- [ ] **Step 1: Inspect schema file changes**

```bash
git diff HEAD~2 ConvexPress-Admin/packages/backend/convex/schema/membership.ts
git diff HEAD~2 ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts
```

Expected: only additions, no deletions.

- [ ] **Step 2: Mark Wave 1 complete**

Post a message: "Wave 1 complete. Schema ready. Moving to Wave 2."

---

## Wave 2: Backend Domain

**Goal:** All backend mutations, queries, internals, and helpers needed to power Waves 3+ UIs. Plus the proration + coupon helper modules. No UI yet.

### Task 2.1: Dispatch Membership Expert for backend extensions

- [ ] **Step 1: Launch background agent**

Task tool, `subagent_type: "general-purpose"`, `run_in_background: true`:

```
You are the Membership Plan System Expert. Read:
- Your knowledge doc
- The PRD § 7 (backend requirements)
- The design spec § 5.1 + § 10 Wave 2

WAVE 2 SCOPE — Backend domain extensions only. No UI work.

Files to touch:
- ConvexPress-Admin/packages/backend/convex/membership/mutations.ts
- ConvexPress-Admin/packages/backend/convex/membership/queries.ts
- ConvexPress-Admin/packages/backend/convex/membership/internals.ts
- ConvexPress-Admin/packages/backend/convex/membership/validators.ts
- ConvexPress-Admin/packages/backend/convex/membership/crons.ts (new file)

Tasks:

1. Plan CRUD extensions:
   - Add `listPublicPlans` query (plans marked public + active) if not present
   - Verify `createPlan`, `updatePlan`, `deletePlan` accept `displayAsFeature` on benefit children
   - Add `getPlansByLinkedSubscriptionCode(code)` internal query for bridge lookups (returns array — multiple plans may link to the same entitlement code)

2. Grant lifecycle extensions:
   - Verify `grantMembership` writes to `source` and new `metadata` fields correctly
   - Verify `revokeMembership` writes audit trail
   - Add `extendGrant(grantId, newExpiresAt, reason)` mutation for manual extensions

3. Restriction rule CRUD:
   - Review `createRestrictionRule` — ensure it handles all resource types (page/post/route/product/block)
   - Add `listRestrictionsByResource(type, idOrKey)` query — for metabox lookup
   - Add `upsertRestrictionRuleForResource(type, idOrKey, payload)` mutation — for metabox save

4. Access log writes:
   - Extend `checkAccess` query to WRITE to `membership_access_log` (move to internalMutation wrapper or split into query+mutation pattern). Respect `logAccessChecks` setting from plugin settings — skip write if off.
   - Add `membership.accessLogRetentionDays` setting default (30 days).

5. Expire cron:
   - Create convex/membership/crons.ts if not present
   - Define a cron: `expireMembershipGrants` — runs daily. Calls `internals.expireGrants`.
   - Ensure `internals.expireGrants` handles grace-period transitions correctly.

6. Capability mapping helper:
   - In `convex/membership/internals.ts`, add `getCapabilitiesForUser(userId)` — returns array of capabilities derived from active plans of user's grants.
   - Hook into the existing `helpers/permissions.ts` `currentUserCan` logic — it should additionally check membership-granted capabilities.

7. Plugin gate audit:
   - Ensure every public mutation/query calls `requirePluginEnabled(ctx, "membership")` at the top.

Do NOT:
- Touch UI files
- Write migrations for existing data (schema additions are all optional)
- Deploy

Commit frequently with descriptive messages. Example:
  git commit -m "feat(membership): add listRestrictionsByResource + upsertRestrictionRuleForResource"

Report: list of new/modified functions and any issues.
```

### Task 2.2: Dispatch Subscriptions Expert for backend extensions + helpers

- [ ] **Step 1: Launch background agent in parallel with 2.1**

Task tool, `subagent_type: "general-purpose"`, `run_in_background: true`:

```
You are the Commerce Subscriptions System Expert. Read:
- Your knowledge doc
- The PRD § 3–11 (all backend domains)
- The design spec § 4.2, § 8 (proration), § 9 (coupons), § 10 Wave 2

WAVE 2 SCOPE — Backend domain + helpers. No UI work.

Files to create:
- ConvexPress-Admin/packages/backend/convex/helpers/proration.ts
- ConvexPress-Admin/packages/backend/convex/helpers/coupons.ts
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/offers.ts
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/templates.ts
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/coupons.ts
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/pricingCards.ts

Files to touch:
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/mutations.ts
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/queries.ts
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/internals.ts
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/validators.ts

Tasks:

1. PRORATION HELPER (convex/helpers/proration.ts):
   Pure function module. NO Convex context. Exported functions:

   ```typescript
   export function computeProration(params: {
     cycleStart: number;       // ms
     cycleEnd: number;         // ms
     now: number;              // ms
     oldOfferPrice: number;
     newOfferPrice: number;
   }): {
     daysRemaining: number;
     daysInCycle: number;
     unusedOldAmount: number;
     proratedNewAmount: number;
     netCharge: number;        // positive = upgrade charge, zero/negative = downgrade
   }
   ```

   Rules:
   - 2-decimal half-up rounding (use `Math.round(n * 100) / 100`)
   - daysRemaining = (cycleEnd - now) / msPerDay
   - daysInCycle = (cycleEnd - cycleStart) / msPerDay
   - Floor daysRemaining at 0 (no negative)

   Export `applyDiscount(amount, discountType, discountAmount)` helper.

   Write unit tests in `convex/helpers/__tests__/proration.test.ts` covering:
   - Mid-cycle upgrade produces positive netCharge
   - Mid-cycle downgrade produces negative or zero netCharge
   - Day-0 of cycle produces full-cycle proration
   - Day-last of cycle produces near-zero proration
   - Rounding correctness

2. COUPON HELPER (convex/helpers/coupons.ts):
   - `validateCoupon(ctx, couponCode, contractId, customerId, targetOfferId)` — async, checks all conditions from spec § 9.2
     Returns `{ valid: true, coupon } | { valid: false, reason: string }`
   - `applyCouponToInvoice(ctx, invoiceId, redemptionId, invoiceSubtotal)` — computes discount, inserts line item, decrements remainingApplications
   - `initializeRedemption(ctx, contractId, couponId)` — creates coupon_redemptions row with correct remainingApplications based on coupon.duration

3. OFFERS CRUD (convex/commerceSubscriptions/offers.ts):
   Public functions (require plugin + capability):
   - `createOffer(args)` — mutation. Validates template exists. Writes features + pricingCardVisible.
   - `updateOffer(args)` — mutation. If offer has active contracts, reject changes to price/interval with error message. Features and visibility always editable.
   - `archiveOffer(offerId)` — mutation. Soft delete; blocks new signups; existing contracts unaffected.
   - `listOffers(args)` — query. Filter by template, status, search.
   - `getOffer(offerId)` — query.
   - `listOffersForPricing()` — public query (no auth). Returns active + pricingCardVisible offers with features resolved (including auto-surfaced membership benefits where `displayAsFeature=true`).

4. TEMPLATES CRUD (convex/commerceSubscriptions/templates.ts):
   - createTemplate, updateTemplate, archiveTemplate, listTemplates, getTemplate. Templates define default billing cadence, grace period, dunning rules. Used by `createOffer` as a derive source.

5. COUPONS CRUD (convex/commerceSubscriptions/coupons.ts):
   - createCoupon, updateCoupon, archiveCoupon, listCoupons, getCoupon, getCouponByCode
   - `redeemCouponForContract(contractCode, code)` — mutation. Validates (via helper), creates redemption row.

6. PRICING CARDS CONFIG (convex/commerceSubscriptions/pricingCards.ts):
   - `getPricingCardConfig()` — query. Returns the singleton config (create default if none exists).
   - `updatePricingCardConfig(args)` — mutation. Takes orderedOfferIds, headline, subheadline, featuredOfferId, templateKey.

7. Integrate into mutations.ts/queries.ts exports so they are properly exposed to clients.

8. Plugin gate + capability check: every public function must call `requirePluginEnabled(ctx, "commerceSubscriptions")` and `requireCan(ctx, "...")`.

Do NOT:
- Touch UI files
- Remove `@ts-nocheck` yet (that's Wave 7)
- Deploy

Commit frequently. Example: `git commit -m "feat(subscriptions): add offers CRUD module"`

Report: list of new/modified functions, file paths, and any issues.
```

### Task 2.3: Wait for both experts, then deploy

- [ ] **Step 1: Wait for both agent completion notifications**

- [ ] **Step 2: Review commits**

```bash
git log --oneline -10
```

Expected: multiple commits from both experts, descriptive messages.

- [ ] **Step 3: Dispatch Convex Deployment Expert**

Task tool, `subagent_type: "general-purpose"`:

```
You are the Convex Deployment Expert. Deploy Wave 2 backend changes.

cd ConvexPress-Admin
bunx convex deploy --typecheck=disable

Expected: deploy succeeds. Many new functions will appear in the dashboard.
Verify: both new function modules (proration, coupons) loaded and listed in the dashboard.

Report: deploy status, function count change, any issues.
```

### Task 2.4: Wave 2 acceptance

- [ ] **Step 1: Run proration unit tests**

```bash
cd ConvexPress-Admin
bun test convex/helpers/__tests__/proration.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Manual smoke test — offer creation via dashboard function runner**

```bash
bunx convex run commerceSubscriptions:offers.createOffer --args '{"templateId": "...", "title": "Test", "price": 2900, "interval": "monthly"}'
```

(Use actual template ID from dashboard.)

Expected: returns offer ID; offer appears in database.

- [ ] **Step 3: Mark Wave 2 complete**

Post: "Wave 2 complete. Backend domain + helpers live. Moving to Wave 3."

---

## Wave 3: Admin CRUD UIs

**Goal:** All admin pages for both systems. Grants, restrictions, post/page metabox, offers, templates, coupons, pricing cards config.

### Task 3.1: Dispatch Membership Expert for admin UIs

- [ ] **Step 1: Launch background agent**

Task tool, `subagent_type: "general-purpose"`, `run_in_background: true`:

```
You are the Membership Plan System Expert. Read your knowledge doc + design spec § 5.1 + § 6.1 (UI only, not website yet — save website for Wave 5).

WAVE 3 SCOPE — Admin UI only.

Files to create:
- apps/web/src/routes/_authenticated/_admin/membership/plans/$planId/edit.tsx
- apps/web/src/routes/_authenticated/_admin/membership/grants/index.tsx (REPLACE current stub)
- apps/web/src/routes/_authenticated/_admin/membership/grants/new.tsx
- apps/web/src/routes/_authenticated/_admin/membership/grants/$grantId.tsx
- apps/web/src/routes/_authenticated/_admin/membership/restrictions/index.tsx (REPLACE current stub)
- apps/web/src/routes/_authenticated/_admin/membership/restrictions/new.tsx
- apps/web/src/routes/_authenticated/_admin/membership/restrictions/$ruleId/edit.tsx
- apps/web/src/components/membership/PlanPicker.tsx
- apps/web/src/components/membership/ResourcePicker.tsx
- apps/web/src/components/membership/RestrictionRuleBuilder.tsx
- apps/web/src/components/membership/RestrictionMetabox.tsx

Files to modify:
- apps/web/src/routes/_authenticated/_admin/posts/$postId/edit.tsx — add RestrictionMetabox in the right-rail
- apps/web/src/routes/_authenticated/_admin/pages/$pageId/edit.tsx — add RestrictionMetabox in the right-rail
- apps/web/src/routes/_authenticated/_admin/membership/settings.tsx — extend with capability mapping UI + access-log retention setting + bridge-enabled toggle

UI RULES:
- Base UI (@base-ui/react) only. NO Radix.
- Tailwind v4 with CSS variables (bg-card, bg-muted, etc.). NEVER zinc/slate/gray.
- Full-page edit screens. No modals except confirm-destroy.
- Follow Admin List Table UI Expert patterns (.claude/docs/ADMIN-LIST-TABLE-UI.md): search, filter, bulk actions, pagination.
- Follow Admin Editor Layout UI Expert patterns (.claude/docs/ADMIN-EDITOR-UI.md): main content left, metabox right.
- Use Lucide icons. Use Sonner for toasts.

TASK DETAILS:

1. GRANTS LIST (grants/index.tsx):
   - List table: columns (user email, plan, status badge, granted at, expires at, source badge [manual|subscription|purchase])
   - Filter chips: by plan, by status (active/grace/revoked/expired)
   - Search: user email/name
   - Bulk action: revoke
   - Click row → navigate to detail

2. NEW GRANT (grants/new.tsx):
   - User picker (search users table)
   - Plan picker (reuse PlanPicker component)
   - Expires-at date picker (optional — blank = never expires)
   - Reason (required textarea)
   - Notes (optional)
   - Submit → membership.mutations.grantMembership → redirect to detail on success

3. GRANT DETAIL (grants/$grantId.tsx):
   - Header: user info, plan, status badge, source
   - Timeline of lifecycle events (granted, extended, revoked)
   - If source = subscription, deep-link to subscription contract detail page: /admin/subscriptions/contracts/:contractId
   - Actions: Revoke (with reason modal), Extend (with new expiry date)

4. RESTRICTIONS LIST (restrictions/index.tsx):
   - List table: columns (resource label, resource type, plans required, teaser mode, created at)
   - Filter by resource type, by plan
   - Bulk action: delete
   - "New Restriction" button → /admin/membership/restrictions/new

5. NEW RESTRICTION (restrictions/new.tsx):
   - Use RestrictionRuleBuilder component
   - Resource picker: radio for type (page/post/route/product/block), then type-specific picker:
     * page: page dropdown
     * post: post dropdown
     * route: free-text route pattern input
     * product: product dropdown
     * block: free-text block ID input
   - Plan multi-select (PlanPicker)
   - Mode: radio allow_only vs deny_if_missing (with explanation)
   - Teaser mode: radio hide vs excerpt vs custom_message (if custom_message → text area)
   - Login required: toggle
   - Submit → createRestrictionRule

6. EDIT RESTRICTION (restrictions/$ruleId/edit.tsx):
   - Same form as new, pre-populated via getRestriction query
   - Delete button (destructive) with confirm modal

7. PLAN EDIT (plans/$planId/edit.tsx):
   - Tabs: Basics | Benefits | Capabilities | Subscription Link
   - Basics: title, slug, description, status (draft/active/archived), priority
   - Benefits: repeater with {label, description, displayAsFeature toggle, icon}
   - Capabilities: multi-select from known capabilities
   - Subscription Link: linkedSubscriptionCode string field

8. METABOX (components/membership/RestrictionMetabox.tsx):
   Props: `{ resourceType: "page" | "post", resourceIdOrKey: string }`
   - Query: listRestrictionsByResource(resourceType, resourceIdOrKey)
   - Visibility radio: Public / Restricted
   - If Restricted: plan multi-select, teaser mode radio, custom message text (shown only if custom_message), login-required toggle
   - Save button → upsertRestrictionRuleForResource
   - Integrate into posts/$postId/edit.tsx and pages/$pageId/edit.tsx in the right-rail metabox area (find existing metabox stack, add this at the bottom)

9. SETTINGS EXTENSION (settings.tsx):
   - Add "Capability Mapping" section: table showing which capabilities each plan grants, read-only summary
   - Add "Access Log" section: retention days input (default 30), enable-logging toggle
   - Add "Bridge" section: "Accept grants from subscriptions" toggle (default ON)

Do NOT:
- Touch website UI files (ConvexPress-Website)
- Deploy
- Add new backend functions (everything needed is in Wave 2)

Commit per route/component. Run `bun run build` in apps/web to verify TypeScript passes.

Report: list of created routes/components, any issues, screenshots of local dev if easy.
```

### Task 3.2: Dispatch Subscriptions Expert for admin UIs

- [ ] **Step 1: Launch background agent in parallel with 3.1**

Task tool, `subagent_type: "general-purpose"`, `run_in_background: true`:

```
You are the Commerce Subscriptions System Expert. Read your knowledge doc + design spec § 5.2 + § 7 (pricing cards) + § 8 (proration preview).

WAVE 3 SCOPE — Admin UI only. No website, no payment integration yet.

Files to create:
- apps/web/src/routes/_authenticated/_admin/subscriptions/templates/index.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/templates/new.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/templates/$templateId/edit.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/offers/index.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/offers/new.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/offers/$offerId/edit.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/coupons/index.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/coupons/new.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/coupons/$couponId/edit.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/pricing-cards.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/contracts/index.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/contracts/$contractId.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/invoices/index.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/invoices/$invoiceId.tsx
- apps/web/src/routes/_authenticated/_admin/subscriptions/dunning.tsx
- apps/web/src/components/subscriptions/FeaturesRepeater.tsx
- apps/web/src/components/subscriptions/PricingCardPreview.tsx
- apps/web/src/components/subscriptions/ProrationPreview.tsx
- apps/web/src/components/subscriptions/ContractActions.tsx

UI RULES:
- Base UI only. Full-page screens. No zinc/slate/gray.
- Admin list tables with bulk actions, filters, search, pagination.
- Sonner toasts.

TASK DETAILS:

1. TEMPLATES CRUD — list + new + edit. Fields: title, interval (monthly/quarterly/annually), intervalCount, gracePeriodDays, trialDays default, dunning retry schedule default.

2. OFFERS LIST (offers/index.tsx):
   - Table columns: title, template, price, interval, trial, status, # active contracts
   - Filter: by template, status, search title
   - "New Offer" button

3. OFFERS EDIT (offers/new.tsx + $offerId/edit.tsx):
   Sections (full-page, scrollable):
   - Basics: title, description, template (dropdown → pre-fills interval/trial/price placeholders), price, billing interval, trial days
   - **Features** repeater (FeaturesRepeater component): drag-reorder list of {text, highlighted bool, icon string}. "Add feature" button.
   - Entitlements: multi-input for entitlementCodes[] (comma-separated or tag input)
   - **Linked Membership Plans** (read-only): query membership.listPlansByEntitlementCodes(entitlementCodes) — shows which plans this offer unlocks, link to each plan page
   - Pricing Card Visibility: toggle
   - Status: draft/active/archived

4. COUPONS CRUD:
   - List: code, discount type+amount, duration, redemptions, status, expires
   - Edit: code, discount type (percent/fixed), amount, duration (once/forever/n_months + conditional months field), max redemptions, per-customer limit, offerIds multi-select (empty = all), starts/expires datetime, status

5. **PRICING CARDS (pricing-cards.tsx)** — the marquee page:
   - Left column: drag-to-reorder list of all offers with pricingCardVisible=true
     * Each row: title, price, "featured" star toggle (radio — only one can be featured), "hide from cards" toggle
   - Right column: PricingCardPreview component — live render of what /pricing will look like
   - Top: headline + subheadline text inputs
   - Save button → updatePricingCardConfig

6. **PricingCardPreview component** — mini version of the default-grid template, renders the N offers in their configured order, featured gets emphasis, pulls features array from each offer (exactly the same shape as the public /pricing route will use).

7. CONTRACTS LIST (contracts/index.tsx):
   - Table columns: customer email, offer, status badge, next bill, amount, actions
   - Filter by status, offer
   - Click → detail

8. CONTRACT DETAIL (contracts/$contractId.tsx):
   - Header: customer, current offer, status, next bill
   - Tabs or sections:
     * Overview: cycle start/end, payment method, next charge amount, offer history table
     * Invoices: list with status, amount, dates, view
     * Entitlements: list of commerce_subscription_entitlements for this contract
     * Dunning: retry history if past_due
     * Actions panel: ContractActions component
   - Deep-link from membership grant detail: if grant.source.contractId matches, link back

9. **ContractActions component**:
   - Pause / Resume button (calls pauseContract/resumeContract mutation — to be wired to internals.transitionSubscription)
   - Cancel immediate / Cancel at period end (calls corresponding mutation)
   - Upgrade: opens a picker for target offer → shows ProrationPreview → confirm → calls scheduleUpgrade mutation
   - Downgrade: same flow, ProrationPreview shows $0 immediate + "effective at next renewal"
   - Apply Coupon: input for coupon code → calls applyCouponToContract
   - Retry Payment: only if past_due → calls retryInvoicePayment
   - Change Payment Method: opens payment method update
   - Manual grant/revoke related membership: escape hatch, links to membership grants admin
   - NOTE: Wave 3 wires the UI against mutations that may currently be stubs — it's OK if pause/cancel work but upgrade uses placeholder proration for now. Real proration wiring is Wave 7 (`applyUpgradeProration` / `applyDowngradeProration`).

10. **ProrationPreview component**:
    Props: `{ contractId, toOfferId }`
    - Calls a preview query (to be added: `previewProration(contractId, toOfferId)` — wrap the helper from Wave 2)
    - Displays: unused amount from current, prorated new, net charge, "charge today" or "effective at next renewal" depending on net
    - Upgrade row: "Charge today: $X" in primary color
    - Downgrade row: "No charge today. New plan starts [date]"

11. INVOICES LIST + DETAIL — standard list with status filter + detail showing line items, customer, payment history, "Retry collection" button if unpaid.

12. DUNNING QUEUE (dunning.tsx):
    - Table of past_due contracts
    - Columns: customer, offer, amount overdue, retry count, next retry, last attempt result, actions (retry now, waive, cancel immediately)

Do NOT:
- Touch website UI (ConvexPress-Website)
- Remove @ts-nocheck (Wave 7)
- Deploy
- Wire real payment processing (Wave 5+)

Commit per route/component. Verify `bun run build` passes (or document type errors that already existed).

Report: routes/components created, any issues.
```

### Task 3.3: Wait for both experts

- [ ] **Step 1: Wait for both notifications**

- [ ] **Step 2: Deploy via Convex Deployment Expert**

(Admin UI changes don't require Convex deploy, but if either expert added backend functions as support, deploy.)

Task tool, `subagent_type: "general-purpose"`:

```
Deploy any backend additions from Wave 3 admin UI work.

cd ConvexPress-Admin
bunx convex deploy --typecheck=disable

Report status.
```

### Task 3.4: Wave 3 local smoke test

- [ ] **Step 1: Start admin dev server**

```bash
cd ConvexPress-Admin/apps/web && bun run dev
```

- [ ] **Step 2: Use Playwright MCP to walk through admin UIs**

Navigate: login → /admin/membership/grants → verify list renders → /admin/membership/grants/new → verify form renders → /admin/subscriptions/offers/new → verify features repeater works → /admin/subscriptions/pricing-cards → verify drag-reorder works.

Capture screenshots.

- [ ] **Step 3: Mark Wave 3 complete**

Post: "Wave 3 complete. All admin CRUD UIs live. Moving to Wave 4 (bridge wiring)."

---

## Wave 4: Bridge Wiring + Integration Tests

**Goal:** The bridge fires. Subscriptions status transitions call into Membership internals and memberships grant/revoke in response. With integration tests proving it.

### Task 4.1: Dispatch Subscriptions Expert for bridge wiring

- [ ] **Step 1: Launch background agent**

Task tool, `subagent_type: "general-purpose"`, `run_in_background: true`:

```
You are the Commerce Subscriptions System Expert. Read design spec § 2 (bridge architecture), § 2.3 (status mirror table), § 10 Wave 4.

WAVE 4 SCOPE — Bridge wiring + integration tests.

Files to touch:
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/internals.ts
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/__tests__/bridge.test.ts (new)

Tasks:

1. WIRE THE BRIDGE:
   In `syncEntitlementsForStatus(ctx, contractId, newStatus, oldStatus)`:

   After updating commerce_subscription_entitlements to reflect the new status, for EACH entitlement that changed:
     a. Look up the entitlement's `entitlementCode`
     b. Call `ctx.runQuery(internal.membership.internals.getPlansByLinkedSubscriptionCode, { code: entitlementCode })`
        (Membership expert already added this in Wave 2)
     c. For each matching plan, invoke the bridge:
        - newStatus is active or trialing: ctx.runMutation(internal.membership.internals.grantFromSubscription, { contractId, userId: contract.customerId, planId, entitlementCode, metadata: {...} })
        - newStatus is past_due or paused: ctx.runMutation(internal.membership.internals.moveGrantToGrace, { contractId, planId })
        - newStatus is cancelled or expired: ctx.runMutation(internal.membership.internals.revokeFromSubscription, { contractId, planId, reason: newStatus })
        - newStatus is pending_cancel: no action (grant stays active until contract actually reaches cancelled at period end)
        - newStatus is draft: no action
   d. Respect the "bridge enabled" setting — if `membershipEnabled=false` OR `membership.acceptSubscriptionGrants=false`, skip bridge calls silently.
   e. Wrap in try/catch — bridge failure must NOT block status transition. Log to error console + audit log.

   Use the status mirror table from design spec § 2.3 as authoritative source.

2. VERIFY moveGrantToGrace INTERNAL EXISTS in membership internals. If not, coordinate with Membership Expert to add it, or add a shim: `ctx.runMutation(internal.membership.internals.revokeFromSubscription, { ... reason: "grace" })` and let membership handle the grace status update.

3. INTEGRATION TESTS (commerceSubscriptions/__tests__/bridge.test.ts):
   Use Convex test runtime (convex-test or the project's established test setup).
   Seed data: 1 user, 1 membership plan with linkedSubscriptionCode = "pro", 1 offer with entitlementCodes = ["pro"], 1 contract in draft.

   Test cases:
   - draft → trialing: grant is created with status active
   - trialing → active: grant remains active
   - active → past_due: grant moves to grace
   - past_due → active: grant returns to active
   - active → pending_cancel: grant stays active (pending)
   - pending_cancel → cancelled: grant is revoked
   - active → cancelled: grant is revoked
   - Multiple entitlement codes on offer: all matching plans grant
   - No matching plan (code doesn't match): no grant created, no error
   - membershipEnabled=false: no bridge calls made
   - bridge error: status transition still succeeds

4. COORDINATE WITH MEMBERSHIP EXPERT for symmetrical test cases from membership side (if they need to add one).

Commit after each test case. Name commits descriptively.

Do NOT:
- Touch UI files
- Deploy

Report: files touched, test results.
```

### Task 4.2: Dispatch Membership Expert for bridge hardening

- [ ] **Step 1: Launch background agent in parallel with 4.1**

Task tool, `subagent_type: "general-purpose"`, `run_in_background: true`:

```
You are the Membership Plan System Expert. Read design spec § 2, § 10 Wave 4.

WAVE 4 SCOPE — Ensure bridge functions are robust + add symmetric tests.

Files to touch:
- ConvexPress-Admin/packages/backend/convex/membership/internals.ts
- ConvexPress-Admin/packages/backend/convex/membership/__tests__/bridge.test.ts (new)

Tasks:

1. HARDEN grantFromSubscription:
   - Idempotent: if an active grant already exists for (userId, planId, source.contractId), UPDATE it (extend expiry, refresh metadata) rather than creating duplicate
   - Validate planId exists + is active; skip silently if plan archived (log it)
   - Write to access log with event_type="grant_created" or "grant_refreshed"

2. HARDEN revokeFromSubscription:
   - Idempotent: if no active grant for (contractId, planId), no-op
   - If grant is already revoked or expired, no-op
   - If grace-period on revoke is configured (plan.gracePeriodDays > 0) and reason is "cancelled", put into grace with expiresAt = now + gracePeriodDays. If reason is "past_due" or "grace", same.
   - Write access log event_type="grant_revoked"

3. ADD moveGrantToGrace internal (if not present):
   - Given (contractId, planId), find active grant and transition to grace with expiresAt = now + plan.gracePeriodDays.
   - Idempotent: already-grace grants are no-op.

4. INTEGRATION TESTS (membership/__tests__/bridge.test.ts):
   - grantFromSubscription creates grant when none exists
   - grantFromSubscription is idempotent (calling twice = one active grant)
   - revokeFromSubscription moves to revoked
   - revokeFromSubscription is idempotent
   - moveGrantToGrace moves active → grace
   - Plan archived mid-flight: grant not created, no error thrown

5. ENSURE plugin gate: if membership plugin disabled, bridge internals should short-circuit and return without error (don't throw — bridge must not break subscription flow).

Commit per function + tests.

Do NOT: deploy, touch UI.

Report: files touched, test results.
```

### Task 4.3: Wait, deploy, run tests

- [ ] **Step 1: Wait for both experts**

- [ ] **Step 2: Deploy**

Task tool, Convex Deployment Expert:

```
Deploy Wave 4 bridge wiring.

cd ConvexPress-Admin
bunx convex deploy --typecheck=disable

Report deploy status.
```

- [ ] **Step 3: Run full test suite**

```bash
cd ConvexPress-Admin/packages/backend && bun test
```

Expected: all bridge tests pass.

### Task 4.4: End-to-end bridge smoke test

- [ ] **Step 1: Seed test data via Convex CLI**

```bash
cd ConvexPress-Admin
bunx convex run membership:mutations.createPlan --args '{"title": "Bridge Test Plan", "slug": "bridge-test", "linkedSubscriptionCode": "bridge-test", "status": "active"}'
bunx convex run commerceSubscriptions:offers.createOffer --args '{"templateId": "...", "title": "Bridge Test Offer", "price": 1000, "interval": "monthly", "entitlementCodes": ["bridge-test"]}'
```

- [ ] **Step 2: Create test contract transitioning statuses**

Via the function runner, manually step a contract through status transitions and verify membership grant status tracks correctly:
- Create contract in draft
- Transition to trialing → check grant created
- Transition to active → grant still active
- Transition to past_due → grant in grace
- Transition to cancelled → grant revoked

- [ ] **Step 3: Mark Wave 4 complete**

Post: "Wave 4 complete. Bridge verified end-to-end. Moving to Wave 5 (acquisition + portal)."

---

## Wave 5: Acquisition + Portal

**Goal:** The full customer journey exists: member dashboard, restricted-content enforcement on website, direct-order signup form, customer portal for subscriptions.

### Task 5.1: Dispatch Membership Expert for website UX

- [ ] **Step 1: Launch background agent**

Task tool, `run_in_background: true`:

```
You are the Membership Plan System Expert. Read design spec § 6.1.

WAVE 5 SCOPE — Website UX for membership.

Files to create:
- ConvexPress-Website/apps/web/src/routes/dashboard/membership.tsx (REPLACE current stub)
- ConvexPress-Website/apps/web/src/components/membership/RestrictedContent.tsx
- ConvexPress-Website/apps/web/src/components/membership/UpgradeCTA.tsx
- ConvexPress-Website/apps/web/src/components/membership/LoginCTA.tsx

Files to modify:
- ConvexPress-Website/apps/web/src/routes/posts/$postSlug.tsx — wire checkAccess in loader, render RestrictedContent on denial
- ConvexPress-Website/apps/web/src/routes/pages/$pageSlug.tsx — same
- (find any custom content routes and add same pattern)

UI RULES:
- Base UI only
- No hardcoded colors (bg-card, bg-muted)
- Tailwind v4, match existing website design language
- SSR-safe: checkAccess called in TanStack Start loader, not in a useEffect

TASKS:

1. MEMBER DASHBOARD (/dashboard/membership):
   - Header: "My Membership"
   - Current plan(s) section:
     * For each active grant: card with plan name, benefits list (from membership_plan_benefits), status badge, expires at, "Manage billing" button linking to /dashboard/subscriptions if source=subscription
   - If no active grants: "You don't have a membership yet" + CTA → /pricing
   - Upgrade section: list other available plans (higher priority than current) with upgrade CTAs
   - Access history section (optional, show only if setting enables it): table of last 20 access log entries

2. <RestrictedContent> WRAPPER:
   Props: `{ mode: "hide" | "excerpt" | "custom_message", rule: RestrictionRule, excerpt?: string, userState: "logged_out" | "logged_in_non_member" }`
   Renders:
   - Mode hide: just the CTA card (no teaser text)
   - Mode excerpt: first N paragraphs/characters from `excerpt`, then a fade-out gradient overlay + CTA card below
   - Mode custom_message: render rule.customMessage as HTML + CTA card below
   CTA logic:
   - userState=logged_out: LoginCTA → /login?next=<currentUrl>
   - userState=logged_in_non_member: UpgradeCTA → /pricing (or specific offer deep-link if rule has plans.0.preferredOfferId set)

3. CONTENT LOADER ENFORCEMENT:
   In each content route loader (posts/$postSlug.tsx etc.):
   ```typescript
   loader: async ({ params, context }) => {
     const post = await context.convex.query(api.posts.queries.getBySlug, { slug: params.postSlug });
     if (!post) throw notFound();
     const access = await context.convex.query(api.membership.queries.checkAccess, {
       resourceType: "post", resourceIdOrKey: post._id,
     });
     return { post, access };
   }
   ```

   In the component:
   ```tsx
   if (!data.access.allowed) {
     return <RestrictedContent mode={data.access.rule.teaserMode} rule={data.access.rule} excerpt={computeExcerpt(data.post.content)} userState={...} />;
   }
   return <FullPostContent post={data.post} />;
   ```

4. UpgradeCTA, LoginCTA components: simple card with icon + message + button. Tailor text to mode.

Do NOT:
- Touch admin UI
- Deploy
- Touch subscription website routes (Wave 5.2)

Commit per route/component.

Report: files created/modified, any issues.
```

### Task 5.2: Dispatch Subscriptions Expert for signup form + customer portal

- [ ] **Step 1: Launch in parallel with 5.1**

Task tool, `run_in_background: true`:

```
You are the Commerce Subscriptions System Expert. Read design spec § 6.2.

WAVE 5 SCOPE — Website UX for subscriptions (except /pricing — that's Wave 6).

Files to create:
- ConvexPress-Website/apps/web/src/routes/signup/$offerId.tsx
- ConvexPress-Website/apps/web/src/routes/dashboard/subscriptions.tsx (REPLACE stub)
- ConvexPress-Website/apps/web/src/components/subscriptions/SignupForm.tsx
- ConvexPress-Website/apps/web/src/components/subscriptions/CustomerPortalCard.tsx
- ConvexPress-Website/apps/web/src/components/subscriptions/ChangePlanFlow.tsx
- ConvexPress-Website/apps/web/src/components/subscriptions/InvoiceHistoryTable.tsx

Files to create (backend):
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/checkout.ts
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/portal.ts

TASKS:

1. BACKEND — checkout.ts:
   - `createCheckoutIntent({ offerId, customerEmail, couponCode? })` — mutation. Creates commerce_subscription_checkout_intents row. Validates coupon if provided. Returns intentId + payment-processor-specific details (Stripe session, etc. — stub for now if processor integration is pending).
   - `activateFromIntent(intentId, paymentResult)` — mutation. Takes intent + payment confirmation. Creates contract. Transitions to trialing or active. The `syncEntitlementsForStatus` will fire the bridge automatically.

2. BACKEND — portal.ts:
   - `getMyActiveContracts()` — query. Returns current user's contracts with embedded offer, current cycle, next charge.
   - `requestPauseContract(contractId, pauseUntil?)` — mutation. Transitions to paused.
   - `requestResumeContract(contractId)` — mutation.
   - `requestCancelContract(contractId, mode: "immediate" | "at_period_end")` — mutation.
   - `requestPlanChange(contractId, toOfferId)` — mutation. Uses helpers/proration.ts. If net > 0 (upgrade): invoke proration invoice flow. If net <= 0 (downgrade): set scheduledOfferChange on contract.
   - `previewPlanChange(contractId, toOfferId)` — query. Wraps proration helper to preview.
   - `applyCouponToMyContract(contractId, code)` — mutation. Wraps coupon helper.
   - `listMyInvoices({ contractId?, limit })` — query.
   - `getInvoicePdf(invoiceId)` — action. Generates PDF (use existing PDF helper or stub with text download).

3. SIGNUP FORM PAGE (/signup/$offerId):
   Layout: two columns
   - Left: offer summary card — title, price, interval, trial badge, features list
   - Right: SignupForm component
     * Logged-out fields: email, password (or "Sign up with Clerk"), full name
     * Payment method input (Stripe Elements or the project's payment provider)
     * Coupon code input with "Apply" button → validates + shows discount
     * Terms checkbox
     * "Start subscription" button
     * Trial disclaimer: "You won't be charged until [trial end date]"
   - On submit:
     a. If logged out, sign up first (Clerk)
     b. Call createCheckoutIntent
     c. Payment processor flow
     d. Call activateFromIntent
     e. Redirect to /dashboard/subscriptions?welcome=1

4. CUSTOMER PORTAL (/dashboard/subscriptions):
   - Header: "My Subscriptions"
   - For each active contract: CustomerPortalCard component
     * Collapsed: offer title, status, next charge, amount
     * Expanded: billing detail, change plan link → ChangePlanFlow, apply coupon input, pause/cancel buttons, payment method summary
   - Section: Invoice History → InvoiceHistoryTable
   - Section: Payment Methods (list + add new) — if payment processor supports client-side management
   - Query hook: getMyActiveContracts

5. ChangePlanFlow component:
   - Modal or inline expansion (prefer inline, full-page flow if too much)
   - Plan picker (available offers)
   - On select: previewPlanChange query → show ProrationPreview (reuse admin component or copy)
   - Upgrade: "Confirm upgrade — you'll be charged $X today"
   - Downgrade: "Confirm downgrade — no charge today, new plan starts [date]"
   - On confirm → requestPlanChange

6. InvoiceHistoryTable: list of paid/past_due/void invoices. Date, amount, status, actions (view, download PDF).

Do NOT:
- Build /pricing route (Wave 6)
- Build <PricingCardsBlock> (Wave 6)
- Deploy
- Remove @ts-nocheck (Wave 7)

Commit frequently.

Report: routes/components created, known stubs (e.g. payment processor integration status).
```

### Task 5.3: Wait, deploy, smoke test

- [ ] **Step 1: Wait for both experts**

- [ ] **Step 2: Deploy via Convex Deployment Expert**

- [ ] **Step 3: Start website dev server + smoke test with Playwright MCP**

```bash
cd ConvexPress-Website/apps/web && bun run dev
```

Test:
- Navigate to a restricted post as logged-out user → verify teaser renders with login CTA
- Log in as non-member → navigate to same post → verify teaser with upgrade CTA
- Navigate to /dashboard/membership → verify empty state
- (Skip /signup/$offerId until /pricing exists in Wave 6 — can hit it directly with a valid offer ID)
- Navigate to /dashboard/subscriptions → verify empty state

- [ ] **Step 4: Mark Wave 5 complete**

---

## Wave 6: Pricing Cards Subsystem

**Goal:** The public pricing page. Admin manages ordering + headline, features auto-surface from linked membership plans. Pricing cards are embeddable as a block.

### Task 6.1: Dispatch Subscriptions Expert for pricing surface

- [ ] **Step 1: Launch background agent**

Task tool, `run_in_background: true`:

```
You are the Commerce Subscriptions System Expert. Read design spec § 7.

WAVE 6 SCOPE — Public pricing surface.

Files to create:
- ConvexPress-Website/apps/web/src/routes/pricing.tsx
- ConvexPress-Website/apps/web/src/components/subscriptions/PricingCardsBlock.tsx
- ConvexPress-Website/apps/web/src/components/subscriptions/PricingCard.tsx
- ConvexPress-Website/apps/web/src/lib/pricingCardRenderer.tsx (shared logic for route + block)

Backend:
- Ensure `commerceSubscriptions:pricingCards.getPricingCardConfig` and `commerceSubscriptions:offers.listOffersForPricing` are both public queries (no auth required).

TASKS:

1. BACKEND AUDIT:
   - Verify `listOffersForPricing()` query exists and returns: offers (active + pricingCardVisible) + resolved features (own features + auto-surfaced membership plan benefits where `displayAsFeature=true`, minus `excludedPlanFeatureIds`)
   - Verify it returns in the same order as `pricing_card_config.orderedOfferIds` (or the helper re-orders client-side)
   - No auth required

2. /pricing ROUTE:
   - Public SSR route
   - Loader fetches getPricingCardConfig + listOffersForPricing
   - Renders:
     * Header section: config.headline + config.subheadline (with sensible defaults if empty)
     * Grid of PricingCard components in configured order
     * Featured card gets `isFeatured` prop
   - Page meta: SEO title/description from config

3. <PricingCard> component:
   Props: `{ offer, isFeatured, featured?: boolean, trial?: number }`
   Visual:
   - Card container with rounded-lg border shadow-sm
   - If isFeatured: ring-2 ring-primary + "Most popular" badge at top
   - Title, price (big number + interval + currency), trial badge if trial
   - Features list: ul with checkmark icons, highlighted features get `font-semibold` + accent color
   - CTA button: "Start free trial" (if offer.trialDays > 0) else "Subscribe"
   - CTA links to /signup/{offer._id}

4. <PricingCardsBlock> component:
   Same renderer as the route but as an embeddable block for the content editor's block system. Can be inserted into any post/page via the editor.

5. RESPONSIVE LAYOUT:
   - Mobile: 1 column
   - Tablet (md): 2 columns
   - Desktop (lg): 3 columns (or 4 if >=4 offers)
   - CSS grid with gap-6

6. DEFAULT-GRID TEMPLATE KEY:
   The current implementation is keyed "default-grid". Future templates plug in by templateKey. For now, just render default-grid regardless of templateKey value (forward compat).

Do NOT:
- Add multiple templates (out of scope)
- Touch /admin/subscriptions/pricing-cards (already Wave 3)
- Deploy

Commit per component.

Report: files created, screenshots if possible, known limitations.
```

### Task 6.2: Dispatch Membership Expert for benefit → feature surfacing helper

- [ ] **Step 1: Launch in parallel**

Task tool, `run_in_background: true`:

```
You are the Membership Plan System Expert. Read design spec § 7.

WAVE 6 SCOPE — Benefit → pricing card feature surfacing.

Files to touch:
- ConvexPress-Admin/packages/backend/convex/membership/queries.ts

TASKS:

1. Add query: `getDisplayableBenefitsForPlan(planId)`:
   - Returns `membership_plan_benefits` rows for planId where `displayAsFeature !== false` (treat absence as true, per Wave 1 schema spec)
   - Shape: `Array<{ _id, label, description?, icon? }>`

2. Add query: `getDisplayableBenefitsForEntitlementCodes(codes: string[])`:
   - For each code, find membership_plans where linkedSubscriptionCode=code
   - For each plan, get displayable benefits
   - Return dedupe by (label) — same label from multiple plans shown once
   - This is used by Subscriptions `listOffersForPricing` to auto-append plan benefits to offer features

3. COORDINATE with Subscriptions Expert: verify `listOffersForPricing` actually calls this query. If not, patch it.

Do NOT: UI work, deploy.

Report: queries added, integration verified.
```

### Task 6.3: Wait, deploy, smoke test

- [ ] **Step 1: Wait for both**
- [ ] **Step 2: Deploy**
- [ ] **Step 3: Smoke test /pricing**

Navigate to `/pricing` on the website. Expected: cards render. Click a card → signup form. Verify features include both offer.features and linked plan benefits.

- [ ] **Step 4: Mark Wave 6 complete**

---

## Wave 7: Advanced Features + Hardening

**Goal:** Real renewal charging, dunning, proration invoices, capability enforcement, access log writes, route+product restriction, `@ts-nocheck` removal.

This is the densest wave. Both experts split into multiple focused tasks.

### Task 7.1: Dispatch Membership Expert for enforcement + advanced restrictions

- [ ] **Step 1: Launch background agent**

Task tool, `run_in_background: true`:

```
You are the Membership Plan System Expert. Read design spec § 3.1 (membership IN scope), § 10 Wave 7, PRD phase 4.

WAVE 7 SCOPE — Enforcement + advanced restriction + hardening.

Files to touch (multiple):
- ConvexPress-Admin/packages/backend/convex/helpers/permissions.ts (integrate membership capabilities)
- ConvexPress-Admin/packages/backend/convex/membership/internals.ts (expireGrants cron handler)
- ConvexPress-Admin/packages/backend/convex/membership/queries.ts (checkAccess writes to log)
- ConvexPress-Admin/packages/backend/convex/crons.ts (register expireMembershipGrants cron)
- ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/membership/* (status displays, upgrade CTAs where relevant)

TASKS:

1. CAPABILITY ENFORCEMENT:
   - In helpers/permissions.ts, extend `currentUserCan(ctx, capability)`:
     * After existing role-based check, if not allowed, check membership-granted capabilities
     * Use `membership/internals.getCapabilitiesForUser(userId)` — returns string[] of capabilities from active plans
     * Cache per-request if possible (Convex query context)
   - Add test: user with plan X that has capability Y passes currentUserCan(ctx, Y)

2. ACCESS LOG WRITES:
   - `checkAccess` currently returns allowed/denied but may not write log entries reliably
   - Wrap the write path: after evaluation, if setting `membership.logAccessChecks=true`, write a row to membership_access_log
   - Write: userId (null if logged out), resourceType, resourceIdOrKey, allowed, ruleId, timestamp
   - Respect retention: separate internal mutation `trimAccessLog` deletes rows older than `accessLogRetentionDays` — schedule a weekly cron

3. EXPIRE CRON:
   - In `convex/crons.ts`, register:
     ```ts
     crons.daily("expire-membership-grants", { hourUTC: 2, minuteUTC: 0 }, internal.membership.internals.expireGrants);
     crons.weekly("trim-membership-access-log", { hourUTC: 2, minuteUTC: 30, dayOfWeek: "sunday" }, internal.membership.internals.trimAccessLog);
     ```
   - Implement `expireGrants`:
     * Find grants where expiresAt < now and status=active → set status=expired
     * Find grants where status=grace and expiresAt < now → set status=expired
     * Handle batching (use .take() + recursion if > 1000 grants)

4. ROUTE-LEVEL RESTRICTION:
   - Ensure the restriction rule resourceType `route` works end-to-end:
     * Admin: restriction rule builder has the "Route" type + free-text input (already in Wave 3)
     * Website: add a route matcher that applies on SSR navigation — check any rule with resourceType=route and resourceIdOrKey matching current pathname pattern
     * Coordinate location: add to ConvexPress-Website TanStack Start root loader or a layout loader — read design spec § 6.1 content loader pattern

5. PRODUCT-LEVEL RESTRICTION:
   - For commerce products: product route loader in ConvexPress-Website should call checkAccess(type="product", idOrKey=productId)
   - Denied → render teaser OR hide "buy" button + show upgrade message
   - If no commerce product routes exist yet (depends on other systems), add the hooks for when they do; otherwise implement for existing product routes

6. UPGRADE PROMPTS:
   - In dashboard/membership: if a plan allows upgrade (higher priority plan exists), show UpgradeCTA
   - In RestrictedContent: UpgradeCTA links to specific offer if rule.plans[0] has a linked offer; else /pricing

Do NOT: deploy, touch subscriptions internals.

Commit frequently with focused messages.

Report: files touched, any coupled changes needed in subscriptions.
```

### Task 7.2: Dispatch Subscriptions Expert for renewal + dunning + proration + @ts-nocheck removal

- [ ] **Step 1: Launch in parallel**

Task tool, `run_in_background: true`:

```
You are the Commerce Subscriptions System Expert. Read design spec § 8 (proration), PRD § 10 (renewal + dunning), design § 10 Wave 7.

WAVE 7 SCOPE — Real billing, dunning, proration invoices, @ts-nocheck removal.

Files to create or modify:
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/renewal.ts (new module)
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/dunning.ts (new module)
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/proration.ts (new module)
- ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/internals.ts (wire)
- ConvexPress-Admin/packages/backend/convex/crons.ts (register)
- All files under ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/ — REMOVE @ts-nocheck, fix resulting type errors

TASKS:

1. REAL RENEWAL CHARGING (renewal.ts):
   - `runRenewalSweep()` internal action — called by cron hourly. Finds contracts where `currentPeriodEnd <= now AND status=active`.
   - For each:
     a. Generate renewal invoice via existing generateInvoice logic (extend to handle coupon discounts via coupons helper)
     b. Attempt charge via payment processor (use existing payments integration). Integration point: call helpers/payments.ts if exists, else stub with `processorStub.charge(invoice, paymentMethodId)`
     c. On success: mark invoice paid, transition contract period (currentPeriodStart = currentPeriodEnd, currentPeriodEnd = currentPeriodEnd + cycle), fire bridge via syncEntitlementsForStatus (no-op for active → active but ensures consistency)
     d. On failure: mark invoice past_due, transition contract to past_due (fires bridge → grant in grace), enqueue dunning retry
     e. If scheduledOfferChange present and effectiveAt <= now: apply change — update currentOfferId, clear scheduledOfferChange, push to offerHistory

2. DUNNING (dunning.ts):
   - `runDunningSweep()` internal action — hourly cron. For past_due contracts where it's time to retry:
     a. Find contract.retrySchedule (from template or settings — e.g. [1day, 3days, 7days, 14days])
     b. If max retries exhausted: transition to cancelled (fires bridge → revoked)
     c. Else retry charge; update dunning_attempts row
   - Admin dunning page (/admin/subscriptions/dunning already Wave 3) pulls from this

3. PRORATION APPLICATION (proration.ts):
   - `applyUpgradeProration(contractId, toOfferId)` internal mutation:
     * Block if contract.status in [past_due, paused, draft]
     * Compute proration via helpers/proration.ts
     * Apply discounts from active coupon_redemptions
     * Apply tax at current rate
     * Create proration_event row
     * Create invoice with single line item + proration_event reference
     * Charge payment method (use payment processor integration)
     * On success: transition contract to new offer, new cycle starts now, append offerHistory
     * Return invoice ID + success status
   - `applyDowngradeProration(contractId, toOfferId)` internal mutation:
     * Just sets scheduledOfferChange; no invoice
     * Customer portal already surfaces this (Wave 5)

4. WIRE ContractActions UPGRADE/DOWNGRADE to real proration:
   - Admin /admin/subscriptions/contracts/$contractId ContractActions → upgrade flow now calls applyUpgradeProration (was placeholder in Wave 3)
   - Customer portal requestPlanChange → same

5. CRON REGISTRATION:
   - In convex/crons.ts, register:
     ```ts
     crons.hourly("subscription-renewals", {}, internal.commerceSubscriptions.renewal.runRenewalSweep);
     crons.hourly("subscription-dunning", { minuteUTC: 15 }, internal.commerceSubscriptions.dunning.runDunningSweep);
     crons.daily("subscription-expire-pending-cancel", { hourUTC: 3 }, internal.commerceSubscriptions.internals.expirePendingCancellations);
     ```

6. @ts-nocheck REMOVAL:
   - For every file under `commerceSubscriptions/` containing `@ts-nocheck`: remove the marker, fix resulting type errors. Expect many small fixes — usually missing types on function args or loose `any` usage.
   - Verify `bun run build` (or tsc --noEmit) passes cleanly across the subscriptions module.
   - If any file has genuinely hard-to-fix types, document why and apply a scoped `// @ts-expect-error [reason]` on the specific line — not file-wide nocheck.

7. INTEGRATION TESTS (commerceSubscriptions/__tests__/):
   - `proration.test.ts` (if not already): upgrade math correct, downgrade queues, past_due blocks, coupon applied to prorated amount, tax applied correctly
   - `lifecycle.test.ts`: full contract lifecycle draft → trialing → active → renewal → past_due → recovery → cancelled, with bridge firing at each transition
   - `coupons.test.ts`: redemption, duration once / n_months / forever, discount on invoice, perCustomerLimit

Do NOT: deploy, touch UI except wiring ContractActions to real mutations.

Commit per file-group. Large commit messages OK for @ts-nocheck passes ("chore: remove @ts-nocheck from commerceSubscriptions, fix type errors").

Report: files touched, type error count before/after, test results.
```

### Task 7.3: Wait, deploy, full test suite

- [ ] **Step 1: Wait for both experts**

- [ ] **Step 2: Run typecheck locally**

```bash
cd ConvexPress-Admin && bun run typecheck
```

Expected: clean pass (or documented @ts-expect-error exceptions).

- [ ] **Step 3: Deploy with typecheck ENABLED**

Task tool, Convex Deployment Expert:

```
Wave 7 deploy with full typecheck.

cd ConvexPress-Admin
bunx convex deploy

(No --typecheck=disable this time — production-quality deploy.)

If typecheck fails, report exact errors and stop.
```

- [ ] **Step 4: Run full test suite**

```bash
cd ConvexPress-Admin/packages/backend && bun test
```

Expected: all tests green.

- [ ] **Step 5: Mark Wave 7 complete**

Post: "Wave 7 complete. Real billing live. Moving to Wave 8 (acceptance)."

---

## Wave 8: QA + Acceptance

**Goal:** Run every acceptance criterion from design spec §12. Fix gaps. Declare production ready.

### Task 8.1: Run Membership acceptance checklist

**Reference:** Design spec §12.1

- [ ] **Step 1: Plan CRUD + realtime updates**

Manual test:
- Create a plan via /admin/membership/plans/new
- Verify appears in list in website dashboard in same tab immediately (realtime reactive)
- Update the plan title
- Verify the change propagates to a second tab within 2s

Result: pass / fail

- [ ] **Step 2: Manual grant/revoke**

Via admin, grant plan X to user Y. Verify:
- user Y's /dashboard/membership shows the plan
- Revoking flips back to empty state

- [ ] **Step 3: Restriction rules — all three teaser modes**

Create 3 pages, restrict each with a different teaser mode (hide / excerpt / custom_message). Log out and visit each. Verify:
- hide: only CTA, no content
- excerpt: partial content + fade + CTA
- custom_message: rule's custom text + CTA

- [ ] **Step 4: Post/Page metabox creates scoped rule**

In post editor, set Visibility → Restricted. Save. Verify row appears in /admin/membership/restrictions with resourceType=post, resourceIdOrKey=postId.

- [ ] **Step 5: Logged-out vs logged-in-non-member CTAs**

Visit a restricted page while logged out → Login CTA appears.
Visit same page logged in as user without plan → Upgrade CTA appears.

- [ ] **Step 6: Access log writes + retention**

Enable access logging in settings. Visit 5 restricted pages. Verify 5 rows in membership_access_log via function runner. Set retention to 1 day. Wait for weekly cron (or manually invoke `internals.trimAccessLog`) — verify old rows deleted.

- [ ] **Step 7: Expire cron**

Manually invoke `internals.expireGrants` on a grant with expiresAt in the past. Verify status → expired.

- [ ] **Step 8: Capability mapping**

Grant a plan that maps to capability `foo`. Verify `currentUserCan(ctx, "foo")` returns true for that user (test via function runner or admin action).

- [ ] **Step 9: Bridge grants on active transition**

Create a subscription offer with entitlementCode = "bridge-qa". Create a matching plan with linkedSubscriptionCode = "bridge-qa". Sign up a user → subscription goes active → verify membership grant appears in /admin/membership/grants.

- [ ] **Step 10: Bridge grace on past_due**

Force the subscription into past_due status (via admin or simulate failed payment). Verify grant status → grace.

- [ ] **Step 11: Bridge revoke on cancel**

Cancel subscription → verify grant → revoked.

- [ ] **Step 12: Route + product restriction**

Restrict a route pattern `/premium/*`. Visit `/premium/anything` as non-member → teaser.
Restrict a specific product. Visit product page as non-member → buy button hidden + upgrade CTA.

- [ ] **Step 13: Plugin gate off = all disabled**

Disable membership plugin in settings. Verify:
- Admin membership routes show "plugin disabled" message
- Website restricted pages render as public
- checkAccess returns allowed=true always

- [ ] **Step 14: Log any failures + dispatch fixes**

For each failed criterion, dispatch the responsible expert with a targeted fix task. Re-run.

### Task 8.2: Run Subscriptions acceptance checklist

**Reference:** Design spec §12.2

- [ ] **Step 1: Template → offer → /pricing flow**

Create template → create offer from it → verify offer appears on /pricing in configured order.

- [ ] **Step 2: /signup/$offerId end-to-end**

Visit signup for a trial offer. Complete form (use Stripe test card 4242 or equivalent). Verify:
- Contract created in trialing status
- Membership grant fired (if linked plan)
- Redirect to /dashboard/subscriptions?welcome=1

- [ ] **Step 3: Full status lifecycle**

Via admin, drive one contract through every status transition. Verify each transition:
- draft → trialing (on activate)
- trialing → active (on trial end)
- active → past_due (on failed renewal)
- past_due → active (on successful retry)
- active → paused (on pause request)
- paused → active (on resume)
- active → pending_cancel (on cancel at period end)
- pending_cancel → cancelled (on period end cron)
- active → cancelled (on cancel immediate)

At each step, verify membership grant mirrors correctly.

- [ ] **Step 4: Renewal cron generates + charges invoices**

Advance a contract's currentPeriodEnd to 1 minute ago. Invoke `internals.runRenewalSweep` manually. Verify:
- Invoice created
- Payment attempted
- If success: contract period advanced, status active
- If fail: contract → past_due, dunning attempt recorded

- [ ] **Step 5: Dunning retries + final cancel**

Force 4 consecutive failed renewal charges. Verify:
- Each retry on schedule
- Final failure → contract → cancelled

- [ ] **Step 6: Customer portal — every action**

As a subscribed customer, test in /dashboard/subscriptions:
- View billing detail
- Upgrade plan → preview shows correct proration → confirm → invoice created + charged
- Downgrade → preview shows $0 today → confirm → scheduledOfferChange set; verify applies on next renewal
- Pause → status goes paused
- Cancel at period end → status pending_cancel
- Change payment method → processor flow
- View invoice history + download PDF

- [ ] **Step 7: Coupons — all three duration types**

Create 3 coupons: once, n_months=3, forever. Apply each to separate contracts. Run renewals. Verify:
- once: only first renewal discounted
- n_months=3: first 3 renewals discounted, 4th full price
- forever: every renewal discounted

- [ ] **Step 8: Proration math correctness**

Create contract at $29/mo. Upgrade at day 15 of 30 to $59/mo. Verify:
- unused = (15/30) × 29 = 14.50
- prorated new = (15/30) × 59 = 29.50
- net = 15.00
- Invoice created for $15.00 + tax
- On success, cycle resets from upgrade date

Downgrade from $59 to $29 at day 15. Verify:
- Net = 0 today (no invoice)
- scheduledOfferChange set for cycle end
- Customer portal shows "Downgrade to $29 on [date]"

- [ ] **Step 9: Pricing card auto-population**

Create an offer linked to a plan. Add benefits to the plan with displayAsFeature=true. Save. Verify /pricing card shows plan benefits + offer features.

- [ ] **Step 10: Bridge fires on every status**

Inspect membership_access_log for grant_created/grant_refreshed/grant_revoked events matching each status transition.

- [ ] **Step 11: @ts-nocheck removed**

```bash
grep -r "@ts-nocheck" ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/
```

Expected: no results.

- [ ] **Step 12: Integration test suite green**

```bash
cd ConvexPress-Admin/packages/backend && bun test
```

Expected: all pass.

- [ ] **Step 13: Plugin gate off = all disabled**

Disable commerceSubscriptions plugin. Verify /pricing returns "unavailable", signup routes 404 / redirect, portal shows disabled state.

- [ ] **Step 14: Log any failures + dispatch fixes**

### Task 8.3: Run Combined acceptance

**Reference:** Design spec §12.3

- [ ] **Step 1: Independent plugin toggling**

- Enable membership + disable subscriptions → manual grants work, /pricing shows unavailable
- Disable membership + enable subscriptions → billing works, no grants fired
- Both enabled → full integration

- [ ] **Step 2: Full E2E flow against clean DB**

Reset to a clean site. Create template, 2 offers, 2 plans. Sign up a new user via /signup. Verify:
- Account created
- Trial subscription active
- Membership grant active
- User can access restricted content
- Cancel subscription → grant revoked → content restricted again

- [ ] **Step 3: Both experts exist**

```bash
ls .claude/docs/MEMBERSHIP-PLAN-SYSTEM.md .claude/docs/COMMERCE-SUBSCRIPTIONS-SYSTEM.md
ls .claude/commands/experts/membership-plan-system.md .claude/commands/experts/commerce-subscriptions-system.md
```

Expected: all four files exist.

- [ ] **Step 4: CLAUDE.md registry updated**

Grep CLAUDE.md for "membership-plan-system" and "commerce-subscriptions-system" — must appear in both the expert registry and dispatch quick reference.

### Task 8.4: Final acceptance sign-off

- [ ] **Step 1: Compile acceptance report**

Write a short report at `docs/superpowers/reports/2026-04-21-membership-subscriptions-acceptance.md`:
- All 12.1, 12.2, 12.3 criteria with pass/fail
- Known limitations
- Deploy notes

- [ ] **Step 2: Final production deploy (with typecheck)**

```bash
cd ConvexPress-Admin && bunx convex deploy
```

Expected: clean deploy.

- [ ] **Step 3: Mark project complete**

Post: "Membership + Commerce Subscriptions production ready. All 8 waves delivered."

---

## Appendix A: Expert Dispatch Template

For any wave's expert dispatch:

```
You are the [Expert Name] Expert. Read:
- Knowledge doc: [path]
- PRD: [path]
- Design spec: [path] (§[relevant section])
- Previous wave reports if applicable

WAVE [N] SCOPE: [one-sentence scope statement]

Files to touch: [list]
Files to create: [list]

TASKS:
[numbered list with code examples, exact paths, exact mutation/query names]

DO NOT:
- [explicit out-of-scope items]
- Deploy (Convex Deployment Expert does that after this wave)

Commit frequently. Verify build passes before reporting complete.

Report: [what to report back]
```

## Appendix B: Convex Deployment Expert Dispatch Template

```
Deploy Wave [N] changes.

Context: [what this wave added]

Commands:
1. cd ConvexPress-Admin
2. bunx convex deploy [--typecheck=disable if appropriate to the wave]
3. Verify dashboard shows expected changes

If deploy fails: report exact error and STOP. Do not attempt to fix schemas or functions.
```

## Appendix C: Rollback Plan

If any wave breaks production:

1. Identify the commit(s) introducing the break (git log).
2. Revert the commits: `git revert <sha>...` — NEVER `git reset` shared history.
3. Re-deploy immediately: `bunx convex deploy --typecheck=disable`.
4. Investigate root cause. Re-dispatch the responsible expert with explicit fix instructions.
5. Re-run the relevant wave's acceptance tasks.

Risk concentration is Wave 4 (bridge) and Wave 7 (@ts-nocheck removal + real billing). Extra caution there.

## Appendix D: Settings Required

Ensure these exist in the central settings:
- `membershipEnabled: boolean` (plugin gate)
- `membership.logAccessChecks: boolean`
- `membership.accessLogRetentionDays: number` (default 30)
- `membership.acceptSubscriptionGrants: boolean` (default true)
- `commerceSubscriptionsEnabled: boolean` (plugin gate)
- `commerceSubscriptions.dunning.retrySchedule: number[]` (default [1, 3, 7, 14] days)
- `commerceSubscriptions.prorationModel: "woo" | "stripe" | "none"` (default "woo")
- `commerceSubscriptions.paymentProcessor: "stripe" | "..."` + credentials

Verify during Wave 1 if not already.
