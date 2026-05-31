# PRD: Course System

> **Project:** ConvexPress — unified CMS + commerce. The Course is a first-class LMS content type alongside posts, pages, and KB articles.
> **Plugin:** `lms` (LMS extension). This is the root content type of the extension.
> **Two-app architecture:** Admin (Convex Auth) + Website (Clerk).
> **Roles:** WordPress-standard. **Stack:** Bun, Base UI, Tailwind v4, Tiptap.
> **Canonical path:** `specs/ConvexPress/systems/course-system/PRD.md`
> **Airtable:** ConvexPress base / Systems / "Course System" (linked to `lms` plugin).
> **Status:** Planned — v1 (authoring core).
> **Sibling PRDs:** `course-builder-system`, `topic-system`, `lesson-system`, `ai-course-generation-system`, `course-access-enrollment-system`, `progress-completion-system`, `course-player-system`, `certificate-system`, `course-catalog-discovery-system`.

---

## Integration with ConvexPress

**Positioning:** internal extension (`lms`) — the **Course** content type and its course-level configuration.
**Extension gate:** `lmsEnabled` in Settings; `requireLmsEnabled(ctx)` helper guards every function.
**Code lives at:** `convex/lms/courses/` (queries, mutations, internals) + `convex/schema/lms.ts` (`lms_courses`, `lms_course_prerequisites`).
**Admin UI:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/lms/courses/`.
**Website UI:** `ConvexPress-Website/apps/web/src/routes/_marketing/courses/$slug` (course landing — fast-follow; owned by Course Catalog & Discovery + Course Player).

**Consumes these ConvexPress systems:**

- **Taxonomy System** — courses join a `course_category` + `course_tag` taxonomy (reuses the post/KB taxonomy join pattern).
- **Media System** — `featuredImageId` and promo video reference Media records.
- **Revision System** — course setting revisions mirror the Post/KB revision pattern.
- **Search System** — published courses indexed in Meilisearch.
- **SEO System** — per-course meta + `Course` JSON-LD + sitemap inclusion.
- **Content Editor System** — the course `descriptionDoc` + `materialsDoc` are Tiptap documents.
- **Membership + Content Restriction** — course gating via a `course` restriction resource type (owned by Course Access & Enrollment).
- **Event Dispatcher** — emits `lms.course_*` lifecycle events.
- **Role & Capability** — `lms.course.*` capabilities.
- **Custom Field System** — optional course meta.

**WordPress / LearnDash analog:** the `sfwd-courses` custom post type and its Course Settings + Course Access metaboxes.

---

## 1. Overview

### 1.1 Purpose

The Course System owns the **course entity** — the top-level container of the LMS — and all **course-level configuration**: lifecycle/publishing, taxonomy, access mode, prerequisites, points, progression mode, certificate assignment, availability windows, and SEO. It is the root that the curriculum tree (topics + lessons) hangs from and that the learner systems (enrollment, progress, certificates) reference.

It does **not** own the curriculum tree mechanics, the topic/lesson content, enrollment, or progress — those are separate systems (see Out of Scope).

### 1.2 Scope

**In Scope (v1):**
- Course CRUD with draft → published → archived lifecycle.
- Slug generation + uniqueness; canonical routing key for the website.
- Course metadata: title, `descriptionDoc` (Tiptap), excerpt, `featuredImageId`, promo video.
- Taxonomy assignment: course categories + tags.
- Course-level **settings surface** (most nullable, enforced later): access mode, price/billing fields, progression mode, points, availability window, seat limit, content visibility, completion redirect, `certificateId`, `materialsDoc`.
- Course **prerequisites** (`lms_course_prerequisites` + `prereqMode`) — stored in v1, enforced by Access/Progress later.
- Course **duplication** (clone a course shell + its tree — delegates tree copy to Course Builder).
- Admin course list (filter/search/bulk) + course settings editor.

**Out of Scope (owned elsewhere):**
- Curriculum tree, ordering, builder UI → `course-builder-system`.
- Topic nodes → `topic-system`. Lesson content + video → `lesson-system`.
- AI generation of the course → `ai-course-generation-system`.
- Enrollment, access gating, drip + prerequisite **enforcement** → `course-access-enrollment-system`.
- Progress / completion → `progress-completion-system`.
- Certificate templates + issuance → `certificate-system`.
- Public catalog + course landing → `course-catalog-discovery-system` / `course-player-system`.

---

## 2. Data Model

### 2.1 `lms_courses`

```ts
lms_courses: defineTable({
  title: v.string(),
  slug: v.string(),                                   // unique; website routing key
  descriptionDoc: v.optional(v.any()),                // Tiptap JSON
  excerpt: v.optional(v.string()),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  featuredImageId: v.optional(v.id("media")),
  promoVideoUrl: v.optional(v.string()),
  categoryIds: v.optional(v.array(v.id("lms_course_categories"))), // taxonomy (see Taxonomy)
  tagIds: v.optional(v.array(v.string())),

  // Access / commerce — nullable now, enforced by Access & Enrollment later
  accessMode: v.optional(v.union(
    v.literal("open"), v.literal("free"), v.literal("members"),
    v.literal("buy"), v.literal("recurring"), v.literal("closed"),
  )),
  price: v.optional(v.number()),
  recurringPrice: v.optional(v.number()),
  billingInterval: v.optional(v.number()),
  billingUnit: v.optional(v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("year"))),
  trialPrice: v.optional(v.number()),
  trialDays: v.optional(v.number()),
  externalButtonUrl: v.optional(v.string()),

  // Progression / gating — stored now, enforced later
  progressionMode: v.optional(v.union(v.literal("linear"), v.literal("free_form"))),
  pointsAwarded: v.optional(v.number()),
  pointsRequired: v.optional(v.number()),
  prereqMode: v.optional(v.union(v.literal("any"), v.literal("all"))),
  accessDurationDays: v.optional(v.number()),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  seatLimit: v.optional(v.number()),
  contentVisibility: v.optional(v.union(v.literal("always"), v.literal("enrollees_only"))),

  certificateId: v.optional(v.id("lms_certificates")),
  completionRedirectUrl: v.optional(v.string()),
  materialsDoc: v.optional(v.any()),                  // Tiptap JSON

  authorId: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
  publishedAt: v.optional(v.number()),
})
  .index("by_slug", ["slug"])
  .index("by_status", ["status"])
  .index("by_author", ["authorId"]);
