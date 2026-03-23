/**
 * Comment System - Queries
 *
 * All read operations for comments:
 *   list         - Admin comment list (paginated, filterable by status/post/author)
 *   forPost      - Threaded comments for a specific post (website, public)
 *   get          - Single comment detail
 *   counts       - Count by status (all/approved/pending/spam/trash/mine)
 *   pendingCount - Pending comment count for admin sidebar badge
 *   recent       - Recent comments for dashboard widget
 *
 * Authorization:
 *   - list: requires auth; moderate_comments for pending/spam/trash tabs
 *   - forPost: public (no auth required for approved comments)
 *   - get: auth-aware visibility checks
 *   - counts: requires auth
 *   - pendingCount: requires auth
 *   - recent: requires auth + moderate_comments
 */

import { ConvexError } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser, currentUserCan, getUserIdentifier } from "../helpers/permissions";
import { getDiscussionSettings, buildCommentTree } from "../helpers/comment";
import {
  listCommentsArgs,
  forPostArgs,
  getCommentArgs,
  recentCommentsArgs,
  DEFAULT_PER_PAGE_ADMIN,
  MAX_PER_PAGE,
} from "./validators";

// ─── List (Admin) ────────────────────────────────────────────────────────────

/**
 * Paginated comment list with filters for the admin "All Comments" screen.
 *
 * Requires authentication. Non-moderators can only see approved + their own.
 * Moderators see all comments including pending/spam/trash.
 *
 * Supports filtering by status, postId, authorId, and text search.
 */
export const list = query({
  args: listCommentsArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const isModerator = await currentUserCan(ctx, "comment.approve");
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(
      MAX_PER_PAGE,
      Math.max(1, args.perPage ?? DEFAULT_PER_PAGE_ADMIN),
    );
    const orderBy = args.orderBy ?? "createdAt";
    const orderDir = args.orderDir ?? "desc";

    // Resolve "mine" filter to the current user's authorId
    const effectiveAuthorId = args.mine
      ? getUserIdentifier(user)
      : args.authorId;

    // ── Build query based on filters ────────────────────────────────────
    // Choose the best index for the given filter combination to minimize
    // in-memory filtering. Index priority:
    //   1. status + postId -> by_status_post index (both fields in index)
    //   2. status only -> by_status index
    //   3. postId only -> by_post index
    //   4. authorId only -> by_author index
    //   5. No filters -> combine by_status queries for all statuses
    let allComments;

    if (args.status && args.postId) {
      // Use by_status_post index for status + postId cross-filter
      // Bounded to 10,000 comments per query
      allComments = await ctx.db
        .query("comments")
        .withIndex("by_status_post", (q) =>
          q.eq("status", args.status!).eq("postId", args.postId!),
        )
        .take(10000);
    } else if (args.status) {
      // Filter by specific status
      allComments = await ctx.db
        .query("comments")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .take(10000);
    } else if (args.postId) {
      // Filter by post
      allComments = await ctx.db
        .query("comments")
        .withIndex("by_post", (q) => q.eq("postId", args.postId!))
        .take(10000);
    } else if (effectiveAuthorId) {
      // Filter by author
      allComments = await ctx.db
        .query("comments")
        .withIndex("by_author", (q) => q.eq("authorId", effectiveAuthorId!))
        .take(10000);
    } else {
      // All comments - fetch by status to avoid scanning entire table
      // Combine results from all statuses, bounded to 10,000 per status
      const [approved, pending, spam, trash] = await Promise.all([
        ctx.db
          .query("comments")
          .withIndex("by_status", (q) => q.eq("status", "approved"))
          .take(10000),
        ctx.db
          .query("comments")
          .withIndex("by_status", (q) => q.eq("status", "pending"))
          .take(10000),
        ctx.db
          .query("comments")
          .withIndex("by_status", (q) => q.eq("status", "spam"))
          .take(10000),
        ctx.db
          .query("comments")
          .withIndex("by_status", (q) => q.eq("status", "trash"))
          .take(10000),
      ]);
      allComments = [...approved, ...pending, ...spam, ...trash];
    }

    // ── Apply remaining cross-filters not covered by the index ──────────
    let filtered = allComments;

    // If status + authorId: authorId wasn't part of the index query
    if (effectiveAuthorId && args.status) {
      filtered = filtered.filter((c) => c.authorId === effectiveAuthorId);
    }

    // If postId + authorId (no status): authorId not in the by_post index
    if (args.postId && effectiveAuthorId && !args.status) {
      filtered = filtered.filter((c) => c.authorId === effectiveAuthorId);
    }

    // If status + postId + authorId: postId was in index, but authorId was not
    if (args.status && args.postId && effectiveAuthorId) {
      filtered = filtered.filter((c) => c.authorId === effectiveAuthorId);
    }

    // Text search
    if (args.search && args.search.trim()) {
      const searchLower = args.search.trim().toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.content.toLowerCase().includes(searchLower) ||
          c.authorName.toLowerCase().includes(searchLower),
      );
    }

    // ── Role-based filtering ────────────────────────────────────────────
    if (!isModerator) {
      // Non-moderators only see approved + their own
      filtered = filtered.filter(
        (c) =>
          c.status === "approved" || c.authorId === getUserIdentifier(user),
      );
    }

    // ── Sort ────────────────────────────────────────────────────────────
    filtered.sort((a, b) => {
      const aVal = orderBy === "updatedAt" ? a.updatedAt : a.createdAt;
      const bVal = orderBy === "updatedAt" ? b.updatedAt : b.createdAt;

      return orderDir === "asc" ? aVal - bVal : bVal - aVal;
    });

    // ── Paginate ────────────────────────────────────────────────────────
    const total = filtered.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const comments = filtered.slice(offset, offset + perPage);

    // ── Denormalize post titles ─────────────────────────────────────────
    const commentsWithPost = await Promise.all(
      comments.map(async (comment) => {
        const post = await ctx.db.get("posts", comment.postId);
        return {
          ...comment,
          postTitle: post?.title ?? "[Deleted Post]",
          postSlug: post?.slug,
        };
      }),
    );

    return { comments: commentsWithPost, total, page, perPage, totalPages };
  },
});

