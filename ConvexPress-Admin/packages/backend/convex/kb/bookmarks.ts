import type { RegisteredQuery, RegisteredMutation } from "convex/server";
import type { Id } from "../_generated/dataModel";
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

import { v } from "convex/values";
// ─── List ───────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  returns: v.array(v.object({
    article: v.union(v.null(), v.object({
      _id: v.id("kb_articles"),
      title: v.string(),
      slug: v.string(),
      excerpt: v.string(),
      status: v.union(v.literal("draft"), v.literal("archived"), v.literal("review"), v.literal("published")),
      categoryId: v.optional(v.id("kb_categories")),
    })),
    _id: v.id("kb_bookmarks"),
    _creationTime: v.number(),
    notes: v.optional(v.string()),
    userId: v.id("users"),
    createdAt: v.number(),
    articleId: v.id("kb_articles"),
  })),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return [];
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const bookmarks = await ctx.db
      .query("kb_bookmarks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(500);

    // Enrich with article details
    return Promise.all(
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

export const isBookmarked: RegisteredQuery<"public", { articleId: Id<"kb_articles"> }, boolean | null> = query({
  args: isBookmarkedArgs,
  returns: v.union(v.boolean(), v.null()),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) return false;

    const bookmark = await ctx.db
      .query("kb_bookmarks")
      .withIndex("by_user_article", (q) =>
        q.eq("userId", user._id).eq("articleId", args.articleId),
      )
      .first();

    return !!bookmark;
  },
});

// ─── Toggle ─────────────────────────────────────────────────────────────────

export const toggle: RegisteredMutation<"public", { articleId: Id<"kb_articles">; notes?: string }, { bookmarked: boolean }> = mutation({
  args: toggleBookmarkArgs,
  returns: v.object({ bookmarked: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const existing = await ctx.db
      .query("kb_bookmarks")
      .withIndex("by_user_article", (q) =>
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
