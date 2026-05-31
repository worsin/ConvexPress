# LMS Plugin — Implementation Plan (Front-to-Back to MVP)

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes.
> This is the **master build order + shared scaffold** for the LMS extension. Each system has its own `specs/ConvexPress/systems/<slug>/PLAN.md` build sequence that **assumes Milestone 0 (this doc) is done** and references these conventions instead of repeating them.

**Goal:** Implement the `lms` extension (Course → Topic → Lesson, AI-assisted authoring, membership-gated) on ConvexPress, front-to-back, reaching **MVP = the v1 authoring core** and then the learner surface.

**Architecture:** A ConvexPress "core/builtin" plugin (the KB/Membership pattern): one schema file spread into the hub, per-area Convex function modules under `convex/lms/`, hand-registered in the admin plugin registry, gated by the generic plugin-enable helper. The learner surface lives on the Website app as a Convex consumer.

**Tech Stack:** Convex (TS), TanStack Router (admin) + TanStack Start (website), Base UI, Tailwind v4, Tiptap v3, `@dnd-kit`, `@anthropic-ai/sdk` + `@tavily/core` (reused via `convex/ai`).

---

## Ground-Truth Conventions (verified in repo — supersede PRD phrasing)

| Concern | Ground truth |
|---|---|
| **Plugin id** | `"lms"`; settings key `lmsEnabled` |
| **Gate** | `requirePluginEnabled(ctx, "lms")` / `isPluginEnabled(ctx, "lms")` from `ConvexPress-Admin/packages/backend/convex/helpers/plugins.ts`. **(PRDs say `requireLmsEnabled` — use the generic helper instead.)** |
| **Schema** | Create `convex/schema/lms.ts` exporting `lmsTables`; `import { lmsTables } from "./schema/lms"` + spread `...lmsTables` in `convex/schema.ts` |
| **Backend code** | `convex/lms/<area>/{queries,mutations,internals,validators}.ts` (mirror `convex/kb/` + `convex/membership/`) |
| **AI reuse** | `convex/ai/internals.ts` → `generateWithClaude`, `researchTopic` (Node-runtime actions) |
| **Capabilities** | `lms.*` caps seeded via the role/capability system (`convex/schema/capabilities.ts`); check with `convex/helpers/permissions.ts` |
| **Events** | dispatch via `convex/helpers/events.ts`; declare codes in `convex/schema/eventDefinitions.ts` |
| **Admin registry** | `apps/web/src/lib/plugins/registry.ts` — add `"lms"` to `BuiltinAdminPluginId`, `lmsEnabled` to `BuiltinPluginSettingsValues`, + a registry entry (icon `GraduationCap`) |
| **Admin nav** | `apps/web/src/lib/admin-shell/nav-config.ts` |
| **Admin routes** | `apps/web/src/routes/_authenticated/_admin/lms/` (file-based; `lms.tsx` layout + children, mirror `_admin/kb`) |
| **Editor reuse** | `apps/web/src/components/editor/*` (Tiptap), `components/media/*` (video/images) |
| **Website** | `ConvexPress-Website/apps/web/src/routes/_marketing/courses/*` + `_dashboard/courses/*` |
| **Verify gate** | `cd ConvexPress-Admin && bun run check-types` (turbo). Also `bun run check:guardrails`, `bun run check:smoke`. Backend tests in `convex/**/__tests__`. |

---

## MVP Definition

**MVP (Milestone 1) is reached when**, with `lmsEnabled` on, an admin can:
1. Create a course (draft → publish) with metadata + settings.
2. Build a `Course → Topic → Lesson` tree in the drag-drop builder (with section headings + reordering).
3. Edit a lesson: Tiptap body + video + materials + settings.
4. AI-generate a course (brief → approved outline → async per-lesson bodies into Tiptap) with provenance + review gating.

The **learner surface** (enrollment, player, progress, certificates, catalog) is **Milestone 2** — built on the same v1 schema, no migration.

---

## Build Order (front-to-back)

### Milestone 0 — Plugin Scaffold (do this first; unblocks all systems)

**Files:**
- Create `convex/schema/lms.ts` (empty `export const lmsTables = {}` to start).
- Modify `convex/schema.ts` (import + spread `lmsTables`).
- Modify `apps/web/src/lib/plugins/registry.ts` (union + settings key + entry).
- Modify `apps/web/src/lib/admin-shell/nav-config.ts` (LMS nav group, gated on `lmsEnabled`).
- Create `apps/web/src/routes/_authenticated/_admin/lms.tsx` (gated layout) + `lms/index.tsx` (placeholder overview).
- Seed `lms.*` capabilities into the capability registry.

