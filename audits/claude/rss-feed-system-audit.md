# RSS/Feed System - Full Code Review & Audit

**System:** RSS/Feed System
**Audit Date:** 2026-02-13
**Expert:** RSS/Feed System Expert
**Status:** AUDIT ONLY - No code modifications made

---

## Executive Summary

The RSS/Feed System is **well-implemented** with a clean separation of concerns across backend queries, helper utilities, and website-side API routes. The system follows its knowledge document closely, has strong content sanitization, and produces standards-compliant RSS 2.0 and Atom 1.0 feeds. However, there are several issues ranging from **critical** (missing PRD, potential index mismatches) to **moderate** (code duplication, no tests) to **minor** (URL path discrepancy vs. knowledge doc).

### Overall Score: 78/100

| Category | Score | Notes |
|----------|-------|-------|
| PRD Compliance | 6/10 | No PRD file exists; implementation matches knowledge doc well |
| Architecture | 9/10 | Clean, well-organized, follows Convex conventions |
| Security | 9/10 | Comprehensive content sanitization |
| Code Quality | 7/10 | Good but has significant code duplication |
| TypeScript | 7/10 | Several `any` type usages in queries |
| Completeness | 8/10 | All feed endpoints implemented; missing tests and httpActions approach |
| Error Handling | 8/10 | Proper error responses but some edge cases unhandled |
| Performance | 7/10 | N+1 query patterns in enrichment; no batching |

---

## Files Reviewed

### Backend (ConvexPress-Admin/packages/backend/convex/)

| File | Lines | Purpose |
|------|-------|---------|
| `helpers/feedXml.ts` | 437 | XML builder functions (RSS 2.0 + Atom 1.0) |
| `helpers/feedContent.ts` | 184 | Content sanitization and excerpt generation |
| `helpers/feedUrls.ts` | 128 | Feed URL generation helper |
| `feeds/queries.ts` | 484 | Public Convex queries for feed data |
| `feeds/actions.ts` | 377 | fetchExternal action (admin-only) |
| `feeds/internals.ts` | 127 | Internal queries (settings, auth) |
| `feeds/validators.ts` | 109 | Shared argument validators and constants |
| `http.ts` | 298 | HTTP router (checked for feed route registration) |

### Website Frontend (ConvexPress-Website/apps/web/src/)

| File | Lines | Purpose |
|------|-------|---------|
| `routes/api/feed/index.tsx` | 25 | Main RSS 2.0 feed route |
| `routes/api/feed/rss2.tsx` | 19 | Explicit RSS 2.0 feed route |
| `routes/api/feed/atom.tsx` | 24 | Main Atom 1.0 feed route |
| `routes/api/category/$slug/feed/index.tsx` | 25 | Category RSS feed route |
| `routes/api/category/$slug/feed/atom.tsx` | 19 | Category Atom feed route |
| `routes/api/tag/$slug/feed/index.tsx` | 25 | Tag RSS feed route |
| `routes/api/tag/$slug/feed/atom.tsx` | 19 | Tag Atom feed route |
| `routes/api/author/$slug/feed/index.tsx` | 25 | Author RSS feed route |
| `routes/api/author/$slug/feed/atom.tsx` | 19 | Author Atom feed route |
| `routes/api/comments/feed/index.tsx` | 24 | Global comment RSS feed route |
| `routes/api/comments/feed/atom.tsx` | 24 | Global comment Atom feed route |
| `routes/api/blog/$slug/feed/index.tsx` | 26 | Per-post comment RSS feed route |
| `routes/api/blog/$slug/feed/atom.tsx` | 19 | Per-post comment Atom feed route |
| `lib/feeds/buildFeedResponse.ts` | 824 | Shared feed response builder |
| `lib/feeds/types.ts` | 140 | TypeScript type definitions |
| `lib/feeds/constants.ts` | 52 | Constants (cache TTLs, namespaces) |
| `components/seo/FeedDiscoveryHead.tsx` | 193 | Feed discovery `<link>` tags |
| `features/widgets/components/types/rss-feed-widget.tsx` | 152 | RSS feed widget component |

### Schema Files Reviewed (owned by other systems)

