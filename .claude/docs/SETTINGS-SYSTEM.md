# Settings System - Expert Knowledge Document

**System:** Settings System
**Status:** Complete (100%)
**Priority:** P0 - Critical
**WordPress Equivalent:** wp_options table + Settings API (options-general.php, options-reading.php, options-writing.php, options-discussion.php, options-permalink.php, options-privacy.php)
**Last Analyzed:** 2026-02-13
**System Record:** `recJR4tgIzkcaJMq5`
**Expert Record:** `recC5SZEkalWpXHA5`

---

## Quick Reference

### What This System Does
The Settings System is ConvexPress's centralized configuration store -- the equivalent of WordPress's `wp_options` table and Settings API. It provides a typed, validated, section-based key-value store for all site-wide configuration: site identity (title, tagline, URLs), content display behavior (homepage type, posts per page, feeds), authoring defaults (default category, post format), comment/discussion policies, permalink structures, and privacy configuration. Unlike WordPress's untyped serialized blobs, all settings are fully typed in Convex, validated on write, and reactively pushed to all connected clients when changed.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Section** | A logical grouping of settings -- one Convex document per section (general, reading, writing, discussion, permalinks, privacy) |
| **Defaults** | Immutable default values defined in code, not stored in DB. Database only stores overrides |
| **Autoloaded** | Settings fetched on every page load (general, reading, permalinks, discussion, privacy) |
| **Public Settings** | Settings safe to expose to the website frontend (no admin email, no word lists) |
| **Change Detection** | Every save computes a diff of old vs new values for event payloads |
| **Section Validators** | Per-section Convex validators that enforce type safety at the mutation level |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| Storage | `wp_options` table, flat key-value, serialized strings | Convex `settings` table, section-based documents with typed values |
| Type Safety | None -- values are `longtext` | Full TypeScript types enforced by Convex validators |
| Validation | None built-in; relies on `sanitize_callback` | Server-side validation on every write |
| Change Tracking | None without plugins | Event emission on every change with full diff payload |
| Autoload | `autoload` column (`yes`/`no`) per option | Single `getAutoloaded` query returns all needed settings |
| Real-time | Requires page refresh | Convex reactive subscriptions push changes to all connected clients |
| Access Control | `manage_options` capability | `manage_options` capability via Role & Capability System |
| API | `get_option()` / `update_option()` PHP functions | Convex `useQuery` / `useMutation` hooks |

---

## Architecture Overview

### Data Flow

```
Admin Settings Page (TanStack Router)
  -> Form submission
    -> Convex mutation: settings.updateSection
      -> Validate all fields against typed section schema
      -> Compute diff (changes array) between old and new values
      -> Write to `settings` table (upsert)
      -> Emit event: settings.updated (or settings.permalinks_changed)
        -> Audit log entry
        -> Email notification to admins (batched, 5-minute window)
        -> Site notification to admins (toast or persistent warning)
  -> All subscribed clients receive updated settings via Convex reactive query
```

### Settings Access Pattern

```
Website (TanStack Start)                    Admin (TanStack Router + Vite)
        |                                            |
        v                                            v
  SSR: ctx.runQuery(api.settings.getAutoloaded)    useQuery(api.settings.getBySection, { section })
        |                                            |
        v                                            v
  [Settings cached in SSR context]           [Real-time reactive updates]
  One call per request at root layout        Form fields update reactively
        |                                            |
        v                                            v
  Renders site title, permalink structure,    Displays settings forms,
  reading config, discussion policies         allows editing
```

### Real-Time Behavior
- **Admin forms:** Each settings page subscribes to its section via `useQuery(api.settings.getBySection, { section })`. When another admin saves the same section, the form reactively updates. A toast appears: "Settings were updated by another administrator."
- **Website frontend:** The root layout subscribes to `useQuery(api.settings.getPublic)`. When settings change (e.g., site title), the website header updates in real-time for SSR-hydrated clients.
- **Optimistic updates:** Admin forms use Convex optimistic updates so the UI reflects changes immediately without waiting for server round-trip.

### Authentication & Authorization
- All settings routes are protected behind Convex Auth authentication (AuthKit pattern).
- Route-level capability check: `context.auth.hasCapability("manage_options")`.
- Non-administrators are redirected to `/admin` dashboard.
- Every mutation checks that the calling user has Administrator role.
- Public settings query (`getPublic`) requires no auth -- it returns only safe, public-facing values.

---

## Database Schema

### `settings` Table

```typescript
// convex/schema.ts
settings: defineTable({
  section: v.union(
    v.literal("general"),
    v.literal("reading"),
    v.literal("writing"),
    v.literal("discussion"),
    v.literal("permalinks"),
    v.literal("privacy")
  ),
  values: v.any(),          // Typed per-section via validators in mutations
  updatedAt: v.number(),    // Unix timestamp of last update
  updatedBy: v.id("users"), // User who last updated this section
})
  .index("by_section", ["section"]),
```

**Fields:**

| Field | Type | Purpose | Validation |
|-------|------|---------|------------|
| `section` | union literal | Identifies which settings section this document represents | Must be one of 6 valid section names |
| `values` | any | The actual settings values for this section, typed per-section via validators | Validated by section-specific validators in mutation handlers |
| `updatedAt` | number | Unix timestamp (ms) of last update | Auto-set on write |
| `updatedBy` | Id<"users"> | Reference to the user who last updated | Must be valid user ID |

### Indexes

| Index | Fields | Purpose |
|-------|--------|---------|
| `by_section` | `["section"]` | Look up a settings section document by name. Used by every query and mutation. Each section has exactly one document, so `.unique()` is always used. |

### Relationships

| Related Table | Relationship | Purpose |
|---------------|-------------|---------|
| `users` | `updatedBy` -> `users._id` | Track who last modified each settings section |
| `pages` | `homepageId`, `postsPageId`, `privacyPolicyPageId` (inside `values`) -> `pages._id` | Page references for Reading and Privacy settings |
| `categories` | `defaultCategory` (inside `values`) -> `categories._id` | Default category reference for Writing settings |

---

## Section Value Schemas

### General Settings Values

