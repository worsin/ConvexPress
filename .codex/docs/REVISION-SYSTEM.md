# Revision System - Expert Knowledge Document

**System:** Revision System
**Status:** Complete (100%)
**Priority:** P2 - Medium
**Complexity:** Medium
**Layer:** Backend
**Category:** Content
**WordPress Equivalent:** Post Revisions (`wp_posts` with `post_type = 'revision'`, revision comparison screen, autosave revisions)
**Last Analyzed:** 2026-02-13
**PRD Location:** `specs/ConvexPress/systems/revision-system/PRD.md`
**Airtable System Record:** `recUBbRIvHqQbuxkA`
**Airtable Expert Record:** `recH6fDTAXwlEnddQ`

---

## Quick Reference

### What This System Does

The Revision System provides content versioning, diff comparison, and point-in-time restoration for posts and pages. Every time an author saves or updates content, the system automatically creates an immutable snapshot (revision) of the current state BEFORE the change is applied. This gives content creators a complete history of their work and the ability to compare any two versions side-by-side or roll back to any previous state. In WordPress terms, this covers `wp_save_post_revision()`, `wp_get_post_revisions()`, `wp_restore_post_revision()`, the revision comparison screen with slider navigation, and the autosave revision mechanism.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Revision** | An immutable snapshot of a post's title, content, and excerpt at a point in time |
| **Manual Revision** | Created when a user clicks Save/Update (type: `"manual"`) |
| **Autosave Revision** | Created by Content Editor System every 5 minutes (type: `"autosave"`), one per user per post, updated in-place |
| **Revision Number** | Sequential integer (1, 2, 3...) per parent post, auto-incremented |
| **Parent** | The post or page that a revision belongs to (referenced by `parentId`) |
| **Pruning** | Automatic deletion of oldest manual revisions when count exceeds `max_revisions` (default 25) |
| **Diff** | Client-side comparison of two revision contents using `diff-match-patch` library |
| **Restore** | Copying a revision's snapshot data back to the parent post (creates a safety revision first) |
| **Changed Fields** | Array tracking which fields (`title`, `content`, `excerpt`) changed in this revision |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Storage** | Revisions in `wp_posts` with `post_type = 'revision'` | Dedicated `revisions` table in Convex |
| **Relationship** | `post_parent` column | `parentId` + `parentType` fields |
| **Autosave** | Separate autosave revision row, updated in-place | Autosave stored inline on post (Post System); Revision System creates periodic snapshots (every 5 min) |
| **Diff Engine** | Server-side `wp_text_diff()` using PHP `Text_Diff` | Client-side `diff-match-patch` library |
| **Revision Limit** | `WP_POST_REVISIONS` constant (default unlimited) | Configurable via Settings System (`max_revisions`, default 25) |
| **Cleanup** | Manual or plugin-based | Automatic pruning on save + daily scheduled function |
| **UI** | Custom admin screen with jQuery slider | Full page at `/admin/posts/$postId/revisions` with React diff viewer |
| **Reactivity** | Page reload to see new revisions | Real-time Convex subscriptions update revision list live |
| **Scope** | Posts and pages | Posts and pages (extensible to any content type) |
| **Auth** | Tied to `edit_post` capability | Dedicated capabilities: `revision.view`, `revision.compare`, `revision.restore`, `revision.delete` |

---

## Architecture Overview

### Data Flow

```
User clicks "Update" in editor
  -> post.update mutation starts
    -> Step 1: Read current post state (BEFORE changes)
    -> Step 2: Check if content fields changed (title/content/excerpt)
    -> Step 3: Check if revisions_enabled setting is true
    -> Step 4: Call internal.revisions.createOnSave(currentState) -- snapshot BEFORE update
    -> Step 5: Apply changes to post document
    -> Step 6: Emit post.updated event
```

```
User clicks "Restore This Revision" on revision page
  -> revision.restore mutation starts
    -> Step 1: Fetch the target revision
    -> Step 2: Fetch the parent post
    -> Step 3: Create a NEW revision of the post's CURRENT state (safety net)
    -> Step 4: Copy revision's snapshot fields to parent post
    -> Step 5: Clear autosave fields on parent
    -> Step 6: Prune excess revisions if needed
    -> Step 7: Emit revision.restored event
```

### Real-Time Behavior

- **Revision list** on the comparison page updates live via Convex subscription to `revisions.listByParent`
- **Revision count** in the edit post sidebar metabox updates live via subscription to `revisions.countByParent`
- If another user saves the post while the revision page is open, a new revision dot appears on the slider in real-time
- After a restore, the post edit screen updates live with the restored content (Convex reactivity on the post document)

### Authentication & Authorization

- All queries and mutations require Convex Auth authentication (user must be signed in)
- `authorId` on revisions is a user identifier
- Capability checks use the Role & Capability System
- **Ownership-based access**: Authors can view/compare revisions of their OWN posts only. Editors+ can access any post's revisions.
- **Restore requires edit access**: Must have both `revision.restore` AND `post.update`/`page.update` on the parent

