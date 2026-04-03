# Analytics System - Product Requirements Document

**System:** Analytics System
**Priority:** P1 - High
**WordPress Equivalent:** None (closest: Jetpack Stats / Site Stats)
**Author:** Analytics System Expert
**Created:** 2026-04-01

---

## 1. Overview

### 1.1 Purpose

The Analytics System provides built-in, privacy-friendly page analytics for every ConvexPress site. Every site gets per-page metrics from day one -- no external analytics services, no third-party scripts, no GDPR cookie consent walls. It tracks pageviews, scroll depth (mapped to structured content sections), internal link clicks, time on page, referrers, devices, and geography natively within the Convex database.

### 1.2 WordPress Equivalent

WordPress has no built-in analytics. The closest equivalents are:
- **Jetpack Stats** -- Plugin that sends data to WordPress.com servers for processing
- **Google Analytics plugins** -- Third-party scripts injected into the frontend

ConvexPress differs fundamentally: analytics are **first-party**, **privacy-friendly**, and **real-time**. No data leaves the site. No external dependencies. No cookie consent required (no tracking cookies -- only anonymous session IDs).

### 1.3 Goals

1. **Zero-config analytics** -- Every ConvexPress site has working analytics immediately after deployment
2. **Privacy by design** -- No PII, no fingerprinting, no cross-site tracking. Anonymous visitor IDs only
3. **Section-level engagement** -- Map scroll depth to structured content sections (hero, topic 1-5, summary, sources) rather than raw percentage
4. **Lightweight tracking** -- ~2KB tracking script, minimal performance impact
5. **Real-time dashboard data** -- Live Convex subscriptions for admin analytics views
6. **Efficient storage** -- Raw events TTL'd at 90 days, daily rollups kept indefinitely

### 1.4 Non-Goals

- Full-funnel conversion tracking (e-commerce, goal funnels)
- User-level tracking (individual user journeys, cohort analysis)
- A/B testing or experimentation framework
- Heatmap or session recording
- Cross-domain tracking
- Real-time visitor count ("X people viewing this page now")

---

## 2. Architecture

### 2.1 Two-Layer Data Model

The system uses a two-layer approach to balance granularity with storage efficiency:

| Layer | Table | Retention | Purpose |
|-------|-------|-----------|---------|
| **Raw Events** | `pageEvents` | 90 days (TTL purge) | Granular event log for recent detailed analysis |
| **Daily Rollups** | `pageAnalyticsDaily` | Indefinite | Aggregated daily metrics for long-term trends |

### 2.2 Data Flow

```
Visitor loads page on ConvexPress Website
  |
  v
Tracking script (~2KB) initializes
  - Generates anonymous visitorId (localStorage, no cookie)
  - Generates sessionId (sessionStorage)
  - Fires "pageview" event immediately
  |
  v
User interacts with page
  - Scroll depth tracked via IntersectionObserver (mapped to content sections)
  - Internal link clicks captured via delegated click handler
  - Time on page tracked via periodic heartbeat + visibilitychange
  |
  v
Events batched and sent to /api/analytics/track (Convex HTTP action)
  - POST with JSON payload
  - No auth required (public endpoint)
  - Rate-limited per IP (100 events/minute)
  |
  v
Convex HTTP action validates and writes to pageEvents table
  - Validates event shape
  - Normalizes referrer, user agent, path
  - Writes raw event document
  |
  v
Daily scheduled job (cron) runs at 00:05 UTC
  - Aggregates previous day's pageEvents into pageAnalyticsDaily rollups
  - Groups by: path, referrerDomain, deviceType, country
  |
  v
Purge scheduled job (cron) runs at 01:00 UTC
  - Deletes pageEvents older than 90 days
  |
  v
Admin queries pageAnalyticsDaily for dashboards and reports
  - getTrafficSummary(path, dateRange)
  - getEngagementSummary(path, dateRange)
  - getTabBadges(postId)
```

### 2.3 Tracking Script

A lightweight (~2KB minified + gzipped) JavaScript snippet injected into the website frontend. It runs on every public page.