```typescript
interface GeneralSettings {
  siteTitle: string;          // WordPress: blogname -- appears in browser title bar, header, RSS
  tagline: string;            // WordPress: blogdescription -- displayed beneath site title
  siteUrl: string;            // WordPress: siteurl -- URL where ConvexPress files live
  homeUrl: string;            // WordPress: home -- URL users visit (can differ from siteUrl)
  adminEmail: string;         // WordPress: admin_email -- admin notifications and alerts
  membershipEnabled: boolean; // WordPress: users_can_register -- public registration toggle
  defaultRole: string;        // WordPress: default_role -- "subscriber"|"contributor"|"author"|"editor"
  siteLanguage: string;       // WordPress: WPLANG -- BCP 47 tag, e.g. "en-US"
  timezone: string;           // WordPress: timezone_string -- IANA timezone, e.g. "America/New_York"
  dateFormat: string;         // WordPress: date_format -- date-fns format string, e.g. "MMMM d, yyyy"
  timeFormat: string;         // WordPress: time_format -- date-fns format string, e.g. "h:mm a"
  weekStartsOn: number;       // WordPress: start_of_week -- 0=Sunday through 6=Saturday
}
```

### Reading Settings Values

```typescript
interface ReadingSettings {
  homepageDisplays: "latest_posts" | "static_page"; // WordPress: show_on_front
  homepageId: string | null;       // WordPress: page_on_front -- Convex ID of page
  postsPageId: string | null;      // WordPress: page_for_posts -- Convex ID of page
  postsPerPage: number;            // WordPress: posts_per_page -- 1-100
  feedItemCount: number;           // WordPress: posts_per_rss -- 1-100
  feedContentDisplay: "full" | "summary"; // WordPress: rss_use_excerpt
  searchEngineVisibility: boolean; // WordPress: blog_public -- true=visible, false=discouraged
}
```

### Writing Settings Values

```typescript
interface WritingSettings {
  defaultCategory: string | null;  // WordPress: default_category -- Convex ID of category
  defaultPostFormat: string;       // WordPress: default_post_format
  // Valid formats: "standard"|"aside"|"gallery"|"link"|"image"|"quote"|"status"|"video"|"audio"|"chat"
}
```

### Discussion Settings Values

```typescript
interface DiscussionSettings {
  // Default article settings
  attemptNotifyLinkedBlogs: boolean;  // WordPress: default_pingback_flag
  allowLinkNotifications: boolean;    // WordPress: default_ping_status
  allowComments: boolean;             // WordPress: default_comment_status

  // Other comment settings
  requireNameEmail: boolean;           // WordPress: require_name_email
  requireRegistration: boolean;        // WordPress: comment_registration
  autoCloseEnabled: boolean;           // WordPress: close_comments_for_old_posts
  autoCloseAfterDays: number;          // WordPress: close_comments_days_old (0=never, 1-365)
  enableThreadedComments: boolean;     // WordPress: thread_comments
  threadedCommentsDepth: number;       // WordPress: thread_comments_depth (1-10)
  enablePaginatedComments: boolean;    // WordPress: page_comments
  commentsPerPage: number;             // WordPress: comments_per_page (1-200)
  defaultCommentsPage: "newest" | "oldest"; // WordPress: default_comments_page
  commentOrder: "asc" | "desc";        // WordPress: comment_order

  // Email me whenever
  emailOnNewComment: boolean;          // WordPress: comments_notify
  emailOnHeldForModeration: boolean;   // WordPress: moderation_notify

  // Before a comment appears
  manualApprovalRequired: boolean;     // WordPress: comment_moderation
  previouslyApprovedRequired: boolean; // WordPress: comment_previously_approved

  // Comment moderation
  holdIfLinksExceed: number;           // WordPress: comment_max_links (0-100)
  moderationWordList: string;          // WordPress: moderation_keys (newline-separated, max 50k chars)
  disallowedWordList: string;          // WordPress: disallowed_keys (newline-separated, max 50k chars)

  // Avatars
  showAvatars: boolean;                // WordPress: show_avatars
  avatarRating: "G" | "PG" | "R" | "X"; // WordPress: avatar_rating
  defaultAvatar: string;              // WordPress: avatar_default
  // Valid avatars: "mystery"|"blank"|"gravatar_default"|"identicon"|"wavatar"|"monsterid"|"retro"
}
```

### Permalink Settings Values

```typescript
interface PermalinkSettings {
  structure: "plain" | "day_and_name" | "month_and_name" | "numeric" | "post_name" | "custom";
  // plain:          /?p=123
  // day_and_name:   /2026/02/08/sample-post/
  // month_and_name: /2026/02/sample-post/
  // numeric:        /archives/123
  // post_name:      /sample-post/     (default, most common)
  // custom:         User-defined pattern
  customStructure: string;  // Only used when structure="custom"
  categoryBase: string;     // Default: "category"
  tagBase: string;          // Default: "tag"
}
```

**Available Permalink Tags (for custom structure):**

| Tag | Description | Example |
|-----|-------------|---------|
| `%year%` | Four-digit year | 2026 |
| `%monthnum%` | Two-digit month | 02 |
| `%day%` | Two-digit day | 08 |
| `%hour%` | Two-digit hour | 14 |
| `%minute%` | Two-digit minute | 30 |
| `%second%` | Two-digit second | 45 |
| `%post_id%` | Numeric post ID | 123 |
| `%postname%` | Sanitized post slug | sample-post |
| `%category%` | Category slug | technology |
| `%author%` | Author slug | john-doe |

### Privacy Settings Values

```typescript
interface PrivacySettings {
  privacyPolicyPageId: string | null; // WordPress: wp_page_for_privacy_policy -- Convex ID of page
  showPrivacyPolicyLink: boolean;     // Show privacy link in footer/registration form
}
```

---

## Default Values

When no settings have been saved (fresh installation), the system uses these code-defined defaults. The database only stores overrides -- not defaults.

