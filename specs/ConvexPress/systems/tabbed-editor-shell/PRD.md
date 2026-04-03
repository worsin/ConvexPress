# Tabbed Editor Shell - Product Requirements Document

**System:** Tabbed Editor Shell
**Status:** Specification Complete
**Priority:** P1 - High
**Type:** Admin UI System (frontend only)
**WordPress Equivalent:** No direct equivalent. WordPress uses a single-page editor. This is closer to HubSpot's content detail view with tabbed dashboards per content item.
**Last Updated:** 2026-04-01

---

## 1. Overview

### Problem Statement

The current post/page editor is a single monolithic page that mixes content editing with metadata. As we add SEO analysis dashboards, traffic analytics, and engagement metrics, cramming everything into one scrollable page becomes unwieldy. Admins need a structured way to view and manage all aspects of a content item without leaving the content's context.

### Solution

Transform the post/page detail view into a tabbed shell with four tabs:

1. **Content** (edit) -- The existing editor layout, relocated into a child route
2. **SEO** -- A read-only dashboard recomposing existing SEO components into a full-page analytics layout
3. **Traffic** -- Pageview analytics, traffic sources, referrers, devices, and geography
4. **Engagement** -- Scroll depth, internal link clicks, conversion events, time-on-page distribution

The tabbed shell acts as a parent layout route. Each tab is a child route rendered via an `<Outlet />`. The parent loads the post/page data once and shares it with children via outlet context.

### Goals

- Provide a structured, multi-perspective view of each content item
- Keep the existing editor experience completely unchanged (zero regressions)
- Enable per-content analytics dashboards without navigating away from the content context
- Share post data loading across all tabs (single Convex query in parent)
- Support both posts and pages with identical structure

### Non-Goals

- Building a full analytics platform (Traffic/Engagement tabs show content-specific data only)
- Real-time collaborative editing (that is a separate future system)
- Changing the editor's metabox layout or block editor functionality
- Building a global analytics dashboard (that belongs to the Dashboard System)

---

## 2. Route Structure

### Posts

| Route | Tab | Component |
|-------|-----|-----------|
| `/admin/posts/$postId` | Parent layout | `PostDetailLayout.tsx` |
| `/admin/posts/$postId/edit` | Content | Existing `EditorLayout` relocated |
| `/admin/posts/$postId/seo` | SEO | `SeoTabDashboard.tsx` |
| `/admin/posts/$postId/traffic` | Traffic | `TrafficTabDashboard.tsx` |
| `/admin/posts/$postId/engagement` | Engagement | `EngagementTabDashboard.tsx` |

### Pages

| Route | Tab | Component |
|-------|-----|-----------|
| `/admin/pages/$pageId` | Parent layout | `PageDetailLayout.tsx` |
| `/admin/pages/$pageId/edit` | Content | Existing `EditorLayout` relocated |
| `/admin/pages/$pageId/seo` | SEO | `SeoTabDashboard.tsx` |
| `/admin/pages/$pageId/traffic` | Traffic | `TrafficTabDashboard.tsx` |
| `/admin/pages/$pageId/engagement` | Engagement | `EngagementTabDashboard.tsx` |

### Default Redirect

Visiting `/admin/posts/$postId` (without a child path) redirects to `/admin/posts/$postId/edit`. Same for pages. This preserves backward compatibility -- existing links to the old edit route continue to work because the edit route path is unchanged.

### New Posts/Pages

The `/admin/posts/new` and `/admin/pages/new` routes remain as they are. They create an auto-draft and redirect to `/admin/posts/$postId/edit` once the draft is created. New content items land directly on the Content tab.

---

## 3. Parent Layout Component

### `PostDetailLayout.tsx` / `PageDetailLayout.tsx`

These are functionally identical, differentiated only by a `contentType` prop (`"post"` or `"page"`). They may share a single underlying `ContentDetailLayout` component.

#### Header Bar

| Element | Description |
|---------|-------------|
| **Back link** | "All Posts" / "All Pages" with left arrow, navigates to list table |
| **Post title** | `<h1>` displaying the post title (truncated with ellipsis if longer than ~60 chars) |
| **Status badge** | Colored badge showing current status: Draft, Pending, Published, Scheduled, Private, Trash |
| **Last saved timestamp** | "Last saved 2 minutes ago" with relative time formatting, updates reactively |

