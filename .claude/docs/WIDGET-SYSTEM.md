# Widget System - Expert Knowledge Document

**System:** Widget System
**Status:** Complete (100%)
**Priority:** P3 - Low
**Complexity:** Medium
**Layer:** Full Stack
**Category:** Content & Marketing
**WordPress Equivalent:** Widget API (WP_Widget, register_sidebar, dynamic_sidebar)
**Airtable System ID:** `rec8sTACl3vqnXeZ3`
**Last Analyzed:** 2026-02-13

---

## Quick Reference

### What This System Does

The Widget System provides configurable, placeable content blocks that site administrators can arrange into designated **widget areas** (sidebars, footers, header zones) on the public-facing website. This is the SmithHarper equivalent of WordPress's Widget API -- the system that powers sidebar content, footer columns, and any other "slot" a theme defines for dynamic, admin-configurable content. **These are NOT dashboard widgets** (which are admin-only internal tools managed by the Dashboard System).

### Key Concepts

| Concept | Description | WordPress Equivalent |
|---------|-------------|---------------------|
| **Widget Type** | A reusable content block definition (e.g., "Recent Posts", "Search"). Has a render component and config schema. Code-defined, not stored in DB. | `WP_Widget` class |
| **Widget Instance** | A specific configured placement of a widget type in an area. Each instance has its own settings. | Numbered widget instance (e.g., `recent-posts-2`) |
| **Widget Area** | A named slot in the website layout where widget instances can be placed. Database-backed. | `register_sidebar()` registered sidebar |
| **Widget Order** | The vertical position of widget instances within an area (0-based numeric). | `sidebars_widgets` option ordering |
| **Inactive Widget** | A widget instance that exists but is not assigned to any area (`isActive: false`). | `wp_inactive_widgets` pseudo-sidebar |
| **Widget Type Registry** | Static TypeScript module defining all available widget types. Shared between admin and website apps. | In-memory widget class registry |

### Built-in Widget Types (16 total)

| Type ID | Name | Category | Key Config Fields |
|---------|------|----------|-------------------|
| `search` | Search | utility | placeholder text |
| `recent-posts` | Recent Posts | content | number (1-20), showDate, showThumbnail, categoryId |
| `recent-comments` | Recent Comments | content | number (1-20) |
| `categories` | Categories | navigation | display (list/dropdown), showCounts, showHierarchy |
| `tag-cloud` | Tag Cloud | navigation | maxTags (5-100), taxonomy |
| `archives` | Archives | navigation | display (list/dropdown), showCounts, type (monthly/yearly) |
| `pages` | Pages | navigation | sortBy, excludePageIds |
| `nav-menu` | Navigation Menu | navigation | menuId (select from Menu System) |
| `custom-html` | Custom HTML | utility | HTML content (code editor, sanitized with DOMPurify) |
| `rich-text` | Text / Rich Text | content | content (basic rich text editor) |
| `image` | Image | media | image (media picker), altText, linkUrl, linkTarget |
| `video` | Video | media | videoUrl (YouTube/Vimeo/direct), aspectRatio |
| `audio` | Audio | media | audioUrl or mediaId |
| `rss-feed` | RSS Feed | content | feedUrl, numItems (1-20), showSummary, showAuthor, showDate |
| `calendar` | Calendar | content | (title only) |
| `social-links` | Social Links | social | profiles array of { platform, url } |

### Default Widget Areas (seeded on first install)

| Slug | Name | isDefault |
|------|------|-----------|
| `sidebar-1` | Primary Sidebar | true |
| `sidebar-2` | Secondary Sidebar | true |
| `footer-1` | Footer Column 1 | true |
| `footer-2` | Footer Column 2 | true |
| `footer-3` | Footer Column 3 | true |
| `header-1` | Header Widget Area | true |

### SmithHarper vs WordPress

| Aspect | WordPress | SmithHarper |
|--------|-----------|-------------|
| Widget area definition | Code-only (`register_sidebar()`) | Database-backed + admin UI. Admins can create areas without code. |
| Widget instance storage | Serialized PHP arrays in `wp_options` | Typed Convex documents with per-field validation |
| Widget type storage | PHP classes registered in memory | TypeScript registry module (static code) |
| Real-time updates | None (requires page refresh) | Convex subscriptions update the live site instantly |
| Block-based widgets | WP 5.8+ block editor per area | Not in v1. Classic typed-config approach. |
| Customizer live preview | Built-in | Not in v1. Admins can open site in another tab (Convex updates live). |
| Widget visibility conditions | Plugin required (e.g., "Widget Visibility") | Built-in via `visibilityConditions` on widget areas |
| Inactive widgets | `wp_inactive_widgets` pseudo-sidebar | `isActive: false` boolean flag on instance |
| Drag-and-drop | jQuery UI Sortable | `@dnd-kit/core` (modern, accessible, touch-friendly) |
| Database | Serialized in `wp_options` | Convex real-time documents with typed indexes |
| Auth gating | `edit_theme_options` capability | `manage_widgets` capability (Administrator only) |

---

## Architecture Overview

### Data Flow

1. **Admin creates widget area** -> `createWidgetArea` mutation -> `widgetAreas` table -> `widget.area_created` event -> audit log
2. **Admin adds widget instance** -> selects type from registry -> `addWidgetInstance` mutation -> validates config against type schema -> `widgetInstances` table -> `widget.instance_added` event
3. **Admin reorders widgets** -> drag-and-drop in admin UI -> 500ms client debounce -> `reorderWidgets` mutation -> updates `order` fields -> `widget.reordered` event
4. **Website renders widget area** -> `<WidgetArea slug="sidebar-1" />` -> `getAreaWidgets` query (reactive) -> maps instances to render components -> SSR output
5. **Real-time propagation** -> Admin saves widget config -> Convex mutation updates document -> website's Convex subscription fires -> React re-renders widget area (< 1 second)

### System Layers

```
Admin App (TanStack Router + Vite)
├── Widget Management Page (/admin/widgets)
│   ├── Available Widgets Panel (widget type registry)
│   ├── Widget Areas Panel (droppable areas with instances)
│   └── Inactive Widgets Panel
├── Widget Area Settings Page (/admin/widgets/areas)
│   └── Area CRUD with visibility conditions
└── Uses: @dnd-kit/core for drag-and-drop

Convex Backend (ConvexPress-Admin/packages/backend/)
├── widgetAreas table
├── widgetInstances table
├── widgetRssCache table (for RSS Feed widget)
├── Widget queries (6 queries)
├── Widget mutations (10 mutations)
├── Widget actions (1 - RSS feed fetching)
└── Widget internal functions (3 - seeding, caching)

Website App (TanStack Start SSR)
├── <WidgetArea slug="..."> component
├── <WidgetRenderer> with type mapping
├── 16 individual widget render components
├── Error boundary per widget instance
└── Visibility condition evaluation
```

### Real-Time Behavior

