# Membership & Commerce Subscriptions — Parallel Completion Design

**Date:** 2026-04-21
**Status:** Design (pre-implementation)
**Scope:** Two independent systems, completed in parallel to production-ready quality
**PRDs:** `.codex/docs/MEMBERSHIP-PLUGIN-PRD.md`, `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-PRD.md`
**Checklists:** `.codex/docs/MEMBERSHIP-PLUGIN-IMPLEMENTATION-CHECKLIST.md`, `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-IMPLEMENTATION-CHECKLIST.md`

---

## 1. Purpose

Bring the Membership Plan System (currently ~35% complete) and the Commerce Subscriptions System (currently ~40% complete) to a 9–10/10 production-ready state. The two systems are independent but tightly integrated: subscription lifecycle events drive membership grants. This document captures the combined architecture, the cross-system contract, the full scope of changes, and the execution sequence for finishing both in parallel.

This design does **not** replace the existing PRDs. It ratifies the scope, names the integration seam, captures additive requirements (pricing cards, coupons, proration), and defines the parallel-execution sequence and acceptance criteria.

## 2. Architectural principles

### 2.1 Two plugins, one database, one seam

Membership and Subscriptions remain independent plugins. Each has:

- Its own schema namespace: `membership_*` / `commerce_subscription_*`
- Its own plugin gate setting: `membershipEnabled` / `commerceSubscriptionsEnabled`
- Its own admin route tree: `/admin/membership/*` / `/admin/subscriptions/*`
- Its own PRD + implementation checklist
- Its own expert + knowledge doc

Either can run standalone. Membership-only = manual grants. Subscriptions-only = billing with no content gating. Together = integrated SaaS-style access.

### 2.2 The bridge — three touchpoints

The entire integration surface is three touchpoints. No shared tables. No circular imports.

```
        Subscriptions                      Membership
        ─────────────                      ──────────
  commerce_subscription_offers        membership_plans
        entitlementCodes[]    ◄─ match ─►  linkedSubscriptionCode

  syncEntitlementsForStatus     ─ call ─►  grantFromSubscription
   (status transition engine)             revokeFromSubscription

  subscription.status           ─ mirror ─►  grant.status
   (active/past_due/cancelled)              (active/grace/revoked)
```

**Touchpoint 1 — Data contract.** Offers carry an `entitlementCodes[]` array. Membership plans carry a `linkedSubscriptionCode` string. A string match = the plan is unlockable by that offer.

**Touchpoint 2 — Status-driven call.** `commerceSubscriptions/internals.syncEntitlementsForStatus` is the only place the bridge is invoked. On every subscription status transition it looks up plans whose `linkedSubscriptionCode` matches any of the offer's entitlement codes, and calls `membership/internals.grantFromSubscription` or `revokeFromSubscription`.

**Touchpoint 3 — Pricing card cross-pollination.** When an offer links to a membership plan, the plan's benefits (marked `displayAsFeature`) surface on the pricing card automatically. Authors can extend or override per offer.

### 2.3 Status mirror

| Subscription status | Grant status |
|---------------------|--------------|
| `trialing` | `active` |
| `active` | `active` |
| `past_due` | `grace` |
| `paused` | `grace` |
| `pending_cancel` | `active` (until period end) |
| `cancelled` | `revoked` |
| `expired` | `expired` |

## 3. Scope

### 3.1 IN scope

**Membership** — full PRD, all 4 phases:
1. Plugin foundation, schema, plan CRUD, manual grants (mostly done)
2. Restriction rules for pages/posts + website evaluation + restricted-content UX
3. Subscription entitlement bridge + member account surfaces + richer plan benefits
4. Route-level + product-level restriction + upgrade flows

**Subscriptions** — full PRD, all 10 phases:
- Phase 0 stabilize (partial) → complete
- Phase 1 schema + models
- Phase 2 offers/templates CRUD
- Phase 3 direct-order signup forms (SaaS acquisition)
- Phase 4 activation engine
- Phase 5 renewal + dunning
- Phase 6 customer portal
- Phase 7 admin ops UI
- Phase 8 membership + entitlements bridge
- Phase 9 verification
- Phase 10 rollout

