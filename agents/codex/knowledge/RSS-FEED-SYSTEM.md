# RSS/Feed System - Expert Knowledge Document

**System:** RSS/Feed System
**Status:** Complete (100%)
**Priority:** P3 - Low
**Complexity:** Simple
**Layer:** Backend
**Category:** Content & Marketing (Discovery)
**WordPress Equivalent:** Feed template system (`feed-rss2.php`, `feed-atom.php`), `do_feed` hooks, `feed_links()`, `fetch_feed()`
**Last Analyzed:** 2026-02-13

---

## Quick Reference

### What This System Does

The RSS/Feed System generates standards-compliant syndication feeds (RSS 2.0 and Atom 1.0) for ConvexPress. It serves XML feeds for published posts, category archives, tag archives, author archives, and comments. In WordPress, this corresponds to the `do_feed_rss2()` / `do_feed_atom()` template rendering, `feed_links()` / `feed_links_extra()` discovery output, and `fetch_feed()` external feed parsing. The system is entirely **read-only and stateless** -- it has **no database tables of its own** and queries the Post, Taxonomy, Comment, and Settings systems to dynamically generate XML output.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **RSS 2.0** | Primary feed format, served at `/api/feed` and `/api/feed/rss2` |
| **Atom 1.0** | Alternative feed format, served at `/api/feed/atom` |
| **Feed Discovery** | `<link rel="alternate">` tags in HTML `<head>` for feed reader auto-detection |
| **Category/Tag/Author Feeds** | Filtered feeds scoped to a specific taxonomy term or author |
| **Comment Feeds** | Global (`/api/comments/feed`) and per-post (`/api/blog/{slug}/feed`) comment feeds |
| **Feed Item Count** | `feedItemCount` setting (default 10) -- number of items per feed |
| **Feed Content Display** | `feedContentDisplay` setting -- `"full"` (complete HTML) or `"summary"` (excerpt only) |
| **ETag / Conditional Requests** | HTTP caching via `ETag` and `If-None-Match` for 304 Not Modified responses |
| **External Feed Parsing** | `fetchExternal` action for consuming third-party RSS/Atom feeds (admin only) |
| **No Own Tables** | This system reads from `posts`, `terms`, `taxonomyRelationships`, `comments`, `settings` |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Feed Generation** | PHP template rendering (`feed-rss2.php`) | Convex HTTP action or TanStack Start API route generating XML strings |
| **URL Structure** | `/feed/`, `/feed/rss2/`, `/feed/atom/` | `/api/feed`, `/api/feed/rss2`, `/api/feed/atom` (TanStack Start API routes) |
| **Caching** | WP Object Cache + transients | HTTP `Cache-Control` + `ETag` headers; Convex query caching |
| **Feed Formats** | RSS 0.92, RSS 2.0, RDF, Atom 1.0 | RSS 2.0, Atom 1.0 only (legacy formats omitted) |
| **Custom Feeds** | `add_feed()` for registering custom feeds | Extensible via additional HTTP action routes |
| **Pingbacks** | Built-in ping on publish | Not implemented (obsolete protocol) |
| **Feed Validation** | None built-in | Validates against W3C Feed Validation specs |
| **Content Filtering** | `the_content_feed` filter hook | `formatContentForFeed()` helper function |
| **Feed Discovery** | `wp_head` action outputs `<link>` tags | `FeedDiscoveryHead` React component |
| **Feed Templates** | PHP template files | TypeScript XML builder functions (type-safe, testable) |
| **Private/Scheduled/Trash Posts** | Excluded from feeds | Excluded from feeds (same behavior) |

---

## Architecture Overview

### Data Flow

1. **External request** hits a feed URL (e.g., `/feed`, `/category/news/feed`).
2. **HTTP action** (or TanStack Start API route) handles the request.
3. **Convex queries** fetch published posts, taxonomy terms, comments, and settings from the database.
4. **Author metadata** is fetched from the auth system (cached, batched by unique author ID).
5. **XML builder helpers** (`buildRssChannel` / `buildAtomFeed`) construct the XML string from the queried data.
6. **Content formatting** via `formatContentForFeed()` sanitizes HTML, converts relative URLs to absolute, strips unsafe elements.
7. **HTTP response** returns the XML with proper `Content-Type`, `Cache-Control`, `ETag`, and `Last-Modified` headers.
8. **Conditional request handling**: if the client sends `If-None-Match` matching the current ETag, return 304 Not Modified.

### Real-Time Behavior

This system has **no real-time subscriptions**. Feed endpoints are standard HTTP request/response -- each request fetches fresh data from Convex (which has fast deterministic caching). There are no WebSocket connections or Convex `useQuery` subscriptions involved in feed serving.

**Cache Invalidation** is passive:
- Post feeds use `max-age=3600` (1 hour) -- changes appear within an hour.
- Comment feeds use `max-age=1800` (30 minutes) -- comments appear within 30 minutes.
- ETag-based validation ensures clients can check for updates without re-downloading the full feed.
- No active cache purging is needed.

### Authentication & Authorization

| Action | Auth Required | Capability |
|--------|--------------|------------|
| View any feed (GET) | No (public) | None |
| Configure feed settings | Yes | `manage_options` (Administrator) |
| Fetch external feed | Yes | `manage_options` (Administrator) |

All feed endpoints are **completely public and unauthenticated**, matching WordPress behavior. Feed configuration happens through the Settings System (not the RSS system itself). The only authenticated action is `fetchExternal`, which requires Administrator privileges.

---

## Database Schema

**This system owns NO tables.** It is a pure read layer. Below are the tables it reads from, owned by other systems.

### Posts Table (Owned by Post System)

