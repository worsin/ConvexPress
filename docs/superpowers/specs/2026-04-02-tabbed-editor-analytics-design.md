# Design Spec: Tabbed Post/Page Editor with Analytics

**Date:** 2026-04-02
**Status:** Approved
**Author:** ConvexPress Team

---

## 1. Overview

This design spec covers a major enhancement to the ConvexPress post and page detail views. The existing single-page editor is replaced with a tabbed interface that adds SEO analysis, traffic analytics, and engagement metrics alongside the existing content editor. A built-in analytics engine provides first-party tracking out of the box, with optional Google Analytics 4 (GA4) integration for sites that want richer data.

The enhancement is organized into three parallel workstreams:

1. **Tabbed Editor Shell** -- Route restructuring and shared layout with tab bar
2. **Structured Content Enhancements** -- Media pickers and video fields for section editors
3. **Analytics Engine** -- Built-in tracking, rollup pipeline, GA4 integration, and dashboard tabs

---

## 2. Tabbed Editor Shell

### 2.1 Route Structure

Both posts and pages adopt an identical parent-child route layout.

**Posts:**

```
/admin/posts/$postId          <-- Parent layout route (tab bar + shared data)
/admin/posts/$postId/edit     <-- Content tab (existing editor, relocated)
/admin/posts/$postId/seo      <-- SEO analysis dashboard
/admin/posts/$postId/traffic   <-- Traffic analytics dashboard
/admin/posts/$postId/engagement <-- Engagement analytics dashboard
```

**Pages:**

```
/admin/pages/$pageId          <-- Parent layout route (tab bar + shared data)
/admin/pages/$pageId/edit     <-- Content tab (existing editor, relocated)
/admin/pages/$pageId/seo      <-- SEO analysis dashboard
/admin/pages/$pageId/traffic   <-- Traffic analytics dashboard
/admin/pages/$pageId/engagement <-- Engagement analytics dashboard
```

### 2.2 Layout Route Responsibilities

The parent layout route at `/$postId` (or `/$pageId`) is responsible for:

- Loading post/page data once via a single Convex query
- Rendering the tab bar
- Passing loaded data to child routes via TanStack Router's outlet context
- Handling 404/not-found states for invalid IDs

Child routes consume the outlet context and never re-fetch the core post/page document.

### 2.3 Tab Bar

The tab bar renders four tabs with live badges:

| Tab | Badge | Badge Behavior |
|-----|-------|----------------|
| **Content** | None | Active by default |
| **SEO** | SEO score (0-100) | Color-coded: green (80-100), yellow (50-79), red (0-49) |
| **Traffic** | Total pageviews (last 30 days) | Formatted with abbreviations (1.2K, 45K, etc.) |
| **Engagement** | Avg time on page | Formatted as mm:ss |

Badge data is loaded in the parent layout route as lightweight summary queries so the tab bar renders immediately.

### 2.4 Content Tab -- Zero Disruption

The Content tab (`/edit`) is the existing `EditorLayout` component relocated into the new route structure. There are no changes to the editor itself, its metaboxes, or its behavior. The move is purely structural:

- Current route: `/admin/posts/$postId` renders the editor directly
- New route: `/admin/posts/$postId/edit` renders the same editor via outlet
- The parent route redirects bare `/$postId` to `/$postId/edit` automatically

This ensures that bookmarks, links, and muscle memory continue to work.

---

## 3. Structured Content Enhancements

### 3.1 Media Library Picker for Hero Section

The `HeroSectionEditor` component gains a Media Library picker for selecting the hero image. This follows the exact same pattern already established by the Featured Image metabox:

- Thumbnail preview of the selected image
- "Select Image" button opens the Media Library picker modal
- "Remove" button clears the selection
- Selected media is stored as `imageId: Id<"media">` (already in schema)

### 3.2 Media Library Picker for Topic Sections

Each `TopicSectionEditor` (topics 1 through 5) gains the same Media Library picker pattern:

