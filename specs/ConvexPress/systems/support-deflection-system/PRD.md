# PRD: Support Deflection System

> **Project:** ConvexPress — unified CMS + commerce.
> **Roles:** WordPress-standard.
> **Stack:** Bun, Base UI, Tailwind v4, Meilisearch.
> **Canonical path:** `specs/ConvexPress/systems/support-deflection-system/PRD.md`
> **Airtable Record:** `recZGRYnCpNr9DMHQ`
> **Expert:** `/experts:support-deflection-system` (may consolidate under `/experts:support-system`)
> **Status:** Shipped ~78%. KB article suggestion is live; AI-powered auto-reply is the Wave 11 polish.

---

## Integration with ConvexPress

**Positioning:** part of the `support` + `kb` extensions — the bridge.
**Code lives at:** `convex/support/deflection.ts` + `convex/kb/integration.ts`.
**Admin UI:** deflection widget in `/admin/support/` + deflection metrics in Support Analytics.

**Consumes these ConvexPress systems:**

- **KB Article System + KB Search** — source of suggested articles.
- **Ticket Widget System** — the widget shows article suggestions before offering to create a ticket.
- **AI Content Generation** — optional: use LLM to match query to the most relevant article.
- **Ticket Lifecycle System** — counts "tickets not created because article suggested and user closed widget."
- **Event Dispatcher** — emits `support.deflection_shown / .deflection_article_clicked / .deflection_succeeded / .ticket_created_after_deflection`.

**SaaS analog:** Intercom's "Search articles before contacting" / HelpScout's "Beacon" / Crisp's "Magic Browse" — self-serve first, ticket second.

---

## 1. Overview

### 1.1 Purpose

Before a user creates a ticket, offer relevant KB articles. Measure how
often the offer succeeds (article read, widget closed without ticket) vs
fails (ticket still created). Reduce support load by routing "how do I
change my password" queries to the KB answer.

### 1.2 Scope

**In Scope:**
- Article-suggestion query from a user-typed subject / question.
- Deflection widget UI (integrated into Ticket Widget).
- Deflection success tracking (user closed widget without creating a ticket).
- Per-query deflection rate report.
- **Wave 11:** AI-assisted matching via AI Content Generation system's LLM.
- **Wave 11:** Per-article deflection score (how many times this article deflected a ticket).
- **Wave 11:** Self-service resolution survey ("Did this answer your question?").

**Out of Scope:**
- KB CRUD → `kb-article-system`.
- Search engine internals → `search-system`.
- Widget UX → `ticket-widget-system`.

---

## 2. Data Model

### 2.1 Exists
- `support_deflection_events` — per-query log with suggested article IDs, selected article, outcome.

### 2.2 Wave 11

```ts
// Add to support_deflection_events:
aiAssistedScore: v.optional(v.number()),      // confidence 0..1
surveyResponse: v.optional(v.union(
  v.literal("helpful"),
  v.literal("partially_helpful"),
  v.literal("not_helpful"),
)),

// NEW daily aggregation:
support_deflection_daily: defineTable({
  date: v.string(),
  shownCount: v.number(),
  clickedCount: v.number(),
  succeededCount: v.number(),                 // widget closed without ticket
  ticketCreatedCount: v.number(),
  topDeflectionArticleId: v.optional(v.id("kb_articles")),
}).index("by_date", ["date"]);
```

---

## 3. Functions

### 3.1 Exists
- `support.deflection.suggestArticles(query)` — returns top 3 KB articles via Meilisearch
- `support.deflection.internals.recordShown(query, articleIds)`
- `support.deflection.internals.recordOutcome(eventId, outcome)`

### 3.2 Wave 11
- `support.deflection.actions.suggestWithAi(query, userContext)` — calls AI Content Generation LLM for semantic match
- `support.deflection.queries.getArticleDeflectionScore(articleId, dateRange)`
- `support.deflection.internals.aggregateDaily` — nightly cron
- `support.deflection.mutations.recordSurveyResponse(eventId, response)`

---

## 4. Admin UI

### 4.1 Exists
- Deflection metrics panel in support analytics.

### 4.2 Wave 11
- `/admin/support/deflection/queries` — top queries that deflect (good content)
- `/admin/support/deflection/zero-deflection` — queries that never deflect (content gap — feed back into KB Search & Analytics zero-result dashboard)
- Per-article deflection score on the article detail view

---

## 5. Events

- `support.deflection_shown` — every suggestion shown
- `support.deflection_article_clicked`
- `support.deflection_succeeded` — widget closed without ticket
- `support.ticket_created_after_deflection` — deflection failed
- `support.deflection_survey_submitted`

---

## 6. Acceptance criteria

### 6.1 Existing
- [x] Article suggestion query returns relevant KB articles
- [x] Deflection event log
- [x] Outcome tracking (closed vs ticket)

### 6.2 Wave 11
- [ ] AI-assisted matching via AI Content Generation
- [ ] Per-article deflection score query
- [ ] Resolution survey capture
- [ ] Daily aggregation cron
- [ ] Top-queries + zero-deflection-queries admin views

---

## 7. References

- Code: `convex/support/deflection.ts`, `convex/kb/integration.ts`
- Sibling PRDs: `kb-article-system`, `kb-search-and-analytics`, `ticket-widget-system`, `ticket-lifecycle-system`, `support-analytics-system`, `ai-content-generation`
- Airtable: `appqpJ8QQkoKsH02O` / Systems / `recZGRYnCpNr9DMHQ`