```typescript
posts: defineTable({
  title: v.string(),
  slug: v.string(),
  content: v.string(),
  excerpt: v.optional(v.string()),
  status: v.union(
    v.literal("publish"),
    v.literal("draft"),
    v.literal("pending"),
    v.literal("private"),
    v.literal("trash"),
    v.literal("future"),
  ),
  authorId: v.string(),
  publishedAt: v.optional(v.number()),
  commentStatus: v.union(v.literal("open"), v.literal("closed")),
  commentCount: v.number(),
  featuredImageId: v.optional(v.string()),
  updatedAt: v.number(),
})
  .index("by_published", ["status", "publishedAt"])  // Primary index for feed queries
```

**Feed usage:** Only posts with `status === "publish"` appear in feeds. Ordered by `publishedAt` desc, limited to `feedItemCount`.

### Terms Table (Owned by Taxonomy System)

```typescript
terms: defineTable({
  name: v.string(),
  slug: v.string(),
  taxonomy: v.union(v.literal("category"), v.literal("tag")),
  description: v.optional(v.string()),
})
  .index("by_slug_taxonomy", ["slug", "taxonomy"])  // Lookup for /category/{slug}/feed
```

**Feed usage:** Category/tag feeds look up the term by slug and taxonomy type. Term name is used in feed title. Term description is used in feed description.

### Taxonomy Relationships Table (Owned by Taxonomy System)

```typescript
taxonomyRelationships: defineTable({
  postId: v.id("posts"),
  termId: v.id("terms"),
})
  .index("by_term", ["termId"])  // Used for category/tag feed post filtering
```

**Feed usage:** Resolves which posts belong to a category or tag for filtered feeds. Also provides `<category>` elements on feed items.

### Comments Table (Owned by Comment System)

```typescript
comments: defineTable({
  postId: v.id("posts"),
  authorName: v.string(),
  authorEmail: v.string(),
  content: v.string(),
  status: v.union(
    v.literal("approved"),
    v.literal("pending"),
    v.literal("spam"),
    v.literal("trash"),
  ),
  createdAt: v.number(),
})
  .index("by_post", ["postId", "status", "createdAt"])  // Per-post comment feeds
  .index("by_status", ["status", "createdAt"])          // Global comment feed
```

**Feed usage:** Only `status === "approved"` comments appear in feeds. Global feed uses `by_status` index; per-post feed uses `by_post` index.

### Settings Table (Owned by Settings System)

```typescript
settings: defineTable({
  key: v.string(),
  value: v.string(),
  group: v.string(),
})
  .index("by_key", ["key"])  // Feed settings lookup
```

**Feed usage:** Reads these setting keys:

| Setting Key | Type | Default | Source |
|------------|------|---------|--------|
| `siteTitle` | `string` | `"My Site"` | Settings > General |
| `siteDescription` | `string` | `"Just another ConvexPress site"` | Settings > General |
| `siteUrl` | `string` | `""` | Settings > General |
| `feedItemCount` | `number` | `10` | Settings > Reading |
| `feedContentDisplay` | `"full" \| "summary"` | `"full"` | Settings > Reading |
| `language` | `string` | `"en-US"` | Settings > General |

### Indexes Used by Feed Queries

| Index | Table | Fields | Purpose |
|-------|-------|--------|---------|
| `by_type_published` | `posts` | `["type", ...]` | Fetch published posts of type "post" |
| `by_author` | `posts` | `["authorId", "type", "status"]` | Author feed posts |
| `by_slug` | `posts` | `["slug", "type"]` | Look up post by slug for comment feeds |
| `by_slug_taxonomy` | `terms` | `["slug", "taxonomy"]` | Look up category/tag by slug |
| `by_term` | `taxonomyRelationships` | `["termId"]` | Find posts in a category/tag |
| `by_post` | `termRelationships` | `["postId"]` | Find terms for a given post |
| `by_post` | `comments` | `["postId", "status", "createdAt"]` | Per-post comment feed |
| `by_status` | `comments` | `["status", "createdAt"]` | Global comment feed |
| `by_section` | `settings` | `["section"]` | Feed settings lookup |

### Relationships

```
Posts -----< TaxonomyRelationships >----- Terms
  |                                         |
  |  (authorId -> Convex Auth user)              |  (slug + taxonomy -> feed URL)
  |                                         |
  +-----< Comments                          +--- Category/Tag Feeds
           |
           +--- Comment Feeds (global + per-post)
```

---

## Actions & Functions

### Feed Endpoints (TanStack Start API Routes)

**Implementation approach:** Feeds are served via TanStack Start API routes in the
ConvexPress-Website (Option A). The backend Convex functions provide data queries; the
ConvexPress-Website handles XML generation and HTTP response. Convex HTTP Actions (Option B)
are not used but backend helpers are retained for potential future use.

#### `feedRss2` - Main RSS 2.0 Feed

- **Type:** TanStack Start API Route (GET)
- **Location:** `ConvexPress-Website/apps/web/src/routes/api/feed/index.tsx` (route), `ConvexPress-Website/apps/web/src/lib/feeds/buildFeedResponse.ts` (builder)
- **Auth:** Public (no authentication)
- **URL Patterns:** `/api/feed`, `/api/feed/rss2`
- **Args:** None (URL path determines behavior)
- **Returns:** XML string (`Content-Type: application/rss+xml; charset=UTF-8`)
- **Behavior:**
  1. Read settings: `siteTitle`, `siteDescription`, `siteUrl`, `feedItemCount`, `feedContentDisplay`, `language` (defaults if not found)
  2. Query published posts: `posts` table with `status === "publish"`, ordered by `publishedAt` desc, limited to `feedItemCount`
  3. For each post:
     a. Fetch author info from the auth system (name) via cached batch lookup
     b. Fetch categories and tags via Taxonomy System queries
     c. If `feedContentDisplay === "full"`, render content with `formatContentForFeed()`
     d. If `feedContentDisplay === "summary"`, use excerpt or auto-generate from first 300 characters
     e. Fetch featured image URL if present (for `<enclosure>` and `<media:content>`)
  4. Build RSS 2.0 XML via `buildRssChannel()`
  5. Set HTTP response headers: `Cache-Control: public, max-age=3600, s-maxage=3600`, `ETag`, `Last-Modified`, `X-Robots-Tag: noindex`
  6. Handle conditional requests: If `If-None-Match` matches current ETag, return 304 Not Modified
  7. Return XML response