- **Widget area data is reactive via Convex subscriptions.** When an admin adds, removes, reorders, or reconfigures widgets, the change propagates to all connected website clients in real-time (< 1 second).
- **Each `<WidgetArea>` component runs its own independent query** (`getAreaWidgets`). This means rendering the sidebar does not block footer widget loading.
- **SSR + hydration flow:** Widget areas are server-side rendered for SEO. After hydration, Convex subscriptions establish for real-time updates.
- **Optimistic updates in admin:** Drag-and-drop reorder updates local state immediately, fires mutation in background, reverts on failure.

### Authentication & Authorization

- **All admin operations** require WorkOS authentication + `manage_widgets` capability (Administrator role only).
- **Public widget rendering** on the website requires no authentication -- widget data is public.
- **Admin queries** (e.g., `getInactiveWidgets`) require authentication.
- **Public queries** (e.g., `getAreaWidgets`, `getWidgetArea`) do not require authentication.
- The `manage_widgets` capability maps to WordPress's `edit_theme_options` capability, which is Administrator-only.

---

## Database Schema

### widgetAreas Table

Defines the named slots in the website layout where widgets can be placed.

```typescript
widgetAreas: defineTable({
  // Unique slug identifier for this area (e.g., "sidebar-1", "footer-1")
  // Format: lowercase letters, numbers, hyphens only. Max 50 chars.
  slug: v.string(),

  // Human-readable name (e.g., "Primary Sidebar", "Footer Column 1")
  name: v.string(),

  // Description of where this area appears in the layout
  description: v.optional(v.string()),

  // CSS class(es) applied to the area wrapper on the front-end
  wrapperClass: v.optional(v.string()),

  // CSS class for individual widget containers within this area
  widgetClass: v.optional(v.string()),

  // CSS class for widget titles within this area
  titleClass: v.optional(v.string()),

  // HTML tag for widget wrapper (default: "section")
  widgetTag: v.optional(v.string()),

  // HTML tag for widget title (default: "h3")
  titleTag: v.optional(v.string()),

  // Visibility conditions: which page types this area appears on
  // If null/empty, area appears on all pages
  visibilityConditions: v.optional(v.object({
    pageTypes: v.optional(v.array(v.union(
      v.literal("home"),
      v.literal("blog"),
      v.literal("single_post"),
      v.literal("single_page"),
      v.literal("category_archive"),
      v.literal("tag_archive"),
      v.literal("author_archive"),
      v.literal("search"),
      v.literal("404")
    ))),
    specificPageIds: v.optional(v.array(v.string())),
    excludePageIds: v.optional(v.array(v.string())),
  })),

  // Sort order for displaying areas in the admin UI
  sortOrder: v.number(),

  // Whether this is a system-default area (cannot be deleted)
  isDefault: v.boolean(),

  // Timestamps
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.id("users"),
})
  .index("by_slug", ["slug"])
  .index("by_sort_order", ["sortOrder"]),
```

### widgetInstances Table

The actual configured placements of widget types into areas.

```typescript
widgetInstances: defineTable({
  // The widget type slug (e.g., "recent-posts", "search", "custom-html")
  // References the widget type registry in code, not a DB table
  widgetType: v.string(),

  // The widget area this instance is assigned to (undefined = inactive)
  areaId: v.optional(v.id("widgetAreas")),

  // Display title shown above the widget on the front-end (optional)
  title: v.optional(v.string()),

  // Widget-specific configuration (shape varies by widgetType)
  // Validated per-type in mutations using the widget type registry
  config: v.any(),

  // Position order within the assigned area (0-based)
  order: v.number(),

  // Whether this widget instance is active
  // false = in the "Inactive Widgets" holding area
  isActive: v.boolean(),

  // Timestamps
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.id("users"),
  updatedBy: v.id("users"),
})
  .index("by_area", ["areaId", "order"])
  .index("by_area_active", ["areaId", "isActive", "order"])
  .index("by_type", ["widgetType"])
  .index("by_active", ["isActive"]),
```

### widgetRssCache Table (implied by RSS Feed widget)

Caches parsed RSS feed data to avoid excessive external HTTP requests.

```typescript
widgetRssCache: defineTable({
  // The RSS feed URL
  url: v.string(),

  // Parsed feed items
  items: v.array(v.object({
    title: v.string(),
    link: v.string(),
    description: v.optional(v.string()),
    author: v.optional(v.string()),
    pubDate: v.optional(v.string()),
  })),

  // When this cache entry was last fetched
  fetchedAt: v.number(),
})
  .index("by_url", ["url"]),
```

### Indexes

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `widgetAreas` | `by_slug` | `["slug"]` | Look up area by unique slug for rendering and validation |
| `widgetAreas` | `by_sort_order` | `["sortOrder"]` | List areas in admin UI in sorted order |
| `widgetInstances` | `by_area` | `["areaId", "order"]` | Fetch all widgets for a specific area in display order |
| `widgetInstances` | `by_area_active` | `["areaId", "isActive", "order"]` | Fetch only active widgets for a specific area (website rendering) |
| `widgetInstances` | `by_type` | `["widgetType"]` | Find all instances of a specific widget type (admin diagnostics) |
| `widgetInstances` | `by_active` | `["isActive"]` | Fetch all inactive widgets for the Inactive Widgets panel |
| `widgetRssCache` | `by_url` | `["url"]` | Look up cached RSS feed by URL |

### Relationships

| This Table | Field | References | Purpose |
|-----------|-------|------------|---------|
| `widgetInstances.areaId` | `v.id("widgetAreas")` | `widgetAreas._id` | Which area the instance is placed in |
| `widgetAreas.createdBy` | `v.id("users")` | `users._id` | Who created the area |
| `widgetInstances.createdBy` | `v.id("users")` | `users._id` | Who created the instance |
| `widgetInstances.updatedBy` | `v.id("users")` | `users._id` | Who last updated the instance |

### Schema Design Notes

1. **Widget types are NOT stored in the database** -- they are code-defined in a TypeScript registry module. Only instances (placements) and areas (slots) are database-backed.
2. **Widget areas are database-backed (unlike WordPress)** -- WordPress registers areas in theme PHP code. SmithHarper stores them in the DB so admins can create/edit areas without code changes.
3. **`config` field is `v.any()` in schema but validated per-type in mutations** -- Each widget type defines its own config schema. Mutations validate `config` against the type's schema before saving.
4. **Inactive widgets use `isActive: false`** instead of a separate pseudo-area, which is simpler to query and filter than WordPress's approach.
5. **Widget order uses a numeric `order` field** -- On reorder, all widgets in the affected area get `order` values reassigned sequentially (0, 1, 2, ...).

---

## Actions & Functions

### Queries

#### widgets/getWidgetAreas
- **Type:** query
- **Auth:** Not required (public data). Admin queries can include inactive widgets.
- **Args:**
  ```typescript
  { includeInactive?: boolean }
  ```