// ─── For Post (Website) ──────────────────────────────────────────────────────

/**
 * Get threaded comments for a specific post.
 * Public query - no auth required for approved comments.
 * If authenticated, includes isLikedByMe status.
 *
 * Returns a flat array (tree building happens on the client or here).
 */
export const forPost = query({
  args: forPostArgs,
  handler: async (ctx, args) => {
    // Verify post exists
    const post = await ctx.db.get("posts", args.postId);
    if (!post || post.status !== "publish") {
      return { comments: [], total: 0, page: 1, perPage: 50, totalPages: 0 };
    }

    const settings = await getDiscussionSettings(ctx);

    const order = args.order ?? settings.commentOrder;
    const perPage = Math.min(
      MAX_PER_PAGE,
      Math.max(1, args.perPage ?? settings.commentsPerPage),
    );
    const page = Math.max(1, args.page ?? 1);

    // ── Fetch all approved comments for this post ───────────────────────
    // The by_post index is [postId, status, createdAt], so after fixing
    // postId and status, results are naturally ordered by createdAt.
    // Bounded to 5000 comments per post - sufficient for most discussions.
    const allComments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) =>
        q.eq("postId", args.postId).eq("status", "approved"),
      )
      .order(order)
      .take(5000);

    // ── Get current user's likes (if authenticated) ─────────────────────
    const currentUser = await getCurrentUser(ctx);
    const likedCommentIds = new Set<string>();

    if (currentUser) {
      // Bounded to 10,000 likes per user
      const userLikes = await ctx.db
        .query("commentLikes")
        .withIndex("by_user", (q) => q.eq("userId", getUserIdentifier(currentUser)))
        .take(10000);

      const commentIdSet = new Set(allComments.map((c) => c._id.toString()));
      for (const like of userLikes) {
        if (commentIdSet.has(like.commentId.toString())) {
          likedCommentIds.add(like.commentId.toString());
        }
      }
    }

    // ── Build threaded tree ──────────────────────────────────────────────
    const tree = buildCommentTree(allComments, {
      likedCommentIds,
      currentUserId: currentUser ? getUserIdentifier(currentUser) : undefined,
      gracePeriodSeconds: settings.commentEditGracePeriod,
    });

    // ── Paginate top-level comments ─────────────────────────────────────
    const total = tree.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const paginatedTree = tree.slice(offset, offset + perPage);

    return {
      comments: paginatedTree,
      total,
      page,
      perPage,
      totalPages,
      commentStatus: post.commentStatus,
    };
  },
});

// ─── Get ─────────────────────────────────────────────────────────────────────

/**
 * Get a single comment by ID.
 * Visibility checks:
 *   - approved: visible to all authenticated users
 *   - pending: visible to author + moderators
 *   - spam/trash: moderators only
 */
