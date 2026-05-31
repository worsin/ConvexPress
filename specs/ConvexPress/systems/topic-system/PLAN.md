# PLAN: Topic System — Build Sequence

> Companion to `PRD.md` (read first). Scaffold/conventions: `specs/codex-prds/LMS-PLUGIN-IMPLEMENTATION.md` (M0 assumed). **Verify gate every step:** `cd ConvexPress-Admin && bun run check-types` exits 0.
> **For agentic workers:** task-by-task via `superpowers:subagent-driven-development`; `- [ ]` steps.

**Goal:** Topic-node semantics (description + drip default) + the drip-resolution helper that Access reuses.
**Prereqs:** M0 + `course-system` + `course-builder-system` (the `lms_nodes` table + structural ops already exist).
**Code home:** `convex/lms/topics/` (operates on `lms_nodes` where `kind="topic"`); admin `.../lms/courses/$courseId/topics/$nodeId.tsx`.

## Decisions
- **No new table or columns** — topic-owned columns (`description`, `topicDripMode/OffsetDays/Date`) were declared on `lms_nodes` in the Builder step. This system only adds the topic-scoped functions + the small editor.
- Structural create/rename/move/delete are **not re-implemented** — call `convex/lms/nodes` (Course Builder).
- `resolveLessonDrip` is the canonical drip cascade (lesson override → topic default → "immediately"); placed here because the topic default is the middle of the cascade. Access & Enrollment imports it.

## Build Sequence

### Step 1 — Validators
- **Files:** CREATE `convex/lms/topics/validators.ts`.
- [ ] `updateTopicArgs` (`{ nodeId, description?, drip? }`), `setTopicDripArgs`.
- [ ] Verify: `bun run check-types` → 0.

### Step 2 — Mutations
- **Files:** CREATE `convex/lms/topics/mutations.ts`.
- [ ] `updateTopic(nodeId, patch)` and `setTopicDrip(nodeId, dripMode, opts)`. Each: `requirePluginEnabled(ctx,"lms")` + `lms.course.edit` + assert the node's `kind === "topic"` (else `ConvexError VALIDATION_ERROR`) + patch + emit `lms.topic_updated` / `lms.topic_drip_changed`.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): topic mutations`.

### Step 3 — Queries + drip resolver
- **Files:** CREATE `convex/lms/topics/queries.ts`, `convex/lms/topics/helpers.ts`.
- [ ] `listTopics(courseId)` (ordered topics), `getTopicWithLessons(nodeId)` (topic + children via `nodes.getChildren`).
- [ ] `helpers.resolveLessonDrip(ctx, lessonNodeId)` → reads lesson drip override; if absent reads parent topic default; else `"immediately"`. Returns `{ dripMode, offsetDays?, date? }`. Export for Access & Enrollment.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): topic queries + drip resolver`.

### Step 4 — Admin: topic detail editor
- **Files:** CREATE `apps/web/src/routes/_authenticated/_admin/lms/courses/$courseId/topics/$nodeId.tsx`.
- [ ] Description field + drip-default control (Immediately / N days after enrollment / specific date). Topic create/rename/reorder stays inline in the builder.
- [ ] Verify: `bun run check-types` → 0 + `bun run check:smoke`. Commit: `feat(lms): topic detail editor`.

## MVP Definition of Done (from PRD §6.1)
- [ ] Topic-owned fields persisted on `lms_nodes`.
- [ ] `updateTopic`/`setTopicDrip` validate `kind === "topic"`.
- [ ] `listTopics` + `getTopicWithLessons` return ordered structure.
- [ ] `resolveLessonDrip` cascades lesson → topic → default correctly.
- [ ] Topic detail editor (description + drip default).
- [ ] `lmsEnabled` + `lms.course.edit` enforced.

## Verify
```bash
cd ConvexPress-Admin && bun run check-types && bun run check:guardrails
```
