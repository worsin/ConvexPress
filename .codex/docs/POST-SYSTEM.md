# Post System - Expert Knowledge Document

**System:** Post System
**Status:** Implementation Ready
**Priority:** P0 - Critical
**WordPress Equivalent:** wp_posts, wp_postmeta, post editor, post list table, wp_insert_post(), wp_update_post(), wp_delete_post(), wp_trash_post(), WP_Query
**Last Analyzed:** 2026-02-08

---

## MANDATORY: Training Data Drift Guard

Your pretrained knowledge is potentially stale. Before reporting bugs, refactoring framework usage, or introducing API-level changes:

1. Check Airtable Tech Stack Updates first:
   - Base: `apphc1Zda0HD51mla`
   - Table: `tblls7sBy3NVr6vxb`
   - View: `viwEsk5xdgAJH6Fwj`
2. Check Context7 for the latest official docs and examples for the exact technology/version.
3. Compare with existing repository patterns before concluding anything is broken.
4. If Airtable or Context7 conflicts with your assumptions, assume your assumptions are wrong.

### Current High-Impact Convex Changes (Audit Baseline)

- `ctx.db.get`, `ctx.db.patch`, `ctx.db.replace`, and `ctx.db.delete` require table name as first argument (v1.31+).
- Direct calls to registered Convex functions are deprecated/broken for typing; use extracted helpers or `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction`.
- `ConvexHttpClient` mutations queue by default; use `{ skipQueue: true }` only when deliberate concurrency is required.
- Node.js 18 is dropped for Convex Actions runtime; use Node 20 or 22.
- React 17 is no longer supported by recent Convex React integration; use React 18+.
- Validator patterns shifted to discriminated unions (`kind`) instead of class/`instanceof` usage.
- Codegen path unification may require deployment connectivity for `convex codegen`.
- Deploy safety checks now require explicit confirmation for very large index deletions.

Do not classify newer valid patterns as bugs until these checks are complete.

## Quick Reference

### What This System Does

The Post System is the core content management engine of ConvexPress. It implements the complete blog post lifecycle: creation, editing, drafting, scheduling, publishing, unpublishing, trashing, restoring, permanent deletion, duplication, preview, autosave, and bulk operations. This is the WordPress equivalent of the `wp_posts` infrastructure for the `post` post type, including the "All Posts" list table, the post editor screen, and all associated admin and public-facing routes.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Post Statuses** | `auto-draft`, `draft`, `pending`, `publish`, `future`, `private`, `trash` |
| **Post Visibility** | `public`, `private`, `password` |
| **Comment Status** | `open`, `closed` |
| **Sticky Posts** | Pinned to top of blog listings |
| **Slug Generation** | URL-safe, unique among non-trashed posts, auto-generated from title |
| **Scheduling** | Future-dated posts auto-publish via Convex scheduled functions |
| **Autosave** | Debounced auto-save every 60s or 2s after typing stops |
| **Edit Lock** | Concurrent editing prevention via `_edit_lock` meta key |
| **Trash Auto-Purge** | Trashed posts permanently deleted after 30 days |
| **Post Meta** | Extensible key-value metadata per post (`postMeta` table) |
| **Revisions** | Snapshot of post content on each save (delegated to Revision System) |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Database** | MySQL `wp_posts` table | Convex `posts` + `postMeta` tables |
| **Reactivity** | Poll/refresh | Real-time Convex subscriptions |
| **API** | REST API + WP_Query | Convex queries/mutations (type-safe) |
| **Auth** | Cookie-based sessions | Convex Auth JWT tokens |
| **Editor** | Gutenberg (React blocks) | Block editor via Content Editor System |
| **Capabilities** | `current_user_can()` | Convex auth middleware + capability checks |
| **Scheduling** | WP-Cron | Convex scheduled functions |
| **Autosave** | AJAX POST to `wp-admin/admin-ajax.php` | Convex mutation with debounce |
| **Post Formats** | `post-format-*` taxonomy | Deferred to future version |
| **Trackbacks/Pingbacks** | Built-in | Not implemented (obsolete protocol) |
| **Post Password** | Plain text in DB | Hashed in DB, session-based check |
| **Excerpt Auto-Gen** | `wp_trim_excerpt()` strips tags | Client-side trim of first 150 chars of plain text |
| **GUID** | Auto-generated permalink | Not stored (Convex IDs are unique) |

---

## Architecture Overview

### Data Flow

```
User Action (Admin UI)
  -> Convex Auth Auth Check (JWT identity)
  -> Capability Check (Role & Capability System)
  -> Convex Mutation (posts.create / posts.update / etc.)
  -> Database Write (posts table + postMeta table)
  -> Event Emission (Event Dispatcher System)
  -> Subscribers React:
     - Audit Log System (records event)
     - Email Notification System (sends emails via Resend)
     - Site Notification System (shows toasts/bell notifications)
     - Dashboard System (updates widgets)
     - Sitemap System (regenerates XML)
     - RSS Feed System (updates feed)
     - SEO System (updates meta)
     - Search System (updates index)
```

### Real-Time Behavior

Convex reactive subscriptions power live updates throughout the system:

- **Admin "All Posts" list:** Uses `useQuery(api.posts.list, filters)`. When any user creates, publishes, trashes, or updates a post, the list updates in real-time across all connected admin sessions.
- **Status counts tabs:** Separate `useQuery(api.posts.counts)` subscription updates the count badges (All, Published, Drafts, Pending, etc.) without recalculating on every list change.
- **Post editor:** Reactive subscription on `posts.get` shows live updates if another user modifies the same post (triggers edit lock warning).
- **Website single post:** `useQuery(api.posts.get, { slug })` provides live comment count updates.
- **Website blog index:** `useQuery(api.posts.list, { status: "publish" })` updates when new posts are published.

### Authentication & Authorization

