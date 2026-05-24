# Routing System - Expert Knowledge Document

**System:** Routing System
**Status:** Complete (100%)
**Priority:** P0 - Critical
**WordPress Equivalent:** WP_Rewrite, redirect_canonical(), wp_old_slug_redirect(), 404 handling
**Last Analyzed:** 2026-02-13

---

## Quick Reference

### What This System Does

The Routing System is ConvexPress's URL management layer -- the equivalent of WordPress's `WP_Rewrite` class, permalink system, redirect infrastructure, canonical URL enforcement, and 404 handling. It controls how every public URL maps to content, how old URLs redirect to new ones, and how invalid URLs produce meaningful error pages. Unlike WordPress's `.htaccess`-based approach, ConvexPress uses JavaScript middleware (TanStack Start) and a database-backed redirect table (Convex).

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Permalink Structure** | Pattern that defines how post URLs are generated. 6 structures: `plain`, `day_and_name`, `month_and_name`, `numeric`, `post_name`, `custom` |
| **Canonical URL** | The single authoritative URL for a piece of content. All non-canonical variants redirect (301) to it |
| **Redirect** | A database record mapping a source URL to a target URL with a status code (301/302/307/308) |
| **Redirect Source** | How a redirect was created: `manual`, `slug_change`, `permalink_change`, `import` |
| **Match Type** | How the source URL is matched: `exact`, `prefix`, `regex` |
| **404 Logging** | Aggregated tracking of not-found URLs for admin analysis and redirect creation |
| **Permalink Tags** | Placeholders in URL patterns: `%postname%`, `%year%`, `%monthnum%`, `%day%`, `%post_id%`, `%category%`, `%author%`, `%hour%`, `%minute%`, `%second%` |
| **Chain Flattening** | Automatic prevention of redirect chains (A->B->C becomes A->C and B->C) |
| **URL Resolution Pipeline** | 5-step request processing: Canonical -> Redirect Lookup -> Router -> Content Resolution -> 404 Handler |

### ConvexPress vs WordPress

| Feature | WordPress | ConvexPress |
|---------|-----------|-------------|
| URL rewriting | `.htaccess` / `nginx.conf` (server config) | JavaScript middleware (TanStack Start) |
| Redirect storage | Plugins required (Redirection, Yoast) | Built-in Convex `redirects` table |
| Auto-redirects on slug change | `_wp_old_slug` post meta | Automatic redirect record creation |
| Auto-redirects on permalink change | Not native (requires plugins) | Built-in batch redirect generation |
| Canonical enforcement | Partial (`redirect_canonical()`) | Full middleware (trailing slash, protocol, www, case) |
| 404 logging | Not native (plugins required) | Built-in `notFound` table with aggregation |
| URL generation | `get_permalink()`, `get_page_link()`, etc. | `generatePostUrl()`, `generatePageUrl()`, etc. |
| Permalink settings | Settings > Permalinks (flushes `.htaccess`) | Settings > Permalinks (updates Convex, generates redirects) |
| Reactivity | None (page reload required) | Convex real-time subscriptions (auto-invalidation) |

---

## Architecture Overview

### Data Flow

```
Incoming HTTP Request (TanStack Start)
  |
  v
[1] Canonical URL Middleware
  |   - Normalize: trailing slashes, lowercase, double slashes, index files
  |   - Enforce: HTTPS, www/non-www preference
  |   - If URL is non-canonical -> 301 redirect to canonical
  |
  v
[2] Redirect Lookup Middleware
  |   - Query Convex: redirects table (exact -> prefix -> regex)
  |   - If match found -> respond with 301/302/307/308 to target URL
  |   - Increment hit count asynchronously
  |   - If no match -> continue
  |
  v
[3] TanStack Start File-Based Router
  |   - Match URL to route file based on permalink structure
  |   - /blog/$slug -> PostPage | /$slug -> PostPage/PagePage
  |   - /category/$slug -> CategoryArchive
  |   - /tag/$slug -> TagArchive | /author/$slug -> AuthorArchive
  |   - No match -> 404
  |
  v
[4] Content Resolution (inside route loaders)
  |   - Query Convex for content by slug/ID
  |   - Verify published status
  |   - Validate date params for date-based permalinks
  |   - If not found -> throw NotFound
  |
  v
[5] 404 Handler
      - Render 404 page with search, navigation, suggestions
      - Log 404 hit to notFound table (fire-and-forget)
      - Return HTTP 404 status with X-Robots-Tag: noindex
```

### Permalink Structure to Route File Mapping

| Permalink Structure | TanStack Start Route File | Loader Logic |
|--------------------|--------------------------|--------------|
| `plain` (`/?p=123`) | `app/routes/index.tsx` | Check `p` query param, resolve post by numeric ID |
| `post_name` (`/hello-world/`) | `app/routes/$slug.tsx` | Query post by slug, fall back to page |
| `day_and_name` (`/2026/02/08/hello-world/`) | `app/routes/blog/$year/$month/$day/$slug.tsx` | Query post by slug + validate date |
| `month_and_name` (`/2026/02/hello-world/`) | `app/routes/blog/$year/$month/$slug.tsx` | Query post by slug + validate month/year |
| `numeric` (`/archives/123`) | `app/routes/archives/$id.tsx` | Query post by numeric ID |
| `custom` | Dynamic / catch-all | Depends on pattern |

### Real-Time Behavior

- **Permalink settings**: Convex reactive query with auto-invalidation. When an admin changes permalink structure, all connected clients immediately see updated URL patterns.
- **Redirect table**: Convex query cache auto-invalidates on write. New redirects take effect on the next request without server restart.
- **404 log**: Real-time updates in admin UI via Convex subscriptions. New 404 entries appear immediately.
- **Hit counters**: Updated asynchronously (fire-and-forget mutations). Real-time display in admin dashboard.

