# Membership Plugin - PRD and Implementation Strategy

**System:** Membership Plugin
**Status:** Planned
**Priority:** P1 - High
**Complexity:** Complex
**Layer:** Full Stack / Plugin
**Target Project:** `ConvexPress`
**WordPress Equivalent:** WooCommerce Memberships + restricted content plugins
**Last Authored:** 2026-04-07

---

## Intent

The Membership Plugin adds structured access control and entitlement-driven content restriction to ConvexPress.

It is intentionally separate from `commerceSubscriptions`.

This plugin should use ConvexPress’s existing strengths:

- roles
- capabilities
- user profiles
- page/post visibility patterns
- CMS routing

It adds a proper membership domain on top of those primitives:

- plans / tiers
- grants / entitlements
- restriction rules
- member-only UX
- content/product/category access evaluation

---

## Product Goals

1. Support member-only content and experiences in ConvexPress.
2. Allow membership access to be granted manually, by subscription, or by purchase rule later.
3. Reuse existing ConvexPress auth, role, and capability systems.
4. Keep billing concerns outside this plugin.
5. Give admins a clear UI for plans, grants, and restriction rules.

---

## Non-Goals

This plugin does **not** own:

- recurring billing
- invoices
- dunning
- payment collection
- the generic role system itself

It consumes those systems when needed.

---

## Core Architectural Principle

Membership is not just “subscriber role.”

Roles and capabilities are necessary infrastructure, but they are too coarse to fully model membership.

Membership needs:

- access plans
- grants and revocations
- plan-aware rules
- content restriction evaluation
- bridge logic from subscriptions to access

That means:

- keep the role/capability system intact
- build membership as a layer above it
- optionally map plans to role/capability grants

---

## Plugin Definition

### Plugin ID

- `membership`

### Dependencies

Required:

- none strictly, if manual membership grants are allowed

Optional integrations:

- `commerce`
- `commerceSubscriptions`

### Registry Integration

Add to:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Recommended metadata:

- `id`: `membership`
- `title`: `Membership`
- `description`: `Plan-based access rules, content restriction, and member entitlements`
- `settingsKey`: `membershipEnabled`
- `adminAccessPrefixes`: `["/admin/membership"]`
- `routePrefixes`: `["/account/membership"]`

### Plugin Gating Rule

If `membershipEnabled === false`:

- membership restriction rules must not be enforced
- member-only dashboards must not render
- entitlement checks from membership should return empty

The plugin should fail open only if rules are disabled by design. Otherwise, disabled means inactive.

---

## Product Model

Membership should support:

- plans
- plan grants
- restriction rules
- access evaluation
- optional role/capability mapping

### Membership Sources

Access may come from:

- manual admin grant
- active subscription entitlement
- one-time purchase grant later
- imported grant later

---

## Domain Model

Recommended tables:

- `membership_plans`
- `membership_plan_benefits`
- `membership_grants`
- `membership_restriction_rules`
- `membership_access_log`

### `membership_plans`

Recommended fields:

- `title`
- `slug`
- `description`
- `status`: `draft | active | archived`
- `grantMode`: `manual | subscription | purchase | hybrid`
- `linkedSubscriptionCode?`
- `linkedRoleId?`
- `linkedCapabilities?`
- `priority`
- `createdAt`
- `updatedAt`

### `membership_grants`

Recommended fields:

- `userId`
- `planId`
- `sourceType`: `manual | subscription | purchase | import`
- `sourceRef?`
- `status`: `active | grace | revoked | expired`
- `startsAt`
- `endsAt?`
- `graceEndsAt?`
- `revokedAt?`
- `metadata?`
- `createdAt`
- `updatedAt`

### `membership_restriction_rules`

Recommended fields:

- `resourceType`: `page | post | category | tag | route | product | block`
- `resourceIdOrKey`
- `ruleMode`: `allow_only | deny_if_missing`
- `planIds`
- `requiredCapabilities?`
- `teaserMode`: `hide | excerpt | custom_message`
- `customMessage?`
- `loginRequired`
- `createdAt`
- `updatedAt`

### `membership_plan_benefits`

Optional normalized benefit definitions:

- `planId`
- `code`
- `label`
- `description?`
- `metadata?`

