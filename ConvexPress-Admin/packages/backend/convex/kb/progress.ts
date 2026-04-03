/**
 * Knowledge Base System - User Progress Functions
 *
 * Reading progress tracking:
 *   getProgress    - Get reading progress for an article (auth required)
 *   trackProgress  - Update reading progress (auth required)
 *   getUserHistory - Get recent reading history (auth required)
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { getProgressArgs, trackProgressArgs } from "./validators";

// ─── Get Progress ───────────────────────────────────────────────────────────

export const getProgress = query({
  args: getProgressArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return ctx.db
      .query("kb_userProgress")
      .withIndex("by_user_article", (q) =>
        q.eq("userId", user._id).eq("articleId", args.articleId),
      )
      .first();
  },
});

// ─── Track Progress ─────────────────────────────────────────────────────────

export const trackProgress = mutation({
  args: trackProgressArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    if (args.progressPercent < 0 || args.progressPercent > 100) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Progress must be between 0 and 100" });
    }
    if (args.scrollPosition < 0) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Scroll position must be non-negative" });
    }
    if (args.readTime < 0) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Read time must be non-negative" });
    }

    const existing = await ctx.db
      .query("kb_userProgress")
      .withIndex("by_user_article", (q) =>
        q.eq("userId", user._id).eq("articleId", args.articleId),
      )
      .first();

    const now = Date.now();

    if (existing) {
      // Only update if progress increased
      const newPercent = Math.max(existing.progressPercent, args.progressPercent);
      const newReadTime = existing.readTime + args.readTime;
      const completed = args.completedRead ?? (newPercent >= 90);

      await ctx.db.patch(existing._id, {
        progressPercent: newPercent,
        scrollPosition: args.scrollPosition,
        lastReadAt: now,
        readTime: newReadTime,
        completedRead: completed || existing.completedRead,
      });

      return existing._id;
    }

    const progressId = await ctx.db.insert("kb_userProgress", {
      userId: user._id,
      articleId: args.articleId,
      progressPercent: args.progressPercent,
      scrollPosition: args.scrollPosition,
      lastReadAt: now,
      readTime: args.readTime,
      completedRead: args.completedRead ?? (args.progressPercent >= 90),
    });

    return progressId;
  },
});

// ─── Get User History ───────────────────────────────────────────────────────

export const getUserHistory = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const progress = await ctx.db
      .query("kb_userProgress")
      .withIndex("by_user_recent", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(20);

    return Promise.all(
      progress.map(async (p) => {
        const article = await ctx.db.get(p.articleId);
        return {
          ...p,
          article: article
            ? {
                _id: article._id,
                title: article.title,
                slug: article.slug,
                categoryId: article.categoryId,
              }
            : null,
        };
      }),
    );
  },
});
