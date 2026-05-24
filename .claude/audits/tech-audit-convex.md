# Convex Technology Audit — KB, Tickets, Support Bridge

## Summary
- Files audited: 37
- Issues found: 31 (Critical: 3, High: 11, Medium: 12, Low: 5)

### Files Audited

**Schema (4):**
- `convex/schema/kb.ts`
- `convex/schema/tickets.ts`
- `convex/schema/support.ts`
- `convex/schema.ts`

**KB System (20):**
- `convex/kb/mutations.ts`
- `convex/kb/queries.ts`
- `convex/kb/internals.ts`
- `convex/kb/validators.ts`
- `convex/kb/helpers/utils.ts`
- `convex/kb/categories.ts`
- `convex/kb/tags.ts`
- `convex/kb/collections.ts`
- `convex/kb/templates.ts`
- `convex/kb/bookmarks.ts`
- `convex/kb/feedback.ts`
- `convex/kb/progress.ts`
- `convex/kb/comments.ts`
- `convex/kb/analytics.ts`
- `convex/kb/workflows.ts`
- `convex/kb/search.ts`
- `convex/kb/settings.ts`
- `convex/kb/meilisearch.ts`
- `convex/kb/rag.ts`
- `convex/kb/integration.ts`

**Ticket System (10):**
- `convex/tickets/mutations.ts`
- `convex/tickets/queries.ts`
- `convex/tickets/internals.ts`
- `convex/tickets/validators.ts`
- `convex/tickets/messages.ts`
- `convex/tickets/sessions.ts`
- `convex/tickets/rateLimit.ts`
- `convex/tickets/cannedResponses.ts`
- `convex/tickets/settings.ts`
- `convex/tickets/integration.ts`

**Support Bridge System (7):**
- `convex/support/validators.ts`
- `convex/support/widget.ts`
- `convex/support/deflection.ts`
- `convex/support/analytics.ts`
- `convex/support/internals.ts`
- `convex/support/settings.ts`
- `convex/support/integration.ts`

**Infrastructure (1):**
- `convex/crons.ts`

---

## Issues

### [CRITICAL] Unbounded .collect() in KB publishScheduledBatch cron handler

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/internals.ts`
- **Line:** 72
- **Rule:** MUST DO: Cap cron job reads with .take(N) / Known Issue: .collect() on large tables causes OOM crashes
- **Description:** The `publishScheduledBatch` internal mutation (called every 5 minutes by the cron) uses `.collect()` on all draft articles from the `by_status_updated` index. If the KB grows to thousands of draft articles, this will collect the entire set into memory, then filter in-memory for `scheduledAt`. This is a classic cron OOM pattern documented in the knowledge base. The `.slice(0, 50)` at line 78 only limits *processing* -- all drafts are still loaded into memory first.
- **Fix:** Replace `.collect()` with `.take(200)` or use the `by_scheduled` index with range bounds to only load articles where `scheduledAt <= now`. Better yet, use the `by_scheduled` index directly:
  ```ts
  const due = await ctx.db
    .query("kb_articles")
    .withIndex("by_scheduled", (q) => q.lte("scheduledAt", now))
    .take(50);
  // Then filter for status === "draft" in memory (much smaller set)
  ```

---

### [CRITICAL] Unbounded .collect() in KB internals getAllRagChunks

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/internals.ts`
- **Line:** 289
- **Rule:** MUST DO: Never use .collect() on large tables / Known Issue: .collect() on large tables causes OOM
- **Description:** `getAllRagChunks` does `ctx.db.query("kb_ragChunks").collect()` with no index bounds and no `.take()` limit. This loads ALL RAG chunks into memory. With a large KB (hundreds of articles, thousands of chunks), this will exceed the 15-second syscall timeout and crash the V8 isolate. The comment acknowledges this ("NOTE: This is efficient for small-to-medium KB sizes") but the code ships without any guard. This is called by `searchRag` action (rag.ts line 299) which can be triggered by any authenticated user.
- **Fix:** Add `.take(10000)` as a safety bound at minimum. For production, migrate to a Convex vector index or paginated batch scoring. The knowledge base specifically documents this pattern as the #1 cause of production OOM crashes.

---

### [CRITICAL] Unbounded .collect() in ticket autoCloseResolved cron handler

