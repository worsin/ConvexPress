# PRD: KB Article System

> **Project:** ConvexPress — unified CMS + commerce. The Knowledge Base is a first-class content type alongside posts and pages.
> **Two-app architecture:** Admin (Convex Auth) + Website (Clerk).
> **Roles:** WordPress-standard.
> **Stack:** Bun, Base UI, Tailwind v4, Tiptap editor.
> **Canonical path:** `specs/ConvexPress/systems/kb-article-system/PRD.md`
> **Airtable Record:** `[redacted-airtable-record-id]`
> **Expert:** `/experts:kb-article-system` (to be created)
> **Status:** Shipped ~95% feature-complete. Core CRUD, Tiptap content, versioning, tags, workflow, feedback all live.

---

## Integration with ConvexPress

**Positioning:** internal extension (`kb`).
**Extension gate:** `kbEnabled` in Settings; `requireKBEnabled(ctx)` helper.
**Code lives at:** `convex/kb/` (14+ files incl. internals, queries, mutations, analytics, bookmarks, categories, collections, comments, feedback, meilisearch, integration) + `schema/kb.ts`.
**Admin UI:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/`.
**Website UI:** `ConvexPress-Website/apps/web/src/routes/_marketing/kb/` (public KB browse).

**Consumes these ConvexPress systems:**

- **Content Editor System** — Tiptap editor with embedded blocks; shared toolbar + extensions with posts/pages.
- **Taxonomy System** — articles join KB Category + KB Collection taxonomies.
- **Revision System** — `kb_articleVersions` table mirrors the Post revision pattern.
- **Media System** — article imagery via `commerce_products.media`-style references.
- **Search System** — articles indexed in Meilisearch via `kb/meilisearch.ts`.
- **Comment System** — `kb_articleComments` reuse the comment pattern.
- **SEO System** — per-article meta + structured data (Article schema) + sitemap inclusion.
- **Event Dispatcher** — emits `kb.article_created / published / updated / deleted / viewed`.
- **Role & Capability** — `kb.article.*` capabilities (create/edit/publish/delete/view).
- **Customer Support + Ticket systems** — article suggestions via Support Deflection.

**WordPress analog:** Custom post-type `kb_article` with a dedicated top-level admin section; like HelpScout Docs, Zendesk Guide, Intercom Articles built directly into WordPress.

---

## 1. Overview

### 1.1 Purpose

The KB Article System is the authoring + publishing surface for a
public or private knowledge base. Articles are rich Tiptap documents
with categorization, collections (learning paths), tagging, versioning,
reader feedback, comments, and moderation workflow.

### 1.2 Scope

**In Scope:**
- Article CRUD with Tiptap content.
- Article versioning via `kb_articleVersions` (full revision history).
- Nested / parent-child article relationships for multi-page articles.
- Categorization (one primary KB category, many tags).
- Collection membership (learning paths / curated sequences).
- Workflow state: draft → review → published → archived.
- Feedback (helpful/not-helpful, star ratings, comments).
- View analytics + engagement metrics per article.
- Author attribution + role-based edit permissions.
- Meilisearch indexing for fast fuzzy search.
- Tiptap integration with code blocks, callouts, embeds, diagrams.
- Public + authenticated-only visibility.

**Out of Scope (owned elsewhere):**
- Category management → `kb-category-system` PRD.
- Collection management → `kb-collections-system` PRD.
- Search UI + analytics → `kb-search-and-analytics` PRD.
- Ticket-system auto-suggest → `support-deflection-system` PRD.

---

## 2. Data Model

### 2.1 Exists (confirmed in `schema/kb.ts`)

```ts
kb_articles              // primary storage
kb_articleVersions       // full revision history
kb_articleTags           // junction to tags
kb_articleCategories     // junction to categories
kb_articleFeedback       // helpful/not-helpful, ratings, comments
kb_articleViewCounts     // engagement metrics
kb_articleComments       // reader comments
kb_articleBookmarks      // user bookmarks
kb_articleWorkflows      // workflow state per article
```

### 2.2 Wave 11 additions

```ts
// Add to kb_articles:
isPublic: v.optional(v.boolean()),               // default true; false = authenticated-only
restrictedToPlanIds: v.optional(v.array(v.id("membership_plans"))), // membership-gated KB
relatedArticleIds: v.optional(v.array(v.id("kb_articles"))),        // admin-curated
ratingAverage: v.optional(v.number()),           // denormalized for sorting

// New table:
kb_articleSuggestions: defineTable({
  sourceArticleId: v.id("kb_articles"),
  suggestedArticleId: v.id("kb_articles"),
  score: v.number(),
  algorithm: v.string(),                         // "related_tags" | "ml_embedding" | "manual"
  generatedAt: v.number(),
}).index("by_source", ["sourceArticleId"]);
```

---

## 3. Functions

### 3.1 Exists
- `kb.mutations.create / update / publish / archive / delete`
- `kb.queries.list / getById / getBySlug / listPublished / listByCategory / listByCollection / listByTag / listByAuthor`
- `kb.internals.indexInMeilisearch` (via `meilisearch.ts`)
- `kb.feedback.record(articleId, kind, userId?)` — helpful/not-helpful + rating
- `kb.bookmarks.add / remove / listForUser`
- `kb.comments.*` — reader comments
- `kb.analytics.recordView`

### 3.2 Wave 11 new
- `kb.mutations.setMembershipRestriction(articleId, planIds[])` — restricted-to-plan articles
- `kb.queries.listRelated(articleId)` — reads `kb_articleSuggestions`
- `kb.internals.computeArticleSuggestions` — daily cron, tag-based similarity
- `kb.queries.listBookmarksForUser(userId)`
- `kb.mutations.setRelatedArticles(articleId, relatedIds[])` — manual curation

---

## 4. Admin UI

### 4.1 Exists
- `/admin/kb/articles` — list + filter + search
- `/admin/kb/articles/new` — create
- `/admin/kb/articles/$id/edit` — Tiptap editor with metadata panel
- Workflow state controls in the editor
- Feedback + view-count panel on article detail

### 4.2 Wave 11
- Related-articles picker on the edit view
- Membership-restriction dropdown (multi-select plans)
- Author-productivity report (articles per author, avg rating)

---

## 5. Events

- `kb.article_created / published / updated / archived / deleted`
- `kb.article_viewed / bookmarked / unbookmarked`
- `kb.article_feedback_recorded`
- `kb.article_comment_posted`

---

## 6. Acceptance criteria

### 6.1 Existing (must not regress)
- [x] CRUD with Tiptap content
- [x] Versioning via `kb_articleVersions`
- [x] Tag + category join tables
- [x] Collection membership
- [x] Workflow state machine
- [x] Feedback + rating capture
- [x] Reader comments
- [x] Meilisearch indexing
- [x] View-count analytics

### 6.2 Wave 11
- [ ] `isPublic` + `restrictedToPlanIds` membership-gated articles
- [ ] `kb_articleSuggestions` table + daily computation cron
- [ ] Manual related-article curation UI
- [ ] Author productivity report

---

## 7. References

- Code: `convex/kb/*` (14+ files)
- Schema: `convex/schema/kb.ts`
- Admin UI: `apps/web/src/routes/.../admin/kb/`
- Website UI: `apps/web/src/routes/_marketing/kb/`
- Sibling PRDs: `kb-category-system`, `kb-collections-system`, `kb-search-and-analytics`, `content-editor-system`, `revision-system`, `search-system`, `support-deflection-system`
- Airtable: `[redacted-airtable-base-id]` / Systems / `[redacted-airtable-record-id]`
