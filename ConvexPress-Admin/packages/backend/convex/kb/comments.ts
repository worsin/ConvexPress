/**
 * Knowledge Base System - Comment Functions
 *
 * Threaded comments with voting for KB articles:
 *   listByArticle - Threaded comments for an article (public)
 *   create        - Create a comment (auth required)
 *   update        - Update own comment (auth required)
 *   deleteComment - Soft delete a comment (auth: owner or moderator)
 *   vote          - Upvote or downvote a comment (auth required)
 *   removeVote    - Remove a vote (auth required)
 *   getCount      - Comment count for an article (public)
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { KB_EVENTS, SYSTEM } from "../events/constants";
import {
  listCommentsByArticleArgs,
  createCommentArgs,
  updateCommentArgs,
  deleteCommentArgs,
  voteCommentArgs,
  removeVoteArgs,
  getCommentCountArgs,
} from "./validators";

// ─── List By Article (Public, threaded) ─────────────────────────────────────

export const listByArticle = query({
  args: listCommentsByArticleArgs,
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("kb_comments")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();

    // Only show approved, non-deleted comments
    const visible = comments.filter((c) => c.isApproved && !c.isDeleted);

    // Enrich with author info
    const enriched = await Promise.all(
      visible.map(async (comment) => {
        const author = await ctx.db.get(comment.userId);
        return {
          ...comment,
          author: author
            ? {
                _id: author._id,
                displayName: (author as any).displayName ?? author.email,
                avatarUrl: (author as any).avatarUrl,
              }
            : null,
        };
      }),
    );

    // Build threaded structure: top-level comments with nested replies
    const topLevel = enriched.filter((c) => !c.parentId);
    const replies = enriched.filter((c) => c.parentId);

    return topLevel.map((parent) => ({
      ...parent,
      replies: replies
        .filter((r) => r.parentId === parent._id)
        .sort((a, b) => a.createdAt - b.createdAt),
    }));
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createCommentArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    const content = args.content.trim();
    if (!content) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Comment content is required" });
    }

    // Validate parent if replying (max 2-level nesting)
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.articleId !== args.articleId) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Invalid parent comment" });
      }
      if (parent.parentId) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Maximum nesting depth is 2 levels" });
      }
    }

    const now = Date.now();
    const commentId = await ctx.db.insert("kb_comments", {
      articleId: args.articleId,
      userId: user._id,
      parentId: args.parentId,
      content,
      isApproved: true, // Auto-approve by default; can be changed in settings
      isEdited: false,
      isDeleted: false,
      upvotes: 0,
      downvotes: 0,
      createdAt: now,
      updatedAt: now,
    });

    await emitEvent(ctx, KB_EVENTS.COMMENT_CREATED, SYSTEM.KB, {
      commentId,
      articleId: args.articleId,
      userId: user._id,
      parentId: args.parentId,
    });

    return commentId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update = mutation({
  args: updateCommentArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Comment not found" });
    }

    // Only owner or moderator can edit
    if (comment.userId !== user._id) {
      await requireCan(ctx, "kb.moderateComments");
    }

    const content = args.content.trim();
    if (!content) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Comment content is required" });
    }

    await ctx.db.patch(args.commentId, {
      content,
      isEdited: true,
      updatedAt: Date.now(),
    });

    return args.commentId;
  },
});

// ─── Delete (Soft) ──────────────────────────────────────────────────────────

export const deleteComment = mutation({
  args: deleteCommentArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Comment not found" });
    }

    // Only owner or moderator can delete
    if (comment.userId !== user._id) {
      await requireCan(ctx, "kb.moderateComments");
    }

    await ctx.db.patch(args.commentId, {
      isDeleted: true,
      content: "[deleted]",
      updatedAt: Date.now(),
    });

    return args.commentId;
  },
});

// ─── Vote ───────────────────────────────────────────────────────────────────

export const vote = mutation({
  args: voteCommentArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Comment not found" });
    }

    // Check for existing vote
    const existingVote = await ctx.db
      .query("kb_commentVotes")
      .withIndex("by_user_comment", (q) =>
        q.eq("userId", user._id).eq("commentId", args.commentId),
      )
      .first();

    if (existingVote) {
      if (existingVote.voteType === args.voteType) {
        return existingVote._id; // Same vote already exists
      }

      // Change vote direction
      await ctx.db.patch(existingVote._id, {
        voteType: args.voteType,
        createdAt: Date.now(),
      });

      // Update denormalized counts
      if (args.voteType === "up") {
        await ctx.db.patch(args.commentId, {
          upvotes: comment.upvotes + 1,
          downvotes: Math.max(0, comment.downvotes - 1),
        });
      } else {
        await ctx.db.patch(args.commentId, {
          upvotes: Math.max(0, comment.upvotes - 1),
          downvotes: comment.downvotes + 1,
        });
      }

      return existingVote._id;
    }

    // New vote
    const voteId = await ctx.db.insert("kb_commentVotes", {
      commentId: args.commentId,
      userId: user._id,
      voteType: args.voteType,
      createdAt: Date.now(),
    });

    // Update denormalized counts
    if (args.voteType === "up") {
      await ctx.db.patch(args.commentId, { upvotes: comment.upvotes + 1 });
    } else {
      await ctx.db.patch(args.commentId, { downvotes: comment.downvotes + 1 });
    }

    return voteId;
  },
});

// ─── Remove Vote ────────────────────────────────────────────────────────────

export const removeVote = mutation({
  args: removeVoteArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const existingVote = await ctx.db
      .query("kb_commentVotes")
      .withIndex("by_user_comment", (q) =>
        q.eq("userId", user._id).eq("commentId", args.commentId),
      )
      .first();

    if (!existingVote) return null;

    const comment = await ctx.db.get(args.commentId);
    if (comment) {
      if (existingVote.voteType === "up") {
        await ctx.db.patch(args.commentId, {
          upvotes: Math.max(0, comment.upvotes - 1),
        });
      } else {
        await ctx.db.patch(args.commentId, {
          downvotes: Math.max(0, comment.downvotes - 1),
        });
      }
    }

    await ctx.db.delete(existingVote._id);
    return existingVote._id;
  },
});

// ─── Get Count (Public) ─────────────────────────────────────────────────────

export const getCount = query({
  args: getCommentCountArgs,
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("kb_comments")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();

    return comments.filter((c) => c.isApproved && !c.isDeleted).length;
  },
});
