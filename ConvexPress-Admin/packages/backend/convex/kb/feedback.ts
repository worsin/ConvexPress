/**
 * Knowledge Base System - Feedback Functions
 *
 * Helpful/not-helpful feedback and star ratings for articles:
 *   submitHelpful     - Submit helpful/not-helpful feedback (session-deduplicated)
 *   submitRating      - Submit a star rating (session-deduplicated)
 *   getArticleStats   - Aggregate feedback stats for an article (public)
 *   getUserFeedback   - Check if session has already provided feedback (public)
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { KB_EVENTS, SYSTEM } from "../events/constants";
import {
  submitHelpfulArgs,
  submitRatingArgs,
  getArticleFeedbackStatsArgs,
  getUserFeedbackArgs,
} from "./validators";

// ─── Submit Helpful ─────────────────────────────────────────────────────────

export const submitHelpful = mutation({
  args: submitHelpfulArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    if (!args.sessionId || args.sessionId.length > 128) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Invalid session ID" });
    }

    const MAX_FEEDBACK_COMMENT = 1000;
    if (args.comment && args.comment.length > MAX_FEEDBACK_COMMENT) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Comment too long" });
    }

    // Check for existing feedback from this session
    const existing = await ctx.db
      .query("kb_articleFeedback")
      .withIndex("by_session_article", (q) =>
        q.eq("sessionId", args.sessionId).eq("articleId", args.articleId),
      )
      .first();

    if (existing) {
      // Update existing feedback
      const oldIsHelpful = existing.isHelpful;
      await ctx.db.patch(existing._id, {
        isHelpful: args.isHelpful,
        comment: args.comment,
      });

      // Update denormalized counts on article
      const article = await ctx.db.get(args.articleId);
      if (article && oldIsHelpful !== args.isHelpful) {
        if (args.isHelpful) {
          await ctx.db.patch(args.articleId, {
            helpfulVotes: article.helpfulVotes + 1,
            notHelpfulVotes: Math.max(0, article.notHelpfulVotes - 1),
          });
        } else {
          await ctx.db.patch(args.articleId, {
            helpfulVotes: Math.max(0, article.helpfulVotes - 1),
            notHelpfulVotes: article.notHelpfulVotes + 1,
          });
        }
      }

      return existing._id;
    }

    // Create new feedback
    const feedbackId = await ctx.db.insert("kb_articleFeedback", {
      articleId: args.articleId,
      userId: user?._id,
      sessionId: args.sessionId,
      isHelpful: args.isHelpful,
      comment: args.comment,
      createdAt: Date.now(),
    });

    // Update denormalized counts
    const article = await ctx.db.get(args.articleId);
    if (article) {
      if (args.isHelpful) {
        await ctx.db.patch(args.articleId, {
          helpfulVotes: article.helpfulVotes + 1,
        });
      } else {
        await ctx.db.patch(args.articleId, {
          notHelpfulVotes: article.notHelpfulVotes + 1,
        });
      }
    }

    await emitEvent(ctx, KB_EVENTS.FEEDBACK_SUBMITTED, SYSTEM.KB, {
      feedbackId,
      articleId: args.articleId,
      isHelpful: args.isHelpful,
    });

    return feedbackId;
  },
});

// ─── Submit Rating ──────────────────────────────────────────────────────────

export const submitRating = mutation({
  args: submitRatingArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    if (!args.sessionId || args.sessionId.length > 128) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Invalid session ID" });
    }

    if (args.rating < 1 || args.rating > 5 || !Number.isInteger(args.rating)) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Rating must be an integer between 1 and 5" });
    }

    const MAX_FEEDBACK_COMMENT = 1000;
    if (args.comment && args.comment.length > MAX_FEEDBACK_COMMENT) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Comment too long" });
    }

    // Check for existing feedback from this session
    const existing = await ctx.db
      .query("kb_articleFeedback")
      .withIndex("by_session_article", (q) =>
        q.eq("sessionId", args.sessionId).eq("articleId", args.articleId),
      )
      .first();

    if (existing) {
      const newIsHelpful = args.rating >= 4;
      const oldIsHelpful = existing.isHelpful;
      await ctx.db.patch(existing._id, {
        rating: args.rating,
        comment: args.comment,
        isHelpful: newIsHelpful,
      });
      if (newIsHelpful !== oldIsHelpful) {
        const article = await ctx.db.get(args.articleId);
        if (article) {
          if (newIsHelpful) {
            await ctx.db.patch(args.articleId, {
              helpfulVotes: article.helpfulVotes + 1,
              notHelpfulVotes: Math.max(0, article.notHelpfulVotes - 1),
            });
          } else {
            await ctx.db.patch(args.articleId, {
              notHelpfulVotes: article.notHelpfulVotes + 1,
              helpfulVotes: Math.max(0, article.helpfulVotes - 1),
            });
          }
        }
      }
      return existing._id;
    }

    const isHelpful = args.rating >= 4;
    const feedbackId = await ctx.db.insert("kb_articleFeedback", {
      articleId: args.articleId,
      userId: user?._id,
      sessionId: args.sessionId,
      isHelpful,
      rating: args.rating,
      comment: args.comment,
      createdAt: Date.now(),
    });

    // Update denormalized counts on article
    const article = await ctx.db.get(args.articleId);
    if (article) {
      if (isHelpful) {
        await ctx.db.patch(args.articleId, { helpfulVotes: article.helpfulVotes + 1 });
      } else {
        await ctx.db.patch(args.articleId, { notHelpfulVotes: article.notHelpfulVotes + 1 });
      }
    }

    return feedbackId;
  },
});

// ─── Get Article Stats (Public) ─────────────────────────────────────────────

export const getArticleStats = query({
  args: getArticleFeedbackStatsArgs,
  handler: async (ctx, args) => {
    const feedback = await ctx.db
      .query("kb_articleFeedback")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();

    const helpful = feedback.filter((f) => f.isHelpful).length;
    const notHelpful = feedback.filter((f) => !f.isHelpful).length;
    const ratings = feedback.filter((f) => f.rating !== undefined);
    const avgRating = ratings.length > 0
      ? ratings.reduce((sum, f) => sum + (f.rating ?? 0), 0) / ratings.length
      : null;

    return {
      totalFeedback: feedback.length,
      helpful,
      notHelpful,
      helpfulPercent: feedback.length > 0 ? Math.round((helpful / feedback.length) * 100) : 0,
      avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      ratingCount: ratings.length,
    };
  },
});

// ─── Get User Feedback (Public) ─────────────────────────────────────────────

export const getUserFeedback = query({
  args: getUserFeedbackArgs,
  handler: async (ctx, args) => {
    return ctx.db
      .query("kb_articleFeedback")
      .withIndex("by_session_article", (q) =>
        q.eq("sessionId", args.sessionId).eq("articleId", args.articleId),
      )
      .first();
  },
});
