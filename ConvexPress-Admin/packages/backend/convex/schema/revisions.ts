/**
 * Revision System - Schema
 *
 * One table supporting post/page content versioning:
 *   - `revisions` - Immutable snapshots of post content at points in time
 *
 * WordPress equivalent: Rows in `wp_posts` with `post_type = 'revision'`.
 * SmithHarper uses a dedicated table for type safety, query performance,
 * and storage efficiency.
 *
 * Key design decisions:
 *   - Full snapshots (title + content + excerpt), not diffs, for fast restore
 *   - `parentId` references the `posts` table (both posts and pages live there)
 *   - `parentType` discriminator tracks whether parent is "post" or "page"
 *   - `authorId` is a WorkOS user ID string (not Convex user ID)
 *   - Revision numbers are sequential per parent, never reused after pruning
 *   - Two types: "manual" (explicit save) and "autosave" (periodic 5-min snapshot)
 *   - Autosave revisions are one-per-user-per-post, updated in place
 *   - Pruning only deletes manual revisions; autosaves are preserved
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators (used by schema and functions) ───────────────────────

/** Revision type: how this revision was created. */
export const revisionTypeValidator = v.union(
  v.literal("manual"),     // Created on explicit Save/Update
  v.literal("autosave"),   // Created by autosave mechanism (one per user per post)
);

/** Parent content type: what kind of content this revision belongs to. */
export const revisionParentTypeValidator = v.union(
  v.literal("post"),
  v.literal("page"),
);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const revisionTables = {
  /**
   * Revision snapshots - immutable records of post/page content at a point in time.
   *
   * Each revision stores a FULL copy of title, content, and excerpt (not a diff).
   * This makes restoring trivial (copy fields back to parent) and avoids the
   * complexity of diff chains.
   *
   * Indexes support:
   *   - Revision list for a post (by_parent, by_parent_number)
   *   - Filtering manual vs autosave (by_parent_type)
   *   - Author activity feeds (by_author)
   *   - Chronological ordering for cleanup (by_createdAt)
   */
  revisions: defineTable({
    // ── Relationship ────────────────────────────────────────────────────
    parentId: v.id("posts"),                  // The post or page this revision belongs to
    parentType: revisionParentTypeValidator,   // "post" or "page"

    // ── Snapshot Fields ─────────────────────────────────────────────────
    title: v.string(),                        // Snapshot of the title at this point in time
    content: v.string(),                      // Snapshot of the content (serialized block editor JSON)
    excerpt: v.optional(v.string()),          // Snapshot of the excerpt

    // ── Revision Metadata ───────────────────────────────────────────────
    revisionNumber: v.number(),               // Sequential number: 1, 2, 3, ...
    type: revisionTypeValidator,              // "manual" or "autosave"
    authorId: v.string(),                     // WorkOS user ID of who triggered this revision

    // ── Change Summary ──────────────────────────────────────────────────
    changedFields: v.array(v.string()),       // Which fields changed: ["title", "content", "excerpt"]
    contentLength: v.number(),                // Character count of content (for quick size reference)

    // ── Timestamps ──────────────────────────────────────────────────────
    createdAt: v.number(),                    // When this revision was created (ms)
  })
    // ── Indexes ───────────────────────────────────────────────────────────
    .index("by_parent", ["parentId"])                              // All revisions for a post
    .index("by_parent_type", ["parentId", "type"])                 // Manual vs autosave revisions for a post
    .index("by_parent_number", ["parentId", "revisionNumber"])     // Specific revision by number
    .index("by_author", ["authorId"])                              // All revisions by a user
    .index("by_createdAt", ["createdAt"]),                         // Chronological ordering
};
