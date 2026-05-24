# Search System - Expert Knowledge Document

**System:** Search System
**Status:** Complete (100%)
**Priority:** P2 - Medium
**Complexity:** Medium
**Category:** Content & Marketing
**Layer:** Full Stack
**WordPress Equivalent:** WP_Query `s` parameter, `search.php` template, SearchWP/Relevanssi plugin patterns
**Last Analyzed:** 2026-02-13
**Airtable System Record:** `[redacted-airtable-record-id]`
**Airtable Expert Record:** `[redacted-airtable-record-id]`

---

## Quick Reference

### What This System Does

The Search System provides full-text search across all published content in ConvexPress. It implements keyword-based content discovery with relevance-ranked results, filtered/faceted search, live autocomplete suggestions, a unified admin search API (Ctrl+K command palette), search analytics with click-through tracking, synonym management, and configurable stop word filtering. This is the equivalent of WordPress's built-in `WP_Query` search combined with the advanced capabilities of plugins like SearchWP and Relevanssi.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Unified Search Index** | Denormalized `searchIndex` table that aggregates content from posts, pages, media, and comments for cross-content-type search |
| **Dual Search Strategy** | Two parallel Convex search index queries (title + content) merged with weighted relevance scoring |
| **Relevance Weights** | Configurable multipliers: title (2.0x), excerpt (1.5x), taxonomy (1.2x), content (1.0x), plus manual boost scores |
| **Incremental Reindexing** | Event-driven: content changes trigger immediate index updates via Event Dispatcher subscriptions |
| **Full Reindexing** | Admin-triggered batch reindex of all content types, processing 100 items per batch |
| **Search Analytics** | Query logging with click-through tracking, zero-result detection, and volume-over-time analysis |
| **Synonyms** | Admin-managed term equivalence groups that expand search queries (OR logic) |
| **Stop Words** | Configurable list of common words stripped from queries before searching (but preserved for display) |
| **Highlighted Excerpts** | Search results include context windows around matched terms wrapped in `<mark>` tags |
| **Live Suggestions** | Debounced autocomplete from content titles and popular queries, appearing after 2+ characters |
| **Admin Command Palette** | Ctrl+K global search overlay showing results grouped by content type with status badges |
| **Content Stripping** | HTML/block markup removal pipeline for indexing plain text |
| **Searchable Content Types** | `post`, `page`, `media`, `comment` (configurable which are enabled) |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Search engine** | MySQL `LIKE '%term%'` on `post_title` + `post_content` | Convex full-text search indexes with built-in relevance scoring |
| **Database** | `WP_Query` with `s` parameter against `wp_posts` | Convex `.withSearchIndex()` queries on indexed tables |
| **Relevance scoring** | Basic (title match weighted 1.5x by default) | Configurable weights + boost scores + dual-index merging |
| **Reactivity** | Page reload for new search | Real-time results via Convex subscriptions (optional) |
| **Admin search** | Separate LIKE queries per list table | Unified admin search API across all content types (Ctrl+K) |
| **Live search** | Plugin territory (SearchWP Live Ajax, Relevanssi) | Built-in debounced instant search with Convex queries |
| **Search analytics** | Not built-in (plugin: SearchWP Metrics) | Built-in search query logging and analytics dashboard |
| **Stop words** | Not built-in | Configurable stop word list |
| **Synonyms** | Plugin (SearchWP) | Built-in `searchSynonyms` table with CRUD UI |
| **Highlighted excerpts** | Plugin (Relevanssi) | Built-in `generateHighlightedExcerpt()` |
| **Content types** | Searches posts/pages by default, filterable via `pre_get_posts` | Configurable per content type (posts, pages, media, comments) |
| **Indexing** | No separate index (queries directly against content) | Denormalized `searchIndex` table + native Convex search indexes |
| **URL structure** | `/?s=keyword` | `/search?q=keyword` |

---

## Architecture Overview

### Data Flow

```
Content Change (post created/updated/deleted)
    |
    v
Event Dispatcher (post.published, post.updated, post.deleted, etc.)
    |
    v
Search Event Handler (convex/search/eventHandlers.ts)
    |
    v
Incremental Reindex: Upsert/Delete in searchIndex table
    |
    v
Convex automatically updates search indexes on the searchIndex table

User Searches:
    Search Form input -> debounce 200ms -> search.suggest (autocomplete)
    Search Form submit -> search.query (full results)
        |
        v
    1. Sanitize & normalize query (lowercase, trim, stop words)
    2. Expand with synonyms (OR logic)
    3. Execute title search (search_title index) + content search (search_all index) in parallel
    4. Merge results (title 2.0x weight, deduplicate, apply boostScore)
    5. Apply post-query filters (category, tag, author, date range)
    6. Sort (relevance/date/title)
    7. Paginate
    8. Generate highlighted excerpts
    9. Log query to searchQueries (async, non-blocking)
    10. Return paginated results
```

### Real-Time Behavior

- **Search results page**: Uses standard Convex `useQuery` -- results are reactive. If content changes while a user is viewing search results, the results update automatically.
- **Admin search overlay**: Uses `useQuery` with debounced input. Results appear reactively as the query changes.
- **Search suggestions**: Reactive via `useQuery`. Suggestions update as the user types.
- **Search analytics dashboard**: Analytics queries are reactive -- admin sees live updates as new searches occur.
- **Index updates**: When content is created/updated/deleted, the search index updates within seconds via event-driven incremental reindexing. Convex search indexes update transactionally with the data.

### Authentication & Authorization

- **Public search** (`search.query` website variant): No authentication required. Only searches content with `status = "publish"`.
- **Admin search** (`search.adminQuery`): Requires Convex Auth authentication. Any authenticated role (Subscriber excluded) can use the admin search bar. Status-based visibility depends on role:
  - Administrator/Editor: See all content in all statuses
  - Author/Contributor: See all published content + their own drafts/pending
  - Subscriber: No admin search access
- **Search analytics** (`search.analytics`): Requires `manage_options` capability (Administrator only).
- **Search settings**: Requires `manage_options` capability (Administrator only).
- **Synonym management**: Requires `manage_options` capability (Administrator only).
- **Full reindex** (`search.reindex`): Requires `manage_options` capability (Administrator only).
- **Incremental reindex**: No auth required (called internally by event handlers).

---

## Database Schema

### `searchIndex` Table

The unified search index -- denormalized content from all searchable content types for cross-content-type full-text search.

