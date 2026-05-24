# Dashboard System - Expert Knowledge Document

**System:** Dashboard System
**Status:** Complete (100%)
**Priority:** P0 - Critical
**WordPress Equivalent:** `wp-admin/index.php` (Admin Dashboard) + Front-end User Dashboard
**Last Analyzed:** 2026-02-13
**Airtable System ID:** `recRZSZD6wX9cxX5X`

---

## Quick Reference

### What This System Does

The Dashboard System provides the home screen experience for both the admin application (`/admin`) and the website user area (`/dashboard`). It is the WordPress equivalent of the `wp-admin/index.php` dashboard: a widget-based layout that aggregates content statistics, recent activity, quick-action shortcuts, and contextual widgets tailored to the user's role and capabilities. The critical upgrade over WordPress is that **all dashboard data is real-time** via Convex subscriptions -- counts, activity feeds, and moderation queues update live without page refresh.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Admin Dashboard** | `/admin` -- Widget-based grid for Administrator, Editor, Author, Contributor roles |
| **Website Dashboard** | `/dashboard` -- Personal summary for all authenticated users including Subscribers |
| **Widget Registry** | Static registry mapping widget IDs to components, capabilities, columns, and sort order |
| **Widget Preferences** | Per-user persisted layout: order, hidden/shown, collapsed/expanded, welcome dismissed |
| **Surface** | Either `"admin"` or `"website"` -- determines which dashboard context applies |
| **Screen Options** | Collapsible panel to toggle widget visibility (mirrors WordPress Screen Options tab) |
| **Quick Draft** | Inline widget form that creates a post with `status: "draft"`, `source: "quick_draft"` |
| **At a Glance** | Stats widget showing post/page/comment/user counts (mirrors `dashboard_right_now`) |
| **Activity Feed** | Widget showing recently published posts and recent comments (mirrors `dashboard_activity`) |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Data loading** | Server-side render on each page load (stale until refresh) | Real-time via Convex subscriptions (updates live) |
| **Widget storage** | `wp_usermeta` table (`meta-box-order_dashboard`, `metaboxhidden_dashboard`) | `dashboardPreferences` Convex table per user per surface |
| **Drag-and-drop** | jQuery UI Sortable | HTML5 Drag and Drop API / `@dnd-kit/core` |
| **Quick Draft** | Creates `wp_posts` with `post_status = 'draft'` | Creates `posts` with `status: "draft"`, `source: "quick_draft"` |
| **Auth** | Cookie-based WP auth, capability check via `current_user_can()` | Convex Auth auth, capability check in Convex query handler |
| **API** | PHP functions, REST API | Convex queries/mutations with typed arguments |
| **Widget rendering** | PHP callback function per widget | React component per widget with independent `useQuery` subscription |
| **Screen Options** | Top-right dropdown with checkboxes | Collapsible panel below topbar with checkboxes |

---

## Architecture Overview

### Data Flow

```
User authenticates (Convex Auth) -> Navigates to /admin or /dashboard
  |
  v
Auth check: user has 'read' capability?
  | No -> Redirect to login
  | Yes
  v
Load widget preferences: useQuery(api.dashboard.getWidgetPreferences, { surface })
  |
  v
Filter widget registry by: user capabilities AND NOT in hiddenWidgets
  |
  v
Render widget grid in user's saved order (or defaults if no preferences)
  |
  v
Each visible widget mounts and subscribes to its own Convex query independently
  |
  v
All widgets render with live data, updating in real-time via Convex subscriptions
```

### Real-Time Behavior

Every widget subscribes to its own independent Convex query. This architecture means:

1. **Widget A can update without re-rendering Widget B** -- If a new comment arrives, only the Activity widget re-renders
2. **Slow widgets don't block fast ones** -- The At a Glance widget can load before the Activity widget
3. **Convex only re-runs the specific query whose underlying data changed** -- Efficient reactive computation

Key subscriptions:
- `dashboard/getAtAGlance` -- Reactively counts posts, pages, comments, users
- `dashboard/getActivityFeed` -- Reactively fetches recent published posts and comments
- `dashboard/getQuickDrafts` -- Reactively shows user's recent drafts
- `dashboard/getWidgetPreferences` -- Reactively shows layout (updates if preferences change from another tab)

### Authentication & Authorization

- **Auth provider:** Convex Auth
- **Session resolution:** auth session -> Convex `ctx.auth.getUserIdentity()` -> look up `users` table for role
- **Capability checks happen in Convex query/mutation handlers** -- not just in the UI
- **Zero unauthorized data:** If a user lacks a capability, the Convex query returns `null` for that data slice. UI never receives data it should not display.

Capability flow per widget:
```
Widget component mounts -> calls useQuery(api.dashboard.getXxx)
  -> Convex query handler checks ctx.auth -> looks up user role
  -> Filters return data based on capabilities
  -> Returns authorized subset (or null for unauthorized sections)
```

---

## Database Schema

### dashboardPreferences Table

Stores per-user widget layout preferences for each dashboard surface. Analogous to WordPress's `meta-box-order_dashboard` and `metaboxhidden_dashboard` user meta entries.