| File | Relevant Indexes Verified |
|------|--------------------------|
| `schema/posts.ts` | `by_type_published`, `by_author`, `by_slug` |
| `schema/settings.ts` | `by_section` |
| `schema/taxonomies.ts` | `by_slug_taxonomy`, `by_term`, `by_post` |
| `schema/comments.ts` | `by_status`, `by_post` |
| `schema/users.ts` | `by_clerkUserId`, `by_slug` |

---

## Critical Issues (P0)

### 1. Missing PRD File

**Location:** Expected at `specs/ConvexPress/systems/rss-feed/PRD.md`
**Issue:** The PRD file does not exist. The knowledge document at `.claude/docs/RSS-FEED-SYSTEM.md` is comprehensive and serves as a de facto PRD, but the system lacks the formal spec that other systems have.
**Impact:** Audit cannot verify PRD compliance in the standard way. Future experts may miss context.
**Recommendation:** Create the PRD using the knowledge doc as a base, following the template in `specs/TEMPLATE-PRD.md`.

### 2. Potential Index Mismatch: Comments `by_post` vs. Knowledge Doc `by_post_status`

**Location:** `ConvexPress-Admin/packages/backend/convex/feeds/queries.ts` line 442-444
**Schema:** `comments` table has index `by_post` with fields `["postId", "status", "createdAt"]`
**Knowledge doc says:** Index `by_post_status` with fields `["postId", "status"]`

The actual schema names the index `by_post` with fields `["postId", "status", "createdAt"]`. The query code uses:
```typescript
.withIndex("by_post", (q) =>
  q.eq("postId", post._id).eq("status", "approved"),
)
```

This is **correct** -- the code uses the actual index name `by_post`. But the knowledge document refers to a non-existent `by_post_status` index. This is a documentation discrepancy, not a code bug. However, the index `by_post` includes `createdAt` as a third field, so the ordering is correct.

**Recommendation:** Update knowledge doc to reflect actual index name `by_post` instead of `by_post_status`.

### 3. Potential Index Mismatch: Comments `by_status` vs. Knowledge Doc `by_status_created`

**Location:** `ConvexPress-Admin/packages/backend/convex/feeds/queries.ts` line 378
**Schema:** `comments` table has index `by_status` with fields `["status", "createdAt"]`
**Knowledge doc says:** Index `by_status_created` with fields `["status", "createdAt"]`

Again, the actual index is named `by_status` not `by_status_created`. The code correctly uses `by_status`:
```typescript
.withIndex("by_status", (q) => q.eq("status", "approved"))
```

**Recommendation:** Update knowledge doc to match the actual schema index names.

---

## High-Priority Issues (P1)

### 4. Massive Code Duplication Between Backend Helpers and Website buildFeedResponse.ts

**Locations:**
- Backend: `ConvexPress-Admin/packages/backend/convex/helpers/feedXml.ts` (437 lines)
- Backend: `ConvexPress-Admin/packages/backend/convex/helpers/feedContent.ts` (184 lines)
- Backend: `ConvexPress-Admin/packages/backend/convex/helpers/feedUrls.ts` (128 lines)
- Website: `ConvexPress-Website/apps/web/src/lib/feeds/buildFeedResponse.ts` (824 lines)

**Issue:** The `buildFeedResponse.ts` file duplicates ALL of the following from the backend helpers:
- `escapeXml()` - identical implementation
- `toRfc2822()` - identical implementation
- `toIso8601()` - identical implementation
- `formatContentForFeed()` - identical implementation
- `formatExcerptForFeed()` - identical implementation
- `buildRssItem()` / `buildRssChannel()` - reimplemented with slight variations
- `buildAtomEntry()` / `buildAtomFeed()` - reimplemented with slight variations
- `generateETag()` - identical implementation
- `getFeedUrl()` - reimplemented with `/api/` prefix variation

This is approximately **400+ lines of duplicated logic**. Any bug fix or spec change must be applied in two places.

**Impact:** Maintenance burden; divergence risk. For example, the backend `buildRssItem` takes a pre-built `RssFeedItem` object, while the website version takes an `EnrichedFeedPost` and builds the item inline. These could diverge over time.