- **Events:** None (read-only)
- **Errors:**
  - No published posts: Valid RSS feed with zero `<item>` elements (not an error)
  - Settings not found: Use defaults
  - Internal error: HTTP 500 with plain-text message

---

#### `feedAtom` - Main Atom 1.0 Feed

- **Type:** TanStack Start API Route (GET)
- **Location:** `ConvexPress-Website/apps/web/src/routes/api/feed/atom.tsx`
- **Auth:** Public
- **URL Pattern:** `/api/feed/atom`
- **Returns:** XML string (`Content-Type: application/atom+xml; charset=UTF-8`)
- **Behavior:**
  1. Same data fetching as `feedRss2` (steps 1-3)
  2. Build Atom 1.0 XML via `buildAtomFeed()` with `<entry>` elements instead of `<item>`
  3. Same caching headers and conditional request handling
- **Events:** None
- **Errors:** Same as `feedRss2`

---

#### `feedCategory` - Category Feed

- **Type:** TanStack Start API Route (GET)
- **Location:** `ConvexPress-Website/apps/web/src/routes/api/category/$slug/feed/`
- **Auth:** Public
- **URL Patterns:** `/api/category/{slug}/feed` (RSS 2.0), `/api/category/{slug}/feed/atom` (Atom)
- **Args (from URL):**
  ```typescript
  {
    slug: string,           // Category slug from URL path
    format: "rss2" | "atom" // Determined by URL suffix
  }
  ```
- **Behavior:**
  1. Look up category term by slug: `terms` table with `slug === params.slug`, `taxonomy === "category"`
  2. If category not found, return **HTTP 404** (NOT an empty feed)
  3. Query taxonomy relationships to get all post IDs in this category
  4. Query posts: `status === "publish"`, `_id` in category's post IDs, ordered by `publishedAt` desc, limited to `feedItemCount`
  5. Generate XML with modified metadata:
     - `<title>`: `{categoryName} - {siteTitle}`
     - `<description>`: Category description or `"Posts in {categoryName}"`
     - `<link>`: `{siteUrl}/category/{slug}`
  6. Same caching and response headers
- **Events:** None
- **Errors:**
  - `NOT_FOUND` (HTTP 404): Category slug does not match any term
  - No posts in category: Valid feed with zero items

---

#### `feedTag` - Tag Feed

- **Type:** TanStack Start API Route (GET)
- **Location:** `ConvexPress-Website/apps/web/src/routes/api/tag/$slug/feed/`
- **Auth:** Public
- **URL Patterns:** `/api/tag/{slug}/feed` (RSS 2.0), `/api/tag/{slug}/feed/atom` (Atom)
- **Behavior:** Identical to `feedCategory` except:
  1. Looks up `taxonomy === "tag"` instead of `"category"`
  2. Feed `<title>`: `{tagName} - {siteTitle}`
  3. Feed `<link>`: `{siteUrl}/tag/{slug}`
- **Events:** None
- **Errors:** Same as `feedCategory`

---

#### `feedAuthor` - Author Feed

- **Type:** TanStack Start API Route (GET)
- **Location:** `ConvexPress-Website/apps/web/src/routes/api/author/$slug/feed/`
- **Auth:** Public
- **URL Patterns:** `/api/author/{slug}/feed` (RSS 2.0), `/api/author/{slug}/feed/atom` (Atom)
- **Args (from URL):**
  ```typescript
  {
    slug: string,           // Author slug (Convex Auth username or user ID)
    format: "rss2" | "atom"
  }
  ```
- **Behavior:**
  1. Resolve author slug to user identifier via User Profile System
  2. If author not found, return HTTP 404
  3. Query posts: `status === "publish"`, `authorId === userId`, ordered by `publishedAt` desc, limited to `feedItemCount`
  4. Generate XML with modified metadata:
     - `<title>`: `Posts by {authorName} - {siteTitle}`
     - `<description>`: `Posts by {authorName}`
     - `<link>`: `{siteUrl}/author/{slug}`
- **Events:** None
- **Errors:**
  - `NOT_FOUND` (HTTP 404): Author slug does not match any user

---

#### `feedComments` - Global Comment Feed

- **Type:** TanStack Start API Route (GET)
- **Location:** `ConvexPress-Website/apps/web/src/routes/api/comments/feed/`
- **Auth:** Public
- **URL Patterns:** `/api/comments/feed` (RSS 2.0), `/api/comments/feed/atom` (Atom)
- **Behavior:**
  1. Read settings: `siteTitle`, `siteUrl`, `feedItemCount`
  2. Query approved comments: `status === "approved"`, ordered by `createdAt` desc, limited to `feedItemCount`
  3. For each comment, fetch parent post (title, slug) for context
  4. Skip orphaned comments (parent post deleted)
  5. Generate XML:
     - `<title>`: `Comments for {siteTitle}`
     - Item `<title>`: `Comment on "{postTitle}" by {commentAuthorName}`
     - Item `<link>`: `{siteUrl}/blog/{postSlug}#comment-{commentId}`
  6. Shorter cache TTL: `max-age=1800` (30 minutes)
- **Events:** None
- **Errors:**
  - No approved comments: Valid feed with zero items

---

#### `feedPostComments` - Per-Post Comment Feed