#### Tab Bar

Four tabs rendered as navigation links (not controlled tabs). Each tab is a `<Link>` to the child route so the browser URL changes and deep-linking works.

| Tab | Label | Badge | Route Suffix |
|-----|-------|-------|-------------|
| Content | "Content" | None | `/edit` |
| SEO | "SEO" | SEO score (0-100, color-coded: red <40, yellow 40-69, green 70+) | `/seo` |
| Traffic | "Traffic" | Pageview count (last 30 days, abbreviated: "1.2K") | `/traffic` |
| Engagement | "Engagement" | Avg time on page (e.g., "2m 34s") | `/engagement` |

Active tab is determined by matching the current route path. Uses TanStack Router's `useMatchRoute` or `Link`'s `activeProps`.

#### Outlet

Below the tab bar, renders `<Outlet />` which displays the active child route's component.

#### Data Loading

The parent route's `loader` fetches the post/page data via Convex query. This data is passed to child routes via `useOutletContext()` (or TanStack Router's equivalent: `routeContext` / `useRouteContext`). Children never re-fetch the post -- they consume it from the parent.

```typescript
// Outlet context shape
interface PostDetailContext {
  post: PostDocument;
  contentType: "post" | "page";
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
}
```

---

## 4. Content Tab (Edit)

### Route: `/admin/posts/$postId/edit`

The existing `EditorLayout` component is relocated into this child route. **Zero changes to editor functionality.** The EditorLayout receives the post data from outlet context instead of loading it independently.

#### Changes Required

1. The current `posts/$postId/edit.tsx` route file becomes a child of the new parent layout route
2. The route's loader no longer fetches the post (parent already did)
3. The route component reads post data from `useOutletContext<PostDetailContext>()`
4. All existing EditorLayout props, metaboxes, hooks, and behavior remain unchanged
5. The `EditorHeader` component may be simplified since the parent layout now shows the title and status

#### Backward Compatibility