- Thumbnail preview
- Select/Remove buttons
- Stored as `imageId: Id<"media">` per topic section (already in schema)

### 3.3 Video URL Fields

Both the hero section and each topic section support a video URL field:

- Text input for video URL (YouTube, Vimeo, or direct video file URL)
- The schema and TypeScript types already include `videoUrl?: string` on these sections -- this work is purely adding the form field to the UI
- No video player preview in the editor; just the URL input
- Video rendering on the website frontend is a separate concern

### 3.4 Drag-and-Drop Image Upload

Each section editor (hero and topics) supports drag-and-drop image upload:

- Drop zone overlay appears when dragging a file over the section
- Dropped image is uploaded to the Media Library automatically
- On successful upload, the new media ID is set as the section's `imageId`
- Uses the same upload pipeline as the existing Media Library uploader
- File type validation: images only (JPEG, PNG, WebP, GIF, SVG)

---

## 4. Analytics Engine

### 4.1 Architecture Overview

The analytics engine has three layers:

1. **Collection** -- A lightweight tracking script on the website frontend sends events to an HTTP endpoint
2. **Storage & Rollup** -- Raw events stored in Convex with daily aggregation jobs
3. **Query & Display** -- Dashboard components read from rollups (fast) with live queries on recent raw events (near-real-time)

### 4.2 Tracking Script

A lightweight client-side script (~2KB gzipped) is injected into the website frontend. It tracks:

| Event Type | Trigger | Data Captured |
|------------|---------|---------------|
| `pageview` | Page load / client-side navigation | path, referrer, userAgent, UTM params |
| `scroll` | Intersection observer on content sections | path, sectionId, sectionName, scrollPercent |
| `click` | Click on internal links and CTAs | path, targetPath, linkText, elementType |
| `exit` | `beforeunload` / `visibilitychange` | path, timeOnPage (ms) |

**Visitor identity:**

- Anonymous visitor ID generated and stored in a first-party cookie (`_cp_vid`, 1-year expiry)
- Session ID generated per visit, refreshed after 30 minutes of inactivity (`_cp_sid`, session cookie)
- No PII is collected; no fingerprinting

**Delivery:**

- Events are batched and sent via `navigator.sendBeacon()` (with `fetch()` fallback)
- Endpoint: `POST /api/analytics/track`
- Payload: JSON array of events
- Failed sends are retried once on next user interaction

### 4.3 HTTP Endpoint

A Convex HTTP action at `/api/analytics/track` receives batched events:

- Validates event shape (rejects malformed payloads silently)
- Enriches with server-side timestamp
- Geo-lookup from IP (country-level only, via lightweight lookup -- no external API call in hot path)
- Writes events to the `pageEvents` table
- Returns `204 No Content` (fire-and-forget from client perspective)
- Rate-limited: max 100 events per request, max 10 requests per second per visitor ID

### 4.4 Data Model

#### `pageEvents` Table (Raw Events)

```typescript
export const analyticsTables = {
  pageEvents: defineTable({
    path: v.string(),
    type: v.union(
      v.literal("pageview"),
      v.literal("scroll"),
      v.literal("click"),
      v.literal("exit")
    ),
    visitorId: v.string(),
    sessionId: v.string(),
    referrer: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
    country: v.optional(v.string()),
    device: v.optional(v.union(
      v.literal("desktop"),
      v.literal("mobile"),
      v.literal("tablet")
    )),
    data: v.optional(v.any()),   // Flexible: scroll depth, click target, time on page, etc.
    timestamp: v.number(),        // Unix epoch ms
  })
    .index("by_path_and_timestamp", ["path", "timestamp"])
    .index("by_timestamp", ["timestamp"])
    .index("by_visitor_and_session", ["visitorId", "sessionId"]),
};
```

**Retention:** 90 days. A scheduled purge job removes older events.

#### `pageAnalyticsDaily` Table (Rollups)

