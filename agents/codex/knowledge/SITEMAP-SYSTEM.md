# Sitemap System - Expert Knowledge Document

**System:** Sitemap System
**Status:** Complete (100%)
**Priority:** P2 - Medium
**Complexity:** Simple
**Layer:** Backend
**Category:** Content & Marketing
**WordPress Equivalent:** WP_Sitemaps (core, since 5.5) + Yoast/Rank Math sitemap features
**Last Analyzed:** 2026-02-13

---

## Quick Reference

### What This System Does

The Sitemap System generates and serves XML sitemaps and manages the `Sitemap:` directive in robots.txt for ConvexPress. It provides search engines (Google, Bing) with a structured map of all publicly accessible URLs, enabling efficient crawling and indexing. Unlike WordPress's dynamic per-request rendering, ConvexPress pre-generates XML and caches it in Convex for instant O(1) serving. The system automatically marks sitemaps as stale when content changes and debounces regeneration to handle bulk operations efficiently.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Sitemap Index** | The master `sitemap.xml` file containing links to all sub-sitemaps |
| **Sub-Sitemap** | A per-content-type XML file (posts, pages, categories, tags, authors) |
| **Stale Flag** | Boolean on cached sitemaps indicating source content has changed and regeneration is needed |
| **Content Hash** | SHA-256 hash of source data for change detection (avoids unnecessary regeneration) |
| **Debounced Regeneration** | Scheduled function that waits (default 30s) after last content change before regenerating |
| **Search Engine Ping** | HTTP request to Google/Bing notifying them of sitemap updates |
| **Changefreq** | Hint to crawlers about how often a URL changes (daily, weekly, monthly, etc.) |
| **Priority** | Hint to crawlers about relative importance of a URL (0.0 to 1.0) |
| **Noindex Exclusion** | Posts/pages with `_seo_noindex` postMeta flag are excluded from sitemaps |
| **Max URLs Per Sitemap** | Pagination threshold (default 1000, max 50000 per sitemaps.org protocol) |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Generation** | Dynamic PHP rendering on each request | Pre-generated XML stored in `sitemapCache` table |
| **Storage** | Generated on-the-fly, no DB storage | Cached XML in Convex for instant serving |
| **Architecture** | `WP_Sitemaps_Provider` class hierarchy | Convex queries aggregating published content URLs |
| **Max URLs/page** | 2000 (hardcoded) | 1000 default, configurable up to 50000 |
| **Admin UI** | No built-in UI (plugin-dependent) | First-party settings page at `/admin/seo/sitemap` |
| **Changefreq/Priority** | Not in core (plugin-only) | Built-in with per-content-type defaults |
| **Reactivity** | None (static XML) | Real-time status updates in admin via Convex subscriptions |
| **Auth** | `manage_options` capability | Convex Auth + `manage_options` capability |
| **User Sitemaps** | Always included | Off by default, opt-in |
| **Change Detection** | None (always regenerates) | SHA-256 content hash comparison |
| **Debouncing** | None | Configurable debounce (5s-5min, default 30s) |
| **Ping** | `wp_ping()` on publish only | On every sitemap regeneration (configurable) |
| **robots.txt** | Dynamic via `do_robots` hook | Settings-stored, SEO System managed |

---

## Architecture Overview

### Data Flow

```
Content Change (post published/unpublished/trashed/updated)
  |
  v
Event Dispatcher (post.published, page.updated, etc.)
  |
  v
Sitemap Event Subscriber
  |
  v
sitemaps.markStale({ types: ["posts", "index"] })
  |
  v
Schedule debounced regeneration (ctx.scheduler.runAfter)
  |  (cancel previous pending scheduled function)
  |  (default: 30 seconds after last change)
  v
internal.sitemaps.regenerateStale()
  |
  v
For each stale type:
  1. Query published content from posts/pages/terms/users tables
  2. Exclude noindex content (_seo_noindex postMeta)
  3. Compute contentHash (SHA-256 of source data)
  4. Compare to cached hash -- skip if identical
  5. Generate XML string
  6. Upsert into sitemapCache table
  7. Clear isStale flag
  |
  v
Generate sitemap index XML
  |
  v
Ping search engines (Google, Bing) -- non-fatal on error
  |
  v
Log to sitemapGenerationLog + sitemapPingLog
  |
  v
Emit seo.sitemap_generated event
  |
  v
Notifications (toast to admin, batched email digest)
```

### Real-Time Behavior

- **Admin Sitemap Settings page** subscribes to `sitemaps.getStatus` via `useQuery`. When regeneration completes, URL counts, timestamps, and stale indicators update in real-time without page refresh.
- **Regenerate Now button** calls the `sitemaps.generate` action. The loading spinner resolves when the Convex action completes.
- **Generation Log** updates reactively as new log entries are created.
- **Public sitemap endpoints** are NOT reactive -- they serve cached XML with HTTP `Cache-Control: public, max-age=3600` headers.

### Authentication & Authorization

- **Public endpoints** (`/sitemap.xml`, `/sitemap-{type}-{page}.xml`, `/robots.txt`): No auth required. Anyone can access.
- **Admin endpoints** (`/admin/seo/sitemap`): Convex Auth authentication required. User must have `manage_options` capability (Administrator role only).
- **Manual regeneration**: Convex Auth auth + `manage_options` capability.
- **Automatic regeneration**: No auth (system-triggered by internal event subscribers).
- **Settings updates**: Convex Auth auth + `manage_options` capability.

---

## Database Schema

### `sitemapCache` Table

Stores pre-generated sitemap XML documents for instant serving without regeneration on each request.