- **Auth provider:** Convex Auth
- **Identity check:** Every mutation calls `ctx.auth.getUserIdentity()` to verify the Convex Auth JWT
- **Capability checks:** After identity, the user's role is fetched and capabilities verified using `checkPostCapability()` helper
- **Role-based UI:** Admin routes are gated by role. Subscribers are redirected away from post management. Contributors see limited controls (e.g., "Submit for Review" instead of "Publish").
- **Ownership model:** Many capabilities differ between "own post" and "others' post" (e.g., `edit_posts` for own, `edit_others_posts` for others')

---

## Database Schema

### `posts` Table

```typescript
// convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Post status enum values
const postStatus = v.union(
  v.literal("auto-draft"),
  v.literal("draft"),
  v.literal("pending"),
  v.literal("publish"),
  v.literal("future"),
  v.literal("private"),
  v.literal("trash"),
);

// Comment status enum
const commentStatus = v.union(
  v.literal("open"),
  v.literal("closed"),
);

// Post visibility enum
const postVisibility = v.union(
  v.literal("public"),
  v.literal("private"),
  v.literal("password"),
);

export default defineSchema({
  posts: defineTable({
    // --- Core Fields ---
    title: v.string(),                          // post_title - The post title
    slug: v.string(),                           // post_name - URL-safe slug (unique per status)
    content: v.string(),                        // post_content - Serialized block editor content (JSON)
    excerpt: v.optional(v.string()),            // post_excerpt - Manual excerpt (plain text)
    status: postStatus,                         // post_status - Current lifecycle status

    // --- Authorship ---
    authorId: v.string(),                       // post_author - user identifier of the author

    // --- Publishing ---
    visibility: postVisibility,                 // Derived from post_status + post_password in WP
    password: v.optional(v.string()),           // post_password - Password for protected posts
    publishedAt: v.optional(v.number()),        // post_date - When published (timestamp ms)
    scheduledFor: v.optional(v.number()),       // Future publish date (timestamp ms)

    // --- Discussion ---
    commentStatus: commentStatus,               // comment_status - Whether comments are allowed
    commentCount: v.number(),                   // comment_count - Denormalized comment count

    // --- Display ---
    isSticky: v.boolean(),                      // Sticky post (pinned to top of listings)
    menuOrder: v.number(),                      // menu_order - For custom ordering

    // --- Featured Image ---
    featuredImageId: v.optional(v.string()),     // _thumbnail_id meta - Reference to media item

    // --- Previous Status (for trash/restore) ---
    previousStatus: v.optional(v.string()),     // Status before trashing (for restore)
    trashedAt: v.optional(v.number()),          // When moved to trash (for auto-purge)

    // --- Timestamps ---
    createdAt: v.number(),                      // post_date - Creation timestamp (ms)
    updatedAt: v.number(),                      // post_modified - Last modification timestamp (ms)

    // --- Autosave ---
    autosaveContent: v.optional(v.string()),    // Last autosaved content (not yet manually saved)
    autosaveTitle: v.optional(v.string()),      // Last autosaved title
    autosavedAt: v.optional(v.number()),        // When autosave last ran
  })
    // --- Indexes ---
    .index("by_status", ["status"])
    .index("by_author", ["authorId"])
    .index("by_author_status", ["authorId", "status"])
    .index("by_slug", ["slug"])
    .index("by_published", ["status", "publishedAt"])
    .index("by_scheduled", ["status", "scheduledFor"])
    .index("by_sticky", ["isSticky", "status", "publishedAt"])
    .index("by_updated", ["updatedAt"])
    .index("by_trashed", ["status", "trashedAt"]),

  // --- Post Meta ---
  postMeta: defineTable({
    postId: v.id("posts"),                      // Foreign key to posts table
    key: v.string(),                            // meta_key
    value: v.string(),                          // meta_value (JSON-encoded for complex values)
  })
    .index("by_post", ["postId"])
    .index("by_post_key", ["postId", "key"])
    .index("by_key", ["key"]),
});
```

### Field Specifications

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `title` | `string` | Yes | `""` (auto-draft) | Max 500 chars. Trimmed whitespace. |
| `slug` | `string` | Yes | Auto-generated from title | Lowercase, alphanumeric + hyphens. Max 200 chars. Unique among non-trashed posts. |
| `content` | `string` | Yes | `""` | Serialized JSON (block editor format). No max (Convex handles). |
| `excerpt` | `string` | No | `undefined` | Max 1000 chars. Plain text only. |
| `status` | `enum` | Yes | `"auto-draft"` | One of: auto-draft, draft, pending, publish, future, private, trash |
| `authorId` | `string` | Yes | Current user Convex Auth ID | Valid user identifier. |
| `visibility` | `enum` | Yes | `"public"` | One of: public, private, password |
| `password` | `string` | No | `undefined` | Required when visibility = "password". Min 1 char. |
| `publishedAt` | `number` | No | Set on publish | Unix timestamp (ms). |
| `scheduledFor` | `number` | No | `undefined` | Must be in the future when status = "future". |
| `commentStatus` | `enum` | Yes | `"open"` | Default from Settings System (discussion settings). |
| `commentCount` | `number` | Yes | `0` | Non-negative integer. Updated by Comment System. |
| `isSticky` | `boolean` | Yes | `false` | |
| `menuOrder` | `number` | Yes | `0` | Integer. Lower = higher priority. |
| `featuredImageId` | `string` | No | `undefined` | Valid media ID from Media System. |
| `previousStatus` | `string` | No | `undefined` | Set when trashing. Cleared on restore. |
| `trashedAt` | `number` | No | `undefined` | Set when trashing. Used for 30-day auto-purge. |
| `createdAt` | `number` | Yes | `Date.now()` | Immutable after creation. |
| `updatedAt` | `number` | Yes | `Date.now()` | Updated on every mutation. |
| `autosaveContent` | `string` | No | `undefined` | Overwritten on each autosave. Cleared on manual save. |
| `autosaveTitle` | `string` | No | `undefined` | Overwritten on each autosave. Cleared on manual save. |
| `autosavedAt` | `number` | No | `undefined` | Timestamp of last autosave. |

### Indexes

| Index Name | Fields | Purpose |
|-----------|--------|---------|
| `by_status` | `["status"]` | Filter posts by status tab (All Posts list table) |
| `by_author` | `["authorId"]` | Filter by author (author archive, "My Posts") |
| `by_author_status` | `["authorId", "status"]` | Combined author + status filter |
| `by_slug` | `["slug"]` | Permalink lookup (O(1) for website single post route) |
| `by_published` | `["status", "publishedAt"]` | Published posts sorted by date (blog index, RSS) |
| `by_scheduled` | `["status", "scheduledFor"]` | Find future posts for scheduled publish cron |
| `by_sticky` | `["isSticky", "status", "publishedAt"]` | Sticky posts first in listings |
| `by_updated` | `["updatedAt"]` | Recently modified posts |
| `by_trashed` | `["status", "trashedAt"]` | Trash auto-purge candidates |

### Search Index

```typescript
posts: defineTable({...})
  .searchIndex("search_posts", {
    searchField: "title",
    filterFields: ["status", "authorId"],
  })
```

### `postMeta` Known Keys

| Meta Key | Used By | Value Type | Description |
|----------|---------|------------|-------------|
| `_edit_lock` | Post System | `string` (JSON: `{ userId, timestamp }`) | Concurrent edit lock |
| `_edit_last` | Post System | `string` (user identifier) | Last user to edit |
| `_thumbnail_id` | Media System | `string` (media ID) | Featured image (also in `featuredImageId`) |
| `_seo_title` | SEO System | `string` | Custom SEO title override |
| `_seo_description` | SEO System | `string` | Custom meta description |
| `_seo_canonical` | SEO System | `string` | Canonical URL override |
| `_seo_og_image` | SEO System | `string` | Open Graph image URL |
| `_seo_noindex` | SEO System | `string` ("true"/"false") | Exclude from search engines |
| `_custom_css` | theme configuration | `string` | Per-post custom CSS |

### Relationships

| This Table | Related Table | Relationship | Details |
|-----------|--------------|-------------|---------|
| `posts.authorId` | Convex Auth Users | Many-to-One | Author of the post (user identifier string) |
| `posts._id` | `postMeta.postId` | One-to-Many | Extensible metadata for each post |
| `posts._id` | `termRelationships.objectId` (Taxonomy) | Many-to-Many | Categories and tags assigned to posts |
| `posts._id` | `comments.postId` (Comment) | One-to-Many | Comments on a post |
| `posts._id` | `revisions.postId` (Revision) | One-to-Many | Revision snapshots |
| `posts.featuredImageId` | Media items | Many-to-One | Featured image reference |

---

## Actions & Functions

### Mutations

#### `post.create` - Create Post

- **Convex Function:** `mutations/posts.create`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor, Author, Contributor (requires `edit_posts`)
- **Args:**
  ```typescript
  {
    title: v.optional(v.string()),          // Default: "" (auto-draft)
    content: v.optional(v.string()),        // Default: ""
    excerpt: v.optional(v.string()),
    status: v.optional(postStatus),         // Default: "auto-draft"
    visibility: v.optional(postVisibility), // Default: "public"
    password: v.optional(v.string()),
    commentStatus: v.optional(commentStatus),
    scheduledFor: v.optional(v.number()),
    featuredImageId: v.optional(v.string()),
    isSticky: v.optional(v.boolean()),
    categoryIds: v.optional(v.array(v.string())),  // Passed to Taxonomy System
    tagIds: v.optional(v.array(v.string())),        // Passed to Taxonomy System
  }
  ```
- **Returns:** `Id<"posts">` - The new post ID
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Check capability: `edit_posts`.
  3. If `status` is `"publish"`, check `publish_posts` capability. Contributors cannot set status to publish - force to `"pending"`.
  4. If `status` is `"future"`, validate `scheduledFor` is in the future. Schedule the `publishScheduledPost` cron function.
  5. If `status` is `"private"`, set `visibility` to `"private"`.
  6. Generate slug from title using `generateUniqueSlug()`.
  7. If `commentStatus` not provided, read default from Settings System (`default_comment_status`).
  8. Insert post record into `posts` table with defaults: `commentCount: 0`, `isSticky: false`, `menuOrder: 0`, `createdAt: Date.now()`, `updatedAt: Date.now()`.
  9. If `categoryIds` provided, call Taxonomy System `taxonomy.assign` for each.
  10. If `tagIds` provided, call Taxonomy System `taxonomy.assign` for each.
  11. If no categories assigned, assign the default category from Settings System.
  12. Emit event: `post.created` with payload `{ postId, title, authorId, postType: "post", status }`.
  13. Return the new post ID.
- **Events:** `post.created`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `FORBIDDEN`: User lacks `edit_posts` capability.
  - `FORBIDDEN`: Contributor attempting to set status to `publish`/`future`/`private`.
  - `VALIDATION_ERROR`: `scheduledFor` is in the past when `status` is `future`.
  - `VALIDATION_ERROR`: `password` missing when `visibility` is `password`.
  - `VALIDATION_ERROR`: `title` exceeds 500 characters.

---

#### `post.update` - Update Post

- **Convex Function:** `mutations/posts.update`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor, Author, Contributor
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    status: v.optional(postStatus),
    visibility: v.optional(postVisibility),
    password: v.optional(v.string()),
    commentStatus: v.optional(commentStatus),
    scheduledFor: v.optional(v.number()),
    featuredImageId: v.optional(v.string()),
    isSticky: v.optional(v.boolean()),
    slug: v.optional(v.string()),
    menuOrder: v.optional(v.number()),
    authorId: v.optional(v.string()),           // Admin/Editor only - reassign author
  }
  ```
- **Returns:** Updated `Post` object
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Fetch the existing post.
  3. **Capability checks:**
     - Own post: Requires `edit_posts`.
     - Others' post: Requires `edit_others_posts`.
     - Published post: Requires `edit_published_posts`.
     - Private post: Requires `edit_private_posts`.
     - Changing author: Requires `edit_others_posts`.
     - Setting sticky: Requires `edit_others_posts` (Editor+ only).
  4. If `status` is changing:
     - To `publish`: Check `publish_posts`. If contributor, force to `pending`.
     - To `future`: Validate `scheduledFor` in the future. Schedule cron.
     - To `private`: Set `visibility` to `"private"`.
  5. If `slug` is changing, validate uniqueness via `generateUniqueSlug()`.
  6. If `title` changed and slug was auto-generated, regenerate slug.
  7. Create a revision snapshot (call Revision System) before applying changes.
  8. Track changed fields for the event payload.
  9. Clear autosave fields (`autosaveContent`, `autosaveTitle`, `autosavedAt`).
  10. Update `updatedAt` to `Date.now()`.
  11. Update post record.
  12. Emit event: `post.updated` with payload `{ postId, title, authorId, changes }`.
  13. Return the updated post.
- **Events:** `post.updated`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `NOT_FOUND`: Post does not exist.
  - `FORBIDDEN`: User lacks capability for the operation.
  - `FORBIDDEN`: Contributor trying to publish.
  - `CONFLICT`: Slug already taken by another post.
  - `VALIDATION_ERROR`: `scheduledFor` in the past for future status.

---

#### `post.publish` - Publish Post

- **Convex Function:** `mutations/posts.publish`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor, Author (requires `publish_posts`)
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
  }
  ```