**Responsibilities:**
- Generate and persist anonymous `visitorId` in `localStorage` (UUID v4, no PII)
- Generate per-session `sessionId` in `sessionStorage`
- Fire `pageview` event on page load (or SPA navigation)
- Track scroll depth via `IntersectionObserver` on content section sentinel elements
- Track internal link clicks via delegated `click` event listener on `<a>` tags
- Track time on page via `visibilitychange` + `beforeunload` events
- Batch events and flush via `navigator.sendBeacon` or `fetch` POST to `/api/analytics/track`
- Respect `Do Not Track` header (`navigator.doNotTrack`)

**What the script does NOT do:**
- Set any cookies
- Collect IP addresses (the HTTP action does not store client IP)
- Fingerprint browsers
- Track across domains
- Load any external resources

### 2.4 Section-Level Scroll Depth

Instead of tracking raw scroll percentage (meaningless -- 50% scroll on a short page vs. a long page are incomparable), the system maps scroll depth to structured content sections.

ConvexPress content pages follow a predictable section structure:

| Section ID | Label | Description |
|-----------|-------|-------------|
| `hero` | Hero | Title, featured image, excerpt |
| `topic-1` through `topic-5` | Topic 1-5 | Main content sections/headings |
| `summary` | Summary | Conclusion or summary section |
| `sources` | Sources | References, citations, related links |
| `comments` | Comments | Comment section |

The tracking script uses `IntersectionObserver` to detect when each section scrolls into view (50% intersection threshold). A `scroll_depth` event is fired with the deepest section reached.

**Benefits over raw percentage:**
- "72% of readers reached Topic 3" is actionable
- "72% scrolled to 45% of the page" is not
- Section-level data enables per-section engagement analysis

### 2.5 Privacy Design

| Concern | Approach |
|---------|----------|
| **Visitor identity** | Anonymous UUID stored in `localStorage`. No PII. Can be cleared by user at any time. |
| **Session identity** | Random ID in `sessionStorage`. Dies when tab closes. |
| **IP address** | Not stored. The HTTP action receives the IP but discards it after optional geo-lookup. |
| **Cookies** | None. Zero cookies set by analytics. |
| **Do Not Track** | Respected. If `navigator.doNotTrack === "1"`, no events are sent. |
| **GDPR** | No consent required -- no PII collected, no cross-site tracking, no cookies. |
| **Data retention** | Raw events purged after 90 days. Only aggregated, anonymous rollups remain. |
| **User agent** | Parsed to `deviceType` (desktop/mobile/tablet) and `browser` family. Raw UA string not stored. |

---

## 3. Data Model

### 3.1 pageEvents Table (Raw Events)

Stores individual tracking events. TTL'd at 90 days via a purge cron job.

```typescript
pageEvents: defineTable({
  // Event identification
  eventType: v.union(
    v.literal("pageview"),
    v.literal("scroll_depth"),
    v.literal("click"),
    v.literal("exit")
  ),
  timestamp: v.number(), // Unix ms

  // Page context
  path: v.string(),            // e.g., "/blog/my-post-slug"
  postId: v.optional(v.id("posts")), // Linked post if applicable

  // Visitor context (anonymous)
  visitorId: v.string(),       // Anonymous UUID from localStorage
  sessionId: v.string(),       // Session UUID from sessionStorage

  // Traffic source
  referrer: v.optional(v.string()),         // Full referrer URL (first pageview only)
  referrerDomain: v.optional(v.string()),   // Extracted domain (e.g., "google.com")
  utmSource: v.optional(v.string()),
  utmMedium: v.optional(v.string()),
  utmCampaign: v.optional(v.string()),

  // Device context
  deviceType: v.union(
    v.literal("desktop"),
    v.literal("mobile"),
    v.literal("tablet")
  ),
  browser: v.string(),         // e.g., "Chrome", "Safari", "Firefox"
  os: v.string(),              // e.g., "Windows", "macOS", "iOS", "Android"

  // Geography (derived from IP at ingest time, IP not stored)
  country: v.optional(v.string()),   // ISO 3166-1 alpha-2 (e.g., "US", "GB")
  region: v.optional(v.string()),    // State/province (e.g., "California")

  // Event-specific payload
  payload: v.optional(v.object({
    // scroll_depth: deepest section reached
    section: v.optional(v.string()),         // e.g., "topic-3"
    sectionIndex: v.optional(v.number()),    // e.g., 4 (0-indexed)
    maxSections: v.optional(v.number()),     // Total sections on page

    // click: link destination
    targetPath: v.optional(v.string()),      // Internal link path clicked
    targetLabel: v.optional(v.string()),     // Link text or aria-label

    // exit: time spent
    timeOnPageMs: v.optional(v.number()),    // Milliseconds on page
    engagedTimeMs: v.optional(v.number()),   // Milliseconds with page visible
  })),
})
  .index("by_path_timestamp", ["path", "timestamp"])
  .index("by_postId_timestamp", ["postId", "timestamp"])
  .index("by_eventType_timestamp", ["eventType", "timestamp"])
  .index("by_timestamp", ["timestamp"])
  .index("by_session", ["sessionId", "timestamp"]),
```

