# Analytics System - Expert Knowledge Document

**System:** Analytics System
**Status:** Not Started (0%)
**Priority:** P1 - High
**WordPress Equivalent:** None (closest: Jetpack Stats)
**Last Analyzed:** 2026-04-01
**Airtable System ID:** N/A (pending registration)

---

## Quick Reference

### What This System Does

The Analytics System provides built-in, privacy-friendly page analytics for every ConvexPress site. It tracks pageviews, scroll depth (mapped to structured content sections), internal link clicks, time on page, referrers, devices, and geography natively -- no external analytics service required. Raw events are stored for 90 days, then rolled up into daily aggregates kept indefinitely. All admin-facing analytics data is served via real-time Convex subscriptions.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **pageEvents** | Raw event log table with 90-day TTL. Stores individual pageview, scroll_depth, click, and exit events. |
| **pageAnalyticsDaily** | Rollup table with indefinite retention. One row per unique `(date, path, referrerDomain, deviceType, country)` combination. |
| **Tracking Script** | ~2KB JavaScript snippet injected on the website frontend. Fires events to `/api/analytics/track`. |
| **Section-Level Scroll Depth** | Maps scroll position to structured content sections (hero, topic 1-5, summary, sources) via `IntersectionObserver` on sentinel elements. |
| **Anonymous Visitor ID** | UUID in `localStorage`. No PII, no cookies, no fingerprinting. |
| **Session ID** | UUID in `sessionStorage`. Dies when tab closes. |
| **Daily Rollup Job** | Cron at 00:05 UTC. Aggregates yesterday's raw events into `pageAnalyticsDaily`. |
| **Purge Job** | Cron at 01:00 UTC. Deletes `pageEvents` older than retention period (default 90 days). |
| **Traffic Summary** | Query returning pageviews, visitors, sessions, referrers, devices, countries for a path/date range. |
| **Engagement Summary** | Query returning time on page, scroll depth distribution, internal clicks for a path/date range. |
| **Tab Badges** | Compact metrics (7d views, 30d views, avg time, top section) for the post editor Analytics tab badge. |

### ConvexPress vs WordPress

| Aspect | WordPress (Jetpack Stats) | ConvexPress |
|--------|--------------------------|-------------|
| **Data location** | Sent to WordPress.com servers | First-party, stays in Convex database |
| **Privacy** | Requires cookie consent in EU | No cookies, no PII, no consent needed |
| **Tracking script** | Jetpack tracking pixel + JS (~15KB) | ~2KB inline script |
| **Scroll depth** | Not tracked | Section-level engagement via IntersectionObserver |
| **Real-time** | Stats update with ~15 min delay | Real-time via Convex subscriptions |
| **Storage** | WordPress.com cloud | Two-layer: raw events (90d TTL) + daily rollups (indefinite) |
| **Geo** | IP-based via WordPress.com | Optional IP-to-country at ingest, IP discarded |
| **Configuration** | Plugin settings page | Settings System integration |
| **Capabilities** | `view_stats` (Jetpack) | `analytics.view` (Editor+), `analytics.manage` (Admin) |

---

## Architecture Overview

### Data Flow

```
Visitor loads page on ConvexPress Website
  |
  v
Tracking script (~2KB) initializes
  - Reads/creates anonymous visitorId (localStorage)
  - Creates sessionId (sessionStorage)
  - Fires "pageview" event
  |
  v
User interacts with page
  - IntersectionObserver tracks section scroll depth
  - Delegated click handler captures internal link clicks
  - visibilitychange + beforeunload track time on page
  |
  v
Events batched and POSTed to /api/analytics/track (Convex HTTP action)
  - Max 20 events per request
  - navigator.sendBeacon for exit events
  |
  v
HTTP action validates, normalizes (UA -> device/browser/os, referrer -> domain), writes to pageEvents
  |
  v
Daily cron (00:05 UTC): rollupDailyAnalytics
  - Aggregates yesterday's pageEvents -> pageAnalyticsDaily
  |
  v
Daily cron (01:00 UTC): purgeExpiredEvents
  - Deletes pageEvents older than 90 days (batched)
  |
  v
Admin queries read from pageAnalyticsDaily for dashboards
  - getTrafficSummary, getEngagementSummary, getTabBadges, getSiteOverview
```

### Real-Time Behavior

Analytics queries subscribe to `pageAnalyticsDaily` rollups, which update once daily. For near-real-time "today's stats," queries can also read from `pageEvents` for the current day and merge with rollups.