### Authentication & Authorization

- **Redirect creation**: Requires Convex Auth authentication + `routing.create_redirect` capability (Administrator only)
- **Redirect updates**: Requires `routing.update_redirect` capability (Administrator only)
- **Redirect deletion**: Requires `routing.delete_redirect` capability (Administrator only)
- **404 log viewing and resolution**: Currently uses `routing.create_redirect` capability. A dedicated `routing.view_404_log` or `routing.view_redirects` capability would be more appropriate for read-only access (noted for future improvement).
- **Permalink settings**: Requires `manage_options` capability (shared with Settings System, Administrator only)
- **Website middleware**: No auth required -- runs on every public request
- **URL generation utilities**: No auth required -- pure functions

**Note on capability naming:** The knowledge doc originally specified `manage_redirects` and `view_404_log` as capabilities. The actual implementation uses `routing.create_redirect`, `routing.update_redirect`, and `routing.delete_redirect` -- matching the project-wide `{system}.{action}` naming convention. Read-only queries currently require `routing.create_redirect` which is overly restrictive; a `routing.view_redirects` capability should be added for read-only access in a future iteration.

---

## Database Schema

### `redirects` Table

Stores all URL redirects -- both manually created by administrators and automatically generated when permalink structures or slugs change.

```typescript
// ConvexPress-Admin/packages/backend/convex/schema.ts

redirects: defineTable({
  // Source URL (what the user/bot requests)
  sourceUrl: v.string(),         // Relative path, e.g., "/old-post-name/"

  // Target URL (where to redirect)
  targetUrl: v.string(),         // Relative path or absolute URL, e.g., "/new-post-name/"

  // Redirect type
  statusCode: v.union(
    v.literal(301),              // Permanent redirect (SEO-friendly, cached by browsers)
    v.literal(302),              // Temporary redirect (not cached)
    v.literal(307),              // Temporary redirect (preserves HTTP method)
    v.literal(308)               // Permanent redirect (preserves HTTP method)
  ),

  // Source type -- how this redirect was created
  source: v.union(
    v.literal("manual"),         // Created manually by an administrator
    v.literal("slug_change"),    // Auto-created when a post/page slug changed
    v.literal("permalink_change"), // Auto-created when permalink structure changed
    v.literal("import")          // Created via bulk import
  ),

  // Match behavior
  matchType: v.union(
    v.literal("exact"),          // Exact URL match
    v.literal("prefix"),         // Matches URL prefix (e.g., /old-section/* -> /new-section/*)
    v.literal("regex")           // Regular expression match (admin-only, advanced)
  ),

  // Optional: linked content (for auto-generated redirects)
  contentType: v.optional(v.union(
    v.literal("post"),
    v.literal("page"),
    v.literal("category"),
    v.literal("tag"),
    v.literal("author")
  )),
  contentId: v.optional(v.string()),  // Convex ID of the linked content

  // Metadata
  enabled: v.boolean(),          // Can be disabled without deletion
  hitCount: v.number(),          // How many times this redirect has been triggered
  lastHitAt: v.optional(v.number()), // Timestamp of last redirect hit
  note: v.optional(v.string()),  // Admin note explaining the redirect

  // Audit fields
  createdAt: v.number(),
  createdBy: v.optional(v.id("users")), // null for system-generated
  updatedAt: v.number(),
  updatedBy: v.optional(v.id("users")),
})
  .index("by_source_url", ["sourceUrl"])
  .index("by_target_url", ["targetUrl"])
  .index("by_source", ["source"])
  .index("by_enabled", ["enabled"])
  .index("by_content", ["contentType", "contentId"])
  .index("by_hit_count", ["hitCount"]),
```

### `notFound` Table (404 Logging)

Tracks 404 hits for analytics and redirect suggestion. Hits are aggregated per URL.

```typescript
// ConvexPress-Admin/packages/backend/convex/schema.ts

notFound: defineTable({
  url: v.string(),               // The requested URL that 404'd
  referrer: v.optional(v.string()), // HTTP Referer header
  userAgent: v.optional(v.string()), // Browser/bot user agent
  hitCount: v.number(),          // Aggregated hit count for this URL
  lastHitAt: v.number(),         // Last time this 404 was triggered
  resolved: v.boolean(),         // Whether an admin has addressed this 404
  resolvedBy: v.optional(v.id("users")),
  resolvedAt: v.optional(v.number()),
  redirectId: v.optional(v.id("redirects")), // If a redirect was created to fix this
})
  .index("by_url", ["url"])
  .index("by_hit_count", ["hitCount"])
  .index("by_resolved", ["resolved"])
  .index("by_last_hit", ["lastHitAt"]),
```

### Indexes

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `redirects` | `by_source_url` | `["sourceUrl"]` | Fast exact-match redirect lookup in middleware |
| `redirects` | `by_target_url` | `["targetUrl"]` | Fast chain flattening lookup (find redirects pointing to a URL) |
| `redirects` | `by_source` | `["source"]` | Filter redirects by creation source (manual, slug_change, etc.) |
| `redirects` | `by_enabled` | `["enabled"]` | List enabled/disabled redirects |
| `redirects` | `by_content` | `["contentType", "contentId"]` | Find redirects for specific content |
| `redirects` | `by_hit_count` | `["hitCount"]` | Sort by popularity for admin dashboard |
| `notFound` | `by_url` | `["url"]` | Fast lookup for aggregation |
| `notFound` | `by_hit_count` | `["hitCount"]` | Sort by frequency for admin review |
| `notFound` | `by_resolved` | `["resolved"]` | Filter resolved/unresolved |
| `notFound` | `by_last_hit` | `["lastHitAt"]` | Sort by recency |