- **Type:** TanStack Start API Route (GET)
- **Location:** `ConvexPress-Website/apps/web/src/routes/api/blog/$slug/feed/`
- **Auth:** Public
- **URL Patterns:** `/api/blog/{slug}/feed` (RSS 2.0), `/api/blog/{slug}/feed/atom` (Atom)
- **Behavior:**
  1. Look up post by slug: `status === "publish"`
  2. If post not found or not published, return HTTP 404
  3. If `commentStatus === "closed"` AND zero comments, return HTTP 404
  4. Query approved comments: `postId === post._id`, `status === "approved"`, ordered by `createdAt` desc
  5. Generate XML:
     - `<title>`: `Comments on "{postTitle}" - {siteTitle}`
     - `<link>`: `{siteUrl}/blog/{slug}`
  6. Shorter cache TTL: `max-age=1800` (30 minutes)
- **Events:** None
- **Errors:**
  - `NOT_FOUND` (HTTP 404): Post slug not found or post not published

---

### Server Actions

#### `feeds.fetchExternal` - Fetch and Parse External Feed

- **Type:** Action (server-side, not HTTP)
- **Location:** `convex/feeds/actions.ts`
- **Auth:** Required (Administrator only, `manage_options` capability)
- **Args:**
  ```typescript
  {
    url: v.string(),                    // URL of the external RSS/Atom feed
    maxItems: v.optional(v.number()),   // Max items to return (default: 20)
  }
  ```
- **Returns:**
  ```typescript
  {
    feed: {
      title: string;
      description: string;
      link: string;
      lastUpdated: number;       // Timestamp
      format: "rss2" | "atom";
    };
    items: Array<{
      title: string;
      link: string;
      description: string;
      content: string;
      publishedAt: number;
      author: string;
      categories: string[];
      guid: string;
    }>;
  }
  ```
- **Behavior:**
  1. Authenticate user via Convex Auth. Require `manage_options` capability
  2. Validate `url` is a valid HTTP/HTTPS URL
  3. Fetch the URL using `fetch()` within the Convex action
  4. Parse XML response: detect RSS 2.0 or Atom 1.0 from root element
  5. Extract feed metadata and items/entries
  6. Limit returned items to `maxItems`
- **Events:** None
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated
  - `FORBIDDEN`: User lacks `manage_options` capability
  - `VALIDATION_ERROR`: Invalid URL format
  - `FETCH_ERROR`: Network error fetching the feed URL
  - `PARSE_ERROR`: Response is not valid XML or not a recognized feed format

---

### Internal Queries (Called by HTTP Actions)

#### `feeds.getPublishedPosts`

- **Type:** Query (internal)
- **Location:** `convex/feeds/queries.ts`
- **Auth:** Internal (called by HTTP actions)
- **Args:** `{ limit: v.number() }`
- **Returns:** Array of published posts with author, category, tag data
- **Behavior:** Query `posts` table via `by_published` index, `status === "publish"`, ordered desc, take `limit`

#### `feeds.getPostsByCategory`

- **Type:** Query (internal)
- **Args:** `{ categorySlug: v.string(), limit: v.number() }`
- **Returns:** Category metadata + array of published posts in that category
- **Behavior:** Look up term by slug + taxonomy, get relationships, filter to published posts

#### `feeds.getPostsByTag`

- **Type:** Query (internal)
- **Args:** `{ tagSlug: v.string(), limit: v.number() }`
- **Returns:** Tag metadata + array of published posts with that tag

#### `feeds.getPostsByAuthor`

- **Type:** Query (internal)
- **Args:** `{ authorSlug: v.string(), limit: v.number() }`
- **Returns:** Author metadata + array of published posts by that author

#### `feeds.getRecentComments`

- **Type:** Query (internal)
- **Args:** `{ limit: v.number() }`
- **Returns:** Array of approved comments with parent post data
- **Behavior:** Query `comments` via `by_status` index, `status === "approved"`, ordered desc

#### `feeds.getPostComments`

- **Type:** Query (internal)
- **Args:** `{ postSlug: v.string(), limit: v.number() }`
- **Returns:** Post metadata + array of approved comments on that post
- **Behavior:** Look up post by slug (must be published), query comments via `by_post` index

---

### Helper Functions

#### `formatContentForFeed(content: string, siteUrl: string): string`

**Location:** `convex/helpers/feedContent.ts`

