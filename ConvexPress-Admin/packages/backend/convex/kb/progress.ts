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
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";

// ─── Get Progress ───────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getProgress = query({
  args: getProgressArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return ctx.db
      .query("kb_userProgress")
      .withIndex("by_user_article", (q: ConvexQueryBuilder) =>
        q.eq("userId", user._id).eq("articleId", args.articleId),
      )
      .first();
  },
});

// ─── Track Progress ─────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const trackProgress = mutation({
  args: trackProgressArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
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
      .withIndex("by_user_article", (q: ConvexQueryBuilder) =>
        q.eq("userId", user._id).eq("articleId", args.articleId),
      )
      .first();

    const now = Date.now();

    if (existing) {
      // Only update if progress increased
      const newPercent = Math.max(existing.progressPercent, args.progressPercent);
      const newReadTime = existing.readTime + args.readTime;
      const completed = args.completedRead ?? (newPercent >= 90);

      await ctx.db.patch("kb_userProgress", existing._id, {
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getUserHistory = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return [];
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const progress = await ctx.db
      .query("kb_userProgress")
      .withIndex("by_user_recent", (q: ConvexQueryBuilder) => q.eq("userId", user._id))
      .order("desc")
      .take(20);

    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return Promise.all(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      progress.map(async (p) => {
        const article = await ctx.db.get("kb_articles", p.articleId);
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