### Relationships

| This Table | Field | References | Relationship |
|-----------|-------|-----------|-------------|
| `redirects.createdBy` | `v.id("users")` | `users` table | Who created the redirect |
| `redirects.updatedBy` | `v.id("users")` | `users` table | Who last updated |
| `redirects.contentId` | `v.string()` | `posts`, `pages`, etc. | Linked content (for auto-redirects) |
| `notFound.resolvedBy` | `v.id("users")` | `users` table | Who resolved the 404 |
| `notFound.redirectId` | `v.id("redirects")` | `redirects` table | Redirect created to fix this 404 |

---

## Actions & Functions

### Mutations

#### `routing.createRedirect` - Create Redirect
- **Type:** mutation
- **Auth:** Required
- **Capabilities:** Administrator (`manage_redirects`)
- **Args:**
  ```typescript
  {
    sourceUrl: v.string(),
    targetUrl: v.string(),
    statusCode: v.union(v.literal(301), v.literal(302), v.literal(307), v.literal(308)),
    matchType: v.union(v.literal("exact"), v.literal("prefix"), v.literal("regex")),
    note: v.optional(v.string()),
  }
  ```
- **Returns:** `Id<"redirects">`
- **Behavior:**
  1. Auth check: Administrator with `manage_redirects` capability
  2. Validate source URL (must start with `/`, no query strings, no fragments, max 2000 chars, not reserved path)
  3. Validate target URL (relative or absolute HTTPS, no fragments, max 2000 chars, not equal to source)
  4. Check for duplicate active exact-match redirect on same source URL
  5. Detect redirect loops (direct: A->A, indirect: A->B where B->A exists)
  6. Flatten redirect chains (update existing redirects pointing to sourceUrl to point to targetUrl instead)
  7. Insert into `redirects` table with `source: "manual"`, `enabled: true`, `hitCount: 0`
  8. Return redirect ID
- **Events:** None directly
- **Errors:**
  - `"Only administrators can create redirects"` - Auth failure
  - `"A redirect already exists for this URL"` - Duplicate source
  - `"This redirect would create a loop"` - Loop detected
  - `"Source URL must start with /"` - Invalid format
  - `"Invalid regular expression pattern"` - Bad regex

#### `routing.updateRedirect` - Update Redirect
- **Type:** mutation
- **Auth:** Required
- **Capabilities:** Administrator (`manage_redirects`)
- **Args:**
  ```typescript
  {
    redirectId: v.id("redirects"),
    sourceUrl: v.optional(v.string()),
    targetUrl: v.optional(v.string()),
    statusCode: v.optional(v.union(v.literal(301), v.literal(302), v.literal(307), v.literal(308))),
    matchType: v.optional(v.union(v.literal("exact"), v.literal("prefix"), v.literal("regex"))),
    enabled: v.optional(v.boolean()),
    note: v.optional(v.string()),
  }
  ```
- **Returns:** Updated redirect record
- **Behavior:**
  1. Auth check: Administrator
  2. Fetch existing redirect (throw if not found)
  3. Validate changed fields
  4. If sourceUrl or targetUrl changed, re-check for loops and chains
  5. Patch the redirect record with `updatedAt: Date.now()` and `updatedBy: user._id`
  6. Return updated record
- **Events:** None
- **Errors:** Same as create + `"Redirect not found"`

#### `routing.deleteRedirect` - Delete Redirect
- **Type:** mutation
- **Auth:** Required
- **Capabilities:** Administrator (`manage_redirects`)
- **Args:**
  ```typescript
  {
    redirectId: v.id("redirects"),
  }
  ```
- **Returns:** void
- **Behavior:**
  1. Auth check: Administrator
  2. Fetch existing redirect (throw if not found)
  3. Delete the redirect record
  4. Chains are already flat, so no cascading updates needed
- **Events:** None
- **Errors:** `"Redirect not found"`

### Internal Mutations (System-Triggered)

#### `routing.generateSlugRedirect`
- **Type:** internalMutation
- **Triggered By:** `post.updated` / `page.updated` event (when slug change is detected in `changes` array)
- **Args:**
  ```typescript
  {
    contentType: v.union(v.literal("post"), v.literal("page")),
    contentId: v.string(),
    oldSlug: v.string(),
    newSlug: v.string(),
  }
  ```
- **Behavior:**
  1. Get current permalink settings from Settings System
  2. Compute old URL from oldSlug + current settings
  3. Compute new URL from newSlug + current settings
  4. Create 301 redirect: old -> new with `source: "slug_change"`
  5. Update any existing redirects that pointed to old URL -> point to new URL (chain flatten)
  6. Remove 404 log entry for new URL if exists

#### `routing.generatePermalinkRedirects`
- **Type:** internalAction
- **Triggered By:** `settings.permalinks_changed` event
- **Args:**
  ```typescript
  {
    oldStructure: v.string(),
    newStructure: v.string(),
    oldCategoryBase: v.string(),
    newCategoryBase: v.string(),
    oldTagBase: v.string(),
    newTagBase: v.string(),
  }
  ```
- **Behavior:**
  1. Fetch all published posts via `internal.posts.getAllPublished`
  2. Build old and new settings objects
  3. Batch process posts (100 per mutation to avoid size limits):
     - Compute old URL and new URL for each post
     - Filter out posts where URLs are unchanged
     - Create 301 redirects with `source: "permalink_change"`
  4. Handle category base changes: redirect each category's old URL to new URL
  5. Handle tag base changes: redirect each tag's old URL to new URL
  6. Flatten any chains created by this batch