```typescript
// convex/schema.ts

const searchableContentType = v.union(
  v.literal("post"),
  v.literal("page"),
  v.literal("media"),
  v.literal("comment"),
);

searchIndex: defineTable({
  // --- Identity ---
  contentType: searchableContentType,              // Which table this references: "post" | "page" | "media" | "comment"
  contentId: v.string(),                           // The _id of the referenced record (string for cross-table compatibility)

  // --- Searchable Fields (denormalized for unified search) ---
  title: v.string(),                               // Post/page/media title, or "" for comments. Max 500 chars, HTML stripped.
  content: v.string(),                             // Full text content, HTML/block markup stripped. Max 100,000 chars.
  excerpt: v.string(),                             // Short excerpt or first 200 chars of stripped content.

  // --- Metadata for Filtering ---
  authorId: v.string(),                            // user identifier of content creator
  authorName: v.string(),                          // Denormalized author display name
  status: v.string(),                              // Content status: "publish", "draft", "pending", "private", "trash", etc.

  // --- Taxonomy Terms (denormalized for search, posts only) ---
  categoryNames: v.optional(v.array(v.string())),  // Denormalized category names
  tagNames: v.optional(v.array(v.string())),       // Denormalized tag names

  // --- Custom Field Values (denormalized for search) ---
  customFieldValues: v.optional(v.array(v.string())), // Flattened custom field string values

  // --- Media-Specific ---
  altText: v.optional(v.string()),                 // Media alt text
  caption: v.optional(v.string()),                 // Media caption
  mimeType: v.optional(v.string()),                // Media MIME type (e.g., "image/jpeg")

  // --- URL for Results ---
  url: v.string(),                                 // Canonical URL path (e.g., "/blog/my-post")

  // --- Boost/Weight ---
  boostScore: v.optional(v.number()),              // Manual relevance boost. Sticky posts: +10, Featured: +5, Regular: 0. Non-negative.

  // --- Timestamps ---
  publishedAt: v.optional(v.number()),             // When content was published (ms timestamp)
  indexedAt: v.number(),                           // When this index entry was last updated. Set to Date.now() on every upsert.
  createdAt: v.number(),                           // When the source content was created
  updatedAt: v.number(),                           // When the source content was last updated
})
  // --- Convex Search Indexes ---
  .searchIndex("search_all", {
    searchField: "content",                        // Full-text search on content body
    filterFields: ["contentType", "status", "authorId"],
  })
  .searchIndex("search_title", {
    searchField: "title",                          // Full-text search on title (for title-weighted results)
    filterFields: ["contentType", "status"],
  })
  // --- Standard Indexes ---
  .index("by_content", ["contentType", "contentId"])           // Lookup by source content (for upsert/delete)
  .index("by_content_type_status", ["contentType", "status", "publishedAt"])  // Filtered listing
  .index("by_author", ["authorId", "contentType"])             // Author-filtered search
  .index("by_indexed", ["indexedAt"]),                          // For reindex progress tracking
```

### `searchQueries` Table

Analytics table logging every search query executed, with click-through tracking.

```typescript
searchQueries: defineTable({
  // --- Query Data ---
  query: v.string(),                               // Original search query string (trimmed, lowercased). Max 500 chars.
  normalizedQuery: v.string(),                      // Further normalized: stop words removed, trimmed. Max 500 chars.
  resultCount: v.number(),                         // Number of results returned. Non-negative integer.

  // --- Context ---
  userId: v.optional(v.string()),                  // user identifier (undefined for anonymous/public searches)
  source: v.union(                                 // Where the search was initiated
    v.literal("website"),                          // Public search form
    v.literal("admin"),                            // Admin search API / command palette
    v.literal("api"),                              // External API search
  ),

  // --- Filters Applied ---
  contentTypeFilter: v.optional(searchableContentType), // If user filtered by content type
  categoryFilter: v.optional(v.string()),          // If user filtered by category (name or slug)
  tagFilter: v.optional(v.string()),               // If user filtered by tag (name or slug)

  // --- Engagement ---
  clickedResults: v.optional(v.array(v.object({    // Which results the user clicked
    contentType: searchableContentType,
    contentId: v.string(),
    position: v.number(),                          // 1-based position in result list
    clickedAt: v.number(),                         // Timestamp of click
  }))),

  // --- Timestamps ---
  createdAt: v.number(),                           // When the search was performed. Immutable.
})
  .index("by_query", ["normalizedQuery", "createdAt"])     // Popular queries lookup
  .index("by_date", ["createdAt"])                         // Recent searches
  .index("by_user", ["userId", "createdAt"])               // User's search history
  .index("by_source", ["source", "createdAt"])             // Source analytics
  .index("by_zero_results", ["resultCount", "createdAt"]), // Zero-result queries
```

### `searchSynonyms` Table

Admin-managed synonym groups for query expansion.

```typescript
searchSynonyms: defineTable({
  term: v.string(),                                // The original/primary term. Max 100 chars, lowercased.
  synonyms: v.array(v.string()),                   // Equivalent terms. Each max 100 chars. Min 1, max 20 per group.
  isActive: v.boolean(),                           // Whether this synonym group is active. Default true.
  createdBy: v.string(),                           // user identifier of admin who created
  createdAt: v.number(),                           // Immutable.
  updatedAt: v.number(),                           // Updated on every mutation.
})
  .index("by_term", ["term", "isActive"])          // Lookup synonyms by term
  .index("by_active", ["isActive"]),               // List all active synonym groups
```

### Search Indexes on Existing Tables

In addition to the unified `searchIndex` table, native Convex search indexes are added directly to source content tables for fast type-specific searches:

```typescript
// On posts table (defined in Post System)
posts: defineTable({ /* ... */ })
  .searchIndex("search_posts", {
    searchField: "content",
    filterFields: ["status", "authorId"],
  })
  .searchIndex("search_posts_title", {
    searchField: "title",
    filterFields: ["status"],
  }),

// On pages table (defined in Page System)
pages: defineTable({ /* ... */ })
  .searchIndex("search_pages", {
    searchField: "content",
    filterFields: ["status"],
  })
  .searchIndex("search_pages_title", {
    searchField: "title",
    filterFields: ["status"],
  }),

// On media table (defined in Media System)
media: defineTable({ /* ... */ })
  .searchIndex("search_media", {
    searchField: "title",
    filterFields: ["mimeType"],
  }),

// On comments table (defined in Comment System)
comments: defineTable({ /* ... */ })
  .searchIndex("search_comments", {
    searchField: "content",
    filterFields: ["status", "postId"],
  }),
```

### Indexes Summary

| Table | Index Name | Fields | Purpose |
|-------|-----------|--------|---------|
| `searchIndex` | `search_all` | searchField: `content`, filterFields: `contentType`, `status`, `authorId` | Full-text search on content body |
| `searchIndex` | `search_title` | searchField: `title`, filterFields: `contentType`, `status` | Full-text search on title (higher relevance weight) |
| `searchIndex` | `by_content` | `contentType`, `contentId` | Lookup/upsert by source content reference |
| `searchIndex` | `by_content_type_status` | `contentType`, `status`, `publishedAt` | Filtered listing by type and status |
| `searchIndex` | `by_author` | `authorId`, `contentType` | Author-filtered queries |
| `searchIndex` | `by_indexed` | `indexedAt` | Reindex progress tracking |
| `searchQueries` | `by_query` | `normalizedQuery`, `createdAt` | Popular query aggregation |
| `searchQueries` | `by_date` | `createdAt` | Recent search listing |
| `searchQueries` | `by_user` | `userId`, `createdAt` | Per-user search history |
| `searchQueries` | `by_source` | `source`, `createdAt` | Source breakdown analytics |
| `searchQueries` | `by_zero_results` | `resultCount`, `createdAt` | Zero-result query detection |
| `searchSynonyms` | `by_term` | `term`, `isActive` | Synonym lookup by primary term |
| `searchSynonyms` | `by_active` | `isActive` | List all active synonyms |

