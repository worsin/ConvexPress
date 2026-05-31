# PRD: Topic System

> **Project:** ConvexPress — LMS extension. The Topic node — the module that groups lessons within a course.
> **Plugin:** `lms`. Owns the **topic semantics** of `lms_nodes` (`kind: "topic"`); the table + tree mechanics are owned by `course-builder-system`.
> **Two-app architecture:** Admin (Convex Auth) + Website (Clerk). **Stack:** Bun, Base UI, Tailwind v4.
> **Canonical path:** `specs/ConvexPress/systems/topic-system/PRD.md`
> **Airtable:** ConvexPress base / Systems / "Topic System".
> **Status:** Planned — v1 (authoring core).
> **Depends on:** `course-system`, `course-builder-system`.

---

## Integration with ConvexPress

**Positioning:** internal extension (`lms`) — the **Topic** node kind (a course module / grouping of lessons).
**Extension gate:** `lmsEnabled`; `requireLmsEnabled(ctx)`.
**Code lives at:** `convex/lms/topics/` (topic-scoped queries/mutations operating on `lms_nodes` where `kind = "topic"`). Schema columns live in `lms_nodes` (owned by Course Builder).
**Admin UI:** topic create/rename happens inline in the builder; topic detail (description + drip default) at `.../_admin/lms/courses/$courseId/topics/$nodeId`.

**Consumes:**
- **Course Builder System** — uses `createNode/renameNode/moveNode` for structural changes and `getCourseTree` for context.
- **Course System** — topics belong to a course.
- **Event Dispatcher** — `lms.topic_*` (thin wrappers over node events).
- **Role & Capability** — `lms.course.edit` (topics are edited under course-edit authority; no separate topic capability).

**WordPress / LearnDash analog:** in LearnDash, Lessons group Topics; here the **Topic** is the grouping level (a module) and the Lesson is the leaf. Mechanics are identical; the label is the `kind` value.

---

## 1. Overview

### 1.1 Purpose

A **Topic** is a titled module inside a course that groups lessons. It is intentionally light: a title, an optional short description, an ordering position (owned by the builder), and an optional **drip default** that its child lessons inherit unless they override it. The Topic System defines those topic-specific semantics and the small UI for editing them.

### 1.2 Scope

**In Scope (v1):**
- Topic semantics on `lms_nodes`: `description`, and the topic-level drip default (`topicDripMode`, `topicDripOffsetDays`, `topicDripDate`).
- Topic-scoped read/write helpers (list topics for a course, get a topic with its lessons, update topic fields).
- Topic detail editor (description + drip default).
- **Drip inheritance contract:** a lesson with no drip override inherits its parent topic's drip default (resolved by Access & Enrollment at enforcement time).

**Out of Scope (owned elsewhere):**
- Creating/moving/reordering/deleting topic nodes → `course-builder-system`.
- Lesson content → `lesson-system`.
- Drip **enforcement** → `course-access-enrollment-system`.
- Course-level settings → `course-system`.

---

## 2. Data Model

Topic data lives in `lms_nodes` (defined in `course-builder-system`). **Topic-owned columns:**

```ts
// on lms_nodes where kind === "topic"
description: v.optional(v.string()),
topicDripMode: v.optional(v.union(
  v.literal("immediately"),
  v.literal("enrollment_based"),
  v.literal("specific_date"),
)),
topicDripOffsetDays: v.optional(v.number()),         // for enrollment_based
topicDripDate: v.optional(v.number()),               // for specific_date
```

No separate table. Topic identity = `lms_nodes` row with `kind = "topic"`; children are `lms_nodes` with `parentId = topicId`.

---

## 3. Functions

### 3.1 Mutations (`convex/lms/topics/mutations.ts`)
- `updateTopic(nodeId, { description?, drip? })` → patches topic-owned fields (validates `kind === "topic"`).
- `setTopicDrip(nodeId, dripMode, { offsetDays?, date? })`.

> Create / rename / move / delete a topic → call `course-builder-system` (`createNode({ kind: "topic" })`, `renameNode`, `moveNode`, `deleteNode`).

### 3.2 Queries
- `listTopics(courseId)` → ordered topics for a course.
- `getTopicWithLessons(nodeId)` → a topic + its child lessons/headings (delegates to `getChildren`).
- `resolveLessonDrip(lessonNodeId)` → effective drip = lesson override ?? parent topic default ?? "immediately" (shared helper used by Access & Enrollment).

Gated by `lmsEnabled` + `lms.course.edit`.

---

## 4. Admin UI

- Inline in the builder: create/rename/reorder topics (Course Builder UI).
- `/admin/lms/courses/$courseId/topics/$nodeId` — topic detail: description field + drip-default control (Immediately / N days after enrollment / specific date).

---

## 5. Events

- `lms.topic_updated`
- `lms.topic_drip_changed`

(Structural `lms.node_*` events are emitted by Course Builder.)

---

## 6. Acceptance criteria

### 6.1 v1
- [ ] Topic-owned fields (`description`, drip default) persisted on `lms_nodes`.
- [ ] `updateTopic` / `setTopicDrip` validate `kind === "topic"`.
- [ ] `listTopics` + `getTopicWithLessons` return ordered structure.
- [ ] `resolveLessonDrip` correctly cascades lesson → topic → default.
- [ ] Topic detail editor (description + drip default).
- [ ] `lmsEnabled` + `lms.course.edit` enforced.

### 6.2 Fast-follow
- [ ] `resolveLessonDrip` consumed by `course-access-enrollment-system` for release gating.

---

## 7. References

- Code: `convex/lms/topics/*` (operates on `lms_nodes`)
- Table owner: `course-builder-system` (`lms_nodes`)
- Sibling PRDs: `course-system`, `course-builder-system`, `lesson-system`, `course-access-enrollment-system`
- Airtable: ConvexPress base / Systems / "Topic System"
