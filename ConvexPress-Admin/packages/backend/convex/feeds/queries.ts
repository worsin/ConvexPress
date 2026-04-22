/**
 * RSS/Feed System - Public Queries
 *
 * All read operations for generating feed data. These queries fetch
 * published posts, taxonomy terms, comments, and settings to provide
 * structured data that the website frontend (TanStack Start API routes)
 * or HTTP actions will transform into XML feeds.
 *
 * This system owns NO tables -- it is a pure read layer that queries
 * data from the Post, Taxonomy, Comment, Settings, and User Profile systems.
 *
 * Queries:
 *   - getPublishedPosts      - Published posts for the main feed
 *   - getPostsByCategory     - Posts filtered by category slug
 *   - getPostsByTag          - Posts filtered by tag slug
 *   - getPostsByAuthor       - Posts filtered by author slug
 *   - getRecentComments      - Recent approved comments (global)
 *   - getPostComments        - Approved comments for a specific post
 *   - getFeedSettings        - Feed configuration from Settings System
 *
 * Authorization:
 *   All feed queries are PUBLIC (no auth required) to match WordPress behavior.
 *   Feed content only includes published posts and approved comments.
 *
 * WordPress equivalent: The data layer behind do_feed_rss2(), do_feed_atom()
 */

import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  getPublishedPostsArgs,
  getPostsByCategoryArgs,
  getPostsByTagArgs,
  getPostsByAuthorArgs,
  getRecentCommentsArgs,
  getPostCommentsArgs,
  FEED_SETTINGS_DEFAULTS,
  MAX_FEED_ITEM_COUNT,
} from "./validators";

// ─── Helper: Fetch feed settings from Settings System ───────────────────────

/**
 * Read feed-related settings from the Settings System.
 * Returns defaults if settings have not been configured.
 */
async function readFeedSettings(ctx: QueryCtx) {
  const general = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", "general"))
    .unique();

  const reading = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", "reading"))
    .unique();

  const generalValues = general?.values as Record<string, unknown> | undefined;
  const readingValues = reading?.values as Record<string, unknown> | undefined;

  return {
    siteTitle:
      (generalValues?.siteTitle as string) ?? FEED_SETTINGS_DEFAULTS.siteTitle,
    siteDescription:
      (generalValues?.tagline as string) ?? FEED_SETTINGS_DEFAULTS.siteDescription,
    siteUrl:
      (generalValues?.siteUrl as string) ?? FEED_SETTINGS_DEFAULTS.siteUrl,
    language:
      (generalValues?.siteLanguage as string) ?? FEED_SETTINGS_DEFAULTS.language,
    feedItemCount: Math.min(
      MAX_FEED_ITEM_COUNT,
      Math.max(1, (readingValues?.feedItemCount as number) ?? FEED_SETTINGS_DEFAULTS.feedItemCount),
    ),
    feedContentDisplay:
      ((readingValues?.feedContentDisplay as string) === "summary" ? "summary" : "full") as
        | "full"
        | "summary",
  };
}

// ─── Helper: Enrich posts with taxonomy and author data ─────────────────────

/**
 * Enrich a list of post documents with category names, tag names, and author info.
 * This data is needed for building feed items.
 *
 * Optimized to batch-fetch authors and media upfront to avoid N+1 query patterns.
 * Taxonomy relationships are still fetched per-post since there's no cross-post
 * batch index, but term lookups within each post use Promise.all.
 */