#### `routing.batchCreateRedirects`
- **Type:** internalMutation
- **Args:**
  ```typescript
  {
    redirects: v.array(v.object({
      sourceUrl: v.string(),
      targetUrl: v.string(),
    })),
    source: v.union(v.literal("slug_change"), v.literal("permalink_change")),
  }
  ```
- **Behavior:** Insert batch of redirect records with `statusCode: 301`, `enabled: true`, `hitCount: 0`

#### `routing.recordRedirectHit`
- **Type:** internalMutation
- **Args:** `{ redirectId: v.id("redirects") }`
- **Behavior:** Increment `hitCount` by 1, set `lastHitAt` to `Date.now()`. Fire-and-forget from middleware.

#### `routing.log404`
- **Type:** internalMutation
- **Args:**
  ```typescript
  {
    url: v.string(),
    referrer: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  }
  ```
- **Behavior:**
  1. Check `notFound` table for existing entry with same URL (using `by_url` index)
  2. If exists: increment `hitCount`, update `lastHitAt`, update `referrer`/`userAgent`
  3. If not exists: insert new record with `hitCount: 1`, `resolved: false`

#### `routing.regeneratePatterns` (NOT IMPLEMENTED)
- **Type:** internalMutation
- **Triggered By:** `settings.permalinks_changed` event
- **Status:** Not implemented. ConvexPress uses JavaScript middleware (TanStack Start) instead of `.htaccess` rules, so there are no server-side rewrite patterns to regenerate. The equivalent behavior is handled by the dynamic URL resolution middleware reading the current permalink settings from Convex at request time. This function is not needed in the current architecture.
- **WordPress Equivalent:** `flush_rewrite_rules()` -- only applicable to `.htaccess`-based rewriting.

### Queries

#### `routing.resolveRedirect`
- **Type:** internalQuery
- **Auth:** None (called by middleware)
- **Args:** `{ url: v.string() }`
- **Returns:** Redirect record or null
- **Behavior:**
  1. **Exact match**: Query `redirects` with `by_source_url` index, filter `enabled: true` -- return first match
  2. **Prefix match**: Query all prefix-type enabled redirects, filter by `url.startsWith(sourceUrl)`, sort by sourceUrl length descending (longest prefix wins) -- return first match
  3. **Regex match**: Query all regex-type enabled redirects, test each regex against URL -- return first match
  4. Return null if no match
- **Performance:** < 5ms for exact, < 10ms for prefix, < 20ms for regex

#### `routing.getRedirects`
- **Type:** query
- **Auth:** Required (Administrator, `manage_redirects`)
- **Args:**
  ```typescript
  {
    source: v.optional(v.union(v.literal("manual"), v.literal("slug_change"), v.literal("permalink_change"), v.literal("import"))),
    enabled: v.optional(v.boolean()),
    search: v.optional(v.string()),
    sortBy: v.optional(v.union(v.literal("sourceUrl"), v.literal("hitCount"), v.literal("createdAt"), v.literal("lastHitAt"))),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  }
  ```
- **Returns:** Paginated list of redirect records
- **Pagination:** Cursor-based

#### `routing.getRedirectById`
- **Type:** query
- **Auth:** Required (Administrator)
- **Args:** `{ redirectId: v.id("redirects") }`
- **Returns:** Single redirect record

#### `routing.get404Log`
- **Type:** query
- **Auth:** Required (Administrator, `view_404_log`)
- **Args:**
  ```typescript
  {
    resolved: v.optional(v.boolean()),
    minHits: v.optional(v.number()),
    sortBy: v.optional(v.union(v.literal("hitCount"), v.literal("lastHitAt"), v.literal("url"))),
    limit: v.optional(v.number()),
  }
  ```
- **Returns:** Paginated list of notFound records

#### `routing.getRedirectStats`
- **Type:** query
- **Auth:** Required (Administrator)
- **Args:** none
- **Returns:**
  ```typescript
  {
    totalRedirects: number,
    activeRedirects: number,
    totalHits: number,
    topRedirects: Redirect[] // Top 10 by hit count
  }
  ```
- **Performance note:** Currently performs full table scans of both `redirects` and `notFound` tables to compute aggregate statistics. For sites with many redirects/404s, consider adding a denormalized `routingStats` document updated incrementally, or implementing server-side aggregation.

---

## Events

### Events This System Listens To

#### `settings.permalinks_changed`
- **Type:** System
- **Source System:** Settings System
- **Routing System Response:** Run `generatePermalinkRedirects` action to batch-create 301 redirects for all posts from old URLs to new URLs. Run `regeneratePatterns` to rebuild URL patterns.
- **Payload:**
  ```typescript
  {
    oldStructure: string,
    newStructure: string,
    oldCategoryBase: string,
    newCategoryBase: string,
    oldTagBase: string,
    newTagBase: string,
  }
  ```

#### `post.updated` (slug change detection)
- **Type:** Content
- **Source System:** Post System
- **Routing System Response:** The `onSlugChanged` handler inspects the `changes` array in the event payload for a slug field change. If found, it runs `generateSlugRedirect` to create a 301 redirect from old URL to new URL.
- **Note:** There is no dedicated `post.slug_changed` event. The handler listens to `post.updated` and filters for slug changes in the `changes` array.
- **Payload:**
  ```typescript
  {
    postId: string,
    title: string,
    authorId: string,
    changes: Array<{ field: string, oldValue: unknown, newValue: unknown }>,
    // Slug change is detected when changes contains { field: "slug", oldValue: "old-slug", newValue: "new-slug" }
  }
  ```

