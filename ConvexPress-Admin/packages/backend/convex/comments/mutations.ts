/**
 * Comment System - Mutations
 *
 * All write operations for the comment lifecycle:
 *   create          - Submit a new comment (authenticated users)
 *   update          - Edit comment content (owner within grace period, or moderator)
 *   approve         - Approve a pending/spam comment (moderate_comments)
 *   reject          - Set comment back to pending (moderate_comments)
 *   spam            - Mark as spam (moderate_comments)
 *   trash           - Move to trash (moderate_comments)
 *   restore         - Restore from trash (moderate_comments)
 *   permanentDelete - Permanently delete (moderate_comments)
 *   reply           - Reply to a comment (creates child comment)
 *   flag            - Flag a comment for review (all authenticated users)
 *   like            - Like/unlike toggle (all authenticated users)
 *   bulkApprove     - Bulk approve comments (moderate_comments)
 *   bulkSpam        - Bulk spam (moderate_comments)
 *   bulkTrash       - Bulk trash (moderate_comments)
 *   bulkDelete      - Bulk permanent delete (moderate_comments)
 *
 * Authorization:
 *   - comment.create: any authenticated user with create_comments capability
 *   - comment.reply: requires reply_to_comments capability (Admin, Editor, Author)
 *   - Moderation actions: require moderate_comments capability (Admin, Editor)
 *   - comment.flag / comment.like: any authenticated user
 *
 * All moderation mutations emit events via the Event Dispatcher System.
 */

import { ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { requireCan, getCurrentUser, currentUserCan, getUserIdentifier } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { COMMENT_EVENTS, SYSTEM } from "../events/constants";
import {
  sanitizeCommentContent,
  getDiscussionSettings,
  canEditComment,
  deleteCommentAndRelated,
  createCommentCore,
} from "../helpers/comment";
import {
  createCommentArgs,
  updateCommentArgs,
  approveCommentArgs,
  rejectCommentArgs,
  spamCommentArgs,
  trashCommentArgs,
  restoreCommentArgs,
  permanentDeleteCommentArgs,
  replyCommentArgs,
  flagCommentArgs,
  likeCommentArgs,
  bulkApproveArgs,
  bulkSpamArgs,
  bulkTrashArgs,
  bulkDeleteArgs,
  MAX_CONTENT_LENGTH,
  MIN_CONTENT_LENGTH,
  MAX_FLAG_DETAILS_LENGTH,
  MAX_BULK_SIZE,
  TRASH_PURGE_DAYS_MS,
} from "./validators";

// ─── Create ──────────────────────────────────────────────────────────────────

/**
 * Create a new comment on a published post.
 *
 * Flow:
 *   1. Authenticate + check create_comments capability
 *   2. Validate post exists, is published, and has open comments
 *   3. Validate and sanitize content
 *   4. Flood protection check
 *   5. Resolve threading (parentId + depth)
 *   6. Run moderation pipeline to determine initial status
 *   7. Denormalize author data
 *   8. Insert comment record
 *   9. If approved: increment posts.commentCount
 *   10. Emit comment.created event
 *
 * @returns { commentId, status }
 */
export const create = mutation({
  args: createCommentArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.create");

    // ── Fetch and validate post ─────────────────────────────────────────
    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }
    if (post.status !== "publish") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Comments are only allowed on published posts",
      });
    }
    if (post.commentStatus !== "open") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Comments are closed on this post",
      });
    }

    // ── Threading validation (only for create with parentId) ────────────
    if (args.parentId) {
      const parentComment = await ctx.db.get("comments", args.parentId);
      if (!parentComment) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Parent comment not found",
        });
      }
      if (parentComment.postId.toString() !== args.postId.toString()) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Parent comment belongs to a different post",
        });
      }
      if (parentComment.status === "spam" || parentComment.status === "trash") {
        throw new ConvexError({
          code: "INVALID_STATE",
          message: "Cannot reply to a comment that is in spam or trash",
        });
      }
    }

    // ── Delegate to shared core logic ───────────────────────────────────
    return await createCommentCore(ctx, {
      postId: args.postId,
      post,
      content: args.content,
      user: {
        _id: user._id,
        workosUserId: user.workosUserId,
        clerkUserId: user.clerkUserId,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profilePictureUrl: user.profilePictureUrl,
      },
      parentId: args.parentId,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
  },
});