```typescript
pageAnalyticsDaily: defineTable({
  path: v.string(),
  date: v.string(),                // "YYYY-MM-DD"
  pageviews: v.number(),
  uniqueVisitors: v.number(),
  avgTimeOnPage: v.number(),       // Milliseconds
  bounceRate: v.optional(v.number()),  // 0-1 float
  scrollDepth: v.optional(v.object({
    hero: v.optional(v.number()),        // % of visitors who scrolled to this section
    topic1: v.optional(v.number()),
    topic2: v.optional(v.number()),
    topic3: v.optional(v.number()),
    topic4: v.optional(v.number()),
    topic5: v.optional(v.number()),
    summary: v.optional(v.number()),
    sources: v.optional(v.number()),
  })),
  sources: v.optional(v.object({
    organic: v.optional(v.number()),
    social: v.optional(v.number()),
    direct: v.optional(v.number()),
    referral: v.optional(v.number()),
    email: v.optional(v.number()),
  })),
  devices: v.optional(v.object({
    desktop: v.optional(v.number()),
    mobile: v.optional(v.number()),
    tablet: v.optional(v.number()),
  })),
  countries: v.optional(v.array(v.object({
    code: v.string(),
    count: v.number(),
  }))),
  topReferrers: v.optional(v.array(v.object({
    domain: v.string(),
    count: v.number(),
  }))),
  clicks: v.optional(v.array(v.object({
    targetPath: v.string(),
    count: v.number(),
  }))),
  events: v.optional(v.array(v.object({
    name: v.string(),
    count: v.number(),
  }))),
})
  .index("by_path_and_date", ["path", "date"])
  .index("by_date", ["date"]),
```

**Retention:** Indefinite. Rollups are small and kept forever.

#### `gaCache` Table (GA4 Response Cache)

```typescript
gaCache: defineTable({
  propertyId: v.string(),
  queryHash: v.string(),           // SHA-256 of the GA4 query params
  dateRange: v.string(),           // "2026-03-01:2026-03-31"
  data: v.any(),                   // GA4 API response payload
  expiresAt: v.number(),           // Unix epoch ms, 1-hour TTL
})
  .index("by_property_and_query", ["propertyId", "queryHash"])
  .index("by_expiry", ["expiresAt"]),
```

### 4.5 Rollup Strategy

**Daily rollup job (scheduled, runs once daily at 00:15 UTC):**

1. Queries all raw events from the previous calendar day (UTC)
2. Groups by `path`
3. Computes aggregates: pageviews, unique visitors (distinct `visitorId`), avg time on page, bounce rate, scroll depth per section, source breakdown, device breakdown, country counts, top referrers, click targets, conversion events
4. Upserts one `pageAnalyticsDaily` record per path per date
5. Logs completion to the audit log

**Purge job (scheduled, runs daily at 01:00 UTC):**

1. Deletes all `pageEvents` records with `timestamp` older than 90 days
2. Deletes all `gaCache` records with `expiresAt` in the past
3. Processes in batches of 1000 to avoid Convex function timeout limits

**Near-real-time supplementation:**

Dashboard queries combine:
- Rollup data for completed days (fast reads from `pageAnalyticsDaily`)
- Live aggregation of raw events from the current day (query `pageEvents` where `timestamp >= today midnight`)

This gives users up-to-the-hour data without requiring real-time rollup infrastructure.

### 4.6 GA4 Integration

#### Settings Page

A new settings section at `/admin/settings/analytics` allows administrators to configure GA4:

- **GA4 Property ID** -- Text input (format: `properties/XXXXXXXX`)
- **Service Account Credentials** -- JSON file upload or paste (Google Cloud service account key)
- **Connection Test** -- Button that makes a test API call and shows success/failure
- **Status Indicator** -- Shows connected/disconnected with last successful sync time

Settings are stored in the existing `settings` table under the `analytics` group.

#### Data Fetching