```typescript
const GENERAL_DEFAULTS: GeneralSettings = {
  siteTitle: "My Site",
  tagline: "Just another ConvexPress site",
  siteUrl: "",           // Auto-detected from environment
  homeUrl: "",           // Same as siteUrl
  adminEmail: "",        // From Convex Auth admin user
  membershipEnabled: false,
  defaultRole: "subscriber",
  siteLanguage: "en-US",
  timezone: "America/New_York",
  dateFormat: "MMMM d, yyyy",
  timeFormat: "h:mm a",
  weekStartsOn: 0,
};

const READING_DEFAULTS: ReadingSettings = {
  homepageDisplays: "latest_posts",
  homepageId: null,
  postsPageId: null,
  postsPerPage: 10,
  feedItemCount: 10,
  feedContentDisplay: "full",
  searchEngineVisibility: true,
};

const WRITING_DEFAULTS: WritingSettings = {
  defaultCategory: null,
  defaultPostFormat: "standard",
};

const DISCUSSION_DEFAULTS: DiscussionSettings = {
  attemptNotifyLinkedBlogs: true,
  allowLinkNotifications: true,
  allowComments: true,
  requireNameEmail: true,
  requireRegistration: false,
  autoCloseEnabled: false,
  autoCloseAfterDays: 14,
  enableThreadedComments: true,
  threadedCommentsDepth: 5,
  enablePaginatedComments: false,
  commentsPerPage: 50,
  defaultCommentsPage: "newest",
  commentOrder: "asc",
  emailOnNewComment: true,
  emailOnHeldForModeration: true,
  manualApprovalRequired: false,
  previouslyApprovedRequired: true,
  holdIfLinksExceed: 2,
  moderationWordList: "",
  disallowedWordList: "",
  showAvatars: true,
  avatarRating: "G",
  defaultAvatar: "mystery",
};

const PERMALINK_DEFAULTS: PermalinkSettings = {
  structure: "post_name",
  customStructure: "",
  categoryBase: "category",
  tagBase: "tag",
};

const PRIVACY_DEFAULTS: PrivacySettings = {
  privacyPolicyPageId: null,
  showPrivacyPolicyLink: true,
};
```

---

## Actions & Functions

### Mutations

#### `settings.update_general` - Update General Settings
- **Type:** mutation (`settings.updateSection`)
- **Auth:** Required
- **Capabilities:** `manage_options` (Administrator only)
- **Airtable Action Record:** `recGQ7DmuxMJk0s0R`
- **Args:**
  ```typescript
  {
    section: "general",
    values: GeneralSettings
  }
  ```
- **Returns:** void
- **Behavior:**
  1. Check auth -- must be Administrator with `manage_options` capability
  2. Validate all fields against GeneralSettings schema (required strings, valid URL, valid email, valid timezone, valid locale, number range for weekStartsOn)
  3. Get current stored values for change detection
  4. Compute changes array (field, oldValue, newValue for each changed field)
  5. Skip if no changes detected
  6. Upsert the settings document (patch if exists, insert if new)
  7. Emit `settings.updated` event with section="general" and changes array
- **Events:** `settings.updated`
- **Errors:**
  - `"Only administrators can update settings"` -- non-admin caller
  - Validation errors for each field type

#### `settings.update_reading` - Update Reading Settings
- **Type:** mutation (`settings.updateSection`)
- **Auth:** Required
- **Capabilities:** `manage_options` (Administrator only)
- **Airtable Action Record:** `recsHLRg5lA1sWhNo`
- **Args:**
  ```typescript
  {
    section: "reading",
    values: ReadingSettings
  }
  ```
- **Returns:** void
- **Behavior:**
  1. Check auth -- Administrator only
  2. Validate fields. Special: if `homepageDisplays` = "static_page", `homepageId` is required and must reference a published page. `postsPageId` cannot equal `homepageId`.
  3. Compute changes, upsert, emit `settings.updated`
- **Events:** `settings.updated`
- **Errors:**
  - `"Homepage must be selected when using static page display"` -- missing homepageId
  - `"Posts page cannot be the same as homepage"` -- homepageId equals postsPageId

#### `settings.update_writing` - Update Writing Settings
- **Type:** mutation (`settings.updateSection`)
- **Auth:** Required
- **Capabilities:** `manage_options` (Administrator only)
- **Airtable Action Record:** `recZKYGxOETQLZTqD`
- **Args:**
  ```typescript
  {
    section: "writing",
    values: WritingSettings
  }
  ```
- **Returns:** void
- **Behavior:**
  1. Check auth -- Administrator only
  2. Validate: `defaultCategory` must reference an existing category or be null. `defaultPostFormat` must be a valid post format string.
  3. Compute changes, upsert, emit `settings.updated`
- **Events:** `settings.updated`

#### `settings.update_discussion` - Update Discussion Settings
- **Type:** mutation (`settings.updateSection`)
- **Auth:** Required
- **Capabilities:** `manage_options` (Administrator only)
- **Airtable Action Record:** `recmVdpZTM25jO4nD`
- **Args:**
  ```typescript
  {
    section: "discussion",
    values: DiscussionSettings
  }
  ```
- **Returns:** void
- **Behavior:**
  1. Check auth -- Administrator only
  2. Validate all booleans, number ranges (autoCloseAfterDays 1-365, threadedCommentsDepth 1-10, commentsPerPage 1-200, holdIfLinksExceed 0-100), enum values, string lengths (word lists max 50k chars)
  3. Compute changes, upsert, emit `settings.updated`
- **Events:** `settings.updated`

#### `settings.update_permalinks` - Update Permalink Settings
- **Type:** mutation (`settings.updateSection`)
- **Auth:** Required
- **Capabilities:** `manage_options` (Administrator only)
- **Airtable Action Record:** `rec2b0AnaIDjD9PdS`
- **Args:**
  ```typescript
  {
    section: "permalinks",
    values: PermalinkSettings
  }
  ```
- **Returns:** void
- **Behavior:**
  1. Check auth -- Administrator only
  2. Validate: `structure` must be valid enum. If "custom", `customStructure` is required, must start with `/`, and must contain `%postname%` or `%post_id%`. `categoryBase` and `tagBase` are alphanumeric + hyphens, no leading/trailing slashes, max 100 chars.
  3. Compute changes, upsert
  4. Emit `settings.permalinks_changed` (NOT `settings.updated`) with old and new structure, categoryBase, and tagBase
- **Events:** `settings.permalinks_changed`
- **Critical:** This is the ONLY section that emits `settings.permalinks_changed` instead of `settings.updated`. The Routing System listens for this event.

#### `settings.update_privacy` - Update Privacy Settings
- **Type:** mutation (`settings.updateSection`)
- **Auth:** Required
- **Capabilities:** `manage_options` (Administrator only)
- **Airtable Action Record:** `recWUWeBA12AIlyoQ`
- **Args:**
  ```typescript
  {
    section: "privacy",
    values: PrivacySettings
  }
  ```
- **Returns:** void
- **Behavior:**
  1. Check auth -- Administrator only
  2. Validate: `privacyPolicyPageId` must reference an existing page or be null. `showPrivacyPolicyLink` must be boolean.
  3. Compute changes, upsert, emit `settings.updated`
- **Events:** `settings.updated`