Key subscriptions:
- `analytics/queries.getTrafficSummary` -- Reactively returns traffic metrics for a page or site-wide
- `analytics/queries.getEngagementSummary` -- Reactively returns engagement metrics
- `analytics/queries.getTabBadges` -- Reactively returns compact badge metrics for post editor
- `analytics/queries.getSiteOverview` -- Reactively returns site-wide overview

### Authentication & Authorization

- **Tracking endpoint** (`/api/analytics/track`): No auth required. Public HTTP action. Rate-limited per IP.
- **Admin queries**: Require `analytics.view` capability (Editor+). Checked via `requireCan(ctx, "analytics.view")`.
- **Admin mutations** (purge, settings): Require `analytics.manage` capability (Administrator only). Checked via `requireCan(ctx, "analytics.manage")`.
- **Zero unauthorized data**: If a user lacks `analytics.view`, queries return `null`.

---

## Database Schema

### pageEvents Table

Raw event log. TTL'd at 90 days via purge cron job.

```typescript
// convex/schema/analytics.ts

pageEvents: defineTable({
  // Event identification
  eventType: v.union(
    v.literal("pageview"),
    v.literal("scroll_depth"),
    v.literal("click"),
    v.literal("exit")
  ),
  timestamp: v.number(),

  // Page context
  path: v.string(),
  postId: v.optional(v.id("posts")),

  // Visitor context (anonymous)
  visitorId: v.string(),
  sessionId: v.string(),

  // Traffic source
  referrer: v.optional(v.string()),
  referrerDomain: v.optional(v.string()),
  utmSource: v.optional(v.string()),
  utmMedium: v.optional(v.string()),
  utmCampaign: v.optional(v.string()),

  // Device context (parsed from user agent, raw UA not stored)
  deviceType: v.union(v.literal("desktop"), v.literal("mobile"), v.literal("tablet")),
  browser: v.string(),
  os: v.string(),

  // Geography (resolved from IP at ingest, IP not stored)
  country: v.optional(v.string()),
  region: v.optional(v.string()),

  // Event-specific payload
  payload: v.optional(v.object({
    section: v.optional(v.string()),
    sectionIndex: v.optional(v.number()),
    maxSections: v.optional(v.number()),
    targetPath: v.optional(v.string()),
    targetLabel: v.optional(v.string()),
    timeOnPageMs: v.optional(v.number()),
    engagedTimeMs: v.optional(v.number()),
  })),
})
  .index("by_path_timestamp", ["path", "timestamp"])
  .index("by_postId_timestamp", ["postId", "timestamp"])
  .index("by_eventType_timestamp", ["eventType", "timestamp"])
  .index("by_timestamp", ["timestamp"])
  .index("by_session", ["sessionId", "timestamp"]),
```

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `eventType` | `v.union("pageview", "scroll_depth", "click", "exit")` | Yes | Type of tracking event |
| `timestamp` | `v.number()` | Yes | Unix milliseconds when event occurred |
| `path` | `v.string()` | Yes | Page path (e.g., "/blog/my-post") |
| `postId` | `v.optional(v.id("posts"))` | No | Linked post ID if path resolves to a known post |
| `visitorId` | `v.string()` | Yes | Anonymous UUID from localStorage |
| `sessionId` | `v.string()` | Yes | Session UUID from sessionStorage |
| `referrer` | `v.optional(v.string())` | No | Full referrer URL (first pageview only) |
| `referrerDomain` | `v.optional(v.string())` | No | Extracted domain (e.g., "google.com") |
| `utmSource` | `v.optional(v.string())` | No | UTM source parameter |
| `utmMedium` | `v.optional(v.string())` | No | UTM medium parameter |
| `utmCampaign` | `v.optional(v.string())` | No | UTM campaign parameter |
| `deviceType` | `v.union("desktop", "mobile", "tablet")` | Yes | Parsed from user agent |
| `browser` | `v.string()` | Yes | Browser family (e.g., "Chrome") |
| `os` | `v.string()` | Yes | OS family (e.g., "macOS") |
| `country` | `v.optional(v.string())` | No | ISO 3166-1 alpha-2 country code |
| `region` | `v.optional(v.string())` | No | State/province |
| `payload` | `v.optional(v.object({...}))` | No | Event-specific data (scroll section, click target, time on page) |

### pageAnalyticsDaily Table

Aggregated daily metrics. One document per unique `(date, path, referrerDomain, deviceType, country)`. Kept indefinitely.