// ─── Update ──────────────────────────────────────────────────────────────────

/**
 * Edit comment content.
 *
 * Authorization:
 *   - Own comment within grace period: allowed
 *   - Own comment past grace period: requires moderate_comments
 *   - Other user's comment: requires moderate_comments
 */
export const update = mutation({
  args: updateCommentArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Comment not found",
      });
    }

    // ── Get discussion settings for grace period ────────────────────────
    const settings = await getDiscussionSettings(ctx);

    // ── Get user capabilities ───────────────────────────────────────────
    // We need to check capabilities manually for the edit permission logic
    const userCapabilities: string[] = [];
    if (await currentUserCan(ctx, "comment.approve")) {
      userCapabilities.push("moderate_comments");
    }

    const editCheck = canEditComment(
      {
        authorId: comment.authorId,
        createdAt: comment.createdAt,
        status: comment.status,
      },
      getUserIdentifier(user),
      userCapabilities,
      settings.commentEditGracePeriod,
    );

    if (!editCheck.allowed) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: editCheck.reason,
      });
    }

    // ── Validate content ────────────────────────────────────────────────
    const trimmed = args.content.trim();
    if (trimmed.length < MIN_CONTENT_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Comment content cannot be empty",
      });
    }
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Comment content must be ${MAX_CONTENT_LENGTH} characters or fewer`,
      });
    }
    const sanitizedContent = sanitizeCommentContent(trimmed);

    // ── Update comment ──────────────────────────────────────────────────
    const now = Date.now();
    await ctx.db.patch("comments", args.commentId, {
      content: sanitizedContent,
      isEdited: true,
      editedAt: now,
      updatedAt: now,
    });

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, COMMENT_EVENTS.UPDATED, SYSTEM.COMMENT, {
      commentId: args.commentId,
      postId: comment.postId,
      updatedBy: getUserIdentifier(user),
      isOwnerEdit: comment.authorId === getUserIdentifier(user),
    });

    return args.commentId;
  },
});

// ─── Approve ─────────────────────────────────────────────────────────────────

/**
 * Approve a pending or spam comment.
 * Increments posts.commentCount.
 */
export const approve = mutation({
  args: approveCommentArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.approve");

    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Comment not found",
      });
    }

    if (comment.status === "approved") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Comment is already approved",
      });
    }
    if (comment.status === "trash") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Cannot approve a trashed comment. Restore it first.",
      });
    }

    const now = Date.now();
    await ctx.db.patch("comments", args.commentId, {
      status: "approved",
      moderatedBy: getUserIdentifier(user),
      moderatedAt: now,
      updatedAt: now,
    });

    // Increment post comment count
    const post = await ctx.db.get("posts", comment.postId);
    if (post) {
      const currentCount = post.commentCount ?? 0;
      await ctx.db.patch("posts", comment.postId, {
        commentCount: currentCount + 1,
      });
    }

    await emitEvent(ctx, COMMENT_EVENTS.APPROVED, SYSTEM.COMMENT, {
      commentId: args.commentId,
      postId: comment.postId,
      approvedBy: getUserIdentifier(user),
    });

    return args.commentId;
  },
});

// ─── Reject (Unapprove) ─────────────────────────────────────────────────────

/**
 * Reject a comment (set back to pending).
 * If was approved, decrements posts.commentCount.
 */
export const reject = mutation({
  args: rejectCommentArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.reject");

    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Comment not found",
      });
    }

    if (comment.status === "pending") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Comment is already pending",
      });
    }
    if (comment.status === "trash" || comment.status === "spam") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Cannot reject a comment in trash or spam",
      });
    }

    const wasApproved = comment.status === "approved";
    const now = Date.now();

    await ctx.db.patch("comments", args.commentId, {
      status: "pending",
      moderatedBy: getUserIdentifier(user),
      moderatedAt: now,
      updatedAt: now,
    });

    // Decrement post comment count if was approved
    if (wasApproved) {
      const post = await ctx.db.get("posts", comment.postId);
      if (post) {
        const currentCount = post.commentCount ?? 0;
        await ctx.db.patch("posts", comment.postId, {
          commentCount: Math.max(0, currentCount - 1),
        });
      }
    }

    await emitEvent(ctx, COMMENT_EVENTS.REJECTED, SYSTEM.COMMENT, {
      commentId: args.commentId,
      postId: comment.postId,
      rejectedBy: getUserIdentifier(user),
    });

    return args.commentId;
  },
});

// ─── Spam ────────────────────────────────────────────────────────────────────

/**
 * Mark a comment as spam.
 * If was approved, decrements posts.commentCount.
 */
export const spam = mutation({
  args: spamCommentArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.spam");

    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Comment not found",
      });
    }

    if (comment.status === "spam") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Comment is already marked as spam",
      });
    }

    const wasApproved = comment.status === "approved";
    const now = Date.now();

    await ctx.db.patch("comments", args.commentId, {
      previousStatus: comment.status,
      status: "spam",
      moderatedBy: getUserIdentifier(user),
      moderatedAt: now,
      updatedAt: now,
    });

    // Decrement post comment count if was approved
    if (wasApproved) {
      const post = await ctx.db.get("posts", comment.postId);
      if (post) {
        const currentCount = post.commentCount ?? 0;
        await ctx.db.patch("posts", comment.postId, {
          commentCount: Math.max(0, currentCount - 1),
        });
      }
    }

    await emitEvent(ctx, COMMENT_EVENTS.SPAMMED, SYSTEM.COMMENT, {
      commentId: args.commentId,
      postId: comment.postId,
    });

    return { success: true };
  },
});

// ─── Trash ───────────────────────────────────────────────────────────────────

/**
 * Move a comment to trash (soft delete).
 * If was approved, decrements posts.commentCount.
 * Schedules auto-purge after 30 days.
 */
export const trash = mutation({
  args: trashCommentArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.delete");

    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Comment not found",
      });
    }

    if (comment.status === "trash") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Comment is already in trash",
      });
    }

    const wasApproved = comment.status === "approved";
    const now = Date.now();

    await ctx.db.patch("comments", args.commentId, {
      previousStatus: comment.status,
      status: "trash",
      trashedAt: now,
      updatedAt: now,
    });

    // Decrement post comment count if was approved
    if (wasApproved) {
      const post = await ctx.db.get("posts", comment.postId);
      if (post) {
        const currentCount = post.commentCount ?? 0;
        await ctx.db.patch("posts", comment.postId, {
          commentCount: Math.max(0, currentCount - 1),
        });
      }
    }

    // Schedule auto-purge after 30 days and store the scheduled function ID
    const scheduledId = await ctx.scheduler.runAt(
      now + TRASH_PURGE_DAYS_MS,
      internal.comments.internals.purgeOldTrash,
      { commentId: args.commentId },
    );

    // Store scheduled function ID in commentMeta for cancellation on restore
    // Remove any existing scheduled purge meta first
    const existingPurgeMeta = await ctx.db
      .query("commentMeta")
      .withIndex("by_comment_key", (q) =>
        q.eq("commentId", args.commentId).eq("key", "_scheduled_purge_id"),
      )
      .unique();
    if (existingPurgeMeta) {
      await ctx.db.patch("commentMeta", existingPurgeMeta._id, {
        value: scheduledId.toString(),
      });
    } else {
      await ctx.db.insert("commentMeta", {
        commentId: args.commentId,
        key: "_scheduled_purge_id",
        value: scheduledId.toString(),
      });
    }

    await emitEvent(ctx, COMMENT_EVENTS.DELETED, SYSTEM.COMMENT, {
      commentId: args.commentId,
      postId: comment.postId,
      deletedBy: getUserIdentifier(user),
      permanent: false,
    });

    return { success: true };
  },
});

// ─── Restore ─────────────────────────────────────────────────────────────────

/**
 * Restore a comment from trash.
 * Restores to previousStatus (or "pending" if not set).
 * If restored to "approved", increments posts.commentCount.
 * Cancels the scheduled auto-purge.
 */
export const restore = mutation({
  args: restoreCommentArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.approve");

    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Comment not found",
      });
    }

    if (comment.status !== "trash") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Comment is not in trash",
      });
    }

    // ── Cancel scheduled auto-purge ─────────────────────────────────────
    const purgeMeta = await ctx.db
      .query("commentMeta")
      .withIndex("by_comment_key", (q) =>
        q.eq("commentId", args.commentId).eq("key", "_scheduled_purge_id"),
      )
      .unique();
    if (purgeMeta) {
      try {
        await ctx.scheduler.cancel(purgeMeta.value as Id<"_scheduled_functions">);
      } catch {
        // Scheduled function may have already fired or been cancelled - safe to ignore
      }
      await ctx.db.delete("commentMeta", purgeMeta._id);
    }

    const restoredStatus = (comment.previousStatus as "approved" | "pending" | "spam") || "pending";
    const now = Date.now();

    await ctx.db.patch("comments", args.commentId, {
      status: restoredStatus,
      previousStatus: undefined,
      trashedAt: undefined,
      updatedAt: now,
    });

    // Increment post comment count if restored to approved
    if (restoredStatus === "approved") {
      const post = await ctx.db.get("posts", comment.postId);
      if (post) {
        const currentCount = post.commentCount ?? 0;
        await ctx.db.patch("posts", comment.postId, {
          commentCount: currentCount + 1,
        });
      }
    }

    return args.commentId;
  },
});

// ─── Permanent Delete ────────────────────────────────────────────────────────

/**
 * Permanently delete a comment.
 * Must be in trash or spam.
 * Deletes all related commentMeta, commentLikes, commentFlags.
 * Re-parents approved/pending children; cascade-deletes trash/spam children.
 */
export const permanentDelete = mutation({
  args: permanentDeleteCommentArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.delete");

    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Comment not found",
      });
    }

    if (comment.status !== "trash" && comment.status !== "spam") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Comment must be in trash or spam before permanent deletion",
      });
    }

    // ── Handle child comments ───────────────────────────────────────────
    const children = await ctx.db
      .query("comments")
      .withIndex("by_post_parent", (q) =>
        q.eq("postId", comment.postId).eq("parentId", args.commentId),
      )
      .collect();

    for (const child of children) {
      if (child.status === "trash" || child.status === "spam") {
        // Cascade delete trash/spam children
        await deleteCommentAndRelated(ctx, child._id);
      } else {
        // Re-parent approved/pending children to this comment's parent (or top-level)
        await ctx.db.patch("comments", child._id, {
          parentId: comment.parentId,
          depth: comment.parentId ? Math.max(0, child.depth - 1) : 0,
          updatedAt: Date.now(),
        });
      }
    }

    // ── Delete the comment and related data ─────────────────────────────
    const eventPayload = {
      commentId: args.commentId,
      postId: comment.postId,
      deletedBy: getUserIdentifier(user),
      permanent: true,
    };

    await deleteCommentAndRelated(ctx, args.commentId);

    await emitEvent(ctx, COMMENT_EVENTS.DELETED, SYSTEM.COMMENT, eventPayload);

    return { success: true };
  },
});

// ─── Reply ───────────────────────────────────────────────────────────────────

/**
 * Reply to a comment.
 * Validates the parent comment and post, then delegates to createCommentCore.
 */
export const reply = mutation({
  args: replyCommentArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.reply");

    // ── Fetch and validate parent comment ───────────────────────────────
    const parentComment = await ctx.db.get("comments", args.parentCommentId);
    if (!parentComment) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Parent comment not found",
      });
    }

    if (parentComment.status === "spam" || parentComment.status === "trash") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Cannot reply to a comment in spam or trash",
      });
    }

    // ── Fetch and validate post ─────────────────────────────────────────
    const post = await ctx.db.get("posts", parentComment.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }
    if (post.status !== "publish") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Comments are only allowed on published posts",
      });
    }
    if (post.commentStatus !== "open") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Comments are closed on this post",
      });
    }

    // ── Delegate to shared core logic ───────────────────────────────────
    return await createCommentCore(ctx, {
      postId: parentComment.postId,
      post,
      content: args.content,
      user: {
        _id: user._id,
        workosUserId: user.workosUserId,
        clerkUserId: user.clerkUserId,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profilePictureUrl: user.profilePictureUrl,
      },
      parentId: args.parentCommentId,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
  },
});

// ─── Flag ────────────────────────────────────────────────────────────────────

/**
 * Flag a comment for review.
 * Creates a commentFlags record and increments flagCount.
 * If flagCount crosses the threshold, auto-holds for moderation.
 */
export const flag = mutation({
  args: flagCommentArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.flag");

    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Comment not found",
      });
    }

    if (comment.status !== "approved") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Can only flag approved comments",
      });
    }

    // Cannot flag own comments
    if (comment.authorId === getUserIdentifier(user)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot flag your own comment",
      });
    }

    // Check if user already flagged this comment
    const existingFlag = await ctx.db
      .query("commentFlags")
      .withIndex("by_user_comment", (q) =>
        q.eq("userId", getUserIdentifier(user)).eq("commentId", args.commentId),
      )
      .unique();

    if (existingFlag) {
      throw new ConvexError({
        code: "ALREADY_FLAGGED",
        message: "You have already flagged this comment",
      });
    }

    // Validate details for "other" reason
    if (args.reason === "other") {
      if (!args.details || !args.details.trim()) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Details are required when reason is 'other'",
        });
      }
    }
    if (args.details && args.details.length > MAX_FLAG_DETAILS_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Flag details must be ${MAX_FLAG_DETAILS_LENGTH} characters or fewer`,
      });
    }

    // ── Insert flag record ──────────────────────────────────────────────
    const now = Date.now();
    await ctx.db.insert("commentFlags", {
      commentId: args.commentId,
      userId: getUserIdentifier(user),
      reason: args.reason,
      details: args.details?.trim(),
      createdAt: now,
    });

    // ── Update comment flagCount and flaggedReasons ─────────────────────
    const newFlagCount = comment.flagCount + 1;
    const flaggedReasons = [...(comment.flaggedReasons ?? []), args.reason];

    const patch: Record<string, unknown> = {
      flagCount: newFlagCount,
      flaggedReasons,
      updatedAt: now,
    };

    // Check if flag threshold reached -> auto-hold for moderation
    const settings = await getDiscussionSettings(ctx);
    if (newFlagCount >= settings.commentFlagThreshold && comment.status === "approved") {
      patch.status = "pending";

      // Decrement post comment count (was approved, now pending)
      const post = await ctx.db.get("posts", comment.postId);
      if (post) {
        const currentCount = post.commentCount ?? 0;
        await ctx.db.patch("posts", comment.postId, {
          commentCount: Math.max(0, currentCount - 1),
        });
      }
    }

    await ctx.db.patch("comments", args.commentId, patch);

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, COMMENT_EVENTS.FLAGGED, SYSTEM.COMMENT, {
      commentId: args.commentId,
      postId: comment.postId,
      flaggedBy: getUserIdentifier(user),
      reason: args.reason,
    });

    return { success: true };
  },
});