### Relationships

| This Table | Field | References | Relationship |
|-----------|-------|-----------|--------------|
| `searchIndex.contentId` | `contentId` | `posts._id`, `pages._id`, `media._id`, `comments._id` | Many-to-one (string reference, not typed `v.id()` because cross-table) |
| `searchIndex.authorId` | `authorId` | user identifier | External reference |
| `searchQueries.userId` | `userId` | user identifier | External reference (optional) |
| `searchSynonyms.createdBy` | `createdBy` | user identifier | External reference |

---

## Actions & Functions

### Queries

#### `search.query` - Search Content (Website / Public)

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Action Code:** `search.query`
- **Convex Function:** `queries/search.query`
- **Type:** Query
- **Auth:** Public (no authentication required)
- **Capabilities:** None (public search)
- **Args:**
  ```typescript
  {
    q: v.string(),                                    // Search query string
    contentType: v.optional(searchableContentType),    // Filter by content type
    category: v.optional(v.string()),                  // Filter by category slug
    tag: v.optional(v.string()),                       // Filter by tag slug
    author: v.optional(v.string()),                    // Filter by author slug
    dateFrom: v.optional(v.number()),                  // Published after (ms timestamp)
    dateTo: v.optional(v.number()),                    // Published before (ms timestamp)
    orderBy: v.optional(v.union(
      v.literal("relevance"),
      v.literal("date"),
      v.literal("title"),
    )),
    orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    page: v.optional(v.number()),                      // 1-based pagination (default 1)
    perPage: v.optional(v.number()),                   // Results per page (default from settings, max 100)
  }
  ```
- **Returns:**
  ```typescript
  {
    results: Array<{
      contentType: "post" | "page" | "media" | "comment",
      contentId: string,
      title: string,
      excerpt: string,           // Highlighted excerpt with <mark> tags
      url: string,
      authorName: string,
      publishedAt: number | null,
      categoryNames?: string[],
      tagNames?: string[],
      mimeType?: string,
      relevanceScore: number,    // Only included in admin variant
    }>,
    query: string,
    total: number,
    page: number,
    perPage: number,
    totalPages: number,
    filters: {
      contentType?: string,
      category?: string,
      tag?: string,
      author?: string,
      dateFrom?: number,
      dateTo?: number,
    },
    suggestions?: string[],      // "Did you mean..." for low-result queries
  }
  ```
- **Behavior:**
  1. Validate and sanitize query: trim, check min length (1 char), truncate to 500 chars, lowercase, collapse spaces.
  2. Remove stop words from query for `normalizedQuery` (preserve original for display). If all words are stop words, keep original.
  3. Expand query with synonyms: look up each word in `searchSynonyms` table (active only), add synonym terms with OR logic.
  4. Execute two Convex search index queries in parallel:
     a. **Title search:** `searchIndex.search_title` with normalized query, filter `status = "publish"`, optional `contentType`.
     b. **Content search:** `searchIndex.search_all` with normalized query, filter `status = "publish"`, optional `contentType`.
  5. Merge and deduplicate: title matches get 2.0x relevance multiplier. Results in both get additive scores. Apply `boostScore`.
  6. Apply post-query filters: `category` (check `categoryNames` array), `tag` (check `tagNames`), `author` (match `authorName`), `dateFrom`/`dateTo` (check `publishedAt`).
  7. Sort: `relevance` (default, descending score), `date` (`publishedAt`), `title` (alphabetical).
  8. Paginate: default `perPage` from settings (10), max 100. Calculate offset.
  9. Generate highlighted excerpts: find search terms in content/excerpt, extract ~200 char window, wrap matches in `<mark>` tags.
  10. Log query to `searchQueries` (async, non-blocking) if analytics enabled in settings.
  11. Return paginated results.
- **Events:** None (analytics via `searchQueries` table instead)
- **Errors:**
  - `VALIDATION_ERROR`: Query empty after trimming
  - `VALIDATION_ERROR`: `perPage` exceeds 100
  - `VALIDATION_ERROR`: `page` less than 1

#### `search.adminQuery` - Search Content (Admin)

- **Convex Function:** `queries/search.adminQuery`
- **Type:** Query
- **Auth:** Required (Convex Auth)
- **Capabilities:** `search_admin` (any authenticated role except Subscriber)
- **Args:**
  ```typescript
  {
    q: v.string(),
    contentType: v.optional(searchableContentType),
    status: v.optional(v.string()),                    // Admin-only: filter by content status
    authorId: v.optional(v.string()),                  // Filter by author Convex Auth ID
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  }
  ```
- **Returns:** Same structure as `search.query` but includes `relevanceScore` in each result and results are grouped by content type.
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Check capability: any authenticated role (Subscriber excluded).
  3. Same query processing as website variant, except:
     a. Do NOT filter by `status = "publish"` by default. Show all statuses.
     b. Apply `status` filter if provided.
     c. Authors/Contributors: see only their own non-published content.
     d. Editors: see all content.
     e. Administrators: see all content including trash.
  4. Include `relevanceScore` in results (for admin debugging/tuning).
  5. Log with `source = "admin"`.
- **Errors:**
  - `UNAUTHORIZED`: Not authenticated
  - `FORBIDDEN`: Subscriber role or status filter with insufficient capabilities

#### `search.suggest` - Search Suggestions / Autocomplete

- **Convex Function:** `queries/search.suggest`
- **Type:** Query
- **Auth:** Public (no authentication required)
- **Args:**
  ```typescript
  {
    q: v.string(),                                    // Partial query (as user types)
    limit: v.optional(v.number()),                    // Max suggestions (default 5, max 10)
  }
  ```
- **Returns:**
  ```typescript
  {
    suggestions: Array<{
      text: string,              // The suggestion text
      type: "content" | "popular", // Source of suggestion
      contentType?: string,      // If from content, which type
      resultCount?: number,      // If from popular, how many results
    }>,
  }
  ```
- **Behavior:**
  1. Validate: must be >= 2 characters after trimming.
  2. Normalize: lowercase, trim.
  3. Generate suggestions from two sources:
     a. **Content titles:** Search `searchIndex.search_title` for matching titles (published only). Top N.
     b. **Popular searches:** Query `searchQueries` for recent queries starting with input. Rank by frequency.
  4. Deduplicate and merge: title suggestions first, popular queries second.
  5. Return up to `limit` (default 5, max 10) suggestions.
- **Errors:**
  - `VALIDATION_ERROR`: Query less than 2 characters

#### `search.analytics` / `search.getAnalytics` - Search Analytics

- **Convex Function:** `queries/search.analytics`
- **Type:** Query
- **Auth:** Required (Convex Auth)
- **Capabilities:** `manage_options` (Administrator only)
- **Args:**
  ```typescript
  {
    dateFrom: v.optional(v.number()),                 // Start of window (default: 30 days ago)
    dateTo: v.optional(v.number()),                   // End of window (default: now)
    limit: v.optional(v.number()),                    // Top N queries (default 50)
  }
  ```