- **Returns:** `Array<WidgetArea & { widgets: WidgetInstance[] }>` -- All widget areas with their assigned widget instances, ordered.
- **Behavior:** Fetch all areas by sort order. For each area, fetch assigned instances ordered by `order`. If `includeInactive` is true, also include inactive instances.
- **Reactive:** Yes (Convex subscription).

#### widgets/getAreaWidgets
- **Type:** query
- **Auth:** Not required (public data for website rendering).
- **Args:**
  ```typescript
  { areaSlug: string }
  ```
- **Returns:** `WidgetInstance[]` -- Ordered array of active widget instances for the area. Empty array if area has no widgets or doesn't exist.
- **Behavior:** Look up area by slug using `by_slug` index. Query instances using `by_area_active` index with `isActive: true`. Return in order.
- **Reactive:** Yes. Primary query used by the website's `<WidgetArea>` component.

#### widgets/getInactiveWidgets
- **Type:** query
- **Auth:** Required. Administrator only (`manage_widgets`).
- **Args:** None.
- **Returns:** `WidgetInstance[]` -- Array of inactive widget instances with their type and config.
- **Behavior:** Query `widgetInstances` using `by_active` index with `isActive: false`.

#### widgets/getWidgetArea
- **Type:** query
- **Auth:** Not required.
- **Args:**
  ```typescript
  { slug?: string, areaId?: Id<"widgetAreas"> }
  ```
- **Returns:** `WidgetArea | null`
- **Behavior:** Look up by slug (using `by_slug` index) or by ID. Return single document or null.

#### widgets/getWidgetInstance
- **Type:** query
- **Auth:** Required. Administrator only.
- **Args:**
  ```typescript
  { instanceId: Id<"widgetInstances"> }
  ```
- **Returns:** `WidgetInstance & { area?: WidgetArea }` -- Instance document with area information.
- **Behavior:** Fetch instance by ID. If it has an `areaId`, also fetch the area document.

#### widgets/getWidgetTypeRegistry
- **Type:** query
- **Auth:** Not required (used by both admin and website).
- **Args:** None.
- **Returns:** `Array<{ typeId, name, description, icon, category, configSchema, defaultConfig }>`
- **Behavior:** Returns the complete widget type registry metadata (excluding render components). This is a code-defined constant, not a database query. Exposed as a query for API consistency.

### Mutations

#### widgets/createWidgetArea
- **Type:** mutation
- **Auth:** Required. `manage_widgets` capability (Administrator).
- **Args:**
  ```typescript
  {
    name: string,
    slug: string,
    description?: string,
    wrapperClass?: string,
    widgetClass?: string,
    titleClass?: string,
    widgetTag?: string,
    titleTag?: string,
    visibilityConditions?: {
      pageTypes?: ("home" | "blog" | "single_post" | "single_page" | "category_archive" | "tag_archive" | "author_archive" | "search" | "404")[],
      specificPageIds?: string[],
      excludePageIds?: string[],
    },
  }
  ```
- **Returns:** `Id<"widgetAreas">`
- **Behavior:**
  1. Validate slug uniqueness (query `by_slug` index)
  2. Validate slug format (lowercase alphanumeric + hyphens, max 50 chars)
  3. Assign `sortOrder` as max(existing) + 1
  4. Set `isDefault: false`
  5. Set `createdAt`, `updatedAt` to `Date.now()`, `createdBy` to current user
  6. Insert `widgetAreas` record
  7. Emit `widget.area_created` event
- **Events:** `widget.area_created`
- **Errors:** `"Slug already exists"`, `"Invalid slug format"`

#### widgets/updateWidgetArea
- **Type:** mutation
- **Auth:** Required. `manage_widgets` capability.
- **Args:**
  ```typescript
  {
    areaId: Id<"widgetAreas">,
    name?: string,
    slug?: string,
    description?: string,
    wrapperClass?: string,
    widgetClass?: string,
    titleClass?: string,
    widgetTag?: string,
    titleTag?: string,
    visibilityConditions?: { ... },
  }
  ```
- **Returns:** void
- **Behavior:**
  1. Validate area exists
  2. If slug is being changed, validate uniqueness
  3. Patch the document with provided fields
  4. Update `updatedAt` to `Date.now()`
  5. Emit `widget.area_updated` event
- **Events:** `widget.area_updated`
- **Errors:** `"Area not found"`, `"Slug already exists"`

#### widgets/deleteWidgetArea
- **Type:** mutation
- **Auth:** Required. `manage_widgets` capability.
- **Args:**
  ```typescript
  { areaId: Id<"widgetAreas">, force?: boolean }
  ```
- **Returns:** void
- **Behavior:**
  1. Validate area exists
  2. Check if area is `isDefault: true` -- reject deletion of default areas
  3. Check for active widget instances in this area
     - If instances exist and `force` is false: throw error
     - If instances exist and `force` is true: set all instances to `isActive: false`, `areaId: undefined`
  4. Delete the area document
  5. Emit `widget.area_deleted` event with `widgetsDeactivated` count
- **Events:** `widget.area_deleted`
- **Errors:** `"Cannot delete default area"`, `"Area has active widgets. Use force=true to deactivate them."`

#### widgets/addWidgetInstance
- **Type:** mutation
- **Auth:** Required. `manage_widgets` capability.
- **Args:**
  ```typescript
  {
    widgetType: string,
    areaId: Id<"widgetAreas">,
    title?: string,
    config: Record<string, any>,
  }
  ```
- **Returns:** `Id<"widgetInstances">`
- **Behavior:**
  1. Validate `widgetType` exists in the registry
  2. Validate `areaId` references an existing area
  3. Validate `config` against the widget type's configuration schema
  4. Determine `order` value (max order in area + 1, or 0 if area is empty)
  5. Insert `widgetInstances` record with `isActive: true`
  6. Set timestamps and user IDs
  7. Emit `widget.instance_added` event
- **Events:** `widget.instance_added`
- **Errors:** `"Unknown widget type"`, `"Area not found"`, `"Invalid widget configuration"`

#### widgets/updateWidgetInstance
- **Type:** mutation
- **Auth:** Required. `manage_widgets` capability.
- **Args:**
  ```typescript
  { instanceId: Id<"widgetInstances">, title?: string, config?: Record<string, any> }
  ```
- **Returns:** void
- **Behavior:**
  1. Validate instance exists
  2. If config is provided, validate against the widget type's configuration schema
  3. Patch the document
  4. Update `updatedAt` and `updatedBy`
  5. Emit `widget.instance_updated` event
- **Events:** `widget.instance_updated`
- **Errors:** `"Instance not found"`, `"Invalid widget configuration"`

#### widgets/deleteWidgetInstance
- **Type:** mutation
- **Auth:** Required. `manage_widgets` capability.
- **Args:**
  ```typescript
  { instanceId: Id<"widgetInstances"> }
  ```
