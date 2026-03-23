/**
 * Comment System - Shared Argument Validators
 *
 * Reusable Convex argument validators for comment mutations and queries.
 * Centralizes validation logic so mutations and queries stay clean.
 *
 * Convention: each exported object is an args shape (Record<string, Validator>)
 * ready to spread into a Convex function's `args` field.
 */

import { v } from "convex/values";
import {
  commentApprovalStatusValidator,
  flagReasonValidator,
} from "../schema/comments";

// ─── Re-exports for convenience ──────────────────────────────────────────────

export { commentApprovalStatusValidator, flagReasonValidator };

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum comment content length in characters. */
export const MAX_CONTENT_LENGTH = 5000;

/** Minimum comment content length in characters. */
export const MIN_CONTENT_LENGTH = 1;

/** Maximum flag details length in characters. */
export const MAX_FLAG_DETAILS_LENGTH = 500;

/** Default items per page for admin comment listings. */
export const DEFAULT_PER_PAGE_ADMIN = 20;

/** Default items per page for website comment display. */
export const DEFAULT_PER_PAGE_WEBSITE = 50;

/** Maximum items per page. */
export const MAX_PER_PAGE = 100;

/** Maximum bulk operation size. */
export const MAX_BULK_SIZE = 100;

/** Trash auto-purge after 30 days (in milliseconds). */
export const TRASH_PURGE_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Discussion Settings Defaults ───────────────────────────────────────────
// Used when the Settings System hasn't been implemented or has no overrides.

export const DISCUSSION_DEFAULTS = {
  /** Default comment status for new posts. */
  defaultCommentStatus: "open" as const,
  /** Auto-close comments after N days (null = never). */
  closeCommentsDaysOld: null as number | null,
  /** Require manual approval for all comments. */
  commentModeration: false,
  /** Auto-approve returning commenters with prior approved comments. */
  commentPreviouslyApproved: true,
  /** Hold comments with N+ links for moderation. */
  commentMaxLinks: 2,
  /** Newline-separated word list: matching -> hold for moderation. */
  moderationKeys: "",
  /** Newline-separated word list: matching -> auto-spam. */
  disallowedKeys: "",
  /** Enable threaded comments. */
  threadComments: true,
  /** Maximum thread depth (1-10). */
  threadCommentsDepth: 5,
  /** Enable comment pagination. */
  pageComments: false,
  /** Top-level comments per page. */
  commentsPerPage: 50,
  /** Which page to show first. */
  defaultCommentsPage: "oldest" as const,
  /** Display order for comments. */
  commentOrder: "asc" as const,
  /** Minimum seconds between comments per user (flood prevention). */
  commentFloodInterval: 15,
  /** Number of flags before auto-hold for moderation. */
  commentFlagThreshold: 3,
  /** Seconds a comment author can edit their own comment (5 min). */
  commentEditGracePeriod: 300,
};

// ─── Mutation Args ──────────────────────────────────────────────────────────

/**
 * Arguments for creating a new comment.
 */
export const createCommentArgs = {
  postId: v.id("posts"),
  content: v.string(),
  parentId: v.optional(v.id("comments")),
  userAgent: v.optional(v.string()),
  ipAddress: v.optional(v.string()),
};

/**
 * Arguments for updating an existing comment.
 */
export const updateCommentArgs = {
  commentId: v.id("comments"),
  content: v.string(),
};

/**
 * Arguments for approving a comment.
 */
export const approveCommentArgs = {
  commentId: v.id("comments"),
};

/**
 * Arguments for rejecting (unapproving) a comment.
 */
export const rejectCommentArgs = {
  commentId: v.id("comments"),
};

/**
 * Arguments for marking a comment as spam.
 */
export const spamCommentArgs = {
  commentId: v.id("comments"),
};

/**
 * Arguments for trashing a comment (soft delete).
 */
export const trashCommentArgs = {
  commentId: v.id("comments"),
};

/**
 * Arguments for restoring a comment from trash.
 */
export const restoreCommentArgs = {
  commentId: v.id("comments"),
};

/**
 * Arguments for permanently deleting a comment.
 */
export const permanentDeleteCommentArgs = {
  commentId: v.id("comments"),
};

/**
 * Arguments for replying to a comment.
 */
export const replyCommentArgs = {
  parentCommentId: v.id("comments"),
  content: v.string(),
  userAgent: v.optional(v.string()),
  ipAddress: v.optional(v.string()),
};

/**
 * Arguments for flagging a comment.
 */
export const flagCommentArgs = {
  commentId: v.id("comments"),
  reason: flagReasonValidator,
  details: v.optional(v.string()),
};

/**
 * Arguments for liking/unliking a comment (toggle).
 */
export const likeCommentArgs = {
  commentId: v.id("comments"),
};

/**
 * Arguments for bulk approve operation.
 */
export const bulkApproveArgs = {
  commentIds: v.array(v.id("comments")),
};

/**
 * Arguments for bulk spam operation.
 */
export const bulkSpamArgs = {
  commentIds: v.array(v.id("comments")),
};

/**
 * Arguments for bulk trash operation.
 */
export const bulkTrashArgs = {
  commentIds: v.array(v.id("comments")),
};

/**
 * Arguments for bulk permanent delete operation.
 */
export const bulkDeleteArgs = {
  commentIds: v.array(v.id("comments")),
  permanent: v.optional(v.boolean()),
};

// ─── Query Args ─────────────────────────────────────────────────────────────

/**
 * Arguments for admin comment list with filters and pagination.
 */
export const listCommentsArgs = {
  status: v.optional(commentApprovalStatusValidator),
  postId: v.optional(v.id("posts")),
  authorId: v.optional(v.string()),
  /** When true, filters to the current user's comments only (Mine tab). */
  mine: v.optional(v.boolean()),
  search: v.optional(v.string()),
  orderBy: v.optional(
    v.union(v.literal("createdAt"), v.literal("updatedAt")),
  ),
  orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
};

/**
 * Arguments for getting threaded comments for a post (website).
 */
export const forPostArgs = {
  postId: v.id("posts"),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
  order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
};

/**
 * Arguments for getting a single comment.
 */
export const getCommentArgs = {
  commentId: v.id("comments"),
};

/**
 * Arguments for recent comments (dashboard widget).
 */
export const recentCommentsArgs = {
  limit: v.optional(v.number()),
};