Convex actions call the GA4 Data API (`googleapis` npm package):

- Queries are constructed for the specific post/page path
- Metrics: `screenPageViews`, `totalUsers`, `bounceRate`, `averageSessionDuration`, `sessionsPerUser`, `engagementRate`
- Dimensions: `date`, `sessionSource`, `deviceCategory`, `country`, `pagePath`
- Responses are cached in the `gaCache` table with a 1-hour TTL
- Cache key is the SHA-256 hash of the full query parameters

#### Data Source Switching

Dashboard components use a `useAnalyticsData()` hook that:

1. Checks `isGA4Connected` from settings
2. If GA4 is connected: fetches from GA4 (via cached action)
3. If GA4 is not connected: fetches from built-in rollups (via query)
4. Returns a normalized data shape regardless of source

Components never know or care which source they are reading from. The hook abstracts the data source completely.

---

## 5. Tab Dashboards

### 5.1 SEO Tab (`/$postId/seo`)

The SEO tab is a **read-only analysis dashboard**. All SEO data entry (meta title, meta description, focus keyphrase, canonical URL, etc.) remains in the Content tab's SEO metabox. The SEO tab visualizes and analyzes that data.

#### Score Cards Row

| Card | Value | Source |
|------|-------|--------|
| SEO Score | 0-100 with color ring | Computed from SEO analysis |
| Readability Score | 0-100 with color ring | Computed from content analysis |
| Issue Count | Number with severity breakdown | Count of SEO issues found |
| Cornerstone | Yes/No badge | Post's cornerstone flag |

#### Issues Section

Issues are grouped by severity and displayed in expandable accordion panels:

- **Critical** (red) -- Must-fix issues that significantly harm SEO (e.g., missing meta title, no focus keyphrase, duplicate H1)
- **Warnings** (yellow) -- Should-fix issues that may impact SEO (e.g., meta description too short, no internal links, low keyword density)
- **Passed** (green) -- Checks that passed successfully (e.g., meta title present and correct length, image alt tags present)

Each issue includes a description and actionable recommendation.

#### Preview Section

Three preview cards, arranged horizontally:

1. **SERP Preview** -- How the page appears in Google search results (title, URL, description)
2. **Facebook OG Preview** -- How the page appears when shared on Facebook (image, title, description)
3. **Twitter Card Preview** -- How the page appears when shared on Twitter/X (image, title, description)

These are existing components from the SEO system, recomposed into the tab layout.

#### Keyphrase Analysis Grid

A table showing the focus keyphrase analysis:

| Check | Status | Detail |
|-------|--------|--------|
| Keyphrase in title | Pass/Fail | Shows the title with keyphrase highlighted |
| Keyphrase in meta description | Pass/Fail | Shows excerpt with keyphrase highlighted |
| Keyphrase in URL | Pass/Fail | Shows the slug |
| Keyphrase in H1 | Pass/Fail | Shows the heading |
| Keyphrase density | Pass/Fail | Shows percentage and recommendation |
| Keyphrase in first paragraph | Pass/Fail | Shows the paragraph excerpt |

### 5.2 Traffic Tab (`/$postId/traffic`)

#### Controls

- **Date range selector:** 7 days, 30 days, 90 days, All Time (buttons, not a date picker)
- **GA4 connection indicator:** Green dot + "GA4 Connected" or gray dot + "Built-in Analytics" with link to settings

#### KPI Cards Row

| Card | Metric | Comparison |
|------|--------|------------|
| Pageviews | Total in period | vs. previous period (e.g., +12.4%) |
| Unique Visitors | Distinct visitors in period | vs. previous period |
| Bounce Rate | % single-page sessions | vs. previous period |
| Avg Time on Page | mm:ss format | vs. previous period |
| Pages/Session | Average for visitors who viewed this page | vs. previous period |

Each card shows an up/down arrow with percentage change, colored green (improvement) or red (decline).

#### Pageviews Over Time Chart