#### `page.updated` (slug change detection)
- **Type:** Content
- **Source System:** Page System
- **Routing System Response:** Same as `post.updated` -- the `onSlugChanged` handler inspects the `changes` array for a slug field change and runs `generateSlugRedirect` if found.
- **Note:** There is no dedicated `page.slug_changed` event. The handler listens to `page.updated` and filters for slug changes in the `changes` array.
- **Payload:**
  ```typescript
  {
    pageId: string,
    title: string,
    changes: Array<{ field: string, oldValue: unknown, newValue: unknown }>,
    // Slug change is detected when changes contains { field: "slug", oldValue: "old-slug", newValue: "new-slug" }
  }
  ```

#### `post.published`
- **Type:** Content
- **Source System:** Post System
- **Routing System Response:** Validate URL is not in conflict. Clear 404 entry for this URL if exists.
- **Payload:**
  ```typescript
  {
    postId: string,
    slug: string,
  }
  ```

#### `page.published`
- **Type:** Content
- **Source System:** Page System
- **Routing System Response:** Validate URL is not in conflict. Clear 404 entry for this URL if exists.
- **Payload:**
  ```typescript
  {
    pageId: string,
    slug: string,
  }
  ```

### Events This System Emits

The Routing System does not emit its own events. It is primarily a reactive consumer of events from other systems.

---

## Admin Routes & UI

### Permalink Settings (`/admin/settings/permalinks`)
- **Purpose:** Configure permalink structure, category base, tag base
- **WordPress Equivalent:** Settings > Permalinks
- **Layout:** Settings sub-page within admin layout
- **Key Components:**
  - Radio button group for 6 permalink structures with live preview
  - Custom structure text input with available tags
  - Category base text input (default: "category")
  - Tag base text input (default: "tag")
  - Save button with confirmation dialog (warns about redirect generation)
- **Data Requirements:** `settings.getBySection({ section: "permalinks" })`
- **User Interactions:** Select structure, enter custom pattern, save changes
- **Real-Time:** Settings update live across all connected admin clients
- **Note:** This page is shared with the Settings System. The Routing System is the consumer of these settings.

### Redirect Management (Future: `/admin/tools/redirects`)
- **Purpose:** List, create, edit, and delete redirect rules
- **WordPress Equivalent:** Redirection plugin
- **Layout:** WordPress-style list table
- **Key Components:**
  - Filter bar: Source type, Status (enabled/disabled), Search
  - Table: Source URL, Target URL, Type, Hits, Last Hit, Status, Actions
  - Create/Edit form: Source URL, Target URL, Status Code, Match Type, Note, Test button
  - Pagination
- **Data Requirements:** `routing.getRedirects`
- **User Interactions:** Filter, search, create, edit, enable/disable, delete, test redirects

### 404 Log Viewer (Future: `/admin/tools/404-log`)
- **Purpose:** View 404 hits, create redirects from 404 entries
- **WordPress Equivalent:** No native equivalent (plugin functionality)
- **Layout:** WordPress-style list table
- **Key Components:**
  - Filter bar: Resolved/Unresolved, Min Hits, Date Range
  - Table: URL, Hits, Last Hit, Referrer, Status, Actions
  - Bulk actions: Create Redirects for Selected, Dismiss Selected
  - "Create Redirect" button pre-fills redirect form with 404 URL
- **Data Requirements:** `routing.get404Log`
- **User Interactions:** Filter, sort, create redirect from 404, dismiss/resolve entries

---

## Website Routes

### 404 Page (`/404`)
- **Purpose:** Branded, helpful error page for not-found URLs
- **SEO:** `X-Robots-Tag: noindex` header, `Cache-Control: no-cache`
- **Data Requirements:** Recent published posts for suggestions
- **Layout:**
  - Standard site header/footer
  - 404 hero section: "Page Not Found" heading + subheading
  - Search section with search input
  - Suggestions section: Home, Blog, 3-5 recent posts, Contact (if exists)
- **Caching:** No caching (dynamic 404 responses)

### Content Resolution Routes

These are the route files needed to support all permalink structures:

| Route File | Purpose |
|-----------|---------|
| `app/routes/index.tsx` | Homepage + `?p=ID` handling for plain permalinks |
| `app/routes/$slug.tsx` | Post name / page catch-all resolution |
| `app/routes/blog/index.tsx` | Blog index |
| `app/routes/blog/$slug.tsx` | Blog post by slug |
| `app/routes/blog/$year/$month/$slug.tsx` | Month and name permalink |
| `app/routes/blog/$year/$month/$day/$slug.tsx` | Day and name permalink |
| `app/routes/archives/$id.tsx` | Numeric permalink |
| `app/routes/category/$slug.tsx` | Category archive |
| `app/routes/tag/$slug.tsx` | Tag archive |
| `app/routes/author/$slug.tsx` | Author archive |
| `app/routes/search.tsx` | Search results |
| `app/routes/feed.tsx` | RSS feed |
| `app/routes/sitemap.xml.tsx` | XML sitemap |
| `app/routes/robots.txt.tsx` | Robots.txt |

---

## Notifications

### Email Notifications

The Routing System does not have dedicated email notifications. Redirect creation and 404 logging are operational activities.

### Site Notifications

| Name | Event | Type | Persistent | Recipients | Record ID |
|------|-------|------|-----------|------------|-----------|
| Permalink Changed | `settings.permalinks_changed` | Warning | Yes | Administrator | `rec1HP1mzeOQv3Ev1` |

**Note:** This notification is emitted by the Settings System, not the Routing System. The Routing System silently creates redirects and logs activity. The notification alerts admins that URL structures have changed and redirects were generated.