```typescript
// convex/schema/analytics.ts

pageAnalyticsDaily: defineTable({
  date: v.string(),
  path: v.string(),
  postId: v.optional(v.id("posts")),

  referrerDomain: v.optional(v.string()),
  deviceType: v.union(v.literal("desktop"), v.literal("mobile"), v.literal("tablet")),
  country: v.optional(v.string()),

  pageviews: v.number(),
  uniqueVisitors: v.number(),
  sessions: v.number(),

  avgTimeOnPageMs: v.number(),
  avgEngagedTimeMs: v.number(),
  bounceRate: v.number(),

  scrollDepth: v.object({
    hero: v.number(),
    topic1: v.number(),
    topic2: v.number(),
    topic3: v.number(),
    topic4: v.number(),
    topic5: v.number(),
    summary: v.number(),
    sources: v.number(),
    comments: v.number(),
  }),

  internalClicks: v.number(),
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

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | `v.string()` | Yes | ISO date "2026-04-01" |
| `path` | `v.string()` | Yes | Page path |
| `postId` | `v.optional(v.id("posts"))` | No | Linked post if applicable |
| `referrerDomain` | `v.optional(v.string())` | No | null = direct traffic |
| `deviceType` | `v.union("desktop", "mobile", "tablet")` | Yes | Device category |
| `country` | `v.optional(v.string())` | No | ISO country code |
| `pageviews` | `v.number()` | Yes | Count of pageview events |
| `uniqueVisitors` | `v.number()` | Yes | Distinct visitorId count |
| `sessions` | `v.number()` | Yes | Distinct sessionId count |
| `avgTimeOnPageMs` | `v.number()` | Yes | Average time on page (ms) |
| `avgEngagedTimeMs` | `v.number()` | Yes | Average engaged/visible time (ms) |
| `bounceRate` | `v.number()` | Yes | Bounce rate 0-1 |
| `scrollDepth` | `v.object({...})` | Yes | % of pageviews reaching each section (0-1) |
| `internalClicks` | `v.number()` | Yes | Total internal link clicks |
| `topClickTargets` | `v.array(v.object({...}))` | Yes | Top 10 click targets with counts |

### Indexes

| Table | Index Name | Fields | Purpose |
|-------|-----------|--------|---------|
| `pageEvents` | `by_path_timestamp` | `["path", "timestamp"]` | Events for a specific page in time range |
| `pageEvents` | `by_postId_timestamp` | `["postId", "timestamp"]` | Events for a specific post |
| `pageEvents` | `by_eventType_timestamp` | `["eventType", "timestamp"]` | All events of a type (rollup processing) |
| `pageEvents` | `by_timestamp` | `["timestamp"]` | Purge job: find expired events |
| `pageEvents` | `by_session` | `["sessionId", "timestamp"]` | Reconstruct single session |
| `pageAnalyticsDaily` | `by_date_path` | `["date", "path"]` | Rollups for a page on a date |
| `pageAnalyticsDaily` | `by_postId_date` | `["postId", "date"]` | Rollups for a post over date range |
| `pageAnalyticsDaily` | `by_date` | `["date"]` | All rollups for a date (site-wide) |
| `pageAnalyticsDaily` | `by_path_date` | `["path", "date"]` | Rollups for a path over date range |

### Relationships

| This Table | Foreign Key | References | Relationship |
|-----------|-------------|------------|--------------|
| `pageEvents` | `postId` | `posts._id` | Links raw event to the post it tracks |
| `pageAnalyticsDaily` | `postId` | `posts._id` | Links rollup to the post it summarizes |

---

## Convex Functions

### Queries (`convex/analytics/queries.ts`)

| Function | Auth | Args | Returns | Description |
|----------|------|------|---------|-------------|
| `getTrafficSummary` | `analytics.view` | `{ path?, postId?, startDate, endDate }` | Traffic metrics object | Pageviews, visitors, sessions, referrers, devices, countries |
| `getEngagementSummary` | `analytics.view` | `{ path?, postId?, startDate, endDate }` | Engagement metrics object | Time on page, scroll depth, internal clicks |
| `getTabBadges` | `analytics.view` | `{ postId }` | Badge metrics object | 7d views, 30d views, avg time, top section for post editor |
| `getSiteOverview` | `analytics.view` | `{ startDate, endDate }` | Site overview object | Site-wide pageviews, top pages, daily trend |

### Mutations (`convex/analytics/mutations.ts`)

| Function | Auth | Args | Returns | Description |
|----------|------|------|---------|-------------|
| `purgeAnalytics` | `analytics.manage` | `{ scope, beforeDate? }` | `{ deletedEvents, deletedRollups }` | Manual purge of analytics data |
| `updateSettings` | `analytics.manage` | `{ trackingEnabled?, respectDoNotTrack?, retentionDays? }` | `void` | Update analytics settings |

### Internal Functions (`convex/analytics/internals.ts`)

| Function | Type | Args | Description |
|----------|------|------|-------------|
| `ingestEvents` | internalMutation | `{ events }` | Write validated events to pageEvents |
| `rollupDailyAnalytics` | internalMutation | `{ date? }` | Aggregate yesterday's events into rollups |
| `purgeExpiredEvents` | internalMutation | `{ batchSize? }` | Delete pageEvents older than retention period |
| `resolvePostFromPath` | internalQuery | `{ path }` | Look up post by slug/path |

### HTTP Action (`convex/analytics/http.ts`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/analytics/track` | POST | None (public) | Receive batched events from tracking script |