- **Returns:** Updated `Post` object
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Fetch the existing post.
  3. **Capability checks:**
     - Own post: Requires `publish_posts`.
     - Others' post: Requires `edit_others_posts` + `publish_posts`.
  4. Validate post has a title (cannot publish empty title).
  5. Set `status` to `"publish"`.
  6. Set `visibility` to `"public"` (unless already `"private"` or `"password"`).
  7. Set `publishedAt` to `Date.now()` if not already set.
  8. Clear `scheduledFor` if it was a future post.
  9. Update `updatedAt`.
  10. Emit event: `post.published` with payload `{ postId, title, authorId, url, publishedAt }`.
  11. Return the updated post.
- **Events:** `post.published`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `NOT_FOUND`: Post does not exist.
  - `FORBIDDEN`: User lacks `publish_posts` capability (Contributors).
  - `FORBIDDEN`: User cannot publish others' posts without `edit_others_posts`.
  - `VALIDATION_ERROR`: Post has empty title.
  - `INVALID_STATE`: Post is already published (idempotent - return success but don't re-emit event).
  - `INVALID_STATE`: Post is in trash (must restore first).

---

#### `post.unpublish` - Unpublish Post

- **Convex Function:** `mutations/posts.unpublish`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    targetStatus: v.optional(v.union(v.literal("draft"), v.literal("pending"))),  // Default: "draft"
  }
  ```
- **Returns:** Updated `Post` object
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Fetch the existing post.
  3. Verify post is currently `"publish"` or `"private"`.
  4. **Capability checks:**
     - Own post: Requires `edit_published_posts`.
     - Others' post: Requires `edit_others_posts`.
  5. Set `status` to `targetStatus` (default: `"draft"`).
  6. Set `visibility` to `"public"` (reset from private/password).
  7. Retain `publishedAt` (preserves original publish date for potential re-publish).
  8. Update `updatedAt`.
  9. Emit event: `post.unpublished` with payload `{ postId, title, authorId }`.
  10. Return the updated post.
- **Events:** `post.unpublished`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `NOT_FOUND`: Post does not exist.
  - `FORBIDDEN`: User lacks capability.
  - `INVALID_STATE`: Post is not currently published or private.

---

#### `post.schedule` - Schedule Post

- **Convex Function:** `mutations/posts.schedule`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor, Author (requires `publish_posts`)
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    scheduledFor: v.number(),               // Future timestamp (ms)
  }
  ```
- **Returns:** Updated `Post` object
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Fetch the existing post.
  3. **Capability checks:**
     - Own post: Requires `publish_posts`.
     - Others' post: Requires `edit_others_posts` + `publish_posts`.
  4. Validate `scheduledFor` is in the future (at least 1 minute from now).
  5. Set `status` to `"future"`.
  6. Set `scheduledFor` field.
  7. Schedule a Convex scheduled function: `ctx.scheduler.runAt(scheduledFor, internal.posts.publishScheduled, { postId })`.
  8. Store the scheduled function ID in `postMeta` so it can be cancelled if un-scheduled.
  9. Update `updatedAt`.
  10. Emit event: `post.scheduled` with payload `{ postId, title, authorId, scheduledFor }`.
  11. Return the updated post.
- **Events:** `post.scheduled`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `NOT_FOUND`: Post does not exist.
  - `FORBIDDEN`: User lacks `publish_posts` capability.
  - `VALIDATION_ERROR`: `scheduledFor` is in the past.
  - `INVALID_STATE`: Post is in trash.

**Scheduled Function: `internal.posts.publishScheduled`**
```typescript
internalMutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get(postId);
    if (!post || post.status !== "future") return; // Already changed - no-op

    await ctx.db.patch(postId, {
      status: "publish",
      publishedAt: Date.now(),
      scheduledFor: undefined,
      updatedAt: Date.now(),
    });

    // Emit post.published event
    await ctx.runMutation(internal.events.emit, {
      code: "post.published",
      payload: {
        postId,
        title: post.title,
        authorId: post.authorId,
        publishedAt: Date.now(),
      },
    });
  },
});
```

---

#### `post.trash` - Trash Post

- **Convex Function:** `mutations/posts.trash`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor, Author
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
  }
  ```
- **Returns:** Success boolean
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Fetch the existing post.
  3. **Capability checks:**
     - Own post: Requires `delete_posts`.
     - Others' post: Requires `delete_others_posts`.
     - Published post: Requires `delete_published_posts`.
     - Private post: Requires `delete_private_posts`.
  4. Store `previousStatus` (current status before trashing).
  5. Set `status` to `"trash"`.
  6. Set `trashedAt` to `Date.now()`.
  7. If post was `"future"`, cancel the scheduled publish function.
  8. Schedule auto-purge: `ctx.scheduler.runAt(trashedAt + 30_DAYS, internal.posts.autoPurge, { postId })`.
  9. Update `updatedAt`.
  10. Emit event: `post.trashed` with payload `{ postId, title, authorId }`.
  11. Return success.
- **Events:** `post.trashed`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `NOT_FOUND`: Post does not exist.
  - `FORBIDDEN`: User lacks delete capability.
  - `INVALID_STATE`: Post is already in trash.

---

#### `post.restore` - Restore Post from Trash

- **Convex Function:** `mutations/posts.restore`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
  }
  ```
- **Returns:** Restored `Post` object
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Fetch the existing post.
  3. Verify post is currently in `"trash"` status.
  4. **Capability checks:**
     - Own post: Requires `delete_posts`.
     - Others' post: Requires `delete_others_posts`.
  5. Restore `status` to `previousStatus` (default: `"draft"` if previousStatus is missing).
  6. Clear `previousStatus` and `trashedAt`.
  7. Cancel the auto-purge scheduled function.
  8. If restored status is `"future"` and `scheduledFor` is now in the past, set status to `"draft"` instead.
  9. Update `updatedAt`.
  10. Emit event: `post.restored` with payload `{ postId, title, authorId }`.
  11. Return the restored post.
- **Events:** `post.restored`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `NOT_FOUND`: Post does not exist.
  - `FORBIDDEN`: User lacks capability.
  - `INVALID_STATE`: Post is not in trash.

---

#### `post.delete` - Permanently Delete Post

- **Convex Function:** `mutations/posts.delete`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    force: v.optional(v.boolean()),         // If true, skip trash and delete immediately
  }
  ```
- **Returns:** Success boolean
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Fetch the existing post.
  3. If `force` is not true and post is not in `"trash"`, return error (must trash first).
  4. **Capability checks:**
     - Own post: Requires `delete_posts`.
     - Others' post: Requires `delete_others_posts`.
     - Published post: Requires `delete_published_posts`.
  5. Delete all `postMeta` records for this post.
  6. Delete all taxonomy relationships for this post (notify Taxonomy System).
  7. Delete all revisions for this post (notify Revision System).
  8. Delete all comments associated with this post (match WordPress behavior).
  9. Delete the post record from `posts` table.
  10. Emit event: `post.deleted` with payload `{ postId, title, authorId }`.
  11. Return success.
- **Events:** `post.deleted`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `NOT_FOUND`: Post does not exist.
  - `FORBIDDEN`: User lacks delete capability.
  - `INVALID_STATE`: Post is not in trash and `force` is not true.

---

#### `post.duplicate` - Duplicate Post

- **Convex Function:** `mutations/posts.duplicate`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor, Author
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
  }
  ```
- **Returns:** `Id<"posts">` - The new duplicated post ID
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Fetch the source post.
  3. **Capability checks:**
     - Own post: Requires `edit_posts`.
     - Others' post: Requires `edit_others_posts`.
  4. Create a new post with:
     - Same `title` with " (Copy)" appended.
     - Same `content`, `excerpt`.
     - `status` set to `"draft"` (never duplicate as published).
     - `authorId` set to the current user (not the original author).
     - New `slug` generated from the modified title.
     - Same `commentStatus`, `visibility` reset to `"public"`, `isSticky` set to `false`.
     - Same `featuredImageId`.
     - `publishedAt` cleared.
     - `commentCount` set to 0.
  5. Copy all `postMeta` records from the source (except `_edit_lock`, `_edit_last`).
  6. Copy taxonomy assignments from the source post.
  7. Do NOT copy comments or revisions.
  8. Return the new post ID.