```typescript
// convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const sitemapType = v.union(
  v.literal("index"),       // The main sitemap index
  v.literal("posts"),       // Blog posts sub-sitemap
  v.literal("pages"),       // Static pages sub-sitemap
  v.literal("categories"),  // Category archive sub-sitemap
  v.literal("tags"),        // Tag archive sub-sitemap
  v.literal("authors"),     // Author archive sub-sitemap
);

sitemapCache: defineTable({
  // --- Identity ---
  type: sitemapType,                    // Which sub-sitemap this is
  page: v.number(),                     // Page number (1-based for sub-sitemaps, 0 for index)

  // --- Content ---
  xml: v.string(),                      // The full XML content of this sitemap
  urlCount: v.number(),                 // Number of URLs in this sitemap

  // --- Metadata ---
  generatedAt: v.number(),             // When this sitemap was last generated (timestamp ms)
  generationDurationMs: v.number(),    // How long generation took (for monitoring)
  contentHash: v.string(),             // SHA-256 hash of source data (for change detection)

  // --- Status ---
  isStale: v.boolean(),                // Marked stale when content changes (needs regeneration)
})
  .index("by_type_page", ["type", "page"])   // Lookup specific sub-sitemap
  .index("by_stale", ["isStale"])            // Find sitemaps that need regeneration
  .index("by_type", ["type"]),               // All pages for a given type
```

**Field Specifications:**

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `type` | `enum` | Yes | - | One of: index, posts, pages, categories, tags, authors |
| `page` | `number` | Yes | `1` | Positive integer. Page 0 for index type. |
| `xml` | `string` | Yes | - | Valid XML string. Max ~1MB (Convex string limit). Typical: 50-100KB. |
| `urlCount` | `number` | Yes | `0` | Non-negative integer. |
| `generatedAt` | `number` | Yes | `Date.now()` | Unix timestamp in milliseconds. |
| `generationDurationMs` | `number` | Yes | - | Non-negative integer. |
| `contentHash` | `string` | Yes | - | SHA-256 hex string (64 characters). |
| `isStale` | `boolean` | Yes | `false` | Set to `true` when source content changes. |

### `sitemapGenerationLog` Table

Audit trail for sitemap generation events, used for debugging and monitoring.

```typescript
sitemapGenerationLog: defineTable({
  // --- Generation Info ---
  triggeredBy: v.union(
    v.literal("content_change"),    // Automatic: content was published/unpublished/deleted
    v.literal("manual"),            // Admin clicked "Regenerate"
    v.literal("scheduled"),         // Periodic scheduled regeneration
    v.literal("settings_change"),   // Sitemap settings were modified
  ),
  triggeredByUserId: v.optional(v.string()),    // user identifier (for manual triggers)
  triggeredByEvent: v.optional(v.string()),     // Event code that triggered (e.g., "post.published")
  triggeredByContentId: v.optional(v.string()), // ID of the content that changed

  // --- Results ---
  status: v.union(
    v.literal("success"),
    v.literal("error"),
  ),
  sitemapsGenerated: v.number(),    // How many sub-sitemaps were (re)generated
  totalUrls: v.number(),           // Total URLs across all sitemaps
  durationMs: v.number(),          // Total generation time
  errorMessage: v.optional(v.string()),  // Error details if failed

  // --- Timestamp ---
  createdAt: v.number(),
})
  .index("by_created", ["createdAt"])    // Chronological log
  .index("by_status", ["status"]),       // Filter errors
```

### `sitemapPingLog` Table

Tracks search engine ping requests and their outcomes.

```typescript
sitemapPingLog: defineTable({
  engine: v.union(
    v.literal("google"),
    v.literal("bing"),
  ),
  url: v.string(),                        // The ping URL that was called
  status: v.union(
    v.literal("success"),
    v.literal("error"),
  ),
  httpStatus: v.optional(v.number()),     // HTTP response code
  errorMessage: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_engine", ["engine", "createdAt"])
  .index("by_created", ["createdAt"]),
```

### Indexes

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `sitemapCache` | `by_type_page` | `[type, page]` | Look up a specific sub-sitemap by type and page number |
| `sitemapCache` | `by_stale` | `[isStale]` | Find all sitemaps that need regeneration |
| `sitemapCache` | `by_type` | `[type]` | Get all pages for a given content type |
| `sitemapGenerationLog` | `by_created` | `[createdAt]` | Chronological log display |
| `sitemapGenerationLog` | `by_status` | `[status]` | Filter for error entries |
| `sitemapPingLog` | `by_engine` | `[engine, createdAt]` | Per-engine ping history |
| `sitemapPingLog` | `by_created` | `[createdAt]` | Chronological ping log |

### Settings Integration

Sitemap settings are stored in the Settings System (`settings` table) under the `sitemap` group. No separate settings table is needed.

```typescript
// Settings keys used by the Sitemap System
// Stored in the settings table as key-value pairs

interface SitemapSettings {
  // --- Global ---
  "sitemap.enabled": boolean;                     // Master switch (default: true)

  // --- Content Type Inclusion ---
  "sitemap.include_posts": boolean;               // Include blog posts (default: true)
  "sitemap.include_pages": boolean;               // Include static pages (default: true)
  "sitemap.include_categories": boolean;          // Include category archives (default: true)
  "sitemap.include_tags": boolean;                // Include tag archives (default: false)
  "sitemap.include_authors": boolean;             // Include author archives (default: false)

  // --- URL Limits ---
  "sitemap.max_urls_per_sitemap": number;         // Max URLs per sub-sitemap (default: 1000, max: 50000)

  // --- Default Changefreq per Content Type ---
  "sitemap.changefreq_posts": string;             // Default: "weekly"
  "sitemap.changefreq_pages": string;             // Default: "monthly"
  "sitemap.changefreq_categories": string;        // Default: "weekly"
  "sitemap.changefreq_tags": string;              // Default: "weekly"
  "sitemap.changefreq_authors": string;           // Default: "monthly"
  "sitemap.changefreq_homepage": string;          // Default: "daily"

  // --- Default Priority per Content Type ---
  "sitemap.priority_homepage": number;            // Default: 1.0
  "sitemap.priority_posts": number;               // Default: 0.6
  "sitemap.priority_pages": number;               // Default: 0.6
  "sitemap.priority_categories": number;          // Default: 0.4
  "sitemap.priority_tags": number;                // Default: 0.3
  "sitemap.priority_authors": number;             // Default: 0.3

  // --- Search Engine Ping ---
  "sitemap.ping_google": boolean;                 // Ping Google on regeneration (default: true)
  "sitemap.ping_bing": boolean;                   // Ping Bing on regeneration (default: true)

  // --- Auto-Regeneration ---
  "sitemap.auto_regenerate": boolean;             // Auto-regenerate on content changes (default: true)
  "sitemap.regeneration_debounce_ms": number;     // Debounce rapid changes (default: 30000 = 30s)
}
```