---

## Tracking Script

### Location

The tracking script lives in the website frontend and is injected into the root layout. It is a standalone module with no React dependencies for the core tracking logic.

### Events Fired

| Event Type | Trigger | Payload |
|-----------|---------|---------|
| `pageview` | Page load or SPA navigation | `{}` (path, referrer, UTM from URL) |
| `scroll_depth` | Section sentinel enters viewport (50% threshold) | `{ section, sectionIndex, maxSections }` |
| `click` | Internal `<a>` tag click | `{ targetPath, targetLabel }` |
| `exit` | `visibilitychange` to hidden or `beforeunload` | `{ timeOnPageMs, engagedTimeMs }` |

### Section Sentinels

Content pages render invisible `<div>` elements at the start of each content section:
```html
<div data-analytics-section="hero" aria-hidden="true" />
<div data-analytics-section="topic-1" aria-hidden="true" />
<!-- ... -->
```

The tracking script creates an `IntersectionObserver` (50% threshold) that watches all `[data-analytics-section]` elements and records the deepest section reached.

### Privacy

- No cookies
- visitorId: UUID in localStorage (user can clear anytime)
- sessionId: UUID in sessionStorage (dies on tab close)
- Respects `navigator.doNotTrack === "1"` (no events sent)
- User agent parsed server-side, raw string never stored
- IP used only for optional geo lookup, then discarded

---

## Files Owned by This Expert

### Backend Files (ConvexPress-Admin/packages/backend/convex/)

1. **`schema/analytics.ts`** -- PENDING
   - Exports: `analyticsTables` (pageEvents, pageAnalyticsDaily)
   - Must be imported + spread in `schema.ts`

2. **`analytics/queries.ts`** -- PENDING
   - Exports: `getTrafficSummary`, `getEngagementSummary`, `getTabBadges`, `getSiteOverview`
   - Imports from: `../helpers/permissions` (requireCan)
   - All queries require `analytics.view` capability

3. **`analytics/mutations.ts`** -- PENDING
   - Exports: `purgeAnalytics`, `updateSettings`
   - Imports from: `../helpers/permissions` (requireCan), `../helpers/events` (emitEvent)
   - All mutations require `analytics.manage` capability

4. **`analytics/internals.ts`** -- PENDING
   - Exports: `ingestEvents`, `rollupDailyAnalytics`, `purgeExpiredEvents`, `resolvePostFromPath`
   - Internal functions not callable from clients

5. **`analytics/http.ts`** -- PENDING
   - Exports: HTTP action for `/api/analytics/track`
   - Validates event payload, parses user agent, normalizes referrer, calls `ingestEvents`

6. **`analytics/validators.ts`** -- PENDING
   - Exports: shared argument validators for analytics functions

### Frontend Files -- Admin (ConvexPress-Admin/apps/web/src/)

7. **`routes/_authenticated/_admin/analytics.tsx`** -- PENDING
   - Route path: `/_authenticated/_admin/analytics`
   - Renders: `AnalyticsDashboard` component

8. **`components/analytics/AnalyticsDashboard.tsx`** -- PENDING
   - Site-wide analytics overview with date range picker, cards, charts, tables

9. **`components/analytics/TrafficSummaryCard.tsx`** -- PENDING
   - Pageviews, visitors, sessions stat cards

10. **`components/analytics/DailyTrendChart.tsx`** -- PENDING
    - Daily pageviews/visitors line or bar chart

11. **`components/analytics/TopPagesTable.tsx`** -- PENDING
    - Top pages by pageviews with links

12. **`components/analytics/TopReferrersTable.tsx`** -- PENDING
    - Top referrer domains by pageviews

13. **`components/analytics/DeviceBreakdown.tsx`** -- PENDING
    - Desktop/mobile/tablet breakdown visualization

14. **`components/analytics/TopCountriesTable.tsx`** -- PENDING
    - Top countries by pageviews

15. **`components/analytics/ScrollDepthChart.tsx`** -- PENDING
    - Section-level scroll depth funnel visualization