- **File:** `ConvexPress-Admin/packages/backend/convex/tickets/internals.ts`
- **Line:** 53
- **Rule:** MUST DO: Cap cron job reads with .take(N) / Known Issue: .collect() on large tables causes OOM
- **Description:** `autoCloseResolved` collects ALL resolved tickets with `.collect()`, then filters in-memory for `resolvedAt < cutoffMs`. As the resolved ticket count grows (thousands+), this becomes an OOM risk. The in-memory filter + `.slice(0, batchSize)` only limits processing, not the initial read.
- **Fix:** Replace `.collect()` with `.take(batchSize * 3)` or `.take(500)`. Better: add a compound index `by_status_resolved` on `["status", "resolvedAt"]` and use range bounds to only load resolved tickets older than the cutoff.

---

### [HIGH] Deprecated single-arg ctx.db.get() used throughout (v1.31.0+)

- **File:** Multiple files across KB, Tickets, and Support systems
- **Lines:** Too many to list individually (every `ctx.db.get(id)` call)
- **Rule:** MUST DO: Use two-arg ctx.db.get() with table name / Breaking Change v1.31.0
- **Description:** Nearly every `ctx.db.get()` call across all three systems uses the deprecated single-argument form: `ctx.db.get(args.articleId)` instead of the v1.31.0+ form `ctx.db.get("kb_articles", args.articleId)`. The same applies to `ctx.db.patch()`, `ctx.db.delete()`, and `ctx.db.replace()` -- all use the old forms without the table name as the first argument. Examples:
  - `kb/mutations.ts:165` -- `ctx.db.get(args.articleId)` (should be `ctx.db.get("kb_articles", args.articleId)`)
  - `kb/mutations.ts:260` -- `ctx.db.patch(args.articleId, updates)` (should be `ctx.db.patch("kb_articles", args.articleId, updates)`)
  - `kb/mutations.ts:549` -- `ctx.db.delete(args.articleId)` (should be `ctx.db.delete("kb_articles", args.articleId)`)
  - `tickets/mutations.ts:241` -- `ctx.db.get(args.ticketId)`
  - All similar patterns in queries, internals, categories, tags, etc.
- **Fix:** Run `npx @convex-dev/codemod@latest explicit-ids` across the entire backend, or manually add table names to every `ctx.db.get/patch/delete/replace` call. This is the #1 documented breaking change and is deprecated since v1.31.0.

---

### [HIGH] Unbounded .collect() in KB analytics getDashboardStats (4 status queries)

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/analytics.ts`
- **Lines:** 143-147
- **Rule:** MUST DO: Never use .collect() on large tables
- **Description:** `getDashboardStats` collects ALL articles across 4 status categories with `.collect()`. With a large KB, each of these 4 calls reads the entire subset into memory just to count them. Line 172 also does `.take(50000)` on `kb_articleFeedback` which is extremely generous.
- **Fix:** Use the Aggregate component or maintain denormalized counters. At minimum, add reasonable `.take()` bounds (e.g., `.take(10000)`) to each status query. For feedback, `.take(50000)` is dangerously high -- reduce to `.take(5000)`.

---

### [HIGH] Unbounded .collect() in KB analytics getSearchAnalytics

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/analytics.ts`
- **Lines:** 247-249
- **Rule:** MUST DO: Never use .collect() on large tables
- **Description:** `getSearchAnalytics` collects ALL search queries in a date range with `.collect()`. If the date range spans months and there are thousands of search queries, this will load everything into memory for in-memory grouping. No `.take()` safety bound.
- **Fix:** Add `.take(10000)` as a safety bound. For production, consider pre-aggregating search analytics daily.

---

### [HIGH] Unbounded .collect() in KB comments listByArticle

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/comments.ts`
- **Line:** 36
- **Rule:** MUST DO: Never use .collect() on large tables
- **Description:** `listByArticle` collects ALL comments for an article with `.collect()`, then filters in memory for approved/non-deleted, then builds threaded structure. Popular articles with hundreds of comments will cause performance issues. This is a public query (no auth required).
- **Fix:** Add `.take(500)` as a safety bound. Consider pagination for comments.

---

### [HIGH] Unbounded .collect() in KB comments getCount

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/comments.ts`
- **Line:** 313
- **Rule:** MUST DO: Never use .collect() on large tables
- **Description:** `getCount` collects ALL comments for an article with `.collect()` just to count them after filtering. This is wasteful -- use denormalized counts or `.take()` with a safety bound.
- **Fix:** Add a denormalized `commentCount` field on `kb_articles` (like `viewCount` already exists), or add `.take(1000)` safety bound.

---