---

## Database Schema

### `revisions` Table

```typescript
// convex/schema.ts

// Revision type enum
const revisionType = v.union(
  v.literal("manual"),       // Created on explicit Save/Update
  v.literal("autosave"),     // Created by autosave mechanism (one per user per post)
);

// Parent content type enum
const revisionParentType = v.union(
  v.literal("post"),
  v.literal("page"),
);

revisions: defineTable({
  // --- Relationship ---
  parentId: v.id("posts"),                  // The post or page this revision belongs to
  parentType: revisionParentType,           // "post" or "page"

  // --- Snapshot Fields ---
  title: v.string(),                        // Snapshot of the title at this point in time
  content: v.string(),                      // Snapshot of the content (serialized block editor JSON)
  excerpt: v.optional(v.string()),          // Snapshot of the excerpt

  // --- Revision Metadata ---
  revisionNumber: v.number(),               // Sequential number: 1, 2, 3, ...
  type: revisionType,                       // "manual" or "autosave"
  authorId: v.string(),                     // user identifier of who triggered this revision

  // --- Change Summary ---
  changedFields: v.array(v.string()),       // Which fields changed: ["title", "content", "excerpt"]
  contentLength: v.number(),                // Character count of content (for quick size reference)

  // --- Timestamps ---
  createdAt: v.number(),                    // When this revision was created (ms)
})
  // --- Indexes ---
  .index("by_parent", ["parentId"])                              // All revisions for a post
  .index("by_parent_type", ["parentId", "type"])                 // Manual vs autosave revisions for a post
  .index("by_parent_number", ["parentId", "revisionNumber"])     // Specific revision by number
  .index("by_author", ["authorId"])                              // All revisions by a user
  .index("by_createdAt", ["createdAt"]),                         // Chronological ordering
```

### Field Specifications

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `parentId` | `Id<"posts">` | Yes | - | Must reference an existing post or page document |
| `parentType` | `"post" \| "page"` | Yes | - | Must be one of the two literals |
| `title` | `string` | Yes | - | Snapshot of parent's title at revision time. Max 500 chars |
| `content` | `string` | Yes | - | Snapshot of parent's serialized content. No max (Convex handles) |
| `excerpt` | `string` | No | `undefined` | Snapshot of parent's excerpt. Max 1000 chars |
| `revisionNumber` | `number` | Yes | Auto-incremented | Positive integer. Unique per `parentId` |
| `type` | `"manual" \| "autosave"` | Yes | `"manual"` | One of the two literals |
| `authorId` | `string` | Yes | Current user | user identifier |
| `changedFields` | `string[]` | Yes | `[]` | List of field names that changed from the previous state |
| `contentLength` | `number` | Yes | `0` | Non-negative integer. `content.length` |
| `createdAt` | `number` | Yes | `Date.now()` | Immutable after creation. Unix timestamp (ms) |

### Indexes

| Index | Fields | Purpose |
|-------|--------|---------|
| `by_parent` | `["parentId"]` | Get all revisions for a specific post/page. Primary query pattern. |
| `by_parent_type` | `["parentId", "type"]` | Filter revisions by manual/autosave for a specific post. Used by autosave lookup. |
| `by_parent_number` | `["parentId", "revisionNumber"]` | Lookup a specific revision by its sequential number within a post. |
| `by_author` | `["authorId"]` | Get all revisions created by a specific user (for activity feeds). |
| `by_createdAt` | `["createdAt"]` | Chronological ordering across all revisions (for global queries/cleanup). |

### Relationships

| From | To | Relationship | Notes |
|------|----|-------------|-------|
| `revisions.parentId` | `posts._id` | Many-to-one | Each revision belongs to one post/page. A post can have many revisions. |
| `revisions.authorId` | Convex Auth User ID | Many-to-one | Each revision was created by one user. A user can create many revisions. |

### Schema Design Notes

- **Dedicated table vs. reusing `posts`**: WordPress stores revisions as rows in `wp_posts`. ConvexPress uses a separate table for type safety (different required fields), query performance (no accidental cross-contamination), storage efficiency (smaller documents), and clear ownership.
- **`parentId` uses `Id<"posts">`**: Both posts and pages share the same `posts` table (differentiated by `postType` field). If pages are later separated, `parentId` becomes `v.union(v.id("posts"), v.id("pages"))`.
- **Autosave vs. Post System autosave**: Post System stores autosave data inline on the post (`autosaveContent`, `autosaveTitle`, `autosavedAt`). The Revision System's autosave type is a separate 5-minute snapshot for safety, not the 60-second live buffer.

---

## Actions & Functions

### Queries

#### `revision.view` - List Revisions by Parent

