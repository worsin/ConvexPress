# PRD: Content Restriction System

> **Project:** ConvexPress — unified CMS + commerce.
> **Roles:** WordPress-standard.
> **Stack:** Bun, Base UI, Tailwind v4, Stripe.
> **Canonical path:** `specs/ConvexPress/systems/content-restriction-system/PRD.md`
> **Airtable Record:** `[redacted-airtable-record-id]`
> **Expert:** `/experts:membership-plan-system` (co-owner).
> **Status:** Shipped as part of the Membership Plan System. This PRD is the formal restriction-rule contract; the grant + plan machinery lives in `membership-plan-system/PRD.md`.

---

## Relationship to Membership Plan System

Content Restriction is the **rule evaluator** side of the Membership
Plan System:

- **Membership Plan System** owns plans, benefits, grants, and the
  subscription bridge.
- **Content Restriction** (this) owns the rules that decide which
  content requires which grants + the `checkAccess` / `requireAccess`
  evaluation path.

In code they share one module: `convex/membership/`. Restriction logic
lives in `membership/restrictions.ts` + `membership/queries.ts`
(`checkAccess`, `checkAccessAndLog`).

**Consolidation path:** this record can be retired into a "Restriction
Rules" section of the Membership Plan PRD once documentation
consolidation is prioritized. For now it exists as the formal rule
contract.

---

## Integration with ConvexPress

**Positioning:** part of the `membership` extension.
**Extension gate:** `membershipEnabled` in Settings; `requireMembershipEnabled(ctx)` helper.
**Code lives at:**
- `convex/membership/restrictions.ts` — rule CRUD
- `convex/membership/queries.ts` — `checkAccess`, `checkAccessAndLog`
- `convex/schema/membership.ts:membership_restriction_rules`
- Website gates: `ConvexPress-Website/apps/web/src/lib/membership/routeRestriction.ts`, `useProductAccess` hook, `_marketing.tsx` layout

**Consumes these ConvexPress systems:**

- **Membership Plan System** — rules reference `planId`; evaluation checks the user's grants.
- **Subscription Entitlement** — rules can alternatively reference `entitlementCode` directly.
- **Post System + Page System** — rules scope to `resourceType: "post"|"page"|"product"|"route"` with `resourceIdOrKey`.
- **Product System** — product-level restriction via `resourceType: "product"`.
- **Routing System** — rules with `resourceType: "route"` match route patterns (e.g., `/premium/*`).
- **Content Editor System** — post/page editor exposes a RestrictionMetabox (Wave 7).
- **Event Dispatcher** — emits `membership.access_checked`, `.access_denied`, `.restriction_rule_created|updated|deleted`.
- **Audit Log** — access log writes via `membership_access_log` + trim cron.

**WooCommerce analog:** WooCommerce Memberships restriction rules — per-post, per-category, per-product access gating with teaser modes.

---

## 1. Overview

### 1.1 Purpose

Define and evaluate rules that gate access to specific content
(post/page/product/route) based on a viewer's membership grants or
subscription entitlements. Customer-facing teaser modes (hide /
excerpt / custom_message) render when access is denied; admin UIs
configure rules per resource.

### 1.2 Scope

