---
name: membership-access
description: Use when the user asks to create, audit, debug, or improve membership plans, subscriptions, grants, content restrictions, role/capability access, LMS course access, entitlements, or customer membership dashboards in ConvexPress.
---

# membership-access

Use this when access, entitlements, or subscriptions decide what a user can see
or do. Membership intersects content, commerce subscriptions, LMS, and customer
dashboards.

## System Map

- Admin routes: `apps/web/src/routes/_authenticated/_admin/membership/**`
- Backend: `packages/backend/convex/membership/`,
  `packages/backend/convex/commerceSubscriptions/`
- LMS bridge: `packages/backend/convex/lms/access.ts` and
  `packages/backend/convex/lms/enrollment/internals.ts`
- Role/capability seed: `packages/backend/convex/seed/roles.ts`
- Website dashboard: `../ConvexPress-Website/apps/web/src/routes/dashboard/membership.tsx`,
  `dashboard/subscriptions*`, and gated content routes.

## Workflow

1. Determine whether the task is plan/pricing, grant, restriction, entitlement,
   subscription billing, or LMS access.
2. Trace access from backend capability/restriction rules to the public route.
3. Keep role/capability registry changes deliberate and minimal; do not invent
   capabilities without checking `seed/roles.ts`.
4. For LMS access, use the LMS access helpers and enrollment bridge rather than
   duplicating checks in route components.
5. For subscription-backed access, verify invoice/payment status, entitlement
   activation, expiration, dunning, and cancellation behavior.
6. For public UI, preserve clear locked/upgrade/sign-in states.

## Verification

Run focused tests for the touched layer, commonly:

```bash
bun test packages/backend/convex/membership/__tests__/*.test.ts packages/backend/convex/commerceSubscriptions/__tests__/*.test.ts packages/backend/convex/lms/__tests__/access.test.ts
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

Smoke test one locked and one allowed route when UI/access behavior changes.

## Report

Explain what controls access, what changed in entitlement state, which roles or
capabilities are involved, and how locked/allowed paths were verified.