- The URL `/admin/posts/$postId/edit` still works (it's the exact same path)
- The only structural change is that it's now a child route of `/admin/posts/$postId`
- All editor keyboard shortcuts, autosave, unsaved changes warnings continue to work

---

## 5. SEO Tab

### Route: `/admin/posts/$postId/seo`

A read-only dashboard that recomposes existing SEO components into a full-page layout. No new SEO logic is created -- this tab is a presentation layer over the SEO System's existing data.

#### Layout

```
SEO Tab Dashboard
  |
  +-- ScoreOverviewRow
  |     +-- Overall SEO Score (large circular gauge, 0-100)
  |     +-- Readability Score (large circular gauge)
  |     +-- Content Length indicator
  |     +-- Focus Keyword display
  |
  +-- Two-Column Grid (main + sidebar)
        |
        +-- Main Column
        |     +-- SeoAnalysisResults (full-page version, expanded)
        |     |     +-- Issues grouped by severity (Errors, Warnings, Good)
        |     |     +-- Each issue with description and fix suggestion
        |     |
        |     +-- Readability Analysis section
        |           +-- Sentence length, paragraph length, transition words, passive voice
        |
        +-- Sidebar Column
              +-- SerpPreview (Google search result preview)
              +-- FacebookPreview (Open Graph preview card)
              +-- TwitterPreview (Twitter Card preview)
              +-- Schema Markup summary (type, properties detected)
```

#### Data Source

- Reads SEO metadata from `postMeta` keys: `_seo_title`, `_seo_description`, `_seo_focus_keyword`, `_seo_noindex`, `_seo_canonical_url`, `_seo_og_title`, `_seo_og_description`, `_seo_og_image`, `_seo_twitter_title`, `_seo_twitter_description`, `_seo_twitter_image`
- SEO analysis results from the SEO System's analysis query
- Readability analysis from the SEO System's readability query

#### Interaction

- This tab is **read-only** by default. To edit SEO fields, the user clicks an "Edit SEO Settings" button that navigates to the Content tab and scrolls to/opens the SEO metabox.
- Score badges update reactively when SEO metadata changes in the Content tab.

---

## 6. Traffic Tab

### Route: `/admin/posts/$postId/traffic`

A dashboard showing traffic analytics specific to this content item.

#### Layout

```
Traffic Tab Dashboard
  |
  +-- DateRangeSelector (shared context: 7d / 30d / 90d / All Time)
  |
  +-- KPI Cards Row
  |     +-- Total Pageviews (with trend arrow vs previous period)
  |     +-- Unique Visitors
  |     +-- Avg Time on Page
  |     +-- Bounce Rate
  |
  +-- Pageviews Over Time Chart
  |     +-- Line chart with daily granularity
  |     +-- Hover tooltip showing date + count
  |
  +-- Two-Column Grid
        |
        +-- Traffic Sources breakdown
        |     +-- Horizontal bar chart or table
        |     +-- Categories: Direct, Organic Search, Social, Referral, Email, Other
        |
        +-- Top Referrers table
        |     +-- Domain, visits count, percentage
        |
        +-- Devices breakdown
        |     +-- Donut chart: Desktop / Mobile / Tablet
        |
        +-- Geography (top countries/regions)
              +-- Table with country flag, name, visit count
```

#### Data Source

- **Primary:** Built-in Analytics System (Convex-stored pageview events)
- **Secondary (optional):** GA4 integration when connected via Settings > Analytics
- If GA4 is not connected, shows data from the built-in analytics only
- If GA4 is connected, merges or replaces with GA4 data (configurable in settings)

#### Empty State

If the post has never been published or has zero pageviews:
- Show an empty state illustration with "No traffic data yet"
- Subtext: "This post hasn't received any views yet. Publish it and share it to start seeing traffic data."

---

## 7. Engagement Tab

### Route: `/admin/posts/$postId/engagement`

A dashboard showing how users interact with this specific content item.

#### Layout

```
Engagement Tab Dashboard
  |
  +-- DateRangeSelector (shared with Traffic tab via context)
  |
  +-- KPI Cards Row
  |     +-- Avg Read Time (time on page, excluding bounces)
  |     +-- Scroll Completion Rate (% who scroll to bottom)
  |     +-- Internal Link CTR (clicks on internal links / pageviews)
  |     +-- Conversion Rate (if conversion events are configured)
  |
  +-- Scroll Depth Heatmap
  |     +-- Vertical bar showing content sections (mapped to structured content headings)
  |     +-- Color gradient from green (high viewership) to red (drop-off)
  |     +-- Percentage labels at each section boundary
  |
  +-- Two-Column Grid
        |
        +-- Time on Page Distribution
        |     +-- Histogram: <10s, 10-30s, 30s-1m, 1-2m, 2-5m, 5m+
        |
        +-- Internal Link Clicks
        |     +-- Table: Link text, destination URL, click count
        |
        +-- Conversion Events (if configured)
        |     +-- Table: Event name, count, conversion rate
        |
        +-- Content Section Performance
              +-- Table: Section heading, avg time spent, scroll-through rate
```

#### Data Source

- Built-in Analytics System tracking:
  - `pageview` events with `scrollDepth` field
  - `scroll` milestone events (25%, 50%, 75%, 100%)
  - `click` events for internal links
  - `conversion` events (configurable per-post via Custom Fields)
  - `timeOnPage` calculated from session start/end or visibility API

#### Scroll Depth to Content Mapping

The engagement tab maps scroll percentages to the post's structured content sections (headings extracted from the block editor content). This gives authors insight into which sections readers engage with vs. where they drop off.

#### Empty State

Same pattern as Traffic tab: illustration + "No engagement data yet" + publish prompt.

---

## 8. Shared Date Range Selector

The Traffic and Engagement tabs share a date range context. Changing the date range on one tab persists when switching to the other.

### Implementation

- `DateRangeProvider` wraps the parent layout's `<Outlet />`
- Provides: `dateRange`, `setDateRange`, `comparisonRange` (previous equivalent period)
- State stored in URL search params (`?range=30d`) so it survives page refreshes and is shareable
- Options: `7d` | `30d` | `90d` | `all`
- Default: `30d`
- The Content and SEO tabs ignore the date range context (they don't consume it)

---

## 9. Structured Content Image/Video Pickers

### Context

The `HeroSectionEditor` and `TopicSectionEditor` components (in `components/editor/structured/`) have `imageId` fields for associating images with structured content sections. Currently these render as plain text inputs. They need proper Media Library picker integration.

### Requirements

#### HeroSectionEditor

- Add a `MediaPickerField` for `imageId` that opens an inline Media Library picker (same pattern as `FeaturedImageMetabox`)
- Show thumbnail preview when an image is selected
- "Set Image" / "Remove Image" controls
- Add a `videoUrl` field with a text input for embedding a video URL (YouTube, Vimeo)
- When `videoUrl` is set, show an embedded video preview below the input

#### TopicSectionEditor

- Add a `MediaPickerField` for `imageId` with the same inline picker pattern
- Show thumbnail preview when selected
- "Set Image" / "Remove Image" controls

### Integration

- Uses the same `MediaPicker` component from the Admin Editor UI system
- Reads media items via the Media System's queries
- The structured content editor saves `imageId` as part of the structured content JSON

---

## 10. Technical Requirements

### TanStack Router Layout Routes

The parent layout uses TanStack Router's layout route pattern:

```
routes/_authenticated/_admin/posts/$postId.tsx          -- Layout route (PostDetailLayout)
routes/_authenticated/_admin/posts/$postId/edit.tsx      -- Content tab
routes/_authenticated/_admin/posts/$postId/seo.tsx       -- SEO tab
routes/_authenticated/_admin/posts/$postId/traffic.tsx   -- Traffic tab
routes/_authenticated/_admin/posts/$postId/engagement.tsx -- Engagement tab
```

The existing `posts/$postId/edit.tsx` file is refactored to be a child of the new layout route. The layout route file (`posts/$postId.tsx`) defines the `PostDetailLayout` component and the shared loader.

### Same Pattern for Pages

```
routes/_authenticated/_admin/pages/$pageId.tsx           -- Layout route (PageDetailLayout)
routes/_authenticated/_admin/pages/$pageId/edit.tsx      -- Content tab
routes/_authenticated/_admin/pages/$pageId/seo.tsx       -- SEO tab
routes/_authenticated/_admin/pages/$pageId/traffic.tsx   -- Traffic tab
routes/_authenticated/_admin/pages/$pageId/engagement.tsx -- Engagement tab
```

### Performance

- Parent loader fetches post data once; child tabs do not re-fetch
- Analytics data (Traffic, Engagement) is loaded lazily only when the tab is active
- Charts use lightweight client-side rendering (no heavy charting library -- consider `recharts` or `@visx` if already in the project, otherwise simple SVG/CSS charts)
- SEO tab reuses existing components -- no new SEO computation logic

### Accessibility

- Tab bar uses `role="tablist"` with `role="tab"` for each tab link
- Active tab has `aria-selected="true"`
- Tab panel area has `role="tabpanel"` with `aria-labelledby` pointing to the active tab
- Keyboard navigation: Arrow keys move between tabs, Enter/Space activates
- Score badges have `aria-label` with descriptive text (e.g., "SEO score: 72 out of 100")

### Responsive Behavior

- On mobile (< `lg` breakpoint), tabs become a horizontal scrollable strip
- Tab badges hide on mobile to save space; only labels show
- Dashboard grids collapse from two columns to single column
- KPI cards stack vertically on mobile
- Charts maintain a minimum height and become scrollable horizontally if needed

---

## 11. UI Specifications

### Header Bar

- Background: `bg-background`
- Border: `border-b border-border`
- Padding: `px-6 py-4`
- Back link: `text-xs text-muted-foreground hover:text-foreground` with `ArrowLeft` icon
- Title: `text-lg font-semibold text-foreground truncate max-w-md`
- Status badge: `text-xs font-medium px-2 py-0.5` with status-appropriate background color (using CSS variables)
- Last saved: `text-xs text-muted-foreground`

### Tab Bar

- Background: `bg-muted/30`
- Border: `border-b border-border`
- Tab item: `px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground`
- Active tab: `text-foreground border-b-2 border-primary`
- Badge: `ml-2 text-xs px-1.5 py-0.5 rounded-none` with color-coded background
- Tab bar horizontal scrolling on mobile: `overflow-x-auto scrollbar-none`

### KPI Cards

- Background: `bg-card`
- Border: `border border-border`
- Padding: `p-4`
- Label: `text-xs text-muted-foreground uppercase tracking-wider`
- Value: `text-2xl font-bold text-foreground`
- Trend arrow: `text-xs` with green (up) / red (down) / muted (neutral) coloring via CSS variables

### Charts

- Line charts: Primary stroke color via `stroke-primary`
- Fill areas: `fill-primary/10`
- Grid lines: `stroke-border`
- Axis labels: `text-xs text-muted-foreground`
- Tooltip: `bg-popover text-popover-foreground border border-border shadow-md`

### Empty States

- Centered layout with illustration area
- Heading: `text-lg font-semibold text-foreground`
- Subtext: `text-sm text-muted-foreground max-w-md text-center`
- Optional CTA button: `bg-primary text-primary-foreground`

---

## 12. Dependencies

### Systems Consumed

| System | What Is Consumed |
|--------|-----------------|
| **Post System** | `posts.get` query for post data in parent loader |
| **Page System** | `pages.get` query for page data in parent loader |
| **SEO System** | SEO metadata queries, analysis results, readability scores, existing preview components |
| **Analytics System** | Pageview queries, traffic source breakdown, engagement metrics, scroll depth data |
| **Media System** | `media.get` for image thumbnails in structured content pickers |
| **Role & Capability System** | Capability checks for conditional rendering (canEdit, canPublish, canDelete) |
| **Admin Editor UI** | `EditorLayout` component used as-is in the Content tab |
| **Content Editor System** | Block editor within EditorLayout (unchanged) |
| **Custom Field System** | Conversion event configuration per post |

### New Dependencies (packages)

- None required. All charting can be done with existing dependencies or simple SVG/CSS.
- If a charting library is needed, prefer `recharts` (lightweight, React-native) -- but confirm it's not already in the project first.

---

## 13. Acceptance Criteria

### Must Have (P0)

- [ ] Parent layout route loads post/page data and renders header + tab bar + outlet
- [ ] Visiting `/admin/posts/$postId` redirects to `/admin/posts/$postId/edit`
- [ ] Content tab renders the existing EditorLayout with zero regressions
- [ ] All four tabs are navigable via tab bar links
- [ ] Active tab is visually indicated and URL reflects the active tab
- [ ] Tab bar badges show live data (SEO score, pageview count, engagement time)
- [ ] SEO tab renders existing SEO components in a dashboard layout
- [ ] Works identically for both posts and pages

### Should Have (P1)

- [ ] Traffic tab with KPI cards, pageviews chart, sources, referrers, devices, geography
- [ ] Engagement tab with scroll depth heatmap, time distribution, link clicks, section performance
- [ ] Shared date range selector between Traffic and Engagement tabs
- [ ] Date range persisted in URL search params
- [ ] Empty states for Traffic and Engagement when no data exists
- [ ] Structured content image pickers in HeroSectionEditor and TopicSectionEditor

### Nice to Have (P2)

- [ ] GA4 integration for Traffic tab data
- [ ] Export analytics data as CSV
- [ ] Comparison mode (current period vs. previous period side-by-side)
- [ ] Scroll depth to content section mapping visualization
- [ ] Video URL field with embedded preview in HeroSectionEditor

---

## 14. Migration Plan

### Step 1: Create Parent Layout Routes

Create `posts/$postId.tsx` and `pages/$pageId.tsx` as layout routes that render the detail shell with tab bar and `<Outlet />`.

### Step 2: Relocate Edit Routes

Move the existing edit route logic into child routes under the new parent. Ensure the edit route reads post data from outlet context instead of loading independently.

### Step 3: Build SEO Tab

Compose existing SEO components into the dashboard layout. No new SEO logic.

### Step 4: Build Traffic Tab

Create dashboard components with placeholder data. Wire to Analytics System queries when available.

### Step 5: Build Engagement Tab

Create dashboard components with placeholder data. Wire to Analytics System queries when available.

### Step 6: Add Structured Content Pickers

Add MediaPickerField to HeroSectionEditor and TopicSectionEditor. Add video URL field to HeroSectionEditor.

---

## 15. Open Questions

1. **Charting library:** Should we add `recharts` or build simple SVG charts inline? Decision needed before Traffic/Engagement implementation.
2. **Analytics System readiness:** The Traffic and Engagement tabs depend on the Analytics System having pageview/engagement tracking queries. If the Analytics System is not yet built, these tabs will show empty states or placeholder data.
3. **GA4 vs. built-in analytics:** Should Traffic tab prefer GA4 data when available, or always show built-in data with GA4 as supplementary?
4. **Conversion events:** How are conversion events configured per-post? Via Custom Fields, or a dedicated conversion configuration UI?
