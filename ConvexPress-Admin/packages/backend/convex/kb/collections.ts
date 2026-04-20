/**
 * Knowledge Base System - Collection Functions
 *
 * CRUD and article ordering for collections / learning paths:
 *   list              - All collections for admin (auth required)
 *   listPublic        - Public collections (public)
 *   getById           - Single collection by ID (auth required)
 *   getBySlug         - Single public collection by slug (public)
 *   create            - Create a new collection
 *   update            - Update an existing collection
 *   remove            - Delete a collection and all article associations
 *   addArticle        - Add an article to a collection
 *   removeArticle     - Remove an article from a collection
 *   reorderArticles   - Change article order within a collection
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { generateCollectionSlug } from "./helpers/utils";
import {
  createCollectionArgs,
  updateCollectionArgs,
  removeCollectionArgs,
  addArticleToCollectionArgs,
  removeArticleFromCollectionArgs,
  reorderCollectionArticlesArgs,
  getCollectionByIdArgs,
  getCollectionBySlugArgs,
} from "./validators";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";

// ─── List (Admin) ───────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db.query("kb_collections").order("desc").take(500);
  },
});

// ─── List Public ────────────────────────────────────────────────────────────

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    return ctx.db
      .query("kb_collections")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .take(500);
  },
});

// ─── Get By ID (Admin) ─────────────────────────────────────────────────────

export const getById = query({
  args: getCollectionByIdArgs,
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const collection = await ctx.db.get("kb_collections", args.collectionId);
    if (!collection) return null;

    // Get articles in order
    const collectionArticles = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_collection_order", (q) => q.eq("collectionId", args.collectionId))
      .take(500);

    const articles = await Promise.all(
      collectionArticles.map(async (ca) => {
        const article = await ctx.db.get("kb_articles", ca.articleId);
        return article
          ? { ...ca, article: { _id: article._id, title: article.title, slug: article.slug, status: article.status } }
          : null;
      }),
    );

    return { ...collection, articles: articles.filter(Boolean) };
  },
});

// ─── Get By Slug (Public) ───────────────────────────────────────────────────

export const getBySlug = query({
  args: getCollectionBySlugArgs,
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const collection = await ctx.db
      .query("kb_collections")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!collection || !collection.isPublic) return null;

    const collectionArticles = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_collection_order", (q) => q.eq("collectionId", collection._id))
      .take(500);

    const articles = await Promise.all(
      collectionArticles.map(async (ca) => {
        const article = await ctx.db.get("kb_articles", ca.articleId);
        if (!article || article.status !== "published") return null;
        return {
          _id: article._id,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          readingTimeMinutes: article.readingTimeMinutes,
          order: ca.order,
          categoryId: article.categoryId,
        };
      }),
    );

    return { ...collection, articles: articles.filter(Boolean) };
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createCollectionArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCollections");

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Collection name is required" });
    }

    const slug = await generateCollectionSlug(ctx, name);
    const now = Date.now();

    const collectionId = await ctx.db.insert("kb_collections", {
      name,
      slug,
      description: args.description,
      coverImageId: args.coverImageId,
      type: args.type,
      isPublic: args.isPublic ?? false,
      articleCount: 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return collectionId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update = mutation({
  args: updateCollectionArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCollections");

    const collection = await ctx.db.get("kb_collections", args.collectionId);
    if (!collection) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Collection not found" });
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Collection name is required" });
      }
      updates.name = name;
      updates.slug = await generateCollectionSlug(ctx, name, args.collectionId);
    }

    if (args.description !== undefined) updates.description = args.description;
    if (args.coverImageId !== undefined) updates.coverImageId = args.coverImageId;
    if (args.type !== undefined) updates.type = args.type;
    if (args.isPublic !== undefined) updates.isPublic = args.isPublic;

    await ctx.db.patch("kb_collections", args.collectionId, updates);
    return args.collectionId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: removeCollectionArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCollections");

    const collection = await ctx.db.get("kb_collections", args.collectionId);
    if (!collection) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Collection not found" });
    }

    // Delete all collection-article associations
    const collectionArticles = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_collection", (q) => q.eq("collectionId", args.collectionId))
      .take(500);
    for (const ca of collectionArticles) {
      await ctx.db.delete("kb_collectionArticles", ca._id);
    }

    await ctx.db.delete("kb_collections", args.collectionId);
    return args.collectionId;
  },
});

// ─── Add Article ────────────────────────────────────────────────────────────

export const addArticle = mutation({
  args: addArticleToCollectionArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCollections");

    // Check for existing association
    const existing = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_collection", (q) => q.eq("collectionId", args.collectionId))
      .take(500);

    const alreadyAdded = existing.find((ca) => ca.articleId === args.articleId);
    if (alreadyAdded) return alreadyAdded._id;

    const maxOrder = existing.length > 0
      ? Math.max(...existing.map((ca) => ca.order))
      : 0;

    const linkId = await ctx.db.insert("kb_collectionArticles", {
      collectionId: args.collectionId,
      articleId: args.articleId,
      order: maxOrder + 1,
      addedBy: user._id,
      addedAt: Date.now(),
    });

    // Increment collection article count
    const collection = await ctx.db.get("kb_collections", args.collectionId);
    if (collection) {
      await ctx.db.patch("kb_collections", args.collectionId, {
        articleCount: collection.articleCount + 1,
        updatedAt: Date.now(),
      });
    }

    return linkId;
  },
});

// ─── Remove Article ─────────────────────────────────────────────────────────

export const removeArticle = mutation({
  args: removeArticleFromCollectionArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCollections");

    const collectionArticles = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_collection", (q) => q.eq("collectionId", args.collectionId))
      .take(500);

    const toRemove = collectionArticles.find((ca) => ca.articleId === args.articleId);
    if (!toRemove) return null;

    await ctx.db.delete("kb_collectionArticles", toRemove._id);

    // Decrement collection article count
    const collection = await ctx.db.get("kb_collections", args.collectionId);
    if (collection && collection.articleCount > 0) {
      await ctx.db.patch("kb_collections", args.collectionId, {
        articleCount: collection.articleCount - 1,
        updatedAt: Date.now(),
      });
    }

    return toRemove._id;
  },
});

// ─── Reorder Articles ───────────────────────────────────────────────────────

export const reorderArticles = mutation({
  args: reorderCollectionArticlesArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCollections");

    const collectionArticles = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_collection", (q) => q.eq("collectionId", args.collectionId))
      .take(500);

    const toReorder = collectionArticles.find((ca) => ca.articleId === args.articleId);
    if (!toReorder) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found in collection" });
    }

    await ctx.db.patch("kb_collectionArticles", toReorder._id, { order: args.newOrder });
    return toReorder._id;
  },
});