#### `settings.update_email` - Update Email Settings
- **Airtable Action Record:** `recJGb1FmshUKg93h`
- **Note:** Referenced in Airtable but not detailed in PRD. Likely for email delivery configuration (SMTP/Resend settings). Implementation TBD.

#### `settings.export` - Export Settings
- **Airtable Action Record:** `recZmzJfdVYXrjhqr`
- **Type:** query (read-only export)
- **Auth:** Required -- Administrator only
- **See:** `settings.exportAll` query below

#### `settings.import` - Import Settings
- **Airtable Action Record:** `recTTqNh3XgHX5yZT`
- **Type:** mutation
- **Auth:** Required -- Administrator only
- **See:** `settings.importAll` mutation below

### Queries

#### `settings.get`
- **Type:** query
- **Auth:** Required (admin)
- **Args:**
  ```typescript
  { section: string }
  ```
- **Returns:** Settings document or null
- **Behavior:** Direct lookup by section index. Returns raw stored document without merging defaults.

#### `settings.getBySection`
- **Type:** query
- **Auth:** Required (admin)
- **Args:**
  ```typescript
  {
    section: "general" | "reading" | "writing" | "discussion" | "permalinks" | "privacy"
  }
  ```
- **Returns:** Merged settings (defaults + stored overrides) with `_id` and `updatedAt` metadata
- **Behavior:**
  1. Fetch stored document by section index
  2. Get code-defined defaults for that section
  3. Spread defaults, then spread stored values on top
  4. Include `_id` and `updatedAt` from stored document (for UI display)
- **Usage:** Admin settings forms. Each page subscribes to its section.

#### `settings.getAutoloaded`
- **Type:** query
- **Auth:** Public (used by website SSR)
- **Args:** none
- **Returns:** `Record<string, any>` -- all autoloaded sections merged with defaults
- **Behavior:**
  1. Fetch 5 sections: general, reading, permalinks, discussion, privacy
  2. For each, merge defaults with stored values
  3. Return as a single object keyed by section name
- **Usage:** Website SSR root layout. One call per request. Replaces WordPress's autoloaded options.
- **Note:** Writing settings are NOT autoloaded (only needed when creating posts).

#### `settings.getPublic`
- **Type:** query
- **Auth:** Public (no auth required)
- **Args:** none
- **Returns:** Only public-safe settings values
- **Behavior:** Returns a curated subset: siteTitle, tagline, dateFormat, timeFormat, timezone, homepageDisplays, postsPerPage, allowComments, showAvatars, avatarRating, defaultAvatar, permalink structure, privacyPolicyPageId. Excludes: adminEmail, moderationWordList, disallowedWordList, and other admin-only fields.
- **Usage:** Website frontend `SettingsProvider` context. Exposed to React components via `useSettings()` hook.

#### `settings.exportAll`
- **Type:** query
- **Auth:** Required -- Administrator only
- **Args:** none
- **Returns:** JSON export object
  ```typescript
  {
    version: "1.0",
    exportedAt: string,       // ISO 8601 timestamp
    exportedBy: string,       // Admin email
    settings: Record<string, any>  // All sections
  }
  ```
- **Behavior:**
  1. Check auth -- Administrator only
  2. Fetch all settings documents
  3. Reduce to `{ [section]: values }` map
  4. Wrap in export metadata
- **Note:** Does NOT include page/category IDs (site-specific). Includes page/category names for reference.

### Mutations (Import)

#### `settings.importAll`
- **Type:** mutation
- **Auth:** Required -- Administrator only
- **Args:**
  ```typescript
  { data: any } // Record<section, values> from export format
  ```
- **Returns:** void
- **Behavior:**
  1. Check auth -- Administrator only
  2. Validate ALL sections before writing any (atomic validation)
  3. For each section: upsert the settings document
  4. Emit `settings.updated` event for each changed section
  5. If permalinks changed, emit `settings.permalinks_changed` instead
- **Note:** Page references (homepageId, postsPageId, privacyPolicyPageId) are matched by title, not ID. Category references are matched by slug, not ID. Missing references are skipped with a warning.

### Internal Functions

#### `settings.getInternal`
- **Type:** internalQuery (not exposed to client)
- **Args:** `{ section: string }`
- **Returns:** Merged settings (defaults + stored)
- **Behavior:** Same as `getBySection` but callable only from other Convex functions (not client). Used by other systems that need to read settings server-side (e.g., Routing System reading permalink structure, Comment System reading moderation rules).

---

## Events

### `settings.updated`
- **Airtable Record:** `recKzlzPZ54QYYOyh`
- **Type:** System
- **Triggered By:** `settings.update_general`, `settings.update_reading`, `settings.update_writing`, `settings.update_discussion`, `settings.update_privacy`, `settings.import`
- **Payload:**
  ```typescript
  {
    section: "general" | "reading" | "writing" | "discussion" | "privacy";
    changes: Array<{
      field: string;      // e.g., "siteTitle"
      oldValue: unknown;  // Previous value
      newValue: unknown;  // New value
    }>;
    updatedBy: Id<"users">;
    timestamp: number;    // Unix timestamp (ms)
  }
  ```
- **Subscribers:**
  - **Audit Log System:** Create audit log entry with full diff
  - **Email Notification System:** Send "Settings Changed Alert" to all admins (batched, 5-minute window)
  - **Site Notification System:** Show "Settings Updated" info toast to all admins
  - Side Effects: None (downstream systems react to their own queries updating)

### `settings.permalinks_changed`
- **Airtable Record:** `recz3VxdeKLARyQoS`
- **Type:** System
- **Triggered By:** `settings.update_permalinks`
- **Payload:**
  ```typescript
  {
    oldStructure: string;     // Previous permalink structure
    newStructure: string;     // New permalink structure
    oldCategoryBase: string;
    newCategoryBase: string;
    oldTagBase: string;
    newTagBase: string;
    updatedBy: Id<"users">;
    timestamp: number;
  }
  ```
- **Subscribers:**
  - **Routing System:** Regenerate URL patterns, create 301 redirect rules from old URLs to new
  - **Audit Log System:** Create audit log entry
  - **Site Notification System:** Show persistent "Permalink Changed" warning in admin notification bell (does not auto-dismiss)
  - **Sitemap System:** Trigger sitemap regeneration

---

## Admin Routes & UI

### Settings Sidebar Navigation

Within the admin sidebar, Settings is a top-level menu item with sub-items:

```
Settings
  General
  Reading
  Writing
  Discussion
  Permalinks
  Privacy
```

