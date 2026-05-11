/**
 * Knowledge Base System - Bookmark Functions
 *
 * User bookmark management:
 *   list         - List all bookmarks for the current user (auth required)
 *   isBookmarked - Check if an article is bookmarked (auth required)
 *   toggle       - Toggle bookmark on/off (auth required)
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { toggleBookmarkArgs, isBookmarkedArgs } from "./validators";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";

// ─── List ───────────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return [];
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const bookmarks = await ctx.db
      .query("kb_bookmarks")
      .withIndex("by_user", (q: ConvexQueryBuilder) => q.eq("userId", user._id))
      .order("desc")
      .take(500);

    // Enrich with article details
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return Promise.all(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      bookmarks.map(async (bookmark) => {
        const article = await ctx.db.get("kb_articles", bookmark.articleId);
        return {
          ...bookmark,
          article: article
            ? {
                _id: article._id,
                title: article.title,
                slug: article.slug,
                excerpt: article.excerpt,
                status: article.status,
                categoryId: article.categoryId,
              }
            : null,
        };
      }),
    );
  },
});

// ─── Is Bookmarked ──────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const isBookmarked = query({
  args: isBookmarkedArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) return false;

    const bookmark = await ctx.db
      .query("kb_bookmarks")
      .withIndex("by_user_article", (q: ConvexQueryBuilder) =>
        q.eq("userId", user._id).eq("articleId", args.articleId),
      )
      .first();

    return !!bookmark;
  },
});

// ─── Toggle ─────────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const toggle = mutation({
  args: toggleBookmarkArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const existing = await ctx.db
      .query("kb_bookmarks")
      .withIndex("by_user_article", (q: ConvexQueryBuilder) =>
        q.eq("userId", user._id).eq("articleId", args.articleId),
      )
      .first();

    if (existing) {
      await ctx.db.delete("kb_bookmarks", existing._id);
      return { bookmarked: false };
    }

    await ctx.db.insert("kb_bookmarks", {
      userId: user._id,
      articleId: args.articleId,
      notes: args.notes,
      createdAt: Date.now(),
    });

    return { bookmarked: true };
  },
});