1. Parse block editor JSON content into HTML (reuse Content Editor System's server-side renderer)
2. Convert relative URLs to absolute URLs (images, links) using `siteUrl`
3. Strip `<script>` tags and `javascript:` URLs
4. Strip `on*` event handler attributes
5. Strip `<iframe>` elements (convert to plain links)
6. Strip `<form>` elements
7. Strip inline styles that break feed readers
8. Ensure all images have alt text
9. Return sanitized absolute-URL HTML

#### `formatExcerptForFeed(post: { excerpt?: string; content: string }, maxLength?: number): string`

**Location:** `convex/helpers/feedContent.ts`

1. If manual `excerpt` exists, return it (XML-escaped)
2. Otherwise, strip HTML from rendered content
3. Take first `maxLength` (default 300) characters
4. Trim to last complete word boundary
5. Append `"..."` if truncated
6. XML-escape the result

#### `buildRssChannel(config: RssChannelConfig): string`

**Location:** `convex/helpers/feedXml.ts`

Builds complete RSS 2.0 XML document with `<channel>` and `<item>` elements. Includes XML namespaces for `content:encoded`, `dc:creator`, `atom:link`, `sy:updatePeriod`, `slash:comments`, `media:content`.

#### `buildAtomFeed(config: AtomFeedConfig): string`

**Location:** `convex/helpers/feedXml.ts`

Builds complete Atom 1.0 XML document with `<feed>` and `<entry>` elements.

#### `escapeXml(str: string): string`

**Location:** `convex/helpers/feedXml.ts`

Escapes `& < > " '` for safe XML inclusion.

#### `escapeCdata(str: string): string`

**Location:** `convex/helpers/feedXml.ts`

Escapes `]]>` sequences within CDATA content using the standard split technique (`]]>` becomes `]]]]><![CDATA[>`). Prevents CDATA injection in XML feeds.

#### `toRfc2822(timestamp: number): string`

**Location:** `convex/helpers/feedXml.ts`

Formats timestamp as RFC 2822 date string for RSS `<pubDate>` (e.g., `"Thu, 08 Feb 2026 14:30:00 +0000"`).

#### `toIso8601(timestamp: number): string`

**Location:** `convex/helpers/feedXml.ts`

Formats timestamp as ISO 8601 date string for Atom `<published>` / `<updated>` (e.g., `"2026-02-08T14:30:00Z"`).

#### `getFeedUrl(siteUrl, type, slug?, format?): string`

**Location:** `convex/helpers/feedUrls.ts`

Generates the correct feed URL for any feed type and format combination:
- `getFeedUrl(url, "main")` -> `{url}/api/feed`
- `getFeedUrl(url, "category", "news")` -> `{url}/api/category/news/feed`
- `getFeedUrl(url, "tag", "react", "atom")` -> `{url}/api/tag/react/feed/atom`
- `getFeedUrl(url, "author", "john")` -> `{url}/api/author/john/feed`
- `getFeedUrl(url, "comments")` -> `{url}/api/comments/feed`
- `getFeedUrl(url, "postComments", "hello-world")` -> `{url}/api/blog/hello-world/feed`

---

## Events

### Events Emitted

**None.** The RSS/Feed System is purely read-only and does not emit events.

### Events Consumed (for Cache Invalidation Awareness)

| Event Code | Source System | Feed Impact |
|-----------|-------------|-------------|
| `post.published` | Post System | New item in main, category, tag, and author feeds |
| `post.updated` | Post System | Existing item content may change |
| `post.unpublished` | Post System | Item removed from all feeds |
| `post.trashed` | Post System | Item removed from all feeds |
| `post.deleted` | Post System | Item removed from all feeds |
| `comment.approved` | Comment System | New item in comment feeds |
| `comment.unapproved` | Comment System | Item removed from comment feeds |
| `comment.trashed` | Comment System | Item removed from comment feeds |
| `comment.deleted` | Comment System | Item removed from comment feeds |
| `settings.updated` | Settings System | Feed metadata or item count may change |
| `taxonomy.term_updated` | Taxonomy System | Category/tag name changes affect feed titles |
| `taxonomy.term_deleted` | Taxonomy System | Category/tag feed becomes 404 |

**Note:** Since feeds use HTTP caching headers (1-hour and 30-minute TTLs), no active cache purging is needed. Changes are reflected after cache expiry. ETag-based validation handles freshness checks efficiently.

---

## Admin Routes & UI

### No Dedicated Admin Routes

The RSS/Feed System has **no dedicated admin pages**. Feed configuration lives in the Settings System.

### Settings > Reading Page (`/admin/settings/reading`)

The Reading settings page (owned by the Settings System) includes two feed-related fields:

| Field | Label | Type | Default |
|-------|-------|------|---------|
| `feedItemCount` | "Syndication feeds show the most recent" | Number input | `10` |
| `feedContentDisplay` | "For each post in a feed, include" | Radio group (`"Full text"` / `"Summary"`) | `"full"` |

**WordPress Equivalent:** Settings > Reading page, same fields.

---

## Website Routes

### Main Post Feed (`/api/feed`)

- **Purpose:** Primary RSS 2.0 feed of all published posts
- **URL Variations:** `/api/feed` (default RSS 2.0), `/api/feed/rss2` (explicit), `/api/feed/atom` (Atom)
- **SEO:** `X-Robots-Tag: noindex` (prevent search engines from indexing raw XML)
- **Data Requirements:** Published posts, settings, author data, taxonomy data
- **Caching:** `Cache-Control: public, max-age=3600, s-maxage=3600`
- **Response Headers:**
  ```
  Content-Type: application/rss+xml; charset=UTF-8
  Cache-Control: public, max-age=3600, s-maxage=3600
  ETag: "{lastUpdatedAt}-{itemCount}"
  Last-Modified: {most recent post's publishedAt as HTTP date}
  X-Robots-Tag: noindex
  ```

### Category Feed (`/api/category/{slug}/feed`)

- **Purpose:** RSS/Atom feed scoped to posts in a specific category
- **URL Variations:** `/api/category/{slug}/feed` (RSS), `/api/category/{slug}/feed/atom` (Atom)
- **Data Requirements:** Category term lookup, taxonomy relationships, filtered published posts
- **Caching:** Same as main feed

### Tag Feed (`/api/tag/{slug}/feed`)

- **Purpose:** RSS/Atom feed scoped to posts with a specific tag
- **URL Variations:** `/api/tag/{slug}/feed` (RSS), `/api/tag/{slug}/feed/atom` (Atom)
- **Data Requirements:** Tag term lookup, taxonomy relationships, filtered published posts

### Author Feed (`/api/author/{slug}/feed`)

- **Purpose:** RSS/Atom feed scoped to posts by a specific author
- **URL Variations:** `/api/author/{slug}/feed` (RSS), `/api/author/{slug}/feed/atom` (Atom)
- **Data Requirements:** Author slug resolution (Convex Auth), author's published posts

### Global Comment Feed (`/api/comments/feed`)

- **Purpose:** RSS/Atom feed of all recent approved comments across all posts
- **URL Variations:** `/api/comments/feed` (RSS), `/api/comments/feed/atom` (Atom)
- **Caching:** `max-age=1800` (30 minutes, shorter because comments change more frequently)

### Per-Post Comment Feed (`/api/blog/{slug}/feed`)

- **Purpose:** RSS/Atom feed of approved comments on a specific post
- **URL Variations:** `/api/blog/{slug}/feed` (RSS), `/api/blog/{slug}/feed/atom` (Atom)
- **Caching:** `max-age=1800` (30 minutes)

### Feed Discovery Component (`FeedDiscoveryHead`)

- **Location:** `ConvexPress-Website/apps/web/src/components/seo/FeedDiscoveryHead.tsx`
- **Purpose:** Injects `<link rel="alternate">` tags into HTML `<head>` for feed reader auto-detection
- **Integration:** Root layout always renders main feed + comments feed links. Individual route pages add context-specific links:
  - `/category/$slug` pages add category feed link
  - `/tag/$slug` pages add tag feed link
  - `/author/$slug` pages add author feed link
  - `/blog/$slug` pages add per-post comment feed link (if comments enabled)

---

## Notifications

### Email Notifications

**None.** The RSS/Feed System has no email notifications.

### Site Notifications

**None.** The RSS/Feed System has no site notifications. Feed consumers (external feed readers) handle their own notifications to end users.

---

## Role & Capability Matrix

| Action | Administrator | Editor | Author | Contributor | Subscriber | Anonymous |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|
| View any feed (GET) | Yes | Yes | Yes | Yes | Yes | Yes |
| Configure feed settings | Yes | No | No | No | No | No |
| Fetch external feed | Yes | No | No | No | No | No |

### Action-to-Capability Mapping

| Action | Required Capability | Notes |
|--------|-------------------|-------|
| View main feed | None (public) | HTTP GET, no auth |
| View category feed | None (public) | HTTP GET, no auth |
| View tag feed | None (public) | HTTP GET, no auth |
| View author feed | None (public) | HTTP GET, no auth |
| View comment feed | None (public) | HTTP GET, no auth |
| View post comment feed | None (public) | HTTP GET, no auth |
| Update feed settings | `manage_options` | Via Settings System |
| Fetch external feed | `manage_options` | Server-side action |

---

## Dependencies

### Depends On

| System | Type | What Is Needed |
|--------|------|---------------|
| **Post System** | **Hard** | Primary data source. All post feeds query published posts from the `posts` table via the `by_published` index. Without the Post System, feeds have no content (but remain valid empty feeds). |
| **Settings System** | **Hard** | Feed configuration (`feedItemCount`, `feedContentDisplay`) and site metadata (`siteTitle`, `siteDescription`, `siteUrl`, `language`). Without settings, defaults are used -- system still functions. |
| **Taxonomy System** | **Medium** | Category and tag feeds require term lookup (`terms` table) and post-term relationships (`taxonomyRelationships` table). Also provides `<category>` elements on individual feed items. Without this, category/tag feeds return 404 and items lack category metadata. |
| **Comment System** | **Medium** | Comment feeds (global and per-post) query approved comments from the `comments` table. Without this, comment feed endpoints return empty feeds. |
| **User Profile System** | **Soft** | Author names and slugs for author feeds and `<dc:creator>` / `<author>` elements. Fallback to "Unknown" if unavailable. |
| **Content Editor System** | **Soft** | Server-side block-to-HTML rendering for `formatContentForFeed()`. Without this, raw block JSON would appear in feeds (degraded but functional). |
| **Media System** | **Soft** | Featured image URLs for `<enclosure>` and `<media:content>` elements. Without this, feeds simply omit media elements. |

### Depended On By

| System | Type | What They Need |
|--------|------|---------------|
| **SEO System** | **Soft** | May reference feed URLs in structured data or `<link>` tags for discovery. |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| **TanStack Start API Routes** | Serving XML responses at feed URLs (chosen approach) |
| **ConvexHttpClient** | Querying Convex from TanStack Start server-side routes |
| **Convex Auth** | Author metadata (name) for feed items via cached API calls |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)