- **Convex Function:** `queries/revisions.listByParent`
- **Type:** Query
- **Auth:** Required (Convex Auth)
- **Capabilities:** `revision.view` (Administrator, Editor, Author*)
- **Airtable Record:** `recJXNRtaWgagHAas`
- **Args:**
  ```typescript
  {
    parentId: v.id("posts"),
    type: v.optional(revisionType),      // Filter by manual/autosave (default: all)
    limit: v.optional(v.number()),       // Max results (default: 50)
    cursor: v.optional(v.string()),      // Pagination cursor
  }
  ```
- **Returns:** `{ revisions: RevisionDoc[], total: number, hasMore: boolean, cursor: string | null }`
- **Behavior:**
  1. Authenticate user via Convex Auth
  2. Fetch the parent post/page
  3. **Capability checks:**
     - Own post: Requires `revision.view`
     - Others' post: Requires `revision.view` + role level >= Editor (80)
  4. Query `revisions` table using `by_parent` index, filtered by `parentId`
  5. If `type` provided, further filter by `by_parent_type` index
  6. Sort by `revisionNumber` descending (newest first)
  7. Apply pagination limit
  8. For each revision, include denormalized author data (name, avatar from the auth system)
  9. Return `{ revisions, total, hasMore, cursor }`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated
  - `NOT_FOUND`: Parent post/page does not exist
  - `FORBIDDEN`: User lacks `revision.view` capability
  - `FORBIDDEN`: Author trying to view revisions of another user's post
- **Events:** None (reads do not emit events)

#### `revision.compare` - Compare Two Revisions

- **Convex Function:** `queries/revisions.compare`
- **Type:** Query
- **Auth:** Required (Convex Auth)
- **Capabilities:** `revision.compare` (Administrator, Editor, Author*)
- **Airtable Record:** `recnxI0xOnBB7PYUM`
- **Args:**
  ```typescript
  {
    leftRevisionId: v.id("revisions"),   // The "from" revision (older)
    rightRevisionId: v.id("revisions"),  // The "to" revision (newer)
  }
  ```
- **Returns:**
  ```typescript
  {
    left: {
      _id: Id<"revisions">,
      revisionNumber: number,
      title: string,
      content: string,
      excerpt: string | undefined,
      authorName: string,
      authorAvatar: string | undefined,
      createdAt: number,
      changedFields: string[],
    },
    right: { /* Same shape as left */ },
    parentId: Id<"posts">,
    parentTitle: string,
    totalRevisions: number,
  }
  ```
- **Behavior:**
  1. Authenticate user via Convex Auth
  2. Fetch both revision documents
  3. Validate both revisions belong to the same parent post
  4. Fetch parent post for ownership checks
  5. Capability checks: Own post requires `revision.compare`; others' post requires `revision.compare` + role >= Editor (80)
  6. Return both revision documents with full content for client-side diff rendering
  7. Include metadata: author name, creation timestamp, revision number, changed fields
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated
  - `NOT_FOUND`: Either revision does not exist
  - `VALIDATION_ERROR`: Revisions belong to different parents
  - `FORBIDDEN`: User lacks `revision.compare` capability
  - `FORBIDDEN`: Author trying to compare revisions of another user's post
- **Events:** None

#### `revisions.countByParent` - Count Revisions for a Post

- **Convex Function:** `queries/revisions.countByParent`
- **Type:** Query
- **Auth:** Required (Convex Auth)
- **Capabilities:** `revision.view`
- **Args:**
  ```typescript
  {
    parentId: v.id("posts"),
  }
  ```
- **Returns:** `number` (total revision count)
- **Behavior:**
  1. Authenticate user
  2. Query `revisions` with `by_parent` index
  3. Return count
- **Used by:** Revisions metabox on edit post page (shows "Revisions: 12" with browse link)

### Mutations

#### `revision.restore` - Restore a Revision

- **Convex Function:** `mutations/revisions.restore`
- **Type:** Mutation
- **Auth:** Required (Convex Auth)
- **Capabilities:** `revision.restore` + `post.update`/`page.update` (Administrator, Editor)
- **Airtable Record:** `recNdVE0oJ9aky9wH`
- **Args:**
  ```typescript
  {
    revisionId: v.id("revisions"),
  }
  ```
- **Returns:** Updated parent post document
- **Behavior:**
  1. Authenticate user via Convex Auth
  2. Fetch the revision document
  3. Fetch the parent post/page
  4. **Capability checks:**
     - Requires `revision.restore`
     - Must also have edit capability on parent (`post.update` / `page.update`)
     - For others' posts: role level >= Editor (80)
  5. **Create a new revision** of the parent's CURRENT state before restoring (safety net -- so the current state is not lost)
  6. Copy the revision's snapshot fields back to parent:
     - `title` -> post `title`
     - `content` -> post `content`
     - `excerpt` -> post `excerpt`
  7. Update the parent post's `updatedAt` to `Date.now()`
  8. Clear autosave fields on parent (`autosaveContent`, `autosaveTitle`, `autosavedAt`)
  9. Prune excess revisions if count exceeds configured maximum
  10. Emit event: `revision.restored`
  11. Return the updated parent post
