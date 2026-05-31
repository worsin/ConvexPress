# PLAN: Course Player System — Build Sequence

> Companion to `PRD.md` (read first). Scaffold/conventions: `specs/codex-prds/LMS-PLUGIN-IMPLEMENTATION.md` (M0 assumed). **Verify gate every step:** `cd ConvexPress-Website && bun run check-types` exits 0.
> **For agentic workers:** task-by-task via `superpowers:subagent-driven-development`; `- [ ]` steps. **Milestone 2** — lives on the **Website** app (Convex consumer).

**Goal:** The learner-facing focus-mode player: outline + lesson view + video→progress + mark-complete, all access/drip/linear aware.
**Prereqs:** M1 + `course-access-enrollment-system` + `progress-completion-system`. Reads via the Website Convex consumer client.
**Code home:** `ConvexPress-Website/apps/web/src/routes/_dashboard/courses/` + `_marketing/courses/$slug` (landing) + `.../lib/lms/`.

## Decisions
- The Website is a **Convex consumer** — it never owns schema/mutations. The player composes existing queries; a single server-composed `getPlayerModel` keeps SSR fast and avoids waterfalls.
- **Access enforced server-side** — `getPlayableLesson` returns body only if `canAccessNode` allows or `isPreview`. Client gating is cosmetic only.
- Render Tiptap `bodyDoc` with the Website's existing Tiptap **renderer** (mirror how `_marketing/kb` renders article bodies — reuse, don't add a renderer).
- Video element emits debounced heartbeats (~10s) → `progress.recordVideoProgress`; Mark Complete disabled until `canComplete.ok`.

## Build Sequence

### Step 1 — Server-composed player model
- **Files:** CREATE `ConvexPress-Admin/.../convex/lms/player/queries.ts` (queries are admin-owned, consumed by website): `getPlayerModel(courseId, userId?)` (merges `nodes.getCourseTree` + `enrollment.getCourseUnlockSchedule`/`canAccessNode` + `progress.getCourseProgress` into the `PlayerNode[]` view-model from PRD §2) and `getPlayableLesson(nodeId, userId?)`.
- [ ] Verify (admin): `cd ConvexPress-Admin && bun run check-types` → 0. Commit: `feat(lms): player model queries`.

### Step 2 — Website lib + access wrapper
- **Files:** CREATE `ConvexPress-Website/apps/web/src/lib/lms/courseAccess.ts`, `.../lib/lms/renderLessonDoc.tsx`.
- [ ] Thin wrappers over the consumer client + the Tiptap render. Verify: `cd ConvexPress-Website && bun run check-types` → 0.

### Step 3 — Course landing
- **Files:** CREATE `ConvexPress-Website/apps/web/src/routes/_marketing/courses/$slug.tsx` (SSR).
- [ ] Hero (title/image/promo video/excerpt), Tiptap description, curriculum outline (locked/preview marked), access CTA branching on `canAccessCourse` (Enroll / Login / Upgrade / Buy). Preview lessons clickable. Verify: `bun run check-types` → 0.

### Step 4 — The player
- **Files:** CREATE `ConvexPress-Website/apps/web/src/routes/_dashboard/courses/index.tsx` ("My Courses") + `.../_dashboard/courses/$slug/$nodeId.tsx` (player) + `apps/web/src/components/lms/Player*.tsx`.
- [ ] Left: collapsible outline with state icons (complete/current/available/locked/preview) + progress bar; locked rows show reason + drip timer. Center: title, video (provider-aware + uploaded Media), Tiptap body, materials. Footer: **Mark Complete** (disabled until `canComplete.ok`) + Next/Prev; auto-advance; resume at `nextNodeId`. Video heartbeats → `recordVideoProgress`. On course complete → certificate CTA (if assigned).
- [ ] Verify: `cd ConvexPress-Website && bun run check-types` → 0; manual smoke: enroll → watch → mark complete → progress persists. Commit: `feat(lms): course player (focus mode)`.

## MVP Definition of Done (from PRD §6.1)
- [ ] Non-enrolled see landing + preview + correct CTA (login vs upgrade).
- [ ] Enrolled get focus-mode player (outline, video, Tiptap body, materials).
- [ ] Node state renders from access + progress; locked lessons show reason + drip timer.
- [ ] Video heartbeats recorded; Mark Complete disabled until watch/timer satisfied.
- [ ] Mark Complete + auto-advance + resume-at-next.
- [ ] Course/topic progress bars accurate.
- [ ] Linear locks unreachable lessons; free-form allows any order.
- [ ] All access enforced server-side (`getPlayerModel`/`getPlayableLesson`).

## Verify
```bash
cd ConvexPress-Admin && bun run check-types          # player queries
cd ConvexPress-Website && bun run check-types         # player UI
```