- [x] `convex/feeds/queries.ts` - Public queries: `getPublishedPosts`, `getPostsByCategory`, `getPostsByTag`, `getPostsByAuthor`, `getRecentComments`, `getPostComments`, `getFeedSettings` (7 queries)
- [x] `convex/feeds/actions.ts` - `fetchExternal` action (1 action, admin-only)
- [x] `convex/feeds/internals.ts` - Internal queries for settings and auth
- [x] `convex/feeds/validators.ts` - Shared argument validators and constants
- [x] `convex/helpers/feedXml.ts` - XML builders: `buildRssChannel`, `buildRssItem`, `buildAtomFeed`, `buildAtomEntry`, `escapeXml`, `escapeCdata`, `toRfc2822`, `toIso8601`
- [x] `convex/helpers/feedContent.ts` - Content helpers: `formatContentForFeed`, `formatExcerptForFeed`, `isBlockEditorJson`
- [x] `convex/helpers/feedUrls.ts` - URL helper: `getFeedUrl`, `getFeedContentType`
- [ ] ~~`convex/http.ts` - HTTP action route registrations~~ (NOT USED - TanStack Start API routes chosen instead)
- [ ] ~~`convex/httpActions/feeds.ts` - HTTP action handlers~~ (NOT USED - TanStack Start API routes chosen instead)

### Admin Frontend (ConvexPress-Admin/apps/web/)

- [ ] No admin routes needed (feed settings are in Settings > Reading, owned by Settings System)

### Website Frontend (ConvexPress-Website/apps/web/)

**TanStack Start API Routes (chosen approach - Option A)**
- [x] `src/routes/api/feed/index.tsx` - GET `/api/feed` (main RSS 2.0)
- [x] `src/routes/api/feed/rss2.tsx` - GET `/api/feed/rss2` (explicit RSS 2.0)
- [x] `src/routes/api/feed/atom.tsx` - GET `/api/feed/atom` (Atom 1.0)
- [x] `src/routes/api/category/$slug/feed/index.tsx` - Category RSS feed
- [x] `src/routes/api/category/$slug/feed/atom.tsx` - Category Atom feed
- [x] `src/routes/api/tag/$slug/feed/index.tsx` - Tag RSS feed
- [x] `src/routes/api/tag/$slug/feed/atom.tsx` - Tag Atom feed
- [x] `src/routes/api/author/$slug/feed/index.tsx` - Author RSS feed
- [x] `src/routes/api/author/$slug/feed/atom.tsx` - Author Atom feed
- [x] `src/routes/api/comments/feed/index.tsx` - Global comment RSS feed
- [x] `src/routes/api/comments/feed/atom.tsx` - Global comment Atom feed
- [x] `src/routes/api/blog/$slug/feed/index.tsx` - Per-post comment RSS feed
- [x] `src/routes/api/blog/$slug/feed/atom.tsx` - Per-post comment Atom feed
- [x] `src/lib/feeds/buildFeedResponse.ts` - Shared feed response builder (XML generation + HTTP response)
- [x] `src/components/seo/FeedDiscoveryHead.tsx` - Feed discovery `<link>` tags component
- [x] `src/lib/feeds/types.ts` - TypeScript types: `FeedConfig`, `RssFeedItem`, `AtomFeedEntry`, `CommentFeedItem`, `ExternalFeed`
- [x] `src/lib/feeds/constants.ts` - Feed format constants, XML namespace URIs