### Relationships

| Table | Relationship | Purpose |
|-------|-------------|---------|
| `posts` | Read | Get published posts for post sub-sitemap (`status = "publish"`, `visibility = "public"`) |
| `pages` | Read | Get published pages for page sub-sitemap (`status = "publish"`) |
| `postMeta` | Read | Check `_seo_noindex` flag to exclude specific posts/pages |
| `taxonomies` / `terms` | Read | Get categories and tags with published post counts for taxonomy sitemaps |
| `users` | Read (Convex Auth) | Get authors with published posts for author sub-sitemap |
| `settings` | Read/Write | Sitemap configuration settings (via Settings System) |

---

## Actions & Functions

### Actions

#### `seo.generate_sitemap` - Generate/Regenerate Sitemap

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Convex Function:** `actions/sitemaps.generate`
- **Type:** Action (uses internal mutations for writing, may call external ping APIs)
- **Auth:** Required (for manual trigger), None (for system trigger)
- **Capabilities:** `manage_options` (manual trigger only)
- **Args:**
  ```typescript
  {
    force: v.optional(v.boolean()),           // Force full regeneration (ignore contentHash)
    types: v.optional(v.array(sitemapType)),  // Only regenerate specific types (default: all stale)
  }
  ```
- **Returns:** `{ sitemapsGenerated: number, totalUrls: number, durationMs: number }`
- **Behavior:**
  1. Authenticate user via Convex Auth (if manually triggered). Skip auth for system-triggered regeneration.
  2. If manually triggered, verify `manage_options` capability.
  3. Read sitemap settings from Settings System.
  4. If `sitemap.enabled` is `false`, delete all cached sitemaps and return.
  5. For each enabled content type (or only requested `types`):
     - **Posts:** Query published posts (`status = "publish"`, `visibility = "public"`), exclude `_seo_noindex`, order by `publishedAt` desc, paginate at `max_urls_per_sitemap`. For each URL: `<loc>`, `<lastmod>` (from `updatedAt`), `<changefreq>`, `<priority>`. Compute contentHash from `(postId, updatedAt)` tuples. Skip if hash matches cached and `force` is not true.
     - **Pages:** Query published pages (`status = "publish"`), exclude `_seo_noindex`, exclude password-protected pages, order by `menuOrder` then `title`. Same pagination and caching logic.
     - **Categories:** Query categories with at least 1 published post. URLs: `/category/{slug}`. `<lastmod>` = most recent `publishedAt` in category.
     - **Tags:** Query tags with at least 1 published post. URLs: `/tag/{slug}`. `<lastmod>` = most recent `publishedAt` with that tag.
     - **Authors:** Query users with at least 1 published post. URLs: `/author/{userSlug}`. `<lastmod>` = most recent `publishedAt` by that author.
  6. Generate sitemap index XML with `<sitemapindex>` containing `<sitemap>` entries for each sub-sitemap.
  7. Include homepage URL directly in the posts sub-sitemap (first entry, highest priority).
  8. Delete cached sitemaps for content types now disabled.
  9. Clear `isStale` flag on all regenerated sitemaps.
  10. Log generation results to `sitemapGenerationLog`.
  11. If `sitemap.ping_google` is true, ping: `https://www.google.com/ping?sitemap={sitemapUrl}`.
  12. If `sitemap.ping_bing` is true, ping: `https://www.bing.com/ping?sitemap={sitemapUrl}`.
  13. Log ping results to `sitemapPingLog`.
  14. Emit event: `seo.sitemap_generated`.
  15. Return summary.
- **Events:** `seo.sitemap_generated`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated (manual trigger only).
  - `FORBIDDEN`: User lacks `manage_options` capability.
  - `GENERATION_ERROR`: Database query failed during URL collection.
  - `XML_ERROR`: XML generation produced invalid output.
  - `PING_ERROR`: Search engine ping failed (non-fatal, logged but does not fail the action).

### Mutations

#### `sitemaps.markStale` - Mark Sitemaps as Stale

- **Convex Function:** `mutations/sitemaps.markStale`
- **Type:** Internal Mutation (called by event subscribers, not exposed to client API)
- **Auth:** None (internal function, trusted caller)
- **Args:**
  ```typescript
  {
    types: v.array(sitemapType),  // Which sub-sitemaps are affected
  }
  ```
- **Returns:** `{ count: number }` (number of sitemaps marked stale)
- **Behavior:**
  1. For each specified type, query all `sitemapCache` records of that type.
  2. Set `isStale = true` on each.
  3. Also mark the index as stale (`type = "index"`).
  4. If `sitemap.auto_regenerate` is enabled, schedule a debounced regeneration:
     - Use `ctx.scheduler.runAfter(debounceMs, internal.sitemaps.regenerateStale, {})`.
     - Store the scheduled function ID to cancel previous pending regeneration (debounce pattern).
  5. Return the count of sitemaps marked stale.

#### `sitemaps.updateSettings` - Update Sitemap Settings

- **Convex Function:** `mutations/sitemaps.updateSettings`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `manage_options`
- **Args:**
  ```typescript
  {
    settings: v.object({
      enabled: v.optional(v.boolean()),
      include_posts: v.optional(v.boolean()),
      include_pages: v.optional(v.boolean()),
      include_categories: v.optional(v.boolean()),
      include_tags: v.optional(v.boolean()),
      include_authors: v.optional(v.boolean()),
      max_urls_per_sitemap: v.optional(v.number()),
      changefreq_posts: v.optional(v.string()),
      changefreq_pages: v.optional(v.string()),
      changefreq_categories: v.optional(v.string()),
      changefreq_tags: v.optional(v.string()),
      changefreq_authors: v.optional(v.string()),
      changefreq_homepage: v.optional(v.string()),
      priority_homepage: v.optional(v.number()),
      priority_posts: v.optional(v.number()),
      priority_pages: v.optional(v.number()),
      priority_categories: v.optional(v.number()),
      priority_tags: v.optional(v.number()),
      priority_authors: v.optional(v.number()),
      ping_google: v.optional(v.boolean()),
      ping_bing: v.optional(v.boolean()),
      auto_regenerate: v.optional(v.boolean()),
      regeneration_debounce_ms: v.optional(v.number()),
    }),
  }
  ```