- **Returns:**
  ```typescript
  {
    summary: {
      totalSearches: number,
      uniqueQueries: number,
      averageResultCount: number,
      clickThroughRate: number,    // Percentage (0-100)
      zeroResultRate: number,      // Percentage (0-100)
    },
    topQueries: Array<{
      query: string,
      count: number,
      avgResults: number,
      clickRate: number,
    }>,
    zeroResultQueries: Array<{
      query: string,
      count: number,
    }>,
    volumeByDay: Array<{
      date: string,                // ISO date string
      count: number,
    }>,
    sourceBreakdown: {
      website: number,
      admin: number,
      api: number,
    },
  }
  ```
- **Behavior:**
  1. Authenticate, check `manage_options`.
  2. Query `searchQueries` within date range.
  3. Aggregate: top queries by frequency, zero-result queries, daily volume, click-through rate, average results, source breakdown.
- **Errors:**
  - `UNAUTHORIZED`: Not authenticated
  - `FORBIDDEN`: Lacks `manage_options`

#### `search.listSynonyms` - List Synonym Groups

- **Convex Function:** `queries/search.listSynonyms`
- **Type:** Query
- **Auth:** Required (Convex Auth)
- **Capabilities:** `manage_options` (Administrator)
- **Args:** None
- **Returns:** `Array<{ _id, term, synonyms, isActive, createdBy, createdAt, updatedAt }>` ordered alphabetically by `term`.

### Mutations

#### `search.logClick` - Log Search Result Click

