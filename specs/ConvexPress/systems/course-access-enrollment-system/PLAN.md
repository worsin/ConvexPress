# PLAN: Course Access & Enrollment System — Build Sequence

> Companion to `PRD.md` (read first). Scaffold/conventions: `specs/codex-prds/LMS-PLUGIN-IMPLEMENTATION.md` (M0 assumed). **Verify gate every step:** `cd ConvexPress-Admin && bun run check-types` exits 0.
> **For agentic workers:** task-by-task via `superpowers:subagent-driven-development`; `- [ ]` steps. **Milestone 2** (learner surface).

**Goal:** `lms_enrollments` + membership-gated course access (reuse `membership_restriction_rules`) + drip/prerequisite evaluation.
**Prereqs:** M1 complete + `membership` plugin (`convex/membership/*`, `membershipEnabled`). Reuses `topic-system.resolveLessonDrip` + `progress-completion` (for prereq checks — build progress alongside).
**Code home:** `convex/lms/enrollment/` + `convex/schema/lms.ts` (`lms_enrollments`); website gate `ConvexPress-Website/apps/web/src/lib/lms/courseAccess.ts`.

## Decisions
- **Reuse the membership rule engine.** Add `"course"` to `membership_restriction_rules.resourceType` and evaluate with the existing `convex/membership/access.ts` `checkAccess`. Do **not** build a parallel gate.
- `lms_enrollments.source` (`membership_plan|manual|purchase`) makes a plan-grant, an admin assignment, and a future purchase the **same row shape**.
- Drip `unlockAt` is computed from `resolveLessonDrip` + `enrolledAt`; prerequisite check reads `progress-completion`.
- Auto-enroll reacts to `membership.*` grant events (subscribe in `internals.syncFromMembership`).

## Build Sequence

### Step 1 — Schema + restriction resource type
- **Files:** EDIT `convex/schema/lms.ts` (`lms_enrollments`); EDIT `convex/schema/membership.ts` (extend `membership_restriction_rules.resourceType` union with `v.literal("course")` — additive, no migration).
- [ ] Add `lms_enrollments` (PRD §2.1) with `by_user`, `by_course`, `by_user_course`. Extend the membership resourceType union.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): enrollment schema + course restriction type`.

### Step 2 — Access evaluation
- **Files:** CREATE `convex/lms/enrollment/queries.ts`, `convex/lms/enrollment/helpers.ts`.
- [ ] `canAccessCourse(courseId, userId?)` → wraps `membership.checkAccess("course", courseId, userId)` + `accessMode` + availability window + seat/expiry → `{ allowed, reason, teaserMode, requiresLogin }`.
- [ ] `canAccessNode(nodeId, userId?)` → course access AND `unlockAt <= now` (drip) AND (linear gate later) OR `isPreview` → `{ allowed, lockedUntil?, reason }`.
- [ ] `getCourseUnlockSchedule(courseId, userId)` → per-node `unlockAt` map (uses `internals.computeUnlockAt` + `resolveLessonDrip`).
- [ ] `checkPrerequisites(courseId, userId)` → `{ satisfied, missingCourses[] }` (reads `progress-completion`).
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): course access evaluation`.

### Step 3 — Enrollment mutations + membership sync
- **Files:** CREATE `convex/lms/enrollment/mutations.ts`, `convex/lms/enrollment/internals.ts`.
- [ ] `enroll` (idempotent; respects `seatLimit`), `revoke`, `expire`, `setCourseRestriction` (writes the `course` rule via membership restriction CRUD), `syncFromMembership` (internal; reconciles on `membership.*` events), `computeUnlockAt`, `expireEnrollmentsCron` (daily). Gate: `requirePluginEnabled(ctx,"lms")` (+ `membershipEnabled` for plan gating); admin ops need `lms.enroll.manage`.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): enrollment mutations + membership sync`.

### Step 4 — Events + cron
- [ ] Declare `lms.enrolled/unenrolled/enrollment_expired/enrollment_revoked`, `lms.access_denied`, `lms.prerequisites_unmet`. Register `expireEnrollmentsCron` in `convex/crons.ts`. Verify: `bun run check-types` → 0.

### Step 5 — Admin: access panel + enrollees
- **Files:** EDIT course settings editor (Access panel); CREATE `.../lms/courses/$courseId/enrollees.tsx`, `.../lms/enrollments.tsx`.
- [ ] Access panel: access mode + membership-plan multiselect (→ `setCourseRestriction`) + availability + seat + duration. Enrollee list: manual enroll/revoke, source + expiry. Global enrollment search.
- [ ] Verify: `bun run check-types` → 0 + `bun run check:smoke`. Commit: `feat(lms): access admin + enrollee management`.

## MVP Definition of Done (from PRD §6)
- [ ] (v1) `lms_enrollments` table + `course` restriction type exist in schema.
- [ ] `canAccessCourse`/`canAccessNode` enforce membership gating server-side via `checkAccess`.
- [ ] Auto-enroll on plan grant; manual enroll/revoke; idempotent + seat-limited.
- [ ] Drip `unlockAt` (lesson → topic → immediate).
- [ ] Prerequisite any/all evaluation reads Progress + blocks when unmet.
- [ ] Access duration / availability / preview honored.
- [ ] Admin access panel writes restriction rules; enrollee mgmt works.

## Verify
```bash
cd ConvexPress-Admin && bun run check-types && bun run check:guardrails
bun test packages/backend/convex/lms/enrollment/__tests__
```