`/admin/settings` redirects to `/admin/settings/general`.

### General Settings (`/admin/settings/general`)
- **Purpose:** Core site identity and locale configuration
- **WordPress Equivalent:** Settings > General (`options-general.php`)
- **Airtable Route Record:** `recCVBvNVgFsdW1M5`
- **Auth:** Administrator only (`manage_options`)
- **Layout:**
  - **Section: Site Identity** -- Site Title (text input, full width), Tagline (text input, full width)
  - **Section: Site Address** -- Site Address URL (url input), Home Address URL (url input), info callout: "These URLs should only be changed if you know what you're doing."
  - **Section: Administration** -- Administration Email (email input), Membership checkbox ("Anyone can register"), New User Default Role (select: subscriber/contributor/author/editor)
  - **Section: Locale** -- Site Language (searchable select), Timezone (searchable select with timezone groups), Date Format (radio group with live preview + custom input), Time Format (radio group with live preview + custom input), Week Starts On (select: Sunday-Saturday)
  - Save Changes button (bottom-left)
- **Key Components:** Text Input, URL Input, Email Input, Checkbox, Select, Combobox (searchable), RadioGroup, live date/time preview
- **Data Requirements:** `useQuery(api.settings.getBySection, { section: "general" })`
- **User Interactions:** Edit fields, save all at once, see live preview of date/time formats
- **Real-Time:** Form updates reactively if another admin saves

### Reading Settings (`/admin/settings/reading`)
- **Purpose:** Controls how content is displayed to visitors
- **WordPress Equivalent:** Settings > Reading (`options-reading.php`)
- **Airtable Route Record:** `recBTNpWw5TEYZbYl`
- **Auth:** Administrator only
- **Layout:**
  - **Section: Homepage** -- Radio: "Your latest posts" / "A static page". Conditional dropdowns: Homepage (page select), Posts page (page select)
  - **Section: Blog Display** -- "Blog pages show at most [number] posts"
  - **Section: Feed** -- "Syndication feeds show the most recent [number] items". Radio: "Full text" / "Summary"
  - **Section: Search Engine Visibility** -- Checkbox: "Discourage search engines from indexing this site". Warning callout about search engine behavior.
  - Save Changes button
- **Key Components:** RadioGroup, Combobox (page select), Number Input, Checkbox
- **Data Requirements:** `useQuery(api.settings.getBySection, { section: "reading" })`, pages query for dropdown
- **Conditional Logic:** When "A static page" is selected, Homepage and Posts page dropdowns appear. If static page selected but no homepage chosen, validation fails on save.

### Writing Settings (`/admin/settings/writing`)
- **Purpose:** Default settings for creating new content
- **WordPress Equivalent:** Settings > Writing (`options-writing.php`)
- **Airtable Route Record:** `recyXgrcY65Hrhwur`
- **Auth:** Administrator only
- **Layout:**
  - **Section: Default Post Settings** -- Default Post Category (category select), Default Post Format (select: Standard, Aside, Gallery, Link, Image, Quote, Status, Video, Audio, Chat)
  - Save Changes button
- **Key Components:** Combobox (category select), Select
- **Data Requirements:** `useQuery(api.settings.getBySection, { section: "writing" })`, categories query for dropdown

### Discussion Settings (`/admin/settings/discussion`)
- **Purpose:** Comment behavior, moderation policies, avatar settings. Most complex settings page.
- **WordPress Equivalent:** Settings > Discussion (`options-discussion.php`)
- **Airtable Route Record:** `rec9km5mcgc7N4VxD`
- **Auth:** Administrator only
- **Layout:**
  - **Section: Default article settings** -- 3 checkboxes (notify linked blogs, allow link notifications, allow comments)
  - **Section: Other comment settings** -- 2 standalone checkboxes (name/email required, registration required). 3 conditional checkbox+number combos (auto-close after N days, threaded N levels deep, paginated N per page + which page default). Comment order select.
  - **Section: Email me whenever** -- 2 checkboxes (new comment, held for moderation)
  - **Section: Before a comment appears** -- 2 checkboxes (manual approval, previously approved)
  - **Section: Comment Moderation** -- Number input (hold if links exceed N), 2 textareas (moderation word list, disallowed word list) with character count indicators
  - **Section: Avatars** -- Show Avatars checkbox. Conditional: Maximum Rating radio (G/PG/R/X), Default Avatar radio with icons (mystery, blank, gravatar, identicon, wavatar, monsterid, retro)
  - Save Changes button
- **Key Components:** Checkbox, Number Input, Select, RadioGroup, Textarea (with char count)
- **Data Requirements:** `useQuery(api.settings.getBySection, { section: "discussion" })`
- **Conditional Logic:** Auto-close days only editable when autoCloseEnabled. Thread depth only editable when enableThreadedComments. Comments per page only editable when enablePaginatedComments. Avatar rating/default only visible when showAvatars is true.

### Permalink Settings (`/admin/settings/permalinks`)
- **Purpose:** Controls URL structure for posts, categories, tags. CRITICAL: changes affect Routing System.
- **WordPress Equivalent:** Settings > Permalinks (`options-permalink.php`)
- **Airtable Route Record:** `recsrXFO9XmNTcm8N`
- **Auth:** Administrator only
- **Layout:**
  - **Section: Common Settings** -- Radio group with 6 options, each showing example URL. Custom option includes text input. Tag insertion buttons below custom input (%year%, %monthnum%, %day%, %hour%, %minute%, %second%, %post_id%, %postname%, %category%, %author%).
  - **Section: Optional** -- Category base (text input, placeholder "category"), Tag base (text input, placeholder "tag"). Info callout: "If you leave these blank, the defaults will be used."
  - Save Changes button
- **Key Components:** RadioGroup, Text Input, Button (tag inserters)
- **Data Requirements:** `useQuery(api.settings.getBySection, { section: "permalinks" })`
- **Confirmation Dialog:** Before saving permalink changes, show: "Changing permalink structure will affect all existing post URLs. This may impact SEO and existing bookmarks. Are you sure?"
- **Critical Side Effects:** Saving emits `settings.permalinks_changed` which triggers Routing System URL regeneration, redirect rule creation, and sitemap regeneration.

