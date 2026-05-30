# LMS Plugin - PRD and Implementation Strategy

**System:** LMS Plugin (Courses)
**Status:** Planned
**Priority:** P1 - High
**Complexity:** Epic
**Layer:** Full Stack / Plugin
**Target Project:** `ConvexPress`
**Plugin ID / Slug:** `lms`
**WordPress Equivalent:** LearnDash
**Last Authored:** 2026-05-30

---

## Intent

The LMS Plugin adds a full course-authoring and course-delivery system to
ConvexPress — courses, topics, and lessons — modeled after LearnDash's
structure and flow but built natively on the ConvexPress real-time,
type-safe substrate and designed for an AI-first authoring workflow.

It is deliberately scoped to **video-and-text courses**. There are **no
quizzes, tests, assignments, or grading** anywhere in this plugin, by
design (see Non-Goals). A lesson is a video plus a rich-text body; a
course is an ordered tree of topics and lessons.

The plugin leans hard on what ConvexPress already has:

- Tiptap content editor (lesson bodies)
- Media system (video + images)
- Taxonomy (course categories / tags)
- Revisions, Search (Meilisearch), SEO, Event Dispatcher
- Roles & Capabilities
- Membership + Content Restriction (course access gating)
- AI Content Generation (Claude + Tavily) — the engine the AI course
  generator mirrors

It adds a proper learning domain on top of those primitives:

- courses, topics, lessons, and a drag-and-drop course builder
- AI-assisted course/lesson generation with provenance
- enrollment + progress + certificates (fast-follow)
- membership-gated and (later) purchasable access

---

## Product Goals

1. Let an author build a complete course — Course → Topic → Lesson — with
   a LearnDash-style visual builder, where lessons carry a video and a
   full rich-text body (text + images + materials).
2. Let AI generate most of a course: outline → topics → lesson bodies,
   research-grounded (Tavily) and editable, with human review gates and
   captured provenance.
3. Reuse ConvexPress auth, roles, capabilities, editor, media, taxonomy,
   search, and membership rather than rebuilding them.
4. Gate course access through the existing Membership / Content
   Restriction system (plan-based), with per-course purchase as a later
   option.
5. Ship a learner experience — course player, progress, "mark complete",
   certificates — as a fast-follow on top of the authoring core.
6. Model the full domain up front (access, drip, prerequisites, points,
   certificates, progression) so deferred learner features require **no
   schema migration**.

---

## Non-Goals

This plugin does **not** include and will **not** own:

- **Quizzes, tests, exams, assignments, grading, or assessment of any
  kind.** Explicitly out of scope, now and for the foreseeable roadmap.
- Recurring billing, invoices, dunning, or payment collection (consumes
  `commerce` / `commerceSubscriptions` if a course is sold).
- The generic role/capability system (consumes it).
- The membership plan + grant machinery (consumes the `membership`
  plugin; the LMS only adds `course` as a restrictable resource type).
- AI video generation as a v1 promise (modeled as a slot; see AI Lesson
  Media System, deferred).

---

## Core Architectural Principles

**1. One recursive node tree, not parallel content tables.**
Topics and lessons live in a single `lms_nodes` table discriminated by
`kind` (`topic | lesson | section_heading`), parented under `lms_courses`
and ordered by a fractional `position`. Renaming a level, adding a level,
or reordering is a value change — never a migration.

**2. Lessons are CMS content, reusing the editor.**
A lesson body is a Tiptap document (same editor, extensions, and toolbar
as posts/pages/KB articles). A lesson is, mentally, a KB article with a
video slot and course-structure membership.

**3. Access is membership-gated, evaluated server-side.**
Course/lesson gating is expressed as `membership_restriction_rules` with
a new `course` resource type and evaluated via the existing
`checkAccess()` path. Enrollment is a thin record; the rule engine is
reused.

**4. AI authoring is outline-first and human-gated.**
A brief → a research-grounded outline (human approval gate) → async,
per-lesson body generation emitting Tiptap JSON with citations → opt-in
per-image generation → per-lesson regenerate. Every generated artifact
carries provenance (model, prompt, sources, tokens, review status) and
nothing publishes without a human pass.