- **Returns:** `{ success: boolean }`
- **Behavior:**
  1. Authenticate user and verify `manage_options` capability.
  2. Validate settings values:
     - `max_urls_per_sitemap`: 1 to 50000.
     - `changefreq_*`: one of `always`, `hourly`, `daily`, `weekly`, `monthly`, `yearly`, `never`.
     - `priority_*`: 0.0 to 1.0.
     - `regeneration_debounce_ms`: 5000 to 300000 (5s to 5min).
  3. Update each provided setting in the Settings System.
  4. If any content type inclusion changed or `enabled` changed, mark all sitemaps as stale.
  5. If `enabled` was changed to `false`, delete all cached sitemaps.
  6. Trigger regeneration if settings changed and sitemaps are enabled.
  7. Emit event via Event Dispatcher for audit logging.
  8. Return success.
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `FORBIDDEN`: User lacks `manage_options`.
  - `VALIDATION_ERROR`: Setting value out of valid range.

### Queries

#### `sitemaps.getIndex` - Serve Sitemap Index

- **Convex Function:** `queries/sitemaps.getIndex`
- **Type:** Query (public, no auth)
- **Args:** `{}`
- **Returns:** `{ xml: string, generatedAt: number, urlCount: number } | null`
- **Behavior:**
  1. Check if sitemaps are enabled (`sitemap.enabled` setting).
  2. If disabled, return `null` (API route responds with 404).
  3. Query `sitemapCache` for `type = "index"` and `page = 0`.
  4. If no cached index exists, return `null`.
  5. Return the cached XML content and metadata.

#### `sitemaps.getSubSitemap` - Serve Sub-Sitemap

- **Convex Function:** `queries/sitemaps.getSubSitemap`
- **Type:** Query (public, no auth)
- **Args:**
  ```typescript
  {
    type: sitemapType,    // Which content type
    page: v.number(),     // Page number (1-based)
  }
  ```
- **Returns:** `{ xml: string } | null`
- **Behavior:**
  1. Check if sitemaps are enabled.
  2. Validate the requested content type is included in settings.
  3. Query `sitemapCache` for matching `type` and `page`.
  4. If not found, return `null` (404).
  5. Return the cached XML content.

#### `sitemaps.getStatus` - Get Sitemap Status (Admin)

- **Convex Function:** `queries/sitemaps.getStatus`
- **Type:** Query (auth required)
- **Auth:** Required
- **Capabilities:** `manage_options`
- **Args:** `{}`
- **Returns:** `SitemapStatus` (see Shared Types section below)
- **Behavior:**
  1. Authenticate user and verify `manage_options` capability.
  2. Query all `sitemapCache` records.
  3. Aggregate: total URL count, per-type URL counts, last generated timestamp, stale status, sitemap index URL.
  4. Query recent `sitemapGenerationLog` entries (last 10).
  5. Query recent `sitemapPingLog` entries (last 10).
  6. Return status summary with logs.

#### `sitemaps.getRobotsContent` - Get robots.txt Content

- **Convex Function:** `queries/sitemaps.getRobotsContent`
- **Type:** Query (public, no auth)
- **Args:** `{}`
- **Returns:** `string` (robots.txt content)
- **Behavior:**
  1. Read `seo.robots_txt` from Settings System (managed by SEO System).
  2. If no custom content exists, generate default:
     ```
     User-agent: *
     Disallow: /admin/
     Disallow: /api/
     Allow: /

     Sitemap: {siteUrl}/sitemap.xml
     ```
  3. If sitemaps are enabled, ensure `Sitemap:` directive is present. Append if missing.
  4. If sitemaps are disabled, remove any `Sitemap:` directive from the content.
  5. Return the robots.txt content string.

### Internal Functions

#### `internal.sitemaps.regenerateStale` - Debounced Regeneration

- **Convex Function:** `sitemaps/internals.ts`
- **Type:** Internal Action (called by scheduler, not directly by users)
- **Behavior:**
  1. Query all stale `sitemapCache` records.
  2. For each stale type, run the generation logic (same as `sitemaps.generate` but without auth).
  3. Uses mutex pattern: check `_isRegenerating` flag before starting to prevent concurrent runs.
  4. Clear stale flags after successful generation.
  5. Ping search engines if configured.
  6. Log results.

---

## Events

### `seo.sitemap_generated`

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Type:** System
- **Triggered By:** `sitemap.generate` action (both manual and automatic triggers)
- **Payload:**
  ```typescript
  {
    url: string,                    // Full URL of the sitemap index
    pageCount: number,              // Total number of URLs across all sub-sitemaps
    sitemapsGenerated: number,      // Number of sub-sitemap files generated
    durationMs: number,             // Generation duration in milliseconds
    triggeredBy: "content_change" | "manual" | "scheduled" | "settings_change",
    triggeredByUserId?: string,     // user identifier if manually triggered
  }
  ```
- **Subscribers:**
  - **Site Notification System** (`[redacted-airtable-record-id]`): Shows success toast to admin: "XML sitemap regenerated ({count} pages)"
  - **Email Notification System** (`[redacted-airtable-record-id]`): Sends batched daily digest email to admin
  - **Audit Log System**: Records sitemap generation event with URL counts

### Events the Sitemap System Subscribes To

| Event | Source System | Sitemap Action |
|-------|-------------|---------------|
| `post.published` | Post System | Mark `posts` + `index` as stale. Also `categories`, `tags`, `authors` if applicable. |
| `post.unpublished` | Post System | Mark `posts` + `index` as stale. Also `categories`, `tags`, `authors`. |
| `post.updated` | Post System | Mark `posts` as stale (if slug or title changed on a published post). |
| `post.trashed` | Post System | Mark `posts` + `index` as stale (if post was published). |
| `post.restored` | Post System | Mark `posts` + `index` as stale (if restored to published). |
| `post.deleted` | Post System | Mark `posts` + `index` as stale (cleanup). |
| `page.published` | Page System | Mark `pages` + `index` as stale. |
| `page.unpublished` | Page System | Mark `pages` + `index` as stale. |
| `page.updated` | Page System | Mark `pages` as stale (if slug changed on published page). |
| `page.trashed` | Page System | Mark `pages` + `index` as stale. |
| `page.deleted` | Page System | Mark `pages` + `index` as stale. |
| `taxonomy.created` | Taxonomy System | Mark `categories` or `tags` as stale (if term has published posts). |
| `taxonomy.updated` | Taxonomy System | Mark `categories` or `tags` as stale (if slug changed). |
| `taxonomy.deleted` | Taxonomy System | Mark `categories` or `tags` as stale. |

