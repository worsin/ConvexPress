# Comment System - Expert Knowledge Document

**System:** Comment System
**Status:** Complete (100%)
**Priority:** P1 - High
**WordPress Equivalent:** `wp_comments` infrastructure - `edit-comments.php`, `comment.php`, `options-discussion.php`, threaded front-end display
**Last Analyzed:** 2026-02-13
**Airtable System Record:** `rechYtZ2IKH1CzDJ6`
**Airtable Expert Record:** `recpHc71bWC1myN0y`

---

## Quick Reference

### What This System Does

The Comment System provides threaded discussion on published content. It implements the full comment lifecycle: creation by authenticated users, threaded replies, moderation queue (approve/reject/spam), flagging, liking, inline editing, and bulk operations. This is the WordPress equivalent of `wp_comments` + `wp_commentmeta` + the comments admin screens + the front-end threaded comment display.

In ConvexPress, all commenters must be authenticated via Convex Auth (no anonymous comments). Comments are real-time via Convex subscriptions -- new comments appear live without page refresh.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Comment Statuses** | `approved`, `pending`, `spam`, `trash` -- same as WordPress |
| **Threading** | Parent-child comment tree via `parentId`, configurable depth (default 5) |
| **Moderation Pipeline** | Rule-based: disallowed keys -> spam, moderation keys -> pending, link count -> pending, returning commenter -> auto-approve |
| **Flood Prevention** | Minimum interval between comments per user (default 15s) |
| **Grace Period** | Non-moderators can edit own comments within 5 minutes of creation |
| **Denormalized Counts** | `posts.commentCount`, `comments.likeCount`, `comments.flagCount` -- updated transactionally |
| **Auto-Purge** | Trashed comments permanently deleted after 30 days via Convex scheduled function |
| **Flag Threshold** | Comments auto-held for moderation after N flags (default 3) |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Database** | MySQL `wp_comments` + `wp_commentmeta` | Convex `comments` + `commentMeta` + `commentLikes` + `commentFlags` |
| **Anonymous comments** | Supported (name + email fields) | Not supported -- all comments require Convex Auth authentication |
| **Reactivity** | Poll/refresh | Real-time Convex subscriptions (new comments appear live) |
| **Auth** | Cookie-based, optional for comments | Convex Auth JWT tokens, required for all comments |
| **Avatars** | Gravatar (email hash lookup) | Convex Auth user avatars (profile image from auth provider) |
| **Spam detection** | Akismet plugin (external) | Rule-based filtering (link count, word blocklist, flood prevention) |
| **Trash** | Soft delete with 30-day auto-purge | Same pattern as WordPress |
| **Pingbacks/Trackbacks** | Built-in | Not implemented (obsolete protocol) |
| **Comment types** | comment, pingback, trackback, custom | Single type: `comment` |
| **Likes** | Not built-in (plugin territory) | Built-in like/unlike toggle with `commentLikes` table |
| **Flagging** | Not built-in | Built-in flag for review with `commentFlags` table |

---

## Architecture Overview

### Data Flow

```
User submits comment on front-end
  -> comment.create mutation (or comment.reply)
    -> Convex Auth auth check (must be authenticated)
    -> Capability check (create_comments / reply_to_comments)
    -> Post validation (exists, published, commentStatus: "open")
    -> Content validation + sanitization
    -> Flood check (query last comment timestamp)
    -> Threading validation (parentId, depth calculation)
    -> Moderation pipeline (determines initial status)
    -> Denormalize author data from the auth system profile
    -> Insert comment record
    -> Store commentMeta (_user_agent, _ip_address)
    -> If approved: increment posts.commentCount
    -> Emit comment.created event
      -> Event Dispatcher -> Email Notification System
      -> Event Dispatcher -> Site Notification System
      -> Event Dispatcher -> Audit Log System
    -> Return { commentId, status }
```

**Admin moderation flow:**
```
Moderator clicks Approve/Reject/Spam/Trash
  -> Corresponding mutation
    -> Convex Auth auth check
    -> moderate_comments capability check
    -> Update comment status
    -> Adjust posts.commentCount (increment/decrement as needed)
    -> Set moderatedBy + moderatedAt
    -> Emit corresponding event
    -> Real-time update propagates to all connected clients
```

### Real-Time Behavior

Convex subscriptions power real-time updates throughout:

| Subscription | Where Used | What Updates |
|-------------|-----------|--------------|
| `comments.forPost` | Website single post page | New comments appear live, likes update, moderated comments disappear |
| `comments.list` | Admin All Comments page | New comments appear, status changes reflect immediately |
| `comments.counts` | Admin status tabs + sidebar badge | Pending count badge updates in real-time |
| `comments.pendingCount` | Admin sidebar menu item | Red badge count updates live |
| `comments.get` | Admin Edit Comment page | Content/status changes reflect if another admin edits |

**Optimistic Updates:** The like/unlike toggle uses Convex optimistic updates so the UI responds instantly before server confirmation.

### Authentication & Authorization

**Authentication:** Every comment operation requires a valid auth session. The `ctx.auth.getUserIdentity()` call in every mutation/query validates the JWT.

**Authorization Pattern:**
1. Extract user identity from the auth system
2. Look up user's role from the users table
3. Check capability using `currentUserCan(capability)` from the Role & Capability System
4. For meta-capabilities like `edit_comment`, resolve to the correct primitive capability based on ownership and grace period

**Key capability checks:**
- `create_comments` -- required for `comment.create` (all roles)
- `reply_to_comments` -- required for `comment.reply` (Admin, Editor, Author only)
- `moderate_comments` -- required for approve, reject, spam, delete, bulk ops, edit others' comments (Admin, Editor only)
- `like_comments` -- required for `comment.like` (all roles)
- `flag_comments` -- required for `comment.flag` (all roles)

---

## Database Schema

### `comments` Table

The primary comment storage table. Replaces WordPress's `wp_comments`.

```typescript
// convex/schema.ts

const commentApprovalStatus = v.union(
  v.literal("approved"),
  v.literal("pending"),
  v.literal("spam"),
  v.literal("trash"),
);

comments: defineTable({
  // --- Core Fields ---
  postId: v.id("posts"),                       // comment_post_ID - The post this comment belongs to
  content: v.string(),                         // comment_content - The comment text (plain text or limited markdown)
  status: commentApprovalStatus,               // comment_approved - Moderation status

  // --- Authorship ---
  authorId: v.string(),                        // user_id - user identifier (required - no anonymous comments)
  authorName: v.string(),                      // comment_author - Denormalized display name (from the auth system)
  authorAvatarUrl: v.optional(v.string()),     // Denormalized avatar URL (from the auth system profile)

  // --- Threading ---
  parentId: v.optional(v.id("comments")),      // comment_parent - Parent comment ID for replies (null = top-level)
  depth: v.number(),                           // Computed depth in thread (0 = top-level, max from settings)

  // --- Engagement ---
  likeCount: v.number(),                       // Denormalized count of likes
  flagCount: v.number(),                       // Denormalized count of flags

  // --- Moderation Metadata ---
  moderatedBy: v.optional(v.string()),         // user identifier of moderator who approved/rejected/spammed
  moderatedAt: v.optional(v.number()),         // When moderation action was taken
  flaggedReasons: v.optional(v.array(v.string())), // Collected flag reasons

  // --- Edit History ---
  isEdited: v.boolean(),                       // Whether the comment has been edited after creation
  editedAt: v.optional(v.number()),            // When last edited

  // --- Trash ---
  previousStatus: v.optional(v.string()),      // Status before trashing (for restore)
  trashedAt: v.optional(v.number()),           // When moved to trash (for auto-purge)

  // --- Timestamps ---
  createdAt: v.number(),                       // comment_date - Creation timestamp (ms)
  updatedAt: v.number(),                       // Last modification timestamp (ms)
})
  // --- Indexes ---
  .index("by_post", ["postId", "status", "createdAt"])           // Comments on a post (with status filter)
  .index("by_post_parent", ["postId", "parentId", "createdAt"])  // Thread structure within a post
  .index("by_author", ["authorId", "createdAt"])                 // User's comments (My Comments page)
  .index("by_status", ["status", "createdAt"])                   // Admin moderation queue (Pending/Spam/Trash tabs)
  .index("by_status_post", ["status", "postId"])                 // Count comments per status per post
  .index("by_flagged", ["flagCount", "status"])                  // Flagged comments for review
  .index("by_trashed", ["status", "trashedAt"]),                 // Trash auto-purge
```