**5. Build the authoring core first, the learner surface second.**
v1 is admin authoring + AI generation. The learner experience (player,
enrollment, progress, certificates) is a fast-follow, but its data model
ships in v1 so it slots in cleanly.

---

## Plugin Definition

### Plugin ID

- `lms`

### Dependencies

Required:

- Content Editor System (Tiptap)
- Media System
- Role & Capability System

Optional integrations:

- `membership` (course access gating — strongly recommended)
- `commerce` / `commerceSubscriptions` (selling courses, later)
- AI Content Generation (`convex/ai`) — reused by AI Course Generation

### Registry Integration

Add to:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Recommended metadata:

- `id`: `lms`
- `title`: `LMS`
- `description`: `Courses, topics, and lessons with AI-assisted authoring and membership-gated access`
- `settingsKey`: `lmsEnabled`
- `adminAccessPrefixes`: `["/admin/lms"]`
- `routePrefixes`: `["/courses", "/account/courses"]`

### Plugin Gating Rule

If `lmsEnabled === false`:

- LMS admin routes must not render
- public course routes must 404 / hide
- course access checks from the LMS must return inert (no enrollment,
  no gating side effects)

Disabled means inactive.

---

## Content Model (Hierarchy)

```
Course
└── Topic                (kind: "topic"  — module / grouping)
    ├── Section Heading  (kind: "section_heading" — title-only divider)
    └── Lesson           (kind: "lesson" — leaf content: video + rich text)
```

- **Course** — top-level container; owns access, prerequisites, points,
  certificate, progression mode, and SEO.
- **Topic** — a module that groups lessons within a course. A titled
  node with optional description and its own drip default.
- **Lesson** — the leaf. A video slot + a Tiptap body + images +
  materials + per-lesson settings (video progression, preview,
  mark-complete config, drip override).
- **Section Heading** — a title-only divider used to label runs of
  lessons inside a topic. No body, no settings.

Topics group lessons; lessons hold content. (This inverts LearnDash's
label nesting but uses identical mechanics; because the level is a
`kind` value, the labels are configuration, not schema.)

---

## Domain Model

Recommended tables (admin-owned Convex schema, `convex/schema/lms.ts`):

### `lms_courses`

Core entity + the full settings surface (most fields nullable; enforced
when the learner surface lands):

- `title`, `slug`, `description`, `excerpt`
- `status`: `draft | published | archived`
- `featuredImageId?` (Media), `categoryIds?` (Taxonomy), `tagIds?`
- **Access / commerce (nullable):** `accessMode`:
  `open | free | members | buy | recurring | closed`, `price?`, `recurringPrice?`,
  `billingInterval?`, `billingUnit?`, `trialPrice?`, `trialDays?`,
  `externalButtonUrl?`
- **Progression / gating:** `progressionMode`: `linear | free_form`,
  `pointsAwarded?`, `pointsRequired?`, `accessDurationDays?`,
  `startDate?`, `endDate?`, `seatLimit?`,
  `contentVisibility`: `always | enrollees_only`
- `certificateId?` (FK `lms_certificates`), `completionRedirectUrl?`,
  `materialsDoc?` (Tiptap)
- `createdBy`, `createdAt`, `updatedAt`

### `lms_nodes`

The recursive tree (topics + lessons + section headings):

- `courseId`, `parentId?`, `kind`: `topic | lesson | section_heading`
- `title`, `position` (fractional), `description?`
- **Lesson content:** `bodyDoc?` (Tiptap JSON), `materialsDoc?`,
  `videoUrl?`, `videoProvider?`, `videoMediaId?` (Media), image nodes
  inline in `bodyDoc`
- **Lesson settings (store now, enforce later):**
  `requireVideoWatch?`, `autoComplete?`, `completionDelaySec?`,
  `minTimeSeconds?`, `showMarkComplete?`, `isPreview?`
- **Drip:** `dripMode?`: `immediately | enrollment_based | specific_date`,
  `dripOffsetDays?`, `dripDate?`
- `createdAt`, `updatedAt`

### `lms_course_prerequisites` (join)

- `courseId`, `prereqCourseId`; `prereqMode` on course: `any | all`

### `lms_enrollments` (fast-follow; declared in v1)

- `userId`, `courseId`, `source`:
  `membership_plan | manual | purchase`, `membershipPlanId?`,
  `enrolledAt`, `expiresAt?`, `status`: `active | expired | revoked`

