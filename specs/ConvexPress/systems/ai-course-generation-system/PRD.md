# PRD: AI Course Generation System

> **Project:** ConvexPress — LMS extension. AI-assisted generation of courses, topics, and lesson bodies.
> **Plugin:** `lms`. Mirrors the proven `convex/ai/` (Claude + Tavily) pipeline, reorganized for courses: **outline-first, human-gated, async per-lesson fan-out**, emitting Tiptap JSON with captured provenance.
> **Two-app architecture:** Admin (Convex Auth) + Website (Clerk). **Stack:** Bun, Base UI, Tailwind v4, Tiptap, Node-runtime Convex actions, `@anthropic-ai/sdk`, `@tavily/core`.
> **Canonical path:** `specs/ConvexPress/systems/ai-course-generation-system/PRD.md`
> **Airtable:** ConvexPress base / Systems / "AI Course Generation System".
> **Status:** Planned — v1 (authoring core). **Complexity:** Epic.
> **Depends on:** `course-system`, `course-builder-system`, `topic-system`, `lesson-system`.

---

## Integration with ConvexPress

**Positioning:** internal extension (`lms`) — the AI authoring engine for courses. A **sibling generator** to AI Content Generation, not a fork.
**Extension gate:** `lmsEnabled`; `requireLmsEnabled(ctx)`. Also requires `ANTHROPIC_API_KEY` + `TAVILY_API_KEY` (CONFIGURATION_ERROR if missing, like `convex/ai`).
**Code lives at:** `convex/lms/ai/` (`actions.ts`, `internals.ts`, `prompts.ts`, `jobs.ts`, `validators.ts`) + schema `lms_ai_generations`, `lms_jobs`. Admin generation UI at `.../_admin/lms/courses/$courseId/generate/`.

**Consumes these ConvexPress systems:**
- **AI Content Generation** — reuses the internal `generateWithClaude` and `researchTopic` (Tavily) actions in `convex/ai/internals.ts` rather than reimplementing model/research plumbing.
- **Course System** — creates/updates the `lms_courses` shell.
- **Course Builder System** — materializes the tree via `createNode` / `cloneTree`.
- **Lesson System** — writes generated Tiptap JSON into lesson `bodyDoc`.
- **Media System** — opt-in AI image generation writes Media records referenced by lesson images.
- **Event Dispatcher** — `lms.ai_*` events.
- **Role & Capability** — `lms.ai.generate`.

**Reference analog:** `ai-content-generation` PRD (the 9-step `generateAll` pipeline + `generateSection` regeneration). This system improves on its known limitations: **sequential → async fan-out**, **no streaming → progressive per-lesson save**, and **structured post fields → Tiptap lesson docs**.

---

## 1. Overview

### 1.1 Purpose

Generate most of a course with AI while keeping a human in control. The flow is **outline-first**: a brief produces a research-grounded Course → Topic → Lesson outline that the author **must approve**, then lesson bodies are generated **asynchronously, one job per lesson**, emitting Tiptap JSON with inline citations. Every generated artifact records **provenance** (model, prompt, sources, tokens, review status) and nothing is publishable until a human reviews it.

**Hard exclusion:** this system never generates quizzes, tests, assessments, or graded items — only course/topic/lesson **titles, structure, and body content (text + images)**.

### 1.2 Scope

**In Scope (v1):**
- **Stage 0 — Brief** (inline): topic, audience, knowledge level, tone, #topics, key points, optional source URLs.
- **Stage 1 — Outline** (job): Tavily research → Claude emits a structured `Course → Topic → Lesson` tree (titles + 1-line objective per leaf). **Human approval gate.** Regenerate-outline / refine-brief.
- **Stage 2 — Lesson bodies** (async fan-out, one job per lesson): per-lesson Tavily research → Claude writes a body grounded in snippets with citations → emit **Tiptap JSON** into `lms_nodes.bodyDoc`. Progressive save; lessons appear as they finish.
- **Stage 3 — Images** (opt-in, per placeholder job): Claude proposes image intents (alt + prompt) as placeholder nodes; generation is explicitly triggered per image.
- **Stage 4 — Per-lesson regenerate** (scoped job): re-run Stage 2 for one lesson, optionally with an edited prompt; rest of course untouched.
- **Provenance** (`lms_ai_generations`) + **job tracking** (`lms_jobs`) with a polling status UI.

**Out of Scope (owned elsewhere):**
- The course/topic/lesson tables + tree ops → `course-system`, `course-builder-system`, `lesson-system` (this system calls them).
- Model/Tavily plumbing → reused from `convex/ai/internals.ts`.
- Voiceover / captions / AI video → `ai-lesson-media-system` (deferred).
- Publishing / access → `course-system` / `course-access-enrollment-system`.

---

## 2. Data Model

### 2.1 `lms_ai_generations` (provenance — per 1EdTech AI-Generated Content best practices)

```ts
lms_ai_generations: defineTable({
  targetType: v.union(v.literal("course"), v.literal("node")),
  targetId: v.string(),                               // courseId or nodeId
  courseId: v.id("lms_courses"),
  stage: v.union(v.literal("outline"), v.literal("lesson_body"), v.literal("image")),
  model: v.string(),
  modelVersion: v.optional(v.string()),
  prompt: v.string(),
  briefJson: v.optional(v.any()),
  sourcesJson: v.optional(v.any()),                   // Tavily citations
  tokens: v.optional(v.number()),
  label: v.union(v.literal("fully_ai"), v.literal("ai_assisted"), v.literal("human")),
  reviewStatus: v.union(v.literal("unreviewed"), v.literal("reviewed")),
  reviewedBy: v.optional(v.id("users")),
  reviewedAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_course", ["courseId"]).index("by_target", ["targetType", "targetId"]);
```

