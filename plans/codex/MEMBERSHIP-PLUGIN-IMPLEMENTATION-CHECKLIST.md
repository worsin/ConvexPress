# Membership Plugin - Implementation Checklist

**System:** Membership Plugin
**Status:** Planned
**Last Authored:** 2026-04-07
**Companion Spec:** `.codex/docs/MEMBERSHIP-PLUGIN-PRD.md`

---

## Working Rule

This checklist covers the `membership` plugin only.

It should leverage existing ConvexPress systems:

- roles/capabilities
- pages/posts
- auth
- user profiles

---

## Phase 1 - Plugin Foundation

### 1. Registry and Settings

Update:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
- shared settings defaults/validators/validation

Add:

- `membership`
- `membershipEnabled`

---

## Phase 2 - Schema

### 2. Schema File

Create:

- `ConvexPress-Admin/packages/backend/convex/schema/membership.ts`

Update:

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

Add tables:

- `membership_plans`
- `membership_plan_benefits`
- `membership_grants`
- `membership_restriction_rules`
- `membership_access_log`

---

## Phase 3 - Backend Domain

### 3. Domain Module

Create:

- `ConvexPress-Admin/packages/backend/convex/membership/`

Suggested files:

- `helpers.ts`
- `validators.ts`
- `plans.ts`
- `grants.ts`
- `restrictions.ts`
- `access.ts`

### 4. Access Evaluation

Implement a central access evaluator that can be used by:

- page loaders
- post loaders
- dashboard route guards later

### 5. Subscription Bridge

Add optional integration with `commerceSubscriptions` entitlements.

Do not place subscription billing logic here.

---

## Phase 4 - Admin UI

### 6. Admin Routes

Create:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/membership/`

Suggested route files:

- `index.tsx`
- `plans.tsx`
- `plans.$planId.tsx`
- `grants.tsx`
- `grants.$grantId.tsx`
- `restrictions.tsx`
- `settings.tsx`

### 7. Admin Components

Create:

- `ConvexPress-Admin/apps/web/src/components/membership/`

Suggested groups:

- `plans/`
- `grants/`
- `restrictions/`

### 8. Page/Post Editor Integration

Extend editor document panels to support:

- membership restriction toggle
- plan selector
- teaser mode
- custom message

---

## Phase 5 - Website Integration

### 9. Website Account Routes

Create:

- `ConvexPress-Website/apps/web/src/routes/_dashboard/membership.tsx`

### 10. Website Restriction UX

Create:

- restricted-content wrapper components
- member-only message blocks
- upgrade/login CTA surfaces

### 11. Loader Integration

Integrate access checks into:

- page route loaders
- post route loaders

---

## Phase 6 - Verification

### 12. Verification

- plans can be created and granted
- restricted pages/posts enforce access rules
- teaser/custom-message behavior works
- subscription entitlement bridge works when enabled
- disabling plugin removes membership gating behavior