**Additions beyond PRD:**
- Features on offers (pricing card content lives on the offer itself)
- Pricing Cards admin page (ordering, featured, headline)
- `/pricing` public route with one solid default template
- Pricing card embeddable block
- Coupon system (codes, duration, offer-applicability, redemption tracking)
- Proration engine for mid-cycle upgrades (Woo Subscriptions model)
- Two new experts + knowledge docs

### 3.2 OUT of scope (explicit descopes)

- **One-time purchase grants.** Membership is subscription-only. `grantMode: "purchase" | "hybrid"` remains in schema but has no wiring or UI this pass. Reintroduce later if a use case emerges.
- **Multi-currency pricing on offers.** Defer. Single currency per offer.
- **Pricing card template library.** Ship with one "default-grid" template. Template key on config lets us add more later without breaking changes.
- **Per-card color theming.** Defer.
- **Public pricing page site-specific customization.** The `/pricing` route rendering is driven by data, not per-site theming.

## 4. Data model changes

### 4.1 Membership (no new tables)

`membership_plan_benefits`
- **+** `displayAsFeature: boolean` (default `true`) — surface on pricing cards when plan linked to offer

`membership_grants`
- Ensure `source` object captures subscription contract ID + entitlement code for audit
- **+** `metadata: v.optional(v.any())` — bridge context (e.g. which entitlement code triggered the grant)

### 4.2 Subscriptions (4 new tables + field additions)

**New: `commerce_subscription_coupons`**
```
code: string (unique)
discountType: "percent" | "fixed"
amount: number
duration: "once" | "forever" | "n_months"
durationMonths?: number
maxRedemptions?: number
perCustomerLimit?: number
offerIds?: Id<"commerce_subscription_offers">[]  // empty = applies to all
startsAt?: number
expiresAt?: number
status: "active" | "paused" | "archived"
```

**New: `commerce_subscription_coupon_redemptions`**
```
contractId: Id<"commerce_subscription_contracts">
couponId: Id<"commerce_subscription_coupons">
redeemedAt: number
remainingApplications: number  // decrements each time applied to an invoice
```

**New: `commerce_subscription_proration_events`**
```
contractId: Id<"commerce_subscription_contracts">
fromOfferId: Id<"commerce_subscription_offers">
toOfferId: Id<"commerce_subscription_offers">
daysRemaining: number
daysInCycle: number
unusedOldAmount: number
proratedNewAmount: number
netCharge: number
invoiceId?: Id<"commerce_subscription_invoices">
triggeredBy: Id<"users">
triggeredAt: number
```

**New: `commerce_subscription_pricing_card_config`** (singleton — one active row)
```
orderedOfferIds: Id<"commerce_subscription_offers">[]
headline?: string
subheadline?: string
featuredOfferId?: Id<"commerce_subscription_offers">
templateKey: string  // default "default-grid"
updatedAt: number
updatedBy: Id<"users">
```

**Field additions:**

`commerce_subscription_offers`
- **+** `features: v.array(v.object({ text: v.string(), highlighted: v.optional(v.boolean()), icon: v.optional(v.string()) }))`
- **+** `pricingCardVisible: boolean` (default `true`)

`commerce_subscription_contracts`
- **+** `offerHistory: v.array(v.object({ offerId: v.id(...), effectiveAt: v.number(), reason: v.string() }))`
- **+** `scheduledOfferChange: v.optional(v.object({ toOfferId: v.id(...), effectiveAt: v.number() }))` — for queued downgrades

`commerce_subscription_invoices`
- **+** `prorationEventId: v.optional(v.id("commerce_subscription_proration_events"))`

## 5. Admin UX

### 5.1 Membership admin