```typescript
// convex/schema.ts

dashboardPreferences: defineTable({
  // The user this preference belongs to
  userId: v.id("users"),

  // Which dashboard surface: "admin" or "website"
  surface: v.union(v.literal("admin"), v.literal("website")),

  // Ordered list of widget IDs per column
  // Maps column key ("primary" | "secondary") to ordered widget ID array
  widgetOrder: v.object({
    primary: v.array(v.string()),
    secondary: v.array(v.string()),
  }),

  // Widget IDs that the user has hidden
  hiddenWidgets: v.array(v.string()),

  // Widget IDs that the user has collapsed (minimized)
  collapsedWidgets: v.array(v.string()),

  // Whether the welcome panel has been dismissed
  welcomeDismissed: v.boolean(),
})
  .index("by_user_surface", ["userId", "surface"]),
```

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | `v.id("users")` | Yes | Foreign key to the users table |
| `surface` | `v.union(v.literal("admin"), v.literal("website"))` | Yes | Which dashboard this preference applies to |
| `widgetOrder` | `v.object({ primary: v.array(v.string()), secondary: v.array(v.string()) })` | Yes | Ordered widget IDs per column |
| `hiddenWidgets` | `v.array(v.string())` | Yes | Widget IDs the user has hidden via Screen Options |
| `collapsedWidgets` | `v.array(v.string())` | Yes | Widget IDs the user has collapsed/minimized |
| `welcomeDismissed` | `v.boolean()` | Yes | Whether the welcome panel was dismissed |

### dashboardStats Table (Optional Cache)

Optional optimization table for high-volume sites where live counting queries become expensive. A scheduled Convex function refreshes these counts periodically (e.g., every 60 seconds).

```typescript
// convex/schema.ts

dashboardStats: defineTable({
  // Singleton per stat type, updated by scheduled function
  statType: v.union(
    v.literal("content_counts"),
    v.literal("comment_counts"),
    v.literal("user_counts")
  ),

  // The cached data (shape depends on statType)
  data: v.any(),

  // When this cache was last refreshed
  lastUpdated: v.number(),
})
  .index("by_stat_type", ["statType"]),
```

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `statType` | `v.union(v.literal("content_counts"), v.literal("comment_counts"), v.literal("user_counts"))` | Yes | Which stat category this cache entry covers |
| `data` | `v.any()` | Yes | The cached counts object (shape varies by statType) |
| `lastUpdated` | `v.number()` | Yes | Unix timestamp of last cache refresh |

### Indexes

| Table | Index Name | Fields | Purpose |
|-------|-----------|--------|---------|
| `dashboardPreferences` | `by_user_surface` | `["userId", "surface"]` | Fast lookup of a user's preferences for a specific dashboard surface |
| `dashboardStats` | `by_stat_type` | `["statType"]` | Fast lookup of cached stats by type |

### Relationships

| This Table | Foreign Key | References | Relationship |
|-----------|-------------|------------|--------------|
| `dashboardPreferences` | `userId` | `users._id` | Each user has 0-2 preference records (one per surface) |
| Quick Draft output | N/A | `posts` table | Quick Draft creates posts with `status: "draft"`, `source: "quick_draft"` |
| Activity feed data | N/A | `posts` + `comments` tables | Activity widget reads from posts and comments tables |

### Schema Design Notes

1. **Widget preferences are lightweight** -- A single `dashboardPreferences` document per user per surface. Reads are fast via the `by_user_surface` index.
2. **Dashboard stats cache is optional** -- For small-to-medium sites, live count queries via Convex are fast enough. Only needed at very high volume.
3. **Quick Draft uses the existing `posts` table** -- No separate draft storage. The `source: "quick_draft"` field distinguishes Quick Draft posts from editor-created posts.
4. **Activity feed data comes from existing tables** -- No denormalized activity table needed for v1.

---

## Actions & Functions

### Airtable-Registered Actions

| Action | Code | Roles | Category | Description |
|--------|------|-------|----------|-------------|
| View Dashboard | `dashboard.view` | Administrator, Editor, Author, Contributor | Read | Load the admin dashboard with all visible widgets |
| Quick Draft | `dashboard.quick_draft` | Administrator, Editor, Author, Contributor | Create | Create a new draft post from Quick Draft widget |
| Dismiss Widget | `dashboard.dismiss_widget` | Administrator, Editor, Author, Contributor | Toggle | Hide a specific dashboard widget |
| Reorder Widgets | `dashboard.reorder_widgets` | Administrator, Editor, Author, Contributor | Update | Save new widget positions after drag-and-drop |

### Queries

#### dashboard/getAdminDashboard (NOT IMPLEMENTED -- Superseded)

> **Note:** This aggregated query was originally planned but was replaced by individual
> per-widget queries (`getAtAGlance`, `getActivityFeed`, `getQuickDrafts`). The
> individual-query approach is superior because each widget subscribes independently,
> meaning Widget A updating does not re-render Widget B, and slow widgets do not block
> fast ones. This matches the recommended Convex reactive pattern.

#### dashboard/getWebsiteDashboard

- **Type:** query
- **Auth:** Required. Any authenticated user.
- **Args:** None
- **Returns:**
  ```typescript
  {
    myPosts: {
      counts: { published: number; draft: number; pending: number };
      recent: Array<{ _id: Id<"posts">; title: string; status: string; date: number }>;
    };
    myComments: Array<{ _id: Id<"comments">; excerpt: string; postTitle: string; status: string; date: number }>;
    unreadNotifications: {
      count: number;
      recent: Array<{ _id: Id<"siteNotifications">; message: string; type: string; date: number; link: string | null }>;
    };
    contentPerformance: Array<{ _id: Id<"posts">; title: string; views: number }> | null; // Author+ only
  }
  ```