### `lms_progress` (fast-follow; declared in v1)

- `userId`, `nodeId`, `courseId`, `completedAt?`, `videoWatched?`,
  `timeSpentSec?`, `unlockAt?` (computed from drip)

### `lms_certificates` + `lms_certificate_issues` (fast-follow)

- `lms_certificates`: `title`, `templateDoc`, `orientation`, `meta`
- `lms_certificate_issues`: `userId`, `courseId`, `certificateId`,
  `issuedAt`, `serial`

### `lms_ai_generations` (provenance — v1)

Per 1EdTech AI-Generated Content best practices:

- `targetType`: `course | node`, `targetId`, `stage`:
  `outline | lesson_body | image`
- `model`, `modelVersion`, `prompt`, `briefJson`, `sourcesJson` (Tavily
  citations), `tokens`, `createdAt`
- `label`: `fully_ai | ai_assisted | human`, `reviewStatus`:
  `unreviewed | reviewed`, `reviewedBy?`, `reviewedAt?`

### `lms_jobs` (async generation tracking — v1)

- `kind`, `targetId`, `status`: `queued | running | done | failed`,
  `error?`, `progress?`, timestamps

### Reused, not redefined

- **`membership_restriction_rules`** — extend `resourceType` to include
  `course` (and optionally `lesson`). `planIds[]` per course expresses
  "which plans unlock this course." Evaluated by the existing
  `checkAccess()`.

---

## AI Authoring Model

The differentiator. Mirrors the proven `convex/ai/` pattern
(`generateWithClaude`, `researchTopic`) but reorganized for courses and
improved to be outline-first and async.

**Stage 0 — Brief (inline).** Topic, audience, knowledge level, tone,
number of topics, key points, optional source URLs/files.

**Stage 1 — Outline (job; fast).** Tavily research on the brief, then
Claude emits the full Course → Topic → Lesson tree as structured JSON
(titles + one-line objective per leaf + ordering). **Human gate #1:**
author edits/reorders/adds/deletes nodes; can regenerate the outline or
refine the brief. Nothing downstream runs until the outline is approved.

**Stage 2 — Lesson bodies (jobs; fan-out, one per lesson).** Per lesson:
Tavily search scoped to the lesson objective → Claude writes the body
grounded in retrieved snippets with inline citations → emit
Tiptap-compatible JSON (headings/paragraphs/lists/image placeholders) so
it drops into the editor losslessly. Lessons stream in as they complete.

**Stage 3 — Images (jobs; opt-in, per placeholder).** Claude proposes
image intents (alt + prompt) as placeholder nodes; actual generation is
explicitly triggered per image (never auto-fired course-wide).

**Stage 4 — Per-lesson regenerate (job; scoped).** Re-run Stage 2 for a
single lesson, optionally with an edited per-lesson prompt; the rest of
the course is untouched. No forced full-course regenerate.

Every step writes `lms_ai_generations` provenance and stays
`reviewStatus: unreviewed` until a human saves/approves; publish is
gated on human review.

Voiceover/captions/AI-video are **not** in this model — see AI Lesson
Media System (deferred).

---

## Access & Enrollment Model

- **Primary v1 model: membership-gated.** A course is unlocked by holding
  a membership plan. Expressed as a `membership_restriction_rules` row
  (`resourceType: "course"`, `planIds: [...]`) and evaluated server-side
  via `checkAccess("course", courseId, userId)`.
- **Enrollment** is a thin `lms_enrollments` record carrying `source`
  (`membership_plan | manual | purchase`) so a plan grant, an admin
  assignment, and a future direct purchase are the same row shape.
- **Later modes (modeled, not enforced in v1):** open, free, buy-now,
  recurring, closed — the price/billing fields exist on `lms_courses`
  so enabling standalone sale needs no migration.
- Gating, drip release, prerequisites, and seat/expiry are **stored in
  v1, enforced in the fast-follow** learner surface.

---

## System Map (→ Airtable Systems + one PRD each)

The plugin is decomposed into **11 systems**. Each becomes one Airtable
`Systems` record (linked to the `lms` Plugins record) and one
`specs/ConvexPress/systems/<slug>/PRD.md`. (No System Expert records or
expert prompts — out of scope for this plugin.)