**Field Specifications:**

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `postId` | `Id<"posts">` | Yes | - | Must reference existing post with `commentStatus: "open"` and `status: "publish"` |
| `content` | `string` | Yes | - | Min 1 char, max 5000 chars. Trimmed. Sanitized (strip dangerous HTML, allow safe subset). |
| `status` | `commentApprovalStatus` | Yes | Determined by moderation pipeline | One of: `approved`, `pending`, `spam`, `trash` |
| `authorId` | `string` | Yes | Current user identifier | Valid user identifier |
| `authorName` | `string` | Yes | From Convex Auth profile | Denormalized at creation time |
| `authorAvatarUrl` | `string` | No | From Convex Auth profile | Denormalized at creation time |
| `parentId` | `Id<"comments">` | No | `undefined` | Must reference comment on same post, not in spam/trash |
| `depth` | `number` | Yes | `0` | 0 for top-level. Max from Discussion Settings (default 5). Clamped at max. |
| `likeCount` | `number` | Yes | `0` | Non-negative integer |
| `flagCount` | `number` | Yes | `0` | Non-negative integer |
| `moderatedBy` | `string` | No | `undefined` | Set on approve/reject/spam actions |
| `moderatedAt` | `number` | No | `undefined` | Timestamp of moderation action |
| `flaggedReasons` | `string[]` | No | `undefined` | Aggregated from commentFlags records |
| `isEdited` | `boolean` | Yes | `false` | Set to `true` on first edit |
| `editedAt` | `number` | No | `undefined` | Timestamp of last edit |
| `previousStatus` | `string` | No | `undefined` | Stored when trashing, cleared on restore |
| `trashedAt` | `number` | No | `undefined` | When moved to trash, used for 30-day auto-purge |
| `createdAt` | `number` | Yes | `Date.now()` | Immutable after creation |
| `updatedAt` | `number` | Yes | `Date.now()` | Updated on every mutation |

### `commentMeta` Table

Key-value metadata for comments. Replaces WordPress's `wp_commentmeta`.

```typescript
commentMeta: defineTable({
  commentId: v.id("comments"),                 // Foreign key to comments table
  key: v.string(),                             // meta_key (max 255 chars)
  value: v.string(),                           // meta_value (JSON-encoded for complex values)
})
  .index("by_comment", ["commentId"])                            // All meta for a comment
  .index("by_comment_key", ["commentId", "key"])                 // Specific meta value
  .index("by_key", ["key"]),                                     // All comments with a given meta key
```

**Known Meta Keys:**

| Meta Key | Used By | Value Type | Description |
|----------|---------|------------|-------------|
| `_user_agent` | Comment System | `string` | Browser user agent string (for spam analysis) |
| `_ip_address` | Comment System | `string` | IP address at time of comment (for spam analysis) |
| `_akismet_result` | Spam Detection | `string` | Result from spam check if external service used (future) |
| `_edit_reason` | Comment System | `string` | Optional reason provided by moderator when editing |

### `commentLikes` Table

One record per user-comment like relationship. No WordPress equivalent (built-in feature).

```typescript
commentLikes: defineTable({
  commentId: v.id("comments"),                 // The comment being liked
  userId: v.string(),                          // user identifier of the liker
  createdAt: v.number(),                       // When the like was created
})
  .index("by_comment", ["commentId"])                            // All likes for a comment
  .index("by_user_comment", ["userId", "commentId"])             // Check if user already liked (unique constraint)
  .index("by_user", ["userId"]),                                 // All likes by a user
```

### `commentFlags` Table

One record per user-comment flag relationship. No WordPress equivalent (built-in feature).

```typescript
commentFlags: defineTable({
  commentId: v.id("comments"),                 // The comment being flagged
  userId: v.string(),                          // user identifier of the flagger
  reason: v.string(),                          // Flag reason: "spam", "harassment", "off-topic", "misinformation", "other"
  details: v.optional(v.string()),             // Optional additional details (max 500 chars)
  createdAt: v.number(),                       // When the flag was created
})
  .index("by_comment", ["commentId"])                            // All flags for a comment
  .index("by_user_comment", ["userId", "commentId"])             // Check if user already flagged (unique constraint)
  .index("by_user", ["userId"]),                                 // All flags by a user
```

### Indexes Summary

| Table | Index Name | Fields | Purpose |
|-------|-----------|--------|---------|
| `comments` | `by_post` | `postId`, `status`, `createdAt` | Fetch comments for a post filtered by status |
| `comments` | `by_post_parent` | `postId`, `parentId`, `createdAt` | Build thread structure within a post |
| `comments` | `by_author` | `authorId`, `createdAt` | User's comment history (My Comments page) |
| `comments` | `by_status` | `status`, `createdAt` | Admin moderation queue tabs |
| `comments` | `by_status_post` | `status`, `postId` | Count comments per status per post |
| `comments` | `by_flagged` | `flagCount`, `status` | Find flagged comments for review |
| `comments` | `by_trashed` | `status`, `trashedAt` | Identify comments for auto-purge |
| `commentMeta` | `by_comment` | `commentId` | All meta for a comment |
| `commentMeta` | `by_comment_key` | `commentId`, `key` | Look up specific meta value |
| `commentMeta` | `by_key` | `key` | Find all comments with a given meta key |
| `commentLikes` | `by_comment` | `commentId` | All likes for a comment |
| `commentLikes` | `by_user_comment` | `userId`, `commentId` | Unique constraint: one like per user per comment |
| `commentLikes` | `by_user` | `userId` | All likes by a user |
| `commentFlags` | `by_comment` | `commentId` | All flags for a comment |
| `commentFlags` | `by_user_comment` | `userId`, `commentId` | Unique constraint: one flag per user per comment |
| `commentFlags` | `by_user` | `userId` | All flags by a user |

### Relationships

| This Table | Field | References | Relationship |
|-----------|-------|-----------|--------------|
| `comments.postId` | `v.id("posts")` | `posts._id` | Many comments belong to one post |
| `comments.parentId` | `v.id("comments")` | `comments._id` | Self-referential threading (parent-child) |
| `comments.authorId` | `string` | user identifier | Comment author (external auth provider) |
| `comments.moderatedBy` | `string` | user identifier | Moderator who acted on the comment |
| `commentMeta.commentId` | `v.id("comments")` | `comments._id` | Meta belongs to one comment |
| `commentLikes.commentId` | `v.id("comments")` | `comments._id` | Like belongs to one comment |
| `commentLikes.userId` | `string` | user identifier | User who liked |
| `commentFlags.commentId` | `v.id("comments")` | `comments._id` | Flag belongs to one comment |
| `commentFlags.userId` | `string` | user identifier | User who flagged |