- **Behavior:** Returns personal content summary for the authenticated user. Content performance only returned for Author+ roles.

#### dashboard/getWidgetPreferences

- **Type:** query
- **Auth:** Required.
- **Args:**
  ```typescript
  { surface: "admin" | "website" }
  ```
- **Returns:**
  ```typescript
  {
    widgetOrder: { primary: string[]; secondary: string[] };
    hiddenWidgets: string[];
    collapsedWidgets: string[];
    welcomeDismissed: boolean;
  }
  ```
- **Behavior:** Loads the current user's widget layout preferences for the given surface. Returns sensible defaults if no preferences record exists yet:
  ```typescript
  // Default widget order for admin surface:
  {
    widgetOrder: {
      primary: ["at-a-glance", "activity"],
      secondary: ["quick-draft", "moderation-queue"],
    },
    hiddenWidgets: [],
    collapsedWidgets: [],
    welcomeDismissed: false,
  }
  ```

#### dashboard/getAtAGlance

- **Type:** query
- **Auth:** Required. Minimum `read` capability.
- **Args:** None
- **Returns:**
  ```typescript
  {
    posts: { published: number; draft: number; pending: number; scheduled: number };
    pages: { published: number; draft: number };
    comments: { approved: number; pending: number; spam: number; trash: number };
    users: number;
    version: string | null; // Admin only
  }
  ```
- **Behavior:** Counts posts, pages, comments by status, and total active users. Administrators also see the ConvexPress version string. This is a separated query for independent Convex subscription (so the At a Glance widget can update independently from other widgets).

#### dashboard/getActivityFeed

- **Type:** query
- **Auth:** Required. Content filtered by role.
- **Args:** None
- **Returns:**
  ```typescript
  {
    recentPosts: Array<{
      _id: Id<"posts">;
      title: string;
      author: string;
      date: number;
      editUrl: string;
    }>;
    recentComments: Array<{
      _id: Id<"comments">;
      author: string;
      avatar: string | null;
      excerpt: string;
      postTitle: string;
      status: string;
    }>;
  }
  ```
- **Behavior:** Returns last 5 published posts and last 5 comments. Content filtering by role:
  - **Editors+:** See all posts and all comments
  - **Authors:** See all published posts + own drafts; see comments on own posts
  - **Contributors:** See own drafts only; see comments on own posts
- **Filters:** Role-based visibility (enforced in Convex query handler, not client-side)

#### dashboard/getQuickDrafts

- **Type:** query
- **Auth:** Required. Minimum `edit_posts` capability (Contributor+).
- **Args:** None
- **Returns:**
  ```typescript
  Array<{
    _id: Id<"posts">;
    title: string;
    date: number;
    excerpt: string;
  }>
  ```
- **Behavior:** Returns the current user's last 3 draft posts. Sorted by `_creationTime` descending.

### Mutations

#### dashboard/quickDraft

- **Type:** mutation
- **Auth:** Required. Minimum `edit_posts` capability (Contributor+).
- **Args:**
  ```typescript
  {
    title: v.string(),   // Required, non-empty
    content: v.string(),  // Optional content body
  }
  ```