**Convex HTTP Actions (unused alternative - Option B)**
- Not implemented. Backend helpers (`feedXml.ts`, `feedContent.ts`, `feedUrls.ts`) are retained for potential future use.

### Testing
- [ ] Unit tests for `escapeXml`, `toRfc2822`, `toIso8601`, `formatExcerptForFeed`, `formatContentForFeed`, `getFeedUrl`
- [ ] Unit tests for `buildRssChannel` and `buildAtomFeed` (valid XML output)
- [ ] Integration tests for all feed endpoints (correct filtering, 404 cases, empty feeds)
- [ ] Feed validation tests (RSS 2.0 spec compliance, Atom 1.0 spec compliance)
- [ ] Security tests (no XSS in feed content, no email exposure, no internal IDs)

---

## Edge Cases & Gotchas

1. **Empty Feed is NOT an Error:** When no published posts exist, return a valid RSS/Atom document with zero items/entries. Do NOT return 404. Feed readers handle empty feeds gracefully.

2. **404 for Invalid Slugs is Intentional:** When a category/tag/author slug does not match any record, return HTTP 404 (not an empty feed). An empty feed would imply the entity exists but has no content.

3. **Per-Post Comment Feed 404 Logic:** Return 404 if the post is not published OR if `commentStatus === "closed"` AND there are zero comments. A closed-comment post with existing comments should still serve its comment feed.

4. **Very Long Content (50KB+ HTML):** Do not truncate when `feedContentDisplay === "full"`. Feed readers handle large items. Only fall back to summary with a "Read More" link if content exceeds 500KB after HTML rendering.

5. **Unicode and Special Characters:** All text must be XML-escaped via `escapeXml()`. Content blocks use `<![CDATA[...]]>` sections. Feed encoding is explicitly UTF-8. Test with emoji, CJK, and RTL text.

6. **Deleted Category/Tag While Feed URL Exists:** Return HTTP 404. Feed readers stop polling after repeated 404s per HTTP spec.

7. **Deleted Author Account:** Posts are reassigned to another author (handled by Auth/User System). Old author feed URL returns 404. Reassigned posts appear under new author's feed.

8. **Concurrent Publishes:** Convex queries are consistent (serializable transactions). Feed items ordered by `publishedAt` desc; ties broken by `_creationTime` desc.

9. **Time Zone Handling:** All timestamps in feeds are UTC. `publishedAt` in the database is already a UTC timestamp (milliseconds). No timezone conversion needed. RSS uses RFC 2822, Atom uses ISO 8601.

10. **Trailing Slash Normalization:** Handle both `/feed` and `/feed/`. Return HTTP 301 redirect from `/feed/` to `/feed` for canonical URLs.

11. **Orphaned Comments:** When generating comment feeds, if a comment's parent post has been deleted, skip that comment entirely. Do not include it in the feed.

12. **Post with No Author Info (Deleted Convex Auth User):** Use fallback: `<dc:creator>Unknown</dc:creator>` in RSS, `<author><name>Unknown</name></author>` in Atom. Log a warning for admin visibility.

13. **Content Sanitization for Security:** Strip `<script>` tags, `javascript:` URLs, `on*` event handlers, `<iframe>` elements (convert to links), and `<form>` elements. This prevents XSS if a feed reader renders HTML.

14. **No Email Exposure:** Feed items use author display names only, never email addresses. Comment feeds use `authorName`, not `authorEmail`.

15. **ETag Generation Strategy:** Compute from `{lastUpdatedAt}-{itemCount}` -- simple, fast, avoids hashing entire XML output. Compare against `If-None-Match` header for 304 responses.

16. **Rate Limiting:** Feed endpoints should be rate-limited to 60 requests/minute/IP. Return HTTP 429 when exceeded. Can be implemented at the CDN/proxy layer or within the HTTP action.

17. **HTTP Action vs TanStack Start Route Conflict:** Feed routes (`/feed`, `/category/{slug}/feed`, etc.) must not conflict between Convex HTTP actions and TanStack Start routes. The recommended approach is TanStack Start API routes using `createAPIFileRoute` that internally call Convex queries and return XML. This keeps all routing in one place.