- **Events:** `post.created` (with the new post's data)
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `NOT_FOUND`: Source post does not exist.
  - `FORBIDDEN`: User lacks capability to read the source post.

---

#### `post.autosave` - Autosave Post Content

- **Convex Function:** `mutations/posts.autosave`
- **Type:** Mutation (internal, called by debounced client)
- **Auth:** Required
- **Capabilities:** Administrator, Editor, Author, Contributor
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  }
  ```
- **Returns:** `{ autosavedAt: number }`
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Fetch the post.
  3. Verify user can edit this post.
  4. Update only autosave fields:
     - `autosaveTitle` (if provided)
     - `autosaveContent` (if provided)
     - `autosavedAt` to `Date.now()`
  5. Do NOT update `updatedAt` (autosave is invisible to modification tracking).
  6. Do NOT create a revision.
  7. Do NOT emit events.
  8. Return `{ autosavedAt }`.
- **Client-side Debounce:** Every 60 seconds (or 2 seconds after the user stops typing, whichever comes first).
- **Events:** None
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `FORBIDDEN`: User cannot edit this post.
  - Silently fails if post was deleted (no error thrown to client).

---

#### `post.bulkTrash` - Bulk Trash Posts

- **Convex Function:** `mutations/posts.bulkTrash`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor (requires `delete_others_posts`)
- **Args:**
  ```typescript
  {
    postIds: v.array(v.id("posts")),
  }
  ```
- **Returns:** `{ trashed: number, errors: Array<{ postId, error }> }`
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Check `delete_others_posts` capability.
  3. For each post, execute `post.trash` logic.
  4. Emit `post.trashed` event for each trashed post.
  5. Return results with success count and any errors.
- **Events:** `post.trashed` (one per post)

---

#### `post.bulkRestore` - Bulk Restore Posts

- **Convex Function:** `mutations/posts.bulkRestore`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor (requires `delete_others_posts`)
- **Args:**
  ```typescript
  {
    postIds: v.array(v.id("posts")),
  }
  ```
- **Returns:** `{ restored: number, errors: Array<{ postId, error }> }`
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Check `delete_others_posts` capability.
  3. For each post, execute `post.restore` logic.
  4. Emit `post.restored` event for each restored post.
  5. Return results with success count and any errors.
- **Events:** `post.restored` (one per post)

---

#### `post.bulkPublish` - Bulk Publish Posts

- **Convex Function:** `mutations/posts.bulkPublish`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor (requires `publish_posts` + `edit_others_posts`)
- **Args:**
  ```typescript
  {
    postIds: v.array(v.id("posts")),
  }
  ```
- **Returns:** `{ published: number, errors: Array<{ postId, error }> }`
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Check `publish_posts` + `edit_others_posts` capabilities.
  3. For each post, verify it's in a publishable status (draft, pending, future).
  4. Execute `post.publish` logic for each.
  5. Emit `post.published` event for each published post.
  6. Return results with success count and any errors.
- **Events:** `post.published` (one per post)

---

#### `post.bulkDelete` - Bulk Delete Posts

- **Convex Function:** `mutations/posts.bulkDelete`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor (requires `delete_others_posts`)
- **Args:**
  ```typescript
  {
    postIds: v.array(v.id("posts")),
  }
  ```
- **Returns:** `{ deleted: number, errors: Array<{ postId, error }> }`
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Check `delete_others_posts` capability.
  3. Validate all posts exist and are in `"trash"` status.
  4. For each post, execute `post.delete` logic (delete meta, comments, revisions, taxonomies, then the post).
  5. Emit `post.deleted` event for each deleted post.
  6. Return results.
- **Events:** `post.deleted` (one per post)
- **Errors:**
  - `VALIDATION_ERROR`: Empty `postIds` array.
  - `PARTIAL_FAILURE`: Some posts could not be deleted (returns both successes and errors).

---

### Queries

#### `posts.get` - Get Single Post

- **Convex Function:** `queries/posts.get`
- **Type:** Query
- **Auth:** Optional (public posts don't require auth)
- **Args:**
  ```typescript
  {
    postId: v.optional(v.id("posts")),
    slug: v.optional(v.string()),           // Alternative lookup by slug
  }
  ```
- **Returns:** `Post | null` (with denormalized author data: name, avatar from the auth system)
- **Behavior:**
  1. Look up post by `postId` or `slug` (using `by_slug` index).
  2. If post not found, return `null`.
  3. **Visibility checks:**
     - `publish` status: Visible to all (including anonymous on website).
     - `private` status: Requires `read_private_posts` capability.
     - `draft` / `pending` / `auto-draft`: Requires `edit_posts` (own) or `edit_others_posts` (others').
     - `future`: Requires `edit_posts` (own) or `edit_others_posts` (others').
     - `trash`: Requires `edit_posts` (own) or `edit_others_posts` (others').
     - Password-protected: Return post but mark `isPasswordProtected: true`. Content is withheld until password verified.
  4. Return post with denormalized author data (name, avatar from the auth system).
- **Errors:**
  - `NOT_FOUND`: Post ID or slug does not exist.
  - `FORBIDDEN`: User cannot view private/draft post they don't own.

---

#### `posts.list` - List Posts

- **Convex Function:** `queries/posts.list`
- **Type:** Query
- **Auth:** Optional (public listing of published posts doesn't require auth)
- **Args:**
  ```typescript
  {
    status: v.optional(postStatus),
    authorId: v.optional(v.string()),
    search: v.optional(v.string()),
    categoryId: v.optional(v.string()),
    tagId: v.optional(v.string()),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    isSticky: v.optional(v.boolean()),
    orderBy: v.optional(v.union(
      v.literal("publishedAt"),
      v.literal("updatedAt"),
      v.literal("title"),
      v.literal("commentCount"),
    )),
    orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    page: v.optional(v.number()),            // 1-based pagination
    perPage: v.optional(v.number()),         // Default: 20 (admin), 10 (website)
  }
  ```
- **Returns:** `PostListResult`
  ```typescript
  {
    posts: Post[],
    total: number,
    page: number,
    perPage: number,
    totalPages: number,
  }
  ```
- **Behavior:**
  1. Authenticate user (optional for public website queries where `status = "publish"`).
  2. Apply capability-based filtering:
     - Subscribers: Only `status = "publish"` + `status = "private"` (if has `read_private_posts`).
     - Contributors: Own `draft`/`pending` posts + all published.
     - Authors: Own posts (all statuses except trash) + all published.
     - Editors/Admins: All posts, all statuses.
  3. Apply requested filters (status, author, date range, category, tag, search).
  4. Apply sort order (default: `publishedAt` descending).
  5. For sticky posts: When listing published posts with no specific sort, sticky posts appear first.
  6. Paginate results using Convex cursor-based pagination.
- **Pagination:** Convex `.paginate({ numItems: perPage, cursor })`. Separate count query for total.

---

#### `posts.counts` - Status Counts

- **Convex Function:** `queries/posts.counts`
- **Type:** Query
- **Auth:** Required (admin only)
- **Args:** None
- **Returns:** `PostCounts`
  ```typescript
  {
    all: number,
    publish: number,
    draft: number,
    pending: number,
    future: number,
    private: number,
    trash: number,
    mine: number,        // Current user's posts across all non-trash statuses
  }
  ```
- **Behavior:** Counts posts per status, applying the same capability-based filtering as `posts.list`. Used to populate status filter tabs on the All Posts screen.

---

#### `posts.preview` - Preview Post

- **Convex Function:** `queries/posts.preview`
- **Type:** Query
- **Auth:** Required
- **Capabilities:** Administrator, Editor, Author, Contributor
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
  }
  ```
- **Returns:** Post data merged with autosave content (if newer than saved content)
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Fetch the post including any unsaved autosave data.
  3. **Capability checks:** Own post requires `edit_posts`; others' post requires `edit_others_posts`.
  4. Return the post data merged with autosave content (if newer than saved content).
  5. Preview rendered by website app at `/blog/$slug?preview=true&nonce=$token` with a "Preview" banner.

---

#### `postMeta.getByPost` - Get Post Meta

- **Convex Function:** `queries/postMeta.getByPost`
- **Type:** Query
- **Auth:** Required
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
  }
  ```
- **Returns:** `PostMeta[]` - All meta records for the post
- **Behavior:** Uses `by_post` index to fetch all meta for a given post.

---

#### `postMeta.getByKey` - Get Specific Meta Value

- **Convex Function:** `queries/postMeta.getByKey`
- **Type:** Query
- **Auth:** Required
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    key: v.string(),
  }
  ```
- **Returns:** `PostMeta | null`
- **Behavior:** Uses `by_post_key` index for efficient lookup.

---

### PostMeta Mutations

#### `postMeta.set` - Set Meta Value

- **Convex Function:** `mutations/postMeta.set`
- **Type:** Mutation
- **Args:** `{ postId: v.id("posts"), key: v.string(), value: v.string() }`
- **Behavior:** Upsert: if key exists for this post, update; otherwise insert.

#### `postMeta.delete` - Delete Meta Value

- **Convex Function:** `mutations/postMeta.delete`
- **Type:** Mutation
- **Args:** `{ postId: v.id("posts"), key: v.string() }`
- **Behavior:** Delete the meta record matching postId + key.

#### `postMeta.bulkSet` - Bulk Set Meta Values

- **Convex Function:** `mutations/postMeta.bulkSet`
- **Type:** Mutation
- **Args:** `{ postId: v.id("posts"), meta: v.array(v.object({ key: v.string(), value: v.string() })) }`
- **Behavior:** Upsert each key-value pair for the given post.

---

### Helper Functions

#### `generateUniqueSlug`

```typescript
// convex/helpers/slug.ts
export async function generateUniqueSlug(
  ctx: MutationCtx,
  title: string,
  existingPostId?: Id<"posts">,
): Promise<string> {
  // 1. Slugify title: lowercase, replace spaces/special chars with hyphens
  let base = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);

  if (!base) base = "untitled";

  // 2. Check uniqueness against non-trashed posts
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("posts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (!existing || existing._id === existingPostId) break;
    slug = `${base}-${suffix}`;
    suffix++;
  }

  return slug;
}
```

#### `checkPostCapability`

