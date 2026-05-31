# PLAN: Course Builder System — Build Sequence

> Companion to `PRD.md` (read first). Scaffold/conventions: `specs/codex-prds/LMS-PLUGIN-IMPLEMENTATION.md` (M0 assumed done).
> **For agentic workers:** task-by-task via `superpowers:subagent-driven-development`; `- [ ]` steps. **Verify gate every step:** `cd ConvexPress-Admin && bun run check-types` exits 0.

**Goal:** The `lms_nodes` recursive tree (owns the table) + structural CRUD/ordering + the drag-drop course builder UI.
**Prereqs:** M0 + `course-system` (needs `lms_courses`).
**Code home:** `convex/lms/nodes/` + `convex/schema/lms.ts` (`lms_nodes`); admin `apps/web/src/routes/_authenticated/_admin/lms/courses/$courseId/builder.tsx` + `apps/web/src/components/lms/builder/`.

## Decisions
- **One shared `lms_nodes` table** owned here; Topic/Lesson systems own their `kind`-specific columns (documented in their PRDs but the table is defined here).
- **Fractional `position`** (float midpoint inserts); `internals.renormalizePositions` rebalances when adjacent gaps < epsilon.
- Drag-drop with `@dnd-kit/core` + `@dnd-kit/sortable` (already in the admin app per commerce/menu builders — reuse, don't add a new dnd lib).
- Nesting validation centralized in `internals.validateNesting` so create/move share one rule set.

## Build Sequence

### Step 1 — Schema: `lms_nodes`
- **Files:** EDIT `convex/schema/lms.ts`.
- [ ] Add `lms_nodes` (full column set per PRD §2.1 — structural + topic-owned + lesson-owned columns all declared now so siblings just use them). Indexes: `by_course`, `by_parent` (`["parentId","position"]`), `by_course_kind`.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): lms_nodes schema (curriculum tree)`.

### Step 2 — Nesting + position internals
- **Files:** CREATE `convex/lms/nodes/internals.ts`, `convex/lms/nodes/validators.ts`.
- [ ] `validateNesting(kind, parentKind)` — top level allows `topic|section_heading`; under topic allows `lesson|section_heading`; reject otherwise, reject cross-course, reject cycles.
- [ ] `computePosition(parentId, afterNodeId?)` — fractional midpoint; `renormalizePositions(courseId)`.
- [ ] Verify: `bun run check-types` → 0.

### Step 3 — Structural mutations
- **Files:** CREATE `convex/lms/nodes/mutations.ts`.
- [ ] `createNode`, `renameNode`, `moveNode`, `deleteNode` (cascade subtree), `reorderSiblings`, `cloneTree` (PRD §3.1). Each: `requirePluginEnabled(ctx,"lms")` + `lms.builder.manage` + `validateNesting` + event dispatch (`lms.node_*`).
- [ ] `deleteNode` recursively collects descendants then deletes (and their `lms_lessonVersions` once Lesson exists — guard).
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): node structural mutations`.

### Step 4 — Tree queries
- **Files:** CREATE `convex/lms/nodes/queries.ts`.
- [ ] `getCourseTree(courseId)` → nested `{ topics: [{ node, children: [...] }] }` ordered by position; `getNode`, `getChildren`, `getStructureCounts`.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): tree queries`.

### Step 5 — Events + structure-count hook
- **Files:** EDIT event defs; EDIT `convex/lms/courses/queries.ts` consumer if cached counts used.
- [ ] Declare `lms.node_created/renamed/moved/deleted`, `lms.tree_cloned`, `lms.tree_reordered`. Course `getCourseSummary` reads `getStructureCounts`.
- [ ] Verify: `bun run check-types` → 0.

### Step 6 — Builder UI: tree component
- **Files:** CREATE `apps/web/src/components/lms/builder/CourseBuilder.tsx`, `BuilderNodeRow.tsx`; route `.../lms/courses/$courseId/builder.tsx`.
- [ ] Render `getCourseTree` as a single tree; each row: 6-dot drag handle (`@dnd-kit`), title, Edit + Remove. Inline "New Topic / New Lesson / New Section Heading" inputs.
- [ ] Wire drag end → `moveNode`/`reorderSiblings`; inline add → `createNode`; rename inline → `renameNode`; remove → confirm → `deleteNode`. Real-time via `useQuery` subscription; expand/collapse all; live counts.
- [ ] Empty state CTA → "Generate with AI" (`$courseId/generate`).
- [ ] Verify: `bun run check-types` → 0 + `bun run check:smoke:browser` (drag a node, confirm reorder persists). Commit: `feat(lms): drag-drop course builder UI`.

## MVP Definition of Done (from PRD §6.1)
- [ ] `lms_nodes` with `kind` + fractional `position`.
- [ ] Typed create with nesting validation (no topic-in-topic / lesson-in-lesson).
- [ ] Move/reparent + reorder as cheap writes; renormalization.
- [ ] Cascade delete subtrees.
- [ ] `getCourseTree` returns full nested structure.
- [ ] `cloneTree` deep-copies structure.
- [ ] Drag-drop builder: inline create/edit/remove, section headings, expand/collapse, autosave, real-time.
- [ ] `lms.builder.manage` + `lmsEnabled` enforced.

## Verify
```bash
cd ConvexPress-Admin && bun run check-types && bun run check:guardrails
bun run check:smoke:browser   # builder reorder smoke
```
