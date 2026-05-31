# PRD: Lesson System

> **Project:** ConvexPress — LMS extension. The Lesson — the leaf content unit (a video + a rich-text body).
> **Plugin:** `lms`. Owns the **lesson content semantics** of `lms_nodes` (`kind: "lesson"` and `kind: "section_heading"`); the table + tree mechanics are owned by `course-builder-system`.
> **Two-app architecture:** Admin (Convex Auth) + Website (Clerk). **Stack:** Bun, Base UI, Tailwind v4, **Tiptap**.
> **Canonical path:** `specs/ConvexPress/systems/lesson-system/PRD.md`
> **Airtable:** ConvexPress base / Systems / "Lesson System".
> **Status:** Planned — v1 (authoring core).
> **Depends on:** `course-system`, `course-builder-system`, `topic-system`.

---

## Integration with ConvexPress

**Positioning:** internal extension (`lms`) — the **Lesson** leaf content + the title-only **Section Heading**.
**Extension gate:** `lmsEnabled`; `requireLmsEnabled(ctx)`.
**Code lives at:** `convex/lms/lessons/` (lesson content queries/mutations on `lms_nodes` where `kind = "lesson"`). Schema columns live in `lms_nodes` (owned by Course Builder). Admin editor under `.../_admin/lms/courses/$courseId/lessons/$nodeId`.

**Consumes these ConvexPress systems:**
- **Content Editor System** — the lesson `bodyDoc` + `materialsDoc` are Tiptap documents; reuses the shared editor, toolbar, and extensions used by posts/pages/KB articles.
- **Media System** — lesson video (`videoMediaId` for uploaded video) and inline images embedded in the Tiptap body.
- **Revision System** — lesson body revisions mirror `kb_articleVersions`.
- **Course Builder System** — uses `createNode/moveNode/getChildren` for structure; owns the table.
- **Topic System** — lessons resolve drip from parent topic when not overridden.
- **Event Dispatcher** — `lms.lesson_*`.
- **Role & Capability** — `lms.lesson.edit`, `lms.lesson.delete`.

**WordPress / LearnDash analog:** the LearnDash **Lesson/Topic** content panel: video URL + display timing + progression, lesson materials, sample (preview) flag, forced timer, drip schedule.

---

## 1. Overview

### 1.1 Purpose

A **Lesson** is the leaf of the curriculum: a **video slot** plus a **Tiptap rich-text body** (text, inline images, embeds), optional **materials**, and a set of **lesson settings** (video progression, auto-complete, forced timer, mark-complete visibility, preview, drip override). The Lesson System owns this content and its editor. It also owns the **Section Heading** (a title-only divider with no body or settings).

### 1.2 Scope

**In Scope (v1):**
- Lesson content on `lms_nodes`: `bodyDoc` (Tiptap), `materialsDoc` (Tiptap), and the video slot (`videoUrl` + `videoProvider`, or `videoMediaId` for uploaded video).
- **Lesson settings (stored now; enforced by learner systems later):** `requireVideoWatch`, `autoComplete`, `completionDelaySec`, `minTimeSeconds`, `showMarkComplete`, `isPreview`, and the lesson drip override (`lessonDripMode/OffsetDays/Date`).
- Lesson **editor**: Tiptap body, video field (paste URL → provider detected, or pick uploaded Media), materials sub-editor, settings panel.
- **Section Heading** create/rename (title only) — delegated structurally to Course Builder.
- Lesson body **revisions** (reuse Revision System).
- Provide a stable **write target for AI generation** (`ai-course-generation-system` writes Tiptap JSON into `bodyDoc`).

**Out of Scope (owned elsewhere):**
- Node create/move/reorder/delete + nesting → `course-builder-system`.
- Topic semantics → `topic-system`.
- Video-watch / completion **enforcement** → `progress-completion-system`.
- Drip **enforcement** → `course-access-enrollment-system`.
- Learner playback UI → `course-player-system`.
- AI generation pipeline → `ai-course-generation-system`.

---

## 2. Data Model

Lesson data lives in `lms_nodes` (defined in `course-builder-system`). **Lesson-owned columns:**