- **Events:** `revision.restored`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated
  - `NOT_FOUND`: Revision does not exist
  - `NOT_FOUND`: Parent post/page no longer exists
  - `FORBIDDEN`: User lacks `revision.restore` capability
  - `FORBIDDEN`: User lacks edit capability on parent post
  - `INVALID_STATE`: Parent post is in trash (must restore from trash first)

#### `revision.delete` - Delete a Revision

- **Convex Function:** `mutations/revisions.delete`
- **Type:** Mutation
- **Auth:** Required (Convex Auth)
- **Capabilities:** `revision.delete` (Administrator only)
- **Airtable Record:** `rec6VUSNgrQnPtzws`
- **Args:**
  ```typescript
  {
    revisionId: v.id("revisions"),
  }
  ```
- **Returns:** `{ success: true }`
- **Behavior:**
  1. Authenticate user via Convex Auth
  2. Check capability: `revision.delete`
  3. Fetch the revision document
  4. Delete the revision document from the `revisions` table
  5. No event emitted (revision deletion is a cleanup operation)
  6. Return success
- **Events:** None
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated
  - `FORBIDDEN`: User lacks `revision.delete` capability
  - `NOT_FOUND`: Revision does not exist

### Internal Functions (Not Exposed to Client)

#### `internal.revisions.createOnSave` - Create Revision on Save

- **Convex Function:** `internal/revisions.createOnSave`
- **Type:** Internal Mutation
- **Called By:** Post System (`post.update`), Page System (`page.update`)
- **Args:**
  ```typescript
  {
    parentId: v.id("posts"),
    parentType: v.union(v.literal("post"), v.literal("page")),
    title: v.string(),               // Current title BEFORE the update
    content: v.string(),             // Current content BEFORE the update
    excerpt: v.optional(v.string()), // Current excerpt BEFORE the update
    authorId: v.string(),            // User who is making the save
    changedFields: v.array(v.string()), // Which fields are about to change
  }
  ```
- **Behavior:**
  1. Determine next revision number: query highest `revisionNumber` for this parent, increment by 1
  2. Calculate `contentLength` from the content string
  3. Insert new document into `revisions` table with `type: "manual"`
  4. Check total revision count against `max_revisions` (from Settings System, default 25)
  5. If count exceeds maximum, delete oldest manual revisions (by `revisionNumber` ascending) until within limit. Never delete autosave revisions during pruning.
  6. Emit event: `revision.created`
  7. Return the new revision ID
- **Skip Conditions (do NOT create a revision):**
  - Post is in `auto-draft` status
  - No content fields changed (only metadata like `isSticky`, `menuOrder`)
  - `changedFields` array does not include `title`, `content`, or `excerpt`
- **Call Sequence in post.update:**
  ```
  User clicks "Update" -> post.update mutation starts
    -> Step 1: Read current post state
    -> Step 2: Call internal.revisions.createOnSave(currentState)
    -> Step 3: Apply changes to post document
    -> Step 4: Emit post.updated event
  ```

#### `internal.revisions.createAutosave` - Create/Update Autosave Revision

- **Convex Function:** `internal/revisions.createAutosave`
- **Type:** Internal Mutation
- **Called By:** Content Editor System (`editor.autosave`) at 5-minute intervals
- **Args:**
  ```typescript
  {
    parentId: v.id("posts"),
    parentType: v.union(v.literal("post"), v.literal("page")),
    title: v.string(),
    content: v.string(),
    excerpt: v.optional(v.string()),
    authorId: v.string(),
  }
  ```
- **Behavior:**
  1. Check if an autosave revision already exists for `parentId` + `authorId`
     - Use `by_parent_type` index with `parentId` and `type = "autosave"`, then filter by `authorId`
  2. If exists: **update in place** (patch existing with new title, content, excerpt, contentLength, createdAt)
  3. If not exists: **create new revision** with `type: "autosave"`, assign next `revisionNumber`
  4. Do NOT emit events (too noisy)
  5. Return the autosave revision ID
- **Key behavior:** One autosave revision per user per post (same as WordPress). If user A and user B are both editing the same post, each gets their own autosave revision.

#### `internal.revisions.deleteByParent` - Delete All Revisions for a Post

- **Convex Function:** `internal/revisions.deleteByParent`
- **Type:** Internal Mutation
- **Called By:** Post System (`post.delete` - permanent deletion), Page System (`page.delete`)
- **Args:**
  ```typescript
  {
    parentId: v.id("posts"),
  }
  ```
- **Behavior:**
  1. Query all revisions with `by_parent` index for the given `parentId`
  2. Delete each revision document
  3. No events emitted (parent deletion cascades)
  4. Return `{ deleted: number }`

#### `internal.revisions.prune` - Prune Old Revisions

- **Convex Function:** `internal/revisions.prune`
- **Type:** Internal Mutation
- **Called By:** Scheduled function (daily) or triggered after `createOnSave`
- **Args:**
  ```typescript
  {
    parentId: v.optional(v.id("posts")),  // If provided, prune only this post
    maxRevisions: v.optional(v.number()), // Override setting (default: read from Settings)
  }
  ```