async function enrichPostsForFeed(ctx: QueryCtx, posts: Doc<"posts">[]) {
  if (posts.length === 0) return [];

  // ── Batch-fetch unique authors upfront ─────────────────────────────────
  const uniqueAuthorIds = [...new Set(
    posts.map((p) => p.authorId).filter((id): id is Id<"users"> => !!id),
  )];
  const authorMap = new Map<string, Doc<"users">>();
  const authorResults = await Promise.all(
    uniqueAuthorIds.map((id) => ctx.db.get("users", id)),
  );
  for (let i = 0; i < uniqueAuthorIds.length; i++) {
    const author = authorResults[i];
    if (author) {
      authorMap.set(uniqueAuthorIds[i], author);
    }
  }

  // ── Batch-fetch unique featured images upfront ─────────────────────────
  const uniqueMediaIds = [...new Set(
    posts.map((p) => p.featuredImageId).filter((id): id is Id<"media"> => !!id),
  )];
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  const mediaMap = new Map<string, Doc<"media">>();
  if (uniqueMediaIds.length > 0) {
    const mediaResults = await Promise.all(
      uniqueMediaIds.map((id) => ctx.db.get("media", id)),
    );
    for (let i = 0; i < uniqueMediaIds.length; i++) {
      const media = mediaResults[i];
      if (media) {
        mediaMap.set(uniqueMediaIds[i], media);
      }
    }
  }

  // ── Enrich each post with taxonomy terms (parallelized) ────────────────
  return Promise.all(
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    posts.map(async (post) => {
      // Get taxonomy terms for this post
      const relationships = await ctx.db
        .query("termRelationships")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .collect();

      const categories: string[] = [];
      const tags: string[] = [];

      // Batch-fetch all terms for this post's relationships using Promise.all
      const terms = await Promise.all(
        relationships.map((rel) => ctx.db.get("terms", rel.termId)),
      );
      for (const term of terms) {
        if (!term) continue;
        if (term.taxonomy === "category") {
          categories.push(term.name);
        } else if (term.taxonomy === "post_tag") {
          tags.push(term.name);
        }
      }

      // Look up author from pre-fetched map
      let authorName = "Unknown";
      let authorSlug = "";
      if (post.authorId) {
        const author = authorMap.get(post.authorId);
        if (author) {
          authorName =
            author.displayName ||
            (author.firstName && author.lastName
              ? `${author.firstName} ${author.lastName}`
              : author.firstName || author.username || "Unknown");
          authorSlug = author.slug || "";
        }
      }

      // Look up featured image from pre-fetched map
      let featuredImageUrl: string | undefined;
      let featuredImageMimeType: string | undefined;
      let featuredImageSize: number | undefined;
      if (post.featuredImageId) {
        const media = mediaMap.get(post.featuredImageId);
        if (media) {
          // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
          featuredImageUrl = media.url;
          featuredImageMimeType = media.mimeType;
          featuredImageSize = media.fileSize;
        }
      }

      return {
        _id: post._id,
        title: post.title || "Untitled",
        slug: post.slug,
        content: post.content || "",
        excerpt: post.excerpt || null,
        status: post.status,
        publishedAt: post.publishedAt || post._creationTime,
        updatedAt: post.updatedAt || post._creationTime,
        commentStatus: post.commentStatus,
        commentCount: post.commentCount || 0,
        authorName,
        authorSlug,
        categories,
        tags,
        featuredImageUrl,
        featuredImageMimeType,
        featuredImageSize,
      };
    }),
  );
}

// ─── getPublishedPosts ──────────────────────────────────────────────────────

