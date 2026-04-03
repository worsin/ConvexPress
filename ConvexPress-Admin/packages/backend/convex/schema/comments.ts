/**
 * Comment System - Schema
 *
 * Four tables supporting the full comment lifecycle:
 *   - `comments`     - Primary comment storage (replaces WordPress wp_comments)
 *   - `commentMeta`  - Extensible key-value metadata per comment (replaces wp_commentmeta)
 *   - `commentLikes` - Like/unlike tracking per user-comment pair
 *   - `commentFlags` - Flag/report tracking per user-comment pair
 *
 * ConvexPress diverges from WordPress in several key ways:
 *   - All commenters must be authenticated (no anonymous comments)
 *   - Built-in like/unlike toggle (commentLikes table)
 *   - Built-in flagging for review (commentFlags table)
 *   - Real-time via Convex subscriptions
 *   - No pingbacks/trackbacks (obsolete protocol)
 *
 * Key design decisions:
 *   - `authorId` is a user identifier string (not a Convex ID) to support multiple auth sources
 *   - Author name/avatar are denormalized at creation time for fast reads
 *   - `likeCount` and `flagCount` are denormalized on the comments table
 *   - Threading via `parentId` self-reference with configurable max depth
 *   - `posts.commentCount` is denormalized and maintained by Comment System mutations
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators (used by schema and functions) ───────────────────────

export const commentApprovalStatusValidator = v.union(
  v.literal("approved"),
  v.literal("pending"),
  v.literal("spam"),
  v.literal("trash"),
);

export const flagReasonValidator = v.union(
  v.literal("spam"),
  v.literal("harassment"),
  v.literal("off-topic"),
  v.literal("misinformation"),
  v.literal("other"),
);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const commentTables = {
  /**
   * Primary comment storage table.
   *
   * WordPress equivalent: wp_comments
   *
   * Indexes support:
   *   - Admin "All Comments" list (filtered by status, post, author)
   *   - Website threaded comment display (by post + parent)
   *   - Moderation queue (pending, spam tabs)
   *   - User's comment history (My Comments page)
   *   - Flagged comments for review
   *   - Trash auto-purge
   */
  comments: defineTable({
    // ── Core Fields ──────────────────────────────────────────────────────
    postId: v.id("posts"), // comment_post_ID - The post this comment belongs to
    content: v.string(), // comment_content - The comment text (plain text or limited markdown)
    status: commentApprovalStatusValidator, // comment_approved - Moderation status

    // ── Authorship ───────────────────────────────────────────────────────
    authorId: v.string(), // User identifier string (required - no anonymous comments)
    authorName: v.string(), // Denormalized display name
    authorAvatarUrl: v.optional(v.string()), // Denormalized avatar URL

    // ── Threading ────────────────────────────────────────────────────────
    parentId: v.optional(v.id("comments")), // Parent comment ID for replies (undefined = top-level)
    depth: v.number(), // Computed depth in thread (0 = top-level, max from settings)

    // ── Engagement ───────────────────────────────────────────────────────
    likeCount: v.number(), // Denormalized count of likes
    flagCount: v.number(), // Denormalized count of flags

    // ── Moderation Metadata ──────────────────────────────────────────────
    moderatedBy: v.optional(v.string()), // User identifier of moderator who acted
    moderatedAt: v.optional(v.number()), // When moderation action was taken
    flaggedReasons: v.optional(v.array(v.string())), // Collected flag reasons

    // ── Edit History ─────────────────────────────────────────────────────
    isEdited: v.boolean(), // Whether the comment has been edited after creation
    editedAt: v.optional(v.number()), // When last edited

    // ── Trash ────────────────────────────────────────────────────────────
    previousStatus: v.optional(v.string()), // Status before trashing (for restore)
    trashedAt: v.optional(v.number()), // When moved to trash (for auto-purge)

    // ── Timestamps ───────────────────────────────────────────────────────
    createdAt: v.number(), // Creation timestamp (ms) - immutable
    updatedAt: v.number(), // Last modification timestamp (ms)

    // ── WordPress Import Fields ─────────────────────────────────────────
    wpCommentId: v.optional(v.number()), // Original WordPress comment ID
    wpSourceSiteId: v.optional(v.id("wordpressSites")), // Source WordPress site
  })
    // ── Core Listing Indexes ─────────────────────────────────────────────
    .index("by_post", ["postId", "status", "createdAt"]) // Comments on a post with status filter
    .index("by_post_parent", ["postId", "parentId", "createdAt"]) // Thread structure within a post
    .index("by_author", ["authorId", "createdAt"]) // User's comments (My Comments page)
    .index("by_status", ["status", "createdAt"]) // Admin moderation queue tabs
    .index("by_status_post", ["status", "postId"]) // Count comments per status per post
    .index("by_flagged", ["flagCount", "status"]) // Flagged comments for review
    .index("by_trashed", ["status", "trashedAt"]), // Trash auto-purge

  /**
   * Comment metadata table - extensible key-value store per comment.
   *
   * WordPress equivalent: wp_commentmeta
   *
   * Known meta keys:
   *   - `_user_agent`    - Browser user agent string (for spam analysis)
   *   - `_ip_address`    - IP address at time of comment (for spam analysis)
   *   - `_edit_reason`   - Optional reason provided by moderator when editing
   *   - `_scheduled_purge_id` - Scheduled function ID for trash auto-purge
   */
  commentMeta: defineTable({
    commentId: v.id("comments"), // Foreign key to comments table
    key: v.string(), // meta_key (max 255 chars)
    value: v.string(), // meta_value (JSON-encoded for complex values)
  })
    .index("by_comment", ["commentId"]) // All meta for a comment
    .index("by_comment_key", ["commentId", "key"]) // Specific meta value
    .index("by_key", ["key"]), // All comments with a given meta key

  /**
   * Comment likes table - one record per user-comment like relationship.
   *
   * No WordPress equivalent (built-in ConvexPress feature).
   * The `by_user_comment` index enforces uniqueness: one like per user per comment.
   */
  commentLikes: defineTable({
    commentId: v.id("comments"), // The comment being liked
    userId: v.string(), // User identifier of the liker
    createdAt: v.number(), // When the like was created
  })
    .index("by_comment", ["commentId"]) // All likes for a comment
    .index("by_user_comment", ["userId", "commentId"]) // Unique constraint check
    .index("by_user", ["userId"]), // All likes by a user

  /**
   * Comment flags table - one record per user-comment flag relationship.
   *
   * No WordPress equivalent (built-in ConvexPress feature).
   * The `by_user_comment` index enforces uniqueness: one flag per user per comment.
   */
  commentFlags: defineTable({
    commentId: v.id("comments"), // The comment being flagged
    userId: v.string(), // User identifier of the flagger
    reason: v.string(), // Flag reason: spam, harassment, off-topic, misinformation, other
    details: v.optional(v.string()), // Optional additional details (max 500 chars)
    createdAt: v.number(), // When the flag was created
  })
    .index("by_comment", ["commentId"]) // All flags for a comment
    .index("by_user_comment", ["userId", "commentId"]) // Unique constraint check
    .index("by_user", ["userId"]), // All flags by a user
};
