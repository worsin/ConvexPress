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
  DEFAULT_KB_PER_PAGE_ADMIN,
  DEFAULT_KB_PER_PAGE_WEBSITE,
  MAX_KB_PER_PAGE,
} from "./validators";

// ─── List (Admin) ───────────────────────────────────────────────────────────

export const list = query({
  args: listArticlesArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const page = args.page ?? 1;
    const perPage = Math.min(args.perPage ?? DEFAULT_KB_PER_PAGE_ADMIN, MAX_KB_PER_PAGE);

    let articlesQuery;

    if (args.search) {
      // Use search index
      articlesQuery = ctx.db
        .query("kb_articles")
        .withSearchIndex("search_articles", (q) => {
          let sq = q.search("contentPlainText", args.search!);
          if (args.status) sq = sq.eq("status", args.status);
          if (args.categoryId) sq = sq.eq("categoryId", args.categoryId);
          return sq;
        });
    } else if (args.status) {
      articlesQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_status_updated", (q) => q.eq("status", args.status!))
        .order("desc");
    } else if (args.categoryId) {
      articlesQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId!));
    } else if (args.authorId) {
      articlesQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_author", (q) => q.eq("authorId", args.authorId!));
    } else {
      articlesQuery = ctx.db.query("kb_articles").order("desc");
    }

    const allArticles = await articlesQuery.collect();

    // Apply remaining filters that couldn't be handled by the index
    let filtered = allArticles;
    if (args.authorId && !args.status && !args.search) {
      // Already filtered by index
    } else if (args.authorId) {
      filtered = filtered.filter((a) => a.authorId === args.authorId);
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / perPage);
    const start = (page - 1) * perPage;
    const items = filtered.slice(start, start + perPage);

    // Enrich with author info
    const enriched = await Promise.all(
      items.map(async (article) => {
        const author = await ctx.db.get(article.authorId);
        return {
          ...article,
          author: author
            ? {
                _id: author._id,
                displayName: (author as any).displayName ?? author.email,
                avatarUrl: (author as any).avatarUrl,
              }
            : null,
        };
      }),
    );

    return {
      items: enriched,
      total,
      page,
      perPage,
      totalPages,
    };
  },
});

// ─── Get By ID (Admin) ─────────────────────────────────────────────────────

export const getById = query({
  args: getArticleByIdArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const article = await ctx.db.get(args.articleId);
    if (!article) return null;

    const author = await ctx.db.get(article.authorId);
    const category = article.categoryId ? await ctx.db.get(article.categoryId) : null;

    // Get tags
    const articleTags = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    const tags = await Promise.all(
      articleTags.map(async (at) => ctx.db.get(at.tagId)),
    );

    return {
      ...article,
      author: author
        ? {
            _id: author._id,
            displayName: (author as any).displayName ?? author.email,
            avatarUrl: (author as any).avatarUrl,
          }
        : null,
      category,
      tags: tags.filter(Boolean),
    };
  },
});

// ─── Get By Slug (Public) ───────────────────────────────────────────────────

export const getBySlug = query({
  args: getArticleBySlugArgs,
  handler: async (ctx, args) => {
    const article = await ctx.db
      .query("kb_articles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!article || article.status !== "published") return null;

    const author = await ctx.db.get(article.authorId);
    const category = article.categoryId ? await ctx.db.get(article.categoryId) : null;

    const articleTags = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article", (q) => q.eq("articleId", article._id))
      .collect();
    const tags = await Promise.all(
      articleTags.map(async (at) => ctx.db.get(at.tagId)),
    );

    // Get related articles
    const relatedLinks = await ctx.db
      .query("kb_relatedArticles")
      .withIndex("by_source", (q) => q.eq("sourceArticleId", article._id))
      .collect();
    const relatedArticles = await Promise.all(
      relatedLinks.map(async (link) => {
        const related = await ctx.db.get(link.relatedArticleId);
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
      author: author
        ? {
            _id: author._id,
            displayName: (author as any).displayName ?? author.email,
            avatarUrl: (author as any).avatarUrl,
          }
        : null,
      category,
      tags: tags.filter(Boolean),
      relatedArticles: relatedArticles.filter(Boolean),
    };
  },
});

// ─── List Published (Public) ────────────────────────────────────────────────

export const listPublished = query({
  args: listPublishedArticlesArgs,
  handler: async (ctx, args) => {
    const page = args.page ?? 1;
    const perPage = Math.min(args.perPage ?? DEFAULT_KB_PER_PAGE_WEBSITE, MAX_KB_PER_PAGE);

    let articlesQuery;
    if (args.categoryId) {
      articlesQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId!));
    } else {
      articlesQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_published");
    }

    const allArticles = await articlesQuery.collect();
    const published = allArticles
      .filter((a) => a.status === "published")
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

    const total = published.length;
    const totalPages = Math.ceil(total / perPage);
    const start = (page - 1) * perPage;
    const items = published.slice(start, start + perPage);

    const enriched = await Promise.all(
      items.map(async (article) => {
        const author = await ctx.db.get(article.authorId);
        const category = article.categoryId ? await ctx.db.get(article.categoryId) : null;
        return {
          ...article,
          author: author
            ? {
                _id: author._id,
                displayName: (author as any).displayName ?? author.email,
                avatarUrl: (author as any).avatarUrl,
              }
            : null,
          category,
        };
      }),
    );

    return {
      items: enriched,
      total,
      page,
      perPage,
      totalPages,
    };
  },
});

// ─── Get Popular (Public) ───────────────────────────────────────────────────

export const getPopular = query({
  args: getPopularArticlesArgs,
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    const articles = await ctx.db
      .query("kb_articles")
      .withIndex("by_views")
      .order("desc")
      .collect();

    return articles
      .filter((a) => a.status === "published")
      .slice(0, limit)
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

export const getRecent = query({
  args: getRecentArticlesArgs,
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    const articles = await ctx.db
      .query("kb_articles")
      .withIndex("by_published")
      .order("desc")
      .collect();

    return articles
      .filter((a) => a.status === "published")
      .slice(0, limit)
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

export const getFeatured = query({
  args: getFeaturedArticlesArgs,
  handler: async (ctx, args) => {
    const limit = args.limit ?? 6;

    const articles = await ctx.db
      .query("kb_articles")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .collect();

    return articles
      .filter((a) => a.status === "published")
      .slice(0, limit)
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

export const getVersions = query({
  args: getVersionsArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const versions = await ctx.db
      .query("kb_articleVersions")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .order("desc")
      .collect();

    return Promise.all(
      versions.map(async (v) => {
        const author = await ctx.db.get(v.authorId);
        return {
          ...v,
          author: author
            ? {
                _id: author._id,
                displayName: (author as any).displayName ?? author.email,
              }
            : null,
        };
      }),
    );
  },
});