```typescript
// convex/helpers/postAuth.ts
export async function checkPostCapability(
  ctx: MutationCtx,
  userId: string,
  post: Doc<"posts">,
  action: "edit" | "delete" | "publish" | "read",
): Promise<void> {
  const userRole = await getUserRole(ctx, userId);
  const isOwn = post.authorId === userId;

  switch (action) {
    case "edit":
      if (isOwn) requireCapability(userRole, "edit_posts");
      else requireCapability(userRole, "edit_others_posts");
      if (post.status === "publish") requireCapability(userRole, "edit_published_posts");
      if (post.status === "private") requireCapability(userRole, "edit_private_posts");
      break;
    case "delete":
      if (isOwn) requireCapability(userRole, "delete_posts");
      else requireCapability(userRole, "delete_others_posts");
      if (post.status === "publish") requireCapability(userRole, "delete_published_posts");
      if (post.status === "private") requireCapability(userRole, "delete_private_posts");
      break;
    case "publish":
      requireCapability(userRole, "publish_posts");
      if (!isOwn) requireCapability(userRole, "edit_others_posts");
      break;
    case "read":
      if (post.status === "private") requireCapability(userRole, "read_private_posts");
      if (["draft", "pending", "auto-draft"].includes(post.status)) {
        if (!isOwn) requireCapability(userRole, "edit_others_posts");
        else requireCapability(userRole, "edit_posts");
      }
      break;
  }
}
```

#### `emitPostEvent`

```typescript
// convex/helpers/events.ts
export async function emitPostEvent(
  ctx: MutationCtx,
  code: string,
  payload: Record<string, any>,
): Promise<void> {
  await ctx.runMutation(internal.events.emit, {
    code,
    payload: JSON.stringify(payload),
    system: "post",
    timestamp: Date.now(),
  });
}
```

---

## Events

### `post.created`

- **Type:** Content
- **Triggered By:** `post.create`, `post.duplicate`
- **Payload:**
  ```typescript
  {
    postId: Id<"posts">,
    title: string,
    authorId: string,           // user identifier
    postType: "post",
    status: PostStatus,
  }
  ```
- **Subscribers:**
  - Audit Log: Records creation in activity log.
  - Dashboard: Updates "Recent Activity" widget.
  - Email (conditional): If `status === "pending"`, sends "Pending Post Review Notification" to Editors/Admins.

---

### `post.updated`

- **Type:** Content
- **Triggered By:** `post.update`
- **Payload:**
  ```typescript
  {
    postId: Id<"posts">,
    title: string,
    authorId: string,
    changes: Array<{
      field: string,
      oldValue: any,
      newValue: any,
    }>,
  }
  ```
- **Subscribers:**
  - Audit Log: Records what changed.
  - Revision System: May create a revision snapshot (if changes include content/title).
  - Dashboard: Updates "Recent Activity" widget.

---

### `post.published`

- **Type:** Content
- **Triggered By:** `post.publish`, `internal.posts.publishScheduled`, `post.bulkPublish`
- **Payload:**
  ```typescript
  {
    postId: Id<"posts">,
    title: string,
    authorId: string,
    url: string,                // Full URL of the published post
    publishedAt: number,        // Timestamp (ms)
  }
  ```
- **Subscribers:**
  - Email: "Post Published (Author)" - sent if publisher differs from author.
  - Email: "Post Published (Subscribers)" - batched digest to email subscribers.
  - Site Notification: Success toast to author.
  - Audit Log: Records publish event.
  - Sitemap System: Regenerates XML sitemap.
  - RSS Feed System: Includes new post in feed.
  - SEO System: Triggers OG/schema updates.
  - Dashboard: Updates "At a Glance" counts and "Recent Activity".

---

### `post.unpublished`

- **Type:** Content
- **Triggered By:** `post.unpublish`
- **Payload:**
  ```typescript
  {
    postId: Id<"posts">,
    title: string,
    authorId: string,
  }
  ```
- **Subscribers:**
  - Audit Log: Records unpublish event.
  - Sitemap System: Removes post from XML sitemap.
  - RSS Feed System: Removes post from feed.
  - Dashboard: Updates "At a Glance" counts.

---

### `post.scheduled`

- **Type:** Content
- **Triggered By:** `post.schedule`
- **Payload:**
  ```typescript
  {
    postId: Id<"posts">,
    title: string,
    authorId: string,
    scheduledFor: number,       // Future timestamp (ms)
  }
  ```
- **Subscribers:**
  - Email: "Post Scheduled Reminder" to author.
  - Site Notification: Info notification to author (persistent).
  - Audit Log: Records scheduling event.
  - Dashboard: Updates "Scheduled Posts" widget.

---

### `post.trashed`

- **Type:** Content
- **Triggered By:** `post.trash`, `post.bulkTrash`
- **Payload:**
  ```typescript
  {
    postId: Id<"posts">,
    title: string,
    authorId: string,
  }
  ```
- **Subscribers:**
  - Site Notification: Warning toast to acting user with "Undo" action.
  - Audit Log: Records trash event.
  - Sitemap System: Removes post from sitemap (if was published).
  - Dashboard: Updates counts.

---

### `post.restored`

- **Type:** Content
- **Triggered By:** `post.restore`, `post.bulkRestore`
- **Payload:**
  ```typescript
  {
    postId: Id<"posts">,
    title: string,
    authorId: string,
  }
  ```
- **Subscribers:**
  - Site Notification: Success toast to acting user with "Edit Post" action.
  - Audit Log: Records restore event.
  - Sitemap System: Re-adds post to sitemap (if restored to published).
  - Dashboard: Updates counts.

---

### `post.deleted`

- **Type:** Content
- **Triggered By:** `post.delete`, `post.bulkDelete`, auto-purge scheduled function
- **Payload:**
  ```typescript
  {
    postId: Id<"posts">,       // Note: post no longer exists after this event
    title: string,
    authorId: string,
  }
  ```
- **Subscribers:**
  - Audit Log: Records permanent deletion.
  - Search System: Removes from search index.
  - Dashboard: Updates counts.

---

## Admin Routes & UI

### All Posts (`/admin/posts`)

- **Purpose:** WordPress-style list table showing all posts with filtering, sorting, bulk actions, and inline quick edit. Primary post management screen.
- **WordPress Equivalent:** `edit.php` (All Posts)
- **Layout:** `_admin` (sidebar + topbar)
- **Auth Required:** Yes
- **Roles:** Administrator, Editor, Author, Contributor

**Layout:**
```
+----------------------------------------------------------+
| Posts                                    [Add New Post]   |
+----------------------------------------------------------+
| All (42) | Published (28) | Drafts (10) | Pending (2)    |
| Scheduled (1) | Trash (1)                                |
+----------------------------------------------------------+
| [Bulk Actions v] [Apply]  | [All Dates v] [All Cat v]   |
|                            [Filter] | Search [________]  |
+----------------------------------------------------------+
| [ ] Title          Author    Categories  Tags   Date     |
+----------------------------------------------------------+
| [ ] My First Post  admin     News, Tech  react  Published|
|     Edit | Quick Edit | Trash | View          2026/02/08 |
+----------------------------------------------------------+
|                          < 1 2 3 ... 5 >   20 items/page |
+----------------------------------------------------------+
```

**Key Components:**
- `PostStatusTabs` - Status filter tabs (All, Published, Drafts, Pending, Scheduled, Private, Trash, Mine)
- `PostFilterBar` - Date dropdown, category dropdown, search input (debounced 300ms)
- `PostBulkActions` - Bulk action dropdown + Apply button
- `PostListTable` - WordPress-style list table
- `PostListRow` - Single row with hover actions (Edit, Quick Edit, Trash, View/Preview)
- `PostQuickEdit` - Inline edit panel (title, slug, date, author, status, categories, tags, sticky)
- `PostBulkEdit` - Bulk edit panel for changing categories, tags, author, status, comment status, sticky
- `PostPagination` - Page numbers, prev/next, items per page selector

**Data Requirements:**
- `queries/posts.list` - Paginated post list with filters
- `queries/posts.counts` - Status counts for tabs
- `queries/users.list` - Author dropdown for filtering (admin/editor only)
- `queries/taxonomies.list` - Category list for filtering

**Real-Time:** List updates live when posts change across admin sessions. Status counts update reactively.

**Role-Based Behavior:**
- **Contributors:** See only their own posts. No "Publish" in Quick Edit.
- **Authors:** See all published + own drafts/pending. Can only edit/trash own.
- **Editors/Admins:** See all posts. Full access.
- **Subscribers:** Cannot access (redirect to dashboard).

**Interactions:**
- Status tabs filter the list reactively
- Trash view shows "Restore" and "Delete Permanently" instead of "Edit" and "Trash"
- Empty Trash button permanently deletes all trashed posts
- Column headers are clickable for sorting (title, author, comments, date)

---

### Add New Post (`/admin/posts/new`)

- **Purpose:** Create a new blog post with block editor and all metadata panels. Mirrors WordPress's `post-new.php`.
- **WordPress Equivalent:** `post-new.php`
- **Layout:** `_admin`
- **Auth Required:** Yes
- **Roles:** Administrator, Editor, Author, Contributor

