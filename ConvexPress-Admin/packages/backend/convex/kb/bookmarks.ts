import type { RegisteredQuery, RegisteredMutation } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
/**
 * Knowledge Base System - Bookmark Functions
 *
 * User bookmark management:
 *   list         - List all bookmarks for the current user (auth required)
 *   isBookmarked - Check if an article is bookmarked (auth required)
 *   toggle       - Toggle bookmark on/off (auth required)
 *
 * Bookmarks of articles that are now hidden (internal, unpublished or
 * restricted) stay stored but are invisible, and cannot be toggled, until the
 * article is public again.
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { toggleBookmarkArgs, isBookmarkedArgs } from "./validators";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { createPublicKbAccess, PUBLIC_KB_LIST_READS, readPublicKbArticle, requirePublicKbArticle } from "./publicAccess";
import { RequestReadLedger } from "../helpers/requestReadLedger";

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

    // Enrich with article details. Bookmarks of hidden articles are omitted.
    const access = createPublicKbAccess(ctx, new RequestReadLedger(PUBLIC_KB_LIST_READS));
    const visible: Array<Doc<"kb_bookmarks"> & { article: Pick<Doc<"kb_articles">, "_id" | "title" | "slug" | "excerpt" | "status" | "categoryId"> | null }> = [];
    for (const bookmark of bookmarks) {
      const article = await ctx.db.get("kb_articles", bookmark.articleId);
      if (article && !await access.article(article)) continue;
      visible.push({
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
      });
    }
    return visible;
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
    if (!await readPublicKbArticle(ctx, args.articleId)) return false;

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
    // A hidden (internal, unpublished or restricted) article is "not found".
    await requirePublicKbArticle(ctx, args.articleId);

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
