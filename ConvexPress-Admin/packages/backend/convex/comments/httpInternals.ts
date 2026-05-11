/**
 * Comment System - HTTP API Internal Functions
 *
 * These internal functions are used exclusively by HTTP actions (httpAction).
 * They are NOT client-callable, providing a security layer between the public
 * HTTP API and the database operations.
 *
 * This addresses security issue H-17: HTTP actions should use internal functions
 * instead of public API functions.
 *
 * Functions:
 *   listInternal           - List comments for HTTP API
 *   getInternal            - Get single comment for HTTP API
 *   createInternal         - Create comment via HTTP API
 *   updateInternal         - Update comment via HTTP API
 *   trashInternal          - Trash comment via HTTP API
 *   permanentDeleteInternal - Permanently delete comment via HTTP API
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { emitEvent } from "../helpers/events";
import { COMMENT_EVENTS, SYSTEM } from "../events/constants";
import {
  sanitizeCommentContent,
  getDiscussionSettings,
  deleteCommentAndRelated,
} from "../helpers/comment";

const MAX_CONTENT_LENGTH = 10000;
const MIN_CONTENT_LENGTH = 1;

/**
 * Internal version of list for HTTP API.
 * No client-side auth - caller (HTTP handler) handles API key auth.
 */
export const listInternal = internalQuery({
  args: {
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
    status: v.optional(v.union(
      v.literal("approved"),
      v.literal("pending"),
      v.literal("spam"),
      v.literal("trash"),
    )),
    postId: v.optional(v.id("posts")),
    search: v.optional(v.string()),
    orderBy: v.optional(v.string()),
    orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 20));
    const orderBy = args.orderBy ?? "createdAt";
    const orderDir = args.orderDir ?? "desc";

    // Build query based on filters
    let allComments;

    if (args.status && args.postId) {
      allComments = await ctx.db
        .query("comments")
        .withIndex("by_status_post", (q) =>
          q.eq("status", args.status!).eq("postId", args.postId!),
        )
        .collect();
    } else if (args.status) {
      allComments = await ctx.db
        .query("comments")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else if (args.postId) {
      allComments = await ctx.db
        .query("comments")
        .withIndex("by_post", (q) => q.eq("postId", args.postId!))
        .collect();
    } else {
      // All comments
      const [approved, pending, spam, trash] = await Promise.all([
        ctx.db.query("comments").withIndex("by_status", (q) => q.eq("status", "approved")).collect(),
        ctx.db.query("comments").withIndex("by_status", (q) => q.eq("status", "pending")).collect(),
        ctx.db.query("comments").withIndex("by_status", (q) => q.eq("status", "spam")).collect(),
        ctx.db.query("comments").withIndex("by_status", (q) => q.eq("status", "trash")).collect(),
      ]);
      allComments = [...approved, ...pending, ...spam, ...trash];
    }

    // Text search
    let filtered = allComments;
    if (args.search && args.search.trim()) {
      const searchLower = args.search.trim().toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.content.toLowerCase().includes(searchLower) ||
          c.authorName.toLowerCase().includes(searchLower),
      );
    }

    // Sort
    filtered.sort((a, b) => {
      const aVal = orderBy === "updatedAt" ? a.updatedAt : a.createdAt;
      const bVal = orderBy === "updatedAt" ? b.updatedAt : b.createdAt;
      return orderDir === "asc" ? aVal - bVal : bVal - aVal;
    });

    // Paginate
    const total = filtered.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const comments = filtered.slice(offset, offset + perPage);

    // Denormalize post titles
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

/**
 * Internal version of get for HTTP API.
 */
export const getInternal = internalQuery({
  args: {
    commentId: v.id("comments"),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) return null;

    const post = await ctx.db.get("posts", comment.postId);

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
      parentPreview,
    };
  },
});

/**
 * Internal version of create for HTTP API.
 */