---

## Role & Capability Matrix

| Action | Admin | Editor | Author | Contributor | Subscriber |
|--------|:-----:|:------:|:------:|:-----------:|:----------:|
| View permalink settings | Yes | No | No | No | No |
| Update permalink settings | Yes | No | No | No | No |
| Create redirect | Yes | No | No | No | No |
| Update redirect | Yes | No | No | No | No |
| Delete redirect | Yes | No | No | No | No |
| View redirect list | Yes | No | No | No | No |
| View 404 log | Yes | No | No | No | No |
| Resolve 404 entries | Yes | No | No | No | No |

### Capabilities

| Capability | Description | Roles |
|-----------|-------------|-------|
| `manage_options` | View and modify permalink settings (shared with Settings System) | Administrator |
| `routing.create_redirect` | Create redirect rules, resolve/dismiss 404 entries | Administrator |
| `routing.update_redirect` | Update existing redirect rules | Administrator |
| `routing.delete_redirect` | Delete redirect rules | Administrator |

**Known gap:** Read-only queries (listing redirects, viewing 404 log, viewing stats) currently require `routing.create_redirect`. A dedicated `routing.view_redirects` capability for read-only access should be added in a future iteration.

---

## Dependencies

### Depends On

| System | Dependency Type | What It Provides |
|--------|:---------------:|-----------------|
| **Settings System** | **Hard** | Permalink structure, category base, tag base -- the core configuration that drives URL generation and resolution. Read via `settings.getBySection({ section: "permalinks" })` |
| **Event Dispatcher System** | **Hard** | Event subscription mechanism for `settings.permalinks_changed`, `post.updated` (slug change detection), `page.updated` (slug change detection), `post.published`, `page.published` |
| **Auth System** | **Hard** | Convex Auth authentication for admin redirect management and 404 log viewing |
| **Role & Capability System** | **Hard** | Capability checks (`manage_options`, `manage_redirects`, `view_404_log`) for admin access control |
| **Post System** | **Medium** | Post data for URL generation (slug, publishedAt, numericId, primaryCategorySlug, authorSlug). Also `internal.posts.getAllPublished` for batch redirect generation |
| **Page System** | **Medium** | Page data for URL generation (slug, fullPath). Also needed to distinguish pages from posts in `$slug` route |
| **Taxonomy System** | **Medium** | Category and tag data for category/tag base redirect generation |

### Depended On By

| System | Dependency Type | What They Need |
|--------|:---------------:|----------------|
| **Post System** | **Soft** | `generatePostUrl()` for rendering post links, RSS feeds, sitemaps |
| **Page System** | **Soft** | `generatePageUrl()` for rendering page links, menus, sitemaps |
| **Taxonomy System** | **Soft** | `generateCategoryUrl()`, `generateTagUrl()` for archive links |
| **Menu System** | **Soft** | URL generation for menu items linking to posts/pages/archives |
| **SEO System** | **Soft** | Canonical URL generation for `<link rel="canonical">` tags |
| **Sitemap System** | **Soft** | URL generation for all content URLs in the sitemap |
| **RSS/Feed System** | **Soft** | URL generation for post links in RSS entries |
| **Search System** | **Soft** | URL generation for search result links |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| **Convex** | Redirect storage, 404 logging, URL resolution queries |
| **TanStack Start** | Server middleware for canonical URL enforcement, redirect handling, 404 rendering |
| **TanStack Router** | File-based routing for admin SPA |

---

## Implementation Checklist

### Shared Package (packages/shared/)
- [ ] `src/routing/url-generator.ts` - URL generation utilities (generatePostUrl, generatePageUrl, generateCategoryUrl, generateTagUrl, generateAuthorUrl)
- [ ] `src/routing/permalink-tags.ts` - Permalink tag definitions (PERMALINK_TAGS constant) and resolvePermalinkTags()
- [ ] `src/routing/types.ts` - TypeScript types (PermalinkSettings, Redirect, NotFoundEntry, PermalinkTag, PermalinkStructure)
- [ ] `src/routing/validators.ts` - URL validation (validateSourceUrl, validateTargetUrl, detectLoop)
- [ ] `src/routing/index.ts` - Barrel export

### Backend (ConvexPress-Admin/packages/backend/)
- [ ] `convex/schema.ts` - Add `redirects` and `notFound` table definitions (2 tables)
- [ ] `convex/routing/queries.ts` - 4 queries: getRedirects, getRedirectById, get404Log, getRedirectStats
- [ ] `convex/routing/mutations.ts` - 3 mutations: createRedirect, updateRedirect, deleteRedirect
- [ ] `convex/routing/internal.ts` - 6 internal functions: resolveRedirect, generateSlugRedirect, generatePermalinkRedirects, batchCreateRedirects, recordRedirectHit, log404, regeneratePatterns
- [ ] `convex/routing/eventHandlers.ts` - Event handlers: onPermalinksChanged, onSlugChanged, onContentPublished
- [ ] `convex/routing/helpers.ts` - Helpers: detectLoop, flattenChains, validateSourceUrl, validateTargetUrl
- [ ] `convex/routing/crons.ts` - Scheduled job: 404 log cleanup (resolved > 90 days, unresolved low-hit > 30 days)

### Admin Frontend (ConvexPress-Admin/apps/web/)
- [ ] `src/routes/admin/settings/permalinks.tsx` - Permalink settings page (shared with Settings System)
- [ ] `src/routes/admin/tools/redirects/index.tsx` - Redirect list page (future)
- [ ] `src/routes/admin/tools/redirects/new.tsx` - Create redirect page (future)
- [ ] `src/routes/admin/tools/redirects/$id.edit.tsx` - Edit redirect page (future)
- [ ] `src/routes/admin/tools/404-log.tsx` - 404 log viewer (future)
- [ ] `src/components/routing/RedirectForm.tsx` - Redirect create/edit form (future)
- [ ] `src/components/routing/RedirectTable.tsx` - Redirect list table (future)
- [ ] `src/components/routing/NotFoundLogTable.tsx` - 404 log table (future)