### 2.2 `lms_jobs` (async generation tracking)

```ts
lms_jobs: defineTable({
  courseId: v.id("lms_courses"),
  kind: v.union(v.literal("outline"), v.literal("lesson_body"), v.literal("image")),
  targetId: v.optional(v.string()),                   // nodeId for lesson/image jobs
  status: v.union(v.literal("queued"), v.literal("running"), v.literal("done"), v.literal("failed")),
  error: v.optional(v.string()),
  progress: v.optional(v.number()),
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_course", ["courseId", "status"]);
```

---

## 3. Functions

### 3.1 Public actions (`convex/lms/ai/actions.ts`, Node runtime)
- `generateOutline({ courseId, brief })` → runs Stage 1; writes a proposed tree (held for approval) + a provenance row. Returns `{ jobId }`.
- `approveOutline({ courseId })` → materializes the approved tree via `course-builder-system.createNode` and enqueues a `lesson_body` job per lesson.
- `regenerateOutline({ courseId, brief })` / `refineBrief({ courseId, brief })`.
- `generateLessonBody({ nodeId })` / `regenerateLesson({ nodeId, promptOverride? })` → Stage 2 / Stage 4 for one lesson.
- `generateImage({ nodeId, placeholderId, prompt })` → Stage 3, one image.

### 3.2 Internal actions (`internals.ts`)
- `runOutlineJob` — Tavily research → `ai.internals.generateWithClaude` → parse structured tree JSON.
- `runLessonBodyJob` — Tavily (scoped) → `generateWithClaude` → convert to Tiptap JSON → `lessons.updateLessonBody` → write provenance + flip job done.
- `toTiptapDoc(markdownOrStructured)` — deterministic conversion to a Tiptap `doc` (headings/paragraphs/lists/image placeholders).

### 3.3 Mutations
- `markGenerationReviewed(generationId)` — flips `reviewStatus` to `reviewed` (set on human save/approve).

### 3.4 Authorization
- Caller must have `lms.ai.generate` **and** edit rights on the target course (mirrors `convex/ai` "can edit the target" model).

---

## 4. Admin UI

- `/admin/lms/courses/$courseId/generate` — the generation flow:
  - **Brief** step (wizard): topic, audience, level, tone, #topics, key points, source URLs.
  - **Outline review** step: editable tree (drag to reorder, add/delete, edit titles) + **Approve** / **Regenerate outline** / **Refine brief**. Nothing downstream runs until Approve.
  - **Generation** step: live job board (per-lesson status: queued/running/done/failed, retry); lessons become editable as they complete (real-time via Convex subscriptions — no page reload).
  - Per-lesson **Regenerate** + opt-in **Generate image** controls (also surfaced in the Lesson editor).
  - **Provenance panel**: model, prompt, sources, tokens, review status per artifact; a "needs review" badge until a human saves.

---

## 5. Events

- `lms.ai_outline_generated / outline_approved / outline_regenerated`
- `lms.ai_lesson_generated / lesson_regenerated`
- `lms.ai_image_generated`
- `lms.ai_generation_reviewed`
- `lms.ai_job_failed`

---

## 6. Acceptance criteria

### 6.1 v1
- [ ] Brief wizard captures generation inputs.
- [ ] Outline job produces a research-grounded Course → Topic → Lesson tree; **human approval gate** blocks downstream generation.
- [ ] Approve materializes the tree via Course Builder.
- [ ] Per-lesson body generation runs **async, one job per lesson**, with progressive save and real-time UI (no reload).
- [ ] Generated bodies land as **Tiptap JSON** in `lms_nodes.bodyDoc` with inline citations + `sourcesJson`.
- [ ] Per-lesson **regenerate** is scoped (does not touch other lessons).
- [ ] Opt-in per-placeholder image generation (never auto-fired course-wide).
- [ ] Every artifact writes `lms_ai_generations` provenance; defaults `reviewStatus: unreviewed`; publish gated on review.
- [ ] Reuses `convex/ai` `generateWithClaude` + `researchTopic`.
- [ ] `lmsEnabled` + `lms.ai.generate` + course-edit enforced; missing API keys → CONFIGURATION_ERROR.

### 6.2 Fast-follow
- [ ] Provenance label surfaced on the public course landing ("AI-assisted" tier) via Catalog & Discovery.
- [ ] Voiceover/caption generation handed to `ai-lesson-media-system`.

---

## 7. References

- Code: `convex/lms/ai/*`, `lms_ai_generations`, `lms_jobs`
- Reuses: `convex/ai/internals.ts` (`generateWithClaude`, `researchTopic`)
- Reference PRD: `ai-content-generation` (pipeline + regeneration + limitations this system improves on)
- Sibling PRDs: `course-builder-system`, `lesson-system`, `ai-lesson-media-system`
- Standard: 1EdTech AI-Generated Content Best Practices v1.0 (provenance fields)
- Airtable: ConvexPress base / Systems / "AI Course Generation System"