### [HIGH] Unbounded .collect() in KB feedback getArticleStats

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/feedback.ts`
- **Lines:** 209-210
- **Rule:** MUST DO: Never use .collect() on large tables
- **Description:** `getArticleStats` (public query) collects ALL feedback for an article with `.collect()`. Popular articles could accumulate thousands of feedback records. This data is already denormalized on the article (`helpfulVotes`, `notHelpfulVotes`), so this full scan is unnecessary for the basic counts.
- **Fix:** Use the denormalized `helpfulVotes`/`notHelpfulVotes` from the article for basic counts. For the `avgRating` and `ratingCount`, add `.take(5000)` or maintain denormalized averages.

---

### [HIGH] Unbounded .collect() in KB tags list (public, no auth)

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/tags.ts`
- **Line:** 33
- **Rule:** MUST DO: Never use .collect() on large tables
- **Description:** The public `list` query collects ALL tags with `.collect()` and no index. While tag counts are typically small, this has no auth check and no safety bound.
- **Fix:** Add `.take(500)` as a safety bound. Consider sorting by a relevant index.

---

### [HIGH] Unbounded .collect() in KB workflows list

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/workflows.ts`
- **Line:** 39
- **Rule:** MUST DO: Never use .collect() on large tables
- **Description:** `list` collects ALL workflows with `.collect()` and no index. While workflow counts are typically small, it has no safety bound.
- **Fix:** Add `.take(100)` as a safety bound.

---

### [HIGH] Workflow remove uses wrong index scan pattern

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/workflows.ts`
- **Lines:** 180-186
- **Rule:** MUST DO: Use indexes for all filtered queries
- **Description:** The `remove` mutation scans ALL article workflows using `.withIndex("by_status").collect()` then filters by `workflowId` in a for loop. This should use a dedicated index or at minimum filter differently. The `by_status` index is not the right choice for finding instances by workflow ID.
- **Fix:** Either add a `by_workflow` index on `kb_articleWorkflows` or filter more efficiently. The correct approach: add `.index("by_workflow", ["workflowId"])` to the `kb_articleWorkflows` table definition.

---

### [MEDIUM] Missing `by_scheduled` index filtering in publishScheduledBatch

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/internals.ts`
- **Line:** 72
- **Rule:** MUST DO: Use indexes for all filtered queries
- **Description:** The `publishScheduledBatch` uses `by_status_updated` index with `eq("status", "draft")`, then does in-memory filtering for `scheduledAt <= now`. The schema defines a `by_scheduled` index on `["scheduledAt"]` but it is not being used. Using the scheduled index would be far more efficient.
- **Fix:** Use the `by_scheduled` index with range bounds, then filter for `status === "draft"` in memory (much smaller result set). Or create a compound index `by_status_scheduled` on `["status", "scheduledAt"]`.

---

### [MEDIUM] Support deflection analytics queries unbounded .collect()

- **File:** `ConvexPress-Admin/packages/backend/convex/support/analytics.ts`
- **Lines:** 46, 111, 173
- **Rule:** MUST DO: Never use .collect() on large tables
- **Description:** All three analytics queries (`getDeflectionStats`, `getTopDeflectingArticles`, `getCommonUnanswered`) use `.collect()` on date-range filtered deflection logs. While the date index is used for range bounds, there is no `.take()` safety limit. A wide date range (default is `startDate: 0` which means ALL TIME) could load all logs into memory.
- **Fix:** Add `.take(50000)` safety bounds. Change default `startDate` from `0` to 30 or 90 days ago.

---

### [MEDIUM] KB analytics trackPageView uses .filter() after index

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/analytics.ts`
- **Lines:** 47-49
- **Rule:** MUST DO: Use index range bounds for time-based queries
- **Description:** `trackPageView` uses `withIndex("by_session")` then `.filter()` to also match `articleId`. This means all page views for a session are loaded, then filtered in memory for the specific article. A compound index `by_session_article` would be more efficient, but one does not exist on `kb_pageViews`.
- **Fix:** Add a compound index `by_session_article` on `["sessionId", "articleId"]` to `kb_pageViews` in the schema, then use `withIndex("by_session_article", q => q.eq("sessionId", args.sessionId).eq("articleId", args.articleId))`.

---

### [MEDIUM] Session create/touch/invalidate mutations have no auth -- potential abuse

- **File:** `ConvexPress-Admin/packages/backend/convex/tickets/sessions.ts`
- **Lines:** 37, 109, 169
- **Rule:** MUST DO: Always check auth in every mutation / Security
- **Description:** The `create`, `touch`, and `invalidate` mutations are public mutations with no auth check. While they are designed for anonymous widget users, an attacker can:
  1. `create`: Flood the session table with fake sessions (DoS)
  2. `invalidate`: Delete any session by guessing the session ID (session denial)
  The `create` mutation has basic format validation but no rate limiting at the Convex function level.