- **Convex Function:** `mutations/search.logClick`
- **Type:** Mutation
- **Auth:** Public (no authentication required)
- **Args:**
  ```typescript
  {
    searchQueryId: v.id("searchQueries"),             // The search query record
    contentType: searchableContentType,
    contentId: v.string(),
    position: v.number(),                             // 1-based position in results
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Fetch the `searchQueries` record by ID.
  2. Append clicked result to `clickedResults` array: `{ contentType, contentId, position, clickedAt: Date.now() }`.
  3. Update the record.
- **Events:** None
- **Errors:**
  - `NOT_FOUND`: Search query record does not exist

#### `search.createSynonym` - Create Synonym Group

- **Convex Function:** `mutations/search.createSynonym`
- **Type:** Mutation
- **Auth:** Required (Convex Auth)
- **Capabilities:** `manage_options` (Administrator)
- **Args:**
  ```typescript
  {
    term: v.string(),                                  // Max 100 chars, lowercased
    synonyms: v.array(v.string()),                     // Each max 100 chars, at least 1, max 20
  }
  ```
- **Returns:** `v.id("searchSynonyms")`
- **Behavior:**
  1. Authenticate, check `manage_options`.
  2. Validate: term not empty, synonyms array not empty, no duplicates, no empty strings.
  3. Normalize term and synonyms to lowercase.
  4. Check for duplicate term (existing synonym group with same term).
  5. Insert record with `isActive: true`, `createdBy`, `createdAt`, `updatedAt`.
- **Events:** None
- **Errors:**
  - `UNAUTHORIZED`, `FORBIDDEN`
  - `VALIDATION_ERROR`: Empty term, empty synonyms, duplicate term

#### `search.updateSynonym` - Update Synonym Group

- **Convex Function:** `mutations/search.updateSynonym`
- **Type:** Mutation
- **Auth:** Required (Convex Auth)
- **Capabilities:** `manage_options`
- **Args:**
  ```typescript
  {
    synonymId: v.id("searchSynonyms"),
    term: v.optional(v.string()),
    synonyms: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Authenticate, check `manage_options`.
  2. Fetch existing record by `synonymId`.
  3. Validate changed fields.
  4. Update record, set `updatedAt: Date.now()`.
- **Events:** None
- **Errors:**
  - `NOT_FOUND`: Synonym record does not exist
  - `VALIDATION_ERROR`: Invalid values

#### `search.deleteSynonym` - Delete Synonym Group

- **Convex Function:** `mutations/search.deleteSynonym`
- **Type:** Mutation
- **Auth:** Required (Convex Auth)
- **Capabilities:** `manage_options`
- **Args:**
  ```typescript
  {
    synonymId: v.id("searchSynonyms"),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Authenticate, check `manage_options`.
  2. Delete the synonym record.
- **Events:** None
- **Errors:**
  - `NOT_FOUND`: Record does not exist

### Actions

#### `search.reindex` - Reindex Content

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Action Code:** `search.reindex`
- **Convex Function:** `actions/search.reindex`
- **Type:** Action (long-running, uses Convex action not mutation)
- **Auth:** Required for full reindex (Administrator only). No auth for incremental (internal call).
- **Capabilities:** `manage_options` (full reindex only)
- **Args:**
  ```typescript
  {
    contentType: v.optional(searchableContentType),    // Specific type or all
    contentId: v.optional(v.string()),                 // Single item (incremental) or all
    force: v.optional(v.boolean()),                    // Force full reindex (default false)
  }
  ```
- **Returns (full reindex):**
  ```typescript
  {
    indexed: {
      post: number,
      page: number,
      media: number,
      comment: number,
    },
    removed: number,     // Orphaned entries cleaned up
    duration: number,    // Total time in ms
    errors: string[],    // Errors encountered (continues on error)
  }
  ```
- **Returns (incremental):** `{ updated: boolean }`
- **Behavior (Full Reindex - no contentId):**
  1. Authenticate, check `manage_options`.
  2. Check no other full reindex is running (prevent concurrent).
  3. Determine scope (specific contentType or all).
  4. Process in batches of 100 per content type:
     a. **Posts:** Query all, strip HTML, fetch taxonomy terms, fetch custom fields, build URL, calculate boostScore (sticky: +10, featured: +5), upsert into `searchIndex`.
     b. **Pages:** Query all, strip HTML, build hierarchical URL, upsert.
     c. **Media:** Use title, caption, altText, description. Build URL. Upsert.
     d. **Comments:** Only approved comments. Use comment content. Build URL as `{postUrl}#comment-{id}`. Upsert.
  5. Cleanup orphaned entries (index entries whose source content no longer exists).
  6. Return summary.
- **Behavior (Incremental - with contentId):**
  1. No authentication required (internal call from event handler).
  2. Fetch content by `contentType` + `contentId`.
  3. If exists: build index entry, upsert into `searchIndex`.
  4. If deleted: delete corresponding `searchIndex` entry.
  5. Return `{ updated: boolean }`.
- **Events:** None
- **Errors:**
  - `UNAUTHORIZED`, `FORBIDDEN` (full reindex only)
  - `NOT_FOUND`: contentId does not exist (incremental, returns `{ updated: false }`)
  - `ALREADY_RUNNING`: Full reindex already in progress

---

## Events

### Events the Search System Emits

The Search System does not emit any events. It is a read-heavy, discovery-oriented system. Analytics are handled via the `searchQueries` table rather than through the event system.

### Events the Search System Subscribes To

The Search System subscribes to content lifecycle events for incremental reindexing:

#### `post.created`
- **Source System:** Post System
- **Search Action:** Index new post (status = draft, not publicly searchable yet)
- **Handler:** Call `search.reindex({ contentType: "post", contentId: payload.postId })`

#### `post.published`
- **Source System:** Post System
- **Search Action:** Update index entry to `status = "publish"` (now publicly searchable)
- **Handler:** Call `search.reindex({ contentType: "post", contentId: payload.postId })`

#### `post.updated`
- **Source System:** Post System
- **Search Action:** Re-index post with updated content/title/excerpt
- **Handler:** Call `search.reindex({ contentType: "post", contentId: payload.postId })`

#### `post.trashed`
- **Source System:** Post System
- **Search Action:** Update index entry to `status = "trash"` (hidden from public search)
- **Handler:** Call `search.reindex({ contentType: "post", contentId: payload.postId })`

#### `post.deleted`
- **Source System:** Post System
- **Search Action:** Remove index entry entirely
- **Handler:** Call `search.reindex({ contentType: "post", contentId: payload.postId })` (handles deletion)

#### `post.unpublished`
- **Source System:** Post System
- **Search Action:** Update index entry status (hidden from public search)
- **Handler:** Call `search.reindex({ contentType: "post", contentId: payload.postId })`

#### `post.restored`
- **Source System:** Post System
- **Search Action:** Update index entry status (restored from trash)
- **Handler:** Call `search.reindex({ contentType: "post", contentId: payload.postId })`

#### `page.created`
- **Source System:** Page System
- **Search Action:** Index new page
- **Handler:** Call `search.reindex({ contentType: "page", contentId: payload.pageId })`

#### `page.published`
- **Source System:** Page System
- **Search Action:** Update index entry status
- **Handler:** Call `search.reindex({ contentType: "page", contentId: payload.pageId })`

#### `page.updated`
- **Source System:** Page System
- **Search Action:** Re-index page
- **Handler:** Call `search.reindex({ contentType: "page", contentId: payload.pageId })`

#### `page.trashed`
- **Source System:** Page System
- **Search Action:** Update index entry status
- **Handler:** Call `search.reindex({ contentType: "page", contentId: payload.pageId })`

#### `page.deleted`
- **Source System:** Page System
- **Search Action:** Remove index entry
- **Handler:** Call `search.reindex({ contentType: "page", contentId: payload.pageId })`

#### `media.uploaded`
- **Source System:** Media System
- **Search Action:** Index new media item
- **Handler:** Call `search.reindex({ contentType: "media", contentId: payload.mediaId })`

#### `media.updated`
- **Source System:** Media System
- **Search Action:** Re-index media item (title, alt text, caption changed)
- **Handler:** Call `search.reindex({ contentType: "media", contentId: payload.mediaId })`

#### `media.deleted`
- **Source System:** Media System
- **Search Action:** Remove index entry
- **Handler:** Call `search.reindex({ contentType: "media", contentId: payload.mediaId })`

#### `comment.created`
- **Source System:** Comment System
- **Search Action:** Index new approved comment
- **Handler:** Call `search.reindex({ contentType: "comment", contentId: payload.commentId })`

#### `comment.approved`
- **Source System:** Comment System
- **Search Action:** Index newly approved comment
- **Handler:** Call `search.reindex({ contentType: "comment", contentId: payload.commentId })`

#### `comment.deleted`
- **Source System:** Comment System
- **Search Action:** Remove index entry
- **Handler:** Call `search.reindex({ contentType: "comment", contentId: payload.commentId })`

#### `comment.spammed`
- **Source System:** Comment System
- **Search Action:** Remove index entry (spam is not searchable)
- **Handler:** Call `search.reindex({ contentType: "comment", contentId: payload.commentId })`

#### `taxonomy.term_updated`
- **Source System:** Taxonomy System
- **Search Action:** Re-index all posts with that term (denormalized category/tag names changed)
- **Handler:** Query all posts with the updated term, call `search.reindex` for each

#### `taxonomy.term_assigned`
- **Source System:** Taxonomy System
- **Search Action:** Re-index the affected post
- **Handler:** Call `search.reindex({ contentType: "post", contentId: payload.postId })`

#### `taxonomy.term_removed`
- **Source System:** Taxonomy System
- **Search Action:** Re-index the affected post
- **Handler:** Call `search.reindex({ contentType: "post", contentId: payload.postId })`

### Event Subscription Implementation Pattern

```typescript
// convex/search/eventHandlers.ts
import { internalMutation } from "../_generated/server";

export const onContentChanged = internalMutation({
  args: {
    contentType: searchableContentType,
    contentId: v.string(),
    action: v.union(v.literal("upsert"), v.literal("delete")),
  },
  handler: async (ctx, args) => {
    if (args.action === "delete") {
      const existing = await ctx.db
        .query("searchIndex")
        .withIndex("by_content", (q) =>
          q.eq("contentType", args.contentType).eq("contentId", args.contentId)
        )
        .unique();
      if (existing) {
        await ctx.db.delete(existing._id);
      }
      return;
    }
    // Upsert: fetch content and update index entry
    // Implementation per content type...
  },
});
```

---

## Admin Routes & UI

### Global Admin Search Bar (Header Component)

- **Purpose:** Unified search across all content types from any admin page. Ctrl+K command palette pattern.
- **WordPress Equivalent:** Admin bar search + individual list table search boxes (unified into one)
- **Location:** Fixed in admin header/toolbar, visible on every admin page
- **Layout:**
  ```
  [Search icon] [Search everything...              ] [Ctrl+K hint]
  ```
- **Key Components:**
  - `<AdminSearchBar />` - Trigger button in the admin header
  - `<AdminSearchOverlay />` - Modal search dialog (command palette)
  - `<AdminSearchResult />` - Individual result row with status badge
- **Data Requirements:**
  - `search.adminQuery` - Debounced (200ms), minimum 2 characters
  - `search.suggest` - For autocomplete suggestions
- **User Interactions:**
  - Click trigger or press Ctrl+K / Cmd+K to open overlay
  - Type to search (debounced 200ms)
  - Arrow keys to navigate results
  - Enter to navigate to selected result's edit page
  - Escape to close
- **Real-Time:** Results update reactively as query changes (Convex subscription)
- **Result Grouping:**
  ```
  Posts (3)
    - "My First Blog Post" - Published - Feb 1, 2026
    - "Draft Post About Cats" - Draft - Jan 28, 2026
  Pages (1)
    - "About Us" - Published
  Media (2)
    - hero-image.jpg - image/jpeg
  Comments (1)
    - "Great article!" on "My First Blog Post" - Approved
  ```
- **Status Badges:** Published = green, Draft = gray, Pending = yellow, Trash = red

### Search Settings & Analytics (`/admin/settings/search`)

- **Purpose:** Configure search behavior and view search analytics
- **WordPress Equivalent:** Settings > Reading (results per page) + SearchWP Settings plugin
- **Layout:** Tabbed or sectioned page with settings and analytics
- **Access:** Administrator only
- **Key Components:**
  - `<SearchAnalyticsDashboard />` - Summary cards, charts, tables
  - `<SynonymManager />` - CRUD interface for synonym groups
  - Settings form with toggles and number inputs
- **Data Requirements:**
  - `search.analytics` - For analytics data
  - `search.listSynonyms` - For synonym management
  - Settings System queries for search configuration values

#### Analytics Section

- **Summary Cards Row:** Total Searches | Unique Queries | Click-Through % | Zero Results %
- **Top Searches Table:** Query, Count, Avg Results, Click Rate
- **Zero-Result Queries Table:** Query, Search Count, Suggested Action (content gap detection)
- **Search Volume Chart:** Line chart of daily search volume
- **Date Range Picker:** Last 7 days | Last 30 days | Last 90 days | Custom

#### Settings Section

- **General:** Enable/disable search, results per page, min/max query length
- **Searchable Content Types:** Checkboxes for posts, pages, media, comments
- **Relevance Weights:** Number inputs for title (2.0), content (1.0), excerpt (1.5), taxonomy (1.2)
- **Stop Words:** Textarea, one word per line
- **Synonyms:** Link to synonym manager
- **Analytics:** Enable/disable logging, retention period (days)
- **Reindex:** Last reindex timestamp, item count, "Reindex All Content" button with confirmation, progress indicator

---

## Website Routes

### Search Results Page (`/search`)

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Purpose:** Public search results page for website visitors
- **URL Structure:** `/search?q=keyword&type=post&category=tutorials&page=2`
- **Layout:** Uses `_marketing` layout (same as blog, archives)
- **SEO:**
  - Title: `Search Results for "{query}" - {SiteName}`
  - Meta description: `{total} results found for "{query}"`
  - `noindex` for paginated results (page 2+) and filtered results
  - Canonical URL: `/search?q={query}` (without pagination params)
  - No OG image needed (search pages are not shareable)
- **Data Requirements:**
  - `search.query` - Main search results
  - `search.suggest` - Live suggestions in search form
  - Taxonomy queries for filter dropdowns (categories, tags)
- **Caching:** No SSR caching (search is dynamic, user-specific query)
- **Key Components:**
  - `<SearchForm />` - Pre-filled with current query, live suggestions
  - `<SearchFilters />` - Content type tabs, category/tag dropdowns, sort selector
  - `<SearchResults />` - Results list container
  - `<SearchResultCard />` - Individual result (variants per content type)
  - `<HighlightedExcerpt />` - Excerpt with `<mark>` highlighted terms
  - `<SearchPagination />` - Page navigation
  - `<EmptySearchResults />` - Zero-results state with suggestions
- **Result Card Variants:**
  - **Post:** Blog icon, POST badge, title, author, date, categories/tags, highlighted excerpt
  - **Page:** Page icon, PAGE badge, title, highlighted excerpt
  - **Media:** Image icon, IMAGE badge, title, alt text, thumbnail preview (80x80px), highlighted excerpt
  - **Comment:** Comment icon, COMMENT badge, "on {Post Title}", author, date, highlighted excerpt

### Search Form Widget

- Available for placement in sidebars, footers, widget areas via widget areas
- **Compact variant (sidebar):** `Search [Search...] [Go]`
- **Expanded variant (404 page, empty states):** `Looking for something? [Search this site...] [Search]`
- Component: `<SearchFormWidget />`

### Live Search / Instant Results

- Appears on any search input (header, sidebar widget, search page)
- Debounced 200ms, minimum 2 characters
- Dropdown shows up to 5 suggestions:
  - Content title matches: Navigate directly to content page on select
  - Popular search queries: Navigate to `/search?q=selected+query` on select
- Enter: Navigate to `/search?q=current+input`
- Escape/blur: Close dropdown

---

## Notifications

### Email Notifications

None. The Search System does not trigger email notifications. Search is a read-only discovery mechanism.

**Future consideration:** Zero-result analytics digest email to administrators ("Content gaps detected this week: 15 queries with no results"). Deferred.

### Site Notifications

None. The Search System does not trigger site notifications.

**Future consideration:** Real-time admin notification when a spike in zero-result queries is detected (anomaly detection). Deferred.

---

## Role & Capability Matrix

| Capability String | Description | Admin | Editor | Author | Contributor | Subscriber | Public |
|------------------|-------------|-------|--------|--------|-------------|------------|--------|
| `search_public` | Search published content on the website | Yes | Yes | Yes | Yes | Yes | Yes |
| `search_admin` | Use the admin global search bar | Yes | Yes | Yes | Yes | No | No |
| `search_all_statuses` | Search content in any status (draft, pending, trash) | Yes | Yes | No | No | No | No |
| `search_own_drafts` | Search own draft/pending content via admin | Yes | Yes | Yes | Yes | No | No |
| `manage_search_settings` | Configure search settings, weights, stop words | Yes | No | No | No | No | No |
| `manage_search_synonyms` | Create/edit/delete search synonyms | Yes | No | No | No | No | No |
| `view_search_analytics` | View search analytics dashboard | Yes | No | No | No | No | No |
| `reindex_search` | Trigger full content reindex | Yes | No | No | No | No | No |

---

## Dependencies

### Depends On

| System | Type | What It Provides |
|--------|------|-----------------|
| **Post System** | **Hard** | `posts` table with title, content, excerpt, status, slug. Post lifecycle events (`post.created`, `post.published`, `post.updated`, `post.trashed`, `post.deleted`, `post.unpublished`, `post.restored`) for incremental reindexing. Primary searchable content. |
| **Auth System** | **Soft** | Convex Auth authentication for admin search, analytics user tracking. Public search works without auth. |
| **Role & Capability System** | **Soft** | `currentUserCan()` checks for admin search, analytics, settings, reindex. Public search has no capability checks. |
| **Event Dispatcher System** | **Soft** | Subscribes to content events for real-time incremental reindexing. Without it, only manual reindex works. |
| **Settings System** | **Soft** | Search configuration (results per page, weights, stop words, analytics toggle). Falls back to defaults without it. |
| **Page System** | **Soft** | Pages as searchable content. Search works without pages -- they just won't be indexed. |
| **Media System** | **Soft** | Media items as searchable content (title, alt text, caption). |
| **Comment System** | **Soft** | Comments as optionally searchable content. Disabled by default. |
| **Taxonomy System** | **Soft** | Category/tag names denormalized onto posts for taxonomy-based filtering. Taxonomy events for re-indexing when terms change. |
| **Custom Field System** | **Soft** | Custom field values denormalized for search inclusion. |

### Depended On By

| System | Type | What It Needs |
|--------|------|--------------|
| **SEO System** | **Soft** | Search results page needs `noindex` meta for paginated/filtered results. |
| **Dashboard System** | **Soft** | Potential search analytics summary widget on the admin dashboard (e.g., "Top searches today"). |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)