- [ ] **Step 0.1 — Baseline green.** Run `cd ConvexPress-Admin && bun install && bun run check-types` → exits **0**. (Establishes clean start.)
- [ ] **Step 0.2 — Schema stub + hub wire.** Create `convex/schema/lms.ts`:
  ```ts
  // convex/schema/lms.ts
  export const lmsTables = {} as const; // tables added per-system plan
  ```
  Edit `convex/schema.ts`: add `import { lmsTables } from "./schema/lms";` and `...lmsTables,` inside `defineSchema({ ... })`. Verify: `bun run check-types` → 0.
- [ ] **Step 0.3 — Register the plugin.** In `registry.ts`: add `"lms"` to `BuiltinAdminPluginId`; add `lmsEnabled: boolean` to `BuiltinPluginSettingsValues`; add a registry entry `{ id: "lms", title: "LMS", description: "Courses, topics, and lessons with AI-assisted authoring", settingsKey: "lmsEnabled", icon: GraduationCap, adminAccessPrefixes: ["/admin/lms"], routePrefixes: ["/courses", "/account/courses"] }` (match the shape of the `knowledgeBase` entry). Import `GraduationCap` from `lucide-react`. Verify: `bun run check-types` → 0.
- [ ] **Step 0.4 — Gate + nav + routes.** Add LMS nav group in `nav-config.ts` (gated on `lmsEnabled`). Create `_admin/lms.tsx` layout that calls the standard plugin-route guard (mirror `_admin/kb.tsx`) and `_admin/lms/index.tsx` placeholder. Verify: `bun run check-types` → 0 and the route renders behind the enable flag.
- [ ] **Step 0.5 — Capabilities seed.** Add `lms.course.view/create/edit/publish/delete`, `lms.lesson.edit/delete`, `lms.builder.manage`, `lms.ai.generate`, `lms.enroll.manage`, `lms.certificate.manage`, `lms.settings.manage` to the capability registry; grant to Administrator/Editor per the role matrix (Author = own courses). Verify: `bun run check-types` → 0.
- [ ] **Step 0.6 — Commit.** `git add -A && git commit -m "feat(lms): plugin scaffold (schema hub, registry, gate, nav, caps)"`.

**Proves:** the LMS plugin exists, toggles via `lmsEnabled`, shows an (empty) admin section, and the schema/registry compile clean — every system plan can now add its slice.

### Milestone 1 — Authoring Core (MVP)
Build in dependency order. Each links to its `PLAN.md`:
1. `course-system/PLAN.md` — `lms_courses` + course CRUD/settings/admin list.
2. `course-builder-system/PLAN.md` — `lms_nodes` tree + structural ops + drag-drop builder.
3. `topic-system/PLAN.md` — topic semantics + drip default.
4. `lesson-system/PLAN.md` — lesson content (Tiptap body, video, materials, settings) + revisions.
5. `ai-course-generation-system/PLAN.md` — outline-first async generation + provenance + jobs.

**→ MVP reached.** Verify with the MVP Definition checklist + a browser smoke (`bun run check:smoke:browser`).

### Milestone 2 — Learner Surface
6. `course-access-enrollment-system/PLAN.md` — `lms_enrollments` + membership gating (`course` restriction type) + drip/prereq eval.
7. `progress-completion-system/PLAN.md` — `lms_progress` + completion + course-completed event.
8. `course-player-system/PLAN.md` — website focus-mode player.
9. `course-catalog-discovery-system/PLAN.md` — public catalog + landing + Meilisearch.
10. `certificate-system/PLAN.md` — templates + issuance on completion + verify page.

### Milestone 3 — AI Media (deferred)
11. `ai-lesson-media-system/PLAN.md` — TTS voiceover, captions, (experimental) AI video. Behind `lmsAiMediaEnabled`.

---

## Cross-cutting verify (run after each system)
```bash
cd ConvexPress-Admin
bun run check-types        # turbo type-check — must exit 0
bun run check:guardrails   # admin guardrails
# system-specific backend tests where present:
bun test packages/backend/convex/lms/<area>/__tests__
```

## Self-review note
Each system `PLAN.md` is scoped to one PRD's acceptance criteria. The fast-follow systems (M2/M3) declare their tables in the M1 schema where the PRD says "declared in v1" so no migration is needed when their logic lands.