```

### 2.2 `lms_course_prerequisites` (join)

```ts
lms_course_prerequisites: defineTable({
  courseId: v.id("lms_courses"),
  prereqCourseId: v.id("lms_courses"),
  createdAt: v.number(),
}).index("by_course", ["courseId"]).index("by_prereq", ["prereqCourseId"]);
```

`prereqMode` (any/all) lives on `lms_courses`. Enforcement is deferred to Access & Enrollment + Progress.

> **Note:** the curriculum tree table `lms_nodes` is defined in `course-builder-system`. Course owns only the course record + its prerequisites.

---

## 3. Functions

### 3.1 Mutations (`convex/lms/courses/mutations.ts`)
- `create({ title })` → creates a draft course with a unique slug.
- `update(courseId, patch)` → partial update of any course field.
- `publish(courseId)` / `archive(courseId)` / `restore(courseId)` / `delete(courseId)`.
- `duplicate(courseId)` → clones the course record; calls `lms.builder.cloneTree` for the curriculum.
- `setPrerequisites(courseId, prereqCourseIds[], mode)` → replaces prerequisite set.
- `setCategories(courseId, categoryIds[])` / `setTags(courseId, tags[])`.

### 3.2 Queries (`convex/lms/courses/queries.ts`)
- `list({ status?, search?, categoryId?, authorId?, paginationOpts })` — admin list.
- `getById(courseId)` / `getBySlug(slug)`.
- `listPublished({ paginationOpts })` / `listByCategory(categoryId)`.
- `getPrerequisites(courseId)` → resolved prereq courses + mode.
- `getCourseSummary(courseId)` → denormalized counts (topics, lessons) via Course Builder.

### 3.3 Internals
- `internals.ensureUniqueSlug` / `internals.recountStructure` (updates cached topic/lesson counts on tree change events).

All functions call `requireLmsEnabled(ctx)` and check `lms.course.*` capabilities.

---

## 4. Admin UI

- `/admin/lms/courses` — list table: filter by status/category/author, search, bulk publish/archive/delete.
- `/admin/lms/courses/new` — create (title → redirect into settings).
- `/admin/lms/courses/$courseId` — course settings editor: metadata, Tiptap description, taxonomy, access mode, prerequisites, points, progression, availability, certificate picker, materials.
- "Open Builder" and "Generate with AI" actions link to `course-builder-system` and `ai-course-generation-system`.

---

## 5. Events

- `lms.course_created / updated / published / archived / restored / deleted`
- `lms.course_duplicated`
- `lms.course_prerequisites_changed`

---

## 6. Acceptance criteria

### 6.1 v1 (authoring core)
- [ ] Course CRUD with draft/published/archived lifecycle + unique slugs.
- [ ] Tiptap description + excerpt + featured image + promo video.
- [ ] Category/tag assignment via Taxonomy.
- [ ] Full settings surface persisted (access, price/billing, progression, points, availability, seat, visibility, certificate ref, materials) — nullable, no enforcement required yet.
- [ ] Prerequisites stored with `any/all` mode.
- [ ] Course duplication clones record + curriculum (delegates tree copy).
- [ ] Admin list with filter/search/bulk actions.
- [ ] `lmsEnabled` gates all routes/functions; `lms.course.*` capabilities enforced.

### 6.2 Fast-follow (hooks only in v1)
- [ ] Access mode + prerequisites are read and enforced by `course-access-enrollment-system`.
- [ ] `certificateId` consumed by `certificate-system`.
- [ ] Published courses indexed for `course-catalog-discovery-system` + SEO/sitemap.

---

## 7. References

- Code: `convex/lms/courses/*`, `convex/schema/lms.ts`
- Umbrella PRD: `specs/codex-prds/LMS-PLUGIN-PRD.md`
- Structural analog: `kb-article-system` (content type + lifecycle + taxonomy)
- Sibling PRDs: `course-builder-system`, `topic-system`, `lesson-system`, `course-access-enrollment-system`, `certificate-system`
- Airtable: ConvexPress base / Systems / "Course System"