### 3.2 pageAnalyticsDaily Table (Rollups)

Aggregated daily metrics. One document per unique combination of `(date, path, referrerDomain, deviceType, country)`. Kept indefinitely.

```typescript
pageAnalyticsDaily: defineTable({
  // Aggregation key
  date: v.string(),                 // ISO date "2026-04-01"
  path: v.string(),                 // Page path
  postId: v.optional(v.id("posts")),

  // Dimensions (each unique combo = one row)
  referrerDomain: v.optional(v.string()),  // null = direct traffic
  deviceType: v.union(
    v.literal("desktop"),
    v.literal("mobile"),
    v.literal("tablet")
  ),
  country: v.optional(v.string()),

  // Metrics
  pageviews: v.number(),
  uniqueVisitors: v.number(),       // Distinct visitorId count
  sessions: v.number(),             // Distinct sessionId count

  // Engagement metrics
  avgTimeOnPageMs: v.number(),      // Average time on page
  avgEngagedTimeMs: v.number(),     // Average engaged (visible) time
  bounceRate: v.number(),           // % of sessions with only one pageview (0-1)

  // Scroll depth distribution (% of pageviews reaching each section)
  scrollDepth: v.object({
    hero: v.number(),               // Always 1.0 (100% see the top)
    topic1: v.number(),
    topic2: v.number(),
    topic3: v.number(),
    topic4: v.number(),
    topic5: v.number(),
    summary: v.number(),
    sources: v.number(),
    comments: v.number(),
  }),

  // Click metrics
  internalClicks: v.number(),       // Total internal link clicks
  topClickTargets: v.array(v.object({
    targetPath: v.string(),
    count: v.number(),
  })),
})
  .index("by_date_path", ["date", "path"])
  .index("by_postId_date", ["postId", "date"])
  .index("by_date", ["date"])
  .index("by_path_date", ["path", "date"]),
```

### 3.3 Indexes Summary

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `pageEvents` | `by_path_timestamp` | `["path", "timestamp"]` | Query events for a specific page in time range |
| `pageEvents` | `by_postId_timestamp` | `["postId", "timestamp"]` | Query events linked to a specific post |
| `pageEvents` | `by_eventType_timestamp` | `["eventType", "timestamp"]` | Query all events of a type (for rollups) |
| `pageEvents` | `by_timestamp` | `["timestamp"]` | Purge job: find events older than 90 days |
| `pageEvents` | `by_session` | `["sessionId", "timestamp"]` | Reconstruct a single session's events |
| `pageAnalyticsDaily` | `by_date_path` | `["date", "path"]` | Get all rollups for a page on a date |
| `pageAnalyticsDaily` | `by_postId_date` | `["postId", "date"]` | Get rollups for a post over a date range |
| `pageAnalyticsDaily` | `by_date` | `["date"]` | Get all rollups for a date (site-wide) |
| `pageAnalyticsDaily` | `by_path_date` | `["path", "date"]` | Get rollups for a path over date range |

---

## 4. Tracking Endpoint

### 4.1 HTTP Action: `/api/analytics/track`

A Convex HTTP action (not a mutation -- no auth required) that accepts tracking events from the website frontend.

**Method:** POST
**Content-Type:** application/json
**Auth:** None (public endpoint)
**Rate Limit:** 100 events per IP per minute (enforced via in-memory rate limiter or Convex rate limiting)

**Request Body:**
```json
{
  "events": [
    {
      "eventType": "pageview",
      "path": "/blog/my-post",
      "visitorId": "a1b2c3d4-...",
      "sessionId": "e5f6g7h8-...",
      "timestamp": 1711929600000,
      "referrer": "https://google.com/search?q=...",
      "userAgent": "Mozilla/5.0 ...",
      "payload": {}
    }
  ]
}
```

