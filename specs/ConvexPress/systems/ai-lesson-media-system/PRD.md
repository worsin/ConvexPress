# PRD: AI Lesson Media System

> **Project:** ConvexPress — LMS extension. AI-generated lesson media: voiceover (TTS), auto-captions/transcription, and (later) AI video.
> **Plugin:** `lms`. The deferred AI-media tier layered on top of AI-generated lesson text.
> **Two-app architecture:** Admin (Convex Auth) generates; Website plays back. **Stack:** Bun, Node-runtime Convex actions, Media system, external TTS/STT/video providers.
> **Canonical path:** `specs/ConvexPress/systems/ai-lesson-media-system/PRD.md`
> **Airtable:** ConvexPress base / Systems / "AI Lesson Media System".
> **Status:** Planned — **deferred** (Phase 4). Lowest priority; gated on provider maturity.
> **Depends on:** `lesson-system`, `ai-course-generation-system`, `media-system`.

---

## Integration with ConvexPress

**Positioning:** internal extension (`lms`) — optional AI media generation for lessons. A **sibling** to AI Course Generation, reusing its job + provenance infrastructure.
**Extension gate:** `lmsEnabled` + a dedicated `lmsAiMediaEnabled` sub-flag (off by default). Requires provider API keys (TTS/STT/video) → CONFIGURATION_ERROR if absent.
**Code lives at:** `convex/lms/aimedia/` + reuses `lms_jobs` + `lms_ai_generations` (with `stage: "voiceover" | "captions" | "video"`). Media outputs stored via the Media system.

**Consumes these ConvexPress systems:**
- **Lesson System** — reads `bodyDoc` (script source) + `videoMediaId`; writes generated audio/caption/video references back onto the lesson.
- **AI Course Generation** — reuses `lms_jobs` (async tracking) + `lms_ai_generations` (provenance) infrastructure and the brief context.
- **Media System** — stores generated audio (MP3), caption files (VTT), and AI video (MP4).
- **Event Dispatcher** — `lms.ai_media_*`.
- **Role & Capability** — `lms.ai.generate`.

**Maturity note (from research):** TTS voiceover is reasonably mature (near-term); transcription/captions are mature; **AI video/avatars are not production-ready** in 2026 (renders stall, costs spike) — modeled here but treated as last/maybe.

---

## 1. Overview

### 1.1 Purpose

Generate **media** for lessons from their text/video: synthesize **voiceover narration** from a lesson body, produce **captions/transcripts** from a lesson video (or generated audio), and — eventually — generate **AI video** for lessons that have none. Each is opt-in per lesson, async, provider-backed, and provenance-tracked. This system deliberately stays separate so the v1 authoring core ships without depending on volatile media providers.

### 1.2 Scope

**In Scope (deferred — Phase 4, staged):**
- **Voiceover (TTS)** — generate narration audio from `bodyDoc` (script extraction → TTS → MP3 in Media → attach to lesson). *Near-term candidate.*
- **Captions/Transcription (STT)** — transcribe a lesson video/audio → VTT captions + searchable transcript; attach to lesson + feed Search. *Near-term candidate.*
- **AI Video** — generate a lesson video (script/avatar) → MP4 in Media → set as `videoMediaId`. *Last; gated on maturity; may remain experimental.*
- Per-lesson opt-in controls; provider selection in settings; cost/time surfaced; provenance recorded.

**Out of Scope (owned elsewhere):**
- Lesson text generation → `ai-course-generation-system`.
- Lesson content/settings → `lesson-system`.
- Manual video upload + playback → `lesson-system` / `course-player-system`.
- Quizzes/assessment → not in scope (none exist).

---

## 2. Data Model

No new tables. Extends:
- `lms_jobs.kind` → add `voiceover | captions | video`.
- `lms_ai_generations.stage` → add `voiceover | captions | video`.
- New lesson-owned references on `lms_nodes` (added when this phase is built):

```ts
// added to lms_nodes (lesson) when AI Lesson Media ships
audioMediaId: v.optional(v.id("media")),       // TTS narration
captionsMediaId: v.optional(v.id("media")),    // VTT
transcriptText: v.optional(v.string()),        // searchable transcript
aiVideoMediaId: v.optional(v.id("media")),     // generated video (maps onto videoMediaId when used)
```

---

## 3. Functions

### 3.1 Public actions (Node runtime, `convex/lms/aimedia/actions.ts`)
- `generateVoiceover({ nodeId, voice?, provider? })` → script from `bodyDoc` → TTS → Media → `audioMediaId`.
- `generateCaptions({ nodeId })` → STT on lesson video/audio → VTT + transcript → `captionsMediaId` + `transcriptText`.
- `generateVideo({ nodeId, style?, provider? })` → (experimental) AI video → Media → `aiVideoMediaId`.

### 3.2 Internals
- `runVoiceoverJob` / `runCaptionsJob` / `runVideoJob` — async via `lms_jobs`; write `lms_ai_generations` provenance + `reviewStatus: unreviewed`.
- `extractScript(bodyDoc)` — Tiptap → plain narration script.

### 3.3 Authorization
- `lms.ai.generate` + course-edit; `lmsAiMediaEnabled`; provider keys present.

---

## 4. Admin UI

- Lesson editor → **AI Media** panel (visible only when `lmsAiMediaEnabled`):
  - **Generate voiceover** (voice/provider) → preview/attach.
  - **Generate captions** → review transcript → attach VTT.
  - **Generate video** (experimental, clearly labeled) → preview → set as lesson video.
  - per-item provenance + cost/time + review state.

---

## 5. Events

- `lms.ai_media_voiceover_generated`
- `lms.ai_media_captions_generated`
- `lms.ai_media_video_generated`
- `lms.ai_media_job_failed`

---

## 6. Acceptance criteria

> Entirely deferred. No v1 obligations beyond leaving `lms_jobs`/`lms_ai_generations` extensible.

### 6.1 Phase 4 (staged)
- [ ] **Voiceover:** script extraction → TTS → MP3 in Media → attached + playable; provenance recorded.
- [ ] **Captions:** STT → VTT + transcript → attached; transcript indexed for Search.
- [ ] **AI Video (experimental):** generate → MP4 in Media → set as lesson video; clearly labeled experimental; failures handled gracefully.
- [ ] All gated by `lmsAiMediaEnabled` + provider keys; off by default.
- [ ] Reuses `lms_jobs` + `lms_ai_generations` (no parallel infra).

---

## 7. References

- Code: `convex/lms/aimedia/*` (reuses `lms_jobs`, `lms_ai_generations`)
- Sibling PRDs: `ai-course-generation-system`, `lesson-system`, `course-player-system`, `media-system`
- Research note: 2026 maturity — TTS/captions near-term; AI video not production-ready
- Airtable: ConvexPress base / Systems / "AI Lesson Media System"