- Line chart showing daily pageviews for the selected period
- X-axis: dates; Y-axis: pageview count
- Hover tooltip shows exact count for each day
- Renders using SVG (no charting library dependency -- lightweight custom implementation or a small library like `recharts`)

#### Traffic Sources Breakdown

Horizontal bar chart or donut chart showing:

- Organic Search
- Social Media
- Direct
- Referral
- Email

Each segment shows count and percentage.

#### Top Referrers Table

| Referrer Domain | Visits | % of Total |
|-----------------|--------|------------|
| google.com | 1,234 | 45.2% |
| twitter.com | 567 | 20.8% |
| ... | ... | ... |

Sorted by visits descending. Top 10 shown with "Show more" expansion.

#### Device Breakdown

Three-column card showing:

- Desktop: count + percentage + icon
- Mobile: count + percentage + icon
- Tablet: count + percentage + icon

#### Top Countries Table

| Country | Visits | % of Total |
|---------|--------|------------|
| United States | 2,345 | 55.1% |
| United Kingdom | 456 | 10.7% |
| ... | ... | ... |

Top 10 with "Show more" expansion.

#### Graceful Fallback

When GA4 is not connected, the dashboard displays all the same cards and charts, populated from built-in rollup data. The only differences:

- "Built-in Analytics" indicator instead of "GA4 Connected"
- Bounce rate and pages/session may show "N/A" if not calculable from built-in data alone
- A subtle banner: "Connect Google Analytics for richer traffic data" with link to settings

### 5.3 Engagement Tab (`/$postId/engagement`)

#### KPI Cards Row

| Card | Metric | Comparison |
|------|--------|------------|
| Avg Time on Page | mm:ss format | vs. previous period |
| Scroll Depth | Average % scrolled | vs. previous period |
| CTA Click Rate | % of visitors who clicked a CTA | vs. previous period |
| Exit Rate | % of sessions that ended on this page | vs. previous period |

#### Section-Level Scroll Depth Visualization (Killer Feature)

This is the feature unique to ConvexPress. Because ConvexPress knows the structured content of every post (hero, topic 1-5, summary, sources), it can show exactly how far visitors read.

**Visual design:**

A vertical representation of the post's content structure, with each section shown as a horizontal bar:

```
Hero Section          ========================================  98%
Topic 1: [title]      ====================================      89%
Topic 2: [title]      ==============================            74%
Topic 3: [title]      ========================                  58%
Topic 4: [title]      ==================                        42%
Topic 5: [title]      ============                              28%
Summary               =========                                 21%
Sources               =======                                   16%
```

- Each bar is color-coded with a gradient (green at high %, fading to yellow then red at low %)
- Section titles are pulled from the actual post content (not generic labels)
- Hovering a bar shows: "X% of visitors scrolled to this section (Y of Z visitors)"
- The visualization updates when the date range changes

This gives authors immediate, actionable insight into where readers drop off.

#### Internal Link Clicks

Table showing where visitors go after reading this post:

| Destination | Clicks | % of Visitors |
|-------------|--------|---------------|
| /blog/related-post | 234 | 12.1% |
| /about | 89 | 4.6% |
| /contact | 45 | 2.3% |

Sorted by clicks descending.

#### Conversion Events

Cards or table showing conversion metrics:

| Event | Count | Rate |
|-------|-------|------|
| CTA Clicks | 456 | 8.2% of visitors |
| Newsletter Signups | 123 | 2.2% of visitors |
| Comments Posted | 34 | 0.6% of visitors |
| Social Shares | 78 | 1.4% of visitors |

Each shows the count and the conversion rate (events / unique visitors).

#### Time on Page Distribution

A histogram showing how long visitors spend on the page:

- X-axis: Time buckets (0-15s, 15-30s, 30-60s, 1-2m, 2-5m, 5-10m, 10m+)
- Y-axis: Number of visitors
- Median line highlighted
- Shows the distribution shape: bounce-heavy pages have a spike at 0-15s; engaging pages have a more spread distribution

