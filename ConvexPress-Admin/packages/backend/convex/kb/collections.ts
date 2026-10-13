import type { RegisteredQuery } from "convex/server";
import type { Doc } from "../_generated/dataModel";
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
 *
 * Public reads list only articles that pass the public gate and report
 * `articleCount` as the collection's published, non-internal article count.
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
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
import { deleteWithMediaReferences, insertWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";
import { createPublicKbAccess, PUBLIC_KB_LIST_READS } from "./publicAccess";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { adjustKbCollectionPublicCount } from "./helpers/publicCounts";
import { countsAsPublicKbArticle, kbArticleVisibility, kbArticleVisibilityValidator } from "./helpers/visibility";

/** The public shape of a collection: its count covers public articles only. */
function publicCollection(collection: Doc<"kb_collections">): Doc<"kb_collections"> {
  const { publicArticleCount, ...rest } = collection;
  return { ...rest, articleCount: publicArticleCount ?? 0 };
}

import { v } from "convex/values";
import { kbDocs } from "../schema/kb.docs.generated";
// ─── List (Admin) ───────────────────────────────────────────────────────────

export const list = query({
  args: {},
  returns: v.union(v.null(), v.array(kbDocs.kb_collections)),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    // Includes private collections; a signed-in website account is not enough.
    await requireCan(ctx, "kb.view");

    return ctx.db.query("kb_collections").order("desc").take(500);
  },
});

// ─── List Public ────────────────────────────────────────────────────────────

export const listPublic = query({
  args: {},
  returns: v.union(v.null(), v.array(kbDocs.kb_collections)),
  handler: async (ctx) => {
    if (!await createPublicKbAccess(ctx).available()) return null;
    const collections = await ctx.db
      .query("kb_collections")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .take(500);
    return collections.map(publicCollection);
  },
});

// ─── Get By ID (Admin) ─────────────────────────────────────────────────────

export const getById = query({
  args: getCollectionByIdArgs,
  returns: v.union(v.null(), v.object({
    articles: v.array(v.union(v.null(), v.object({
      article: v.object({
        _id: v.id("kb_articles"),
        title: v.string(),
        slug: v.string(),
        status: v.union(v.literal("draft"), v.literal("archived"), v.literal("review"), v.literal("published")),
        visibility: kbArticleVisibilityValidator,
      }),
      _id: v.id("kb_collectionArticles"),
      _creationTime: v.number(),
      order: v.number(),
      articleId: v.id("kb_articles"),
      collectionId: v.id("kb_collections"),
      addedBy: v.id("users"),
      addedAt: v.number(),
    }))),
    _id: v.id("kb_collections"),
    _creationTime: v.number(),
    description: v.optional(v.string()),
    coverImageId: v.optional(v.id("media")),
    type: v.union(v.literal("manual"), v.literal("series"), v.literal("learningPath")),
    name: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
    slug: v.string(),
    createdBy: v.id("users"),
    articleCount: v.number(),
    publicArticleCount: v.optional(v.number()),
    isPublic: v.boolean(),
  })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    // Lists every member article, internal and unpublished ones included.
    await requireCan(ctx, "kb.view");

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
          ? { ...ca, article: { _id: article._id, title: article.title, slug: article.slug, status: article.status, visibility: kbArticleVisibility(article) } }
          : null;
      }),
    );

    return { ...collection, articles: articles.filter(Boolean) };
  },
});

// ─── Get By Slug (Public) ───────────────────────────────────────────────────

type PublicCollection = Doc<"kb_collections"> & { articles: Array<Pick<Doc<"kb_articles">, "_id" | "title" | "slug" | "excerpt" | "readingTimeMinutes" | "categoryId"> & { order: number }> };
export const getBySlug: RegisteredQuery<"public", { slug: string }, PublicCollection | null> = query({
  args: getCollectionBySlugArgs,
  returns: v.union(v.null(), v.object({
    articles: v.array(v.object({
      _id: v.id("kb_articles"),
      title: v.string(),
      slug: v.string(),
      excerpt: v.string(),
      readingTimeMinutes: v.number(),
      order: v.number(),
      categoryId: v.optional(v.id("kb_categories")),
    })),
    _id: v.id("kb_collections"),
    _creationTime: v.number(),
    description: v.optional(v.string()),
    coverImageId: v.optional(v.id("media")),
    type: v.union(v.literal("manual"), v.literal("series"), v.literal("learningPath")),
    name: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
    slug: v.string(),
    createdBy: v.id("users"),
    articleCount: v.number(),
    isPublic: v.boolean(),
  })),
  handler: async (ctx, args) => {
    const access = createPublicKbAccess(ctx, new RequestReadLedger(PUBLIC_KB_LIST_READS));
    if (!await access.available()) return null;
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
        if (!article || !await access.article(article)) return null;
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

    const visible = articles.filter((article): article is NonNullable<typeof article> => article !== null);
    return { ...publicCollection(collection), articleCount: visible.length, articles: visible };
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createCollectionArgs,
  returns: v.id("kb_collections"),
  handler: async (ctx, args): Promise<import("../_generated/dataModel").Id<"kb_collections">> => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCollections");

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Collection name is required" });
    }

    const slug = await generateCollectionSlug(ctx, name);
    const now = Date.now();

    const collectionId: import("../_generated/dataModel").Id<"kb_collections"> = await insertWithMediaReferences<"kb_collections">(ctx, "kb_collections", {
      name,
      slug,
      description: args.description,
      coverImageId: args.coverImageId,
      type: args.type,
      isPublic: args.isPublic ?? false,
      articleCount: 0,
      publicArticleCount: 0,
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
  returns: v.id("kb_collections"),
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

    await patchWithMediaReferences<"kb_collections">(ctx, "kb_collections", args.collectionId, updates);
    return args.collectionId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: removeCollectionArgs,
  returns: v.id("kb_collections"),
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

    await deleteWithMediaReferences<"kb_collections">(ctx, "kb_collections", args.collectionId);
    return args.collectionId;
  },
});

// ─── Add Article ────────────────────────────────────────────────────────────

export const addArticle = mutation({
  args: addArticleToCollectionArgs,
  returns: v.id("kb_collectionArticles"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCollections");
    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article) throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });

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
      await patchWithMediaReferences<"kb_collections">(ctx, "kb_collections", args.collectionId, {
        articleCount: collection.articleCount + 1,
        updatedAt: Date.now(),
      });
    }
    if (countsAsPublicKbArticle(article)) await adjustKbCollectionPublicCount(ctx, args.collectionId, 1);

    return linkId;
  },
});

// ─── Remove Article ─────────────────────────────────────────────────────────

export const removeArticle = mutation({
  args: removeArticleFromCollectionArgs,
  returns: v.union(v.null(), v.id("kb_collectionArticles")),
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
      await patchWithMediaReferences<"kb_collections">(ctx, "kb_collections", args.collectionId, {
        articleCount: collection.articleCount - 1,
        updatedAt: Date.now(),
      });
    }
    const article = await ctx.db.get("kb_articles", args.articleId);
    if (article && countsAsPublicKbArticle(article)) await adjustKbCollectionPublicCount(ctx, args.collectionId, -1);

    return toRemove._id;
  },
});

// ─── Reorder Articles ───────────────────────────────────────────────────────

export const reorderArticles = mutation({
  args: reorderCollectionArticlesArgs,
  returns: v.id("kb_collectionArticles"),
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
