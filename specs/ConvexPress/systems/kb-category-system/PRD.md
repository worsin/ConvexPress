# PRD: KB Category System

> **Project:** ConvexPress — unified CMS + commerce. KB is a first-class content type.
> **Roles:** WordPress-standard.
> **Stack:** Bun, Base UI, Tailwind v4.
> **Canonical path:** `specs/ConvexPress/systems/kb-category-system/PRD.md`
> **Airtable Record:** `[redacted-airtable-record-id]`
> **Expert:** `/experts:kb-category-system` (may consolidate under `/experts:kb-article-system`)
> **Status:** Shipped ~90% — category CRUD, nesting, article join table all live.

---

## Integration with ConvexPress

**Positioning:** part of the `kb` extension.
**Code lives at:** `convex/kb/categories.ts` + `schema/kb.ts:kb_categories` + `kb_articleCategories` junction.
**Admin UI:** `ConvexPress-Admin/apps/web/src/routes/.../admin/kb/categories/`.

**Consumes these ConvexPress systems:**

- **Taxonomy System** — KB categories are a dedicated taxonomy (distinct from content categories and product categories).
- **KB Article System** — articles join categories via `kb_articleCategories`.
- **Routing System** — `/kb/category/:slug` permalinks.
- **SEO System** — per-category meta + sitemap inclusion.
- **Search System** — category filter facet in KB search.
- **Event Dispatcher** — emits `kb.category_created / updated / deleted / moved`.

**WordPress analog:** `category` taxonomy filtered to the KB post-type (like HelpScout Collections).

---

## 1. Overview

### 1.1 Purpose

KB Categories organize knowledge-base articles into a hierarchical tree
that readers browse and admins curate. Supports unlimited nesting (like
WordPress categories), per-category featured articles, per-category SEO,
and per-category icon + color for visual identity.

### 1.2 Scope

**In Scope:**
- Category CRUD with slug + name + description.
- Parent-child nesting.
- Category ordering (sortOrder field).
- Per-category icon (Lucide name) + color.
- Per-category featured article list.
- Per-category SEO meta.
- Bulk article reassignment.

**Out of Scope:**
- Article CRUD → `kb-article-system`.
- Collection curation → `kb-collections-system`.
- Search facet rendering → `kb-search-and-analytics`.

---

## 2. Data Model

### 2.1 Exists

```ts
kb_categories: defineTable({
  slug: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  parentId: v.optional(v.id("kb_categories")),
  sortOrder: v.optional(v.number()),
  iconName: v.optional(v.string()),
  colorHex: v.optional(v.string()),
  featuredArticleIds: v.optional(v.array(v.id("kb_articles"))),
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_slug", ["slug"]).index("by_parent", ["parentId"]);

kb_articleCategories: defineTable({
  articleId: v.id("kb_articles"),
  categoryId: v.id("kb_categories"),
  isPrimary: v.optional(v.boolean()),
  createdAt: v.number(),
}).index("by_article", ["articleId"]).index("by_category", ["categoryId"]);
```

### 2.2 Wave 11
No schema changes required. Polish tasks only.

---

## 3. Functions

### 3.1 Exists
- `kb.categories.list / listTree / getBySlug / getById`
- `kb.categories.create / update / delete / move`
- `kb.categories.addArticle / removeArticle / setPrimary`

### 3.2 Wave 11
- `kb.categories.bulkReassign(fromCategoryId, toCategoryId)` — move all articles in a flick
- `kb.categories.computeArticleCounts` — cached count per category for admin UI performance

---

## 4. Admin UI

### 4.1 Exists
- `/admin/kb/categories` — tree view with drag-reorder
- Create / edit forms

### 4.2 Wave 11
- Bulk reassign tool
- Per-category article counts + health (articles missing SEO, stale articles)

---

## 5. Events

- `kb.category_created / updated / deleted / moved`
- `kb.category_article_added / removed`

---

## 6. Acceptance criteria

### 6.1 Existing (must not regress)
- [x] Category tree CRUD
- [x] Nesting + parent-child
- [x] sortOrder
- [x] Icon + color
- [x] Featured articles per category
- [x] Per-category SEO meta
- [x] Article join via `kb_articleCategories`

### 6.2 Wave 11
- [ ] Bulk reassign
- [ ] Cached article-count per category

---

## 7. References

- Code: `convex/kb/categories.ts`, `schema/kb.ts`
- Admin UI: `apps/web/src/routes/.../admin/kb/categories/`
- Sibling PRDs: `kb-article-system`, `kb-collections-system`, `kb-search-and-analytics`, `taxonomy-system`
- Airtable: `[redacted-airtable-base-id]` / Systems / `[redacted-airtable-record-id]`