- **Returns:** void
- **Behavior:**
  1. Validate instance exists
  2. Record the `areaId` for reorder
  3. Delete the document
  4. Reorder remaining widgets in the area (close the gap: reassign sequential order values)
  5. Emit `widget.instance_deleted` event
- **Events:** `widget.instance_deleted`
- **Errors:** `"Instance not found"`

#### widgets/deactivateWidgetInstance
- **Type:** mutation
- **Auth:** Required. `manage_widgets` capability.
- **Args:**
  ```typescript
  { instanceId: Id<"widgetInstances"> }
  ```
- **Returns:** void
- **Behavior:**
  1. Validate instance exists and is currently active (`isActive: true`)
  2. Record original `areaId`
  3. Set `isActive: false`, clear `areaId` to `undefined`
  4. Reorder remaining widgets in the original area (close gap)
  5. Update `updatedAt` and `updatedBy`
  6. Emit `widget.instance_deactivated` event
- **Events:** `widget.instance_deactivated`
- **Errors:** `"Instance not found"`, `"Instance is already inactive"`

#### widgets/reactivateWidgetInstance
- **Type:** mutation
- **Auth:** Required. `manage_widgets` capability.
- **Args:**
  ```typescript
  { instanceId: Id<"widgetInstances">, areaId: Id<"widgetAreas">, order?: number }
  ```
- **Returns:** void
- **Behavior:**
  1. Validate instance exists and is currently inactive (`isActive: false`)
  2. Validate target area exists
  3. Set `isActive: true`, set `areaId`, assign `order` (end of area if not specified)
  4. Reorder widgets in the target area to accommodate the new widget
  5. Update `updatedAt` and `updatedBy`
  6. Emit `widget.instance_reactivated` event
- **Events:** `widget.instance_reactivated`
- **Errors:** `"Instance not found"`, `"Instance is already active"`, `"Area not found"`

#### widgets/reorderWidgets
- **Type:** mutation
- **Auth:** Required. `manage_widgets` capability.
- **Args:**
  ```typescript
  { areaId: Id<"widgetAreas">, instanceIds: Id<"widgetInstances">[] }
  ```
- **Returns:** void
- **Behavior:**
  1. Validate area exists
  2. Validate all instance IDs belong to this area and are active
  3. Update each instance's `order` field to match array position (0, 1, 2, ...)
  4. Update `updatedAt` on each instance
  5. Emit `widget.reordered` event
- **Events:** `widget.reordered`
- **Errors:** `"Area not found"`, `"Instance does not belong to this area"`

#### widgets/moveWidgetToArea
- **Type:** mutation
- **Auth:** Required. `manage_widgets` capability.
- **Args:**
  ```typescript
  { instanceId: Id<"widgetInstances">, targetAreaId: Id<"widgetAreas">, targetOrder?: number }
  ```
- **Returns:** void
- **Behavior:**
  1. Validate instance and target area exist
  2. Record source `areaId` for reorder
  3. Update instance: `areaId` = target, `order` = target position (end if not specified)
  4. Reorder widgets in source area (close gap)
  5. Reorder widgets in target area (make room)
  6. Update `updatedAt` and `updatedBy`
  7. Emit `widget.instance_moved` event
- **Events:** `widget.instance_moved`
- **Errors:** `"Instance not found"`, `"Area not found"`

### Actions

#### widgets/fetchRssFeed
- **Type:** action (external HTTP call)
- **Auth:** Not required (called from website rendering context).
- **Args:**
  ```typescript
  { feedUrl: string, maxItems: number }
  ```
- **Returns:** `Array<{ title, link, description?, author?, pubDate? }>`
- **Behavior:**
  1. Check `widgetRssCache` for a cached entry with matching URL
  2. If cached entry exists and `Date.now() - fetchedAt < 15 * 60 * 1000` (15 min), return cached items
  3. Otherwise, fetch the RSS feed URL via HTTP
  4. Parse the XML response
  5. Slice to `maxItems`
  6. Cache the result in `widgetRssCache` via internal mutation
  7. Return parsed items
- **Error Handling:** If fetch fails, return cached data if available. If no cache, return empty array with error flag.

### Internal Functions

#### widgets/seedDefaultAreas
- **Type:** internal mutation
- **Purpose:** Seed default widget areas on first install.
- **Schedule:** One-time on fresh deployment (called by system initialization).
- **Behavior:** Check if any widget areas exist. If not, create the 6 default areas (sidebar-1, sidebar-2, footer-1, footer-2, footer-3, header-1), all marked `isDefault: true`.

#### widgets/getCachedFeed
- **Type:** internal query
- **Purpose:** Read RSS cache for a given URL.
- **Args:** `{ url: string }`
- **Returns:** Cache document or null.

#### widgets/cacheFeed
- **Type:** internal mutation
- **Purpose:** Write/update RSS cache entry.
- **Args:** `{ url: string, items: RssItem[], fetchedAt: number }`
- **Behavior:** Upsert cache record by URL.

---

## Events

### widget.area_created
- **Type:** System
- **Triggered By:** `widget.create_area`
- **Payload:**
  ```typescript
  { areaId: Id<"widgetAreas">, name: string, slug: string, createdBy: Id<"users">, timestamp: number }
  ```
- **Subscribers:**
  - Email: None
  - Site: Info toast for acting admin ("Widget area '{name}' created")
  - Audit Log: Yes

### widget.area_updated
- **Type:** System
- **Triggered By:** `widget.update_area`
- **Payload:**
  ```typescript
  { areaId: Id<"widgetAreas">, slug: string, changes: string[], updatedBy: Id<"users">, timestamp: number }
  ```
- **Subscribers:**
  - Audit Log: Yes

### widget.area_deleted
- **Type:** System
- **Triggered By:** `widget.delete_area`
- **Payload:**
  ```typescript
  { areaId: Id<"widgetAreas">, slug: string, name: string, deletedBy: Id<"users">, timestamp: number, widgetsDeactivated: number }
  ```
- **Subscribers:**
  - Site: Warning toast if widgets were deactivated ("Widget area '{name}' deleted. {n} widgets deactivated.")
  - Audit Log: Yes

### widget.instance_added
- **Type:** System
- **Triggered By:** `widget.add_instance`
- **Payload:**
  ```typescript
  { instanceId: Id<"widgetInstances">, widgetType: string, areaSlug: string, title: string | undefined, createdBy: Id<"users">, timestamp: number }
  ```
- **Subscribers:**
  - Site: Info toast ("'{type}' widget added to {area}")
  - Audit Log: Yes

### widget.instance_updated
- **Type:** System
- **Triggered By:** `widget.update_instance`
- **Payload:**
  ```typescript
  { instanceId: Id<"widgetInstances">, widgetType: string, changes: string[], updatedBy: Id<"users">, timestamp: number }
  ```
- **Subscribers:**
  - Site: Success toast ("Widget settings saved")
  - Audit Log: Yes