- **Behavior:**
  1. Read `max_revisions` from Settings System (default: 25). Use `maxRevisions` arg if provided.
  2. If `parentId` provided, query revisions for that parent only. Otherwise, query all parents with excess counts.
  3. For each parent with more than `max_revisions` manual revisions:
     - Sort manual revisions by `revisionNumber` ascending
     - Delete oldest until count equals `max_revisions`
     - Never delete autosave revisions during pruning
  4. Return `{ prunedCount: number, postsAffected: number }`

### Helper Functions

```typescript
// convex/helpers/revisions.ts

// Get total revision count for a post
export async function getRevisionCount(
  ctx: QueryCtx,
  parentId: Id<"posts">,
  type?: "manual" | "autosave",
): Promise<number>

// Get the most recent revision for a post
export async function getLatestRevision(
  ctx: QueryCtx,
  parentId: Id<"posts">,
  type?: "manual" | "autosave",
): Promise<Doc<"revisions"> | null>

// Get the next sequential revision number for a post
export async function getNextRevisionNumber(
  ctx: MutationCtx,
  parentId: Id<"posts">,
): Promise<number>
```

---

## Events

### `revision.created`

- **Airtable Record:** `recontpS7CkCiCrKV`
- **Event Code:** `revision.created`
- **Type:** Content
- **Triggered By:** `internal.revisions.createOnSave` (called by `post.update` / `page.update`)
- **Payload:**
  ```typescript
  {
    revisionId: Id<"revisions">,
    postId: Id<"posts">,          // Parent post/page ID
    authorId: string,              // user identifier of who triggered the save
    revisionNumber: number,        // The sequential revision number
  }
  ```
- **Subscribers:**
  - **Site Notification:** Shows info toast `'Revision #{number} saved for "{title}"'` to the author (transient, not persistent)
  - **Audit Log:** Records that a revision was created, linking to the parent post
  - **Dashboard:** May update "Recent Activity" widget

### `revision.restored`

- **Airtable Record:** `rec9ET8Ibyd1WNqzR`
- **Event Code:** `revision.restored`
- **Type:** Content
- **Triggered By:** `revision.restore` mutation
- **Payload:**
  ```typescript
  {
    revisionId: Id<"revisions">,       // The revision that was restored
    postId: Id<"posts">,              // The parent post/page that was updated
    restoredBy: string,                // user identifier of who performed the restore
    revisionNumber: number,            // Which revision number was restored
    previousRevisionNumber: number,    // The revision number of the state that was replaced
  }
  ```
- **Subscribers:**
  - **Email Notification:** Sends "Revision Restored Alert" to post author (if restorer is different from author). Subject: `'Post revision restored by {user}'`. Priority: Immediate.
  - **Site Notification:** Shows warning notification `'Revision restored for "{title}"'` to post author. Persistent: Yes (stays in notification center until dismissed).
  - **Audit Log:** Records restore action with before/after revision numbers
  - **Dashboard:** Updates "Recent Activity" widget
- **Event Chain:**
  ```
  Editor clicks "Restore This Revision"
    -> revision.restore mutation executes
      -> New revision created from current state (safety net)
      -> Parent post patched with revision's snapshot data
      -> revision.restored event emitted
        -> Email: "Post revision restored by {user}" (to post author, if different)
        -> Site Notification: "Revision restored for '{title}'" (persistent)
        -> Audit Log: restore recorded with revision numbers
        -> Convex reactivity: post edit screen updates live with restored content
  ```

---

## Admin Routes & UI

### Post Revisions Page (`/admin/posts/$postId/revisions`)

- **Airtable Record:** `recAYrwlES6vS8HDG`
- **Purpose:** Full-page revision comparison screen with slider navigation, side-by-side diff, and restore functionality
- **WordPress Equivalent:** Revision comparison screen (wp-admin/revision.php)
- **App:** Admin (TanStack Router + Vite)
- **Layout:** `_admin` (sidebar + topbar)
- **Auth Required:** Yes
- **Roles:** Administrator, Editor (Authors can view own posts only, cannot restore)
- **Data Requirements:**
  - `queries/revisions.listByParent` - All revisions for the post
  - `queries/revisions.compare` - Full content of two revisions for diff
  - `queries/posts.get` - Parent post metadata