### Privacy Settings (`/admin/settings/privacy`)
- **Purpose:** Privacy policy page selection and guidance
- **WordPress Equivalent:** Settings > Privacy (`options-privacy.php`)
- **Airtable Route Record:** `recEyqbGsuDud5Qm7`
- **Auth:** Administrator only
- **Layout:**
  - **Section: Privacy Policy Page** -- Page select dropdown, info callout about creating a privacy page, checkbox for showing privacy link
  - **Section: Privacy Policy Guide** -- Expandable accordion with guidance sections (what data collected, why, how used, what shared, retention, user rights, data destinations). Link to "Generate Privacy Policy Template" (creates draft page with template content).
  - Save Changes button
- **Key Components:** Combobox (page select), Checkbox, Accordion
- **Data Requirements:** `useQuery(api.settings.getBySection, { section: "privacy" })`, pages query for dropdown

### SEO Settings (`/admin/seo/settings`)
- **Airtable Route Record:** `recc1A0RhONsz4NaV`
- **Note:** Referenced in Airtable routes but belongs to the SEO System, not the Settings System. The Settings System provides `searchEngineVisibility` and site title/tagline that the SEO System consumes.

### Settings API (`/api/admin/settings`)
- **Airtable Route Record:** `recdAaIM9lZztm1Gr`
- **Note:** API route for external integrations. Open question in PRD: whether this is a REST API or only needed for the admin SPA (which uses Convex directly).

### Shared Page Behavior (All Settings Pages)

1. **Load state:** Show skeleton loaders while Convex query loads. Form populates with current saved values (or defaults).
2. **Dirty tracking:** Track modified fields. Show "You have unsaved changes" indicator.
3. **Save:** Single "Save Changes" button per page. Saves all fields for that section in one mutation.
4. **Success feedback:** Toast: "Settings saved."
5. **Error feedback:** Inline validation errors on fields. Toast for server errors.
6. **Optimistic updates:** Convex optimistic updates so form does not flash/reset.
7. **Navigation guard:** Confirmation dialog if user navigates away with unsaved changes.
8. **Component library:** Base UI (NOT Radix) with Tailwind CSS v4.

---

## Website Routes

### Settings Context Provider (Root Layout)
- **Purpose:** Provide public settings to all website components via React context
- **Implementation:**
  ```typescript
  // Website root layout
  export function RootLayout({ children }) {
    const settings = useQuery(api.settings.getPublic);
    return (
      <SettingsProvider value={settings}>
        <SiteHeader />
        {children}
        <SiteFooter />
      </SettingsProvider>
    );
  }
  ```
- **Access:** Components use `useSettings()` hook
- **Caching:** SSR calls `getAutoloaded` once at root layout level per request

### How Website Consumes Settings

| Setting | Website Usage |
|---------|---------------|
| `siteTitle` + `tagline` | `<title>` tag (`{pageTitle} \| {siteTitle}`), site header, RSS feed metadata |
| `homepageDisplays` | Homepage routing: "latest_posts" shows recent posts at `/`; "static_page" renders selected page |
| `postsPerPage` | Controls pagination on blog index and archives |
| `feedItemCount` + `feedContentDisplay` | RSS feed length and content type (full/excerpt) |
| `searchEngineVisibility` | When false, adds `<meta name="robots" content="noindex, nofollow">` |
| `dateFormat` + `timeFormat` + `timezone` | All date/time rendering across the site |
| Permalink `structure` + `categoryBase` + `tagBase` | URL generation and resolution by Routing System |
| `allowComments` | Default for new posts (overridable per-post) |
| `requireNameEmail` + `requireRegistration` | Comment form UI configuration |
| `showAvatars` + `avatarRating` + `defaultAvatar` | Comment display configuration |
| `privacyPolicyPageId` + `showPrivacyPolicyLink` | Footer link, registration form link |

---

## Notifications

### Email Notifications

| Name | Event | Recipients | Priority | Subject | Record ID |
|------|-------|------------|----------|---------|-----------|
| Settings Changed Alert | `settings.updated`, `settings.permalinks_changed` | All Administrators | Batched (5-min window) | "Site settings were updated" | `recbLlRv3YwJxchzq` |

**Email body includes:** Which section changed, list of changed fields with old/new values, who made the change, timestamp, link to the settings page.

**Batching:** Multiple saves within 5 minutes are combined into one email.

### Site Notifications

| Name | Event | Type | Persistent | Recipients | Record ID |
|------|-------|------|-----------|------------|-----------|
| Settings Updated | `settings.updated` | Info | No (auto-dismiss) | All Administrators | `recdg20vZW9rqFrye` |
| Permalink Changed | `settings.permalinks_changed` | Warning | Yes (stays until dismissed) | All Administrators | `rec1HP1mzeOQv3Ev1` |

**Settings Updated:** Brief info toast showing which section was changed. Auto-dismisses after a few seconds.

**Permalink Changed:** Persistent warning notification in the admin notification bell. Alerts all administrators that URL structures have changed, which may affect SEO, bookmarks, and external links. Remains until explicitly dismissed.

---

## Role & Capability Matrix

| Action | Administrator | Editor | Author | Contributor | Subscriber |
|--------|:------------:|:------:|:------:|:-----------:|:----------:|
| View settings pages | Yes | No | No | No | No |
| Update general settings | Yes | No | No | No | No |
| Update reading settings | Yes | No | No | No | No |
| Update writing settings | Yes | No | No | No | No |
| Update discussion settings | Yes | No | No | No | No |
| Update permalink settings | Yes | No | No | No | No |
| Update privacy settings | Yes | No | No | No | No |
| Export settings | Yes | No | No | No | No |
| Import settings | Yes | No | No | No | No |
| Read public settings (API) | Yes | Yes | Yes | Yes | Yes |

### Required Capabilities

| Capability | Description | Roles |
|-----------|-------------|-------|
| `manage_options` | View and modify all site settings | Administrator |
| `export_settings` | Export site settings as JSON | Administrator |
| `import_settings` | Import site settings from JSON | Administrator |

### Route Guard Pattern

```typescript
// Admin settings layout route
export const Route = createFileRoute("/admin/settings")({
  beforeLoad: async ({ context }) => {
    if (!context.auth.hasCapability("manage_options")) {
      throw redirect({ to: "/admin" });
    }
  },
});
```

---

## Dependencies

### Depends On

| System | Type | What Is Needed |
|--------|------|----------------|
| **Role & Capability System** (`recLjkb6BJlxqHTQv`) | **Hard** | `manage_options` capability check on every settings route and mutation. Cannot function without role checks. |
| **Auth System** | **Hard** | Must be authenticated to access any settings page. auth session required. |

### Depended On By