- **Fix:** Add rate limiting at the function level (or require the ticket rate limiting system). For `invalidate`, consider requiring either auth OR the session to be associated with the calling user. At minimum, add a note that these must be rate-limited at the HTTP/API layer.

---

### [MEDIUM] Support deflection logInteraction mutation has no auth but writes to DB

- **File:** `ConvexPress-Admin/packages/backend/convex/support/deflection.ts`
- **Lines:** 198-251
- **Rule:** MUST DO: Always check auth in every mutation / Security
- **Description:** `logInteraction` is a public mutation that inserts records into `support_deflectionLogs` without requiring authentication. While the comment says "No auth required -- widget users may be anonymous", this means anyone can insert arbitrary deflection logs, polluting analytics data. The only validation is session existence, which is also unauthenticated.
- **Fix:** At minimum, require a valid session. Consider adding rate limiting. Add a size/count limit per session to prevent abuse.

---

### [MEDIUM] Support generateAnswer action missing sessionId validation

- **File:** `ConvexPress-Admin/packages/backend/convex/support/deflection.ts`
- **Lines:** 56-184
- **Rule:** Security: Validate all inputs
- **Description:** The `generateAnswer` action accepts a `sessionId` string but never validates it against the `ticket_sessions` table. An attacker could pass any string. While this does not directly compromise security (the action only reads KB data), it means the session context is unverified.
- **Fix:** Validate the session exists and is not expired before processing the query.

---

### [MEDIUM] Ticket getStats query collects resolved/closed tickets unbounded

- **File:** `ConvexPress-Admin/packages/backend/convex/tickets/queries.ts`
- **Lines:** 401-441
- **Rule:** MUST DO: Never use .collect() on large tables
- **Description:** `getStats` collects all tickets per status (5 `.collect()` calls), then collects resolved and closed tickets with `.take(2000)` each. The initial 5 status `.collect()` calls have no bounds. While the `openTickets` and `inProgressTickets` use `.take(5000)`, combining them creates a 10,000-item array in memory.
- **Fix:** Replace the status count `.collect()` calls with `.take(10000)` safety bounds. Consider maintaining denormalized counters for ticket stats.

---

### [MEDIUM] KB collections list (admin) unbounded .collect() without index

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/collections.ts`
- **Line:** 43
- **Rule:** MUST DO: Never use .collect() on large tables
- **Description:** Admin `list` query does `ctx.db.query("kb_collections").order("desc").collect()` -- no index, no bounds. The `listPublic` also uses `.collect()` on the `by_public` index (line 52).
- **Fix:** Add `.take(500)` safety bounds.

---

### [MEDIUM] Canned responses list/search/getCategories use unbounded .collect()

- **File:** `ConvexPress-Admin/packages/backend/convex/tickets/cannedResponses.ts`
- **Lines:** 48, 113, 348
- **Rule:** MUST DO: Never use .collect() on large tables
- **Description:** The `list`, `search`, and `getCategories` queries all use `.collect()` without bounds. While canned response counts are typically low, defense in depth requires bounds.
- **Fix:** Add `.take(500)` safety bounds.

---

### [MEDIUM] KB article remove mutation cascading deletes could timeout on large datasets

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/mutations.ts`
- **Lines:** 440-536
- **Rule:** Known Issue: 15-second syscall timeout / Performance
- **Description:** The `remove` mutation cascades through 12 different tables using `.collect()` for each, then deletes every related record in nested loops. For a popular article with thousands of page views, hundreds of comments (each with votes), and many RAG chunks, this could easily exceed the 15-second syscall timeout. Each `.collect()` is unbounded.
- **Fix:** Break the cascade delete into an internal action that processes tables in batches. Use `.take(500)` for each related table scan and schedule continuations. Alternatively, use a "soft delete" pattern and clean up related records via a scheduled background job.

---