**Layout:**
```
+------------------------------------------------------------------+
| Add New Post                                                      |
+------------------------------------------------------------------+
|                                         |  Publish               |
| [Add title]                             |  Status: Draft [Edit]  |
|                                         |  Visibility: Public    |
| +------------------------------------+  |  [Edit]               |
| |                                    |  |  Schedule: Immediately |
| |  Block Editor                      |  |  [Edit]               |
| |  (Content Editor System)           |  |  ──────────────────── |
| |                                    |  |  [Save Draft]         |
| |  Type / to choose a block          |  |  [Preview] [Publish]  |
| |                                    |  +------------------------+
| |                                    |  |  Categories            |
| +------------------------------------+  |  [x] Uncategorized     |
|                                         |  [ ] News              |
|                                         +------------------------+
|                                         |  Tags                  |
|                                         |  [tag1, tag2, ...]     |
|                                         +------------------------+
|                                         |  Featured Image        |
|                                         |  [Set featured image]  |
|                                         +------------------------+
|                                         |  Excerpt               |
|                                         |  [________________]    |
|                                         +------------------------+
|                                         |  Discussion            |
|                                         |  [x] Allow comments    |
|                                         +------------------------+
|                                         |  Slug                  |
|                                         |  [my-post-title]       |
|                                         +------------------------+
|                                         |  Author                |
|                                         |  [Admin v]             |
|                                         +------------------------+
+------------------------------------------------------------------+
```

**Key Components:**
- **Title Input** - Large, borderless, placeholder "Add title", max 500 chars, auto-generates slug on blur
- **Content Editor** - Block-based editor (Content Editor System), placeholder "Type / to choose a block"
- `PostPublishMetabox` - Status, visibility, schedule controls + Save Draft/Preview/Publish buttons
- `PostCategoriesMetabox` - Hierarchical checkbox list with "+ Add New Category"
- `PostTagsMetabox` - Comma-separated input with autocomplete and tag chips
- `PostFeaturedImageMetabox` - Media Library picker, shows thumbnail after selection
- `PostExcerptMetabox` - Plain textarea, max 1000 chars
- `PostDiscussionMetabox` - "Allow comments" checkbox
- `PostSlugMetabox` - Editable slug with permalink preview
- `PostAuthorMetabox` - User dropdown (Admin/Editor only)

**Data Requirements:**
- `queries/taxonomies.listByType` - Categories and tags
- `queries/users.list` - Author dropdown (admin/editor only)
- `queries/settings.get` - Default comment status, default category
- `queries/media.list` - For featured image picker

**Page-Level Behavior:**
- On first load: Creates an `auto-draft` post via `post.create`. This ensures a post ID for autosave.
- Autosave: Every 60 seconds (or 2s after stop typing), calls `post.autosave`.
- Unsaved changes warning: Browser `beforeunload` event.
- Keyboard shortcuts: Ctrl+S = Save Draft/Update, Ctrl+Shift+P = Preview.
- After successful publish: Show success toast with "View Post" link.

**Role-Based Behavior:**
- **Contributors:** "Submit for Review" instead of "Publish". Cannot set private/password visibility. Cannot change author.
- **Authors:** Full publish for own posts. Cannot change author.
- **Editors/Admins:** Full access including author reassignment.

---

### Edit Post (`/admin/posts/$postId/edit`)

- **Purpose:** Edit an existing post. Same layout as Add New Post with additional controls.
- **WordPress Equivalent:** `post.php`
- **Layout:** `_admin`
- **Auth Required:** Yes
- **Roles:** Administrator, Editor, Author, Contributor

**Additional Components (beyond Add New):**
- `PostRevisionsMetabox` - Shows count "Browse N revisions", links to `/admin/posts/$postId/revisions`
- "Move to Trash" link below Publish metabox (users with delete capability)
- Post Status Indicator: "Published on: date", "Scheduled for: date", or "Draft saved at: time"
- `PostEditLockNotice` - Warning when another user is editing, "Take Over" option for admin/editor

**Data Requirements:**
- `queries/posts.get` - The post being edited (reactive subscription)
- `queries/revisions.listByPost` - Revision count and list
- `queries/postMeta.getByPost` - Custom fields
- All same data as Add New Post

**Behavior Differences from Add New:**
- No auto-draft creation (post already exists)
- "Publish" button shows "Update" after initial publish
- Creates a revision on each save (via Revision System)
- Shows "View Post" link in header for published posts

---

### Post Revisions (`/admin/posts/$postId/revisions`)

- **Purpose:** View and restore previous versions of a post.
- **WordPress Equivalent:** `revision.php`
- **Layout:** `_admin`
- **Auth Required:** Yes
- **Roles:** Administrator, Editor
- **Note:** Managed by Revision System. Route listed here because it's navigated from Post edit screen.
- **Data:** `queries/revisions.listByPost`, `queries/posts.get`

---

### Post Categories (`/admin/posts/categories`)

- **Note:** Owned by Taxonomy System. Listed for navigation reference. Link appears in Posts submenu.

---

### Post Tags (`/admin/posts/tags`)

- **Note:** Owned by Taxonomy System. Listed for navigation reference. Link appears in Posts submenu.

---

### Posts API (`/api/admin/posts`)

- **Purpose:** REST-like API endpoint for external integrations. Proxies to Convex mutations/queries.
- **Auth:** Bearer token (API key) or auth session cookie
- **Roles:** Administrator only
- **Endpoints:**
  - `GET /api/admin/posts` - List posts
  - `GET /api/admin/posts/:id` - Get single post
  - `POST /api/admin/posts` - Create post
  - `PUT /api/admin/posts/:id` - Update post
  - `DELETE /api/admin/posts/:id` - Delete post
  - `POST /api/admin/posts/:id/publish` - Publish post
  - `POST /api/admin/posts/:id/trash` - Trash post
  - `POST /api/admin/posts/:id/restore` - Restore post

---

## Website Routes

### Home (`/`)

- **Purpose:** Displays latest published posts (configurable count from Settings: `posts_per_page`).
- **SEO:** Site title, homepage meta description
- **Data Requirements:** `queries/posts.list` with `status: "publish"`, sticky first, sorted by `publishedAt` desc
- **Components:** Post cards with title, excerpt, featured image, author, date, category. "Read More" links.

---

### Blog Index (`/blog`)

- **Purpose:** Paginated list of all published blog posts.
- **WordPress Equivalent:** Blog page / posts page
- **Layout:** `_marketing`
- **Auth:** None
- **SEO:**
  - Title: "Blog | Site Name"
  - Meta description from Settings
  - Canonical: `/blog`
  - `og:type`: `website`
- **Data Requirements:** `queries/posts.list` with `status: "publish"`, paginated (default 10 per page)
- **Components:**
  - Page title "Blog" (configurable via Settings)
  - Sticky posts as featured cards (larger display)
  - Post cards in 2-3 column grid: featured image, title, auto-excerpt (150 chars), author + avatar, date, primary category badge, read time estimate
  - Pagination (previous/next + page numbers)

---

### Single Post (`/blog/$slug`)

- **Purpose:** Display a single blog post with full content, author info, comments, related posts.
- **WordPress Equivalent:** `single.php`
- **Layout:** `_marketing`
- **Auth:** None (except private/password posts)
- **SEO:**
  - Title: `{post_title} | {site_name}`
  - Meta description: excerpt or auto-generated (first 160 chars)
  - Canonical: `https://site.com/blog/{slug}`
  - `og:type`: `article`
  - `og:image`: Featured image
  - `article:published_time`, `article:modified_time`, `article:author`
  - JSON-LD `BlogPosting` schema
  - Previous/next post `<link>` tags
- **Data Requirements:**
  - `queries/posts.get` by slug
  - `queries/comments.listByPost` - Comment thread
  - `queries/posts.list` - Related posts (same category, excluding current)
  - `queries/taxonomies.getByPost` - Categories and tags
  - `queries/postMeta.getByPost` - SEO meta, custom fields
- **Components:**
  - `PostHeader` - Featured image (full-width), category badges, title (H1), author info, read time
  - `PostContent` - Rendered block editor output
  - `PostFooter` - Tags as clickable badges, social share buttons, copy link
  - `PostAuthorBox` - Author avatar, name, bio, link to author archive
  - `PostRelatedPosts` - 3 related posts from same category (fallback to recent)
  - Comments Section (Comment System)
  - `PostPasswordForm` - For password-protected posts (shows instead of content)
  - `PostSEOHead` - SEO meta tags, JSON-LD

**Password-Protected Posts:** Show password form instead of content. Title and excerpt visible. Session cookie after correct password.

**Private Posts:** Only visible to users with `read_private_posts`. 404 for unauthorized.

**Draft/Pending/Future:** Not accessible (404). Accessible via preview URL with valid nonce.

---

### Category Archive (`/category/$slug`)

- **Purpose:** All published posts in a given category.
- **Layout:** Same as Blog Index with "Category: {name}" title and category description.
- **SEO:** Title: `{category_name} Archives | {site_name}`, Canonical: `/category/{slug}`
- **Data:** `queries/taxonomies.getBySlug`, `queries/posts.list` with category filter

---

### Tag Archive (`/tag/$slug`)

- **Purpose:** All published posts with a given tag.
- **Layout:** Same as Blog Index with "Tag: {name}" title.
- **SEO:** Title: `{tag_name} Archives | {site_name}`, Canonical: `/tag/{slug}`
- **Data:** `queries/taxonomies.getBySlug`, `queries/posts.list` with tag filter

---

### Author Archive (`/author/$slug`)

- **Purpose:** All published posts by a specific author.
- **Layout:** Same as Blog Index with author header (avatar, name, bio, post count).
- **SEO:** Title: `{author_name} - Author Archives | {site_name}`, Canonical: `/author/{slug}`, JSON-LD `Person` schema
- **Data:** Author data from the auth system, `queries/posts.list` with `authorId` filter

---

## Notifications

### Email Notifications