### widget.instance_deleted
- **Type:** System
- **Triggered By:** `widget.delete_instance`
- **Payload:**
  ```typescript
  { instanceId: Id<"widgetInstances">, widgetType: string, areaSlug: string, deletedBy: Id<"users">, timestamp: number }
  ```
- **Subscribers:**
  - Audit Log: Yes

### widget.instance_deactivated
- **Type:** System
- **Triggered By:** `widget.deactivate_instance`
- **Payload:**
  ```typescript
  { instanceId: Id<"widgetInstances">, widgetType: string, fromAreaSlug: string, deactivatedBy: Id<"users">, timestamp: number }
  ```
- **Subscribers:**
  - Audit Log: Yes

### widget.instance_reactivated
- **Type:** System
- **Triggered By:** `widget.reactivate_instance`
- **Payload:**
  ```typescript
  { instanceId: Id<"widgetInstances">, widgetType: string, toAreaSlug: string, reactivatedBy: Id<"users">, timestamp: number }
  ```
- **Subscribers:**
  - Audit Log: Yes

### widget.instance_moved
- **Type:** System
- **Triggered By:** `widget.move`
- **Payload:**
  ```typescript
  { instanceId: Id<"widgetInstances">, widgetType: string, fromAreaSlug: string, toAreaSlug: string, movedBy: Id<"users">, timestamp: number }
  ```
- **Subscribers:**
  - Audit Log: Yes

### widget.reordered
- **Type:** System
- **Triggered By:** `widget.reorder`
- **Payload:**
  ```typescript
  { areaSlug: string, newOrder: string[], reorderedBy: Id<"users">, timestamp: number }
  ```
- **Subscribers:**
  - Audit Log: Yes

### Event Notes

1. **All widget events are low-priority for notifications** -- Widget management is administrative. Events exist primarily for **audit logging**.
2. **Reorder events are high-frequency during drag operations** -- Use a 500ms debounce on the client before calling the reorder mutation. Only emit the final reorder state, not intermediate drag positions.
3. **Area deletion with force deactivation** should include the deactivated widget count in the payload for full audit trail.

---

## Admin Routes & UI

### Widget Management (`/admin/widgets`)

- **Purpose:** Drag-and-drop interface for managing widget instances in widget areas. Main widget administration page.
- **WordPress Equivalent:** `wp-admin/widgets.php` (Classic widget editor)
- **Auth:** Required. Administrator only (`manage_widgets`).
- **Layout:** Two-column layout. Left panel: available widget types + inactive widgets. Right panel: widget areas with their assigned instances.

#### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| `WidgetManagementPage` | `widget-management-page.tsx` | Main layout with left/right panels |
| `AvailableWidgetsPanel` | `available-widgets-panel.tsx` | Left panel: widget type cards (draggable sources). Search/filter box at top. |
| `WidgetAreasPanel` | `widget-areas-panel.tsx` | Right panel: all areas with assigned instances |
| `WidgetAreaSection` | `widget-area-section.tsx` | Single area: collapsible section, droppable zone, ordered widget list |
| `WidgetInstanceCard` | `widget-instance-card.tsx` | Single widget: drag handle, type icon/name, expandable config form, Save/Delete/Deactivate buttons |
| `WidgetConfigForm` | `widget-config-form.tsx` | Dynamic config form generator that reads `configSchema` from the type registry |
| `WidgetField` | `widget-field.tsx` | Individual form field renderer (string, number, boolean, select, media, array) |
| `WidgetTypeCard` | `widget-type-card.tsx` | Available widget type card (draggable source for creating new instances) |
| `InactiveWidgetsPanel` | `inactive-widgets-panel.tsx` | Inactive widgets holding area (droppable zone for deactivation) |

#### Data Requirements
- `getWidgetAreas({ includeInactive: true })` - All areas with all instances
- `getInactiveWidgets()` - Deactivated instances
- `getWidgetTypeRegistry()` - Available widget types

#### User Interactions
- Click or drag a widget type card to an area to create a new instance
- Drag widget instance cards within an area to reorder
- Drag widget instance cards between areas to move
- Drag widget instance cards to "Inactive Widgets" to deactivate
- Click widget instance card to expand/collapse config form
- Edit config form fields and click "Save" to persist
- Click "Delete" to permanently remove an instance
- Click "Deactivate" to move to inactive holding

#### Keyboard Alternative (accessibility)
- Focus a widget instance card
- Up/Down arrow keys to change order within the area
- Enter to expand/collapse configuration
- Tab to move between areas

### Widget Area Settings (`/admin/widgets/areas`)

- **Purpose:** CRUD management for widget areas themselves (create, edit, delete, reorder areas).
- **WordPress Equivalent:** No direct equivalent (WordPress defines areas in theme code only).
- **Auth:** Required. Administrator only (`manage_widgets`).
- **Layout:** List of areas with drag-handle for reordering. Each area shows name, slug, widget count, and Edit button. "+ New Area" button at top.

#### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| `WidgetAreaSettingsPage` | `widget-area-settings-page.tsx` | Full area management page |
| `WidgetAreaForm` | `widget-area-form.tsx` | Create/edit area form (name, slug, description, HTML settings, visibility conditions) |
| `WidgetAreaList` | `widget-area-list.tsx` | Sortable list of widget areas with drag handles |

#### Edit Area Form Fields
- **Name** (text input)
- **Slug** (text input, validated: lowercase alphanumeric + hyphens)
- **Description** (text input)
- **Widget Tag** (select: section, div, article, aside)
- **Title Tag** (select: h2, h3, h4, h5)
- **Wrapper CSS** (text input for Tailwind classes)
- **Widget CSS** (text input for Tailwind classes)
- **Title CSS** (text input for Tailwind classes)
- **Visibility** (checkboxes for page types: All pages, Home, Blog, Single Post, Single Page, Archives, Search Results, 404 Page)

#### Data Requirements
- `getWidgetAreas()` - All areas with widget counts

### Admin Sidebar Navigation

Widgets appears under "Appearance" in the admin sidebar:

```
Appearance
  Widgets         -> /admin/widgets
  Widget Areas    -> /admin/widgets/areas
  Menus           -> (Menu System)
  Theme           -> (Theme System, future)
```

If no "Appearance" section exists yet, Widgets can be a top-level sidebar item until the Theme System is implemented.

---

## Website Routes

### Widget Area Rendering (no dedicated route)

Widget areas do not have their own routes. They are rendered inline within theme layouts using the `<WidgetArea>` component.

- **Purpose:** Render public-facing widget content in theme-defined positions.
- **Usage:** `<WidgetArea slug="sidebar-1" className="..." />`
- **SEO:** Widget areas are SSR-rendered. Content like "Recent Posts" lists, category links, and navigation menus are crawlable in the initial HTML.
- **Data Requirements:** `getAreaWidgets({ areaSlug })` per area (independent queries).
- **Caching:** Convex query cache. RSS Feed widget has additional 15-minute server-side cache.

#### Key Website Components

