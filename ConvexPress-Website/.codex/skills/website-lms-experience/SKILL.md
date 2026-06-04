---
name: website-lms-experience
description: Use when the user asks to build, audit, debug, redesign, or improve public LMS pages: course catalog, course detail, lesson preview, learner dashboard courses, course player, progress, certificates, certificate verification, or LMS emails/notifications on the ConvexPress Website.
---

# website-lms-experience

Use this for the public and customer-facing LMS experience. The backend lives in
`../ConvexPress-Admin/`; do not add Convex schema/functions here.

## System Map

- Marketing routes:
  - `apps/web/src/routes/_marketing/courses.tsx`
  - `apps/web/src/routes/_marketing/courses/index.tsx`
  - `apps/web/src/routes/_marketing/courses/$slug.tsx`
  - `apps/web/src/routes/_marketing/courses/$slug_.$nodeId.tsx`
  - `apps/web/src/routes/_marketing/certificates*`
- Dashboard routes:
  - `apps/web/src/routes/dashboard/courses.tsx`
  - `apps/web/src/routes/dashboard/courses_.$slug.$nodeId.tsx`
  - `apps/web/src/routes/account.courses*`
- Backend owner:
  - `../ConvexPress-Admin/packages/backend/convex/lms/`
  - `../ConvexPress-Admin/packages/backend/convex/schema/lms.ts`

## Workflow

1. Identify route type: catalog, detail, preview, learner dashboard, player, or
   certificate.
2. Read the route and the backend query it calls.
3. Preserve access states: public/open, sign-in required, purchase required,
   membership required, prerequisite locked, drip locked, and completed.
4. Course player changes must keep progress heartbeat, mark-complete gates,
   previous/next navigation, certificate issue flow, and mobile layout.
5. Certificate pages must verify by serial and show revoked/invalid states.
6. For visual redesign, also follow the relevant `design-*` skill and use the
   site brand doc.

## Verification

Run Website typecheck/build for UI work and backend LMS tests if data contracts
change:

```bash
bun run check-types
bun run build
```

Browser-smoke `/courses`, one course detail/player route, `/dashboard/courses`,
and `/certificates/verify` when touched.

## Report

List routes changed, access states verified, backend contracts touched, and any
manual/provider gaps.