---

## Admin Routes & UI

### Sitemap Settings (`/admin/seo/sitemap`)

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Purpose:** Admin page for configuring sitemap generation settings, viewing sitemap status, and manually triggering regeneration. Sub-page of the SEO section.
- **WordPress Equivalent:** Yoast SEO / Rank Math sitemap settings (no WP core equivalent)
- **Layout:** `_admin` layout (sidebar + topbar). Breadcrumb: SEO > Sitemap Settings.
- **Auth Required:** Yes
- **Roles:** Administrator only
- **Key Components:**
  1. **`SitemapStatusCard`** - Status overview card showing: Active/Inactive/Stale status, sitemap URL with copy button, total URL count with per-type breakdown, "Regenerate Now" button, "View Sitemap" link, loading state during regeneration.
  2. **`SitemapSettingsForm`** - Main settings form containing all sections below.
  3. **`SitemapContentTypeRow`** - Per content-type row with enable checkbox, changefreq dropdown, priority input. Used for Posts, Pages, Categories, Tags, Authors.
  4. **`SitemapPingSettings`** - Google/Bing ping enable/disable checkboxes.
  5. **`SitemapAutoRegenSettings`** - Auto-regeneration toggle and debounce interval input.
  6. **`SitemapGenerationLog`** - Recent generation log table (last 10 entries). Columns: Timestamp, Trigger, URL Count, Duration, Status. Error entries highlighted in red.
  7. **`SitemapRegenerateButton`** - Manual regeneration button with loading spinner state.
- **Data Requirements:**
  - `queries/sitemaps.getStatus` - Current sitemap status and generation logs
  - `queries/settings.getGroup("sitemap")` - Current sitemap settings
  - `mutations/sitemaps.updateSettings` - Save settings changes
  - `actions/sitemaps.generate` - Manual regeneration trigger
- **User Interactions:**
  - Toggle sitemap on/off
  - Enable/disable individual content types
  - Configure changefreq and priority per content type
  - Configure homepage changefreq and priority
  - Enable/disable search engine pings
  - Configure auto-regeneration and debounce interval
  - Click "Regenerate Now" for immediate full regeneration
  - Click "View Sitemap" to open sitemap index in new tab
  - Copy sitemap URL to clipboard
  - Save all settings at once
- **Real-Time:**
  - URL counts and last generated timestamp update reactively via `useQuery`
  - Stale indicator updates when content changes
  - Generation log updates when new entries are created
  - Regeneration button loading state resolves when action completes

---

## Website Routes

### XML Sitemap Index (`/sitemap.xml`)

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Purpose:** Serves the XML sitemap index listing all sub-sitemaps. Submitted to Google Search Console, referenced in robots.txt.
- **SEO:** `X-Robots-Tag: noindex` header (sitemaps themselves should not be indexed).
- **Data Requirements:** `queries/sitemaps.getIndex`
- **Caching:** `Cache-Control: public, max-age=3600, s-maxage=3600` (1 hour)
- **Response:** `Content-Type: application/xml; charset=utf-8`
- **Error:** 404 if sitemaps disabled or no cached index exists.

### Sub-Sitemaps (`/sitemap-{type}-{page}.xml`)

- **Purpose:** Serves individual sub-sitemaps for each content type.
- **URL Pattern:**
  - `/sitemap-posts-1.xml`, `/sitemap-posts-2.xml` (paginated)
  - `/sitemap-pages-1.xml`
  - `/sitemap-categories-1.xml`
  - `/sitemap-tags-1.xml`
  - `/sitemap-authors-1.xml`
- **SEO:** `X-Robots-Tag: noindex` header.
- **Data Requirements:** `queries/sitemaps.getSubSitemap`
- **Caching:** `Cache-Control: public, max-age=3600, s-maxage=3600`
- **Response:** `Content-Type: application/xml; charset=utf-8`
- **Validation:** Type must be one of: posts, pages, categories, tags, authors. Page must be >= 1.
- **Error:** 404 if type invalid, page out of range, content type disabled, or no cached data.

### Robots.txt (`/robots.txt`)

- **Airtable Record:** `[redacted-airtable-record-id]` (belongs to SEO System but served with sitemap directive)
- **Purpose:** Serves robots.txt with `Sitemap:` directive pointing to sitemap index.
- **SEO:** Tells crawlers what to crawl and not crawl.
- **Data Requirements:** `queries/sitemaps.getRobotsContent`
- **Caching:** `Cache-Control: public, max-age=86400, s-maxage=86400` (24 hours)
- **Response:** `Content-Type: text/plain; charset=utf-8`

### Sitemap XSL Stylesheet (`/sitemap-style.xsl`)

- **Purpose:** Human-readable HTML rendering of XML sitemap when visited directly in a browser.
- **Response:** XSL stylesheet transforming XML sitemap into styled HTML table.
- **Content:** Shows site name, URL count, table of URLs with lastmod, changefreq, priority.

---

## Notifications

### Email Notifications

| Name | Airtable Record | Event | Recipients | Priority | Subject |
|------|-----------------|-------|------------|----------|---------|
| Sitemap Generated | `[redacted-airtable-record-id]` | `seo.sitemap_generated` | Admin (site administrators) | Batched (daily digest) | "Sitemap updated successfully" |

**Body Content:** Sitemap URL, total URL count, per-type breakdown, generation timestamp, whether search engines were pinged, link to sitemap settings in admin.

**Conditions:** Only included in admin digest emails, not sent individually per regeneration. Batched to avoid flooding admin inbox. Respects admin notification preferences. Only sent for successful generations.