- [ ] `convex/schema.ts` - Add `searchIndex`, `searchQueries`, `searchSynonyms` tables (3 tables) + search indexes on existing `posts`, `pages`, `media`, `comments` tables
- [ ] `convex/search/query.ts` - Public search query (`search.query`)
- [ ] `convex/search/adminQuery.ts` - Admin search query (`search.adminQuery`)
- [ ] `convex/search/suggest.ts` - Autocomplete suggestions query (`search.suggest`)
- [ ] `convex/search/reindex.ts` - Full and incremental reindex action (`search.reindex`)
- [ ] `convex/search/analytics.ts` - Search analytics query (`search.analytics`)
- [ ] `convex/search/logClick.ts` - Log click mutation (`search.logClick`)
- [ ] `convex/search/synonyms.ts` - Synonym CRUD: `createSynonym`, `updateSynonym`, `deleteSynonym`, `listSynonyms`
- [ ] `convex/search/eventHandlers.ts` - Event subscription handlers for incremental reindex (`onContentChanged`)
- [ ] `convex/search/purgeAnalytics.ts` - Scheduled function for auto-purging old analytics data
- [ ] `convex/search/helpers.ts` - Shared logic (result merging, relevance scoring)

### Shared Libraries (ConvexPress-Admin/packages/backend/ or shared package)

