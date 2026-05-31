# PRD: Course Builder System

> **Project:** ConvexPress — LMS extension. The curriculum tree + the visual drag-and-drop course builder.
> **Plugin:** `lms`. **Owns the `lms_nodes` table** (the shared curriculum backbone) and all structural/ordering operations.
> **Two-app architecture:** Admin (Convex Auth) + Website (Clerk). **Stack:** Bun, Base UI, Tailwind v4, Tiptap, `@dnd-kit` (drag-drop).
> **Canonical path:** `specs/ConvexPress/systems/course-builder-system/PRD.md`
> **Airtable:** ConvexPress base / Systems / "Course Builder System".
> **Status:** Planned — v1 (authoring core).
> **Depends on:** `course-system` (the `lms_courses` root). **Feeds:** `topic-system`, `lesson-system`, `ai-course-generation-system`.

---

## Integration with ConvexPress

**Positioning:** internal extension (`lms`) — the **curriculum structure** layer + builder UX.
**Extension gate:** `lmsEnabled`; `requireLmsEnabled(ctx)`.
**Code lives at:** `convex/lms/nodes/` (structural CRUD, ordering) + `convex/schema/lms.ts` (`lms_nodes`) + admin `.../_admin/lms/courses/$courseId/builder/`.
**Admin UI:** the course builder route + `<CourseBuilder>` tree component.

**Consumes:**
- **Course System** — every node belongs to a `courseId`.
- **Topic System** / **Lesson System** — own the per-`kind` semantic fields of the nodes this system structurally manages.
- **Event Dispatcher** — emits `lms.node_*` structural events.
- **Role & Capability** — `lms.builder.manage`.

**WordPress / LearnDash analog:** the LearnDash **Course Builder** (the drag-and-drop tree of Sections / Lessons / Topics with the 6-dot drag handles and inline create).

---

## 1. Overview

### 1.1 Purpose

The Course Builder System owns the **shape of a course**: the recursive node tree (`Course → Topic → Lesson`, plus title-only Section Headings), the **ordering** of nodes, and the **drag-and-drop builder UI** authors use to assemble it. It is the structural authority over `lms_nodes`; the Topic and Lesson systems own the *content* of the nodes, this system owns their *position, parentage, and kind*.

### 1.2 Scope

**In Scope (v1):**
- The `lms_nodes` table: one recursive table discriminated by `kind` (`topic | lesson | section_heading`).
- **Structural CRUD:** create node (typed), rename, move (reparent), delete (cascade), and clone-subtree.
- **Ordering** via **fractional `position`** (insert-between without renumbering siblings); reorder = single-row write.
- **Nesting rules / validation:** topics + section-headings are children of a course-root level; lessons + section-headings nest under topics; no topic-under-topic; no lesson-under-lesson.
- **Course tree query** — the full nested structure for the builder + (later) the player.
- **The builder UI:** single tree view, 6-dot drag handles, inline "New Topic / New Lesson / New Section Heading", inline rename, remove, expand/collapse all, per-row edit links into the Topic/Lesson editors.
- **Clone tree** — used by Course duplication and AI generation to materialize a structure.

