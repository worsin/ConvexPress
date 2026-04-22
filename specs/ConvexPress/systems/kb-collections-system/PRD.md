# PRD: KB Collections System

> **Project:** ConvexPress — unified CMS + commerce. KB is a first-class content type.
> **Roles:** WordPress-standard.
> **Stack:** Bun, Base UI, Tailwind v4.
> **Canonical path:** `specs/ConvexPress/systems/kb-collections-system/PRD.md`
> **Airtable Record:** `recITv58eujrw9lLR`
> **Expert:** `/experts:kb-collections-system` (may consolidate under `/experts:kb-article-system`)
> **Status:** Shipped ~70%. Collection CRUD + article ordering live; progress tracking + certificate generation are Wave 11.

---

## Integration with ConvexPress

**Positioning:** part of the `kb` extension.
**Code lives at:** `convex/kb/collections.ts` + `schema/kb.ts:kb_collections` + `kb_collectionArticles` junction.
**Admin UI:** `ConvexPress-Admin/apps/web/src/routes/.../admin/kb/collections/`.

**Consumes these ConvexPress systems:**

- **KB Article System** — collections aggregate articles with ordering.
- **Users + Customer System** — per-user progress tracking.
- **Email Notification System** — collection-completed notifications.
- **Membership Plan System** — collections can require a grant (like Teachable/Thinkific course gating).
- **Event Dispatcher** — emits `kb.collection_created / started / article_completed / completed`.

**WordPress / SaaS analog:** Shopify Learn-style learning paths, Teachable courses, HelpScout's Docs "Collections". Linear reading sequences with progress bars.

---

## 1. Overview

### 1.1 Purpose

KB Collections turn a set of KB articles into a curated, ordered
"learning path" — first this, then that, then this other thing.
Readers see progress indicators, admins monitor completion rates, and
optional membership gating allows collections to be a paid-access
product.

### 1.2 Scope

**In Scope:**
- Collection CRUD (title, slug, description, thumbnail).
- Article ordering within a collection via `kb_collectionArticles.sortOrder`.
- Per-collection hero image + summary.
- Estimated completion time (sum of per-article reading estimates).
- **Wave 11:** per-user progress tracking (`kb_userCollectionProgress`).
- **Wave 11:** Collection completion events + optional certificate PDF generation.
- **Wave 11:** Membership-plan gating — `requiredPlanIds` on a collection.
- **Wave 11:** Public collection browse + detail on the website.

**Out of Scope:**
- Article CRUD → `kb-article-system`.
- Search + analytics → `kb-search-and-analytics`.

---

## 2. Data Model

### 2.1 Exists

```ts
kb_collections: defineTable({
  slug: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  thumbnailStorageId: v.optional(v.id("_storage")),
  estimatedMinutes: v.optional(v.number()),
  isPublished: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_slug", ["slug"]);

kb_collectionArticles: defineTable({
  collectionId: v.id("kb_collections"),
  articleId: v.id("kb_articles"),
  sortOrder: v.number(),
  isRequired: v.optional(v.boolean()),
  createdAt: v.number(),
})
  .index("by_collection", ["collectionId"])
  .index("by_article", ["articleId"]);
```

### 2.2 Wave 11

```ts
// Add to kb_collections:
requiredPlanIds: v.optional(v.array(v.id("membership_plans"))),
certificateEnabled: v.optional(v.boolean()),
certificateTemplate: v.optional(v.string()),

// NEW:
kb_userCollectionProgress: defineTable({
  userId: v.id("users"),
  collectionId: v.id("kb_collections"),
  articlesCompleted: v.array(v.id("kb_articles")),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  certificateIssuedAt: v.optional(v.number()),
  certificateStorageId: v.optional(v.id("_storage")),
})
  .index("by_user", ["userId"])
  .index("by_collection", ["collectionId"])
  .index("by_user_collection", ["userId", "collectionId"]);
```

---

## 3. Functions

### 3.1 Exists
- `kb.collections.list / getById / getBySlug / create / update / publish / delete`
- `kb.collections.addArticle / removeArticle / reorderArticles`

### 3.2 Wave 11
- `kb.collections.progress.recordArticleRead(userId, collectionId, articleId)`
- `kb.collections.progress.getForUser(userId, collectionId)`
- `kb.collections.progress.completeCollection(userId, collectionId)` — emits event, generates certificate if enabled
- `kb.collections.actions.renderCertificate` — Node action to produce PDF certificate
- `kb.collections.internals.checkAccess(userId, collectionId)` — membership gate
- `kb.collections.queries.listRecommended(userId)` — based on progress + completions

---

## 4. Admin UI

### 4.1 Exists
- `/admin/kb/collections` — list + CRUD
- Article picker + reorder in the collection editor

### 4.2 Wave 11
- Required-plans multi-select
- Certificate template picker
- Per-collection progress report (how many users started / completed)

---

## 5. Events

- `kb.collection_created / updated / deleted / published`
- `kb.collection_started / article_completed / collection_completed`
- `kb.certificate_issued`

---

## 6. Acceptance criteria

### 6.1 Existing (must not regress)
- [x] Collection CRUD
- [x] Article ordering
- [x] Per-collection metadata (thumbnail, estimatedMinutes)
- [x] Published/draft state

### 6.2 Wave 11
- [ ] `kb_userCollectionProgress` + per-article progress tracking
- [ ] Collection completion events + optional certificate PDF
- [ ] Membership gating via `requiredPlanIds`
- [ ] Website public collection detail + progress rendering
- [ ] Admin completion-rate report

---

## 7. References

- Code: `convex/kb/collections.ts`
- Schema: `convex/schema/kb.ts`
- Sibling PRDs: `kb-article-system`, `kb-category-system`, `kb-search-and-analytics`, `membership-plan-system`
- Airtable: `appqpJ8QQkoKsH02O` / Systems / `recITv58eujrw9lLR`
