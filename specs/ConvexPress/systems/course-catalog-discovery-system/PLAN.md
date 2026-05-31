# PLAN: Course Catalog & Discovery System — Build Sequence

> Companion to `PRD.md` (read first). Scaffold/conventions: `specs/codex-prds/LMS-PLUGIN-IMPLEMENTATION.md` (M0 assumed). **Verify gate every step:** type-check the relevant app (`bun run check-types`) exits 0.
> **For agentic workers:** task-by-task via `superpowers:subagent-driven-development`; `- [ ]` steps. **Milestone 2**.

**Goal:** Public catalog (browse/filter/search) + course landing + Meilisearch indexing + SEO for courses.
**Prereqs:** M1 + `course-access-enrollment-system` (CTA state). Reuses `search-system` (Meilisearch), `seo-system`, `taxonomy-system`.
**Code home:** `convex/lms/search/` (indexing, admin-owned) + `ConvexPress-Website/apps/web/src/routes/_marketing/courses/`.

## Decisions
- **Reuse the existing Meilisearch client** from `convex/kb/meilisearch.ts` / `search-system` — add a `courses` index, don't stand up new infra.
- Index sync is **event-driven**: subscribe to `lms.course_published/updated/archived` → upsert/remove the `CourseSearchDoc`.
- The course **landing page** is shared with `course-player-system` (Step 3 there); this system owns the **catalog grid** + indexing + SEO; it does not duplicate the landing.
- SEO via `seo-system`: `Course` JSON-LD + sitemap entry on publish.

## Build Sequence

### Step 1 — Search index + sync
- **Files:** CREATE `convex/lms/search/index.ts`, `convex/lms/search/internals.ts`.
- [ ] `indexCourse(courseId)` / `removeCourse(courseId)` building `CourseSearchDoc` (PRD §2); `syncCourseIndex` subscriber on `lms.course_*`. Reuse the Meilisearch client/config from `convex/kb/meilisearch.ts`.
- [ ] Verify: `cd ConvexPress-Admin && bun run check-types` → 0. Commit: `feat(lms): course search indexing`.

### Step 2 — Catalog query + SEO hooks
- **Files:** CREATE `convex/lms/search/queries.ts`; EDIT `convex/seo/*` + `convex/sitemap/*` to include published courses.
- [ ] `getCatalog({ search?, categoryId?, tag?, accessMode?, sort?, paginationOpts })` (Meilisearch for `search`, else indexed Convex query); `getCourseLanding(slug, userId?)` (course + curriculum outline + CTA state via `canAccessCourse`).
- [ ] Register `Course` structured data + sitemap inclusion (mirror how posts/kb register SEO).
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): catalog query + course SEO/sitemap`.

### Step 3 — Website catalog
- **Files:** CREATE `ConvexPress-Website/apps/web/src/routes/_marketing/courses/index.tsx` (SSR grid).
- [ ] Search bar, category/tag/access facets, sort, course cards (image, title, lesson count, access badge, optional AI-assisted badge), pagination. Cards link to `/courses/$slug` (landing from Player plan).
- [ ] Verify: `cd ConvexPress-Website && bun run check-types` → 0. Commit: `feat(lms): public course catalog`.

## MVP Definition of Done (from PRD §6.1)
- [ ] SSR catalog with filter/search/sort/pagination over published courses.
- [ ] Meilisearch index synced on publish/unpublish/update.
- [ ] Course landing (hero, Tiptap description, curriculum w/ preview, correct access CTA).
- [ ] SEO: meta + `Course` JSON-LD + sitemap + canonical.
- [ ] Optional AI-assisted provenance badge.
- [ ] `lmsEnabled` gates routes.

## Verify
```bash
cd ConvexPress-Admin && bun run check-types          # indexing + catalog query + SEO
cd ConvexPress-Website && bun run check-types         # catalog grid
```
