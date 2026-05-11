/**
 * Knowledge Base System - Article Queries
 *
 * All read operations for articles:
 *   list              - Paginated article list with filters (admin, auth required)
 *   getById           - Single article by ID (admin, auth required)
 *   getBySlug         - Single published article by slug (public, no auth)
 *   listPublished     - Paginated published articles (public, no auth)
 *   getPopular        - Most viewed published articles (public)
 *   getRecent         - Recently published articles (public)
 *   getFeatured       - Featured published articles (public)
 *   getVersions       - Article version history (admin, auth required)
 */

import { ConvexError } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import {
  listArticlesArgs,
  getArticleByIdArgs,
  getArticleBySlugArgs,
  listPublishedArticlesArgs,
  getPopularArticlesArgs,
  getRecentArticlesArgs,
  getFeaturedArticlesArgs,
  getVersionsArgs,
} from "./validators";
import { enrichUser } from "./helpers/enrichUser";
import { isPluginEnabled } from "../helpers/plugins";

// ─── List (Admin) ───────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  args: listArticlesArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return { page: [], isDone: true, continueCursor: "" };
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    // Search index queries cannot use .paginate(); fall back to collect+slice for
    // the search case. All other paths use Convex-native pagination.
    if (args.search) {
      const results = await ctx.db
        .query("kb_articles")
        .withSearchIndex("search_articles", (q) => {
          let sq = q.search("contentPlainText", args.search!);
          if (args.status) sq = sq.eq("status", args.status);
          if (args.categoryId) sq = sq.eq("categoryId", args.categoryId);
          return sq;
        })
        .collect();

      const filtered = args.authorId
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        ? results.filter((a) => a.authorId === args.authorId)
        : results;

      const enriched = await Promise.all(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        filtered.map(async (article) => {
          const author = await ctx.db.get("users", article.authorId);
          return {
            ...article,
            author: enrichUser(author),
          };
        }),
      );

      // Wrap in PaginationResult shape so the client interface is consistent.
      return {
        page: enriched,
        isDone: true,
        continueCursor: "",
      };
    }

    let baseQuery;
    if (args.status) {
      baseQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_status_updated", (q: ConvexQueryBuilder) => q.eq("status", args.status!))
        .order("desc");
    } else if (args.categoryId) {
      baseQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_category", (q: ConvexQueryBuilder) => q.eq("categoryId", args.categoryId!));
    } else if (args.authorId) {
      baseQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_author", (q: ConvexQueryBuilder) => q.eq("authorId", args.authorId!));
    } else {
      baseQuery = ctx.db.query("kb_articles").order("desc");
    }

    const paginationResult = await baseQuery.paginate(args.paginationOpts);

    // Apply in-memory author filter only when another index was chosen as primary.
    const pageItems = args.authorId && !args.status && !args.categoryId
      ? paginationResult.page
      : args.authorId
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        ? paginationResult.page.filter((a) => a.authorId === args.authorId)
        : paginationResult.page;

    const enrichedPage = await Promise.all(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      pageItems.map(async (article) => {
        const author = await ctx.db.get("users", article.authorId);
        return {
          ...article,
          author: enrichUser(author),
        };
      }),
    );

    return {
      ...paginationResult,
      page: enrichedPage,
    };
  },
});

// ─── Get By ID (Admin) ─────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getById = query({
  args: getArticleByIdArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article) return null;

    const author = await ctx.db.get("users", article.authorId);
    const category = article.categoryId ? await ctx.db.get("kb_categories", article.categoryId) : null;

    // Get tags
    const articleTags = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article", (q: ConvexQueryBuilder) => q.eq("articleId", args.articleId))
      .take(100);
    const tags = await Promise.all(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      articleTags.map(async (at) => ctx.db.get("kb_tags", at.tagId)),
    );

    return {
      ...article,
      author: enrichUser(author),
      category,
      tags: tags.filter(Boolean),
    };
  },
});

