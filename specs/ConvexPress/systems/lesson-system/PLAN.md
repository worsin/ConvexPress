# PLAN: Lesson System — Build Sequence

> Companion to `PRD.md` (read first). Scaffold/conventions: `specs/codex-prds/LMS-PLUGIN-IMPLEMENTATION.md` (M0 assumed). **Verify gate every step:** `cd ConvexPress-Admin && bun run check-types` exits 0.
> **For agentic workers:** task-by-task via `superpowers:subagent-driven-development`; `- [ ]` steps.

**Goal:** Lesson leaf content — Tiptap body, video slot, materials, lesson settings — + section headings + lesson revisions. Provides the AI write target.
**Prereqs:** M0 + `course-system` + `course-builder-system` (lms_nodes exists) + `topic-system`.
**Code home:** `convex/lms/lessons/` (operates on `lms_nodes` `kind="lesson"`) + `convex/schema/lms.ts` (`lms_lessonVersions`); admin `.../lms/courses/$courseId/lessons/$nodeId.tsx`.

## Decisions
- Lesson-owned columns already declared on `lms_nodes` (Builder step). This system adds the body/video/settings functions, the **lesson editor** (reusing `components/editor`), and the **revisions** table.
- Body is **Tiptap JSON** in `bodyDoc` — the exact format AI generation emits, so no conversion at the seam.
- Video: paste URL → detect provider (`helpers.detectVideoProvider`) OR pick an uploaded Media video (`videoMediaId`) via the existing media picker (`components/media`).
- Revisions mirror `kb_articleVersions` (snapshot `bodyDoc` on save).

## Build Sequence

### Step 1 — Schema: `lms_lessonVersions`
- **Files:** EDIT `convex/schema/lms.ts`.
- [ ] Add `lms_lessonVersions` (`nodeId`, `bodyDoc`, `editedBy`, `createdAt`; index `by_node`).
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): lesson versions schema`.

### Step 2 — Validators + helpers
- **Files:** CREATE `convex/lms/lessons/validators.ts`, `convex/lms/lessons/helpers.ts`.
- [ ] Validators: `updateLessonBodyArgs`, `setVideoArgs`, `updateLessonSettingsArgs`, `setLessonDripArgs`.
- [ ] `helpers.detectVideoProvider(url)` → `"youtube"|"vimeo"|"wistia"|"bunny"|"other"`.
- [ ] Verify: `bun run check-types` → 0.

### Step 3 — Mutations
- **Files:** CREATE `convex/lms/lessons/mutations.ts`.
- [ ] `updateLessonBody` (snapshots a `lms_lessonVersions` row first), `updateLessonMaterials`, `setVideo`, `updateLessonSettings`, `setLessonDrip`, `restoreLessonVersion` (PRD §3.1). Each: `requirePluginEnabled(ctx,"lms")` + `lms.lesson.edit` + assert `kind === "lesson"` + emit `lms.lesson_*`.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): lesson mutations + revisions`.

### Step 4 — Queries
- **Files:** CREATE `convex/lms/lessons/queries.ts`.
- [ ] `getLesson`, `getLessonForEdit` (+ edit-permission), `listLessonVersions`, `getLessonPublicView(nodeId, { enrolled })` (returns body if `enrolled || isPreview`, else null — final access decision delegated to Access).
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): lesson queries`.

### Step 5 — Events
- [ ] Declare `lms.lesson_body_updated/materials_updated/video_set/settings_updated`, `lms.lesson_drip_changed`, `lms.lesson_version_restored`. Wire in mutations. Verify: `bun run check-types` → 0.

### Step 6 — Admin: lesson editor
- **Files:** CREATE `apps/web/src/routes/_authenticated/_admin/lms/courses/$courseId/lessons/$nodeId.tsx`; reuse `components/editor/*` + `components/media/*`.
- [ ] Tiptap body (shared editor incl. inline images via Media), Video field (URL→provider or Media pick), Materials sub-editor, Settings panel (require-video-watch, auto-complete + delay, forced timer, show mark-complete, preview toggle, drip override), revision history (restore), "Regenerate with AI" (→ AI Course Generation, per-lesson).
- [ ] Verify: `bun run check-types` → 0 + `bun run check:smoke`. Commit: `feat(lms): lesson editor (Tiptap + video + settings)`.

## MVP Definition of Done (from PRD §6.1)
- [ ] Lesson `bodyDoc` editable in shared Tiptap; inline images via Media.
- [ ] Video slot: URL (provider detected) or uploaded Media.
- [ ] Materials Tiptap sub-editor.
- [ ] All lesson settings persisted (no enforcement in v1).
- [ ] Lesson drip override stored.
- [ ] Section Heading nodes (title only) supported (via Builder).
- [ ] Lesson revisions via `lms_lessonVersions` + restore.
- [ ] `bodyDoc` is a clean AI write target.
- [ ] `lmsEnabled` + `lms.lesson.*` enforced.

## Verify
```bash
cd ConvexPress-Admin && bun run check-types && bun run check:guardrails
bun run check:smoke   # lesson editor save
```