export const get = query({
  args: getCommentArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) return null;

    const isModerator = await currentUserCan(ctx, "comment.approve");
    const isOwner = comment.authorId === getUserIdentifier(user);

    // Visibility checks
    switch (comment.status) {
      case "approved":
        break; // Visible to all authenticated users
      case "pending":
        if (!isOwner && !isModerator) return null;
        break;
      case "spam":
      case "trash":
        if (!isModerator) return null;
        break;
    }

    // Get post info
    const post = await ctx.db.get("posts", comment.postId);

    // Check if current user liked this comment
    const existingLike = await ctx.db
      .query("commentLikes")
      .withIndex("by_user_comment", (q) =>
        q.eq("userId", getUserIdentifier(user)).eq("commentId", args.commentId),
      )
      .unique();

    // Get parent comment preview if reply
    let parentPreview = null;
    if (comment.parentId) {
      const parent = await ctx.db.get("comments", comment.parentId);
      if (parent) {
        parentPreview = {
          _id: parent._id,
          authorName: parent.authorName,
          content:
            parent.content.length > 100
              ? parent.content.substring(0, 100) + "..."
              : parent.content,
        };
      }
    }

    return {
      ...comment,
      postTitle: post?.title ?? "[Deleted Post]",
      postSlug: post?.slug,
      isLikedByMe: !!existingLike,
      parentPreview,
    };
  },
});

// ─── Counts ──────────────────────────────────────────────────────────────────

/**
 * Count comments by status for the admin tabs.
 * Returns { all, approved, pending, spam, trash, mine }.
 * `all` = approved + pending (not spam/trash).
 */
export const counts = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // Use targeted index queries per status to count efficiently.
    // Each query only scans the index range for that status.
    // We count by collecting and measuring length since Convex doesn't
    // have a native count() operator, but the index narrows the scan.
    const [approvedCount, pendingCount, spamCount, trashCount] =
      await Promise.all([
        ctx.db
          .query("comments")
          .withIndex("by_status", (q) => q.eq("status", "approved"))
          .take(10000)
          .then((r) => r.length),
        ctx.db
          .query("comments")
          .withIndex("by_status", (q) => q.eq("status", "pending"))
          .take(10000)
          .then((r) => r.length),
        ctx.db
          .query("comments")
          .withIndex("by_status", (q) => q.eq("status", "spam"))
          .take(10000)
          .then((r) => r.length),
        ctx.db
          .query("comments")
          .withIndex("by_status", (q) => q.eq("status", "trash"))
          .take(10000)
          .then((r) => r.length),
      ]);

    // Count "mine" (current user's non-trash comments)
    // Uses the by_author index to narrow to this user's comments only
    const allByMe = await ctx.db
      .query("comments")
      .withIndex("by_author", (q) => q.eq("authorId", getUserIdentifier(user)))
      .take(10000);
    const mine = allByMe.filter((c) => c.status !== "trash").length;

    return {
      all: approvedCount + pendingCount,
      approved: approvedCount,
      pending: pendingCount,
      spam: spamCount,
      trash: trashCount,
      mine,
    };
  },
});

// ─── Pending Count ───────────────────────────────────────────────────────────

/**
 * Count of pending comments for the admin sidebar badge.
 * Lightweight query - just returns a number.
 */
export const pendingCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return 0;

    const pending = await ctx.db
      .query("comments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(10000);

    return pending.length;
  },
});

// ─── Recent ──────────────────────────────────────────────────────────────────

/**
 * Recent comments for the admin dashboard widget.
 * Returns the most recent N comments across all posts.
 * Requires authentication + moderate_comments capability.
 */
export const recent = query({
  args: recentCommentsArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const isModerator = await currentUserCan(ctx, "comment.approve");
    if (!isModerator) return [];

    const limit = Math.min(args.limit ?? 5, 20);

    // Get recent comments (approved + pending, sorted by createdAt desc)
    const recentApproved = await ctx.db
      .query("comments")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .order("desc")
      .take(limit);

    const recentPending = await ctx.db
      .query("comments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(limit);

    // Merge, sort, and take the top N
    const combined = [...recentApproved, ...recentPending]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    // Denormalize post titles
    const withPostInfo = await Promise.all(
      combined.map(async (comment) => {
        const post = await ctx.db.get("posts", comment.postId);
        return {
          _id: comment._id,
          content:
            comment.content.length > 50
              ? comment.content.substring(0, 50) + "..."
              : comment.content,
          status: comment.status,
          authorId: comment.authorId,
          authorName: comment.authorName,
          authorAvatarUrl: comment.authorAvatarUrl,
          postId: comment.postId,
          postTitle: post?.title ?? "[Deleted Post]",
          postSlug: post?.slug,
          createdAt: comment.createdAt,
        };
      }),
    );

    return withPostInfo;
  },
});
