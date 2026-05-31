# PLAN: AI Course Generation System — Build Sequence

> Companion to `PRD.md` (read first). Scaffold/conventions: `specs/codex-prds/LMS-PLUGIN-IMPLEMENTATION.md` (M0 assumed). **Verify gate every step:** `cd ConvexPress-Admin && bun run check-types` exits 0.
> **For agentic workers:** task-by-task via `superpowers:subagent-driven-development`; `- [ ]` steps.

**Goal:** Outline-first, human-gated, async per-lesson AI generation into Tiptap, with provenance + job tracking. **Completes Milestone 1 (MVP).**
**Prereqs:** M0 + `course-system` + `course-builder-system` + `topic-system` + `lesson-system` (it writes courses/nodes/lesson bodies). Reuses `convex/ai/internals.ts`.
**Code home:** `convex/lms/ai/` + `convex/schema/lms.ts` (`lms_ai_generations`, `lms_jobs`); admin `.../lms/courses/$courseId/generate.tsx`.

## Decisions
- **Reuse, don't reimplement** model/research plumbing: import `generateWithClaude` + `researchTopic` from `convex/ai/internals.ts`. Add only LMS-specific prompts + the orchestration.
- All generation that calls Claude/Tavily runs in **Node-runtime actions** (`"use node"`) like `convex/ai/actions.ts`.
- **Async via `lms_jobs`** (improves on `convex/ai`'s sequential, page-reload design): outline = one job; lesson bodies = one job per lesson (fan-out); images = one job per placeholder. UI subscribes to `lms_jobs` (real-time, no reload).
- **Human gate is mandatory**: `generateOutline` writes a *proposed* tree held for review; nothing materializes until `approveOutline`.
- Output is **Tiptap JSON** via `internals.toTiptapDoc` (deterministic) → written through `lessons.updateLessonBody` (so revisions + events fire normally).
- Every artifact writes `lms_ai_generations` with `reviewStatus: "unreviewed"`.

## Build Sequence

### Step 1 — Schema: provenance + jobs
- **Files:** EDIT `convex/schema/lms.ts`.
- [ ] Add `lms_ai_generations` (PRD §2.1) + `lms_jobs` (PRD §2.2) with indexes.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): ai provenance + jobs schema`.

### Step 2 — Prompts + validators
- **Files:** CREATE `convex/lms/ai/prompts.ts`, `convex/lms/ai/validators.ts`.
- [ ] `OUTLINE_SYSTEM_PROMPT` (emit strict JSON tree: `{ topics: [{ title, lessons: [{ title, objective }] }] }`), `LESSON_BODY_PROMPT` (grounded body w/ inline `[n]` citations). Validators for each action's args.
- [ ] Verify: `bun run check-types` → 0.

### Step 3 — Internals (jobs + conversion)
- **Files:** CREATE `convex/lms/ai/internals.ts`, `convex/lms/ai/jobs.ts`.
- [ ] `runOutlineJob(courseId, brief)`: `researchTopic(brief)` → `generateWithClaude(OUTLINE_SYSTEM_PROMPT, …)` → parse JSON → store proposed tree (staging) + `lms_ai_generations` (stage `outline`) → mark job done.
- [ ] `runLessonBodyJob(nodeId)`: scoped `researchTopic(objective)` → `generateWithClaude(LESSON_BODY_PROMPT, …)` → `toTiptapDoc()` → `lessons.updateLessonBody(nodeId, doc)` → write provenance (`sourcesJson`, `tokens`) → job done.
- [ ] `toTiptapDoc(structured)` — deterministic map to a Tiptap `doc` (headings/paragraphs/lists/image-placeholder nodes). **No `window`/DOM**; pure.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): ai generation internals`.

### Step 4 — Public actions
- **Files:** CREATE `convex/lms/ai/actions.ts` (`"use node"`).
- [ ] `generateOutline`, `approveOutline` (materializes via `nodes.createNode` + enqueues a `lesson_body` job per lesson), `regenerateOutline`, `refineBrief`, `generateLessonBody`, `regenerateLesson`, `generateImage` (PRD §3.1). Each: auth = `lms.ai.generate` + course-edit (mirror `convex/ai` "can edit target"); throw `CONFIGURATION_ERROR` if `ANTHROPIC_API_KEY`/`TAVILY_API_KEY` missing.
- [ ] `markGenerationReviewed` mutation flips `reviewStatus`.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): ai generation actions`.

### Step 5 — Events
- [ ] Declare `lms.ai_outline_generated/outline_approved/outline_regenerated`, `lms.ai_lesson_generated/lesson_regenerated`, `lms.ai_image_generated`, `lms.ai_generation_reviewed`, `lms.ai_job_failed`. Verify: `bun run check-types` → 0.

### Step 6 — Admin: generation flow
- **Files:** CREATE `apps/web/src/routes/_authenticated/_admin/lms/courses/$courseId/generate.tsx` + `apps/web/src/components/lms/ai/` (BriefWizard, OutlineReview, JobBoard, ProvenancePanel).
- [ ] **Brief** wizard (topic/audience/level/tone/#topics/key points/URLs) → `generateOutline`.
- [ ] **Outline review**: editable tree (reorder/add/delete/edit titles) + **Approve** / **Regenerate outline** / **Refine brief**. Block downstream until Approve.
- [ ] **Generation**: live `lms_jobs` board (per-lesson queued/running/done/failed + retry); lessons become editable as they finish (real-time `useQuery`, no reload). Per-lesson Regenerate + opt-in Generate-image. Provenance/"needs review" badges.
- [ ] Verify: `bun run check-types` → 0 + `bun run check:smoke`. Commit: `feat(lms): ai course generation UI`.

## MVP Definition of Done (from PRD §6.1)
- [ ] Brief wizard captures inputs.
- [ ] Outline job → research-grounded tree; **human approval gate** blocks generation.
- [ ] Approve materializes the tree via Course Builder.
- [ ] Per-lesson body gen runs **async, one job per lesson**, progressive save, real-time (no reload).
- [ ] Bodies land as **Tiptap JSON** in `lms_nodes.bodyDoc` w/ citations + `sourcesJson`.
- [ ] Per-lesson regenerate is scoped.
- [ ] Opt-in per-placeholder image gen (never auto course-wide).
- [ ] Every artifact writes provenance; `reviewStatus: unreviewed`; publish gated on review.
- [ ] Reuses `convex/ai` `generateWithClaude` + `researchTopic`.
- [ ] `lmsEnabled` + `lms.ai.generate` + course-edit enforced; missing keys → CONFIGURATION_ERROR.

## Verify
```bash
cd ConvexPress-Admin && bun run check-types && bun run check:guardrails
# requires ANTHROPIC_API_KEY + TAVILY_API_KEY in the Convex env to exercise end-to-end
```

> **MVP MILESTONE:** after this system, run the MVP Definition checklist in `LMS-PLUGIN-IMPLEMENTATION.md` + `bun run check:smoke:browser`.