**Cross-system field on `posts` table (owned by Post System):**
- `posts.commentCount` -- denormalized count of approved comments, updated by Comment System mutations
- `posts.commentStatus` -- `"open"` or `"closed"`, controls whether new comments are allowed

---

## Actions & Functions

### Mutations

#### `comment.create` - Create Comment
- **Airtable Record:** `recWWF2RSxLHLj3kc`
- **Type:** Mutation
- **Convex Function:** `mutations/comments.create`
- **Auth:** Required (Convex Auth)
- **Capabilities:** Administrator, Editor, Author, Contributor, Subscriber (`create_comments`)
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    content: v.string(),
    parentId: v.optional(v.id("comments")),
  }
  ```
- **Returns:** `{ commentId: Id<"comments">, status: CommentApprovalStatus }`
- **Behavior:**
  1. Authenticate user via auth identity
  2. Check capability: `create_comments`
  3. Fetch target post. Validate: post exists, `status === "publish"`, `commentStatus === "open"`
  4. Validate content: trim whitespace, min 1 char, max 5000 chars
  5. Sanitize content: strip dangerous HTML, allow safe subset (bold, italic, links, code)
  6. Flood check: query user's most recent comment. If within flood interval (default 15s), reject with `RATE_LIMITED`
  7. If `parentId` provided: validate parent exists on same post, not in spam/trash. Calculate `depth = parent.depth + 1`. If exceeds max depth, clamp and re-parent to deepest allowed ancestor.
  8. If no `parentId`: set `depth = 0`
  9. Run moderation pipeline to determine initial status (see Spam Detection section below)
  10. Override: if user has `moderate_comments`, always auto-approve
  11. Denormalize author data from the auth system profile (`authorName`, `authorAvatarUrl`)
  12. Insert comment record
  13. Store commentMeta: `_user_agent`, `_ip_address`
  14. If status is `"approved"`: increment `posts.commentCount`
  15. Emit event: `comment.created`
- **Events:** `comment.created`
- **Errors:**
  - `UNAUTHORIZED` -- not authenticated
  - `NOT_FOUND` -- post does not exist
  - `FORBIDDEN` -- post commentStatus is closed, or post not published
  - `VALIDATION_ERROR` -- content empty or exceeds 5000 chars
  - `RATE_LIMITED` -- flood protection (include remaining wait time)
  - `NOT_FOUND` -- parent comment does not exist or on different post
  - `INVALID_STATE` -- parent comment is in spam or trash

#### `comment.update` - Update Comment
- **Airtable Record:** `recOQM2OX52x7Ws84`
- **Type:** Mutation
- **Convex Function:** `mutations/comments.update`
- **Auth:** Required (Convex Auth)
- **Capabilities:** Administrator, Editor (`moderate_comments`); any user for own comment within grace period
- **Args:**
  ```typescript
  {
    commentId: v.id("comments"),
    content: v.string(),
  }
  ```
- **Returns:** Updated comment object
- **Behavior:**
  1. Authenticate user
  2. Fetch existing comment
  3. Capability check: own comment within 5min grace period = allowed; own comment past grace period = requires `moderate_comments`; other user's comment = requires `moderate_comments`
  4. Validate content: trim, min 1 char, max 5000 chars
  5. Sanitize content
  6. Set `isEdited = true`, `editedAt = Date.now()`, `updatedAt = Date.now()`
  7. Update comment record
- **Events:** None
- **Errors:**
  - `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN` (lack capability or grace period expired), `VALIDATION_ERROR`, `INVALID_STATE` (comment is trashed or spam)

#### `comment.delete` - Delete Comment
- **Airtable Record:** `recfA5LG6Pxty2CLC`
- **Type:** Mutation
- **Convex Function:** `mutations/comments.delete`
- **Auth:** Required (Convex Auth)
- **Capabilities:** Administrator, Editor (`moderate_comments`)
- **Args:**
  ```typescript
  {
    commentId: v.id("comments"),
    permanent: v.optional(v.boolean()),  // Default: false (soft delete)
  }
  ```
- **Returns:** `{ success: true }`
- **Behavior:**
  1. Authenticate user
  2. Fetch existing comment
  3. Check capability: `moderate_comments`
  4. **Soft delete (default):** Store `previousStatus`, set `status = "trash"`, set `trashedAt = Date.now()`. If was approved, decrement `posts.commentCount`. Schedule auto-purge after 30 days.
  5. **Permanent delete:** Must already be in trash or spam. Delete child comments in trash/spam. Re-parent approved/pending children to this comment's parent or top-level. Delete all commentMeta, commentLikes, commentFlags records. Delete comment record.
- **Events:** `comment.deleted`
- **Errors:**
  - `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN`, `INVALID_STATE` (permanent delete on non-trash/non-spam)

#### `comment.approve` - Approve Comment
- **Airtable Record:** `reco8uPPx4gSG2ndk`
- **Type:** Mutation
- **Convex Function:** `mutations/comments.approve`
- **Auth:** Required (Convex Auth)
- **Capabilities:** Administrator, Editor (`moderate_comments`)
- **Args:**
  ```typescript
  {
    commentId: v.id("comments"),
  }
  ```
- **Returns:** Updated comment object
- **Behavior:**
  1. Authenticate user
  2. Fetch comment
  3. Check `moderate_comments`
  4. Verify comment is `pending` or `spam` (not already approved, not trashed)
  5. Set `status = "approved"`, `moderatedBy`, `moderatedAt`, `updatedAt`
  6. Increment `posts.commentCount`
  7. Emit `comment.approved`
- **Events:** `comment.approved`
- **Errors:** `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN`, `INVALID_STATE` (already approved or trashed)

#### `comment.reject` - Reject (Unapprove) Comment
- **Airtable Record:** `recDfIA5n3J19Cs7g`
- **Type:** Mutation
- **Convex Function:** `mutations/comments.reject`
- **Auth:** Required (Convex Auth)
- **Capabilities:** Administrator, Editor (`moderate_comments`)
- **Args:**
  ```typescript
  {
    commentId: v.id("comments"),
  }
  ```
- **Returns:** Updated comment object
- **Behavior:**
  1. Authenticate user
  2. Fetch comment
  3. Check `moderate_comments`
  4. Verify comment is `pending` or `approved`
  5. If was `approved`, decrement `posts.commentCount`
  6. Set `status = "pending"` (unapprove, return to moderation queue)
  7. Set `moderatedBy`, `moderatedAt`, `updatedAt`
  8. Emit `comment.rejected`
- **Events:** `comment.rejected`
- **Errors:** `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN`, `INVALID_STATE` (already pending, or in trash/spam)

#### `comment.spam` - Mark as Spam
- **Airtable Record:** `recrDesqB2Z7U9rfx`
- **Type:** Mutation
- **Convex Function:** `mutations/comments.spam`
- **Auth:** Required (Convex Auth)
- **Capabilities:** Administrator, Editor (`moderate_comments`)
- **Args:**
  ```typescript
  {
    commentId: v.id("comments"),
  }
  ```
- **Returns:** `{ success: true }`
- **Behavior:**
  1. Authenticate user
  2. Fetch comment
  3. Check `moderate_comments`
  4. Store `previousStatus`
  5. If was `approved`, decrement `posts.commentCount`
  6. Set `status = "spam"`, `moderatedBy`, `moderatedAt`, `updatedAt`
  7. Emit `comment.spammed`
- **Events:** `comment.spammed`
- **Errors:** `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN`, `INVALID_STATE` (already spam)

#### `comment.reply` - Reply to Comment
- **Airtable Record:** `recWjcQ1d2Y77GSpo`
- **Type:** Mutation
- **Convex Function:** `mutations/comments.reply`
- **Auth:** Required (Convex Auth)
- **Capabilities:** Administrator, Editor, Author (`reply_to_comments`)
- **Args:**
  ```typescript
  {
    parentCommentId: v.id("comments"),
    content: v.string(),
  }
  ```
- **Returns:** `{ commentId: Id<"comments">, status: CommentApprovalStatus }`
- **Behavior:**
  1. Fetch parent comment to get `postId`
  2. Delegate to `comment.create` logic with `postId`, `content`, `parentId = parentCommentId`
  3. Emit `comment.replied` event (in addition to `comment.created`)
- **Events:** `comment.created` + `comment.replied`
- **Errors:** Same as `comment.create` plus `NOT_FOUND` (parent comment), `FORBIDDEN` (Contributors/Subscribers cannot reply)

#### `comment.flag` - Flag Comment
- **Airtable Record:** `recwcEMYEpv1kPGnU`
- **Type:** Mutation
- **Convex Function:** `mutations/comments.flag`
- **Auth:** Required (Convex Auth)
- **Capabilities:** All roles (`flag_comments`)
- **Args:**
  ```typescript
  {
    commentId: v.id("comments"),
    reason: v.union(
      v.literal("spam"),
      v.literal("harassment"),
      v.literal("off-topic"),
      v.literal("misinformation"),
      v.literal("other"),
    ),
    details: v.optional(v.string()),  // Required when reason is "other", max 500 chars
  }
  ```
- **Returns:** `{ success: true }`
- **Behavior:**
  1. Authenticate user
  2. Fetch comment, verify `status === "approved"`
  3. Check user hasn't already flagged this comment (`by_user_comment` index)
  4. Users cannot flag their own comments
  5. Validate `details` provided when reason is `"other"`, max 500 chars
  6. Insert `commentFlags` record
  7. Increment `comments.flagCount`
  8. Append reason to `comments.flaggedReasons`
  9. If `flagCount >= threshold` (default 3): auto-set status to `"pending"`, decrement `posts.commentCount`
  10. Emit `comment.flagged`
- **Events:** `comment.flagged`
- **Errors:** `UNAUTHORIZED`, `NOT_FOUND`, `INVALID_STATE` (not approved), `ALREADY_FLAGGED`, `FORBIDDEN` (flagging own comment), `VALIDATION_ERROR` (missing details for "other")

#### `comment.like` - Like/Unlike Comment (Toggle)
- **Airtable Record:** `recTs5W5ejULpiqmn`
- **Type:** Mutation
- **Convex Function:** `mutations/comments.like`
- **Auth:** Required (Convex Auth)
- **Capabilities:** All roles (`like_comments`)
- **Args:**
  ```typescript
  {
    commentId: v.id("comments"),
  }
  ```
- **Returns:** `{ liked: boolean, likeCount: number }`
- **Behavior:**
  1. Authenticate user
  2. Fetch comment, verify `status === "approved"`
  3. Query `commentLikes` for existing like by this user
  4. If not liked: insert `commentLikes` record, increment `comments.likeCount`
  5. If already liked: delete `commentLikes` record, decrement `comments.likeCount`
- **Events:** None (lightweight interaction)
- **Errors:** `UNAUTHORIZED`, `NOT_FOUND`, `INVALID_STATE` (not approved)

#### `comment.bulk_approve` - Bulk Approve
- **Airtable Record:** `rec6pAne9XlQ3SAm0`
- **Type:** Mutation
- **Convex Function:** `mutations/comments.bulkApprove`
- **Auth:** Required (Convex Auth)
- **Capabilities:** Administrator, Editor (`moderate_comments`)
- **Args:**
  ```typescript
  {
    commentIds: v.array(v.id("comments")),  // Max 100
  }
  ```
- **Returns:** `{ approved: number, skipped: number, errors: number }`
- **Behavior:** For each ID, execute approve logic. Skip already-approved or not-found.
- **Events:** `comment.approved` (one per approved comment)
- **Errors:** `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` (empty or >100 items)

#### `comment.bulk_delete` - Bulk Delete
- **Airtable Record:** `recMalvy428xbfsLX`
- **Type:** Mutation
- **Convex Function:** `mutations/comments.bulkDelete`
- **Auth:** Required (Convex Auth)
- **Capabilities:** Administrator, Editor (`moderate_comments`)
- **Args:**
  ```typescript
  {
    commentIds: v.array(v.id("comments")),  // Max 100
    permanent: v.optional(v.boolean()),
  }
  ```
- **Returns:** `{ deleted: number, skipped: number, errors: number }`
- **Behavior:** For each ID, execute delete logic (soft or permanent).
- **Events:** `comment.deleted` (one per deleted comment)
- **Errors:** `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` (empty or >100 items)

#### `comment.bulk_spam` - Bulk Spam
- **Airtable Record:** `rec5axkJhajqNPGJ5`
- **Type:** Mutation
- **Convex Function:** `mutations/comments.bulkSpam`
- **Auth:** Required (Convex Auth)
- **Capabilities:** Administrator, Editor (`moderate_comments`)
- **Args:**
  ```typescript
  {
    commentIds: v.array(v.id("comments")),  // Max 100
  }
  ```
- **Returns:** `{ spammed: number, skipped: number, errors: number }`
- **Behavior:** For each ID, execute spam logic. Skip already-spammed.
- **Events:** `comment.spammed` (one per spammed comment)
- **Errors:** `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` (empty or >100 items)

#### `comment.restore` - Restore from Trash
- **Type:** Mutation
- **Convex Function:** `mutations/comments.restore`
- **Auth:** Required (Convex Auth)
- **Capabilities:** Administrator, Editor (`moderate_comments`)
- **Args:**
  ```typescript
  {
    commentId: v.id("comments"),
  }
  ```
- **Returns:** Updated comment object
- **Behavior:**
  1. Authenticate user
  2. Fetch comment
  3. Check `moderate_comments`
  4. Verify comment is in `"trash"` status
  5. Restore status to `previousStatus` (or `"pending"` if not set)
  6. Clear `previousStatus` and `trashedAt`
  7. Cancel scheduled auto-purge
  8. If restored status is `"approved"`, increment `posts.commentCount`
  9. Update `updatedAt`
- **Events:** None (restore is an undo operation)
- **Errors:** `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN`, `INVALID_STATE` (not in trash)

### Queries

#### `comments.get` - Get Single Comment
- **Type:** Query
- **Convex Function:** `queries/comments.get`
- **Auth:** Required
- **Args:** `{ commentId: v.id("comments") }`
- **Returns:** Comment object with author info, post title, parent comment preview, current user's like status, or `null`
- **Behavior:**
  1. Fetch comment by ID
  2. Visibility checks: `approved` = visible to all; `pending` = visible to author + moderators; `spam`/`trash` = moderators only
  3. Include denormalized data and `isLikedByMe` boolean
- **Filters:** None (single record)

#### `comments.list` - List Comments (Admin)
- **Type:** Query
- **Convex Function:** `queries/comments.list`
- **Auth:** Required
- **Args:**
  ```typescript
  {
    status: v.optional(commentApprovalStatus),
    postId: v.optional(v.id("posts")),
    authorId: v.optional(v.string()),
    search: v.optional(v.string()),
    orderBy: v.optional(v.union(v.literal("createdAt"), v.literal("updatedAt"))),
    orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  }
  ```
- **Returns:** `{ comments: Comment[], total: number, page: number, perPage: number, totalPages: number }`
- **Behavior:**
  1. Authenticate, require `moderate_comments` for pending/spam/trash tabs (non-moderators only see own + approved)
  2. Apply filters
  3. Sort by `createdAt` descending (default)
  4. Paginate (default 20 per page)
- **Pagination:** Offset-based (page number)

#### `comments.forPost` - Get Threaded Comments for Post (Website)
- **Type:** Query
- **Convex Function:** `queries/comments.forPost`
- **Auth:** Optional (public read, auth for like status)
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
    order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  }
  ```