export const createInternal = internalMutation({
  args: {
    postId: v.id("posts"),
    content: v.string(),
    parentId: v.optional(v.id("comments")),
    authorId: v.string(),
    authorName: v.string(),
    authorEmail: v.string(),
    authorAvatarUrl: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate post
    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new Error("Post not found");
    }
    if (post.status !== "publish") {
      throw new Error("Comments are only allowed on published posts");
    }
    if (post.commentStatus !== "open") {
      throw new Error("Comments are closed on this post");
    }

    // Validate content
    const trimmed = args.content.trim();
    if (trimmed.length < MIN_CONTENT_LENGTH) {
      throw new Error("Comment content cannot be empty");
    }
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      throw new Error(`Comment content must be ${MAX_CONTENT_LENGTH} characters or fewer`);
    }
    const sanitizedContent = sanitizeCommentContent(trimmed);

    // Threading
    let depth = 0;
    if (args.parentId) {
      const parentComment = await ctx.db.get("comments", args.parentId);
      if (!parentComment) {
        throw new Error("Parent comment not found");
      }
      if (parentComment.postId.toString() !== args.postId.toString()) {
        throw new Error("Parent comment belongs to a different post");
      }
      depth = parentComment.depth + 1;
    }

    // Get settings for moderation
    const settings = await getDiscussionSettings(ctx);
    const initialStatus = settings.commentModeration ? "pending" : "approved";

    const now = Date.now();

    const commentId = await ctx.db.insert("comments", {
      postId: args.postId,
      content: sanitizedContent,
      status: initialStatus,
      authorId: args.authorId,
      authorName: args.authorName,
      authorAvatarUrl: args.authorAvatarUrl,
      parentId: args.parentId,
      depth,
      likeCount: 0,
      flagCount: 0,
      isEdited: false,
      createdAt: now,
      updatedAt: now,
    });

    // If approved, increment comment count
    if (initialStatus === "approved") {
      const currentCount = post.commentCount ?? 0;
      await ctx.db.patch("posts", args.postId, {
        commentCount: currentCount + 1,
      });
    }

    // Emit event
    await emitEvent(ctx, COMMENT_EVENTS.CREATED, SYSTEM.COMMENT, {
      commentId,
      postId: args.postId,
      authorId: args.authorId,
      status: initialStatus,
      isReply: !!args.parentId,
    });

    return { commentId, status: initialStatus };
  },
});

/**
 * Internal version of update for HTTP API.
 */
export const updateInternal = internalMutation({
  args: {
    commentId: v.id("comments"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    // Validate content
    const trimmed = args.content.trim();
    if (trimmed.length < MIN_CONTENT_LENGTH) {
      throw new Error("Comment content cannot be empty");
    }
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      throw new Error(`Comment content must be ${MAX_CONTENT_LENGTH} characters or fewer`);
    }
    const sanitizedContent = sanitizeCommentContent(trimmed);

    const now = Date.now();
    await ctx.db.patch("comments", args.commentId, {
      content: sanitizedContent,
      isEdited: true,
      editedAt: now,
      updatedAt: now,
    });

    await emitEvent(ctx, COMMENT_EVENTS.UPDATED, SYSTEM.COMMENT, {
      commentId: args.commentId,
      postId: comment.postId,
    });

    return args.commentId;
  },
});

/**
 * Internal version of trash for HTTP API.
 */
export const trashInternal = internalMutation({
  args: {
    commentId: v.id("comments"),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }
    if (comment.status === "trash") {
      throw new Error("Comment is already in trash");
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

    await emitEvent(ctx, COMMENT_EVENTS.DELETED, SYSTEM.COMMENT, {
      commentId: args.commentId,
      postId: comment.postId,
      permanent: false,
    });

    return { success: true };
  },
});

/**
 * Internal version of permanentDelete for HTTP API.
 */
export const permanentDeleteInternal = internalMutation({
  args: {
    commentId: v.id("comments"),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }
    if (comment.status !== "trash" && comment.status !== "spam") {
      throw new Error("Comment must be in trash or spam before permanent deletion");
    }

    // Handle child comments: re-parent approved/pending, cascade-delete trash/spam
    const children = await ctx.db
      .query("comments")
      .withIndex("by_post_parent", (q) =>
        q.eq("postId", comment.postId).eq("parentId", args.commentId),
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
      commentId: args.commentId,
      postId: comment.postId,
      permanent: true,
    };

    await deleteCommentAndRelated(ctx, args.commentId);

    await emitEvent(ctx, COMMENT_EVENTS.DELETED, SYSTEM.COMMENT, eventPayload);

    return { success: true };
  },
});