---

## 6. New Systems Required

### 6.1 Analytics System

**Scope:** Built-in tracking script, event ingestion endpoint, raw event storage, rollup pipeline, dashboard query functions.

**Convex backend components:**
- Schema file: `convex/schema/analytics.ts` (defines `pageEvents` and `pageAnalyticsDaily`)
- HTTP endpoint: `convex/http/analytics.ts` (event ingestion)
- Mutations: `convex/analytics/mutations.ts` (write events, upsert rollups)
- Queries: `convex/analytics/queries.ts` (dashboard data for traffic + engagement tabs)
- Internals: `convex/analytics/internals.ts` (rollup job, purge job)
- Scheduled functions for daily rollup and purge

**Frontend components:**
- Tracking script: injected in website frontend's root layout
- Dashboard components: shared between traffic and engagement tabs

### 6.2 GA4 Integration System

**Scope:** Google Analytics 4 Data API integration, credential management, response caching, data source abstraction.

**Convex backend components:**
- Schema file: `convex/schema/gaCache.ts` (defines `gaCache`)
- Actions: `convex/ga4/actions.ts` (GA4 API calls, cached)
- Queries: `convex/ga4/queries.ts` (read from cache)
- Internals: `convex/ga4/internals.ts` (cache cleanup)

**Admin frontend components:**
- Settings page: `/admin/settings/analytics` (GA4 configuration form)
- `useAnalyticsData()` hook: data source abstraction layer

### 6.3 Tabbed Editor Shell

**Scope:** Route restructuring, shared layout component, tab bar with badges.

**This is not a new "system" in the Convex backend sense** -- it is a frontend routing and layout concern. It touches:

- Admin frontend route files (new parent layout routes)
- Tab bar component
- Badge query hooks (lightweight summary queries)
- Outlet context typing

---

## 7. Dependencies

### Existing Systems (Required, Already Complete)

| System | Dependency Reason |
|--------|-------------------|
| SEO System | SEO tab reads SEO analysis data, reuses preview components |
| Post System | Post data, structured content schema |
| Page System | Page data, structured content schema |
| Media System | Media Library picker, image upload pipeline |
| Settings System | Analytics settings storage |
| Event Dispatcher | Emit events on analytics milestones (optional) |
| Content Editor System | Existing editor is relocated into tabbed shell |

### New NPM Dependencies

| Package | Purpose | Used By |
|---------|---------|---------|
| `googleapis` | Google Analytics 4 Data API client | GA4 Integration System (Convex actions) |

No other new dependencies are required. Charts will be built with lightweight SVG rendering or a minimal charting library already evaluated for bundle size.

---

## 8. Implementation Phasing

### Phase 1: Tabbed Editor Shell

**Estimated effort:** Small
**Risk:** Low (routing refactor, no data changes)

1. Create parent layout routes for posts and pages
2. Build tab bar component with placeholder badges
3. Relocate existing editor into `/edit` child route
4. Verify zero disruption to existing editor functionality
5. Add redirect from bare `/$postId` to `/$postId/edit`

### Phase 2: Structured Content Enhancements

**Estimated effort:** Small
**Risk:** Low (UI-only, schema already supports fields)

1. Add Media Library picker to HeroSectionEditor
2. Add Media Library picker to each TopicSectionEditor
3. Add video URL fields to hero and topic sections
4. Implement drag-and-drop image upload for each section

### Phase 3: Analytics Engine -- Backend

**Estimated effort:** Medium
**Risk:** Medium (new data pipeline, scheduled jobs)

1. Define analytics schema (`pageEvents`, `pageAnalyticsDaily`)
2. Build HTTP event ingestion endpoint
3. Build tracking script for website frontend
4. Implement daily rollup scheduled function
5. Implement daily purge scheduled function
6. Build dashboard query functions

### Phase 4: Analytics Engine -- Frontend