- **Returns:** `{ comments: CommentTreeNode[], total: number, page: number, perPage: number, totalPages: number }`
- **Behavior:**
  1. Verify post exists and is published
  2. Query `status === "approved"` comments
  3. Build threaded tree structure
  4. Apply Discussion Settings for ordering
  5. Paginate top-level comments (replies always shown under parent)
  6. Include: author info, depth, like count, `isLikedByMe`, reply count, `isEdited`

#### `comments.counts` - Comment Counts by Status
- **Type:** Query
- **Convex Function:** `queries/comments.counts`
- **Auth:** Required
- **Args:** None
- **Returns:** `{ all: number, approved: number, pending: number, spam: number, trash: number, mine: number }`
- **Behavior:** Count comments by status. `all` = approved + pending. `mine` = current user's non-trash comments.

#### `comments.pendingCount` - Pending Comment Count
- **Type:** Query
- **Convex Function:** `queries/comments.pendingCount`
- **Auth:** Required
- **Args:** None
- **Returns:** `number`
- **Behavior:** Count of comments with `status === "pending"`. Used for admin sidebar badge.

---

## Events

### `comment.created`
- **Airtable Record:** `rec0VOMbBCyIgXtI0`
- **Type:** Comment
- **Triggered By:** `comment.create` mutation
- **Payload:**
  ```typescript
  {
    commentId: Id<"comments">,
    postId: Id<"posts">,
    authorId: string,         // user identifier
    content: string,          // Full comment content
  }
  ```
