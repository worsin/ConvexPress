# PRD: KB Search & Analytics

> **Project:** ConvexPress — unified CMS + commerce.
> **Roles:** WordPress-standard.
> **Stack:** Bun, Base UI, Tailwind v4, Meilisearch.
> **Canonical path:** `specs/ConvexPress/systems/kb-search-and-analytics/PRD.md`
> **Airtable Record:** `[redacted-airtable-record-id]`
> **Expert:** `/experts:kb-search-and-analytics` (may consolidate under `/experts:search-system`)
> **Status:** Shipped ~80% — Meilisearch indexing + view tracking + engagement metrics live; search-query analytics + zero-result detection Wave 11.

---

## Integration with ConvexPress

**Positioning:** part of the `kb` extension; complements the site-wide `search` system with KB-specific features.
**Code lives at:** `convex/kb/meilisearch.ts` (indexing) + `convex/kb/analytics.ts` (view + engagement metrics) + `schema/kb.ts:kb_articleViewCounts`, `kb_searchQueries` (NEW Wave 11).
**Admin UI:** `apps/web/src/routes/.../admin/kb/analytics/`, `admin/kb/search/`.

**Consumes these ConvexPress systems:**

- **Search System** — shares Meilisearch infra; KB uses a dedicated `kb_articles` index with per-article weighting.
- **KB Article System** — source of indexable content + view recipients.
- **Analytics System** — engagement events roll up into site-wide analytics.
- **GA4 Integration** — optional passthrough of KB events to GA4.
- **Event Dispatcher** — emits `kb.search_performed / .search_zero_result / .search_result_clicked`.

**SaaS analog:** HelpScout's "Docs Reports" + Intercom's "Articles Analytics". Surfaces what customers search for and which articles fall short.

---

## 1. Overview

### 1.1 Purpose

Powers the KB search experience + gives admins visibility into what
customers search for, which articles they read, which queries return
nothing (content gap detection), and which articles are most effective
(high rating + many views = proven winners).

### 1.2 Scope

**In Scope:**
- Meilisearch index config for `kb_articles` (title weight 10, tags 5, body 3).
- Per-article indexing at publish + retroactive reindex all.
- Public search query with highlight + faceted filter (category / tag / collection).
- Per-article view counts + unique-viewer counts.
- Per-article engagement score (views × helpful-rate × completion-rate).
- **Wave 11:** Search-query log (`kb_searchQueries`) with counts, zero-result flag, clicked-article joining.
- **Wave 11:** Zero-result query dashboard — content gaps admin can backfill.
- **Wave 11:** Click-through rate per query → article (search result relevance tuning).
- **Wave 11:** Search-term suggestion API for type-ahead.
- **Wave 11:** Instant answer — surface KB feedback + FAQ inline in search results.

**Out of Scope:**
- Site-wide Search System internals → `search-system`.
- Support ticket deflection using KB → `support-deflection-system`.

---

## 2. Data Model

### 2.1 Exists

```ts
kb_articleViewCounts: defineTable({
  articleId: v.id("kb_articles"),
  totalViews: v.number(),
  uniqueViewers: v.number(),
  helpfulCount: v.number(),
  notHelpfulCount: v.number(),
  averageRating: v.optional(v.number()),
  lastViewedAt: v.optional(v.number()),
}).index("by_article", ["articleId"]);
```

### 2.2 Wave 11

```ts
kb_searchQueries: defineTable({
  query: v.string(),                  // normalized, lowercased
  userId: v.optional(v.id("users")),
  sessionId: v.optional(v.string()),
  resultCount: v.number(),
  clickedArticleId: v.optional(v.id("kb_articles")),
  clickedPosition: v.optional(v.number()),
  performedAt: v.number(),
})
  .index("by_query", ["query"])
  .index("by_performed_at", ["performedAt"])
  .index("by_zero_result", ["resultCount"])
  .index("by_clicked_article", ["clickedArticleId"]);

// Aggregate table (nightly cron) for admin dashboard:
kb_searchQueryDaily: defineTable({
  date: v.string(),                   // "2026-04-22"
  query: v.string(),
  totalSearches: v.number(),
  zeroResultCount: v.number(),
  clickThroughCount: v.number(),
  topClickedArticleId: v.optional(v.id("kb_articles")),
}).index("by_date_query", ["date", "query"]);
```

---

## 3. Functions

### 3.1 Exists
- `kb.meilisearch.indexArticle / reindexAll / removeFromIndex`
- `kb.meilisearch.search(query, filters?)` — public
- `kb.analytics.recordView(articleId, userId?)`
- `kb.analytics.getMetrics(articleId)`

### 3.2 Wave 11
- `kb.search.recordQuery(query, userId?, sessionId?, resultCount)` — write `kb_searchQueries`
- `kb.search.recordClick(queryId, articleId, position)` — click-through write
- `kb.search.queries.topQueries(dateRange)` — most-searched terms
- `kb.search.queries.zeroResultQueries(dateRange)` — content-gap report
- `kb.search.queries.clickthroughRate(dateRange)` — relevance health
- `kb.search.internals.aggregateDaily` — nightly cron → `kb_searchQueryDaily`
- `kb.search.queries.suggest(prefix)` — type-ahead from top historical queries

---

## 4. Admin UI

### 4.1 Exists
- `/admin/kb/analytics` — per-article views + ratings
- Engagement leaderboard

### 4.2 Wave 11
- `/admin/kb/search/queries` — top searches by volume
- `/admin/kb/search/zero-results` — content gap table with "Create article" CTA prefilled with the query as title
- `/admin/kb/search/click-through` — relevance scorecard per query
- Per-article search-funnel section on article detail (how many clicked from which queries)

---

## 5. Events

- `kb.search_performed` — every search
- `kb.search_zero_result` — only when `resultCount === 0`
- `kb.search_result_clicked`
- `kb.article_viewed` — individual view
- `kb.article_feedback_recorded`

---

## 6. Acceptance criteria

### 6.1 Existing (must not regress)
- [x] Meilisearch indexing at publish
- [x] Reindex-all admin action
- [x] Public search with highlighting
- [x] Faceted filters
- [x] Per-article view + unique-viewer counts
- [x] Engagement leaderboard

### 6.2 Wave 11
- [ ] `kb_searchQueries` table + write on every public search
- [ ] Zero-result query dashboard
- [ ] Click-through tracking + CTR report
- [ ] Type-ahead suggestion API
- [ ] Nightly aggregation cron → `kb_searchQueryDaily`
- [ ] "Create article from zero-result query" admin shortcut

---

## 7. Definition of Done

1. All §6.2 checkboxes ticked.
2. Nightly cron runs for 7 days without gaps; aggregate table shows correct daily totals.
3. Admin can click a zero-result query and land in a pre-filled article editor.
4. Click-through rate improves measurably after the first content-gap-backfill cycle (proof the data drove action).

---

## 8. References

- Code: `convex/kb/meilisearch.ts`, `convex/kb/analytics.ts`
- Schema: `convex/schema/kb.ts`
- Sibling PRDs: `kb-article-system`, `kb-category-system`, `kb-collections-system`, `search-system`, `analytics-system`, `ga4-integration-system`, `support-deflection-system`
- Airtable: `[redacted-airtable-base-id]` / Systems / `[redacted-airtable-record-id]`