**Response:**
- `200 OK` with `{ "accepted": 3 }` on success
- `400 Bad Request` if payload validation fails
- `429 Too Many Requests` if rate limited

**Processing:**
1. Validate event array (max 20 events per request)
2. For each event:
   a. Parse `userAgent` into `deviceType`, `browser`, `os` (server-side, UA string not stored)
   b. Extract `referrerDomain` from `referrer` URL
   c. Optionally resolve geo from IP (country, region) -- IP itself is discarded
   d. Resolve `postId` from `path` if path matches a known post slug
   e. Write validated event to `pageEvents`
3. Return count of accepted events

### 4.2 Geo Resolution

Geography is determined at ingest time from the client IP address. The IP address itself is **never stored** in the database.

Options for geo resolution:
- **Convex edge function** with IP-to-country lookup (lightweight MaxMind GeoLite2 database or Cloudflare headers)
- **Deferred** -- If geo is not available at launch, the `country` and `region` fields are left `undefined` and can be added later without schema changes

---

## 5. Scheduled Jobs

### 5.1 Daily Rollup Job

**Schedule:** Every day at 00:05 UTC
**Function:** `analytics/internals.rollupDailyAnalytics`

1. Query all `pageEvents` from the previous calendar day (UTC)
2. Group by `(path, referrerDomain, deviceType, country)`
3. For each group, compute:
   - `pageviews`: count of `eventType === "pageview"`
   - `uniqueVisitors`: distinct `visitorId` count
   - `sessions`: distinct `sessionId` count
   - `avgTimeOnPageMs`: mean of `payload.timeOnPageMs` from exit events
   - `avgEngagedTimeMs`: mean of `payload.engagedTimeMs` from exit events
   - `bounceRate`: sessions with exactly 1 pageview / total sessions
   - `scrollDepth`: for each section, % of pageviews with `scroll_depth` event reaching that section
   - `internalClicks`: count of `eventType === "click"`
   - `topClickTargets`: top 10 click targets by count
4. Upsert into `pageAnalyticsDaily` (create or update if rollup already exists for that key)
5. Log completion with event count processed

### 5.2 Purge Job

**Schedule:** Every day at 01:00 UTC
**Function:** `analytics/internals.purgeExpiredEvents`

1. Query `pageEvents` where `timestamp < (now - 90 days)` using `by_timestamp` index
2. Delete in batches of 1000 (Convex mutation limits)
3. If more remain, schedule self again immediately
4. Log count of purged events

---

## 6. Convex Functions

### 6.1 Queries (Admin Dashboard)

#### `analytics/queries.getTrafficSummary`

- **Auth:** `analytics.view` capability required (Editor+)
- **Args:** `{ path?: string, postId?: Id<"posts">, startDate: string, endDate: string }`
- **Returns:**
  ```typescript
  {
    totalPageviews: number;
    totalUniqueVisitors: number;
    totalSessions: number;
    avgBounceRate: number;
    dailyBreakdown: Array<{
      date: string;
      pageviews: number;
      uniqueVisitors: number;
    }>;
    topReferrers: Array<{ domain: string; pageviews: number }>;
    deviceBreakdown: { desktop: number; mobile: number; tablet: number };
    topCountries: Array<{ country: string; pageviews: number }>;
  }
  ```

#### `analytics/queries.getEngagementSummary`

- **Auth:** `analytics.view` capability required (Editor+)
- **Args:** `{ path?: string, postId?: Id<"posts">, startDate: string, endDate: string }`
- **Returns:**
  ```typescript
  {
    avgTimeOnPage: number;        // ms
    avgEngagedTime: number;       // ms
    scrollDepthDistribution: {
      hero: number;
      topic1: number;
      topic2: number;
      topic3: number;
      topic4: number;
      topic5: number;
      summary: number;
      sources: number;
      comments: number;
    };
    topInternalLinks: Array<{ targetPath: string; clicks: number }>;
    totalInternalClicks: number;
  }
  ```

#### `analytics/queries.getTabBadges`