| Name | Event | Recipients | Priority | Subject |
|------|-------|------------|----------|---------|
| Post Published (Author) | `post.published` | Post author (Employee) | Immediate | `Your post "{title}" is now live!` |
| Post Published (Subscribers) | `post.published` | Email subscribers (Customer) | Batched (daily/weekly digest) | `New post: {title}` |
| Post Scheduled Reminder | `post.scheduled` | Post author (Employee) | Batched | `Your post "{title}" publishes on {date}` |
| Pending Post Review | `post.created` (status=pending) | Editors & Admins (Employee) | Immediate | `New post pending review: "{title}"` |

**Conditions:**
- "Post Published (Author)" only sent when publisher differs from author (editor publishes a contributor's pending post). Respects user notification preferences.
- "Post Published (Subscribers)" only for `visibility: "public"`. Not sent for backdated posts. Includes unsubscribe link. Configurable digest frequency.
- "Post Scheduled Reminder" sent immediately on scheduling. Optional second reminder 1 hour before publish.
- "Pending Post Review" only when a Contributor submits (status = pending). Sent to all users with `edit_others_posts` capability.

### Site Notifications

| Name | Event | Type | Persistent | Recipients |
|------|-------|------|-----------|------------|
| Post Published | `post.published` | Success (green) | No (5s toast) | Post author |
| Post Scheduled | `post.scheduled` | Info (blue) | Yes (notification bell) | Post author |
| Post Trashed | `post.trashed` | Warning (amber) | No (5s toast) | Acting user |
| Post Restored | `post.restored` | Success (green) | No (toast) | Acting user |

**Actions:**
- Published toast: "View Post" link
- Scheduled notification: "View in Editor" link
- Trashed toast: "Undo" link (calls `post.restore` within 10 seconds)
- Restored toast: "Edit Post" link

---

## Role & Capability Matrix

### Post-Specific Capabilities

| Capability | Slug | Description |
|-----------|------|-------------|
| Edit Posts | `edit_posts` | Create and edit own posts |
| Edit Others' Posts | `edit_others_posts` | Edit any user's posts |
| Edit Published Posts | `edit_published_posts` | Edit posts that are already published |
| Edit Private Posts | `edit_private_posts` | Edit posts with private visibility |
| Publish Posts | `publish_posts` | Change post status to publish/future |
| Delete Posts | `delete_posts` | Trash own posts |
| Delete Others' Posts | `delete_others_posts` | Trash/delete any user's posts |
| Delete Published Posts | `delete_published_posts` | Trash published posts |
| Delete Private Posts | `delete_private_posts` | Trash private posts |
| Read Private Posts | `read_private_posts` | View posts with private visibility |

### Capability-to-Role Mapping

| Capability | Administrator | Editor | Author | Contributor | Subscriber |
|-----------|:---:|:---:|:---:|:---:|:---:|
| `edit_posts` | Yes | Yes | Yes | Yes | No |
| `edit_others_posts` | Yes | Yes | No | No | No |
| `edit_published_posts` | Yes | Yes | Yes | No | No |
| `edit_private_posts` | Yes | Yes | No | No | No |
| `publish_posts` | Yes | Yes | Yes | No | No |
| `delete_posts` | Yes | Yes | Yes | Yes | No |
| `delete_others_posts` | Yes | Yes | No | No | No |
| `delete_published_posts` | Yes | Yes | Yes | No | No |
| `delete_private_posts` | Yes | Yes | No | No | No |
| `read_private_posts` | Yes | Yes | No | No | No |

### Action-to-Capability Mapping

| Action | Own Post Capability | Others' Post Capability |
|--------|-------------------------------|-----------------------------------|
| Create Post | `edit_posts` | N/A |
| Read Post (draft) | `edit_posts` | `edit_others_posts` |
| Read Post (private) | `read_private_posts` | `read_private_posts` |
| Read Post (published) | None (public) | None (public) |
| Update Post | `edit_posts` | `edit_others_posts` |
| Update Published Post | `edit_published_posts` | `edit_others_posts` |
| Publish Post | `publish_posts` | `publish_posts` + `edit_others_posts` |
| Unpublish Post | `edit_published_posts` | `edit_others_posts` |
| Schedule Post | `publish_posts` | `publish_posts` + `edit_others_posts` |
| Trash Post | `delete_posts` | `delete_others_posts` |
| Trash Published Post | `delete_published_posts` | `delete_others_posts` |
| Restore Post | `delete_posts` | `delete_others_posts` |
| Delete Permanently | `delete_posts` | `delete_others_posts` |
| Duplicate Post | `edit_posts` | `edit_others_posts` |
| Preview Post | `edit_posts` | `edit_others_posts` |
| Bulk Trash | `delete_others_posts` | `delete_others_posts` |
| Bulk Delete | `delete_others_posts` | `delete_others_posts` |
| Bulk Publish | `publish_posts` + `edit_others_posts` | `publish_posts` + `edit_others_posts` |
| Bulk Restore | `delete_others_posts` | `delete_others_posts` |
| Set Sticky | `edit_others_posts` | `edit_others_posts` |
| Change Author | `edit_others_posts` | `edit_others_posts` |

---

## Dependencies

### Depends On

| System | Type | Details |
|--------|------|---------|
| **Auth System** | Hard | User authentication via Convex Auth. Every mutation requires identity. |
| **Role & Capability System** | Hard | Every action checks capabilities. Roles determine access to admin routes. |

### Depended On By

| System | Type | Details |
|--------|------|---------|
| **Taxonomy System** | Hard | Categories and tags are assigned to posts. Post deletion cascades to taxonomy relationships. |
| **Comment System** | Hard | Comments belong to posts. Post deletion cascades to comments. Comment counts denormalized on post. |
| **Content Editor System** | Hard | The block editor operates on post content. Renders blocks for post display. |
| **Revision System** | Hard | Revisions are snapshots of post content. Post updates trigger revision creation. |
| **SEO System** | Medium | SEO meta stored in `postMeta`. Post publish triggers sitemap regeneration. |
| **Media System** | Medium | Featured images reference media items. Media library picker used in editor. |
| **Dashboard System** | Medium | Dashboard widgets show post counts, recent posts, activity feed. |
| **Search System** | Medium | Post content is indexed for search. Post CRUD events update search index. |
| **Sitemap System** | Soft | Published posts included in XML sitemap. Post events trigger sitemap rebuild. |
| **RSS Feed System** | Soft | Published posts appear in RSS/Atom feeds. |
| **Audit Log System** | Soft | Post events recorded in audit log. |
| **Email Notification System** | Soft | Post events trigger email delivery. |
| **Site Notification System** | Soft | Post events trigger in-app notifications. |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| **Convex Auth** | User identity, session tokens, user metadata (author info) |
| **Convex** | Database storage, reactive queries, scheduled functions, internal mutations |
| **Resend** | Email delivery for post notifications |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/convex/)

- [ ] `convex/schema.ts` - Add `posts` + `postMeta` tables (2 tables)
- [ ] `convex/posts/queries.ts` - `posts.get`, `posts.list`, `posts.counts`, `posts.preview` (4 queries)
- [ ] `convex/posts/mutations.ts` - `posts.create`, `posts.update`, `posts.publish`, `posts.unpublish`, `posts.schedule`, `posts.trash`, `posts.restore`, `posts.delete`, `posts.duplicate`, `posts.autosave`, `posts.bulkTrash`, `posts.bulkRestore`, `posts.bulkPublish`, `posts.bulkDelete` (14 mutations)
- [ ] `convex/posts/internals.ts` - `internal.posts.publishScheduled`, `internal.posts.autoPurge` (2 internal functions)
- [ ] `convex/posts/validators.ts` - Shared argument validators (`postStatus`, `commentStatus`, `postVisibility`)
- [ ] `convex/postMeta/queries.ts` - `postMeta.getByPost`, `postMeta.getByKey` (2 queries)
- [ ] `convex/postMeta/mutations.ts` - `postMeta.set`, `postMeta.delete`, `postMeta.bulkSet` (3 mutations)
- [ ] `convex/helpers/slug.ts` - `generateUniqueSlug()`
- [ ] `convex/helpers/postAuth.ts` - `checkPostCapability()`, `getEffectivePostsForUser()`
- [ ] `convex/helpers/events.ts` - `emitPostEvent()` helper
- [ ] `convex/helpers/pagination.ts` - Cursor-based pagination helpers

### Admin Frontend (ConvexPress-Admin/apps/web/src/)

**Routes:**
- [ ] `src/routes/admin/posts/index.tsx` - `/admin/posts` (All Posts)
- [ ] `src/routes/admin/posts/new.tsx` - `/admin/posts/new` (Add New Post)
- [ ] `src/routes/admin/posts/$postId/edit.tsx` - `/admin/posts/$postId/edit` (Edit Post)
- [ ] `src/routes/admin/posts/$postId/revisions.tsx` - `/admin/posts/$postId/revisions` (Revisions)
- [ ] `src/routes/admin/posts/categories.tsx` - `/admin/posts/categories` (Taxonomy System)
- [ ] `src/routes/admin/posts/tags.tsx` - `/admin/posts/tags` (Taxonomy System)

