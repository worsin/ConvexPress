# PRD: Progress & Completion System

> **Project:** ConvexPress — LMS extension. Per-learner progress, lesson completion, and course completion.
> **Plugin:** `lms`. Tracks "mark complete", enforces video-watch/forced-timer rules, and computes course completion (which drives certificates).
> **Two-app architecture:** Admin (Convex Auth) + Website (Clerk). **Stack:** Bun, Base UI, Tailwind v4.
> **Canonical path:** `specs/ConvexPress/systems/progress-completion-system/PRD.md`
> **Airtable:** ConvexPress base / Systems / "Progress & Completion System".
> **Status:** Planned — fast-follow. Data model declared in v1.
> **Depends on:** `course-system`, `lesson-system`, `course-builder-system`, `course-access-enrollment-system`.

---

## Integration with ConvexPress

**Positioning:** internal extension (`lms`) — learner progress state + completion logic.
**Extension gate:** `lmsEnabled`; `requireLmsEnabled(ctx)`.
**Code lives at:** `convex/lms/progress/` + schema `lms_progress`, `lms_course_completions`.

**Consumes these ConvexPress systems:**
- **Lesson System** — reads `requireVideoWatch`, `autoComplete`, `completionDelaySec`, `minTimeSeconds`, `showMarkComplete`.
- **Course Builder System** — `getCourseTree` to compute total required nodes + ordering for linear gating.
- **Course Access & Enrollment** — must be enrolled to record progress; supplies prerequisites consumers.
- **Course System** — `progressionMode` (linear vs free-form), `pointsAwarded`/`pointsRequired`.
- **Event Dispatcher** — `lms.lesson_completed`, `lms.course_completed` (the latter triggers certificate issuance).
- **Role & Capability** — learner-owned (a user reads/writes their own progress); admins read via `lms.course.view`.

**LearnDash analog:** lesson/topic "Mark Complete", video progression gating, linear progression, and course completion that triggers certificates + points.

---

## 1. Overview

### 1.1 Purpose

Record what each learner has completed and decide when a lesson — and ultimately a course — is **complete**. Completion can be **manual** ("Mark Complete"), **auto** (after a video, with optional delay), or **gated** (requires full video watch and/or a forced minimum time). Course completion (all required nodes complete) emits the event that the Certificate System and points logic consume.

### 1.2 Scope

**In Scope (fast-follow):**
- `lms_progress` per (user, node): completion, video-watched flag, time spent, first/last seen.
- `lms_course_completions` per (user, course): completed timestamp, percent, points earned.
- **Completion logic:** manual mark-complete; auto-complete after video (+ delay); enforce `requireVideoWatch` + `minTimeSeconds` before allowing completion.
- **Course completion** detection (all required lessons complete) → emit `lms.course_completed`, award `pointsAwarded`.
- **Linear progression** gating: in `linear` mode, a node is completable only if prior siblings are complete.
- **Progress aggregation:** course percent, per-topic percent, next-incomplete-lesson resume pointer.
- Video heartbeat ingestion (watched fraction) from the player.

**Out of Scope (owned elsewhere):**
- Lesson settings definitions → `lesson-system`.
- Access/drip/prerequisite gating → `course-access-enrollment-system`.
- Certificate templates/issuance → `certificate-system` (consumes `lms.course_completed`).
- Player UI / video element → `course-player-system` (sends heartbeats + mark-complete).

---

## 2. Data Model

### 2.1 `lms_progress`

```ts
lms_progress: defineTable({
  userId: v.id("users"),
  courseId: v.id("lms_courses"),
  nodeId: v.id("lms_nodes"),
  completed: v.boolean(),
  completedAt: v.optional(v.number()),
  videoWatchedFraction: v.optional(v.number()),       // 0..1
  timeSpentSec: v.optional(v.number()),
  firstSeenAt: v.optional(v.number()),
  lastSeenAt: v.optional(v.number()),
})
  .index("by_user_course", ["userId", "courseId"])
  .index("by_user_node", ["userId", "nodeId"]);
```

### 2.2 `lms_course_completions`

```ts
lms_course_completions: defineTable({
  userId: v.id("users"),
  courseId: v.id("lms_courses"),
  completedAt: v.number(),
  percent: v.number(),
  pointsEarned: v.optional(v.number()),
}).index("by_user", ["userId"]).index("by_course", ["courseId"]);
```

---

## 3. Functions

### 3.1 Mutations
- `markComplete(nodeId)` — validates enrollment + (if `requireVideoWatch`) `videoWatchedFraction >= threshold` + `minTimeSeconds` met + (if linear) prior nodes complete. Writes progress; recomputes course completion.
- `markIncomplete(nodeId)`.
- `recordVideoProgress(nodeId, fraction, deltaSec)` — heartbeat; triggers auto-complete when configured.
- `recordVisit(nodeId)` — sets first/last seen + time.

### 3.2 Queries
- `getCourseProgress(userId, courseId)` → `{ percent, completedNodeIds[], nextNodeId, perTopic[] }`.
- `getNodeProgress(userId, nodeId)`.
- `isCourseComplete(userId, courseId)`.
- `canComplete(userId, nodeId)` → reason if blocked (video/timer/linear).

### 3.3 Internals
- `internals.recomputeCourseCompletion(userId, courseId)` — counts required lessons complete; on transition to complete, emits `lms.course_completed` + awards points.

Gated by `lmsEnabled`; learners operate on their own records only.

---

## 4. Admin UI

- Course editor → **Progress** read-only panel: completion rate, average percent, common drop-off lesson.
- `/admin/lms/courses/$courseId/enrollees` → per-enrollee progress (reuses Access enrollee list).
- (Learner-facing progress is rendered by `course-player-system`.)

---

## 5. Events

- `lms.lesson_completed / lesson_uncompleted`
- `lms.course_completed` (→ certificate issuance, points)
- `lms.video_progress_recorded`

---

## 6. Acceptance criteria

### 6.1 Data (declared in v1)
- [ ] `lms_progress` + `lms_course_completions` tables + indexes in v1 schema.

### 6.2 Fast-follow
- [ ] Manual mark-complete with enrollment check.
- [ ] Auto-complete after video with optional delay.
- [ ] `requireVideoWatch` + `minTimeSeconds` enforced before completion.
- [ ] Linear progression gating honored when `progressionMode === "linear"`.
- [ ] Course completion detected → `lms.course_completed` emitted + `pointsAwarded` granted once.
- [ ] `getCourseProgress` returns percent, per-topic, and resume pointer.
- [ ] Video heartbeats update `videoWatchedFraction` + time.

---

## 7. References

- Code: `convex/lms/progress/*`, `lms_progress`, `lms_course_completions`
- Sibling PRDs: `lesson-system`, `course-access-enrollment-system`, `course-player-system`, `certificate-system`
- Airtable: ConvexPress base / Systems / "Progress & Completion System"