This is useful for rendering “what this plan includes.”

---

## Restriction Surface

The plugin should be able to gate:

- pages
- posts
- category archives
- tag archives later if needed
- selected website routes
- selected commerce products later if desired
- selected content blocks later if desired

### v1 Recommendation

Restrict only:

- pages
- posts
- selected dashboard routes

Then expand later.

---

## Access Evaluation Model

The plugin needs a single source of truth for access checks.

### Inputs

- current authenticated user
- applicable membership grants
- applicable restriction rules
- optional role/capability grants

### Outputs

- `allowed`
- `reason`
- `matchingPlans`
- `loginRequired`
- `teaserMode`
- `customMessage?`

### Important Principle

This logic should be evaluated server-side for true gating, not just hidden in the UI.

---

## Relationship To Roles And Capabilities

Roles/capabilities remain foundational.

Membership may optionally:

- assign a role
- add temporary capabilities
- rely on capabilities for gated dashboards or admin conveniences

But the plugin should not require that every membership plan equals a separate role.

That becomes unmanageable fast.

### Recommended Pattern

- keep a small stable role system
- use membership plans for business access semantics
- map plans to additional capabilities only when helpful

---

## Relationship To Commerce Subscriptions

This plugin consumes entitlements from `commerceSubscriptions`.

### Example Contract

If a subscription emits:

- `membership.plan:gold`

Then membership can grant access to the `gold` plan while that entitlement is active.

### Important Rule

Membership never owns subscription billing lifecycle.

It only consumes:

- active
- grace
- revoked

style entitlement state.

---

## Admin UX Requirements

### Admin Routes

Suggested routes:

- `/admin/membership`
- `/admin/membership/plans`
- `/admin/membership/plans/$planId`
- `/admin/membership/grants`
- `/admin/membership/grants/$grantId`
- `/admin/membership/restrictions`
- `/admin/membership/settings`

### Admin Features

- plan CRUD
- manual grant / revoke
- restriction rule builder
- linked subscription mapping
- member lookup
- grant history visibility

---

## Website UX Requirements

### Member Account Routes

Suggested routes:

- `/_dashboard/membership.tsx`
- `/_dashboard/membership/plans.tsx`

### Public UX

When restricted content is encountered:

- prompt login if needed
- show teaser or custom message if configured
- optionally show upgrade CTA

### CMS UX

Editors should be able to mark content as:

- public
- password protected
- private
- membership restricted

That should extend the existing visibility model rather than replacing it.

---

## Content Integration

This plugin must integrate directly with page and post systems.

### Recommended Integration Points

- page editor document panel
- post editor document panel
- website content loaders
- website content rendering wrappers

### v1 Editorial Controls

For pages/posts:

- restrict by membership plan
- teaser mode selection
- custom restricted message
- login-required toggle

---

## Settings Model

Add:

- `membershipEnabled`

Membership settings may include:

- default teaser mode
- login redirect strategy
- default restricted-content message
- whether plans can map to roles/capabilities

---

## Capability Model

Recommended capabilities:

- `membership.plans.view`
- `membership.plans.manage`
- `membership.grants.view`
- `membership.grants.manage`
- `membership.restrictions.manage`
- `membership.settings.manage`

Customer access is owner-based, not capability-based.

---

## WooCommerce-Style Mental Model

The intended mental model is:

- `commerce` = WooCommerce
- `commerceSubscriptions` = WooCommerce Subscriptions
- `membership` = WooCommerce Memberships

That means:

- subscription billing can exist without gated content
- memberships can be granted manually
- access is driven by grants and rules, not by invoices

---

## Rollout Plan

### Phase 1

- plugin registration
- schema
- plan CRUD
- manual grants

### Phase 2

- restriction rules for pages and posts
- website access evaluation
- restricted-content UX

### Phase 3

- subscription entitlement bridge
- member account surfaces
- richer plan benefits

### Phase 4

- route-level restriction
- product-level restriction
- upgrade flows

---

## Acceptance Criteria

The plugin is successful when:

- admins can define membership plans
- users can receive active membership grants
- pages/posts can be restricted by plan
- website access checks enforce those rules correctly
- subscription entitlements can drive membership state without coupling billing logic into the membership plugin