/**
 * Fetch published posts for the main feed.
 * PUBLIC query - no auth required.
 *
 * Returns published posts sorted by publishedAt descending,
 * enriched with taxonomy terms and author info.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getPublishedPosts = query({
  args: getPublishedPostsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(1, args.limit), MAX_FEED_ITEM_COUNT);

    // Fetch published posts of type "post", ordered by publishedAt descending
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_type_published", (q: ConvexQueryBuilder) =>
        q.eq("type", "post"),
      )
      .order("desc")
      .filter((q) => q.eq(q.field("status"), "publish"))
      .take(limit);

    return enrichPostsForFeed(ctx, posts);
  },
});

// ─── getPostsByCategory ─────────────────────────────────────────────────────

/**
 * Fetch published posts filtered by category slug.
 * PUBLIC query - no auth required.
 *
 * Returns null if the category doesn't exist (caller returns 404).
 * Returns { category, posts } with posts enriched for feed building.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getPostsByCategory = query({
  args: getPostsByCategoryArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(1, args.limit), MAX_FEED_ITEM_COUNT);

    // Look up the category by slug
    const category = await ctx.db
      .query("terms")
      .withIndex("by_slug_taxonomy", (q: ConvexQueryBuilder) =>
        q.eq("slug", args.categorySlug).eq("taxonomy", "category"),
      )
      .unique();

    if (!category) return null;

    // Get all post IDs in this category
    const relationships = await ctx.db
      .query("termRelationships")
      .withIndex("by_term", (q: ConvexQueryBuilder) => q.eq("termId", category._id))
      .collect();

    // Batch-fetch all posts in this category using Promise.all
    const allPosts = await Promise.all(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      relationships.map((rel) => ctx.db.get("posts", rel.postId)),
    );

    // Filter to published posts of type "post"
    const publishedPosts = allPosts.filter(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      (post): post is Doc<"posts"> =>
        post !== null && post.status === "publish" && post.type === "post",
    );

    // Sort by publishedAt descending
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    publishedPosts.sort((a, b) => {
      const aTime = a.publishedAt ?? a._creationTime;
      const bTime = b.publishedAt ?? b._creationTime;
      return bTime - aTime;
    });

    // Limit
    const limitedPosts = publishedPosts.slice(0, limit);

    return {
      category: {
        name: category.name,
        slug: category.slug,
        description: category.description || `Posts in ${category.name}`,
      },
      posts: await enrichPostsForFeed(ctx, limitedPosts),
    };
  },
});

// ─── getPostsByTag ──────────────────────────────────────────────────────────

/**
 * Fetch published posts filtered by tag slug.
 * PUBLIC query - no auth required.
 *
 * Returns null if the tag doesn't exist (caller returns 404).
 * Returns { tag, posts } with posts enriched for feed building.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getPostsByTag = query({
  args: getPostsByTagArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(1, args.limit), MAX_FEED_ITEM_COUNT);

    // Look up the tag by slug
    const tag = await ctx.db
      .query("terms")
      .withIndex("by_slug_taxonomy", (q: ConvexQueryBuilder) =>
        q.eq("slug", args.tagSlug).eq("taxonomy", "post_tag"),
      )
      .unique();

    if (!tag) return null;

    // Get all post IDs with this tag
    const relationships = await ctx.db
      .query("termRelationships")
      .withIndex("by_term", (q: ConvexQueryBuilder) => q.eq("termId", tag._id))
      .collect();

    // Batch-fetch all posts with this tag using Promise.all
    const allPosts = await Promise.all(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      relationships.map((rel) => ctx.db.get("posts", rel.postId)),
    );

    // Filter to published posts of type "post"
    const publishedPosts = allPosts.filter(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      (post): post is Doc<"posts"> =>
        post !== null && post.status === "publish" && post.type === "post",
    );

    // Sort by publishedAt descending
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    publishedPosts.sort((a, b) => {
      const aTime = a.publishedAt ?? a._creationTime;
      const bTime = b.publishedAt ?? b._creationTime;
      return bTime - aTime;
    });

    // Limit
    const limitedPosts = publishedPosts.slice(0, limit);

    return {
      tag: {
        name: tag.name,
        slug: tag.slug,
        description: tag.description || `Posts tagged ${tag.name}`,
      },
      posts: await enrichPostsForFeed(ctx, limitedPosts),
    };
  },
});

// ─── getPostsByAuthor ───────────────────────────────────────────────────────

/**
 * Fetch published posts filtered by author slug.
 * PUBLIC query - no auth required.
 *
 * Returns null if the author doesn't exist (caller returns 404).
 * Returns { author, posts } with posts enriched for feed building.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getPostsByAuthor = query({
  args: getPostsByAuthorArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(1, args.limit), MAX_FEED_ITEM_COUNT);

    // Look up the author by slug
    const author = await ctx.db
      .query("users")
      .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", args.authorSlug))
      .unique();

    if (!author) return null;

    // Fetch published posts by this author.
    // Over-fetch by 2x to handle the edge case where publishedAt order differs
    // from _creationTime order (e.g., backdated posts). The index orders by
    // _creationTime by default, so take(limit) could miss posts that were
    // created later but published earlier.
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q: ConvexQueryBuilder) =>
        q.eq("authorId", author._id).eq("type", "post").eq("status", "publish"),
      )
      .order("desc")
      .take(limit * 2);

    // Sort by publishedAt descending, then limit to the requested count
    const sortedPosts = [...posts]
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .sort((a, b) => {
        const aTime = a.publishedAt ?? a._creationTime;
        const bTime = b.publishedAt ?? b._creationTime;
        return bTime - aTime;
      })
      .slice(0, limit);

    const authorName =
      author.displayName ||
      (author.firstName && author.lastName
        ? `${author.firstName} ${author.lastName}`
        : author.firstName || author.username || "Unknown");

    return {
      author: {
        name: authorName,
        slug: author.slug || args.authorSlug,
      },
      posts: await enrichPostsForFeed(ctx, sortedPosts),
    };
  },
});

// ─── getRecentComments ──────────────────────────────────────────────────────

/**
 * Fetch recent approved comments for the global comment feed.
 * PUBLIC query - no auth required.
 *
 * Returns approved comments sorted by createdAt descending,
 * enriched with parent post info. Skips orphaned comments.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getRecentComments = query({
  args: getRecentCommentsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(1, args.limit), MAX_FEED_ITEM_COUNT);

    // Fetch recently approved comments
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "approved"))
      .order("desc")
      .take(limit * 2); // Over-fetch to account for orphaned comments

    // Enrich with post data, skip orphaned comments
    const enrichedComments: Array<{
      _id: string;
      content: string;
      authorName: string;
      createdAt: number;
      updatedAt: number;
      postTitle: string;
      postSlug: string;
    }> = [];

    for (const comment of comments) {
      if (enrichedComments.length >= limit) break;

      const post = await ctx.db.get("posts", comment.postId);
      // Skip orphaned comments (parent post deleted or not published)
      if (!post || post.status !== "publish") continue;

      enrichedComments.push({
        _id: comment._id,
        content: comment.content,
        authorName: comment.authorName,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        postTitle: post.title || "Untitled",
        postSlug: post.slug,
      });
    }

    return enrichedComments;
  },
});

// ─── getPostComments ────────────────────────────────────────────────────────

/**
 * Fetch approved comments for a specific post (per-post comment feed).
 * PUBLIC query - no auth required.
 *
 * Returns null if the post doesn't exist or is not published.
 * Returns null if commentStatus is "closed" AND zero comments exist.
 * Returns { post, comments } otherwise.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getPostComments = query({
  args: getPostCommentsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(1, args.limit), MAX_FEED_ITEM_COUNT);

    // Look up the post by slug - must be published
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", args.postSlug).eq("type", "post"))
      .collect();

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const post = posts.find((p) => p.status === "publish");
    if (!post) return null;

    // Fetch approved comments for this post
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q: ConvexQueryBuilder) =>
        q.eq("postId", post._id).eq("status", "approved"),
      )
      .order("desc")
      .take(limit);

    // If comments are closed AND there are zero comments, return null (404)
    if (post.commentStatus === "closed" && comments.length === 0) {
      return null;
    }

    return {
      post: {
        title: post.title || "Untitled",
        slug: post.slug,
        commentStatus: post.commentStatus,
      },
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      comments: comments.map((comment) => ({
        _id: comment._id,
        content: comment.content,
        authorName: comment.authorName,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      })),
    };
  },
});

// ─── getFeedSettings ────────────────────────────────────────────────────────

/**
 * Fetch all feed-related settings from the Settings System.
 * PUBLIC query - no auth required (settings are needed for public feeds).
 *
 * Returns merged defaults + stored values for siteTitle, siteDescription,
 * siteUrl, language, feedItemCount, and feedContentDisplay.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getFeedSettings = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    return readFeedSettings(ctx);
  },
});