// ─── Like ────────────────────────────────────────────────────────────────────

/**
 * Like/unlike a comment (toggle).
 * If not liked: creates commentLikes record, increments likeCount.
 * If already liked: deletes commentLikes record, decrements likeCount.
 */
export const like = mutation({
  args: likeCommentArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.like");

    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Comment not found",
      });
    }

    if (comment.status !== "approved") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Can only like approved comments",
      });
    }

    // Check for existing like
    const existingLike = await ctx.db
      .query("commentLikes")
      .withIndex("by_user_comment", (q) =>
        q.eq("userId", getUserIdentifier(user)).eq("commentId", args.commentId),
      )
      .unique();

    if (existingLike) {
      // Unlike: remove the like record and decrement
      await ctx.db.delete("commentLikes", existingLike._id);
      const newCount = Math.max(0, comment.likeCount - 1);
      await ctx.db.patch("comments", args.commentId, {
        likeCount: newCount,
        updatedAt: Date.now(),
      });
      return { liked: false, likeCount: newCount };
    } else {
      // Like: create the like record and increment
      await ctx.db.insert("commentLikes", {
        commentId: args.commentId,
        userId: getUserIdentifier(user),
        createdAt: Date.now(),
      });
      const newCount = comment.likeCount + 1;
      await ctx.db.patch("comments", args.commentId, {
        likeCount: newCount,
        updatedAt: Date.now(),
      });
      return { liked: true, likeCount: newCount };
    }
  },
});