// ─── Get By Slug (Public) ───────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getBySlug = query({
  args: getArticleBySlugArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const article = await ctx.db
      .query("kb_articles")
      .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", args.slug))
      .first();

    if (!article || article.status !== "published") return null;

    const author = await ctx.db.get("users", article.authorId);
    const category = article.categoryId ? await ctx.db.get("kb_categories", article.categoryId) : null;

    const articleTags = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article", (q: ConvexQueryBuilder) => q.eq("articleId", article._id))
      .take(100);
    const tags = await Promise.all(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      articleTags.map(async (at) => ctx.db.get("kb_tags", at.tagId)),
    );

    // Get related articles
    const relatedLinks = await ctx.db
      .query("kb_relatedArticles")
      .withIndex("by_source", (q: ConvexQueryBuilder) => q.eq("sourceArticleId", article._id))
      .take(50);
    const relatedArticles = await Promise.all(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      relatedLinks.map(async (link) => {
        const related = await ctx.db.get("kb_articles", link.relatedArticleId);
        if (!related || related.status !== "published") return null;
        return {
          _id: related._id,
          title: related.title,
          slug: related.slug,
          excerpt: related.excerpt,
          relationType: link.relationType,
        };
      }),
    );

    return {
      ...article,
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      author: enrichUser(author),
      category,
      tags: tags.filter(Boolean),
      relatedArticles: relatedArticles.filter(Boolean),
    };
  },
});

// ─── List Published (Public) ────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listPublished = query({
  args: listPublishedArticlesArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return { page: [], isDone: true, continueCursor: "" };
    // When filtering by category we use the by_category index; status is then
    // checked as an in-memory filter on each page after pagination.
    // Without a category we use by_status to only load published records.
    let baseQuery;
    if (args.categoryId) {
      baseQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_category", (q: ConvexQueryBuilder) => q.eq("categoryId", args.categoryId!));
    } else {
      baseQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "published"))
        .order("desc");
    }

    const paginationResult = await baseQuery.paginate(args.paginationOpts);

    // Filter out non-published when coming from the category index.
    const pageItems = args.categoryId
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      ? paginationResult.page.filter((a) => a.status === "published")
      : paginationResult.page;

    const enrichedPage = await Promise.all(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      pageItems.map(async (article) => {
        const author = await ctx.db.get("users", article.authorId);
        const category = article.categoryId ? await ctx.db.get("kb_categories", article.categoryId) : null;
        return {
          ...article,
          author: enrichUser(author),
          category,
        };
      }),
    );

    return {
      ...paginationResult,
      page: enrichedPage,
    };
  },
});

// ─── Get Popular (Public) ───────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getPopular = query({
  args: getPopularArticlesArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const limit = args.limit ?? 10;

    // by_status index ensures only published records are loaded.
    // viewCount is not the index order, so we sort in memory with a safety
    // bound of limit*3 to avoid unbounded .collect() on large tables.
    const articles = await ctx.db
      .query("kb_articles")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "published"))
      .take(limit * 3);

    return articles
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, limit)
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .map((a) => ({
        _id: a._id,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        viewCount: a.viewCount,
        categoryId: a.categoryId,
      }));
  },
});

// ─── Get Recent (Public) ────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getRecent = query({
  args: getRecentArticlesArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const limit = args.limit ?? 10;

    // by_status index ensures only published records are loaded.
    // publishedAt is not the index order, so sort in memory with a safety bound.
    const articles = await ctx.db
      .query("kb_articles")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "published"))
      .take(limit * 3);

    return articles
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
      .slice(0, limit)
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .map((a) => ({
        _id: a._id,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        publishedAt: a.publishedAt,
        categoryId: a.categoryId,
      }));
  },
});

// ─── Get Featured (Public) ──────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getFeatured = query({
  args: getFeaturedArticlesArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const limit = args.limit ?? 6;

    // by_featured index scopes to isFeatured=true records only.
    // Published status filter applied in memory; featured sets are small so
    // take(limit * 3) is a safe, tight upper bound.
    const articles = await ctx.db
      .query("kb_articles")
      .withIndex("by_featured", (q: ConvexQueryBuilder) => q.eq("isFeatured", true))
      .take(limit * 3);

    return articles
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .filter((a) => a.status === "published")
      .slice(0, limit)
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .map((a) => ({
        _id: a._id,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        viewCount: a.viewCount,
        categoryId: a.categoryId,
        featuredImageId: a.featuredImageId,
      }));
  },
});

// ─── Get Versions (Admin) ───────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getVersions = query({
  args: getVersionsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return [];
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const versions = await ctx.db
      .query("kb_articleVersions")
      .withIndex("by_article", (q: ConvexQueryBuilder) => q.eq("articleId", args.articleId))
      .order("desc")
      .take(100);

    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return Promise.all(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      versions.map(async (v) => {
        const author = await ctx.db.get("users", v.authorId);
        return {
          ...v,
          author: enrichUser(author),
        };
      }),
    );
  },
});
