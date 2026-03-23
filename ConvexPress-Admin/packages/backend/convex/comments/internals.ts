/**
 * Comment System - Internal Functions
 *
 * Non-client-callable functions used by:
 *   - Convex scheduled functions (trash auto-purge)
 *   - Cross-system internal calls
 *
 * Functions:
 *   purgeOldTrash        - Permanently delete a trashed comment after 30 days
 *   updatePostCommentCount - Recalculate denormalized comment count on posts table
 *   updateUserCommentCount - Update denormalized comment count on users table
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { emitEvent } from "../helpers/events";
import { COMMENT_EVENTS, SYSTEM } from "../events/constants";
import { deleteCommentAndRelated } from "../helpers/comment";

// ─── Purge Old Trash ─────────────────────────────────────────────────────────

/**
 * Permanently delete a trashed comment after 30 days.
 *
 * This is called by `ctx.scheduler.runAt()` when a comment is trashed.
 * It fires at `trashedAt + 30 days`.
 *
 * Safety: If the comment was restored or already deleted, this is a no-op.
 * Also handles cascade deletion of related records.
 */
export const purgeOldTrash = internalMutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, { commentId }) => {
    const comment = await ctx.db.get("comments", commentId);

    // Comment was already deleted or restored - no-op
    if (!comment || comment.status !== "trash") return;

    // ── Handle child comments ───────────────────────────────────────────
    const children = await ctx.db
      .query("comments")
      .withIndex("by_post_parent", (q) =>
        q.eq("postId", comment.postId).eq("parentId", commentId),
      )
      .collect();

    for (const child of children) {
      if (child.status === "trash" || child.status === "spam") {
        // Cascade delete trash/spam children
        await deleteCommentAndRelated(ctx, child._id);
      } else {
        // Re-parent approved/pending children to this comment's parent
        await ctx.db.patch("comments", child._id, {
          parentId: comment.parentId,
          depth: comment.parentId ? Math.max(0, child.depth - 1) : 0,
          updatedAt: Date.now(),
        });
      }
    }

    // ── Capture event data before deletion ──────────────────────────────
    const eventPayload = {
      commentId,
      postId: comment.postId,
      deletedBy: "system",
      permanent: true,
      autoPurge: true,
    };

    // ── Delete the comment and related records ──────────────────────────
    await deleteCommentAndRelated(ctx, commentId);

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, COMMENT_EVENTS.DELETED, SYSTEM.COMMENT, eventPayload);
  },
});

// ─── Update Post Comment Count ───────────────────────────────────────────────

/**
 * Recalculate the denormalized comment count on the posts table.
 *
 * Counts all approved comments for the given post.
 * Called when comment counts may have drifted.
 */
export const updatePostCommentCount = internalMutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get("posts", postId);
    if (!post) return;

    // Count approved comments for this post
    const approvedComments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) =>
        q.eq("postId", postId).eq("status", "approved"),
      )
      .collect();

    await ctx.db.patch("posts", postId, {
      commentCount: approvedComments.length,
    });
  },
});

// ─── Update User Comment Count ───────────────────────────────────────────────

/**
 * Update the denormalized comment count on the users table.
 *
 * Counts all non-trash/non-spam comments by the given author.
 * The authorId is a user identifier string (workosUserId, clerkUserId, or Convex _id).
 * Tries multiple lookup strategies to find the user.
 */
export const updateUserCommentCount = internalMutation({
  args: { authorId: v.string() },
  handler: async (ctx, { authorId }) => {
    // Find the user by multiple strategies: workosUserId, clerkUserId, or direct ID
    let user = await ctx.db
      .query("users")
      .withIndex("by_workosUserId", (q) => q.eq("workosUserId", authorId))
      .unique();

    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", authorId))
        .unique();
    }

    if (!user) {
      try {
        user = await ctx.db.get(authorId as any);
      } catch {
        // Invalid ID format
      }
    }

    if (!user) return;

    // Count approved comments by this author
    const authorComments = await ctx.db
      .query("comments")
      .withIndex("by_author", (q) => q.eq("authorId", authorId))
      .collect();

    const count = authorComments.filter(
      (c) => c.status === "approved",
    ).length;

    await ctx.db.patch("users", user._id, {
      commentCount: count,
      updatedAt: Date.now(),
    });
  },
});

// Note: deleteCommentAndRelated is now imported from ../helpers/comment.ts
// to avoid duplication with mutations.ts