### Site Notifications

| Name | Airtable Record | Event | Type | Persistent | Recipients |
|------|-----------------|-------|------|-----------|------------|
| Sitemap Regenerated | `[redacted-airtable-record-id]` | `seo.sitemap_generated` | Success (green) | No (toast, auto-dismiss 5s) | Admin who triggered or all admins if auto |

**Message Template:** "XML sitemap regenerated ({count} pages)"

**Actions:** "View Sitemap" link (opens in new tab), Dismiss.

**Conditions:** Manual regeneration: shown to the admin who clicked "Regenerate Now". Automatic regeneration: shown only if an admin is on the sitemap settings page. Not shown for auto-regeneration when no admin is actively viewing the page.

---

## Role & Capability Matrix

### Capabilities Used

| Capability | Slug | Used For |
|-----------|------|----------|
| Manage Options | `manage_options` | Configure sitemap settings, trigger manual regeneration, view sitemap status |

### Action-to-Role Matrix

| Action | Administrator | Editor | Author | Contributor | Subscriber | Anonymous |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|
| Generate Sitemap (manual) | Yes | No | No | No | No | No |
| Generate Sitemap (automatic) | System | System | System | System | System | System |
| View Sitemap Status (admin) | Yes | No | No | No | No | No |
| Update Sitemap Settings | Yes | No | No | No | No | No |
| View Sitemap (public) | Yes | Yes | Yes | Yes | Yes | Yes |
| View Robots.txt (public) | Yes | Yes | Yes | Yes | Yes | Yes |

### Route-to-Role Matrix

| Route | Administrator | Editor | Author | Contributor | Subscriber | Anonymous |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|
| `/admin/seo/sitemap` | Yes | No | No | No | No | No |
| `/sitemap.xml` | Yes | Yes | Yes | Yes | Yes | Yes |
| `/sitemap-{type}-{page}.xml` | Yes | Yes | Yes | Yes | Yes | Yes |
| `/robots.txt` | Yes | Yes | Yes | Yes | Yes | Yes |
| `/sitemap-style.xsl` | Yes | Yes | Yes | Yes | Yes | Yes |

---

## Dependencies

### Depends On

| System | Type | What Is Needed |
|--------|------|---------------|
| **Post System** | Hard | Published posts are the primary content in sitemaps. Post events (`post.published`, `post.unpublished`, `post.trashed`, `post.updated`, `post.restored`, `post.deleted`) trigger sitemap regeneration. Queries `posts` table for `status = "publish"`, `visibility = "public"`. |
| **Page System** | Hard | Published pages are included in sitemaps. Page events trigger sitemap regeneration. Queries `pages` table for `status = "publish"`. |
| **Settings System** | Hard | All sitemap configuration stored as key-value pairs in `settings` table under the `sitemap` group. Uses `settings.getGroup("sitemap")` query and settings update mutations. |
| **Auth System** | Medium | Convex Auth authentication for admin settings page and manual regeneration. Not needed for public sitemap serving or automatic regeneration. |
| **Role & Capability System** | Medium | `manage_options` capability check for admin actions (settings, manual regeneration, status viewing). |
| **Event Dispatcher System** | Medium | Subscribes to content change events from Post/Page/Taxonomy systems. Emits `seo.sitemap_generated` event after generation. |
| **Taxonomy System** | Soft | Category and tag archives included in sitemaps (if enabled). Taxonomy events (`taxonomy.created`, `taxonomy.updated`, `taxonomy.deleted`) trigger regeneration. Can function without it (just skip taxonomy sitemaps). |
| **SEO System** | Soft | `_seo_noindex` postMeta flag used to exclude URLs from sitemaps. `seo.robots_txt` setting provides robots.txt content. Can function without it (include all published content, use default robots.txt). |

### Depended On By

| System | Type | What They Need |
|--------|------|---------------|
| **SEO System** | Soft | SEO System's robots.txt includes `Sitemap:` directive pointing to sitemap URL. |
| **Dashboard System** | Soft | Dashboard may show sitemap status widget (URL count, last generated). |
| **Audit Log System** | Soft | Sitemap generation events recorded in audit log via `seo.sitemap_generated` event. |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| **Convex** | Database storage for cached sitemaps, scheduled regeneration functions, reactive queries |
| **Convex Auth** | Admin authentication for settings page and manual regeneration |
| **Google Ping API** | `https://www.google.com/ping?sitemap=` - Notify Google of sitemap updates |
| **Bing Ping API** | `https://www.bing.com/ping?sitemap=` - Notify Bing of sitemap updates |

---

## Implementation Checklist

### Backend (`ConvexPress-Admin/packages/backend/convex/`)

- [ ] `convex/schema.ts` - Add `sitemapCache`, `sitemapGenerationLog`, `sitemapPingLog` tables (3 tables)
- [ ] `convex/sitemaps/queries.ts` - 4 queries: `getIndex`, `getSubSitemap`, `getStatus`, `getRobotsContent`
- [ ] `convex/sitemaps/mutations.ts` - 2 mutations: `markStale`, `updateSettings`
- [ ] `convex/sitemaps/actions.ts` - 1 action: `generate` (main generation action)
- [ ] `convex/sitemaps/internals.ts` - 1 internal action: `regenerateStale` (debounced regeneration)
- [ ] `convex/sitemaps/subscribers.ts` - Event subscribers for `post.published`, `post.unpublished`, `post.updated`, `post.trashed`, `post.restored`, `post.deleted`, `page.published`, `page.unpublished`, `page.updated`, `page.trashed`, `page.deleted`, `taxonomy.created`, `taxonomy.updated`, `taxonomy.deleted`
- [ ] `convex/sitemaps/generators/postSitemap.ts` - Post sub-sitemap XML generator
- [ ] `convex/sitemaps/generators/pageSitemap.ts` - Page sub-sitemap XML generator
- [ ] `convex/sitemaps/generators/categorySitemap.ts` - Category sub-sitemap XML generator
- [ ] `convex/sitemaps/generators/tagSitemap.ts` - Tag sub-sitemap XML generator
- [ ] `convex/sitemaps/generators/authorSitemap.ts` - Author sub-sitemap XML generator
- [ ] `convex/sitemaps/generators/indexSitemap.ts` - Sitemap index XML generator
- [ ] `convex/sitemaps/helpers/xmlBuilder.ts` - XML generation utilities (escaping, formatting, W3C dates)
- [ ] `convex/sitemaps/helpers/contentHash.ts` - SHA-256 content hash computation
- [ ] `convex/sitemaps/helpers/ping.ts` - Search engine ping logic (Google, Bing)
- [ ] `convex/sitemaps/helpers/settings.ts` - Read sitemap settings from Settings System