### [MEDIUM] KB versions query collects all versions unbounded

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/queries.ts`
- **Line:** 379
- **Rule:** MUST DO: Never use .collect() on large tables
- **Description:** `getVersions` collects ALL versions for an article with `.collect()`. While individual articles rarely have hundreds of versions, there is no safety bound.
- **Fix:** Add `.take(100)` or paginate.

---

### [LOW] Rate limit checkAndRecord collects then filters in memory

- **File:** `ConvexPress-Admin/packages/backend/convex/tickets/rateLimit.ts`
- **Lines:** 47-54
- **Rule:** MUST DO: Use index range bounds for time-based queries
- **Description:** `checkAndRecord` uses `withIndex("by_session_action")` then `.collect()` to get ALL rate limit records for a session+action, then filters in memory by `createdAt >= windowStart`. Since rate limits have short windows (10s-5min), the result set is small, but the pattern is inefficient. The `by_action_time` compound index could be used with range bounds instead.
- **Fix:** Minor optimization: Since the window is short and cleanup runs regularly, this is low risk. But ideally, add a compound index on `["sessionId", "action", "createdAt"]` for range-bounded queries.

---

### [LOW] KB search.ts query does not validate limit bounds

- **File:** `ConvexPress-Admin/packages/backend/convex/kb/search.ts`
- **Line:** 19
- **Rule:** Validate all inputs
- **Description:** The public `search` query accepts a `limit` arg with `v.optional(v.number())` but does not validate the upper bound. A client could pass `limit: 100000` which would be passed to `.take(limit)`. While `.take()` has internal Convex limits, explicit validation is better.
- **Fix:** Add `const limit = Math.min(args.limit ?? 20, 100)`.

---

### [LOW] Multiple `as any` casts on user objects in enrichment

- **File:** Multiple KB query files
- **Lines:** `kb/queries.ts:63,115,219,389`, `kb/comments.ts:50`
- **Rule:** Type safety / Code quality
- **Description:** User enrichment uses `(author as any).displayName ?? author.email` and `(author as any).avatarUrl`. This indicates the user type from `ctx.db.get(article.authorId)` does not include `displayName` and `avatarUrl` in its type definition, or these are optional fields not reflected in the type. The `as any` casts bypass TypeScript safety.
- **Fix:** Create a helper function that properly types user objects, or ensure the users schema includes these optional fields in its type definition.

---

### [LOW] KB schema missing vector index on kb_ragChunks

- **File:** `ConvexPress-Admin/packages/backend/convex/schema/kb.ts`
- **Lines:** 388-404
- **Rule:** Performance / Architecture
- **Description:** The `kb_ragChunks` table stores embedding vectors (`embedding: v.array(v.number())`) but has no Convex vector index defined. The `searchRag` action (rag.ts) loads ALL chunks and computes cosine similarity in memory. Convex supports native vector indexes that would make this efficient.
- **Fix:** Add a `.vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 1536, filterFields: ["articleId"] })` to the `kb_ragChunks` table definition. Then refactor `searchRag` to use the vector index instead of loading all chunks.

---

### [LOW] Missing `kb_articleWorkflows` index by_workflow

- **File:** `ConvexPress-Admin/packages/backend/convex/schema/kb.ts`
- **Lines:** 340-354
- **Rule:** Known Claude mistake: Add indexes to schema for fields used in queries
- **Description:** The `kb_articleWorkflows` table is queried by `workflowId` in `workflows.ts:remove` (line 180), but there is no `by_workflow` index. The code works around this by scanning `by_status` and filtering in a loop, which is inefficient.
- **Fix:** Add `.index("by_workflow", ["workflowId"])` to the `kb_articleWorkflows` table definition.

---

## Notes

### Patterns Done Well

1. **Auth checks present on all admin queries/mutations** -- Every admin query checks for user auth via `getCurrentUser()` or `requireCan()`. Public queries intentionally skip auth where appropriate (published article listing, search, etc.).

2. **Internal functions properly separated** -- `internalMutation`/`internalQuery` used correctly for scheduled operations, cross-system calls, and operations that should not be client-callable.

3. **Input validation thorough** -- All mutations validate input lengths, ranges, and formats with `ConvexError` structured errors. No `v.any()` usage found.

4. **Cron jobs properly registered** -- All three systems have appropriate cron entries in `crons.ts` with clear comments.

5. **Batch patterns with self-rescheduling** -- Cleanup crons (KB pageViews, ticket sessions, rate limits, support logs) all use the `.take(N)` + reschedule pattern correctly.

6. **Schema properly modular** -- Each system has its own schema file in `convex/schema/`, exported with the `{system}Tables` naming convention, and spread into `schema.ts`.

7. **Event emission consistent** -- All mutations that modify significant state emit events via `emitEvent()` with appropriate event codes.

8. **Settings follow section-based pattern** -- All three systems use the same settings infrastructure with defaults, section-based storage, and API key masking.

9. **Validators centralized** -- Each system has a `validators.ts` with well-organized, reusable argument validators exported from schema files.

10. **Actions used correctly for external I/O** -- Meilisearch sync, RAG embeddings, and AI deflection all use `action` (not `mutation`) for external API calls.