| Component | File | Purpose |
|-----------|------|---------|
| `WidgetArea` | `widget-area.tsx` | Container component that queries and renders all widgets for a given area slug. Returns null if area is empty. |
| `WidgetRenderer` | `widget-renderer.tsx` | Maps widget type ID to render component. Wraps each widget in a section with title and error boundary. |
| `WidgetErrorBoundary` | `widget-error-boundary.tsx` | Catches errors in individual widget render components. Renders null fallback. |
| `WidgetSkeleton` | `widget-skeleton.tsx` | Loading skeleton shown while widget data loads. |
| 16 type-specific render components | `types/*.tsx` | Individual render components for each widget type (search-widget.tsx, recent-posts-widget.tsx, etc.) |

#### Visibility Condition Evaluation

```typescript
function shouldShowWidgetArea(area: WidgetArea, pageContext: PageContext): boolean {
  const conditions = area.visibilityConditions;
  if (!conditions || !conditions.pageTypes?.length) return true; // No conditions = show everywhere
  if (conditions.pageTypes.includes(pageContext.pageType)) return true;
  if (conditions.specificPageIds?.includes(pageContext.pageId)) return true;
  if (conditions.excludePageIds?.includes(pageContext.pageId)) return false;
  return false;
}
```

---

## Notifications

### Email Notifications

The Widget System does **not** produce email notifications. Widget management is a low-impact administrative operation. This is consistent with WordPress.

### Site Notifications

| Name | Event | Message Template | Type | Persistent | Recipient |
|------|-------|-----------------|------|-----------|-----------|
| Widget Area Created | `widget.area_created` | "Widget area '{name}' created" | Info | No | Acting admin (toast) |
| Widget Area Deleted | `widget.area_deleted` | "Widget area '{name}' deleted. {n} widgets deactivated." | Warning | No (toast) | Acting admin |
| Widget Added | `widget.instance_added` | "'{type}' widget added to {area}" | Info | No | Acting admin (toast) |
| Widget Config Saved | `widget.instance_updated` | "Widget settings saved" | Success | No | Acting admin (toast) |

All site notifications are **transient toast messages** shown only to the acting administrator as confirmation feedback. They are NOT persisted in the notification bell or sent to other users.

---

## Role & Capability Matrix

### Capability Requirements

| Capability | Description | Roles | WordPress Equivalent |
|-----------|-------------|-------|---------------------|
| `manage_widgets` | Create, edit, delete, and reorder widgets and widget areas | Administrator | `edit_theme_options` |

### Access Matrix

| Feature | Administrator | Editor | Author | Contributor | Subscriber |
|---------|:------------:|:------:|:------:|:-----------:|:----------:|
| Access `/admin/widgets` | Yes | No | No | No | No |
| Access `/admin/widgets/areas` | Yes | No | No | No | No |
| Create widget areas | Yes | No | No | No | No |
| Edit widget areas | Yes | No | No | No | No |
| Delete widget areas | Yes | No | No | No | No |
| Add widget instances | Yes | No | No | No | No |
| Edit widget instance config | Yes | No | No | No | No |
| Delete widget instances | Yes | No | No | No | No |
| Deactivate/reactivate widgets | Yes | No | No | No | No |
| Reorder widgets | Yes | No | No | No | No |
| Move widgets between areas | Yes | No | No | No | No |
| View widgets on website (public) | Yes | Yes | Yes | Yes | Yes |

### Capability Mapping

| Action Code | Required Capability |
|-------------|-------------------|
| `widget.create_area` | `manage_widgets` |
| `widget.update_area` | `manage_widgets` |
| `widget.delete_area` | `manage_widgets` |
| `widget.add_instance` | `manage_widgets` |
| `widget.update_instance` | `manage_widgets` |
| `widget.delete_instance` | `manage_widgets` |
| `widget.deactivate_instance` | `manage_widgets` |
| `widget.reactivate_instance` | `manage_widgets` |
| `widget.reorder` | `manage_widgets` |
| `widget.move` | `manage_widgets` |
| `widget.view_admin` | `manage_widgets` |

---

## Dependencies

### Depends On

| System | Record ID | Type | What It Provides |
|--------|-----------|------|-----------------|
| **Menu System** | `rec0l38apHevOSX0b` | **Hard** | The "Navigation Menu" widget type renders menus managed by the Menu System. Without it, the nav-menu widget cannot function. |
| **Role & Capability System** | `recLjkb6BJlxqHTQv` | **Hard** | Capability checks (`manage_widgets`) for all admin mutation operations. Without it, no authorization can be enforced. |
| **Auth System** | -- | **Hard** | WorkOS authentication for admin widget management. Required for all mutations. |
| **Event Dispatcher System** | -- | **Medium** | Widget events are dispatched through the Event Dispatcher for audit logging and notifications. System works without it but loses audit trail. |
| **Post System** | -- | **Medium** | "Recent Posts" widget queries the posts table. Widget renders gracefully if posts system is unavailable (empty list). |
| **Comment System** | -- | **Medium** | "Recent Comments" widget queries the comments table. Graceful degradation if unavailable. |
| **Taxonomy System** | -- | **Medium** | "Categories" and "Tag Cloud" widgets query taxonomy tables. Graceful degradation. |
| **Page System** | -- | **Medium** | "Pages" widget queries the pages table. Graceful degradation. |
| **Media System** | -- | **Soft** | "Image", "Video", "Audio" widgets use media from the Media System. Can fall back to direct URLs. |
| **Search System** | -- | **Soft** | "Search" widget submits to the Search System's search route. Can submit to a basic `/search` URL. |
| **Content Editor System** | -- | **Soft** | "Text/Rich Text" widget uses a simplified version of the content editor. Can fall back to a plain textarea. |
| **Audit Log System** | -- | **Soft** | Widget events may be logged. System functions without audit logging. |
| **Settings System** | -- | **Soft** | Widget areas may reference site settings for rendering context. Not strictly required. |

### Depended On By

| System | Type | What They Need |
|--------|------|----------------|
| **Theme System** | **Soft** | Theme defines where widget areas render in the layout. Theme templates reference widget area slugs via `<WidgetArea slug="...">`. Widget System functions without a Theme System (areas can be placed manually in layout code). |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| Convex | Widget data storage, real-time subscriptions |
| WorkOS AuthKit | Administrator authentication |
| TanStack Router | Admin widget management routing |
| TanStack Start | Website widget area rendering (SSR) |
| `@dnd-kit/core` | Drag-and-drop for widget reorder and area assignment |
| `rss-parser` (or similar) | RSS Feed widget type requires parsing external RSS feeds |
| `dompurify` | Custom HTML widget content sanitization |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)