- [ ] `lib/search/stripContent.ts` - `stripContentForSearch()`, `generateHighlightedExcerpt()`, `decodeHtmlEntities()`
- [ ] `lib/search/stopWords.ts` - `removeStopWords()`, `DEFAULT_STOP_WORDS`
- [ ] `lib/search/relevance.ts` - `mergeSearchResults()`, relevance score calculation
- [ ] `lib/search/escapeRegex.ts` - `escapeRegex()` for safe regex construction

### Admin Frontend (ConvexPress-Admin/apps/web/)

- [ ] `src/components/admin/AdminSearchBar.tsx` - Trigger button in admin header
- [ ] `src/components/admin/AdminSearchOverlay.tsx` - Command palette modal
- [ ] `src/components/admin/AdminSearchResult.tsx` - Individual result row with status badge
- [ ] `src/routes/admin/settings/search.tsx` - Search settings + analytics page
- [ ] `src/components/admin/SearchAnalyticsDashboard.tsx` - Analytics charts and tables
- [ ] `src/components/admin/SynonymManager.tsx` - Synonym group CRUD interface
- [ ] `src/components/admin/ReindexButton.tsx` - Reindex trigger with confirmation and progress

### Website Frontend (ConvexPress-Website/apps/web/)

- [ ] `src/routes/search.tsx` - Search results page route (`/search`)
- [ ] `src/components/search/SearchForm.tsx` - Reusable search form with live suggestions
- [ ] `src/components/search/SearchSuggestions.tsx` - Autocomplete dropdown
- [ ] `src/components/search/SearchResults.tsx` - Results list container
- [ ] `src/components/search/SearchResultCard.tsx` - Individual result card (variants per content type)
- [ ] `src/components/search/SearchFilters.tsx` - Content type, category, tag, date filters
- [ ] `src/components/search/SearchPagination.tsx` - Pagination controls
- [ ] `src/components/search/HighlightedExcerpt.tsx` - Text with highlighted search terms
- [ ] `src/components/search/SearchFormWidget.tsx` - Compact search form for sidebars/widgets
- [ ] `src/components/search/EmptySearchResults.tsx` - Zero results state with suggestions

### Cron Jobs

- [ ] `convex/crons.ts` - Daily purge of old search analytics (3:00 AM UTC, configurable retention period)

---

## Edge Cases & Gotchas

1. **Empty search query:** Return empty results with message "Please enter a search term." Never return all content for an empty query.

2. **All stop words query:** If every word in the query is a stop word (e.g., "the and or"), use the original query as-is. Do not remove all words and produce an empty search.

3. **Very long query (>500 chars):** Truncate silently to 500 characters. No error returned -- just quietly truncate.

4. **Special characters / regex injection:** Escape regex-special characters (`.*+?^${}()|[]\\`) before using in any regex operations (e.g., highlighted excerpt generation). Never pass raw user input to regex constructors.

5. **Concurrent full reindex:** If a full reindex is triggered while one is already running, reject with `ALREADY_RUNNING` error. Prevent concurrent full reindexes to avoid data inconsistency.

6. **Orphaned index entries:** Content deleted while a full reindex is running may leave orphaned entries in `searchIndex`. The cleanup step at the end of reindex scans for entries whose source content no longer exists and deletes them.

7. **Unicode / emoji in search queries:** Convex handles UTF-8 natively. No special handling needed. Emoji should work in search queries.

8. **HTML in search results / XSS:** All content in `searchIndex` is pre-stripped of HTML. Highlighted excerpts contain `<mark>` tags which should be rendered with `dangerouslySetInnerHTML` or a sanitization pass. Never include user-generated HTML in excerpts.

9. **Search for numbers:** Number-only queries (e.g., "2026") must work. Do not treat them as stop words.

10. **Pagination beyond total results:** If `page` exceeds `totalPages`, return empty results array with correct `totalPages` value. Not an error.

11. **Deep pagination performance:** Convex search does not support `skip`/`offset`. Implementation fetches with `.take(N)` and slices in application code. For deep pagination (page 50+), this becomes inefficient. Consider limiting max pages or using cursor-based pagination for very deep results.

12. **Synonym expansion multiplying queries:** Each synonym term expands the search. Keep synonym groups capped at max 20 per term to avoid query explosion.

13. **Convex search index limitation -- no `.filter()` chaining:** Search index queries cannot be combined with standard `.filter()` in the same query chain. Post-query filtering (category, tag, date range, author) must be done in application code after the search results are retrieved.

14. **Convex search index -- no range queries on filterFields:** `filterFields` only support `eq` comparisons. Date range filtering (`dateFrom`/`dateTo`) must be done in application code, not in the search index query.

15. **Convex search index -- relevance score not exposed:** Convex returns results ordered by relevance but does not expose the raw score. Use result position as a proxy for relevance when merging title and content results.

16. **Password-protected content:** Show title with "[Protected]" badge in results, but no excerpt or content preview. The content field in `searchIndex` should still contain the text (for admin search), but the public query should strip the excerpt for protected posts.

17. **Search analytics async logging:** Log search queries via a separate mutation call (non-blocking). The search response must not be delayed by analytics writes. If logging fails, silently ignore.

18. **Content indexed with old taxonomy names:** When a taxonomy term is renamed (`taxonomy.term_updated`), all posts with that term must be re-indexed to update the denormalized `categoryNames`/`tagNames` arrays. This could affect many posts.

---

## Content Stripping & Indexing Pipeline

### Content Processing Steps

```
Raw Content (HTML / Block Markup)
  -> Strip block editor delimiters (<!-- wp:paragraph --> etc.)
  -> Strip HTML tags (preserving text content)
  -> Decode HTML entities (&amp; -> &, etc.)
  -> Normalize whitespace (collapse multiple spaces/newlines)
  -> Trim
  -> Store as searchable plain text
```

### Key Utility Functions