| Route | State | Notes |
|-------|-------|-------|
| `/admin/membership` | ✅ exists | Dashboard with stats; keep |
| `/admin/membership/plans` | ✅ exists | Plan list; keep |
| `/admin/membership/plans/new` | Build | Full-page new plan form |
| `/admin/membership/plans/$planId/edit` | Build | Full-page edit with tabs: Basics, Benefits, Capabilities, Subscription Link |
| `/admin/membership/grants` | Build | Replace stub. List table: search, filter by plan/status, bulk revoke |
| `/admin/membership/grants/new` | Build | User picker, plan picker, expires-at, reason, notes |
| `/admin/membership/grants/$grantId` | Build | Detail with history timeline + linked subscription contract |
| `/admin/membership/restrictions` | Build | Replace stub. List table: filter by resource type + plan |
| `/admin/membership/restrictions/new` | Build | Rule builder: resource picker (page/post/route/product/block) + plan multi-select + teaser mode + custom message + login-required |
| `/admin/membership/restrictions/$ruleId/edit` | Build | Edit rule |
| `/admin/membership/settings` | ✅ exists, extend | Add: capability mapping UI, access-log retention setting, bridge-enabled toggle (if off, subscription status transitions do not grant/revoke memberships) |

**Post/Page editor metabox** — right-side panel on `/admin/posts/$postId/edit` and `/admin/pages/$pageId/edit`:
- Visibility radio: Public / Restricted
- If Restricted: plan multi-select, teaser mode, custom message, login-required
- Saves via mutation that creates/updates a `membership_restriction_rules` row scoped to this resource

### 5.2 Subscriptions admin

| Route | State | Notes |
|-------|-------|-------|
| `/admin/subscriptions` | Verify | Dashboard: MRR, status counts, renewal volume this week, attention queue |
| `/admin/subscriptions/templates` | Build | Template CRUD |
| `/admin/subscriptions/offers` | Build | List table: filter by template/status/price |
| `/admin/subscriptions/offers/new` + `/edit` | Build | Full-page with sections: Basics, Features repeater, Entitlements, Linked Membership Plans (read-only lookup) |
| `/admin/subscriptions/pricing-cards` | Build | Drag-to-reorder, featured flag, headline, subheadline, live preview |
| `/admin/subscriptions/coupons` | Build | List + CRUD with duration rules + offer filter |
| `/admin/subscriptions/contracts` | Build | List + detail with customer, current offer, offer history, invoices, entitlements, dunning history, action buttons |
| `/admin/subscriptions/invoices` | Build | List + detail with manual collection retry |
| `/admin/subscriptions/dunning` | Build | Queue of past_due contracts: retry count, next retry, actions |
| `/admin/subscriptions/settings` | Verify/extend | Billing defaults, dunning retry schedule, proration model (Woo default), payment processor credentials reference |

**Contract detail actions:**
- Pause / Resume
- Cancel immediately / Cancel at period end
- Upgrade / Downgrade (with proration preview)
- Apply coupon
- Retry payment
- Change payment method
- Manually grant/revoke related membership (escape hatch)

**All list tables** follow Admin List Table UI Expert patterns: bulk actions, filters, pagination, search. All edit screens are full-page (no modals for content management).

## 6. Website UX

### 6.1 Membership

- **`/dashboard/membership`** — replace stub:
  - Current plan(s) card: name, status, renewal date, Manage-Subscription deep-link
  - Benefits list (pulled from `membership_plan_benefits`)
  - Upgrade CTAs if applicable (matched from available offers)
  - Recent access history (optional, behind setting)

- **`<RestrictedContent>` wrapper component** (Website Dashboard UI + Website Blog UI experts):
  - Three modes: `hide`, `excerpt`, `custom_message`
  - Logged-out: "Log in to continue" CTA → `/login`
  - Logged-in non-member: "Upgrade to unlock" CTA → `/pricing` or specific offer deep-link

- **Content loader enforcement:**
  - TanStack Start route loaders (`beforeLoad` / `loader`) for posts, pages, and custom resources call `checkAccess`
  - Denied → loader returns the restriction rule + teaser mode; route renders `<RestrictedContent>` in the appropriate mode instead of the full content
  - SSR-safe: access check runs server-side, so SEO sees the teaser, not the protected content

### 6.2 Subscriptions