- [ ] `convex/schema.ts` - Add `widgetAreas`, `widgetInstances`, `widgetRssCache` tables (3 tables)
- [ ] `convex/widgets/queries.ts` - 6 queries (getWidgetAreas, getAreaWidgets, getInactiveWidgets, getWidgetArea, getWidgetInstance, getWidgetTypeRegistry)
- [ ] `convex/widgets/mutations.ts` - 10 mutations (createWidgetArea, updateWidgetArea, deleteWidgetArea, addWidgetInstance, updateWidgetInstance, deleteWidgetInstance, deactivateWidgetInstance, reactivateWidgetInstance, reorderWidgets, moveWidgetToArea)
- [ ] `convex/widgets/actions.ts` - 1 action (fetchRssFeed)
- [ ] `convex/widgets/internal.ts` - 3 internal functions (seedDefaultAreas, getCachedFeed, cacheFeed)
- [ ] `convex/widgets/helpers.ts` - Shared helpers (validateWidgetConfig, reorderAreaWidgets, getWidgetTypeDefinition)

### Shared Code

- [ ] `shared/widget-registry.ts` - Widget type definitions registry (16 types with configSchema and defaultConfig)
- [ ] `shared/widget-types.ts` - TypeScript type definitions for widget configs

### Admin Frontend (ConvexPress-Admin/apps/web/)

- [ ] `routes/admin/widgets/index.tsx` - Widget Management page route
- [ ] `routes/admin/widgets/areas.tsx` - Widget Area Settings page route
- [ ] `features/widgets/components/widget-management-page.tsx` - Main layout
- [ ] `features/widgets/components/available-widgets-panel.tsx` - Widget type list
- [ ] `features/widgets/components/widget-areas-panel.tsx` - Areas with instances
- [ ] `features/widgets/components/widget-area-section.tsx` - Single area section
- [ ] `features/widgets/components/widget-instance-card.tsx` - Single widget card
- [ ] `features/widgets/components/widget-config-form.tsx` - Dynamic config form
- [ ] `features/widgets/components/widget-field.tsx` - Form field renderer
- [ ] `features/widgets/components/widget-type-card.tsx` - Available type card
- [ ] `features/widgets/components/inactive-widgets-panel.tsx` - Inactive widgets
- [ ] `features/widgets/components/widget-area-settings-page.tsx` - Area CRUD page
- [ ] `features/widgets/components/widget-area-form.tsx` - Area create/edit form
- [ ] `features/widgets/components/widget-area-list.tsx` - Sortable area list
- [ ] `features/widgets/hooks/use-widget-areas.ts` - Widget area data hook
- [ ] `features/widgets/hooks/use-widget-instances.ts` - Widget instance data hook
- [ ] `features/widgets/hooks/use-widget-drag.ts` - dnd-kit drag-and-drop hook
- [ ] `features/widgets/hooks/use-widget-config.ts` - Config form state hook
- [ ] `features/widgets/lib/widget-type-registry.ts` - Type registry (admin copy or import from shared)
- [ ] `features/widgets/lib/widget-config-schemas.ts` - Per-type config schemas
- [ ] `features/widgets/lib/widget-utils.ts` - Helper functions
- [ ] `features/widgets/types.ts` - Widget TypeScript types

### Website Frontend (ConvexPress-Website/apps/web/)

- [ ] `features/widgets/components/widget-area.tsx` - `<WidgetArea>` component
- [ ] `features/widgets/components/widget-renderer.tsx` - Type-to-component mapper
- [ ] `features/widgets/components/widget-error-boundary.tsx` - Per-widget error boundary
- [ ] `features/widgets/components/widget-skeleton.tsx` - Loading skeleton
- [ ] `features/widgets/components/types/search-widget.tsx`
- [ ] `features/widgets/components/types/recent-posts-widget.tsx`
- [ ] `features/widgets/components/types/recent-comments-widget.tsx`
- [ ] `features/widgets/components/types/categories-widget.tsx`
- [ ] `features/widgets/components/types/tag-cloud-widget.tsx`
- [ ] `features/widgets/components/types/archives-widget.tsx`
- [ ] `features/widgets/components/types/pages-widget.tsx`
- [ ] `features/widgets/components/types/nav-menu-widget.tsx`
- [ ] `features/widgets/components/types/custom-html-widget.tsx`
- [ ] `features/widgets/components/types/rich-text-widget.tsx`
- [ ] `features/widgets/components/types/image-widget.tsx`
- [ ] `features/widgets/components/types/video-widget.tsx`
- [ ] `features/widgets/components/types/audio-widget.tsx`
- [ ] `features/widgets/components/types/rss-feed-widget.tsx`
- [ ] `features/widgets/components/types/calendar-widget.tsx`
- [ ] `features/widgets/components/types/social-links-widget.tsx`
- [ ] `features/widgets/hooks/use-widget-area.ts` - Area widget fetching hook
- [ ] `features/widgets/hooks/use-widget-visibility.ts` - Visibility condition hook
- [ ] `features/widgets/lib/visibility.ts` - Visibility condition logic
- [ ] `features/widgets/lib/widget-render-map.ts` - Type ID to component mapping

---

## Edge Cases & Gotchas

1. **Deleted referenced data** -- If a "Navigation Menu" widget references a menu that is subsequently deleted, the widget must render a graceful fallback ("Menu not found") rather than crash. Same pattern for "Recent Posts" referencing a deleted category via `categoryId`. Always check for null/undefined query results in widget render components.

2. **Widget type removed from registry** -- If a widget type is removed from the code registry but instances of that type still exist in the database, `WidgetRenderer` must skip those instances silently in production and log a warning in development. The admin UI should show them as "Unknown Widget Type" with a delete-only option.

3. **Concurrent widget editing** -- Two administrators editing the same widget instance simultaneously. Convex's last-write-wins behavior applies. The second admin's form will reactively update to show the first admin's changes via Convex subscription. No conflict resolution needed -- this is acceptable for widget config.

4. **Large number of widget areas (10+)** -- Each area's widgets are fetched independently via indexed queries, so performance should be fine. The admin page should use virtual scrolling for the areas panel if the list grows long.

5. **RSS Feed widget error handling** -- If an RSS feed URL is unreachable or returns invalid XML, display "Unable to load feed" rather than crash. Continue displaying cached data (if any) until a successful refresh. The 15-minute cache prevents hammering broken feeds.

6. **Custom HTML widget XSS** -- The Custom HTML widget allows raw HTML input. Content MUST be sanitized with DOMPurify to strip `<script>` tags, inline event handlers (`onclick`, `onerror`, etc.), and `javascript:` URLs while preserving layout HTML and CSS. Administrators are trusted but not immune to copy-paste mistakes or social engineering.

7. **Widget area slug conflicts** -- Validate slugs on create and update: lowercase letters, numbers, hyphens only, max 50 characters, must be unique across all areas.

8. **Reorder race conditions** -- If two admins reorder the same area simultaneously, the last write wins. The 500ms client-side debounce reduces the chance of interleaved mutations, but the server must handle it gracefully by always reassigning sequential order values based on the full `instanceIds` array.

9. **Empty widget areas on the website** -- If a widget area has no active widgets, `<WidgetArea>` must return `null` (no wrapper markup at all). This prevents empty `<aside>` elements from appearing in the DOM and affecting layout.