16. **`components/analytics/PostAnalyticsTab.tsx`** -- PENDING
    - Analytics tab content for the post editor (per-post metrics)

17. **`hooks/analytics/useAnalytics.ts`** -- PENDING
    - Wraps analytics queries with date range state management

18. **`lib/analytics/types.ts`** -- PENDING
    - TypeScript interfaces for analytics data structures

### Frontend Files -- Website (ConvexPress-Website/apps/web/src/)

19. **`lib/analytics/tracker.ts`** -- PENDING
    - Core tracking script (~2KB). Event batching, sendBeacon, DNT respect.

20. **`components/analytics/AnalyticsProvider.tsx`** -- PENDING
    - React component that initializes tracking script on mount. Injected in root layout.

21. **`components/analytics/SectionSentinel.tsx`** -- PENDING
    - Invisible sentinel div component for section-level scroll tracking.

---

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Schema** (`convex/schema/analytics.ts`) | PENDING | pageEvents + pageAnalyticsDaily tables |
| **Queries** (`convex/analytics/queries.ts`) | PENDING | getTrafficSummary, getEngagementSummary, getTabBadges, getSiteOverview |
| **Mutations** (`convex/analytics/mutations.ts`) | PENDING | purgeAnalytics, updateSettings |
| **Internals** (`convex/analytics/internals.ts`) | PENDING | ingestEvents, rollupDailyAnalytics, purgeExpiredEvents, resolvePostFromPath |
| **HTTP Action** (`convex/analytics/http.ts`) | PENDING | POST /api/analytics/track |
| **Validators** (`convex/analytics/validators.ts`) | PENDING | Shared argument validators |
| **Cron Jobs** | PENDING | Daily rollup (00:05 UTC) + purge (01:00 UTC) in convex/crons.ts |
| **Admin Route** (`routes/_authenticated/_admin/analytics.tsx`) | PENDING | Analytics dashboard page |
| **AnalyticsDashboard** | PENDING | Main analytics page component |
| **TrafficSummaryCard** | PENDING | Stat cards |
| **DailyTrendChart** | PENDING | Line/bar chart |
| **TopPagesTable** | PENDING | Top pages table |
| **TopReferrersTable** | PENDING | Referrer breakdown |
| **DeviceBreakdown** | PENDING | Device type visualization |
| **TopCountriesTable** | PENDING | Country breakdown |
| **ScrollDepthChart** | PENDING | Section scroll funnel |
| **PostAnalyticsTab** | PENDING | Per-post analytics in editor |
| **useAnalytics hook** | PENDING | Query wrapper with date range state |
| **Analytics types** | PENDING | TypeScript interfaces |
| **Tracking script** (`lib/analytics/tracker.ts`) | PENDING | ~2KB tracking core |
| **AnalyticsProvider** | PENDING | React mount wrapper |
| **SectionSentinel** | PENDING | Scroll depth sentinel component |

---

## Related Experts

| Expert | When to Consult |
|--------|----------------|
| **Post System Expert** (`/experts:post-system`) | Resolving paths to postIds. Post editor Analytics tab integration. List table Views column. |
| **Dashboard System Expert** (`/experts:dashboard-system`) | ContentPerformanceWidget needs analytics data. Currently returns empty array with "Coming soon" message. |
| **Settings System Expert** (`/experts:settings-system`) | Analytics settings stored in global settings table. |
| **Role & Capability System Expert** (`/experts:role-capability-system`) | Registering `analytics.view` and `analytics.manage` capabilities. |
| **Event Dispatcher System Expert** (`/experts:event-dispatcher-system`) | Emitting `analytics.rollup_completed`, `analytics.purge_completed`, `analytics.settings_updated` events. |
| **Routing System Expert** (`/experts:routing-system`) | Understanding URL path structure for path-to-post resolution. |
| **SEO System Expert** (`/experts:seo-system`) | May consume pageview data for SEO recommendations. |
| **Admin Shell & Navigation UI Expert** (`/experts:admin-shell-ui`) | Adding "Analytics" menu item to admin sidebar. |
| **Admin Editor Layout UI Expert** (`/experts:admin-editor-ui`) | Adding Analytics tab to post editor tab bar. |
| **Website Layout & Navigation UI Expert** (`/experts:website-layout-ui`) | Injecting tracking script into website root layout. |
| **Website Blog & Content UI Expert** (`/experts:website-blog-ui`) | Adding section sentinel elements to content page templates. |
| **Convex Deployment Expert** (`/experts:convex-deployment`) | Deploy after any backend changes (schema, queries, mutations, crons). |