- **`/pricing`** — public pricing page, renders cards from `pricing_card_config` + offers + features. Card CTA click → `/signup/$offerId`.

- **`/signup/$offerId`** — direct-order signup form (PRD Phase 3):
  - Left: offer summary card with price, interval, features, trial disclaimer
  - Right: email/password or Clerk auth + payment method + coupon code field + "Start subscription"
  - Logged-in variant skips account creation
  - On submit: `createCheckoutIntent` → payment processor → `activateFromIntent` → redirect to `/dashboard/subscriptions?justStarted=1`

- **`/dashboard/subscriptions`** — customer portal, replace stub:
  - Active contracts list, each expandable with:
    - Billing detail (next charge, amount, payment method)
    - Change plan (upgrade flow with proration preview, downgrade flow queuing for renewal)
    - Apply coupon
    - Pause / Cancel at period end / Cancel immediately
    - Payment method management
  - Invoice history table with PDF download
  - Payment method list

- **`<PricingCardsBlock>`** — embeddable block for dropping pricing cards into any page via editor.

## 7. Pricing cards subsystem

### 7.1 Data flow

```
pricing_card_config (singleton)
  └─ orderedOfferIds[]
       └─ offers (title, price, interval, trial, features[])
            └─ entitlementCodes[]
                 └─ linked membership plans (where linkedSubscriptionCode matches)
                      └─ plan benefits where displayAsFeature=true
                           └─ appended to card features automatically (author can override)
```

Author edits features on the **offer** page. Benefits with `displayAsFeature=true` from linked membership plans append below. Author can remove plan-sourced features per-offer if desired (stored as an exclusion list on the offer).

### 7.2 Rendering

Default `"default-grid"` template:
- Responsive grid: 1 col mobile / 2 col tablet / 3–4 col desktop
- Featured card: ring + shadow emphasis + "Most popular" badge
- Per-card CTA: "Start free trial" (offer has trial) or "Subscribe" (no trial)
- CTA deep-links to `/signup/$offerId`

Template key on config enables future alternate templates without breaking changes. One template only this pass.

## 8. Proration — WooCommerce Subscriptions model

### 8.1 Formula

```
daysRemaining      = secondsUntil(cycleEnd) / secondsPerDay
daysInCycle        = secondsPerCycle / secondsPerDay
unusedOldAmount    = (daysRemaining / daysInCycle) × oldOfferPrice
proratedNewAmount  = (daysRemaining / daysInCycle) × newOfferPrice
netCharge          = proratedNewAmount − unusedOldAmount
```

### 8.2 Rules

- **Upgrade (netCharge > 0):** Create proration invoice immediately. Charge payment method. On payment success: transition contract to new offer, set new `currentPeriodStart = now`, `currentPeriodEnd = now + newCycle`. Log `proration_event`.
- **Downgrade (netCharge ≤ 0):** No immediate refund. Set `scheduledOfferChange = { toOfferId, effectiveAt: currentPeriodEnd }`. On next renewal, apply change as part of renewal invoice. Customer portal shows "Downgrade to X on [date]".
- **Discounts:** Apply at the same rate to the prorated amount.
- **Tax:** Computed on the prorated amount at the current tax rate.
- **Rounding:** 2 decimal places, half-up (Woo Subs default).
- **Trial time:** Ignored — cannot upgrade/downgrade during trial (upgrade ends trial, full billing starts).
- **Audit:** Every proration event writes a `commerce_subscription_proration_events` row. Invoice references the event.

### 8.3 Edge cases

- **past_due contract upgrade:** Block. Must resolve dunning first.
- **paused contract upgrade:** Resume first, then upgrade.
- **Multiple upgrades in same cycle:** Each upgrade creates its own proration event; prior unused amount is based on most recent offer + cycle reset.
- **Multiple scheduled downgrades:** Later overwrites earlier.

## 9. Coupon subsystem

### 9.1 Applicability

- Signup form: customer enters code, validates, applies to the newly created contract
- Customer portal: authenticated user enters code on an existing contract
- Admin contract edit: operator applies code manually

### 9.2 Validation