**Estimated effort:** Medium
**Risk:** Low (read-only dashboards consuming queries)

1. Build Traffic tab dashboard (KPI cards, charts, tables)
2. Build Engagement tab dashboard (KPI cards, scroll depth visualization, tables)
3. Build SEO tab dashboard (score cards, issues, previews, keyphrase grid)
4. Wire tab bar badges to live summary queries

### Phase 5: GA4 Integration

**Estimated effort:** Medium
**Risk:** Medium (external API, credentials management)

1. Build analytics settings page
2. Implement GA4 API actions with caching
3. Build `useAnalyticsData()` hook with source abstraction
4. Wire Traffic and Engagement tabs to use the hook
5. Test fallback behavior when GA4 is not connected

---

## 9. Security Considerations

### Event Ingestion

- The `/api/analytics/track` endpoint is public (no auth required -- visitors are anonymous)
- Rate limiting prevents abuse: 100 events/request, 10 requests/second/visitor
- Event payloads are validated and sanitized; unexpected fields are dropped
- No PII is stored in analytics events
- Visitor IDs are opaque random strings, not reversible to any identity

### GA4 Credentials

- Service account JSON is stored encrypted in the Convex settings table
- Credentials are only used server-side in Convex actions; never sent to the client
- The settings page masks the credential content after initial save (show only service account email)
- Only administrators can view or modify analytics settings (requires `settings.manage` capability)

### Dashboard Access

- All analytics dashboard routes are behind admin authentication
- Analytics queries enforce the same role-based access as the editor:
  - Authors can view analytics for their own posts
  - Editors and Administrators can view analytics for all posts/pages

---

## 10. Performance Considerations

### Tracking Script

- Target: under 2KB gzipped
- Loads asynchronously, does not block page rendering
- Uses Intersection Observer API for scroll tracking (no scroll event listeners)
- Batches events and sends via `sendBeacon()` to avoid blocking navigation

### Dashboard Queries

- Primary reads come from pre-computed `pageAnalyticsDaily` rollups (single document read per day)
- Live supplementation queries only the current day's raw events (small dataset)
- GA4 responses are cached for 1 hour, eliminating redundant API calls
- Tab bar badges use a dedicated lightweight query that returns only the three summary numbers

### Data Volume

- At 10,000 pageviews/day, approximately 40,000 raw events/day (pageview + scroll + click + exit)
- 90-day retention means approximately 3.6M raw events at steady state
- Rollup table grows by one document per unique path per day (manageable indefinitely)
- Purge job keeps raw event volume bounded

---

## 11. Open Questions

1. **Chart library decision** -- Build custom SVG charts or adopt a lightweight library like `recharts`? Custom is smaller but slower to build. Recommend evaluating `recharts` bundle impact.
2. **Geo lookup** -- Country-level lookup from IP in the ingestion endpoint. Options: embedded MaxMind GeoLite2 database (adds ~5MB to deployment) vs. Cloudflare/Vercel headers (zero cost if available). Needs investigation based on deployment target.
3. **Scroll tracking granularity** -- Should scroll tracking fire once per section (first view) or continuously (re-reads)? Recommend once per section per session to keep event volume manageable.
4. **Consent banner** -- Built-in analytics uses first-party cookies for anonymous tracking. Depending on jurisdiction, a consent mechanism may be needed. Defer to a future Cookie Consent system or let the site operator handle it.

---

## 12. Success Criteria

- Existing editor functionality is completely unaffected by the tabbed shell migration
- SEO tab provides actionable analysis without requiring navigation away from the post
- Traffic and Engagement tabs show meaningful data within 24 hours of tracking script deployment
- GA4 integration works seamlessly when configured, with graceful fallback when not
- Section-level scroll depth visualization is accurate and maps correctly to structured content
- Tracking script has zero measurable impact on website Lighthouse performance score
- Dashboard queries return in under 500ms for posts with up to 90 days of data