// ─── Bulk Approve ────────────────────────────────────────────────────────────

/**
 * Bulk approve multiple comments.
 */
export const bulkApprove = mutation({
  args: bulkApproveArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.bulk_approve");

    if (args.commentIds.length === 0) {
      return { approved: 0, skipped: 0, errors: 0 };
    }
    if (args.commentIds.length > MAX_BULK_SIZE) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Bulk operations limited to ${MAX_BULK_SIZE} items`,
      });
    }

    let approved = 0;
    let skipped = 0;
    let errors = 0;
    const now = Date.now();

    for (const commentId of args.commentIds) {
      try {
        const comment = await ctx.db.get("comments", commentId);
        if (!comment) {
          errors++;
          continue;
        }
        if (comment.status === "approved") {
          skipped++;
          continue;
        }
        if (comment.status === "trash") {
          skipped++;
          continue;
        }

        await ctx.db.patch("comments", commentId, {
          status: "approved",
          moderatedBy: getUserIdentifier(user),
          moderatedAt: now,
          updatedAt: now,
        });

        // Increment post comment count
        const post = await ctx.db.get("posts", comment.postId);
        if (post) {
          const currentCount = post.commentCount ?? 0;
          await ctx.db.patch("posts", comment.postId, {
            commentCount: currentCount + 1,
          });
        }

        await emitEvent(ctx, COMMENT_EVENTS.APPROVED, SYSTEM.COMMENT, {
          commentId,
          postId: comment.postId,
          approvedBy: getUserIdentifier(user),
        });

        approved++;
      } catch {
        errors++;
      }
    }

    return { approved, skipped, errors };
  },
});

// ─── Bulk Spam ───────────────────────────────────────────────────────────────

/**
 * Bulk mark multiple comments as spam.
 */
export const bulkSpam = mutation({
  args: bulkSpamArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.bulk_spam");

    if (args.commentIds.length === 0) {
      return { spammed: 0, skipped: 0, errors: 0 };
    }
    if (args.commentIds.length > MAX_BULK_SIZE) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Bulk operations limited to ${MAX_BULK_SIZE} items`,
      });
    }

    let spammed = 0;
    let skipped = 0;
    let errors = 0;
    const now = Date.now();

    for (const commentId of args.commentIds) {
      try {
        const comment = await ctx.db.get("comments", commentId);
        if (!comment) {
          errors++;
          continue;
        }
        if (comment.status === "spam") {
          skipped++;
          continue;
        }

        const wasApproved = comment.status === "approved";

        await ctx.db.patch("comments", commentId, {
          previousStatus: comment.status,
          status: "spam",
          moderatedBy: getUserIdentifier(user),
          moderatedAt: now,
          updatedAt: now,
        });

        if (wasApproved) {
          const post = await ctx.db.get("posts", comment.postId);
          if (post) {
            const currentCount = post.commentCount ?? 0;
            await ctx.db.patch("posts", comment.postId, {
              commentCount: Math.max(0, currentCount - 1),
            });
          }
        }

        await emitEvent(ctx, COMMENT_EVENTS.SPAMMED, SYSTEM.COMMENT, {
          commentId,
          postId: comment.postId,
        });

        spammed++;
      } catch {
        errors++;
      }
    }

    return { spammed, skipped, errors };
  },
});

