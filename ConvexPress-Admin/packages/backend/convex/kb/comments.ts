import type { RegisteredMutation } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
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
 *
 * Comments exist only on articles that pass the public gate. For any other
 * caller than a comment moderator, a comment on a hidden (internal,
 * unpublished or restricted) article behaves exactly like a missing one.
 */

import { ConvexError } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { requireCan, getCurrentUser, currentUserCan } from "../helpers/permissions";
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
import { enrichUser } from "./helpers/enrichUser";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { readPublicKbArticle, requirePublicKbArticle } from "./publicAccess";

/** Read a comment for a non-moderator: hidden articles hide their comments. */
async function visibleComment(ctx: MutationCtx, commentId: Id<"kb_comments">): Promise<Doc<"kb_comments"> | null> {
  const comment = await ctx.db.get("kb_comments", commentId);
  if (!comment || !await readPublicKbArticle(ctx, comment.articleId)) return null;
  return comment;
}

/** Owners may change their own comments on public articles; moderators may
 * change any comment, including on articles that are no longer public. */
async function requireCommentChange(ctx: MutationCtx, commentId: Id<"kb_comments">, userId: Id<"users">): Promise<Doc<"kb_comments">> {
  const comment = await ctx.db.get("kb_comments", commentId);
  if (!comment) throw new ConvexError({ code: "NOT_FOUND", message: "Comment not found" });
  if (await currentUserCan(ctx, "kb.moderateComments")) return comment;
  if (comment.userId !== userId) await requireCan(ctx, "kb.moderateComments");
  if (!await readPublicKbArticle(ctx, comment.articleId)) throw new ConvexError({ code: "NOT_FOUND", message: "Comment not found" });
  return comment;
}

import { v } from "convex/values";
// ─── List By Article (Public, threaded) ─────────────────────────────────────

export const listByArticle = query({
  args: listCommentsByArticleArgs,
  returns: v.array(v.object({
    replies: v.array(v.object({
      author: v.union(v.null(), v.object({ _id: v.id("users"), displayName: v.string(), avatarUrl: v.optional(v.string()) })),
      _id: v.id("kb_comments"),
      _creationTime: v.number(),
      parentId: v.optional(v.id("kb_comments")),
      userId: v.id("users"),
      updatedAt: v.number(),
      createdAt: v.number(),
      content: v.string(),
      isEdited: v.boolean(),
      articleId: v.id("kb_articles"),
      isApproved: v.boolean(),
      isDeleted: v.boolean(),
      upvotes: v.number(),
      downvotes: v.number(),
    })),
    author: v.union(v.null(), v.object({ _id: v.id("users"), displayName: v.string(), avatarUrl: v.optional(v.string()) })),
    _id: v.id("kb_comments"),
    _creationTime: v.number(),
    parentId: v.optional(v.id("kb_comments")),
    userId: v.id("users"),
    updatedAt: v.number(),
    createdAt: v.number(),
    content: v.string(),
    isEdited: v.boolean(),
    articleId: v.id("kb_articles"),
    isApproved: v.boolean(),
    isDeleted: v.boolean(),
    upvotes: v.number(),
    downvotes: v.number(),
  })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return [];
    if (!await readPublicKbArticle(ctx, args.articleId)) return [];
    const comments = await ctx.db
      .query("kb_comments")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(500);

    // Only show approved, non-deleted comments
    const visible = comments.filter((c) => c.isApproved && !c.isDeleted);

    // Enrich with author info
    const enriched = await Promise.all(
      visible.map(async (comment) => {
        const author = await ctx.db.get("users", comment.userId);
        return {
          ...comment,
          author: enrichUser(author),
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
  returns: v.id("kb_comments"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    // A hidden (internal, unpublished or restricted) article is "not found".
    const article = await requirePublicKbArticle(ctx, args.articleId);

    const content = args.content.trim();
    if (!content) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Comment content is required" });
    }

    // Validate parent if replying (max 2-level nesting)
    if (args.parentId) {
      const parent = await ctx.db.get("kb_comments", args.parentId);
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
      authorId: article.authorId,
      articleTitle: article.title,
    });

    return commentId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update = mutation({
  args: updateCommentArgs,
  returns: v.id("kb_comments"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    // Only owner or moderator can edit
    await requireCommentChange(ctx, args.commentId, user._id);

    const content = args.content.trim();
    if (!content) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Comment content is required" });
    }

    await ctx.db.patch("kb_comments", args.commentId, {
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
  returns: v.id("kb_comments"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    // Only owner or moderator can delete
    await requireCommentChange(ctx, args.commentId, user._id);

    await ctx.db.patch("kb_comments", args.commentId, {
      isDeleted: true,
      content: "[deleted]",
      updatedAt: Date.now(),
    });

    return args.commentId;
  },
});

// ─── Vote ───────────────────────────────────────────────────────────────────

export const vote: RegisteredMutation<"public", { commentId: Id<"kb_comments">; voteType: "up" | "down" }, Id<"kb_commentVotes">> = mutation({
  args: voteCommentArgs,
  returns: v.id("kb_commentVotes"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const comment = await visibleComment(ctx, args.commentId);
    if (!comment) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Comment not found" });
    }

    if (comment.isDeleted) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Cannot vote on a deleted comment" });
    }
    if (!comment.isApproved) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Cannot vote on an unapproved comment" });
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
      await ctx.db.patch("kb_commentVotes", existingVote._id, {
        voteType: args.voteType,
        createdAt: Date.now(),
      });

      // Update denormalized counts
      if (args.voteType === "up") {
        await ctx.db.patch("kb_comments", args.commentId, {
          upvotes: comment.upvotes + 1,
          downvotes: Math.max(0, comment.downvotes - 1),
        });
      } else {
        await ctx.db.patch("kb_comments", args.commentId, {
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
      await ctx.db.patch("kb_comments", args.commentId, { upvotes: comment.upvotes + 1 });
    } else {
      await ctx.db.patch("kb_comments", args.commentId, { downvotes: comment.downvotes + 1 });
    }

    return voteId;
  },
});

// ─── Remove Vote ────────────────────────────────────────────────────────────

export const removeVote: RegisteredMutation<"public", { commentId: Id<"kb_comments"> }, Id<"kb_commentVotes"> | null> = mutation({
  args: removeVoteArgs,
  returns: v.union(v.null(), v.id("kb_commentVotes")),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
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

    const comment = await ctx.db.get("kb_comments", args.commentId);
    // A vote on a hidden article's comment is reported as absent.
    if (comment && !await readPublicKbArticle(ctx, comment.articleId)) return null;
    if (comment) {
      if (existingVote.voteType === "up") {
        await ctx.db.patch("kb_comments", args.commentId, {
          upvotes: Math.max(0, comment.upvotes - 1),
        });
      } else {
        await ctx.db.patch("kb_comments", args.commentId, {
          downvotes: Math.max(0, comment.downvotes - 1),
        });
      }
    }

    await ctx.db.delete("kb_commentVotes", existingVote._id);
    return existingVote._id;
  },
});

// ─── Get Count (Public) ─────────────────────────────────────────────────────

export const getCount = query({
  args: getCommentCountArgs,
  returns: v.union(v.null(), v.number()),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    // A hidden article reports the same count as an article with no comments.
    if (!await readPublicKbArticle(ctx, args.articleId)) return 0;
    const comments = await ctx.db
      .query("kb_comments")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(1000);

    return comments.filter((c) => c.isApproved && !c.isDeleted).length;
  },
});