### Website Frontend (ConvexPress-Website/apps/web/)
- [ ] `app/middleware/canonical.ts` - Canonical URL normalization middleware
- [ ] `app/middleware/redirects.ts` - Redirect lookup middleware
- [ ] `app/routes/404.tsx` - 404 page route
- [ ] `app/routes/$slug.tsx` - Post name / page catch-all route
- [ ] `app/routes/blog/$year/$month/$slug.tsx` - Month and name permalink route
- [ ] `app/routes/blog/$year/$month/$day/$slug.tsx` - Day and name permalink route
- [ ] `app/routes/archives/$id.tsx` - Numeric permalink route
- [ ] `app/contexts/routing.tsx` - RoutingProvider + useRouting() hook
- [ ] `app/components/NotFoundPage.tsx` - 404 page UI component
- [ ] `app/components/SearchForm.tsx` - Search form for 404 page
- [ ] `app/components/RecentPostLinks.tsx` - Recent post links for 404 suggestions

### Tests
- [ ] `packages/shared/src/routing/__tests__/url-generator.test.ts` - URL generation unit tests
- [ ] `packages/shared/src/routing/__tests__/permalink-tags.test.ts` - Permalink tag unit tests
- [ ] `packages/shared/src/routing/__tests__/validators.test.ts` - URL validation unit tests
- [ ] `convex/routing/__tests__/queries.test.ts` - Query integration tests
- [ ] `convex/routing/__tests__/mutations.test.ts` - Mutation integration tests
- [ ] `convex/routing/__tests__/eventHandlers.test.ts` - Event handler integration tests
- [ ] `e2e/routing/redirects.test.ts` - Redirect E2E tests
- [ ] `e2e/routing/canonical.test.ts` - Canonical URL E2E tests
- [ ] `e2e/routing/404.test.ts` - 404 page E2E tests

---

## Edge Cases & Gotchas

1. **Slug collision between posts and pages**: When `post_name` permalink structure is active, a post and page could have the same slug. The Routing System does not handle this -- slug uniqueness is enforced at content creation level by Post and Page Systems. If a collision somehow occurs, posts take precedence (WordPress behavior).

2. **Permalink change with large post count**: For sites with thousands of posts, `generatePermalinkRedirects` creates many records. Handled by: (a) batch processing 100 posts per mutation, (b) running as a Convex action (non-blocking), (c) progress tracking via status document, (d) estimated time display before confirming.

3. **Redirect to non-existent target**: A redirect target might become invalid (page deleted). The system does NOT proactively validate targets -- the redirect fires, the target 404s, and that 404 is logged. Admin fixes manually.

4. **Double redirect prevention during permalink changes**: When structure changes A->B, redirects are created. When later B->C, new redirects are created AND existing A-based redirects are updated to point directly to C (chain flattening). No chains ever exist.

5. **Regex redirect performance**: Regex redirects are checked last and require loading all regex redirects. Mitigated by: limit of 50 regex redirects per site, Convex query caching, admin warnings for slow patterns.

6. **404 log growth**: The `notFound` table could grow unbounded from bot traffic. Mitigated by: per-URL aggregation, scheduled cleanup (resolved > 90 days, unresolved low-hit > 30 days), max 10,000 records (oldest low-hit pruned), bot filtering in admin UI.

7. **Trailing slash on static assets**: The canonical middleware must NOT redirect requests for files with extensions (`.png`, `.css`, `.js`, `.woff2`, etc.). The file extension regex check handles this.

8. **Canonical middleware and API routes**: The canonical middleware must skip `/api/*` routes to avoid interfering with API responses. API routes do not need trailing slashes.

9. **Date-based permalink date validation**: For `day_and_name` and `month_and_name` structures, the post is fetched by slug, then the date in the URL is validated against `publishedAt`. If dates do not match, redirect (301) to the correct URL. This handles date changes after publication.

10. **Custom permalink structure requirements**: Custom structures MUST contain at least `%postname%` or `%post_id%` to be resolvable. The admin UI validates this before saving.

11. **Plain permalink `?p=ID` with non-plain structure**: When the site uses a non-plain permalink structure but receives a `?p=ID` URL, the canonical middleware should resolve the post by numeric ID and redirect (301) to the correct permalink-structured URL.

12. **Preview URLs for unpublished posts**: Need a mechanism like WordPress's `?preview=true&p=123` that bypasses normal URL resolution and shows draft content to authorized users. This is an open question.

13. **www/non-www determination**: The canonical hostname preference is derived from `siteUrl` in General Settings. If `siteUrl` starts with `https://www.`, enforce www; otherwise enforce non-www.