- **Key Components:**
  1. **Page Header**
     - Back link: "< Back to Edit Post: '{title}'" -> `/admin/posts/$postId/edit`
     - Title: "Revisions for '{title}'"
     - "Restore This Revision" button (prominent, primary action, disabled when viewing current state)
     - Confirmation dialog before restore: "Are you sure you want to restore this revision? The current content will be saved as a new revision before restoring."
  2. **Comparison Mode Toggle**
     - Checkbox: "Compare any two revisions"
     - Default OFF: left pane = previous revision, right pane = selected revision
     - When ON: two slider handles, user picks any two revisions
  3. **Revision Slider**
     - Horizontal timeline with all revisions as points
     - Each point shows revision number, date, author avatar (on hover)
     - "Current" marker at rightmost position
     - Draggable handle(s), keyboard accessible (Left/Right arrows)
  4. **Navigation Buttons**
     - "< Previous" / "Next >" for stepping through revisions
     - Disabled at boundaries
  5. **Revision Metadata** (Two columns)
     - Author name, avatar, date/time, revision number
     - If comparing with "Current", right column shows "Current version"
  6. **Diff Panels** (Three sections: Title, Content, Excerpt)
     - Deletions: Red background with strikethrough
     - Additions: Green background
     - Unchanged: Normal text, no background
     - "(no changes)" when section is identical
     - Content diff: block-level changes first, then word-level within modified blocks
  7. **Empty State:** "No revisions yet. Revisions are created each time you save the post." with link back to editor
- **Role-Based Behavior:**
  - **Authors:** View own post revisions only. No restore button. Cannot access others' posts.
  - **Editors:** View and restore any post. Restore button active.
  - **Administrators:** Full access including delete (dropdown option per revision).
  - **Contributors/Subscribers:** Redirect to dashboard.
- **Real-Time:** New revisions appear on slider live. Post content updates after restore.

### Revisions Metabox (on Edit Post/Page screen)

- **Location:** Sidebar of `/admin/posts/$postId/edit`
- **Owned By:** Post System UI (powered by Revision System data)
- **Data:** `queries/revisions.countByParent`
- **Display:**
  ```
  +------------------------+
  | Revisions              |
  +------------------------+
  | Revisions: 12          |
  | [Browse Revisions]     |
  +------------------------+
  ```
- **Behavior:**
  - Only visible when revision count > 0
  - "Browse Revisions" navigates to `/admin/posts/$postId/revisions`
  - Count updates in real-time (Convex subscription)
  - Hidden when `revisions_enabled` setting is false

---

## Website Routes

The Revision System has **no website routes**. It is entirely an admin-side concern. Website visitors never see or interact with revisions.

---

## Notifications

### Email Notifications

| # | Name | Event | Recipients | Priority | Subject | Conditions | Airtable Record |
|---|------|-------|------------|----------|---------|------------|-----------------|
| 1 | Revision Restored Alert | `revision.restored` | Post author (Employee) | Immediate | "Post revision restored by {user}" | Only when restorer != post author | `recb5z8oijA7KMAay` |

**Email Template Variables:**
- `{user}` - Display name of the user who performed the restore
- `{title}` - Title of the post that was restored
- `{revisionNumber}` - The revision number that was restored
- `{postEditUrl}` - Direct link to the post editor
- `{siteName}` - Site name from Settings System

### Site Notifications

| # | Name | Event | Message | Type | Persistent | Recipient | Airtable Record |
|---|------|-------|---------|------|------------|-----------|-----------------|
| 1 | Revision Created | `revision.created` | `Revision #{number} saved for "{title}"` | Info | No (transient toast) | Author who saved | `recE0FrPI3U3xSlb9` |
| 2 | Revision Restored | `revision.restored` | `Revision restored for "{title}"` | Warning | Yes (stays in notification center) | Post author | `rectNwLv5Cru5sisy` |

---

## Role & Capability Matrix

| Capability | Code | Admin (100) | Editor (80) | Author (60) | Contributor (40) | Subscriber (20) |
|-----------|------|-------------|-------------|-------------|-------------------|------------------|
| View Revisions | `revision.view` | Yes | Yes | Yes* | No | No |
| Compare Revisions | `revision.compare` | Yes | Yes | Yes* | No | No |
| Restore Revision | `revision.restore` | Yes | Yes | No | No | No |
| Delete Revision | `revision.delete` | Yes | No | No | No | No |

*\* = Own posts only. Authors can view/compare revisions of their own posts but cannot access revisions of others' posts.*

### Meta Capability Mapping

| Meta Capability | Check Logic | Resolves To |
|----------------|------------|-------------|
| `revision.view_for_post` | Is user the post author? | Own post: `revision.view` / Others' post: `revision.view` + role level >= 80 |
| `revision.restore_for_post` | Is user the post author? | Requires `revision.restore` + `post.update` (ownership or Editor+) |

---

## Dependencies

### Depends On

| System | Record | Type | Reason |
|--------|--------|------|--------|
| **Post System** | `rec6ZGXFgdJ8mU51f` | **Hard** | Revisions are snapshots of posts. `parentId` references `posts` table. Post System calls `internal.revisions.createOnSave` on every save and `internal.revisions.deleteByParent` on permanent delete. |
| **Role & Capability System** | `recLjkb6BJlxqHTQv` | **Hard** | Permission checks (`revision.view`, `revision.compare`, `revision.restore`, `revision.delete`) use the capability system. |
| **Auth System** | `recNGEVtMvLjp6o8h` | **Hard** | All queries/mutations require Convex Auth authentication. `authorId` is a user identifier. |
| **Settings System** | `rechYtZ2IKH1CzDJ6` | **Soft** | Reads `max_revisions` and `revisions_enabled` settings. Falls back to defaults (25 and true) if settings not configured. |

