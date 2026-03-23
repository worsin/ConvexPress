/**
 * Content Editor System - Schema
 *
 * Two tables supporting the block editor backend:
 *   - `reusableBlocks` - Saved reusable content blocks (WordPress's wp_block post type)
 *   - `editorLocks`    - Heartbeat-based edit locking for concurrent editing prevention
 *
 * The Content Editor System is primarily a frontend system (TipTap editor).
 * On the backend it owns:
 *   1. Reusable blocks - saved block configurations insertable across posts
 *   2. Edit locks - preventing two users from editing the same post simultaneously
 *
 * Post content itself is stored in the `posts.content` field (owned by Post System).
 * Autosave is handled by the Post System's `posts.autosave` mutation.
 *
 * Key design decisions:
 *   - `authorId` is a Convex user ID (v.id("users")), matching Post System convention
 *   - `content` is JSON-serialized TipTap document format (same as posts.content)
 *   - Edit locks use heartbeat pattern: 2-minute expiry, client renews every 30s
 *   - `blockType` allows future categorization of reusable blocks
 *   - `usageCount` is denormalized for display in the reusable blocks admin list
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Tables ─────────────────────────────────────────────────────────────────

export const editorTables = {
  /**
   * Reusable Blocks - saved block configurations that can be inserted across posts.
   *
   * WordPress equivalent: `wp_block` post type (Reusable Blocks / Synced Patterns)
   *
   * Reusable blocks are created by Administrators and Editors from selected
   * blocks in the editor. When inserted into a post, they render by reference
   * (not copied). Editing the reusable block updates all instances.
   *
   * Indexes support:
   *   - Block inserter panel (published blocks, sorted by title)
   *   - Admin reusable blocks list (all blocks, filterable by author)
   *   - Search by title in the block inserter
   */
  reusableBlocks: defineTable({
    // ── Identity ───────────────────────────────────────────────────────────
    title: v.string(), // Display name for the reusable block
    slug: v.optional(v.string()), // URL-safe identifier (optional, for future use)

    // ── Content ────────────────────────────────────────────────────────────
    content: v.string(), // Serialized JSON (TipTap document format, same as posts.content)
    blockType: v.optional(v.string()), // Optional categorization (e.g., "layout", "content", "cta")
    category: v.optional(v.string()), // User-defined category for organizing blocks
    description: v.optional(v.string()), // Brief description of what the block does

    // ── Status ─────────────────────────────────────────────────────────────
    isPublished: v.boolean(), // Whether available for use in block inserter
    isLocked: v.optional(v.boolean()), // Prevent accidental editing/deletion

    // ── Usage Tracking ─────────────────────────────────────────────────────
    usageCount: v.number(), // How many posts reference this block (denormalized)

    // ── Authorship ─────────────────────────────────────────────────────────
    createdBy: v.id("users"), // Creator (Convex users table reference)

    // ── Timestamps ─────────────────────────────────────────────────────────
    createdAt: v.number(), // Creation timestamp (ms)
    updatedAt: v.number(), // Last modification timestamp (ms)
  })
    .index("by_published", ["isPublished"]) // List only published blocks in the inserter
    .index("by_createdBy", ["createdBy"]) // Filter reusable blocks by creator
    .index("by_title", ["title"]) // Sort/search reusable blocks by name
    .index("by_blockType", ["blockType"]) // Filter by block type category
    .searchIndex("search_reusableBlocks", {
      searchField: "title",
      filterFields: ["isPublished", "createdBy"],
    }),

  /**
   * Editor Locks - heartbeat-based edit locking for concurrent editing prevention.
   *
   * WordPress equivalent: `_edit_lock` post meta + heartbeat API
   *
   * When a user opens a post for editing, they acquire a lock. The lock
   * expires after 2 minutes without a heartbeat renewal. The editor UI
   * sends a renewLock mutation every 30 seconds to keep the lock alive.
   *
   * If another user tries to edit the same post, they see a warning:
   * "This post is currently being edited by {userDisplayName}"
   *
   * Lock lifecycle:
   *   1. User opens post editor -> acquireLock
   *   2. Every 30s -> renewLock (extends expiresAt by 2 minutes)
   *   3. User navigates away -> releaseLock (cleanup)
   *   4. If user's browser crashes -> lock expires after 2 minutes
   *   5. Cron job cleans up expired locks periodically
   */
  editorLocks: defineTable({
    postId: v.id("posts"), // The post being edited
    userId: v.id("users"), // The user holding the lock
    userDisplayName: v.string(), // Display name for the "being edited by" message
    lockedAt: v.number(), // When the lock was first acquired (ms)
    expiresAt: v.number(), // When the lock expires without renewal (ms)
  })
    .index("by_postId", ["postId"]) // Check if a post is locked
    .index("by_userId", ["userId"]) // Get all locks held by a user
    .index("by_expiresAt", ["expiresAt"]), // Cleanup expired locks
};