14. **Multiple slug changes stacking**: Changing slug A->B->C creates redirects A->C and B->C (not A->B->C chain). Each new slug change updates ALL existing redirects for that content to point to the latest URL.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `WP_Rewrite` class | URL Resolution Middleware + Permalink Settings | Server-agnostic JS middleware instead of .htaccess rules |
| `get_permalink($post)` | `generatePostUrl(post, settings)` | Pure function, reads permalink settings |
| `get_page_link($page)` | `generatePageUrl(page)` | Pages always use `/{slug}/` regardless of settings |
| `get_category_link($cat)` | `generateCategoryUrl(category, settings)` | Uses `categoryBase` from settings |
| `get_tag_link($tag)` | `generateTagUrl(tag, settings)` | Uses `tagBase` from settings |
| `get_author_posts_url($author)` | `generateAuthorUrl(author)` | Always `/author/{slug}/` |
| `add_rewrite_rule()` | `redirects` table with `matchType` | Database-backed, no file generation |
| `flush_rewrite_rules()` | `routing.regeneratePatterns` | Internal mutation, no file I/O |
| `wp_redirect($url, $status)` | TanStack Start middleware `redirect()` | Middleware response |
| `redirect_canonical()` | `canonicalMiddleware` | Comprehensive: trailing slash, case, protocol, www |
| `wp_old_slug_redirect()` | `routing.generateSlugRedirect` | Auto-creates redirect record on slug change |
| `is_404()` | Route error boundary / `isNotFound(error)` | TanStack Router NotFound mechanism |
| `handle_404()` | `NotFoundPage` component + `log404` mutation | Renders 404 + logs to database |
| `parse_request` | URL Resolution Middleware pipeline | Request processing chain |
| `template_redirect` | TanStack Start middleware chain | Middleware fires before route renders |
| `get_option('permalink_structure')` | `settings.getBySection({ section: "permalinks" })` | Convex query, reactive |
| `_wp_old_slug` post meta | `redirects` table with `source: "slug_change"` | Dedicated table instead of meta |

---

## URL Generation Utilities Reference

### generatePostUrl(post, settings, siteUrl?)

```typescript
export function generatePostUrl(
  post: Post,
  settings: PermalinkSettings,
  siteUrl?: string
): string
```

Generates a post URL based on the current permalink structure. Handles all 6 structures.

### generatePageUrl(page, siteUrl?)

```typescript
export function generatePageUrl(
  page: Page,
  siteUrl?: string
): string
```

Pages always use `/{slug}/` regardless of permalink settings. Supports hierarchical pages: `/{parent-slug}/{child-slug}/`.

### generateCategoryUrl(category, settings, siteUrl?)

```typescript
export function generateCategoryUrl(
  category: Category,
  settings: PermalinkSettings,
  siteUrl?: string
): string
```

Uses `settings.categoryBase` (default: "category"). Output: `/{categoryBase}/{slug}/`.

### generateTagUrl(tag, settings, siteUrl?)

```typescript
export function generateTagUrl(
  tag: Tag,
  settings: PermalinkSettings,
  siteUrl?: string
): string
```

Uses `settings.tagBase` (default: "tag"). Output: `/{tagBase}/{slug}/`.

### generateAuthorUrl(author, siteUrl?)

```typescript
export function generateAuthorUrl(
  author: Author,
  siteUrl?: string
): string
```

Always `/author/{slug}/`. Author base is hardcoded (not configurable).

### RoutingProvider + useRouting() Hook

```typescript
// ConvexPress-Website/app/contexts/routing.tsx
export function RoutingProvider({ children }: { children: React.ReactNode }): JSX.Element
export function useRouting(): RoutingContextValue

// Usage:
const { postUrl, pageUrl, categoryUrl, tagUrl, authorUrl, permalinkSettings } = useRouting();
const url = postUrl(post); // Generates correct URL based on current settings
```

---

## Canonical URL Normalization Rules

| Rule | Before | After | Status Code |
|------|--------|-------|-------------|
| Trailing slash enforcement | `/about` | `/about/` | 301 |
| Homepage (no change) | `/` | `/` | N/A |
| Double slash removal | `/blog//post/` | `/blog/post/` | 301 |
| Query string `?p=ID` resolution | `/?p=42` | `/hello-world/` | 301 |
| Uppercase path normalization | `/About-Us/` | `/about-us/` | 301 |
| Protocol enforcement (HTTPS) | `http://example.com/` | `https://example.com/` | 301 |
| www preference | `http://www.example.com/` | `https://example.com/` | 301 |
| Index file removal | `/index.html` | `/` | 301 |
| Pagination page 1 | `/blog/page/1/` | `/blog/` | 301 |

**Exceptions** (no trailing slash redirect):
- URLs with file extensions (`.png`, `.css`, `.js`, `.xml`, `.txt`, `.woff2`, etc.)
- API routes (`/api/*`)
- Query-string-only URLs (`/?p=123`)

---

## Redirect Validation Rules

### Source URL
| Rule | Description |
|------|-------------|
| Must start with `/` | Relative paths only |
| No query strings | No `?` character |
| No fragments | No `#` character |
| Max length 2000 | Prevent excessively long URLs |
| No spaces | URL-encoded ok, raw spaces rejected |
| Not reserved path | Cannot redirect `/admin/*`, `/api/*`, `/login`, `/register` |
| Unique (exact match) | No two active exact-match redirects on same source |

### Target URL
| Rule | Description |
|------|-------------|
| Relative or absolute | `/path/` or `https://example.com/` |
| Absolute must be HTTPS | HTTP targets rejected |
| Not equal to source | Direct loops rejected |
| Max length 2000 | Prevent excessively long URLs |
| No fragments | No `#` character |

### Regex Match Type
- Must be valid JavaScript `RegExp`
- No catastrophically backtracking patterns (no nested quantifiers like `(a+)+`)
- Max regex length: 500 characters
- Tested against sample URLs during validation

---

## Scheduled Jobs

### 404 Log Cleanup (Convex Cron)

- **Schedule:** Daily or weekly
- **Behavior:**
  1. Delete resolved `notFound` records older than 90 days
  2. Delete unresolved `notFound` records with `hitCount < 3` older than 30 days
  3. If total records > 10,000, prune oldest low-hit entries until under limit