### Depended On By

| System | Record | Type | Reason |
|--------|--------|------|--------|
| **Post System** | `rec6ZGXFgdJ8mU51f` | **Soft** | Post System calls `internal.revisions.createOnSave` before applying updates. Edit screen shows Revisions metabox. |
| **Page System** | - | **Soft** | Same integration pattern as Post System with `parentType: "page"`. |
| **Content Editor System** | - | **Soft** | Editor calls `internal.revisions.createAutosave` for periodic autosave revisions at 5-min intervals. |
| **Event Dispatcher System** | - | **Soft** | Processes `revision.created` and `revision.restored` events. |
| **Email Notification System** | - | **Soft** | Sends "Revision Restored Alert" email on `revision.restored`. |
| **Site Notification System** | - | **Soft** | Shows "Revision Created" toast and "Revision Restored" persistent notification. |
| **Audit Log System** | - | **Soft** | Records revision creation and restore events. |

---

## Settings Integration

The Revision System reads from the Settings System (Writing Settings page):

| Setting Key | Type | Default | Description | Admin UI Location |
|------------|------|---------|-------------|-------------------|
| `max_revisions` | `number` | `25` | Maximum manual revisions per post. Oldest pruned when exceeded. `0` = disable. `-1` = unlimited. | Settings > Writing > Revisions |
| `revisions_enabled` | `boolean` | `true` | Master switch. When disabled, no new revisions created on save. Existing revisions preserved. | Settings > Writing > Revisions |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)

- [ ] `convex/schema.ts` - Add `revisions` table definition (1 table)
- [ ] `convex/revisions.ts` - Public queries (`listByParent`, `compare`, `countByParent`) and mutations (`restore`, `delete`)
- [ ] `convex/internal/revisions.ts` - Internal mutations (`createOnSave`, `createAutosave`, `deleteByParent`, `prune`)
- [ ] `convex/helpers/revisions.ts` - Helper functions (`getRevisionCount`, `getLatestRevision`, `getNextRevisionNumber`)
- [ ] `convex/crons.ts` - Add daily prune scheduled function registration

### Admin Frontend (ConvexPress-Admin/apps/web/)

- [ ] `src/routes/_admin/posts/$postId/revisions.tsx` - Revision comparison page (full page route)
- [ ] `src/components/revisions/revision-slider.tsx` - Timeline slider for navigating revisions
- [ ] `src/components/revisions/diff-viewer.tsx` - Side-by-side diff renderer (title, content, excerpt)
- [ ] `src/components/revisions/diff-pane.tsx` - Single pane of the diff (renders added/removed/unchanged spans)
- [ ] `src/components/revisions/revision-meta.tsx` - Revision metadata display (author, date, number)
- [ ] `src/components/revisions/restore-dialog.tsx` - Confirmation dialog for restore action
- [ ] `src/components/posts/revisions-metabox.tsx` - Sidebar metabox (revision count + browse link, used on edit post page)
- [ ] `src/lib/diff.ts` - Wrapper around `diff-match-patch` library for text diffing
- [ ] `src/lib/blockDiff.ts` - Block-level diff logic for structured content

### Website Frontend (ConvexPress-Website/apps/web/)

- No files needed. Revision System is admin-only.

### Dependencies to Install

- [ ] `diff-match-patch` - Google's diff library (~18KB minified)

### Post System Integration Points

- [ ] Modify `post.update` mutation to call `internal.revisions.createOnSave` BEFORE applying changes
- [ ] Modify `post.delete` mutation to call `internal.revisions.deleteByParent` before deleting post
- [ ] Add Revisions metabox to the edit post page sidebar
- [ ] Identical integration for Page System

---

## Diff Engine

### Client-Side Approach

ConvexPress computes diffs on the client (browser), not the server. Rationale:
1. Convex is not ideal for CPU-intensive text processing
2. Client-side diff libraries are mature and fast
3. The compare query returns raw content; client computes diff locally

### Recommended Library: `diff-match-patch`

- Well-maintained, battle-tested (used by Google Docs)
- Supports character-level and word-level diffs
- Produces clean, semantic diffs
- Small bundle size (~18KB minified)

```typescript
// ConvexPress-Admin/src/lib/diff.ts
import { diff_match_patch } from "diff-match-patch";

const dmp = new diff_match_patch();

export function computeDiff(oldText: string, newText: string): DiffResult[] {
  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs);

  return diffs.map(([op, text]) => ({
    type: op === -1 ? "removed" : op === 1 ? "added" : "unchanged",
    text,
  }));
}

export type DiffResult = {
  type: "removed" | "added" | "unchanged";
  text: string;
};
```