18. **XML String Building Performance:** Use string concatenation (template literals), not DOM/XML serialization libraries. Feed XML is structurally simple. Estimated generation time: <50ms for 10 items, <200ms for 50 items (excluding content rendering).

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `do_feed_rss2()` | `httpActions/feeds.feedRss2` | HTTP action generating RSS 2.0 XML |
| `do_feed_atom()` | `httpActions/feeds.feedAtom` | HTTP action generating Atom 1.0 XML |
| `fetch_feed()` | `actions/feeds.fetchExternal` | Server-side Convex action (admin only) |
| `get_bloginfo_rss()` | Settings query for `siteTitle`, `siteDescription` | Read from Settings System |
| `the_content_feed()` | `formatContentForFeed()` | Sanitizes and absolutizes HTML content |
| `the_excerpt_rss()` | `formatExcerptForFeed()` | Excerpt or auto-generated summary |
| `feed_links()` | `FeedDiscoveryHead` component (main feeds) | `<link rel="alternate">` in `<head>` |
| `feed_links_extra()` | `FeedDiscoveryHead` component (archive feeds) | Context-specific feed links |
| `get_default_feed()` | Hardcoded to RSS 2.0 | `/feed` defaults to RSS 2.0 |
| `self_link()` | `<atom:link rel="self">` in XML output | Self-referencing feed URL |
| `get_feed_link()` | `getFeedUrl()` helper | Generates any feed URL |
| `wp_rss()` | Not implemented | Server-side feed display is out of scope |
| `bloginfo_rss()` | Inline in XML generation | Site metadata escaped for XML |
| `add_feed()` | Additional HTTP action routes | Register custom feeds |
| `rss2_head` hook | Extensible in `buildRssChannel()` | Custom elements in `<channel>` |
| `rss2_item` hook | Extensible in `buildRssItem()` | Custom elements in `<item>` |
| `atom_head` hook | Extensible in `buildAtomFeed()` | Custom elements in `<feed>` |
| `atom_entry` hook | Extensible in `buildAtomEntry()` | Custom elements in `<entry>` |
| `the_content_feed` filter | `formatContentForFeed()` | Content sanitization pipeline |
| `the_excerpt_rss` filter | `formatExcerptForFeed()` | Excerpt formatting pipeline |
| `rss_update_period` filter | Hardcoded `<sy:updatePeriod>hourly</sy:updatePeriod>` | Configurable if needed |
| `rss_update_frequency` filter | Hardcoded `<sy:updateFrequency>1</sy:updateFrequency>` | Configurable if needed |
| `wp_feed_cache_transient_lifetime` filter | `Cache-Control: max-age` header value | HTTP-level caching |
| `feed_links_show_posts_feed` filter | Setting: `feedDiscoveryEnabled` | Whether to show main feed links |
| `feed_links_show_comments_feed` filter | Setting: `feedCommentsEnabled` | Whether to show comment feed links |
| `redirect_canonical()` (feed URLs) | Not needed | Clean URL routing, no legacy redirects |

---

## Shared Types Reference

```typescript
// Types used across feed system implementation

interface FeedConfig {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  language: string;
  feedItemCount: number;
  feedContentDisplay: "full" | "summary";
}

interface RssFeedItem {
  title: string;
  link: string;
  guid: string;
  pubDate: number;
  creator: string;
  categories: string[];
  description: string;
  contentEncoded: string;
  commentCount: number;
  commentsUrl: string;
  enclosure?: {
    url: string;
    length: number;
    type: string;
  };
}

interface AtomFeedEntry {
  title: string;
  link: string;
  id: string;
  published: number;
  updated: number;
  author: { name: string };
  categories: Array<{ term: string; label: string }>;
  summary: string;
  content: string;
  enclosure?: { href: string; type: string; length: number };
}

interface CommentFeedItem {
  title: string;
  link: string;
  guid: string;
  pubDate: number;
  creator: string;
  description: string;
}

interface ExternalFeed {
  feed: {
    title: string;
    description: string;
    link: string;
    lastUpdated: number;
    format: "rss2" | "atom";
  };
  items: Array<{
    title: string;
    link: string;
    description: string;
    content: string;
    publishedAt: number;
    author: string;
    categories: string[];
    guid: string;
  }>;
}
```

---

## Performance Considerations

1. **Query Efficiency:**
   - Main feed: Single indexed query (`by_published`, `take(N)`) -- O(N)
   - Category/tag feeds: Term lookup (indexed) + filtered post query -- 2-3 queries
   - Author feeds: Single indexed query (by author status index)
   - Comment feeds: Single indexed query (`by_status_created` or `by_post_status`)

2. **Author Data Batching:** Collect all unique `authorId` values from feed posts. Batch-fetch from the auth system in a single operation. Consider a `userProfiles` mirror table for faster lookups.

3. **HTTP Caching:**
   | Feed Type | `max-age` | `s-maxage` | Rationale |
   |-----------|-----------|------------|-----------|
   | Post feeds (main, category, tag, author) | 3600 (1 hr) | 3600 | Posts change infrequently |
   | Comment feeds (global, per-post) | 1800 (30 min) | 1800 | Comments change more often |

4. **XML String Building:** Use template literals, not DOM/XML serialization libraries. Estimated: <50ms for 10 items, <200ms for 50 items.

5. **Content Rendering:** Block-to-HTML rendering is the most expensive operation. Cache rendered HTML per post when possible.

---

## Security Considerations

1. **Content Sanitization:** Remove `<script>`, `javascript:` URLs, `on*` event handlers, `<iframe>`, `<form>` from feed content
2. **XML Injection:** All text escaped via `escapeXml()` or wrapped in `<![CDATA[]]>`
3. **No Auth Data Exposure:** No emails, no internal IDs, no draft/private content
4. **Rate Limiting:** 60 req/min/IP, HTTP 429 when exceeded
5. **`X-Robots-Tag: noindex`:** Prevents search engines from indexing raw XML

---

## Feed Validation Specs

Generated feeds must conform to:
- **RSS 2.0:** [rssboard.org/rss-specification](https://www.rssboard.org/rss-specification)
- **Atom 1.0 (RFC 4287):** [rfc-editor.org/rfc/rfc4287](https://www.rfc-editor.org/rfc/rfc4287)
- **W3C Validator:** [validator.w3.org/feed/](https://validator.w3.org/feed/)

Required elements:
- RSS `<channel>`: `<title>`, `<link>`, `<description>`
- RSS `<item>`: at least `<title>` or `<description>`
- Atom `<feed>`: `<title>`, `<id>`, `<updated>`
- Atom `<entry>`: `<title>`, `<id>`, `<updated>`
- `<guid>` values must be unique across all items
- `<atom:link rel="self">` must be present in RSS feeds