- Code exists
- Coupon is `status: active`
- `now >= startsAt && now <= expiresAt` (if set)
- `maxRedemptions` not exceeded globally
- `perCustomerLimit` not exceeded for this customer
- `offerIds[]` either empty or includes the target offer

### 9.3 Invoicing

- Discount appears as a line item on each invoice for the coupon's duration:
  - `"once"`: applied to the first invoice after redemption
  - `"n_months"`: applied to N consecutive renewal invoices
  - `"forever"`: applied to every renewal invoice while contract is active
- `remainingApplications` on `coupon_redemptions` decrements each invoice
- Discount is computed **before** tax, after any plan-level modifiers

## 10. Execution plan

### 10.1 Parallel waves

Two experts ship in parallel. Each wave is a coherent unit. After each wave, the **Convex Deployment Expert** deploys. Experts never deploy themselves. Between waves, `npx convex deploy --typecheck=disable` is acceptable; final production deploys with full typecheck.

| Wave | Membership Expert | Subscriptions Expert |
|------|-------------------|----------------------|
| **1. Schema** | Add `displayAsFeature` on benefits, extend grant metadata | Add 4 new tables, new fields on offers/contracts/invoices |
| **2. Backend domain** | Extend CRUD, audit query perf | Offer CRUD, template CRUD, coupon CRUD, pricing card config mutations, proration computation helper |
| **3. Admin CRUD UIs** | Grants list+detail+new, Restrictions list+builder+edit, Post/Page metabox | Offers (features repeater), Templates, Coupons, Pricing Cards (drag-reorder + preview) |
| **4. Bridge wiring** | `grantFromSubscription`/`revokeFromSubscription` hardening, integration tests | `syncEntitlementsForStatus` calls bridge + integration tests |
| **5. Acquisition + portal** | Member dashboard, `<RestrictedContent>` wrapper, content loader enforcement | Direct-order signup form, checkout intent flow, customer portal (expandable cards + actions) |
| **6. Pricing cards** | Benefit → feature surfacing helper | Pricing Cards admin + `/pricing` route + `<PricingCardsBlock>` embed |
| **7. Advanced + hardening** | Capability enforcement, access log writes, expire cron, route-level + product-level restriction, upgrade prompts | Real renewal charging via payment processor, dunning admin UI + retry logic, proration invoice generation + payment integration (Wave 2 helper + Wave 5 UI wired to real payment flow), `@ts-nocheck` removal |
| **8. QA + acceptance** | Run acceptance criteria, fix gaps | Run acceptance criteria, fix gaps |

### 10.2 Orchestration

Experts dispatched via Task tool with `subagent_type: "general-purpose"` and `run_in_background: true`. Each gets:

1. System name and wave scope
2. Relevant file paths (from schema, system directory, routes)
3. PRD location (`.codex/docs/`)
4. Knowledge doc location (`.claude/docs/`)
5. Explicit instruction: write code only, do not deploy

After both experts report wave-complete, orchestrator dispatches Convex Deployment Expert for the deploy, then moves to next wave.

### 10.3 Dependencies between waves

- Wave 2 needs Wave 1 (schema before CRUD)
- Wave 3 needs Wave 2 (CRUD before UI)
- Wave 4 needs Wave 2 (bridge needs offer CRUD to create test data)
- Wave 5 needs Wave 4 (activation flow needs bridge wired)
- Wave 6 can run parallel with Wave 5 (pricing cards use data from Wave 2–3)
- Wave 7 proration needs Wave 5 (portal upgrade flow drives it)
- Wave 8 needs everything prior

## 11. Expert creation

### 11.1 Two new experts

**`/experts:membership-plan-system`**
- Knowledge doc: `.claude/docs/MEMBERSHIP-PLAN-SYSTEM.md`
- Slash command: `.claude/commands/experts/membership-plan-system.md`

**`/experts:commerce-subscriptions-system`**
- Knowledge doc: `.claude/docs/COMMERCE-SUBSCRIPTIONS-SYSTEM.md`
- Slash command: `.claude/commands/experts/commerce-subscriptions-system.md`

