# PLAN: Progress & Completion System — Build Sequence

> Companion to `PRD.md` (read first). Scaffold/conventions: `specs/codex-prds/LMS-PLUGIN-IMPLEMENTATION.md` (M0 assumed). **Verify gate every step:** `cd ConvexPress-Admin && bun run check-types` exits 0.
> **For agentic workers:** task-by-task via `superpowers:subagent-driven-development`; `- [ ]` steps. **Milestone 2** (learner surface).

**Goal:** Per-learner `lms_progress` + completion logic (manual/auto/gated) + course-completion detection that fires `lms.course_completed`.
**Prereqs:** M1 complete + `course-access-enrollment-system` (must be enrolled to record progress). Consumed by `course-player-system` + `certificate-system`.
**Code home:** `convex/lms/progress/` + `convex/schema/lms.ts` (`lms_progress`, `lms_course_completions`).

## Decisions
- Completion validity is computed from lesson settings already stored: `requireVideoWatch` (needs `videoWatchedFraction >= 0.95`), `minTimeSeconds`, and linear gating (course `progressionMode === "linear"`).
- A learner only ever reads/writes **their own** progress rows (owner check; no extra capability).
- Course completion is recomputed in an internal after each lesson completion; transition to complete emits `lms.course_completed` **once** + awards `pointsAwarded` (idempotent via `lms_course_completions`).
- Video heartbeats are debounced writes from the player (every ~10s) → `recordVideoProgress`.

## Build Sequence

### Step 1 — Schema
- **Files:** EDIT `convex/schema/lms.ts`.
- [ ] Add `lms_progress` (PRD §2.1) + `lms_course_completions` (§2.2) with indexes.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): progress schema`.

### Step 2 — Completion logic internals
- **Files:** CREATE `convex/lms/progress/internals.ts`, `convex/lms/progress/helpers.ts`.
- [ ] `canComplete(ctx, userId, nodeId)` → checks enrollment + video-watch + min-time + linear-prior-complete; returns `{ ok, reason? }`.
- [ ] `recomputeCourseCompletion(userId, courseId)` → counts required lessons complete; on transition writes `lms_course_completions` + emits `lms.course_completed` + grants points (idempotent).
- [ ] Verify: `bun run check-types` → 0.

### Step 3 — Mutations
- **Files:** CREATE `convex/lms/progress/mutations.ts`, `convex/lms/progress/validators.ts`.
- [ ] `markComplete(nodeId)` (uses `canComplete`), `markIncomplete`, `recordVideoProgress(nodeId, fraction, deltaSec)` (auto-complete when configured), `recordVisit(nodeId)`. Each: `requirePluginEnabled(ctx,"lms")` + owner/enrollment check + recompute course completion + emit events.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): progress mutations + completion`.

### Step 4 — Queries
- **Files:** CREATE `convex/lms/progress/queries.ts`.
- [ ] `getCourseProgress(userId, courseId)` → `{ percent, completedNodeIds, nextNodeId, perTopic }`; `getNodeProgress`, `isCourseComplete`, `canComplete` (read wrapper for UI disable state).
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): progress queries`.

### Step 5 — Events
- [ ] Declare `lms.lesson_completed/lesson_uncompleted`, `lms.course_completed`, `lms.video_progress_recorded`. (Certificate + points consume `lms.course_completed`.) Verify: `bun run check-types` → 0.

### Step 6 — Admin: progress read-out
- **Files:** EDIT `.../lms/courses/$courseId/enrollees.tsx` (per-enrollee progress); add a course-level completion-rate panel.
- [ ] Completion rate, avg percent, common drop-off lesson. Verify: `bun run check-types` → 0 + `bun run check:smoke`. Commit: `feat(lms): admin progress read-out`.

## MVP Definition of Done (from PRD §6)
- [ ] (v1) `lms_progress` + `lms_course_completions` tables exist.
- [ ] Manual mark-complete with enrollment check.
- [ ] Auto-complete after video (+ delay).
- [ ] `requireVideoWatch` + `minTimeSeconds` enforced before completion.
- [ ] Linear progression gating honored.
- [ ] Course completion → `lms.course_completed` once + points granted once.
- [ ] `getCourseProgress` returns percent/per-topic/resume pointer.
- [ ] Video heartbeats update fraction + time.

## Verify
```bash
cd ConvexPress-Admin && bun run check-types && bun run check:guardrails
bun test packages/backend/convex/lms/progress/__tests__
```