10. **Deleting a default area** -- Default areas (`isDefault: true`) cannot be deleted. The UI should hide or disable the delete button for default areas. The mutation must also enforce this server-side.

11. **Moving widget to same area** -- If `moveWidgetToArea` is called with the same area the widget is already in, treat it as a reorder operation rather than a move. Avoid duplicate reorder operations on the same area.

12. **Deactivating an already-inactive widget** -- The `deactivateWidgetInstance` mutation must check that the instance is currently active before proceeding. Return a clear error message if already inactive.

13. **Widget config validation on type mismatch** -- If a widget instance's `widgetType` no longer matches any known type in the registry, the `updateWidgetInstance` mutation should reject config updates since it cannot validate the config schema. Provide a clear error: "Cannot update configuration for unknown widget type."

14. **SSR hydration mismatch** -- Widget data must be identical between SSR and client hydration. Since both use the same Convex query, this should be handled automatically. However, be careful with date formatting or random values in widget render components that could differ between server and client.

15. **Lazy loading for media widgets** -- Image, Video, and Audio widgets should use `loading="lazy"` to defer off-screen media loading. This is especially important for footer widgets that are below the fold.

---

## WordPress Functions Reference

| WordPress | SmithHarper | Notes |
|-----------|-------------|-------|
| `register_sidebar($args)` | `createWidgetArea` mutation + `widgetAreas` table record | WordPress is code-only; SmithHarper is DB-backed with admin UI |
| `unregister_sidebar($id)` | `deleteWidgetArea` mutation | SmithHarper adds force-delete with widget deactivation |
| `dynamic_sidebar($id)` | `<WidgetArea slug="sidebar-1" />` component | SmithHarper is React component with Convex subscription |
| `register_widget($class)` | Widget type entry in `shared/widget-registry.ts` | Both are code-defined, not DB-stored |
| `unregister_widget($class)` | Remove entry from widget type registry | N/A in practice (just don't include the type) |
| `the_widget($class, $instance, $args)` | `<WidgetRenderer typeId="recent-posts" config={...} />` | Direct widget rendering |
| `is_active_sidebar($id)` | `useQuery(api.widgets.getAreaWidgets, { areaSlug })` | Check if area has widgets (array length > 0) |
| `wp_get_sidebars_widgets()` | `useQuery(api.widgets.getWidgetAreas)` | Get all area-to-widget mappings |
| `wp_set_sidebars_widgets($data)` | `reorderWidgets` / `moveWidgetToArea` mutations | SmithHarper uses per-area reorder, not bulk set |
| `WP_Widget::widget()` | Widget render component (e.g., `RecentPostsWidget`) | Front-end rendering |
| `WP_Widget::form()` | Dynamic `WidgetConfigForm` from `configSchema` | SmithHarper auto-generates forms from schema |
| `WP_Widget::update()` | `updateWidgetInstance` mutation with `validateWidgetConfig` | Server-side validation in Convex mutation |
| `widgets_init` action | `seedDefaultAreas` internal function | SmithHarper seeds defaults on first deploy |
| `widget_title` filter | N/A (title rendered directly from instance data) | No filter system in SmithHarper v1 |
| `widget_update_callback` filter | `validateWidgetConfig` helper in mutation | Validation happens in mutation, not as a filter |
| `widget_display_callback` filter | `shouldShowWidgetArea` visibility check | SmithHarper uses area-level visibility conditions |
| `dynamic_sidebar_before` action | N/A | No hook system; use React lifecycle if needed |
| `dynamic_sidebar_after` action | N/A | No hook system |
| `sidebars_widgets` filter | N/A | Direct Convex query, no filter layer |
| `in_widget_form` action | Extend `configSchema` in widget type registry | Add fields to config schema, form auto-generates |

---

## Widget Type Registry Architecture

### Interface Definitions

```typescript
// shared/widget-registry.ts

interface WidgetTypeDefinition {
  typeId: string;                    // e.g., "recent-posts"
  name: string;                     // e.g., "Recent Posts"
  description: string;              // e.g., "Display a list of recent posts"
  icon: string;                     // Lucide icon name
  category: "content" | "navigation" | "media" | "social" | "utility";
  configSchema: Record<string, WidgetFieldDef>;
  defaultConfig: Record<string, any>;
}

interface WidgetFieldDef {
  type: "string" | "number" | "boolean" | "select" | "media" | "array";
  label: string;
  description?: string;
  default: any;
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    options?: { value: string; label: string }[];
    pattern?: string;
  };
}
```

### Dynamic Config Form Generation Pattern

The admin does NOT need a custom form for each widget type. The `WidgetConfigForm` component reads `configSchema` from the registry and renders appropriate form controls dynamically:

- `"string"` -> `<Input>`
- `"number"` -> `<NumberInput>` with min/max
- `"boolean"` -> `<Checkbox>`
- `"select"` -> `<Select>` with options
- `"media"` -> `<MediaPicker>`
- `"array"` -> `<ArrayField>` (for social links profiles, etc.)

This means adding a new widget type requires only: (1) add a registry entry in `shared/widget-registry.ts`, and (2) add a render component in `ConvexPress-Website/src/features/widgets/components/types/`. No admin form code needed.

### Website Render Map Pattern

```typescript
// ConvexPress-Website/src/features/widgets/lib/widget-render-map.ts

const WIDGET_RENDER_MAP: Record<string, React.ComponentType<{ config: any }>> = {
  "search": SearchWidget,
  "recent-posts": RecentPostsWidget,
  "recent-comments": RecentCommentsWidget,
  "categories": CategoriesWidget,
  "tag-cloud": TagCloudWidget,
  "archives": ArchivesWidget,
  "pages": PagesWidget,
  "nav-menu": NavigationMenuWidget,
  "custom-html": CustomHtmlWidget,
  "rich-text": RichTextWidget,
  "image": ImageWidget,
  "video": VideoWidget,
  "audio": AudioWidget,
  "rss-feed": RssFeedWidget,
  "calendar": CalendarWidget,
  "social-links": SocialLinksWidget,
};
```

---

## Performance Considerations

1. **Per-area query isolation** -- Each `<WidgetArea>` runs its own Convex query. Slow widgets (e.g., RSS Feed) do not block other areas.
2. **Widget-level error boundaries** -- A crashing widget does not take down the entire sidebar.
3. **RSS caching** -- 15-minute server-side cache in `widgetRssCache` table prevents excessive external HTTP requests.
4. **Index optimization** -- `["areaId", "isActive", "order"]` index on `widgetInstances` makes area-specific queries fast.
5. **Lazy loading** -- Image, Video, Audio widgets use `loading="lazy"` for below-fold media.
6. **Empty area optimization** -- Empty areas render nothing (no DOM elements).
7. **Target render time** -- < 50ms per widget area on SSR.
8. **Target propagation latency** -- < 1 second from admin save to front-end update.