```typescript
// lib/search/stripContent.ts

export function stripContentForSearch(raw: string): string {
  let text = raw;
  text = text.replace(/<!--\s*\/?wp:[^>]*-->/g, "");    // Block editor comments
  text = text.replace(/<[^>]+>/g, " ");                   // HTML tags -> space
  text = decodeHtmlEntities(text);                         // HTML entities
  text = text.replace(/\s+/g, " ").trim();                // Normalize whitespace
  return text;
}

export function generateHighlightedExcerpt(
  content: string,
  query: string,
  maxLength: number = 200,
  highlightTag: string = "mark",
): string {
  // Strip content, find first occurrence, extract window, wrap matches in <mark>
}
```

```typescript
// lib/search/stopWords.ts

export function removeStopWords(query: string, customStopWords?: Set<string>): string {
  // Remove stop words but preserve original if ALL words are stop words
}
```

```typescript
// lib/search/relevance.ts

export function mergeSearchResults(
  titleResults: SearchIndexDoc[],
  contentResults: SearchIndexDoc[],
  weights: { titleWeight: number; contentWeight: number },
): MergedResult[] {
  // Merge with deduplication, apply weights using position as relevance proxy
}
```

---

## Search Settings Reference

Settings stored in the Settings System, read by Search System at runtime:

| Setting Key | Type | Default | Description |
|-------------|------|---------|-------------|
| `search_enabled` | `boolean` | `true` | Master toggle for site search |
| `search_results_per_page` | `number` | `10` | Default results per page |
| `search_min_query_length` | `number` | `1` | Minimum characters to execute search |
| `search_max_query_length` | `number` | `500` | Maximum characters accepted |
| `search_content_types` | `string[]` | `["post", "page"]` | Searchable content types |
| `search_title_weight` | `number` | `2.0` | Title match relevance multiplier |
| `search_content_weight` | `number` | `1.0` | Content match relevance multiplier |
| `search_excerpt_weight` | `number` | `1.5` | Excerpt match relevance multiplier |
| `search_taxonomy_weight` | `number` | `1.2` | Taxonomy term match relevance multiplier |
| `search_stop_words` | `string` | (see defaults) | Newline-separated stop word list |
| `search_analytics_enabled` | `boolean` | `true` | Whether to log search queries |
| `search_analytics_retention_days` | `number` | `90` | Days to keep analytics data |
| `search_highlight_tag` | `string` | `"mark"` | HTML tag for highlighting matches |
| `search_excerpt_length` | `number` | `200` | Characters of context in excerpts |
| `search_suggest_enabled` | `boolean` | `true` | Show live suggestions |
| `search_suggest_min_chars` | `number` | `2` | Minimum chars before showing suggestions |
| `search_suggest_limit` | `number` | `5` | Maximum number of suggestions |
| `search_include_comments` | `boolean` | `false` | Include comments in search |

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `WP_Query('s' => $term)` | `search.query` Convex query | Full-text search with relevance |
| `get_search_query()` | `searchParams.q` from URL | URL parameter `q` |
| `get_search_form()` | `<SearchForm />` React component | Reusable component with live suggestions |
| `is_search()` | Route check on `/search` | TanStack Router route match |
| `the_search_query()` | `searchParams.q` in component | Escaped/sanitized automatically |
| `pre_get_posts` (modify search) | Search query builder with filter args | Filters passed as query args |
| `posts_search` (filter WHERE) | Convex search index query composition | `.withSearchIndex()` API |
| `posts_search_orderby` (sort) | `orderBy` argument in `search.query` | Relevance, date, or title |
| `search_form_top` / `search_form_bottom` | Component composition (children/slots) | React component props |
| `get_search_form` (filter form HTML) | `<SearchForm />` component props | Prop-driven customization |
| `relevanssi_modify_wp_query` | Post-processing in query handler | Application-layer result filtering |
| `relevanssi_hit` (filter result) | Result mapping in query handler | Per-result transformation |
| SearchWP synonym management | `searchSynonyms` table + CRUD | Built-in, not a plugin |
| SearchWP stop words | `removeStopWords()` utility | Built-in, configurable |
| Relevanssi highlighted excerpts | `generateHighlightedExcerpt()` | Built-in, `<mark>` tags |
| SearchWP Metrics analytics | `searchQueries` table + analytics query | Built-in dashboard |
| Admin list table search box | `search.adminQuery` unified API | One search for all content types |
| `/?s=keyword` URL pattern | `/search?q=keyword` | Cleaner URL structure |

---

## Recommended Build Order

1. **Schema first:** Add `searchIndex`, `searchQueries`, `searchSynonyms` tables. Add search indexes to existing tables.
2. **Content stripping utilities:** `stripContentForSearch()`, `generateHighlightedExcerpt()`, `removeStopWords()`, `escapeRegex()`.
3. **Core search query:** `search.query` with dual-index search, relevance merging, pagination.
4. **Reindex action:** `search.reindex` for full and incremental reindexing.
5. **Event subscriptions:** Wire up event listeners for incremental reindex on content changes.
6. **Website search page:** `/search` route with results, filters, pagination.
7. **Search form component:** `<SearchForm />` with live suggestions dropdown.
8. **Admin search bar:** Global admin search overlay (Ctrl+K command palette).
9. **Search analytics:** Query logging in `search.query`, analytics dashboard.
10. **Settings integration:** Search settings page with content type toggles, weights, stop words.
11. **Synonym management:** CRUD UI for synonym groups.

---

## Performance Considerations

1. **Convex search indexes are maintained automatically** -- no separate index sync problem. Updates are transactional.
2. **The `searchIndex` table intentionally duplicates data** -- denormalization tradeoff for cross-content-type search speed.
3. **Search analytics logging is async** -- use a separate mutation, so search response is not blocked.
4. **Pagination via `.take(N)` + slicing** -- Convex has no `skip`/`offset`. Deep pagination (50+ pages) becomes inefficient. Mitigate with max page limit or cursor-based approach.
5. **Synonym expansion multiplies queries** -- keep synonym groups small (max 20 per term).
6. **Taxonomy term renames can trigger mass re-indexing** -- when a term used by 1000 posts is renamed, all 1000 must be re-indexed. Process in batches.

---

## Open Questions

- [ ] Should Convex's built-in search be sufficient for v1, or plan for external search (Meilisearch, Typesense)? **Recommendation:** Start with Convex, plan abstraction layer.
- [ ] Should password-protected content appear in results with "[Protected]" badge? **Recommendation:** Yes, show title, no excerpt.
- [ ] Should recent content get a freshness boost? **Recommendation:** Yes, configurable (e.g., <7 days = 1.2x).
- [ ] Should admin search also surface settings pages and admin routes (command palette style)? **Recommendation:** Yes, include `navigation` result type.

---

## Airtable Record References

| Entity | Record ID |
|--------|-----------|
| System | `[redacted-airtable-record-id]` |
| Expert | `[redacted-airtable-record-id]` |
| Action: search.query | `[redacted-airtable-record-id]` |
| Action: search.reindex | `[redacted-airtable-record-id]` |
| Route: /search | `[redacted-airtable-record-id]` |
| Route: /api/admin/search | `[redacted-airtable-record-id]` |
