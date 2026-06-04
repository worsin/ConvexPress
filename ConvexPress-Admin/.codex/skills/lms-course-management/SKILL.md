---
name: lms-course-management
description: Use when the user asks to create, edit, audit, debug, seed, or improve LMS courses, lessons, topics, course catalog entries, enrollments, progress, certificates, AI course generation, or the lesson editor/builder in ConvexPress Admin.
---

# lms-course-management

Use this for LMS work in `ConvexPress-Admin/`. The Admin app owns the LMS
schema, mutations, queries, events, notifications, and authoring UI. The
Website app only consumes the deployed backend.

## Read First

- `ConvexPress-Admin/AGENTS.md`
- `specs/codex-prds/LMS-PLUGIN-PRD.md`
- `plans/codex/LMS-PRODUCTION-READINESS-IMPLEMENTATION-PLAN-2026-05-31.md`
- Current files before editing; docs can lag code.

## System Map

- Schema: `packages/backend/convex/schema/lms.ts`
- Backend:
  - `packages/backend/convex/lms/courses/`
  - `packages/backend/convex/lms/nodes/`
  - `packages/backend/convex/lms/topics/`
  - `packages/backend/convex/lms/lessons/`
  - `packages/backend/convex/lms/enrollment/`
  - `packages/backend/convex/lms/progress/`
  - `packages/backend/convex/lms/certificates/`
  - `packages/backend/convex/lms/ai/`
- Admin routes:
  - `apps/web/src/routes/_authenticated/_admin/lms/**`
- Shared public consumption:
  - `../ConvexPress-Website/apps/web/src/routes/_marketing/courses*`
  - `../ConvexPress-Website/apps/web/src/routes/dashboard/courses*`
  - `../ConvexPress-Website/apps/web/src/routes/_marketing/certificates*`
- Events: `packages/backend/convex/events/constants.ts` (`LMS_EVENTS`)
- Email templates: `packages/backend/convex/emails/registry.ts`
- Site notifications: `packages/backend/convex/notifications/validators.ts`
- Capabilities: `packages/backend/convex/seed/roles.ts` (`lms.*`)

## Workflow

1. Identify the LMS subsystem: course metadata, builder tree, lesson editor,
   enrollment/access, progress, certificates, AI generation, or public learning.
2. Read the relevant backend folder and the matching admin route/component before
   editing.
3. Keep course tree behavior consistent:
   - courses own topics and lessons through `lms_nodes`
   - topic/lesson changes should emit LMS events where current patterns do
   - lesson version restore must preserve edit history
   - progression, prerequisites, drip, membership, and purchase access must not
     be bypassed
4. For lesson editor work, preserve autosave/versioning, rich text fallback text,
   media fields, completion gates, and mobile layout.
5. For enrollment work, check membership and purchase bridges in
   `lms/enrollment/internals.ts`; do not create one-off access rules in UI code.
6. For certificate work, verify issue/revoke/reissue events, PDF render actions,
   and public serial verification.
7. If a change affects public learning, update Website routes/components in the
   same commit and use `website-lms-experience`.

## Verification

Run the narrowest meaningful gates from `ConvexPress-Admin/`:

```bash
bun test packages/backend/convex/lms/__tests__/*.test.ts
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

For UI changes, also run the relevant app typecheck/build and browser-smoke the
admin LMS route and the public course/player/certificate route.

## Report

List changed subsystems, route/backend files, event/notification effects,
access-control implications, and verification results. Be explicit about
provider/manual gaps such as AI credentials, email delivery, or PDF rendering.