- **Subscribers:**
  - Email: "New Comment on Your Post" (immediate, to post author), "Comment Pending Moderation" (batched, to admins)
  - Site: "New Comment" (persistent, to post author), "Pending Comments" (persistent, to admins)
  - Audit Log: Yes

### `comment.approved`
- **Airtable Record:** `recsrZg8gOASjrFW1`
- **Type:** Comment
- **Triggered By:** `comment.approve` mutation
- **Payload:**
  ```typescript
  {
    commentId: Id<"comments">,
    postId: Id<"posts">,
    approvedBy: string,       // user identifier of moderator
  }
  ```
- **Subscribers:**
  - Email: "Comment Approved" (batched, to comment author)
  - Site: "Comment Approved" (non-persistent toast, to comment author)
  - Audit Log: Yes

### `comment.rejected`
- **Airtable Record:** `rec9ljLgY1cbu2FWR`
- **Type:** Comment
- **Triggered By:** `comment.reject` mutation
- **Payload:**
  ```typescript
  {
    commentId: Id<"comments">,
    postId: Id<"posts">,
    rejectedBy: string,       // user identifier of moderator
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: "Comment Rejected" (non-persistent toast, to comment author)
  - Audit Log: Yes

### `comment.spammed`
- **Airtable Record:** `recn7qAJgo197edmT`
- **Type:** Comment
- **Triggered By:** `comment.spam` mutation
- **Payload:**
  ```typescript
  {
    commentId: Id<"comments">,
    postId: Id<"posts">,
  }
  ```
- **Subscribers:**
  - Email: None (do not notify spammers)
  - Site: None
  - Audit Log: Yes

### `comment.deleted`
- **Airtable Record:** `rec3bpYJKUmbZrczw`
- **Type:** Comment
- **Triggered By:** `comment.delete` mutation
- **Payload:**
  ```typescript
  {
    commentId: Id<"comments">,
    postId: Id<"posts">,
    deletedBy: string,        // user identifier
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: None
  - Audit Log: Yes

### `comment.replied`
- **Airtable Record:** `rec0054cN4prUNlz0`
- **Type:** Comment
- **Triggered By:** `comment.reply` mutation
- **Payload:**
  ```typescript
  {
    commentId: Id<"comments">,        // The new reply comment
    parentCommentId: Id<"comments">,  // The comment being replied to
    postId: Id<"posts">,
    authorId: string,                 // user identifier of replier
  }
  ```
- **Subscribers:**
  - Email: "Comment Reply Notification" (immediate, to parent comment author)
  - Site: "Comment Reply" (persistent, to parent comment author)
  - Audit Log: Yes

### `comment.flagged`
- **Airtable Record:** `recO1363G3G1gFUx0`
- **Type:** Comment
- **Triggered By:** `comment.flag` mutation
- **Payload:**
  ```typescript
  {
    commentId: Id<"comments">,
    postId: Id<"posts">,
    flaggedBy: string,        // user identifier of flagger
    reason: string,           // Flag reason
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: "Comment Flagged" (persistent warning, to admins)
  - Audit Log: Yes

---

## Admin Routes & UI

### All Comments (`/admin/comments`)
- **Airtable Record:** `recICHVhcWX7Dz162`
- **Purpose:** Main comment management interface with status-based tabs, search, and bulk actions
- **WordPress Equivalent:** `edit-comments.php`
- **Roles:** Administrator, Editor
- **Layout:** Standard admin list table with status filter tabs

**Status Filter Tabs:**
```
All (XX) | Pending (XX) | Approved (XX) | Spam (XX) | Trash (XX) | Mine (XX)
```
Counts update in real-time. Active tab is highlighted.

**Columns:**

| Column | Width | Content | Sortable |
|--------|-------|---------|----------|
| Checkbox | 40px | Select for bulk actions | No |
| Author | 200px | Avatar (32px) + name + role badge | No |
| Comment | flex | Comment excerpt (100 chars) + "In Response To: [Post Title]" link + submitted date | No |
| Status | 100px | Color-coded status badge | No |
| Date | 150px | "X time ago" with full date on hover tooltip | Yes |

**Row Actions (on hover):**
- Approve (when pending/spam)
- Unapprove (when approved)
- Reply -- opens inline reply form below the row
- Quick Edit -- inline textarea + status dropdown
- Edit -- navigates to `/admin/comments/$commentId/edit`
- Spam (when not spam)
- Trash (when not trash)
- Restore (Trash tab only)
- Delete Permanently (Trash tab only, confirmation dialog)

**Bulk Actions Dropdown:**
- All/Pending/Approved tabs: Approve, Unapprove, Mark as Spam, Move to Trash
- Spam tab: Not Spam (restore to pending), Delete Permanently
- Trash tab: Restore, Delete Permanently

**Empty Trash Button:** Shown in Trash tab header. Permanently deletes all trashed comments (confirmation dialog).

**Search Box:** Searches comment content and author name. Debounced 300ms.

**Inline Reply Form:** Appears below clicked comment row. Textarea + Reply + Cancel buttons. Reply is always auto-approved (moderator replying).

- **Key Components:**
  - `CommentListTable` -- main list table with row actions
  - `CommentStatusTabs` -- status filter tabs with counts
  - `CommentBulkActions` -- bulk action dropdown
  - `CommentInlineReply` -- inline reply form
  - `CommentQuickEdit` -- inline edit form
  - `CommentSearchBox` -- debounced search input
- **Data Requirements:** `comments.list` query, `comments.counts` query
- **Real-Time:** New comments appear live, status changes reflect immediately, counts update

### Pending Comments (`/admin/comments/pending`)
- **Airtable Record:** `recvOib1fzyZWnXUi`
- **Purpose:** Convenience route pre-filtered to Pending tab
- **WordPress Equivalent:** `edit-comments.php?comment_status=moderated`
- **Roles:** Administrator, Editor
- **Layout:** Same as All Comments, but with Pending tab active by default
- **Admin Sidebar Menu:**
  ```
  Comments (XX)           <- Pending count badge
    All Comments
    Pending (XX)
  ```

### Edit Comment (`/admin/comments/$commentId/edit`)
- **Airtable Record:** `rec0hxt3P6nuTRBq4`
- **Purpose:** Full-page comment editor for moderators
- **WordPress Equivalent:** `comment.php`
- **Roles:** Administrator, Editor
- **Layout:** Full-page form (NOT a modal -- per ConvexPress design rules)
- **Key Components:**
  - `CommentEditForm` -- main form with content editor, status dropdown
  - `CommentAuthorInfo` -- read-only author display (avatar, name, email, role badge)
  - `CommentPostInfo` -- "In Response To" section with post title link
  - `CommentModerationInfo` -- shows who moderated and when
  - `CommentFlagsList` -- list of flags with dismiss button
- **Sections:**
  - Header: page title, back link, Update button (primary), Trash button (destructive)
  - Author Information: avatar (64px), name, email, role badge, submission date
  - In Response To: post title link, view post link, parent comment info if reply
  - Comment Content: textarea with basic rich text toolbar, character count (max 5000)
  - Status: dropdown (Approved, Pending, Spam) with color badge
  - Moderation Info: who/when (if moderated)
  - Flags: list with dismiss button (if any)
- **Data Requirements:** `comments.get` query, post data for "In Response To"
- **Real-Time:** Content/status changes reflect if another admin edits simultaneously

### Comments API (`/api/admin/comments`)
- **Airtable Record:** `rec7zm1SBcR68Rlr2`
- **Purpose:** REST API endpoint for comment operations
- **Roles:** Administrator

---

## Website Routes

### Single Post Comment Section (`/blog/$slug`)
- **Airtable Record:** `recL3ul2UJeMwT9XF`
- **Purpose:** Threaded comment display and form below published post content
- **SEO:** Comments contribute to page content for SEO. Structured data (`Comment` schema) can be added. Comment count in meta.
- **Data Requirements:** `comments.forPost` query, `comments.like` mutation, `comments.flag` mutation, `comments.create`/`comments.reply` mutations
- **Layout:**
  - Comment count header: `"3 Comments on 'Post Title'"`
  - Comment form: user avatar + textarea + "Post Comment" button (disabled when empty)
  - If `commentStatus === "closed"`: "Comments are closed." message
  - If not authenticated: "Log in to leave a comment." with login link
  - Threaded comment list: each comment shows avatar, author name, role badge (Editor+), time ago, content, like button (heart icon + count), reply button, flag button (... overflow menu), edited indicator
  - Threading indentation: 40px per depth level, max from Discussion Settings
  - Inline reply form on "Reply" click
  - Pagination: "Older/Newer Comments" navigation
  - Real-time: new comments appear live, like counts update, moderated comments disappear
  - Pending notice: "Your comment is awaiting moderation." (shown only to comment author)
- **Caching:** SSR for initial load, Convex subscription for real-time updates after hydration

### My Comments (`/dashboard/comments`)
- **Airtable Record:** `rech5KtGgFoYLa5J2`
- **Purpose:** User's personal comment history
- **SEO:** Not applicable (authenticated page, noindex)
- **Data Requirements:** `comments.list` query filtered by `authorId = currentUser`
- **Layout:**
  - Columns: Comment (excerpt + "on [Post Title]" link), Status (badge), Date, Actions (View, Edit if grace period, Delete)
  - Filters: Status (All/Approved/Pending), Sort (Newest/Oldest)
  - Empty state: "You haven't made any comments yet. Start by reading a post and sharing your thoughts!"

---

## Notifications

### Email Notifications

| Name | Airtable Record | Event | Recipients | Priority | Subject |
|------|-----------------|-------|------------|----------|---------|
| New Comment on Your Post | `recw1hNWy5xiePvs4` | `comment.created` | Post Author | Immediate | `New comment on "{post_title}"` |
| Comment Pending Moderation | `recWtzmA8D756jvvJ` | `comment.created` | Admins | Batched | `New comment awaiting moderation` |
| Comment Reply Notification | `recxNEMAfxB5eLNwE` | `comment.replied` | Parent Comment Author | Immediate | `Someone replied to your comment` |
| Comment Approved | `recDPX9QnMMji9P9u` | `comment.approved` | Comment Author | Batched | `Your comment was approved` |
| Comment Digest | `recBOREoGdBjCjZW7` | Scheduled (weekly) | Post Authors | Digest | `Comments this week on your posts` |

**Template Variables (common):** `{site_name}`, `{site_url}`, `{post_title}`, `{post_url}`, `{comment_author}`, `{comment_content}` (truncated 200 chars), `{comment_date}`, `{moderate_url}`, `{comment_url}`

**Reply-specific:** `{parent_author}`, `{parent_content}`

**Digest-specific:** `{comment_count}`, `{post_count}`, `{comment_list}`

All emails include unsubscribe link. Preferences stored in user notification settings.

### Site Notifications

| Name | Airtable Record | Event | Type | Persistent | Recipients |
|------|-----------------|-------|------|-----------|------------|
| New Comment | `recc7hPo0d8M9aclS` | `comment.created` | Info | Yes | Post Author |
| Pending Comments | `rec5GQVLC31x503gA` | `comment.created` | Info | Yes | Admins |
| Comment Reply | `recApOVJRKGVT4nC1` | `comment.replied` | Info | Yes | Parent Comment Author |
| Comment Approved | `recyWlaitMn7EvMCF` | `comment.approved` | Success | No (toast) | Comment Author |
| Comment Rejected | `recN5hWFzgnbW1O95` | `comment.rejected` | Warning | No (toast) | Comment Author |
| Comment Flagged | `recl5uRc4Mw97U5Vb` | `comment.flagged` | Warning | Yes | Admins |

**Delivery:** Persistent notifications appear in notification bell dropdown. Non-persistent appear as toasts (auto-dismiss 5s) and are logged. All delivered via Convex subscriptions.

---

## Role & Capability Matrix

| Capability | Admin | Editor | Author | Contributor | Subscriber |
|-----------|-------|--------|--------|-------------|-----------|
| `create_comments` | Yes | Yes | Yes | Yes | Yes |
| `reply_to_comments` | Yes | Yes | Yes | No | No |
| `moderate_comments` | Yes | Yes | No | No | No |
| `like_comments` | Yes | Yes | Yes | Yes | Yes |
| `flag_comments` | Yes | Yes | Yes | Yes | Yes |
| `edit_own_comments` | Yes | Yes | Yes | Yes | Yes |
| `delete_own_comments` | Yes | Yes | Yes | No | No |

### Meta Capability: `edit_comment`

When checking `edit_comment` for a specific comment ID:

1. If user is the comment author AND within grace period (default 5 min): requires `edit_own_comments`
2. If user is the comment author AND past grace period: requires `moderate_comments`
3. If user is NOT the comment author: requires `moderate_comments`

### Action-to-Capability Mapping

| Action | Required Capability |
|--------|-------------------|
| `comment.create` | `create_comments` |
| `comment.update` | `edit_own_comments` (own, grace period) OR `moderate_comments` |
| `comment.delete` | `moderate_comments` |
| `comment.approve` | `moderate_comments` |
| `comment.reject` | `moderate_comments` |
| `comment.spam` | `moderate_comments` |
| `comment.reply` | `reply_to_comments` |
| `comment.flag` | `flag_comments` |
| `comment.like` | `like_comments` |
| `comment.bulk_approve` | `moderate_comments` |
| `comment.bulk_delete` | `moderate_comments` |
| `comment.bulk_spam` | `moderate_comments` |
| `comment.restore` | `moderate_comments` |

---

## Spam Detection & Moderation Pipeline

The moderation pipeline runs on every `comment.create`. Order of priority:

```
1. Is commenter a moderator (Admin/Editor with moderate_comments)?
   -> YES: Auto-approve. Skip all checks.
   -> NO: Continue.

2. Does content or author name match any disallowed_keys (case-insensitive, whole word)?
   -> YES: Mark as SPAM.
   -> NO: Continue.

3. Is comment_moderation setting true (all comments require manual approval)?
   -> YES: Mark as PENDING.
   -> NO: Continue.

4. Does content or author name match any moderation_keys?
   -> YES: Mark as PENDING.
   -> NO: Continue.

5. Does content contain more than comment_max_links URLs (default 2)?
   -> YES: Mark as PENDING.
   -> NO: Continue.

6. Is comment_previously_approved true AND author has no prior approved comments?
   -> YES: Mark as PENDING.
   -> NO: Continue.

7. All checks passed: Mark as APPROVED.
```

**Word matching:** Case-insensitive, whole word (not substring), matches against content + author name. Entries can contain spaces for multi-word phrases.

**Flood prevention:** Minimum interval between comments (default 15s). Returns `RATE_LIMITED` error with remaining wait time.

---

## Discussion Settings Reference

These settings are stored in the Settings System and read at runtime. They correspond to WordPress `Settings > Discussion`.

| Setting Key | Type | Default | Description |
|-------------|------|---------|-------------|
| `default_comment_status` | `"open" \| "closed"` | `"open"` | Default for new posts |
| `close_comments_days_old` | `number \| null` | `null` | Auto-close after N days |
| `comment_moderation` | `boolean` | `false` | Require manual approval for all |
| `comment_previously_approved` | `boolean` | `true` | Auto-approve returning commenters |
| `comment_max_links` | `number` | `2` | Hold if N+ links |
| `moderation_keys` | `string` | `""` | Newline-separated hold word list |
| `disallowed_keys` | `string` | `""` | Newline-separated spam word list |
| `thread_comments` | `boolean` | `true` | Enable threading |
| `thread_comments_depth` | `number` | `5` | Max depth (1-10) |
| `page_comments` | `boolean` | `false` | Enable pagination |
| `comments_per_page` | `number` | `50` | Top-level per page |
| `default_comments_page` | `"newest" \| "oldest"` | `"oldest"` | Which page to show first |
| `comment_order` | `"asc" \| "desc"` | `"asc"` | Display order |
| `comment_flood_interval` | `number` | `15` | Seconds between comments |
| `comment_flag_threshold` | `number` | `3` | Flags before auto-hold |
| `comment_edit_grace_period` | `number` | `300` | Seconds for self-edit (5 min) |

---

## Dashboard Integration

### Pending Comment Count Badge
Admin sidebar "Comments" menu item shows a red badge with pending count. Reactive via Convex subscription (`comments.pendingCount`).

### Recent Comments Dashboard Widget
Shows most recent 5 comments across all posts:
- Comment author avatar + name
- Comment excerpt (50 chars)
- Post title link
- Time ago
- Quick actions: Approve / Spam / Trash

### At a Glance Widget
- "X Comments" (total approved)
- "X Pending" (with link to pending queue)

---

## Dependencies

### Depends On

| System | Classification | What It Provides |
|--------|---------------|-----------------|
| **Post System** | **Hard** | `posts` table, `commentStatus` field, `commentCount` field, post existence and status validation. Comments cannot exist without posts. |
| **Auth System** | **Hard** | Convex Auth authentication, user identity (`ctx.auth.getUserIdentity()`), user profile data (name, avatar). All comment operations require auth. |
| **Role & Capability System** | **Hard** | `currentUserCan()` checks, capability definitions (`create_comments`, `moderate_comments`, etc.), role-based access control. Every mutation checks capabilities. |
| **Event Dispatcher System** | **Hard** | `events.emit()` function for all 7 comment events. Without this, no notifications or audit logging occurs. |
| **Settings System** | **Soft** | Discussion settings (moderation rules, threading config, flood interval). System works with hardcoded defaults if Settings System is unavailable. |

### Depended On By

| System | Classification | What It Needs |
|--------|---------------|--------------|
| **Dashboard System** | **Soft** | Pending comment count for sidebar badge, recent comments for dashboard widget, total counts for At a Glance widget |
| **Email Notification System** | **Soft** | Subscribes to `comment.created`, `comment.replied`, `comment.approved` events for email delivery |
| **Site Notification System** | **Soft** | Subscribes to all comment events for real-time notifications |
| **Audit Log System** | **Soft** | Subscribes to all comment events for activity tracking |
| **Search System** | **Soft** | Comment content for full-text search indexing |

---

## Implementation Checklist

### Backend (`ConvexPress-Admin/packages/backend/`)
- [ ] `convex/comments/schema.ts` -- 4 tables: `comments`, `commentMeta`, `commentLikes`, `commentFlags`
- [ ] `convex/comments/queries.ts` -- 5 queries: `get`, `list`, `forPost`, `counts`, `pendingCount`
- [ ] `convex/comments/mutations.ts` -- 13 mutations: `create`, `update`, `delete`, `approve`, `reject`, `spam`, `reply`, `flag`, `like`, `bulkApprove`, `bulkDelete`, `bulkSpam`, `restore`
- [ ] `convex/comments/helpers.ts` -- Shared logic: moderation pipeline, content sanitization, flood check, tree builder, denormalization helpers
- [ ] `convex/comments/events.ts` -- Event emission helpers for all 7 events
- [ ] `convex/comments/scheduled.ts` -- Scheduled function for 30-day trash auto-purge

### Admin Frontend (`ConvexPress-Admin/apps/web/`)
- [ ] `src/routes/admin/comments/index.tsx` -- All Comments list page
- [ ] `src/routes/admin/comments/pending.tsx` -- Pending Comments (pre-filtered)
- [ ] `src/routes/admin/comments/$commentId/edit.tsx` -- Edit Comment page
- [ ] `src/components/comments/CommentListTable.tsx` -- List table with row actions
- [ ] `src/components/comments/CommentStatusTabs.tsx` -- Status filter tabs with counts
- [ ] `src/components/comments/CommentBulkActions.tsx` -- Bulk action dropdown
- [ ] `src/components/comments/CommentInlineReply.tsx` -- Inline reply form
- [ ] `src/components/comments/CommentQuickEdit.tsx` -- Inline quick edit form
- [ ] `src/components/comments/CommentSearchBox.tsx` -- Debounced search input
- [ ] `src/components/comments/CommentEditForm.tsx` -- Full edit form
- [ ] `src/components/comments/CommentAuthorInfo.tsx` -- Author info display
- [ ] `src/components/comments/CommentFlagsList.tsx` -- Flags list with dismiss
- [ ] `src/components/dashboard/RecentCommentsWidget.tsx` -- Dashboard widget

### Website Frontend (`ConvexPress-Website/apps/web/`)
- [ ] `src/components/comments/CommentSection.tsx` -- Main container for post comment section
- [ ] `src/components/comments/CommentForm.tsx` -- New comment form
- [ ] `src/components/comments/CommentThread.tsx` -- Threaded comment tree display
- [ ] `src/components/comments/CommentItem.tsx` -- Individual comment with actions
- [ ] `src/components/comments/CommentLikeButton.tsx` -- Like/unlike toggle with optimistic update
- [ ] `src/components/comments/CommentFlagDialog.tsx` -- Flag reason dialog
- [ ] `src/components/comments/CommentReplyForm.tsx` -- Inline reply form
- [ ] `src/components/comments/CommentPagination.tsx` -- Comment page navigation
- [ ] `src/routes/dashboard/comments.tsx` -- My Comments page

---

## Edge Cases & Gotchas

1. **Orphaned replies when parent is permanently deleted:** When a parent comment is permanently deleted, its approved/pending child comments must be re-parented to the parent's parent (or become top-level). Only trash/spam children are cascade-deleted. Never leave dangling `parentId` references.

2. **Depth clamping on deep replies:** When a reply would exceed `thread_comments_depth`, the comment must be clamped to the max depth and its `parentId` set to the deepest allowed ancestor -- not rejected. This requires walking up the parent chain.

3. **Post commentCount consistency:** The `posts.commentCount` field is denormalized and must be updated atomically within every mutation that changes a comment's effective visibility (approve = +1, reject from approved = -1, trash approved = -1, spam approved = -1, restore to approved = +1). Missing any of these transitions causes count drift.

4. **Flood check race condition:** Two near-simultaneous comment submissions from the same user could both pass the flood check if queried before either is committed. Convex's transactional guarantees handle this -- both mutations see a consistent snapshot, and Convex will retry if a conflict occurs.

5. **Like toggle idempotency:** The like mutation is a toggle -- calling it twice returns to the original state. The `by_user_comment` index serves as the "already liked?" check. The query and the insert/delete must be in the same Convex mutation for transactional safety.

6. **Flag threshold auto-moderation:** When `flagCount` crosses the threshold, the comment status changes from `approved` to `pending`. This must also decrement `posts.commentCount` and should emit a `comment.flagged` event (not a separate moderation event).

7. **Grace period calculation:** The edit grace period uses `Date.now() - comment.createdAt` in milliseconds, compared against `comment_edit_grace_period * 1000`. Edge case: if the Setting is changed while a comment is within its window, use the setting value at check time (not at creation time).

8. **Moderator auto-approve bypass:** When a user with `moderate_comments` creates a comment, the entire moderation pipeline is skipped and the comment is always set to `"approved"`. This means moderators' comments containing blocked words are still published.

9. **Bulk operation limits:** All bulk mutations enforce a max of 100 items per request. The frontend should batch larger selections into multiple calls. Each item in a bulk operation is processed independently -- failures on individual items don't roll back successful ones.

10. **Trashed comment auto-purge scheduling:** When a comment is trashed, a Convex scheduled function is registered to permanently delete it after 30 days. When a comment is restored from trash, this scheduled function must be cancelled. Track the scheduled function ID on the comment or in commentMeta.

11. **Real-time comment visibility:** When a comment is moderated (spam/trash) while a user is viewing the post, the comment should disappear from their view via the Convex subscription. But pending comments shown to their author (with "awaiting moderation" banner) should also disappear if rejected by a moderator.

12. **Comment on non-existent parent:** If a parent comment is deleted between the time a user clicks Reply and submits their reply, the `comment.reply` mutation should fail with `NOT_FOUND` for the parent. Do not silently convert to a top-level comment.

13. **Content sanitization XSS prevention:** Comment content must be sanitized before storage, not just before display. Strip `<script>`, event handlers (`onclick`, `onerror`), `javascript:` URLs, and other XSS vectors. Allow safe subset: `<b>`, `<i>`, `<a href>`, `<code>`, `<pre>`.

14. **User avatar staleness:** Author name and avatar are denormalized at comment creation. If a user updates their Convex Auth profile, existing comments show old data. Consider a background job to periodically refresh denormalized author data, or accept eventual staleness as a tradeoff.

15. **Discussion Settings not yet implemented:** The Comment System reads Discussion Settings from the Settings System. If the Settings System hasn't been implemented yet, all setting reads should fall back to hardcoded defaults (see the Discussion Settings Reference table above for defaults).

---

## WordPress Functions Reference

| WordPress Function | ConvexPress Equivalent | Notes |
|-------------------|----------------------|-------|
| `wp_new_comment()` | `mutations/comments.create` | Includes moderation pipeline |
| `wp_insert_comment()` | Internal helper in `comments.create` | Low-level insert, bypasses moderation |
| `wp_update_comment()` | `mutations/comments.update` | With grace period and capability check |
| `wp_delete_comment()` | `mutations/comments.delete` | Supports soft (trash) and permanent delete |
| `wp_trash_comment()` | `mutations/comments.delete` with `permanent: false` | Soft delete to trash |
| `wp_spam_comment()` | `mutations/comments.spam` | Marks as spam |
| `wp_set_comment_status()` | `mutations/comments.approve` / `comments.reject` | Separate mutations per status transition |
| `get_comments()` | `queries/comments.list` | With filters, pagination, sorting |
| `get_comment()` | `queries/comments.get` | Single comment by ID |
| `wp_count_comments()` | `queries/comments.counts` | Returns counts per status |
| `get_comment_count()` | Denormalized on `posts.commentCount` | No query needed -- read from post |
| `comment_form()` | `CommentForm.tsx` component | Frontend component |
| `wp_list_comments()` | `CommentThread.tsx` component | Threaded display |
| `get_comment_reply_link()` | Part of `CommentItem.tsx` | Reply button in each comment |
| `check_comment_flood_db()` | Flood check in `comments.create` | Query-based flood prevention |
| `wp_check_comment_disallowed_list()` | Moderation pipeline step 2 | Disallowed keys check |
| `wp_allow_comment()` | Moderation pipeline | Full moderation decision logic |

---

## Implementation Patterns

### Threaded Comment Tree Builder (Frontend Utility)

```typescript
interface CommentTreeNode extends Comment {
  replies: CommentTreeNode[];
}

function buildCommentTree(comments: Comment[]): CommentTreeNode[] {
  const map = new Map<string, CommentTreeNode>();
  const roots: CommentTreeNode[] = [];

  // First pass: create nodes
  for (const comment of comments) {
    map.set(comment._id, { ...comment, replies: [] });
  }

  // Second pass: build tree
  for (const comment of comments) {
    const node = map.get(comment._id)!;
    if (comment.parentId) {
      const parent = map.get(comment.parentId);
      if (parent) {
        parent.replies.push(node);
      } else {
        roots.push(node); // Orphaned reply becomes top-level
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}
```

### Optimistic Like Update Pattern

```typescript
const like = useMutation(api.comments.like).withOptimisticUpdate(
  (localStore, { commentId }) => {
    const comment = localStore.getQuery(api.comments.get, { commentId });
    if (comment) {
      localStore.setQuery(api.comments.get, { commentId }, {
        ...comment,
        likeCount: comment.isLikedByMe
          ? comment.likeCount - 1
          : comment.likeCount + 1,
        isLikedByMe: !comment.isLikedByMe,
      });
    }
  },
);
```
