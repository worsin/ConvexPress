---
name: website-member-dashboard
description: Use when the user asks to build, audit, debug, or improve authenticated customer dashboard pages: profile, security, addresses, notifications, posts, comments, downloads, orders, subscriptions, memberships, courses, reviews, returns, or account settings.
---

# website-member-dashboard

Use this for authenticated Website dashboard and account surfaces. These routes
aggregate auth, commerce, membership, LMS, notifications, and user profile data.

## System Map

- Dashboard root: `apps/web/src/routes/dashboard.tsx`
- Dashboard routes: `apps/web/src/routes/dashboard/**`
- Auth/account routes:
  - `apps/web/src/routes/login.tsx`
  - `signup.$offerId.tsx`
  - `forgot-password.tsx`
  - `reset-password.tsx`
  - `verify-email.tsx`
- Backend owner: `../ConvexPress-Admin/packages/backend/convex/`

## Workflow

1. Identify dashboard domain: profile/security, addresses, notifications,
   orders/returns, subscriptions/membership, courses, downloads, comments, posts,
   reviews, or settings.
2. Read the route and all backend queries/mutations it calls.
3. Preserve auth guards, redirects, empty states, loading states, and mobile
   layout.
4. Do not leak another user's data. Verify every backend call is scoped to the
   current user or protected by role/capability checks.
5. Keep cross-domain navigation consistent with the dashboard sidebar/header.
6. For LMS or commerce subflows, also use `website-lms-experience` or
   `website-commerce-experience`.

## Verification

Run Website typecheck/build. Browser-smoke authenticated and signed-out access
for any route touched.

```bash
bun run check-types
bun run build
```

## Report

List routes changed, auth/data-scope checks, empty/error states, and
verification.