- **Auth:** `analytics.view` capability required (Editor+)
- **Args:** `{ postId: Id<"posts"> }`
- **Returns:**
  ```typescript
  {
    views7d: number;       // Pageviews in last 7 days
    views30d: number;      // Pageviews in last 30 days
    avgTimeOnPage: number; // Average time on page in last 30 days (ms)
    topSection: string;    // Deepest section most visitors reach
  }
  ```
- **Purpose:** Provides compact metrics for the post editor's Analytics tab badge

#### `analytics/queries.getSiteOverview`

- **Auth:** `analytics.view` capability required (Editor+)
- **Args:** `{ startDate: string, endDate: string }`
- **Returns:**
  ```typescript
  {
    totalPageviews: number;
    totalUniqueVisitors: number;
    totalSessions: number;
    avgBounceRate: number;
    topPages: Array<{ path: string; postId?: Id<"posts">; title?: string; pageviews: number }>;
    dailyTrend: Array<{ date: string; pageviews: number; uniqueVisitors: number }>;
  }
  ```
- **Purpose:** Site-wide analytics overview for the admin Analytics page

### 6.2 Mutations

#### `analytics/mutations.purgeAnalytics`

- **Auth:** `analytics.manage` capability required (Administrator only)
- **Args:** `{ scope: "all" | "before_date", beforeDate?: string }`
- **Returns:** `{ deletedEvents: number, deletedRollups: number }`
- **Purpose:** Manual purge of analytics data. Destructive action with confirmation dialog.

#### `analytics/mutations.updateSettings`

- **Auth:** `analytics.manage` capability required (Administrator only)
- **Args:** `{ trackingEnabled?: boolean, respectDoNotTrack?: boolean, retentionDays?: number }`
- **Returns:** `void`
- **Purpose:** Update analytics settings (enable/disable tracking, retention period)

### 6.3 Internal Functions

#### `analytics/internals.ingestEvents`

- **Type:** internalMutation
- **Args:** `{ events: array of validated event objects }`
- **Purpose:** Called by the HTTP action after validation. Writes events to `pageEvents`.

#### `analytics/internals.rollupDailyAnalytics`

- **Type:** internalMutation (scheduled via cron)
- **Args:** `{ date?: string }` (defaults to yesterday)
- **Purpose:** Aggregates raw events into daily rollups

#### `analytics/internals.purgeExpiredEvents`

- **Type:** internalMutation (scheduled via cron)
- **Args:** `{ batchSize?: number }` (defaults to 1000)
- **Purpose:** Deletes `pageEvents` older than retention period

#### `analytics/internals.resolvePostFromPath`

- **Type:** internalQuery
- **Args:** `{ path: string }`
- **Purpose:** Looks up a post by its slug/path to link `pageEvents` to `postId`

### 6.4 HTTP Action

#### `analytics/http.track`

- **Type:** httpAction
- **Route:** POST `/api/analytics/track`
- **Auth:** None (public)
- **Purpose:** Receives batched events from the tracking script, validates, normalizes, and calls `ingestEvents`

---

## 7. Capabilities

| Capability | Roles | Description |
|-----------|-------|-------------|
| `analytics.view` | Administrator, Editor | View analytics dashboards and per-post metrics |
| `analytics.manage` | Administrator | Purge data, update analytics settings, manage retention |

**Role access:**
| Role | `analytics.view` | `analytics.manage` |
|------|-------------------|---------------------|
| Administrator | Yes | Yes |
| Editor | Yes | No |
| Author | No | No |
| Contributor | No | No |
| Subscriber | No | No |

---

## 8. Admin UI Integration

### 8.1 Analytics Page (`/admin/analytics`)

A dedicated admin page accessible from the sidebar (under a top-level "Analytics" menu item, visible to Editor+ roles).

**Layout:**
- Date range picker (7d, 30d, 90d, custom)
- Site Overview cards: Total Pageviews, Unique Visitors, Sessions, Avg Bounce Rate
- Daily trend line chart
- Top Pages table
- Top Referrers table
- Device breakdown pie/donut chart
- Top Countries table

### 8.2 Post Editor Analytics Tab

On the post edit screen, an "Analytics" tab in the post editor tab bar shows per-post metrics:

- Tab badge: `views7d` count (from `getTabBadges`)
- Traffic summary for this post (pageviews, visitors, referrers)
- Engagement summary (scroll depth chart, time on page, internal clicks)
- Date range selector

### 8.3 List Table Column

