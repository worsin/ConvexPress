# PRD: Course Player System

> **Project:** ConvexPress — LMS extension. The learner-facing course consumption experience (the "focus mode" player).
> **Plugin:** `lms`. The public/authenticated surface where enrolled learners watch lessons, read bodies, and mark complete.
> **Two-app architecture:** Website (Clerk) consumes the admin-owned Convex deployment. **Stack:** React 19, TanStack Start (SSR), Base UI, Tailwind v4, Tiptap renderer.
> **Canonical path:** `specs/ConvexPress/systems/course-player-system/PRD.md`
> **Airtable:** ConvexPress base / Systems / "Course Player System".
> **Status:** Planned — fast-follow.
> **Depends on:** `course-builder-system`, `lesson-system`, `course-access-enrollment-system`, `progress-completion-system`.

---

## Integration with ConvexPress

**Positioning:** internal extension (`lms`) — the **learner** course UI on the website app.
**Extension gate:** `lmsEnabled`; routes hidden/404 when disabled.
**Code lives at:** `ConvexPress-Website/apps/web/src/routes/_dashboard/courses/` (player) + `ConvexPress-Website/.../lib/lms/` (access + Tiptap rendering). Reads via the Convex consumer client.

**Consumes these ConvexPress systems:**
- **Course Builder System** — `getCourseTree` for the curriculum outline/navigation.
- **Lesson System** — lesson body (Tiptap render), video slot, materials.
- **Course Access & Enrollment** — `canAccessNode` + `getCourseUnlockSchedule` to lock/unlock and show drip timers; preview lessons for non-enrolled.
- **Progress & Completion** — render progress, "Mark Complete", send video heartbeats, resume pointer.
- **Media System** — video playback + images.
- **Website Layout / Auth UI** — shell, Clerk login prompts.
- **SEO System** — course landing meta (shared with Catalog & Discovery).

**LearnDash analog:** LearnDash **Focus Mode** — distraction-free lesson view with a collapsible course outline, progress bar, video, content, materials, and a Mark Complete / Next control.

---

## 1. Overview

### 1.1 Purpose

Deliver the lesson to the learner. The player renders the **course outline** (topics → lessons with lock/complete state), the **active lesson** (video + Tiptap body + materials), and the **completion controls** (Mark Complete, Next/Previous), wiring video playback to Progress heartbeats and respecting access, drip, and linear-progression rules.

### 1.2 Scope

**In Scope (fast-follow):**
- **Course landing → enrolled player** transition; "Take this Course" / access CTA (login vs upgrade) for non-enrolled.
- **Outline navigation:** topics + lessons with per-node state — complete ✓, current, **locked** (drip `lockedUntil`, prerequisite, or linear), preview-available.
- **Lesson view:** SSR-rendered Tiptap body, video player (provider-aware: YouTube/Vimeo/Wistia/Bunny/uploaded Media), materials section.
- **Video → progress:** emit watched-fraction heartbeats; honor `requireVideoWatch` (disable Mark Complete until watched) and forced timer.
- **Mark Complete + auto-advance**; **resume** at next-incomplete lesson.
- **Progress bar** (course + per-topic).
- **Preview ("sample") lessons** viewable without enrollment.
- Linear mode: lock not-yet-reachable lessons.

**Out of Scope (owned elsewhere):**
- Access/drip/prereq decisions → `course-access-enrollment-system` (player calls it).
- Progress writes/logic → `progress-completion-system` (player calls it).
- Catalog/browse/search → `course-catalog-discovery-system`.
- Certificate rendering/download → `certificate-system` (player links to it on completion).
- Authoring → admin systems.

---

## 2. Data Model

No owned tables. The player composes:
- `getCourseTree(courseId)` (Course Builder)
- `getCourseUnlockSchedule(courseId, userId)` + `canAccessNode` (Access)
- `getCourseProgress(userId, courseId)` + `getLessonPublicView` (Progress + Lesson)

A small client view-model merges tree + access + progress into a render tree:

```ts
type PlayerNode = {
  nodeId; kind; title;
  state: "complete" | "current" | "available" | "locked" | "preview";
  lockedUntil?: number;        // drip
  lockReason?: "drip" | "prerequisite" | "linear" | "enrollment";
};
```

---

## 3. Functions

Mostly client composition + a couple of read endpoints:
- `queries.getPlayerModel(courseId, userId?)` — server-composed render tree (tree + access + progress) in one call for SSR.
- `queries.getPlayableLesson(nodeId, userId?)` — lesson body/video/materials if `canAccessNode` allows or `isPreview`; else teaser.
- Writes delegate to Progress (`markComplete`, `recordVideoProgress`) and Access (enroll on CTA).

Gated by `lmsEnabled`; access enforced server-side (never trust client gating).

---

## 4. Website UI

- `/courses/$slug` — course landing: hero, description, curriculum outline (locked/preview), instructor, access CTA. (Shared with Catalog & Discovery.)
- `/dashboard/courses` — "My Courses" (enrolled).
- `/dashboard/courses/$slug/$nodeId` — the **player**:
  - left: collapsible outline with state icons + progress bar.
  - center: lesson title, video, Tiptap body, materials.
  - footer: **Mark Complete** (disabled until watch/timer satisfied) + **Next/Previous**.
  - completion → certificate link/CTA when course complete.

---

## 5. Events

(Player triggers events via Progress/Access; it owns no new events.) Consumes `lms.lesson_completed` / `lms.course_completed` for reactive UI.

---

## 6. Acceptance criteria

### 6.1 Fast-follow
- [ ] Non-enrolled users see the landing + preview lessons + correct CTA (login vs upgrade).
- [ ] Enrolled learners get the focus-mode player with outline, video, Tiptap body, materials.
- [ ] Node state (complete/current/available/locked/preview) renders from access + progress; locked lessons show reason + drip timer.
- [ ] Video heartbeats recorded; Mark Complete disabled until `requireVideoWatch`/timer satisfied.
- [ ] Mark Complete + auto-advance + resume-at-next-incomplete.
- [ ] Course/topic progress bars accurate.
- [ ] Linear mode locks unreachable lessons; free-form allows any order.
- [ ] All access enforced server-side via `getPlayerModel`/`getPlayableLesson`.

---

## 7. References

- Code: `ConvexPress-Website/.../routes/_dashboard/courses/*`, `.../lib/lms/*`
- Composes: `course-builder-system`, `course-access-enrollment-system`, `progress-completion-system`, `lesson-system`
- Analog: LearnDash Focus Mode; `website-user-dashboard-ui`
- Airtable: ConvexPress base / Systems / "Course Player System"