```ts
// on lms_nodes where kind === "lesson"
bodyDoc: v.optional(v.any()),                         // Tiptap JSON — the lesson body
materialsDoc: v.optional(v.any()),                    // Tiptap JSON — supplemental materials
videoUrl: v.optional(v.string()),                     // watch URL / embed
videoProvider: v.optional(v.string()),                // "youtube" | "vimeo" | "wistia" | "bunny" | "upload" | ...
videoMediaId: v.optional(v.id("media")),              // when video is an uploaded Media file

requireVideoWatch: v.optional(v.boolean()),           // gate mark-complete on full watch
autoComplete: v.optional(v.boolean()),                // auto-mark complete after video
completionDelaySec: v.optional(v.number()),
minTimeSeconds: v.optional(v.number()),               // forced lesson timer
showMarkComplete: v.optional(v.boolean()),            // default true
isPreview: v.optional(v.boolean()),                   // "sample" — visible to non-enrolled

lessonDripMode: v.optional(v.union(
  v.literal("immediately"), v.literal("enrollment_based"), v.literal("specific_date"))),
lessonDripOffsetDays: v.optional(v.number()),
lessonDripDate: v.optional(v.number()),
```

`kind: "section_heading"` rows use only `title` (+ structural columns); all lesson-owned fields are null.

Lesson revisions: `lms_lessonVersions` (mirrors `kb_articleVersions`):

```ts
lms_lessonVersions: defineTable({
  nodeId: v.id("lms_nodes"),
  bodyDoc: v.any(),
  editedBy: v.id("users"),
  createdAt: v.number(),
}).index("by_node", ["nodeId"]);
```

---

## 3. Functions

### 3.1 Mutations (`convex/lms/lessons/mutations.ts`)
- `updateLessonBody(nodeId, bodyDoc)` → saves Tiptap body; snapshots a revision.
- `updateLessonMaterials(nodeId, materialsDoc)`.
- `setVideo(nodeId, { videoUrl?, videoProvider?, videoMediaId? })` → detects provider from URL.
- `updateLessonSettings(nodeId, settingsPatch)` → video progression, auto-complete, timer, mark-complete, preview.
- `setLessonDrip(nodeId, dripMode, { offsetDays?, date? })`.
- `restoreLessonVersion(nodeId, versionId)`.

> Create / rename / move / delete a lesson or section heading → `course-builder-system`.

### 3.2 Queries
- `getLesson(nodeId)` → full lesson (body, video, materials, settings).
- `getLessonForEdit(nodeId)` → lesson + caller edit permission.
- `listLessonVersions(nodeId)`.
- `getLessonPublicView(nodeId, { enrolled })` → body if accessible or `isPreview`, else null (helper for player/landing; access decision delegated to Access & Enrollment).

Gated by `lmsEnabled` + `lms.lesson.*`.

---

## 4. Admin UI

- `/admin/lms/courses/$courseId/lessons/$nodeId` — the lesson editor:
  - **Tiptap body** (shared editor: headings, lists, callouts, code, embeds, inline images via Media).
  - **Video** field: paste URL (provider auto-detected) or pick an uploaded Media video.
  - **Materials** sub-editor (Tiptap).
  - **Settings panel:** require-video-watch, auto-complete + delay, forced timer, show mark-complete, **preview (sample)** toggle, **drip override**.
  - **Regenerate with AI** action (→ `ai-course-generation-system`, per-lesson).
  - revision history (restore/compare).
- Section Heading: inline title edit in the builder (no editor page).

---

## 5. Events

- `lms.lesson_body_updated / materials_updated / video_set / settings_updated`
- `lms.lesson_drip_changed`
- `lms.lesson_version_restored`

---

## 6. Acceptance criteria

### 6.1 v1
- [ ] Lesson `bodyDoc` editable in the shared Tiptap editor; inline images via Media.
- [ ] Video slot: URL (provider auto-detected) or uploaded Media video.
- [ ] Materials Tiptap sub-editor.
- [ ] All lesson settings persisted (video progression, auto-complete, timer, mark-complete, preview) — no enforcement required in v1.
- [ ] Lesson drip override stored.
- [ ] Section Heading nodes (title only) supported.
- [ ] Lesson body revisions via `lms_lessonVersions` with restore.
- [ ] `bodyDoc` is a clean write target for AI-generated Tiptap JSON.
- [ ] `lmsEnabled` + `lms.lesson.*` enforced.

### 6.2 Fast-follow
- [ ] `requireVideoWatch` / `autoComplete` / `minTimeSeconds` consumed by `progress-completion-system`.
- [ ] `isPreview` honored by `course-player-system` + course landing.
- [ ] lesson drip consumed by `course-access-enrollment-system`.

---

## 7. References

- Code: `convex/lms/lessons/*` (operates on `lms_nodes`), `lms_lessonVersions`
- Table owner: `course-builder-system`
- Structural analog: `kb-article-system` (Tiptap content + versioning)
- Sibling PRDs: `course-builder-system`, `topic-system`, `ai-course-generation-system`, `progress-completion-system`, `course-player-system`
- Airtable: ConvexPress base / Systems / "Lesson System"
