# PRD: Course Access & Enrollment System

> **Project:** ConvexPress — LMS extension. Who can access a course, how they enroll, and when content unlocks.
> **Plugin:** `lms`. Reuses the **Membership + Content Restriction** rule engine for gating; adds a thin enrollment record + drip/prerequisite evaluation.
> **Two-app architecture:** Admin (Convex Auth) + Website (Clerk). **Stack:** Bun, Base UI, Tailwind v4.
> **Canonical path:** `specs/ConvexPress/systems/course-access-enrollment-system/PRD.md`
> **Airtable:** ConvexPress base / Systems / "Course Access & Enrollment System".
> **Status:** Planned — fast-follow (learner surface). Data model declared in v1.
> **Depends on:** `course-system`, `topic-system`, `lesson-system`, `membership-plan-system`, `content-restriction-system`.

---

## Integration with ConvexPress

**Positioning:** internal extension (`lms`) — course access gating + enrollment + drip/prerequisite evaluation.
**Extension gate:** `lmsEnabled`; `requireLmsEnabled(ctx)`. Membership gating additionally requires `membershipEnabled`.
**Code lives at:** `convex/lms/enrollment/` (queries/mutations/internals) + schema `lms_enrollments`. Reuses `convex/membership/` for rule evaluation. Website gates at `ConvexPress-Website/.../lib/lms/courseAccess.ts`.

**Consumes these ConvexPress systems:**
- **Content Restriction System** — extend `membership_restriction_rules.resourceType` to include `"course"` (and optionally `"lesson"`); evaluate via existing `checkAccess(resourceType, resourceIdOrKey, userId?)`.
- **Membership Plan System** — plan grants determine whether a user satisfies a course's `planIds`.
- **Course System** — reads `accessMode`, prerequisites + `prereqMode`, `accessDurationDays`, `startDate`/`endDate`, `seatLimit`, `contentVisibility`.
- **Topic / Lesson System** — `resolveLessonDrip` for per-lesson release timing.
- **Commerce / Subscriptions** (optional, later) — `buy`/`recurring` access modes create enrollments on purchase.
- **Event Dispatcher** — `lms.enrolled`, `lms.unenrolled`, `lms.access_denied`.
- **Role & Capability** — `lms.enroll.manage` (admin); learner access is enrollment-based, not capability-based.

**WooCommerce/LearnDash analog:** LearnDash course access modes + enrollment, expressed through WooCommerce Memberships-style restriction rules.

---

## 1. Overview

### 1.1 Purpose

Decide **whether a user may access a course** and **what is unlocked when**. Access is primarily **membership-gated**: a course names the membership plans that unlock it (a `membership_restriction_rules` row), and the existing `checkAccess` path enforces it server-side. **Enrollment** is a thin record capturing how a user got access (plan grant, manual assignment, or — later — purchase). This system also evaluates **drip** (lesson release timing) and **prerequisites** (required prior courses) — the fields stored in v1 by Course/Topic/Lesson are enforced here.

### 1.2 Scope

**In Scope (fast-follow):**
- `lms_enrollments` record: `userId`, `courseId`, `source`, `membershipPlanId?`, `enrolledAt`, `expiresAt?`, `status`.
- **Membership gating:** `course` restriction rules (`planIds[]`, `requireAllPlans`) evaluated via `checkAccess`.
- **Enrollment lifecycle:** auto-enroll on plan grant; manual admin enroll/revoke; (later) purchase-driven enroll.
- **Access evaluation** `canAccessCourse(userId, courseId)` and `canAccessNode(userId, nodeId)` returning `{ allowed, reason, teaserMode, lockedUntil? }`.
- **Drip evaluation:** compute a node's `unlockAt` from effective drip + enrollment date.
- **Prerequisite evaluation:** `any/all` prior-course completion (reads Progress).
- **Seat limit + access expiration + availability window** enforcement.
- Preview (`isPreview`) lessons accessible without enrollment.

**Out of Scope (owned elsewhere):**
- Membership plans/grants machinery → `membership-plan-system`.
- Restriction rule CRUD/engine → `content-restriction-system` (this system adds the `course` resource type + writes rules from the course editor).
- Progress data (completion) → `progress-completion-system` (read here for prerequisites).
- Billing/checkout → `commerce` / `commerceSubscriptions`.
- Player UI → `course-player-system`.