### Admin Frontend (`ConvexPress-Admin/apps/web/src/`)

- [ ] `src/routes/admin/seo/sitemap.tsx` - Sitemap Settings page route
- [ ] `src/components/sitemaps/SitemapStatusCard.tsx` - Status overview card
- [ ] `src/components/sitemaps/SitemapSettingsForm.tsx` - Main settings form
- [ ] `src/components/sitemaps/SitemapContentTypeRow.tsx` - Per-type settings row
- [ ] `src/components/sitemaps/SitemapPingSettings.tsx` - Search engine ping config
- [ ] `src/components/sitemaps/SitemapAutoRegenSettings.tsx` - Auto-regeneration settings
- [ ] `src/components/sitemaps/SitemapGenerationLog.tsx` - Generation log table
- [ ] `src/components/sitemaps/SitemapRegenerateButton.tsx` - Regenerate button with loading state
- [ ] `src/hooks/sitemaps/useSitemapStatus.ts` - Hook wrapping `sitemaps.getStatus` query
- [ ] `src/hooks/sitemaps/useSitemapSettings.ts` - Hook wrapping `settings.getGroup("sitemap")`
- [ ] `src/hooks/sitemaps/useSitemapMutations.ts` - Hooks for `updateSettings` and `generate` actions
- [ ] `src/lib/sitemaps/types.ts` - TypeScript types for sitemap data
- [ ] `src/lib/sitemaps/constants.ts` - Changefreq options, priority defaults, validation rules

### Website Frontend (`ConvexPress-Website/app/`)

- [ ] `app/routes/sitemap.xml.ts` - Sitemap index API route
- [ ] `app/routes/sitemap-$type-$page.xml.ts` - Sub-sitemap API route (dynamic)
- [ ] `app/routes/robots.txt.ts` - Robots.txt API route (shared with SEO System)
- [ ] `app/routes/sitemap-style.xsl.ts` - XSL stylesheet for human-readable display

---

## Edge Cases & Gotchas

1. **Empty Sitemap:** No published posts, pages, or other content exist. Generate a minimal sitemap with just the homepage URL. Do not generate empty sub-sitemaps (skip types with 0 URLs). Sitemap index still generated with only the homepage sub-sitemap.

2. **Sitemap Disabled:** Admin disables sitemaps via toggle. Delete all `sitemapCache` records. `/sitemap.xml` returns 404. Remove `Sitemap:` directive from robots.txt. Bail early in event subscribers (do not mark stale or schedule regeneration).

3. **Rapid Content Changes (Bulk Operations):** Admin bulk-publishes 100 posts in quick succession. Each publish emits `post.published` event. Each event calls `sitemaps.markStale`. Debounce logic ensures only ONE regeneration fires 30s after the LAST change. The scheduled function ID is replaced each time, cancelling previous pending regeneration.

4. **Very Large Site (50,000+ URLs):** Sub-sitemaps paginate at `max_urls_per_sitemap`. At 1000/page with 50,000 posts = 50 sub-sitemaps. Generation queries MUST use indexes (`by_published`) for efficient traversal. Consider incremental regeneration in future (only regenerate the affected sub-sitemap page).

5. **Post With Noindex:** A published post with `_seo_noindex = "true"` in postMeta is excluded from the sitemap. If the noindex flag is later removed, regeneration includes the post. The SEO System should emit an event when noindex changes, or the Sitemap System checks on regeneration.

6. **Password-Protected Content:** Published pages/posts with a password set are excluded from sitemaps. These URLs should not be crawled by search engines.

7. **Slug Changes:** A published post's slug changes. Sitemap regenerates with the new URL. The old URL is no longer in the sitemap. Note: 301 redirects for old slugs are handled by the Routing System, NOT the Sitemap System.

8. **Search Engine Ping Failure:** Google or Bing ping endpoint returns an error or times out. Log the error to `sitemapPingLog`. Do NOT retry immediately (avoid spamming). Do NOT fail the overall sitemap generation (ping is non-critical). The next regeneration will attempt to ping again.

9. **Concurrent Regeneration:** Two regeneration actions triggered simultaneously. Use a Convex mutex pattern: check for an `_isRegenerating` flag before starting. If already regenerating, skip (the current regeneration will pick up all stale sitemaps). The debounce mechanism should prevent this in practice.

10. **First-Time Generation:** Site is new, no sitemaps have ever been generated. On first content publish, event subscriber triggers sitemap generation. If admin visits settings page before any content exists, show "No sitemap generated yet" status. The "Regenerate Now" button works even with no content (generates homepage-only sitemap).

11. **Convex String Size Limit:** Convex supports strings up to ~1MB. A sitemap with 1000 URLs is typically 50-100KB. Well within limits. For very large sites, sub-sitemap pagination keeps each cached XML within limits.

12. **CDN Cache Lag:** HTTP caching headers set `max-age=3600` (1 hour). After regeneration, CDN/browsers may serve stale sitemap for up to 1 hour. This is acceptable because search engine crawlers re-fetch on their own schedule and pings explicitly notify them. Do NOT set `no-cache` -- sitemap serving must remain fast.

13. **Settings Change Side Effects:** When `enabled` changes to `false`, delete all cached sitemaps. When content type inclusion changes, mark ALL sitemaps stale (not just the changed type, because the sitemap index references all types). When `max_urls_per_sitemap` changes, force full regeneration (pagination may change).

