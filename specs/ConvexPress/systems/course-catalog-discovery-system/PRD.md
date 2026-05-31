# PRD: Course Catalog & Discovery System

> **Project:** ConvexPress — LMS extension. The public catalog: browse, filter, search, and course landing pages.
> **Plugin:** `lms`. The pre-enrollment discovery surface on the website app.
> **Two-app architecture:** Website (Clerk) consumes the admin-owned Convex deployment via SSR for SEO. **Stack:** React 19, TanStack Start (SSR), Base UI, Tailwind v4, Meilisearch.
> **Canonical path:** `specs/ConvexPress/systems/course-catalog-discovery-system/PRD.md`
> **Airtable:** ConvexPress base / Systems / "Course Catalog & Discovery System".
> **Status:** Planned — fast-follow.
> **Depends on:** `course-system`, `course-builder-system`, `course-access-enrollment-system`, `search-system`, `seo-system`.

---

## Integration with ConvexPress

**Positioning:** internal extension (`lms`) — the **public catalog** + course landing.
**Extension gate:** `lmsEnabled`; routes 404 when disabled.
**Code lives at:** `ConvexPress-Website/apps/web/src/routes/_marketing/courses/` (catalog + landing) + indexing hooks in `convex/lms/search/`.

**Consumes these ConvexPress systems:**
- **Course System** — published courses, metadata, taxonomy.
- **Course Builder System** — curriculum outline preview on the landing page.
- **Search System (Meilisearch)** — full-text course search + faceted filter.
- **Taxonomy System** — category/tag browse + facets.
- **SEO System** — per-course meta, `Course` JSON-LD, sitemap entries, OpenGraph.
- **Course Access & Enrollment** — access CTA state (open/free/members/buy) + preview lessons.
- **AI Course Generation** — surfaces the provenance label ("AI-assisted") if configured to display.

**LearnDash/WordPress analog:** the course archive/grid + single-course landing page (LearnDash course grid + course page), plus standard CMS archive SEO.

---

## 1. Overview

### 1.1 Purpose

Help prospective learners **find** courses and **decide** to enroll. Provides the SSR catalog (grid with filter/search/sort by category, tag, level, price/access), and the **course landing page** (hero, description, curriculum outline with preview lessons, instructor, access CTA). It is the SEO surface for the LMS.

### 1.2 Scope

**In Scope (fast-follow):**
- **Catalog** `/courses`: SSR grid of published courses; filter by category/tag/access mode; full-text search (Meilisearch); sort (newest, popular, A–Z); pagination.
- **Course landing** `/courses/$slug`: hero (title, image/promo video, excerpt), Tiptap description, **curriculum outline** (topics/lessons, preview-marked), what-you-get, instructor, **access CTA** (Enroll / Login / Upgrade / Buy) reflecting `accessMode` + membership state.
- **Meilisearch indexing** of published courses (title, excerpt, category, tags) with publish/unpublish sync.
- **SEO**: meta tags, `Course` structured data, sitemap inclusion, canonical URLs.
- Optional **AI-assisted** provenance badge on the landing.

**Out of Scope (owned elsewhere):**
- The enrolled player → `course-player-system`.
- Access decisions → `course-access-enrollment-system` (catalog only reflects CTA state).
- Progress → `progress-completion-system`.
- Course CRUD → `course-system`.

---

## 2. Data Model

No owned tables. Owns a **search index** definition + sync hooks:
- `convex/lms/search/indexCourse(courseId)` / `removeCourse(courseId)` — called on publish/unpublish/update (reuses the Meilisearch client from `search-system`).
- Catalog reads via `courses.queries.listPublished` + Meilisearch for search/facets.

```ts
// Meilisearch document
type CourseSearchDoc = {
  id; title; slug; excerpt; categoryNames[]; tagNames[];
  accessMode; lessonCount; publishedAt; aiAssisted: boolean;
};
```

---

## 3. Functions

- `queries.getCatalog({ search?, categoryId?, tag?, accessMode?, sort?, paginationOpts })` — faceted list (Meilisearch for `search`, otherwise indexed Convex query).
- `queries.getCourseLanding(slug, userId?)` — landing payload: course + curriculum outline (preview state) + access CTA state.
- `internals.syncCourseIndex` — subscribes to `lms.course_published/updated/archived` to keep Meilisearch current.

Gated by `lmsEnabled`; all data is public (published courses only).

---

## 4. Website UI

- `/courses` — catalog grid: search bar, category/tag/access facets, sort, course cards (image, title, lesson count, access badge, AI-assisted badge), pagination.
- `/courses/$slug` — landing: hero, description, curriculum (preview lessons clickable → player preview), access CTA, instructor, related courses.

---

## 5. Events

- (Consumes `lms.course_published/updated/archived` for indexing; owns none.)

---

## 6. Acceptance criteria

### 6.1 Fast-follow
- [ ] SSR catalog with filter/search/sort/pagination over published courses.
- [ ] Meilisearch indexing synced on publish/unpublish/update.
- [ ] Course landing with hero, Tiptap description, curriculum outline (preview-marked), and a correct access CTA per `accessMode` + membership state.
- [ ] SEO: meta + `Course` JSON-LD + sitemap + canonical.
- [ ] Optional AI-assisted provenance badge.
- [ ] `lmsEnabled` gates routes.

---

## 7. References

- Code: `ConvexPress-Website/.../routes/_marketing/courses/*`, `convex/lms/search/*`
- Consumes: `search-system`, `seo-system`, `taxonomy-system`
- Sibling PRDs: `course-system`, `course-player-system`, `course-access-enrollment-system`
- Airtable: ConvexPress base / Systems / "Course Catalog & Discovery System"
