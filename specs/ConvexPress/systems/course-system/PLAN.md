# PLAN: Course System — Build Sequence

> Build-sequence companion to `PRD.md` (read it first). Shared scaffold + conventions live in `specs/codex-prds/LMS-PLUGIN-IMPLEMENTATION.md` (Milestone 0) — **assume M0 is done**.
> **For agentic workers:** execute task-by-task via `superpowers:subagent-driven-development`; steps use `- [ ]`. **Verify gate after every step:** `cd ConvexPress-Admin && bun run check-types` exits 0.

**Goal:** The `lms_courses` entity + course-level settings + admin course list/editor.
**Prereqs:** M0 scaffold. **First system in Milestone 1** (others depend on it).
**Code home:** `convex/lms/courses/` + `convex/schema/lms.ts`; admin `apps/web/src/routes/_authenticated/_admin/lms/courses/`.

## Decisions
- `descriptionDoc` + `materialsDoc` are Tiptap JSON (`v.any()`), like KB `bodyDoc`.
- Slug uniqueness via `convex/helpers/slug.ts` (reuse the existing slug helper used by posts/kb).
- The full nullable settings surface (access/billing/progression/points/availability/cert) ships now even though enforcement is later — no migration when M2 lands.
- Course **categories** reuse the Taxonomy system: an `lms_course` taxonomy registered like KB categories (don't invent a new categories table beyond the taxonomy join).

## Build Sequence

### Step 1 — Schema: `lms_courses` + prerequisites
- **Files:** EDIT `convex/schema/lms.ts`.
- [ ] Add the `lms_courses` table (all fields per PRD §2.1) and `lms_course_prerequisites` (PRD §2.2) to `lmsTables`. Use the exact field set/enums from the PRD; index `by_slug`, `by_status`, `by_author`; prereqs `by_course`, `by_prereq`.
- [ ] Verify: `bun run check-types` → 0.
- [ ] Commit: `feat(lms): course schema (lms_courses + prerequisites)`.

### Step 2 — Validators
- **Files:** CREATE `convex/lms/courses/validators.ts`.
- [ ] Export arg validators: `createCourseArgs` (`{ title: v.string() }`), `updateCourseArgs` (partial patch object matching schema), `setPrerequisitesArgs` (`{ courseId, prereqCourseIds: v.array(...), mode }`).
- [ ] Verify: `bun run check-types` → 0.

### Step 3 — Mutations
- **Files:** CREATE `convex/lms/courses/mutations.ts`.
- [ ] Implement `create`, `update`, `publish`, `archive`, `restore`, `delete`, `duplicate`, `setPrerequisites`, `setCategories`, `setTags` (PRD §3.1). Each: `await requirePluginEnabled(ctx, "lms")` → capability check (`lms.course.*` via `helpers/permissions.ts`; Author scoped to `authorId === caller`) → mutate → dispatch event via `helpers/events.ts`.
- [ ] `create` generates a unique slug (`helpers/slug.ts`), sets `status: "draft"`, `authorId`, timestamps.
- [ ] `publish` sets `publishedAt`; `duplicate` clones the row then calls `lms.nodes.cloneTree` (Course Builder — guard with a TODO if Builder not yet built; safe no-op until then).
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): course mutations`.

### Step 4 — Queries
- **Files:** CREATE `convex/lms/courses/queries.ts`.
- [ ] Implement `list` (filter status/category/author/search + `paginationOpts`), `getById`, `getBySlug`, `listPublished`, `listByCategory`, `getPrerequisites`, `getCourseSummary` (PRD §3.2). All gated by `isPluginEnabled`/`requirePluginEnabled`.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): course queries`.

### Step 5 — Events
- **Files:** EDIT `convex/schema/eventDefinitions.ts` (or the LMS event seed).
- [ ] Declare `lms.course_created/updated/published/archived/restored/deleted/duplicated/prerequisites_changed`. Wire dispatch calls in the mutations.
- [ ] Verify: `bun run check-types` → 0.

### Step 6 — Admin: course list
- **Files:** CREATE `apps/web/src/routes/_authenticated/_admin/lms/courses/index.tsx`; reuse the admin list-table components (mirror `_admin/kb/index.tsx`).
- [ ] List with status/category/author filters, search, bulk publish/archive/delete (real-time via `useQuery`). Verify: route renders; `bun run check-types` → 0.

### Step 7 — Admin: create + settings editor
- **Files:** CREATE `apps/web/src/routes/_authenticated/_admin/lms/courses/new.tsx`, `.../courses/$courseId.tsx` (+ `$courseId/index.tsx` settings).
- [ ] `new.tsx`: title → `create` → redirect to settings.
- [ ] Settings editor: metadata, Tiptap `descriptionDoc` (reuse `components/editor`), taxonomy picker, access-mode + billing fields, prerequisites multiselect, points, progression, availability window, seat limit, certificate picker (disabled until `certificate-system`), materials. Buttons: "Open Builder" (→ `$courseId/builder`), "Generate with AI" (→ `$courseId/generate`).
- [ ] Verify: `bun run check-types` → 0 + `bun run check:smoke`. Commit: `feat(lms): course admin (list + settings editor)`.

## MVP Definition of Done (from PRD §6.1)
- [ ] Course CRUD + draft/published/archived + unique slugs.
- [ ] Tiptap description + excerpt + featured image + promo video.
- [ ] Category/tag assignment via Taxonomy.
- [ ] Full settings surface persisted (nullable, no enforcement).
- [ ] Prerequisites stored with any/all.
- [ ] Course duplication (clones record; tree clone wired once Builder exists).
- [ ] Admin list with filter/search/bulk.
- [ ] `lmsEnabled` + `lms.course.*` enforced.

## Verify
```bash
cd ConvexPress-Admin && bun run check-types && bun run check:guardrails
bun test packages/backend/convex/lms/courses/__tests__   # if tests added
```