**CLAUDE.md update:** append both new experts to the Backend System Experts table (brings the backend expert count to 32) and update the registry totals at the top of the section. Also add rows to the Expert Dispatch Quick Reference (see §11.3).

### 11.2 Knowledge doc structure

Both docs follow the existing expert-doc pattern (see `.claude/docs/POST-SYSTEM.md`):

1. Domain overview + mental model (Woo analogy)
2. Schema (tables, indexes, validators)
3. Functions (mutations, queries, internals, crons)
4. Admin surfaces (routes, components)
5. Website surfaces (routes, components)
6. Cross-system touchpoints (the bridge from the other side's perspective)
7. Plugin gate and capability model
8. Common tasks (how to add a benefit, how to wire a new status transition, etc.)
9. Gotchas and invariants
10. Files-to-know index

### 11.3 Expert dispatch quick-reference updates

Added to CLAUDE.md expert dispatch table:

| Task Domain | Expert |
|-------------|--------|
| Membership plans, grants, restrictions, teaser content | `membership-plan-system` |
| Subscription offers, contracts, invoices, dunning, renewals, pricing cards, coupons | `commerce-subscriptions-system` |

## 12. Acceptance criteria

### 12.1 Membership

- [ ] Plan CRUD works; realtime admin updates reflect to website immediately
- [ ] Manual grant/revoke via admin works end-to-end
- [ ] Restriction rules (via rules page) gate content correctly for all three teaser modes
- [ ] Post/Page metabox creates/updates scoped restriction rule
- [ ] Logged-out vs logged-in-non-member CTAs differ and route correctly
- [ ] Access log writes respect retention setting; query is performant
- [ ] Expire cron demotes `active → grace → expired` on schedule
- [ ] Capability mapping enforces (user with plan X receives plan-defined capabilities in `currentUserCan`)
- [ ] Subscription bridge grants on active status transition, revokes on cancel, moves to grace on past_due/paused
- [ ] Member dashboard shows plan, benefits, renewal, upgrade path
- [ ] Route-level restriction works (protected routes 403 or teaser)
- [ ] Product-level restriction works (commerce products gated correctly)
- [ ] Plugin gate off → all membership routes and mutations return disabled

### 12.2 Subscriptions

- [ ] Template → offer flow works; offers render on `/pricing` in configured order with correct features + CTAs
- [ ] `/signup/$offerId` creates contract with payment, coupon applied, correct initial setup
- [ ] Contract transitions through every status (`draft → trialing → active → past_due → paused → pending_cancel → cancelled/expired`) correctly
- [ ] Renewal cron generates invoices, charges payment method, marks `paid` or `past_due`
- [ ] Dunning retries at configured intervals, cancels on final failure
- [ ] Customer portal: view billing, upgrade with proration preview + invoice, downgrade queued for renewal, pause, cancel-at-period-end, change payment method, invoice history with PDF
- [ ] Coupons validate and apply with correct duration math (once / n_months / forever)
- [ ] Proration math correct for upgrade; downgrade queues via `scheduledOfferChange`
- [ ] Pricing cards admin saves and renders correctly on `/pricing`
- [ ] Pricing card benefits auto-populate from linked membership plans
- [ ] Bridge fires on every status transition (touchpoint 2 validated with integration test)
- [ ] `@ts-nocheck` removed from every subscriptions file; full typecheck build passes
- [ ] Integration tests cover: signup, upgrade, downgrade, cancel, past_due recovery, coupon redemption, bridge grant/revoke
- [ ] Plugin gate off → all subscriptions routes and mutations return disabled

### 12.3 Combined

- [ ] Both plugins can be toggled independently without breaking the other
- [ ] Full signup → subscribe → grant → access-gated-content → cancel → revoke flow works end-to-end against a clean database
- [ ] Both expert slash commands exist and their knowledge docs are complete
- [ ] CLAUDE.md expert registry updated

## 13. Files touched — inventory

### 13.1 Schema

- `ConvexPress-Admin/packages/backend/convex/schema/membership.ts` — add `displayAsFeature` to benefits, extend grant metadata
- `ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts` — add 4 new tables, new fields
- `ConvexPress-Admin/packages/backend/convex/schema.ts` — verify both spreads

### 13.2 Backend functions

- `ConvexPress-Admin/packages/backend/convex/membership/` — mutations, queries, internals, validators (extend)
- `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/` — mutations, queries, internals, validators (major additions)
- `ConvexPress-Admin/packages/backend/convex/helpers/proration.ts` — new proration computation helper
- `ConvexPress-Admin/packages/backend/convex/helpers/coupons.ts` — new coupon validation + application

### 13.3 Admin UI

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/membership/*` — build grants, restrictions, metabox integration
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/subscriptions/*` — build offers, templates, coupons, pricing-cards, contracts, invoices, dunning
- `ConvexPress-Admin/apps/web/src/components/membership/*` — plan pickers, rule builder, metabox
- `ConvexPress-Admin/apps/web/src/components/subscriptions/*` — features repeater, pricing card preview, contract detail, proration preview

### 13.4 Website UI

- `ConvexPress-Website/apps/web/src/routes/dashboard/membership.tsx` — replace stub
- `ConvexPress-Website/apps/web/src/routes/dashboard/subscriptions.tsx` — replace stub
- `ConvexPress-Website/apps/web/src/routes/pricing.tsx` — new route
- `ConvexPress-Website/apps/web/src/routes/signup/$offerId.tsx` — new route
- `ConvexPress-Website/apps/web/src/components/membership/RestrictedContent.tsx` — new wrapper
- `ConvexPress-Website/apps/web/src/components/subscriptions/PricingCardsBlock.tsx` — new embed

### 13.5 Experts

- `.claude/docs/MEMBERSHIP-PLAN-SYSTEM.md` — new knowledge doc
- `.claude/docs/COMMERCE-SUBSCRIPTIONS-SYSTEM.md` — new knowledge doc
- `.claude/commands/experts/membership-plan-system.md` — new slash command
- `.claude/commands/experts/commerce-subscriptions-system.md` — new slash command
- `.claude/CLAUDE.md` — update expert registry table

## 14. Risk & mitigation

| Risk | Mitigation |
|------|-----------|
| Bridge loops (grant triggers subscription event triggers grant) | Membership never calls subscriptions. One-way call graph. Verified by integration test. |
| Status mirror drift | Single source — subscription status. Grants only mirror. Cron audits for consistency. |
| Proration rounding errors | 2-decimal half-up, documented. Every proration event is logged with both inputs and output for audit. |
| Coupon double-redemption | `perCustomerLimit` enforced at validation; DB uniqueness on `(customerId, couponId)` redemption check. |
| Plugin flag on one side, off on the other | Bridge no-ops gracefully when target plugin disabled. Tested both ways. |
| Schema migration with existing data | Add new fields as optional; backfill migration if needed. `@ts-nocheck` removal is last. |
| Parallel expert work conflicts | Each expert owns its own system directory. Bridge is an explicit integration test in Wave 4, not ad-hoc coordination. |

## 15. Rollout

1. Implementation plan (via `writing-plans` skill)
2. Wave-by-wave execution with deploy after each wave to staging
3. Seed data for acceptance testing: 1 template, 3 offers, 3 membership plans, 2 coupons, 5 restricted pages
4. Run acceptance criteria checklist (sections 12.1 + 12.2 + 12.3)
5. Fix any gaps, re-deploy
6. Enable on first production site; monitor 48 hours
7. Roll to remaining sites

## 16. Open questions

None at design time. All gray-zone items resolved:
- Coupons: **IN** (Section 9)
- Proration: **IN** with Woo model (Section 8)
- Multi-currency: **OUT** (deferred)
- Purchase-based grants: **OUT** (membership = subscription-only)
- Upgrade/downgrade: lives in Subscriptions, not Membership
- Pricing page: **IN** via features-on-offers + pricing card config (Section 7)
- Card templates + theming: **OUT** (defer; template key is extension point)

## 17. Next step

Invoke `writing-plans` skill to produce the detailed implementation plan driving the 8 waves.
