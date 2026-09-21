import type { PaginationOptions, PaginationResult, RegisteredQuery } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
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

import { ConvexError, v, type Validator } from "convex/values";
import { query } from "../_generated/server";
import { kbTables } from "../schema/kb";
import { getCurrentUser, requireCan } from "../helpers/permissions";
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
import { createPublicKbAccess } from "./publicAccess";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { publicAuthorProfile } from "../helpers/publicAuthor";

// ─── List (Admin) ───────────────────────────────────────────────────────────

export const list: import("convex/server").RegisteredQuery<"public", { paginationOpts: import("convex/server").PaginationOptions; search?: string; status?: import("../_generated/dataModel").Doc<"kb_articles">["status"]; categoryId?: import("../_generated/dataModel").Id<"kb_categories">; authorId?: import("../_generated/dataModel").Id<"users"> }, import("convex/server").PaginationResult<import("../_generated/dataModel").Doc<"kb_articles"> & { author: ReturnType<typeof enrichUser> }>> = query({
  args: listArticlesArgs,
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return { page: [], isDone: true, continueCursor: "" };
    await requireCan(ctx, "kb.view");
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100 || (args.search?.length ?? 0) > 500) {
      throw new ConvexError({ code: "INVALID_ARTICLE_LIST", message: "Request 1–100 articles and a search of at most 500 characters." });
    }
    const paginationOpts = { ...args.paginationOpts, maximumRowsRead: 200, maximumBytesRead: 2 * 1024 * 1024 };
    const search = args.search?.trim();
    if (search) {
      const result = await ctx.db.query("kb_articles")
        .withSearchIndex("search_articles", q => {
          let sq = q.search("contentPlainText", search);
          if (args.status) sq = sq.eq("status", args.status);
          if (args.categoryId) sq = sq.eq("categoryId", args.categoryId);
          if (args.authorId) sq = sq.eq("authorId", args.authorId);
          return sq;
        }).paginate(paginationOpts);
      return { ...result, page: await Promise.all(result.page.map(async article => ({
        ...article, author: enrichUser(await ctx.db.get("users", article.authorId)),
      }))) };
    }

    let baseQuery;
    if (args.status) {
      baseQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_status_updated", q => q.eq("status", args.status!))
        .order("desc");
    } else if (args.categoryId) {
      baseQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_category", q => q.eq("categoryId", args.categoryId!));
    } else if (args.authorId) {
      baseQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_author", q => q.eq("authorId", args.authorId!));
    } else {
      baseQuery = ctx.db.query("kb_articles").order("desc");
    }

    const paginationResult = await baseQuery.paginate(paginationOpts);

    // Remaining filters preserve the database cursor, including empty pages.
    const pageItems = paginationResult.page.filter(article =>
      (!args.status || article.status === args.status) &&
      (!args.categoryId || article.categoryId === args.categoryId) &&
      (!args.authorId || article.authorId === args.authorId));

    const enrichedPage = await Promise.all(
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

type AdminArticle = Doc<"kb_articles"> & { hasInheritedCategoryAccess: boolean; author: ReturnType<typeof enrichUser>; category: Doc<"kb_categories"> | null; tags: Doc<"kb_tags">[] };
const adminArticleValidator: Validator<AdminArticle | null, "required", string> = v.union(v.null(), v.object({
  ...kbTables.kb_articles.validator.fields, _id: v.id("kb_articles"), _creationTime: v.number(), hasInheritedCategoryAccess: v.boolean(),
  author: v.union(v.null(), v.object({ _id: v.id("users"), displayName: v.string(), avatarUrl: v.optional(v.string()) })),
  category: v.union(v.null(), v.object({ ...kbTables.kb_categories.validator.fields, _id: v.id("kb_categories"), _creationTime: v.number() })),
  tags: v.array(v.object({ ...kbTables.kb_tags.validator.fields, _id: v.id("kb_tags"), _creationTime: v.number() })),
}));
export const getById: RegisteredQuery<"public", { articleId: Id<"kb_articles"> }, AdminArticle | null> = query({
  args: getArticleByIdArgs,
  returns: adminArticleValidator,
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    await requireCan(ctx, "kb.view");

    const article = await ctx.db.get("kb_articles", args.articleId);
    if (!article) return null;

    const author = await ctx.db.get("users", article.authorId);
    const category = article.categoryId ? await ctx.db.get("kb_categories", article.categoryId) : null;

    // Get tags
    const articleTags = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .take(100);
    const tags = await Promise.all(
      articleTags.map(async (at) => ctx.db.get("kb_tags", at.tagId)),
    );

    const inheritedGuard = await ctx.db.query("kb_article_category_guards").withIndex("by_article", q => q.eq("articleId", article._id)).first();
    return {
      ...article,
      hasInheritedCategoryAccess: inheritedGuard !== null,
      author: enrichUser(author),
      category,
      tags: tags.filter((tag): tag is Doc<"kb_tags"> => tag !== null),
    };
  },
});

// ─── Get By Slug (Public) ───────────────────────────────────────────────────

type PublicKbArticle = {
  _id: Id<"kb_articles">; title: string; slug: string; excerpt: string;
  content: string; contentPlainText: string; readingTimeMinutes: number; publishedAt?: number;
  author: { _id: Id<"users">; displayName: string; avatarUrl?: string } | null;
  category: { _id: Id<"kb_categories">; name: string; slug: string } | null;
  tags: Array<{ _id: Id<"kb_tags">; name: string; slug: string }>;
  relatedArticles: Array<{ _id: Id<"kb_articles">; title: string; slug: string; excerpt: string; categorySlug: string }>;
};
const publicKbArticle: Validator<PublicKbArticle, "required", string> = v.object({
  _id: v.id("kb_articles"), title: v.string(), slug: v.string(), excerpt: v.string(),
  content: v.string(), contentPlainText: v.string(), readingTimeMinutes: v.number(),
  publishedAt: v.optional(v.number()),
  author: v.union(v.null(), v.object({ _id: v.id("users"), displayName: v.string(), avatarUrl: v.optional(v.string()) })),
  category: v.union(v.null(), v.object({ _id: v.id("kb_categories"), name: v.string(), slug: v.string() })),
  tags: v.array(v.object({ _id: v.id("kb_tags"), name: v.string(), slug: v.string() })),
  relatedArticles: v.array(v.object({ _id: v.id("kb_articles"), title: v.string(), slug: v.string(), excerpt: v.string(), categorySlug: v.string() })),
});
export const getBySlug: RegisteredQuery<"public", { slug: string }, PublicKbArticle | null> = query({
  args: getArticleBySlugArgs,
  returns: v.union(v.null(), publicKbArticle),
  handler: async (ctx, args) => {
    const access = createPublicKbAccess(ctx);
    if (!await access.available()) return null;
    const article = await ctx.db
      .query("kb_articles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!article) return null;
    const visible = await access.article(article);
    if (!visible) return null;

    const author = await ctx.db.get("users", article.authorId);
    const category = visible.category;

    const articleTags = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article", (q) => q.eq("articleId", article._id))
      .take(100);
    const tags = await Promise.all(
      articleTags.map(async (at) => ctx.db.get("kb_tags", at.tagId)),
    );

    // Get related articles
    const relatedLinks = await ctx.db
      .query("kb_relatedArticles")
      .withIndex("by_source", (q) => q.eq("sourceArticleId", article._id))
      .take(50);
    const relatedArticles = await Promise.all(
      relatedLinks.map(async (link) => {
        const related = await ctx.db.get("kb_articles", link.relatedArticleId);
        if (!related) return null;
        const relatedAccess = await access.article(related);
        if (!relatedAccess) return null;
        return {
          _id: related._id,
          title: related.title,
          slug: related.slug,
          excerpt: related.excerpt,
          categorySlug: relatedAccess.category?.slug ?? "uncategorized",
        };
      }),
    );

    const profile = publicAuthorProfile(author);
    return {
      _id: article._id, title: article.title, slug: article.slug, excerpt: article.excerpt,
      content: article.content, contentPlainText: article.contentPlainText,
      readingTimeMinutes: article.readingTimeMinutes, publishedAt: article.publishedAt,
      author: profile ? { _id: profile._id, displayName: profile.displayName, avatarUrl: profile.avatarUrl } : null,
      category: category ? { _id: category._id, name: category.name, slug: category.slug } : null,
      tags: tags.filter((tag): tag is NonNullable<typeof tag> => tag !== null).map(tag => ({ _id: tag._id, name: tag.name, slug: tag.slug })),
      relatedArticles: relatedArticles.filter((related): related is NonNullable<typeof related> => related !== null),
    };
  },
});

// ─── Public reading lists ───────────────────────────────────────────────────

/** Public lists deliberately omit article bodies, editorial fields and users. */
type PublicKbSummary = {
  _id: Id<"kb_articles">; title: string; slug: string; excerpt: string;
  categoryId?: Id<"kb_categories">; categorySlug: string; viewCount: number;
  readingTimeMinutes: number; publishedAt?: number; featuredImageId?: Id<"media">;
};
const publicKbSummary: Validator<PublicKbSummary, "required", string> = v.object({
  _id: v.id("kb_articles"), title: v.string(), slug: v.string(), excerpt: v.string(),
  categoryId: v.optional(v.id("kb_categories")), categorySlug: v.string(), viewCount: v.number(),
  readingTimeMinutes: v.number(), publishedAt: v.optional(v.number()), featuredImageId: v.optional(v.id("media")),
});
function publicSummary(article: Doc<"kb_articles">, categorySlug: string): PublicKbSummary {
  return {
    _id: article._id, title: article.title, slug: article.slug, excerpt: article.excerpt,
    categoryId: article.categoryId, categorySlug, viewCount: article.viewCount,
    readingTimeMinutes: article.readingTimeMinutes, publishedAt: article.publishedAt,
    featuredImageId: article.featuredImageId,
  };
}
function publicListLimit(value: number | undefined, fallback: number): number {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new ConvexError({ code: "INVALID_LIMIT", message: "Choose between 1 and 100 articles." });
  return limit;
}
export const listPublished: RegisteredQuery<"public", {
  paginationOpts: PaginationOptions; categoryId?: Id<"kb_categories">;
}, PaginationResult<PublicKbSummary>> = query({
  args: listPublishedArticlesArgs,
  returns: v.object({ page: v.array(publicKbSummary), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const limit = publicListLimit(args.paginationOpts.numItems, 20);
    const budget = new RequestReadLedger(), access = createPublicKbAccess(ctx, budget);
    const empty = { page: [], isDone: true, continueCursor: "" };
    if (!await access.available()) return empty;
    if (args.categoryId) {
      const category = await access.category(args.categoryId);
      if (!category?.isPublished || !await access.allowedRoute(`/help/${encodeURIComponent(category.slug)}`)) return empty;
    }
    budget.beforeRead();
    const query = args.categoryId
      ? ctx.db.query("kb_articles").withIndex("by_category_status_views", q => q.eq("categoryId", args.categoryId!).eq("status", "published"))
      : ctx.db.query("kb_articles").withIndex("by_status_published", q => q.eq("status", "published"));
    const result = await query.order("desc").paginate({
      ...args.paginationOpts, numItems: limit, maximumRowsRead: 100, maximumBytesRead: 512 * 1024,
    });
    const page: PublicKbSummary[] = [];
    for (const article of result.page) {
      budget.record(article);
      const visible = await access.article(article);
      if (visible) page.push(publicSummary(article, visible.category?.slug ?? "uncategorized"));
    }
    // Preserve continuation even when current policy hides this entire page.
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

type PublicListArgs = { limit?: number };
async function readPublicList(
  ctx: import("../_generated/server").QueryCtx, args: PublicListArgs, kind: "popular" | "recent" | "featured",
): Promise<PublicKbSummary[] | null> {
  const limit = publicListLimit(args.limit, kind === "featured" ? 6 : 10);
  const budget = new RequestReadLedger(), access = createPublicKbAccess(ctx, budget);
  if (!await access.available()) return null;
  budget.beforeRead();
  // These are compact previews. The indexed window is bounded even when most
  // candidates are restricted; browse/search endpoints provide continuation.
  const query = kind === "popular"
    ? ctx.db.query("kb_articles").withIndex("by_status_views", q => q.eq("status", "published")).order("desc")
    : kind === "recent"
      ? ctx.db.query("kb_articles").withIndex("by_status_published", q => q.eq("status", "published")).order("desc")
      : ctx.db.query("kb_articles").withIndex("by_featured_status_order", q => q.eq("isFeatured", true).eq("status", "published")).order("asc");
  const candidates = await query.take(Math.min(100, limit * 3));
  candidates.forEach(article => budget.record(article));
  const result: PublicKbSummary[] = [];
  for (const article of candidates) {
    const visible = await access.article(article);
    if (visible) result.push(publicSummary(article, visible.category?.slug ?? "uncategorized"));
    if (result.length === limit) break;
  }
  return result;
}
export const getPopular: RegisteredQuery<"public", PublicListArgs, PublicKbSummary[] | null> = query({
  args: getPopularArticlesArgs, returns: v.union(v.null(), v.array(publicKbSummary)),
  handler: (ctx, args) => readPublicList(ctx, args, "popular"),
});
export const getRecent: RegisteredQuery<"public", PublicListArgs, PublicKbSummary[] | null> = query({
  args: getRecentArticlesArgs, returns: v.union(v.null(), v.array(publicKbSummary)),
  handler: (ctx, args) => readPublicList(ctx, args, "recent"),
});
export const getFeatured: RegisteredQuery<"public", PublicListArgs, PublicKbSummary[] | null> = query({
  args: getFeaturedArticlesArgs, returns: v.union(v.null(), v.array(publicKbSummary)),
  handler: (ctx, args) => readPublicList(ctx, args, "featured"),
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