// ─── Bulk Trash ──────────────────────────────────────────────────────────────

/**
 * Bulk move multiple comments to trash.
 */
export const bulkTrash = mutation({
  args: bulkTrashArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.bulk_delete");

    if (args.commentIds.length === 0) {
      return { trashed: 0, skipped: 0, errors: 0 };
    }
    if (args.commentIds.length > MAX_BULK_SIZE) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Bulk operations limited to ${MAX_BULK_SIZE} items`,
      });
    }

    let trashed = 0;
    let skipped = 0;
    let errors = 0;
    const now = Date.now();

    for (const commentId of args.commentIds) {
      try {
        const comment = await ctx.db.get("comments", commentId);
        if (!comment) {
          errors++;
          continue;
        }
        if (comment.status === "trash") {
          skipped++;
          continue;
        }

        const wasApproved = comment.status === "approved";

        await ctx.db.patch("comments", commentId, {
          previousStatus: comment.status,
          status: "trash",
          trashedAt: now,
          updatedAt: now,
        });

        if (wasApproved) {
          const post = await ctx.db.get("posts", comment.postId);
          if (post) {
            const currentCount = post.commentCount ?? 0;
            await ctx.db.patch("posts", comment.postId, {
              commentCount: Math.max(0, currentCount - 1),
            });
          }
        }

        // Schedule auto-purge and store the scheduled function ID
        const scheduledId = await ctx.scheduler.runAt(
          now + TRASH_PURGE_DAYS_MS,
          internal.comments.internals.purgeOldTrash,
          { commentId },
        );

        // Store scheduled function ID in commentMeta for cancellation on restore
        await ctx.db.insert("commentMeta", {
          commentId,
          key: "_scheduled_purge_id",
          value: scheduledId.toString(),
        });

        await emitEvent(ctx, COMMENT_EVENTS.DELETED, SYSTEM.COMMENT, {
          commentId,
          postId: comment.postId,
          deletedBy: getUserIdentifier(user),
          permanent: false,
        });

        trashed++;
      } catch {
        errors++;
      }
    }

    return { trashed, skipped, errors };
  },
});

// ─── Bulk Delete ─────────────────────────────────────────────────────────────

/**
 * Bulk permanently delete comments (must be in trash or spam).
 */
export const bulkDelete = mutation({
  args: bulkDeleteArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "comment.bulk_delete");

    if (args.commentIds.length === 0) {
      return { deleted: 0, skipped: 0, errors: 0 };
    }
    if (args.commentIds.length > MAX_BULK_SIZE) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Bulk operations limited to ${MAX_BULK_SIZE} items`,
      });
    }

    let deleted = 0;
    let skipped = 0;
    let errors = 0;

    for (const commentId of args.commentIds) {
      try {
        const comment = await ctx.db.get("comments", commentId);
        if (!comment) {
          errors++;
          continue;
        }
        if (comment.status !== "trash" && comment.status !== "spam") {
          skipped++;
          continue;
        }

        // Handle children: re-parent approved/pending, cascade-delete trash/spam
        const children = await ctx.db
          .query("comments")
          .withIndex("by_post_parent", (q) =>
            q.eq("postId", comment.postId).eq("parentId", commentId),
          )
          .collect();

        for (const child of children) {
          if (child.status === "trash" || child.status === "spam") {
            await deleteCommentAndRelated(ctx, child._id);
          } else {
            await ctx.db.patch("comments", child._id, {
              parentId: comment.parentId,
              depth: comment.parentId ? Math.max(0, child.depth - 1) : 0,
              updatedAt: Date.now(),
            });
          }
        }

        const eventPayload = {
          commentId,
          postId: comment.postId,
          deletedBy: getUserIdentifier(user),
          permanent: true,
        };

        await deleteCommentAndRelated(ctx, commentId);

        await emitEvent(ctx, COMMENT_EVENTS.DELETED, SYSTEM.COMMENT, eventPayload);

        deleted++;
      } catch {
        errors++;
      }
    }

    return { deleted, skipped, errors };
  },
});

// Note: deleteCommentAndRelated is now imported from ../helpers/comment.ts
// to avoid duplication with internals.ts