The All Posts list table includes an optional "Views" column showing 30-day pageview count, sortable.

---

## 9. Website Integration

### 9.1 Tracking Script Injection

The tracking script is injected into the website frontend layout component. It loads asynchronously and does not block rendering.

**Implementation options:**
- Inline `<script>` in the document head (smallest payload)
- Separate `.js` file loaded with `async` attribute
- React component that initializes tracking on mount

### 9.2 Section Sentinel Elements

Content pages render invisible sentinel `<div>` elements at the start of each content section with `data-analytics-section="topic-1"` attributes. The tracking script's `IntersectionObserver` watches these sentinels.

---

## 10. Events Emitted

| Event | Trigger | Payload |
|-------|---------|---------|
| `analytics.rollup_completed` | Daily rollup job finishes | `{ date, eventsProcessed, rollupsCreated }` |
| `analytics.purge_completed` | Purge job finishes | `{ eventsDeleted, cutoffDate }` |
| `analytics.settings_updated` | Admin updates analytics settings | `{ changes, updatedBy }` |
| `analytics.data_purged` | Admin manually purges analytics | `{ scope, deletedEvents, deletedRollups, purgedBy }` |

---

## 11. Settings

Analytics settings are stored in the global `settings` table (Settings System):

| Setting Key | Type | Default | Description |
|------------|------|---------|-------------|
| `analytics_tracking_enabled` | boolean | `true` | Master switch for tracking |
| `analytics_respect_dnt` | boolean | `true` | Respect Do Not Track header |
| `analytics_retention_days` | number | `90` | Days to keep raw events |
| `analytics_geo_enabled` | boolean | `false` | Enable IP-to-country geo resolution |

---

## 12. Dependencies

### Systems This System Depends On

| System | Dependency |
|--------|-----------|
| **Post System** | Resolving `path` to `postId`, post titles for display |
| **Settings System** | Storing/reading analytics configuration |
| **Role & Capability System** | `analytics.view` and `analytics.manage` capability checks |
| **Event Dispatcher System** | Emitting analytics events (rollup completed, purge completed) |
| **Routing System** | Understanding URL path structure for path-to-post resolution |

### Systems That Depend On This System

| System | Dependency |
|--------|-----------|
| **Dashboard System** | `ContentPerformanceWidget` reads analytics data for top posts by views |
| **Post System** | Post editor Analytics tab, list table Views column |
| **SEO System** | May consume pageview data for SEO recommendations |

---

## 13. Implementation Phases

### Phase 1: Schema + Backend Core
- `convex/schema/analytics.ts` (pageEvents, pageAnalyticsDaily tables)
- `convex/analytics/internals.ts` (ingestEvents, rollupDailyAnalytics, purgeExpiredEvents, resolvePostFromPath)
- `convex/analytics/http.ts` (track HTTP action)
- `convex/analytics/queries.ts` (getTrafficSummary, getEngagementSummary, getTabBadges, getSiteOverview)
- `convex/analytics/mutations.ts` (purgeAnalytics, updateSettings)
- Register cron jobs in `convex/crons.ts`

### Phase 2: Tracking Script + Website Integration
- Tracking script implementation (~2KB)
- Section sentinel components
- Script injection into website layout
- DNT respect, sendBeacon fallback

### Phase 3: Admin Analytics Page
- Route: `/admin/analytics`
- Site overview dashboard with charts and tables
- Date range picker
- Sidebar menu item

### Phase 4: Post Editor Integration
- Analytics tab in post editor tab bar
- Per-post traffic and engagement summaries
- Tab badge with 7-day view count

### Phase 5: List Table Integration
- Views column in All Posts list table
- Sortable by 30-day pageview count

---

## 14. Open Questions

1. **Geo resolution strategy:** Use Cloudflare headers (if deployed behind CF), MaxMind GeoLite2 database, or defer geo entirely for v1?
2. **Bot filtering:** Should the tracking endpoint filter known bot user agents, or should this be handled at the rollup stage?
3. **Content Performance Widget backfill:** The Dashboard System's `ContentPerformanceWidget` currently shows "Coming soon". When Analytics launches, it should read from `getTabBadges` or a similar query.
4. **Convex rate limiting:** Use Convex's built-in rate limiting for the HTTP action, or implement a custom in-memory rate limiter?
