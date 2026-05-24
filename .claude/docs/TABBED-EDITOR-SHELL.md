# Tabbed Editor Shell - Expert Knowledge Document

**System:** Tabbed Editor Shell
**Status:** Implementation Ready
**Priority:** P1 - High
**Expert Type:** UI Expert (frontend only -- consumes backend system experts' Convex functions)
**WordPress Equivalent:** No direct equivalent. WordPress uses a single-page post editor. This is closer to HubSpot's content detail view with tabbed dashboards (Content, SEO, Performance) per content item.
**Last Analyzed:** 2026-04-01

---

## Quick Reference

### What This Expert Covers

The Tabbed Editor Shell Expert owns the parent layout route that wraps the post/page detail views in a four-tab interface. This is the container shell that surrounds the existing editor (Content tab) and adds SEO, Traffic, and Engagement dashboard tabs. The expert covers:

1. **Parent layout route** -- `PostDetailLayout` / `PageDetailLayout` with header bar, tab bar, and `<Outlet />`
2. **Header bar** -- back link, post title, status badge, last saved timestamp
3. **Tab bar** -- four navigation tabs (Content, SEO, Traffic, Engagement) with live badges
4. **Default redirect** -- `/posts/$postId` redirects to `/posts/$postId/edit`
5. **Outlet context** -- loads post data once in parent, shares with all child tabs via context
6. **SEO tab dashboard** -- recomposes existing SEO components (SerpPreview, FacebookPreview, TwitterPreview, SeoAnalysisResults) into a full-page dashboard layout with score overview and issue breakdown
7. **Traffic tab dashboard** -- pageviews over time, traffic sources, referrers, devices, geography, KPI cards
8. **Engagement tab dashboard** -- scroll depth heatmap, time-on-page distribution, internal link clicks, conversion events, content section performance
9. **Date range provider** -- shared date range context for Traffic and Engagement tabs (7d/30d/90d/all), persisted in URL search params
10. **Structured content image pickers** -- Media Library picker integration for HeroSectionEditor and TopicSectionEditor imageId fields
11. **Structured content video field** -- Video URL input with embedded preview for HeroSectionEditor

This expert does NOT own:
- The block editor itself (Content Editor System Expert)
- The EditorLayout, metaboxes, or editor hooks (Admin Editor Layout UI Expert)
- Convex mutations/queries (backend system experts own those)
- SEO analysis logic or scoring (SEO System Expert)
- Analytics data collection or storage (Analytics System Expert)
- The admin shell / sidebar / top bar (Admin Shell & Navigation UI Expert)

### Key Concepts

| Concept | Description |
|---------|-------------|
| **PostDetailLayout** | Parent layout route component that renders header + tab bar + outlet for posts |
| **PageDetailLayout** | Same as PostDetailLayout but for pages (shares underlying `ContentDetailLayout`) |
| **ContentDetailLayout** | Shared internal component used by both Post and Page detail layouts |
| **TabBar** | Navigation component rendering four tab links with route-based active state |
| **PostDetailContext** | Outlet context providing post data, contentType, and capability flags to child routes |
| **DateRangeProvider** | React context providing shared date range state for Traffic and Engagement tabs |
| **SeoTabDashboard** | Full-page SEO dashboard recomposing existing SEO components |
| **TrafficTabDashboard** | Analytics dashboard showing pageview and traffic source data |
| **EngagementTabDashboard** | Analytics dashboard showing scroll depth, time, and interaction data |
| **MediaPickerField** | Reusable field component wrapping MediaPicker for structured content image selection |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress (Tabbed Editor Shell) |
|--------|-----------|----------------------------------|
| **Editor structure** | Single monolithic page with all metadata | Tabbed detail view: Content, SEO, Traffic, Engagement |
| **SEO dashboard** | Yoast metabox inside editor sidebar | Dedicated full-page SEO tab with score cards and previews |
| **Traffic analytics** | Requires plugin (Jetpack, MonsterInsights) | Built-in Traffic tab per content item |
| **Engagement data** | Not available natively | Built-in Engagement tab with scroll depth and interaction metrics |
| **Navigation** | Single URL per post editor | Child routes per tab, deep-linkable URLs |
| **Data loading** | PHP loads all data on page render | Parent layout loads once, shares via outlet context |
| **Date range** | N/A | URL-persisted date range selector shared across analytics tabs |
| **Media in structured content** | `wp.media` modal frame | Inline MediaPickerField (no modal) |

---

## Architecture Overview

### Route Structure

```
/admin/posts/$postId                    -> PostDetailLayout (parent, redirects to /edit)
  /admin/posts/$postId/edit             -> Content tab (existing EditorLayout)
  /admin/posts/$postId/seo              -> SEO tab dashboard
  /admin/posts/$postId/traffic          -> Traffic tab dashboard
  /admin/posts/$postId/engagement       -> Engagement tab dashboard

/admin/pages/$pageId                    -> PageDetailLayout (parent, redirects to /edit)
  /admin/pages/$pageId/edit             -> Content tab (existing EditorLayout)
  /admin/pages/$pageId/seo              -> SEO tab dashboard
  /admin/pages/$pageId/traffic          -> Traffic tab dashboard
  /admin/pages/$pageId/engagement       -> Engagement tab dashboard
```

### Component Hierarchy

```
PostDetailLayout (layout route: posts/$postId.tsx)
  |
  +-- DetailHeader
  |     +-- BackLink ("< All Posts")
  |     +-- PostTitle (truncated h1)
  |     +-- StatusBadge (Draft/Published/Pending/etc.)
  |     +-- LastSavedTimestamp ("Last saved 2 minutes ago")
  |
  +-- TabBar
  |     +-- TabLink: "Content" -> /edit
  |     +-- TabLink: "SEO" -> /seo (badge: SEO score)
  |     +-- TabLink: "Traffic" -> /traffic (badge: pageview count)
  |     +-- TabLink: "Engagement" -> /engagement (badge: avg time)
  |
  +-- DateRangeProvider
        +-- <Outlet context={postDetailContext} />
              |
              +-- (Content tab) EditorLayout [existing, unchanged]
              +-- (SEO tab) SeoTabDashboard
              |     +-- ScoreOverviewRow
              |     |     +-- SeoScoreGauge (overall)
              |     |     +-- ReadabilityScoreGauge
              |     |     +-- ContentLengthCard
              |     |     +-- FocusKeywordCard
              |     +-- Two-Column Grid
              |           +-- Main: SeoAnalysisResults (expanded)
              |           +-- Main: ReadabilityAnalysis
              |           +-- Sidebar: SerpPreview
              |           +-- Sidebar: FacebookPreview
              |           +-- Sidebar: TwitterPreview
              |           +-- Sidebar: SchemaMarkupSummary
              |
              +-- (Traffic tab) TrafficTabDashboard
              |     +-- DateRangeSelector
              |     +-- KpiCardsRow (pageviews, visitors, avg time, bounce rate)
              |     +-- PageviewsChart (line chart, daily)
              |     +-- Two-Column Grid
              |           +-- TrafficSourcesBreakdown
              |           +-- TopReferrersTable
              |           +-- DevicesBreakdown (donut chart)
              |           +-- GeographyTable
              |
              +-- (Engagement tab) EngagementTabDashboard
                    +-- DateRangeSelector
                    +-- KpiCardsRow (read time, scroll completion, link CTR, conversion rate)
                    +-- ScrollDepthHeatmap
                    +-- Two-Column Grid
                          +-- TimeOnPageDistribution (histogram)
                          +-- InternalLinkClicksTable
                          +-- ConversionEventsTable
                          +-- ContentSectionPerformanceTable
```

### Data Flow

```
Parent layout route loads:
  -> Convex query: posts.get($postId) or pages.get($pageId)
  -> Builds PostDetailContext: { post, contentType, canEdit, canPublish, canDelete }
  -> Passes context via <Outlet context={...} />

Content tab:
  -> Reads post from useOutletContext<PostDetailContext>()
  -> Passes to EditorLayout (existing, unchanged)
  -> All editor mutations fire as before

SEO tab:
  -> Reads post from context
  -> Fetches SEO analysis via seo.analyzePost(postId) query
  -> Recomposes existing SerpPreview, FacebookPreview, TwitterPreview, SeoAnalysisResults
  -> Read-only; "Edit SEO Settings" links to Content tab

Traffic tab:
  -> Reads post from context
  -> Reads dateRange from DateRangeProvider
  -> Fetches analytics.getTrafficForContent(postId, dateRange) query
  -> Renders charts and tables from analytics data
  -> Shows empty state if no data

Engagement tab:
  -> Reads post from context
  -> Reads dateRange from DateRangeProvider
  -> Fetches analytics.getEngagementForContent(postId, dateRange) query
  -> Renders scroll depth heatmap, time distribution, link clicks
  -> Shows empty state if no data
```

### Date Range State

```
DateRangeProvider (wraps Outlet)
  |
  +-- State stored in URL search params: ?range=30d
  +-- Options: "7d" | "30d" | "90d" | "all"
  +-- Default: "30d"
  +-- Provides: { dateRange, setDateRange, startDate, endDate, comparisonStartDate, comparisonEndDate }
  +-- Content tab and SEO tab ignore this context
  +-- Traffic tab and Engagement tab consume it and render DateRangeSelector UI
```

---

## Component Inventory

### Layout Components

#### `ContentDetailLayout`

- **Purpose:** Shared internal layout component used by both PostDetailLayout and PageDetailLayout
- **Props:**
  ```typescript
  interface ContentDetailLayoutProps {
    contentType: "post" | "page";
    contentId: string;
  }
  ```
- **Responsibilities:**
  - Renders DetailHeader, TabBar, DateRangeProvider, and Outlet
  - Loads content data via parent route loader
  - Constructs and provides PostDetailContext to child routes
  - Handles 404 (content not found) with error boundary
  - Handles trash state with warning banner

#### `DetailHeader`

- **Purpose:** Header bar with back link, title, status, and timestamp
- **Props:**
  ```typescript
  interface DetailHeaderProps {
    contentType: "post" | "page";
    title: string;
    status: PostStatus;
    lastSavedAt: number | null;
  }
  ```
- **Styling:** `bg-background border-b border-border px-6 py-4`

#### `TabBar`

- **Purpose:** Four-tab navigation bar with route-based active state and live badges
- **Props:**
  ```typescript
  interface TabBarProps {
    contentType: "post" | "page";
    contentId: string;
    seoScore?: number | null;
    pageviewCount?: number | null;
    avgEngagementTime?: number | null; // seconds
  }
  ```
- **Styling:** `bg-muted/30 border-b border-border` with horizontal scroll on mobile

#### `DateRangeProvider`

- **Purpose:** React context providing shared date range state for analytics tabs
- **Props:**
  ```typescript
  interface DateRangeProviderProps {
    children: React.ReactNode;
  }
  ```
- **Reads from:** URL search param `?range=`
- **Provides:** `{ dateRange, setDateRange, startDate, endDate, comparisonStartDate, comparisonEndDate }`

#### `DateRangeSelector`

- **Purpose:** UI control for selecting date range, rendered within Traffic and Engagement tabs
- **Uses:** `useDateRange()` hook from DateRangeProvider context
- **Renders:** Segmented button group: 7d | 30d | 90d | All Time

### Dashboard Components

#### `SeoTabDashboard`

- **Purpose:** Full-page SEO dashboard recomposing existing components
- **Data:** Post from outlet context + SEO analysis queries
- **Reuses:** `SerpPreview`, `FacebookPreview`, `TwitterPreview`, `SeoAnalysisResults`, `SeoScoreBadge` from `components/seo/`

#### `TrafficTabDashboard`

- **Purpose:** Traffic analytics dashboard for a single content item
- **Data:** Post from outlet context + analytics traffic queries + date range context
- **Subcomponents:** `KpiCardsRow`, `PageviewsChart`, `TrafficSourcesBreakdown`, `TopReferrersTable`, `DevicesBreakdown`, `GeographyTable`

#### `EngagementTabDashboard`

- **Purpose:** Engagement analytics dashboard for a single content item
- **Data:** Post from outlet context + analytics engagement queries + date range context
- **Subcomponents:** `KpiCardsRow`, `ScrollDepthHeatmap`, `TimeOnPageDistribution`, `InternalLinkClicksTable`, `ConversionEventsTable`, `ContentSectionPerformanceTable`

### Shared Dashboard Subcomponents

#### `KpiCard`

- **Purpose:** Single KPI metric card with label, value, and optional trend
- **Props:**
  ```typescript
  interface KpiCardProps {
    label: string;
    value: string | number;
    trend?: { direction: "up" | "down" | "neutral"; value: string };
    icon?: React.ReactNode;
  }
  ```

#### `KpiCardsRow`

- **Purpose:** Horizontal row of 4 KPI cards
- **Styling:** `grid grid-cols-2 lg:grid-cols-4 gap-4`

#### `EmptyAnalyticsState`

- **Purpose:** Empty state for Traffic and Engagement tabs when no data exists
- **Props:** `{ title: string; description: string; actionLabel?: string; actionHref?: string }`

### Structured Content Components

#### `MediaPickerField`

- **Purpose:** Reusable form field wrapping MediaPicker for selecting images from the Media Library
- **Props:**
  ```typescript
  interface MediaPickerFieldProps {
    value: string | null;       // media item ID
    onChange: (id: string | null) => void;
    label?: string;
  }
  ```
- **Renders:** Thumbnail preview when image selected, "Set Image" / "Remove Image" controls, inline MediaPicker panel when picking

---

## Files Owned

All paths relative to `ConvexPress-Admin/apps/web/src/`.

### Types

| # | File | Status | Purpose |
|---|------|--------|---------|
| 1 | `types/tabbed-editor.ts` | PENDING | PostDetailContext, DateRange, DateRangeContextValue, TrafficData, EngagementData, KpiCardData, TabDefinition |

### Hooks

| # | File | Status | Purpose |
|---|------|--------|---------|
| 2 | `hooks/useDateRange.ts` | PENDING | Hook consuming DateRangeProvider context, reading/writing URL search params |
| 3 | `hooks/usePostDetailContext.ts` | PENDING | Typed wrapper around useOutletContext<PostDetailContext>() |

### Layout Components

| # | File | Status | Purpose |
|---|------|--------|---------|
| 4 | `components/tabbed-editor/ContentDetailLayout.tsx` | PENDING | Shared layout: header + tab bar + date range provider + outlet |
| 5 | `components/tabbed-editor/DetailHeader.tsx` | PENDING | Back link, title, status badge, last saved timestamp |
| 6 | `components/tabbed-editor/TabBar.tsx` | PENDING | Four-tab navigation with route-based active state and live badges |
| 7 | `components/tabbed-editor/DateRangeProvider.tsx` | PENDING | React context for shared date range state across analytics tabs |
| 8 | `components/tabbed-editor/DateRangeSelector.tsx` | PENDING | Segmented button UI for selecting date range (7d/30d/90d/all) |

### SEO Tab Components

| # | File | Status | Purpose |
|---|------|--------|---------|
| 9 | `components/tabbed-editor/seo/SeoTabDashboard.tsx` | PENDING | Root SEO tab: score overview + analysis + previews |
| 10 | `components/tabbed-editor/seo/ScoreOverviewRow.tsx` | PENDING | Row of score gauges: SEO score, readability, content length, focus keyword |
| 11 | `components/tabbed-editor/seo/SeoScoreGauge.tsx` | PENDING | Circular gauge component for displaying 0-100 scores |

### Traffic Tab Components

| # | File | Status | Purpose |
|---|------|--------|---------|
| 12 | `components/tabbed-editor/traffic/TrafficTabDashboard.tsx` | PENDING | Root Traffic tab: KPIs + chart + source/referrer/device/geo tables |
| 13 | `components/tabbed-editor/traffic/PageviewsChart.tsx` | PENDING | Line chart showing daily pageviews over selected date range |
| 14 | `components/tabbed-editor/traffic/TrafficSourcesBreakdown.tsx` | PENDING | Horizontal bar chart or table of traffic source categories |
| 15 | `components/tabbed-editor/traffic/TopReferrersTable.tsx` | PENDING | Table of top referring domains with visit counts |
| 16 | `components/tabbed-editor/traffic/DevicesBreakdown.tsx` | PENDING | Donut chart: desktop / mobile / tablet split |
| 17 | `components/tabbed-editor/traffic/GeographyTable.tsx` | PENDING | Country/region table with flags and visit counts |

### Engagement Tab Components

| # | File | Status | Purpose |
|---|------|--------|---------|
| 18 | `components/tabbed-editor/engagement/EngagementTabDashboard.tsx` | PENDING | Root Engagement tab: KPIs + scroll depth + time + links + conversions |
| 19 | `components/tabbed-editor/engagement/ScrollDepthHeatmap.tsx` | PENDING | Vertical heatmap mapping scroll % to content sections |
| 20 | `components/tabbed-editor/engagement/TimeOnPageDistribution.tsx` | PENDING | Histogram of time-on-page buckets |
| 21 | `components/tabbed-editor/engagement/InternalLinkClicksTable.tsx` | PENDING | Table of internal links clicked with counts |
| 22 | `components/tabbed-editor/engagement/ConversionEventsTable.tsx` | PENDING | Table of conversion events with counts and rates |
| 23 | `components/tabbed-editor/engagement/ContentSectionPerformanceTable.tsx` | PENDING | Table of content sections with avg time and scroll-through rate |

### Shared Dashboard Components

| # | File | Status | Purpose |
|---|------|--------|---------|
| 24 | `components/tabbed-editor/shared/KpiCard.tsx` | PENDING | Single KPI metric card with label, value, trend |
| 25 | `components/tabbed-editor/shared/KpiCardsRow.tsx` | PENDING | Responsive grid row of 4 KPI cards |
| 26 | `components/tabbed-editor/shared/EmptyAnalyticsState.tsx` | PENDING | Empty state for tabs with no analytics data |

### Structured Content Components

| # | File | Status | Purpose |
|---|------|--------|---------|
| 27 | `components/tabbed-editor/shared/MediaPickerField.tsx` | PENDING | Reusable form field with inline Media Library picker |

### Route Files

| # | File | Status | Purpose |
|---|------|--------|---------|
| 28 | `routes/_authenticated/_admin/posts/$postId.tsx` | PENDING | Post parent layout route (PostDetailLayout) with redirect to /edit |
| 29 | `routes/_authenticated/_admin/posts/$postId/edit.tsx` | REFACTOR | Existing file -- refactor to read post data from outlet context |
| 30 | `routes/_authenticated/_admin/posts/$postId/seo.tsx` | PENDING | SEO tab route rendering SeoTabDashboard |
| 31 | `routes/_authenticated/_admin/posts/$postId/traffic.tsx` | PENDING | Traffic tab route rendering TrafficTabDashboard |
| 32 | `routes/_authenticated/_admin/posts/$postId/engagement.tsx` | PENDING | Engagement tab route rendering EngagementTabDashboard |
| 33 | `routes/_authenticated/_admin/pages/$pageId.tsx` | PENDING | Page parent layout route (PageDetailLayout) with redirect to /edit |
| 34 | `routes/_authenticated/_admin/pages/$pageId/edit.tsx` | REFACTOR | Existing file -- refactor to read page data from outlet context |
| 35 | `routes/_authenticated/_admin/pages/$pageId/seo.tsx` | PENDING | SEO tab route rendering SeoTabDashboard |
| 36 | `routes/_authenticated/_admin/pages/$pageId/traffic.tsx` | PENDING | Traffic tab route rendering TrafficTabDashboard |
| 37 | `routes/_authenticated/_admin/pages/$pageId/engagement.tsx` | PENDING | Engagement tab route rendering EngagementTabDashboard |

### Structured Content Modifications (files owned by other experts, modifications coordinated)

| # | File | Status | Purpose |
|---|------|--------|---------|
| 38 | `components/editor/structured/HeroSectionEditor.tsx` | PENDING | Add MediaPickerField for imageId, add videoUrl field |
| 39 | `components/editor/structured/TopicSectionEditor.tsx` | PENDING | Add MediaPickerField for imageId |

---

## Integration Points

### Systems Consumed

| System | Functions/Components Consumed | Purpose |
|--------|------------------------------|---------|
| **Post System** | `posts.get` query | Parent loader fetches post data |
| **Page System** | `pages.get` query | Parent loader fetches page data |
| **SEO System** | `seo.analyzePost` query, `SerpPreview`, `FacebookPreview`, `TwitterPreview`, `SeoAnalysisResults`, `SeoScoreBadge` components | SEO tab dashboard |
| **Analytics System** | `analytics.getTrafficForContent` query, `analytics.getEngagementForContent` query | Traffic and Engagement tab data |
| **Media System** | `media.get` query, `MediaPicker` component | Structured content image pickers |
| **Role & Capability System** | Capability checks (`post.edit`, `post.publish`, `post.delete`) | PostDetailContext capability flags |
| **Admin Editor UI** | `EditorLayout` component, all editor hooks and metaboxes | Content tab (unchanged) |
| **Content Editor System** | TipTap block editor (within EditorLayout) | Content tab (unchanged) |

### Tab Badge Data Sources

| Badge | Source | Query |
|-------|--------|-------|
| SEO Score | SEO System | `seo.getScoreForContent(postId)` |
| Pageview Count | Analytics System | `analytics.getPageviewCount(postId, "30d")` |
| Avg Engagement Time | Analytics System | `analytics.getAvgEngagementTime(postId, "30d")` |

---

## Current Status

**All 39 files are PENDING.** No implementation has started.

Implementation order:
1. Types and hooks (files 1-3)
2. Layout components (files 4-8)
3. Route files -- parent layouts and refactor existing edit routes (files 28-29, 33-34)
4. SEO tab (files 9-11, 30, 35)
5. Shared dashboard components (files 24-26)
6. Traffic tab (files 12-17, 31, 36)
7. Engagement tab (files 18-23, 32, 37)
8. Structured content modifications (files 27, 38-39)

---

## Related Experts

| Expert | Relationship |
|--------|-------------|
| `admin-editor-ui` | Provides EditorLayout, all metaboxes, and editor hooks used in the Content tab. This expert wraps that existing system without modifying it. |
| `content-editor-system` | Provides the TipTap block editor rendered within EditorLayout in the Content tab |
| `post-system` | Provides `posts.get` query consumed by parent loader |
| `page-system` | Provides `pages.get` query consumed by parent loader |
| `seo-system` | Provides SEO analysis queries and reusable preview components consumed by SEO tab |
| `analytics-system` | Provides traffic and engagement queries consumed by Traffic and Engagement tabs |
| `media-system` | Provides `media.get` query and MediaPicker component consumed by MediaPickerField |
| `role-capability-system` | Capabilities used for PostDetailContext flags |
| `admin-shell-ui` | Provides the admin layout shell that wraps detail pages; admin bar height determines header offset |
| `admin-list-table-ui` | "All Posts" / "All Pages" back links navigate to list table pages built by this expert |