**In Scope:**
- Rule CRUD with `resourceType`, `resourceIdOrKey`, `planIds[]`, `requireAllPlans`, `teaserMode`, `teaserExcerptLength`, `teaserCustomMessage`.
- Three teaser modes: `hide` (only CTA), `excerpt` (partial + fade + CTA), `custom_message` (rule's text + CTA).
- Public `checkAccess(resourceType, resourceIdOrKey, userId?)` query — returns `{ allowed, reason, teaserMode, teaserText }`.
- Mutation variant `checkAccessAndLog` — same return but writes a `membership_access_log` row (Wave 7).
- Route-pattern matching via `/premium/*` style globs (Wave 7).
- Product-level restriction gating cart add (Wave 7).
- Post/page editor RestrictionMetabox (Wave 7).
- LoginCTA vs UpgradeCTA branching (Wave 5 website).
- **Wave 11:** Rule template library (common patterns admins can clone).
- **Wave 11:** Bulk rule application — apply one rule to all posts in a category.
- **Wave 11:** Rule audit history (`membership_restriction_rule_history` table).

**Out of Scope:**
- Grant CRUD (Membership Plan System).
- Teaser component rendering (Website UI — `RestrictedContent`, `UpgradeCTA`, `LoginCTA` components).
- Plan-benefit feature-flag evaluation (Membership Plan System).
- Usage metering (Wave 10.6, deferred).

---

## 2. Data Model

### 2.1 `membership_restriction_rules` (exists)

```ts
membership_restriction_rules: defineTable({
  resourceType: v.union(
    v.literal("post"),
    v.literal("page"),
    v.literal("product"),
    v.literal("route"),
  ),
  resourceIdOrKey: v.string(),  // post/page/product _id OR route pattern
  planIds: v.array(v.id("membership_plans")),
  requireAllPlans: v.optional(v.boolean()),  // default false = any
  teaserMode: v.union(
    v.literal("hide"),
    v.literal("excerpt"),
    v.literal("custom_message"),
  ),
  teaserExcerptLength: v.optional(v.number()),
  teaserCustomMessage: v.optional(v.string()),
  isActive: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_resource", ["resourceType", "resourceIdOrKey"])
  .index("by_plan", ["planIds"])
  .index("by_active", ["isActive"]);
```

### 2.2 `membership_access_log` (exists, Wave 7)

Already scaffolded with `trimAccessLog` cron (weekly) and retention window.

### 2.3 NEW Wave 11

```ts
membership_restriction_rule_history: defineTable({
  ruleId: v.id("membership_restriction_rules"),
  changedBy: v.id("users"),
  changedAt: v.number(),
  before: v.any(),
  after: v.any(),
  reason: v.optional(v.string()),
}).index("by_rule", ["ruleId"]).index("by_changed_at", ["changedAt"]);
```

---

## 3. Functions

### 3.1 Exists
- `membership.mutations.upsertRestrictionRule / deleteRestrictionRule / toggleRuleActive`
- `membership.queries.listRestrictionRules / getRulesForResource`
- `membership.queries.checkAccess(resourceType, resourceIdOrKey, userId?)` — public
- `membership.queries.checkAccessAndLog` — mutation variant with logging
- `membership.internals.[redacted-airtable-record-id]` — deferred log write
- `membership.internals.trimAccessLog` — weekly cron (Wave 7)

### 3.2 Wave 11
- `mutations.bulkApplyRule(sourceRuleId, resourceType, resourceIdOrKeys[])` — clone a rule to many resources
- `queries.listRuleTemplates` — admin-curated common patterns
- `mutations.forkRuleFromTemplate(templateId, resourceType, resourceIdOrKey)`
- `queries.getRuleHistory(ruleId)` — audit log reader
- `internals.recordRuleChange` — writes `membership_restriction_rule_history` on every CRUD

---

## 4. Admin UI

### 4.1 Exists
- `/admin/membership/restrictions` — list + filter
- `/admin/membership/restrictions/new` — create rule
- `/admin/membership/restrictions/$ruleId/edit` — edit rule
- Post/page editor RestrictionMetabox

### 4.2 Wave 11
- Rule template library route
- Bulk-apply modal on the list page
- Rule history panel on the edit view

---

## 5. Events

- `membership.restriction_rule_created / updated / deleted / toggled`
- `membership.access_checked / access_denied`
- **NEW:** `membership.restriction_rule_bulk_applied`
- **NEW:** `membership.restriction_rule_template_used`

---

## 6. Acceptance criteria

### 6.1 Existing (must not regress)
- [x] Rule CRUD for post/page/product/route resource types
- [x] Three teaser modes
- [x] `checkAccess` returns `{ allowed, reason, teaserMode, teaserText }`
- [x] Route-pattern glob matching
- [x] Product restriction gating cart add
- [x] Post/page editor metabox
- [x] LoginCTA vs UpgradeCTA branching on website
- [x] Access log cron + retention

### 6.2 Wave 11
- [ ] Rule templates library + `forkRuleFromTemplate`
- [ ] Bulk-apply-by-category operation
- [ ] Rule history + audit log
- [ ] Admin history viewer

---

## 7. Definition of Done

1. §6.2 boxes ticked.
2. Membership tests include: templates CRUD, bulk-apply over 50 posts, rule-history write-on-update.
3. Documentation consolidation decision made: retire Airtable record into Membership Plan PRD, OR keep as formal restriction-rule contract.

---

## 8. References

- Code: `convex/membership/restrictions.ts`, `membership/queries.ts`, `helpers/routeRestriction.ts` (website)
- Knowledge doc: `.claude/docs/MEMBERSHIP-PLAN-SYSTEM.md`
- Tests: `convex/membership/__tests__/`
- Sibling PRDs: `membership-plan-system`, `subscription-entitlement-system`, `post-system`, `page-system`, `product-system`, `routing-system`, `content-editor-system`
- Acceptance history: `audits/superpowers/2026-04-21-membership-subscriptions-acceptance.md`
- Airtable: `[redacted-airtable-base-id]` / Systems / `[redacted-airtable-record-id]`
