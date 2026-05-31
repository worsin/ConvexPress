# PLAN: AI Lesson Media System — Build Sequence

> Companion to `PRD.md` (read first). Scaffold/conventions: `specs/codex-prds/LMS-PLUGIN-IMPLEMENTATION.md` (M0 assumed). **Verify gate every step:** `cd ConvexPress-Admin && bun run check-types` exits 0.
> **For agentic workers:** task-by-task via `superpowers:subagent-driven-development`; `- [ ]` steps. **Milestone 3 — deferred.** Build only when prioritized; off by default.

**Goal:** Opt-in AI media for lessons — voiceover (TTS), captions/transcription, and (experimental) AI video — reusing the AI job + provenance infra.
**Prereqs:** M1 (`lesson-system`, `ai-course-generation-system`). Provider API keys (TTS/STT/video). Behind a new `lmsAiMediaEnabled` sub-flag.
**Code home:** `convex/lms/aimedia/` (reuses `lms_jobs` + `lms_ai_generations`); lesson editor AI-Media panel.

## Decisions
- **No new tables.** Extend `lms_jobs.kind` and `lms_ai_generations.stage` unions with `voiceover|captions|video`; add nullable media-ref columns to `lms_nodes` (`audioMediaId`, `captionsMediaId`, `transcriptText`, `aiVideoMediaId`).
- **Reuse the AI infra** from `ai-course-generation-system` (job board, provenance, review gating) — this is a sibling generator, not new plumbing.
- **Stage by maturity:** voiceover → captions (both near-term) → AI video (experimental, clearly labeled, graceful failure). Each independently shippable.
- Gated by `lmsAiMediaEnabled` **and** `lms.ai.generate` **and** provider keys present.

## Build Sequence

### Step 1 — Schema extensions + sub-flag
- **Files:** EDIT `convex/schema/lms.ts` (union widenings + lesson media-ref columns); EDIT `apps/web/src/lib/plugins/registry.ts` (add `lmsAiMediaEnabled` to settings values).
- [ ] Widen `lms_jobs.kind` + `lms_ai_generations.stage` with `voiceover|captions|video`; add `audioMediaId/captionsMediaId/transcriptText/aiVideoMediaId` to `lms_nodes`. Add `lmsAiMediaEnabled`.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): ai-media schema extensions + sub-flag`.

### Step 2 — Voiceover (TTS)
- **Files:** CREATE `convex/lms/aimedia/actions.ts` (`"use node"`), `convex/lms/aimedia/internals.ts`, `convex/lms/aimedia/helpers.ts`.
- [ ] `helpers.extractScript(bodyDoc)` (Tiptap → plain narration). `generateVoiceover({ nodeId, voice?, provider? })` → `runVoiceoverJob` (TTS provider → MP3 → Media → `audioMediaId` + provenance). Gate: `lmsAiMediaEnabled` + `lms.ai.generate` + keys.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): ai voiceover`.

### Step 3 — Captions / transcription (STT)
- [ ] `generateCaptions({ nodeId })` → `runCaptionsJob` (STT on lesson video/audio → VTT Media `captionsMediaId` + `transcriptText`); feed transcript to Search index. Verify: `bun run check-types` → 0. Commit: `feat(lms): ai captions/transcription`.

### Step 4 — AI video (experimental)
- [ ] `generateVideo({ nodeId, style?, provider? })` → `runVideoJob` (AI video provider → MP4 → Media → `aiVideoMediaId`, mappable onto the lesson video slot). Label experimental; handle provider stalls/failures gracefully (job `failed` + clear UI message). Verify: `bun run check-types` → 0. Commit: `feat(lms): ai video (experimental)`.

### Step 5 — Events + lesson-editor panel
- **Files:** EDIT lesson editor (`$nodeId.tsx`) → add **AI Media** panel (only when `lmsAiMediaEnabled`).
- [ ] Declare `lms.ai_media_voiceover_generated/captions_generated/video_generated/job_failed`. Panel: generate voiceover (voice/provider), generate captions (review transcript), generate video (experimental); per-item provenance + cost/time + review state; reuse the `ai-course-generation` JobBoard component.
- [ ] Verify: `bun run check-types` → 0 + `bun run check:smoke`. Commit: `feat(lms): ai media panel`.

## Definition of Done (from PRD §6.1 — deferred)
- [ ] Voiceover: script → TTS → MP3 in Media → attached/playable + provenance.
- [ ] Captions: STT → VTT + transcript → attached; transcript indexed for Search.
- [ ] AI Video (experimental): generate → MP4 in Media → lesson video; labeled; failures graceful.
- [ ] All behind `lmsAiMediaEnabled` + keys; off by default.
- [ ] Reuses `lms_jobs` + `lms_ai_generations` (no parallel infra).

## Verify
```bash
cd ConvexPress-Admin && bun run check-types && bun run check:guardrails
# requires TTS/STT/video provider keys in Convex env to exercise end-to-end
```