### Block-Level Content Diff

The block editor stores content as serialized JSON (array of block objects). For meaningful diffs:
1. Parse JSON into block arrays
2. Diff at block level first (LCS to align blocks by ID)
3. For modified blocks: diff inner text at word level
4. Render block-level changes in two-pane view

### Diff Styling

```css
.diff-removed {
  background-color: var(--destructive-bg, #fecaca);
  text-decoration: line-through;
}
.diff-added {
  background-color: var(--success-bg, #bbf7d0);
}
.diff-unchanged {
  /* No special styling */
}
```

---

## Edge Cases & Gotchas

1. **Restoring a revision creates a revision.** When restoring revision #5, the system first creates a new revision of the CURRENT state (safety net). This mirrors WordPress behavior. The user can always "undo" a restore by restoring the safety-net revision.

2. **Post deletion cascades to revisions.** When a post is permanently deleted via `post.delete`, all associated revisions are deleted via `internal.revisions.deleteByParent`. Prevents orphaned records.

3. **Trashing does NOT delete revisions.** When a post is moved to trash (`post.trash`), revisions are preserved. If the post is restored from trash, all revisions are still available.

4. **Concurrent editing safety.** If two editors save simultaneously, Convex transactions ensure both revisions are created with unique sequential numbers. The second save may overwrite the first's changes on the post, but both revisions exist for comparison and restore.

5. **Snapshot BEFORE update, not after.** The revision captures the state BEFORE the current update is applied. This is critical -- the revision represents "what was there before this change." Getting this wrong reverses the diff logic.

6. **Skip conditions for createOnSave.** Do NOT create a revision when: (a) post is `auto-draft`, (b) only metadata changed (not title/content/excerpt), (c) `revisions_enabled` is false, (d) `max_revisions` is 0.

7. **Autosave revisions are NOT pruned.** The pruning mechanism only deletes manual revisions. Autosave revisions (one per user per post) are preserved to ensure the safety buffer is always available.

8. **Autosave revision vs. Post System autosave.** The Post System's 60-second autosave stores data inline on the post (`autosaveContent`, `autosaveTitle`). The Revision System's autosave is a separate 5-minute snapshot. The Content Editor System calls `internal.revisions.createAutosave` at 5-minute intervals. These are different mechanisms.

9. **Restoring when post is trashed.** If the parent post is in trash, the restore mutation returns `INVALID_STATE`. The user must restore the post from trash first, then restore the revision.

10. **Revisions disabled but existing revisions remain.** When `revisions_enabled` is toggled off, existing revisions are NOT deleted. Users can still view and restore them. The metabox is hidden, and the revisions page shows a message about enabling in Settings.

11. **Max revisions reduced retroactively.** If an admin reduces `max_revisions` from 50 to 10, excess revisions are pruned on the next save of each affected post (not immediately). The daily prune function also handles this.

12. **Max revisions = -1 (unlimited).** No pruning occurs. All revisions kept indefinitely. The daily prune function skips these posts. Warning: significant storage growth over time.

13. **Revision numbers are never reused.** After pruning, if revisions 1-5 are deleted and revision 6 remains, the next revision is still numbered based on the highest existing number + 1, not based on gap-filling.

14. **Content length tracking.** Each revision stores `contentLength` (character count) for quick reference without loading the full content. Useful for dashboard widgets or list views showing content size trends.

15. **Author field is user identifier, not Convex user ID.** The `authorId` field stores the user identifier string, not an `Id<"users">`. This matches the auth pattern used throughout ConvexPress.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `wp_save_post_revision($post_id)` | `internal.revisions.createOnSave` | Called by Post/Page System before applying updates |
| `wp_get_post_revisions($post_id)` | `queries/revisions.listByParent` | Returns paginated list with author data |
| `wp_is_post_revision($post)` | N/A | Unnecessary -- separate `revisions` table makes this implicit |
| `wp_is_post_autosave($post)` | `revision.type === "autosave"` | Simple field check |
| `wp_restore_post_revision($revision_id)` | `mutations/revisions.restore` | Also creates safety revision before restoring |
| `wp_delete_post_revision($revision_id)` | `mutations/revisions.delete` | Admin-only capability |
| `wp_revisions_to_keep($post)` | Settings System: `max_revisions` | Default 25 (WordPress default is unlimited) |
| `wp_text_diff($left, $right)` | Client-side `diff-match-patch` | Server-to-client shift for diff computation |
| `WP_POST_REVISIONS` constant | Settings System: `revisions_enabled` + `max_revisions` | Configurable at runtime, not compile-time |
| `_wp_put_post_revision` hook | `revision.created` event | Emitted after revision is saved |
| `wp_restore_post_revision` hook | `revision.restored` event | Emitted after revision is restored |
| Revision comparison screen (revision.php) | `/admin/posts/$postId/revisions` | React-based with real-time updates |
| Revisions metabox on edit screen | `revisions-metabox.tsx` component | Shows count + browse link in sidebar |