| System | Type | What They Need |
|--------|------|----------------|
| **Routing System** (`recaxtoOKlVuM8sD2`) | **Hard** | Permalink structure, categoryBase, tagBase for URL generation and resolution. Listens for `settings.permalinks_changed` event. |
| **Comment System** | **Soft** | Discussion settings: moderation rules, avatar config, comment policies |
| **Post System** | **Soft** | defaultCategory, defaultPostFormat from Writing settings |
| **Registration System** | **Soft** | membershipEnabled, defaultRole from General settings |
| **RSS/Feed System** | **Soft** | feedItemCount, feedContentDisplay from Reading settings |
| **SEO System** | **Soft** | searchEngineVisibility, siteTitle, tagline for meta tags |
| **Sitemap System** | **Soft** | Permalink structure for URL generation. Listens for `settings.permalinks_changed`. |
| **Page System** | **Soft** | homepageId, postsPageId, privacyPolicyPageId page references |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| **Convex** | Settings storage, reactive queries, mutations, event scheduling |
| **Convex Auth** | Authentication for admin access |
| **Intl API / date-fns** | Date/time format preview in General Settings |
| **IANA Timezone Database** | Timezone list for General Settings timezone picker |

---

## Implementation Checklist

### Backend (`ConvexPress-Admin/packages/backend/`)
- [ ] `convex/settings/schema.ts` - 1 table (`settings`) with section-based design
- [ ] `convex/settings/queries.ts` - 5 queries (`get`, `getBySection`, `getAutoloaded`, `getPublic`, `exportAll`)
- [ ] `convex/settings/mutations.ts` - 2 mutations (`updateSection`, `importAll`)
- [ ] `convex/settings/internal.ts` - 1 internal query (`getInternal`)
- [ ] `convex/settings/helpers.ts` - Shared logic: `getDefaults()`, `validateSection()`, `computeChanges()`
- [ ] `convex/settings/defaults.ts` - All default value constants
- [ ] `convex/settings/validators.ts` - Per-section Convex validators

### Admin Frontend (`ConvexPress-Admin/apps/web/`)
- [ ] `src/routes/admin/settings/index.tsx` - Redirect to `/admin/settings/general`
- [ ] `src/routes/admin/settings/general.tsx` - General Settings page
- [ ] `src/routes/admin/settings/reading.tsx` - Reading Settings page
- [ ] `src/routes/admin/settings/writing.tsx` - Writing Settings page
- [ ] `src/routes/admin/settings/discussion.tsx` - Discussion Settings page
- [ ] `src/routes/admin/settings/permalinks.tsx` - Permalink Settings page
- [ ] `src/routes/admin/settings/privacy.tsx` - Privacy Settings page
- [ ] `src/components/settings/SettingsForm.tsx` - Shared form wrapper (dirty tracking, save button, navigation guard)
- [ ] `src/components/settings/DateFormatPreview.tsx` - Live date format preview
- [ ] `src/components/settings/TimeFormatPreview.tsx` - Live time format preview
- [ ] `src/components/settings/TimezoneSelect.tsx` - Searchable timezone picker
- [ ] `src/components/settings/PageSelect.tsx` - Page selection combobox
- [ ] `src/components/settings/CategorySelect.tsx` - Category selection combobox
- [ ] `src/components/settings/PermalinkTagButtons.tsx` - Tag insertion buttons for custom permalink structure
- [ ] `src/components/settings/ImportExport.tsx` - Import/export UI with diff preview

### Website Frontend (`ConvexPress-Website/apps/web/`)
- [ ] `src/contexts/SettingsContext.tsx` - React context provider + `useSettings()` hook
- [ ] `src/components/SiteHeader.tsx` - Consumes siteTitle, tagline
- [ ] `src/components/SiteFooter.tsx` - Consumes privacyPolicyPageId, showPrivacyPolicyLink
- [ ] Root layout integration - Wraps children with `<SettingsProvider>`

---

## Validation Rules Reference

### General Settings

| Field | Rules |
|-------|-------|
| `siteTitle` | Required, 1-200 characters, trimmed |
| `tagline` | Optional, max 500 characters, trimmed |
| `siteUrl` | Required, valid URL (https preferred), no trailing slash |
| `homeUrl` | Required, valid URL (https preferred), no trailing slash |
| `adminEmail` | Required, valid email format |
| `membershipEnabled` | Boolean |
| `defaultRole` | One of: "subscriber", "contributor", "author", "editor" |
| `siteLanguage` | Valid BCP 47 language tag |
| `timezone` | Valid IANA timezone identifier |
| `dateFormat` | Valid date-fns format string |
| `timeFormat` | Valid date-fns format string |
| `weekStartsOn` | Integer 0-6 |

### Reading Settings

| Field | Rules |
|-------|-------|
| `homepageDisplays` | "latest_posts" or "static_page" |
| `homepageId` | Required when static_page; must reference published page |
| `postsPageId` | Optional; must reference published page; cannot equal homepageId |
| `postsPerPage` | Integer 1-100 |
| `feedItemCount` | Integer 1-100 |
| `feedContentDisplay` | "full" or "summary" |
| `searchEngineVisibility` | Boolean |

### Writing Settings

| Field | Rules |
|-------|-------|
| `defaultCategory` | Must reference existing category or null |
| `defaultPostFormat` | Valid post format string |

### Discussion Settings

| Field | Rules |
|-------|-------|
| All boolean fields | Must be boolean |
| `autoCloseAfterDays` | Integer 1-365 |
| `threadedCommentsDepth` | Integer 1-10 |
| `commentsPerPage` | Integer 1-200 |
| `defaultCommentsPage` | "newest" or "oldest" |
| `commentOrder` | "asc" or "desc" |
| `holdIfLinksExceed` | Integer 0-100 |
| `moderationWordList` | String, max 50,000 characters |
| `disallowedWordList` | String, max 50,000 characters |
| `avatarRating` | "G", "PG", "R", or "X" |
| `defaultAvatar` | Valid avatar key |

### Permalink Settings

| Field | Rules |
|-------|-------|
| `structure` | One of 6 defined structures |
| `customStructure` | Required when custom; must contain %postname% or %post_id%; must start with `/` |
| `categoryBase` | Optional, alphanumeric + hyphens, no leading/trailing slashes, max 100 chars |
| `tagBase` | Optional, alphanumeric + hyphens, no leading/trailing slashes, max 100 chars |

### Privacy Settings