14. **XML Protocol Compliance:** All generated sitemaps MUST comply with sitemaps.org protocol: UTF-8 encoding, namespace `http://www.sitemaps.org/schemas/sitemap/0.9`, max 50,000 URLs per file, max 50MB per file, W3C Datetime format for `<lastmod>`, fully qualified absolute URLs.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `wp_sitemaps_get_server()` | `queries/sitemaps.getIndex` | Get the sitemap index content |
| `wp_get_sitemap_providers()` | `sitemapSettings.include_*` flags | Configuration-driven, not class-based registry |
| `wp_sitemaps_enabled` filter | `sitemapSettings.enabled` field | Boolean in settings table |
| `wp_sitemaps_max_urls` filter | `sitemapSettings.max_urls_per_sitemap` | Configurable number, default 1000 |
| `wp_sitemaps_posts_query_args` | Content filtering in generation query | Inline in generator, not hook-based |
| `wp_sitemaps_posts_entry` | URL entry construction in generator | Built in `postSitemap.ts` |
| `wp_sitemaps_index_entry` | Index entry construction in `indexSitemap.ts` | Built in index generator |
| `wp_sitemaps_post_types` | `sitemapSettings.include_posts/pages` | Per content type boolean |
| `wp_sitemaps_taxonomies` | `sitemapSettings.include_categories/tags` | Per taxonomy boolean |
| `do_robots` action | `queries/sitemaps.getRobotsContent` | Returns robots.txt content string |
| `robots_txt` filter | `seo.robots_txt` setting | Stored in Settings System |
| `wp_ping()` | `sitemaps/helpers/ping.ts` | Pings Google and Bing after regeneration |
| `WP_Sitemaps_Renderer` | `sitemaps/helpers/xmlBuilder.ts` | XML generation utility functions |
| `WP_Sitemaps_Stylesheet` | `/sitemap-style.xsl` route | XSL stylesheet for human-readable display |
| `WP_Sitemaps_Posts` | `sitemaps/generators/postSitemap.ts` | Post sub-sitemap generator |
| `WP_Sitemaps_Taxonomies` | `sitemaps/generators/categorySitemap.ts` + `tagSitemap.ts` | Taxonomy sub-sitemap generators |
| `WP_Sitemaps_Users` | `sitemaps/generators/authorSitemap.ts` | Author sub-sitemap generator |
| `publish_post` / `transition_post_status` | `post.published`, `post.unpublished` events | Content change events via Event Dispatcher |

---

## Shared Types

```typescript
// Shared types (via backend package)

export type SitemapType = "index" | "posts" | "pages" | "categories" | "tags" | "authors";

export type SitemapChangefreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export type SitemapTrigger = "content_change" | "manual" | "scheduled" | "settings_change";

export interface SitemapCacheEntry {
  _id: Id<"sitemapCache">;
  type: SitemapType;
  page: number;
  xml: string;
  urlCount: number;
  generatedAt: number;
  generationDurationMs: number;
  contentHash: string;
  isStale: boolean;
}

export interface SitemapStatus {
  enabled: boolean;
  indexUrl: string | null;
  totalUrls: number;
  perType: Record<SitemapType, { urlCount: number; pages: number; lastGenerated: number | null }>;
  lastGenerated: number | null;
  hasStale: boolean;
  [redacted-airtable-record-id]: SitemapGenerationLogEntry[];
  recentPings: SitemapPingLogEntry[];
}

export interface SitemapGenerationLogEntry {
  _id: Id<"sitemapGenerationLog">;
  triggeredBy: SitemapTrigger;
  triggeredByUserId?: string;
  triggeredByEvent?: string;
  status: "success" | "error";
  sitemapsGenerated: number;
  totalUrls: number;
  durationMs: number;
  errorMessage?: string;
  createdAt: number;
}

export interface SitemapPingLogEntry {
  _id: Id<"sitemapPingLog">;
  engine: "google" | "bing";
  url: string;
  status: "success" | "error";
  httpStatus?: number;
  errorMessage?: string;
  createdAt: number;
}

export interface SitemapUrlEntry {
  loc: string;                   // Full URL
  lastmod: string;               // W3C Datetime (ISO 8601)
  changefreq: SitemapChangefreq;
  priority: number;              // 0.0 - 1.0
}
```

---

## Caching Strategy

### Three-Layer Caching

1. **Convex Cache (Primary):** Pre-generated XML stored in `sitemapCache` table. Source of truth. Generated on content changes with debouncing.

2. **HTTP Cache (CDN/Browser):** API routes set `Cache-Control: public, max-age=3600` (1 hour for sitemaps, 24 hours for robots.txt). After regeneration, CDN/browsers may serve stale content for up to the cache duration. Acceptable because crawlers re-fetch on their own schedule and pings notify them of updates.

3. **Content Hash (Change Detection):** SHA-256 hash of source data (e.g., sorted list of `postId:updatedAt` pairs). Before regenerating, compute current hash and compare to cached hash. If identical, skip regeneration. Prevents unnecessary work when events fire but no URL-affecting changes occurred.

### Cache Invalidation Flow

```
Content Change Event (e.g., post.published)
  -> Event Subscriber: sitemaps.markStale({ types: ["posts", "index"] })
    -> Sets isStale = true on affected sitemapCache records
    -> Schedules debounced regeneration (30s default)
      -> After debounce: sitemaps.regenerateStale()
        -> For each stale type: compute contentHash, compare, regenerate if different
        -> Clear isStale flags
        -> Ping search engines
        -> Emit seo.sitemap_generated event
```

---

## Performance Considerations

1. **Query Efficiency:** Post sitemap generation uses `by_published` index. Page sitemap uses similar index. Noindex check uses `by_post_key` index on `postMeta`. Taxonomy sitemaps use pre-computed post counts.

2. **Generation Time Target:** < 5 seconds for sites with up to 10,000 URLs. For larger sites, generation runs as a Convex action (longer timeouts). Can be split into multiple internal mutations (one per sub-sitemap type).

3. **Serving Performance:** O(1) -- single Convex query returning cached XML string. No computation at serve time.

4. **Storage:** Each sub-sitemap ~50-100KB (at 1000 URLs). 5 content types with 1 page each = ~250-500KB. Large site with 100 sub-sitemaps = ~5-10MB. Negligible for Convex storage.

5. **Debouncing:** 30-second default dramatically reduces regeneration frequency during bulk operations. Configurable 5s to 5min.