**Out of Scope (owned elsewhere):**
- Topic semantic fields (description, drip default) → `topic-system`.
- Lesson content (Tiptap body, video, materials, lesson settings) → `lesson-system`.
- Course record + course-level settings → `course-system`.
- Generating a tree from a prompt → `ai-course-generation-system` (it calls this system's `createNode`/`cloneTree`).
- Learner-facing tree rendering/navigation → `course-player-system`.

---

## 2. Data Model

### 2.1 `lms_nodes` (the shared curriculum table — owned here)

```ts
lms_nodes: defineTable({
  courseId: v.id("lms_courses"),
  parentId: v.optional(v.id("lms_nodes")),            // null = top level under course
  kind: v.union(v.literal("topic"), v.literal("lesson"), v.literal("section_heading")),
  title: v.string(),
  position: v.number(),                               // fractional ordering within parent

  // --- Topic-owned fields (see topic-system) ---
  description: v.optional(v.string()),
  topicDripMode: v.optional(v.union(v.literal("immediately"), v.literal("enrollment_based"), v.literal("specific_date"))),
  topicDripOffsetDays: v.optional(v.number()),
  topicDripDate: v.optional(v.number()),

  // --- Lesson-owned fields (see lesson-system) ---
  bodyDoc: v.optional(v.any()),                       // Tiptap JSON (lessons)
  materialsDoc: v.optional(v.any()),                  // Tiptap JSON (lessons)
  videoUrl: v.optional(v.string()),
  videoProvider: v.optional(v.string()),
  videoMediaId: v.optional(v.id("media")),
  requireVideoWatch: v.optional(v.boolean()),
  autoComplete: v.optional(v.boolean()),
  completionDelaySec: v.optional(v.number()),
  minTimeSeconds: v.optional(v.number()),
  showMarkComplete: v.optional(v.boolean()),
  isPreview: v.optional(v.boolean()),
  lessonDripMode: v.optional(v.union(v.literal("immediately"), v.literal("enrollment_based"), v.literal("specific_date"))),
  lessonDripOffsetDays: v.optional(v.number()),
  lessonDripDate: v.optional(v.number()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_course", ["courseId"])
  .index("by_parent", ["parentId", "position"])
  .index("by_course_kind", ["courseId", "kind"]);
```

> The table is shared; **ownership is by concern.** Course Builder owns `courseId / parentId / kind / title / position` and the structural integrity of the tree. Topic-owned and Lesson-owned columns are documented authoritatively in their respective PRDs.

### 2.2 Fractional positioning

New node `position` = midpoint between neighbors (e.g., insert between 1.0 and 2.0 → 1.5). A periodic `internals.renormalizePositions(courseId)` rebalances to clean integers when gaps get small.

---

## 3. Functions

### 3.1 Mutations (`convex/lms/nodes/mutations.ts`)
- `createNode({ courseId, parentId?, kind, title, afterNodeId? })` → validates nesting, computes fractional `position`.
- `renameNode(nodeId, title)`.
- `moveNode(nodeId, { newParentId?, afterNodeId? })` → reparent + reposition with nesting validation.
- `deleteNode(nodeId)` → cascade delete subtree.
- `reorderSiblings(parentId, orderedNodeIds[])` → bulk fractional reassign.
- `cloneTree(sourceCourseId, targetCourseId)` → deep-copy structure (used by duplicate + AI).

### 3.2 Queries
- `getCourseTree(courseId)` → fully nested tree (`topics[] → { lessons[], headings[] }`) for the builder.
- `getNode(nodeId)` / `getChildren(parentId)`.
- `getStructureCounts(courseId)` → `{ topicCount, lessonCount }`.

### 3.3 Validation rules (`internals.validateNesting`)
- top level: `topic | section_heading`; under topic: `lesson | section_heading`.
- reject cycles, cross-course moves, and depth > 2 content levels.

All gated by `lmsEnabled` + `lms.builder.manage`.

---

## 4. Admin UI

- `/admin/lms/courses/$courseId/builder` — the builder:
  - single tree of Topics → (Lessons | Section Headings).
  - **6-dot drag handle** per row (`@dnd-kit`); drop to reorder/reparent within valid targets.
  - inline **New Topic / New Lesson / New Section Heading**; type title → Enter.
  - per-row **Edit** (→ Topic or Lesson editor) and **Remove** (confirm).
  - **Expand All / Collapse All**; live topic/lesson counts; autosave on every structural change (real-time via Convex subscription).
- Empty state offers **"Generate with AI"** (→ `ai-course-generation-system`).

---

## 5. Events

- `lms.node_created / renamed / moved / deleted`
- `lms.tree_cloned`
- `lms.tree_reordered`

(Course System listens to recompute cached structure counts.)

---

## 6. Acceptance criteria

### 6.1 v1
- [ ] `lms_nodes` table with `kind` discriminator + fractional `position`.
- [ ] Typed node create with nesting validation (no topic-in-topic, no lesson-in-lesson).
- [ ] Move/reparent + reorder as cheap single/bulk writes; renormalization cron.
- [ ] Cascade delete of subtrees.
- [ ] `getCourseTree` returns the full nested structure.
- [ ] `cloneTree` deep-copies a course's structure (powers duplicate + AI).
- [ ] Drag-and-drop builder with inline create/edit/remove, section headings, expand/collapse, autosave, real-time updates.
- [ ] `lms.builder.manage` enforced; `lmsEnabled` gate.

### 6.2 Fast-follow
- [ ] `getCourseTree` reused by `course-player-system` for learner navigation (with drip/lock state layered in by Progress/Access).

---

## 7. References

- Code: `convex/lms/nodes/*`, `convex/schema/lms.ts` (`lms_nodes`)
- Umbrella PRD: `specs/codex-prds/LMS-PLUGIN-PRD.md`
- Sibling PRDs: `course-system`, `topic-system`, `lesson-system`, `ai-course-generation-system`, `course-player-system`
- Airtable: ConvexPress base / Systems / "Course Builder System"