- **Returns:** `Id<"posts">` (the new draft's ID)
- **Behavior:**
  1. Validate user has `edit_posts` capability
  2. Validate title is non-empty (trim whitespace)
  3. Create post record: `{ title, content, status: "draft", source: "quick_draft", authorId: currentUser._id, _creationTime: now }`
  4. Emit `dashboard.quick_drafted` event via Event Dispatcher
  5. The Post System's `post.created` event should also fire (triggered by the event dispatcher routing)
  6. Return the new post ID
- **Events:** `dashboard.quick_drafted`, routed to `post.created` handlers
- **Errors:**
  - `"Unauthorized"` -- User lacks `edit_posts` capability
  - `"Title is required"` -- Empty or whitespace-only title

#### dashboard/saveWidgetPreferences

- **Type:** mutation
- **Auth:** Required.
- **Args:**
  ```typescript
  {
    surface: v.union(v.literal("admin"), v.literal("website")),
    widgetOrder?: v.optional(v.object({
      primary: v.array(v.string()),
      secondary: v.array(v.string()),
    })),
    hiddenWidgets?: v.optional(v.array(v.string())),
    collapsedWidgets?: v.optional(v.array(v.string())),
    welcomeDismissed?: v.optional(v.boolean()),
  }
  ```
- **Returns:** `void`
- **Behavior:** Upsert the `dashboardPreferences` record for the current user + surface. Only updates fields that are provided (partial update pattern). If no record exists, creates one with defaults for unprovided fields.

#### dashboard/dismissWidget

- **Type:** mutation
- **Auth:** Required.
- **Args:**
  ```typescript
  {
    surface: v.union(v.literal("admin"), v.literal("website")),
    widgetId: v.string(),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Load or create `dashboardPreferences` for user + surface
  2. Add `widgetId` to the `hiddenWidgets` array (if not already present)
  3. Save
- **Events:** `dashboard.widget_dismissed`

#### dashboard/restoreWidget

- **Type:** mutation
- **Auth:** Required.
- **Args:**
  ```typescript
  {
    surface: v.union(v.literal("admin"), v.literal("website")),
    widgetId: v.string(),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Load `dashboardPreferences` for user + surface
  2. Remove `widgetId` from the `hiddenWidgets` array
  3. Save
- **Events:** `dashboard.widget_restored`

#### dashboard/toggleWidgetCollapse

- **Type:** mutation
- **Auth:** Required.
- **Args:**
  ```typescript
  {
    surface: v.union(v.literal("admin"), v.literal("website")),
    widgetId: v.string(),
  }
  ```
- **Returns:** `void`
- **Behavior:** Toggle `widgetId` in/out of the `collapsedWidgets` array. If present, remove it (expand). If absent, add it (collapse).

#### dashboard/reorderWidgets

- **Type:** mutation
- **Auth:** Required.
- **Args:**
  ```typescript
  {
    surface: v.union(v.literal("admin"), v.literal("website")),
    widgetOrder: v.object({
      primary: v.array(v.string()),
      secondary: v.array(v.string()),
    }),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Load or create `dashboardPreferences` for user + surface
  2. Replace the `widgetOrder` field with the new order
  3. Save
- **Events:** `dashboard.widgets_reordered`

### Scheduled Functions (Optional)

#### dashboard/refreshStatsCache

- **Type:** Convex cron (scheduled function)
- **Schedule:** Every 60 seconds
- **Behavior:** Count posts by status, pages by status, comments by status, and active users. Write the results to the `dashboardStats` table as singleton entries. Only needed for high-volume sites where live counting is expensive.

---

## Events

### dashboard.viewed

- **Type:** Analytics
- **Triggered By:** User loading `/admin` or `/dashboard`
- **Payload:**
  ```typescript
  {
    userId: Id<"users">;
    surface: "admin" | "website";
    role: string;
    timestamp: number;
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: None
  - Audit Log: No (configurable via Settings -- high-volume, typically ignored)
  - Side Effects: Analytics tracking only

### dashboard.quick_drafted

- **Type:** Content
- **Triggered By:** `dashboard.quick_draft` action (quickDraft mutation)
- **Payload:**
  ```typescript
  {
    userId: Id<"users">;
    postId: Id<"posts">;
    title: string;
    surface: "admin" | "website";
  }
  ```
- **Subscribers:**
  - Email: None (Post System handles `post.created` notifications)
  - Site: None
  - Audit Log: Yes
  - Side Effects: Routes to Post System's `post.created` event handlers with `source: "quick_draft"` metadata

### dashboard.widget_dismissed

- **Type:** Preference
- **Triggered By:** `dashboard.dismiss_widget` action (dismissWidget mutation)
- **Payload:**
  ```typescript
  {
    userId: Id<"users">;
    widgetId: string;
    surface: "admin" | "website";
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: None
  - Audit Log: No
  - Side Effects: None

### dashboard.widget_restored

- **Type:** Preference
- **Triggered By:** `dashboard.restoreWidget` mutation
- **Payload:**
  ```typescript
  {
    userId: Id<"users">;
    widgetId: string;
    surface: "admin" | "website";
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: None
  - Audit Log: No
  - Side Effects: None

### dashboard.widgets_reordered

- **Type:** Preference
- **Triggered By:** `dashboard.reorder_widgets` action (reorderWidgets mutation)
- **Payload:**
  ```typescript
  {
    userId: Id<"users">;
    surface: "admin" | "website";
    newOrder: { primary: string[]; secondary: string[] };
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: None
  - Audit Log: No
  - Side Effects: None

### dashboard.welcome_dismissed

- **Type:** Preference
- **Triggered By:** saveWidgetPreferences with `welcomeDismissed: true`
- **Payload:**
  ```typescript
  {
    userId: Id<"users">;
    surface: "admin" | "website";
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: None
  - Audit Log: No
  - Side Effects: None

---

## Admin Routes & UI

### Admin Dashboard (`/admin`)

- **Purpose:** Main admin home page. Widget-based grid showing site-wide statistics, recent activity, quick actions, and role-specific panels. First screen after admin login.
- **WordPress Equivalent:** `wp-admin/index.php`
- **Layout:** `_admin` (standard admin layout with left sidebar + top admin bar)
- **Auth:** Required. Minimum Contributor (Level 40).
- **Roles:** Administrator, Editor, Author, Contributor
- **Airtable Route Record:** `recWYFAtyqt6CGqBh`

#### Key Components

| Component | Purpose |
|-----------|---------|
| `admin-dashboard.tsx` | Main container: orchestrates widget grid, Screen Options, welcome panel |
| `screen-options.tsx` | Collapsible panel below topbar with widget visibility checkboxes and column layout selector |
| `widget-grid.tsx` | 2-column (desktop) / 1-column (mobile) draggable grid container |
| `widget-card.tsx` | Generic widget wrapper: header bar (title + collapse toggle + optional gear icon) + body |
| `welcome-panel.tsx` | Dismissable welcome banner with role-appropriate quick links |
| `at-a-glance.tsx` | Stats widget: post/page/comment/user counts |
| `activity-feed.tsx` | Recent published posts + recent comments with inline actions |
| `quick-draft.tsx` | Title + content form with Save Draft button, plus recent drafts list |
| `moderation-queue.tsx` | Pending comment count badge + link to `/admin/comments/pending` (Editor+ only) |
| `system-health.tsx` | Convex status, storage usage, last deployment timestamp (Admin only) |

#### UI Layout

```
+----------------------------------------------------------+
|  ADMIN TOPBAR                              [Screen Options]
+----------------------------------------------------------+
|  S |                                                      |
|  I |  Welcome to ConvexPress!                    [Dismiss] |
|  D |  Quick links: Create Post | Manage Settings | ...   |
|  E |                                                      |
|  B |  +------------------------+  +---------------------+ |
|  A |  | AT A GLANCE         [-]|  | QUICK DRAFT      [-]| |
|  R |  | 12 Posts  (3 drafts)   |  | Title: [________]   | |
|    |  |  4 Pages  (1 draft)    |  | Content:            | |
|    |  | 28 Comments            |  | [________________]  | |
|    |  |  5 Pending moderation  |  | [Save Draft]        | |
|    |  | 142 Users              |  |                     | |
|    |  | ConvexPress v1.0       |  | Your Recent Drafts: | |
|    |  +------------------------+  | - My draft post     | |
|    |                              | - Another draft     | |
|    |  +------------------------+  +---------------------+ |
|    |  | ACTIVITY            [-]|                          |
|    |  | Recently Published:    |                          |
|    |  | - "Post Title" by...   |                          |
|    |  | Recent Comments:       |                          |
|    |  |   [avatar] John on ... |                          |
|    |  |   Approve | Reply |..  |                          |
|    |  +------------------------+                          |
+----------------------------------------------------------+
```

#### Screen Options Panel

```
+----------------------------------------------------------+
| Screen Options                                    [Close] |
| [ ] Welcome Panel   [x] At a Glance   [x] Quick Draft   |
| [x] Activity        [ ] System Health                     |
| Layout: (o) 2 columns  ( ) 1 column                      |
+----------------------------------------------------------+
```

#### Data Requirements
- `useQuery(api.dashboard.getWidgetPreferences, { surface: "admin" })` -- widget layout
- `useQuery(api.dashboard.getAtAGlance)` -- stats (independent subscription)
- `useQuery(api.dashboard.getActivityFeed)` -- recent posts/comments
- `useQuery(api.dashboard.getQuickDrafts)` -- user's drafts

#### User Interactions
- Drag-and-drop widgets between columns and within columns
- Collapse/expand widgets by clicking the title bar `[-]` toggle
- Show/hide widgets via Screen Options checkboxes
- Dismiss the Welcome Panel
- Create a draft post via the Quick Draft form
- Click comment actions (Approve, Reply, Spam, Trash) inline in Activity widget
- Click post titles to navigate to edit pages

#### Real-Time Updates
- All count widgets update in real-time (new post published -> At a Glance count increments immediately)
- Activity feed updates when new posts are published or new comments arrive
- Quick Drafts list updates when user creates a new draft
- Moderation count badge updates when comments are submitted or moderated

---

## Website Routes

### User Dashboard (`/dashboard`)

- **Purpose:** Personal dashboard for authenticated website visitors. Shows user's own content summary, recent comments, notifications, and quick-link cards.
- **WordPress Equivalent:** No direct equivalent (WordPress does not have a front-end user dashboard by default; this is a ConvexPress enhancement)
- **Layout:** `_dashboard` (website layout with simplified nav for logged-in users)
- **Auth:** Required. Minimum Subscriber (Level 20).
- **Roles:** All authenticated users
- **App:** Website (TanStack Start -- SSR with hydration)
- **Airtable Route Record:** `recfXmSigeeUCETOn`

#### UI Layout

```
+----------------------------------------------------------+
|  SITE HEADER / NAV                                        |
+----------------------------------------------------------+
|  Welcome back, Jane!                                      |
|                                                           |
|  +------------------+  +------------------+               |
|  | MY CONTENT       |  | MY NOTIFICATIONS |               |
|  | 5 Published Posts|  | 3 unread          |               |
|  | 2 Drafts         |  | Recent:           |               |
|  | Recent:          |  | - "John replied   |               |
|  | - Post Title     |  |    to your..."     |               |
|  | [View All Posts] |  | [View All]         |               |
|  +------------------+  +------------------+               |
|                                                           |
|  +------------------+  +------------------+               |
|  | MY COMMENTS      |  | QUICK LINKS      |               |
|  | 12 total         |  | - Edit Profile    |               |
|  | - "Great arti.."|  | - Account Settings|               |
|  | [View All]       |  | - Write a Post    |               |
|  +------------------+  | - View Site       |               |
|                        +------------------+               |
+----------------------------------------------------------+
```

#### Key Components

| Component | Purpose |
|-----------|---------|
| `user-dashboard.tsx` | Main container with static 2-column grid (no drag/drop in v1) |
| `my-content.tsx` | User's own published/draft post counts and recent list |
| `my-comments.tsx` | User's recent comments with status indicators |
| `my-notifications.tsx` | Unread notification count + recent notification feed |
| `content-performance.tsx` | Top 5 posts by view count (Author+ only) |
| `quick-links.tsx` | Action shortcut cards: Edit Profile, Account Settings, Write a Post (Contributor+), View Site |

#### Data Requirements
- `useQuery(api.dashboard.getWebsiteDashboard)` -- all personal dashboard data

#### Sub-Routes (Owned by Other Systems)

| Path | Name | Owner System |
|------|------|-------------|
| `/dashboard` | User Dashboard Home | **Dashboard System** (this system) |
| `/dashboard/profile` | Edit Profile | User Profile System |
| `/dashboard/comments` | My Comments | Comment System |
| `/dashboard/notifications` | My Notifications | Site Notification System |
| `/dashboard/settings` | Account Settings | Auth System |

#### SEO
- Not indexed (behind auth). No meta tags needed.

#### Caching
- SSR with hydration. Convex subscriptions take over after hydration for real-time updates.

---

## Notifications

### The Dashboard is a Consumer, Not a Producer

The Dashboard System does **not** produce email or site notifications. It is a **consumer** of data from other systems' notification pipelines.

### Inbound Notifications (Consumed by Dashboard)

| Source System | Data Displayed | Widget |
|--------------|----------------|--------|
| Comment System | Pending moderation count, recent comments | Activity, Moderation Queue |
| Post System | Recently published posts, draft counts | Activity, At a Glance |
| Site Notification System | Unread notification count (in topbar + website dashboard) | My Notifications |
| User Profile System | Active user count | At a Glance |

### Outbound Notifications (Produced by Dashboard)

| Scenario | Type | Implementation |
|----------|------|---------------|
| Quick Draft created | None (delegated) | The Post System handles `post.created` notifications. Dashboard emits `dashboard.quick_drafted` which the Event Dispatcher routes to the Post System's existing handlers. No duplicate notification. |

### Email Notifications

None. The Dashboard System does not send emails.

### Site Notifications

None. The Dashboard System does not create site notifications.

---

## Role & Capability Matrix

### Admin Dashboard Access

| Feature | Administrator | Editor | Author | Contributor | Subscriber |
|---------|:------------:|:------:|:------:|:-----------:|:----------:|
| Access `/admin` dashboard | Yes | Yes | Yes | Yes | No |
| At a Glance - full stats | Yes (+ version, health) | Content counts | Own content counts | Own draft counts | -- |
| Activity - Recent Posts | All posts | All posts | All published posts | Own drafts only | -- |
| Activity - Recent Comments | All + actions | All + actions | On own posts | On own posts | -- |
| Activity - Moderation Count | Yes | Yes | No | No | -- |
| Quick Draft widget | Yes | Yes | Yes | Yes | -- |
| Quick Draft - Save Draft | Yes | Yes | Yes | Yes | -- |
| System Health widget | Yes | No | No | No | -- |
| Welcome Panel | Yes (admin links) | Yes (editor links) | Yes (author links) | Yes (contributor links) | -- |
| Screen Options | Yes | Yes | Yes | Yes | -- |
| Widget reorder (drag/drop) | Yes | Yes | Yes | Yes | -- |
| Widget dismiss/restore | Yes | Yes | Yes | Yes | -- |

### Website Dashboard Access

| Feature | Administrator | Editor | Author | Contributor | Subscriber |
|---------|:------------:|:------:|:------:|:-----------:|:----------:|
| Access `/dashboard` | Yes | Yes | Yes | Yes | Yes |
| My Content widget | All content | All content | Own content | Own drafts | -- |
| My Comments widget | Yes | Yes | Yes | Yes | Yes |
| My Notifications widget | Yes | Yes | Yes | Yes | Yes |
| Content Performance | Yes | Yes | Yes | No | No |
| Quick Links - Write Post | Yes | Yes | Yes | Yes | No |
| Quick Links - Edit Profile | Yes | Yes | Yes | Yes | Yes |

### Capability Mapping

| Action Code | Required Capability | WordPress Equivalent |
|-------------|-------------------|---------------------|
| `dashboard.view` | `read` | `read` |
| `dashboard.quick_draft` | `edit_posts` | `edit_posts` |
| `dashboard.dismiss_widget` | `read` | `read` |
| `dashboard.reorder_widgets` | `read` | `read` |

---

## Dependencies

### Depends On

| System | Classification | What It Provides |
|--------|---------------|-----------------|
| **Post System** (`rec6ZGXFgdJ8mU51f`) | **Hard** | Post counts (by status), recent published posts, draft posts for Activity and At a Glance widgets. Quick Draft creates posts via the Post System's `posts` table. Dashboard cannot function without the Post System. |
| **Comment System** (`rechYtZ2IKH1CzDJ6`) | **Hard** | Comment counts (by status), recent comments for Activity widget, pending moderation count for Moderation Queue widget. Dashboard is significantly degraded without comments. |
| **Auth System** | **Hard** | User authentication and identity resolution. Dashboard requires auth to load any data. |
| **Role & Capability System** | **Hard** | Capability checks for filtering widget visibility and data access. Every query checks capabilities. |
| **Event Dispatcher System** | **Medium** | Dashboard events are emitted through the dispatcher. Dashboard functions without it but loses event-driven integration (audit logging, analytics). |
| **User Profile System** | **Medium** | Active user count for At a Glance widget. Website dashboard shows profile links. Dashboard can function with degraded data if User Profile is unavailable. |
| **Site Notification System** | **Soft** | Website dashboard displays unread notification counts. Admin topbar shows notification badge. Nice-to-have but not blocking. |
| **Settings System** | **Soft** | Dashboard may display site settings status. Optional. |

### Depended On By

**No systems depend on the Dashboard System.** It is a **leaf node** in the dependency graph -- it consumes data from other systems but provides no data to them.

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)

- [ ] `convex/dashboard/queries.ts` - 6 queries (getAdminDashboard, getWebsiteDashboard, getWidgetPreferences, getAtAGlance, getActivityFeed, getQuickDrafts)
- [ ] `convex/dashboard/mutations.ts` - 6 mutations (quickDraft, saveWidgetPreferences, dismissWidget, restoreWidget, toggleWidgetCollapse, reorderWidgets)
- [ ] `convex/dashboard/helpers.ts` - 4 helpers (getContentCounts, getCommentCounts, getUserCounts, filterByCapability)
- [ ] `convex/schema.ts` additions - 2 tables (dashboardPreferences, dashboardStats)
- [ ] `convex/dashboard/crons.ts` - 1 optional scheduled function (refreshStatsCache)

### Admin Frontend (ConvexPress-Admin/apps/web/)

- [ ] `src/routes/admin/index.tsx` - Admin Dashboard route page
- [ ] `src/features/dashboard/components/admin-dashboard.tsx` - Main dashboard container
- [ ] `src/features/dashboard/components/screen-options.tsx` - Screen Options panel
- [ ] `src/features/dashboard/components/widget-grid.tsx` - 2-column draggable grid
- [ ] `src/features/dashboard/components/widget-card.tsx` - Generic widget card wrapper
- [ ] `src/features/dashboard/components/welcome-panel.tsx` - Dismissable welcome panel
- [ ] `src/features/dashboard/components/widgets/at-a-glance.tsx` - Stats widget
- [ ] `src/features/dashboard/components/widgets/activity-feed.tsx` - Activity widget
- [ ] `src/features/dashboard/components/widgets/quick-draft.tsx` - Quick Draft widget
- [ ] `src/features/dashboard/components/widgets/moderation-queue.tsx` - Moderation widget
- [ ] `src/features/dashboard/components/widgets/system-health.tsx` - System Health widget
- [ ] `src/features/dashboard/hooks/use-dashboard-data.ts` - Combined dashboard queries hook
- [ ] `src/features/dashboard/hooks/use-widget-preferences.ts` - Widget preferences hook
- [ ] `src/features/dashboard/hooks/use-widget-drag.ts` - Drag-and-drop hook
- [ ] `src/features/dashboard/lib/widget-registry.ts` - Widget definitions registry
- [ ] `src/features/dashboard/lib/dashboard-utils.ts` - Helper functions
- [ ] `src/features/dashboard/types.ts` - TypeScript types

### Website Frontend (ConvexPress-Website/apps/web/)

- [ ] `src/routes/dashboard/index.tsx` - Website User Dashboard route page
- [ ] `src/features/dashboard/components/user-dashboard.tsx` - Main user dashboard container
- [ ] `src/features/dashboard/components/widgets/my-content.tsx` - User's content summary
- [ ] `src/features/dashboard/components/widgets/my-comments.tsx` - User's comments
- [ ] `src/features/dashboard/components/widgets/my-notifications.tsx` - Notification feed
- [ ] `src/features/dashboard/components/widgets/content-performance.tsx` - View counts (Author+)
- [ ] `src/features/dashboard/components/widgets/quick-links.tsx` - Action shortcut cards
- [ ] `src/features/dashboard/hooks/use-user-dashboard.ts` - Website dashboard data hook
- [ ] `src/features/dashboard/types.ts` - TypeScript types

---

## Edge Cases & Gotchas

1. **First-time user with no preferences:** When `getWidgetPreferences` returns no record for a user+surface combo, the query must return sensible defaults (not null or empty). The Welcome Panel should be visible for new users.

2. **Quick Draft with empty content:** WordPress allows Quick Draft with an empty content body (title only). ConvexPress should mirror this -- validate that title is non-empty but allow empty content. Do NOT require both fields.

3. **Quick Draft creates a real post:** The Quick Draft widget creates an actual `posts` record with `status: "draft"`. It MUST go through the same creation path that the full editor uses (same validation, same event emission). The `source: "quick_draft"` field distinguishes it for display purposes but it is a full post record.

4. **Concurrent widget reorder race condition:** If a user rapidly drags widgets, multiple `reorderWidgets` mutations fire in quick succession. Use optimistic updates on the client (move widget instantly) and let the last-write-wins pattern handle server state. Since each user only reorders their own preferences, there is no cross-user conflict.

5. **Capability changes mid-session:** If an admin demotes a user's role while they have the dashboard open, the Convex subscription will re-evaluate the query and the widget data will update (or disappear) in real-time. The UI must handle widgets that return `null` gracefully.

6. **Activity widget comment actions:** When a user clicks "Approve" or "Spam" on a comment in the Activity widget, this triggers a Comment System mutation, not a Dashboard mutation. The Dashboard is just rendering the comment data with action buttons that call the Comment System's API.

7. **Moderation count for non-editors:** Contributors and Authors should NOT see the pending moderation count or the moderation queue widget. The Convex query must return `null` for `moderationCount` for these roles, and the widget registry must enforce `minCapability: "moderate_comments"` for the moderation queue widget.

8. **Widget IDs must be stable:** Widget IDs in the registry (`"at-a-glance"`, `"activity"`, `"quick-draft"`, etc.) are persisted in user preferences. Changing a widget ID would orphan existing user preferences. Treat widget IDs as immutable after initial deployment.

9. **Website dashboard has no drag-and-drop in v1:** The website dashboard (`/dashboard`) uses a static layout. Widget order is fixed. Do not implement the drag/drop infrastructure for the website surface in v1.

10. **Subscriber access to admin:** Subscribers (Level 20) can NOT access `/admin`. They can only access `/dashboard`. The admin route must enforce minimum Contributor (Level 40) access, not just `read` capability.

11. **Content Performance depends on view tracking:** The Content Performance widget (top 5 posts by views) depends on a view counter being implemented in the Post System. If view tracking is not yet available, this widget should either show a "Coming soon" state or be omitted from the v1 widget registry.

12. **Screen Options state and new widgets:** When a new widget is added to the registry after a user has already saved preferences, it should appear as visible (not hidden) in the user's dashboard. The preference system should treat "not in hiddenWidgets" as "visible" rather than requiring explicit inclusion in a "visibleWidgets" list.

13. **Dashboard stats cache staleness:** If the `dashboardStats` cache is enabled, the At a Glance widget may show slightly stale counts. The UI should indicate cache freshness (e.g., "Updated 45 seconds ago") and the live query should be used as a fallback if the cache is more than 5 minutes old.

14. **Welcome panel role-specific links:** The Welcome Panel shows different quick links based on role. If a user's role changes, the panel content must update. Since it reads from the user's current role at render time, this is naturally handled by Convex reactivity, but the component must not cache the role.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `wp_dashboard_setup` (action hook) | Widget registry in `widget-registry.ts` | Static array, no hook system needed |
| `wp_add_dashboard_widget()` | `ADMIN_WIDGETS.push({...})` | Add entry to widget registry array |
| `remove_meta_box('widget_id', 'dashboard', 'side')` | `dismissWidget({ widgetId })` mutation | Persisted in dashboardPreferences |
| `get_user_meta($id, 'meta-box-order_dashboard')` | `getWidgetPreferences({ surface: "admin" })` query | Returns full preferences object |
| `update_user_meta($id, 'metaboxhidden_dashboard')` | `saveWidgetPreferences({ hiddenWidgets })` mutation | Partial update |
| `wp_count_posts()` | `getContentCounts()` helper in `helpers.ts` | Counts posts by status via Convex query |
| `wp_count_comments()` | `getCommentCounts()` helper in `helpers.ts` | Counts comments by status |
| `count_users()` | `getUserCounts()` helper in `helpers.ts` | Counts active users |
| `wp_dashboard_right_now()` (callback) | `AtAGlanceWidget` React component | Independent Convex subscription |
| `wp_dashboard_site_activity()` (callback) | `ActivityFeedWidget` React component | Independent Convex subscription |
| `wp_dashboard_quick_press()` (callback) | `QuickDraftWidget` React component | Form + recent drafts |
| `wp_insert_post(['post_status' => 'draft'])` | `quickDraft({ title, content })` mutation | Creates post with `source: "quick_draft"` |
| `current_user_can('edit_posts')` | Capability check in Convex query handler | `ctx.auth` -> user lookup -> role -> capability check |
| `get_current_screen()->id === 'dashboard'` | Route match: `/admin` index route | TanStack Router path matching |
| jQuery UI Sortable | `@dnd-kit/core` (recommended) | Better accessibility and mobile touch support |

---

## Widget Registry Reference

### Admin Widgets

| ID | Title | Default Column | Default Order | Min Capability | Notes |
|----|-------|---------------|---------------|----------------|-------|
| `welcome` | Welcome to ConvexPress | N/A (full-width above grid) | N/A | `read` | Dismissable. Not in grid. |
| `at-a-glance` | At a Glance | `primary` | 0 | `read` | Content/user statistics |
| `activity` | Activity | `primary` | 1 | `read` | Recent posts + comments |
| `quick-draft` | Quick Draft | `secondary` | 0 | `edit_posts` | Draft creation form |
| `moderation-queue` | Moderation Queue | `secondary` | 1 | `moderate_comments` | Editor+ only |
| `system-health` | System Health | `secondary` | 2 | `manage_options` | Administrator only |

### Website Widgets

| ID | Title | Min Capability | Notes |
|----|-------|----------------|-------|
| `my-content` | My Content | `read` | User's own posts summary |
| `my-comments` | My Comments | `read` | User's comment history |
| `my-notifications` | My Notifications | `read` | Unread notification feed |
| `content-performance` | Content Performance | `edit_published_posts` | Author+ only, depends on view tracking |
| `quick-links` | Quick Links | `read` | Action shortcut cards |

---

## Performance Considerations

1. **Lazy-load non-critical widgets:** At a Glance and Activity should load immediately. System Health and Welcome can be lazily loaded with `React.lazy()`.

2. **Independent subscriptions per widget:** Each widget uses its own `useQuery` call. This means Convex only re-runs the query whose underlying data actually changed, avoiding unnecessary re-renders.

3. **Optimistic updates for preferences:** When a user drags a widget, update local state immediately and fire the mutation in the background. If the mutation fails, revert.

4. **Fixed-height skeleton placeholders:** Each widget should have a skeleton loading state with a fixed height to prevent layout shift during initial load.

5. **Pagination limits:** Activity widget shows 5 posts and 5 comments. Quick Drafts shows 3 items. Do not load more unless the user navigates to the full list page.

6. **Required indexes on dependent tables:**
   - `posts` by `status` -- for counting posts by status
   - `posts` by `authorId` + `status` -- for user's own drafts
   - `posts` by `_creationTime` desc -- for recent published posts
   - `comments` by `_creationTime` desc -- for recent comments
   - `comments` by `status` -- for moderation count