**Recommendation:** Since the website-side approach (TanStack Start API routes calling Convex queries) is the one actually serving feeds, the backend helpers are currently **unused by any deployed code**. Either:
  - (a) Remove the backend helpers and keep the website-side code as the single source of truth, OR
  - (b) Extract shared utilities into a shared package within the monorepo (e.g., `packages/feed-utils/`), OR
  - (c) Move feed generation to Convex HTTP actions (the knowledge doc's "Option B") so the backend helpers are the single source of truth

### 5. Extensive Use of `any` Types in Backend Queries

**Location:** `ConvexPress-Admin/packages/backend/convex/feeds/queries.ts`

Multiple instances of `any` type usage:
- Line 46: `async function readFeedSettings(ctx: any)` - Context should be `QueryCtx`
- Line 49: `(q: any)` - Index query builder should be typed
- Line 53: `(q: any)` - Index query builder should be typed
- Line 86: `async function enrichPostsForFeed(ctx: any, posts: any[])` - Both params untyped
- Line 92: `(q: any)` - Index query builder should be typed
- Lines 218, 278: `const publishedPosts: any[] = []` - Should be typed to post document shape

**Impact:** Loses type safety benefits. Could allow bugs to slip through where field names are misspelled or wrong types are passed.

**Recommendation:** Import `QueryCtx` from `../_generated/server` and type the helper functions properly. Use `Doc<"posts">` for post documents.

### 6. No HTTP Action Feed Routes Registered in http.ts

**Location:** `ConvexPress-Admin/packages/backend/convex/http.ts`
**Issue:** The knowledge document describes feed endpoints as HTTP actions registered in `convex/httpActions/feeds.ts`, and the implementation checklist includes `convex/http.ts` as needing feed route registrations. However, `http.ts` has **no feed routes registered**, and `convex/httpActions/feeds.ts` **does not exist**.

The actual implementation uses TanStack Start API routes (Option A from the knowledge doc's implementation checklist), which is the recommended approach. This is technically correct but represents a discrepancy with the knowledge doc which describes both options.

**Impact:** Low -- the TanStack Start approach is working. But the knowledge doc describes HTTP actions as the primary approach and TanStack Start as a recommended alternative. The actual implementation chose the alternative.

**Recommendation:** Update knowledge doc to reflect that TanStack Start API routes are the **chosen** approach, and that Convex HTTP actions are the unused alternative. Remove or downgrade references to `convex/httpActions/feeds.ts`.

### 7. URL Path Discrepancy: `/api/feed` vs `/feed`

**Locations:**
- Knowledge doc says: `/feed`, `/feed/rss2`, `/feed/atom`, `/category/{slug}/feed`, etc.
- Backend `feedUrls.ts` generates: `/feed`, `/category/{slug}/feed`, etc. (no `/api` prefix)
- Website routes are: `/api/feed`, `/api/category/$slug/feed`, etc. (with `/api` prefix)
- Website `buildFeedResponse.ts` generates: `/api/feed`, `/api/category/$slug/feed`, etc.
- `FeedDiscoveryHead.tsx` generates: `/api/feed`, `/api/category/$slug/feed`, etc.

**Issue:** The knowledge doc specifies clean URLs without `/api/` prefix, but the actual implementation uses `/api/` prefixed routes. This means:
1. The backend helper `getFeedUrl()` generates incorrect self-referencing URLs (without `/api/`)
2. Feed readers using the backend helper would get wrong URLs
3. The website-side `buildFeedResponse.ts` correctly uses `/api/` prefix
4. The `FeedDiscoveryHead` component correctly uses `/api/` prefix

Since the backend helpers are not currently used in production (feeds are served by the website app), this is not a live bug. But if anyone ever uses the backend helpers, the URLs would be wrong.

**Impact:** Medium -- the discrepancy exists but doesn't affect production since the website-side code has the correct URLs.

**Recommendation:** Either update the knowledge doc to specify `/api/` prefix, or update the backend `feedUrls.ts` to include the `/api/` prefix, or reconcile by choosing one canonical URL structure.

---

## Medium-Priority Issues (P2)

### 8. No Unit Tests Exist

**Location:** No test files found anywhere in the feeds system.
**Knowledge doc specifies these test categories:**
- Unit tests for `escapeXml`, `toRfc2822`, `toIso8601`, `formatExcerptForFeed`, `formatContentForFeed`, `getFeedUrl`
- Unit tests for `buildRssChannel` and `buildAtomFeed` (valid XML output)
- Integration tests for all feed endpoints
- Feed validation tests (RSS 2.0 spec compliance, Atom 1.0 spec compliance)
- Security tests (no XSS in feed content, no email exposure, no internal IDs)

**Impact:** No automated verification that feeds are spec-compliant. XML escaping bugs, date formatting issues, and sanitization bypasses could go undetected.

**Recommendation:** Create a test suite covering at minimum:
1. `escapeXml()` with all 5 entities + edge cases (empty string, unicode)
2. `toRfc2822()` and `toIso8601()` with known timestamps
3. `formatContentForFeed()` sanitization (script injection, iframe conversion, relative URL resolution)
4. `formatExcerptForFeed()` truncation and word boundary logic
5. XML output validation for both formats

### 9. N+1 Query Pattern in `enrichPostsForFeed()`

**Location:** `ConvexPress-Admin/packages/backend/convex/feeds/queries.ts` lines 86-157

For each post in the feed, `enrichPostsForFeed()` executes:
1. Query `termRelationships` by post (1 query per post)
2. For each relationship, `ctx.db.get(rel.termId)` (1 query per term)
3. `ctx.db.get(post.authorId)` (1 query per post)
4. `ctx.db.get(post.featuredImageId)` (1 query per post, if present)

For a feed of 10 posts with 3 taxonomy terms each, this results in approximately 10 + 30 + 10 + 10 = **60 database reads** instead of the theoretical minimum of ~4 batch queries.

**Impact:** Increased latency for feed generation. With Convex's server-side execution this is mitigated somewhat, but it's still suboptimal.

**Recommendation:** Consider:
1. Collecting all unique `authorId` values and batch-fetching authors in one pass
2. Collecting all `postId` values and batch-fetching term relationships in one pass
3. Using `Promise.all` more aggressively for independent lookups (already partially done)

### 10. Same N+1 Pattern in Category/Tag Feed Queries

**Location:** `ConvexPress-Admin/packages/backend/convex/feeds/queries.ts` lines 218-224, 279-284

The `getPostsByCategory` and `getPostsByTag` queries iterate over all term relationships and fetch each post individually:
```typescript
for (const rel of relationships) {
  const post = await ctx.db.get(rel.postId);
  if (post && post.status === "publish" && post.type === "post") {
    publishedPosts.push(post);
  }
}
```

For a category with 100 posts, this is 100 sequential `db.get()` calls. Only the top `limit` (e.g., 10) are used after sorting.

**Impact:** Significant latency for popular categories/tags with many posts.

**Recommendation:** Consider a two-pass approach:
1. Collect all `postId` values from relationships
2. Use `Promise.all` to batch-fetch posts
3. Filter and sort in memory

### 11. `by_author` Index Field Order Mismatch

**Location:** `ConvexPress-Admin/packages/backend/convex/feeds/queries.ts` line 332-334
**Schema:** `posts` table index `by_author` has fields `["authorId", "type", "status"]`

The query:
```typescript
.withIndex("by_author", (q) =>
  q.eq("authorId", author._id).eq("type", "post").eq("status", "publish"),
)
```

This usage is **correct** -- it matches the index field order. However, the `.order("desc")` on line 335 orders by the index's implicit `_creationTime` (the default ordering field), NOT by `publishedAt`. The code then re-sorts by `publishedAt` on lines 339-343, which is correct but means the initial `take(limit)` might miss some posts if `publishedAt` differs from `_creationTime` order.

**Impact:** Edge case -- if an author has a post that was created later but published earlier (e.g., backdated), it might be excluded from the feed when `limit` is small and there are many posts by that author.

**Recommendation:** Either add a dedicated index `by_author_published: ["authorId", "type", "status", "publishedAt"]`, or over-fetch and then sort/limit in memory.

### 12. ConvexHttpClient Created Per Request Without Connection Pooling

**Location:** `ConvexPress-Website/apps/web/src/lib/feeds/buildFeedResponse.ts` line 184-187

```typescript
function createConvexClient(): ConvexHttpClient {
  const url = process.env.VITE_CONVEX_URL || "";
  return new ConvexHttpClient(url);
}
```

Every feed request creates a new `ConvexHttpClient`. The `ConvexHttpClient` is stateless (just wraps `fetch()`), so this is not technically a connection leak, but it could be more efficient with a module-level singleton.

**Impact:** Minor -- `ConvexHttpClient` is lightweight. But if the env var is empty, every request creates a broken client that will fail on the first query.

**Recommendation:** Create a singleton or validate the URL at module load time. Add a guard:
```typescript
const CONVEX_URL = process.env.VITE_CONVEX_URL;
if (!CONVEX_URL) console.warn("VITE_CONVEX_URL not set - feeds will fail");
```

---

## Low-Priority Issues (P3)

### 13. CDATA Injection Potential in XML Builders

**Location:** `ConvexPress-Admin/packages/backend/convex/helpers/feedXml.ts` and `ConvexPress-Website/apps/web/src/lib/feeds/buildFeedResponse.ts`

The builders use CDATA sections for titles and content:
```xml
<title><![CDATA[${item.title}]]></title>
<content:encoded><![CDATA[${item.contentEncoded}]]></content:encoded>
```

If a post title or content contains the literal string `]]>`, this would break the CDATA section and potentially allow XML injection.

**Impact:** Low -- unlikely in practice (the `]]>` sequence is extremely rare in natural content), but it's a spec-compliance issue. The W3C Feed Validator would flag this.

**Recommendation:** Escape `]]>` sequences within CDATA content by splitting: `content.replace(/\]\]>/g, "]]]]><![CDATA[>")` -- this is the standard CDATA escaping technique.

### 14. Missing Trailing Slash Redirect (301)

**Location:** Knowledge doc section "Edge Cases & Gotchas" item 10 specifies:
> Handle both `/feed` and `/feed/`. Return HTTP 301 redirect from `/feed/` to `/feed` for canonical URLs.

The TanStack Start routes use trailing slashes in their route definitions (e.g., `createFileRoute("/api/feed/")`), suggesting the routes match with trailing slash. There is no explicit 301 redirect from the non-trailing-slash version.

**Impact:** Minor -- most feed readers handle both. But could cause duplicate feed entries in some aggregators.

**Recommendation:** Verify TanStack Start's behavior for both `/api/feed` and `/api/feed/`, and add redirects if needed.

### 15. `process.env.VITE_CONVEX_URL` in Server-Side Code

**Location:** `ConvexPress-Website/apps/web/src/lib/feeds/buildFeedResponse.ts` line 185

Using `process.env.VITE_CONVEX_URL` in server-side code is unconventional. The `VITE_` prefix typically indicates client-side env vars in Vite. While TanStack Start (which is Vite-based) may expose these server-side, it's worth verifying this is the intended pattern.

**Impact:** Could cause the env var to be undefined in certain SSR contexts if the build tool doesn't expose `VITE_` prefixed vars server-side.

**Recommendation:** Verify this works correctly in the deployed environment. Consider using a non-prefixed env var for server-side usage.

### 16. RSS Feed Widget Uses `useAction` for Public Feed Fetching

**Location:** `ConvexPress-Website/apps/web/src/features/widgets/components/types/rss-feed-widget.tsx` line 37

```typescript
const fetchFeed = useAction(api.widgets.actions.fetchRssFeed);
```

This calls a Convex action from the client side. The `fetchRssFeed` action in the widgets system is separate from the `feeds.fetchExternal` action (which requires admin auth). It's unclear if the widget action has its own rate limiting or abuse prevention.

**Impact:** External users could potentially use the widget action as a proxy to fetch arbitrary URLs, depending on its implementation.

**Recommendation:** Verify that `api.widgets.actions.fetchRssFeed` has appropriate rate limiting and URL validation. Consider whether it should require authentication.

### 17. `getFeedSettingsArgs` Defined but Not Used

**Location:** `ConvexPress-Admin/packages/backend/convex/feeds/validators.ts` line 99

```typescript
export const getFeedSettingsArgs = {};
```

This empty args object is defined but the `getFeedSettings` query in `queries.ts` uses `args: {}` directly instead of importing this validator.

**Impact:** None functionally. Just dead code.

**Recommendation:** Either use the validator in the query or remove it.

### 18. Backend `feedUrls.ts` `getFeedContentType` Function Unused

**Location:** `ConvexPress-Admin/packages/backend/convex/helpers/feedUrls.ts` lines 119-127

The `getFeedContentType()` function is exported but never imported anywhere. The website-side code has its own `getFeedContentType()` in `constants.ts`.

**Impact:** Dead code in the backend helpers.

**Recommendation:** Remove or document as available for future HTTP action approach.

---

## Compliance Checks

### Radix UI Imports (BANNED)

**Result: PASS** -- No `@radix-ui` imports found in any feed system file.

### Hardcoded Colors (BANNED)

**Result: PASS** -- No hardcoded Tailwind color names (zinc, slate, gray, stone, neutral) found. The RSS feed widget correctly uses `text-black/XX` opacity patterns (e.g., `text-black/50`, `text-black/40`, `text-black/60`, `bg-black/5`).

### Broken Imports

**Result: CONDITIONAL PASS** -- All imports within the feed system files reference valid targets. However:
- The API routes import `@/lib/feeds/buildFeedResponse` which exists and is correct.
- The `FeedDiscoveryHead` imports `@/lib/feeds/types` which exists and is correct.
- The backend files import from `../_generated/server` and `../_generated/api` which are auto-generated by Convex.
- The RSS feed widget imports `@convexpress-website/backend/convex/_generated/api` -- this depends on the monorepo package resolution working correctly.

### React 19 Compatibility

**Result: PASS** -- The components use standard React patterns. `FeedDiscoveryHead` is a pure function component returning JSX. The `RssFeedWidget` uses `useState` and `useEffect` (both stable React hooks). No deprecated lifecycle methods, no `findDOMNode`, no string refs.

### Convex Best Practices

| Practice | Status | Notes |
|----------|--------|-------|
| Indexes used for queries | PASS | All queries use appropriate indexes |
| Public queries for public data | PASS | Feed queries have no auth requirement |
| Actions for external API calls | PASS | `fetchExternal` uses action (not mutation) |
| Internal queries for cross-function calls | PASS | `internals.ts` uses `internalQuery` |
| Proper error types | PASS | `ConvexError` with structured error codes |
| Modular schema | N/A | RSS system owns no tables |
| Type-safe validators | PARTIAL | Validators exist but queries use `any` |

### Security

| Check | Status | Notes |
|-------|--------|-------|
| Content sanitization | PASS | `<script>`, `javascript:`, `on*`, `<iframe>`, `<form>` all stripped |
| XML injection prevention | PASS | `escapeXml()` handles all 5 XML entities |
| CDATA injection | WARN | `]]>` sequence not escaped (see issue #13) |
| No email exposure | PASS | Comments use `authorName`, never `authorEmail` |
| No internal ID exposure | PASS | Convex `_id` used only for comment anchors (acceptable) |
| Auth on fetchExternal | PASS | Requires Administrator (role level 100) |
| URL validation on fetchExternal | PASS | Validates HTTP/HTTPS protocol |
| X-Robots-Tag: noindex | PASS | Set on all feed responses |
| Rate limiting | NOT IMPLEMENTED | Knowledge doc specifies 60 req/min/IP; not implemented |

---

## Knowledge Document Accuracy Assessment

| Section | Accurate? | Notes |
|---------|-----------|-------|
| Quick Reference | Mostly | Index names don't match actual schema |
| Architecture Overview | Mostly | Describes HTTP actions as primary; TanStack Start routes are actual |
| Database Schema | Mostly | Index names differ from actual schema |
| Actions & Functions | Yes | All described functions exist |
| Helper Functions | Yes | All described helpers exist |
| Events | Yes | System correctly emits no events |
| Admin Routes | Yes | No admin routes needed |
| Website Routes | Mostly | URL paths differ (`/api/` prefix in actual) |
| Notifications | Yes | None needed |
| Role & Capability Matrix | Yes | Matches implementation |
| Dependencies | Yes | All dependencies correctly identified |
| Implementation Checklist | Partially | Option A (TanStack Start) was chosen; Option B items are N/A |
| Edge Cases | Mostly | Most handled; trailing slash redirect not implemented |

---

## Implementation Completeness vs. Knowledge Doc

| Feature | Status | Notes |
|---------|--------|-------|
| Main RSS 2.0 feed (`/feed`) | IMPLEMENTED | Via `/api/feed` |
| Main Atom 1.0 feed (`/feed/atom`) | IMPLEMENTED | Via `/api/feed/atom` |
| Explicit RSS 2.0 (`/feed/rss2`) | IMPLEMENTED | Via `/api/feed/rss2` |
| Category feed (RSS + Atom) | IMPLEMENTED | Via `/api/category/$slug/feed[/atom]` |
| Tag feed (RSS + Atom) | IMPLEMENTED | Via `/api/tag/$slug/feed[/atom]` |
| Author feed (RSS + Atom) | IMPLEMENTED | Via `/api/author/$slug/feed[/atom]` |
| Global comment feed (RSS + Atom) | IMPLEMENTED | Via `/api/comments/feed[/atom]` |
| Per-post comment feed (RSS + Atom) | IMPLEMENTED | Via `/api/blog/$slug/feed[/atom]` |
| Feed discovery `<link>` tags | IMPLEMENTED | `FeedDiscoveryHead` component |
| `fetchExternal` action | IMPLEMENTED | Admin-only, with proper auth |
| Feed settings (Settings System) | IMPLEMENTED | Reads `feedItemCount` + `feedContentDisplay` |
| ETag / 304 Not Modified | IMPLEMENTED | In `buildFeedResponse.ts` |
| Cache-Control headers | IMPLEMENTED | 1hr for posts, 30min for comments |
| X-Robots-Tag: noindex | IMPLEMENTED | On all feed responses |
| Content sanitization | IMPLEMENTED | All dangerous elements stripped |
| Excerpt generation | IMPLEMENTED | Word-boundary truncation |
| RSS 2.0 namespaces | IMPLEMENTED | content, dc, atom, sy, slash, media |
| Atom 1.0 structure | IMPLEMENTED | Proper `<entry>` elements |
| Block editor JSON detection | IMPLEMENTED | `isBlockEditorJson()` function |
| Convex HTTP Actions approach | NOT IMPLEMENTED | TanStack Start API routes chosen instead (acceptable) |
| Rate limiting | NOT IMPLEMENTED | Knowledge doc specifies 60 req/min/IP |
| Trailing slash redirects | NOT IMPLEMENTED | Knowledge doc specifies 301 redirect |
| Unit tests | NOT IMPLEMENTED | No test files found |

---

## Recommendations Summary

### Must Fix (Before Production)

1. **Address CDATA injection** -- Escape `]]>` sequences in CDATA content (issue #13)
2. **Add `QueryCtx` typing** -- Replace `any` types in queries.ts (issue #5)

### Should Fix (High Priority)

3. **Resolve code duplication** -- Choose one source of truth for XML/sanitization logic (issue #4)
4. **Update knowledge document** -- Fix index names, URL paths, implementation approach (issues #2, #3, #6, #7)
5. **Write unit tests** -- At minimum for escapeXml, date formatting, sanitization, and excerpt generation (issue #8)

### Nice to Have (When Time Permits)

6. **Optimize N+1 queries** -- Batch-fetch authors, terms, and media (issues #9, #10)
7. **Fix author feed ordering edge case** -- Over-fetch or add dedicated index (issue #11)
8. **Implement rate limiting** -- 60 req/min/IP as specified in knowledge doc
9. **Create formal PRD** -- Based on the knowledge doc (issue #1)
10. **Clean up dead code** -- Remove unused validators and backend helpers if not needed (issues #17, #18)

---

## Positive Highlights

1. **Excellent content sanitization** -- The `formatContentForFeed()` function handles all major attack vectors: `<script>`, `javascript:` URLs, `on*` handlers, `<iframe>`, `<form>`, and dangerous CSS.

2. **Standards-compliant XML output** -- Both RSS 2.0 and Atom 1.0 builders include all required elements, proper namespaces, and self-referencing `<atom:link>` tags.

3. **Clean architecture** -- The separation between backend queries (data fetching), helpers (XML building), and website routes (HTTP serving) is well-designed.

4. **Proper error handling in fetchExternal** -- Structured error codes, proper auth checks, URL validation, and graceful error propagation.

5. **Feed discovery component** -- `FeedDiscoveryHead` is well-designed with context-aware feed link generation for all feed types.

6. **Comment feed edge case handling** -- Correctly returns 404 when comments are closed AND zero comments exist, but still serves the feed when comments are closed but existing comments are present.

7. **Orphaned comment skipping** -- The `getRecentComments` query correctly skips comments whose parent post is deleted or unpublished.

8. **Complete endpoint coverage** -- All 12 feed endpoints (6 feed types x 2 formats) are implemented with proper API routes.