| # | System | Slug | Phase | Priority | Complexity | Layer | Owns (one line) |
|---|---|---|---|---|---|---|---|
| 1 | Course System | `course-system` | v1 | P0 | Complex | Full Stack | `lms_courses`, lifecycle, course-level settings, category/tag |
| 2 | Topic System | `topic-system` | v1 | P1 | Medium | Full Stack | Topic nodes (modules), descriptions, drip defaults |
| 3 | Lesson System | `lesson-system` | v1 | P0 | Complex | Full Stack | Lesson leaf: Tiptap body, video slot, materials, settings |
| 4 | Course Builder System | `course-builder-system` | v1 | P1 | Complex | Admin | Tree mechanics, fractional ordering, section headings, drag-drop builder UX |
| 5 | AI Course Generation System | `ai-course-generation-system` | v1 | P1 | Epic | Full Stack | Outline-first generation, regenerate, provenance, jobs |
| 6 | Course Access & Enrollment System | `course-access-enrollment-system` | fast-follow | P1 | Complex | Full Stack | Membership gating, enrollment, drip + prerequisites, seat/expiry |
| 7 | Course Player System | `course-player-system` | fast-follow | P1 | Complex | Frontend | Learner consumption UI: outline nav, lesson view, playback, preview |
| 8 | Progress & Completion System | `progress-completion-system` | fast-follow | P1 | Complex | Full Stack | Mark-complete, video-watch enforcement, linear/free-form, % |
| 9 | Certificate System | `certificate-system` | fast-follow | P2 | Medium | Full Stack | Certificate templates, issuance on completion, verification |
| 10 | Course Catalog & Discovery System | `course-catalog-discovery-system` | fast-follow | P2 | Medium | Frontend | Public course browse/filter/search, catalog pages, SEO |
| 11 | AI Lesson Media System | `ai-lesson-media-system` | deferred | P3 | Epic | Full Stack | AI voiceover (TTS), auto-captions/transcription, AI video |

All systems: Category `Content & Marketing` (Course Access & Enrollment
may sit under `User & Auth`), Status `Designing` for v1 systems and `Not
Started` for fast-follow/deferred, Completion 0%.

---

## Admin UX Requirements

### Admin Routes

- `/admin/lms` — overview
- `/admin/lms/courses` — list + filter + search
- `/admin/lms/courses/new` — create
- `/admin/lms/courses/$courseId` — course settings
- `/admin/lms/courses/$courseId/builder` — the drag-drop course builder
- `/admin/lms/courses/$courseId/lessons/$nodeId` — lesson editor (Tiptap)
- `/admin/lms/courses/$courseId/generate` — AI generation (brief →
  outline review → lesson generation)
- `/admin/lms/certificates` — certificate templates (fast-follow)
- `/admin/lms/settings`

### Admin Features

- Course CRUD + publish lifecycle
- Visual course builder: inline create/edit/remove, drag-handle reorder,
  section headings, expand/collapse
- Lesson editor: Tiptap body, video slot, materials, lesson settings
- AI: brief wizard, outline review/approve, per-lesson generate +
  regenerate, opt-in image generation, provenance/review panel
- Membership-restriction control on the course (reuses the membership
  RestrictionMetabox pattern)

---

## Website UX Requirements (fast-follow)

### Public / Learner Routes

- `/courses` — catalog (Course Catalog & Discovery)
- `/courses/$slug` — course landing (curriculum, access CTA, preview
  lessons)
- `/account/courses` — my enrolled courses
- `/account/courses/$slug/$nodeId` — course player (lesson view)

### Public UX

- Catalog browse/filter by category, search
- Course landing with curriculum outline; preview ("sample") lessons
  visible to non-enrolled users
- Access CTA branches on membership (login vs upgrade), reusing the
  membership LoginCTA / UpgradeCTA pattern
- Course player: outline nav, video + body, materials, mark-complete,
  next/prev, progress indicator, linear gating when configured

---

## Settings Model

Add:

- `lmsEnabled`

LMS settings may include:

- default course access mode
- default lesson drip mode
- whether "mark complete" is shown by default
- default certificate template
- AI generation defaults (default topic count, tone, model, whether
  Tavily research is on by default)

---

## Capability Model

Recommended capabilities:

- `lms.course.view` / `lms.course.create` / `lms.course.edit` /
  `lms.course.publish` / `lms.course.delete`
- `lms.lesson.view` / `lms.lesson.edit` / `lms.lesson.delete`
- `lms.builder.manage`
- `lms.ai.generate`
- `lms.enroll.manage`
- `lms.certificate.manage`
- `lms.settings.manage`

Learner/customer access is **enrollment-based, not capability-based**
(mirrors the membership owner-based pattern).

---

## Reuse Map (Consumes these ConvexPress systems)

- **Content Editor System** — Tiptap lesson + materials bodies; shared
  toolbar/extensions with posts/pages/KB.
- **Media System** — lesson video + images; featured images.
- **Taxonomy System** — course categories + tags.
- **Revision System** — course/lesson revisions (mirror
  `kb_articleVersions`).
- **Search System** — Meilisearch index for courses + lessons.
- **SEO System** — per-course meta + structured data (Course schema) +
  sitemap inclusion.
- **Event Dispatcher** — emits `lms.course_*`, `lms.lesson_*`,
  `lms.enrolled`, `lms.completed`, `lms.certificate_issued`.
- **Role & Capability System** — `lms.*` capabilities.
- **Membership + Content Restriction** — course access gating via a new
  `course` resource type + `checkAccess()`.
- **AI Content Generation** — reuses `generateWithClaude` /
  `researchTopic` internals; AI Course Generation is a sibling generator,
  not a fork.
- **Custom Field System** — optional course/lesson meta.

**WordPress / LearnDash mental model:** Course → (Section) → Lesson →
Topic in LearnDash maps to Course → Topic → Lesson (+ Section Heading)
here; LearnDash quizzes are intentionally dropped.

---

## Rollout Plan

### Phase 1 — Authoring core (v1)

- Plugin registration + `lmsEnabled` gate + schema (`lms_courses`,
  `lms_nodes`, prerequisites, `lms_ai_generations`, `lms_jobs`)
- Course System, Topic System, Lesson System, Course Builder System
- AI Course Generation System (outline → lessons, regenerate,
  provenance)

### Phase 2 — Learner surface (fast-follow)

- Course Access & Enrollment (membership gating + `lms_enrollments`,
  drip, prerequisites)
- Course Player System
- Progress & Completion System
- Course Catalog & Discovery System

### Phase 3 — Recognition + discovery polish

- Certificate System (templates + issuance)
- SEO/structured data + sitemap for courses

### Phase 4 — AI media (deferred)

- AI Lesson Media System: voiceover (TTS), auto-captions/transcription,
  AI video — gated behind maturity.

---

## Acceptance Criteria

The plugin's authoring core (v1) is successful when:

- `lmsEnabled` registers the plugin and gates all LMS routes
- admins can create a course and build a Course → Topic → Lesson tree in
  a drag-drop builder with section headings and reordering
- a lesson holds a Tiptap body + a video + materials + lesson settings
- AI can generate a course outline (research-grounded, human-approved)
  and then generate/regenerate lesson bodies into the Tiptap editor,
  with provenance recorded and review gating enforced
- courses can be marked membership-restricted (rule stored; enforced
  when the learner surface ships)
- the domain model carries access, drip, prerequisite, points,
  certificate, and progression fields so the learner surface needs no
  migration

The learner surface (fast-follow) is successful when enrollment, the
course player, progress / "mark complete", drip + prerequisite
enforcement, and certificates work end-to-end on top of the v1 model.

**No quizzes, tests, assignments, or grading are in scope at any phase.**

---

## References

- Umbrella PRD (this file): `specs/codex-prds/LMS-PLUGIN-PRD.md`
- Per-system PRDs: `specs/ConvexPress/systems/<slug>/PRD.md` (11 systems)
- Sibling plugin PRDs: `MEMBERSHIP-PLUGIN-PRD.md`,
  `COMMERCE-CORE-PLUGIN-PRD.md`
- Reused systems: `ai-content-generation`, `content-restriction-system`,
  `membership-plan-system`, `kb-article-system` (closest structural
  analog), `content-editor-system`, `media-system`, `taxonomy-system`
- Airtable: `ConvexPress` registry base / `Plugins` (`lms`) + `Systems`
  (11 records)