---

## 2. Data Model

### 2.1 `lms_enrollments`

```ts
lms_enrollments: defineTable({
  userId: v.id("users"),
  courseId: v.id("lms_courses"),
  source: v.union(v.literal("membership_plan"), v.literal("manual"), v.literal("purchase")),
  membershipPlanId: v.optional(v.id("membership_plans")),
  enrolledAt: v.number(),
  expiresAt: v.optional(v.number()),                  // from course.accessDurationDays or plan
  status: v.union(v.literal("active"), v.literal("expired"), v.literal("revoked")),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId", "status"])
  .index("by_course", ["courseId", "status"])
  .index("by_user_course", ["userId", "courseId"]);
```

### 2.2 Reused — `membership_restriction_rules`

Add `"course"` (and optionally `"lesson"`) to the `resourceType` union. A course's gating rule: `{ resourceType: "course", resourceIdOrKey: courseId, planIds: [...], requireAllPlans }`. No new table — the LMS contributes a resource type + writes rules from the course editor.

---

## 3. Functions

### 3.1 Queries
- `canAccessCourse(courseId, userId?)` → `{ allowed, reason, teaserMode, requiresLogin }` (wraps `checkAccess` + accessMode + availability window + seat/expiry).
- `canAccessNode(nodeId, userId?)` → course access AND drip unlock AND preview check → `{ allowed, lockedUntil?, reason }`.
- `getEnrollment(userId, courseId)` / `listEnrollmentsForUser(userId)` / `listEnrolleesForCourse(courseId)`.
- `getCourseUnlockSchedule(courseId, userId)` → per-node `unlockAt` map (drip), for the player.
- `checkPrerequisites(courseId, userId)` → `{ satisfied, missingCourses[] }`.

### 3.2 Mutations
- `enroll(userId, courseId, source, { membershipPlanId?, expiresAt? })` — idempotent; respects seat limit.
- `revoke(enrollmentId)` / `expire(enrollmentId)`.
- `setCourseRestriction(courseId, planIds[], requireAll)` — writes the `course` restriction rule (delegates to `content-restriction-system`).
- `syncFromMembership(userId)` — internal; reconciles enrollments when plan grants change (listens to `membership.*` events).

### 3.3 Internals
- `internals.computeUnlockAt(nodeId, enrolledAt)` — uses `resolveLessonDrip`.
- `internals.expireEnrollmentsCron` — daily expiry sweep.

All gated by `lmsEnabled` (+ `membershipEnabled` for plan gating). Admin ops require `lms.enroll.manage`.

---

## 4. Admin UI

- Course editor → **Access** panel: access mode + membership plan multi-select (writes the restriction rule) + availability window + seat limit + access duration.
- `/admin/lms/courses/$courseId/enrollees` — enrollee list: manual enroll, revoke, view source + expiry.
- `/admin/lms/enrollments` — global enrollment search.

---

## 5. Events

- `lms.enrolled / unenrolled / enrollment_expired / enrollment_revoked`
- `lms.access_denied`
- `lms.prerequisites_unmet`

---

## 6. Acceptance criteria

### 6.1 Data (declared in v1)
- [ ] `lms_enrollments` table + indexes exist in v1 schema (empty until fast-follow).
- [ ] `course` added to `membership_restriction_rules.resourceType`.

### 6.2 Fast-follow
- [ ] `canAccessCourse` / `canAccessNode` enforce membership gating server-side via `checkAccess`.
- [ ] Auto-enroll on plan grant; manual enroll/revoke; idempotent enroll respecting seat limit.
- [ ] Drip evaluation yields per-node `unlockAt` (lesson override → topic default → immediate).
- [ ] Prerequisite `any/all` evaluation reads Progress and blocks access when unmet.
- [ ] Access duration / availability window / preview lessons honored.
- [ ] Admin access panel writes restriction rules; enrollee management UI works.

---

## 7. References

- Code: `convex/lms/enrollment/*`, reuses `convex/membership/*`, `lms_enrollments`
- Reused PRDs: `content-restriction-system`, `membership-plan-system`
- Sibling PRDs: `course-system`, `progress-completion-system`, `course-player-system`
- Airtable: ConvexPress base / Systems / "Course Access & Enrollment System"