| Field | Rules |
|-------|-------|
| `privacyPolicyPageId` | Must reference existing page or null |
| `showPrivacyPolicyLink` | Boolean |

---

## Edge Cases & Gotchas

1. **Concurrent edits:** If two administrators edit the same section simultaneously, Convex transactional writes ensure last-write-wins. The losing admin's form reactively updates (Convex subscription) and a toast appears: "Settings were updated by another administrator. Your form has been refreshed."

2. **Referenced page deletion:** If a page referenced by `homepageId`, `postsPageId`, or `privacyPolicyPageId` is deleted or unpublished, the setting retains the stale ID. The website falls back gracefully (homepage -> latest posts, posts page -> none, privacy link -> hidden). The admin settings page must show a warning badge next to fields referencing deleted/unpublished pages.

3. **Referenced category deletion:** If `defaultCategory` is deleted, the setting is automatically reset to null. The Post System falls back to the first available category or "Uncategorized."

4. **Invalid timezone/locale:** If a stored timezone or locale becomes invalid (extremely rare, e.g., IANA removes a timezone), fall back to defaults ("America/New_York" / "en-US") and log a warning.

5. **Empty site URL on first load:** Auto-detect from `window.location.origin` (admin) or request host (SSR). Prompt the administrator to confirm the detected URL.

6. **Permalink change impact:** Display a confirmation dialog before saving: "Changing permalink structure will affect all existing post URLs. This may impact SEO and existing bookmarks. Are you sure?" After confirming, the Routing System generates 301 redirects from old URLs to new URLs.

7. **Large word lists:** Moderation and disallowed word lists may contain thousands of entries. Enforce the 50,000 character limit. Display a character count indicator. Validate proper newline separation.

8. **Optimistic update flash:** Use Convex optimistic updates in admin forms so the UI does not flash or reset on save. Without this, the form briefly shows old values after mutation completes but before the subscription re-fires.

9. **Navigation guard race condition:** The dirty tracking state must be reset immediately on successful save, not on subscription update. Otherwise, the user might navigate away during the brief window between mutation return and subscription update, triggering a false "unsaved changes" warning.

10. **Posts page equals homepage:** If a user sets `postsPageId` equal to `homepageId`, validation must reject this. A page cannot serve both roles.

11. **Date/time format preview timezone:** The live preview in General Settings should render the preview in the currently-selected timezone, not the browser's local timezone. If the user changes the timezone dropdown, the preview should update.

12. **Privacy policy template generation:** The "Generate Privacy Policy Template" link in Privacy Settings creates a new draft page with template content. This is a mutation that creates a page document, not a settings operation. It should be handled by the Page System but triggered from the Privacy Settings UI.

13. **Import with missing references:** When importing settings that reference pages or categories by name, if the referenced content does not exist on the target site, that field is skipped (set to null) with a warning message in the import preview UI.

14. **Section document creation vs update:** On first save of any section, the document must be created (insert). On subsequent saves, it must be updated (patch). The `updateSection` mutation handles this with an upsert pattern.

15. **Email notification batching scope:** When multiple sections are saved in quick succession (e.g., admin saves General, then immediately saves Reading), the batched email should combine all changes into one notification rather than sending separate emails per section.

---

## WordPress Functions Reference

| WordPress Function | ConvexPress Equivalent | Notes |
|-------------------|----------------------|-------|
| `get_option($key, $default)` | `useQuery(api.settings.getBySection, { section })` | ConvexPress groups by section, not individual keys |
| `update_option($key, $value)` | `useMutation(api.settings.updateSection)` | Updates entire section at once, not individual keys |
| `add_option($key, $value, $autoload)` | `useMutation(api.settings.updateSection)` | Same as update -- upsert pattern handles creation |
| `delete_option($key)` | Not needed | Sections are never deleted; reset to defaults instead |
| `wp_load_alloptions()` | `useQuery(api.settings.getAutoloaded)` | Returns all sections needed on every page load |
| `register_setting($group, $name, $args)` | Section schema definition in `validators.ts` | Validation is defined in code, not registered dynamically |
| `settings_fields($group)` | N/A | Nonce/security handled by the auth system auth + Convex |
| `do_settings_sections($page)` | Route component renders sections directly | Each settings page is a TanStack Router route |
| `add_settings_section(...)` | UI layout in route component | Sections are React components, not registered dynamically |
| `add_settings_field(...)` | UI field in route component | Fields are React components in the route file |
| `pre_update_option_{$option}` | Convex mutation validator | Validation runs in the mutation handler before write |
| `update_option_{$option}` | Event: `settings.updated` | Emitted via `ctx.scheduler.runAfter(0, internal.events.dispatch, ...)` |
| `update_option` (generic) | Event: `settings.updated` | Same event covers all section updates |

---

## Import/Export Format

### Export JSON Structure

```json
{
  "version": "1.0",
  "exportedAt": "2026-02-08T14:30:00Z",
  "exportedBy": "admin@example.com",
  "settings": {
    "general": {
      "siteTitle": "My Site",
      "tagline": "Just another ConvexPress site",
      "siteUrl": "https://example.com",
      "..."
    },
    "reading": { "..." },
    "writing": { "..." },
    "discussion": { "..." },
    "permalinks": { "..." },
    "privacy": { "..." }
  }
}
```

### Import UI Flow

1. Upload JSON file
2. File validation (schema version check, section validation)
3. Section-by-section diff preview with checkboxes per section
4. Warnings for missing page/category references
5. "Import Selected" / "Cancel" buttons
6. On import: upsert each selected section, emit events per changed section

### Import Reference Resolution

| Reference Field | Match Strategy | Fallback |
|----------------|---------------|----------|
| `homepageId` | Match by page title | Set to null, show warning |
| `postsPageId` | Match by page title | Set to null, show warning |
| `privacyPolicyPageId` | Match by page title | Set to null, show warning |
| `defaultCategory` | Match by category slug | Set to null, show warning |

---

## Performance Requirements

| Operation | Target Latency | Notes |
|-----------|---------------|-------|
| `settings.getBySection` | < 50ms | Convex automatic caching |
| `settings.getAutoloaded` | < 100ms | Fetches 5 sections |
| `settings.getPublic` | < 50ms | Curated subset of values |
| `settings.updateSection` | < 200ms | Mutation including validation |
| Reactive propagation | < 500ms | Changes appear in all subscribed admin sessions |
| Optimistic update | < 100ms | Admin form reflects save immediately |
| Website SSR | 1 call | Single `getAutoloaded` at root layout, not per-component |