**Components:**
- [ ] `src/components/posts/PostListTable.tsx` - WordPress-style list table
- [ ] `src/components/posts/PostListRow.tsx` - Single row in list table
- [ ] `src/components/posts/PostQuickEdit.tsx` - Inline quick edit panel
- [ ] `src/components/posts/PostBulkEdit.tsx` - Bulk edit panel
- [ ] `src/components/posts/PostEditor.tsx` - Main editor layout (title + content + sidebar)
- [ ] `src/components/posts/PostPublishMetabox.tsx` - Publish controls
- [ ] `src/components/posts/PostCategoriesMetabox.tsx` - Category selector with hierarchy
- [ ] `src/components/posts/PostTagsMetabox.tsx` - Tag input with autocomplete
- [ ] `src/components/posts/PostFeaturedImageMetabox.tsx` - Featured image picker
- [ ] `src/components/posts/PostExcerptMetabox.tsx` - Excerpt textarea
- [ ] `src/components/posts/PostDiscussionMetabox.tsx` - Comment status toggle
- [ ] `src/components/posts/PostSlugMetabox.tsx` - Slug editor with permalink preview
- [ ] `src/components/posts/PostAuthorMetabox.tsx` - Author dropdown (admin/editor)
- [ ] `src/components/posts/PostRevisionsMetabox.tsx` - Revision count + browse link
- [ ] `src/components/posts/PostStatusTabs.tsx` - Status filter tabs
- [ ] `src/components/posts/PostFilterBar.tsx` - Date/category filters + search
- [ ] `src/components/posts/PostPagination.tsx` - Pagination controls
- [ ] `src/components/posts/PostBulkActions.tsx` - Bulk action dropdown + apply
- [ ] `src/components/posts/PostEditLockNotice.tsx` - Concurrent editing warning

**Hooks:**
- [ ] `src/hooks/posts/usePostList.ts` - Hook wrapping posts.list query with filters
- [ ] `src/hooks/posts/usePostCounts.ts` - Hook wrapping posts.counts query
- [ ] `src/hooks/posts/usePostMutations.ts` - Hooks for create/update/publish/trash/etc.
- [ ] `src/hooks/posts/usePostAutosave.ts` - Debounced autosave hook
- [ ] `src/hooks/posts/usePostEditLock.ts` - Edit lock management hook
- [ ] `src/hooks/posts/usePostFilters.ts` - URL-based filter state management

**Lib:**
- [ ] `src/lib/posts/types.ts` - TypeScript types for post data
- [ ] `src/lib/posts/constants.ts` - Post statuses, capabilities, defaults
- [ ] `src/lib/posts/utils.ts` - Client-side utilities (excerpt generation, read time)

### Website Frontend (ConvexPress-Website/apps/web/src/)

**Routes:**
- [ ] `src/routes/blog/index.tsx` - `/blog` (Blog index)
- [ ] `src/routes/blog/$slug.tsx` - `/blog/$slug` (Single post)
- [ ] `src/routes/category/$slug.tsx` - `/category/$slug` (Category archive)
- [ ] `src/routes/tag/$slug.tsx` - `/tag/$slug` (Tag archive)
- [ ] `src/routes/author/$slug.tsx` - `/author/$slug` (Author archive)

**Components:**
- [ ] `src/components/posts/PostCard.tsx` - Blog post card (for listings)
- [ ] `src/components/posts/PostCardFeatured.tsx` - Larger featured/sticky post card
- [ ] `src/components/posts/PostContent.tsx` - Full post content renderer
- [ ] `src/components/posts/PostHeader.tsx` - Post title, author, date, category
- [ ] `src/components/posts/PostFooter.tsx` - Tags, share buttons
- [ ] `src/components/posts/PostAuthorBox.tsx` - Author bio box
- [ ] `src/components/posts/PostRelatedPosts.tsx` - Related posts section
- [ ] `src/components/posts/PostPasswordForm.tsx` - Password form for protected posts
- [ ] `src/components/posts/PostPagination.tsx` - Blog listing pagination
- [ ] `src/components/posts/PostShareButtons.tsx` - Social share buttons
- [ ] `src/components/posts/PostSEOHead.tsx` - SEO meta tags, JSON-LD

**Lib:**
- [ ] `src/lib/posts/types.ts` - Shared types
- [ ] `src/lib/posts/utils.ts` - Read time calculation, excerpt generation

---

## Edge Cases & Gotchas

1. **Concurrent Editing:** Two users open the same post in the editor. Use `_edit_lock` meta: first editor gets the lock, second sees a warning with "Take Over" option. Lock expires after 2 minutes of inactivity (no autosave). Only Admin/Editor can "Take Over" a lock.

2. **Slug Uniqueness:** User creates "My Post" -> `my-post`. Another post "My Post" -> `my-post-2`. `generateUniqueSlug()` appends incrementing suffixes. Slugs are unique only among non-trashed posts. On restore from trash, re-check slug uniqueness and append suffix if needed.

3. **Scheduled Post Time Passes:** Convex scheduled function fires and publishes the post. If the post was manually published, trashed, or deleted before the scheduled time, the function is a no-op (checks current status first).

4. **Trash Auto-Purge (30 days):** Scheduled function runs at `trashedAt + 30 days`. If restored before 30 days, the scheduled purge is cancelled. Auto-purge calls full `post.delete` logic (cascades to meta, comments, revisions, taxonomies).

5. **Empty Content Publish:** Allow publishing posts with just a title but no content (WordPress allows this). Require at least a title (cannot publish untitled).

6. **Featured Image Deletion:** When media item is deleted, `featuredImageId` becomes a dangling reference. Frontend gracefully handles missing image (placeholder or nothing). Consider subscribing to `media.deleted` event to clear `featuredImageId` on affected posts.

7. **Author Deletion:** When a user is deleted, their posts are reassigned to a specified user (admin chooses during user deletion). This is handled by User Profile System / Auth System, not Post System directly.

8. **Bulk Operations Limit:** Limit bulk operations to 100 posts per request. Show progress indicator for large operations.

9. **Contributor Publishing Restriction:** Contributors cannot set status to `publish`, `future`, or `private`. Force to `pending` when they attempt this. Show "Submit for Review" instead of "Publish" in UI.

10. **Password-Protected Visibility:** When `visibility` is set to `"password"`, the `password` field is required (min 1 char). Content is withheld from API responses until password is verified via session cookie.

11. **Restoring Future Post with Past Date:** When restoring a post from trash that was previously `"future"`, if `scheduledFor` is now in the past, set status to `"draft"` instead of `"future"`.

12. **Slug on Title Change:** If the title changes and the slug was auto-generated (not manually edited by user), regenerate the slug. If the slug was manually edited, preserve it.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `wp_insert_post()` | `mutations/posts.create` | Creates new post with all fields |
| `wp_update_post()` | `mutations/posts.update` | Partial update with change tracking |
| `wp_delete_post()` | `mutations/posts.delete` | Permanent delete with cascade |
| `wp_trash_post()` | `mutations/posts.trash` | Soft delete with 30-day auto-purge |
| `wp_untrash_post()` | `mutations/posts.restore` | Restore from trash |
| `wp_publish_post()` | `mutations/posts.publish` | Set status to publish |
| `get_posts()` | `queries/posts.list` | List with filters and pagination |
| `WP_Query` | `queries/posts.list` | Same query with full filter support |
| `get_post()` | `queries/posts.get` | Single post by ID or slug |
| `wp_unique_post_slug()` | `helpers/slug.generateUniqueSlug()` | Slug generation with uniqueness |
| `current_user_can()` | `helpers/postAuth.checkPostCapability()` | Capability checking |
| `get_post_meta()` | `queries/postMeta.getByPost` / `getByKey` | Meta value retrieval |
| `update_post_meta()` | `mutations/postMeta.set` | Upsert meta value |
| `delete_post_meta()` | `mutations/postMeta.delete` | Remove meta value |
| `wp_trim_excerpt()` | Client-side: first 150 chars of plain text | Computed, not stored |
| `wp_count_posts()` | `queries/posts.counts` | Status count aggregation |
| `is_sticky()` | `post.isSticky` field | Direct field check |
| `stick_post()` / `unstick_post()` | `mutations/posts.update({ isSticky })` | Via update mutation |

---

## Shared TypeScript Types

```typescript
export type PostStatus = "auto-draft" | "draft" | "pending" | "publish" | "future" | "private" | "trash";
export type PostVisibility = "public" | "private" | "password";
export type CommentStatus = "open" | "closed";

export interface Post {
  _id: Id<"posts">;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  status: PostStatus;
  authorId: string;
  visibility: PostVisibility;
  password?: string;
  publishedAt?: number;
  scheduledFor?: number;
  commentStatus: CommentStatus;
  commentCount: number;
  isSticky: boolean;
  menuOrder: number;
  featuredImageId?: string;
  previousStatus?: string;
  trashedAt?: number;
  createdAt: number;
  updatedAt: number;
  autosaveContent?: string;
  autosaveTitle?: string;
  autosavedAt?: number;
}

export interface PostMeta {
  _id: Id<"postMeta">;
  postId: Id<"posts">;
  key: string;
  value: string;
}

export interface PostListParams {
  status?: PostStatus;
  authorId?: string;
  search?: string;
  categoryId?: string;
  tagId?: string;
  dateFrom?: number;
  dateTo?: number;
  isSticky?: boolean;
  orderBy?: "publishedAt" | "updatedAt" | "title" | "commentCount";
  orderDir?: "asc" | "desc";
  page?: number;
  perPage?: number;
}

export interface PostListResult {
  posts: Post[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface PostCounts {
  all: number;
  publish: number;
  draft: number;
  pending: number;
  future: number;
  private: number;
  trash: number;
  mine: number;
}
```

