/**
 * Post System - Queries
 *
 * All read operations for posts and post metadata:
 *   list               - Paginated post list with filters (admin, auth required)
 *   get                - Single post by ID or slug+type (auth-aware)
 *   getPublished       - Single published post by slug (public, no auth)
 *   listPublished      - Paginated published posts for blog index (public, no auth)
 *   counts             - Post counts by status for admin sidebar badges
 *   getSticky          - Get sticky posts for blog homepage
 *   getSlugs           - All published slugs for sitemap generation
 *   preview            - Post data merged with autosave content
 *   getMetaByPost      - All meta records for a post
 *   getMetaByKey       - Specific meta value for a post
 *   getRelatedPosts    - Posts sharing categories/tags with a given post (public)
 *   getAdjacentPosts   - Previous/next posts chronologically (public)
 *   getDateArchiveGroups - Post counts by year/month for archives (public)
 *
 * Authorization:
 *   - Public queries (getPublished, listPublished, getSticky, getSlugs)
 *     do NOT require authentication
 *   - Admin queries (list, counts) require authentication
 *   - get is auth-aware: public posts are visible to all, private/draft
 *     posts require appropriate capabilities
 */

import { ConvexError } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { checkPostCapability, getUserRoleLevel } from "../helpers/postAuth";
import type { AuthUser, AuthPost } from "../helpers/postAuth";
import type { Doc, Id } from "../_generated/dataModel";
import {
  listPostsArgs,
  getPostArgs,
  countsArgs,
  getMetaByPostArgs,
  getMetaByKeyArgs,
  DEFAULT_PER_PAGE_ADMIN,
  DEFAULT_PER_PAGE_WEBSITE,
  MAX_PER_PAGE,
} from "./validators";
import { v } from "convex/values";

// ─── Local Types ────────────────────────────────────────────────────────────

/** Post document shape used in list filtering. */
type PostRow = Doc<"posts">;

/** Author info denormalized onto post results. */
type AuthorInfo = {
  _id: Id<"users">;
  displayName: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
  slug?: string;
} | null;

/** Media fields resolved from featured image. */
type MediaDoc = {
  url?: string;
  storageUrl?: string;
  altText?: string;
  [key: string]: unknown;
};

/** Extended author document shape (user doc with profile fields). */
type AuthorDoc = {
  _id: Id<"users">;
  displayName?: string;
  email: string;
  bio?: string;
  avatarUrl?: string;
  profilePictureUrl?: string;
  slug?: string;
  [key: string]: unknown;
};

// ─── List (Admin) ───────────────────────────────────────────────────────────

/**
 * Paginated post list with filters for the admin "All Posts" screen.
 *
 * Requires authentication. Applies capability-based filtering:
 *   - Contributors: Only own posts (all non-trash statuses)
 *   - Authors: Own posts (all statuses) + all published
 *   - Editors/Admins: All posts, all statuses
 *
 * Returns posts with basic author info for display.
 */
export const list = query({
  args: listPostsArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const type = args.type ?? "post";
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, args.perPage ?? DEFAULT_PER_PAGE_ADMIN));
    const roleLevel = await getUserRoleLevel(ctx, user as AuthUser);

    // ── Search query ────────────────────────────────────────────────────
    if (args.search && args.search.trim()) {
      const searchResults = await ctx.db
        .query("posts")
        .withSearchIndex("search_posts", (q) => {
          let sq = q.search("title", args.search!);
          sq = sq.eq("type", type);
          if (args.status) {
            sq = sq.eq("status", args.status);
          }
          if (args.authorId) {
            sq = sq.eq("authorId", args.authorId);
          }
          return sq;
        })
        .collect();

      // Apply role-based filtering
      const filtered = filterByRole(searchResults, user._id, roleLevel);

      const total = filtered.length;
      const totalPages = Math.ceil(total / perPage);
      const offset = (page - 1) * perPage;
      const posts = filtered.slice(offset, offset + perPage);

      // Denormalize author data
      const postsWithAuthors = await Promise.all(
        posts.map(async (post) => {
          const author = await ctx.db.get("users", post.authorId);
          return {
            ...post,
            author: author
              ? {
                  _id: author._id,
                  displayName: author.displayName ?? author.email,
                  email: author.email,
                }
              : null,
          };
        }),
      );

      return { posts: postsWithAuthors, total, page, perPage, totalPages };
    }

    // ── Index-based query ───────────────────────────────────────────────
    let allPosts;

    if (args.status) {
      // Filter by specific status
      allPosts = await ctx.db
        .query("posts")
        .withIndex("by_type_status", (q) =>
          q.eq("type", type).eq("status", args.status!),
        )
        .take(10000);
    } else if (args.authorId) {
      // Filter by author
      allPosts = await ctx.db
        .query("posts")
        .withIndex("by_author", (q) =>
          q.eq("authorId", args.authorId!).eq("type", type),
        )
        .take(10000);
    } else {
      // All posts of this type
      allPosts = await ctx.db
        .query("posts")
        .withIndex("by_type_status", (q) => q.eq("type", type))
        .take(10000);
    }

    // Apply additional filters
    let filtered = allPosts;

    // Filter by author if status filter was used but not author index
    if (args.authorId && args.status) {
      filtered = filtered.filter(
        (p) => p.authorId.toString() === args.authorId!.toString(),
      );
    }

    // Filter by date range (publishedAt or createdAt for unpublished)
    if (args.dateFrom) {
      filtered = filtered.filter((p) => {
        const date = p.publishedAt ?? p.createdAt;
        return date >= args.dateFrom!;
      });
    }
    if (args.dateTo) {
      filtered = filtered.filter((p) => {
        const date = p.publishedAt ?? p.createdAt;
        return date <= args.dateTo!;
      });
    }

    // Filter by sticky
    if (args.isSticky !== undefined) {
      filtered = filtered.filter((p) => (p.isSticky ?? false) === args.isSticky);
    }

    // Filter by category (via termRelationships)
    // Bounded to 10,000 relationships per term
    if (args.categoryId) {
      const categoryRels = await ctx.db
        .query("termRelationships")
        .withIndex("by_term", (q) => q.eq("termId", args.categoryId!))
        .take(10000);
      const postIdsInCategory = new Set(categoryRels.map((r) => r.postId.toString()));
      filtered = filtered.filter((p) => postIdsInCategory.has(p._id.toString()));
    }

    // Filter by tag (via termRelationships)
    // Bounded to 10,000 relationships per term
    if (args.tagId) {
      const tagRels = await ctx.db
        .query("termRelationships")
        .withIndex("by_term", (q) => q.eq("termId", args.tagId!))
        .take(10000);
      const postIdsWithTag = new Set(tagRels.map((r) => r.postId.toString()));
      filtered = filtered.filter((p) => postIdsWithTag.has(p._id.toString()));
    }

    // Apply role-based filtering
    filtered = filterByRole(filtered, user._id, roleLevel);

    // ── Sort ────────────────────────────────────────────────────────────
    const orderBy = args.orderBy ?? "createdAt";
    const orderDir = args.orderDir ?? "desc";

    filtered.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (orderBy) {
        case "publishedAt":
          aVal = a.publishedAt ?? 0;
          bVal = b.publishedAt ?? 0;
          break;
        case "updatedAt":
          aVal = a.updatedAt;
          bVal = b.updatedAt;
          break;
        case "title":
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case "commentCount":
          aVal = a.commentCount ?? 0;
          bVal = b.commentCount ?? 0;
          break;
        case "createdAt":
        default:
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
      }

      if (orderDir === "asc") {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });

    // ── Paginate ────────────────────────────────────────────────────────
    const total = filtered.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const posts = filtered.slice(offset, offset + perPage);

    // Denormalize author data
    const postsWithAuthors = await Promise.all(
      posts.map(async (post) => {
        const author = await ctx.db.get("users", post.authorId);
        return {
          ...post,
          author: author
            ? {
                _id: author._id,
                displayName: author.displayName ?? author.email,
                email: author.email,
              }
            : null,
        };
      }),
    );

    return { posts: postsWithAuthors, total, page, perPage, totalPages };
  },
});

// ─── Get ────────────────────────────────────────────────────────────────────

/**
 * Get a single post by ID or slug+type.
 *
 * Auth-aware: public posts visible to all, private/draft require capabilities.
 * Returns null if post not found.
 */
export const get = query({
  args: getPostArgs,
  handler: async (ctx, args) => {
    let post;

    if (args.postId) {
      post = await ctx.db.get("posts", args.postId);
    } else if (args.slug) {
      const type = args.type ?? "post";
      post = await ctx.db
        .query("posts")
        .withIndex("by_slug", (q) =>
          q.eq("slug", args.slug!).eq("type", type),
        )
        .first();
    } else {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Either postId or slug must be provided",
      });
    }

    if (!post) return null;

    // ── Visibility checks ───────────────────────────────────────────────
    if (post.status === "publish") {
      // Check password protection
      if (post.visibility === "password") {
        // Return post with content withheld
        const author = await ctx.db.get("users", post.authorId);
        return {
          ...post,
          content: undefined, // Withhold content
          isPasswordProtected: true,
          author: author
            ? {
                _id: author._id,
                displayName: author.displayName ?? author.email,
                email: author.email,
              }
            : null,
        };
      }

      // Public post - visible to all
      const author = await ctx.db.get("users", post.authorId);
      return {
        ...post,
        isPasswordProtected: false,
        author: author
          ? {
              _id: author._id,
              displayName: author.displayName ?? author.email,
              email: author.email,
            }
          : null,
      };
    }

    // Non-public statuses require auth
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    try {
      await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "read");
    } catch {
      return null; // User cannot view this post
    }

    const author = await ctx.db.get("users", post.authorId);
    return {
      ...post,
      isPasswordProtected: post.visibility === "password",
      author: author
        ? {
            _id: author._id,
            displayName: author.displayName ?? author.email,
            email: author.email,
          }
        : null,
    };
  },
});

// ─── Get Published (Public) ─────────────────────────────────────────────────

/**
 * Get a single published post by slug. No auth required.
 * Returns only published posts. Used by the website frontend.
 */
export const getPublished = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db
      .query("posts")
      .withIndex("by_slug", (q) =>
        q.eq("slug", args.slug).eq("type", "post"),
      )
      .first();

    if (!post || post.status !== "publish") return null;

    // ── Resolve featured image ──────────────────────────────────────────
    let featuredImageUrl: string | undefined;
    let featuredImageAlt: string | undefined;
    if (post.featuredImageId) {
      const media = await ctx.db.get("media", post.featuredImageId);
      if (media) {
        featuredImageUrl = (media as MediaDoc).url || (media as MediaDoc).storageUrl;
        featuredImageAlt = (media as MediaDoc).altText;
      }
    }

    // Password-protected posts: withhold content
    if (post.visibility === "password") {
      const author = await ctx.db.get("users", post.authorId);
      return {
        ...post,
        content: undefined,
        isPasswordProtected: true,
        featuredImageUrl,
        featuredImageAlt,
        author: author
          ? {
              _id: author._id,
              displayName: author.displayName ?? author.email,
              bio: (author as AuthorDoc).bio,
              avatarUrl: (author as AuthorDoc).avatarUrl ?? (author as AuthorDoc).profilePictureUrl,
              slug: (author as AuthorDoc).slug,
            }
          : null,
      };
    }

    const author = await ctx.db.get("users", post.authorId);
    return {
      ...post,
      isPasswordProtected: false,
      featuredImageUrl,
      featuredImageAlt,
      author: author
        ? {
            _id: author._id,
            displayName: author.displayName ?? author.email,
            bio: (author as AuthorDoc).bio,
            avatarUrl: (author as AuthorDoc).avatarUrl ?? (author as AuthorDoc).profilePictureUrl,
            slug: (author as AuthorDoc).slug,
          }
        : null,
    };
  },
});

// ─── List Published (Public) ────────────────────────────────────────────────

/**
 * Paginated list of published posts for the blog index.
 * No auth required. Returns only published, public posts.
 * Sticky posts appear first.
 */
export const listPublished = query({
  args: {
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
    authorId: v.optional(v.id("users")),
    categoryId: v.optional(v.id("terms")),
    tagId: v.optional(v.id("terms")),
  },
  handler: async (ctx, args) => {
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, args.perPage ?? DEFAULT_PER_PAGE_WEBSITE));

    // Get all published posts
    let allPosts = await ctx.db
      .query("posts")
      .withIndex("by_type_status", (q) =>
        q.eq("type", "post").eq("status", "publish"),
      )
      .take(10000);

    // Filter out private and password-protected posts for public listing
    allPosts = allPosts.filter((p) => p.visibility === "public");

    // Filter by author if specified
    if (args.authorId) {
      allPosts = allPosts.filter(
        (p) => p.authorId.toString() === args.authorId!.toString(),
      );
    }

    // Filter by category if specified (H5 fix)
    // Bounded to 10,000 relationships per term
    if (args.categoryId) {
      const categoryRels = await ctx.db
        .query("termRelationships")
        .withIndex("by_term", (q) => q.eq("termId", args.categoryId!))
        .take(10000);
      const postIdsInCategory = new Set(categoryRels.map((r) => r.postId.toString()));
      allPosts = allPosts.filter((p) => postIdsInCategory.has(p._id.toString()));
    }

    // Filter by tag if specified (H5 fix)
    // Bounded to 10,000 relationships per term
    if (args.tagId) {
      const tagRels = await ctx.db
        .query("termRelationships")
        .withIndex("by_term", (q) => q.eq("termId", args.tagId!))
        .take(10000);
      const postIdsWithTag = new Set(tagRels.map((r) => r.postId.toString()));
      allPosts = allPosts.filter((p) => postIdsWithTag.has(p._id.toString()));
    }

    // Sort: sticky first, then by publishedAt desc
    allPosts.sort((a, b) => {
      // Sticky posts first
      if (a.isSticky && !b.isSticky) return -1;
      if (!a.isSticky && b.isSticky) return 1;
      // Then by publishedAt descending
      const aDate = a.publishedAt ?? 0;
      const bDate = b.publishedAt ?? 0;
      return bDate - aDate;
    });

    // Paginate
    const total = allPosts.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const posts = allPosts.slice(offset, offset + perPage);

    // Denormalize author data, resolve featured images, and find primary category
    const postsWithAuthors = await Promise.all(
      posts.map(async (post) => {
        const author = await ctx.db.get("users", post.authorId);

        // Resolve featured image URL
        let featuredImageUrl: string | undefined;
        let featuredImageAlt: string | undefined;
        if (post.featuredImageId) {
          const media = await ctx.db.get("media", post.featuredImageId);
          if (media) {
            featuredImageUrl = (media as MediaDoc).url || (media as MediaDoc).storageUrl;
            featuredImageAlt = (media as MediaDoc).altText;
          }
        }

        // Resolve primary category (first category term assigned to this post)
        // Bounded to 50 terms per post - posts rarely have more than 10
        let primaryCategory: { _id: Id<"terms">; name: string; slug: string } | null = null;
        const termRels = await ctx.db
          .query("termRelationships")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .take(50);

        for (const rel of termRels) {
          const term = await ctx.db.get("terms", rel.termId);
          if (term && term.taxonomy === "category") {
            primaryCategory = {
              _id: term._id,
              name: term.name,
              slug: term.slug,
            };
            break; // Take the first category found
          }
        }

        return {
          ...post,
          featuredImageUrl,
          featuredImageAlt,
          primaryCategory,
          author: author
            ? {
                _id: author._id,
                displayName: author.displayName ?? author.email,
                avatarUrl: (author as AuthorDoc).avatarUrl ?? (author as AuthorDoc).profilePictureUrl,
                slug: (author as AuthorDoc).slug,
              }
            : null,
        };
      }),
    );

    return { posts: postsWithAuthors, total, page, perPage, totalPages };
  },
});

// ─── Counts ─────────────────────────────────────────────────────────────────

/**
 * Count posts by status for the admin sidebar badges.
 * Requires authentication.
 */
export const counts = query({
  args: countsArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const type = args.type ?? "post";
    const roleLevel = await getUserRoleLevel(ctx, user as AuthUser);

    // Get all posts of this type
    const allPosts = await ctx.db
      .query("posts")
      .withIndex("by_type_status", (q) => q.eq("type", type))
      .take(10000);

    // Apply role-based filtering
    const accessible = filterByRole(allPosts, user._id, roleLevel);

    // Count by status
    const countMap = {
      all: 0,
      publish: 0,
      draft: 0,
      pending: 0,
      future: 0,
      private: 0,
      trash: 0,
      mine: 0,
    };

    for (const post of accessible) {
      if (post.status !== "trash") {
        countMap.all++;
      }

      switch (post.status) {
        case "publish":
          countMap.publish++;
          break;
        case "draft":
        case "auto-draft":
          countMap.draft++;
          break;
        case "pending":
          countMap.pending++;
          break;
        case "future":
          countMap.future++;
          break;
        case "private":
          countMap.private++;
          break;
        case "trash":
          countMap.trash++;
          break;
      }

      // Count "mine" (current user's posts across all non-trash statuses)
      if (
        post.authorId.toString() === user._id.toString() &&
        post.status !== "trash"
      ) {
        countMap.mine++;
      }
    }

    return countMap;
  },
});

// ─── Get Sticky (Public) ────────────────────────────────────────────────────

/**
 * Get sticky posts for the blog homepage.
 * No auth required. Returns only published, public sticky posts.
 * Bounded to 50 sticky posts - sites rarely have more than 10.
 */
export const getSticky = query({
  args: {},
  handler: async (ctx) => {
    // Bounded to 50 - sticky posts are typically < 10
    const stickyPosts = await ctx.db
      .query("posts")
      .withIndex("by_type_sticky", (q) =>
        q.eq("type", "post").eq("isSticky", true),
      )
      .take(50);

    // Filter to published + public only
    const published = stickyPosts.filter(
      (p) => p.status === "publish" && p.visibility === "public",
    );

    // Sort by publishedAt descending
    published.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

    // Denormalize author data
    return Promise.all(
      published.map(async (post) => {
        const author = await ctx.db.get("users", post.authorId);
        return {
          ...post,
          author: author
            ? {
                _id: author._id,
                displayName: author.displayName ?? author.email,
                avatarUrl: (author as AuthorDoc).avatarUrl ?? (author as AuthorDoc).profilePictureUrl,
                slug: (author as AuthorDoc).slug,
              }
            : null,
        };
      }),
    );
  },
});

// ─── Get Slugs (Public) ─────────────────────────────────────────────────────

/**
 * Get all published post slugs for sitemap generation.
 * No auth required.
 * Bounded to 50,000 posts - sufficient for most sites.
 * For very large sites, consider pagination or streaming.
 */
export const getSlugs = query({
  args: {},
  handler: async (ctx) => {
    // Bounded to 50,000 - sufficient for sitemap generation
    const publishedPosts = await ctx.db
      .query("posts")
      .withIndex("by_type_status", (q) =>
        q.eq("type", "post").eq("status", "publish"),
      )
      .take(50000);

    return publishedPosts
      .filter((p) => p.visibility !== "private")
      .map((p) => ({
        slug: p.slug,
        publishedAt: p.publishedAt,
        updatedAt: p.updatedAt,
      }));
  },
});

// ─── Preview ────────────────────────────────────────────────────────────────

/**
 * Get post data merged with autosave content for preview.
 * Requires authentication and edit capability.
 */
export const preview = query({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const post = await ctx.db.get("posts", args.postId);
    if (!post) return null;

    await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "read");

    // Merge autosave content if newer
    const previewData = { ...post };
    if (post.autosavedAt) {
      if (post.autosaveTitle !== undefined) {
        previewData.title = post.autosaveTitle;
      }
      if (post.autosaveContent !== undefined) {
        previewData.content = post.autosaveContent;
      }
    }

    const author = await ctx.db.get("users", post.authorId);
    return {
      ...previewData,
      author: author
        ? {
            _id: author._id,
            displayName: author.displayName ?? author.email,
            email: author.email,
          }
        : null,
    };
  },
});

// ─── PostMeta Queries ───────────────────────────────────────────────────────

/**
 * Get all meta records for a post.
 *
 * Auth-aware: if the parent post is published, meta is readable by all.
 * If draft/private/pending, only authorized users can read meta.
 */
export const getMetaByPost = query({
  args: getMetaByPostArgs,
  handler: async (ctx, args) => {
    // Verify user can access the parent post's metadata
    const post = await ctx.db.get("posts", args.postId);
    if (!post) return [];

    // Published public posts: meta is readable by all
    // Bounded to 100 meta records per post - posts rarely have more than 20
    if (post.status === "publish" && post.visibility !== "private") {
      return await ctx.db
        .query("postMeta")
        .withIndex("by_post", (q) => q.eq("postId", args.postId))
        .take(100);
    }

    // Non-public posts: require auth and capability check
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    try {
      await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "read");
    } catch {
      return []; // User cannot access this post's metadata
    }

    return await ctx.db
      .query("postMeta")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(100);
  },
});

/**
 * Get a specific meta value for a post.
 *
 * Auth-aware: if the parent post is published, meta is readable by all.
 * If draft/private/pending, only authorized users can read meta.
 */
export const getMetaByKey = query({
  args: getMetaByKeyArgs,
  handler: async (ctx, args) => {
    // Verify user can access the parent post's metadata
    const post = await ctx.db.get("posts", args.postId);
    if (!post) return null;

    // Published public posts: meta is readable by all
    if (post.status === "publish" && post.visibility !== "private") {
      return await ctx.db
        .query("postMeta")
        .withIndex("by_post_key", (q) =>
          q.eq("postId", args.postId).eq("key", args.key),
        )
        .unique();
    }

    // Non-public posts: require auth and capability check
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    try {
      await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "read");
    } catch {
      return null; // User cannot access this post's metadata
    }

    return await ctx.db
      .query("postMeta")
      .withIndex("by_post_key", (q) =>
        q.eq("postId", args.postId).eq("key", args.key),
      )
      .unique();
  },
});

// ─── Get Related Posts (Public) ─────────────────────────────────────────────

/**
 * Get related posts by shared categories/tags.
 * No auth required. Returns published, public posts only.
 *
 * Logic:
 *   1. Get the source post's term relationships
 *   2. For each related term, find other posts that also have that term
 *   3. Score posts by how many terms they share
 *   4. Exclude the source post
 *   5. Return top N by score with basic fields
 */
export const getRelatedPosts = query({
  args: {
    postId: v.id("posts"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxResults = Math.min(Math.max(1, args.limit ?? 3), 10);

    // Get the source post to verify it exists
    const sourcePost = await ctx.db.get("posts", args.postId);
    if (!sourcePost) return [];

    // Get all term relationships for this post
    // Bounded to 50 terms per post
    const postTermRels = await ctx.db
      .query("termRelationships")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(50);

    if (postTermRels.length === 0) return [];

    // For each term, find other posts that share it.
    // Store typed Id<"posts"> alongside the score so we can use ctx.db.get directly.
    const postScoreMap = new Map<string, { postId: Id<"posts">; score: number }>();
    const sourcePostIdStr = args.postId.toString();

    for (const rel of postTermRels) {
      // Bounded to 1000 posts per term for related posts calculation
      const termPosts = await ctx.db
        .query("termRelationships")
        .withIndex("by_term", (q) => q.eq("termId", rel.termId))
        .take(1000);

      for (const tp of termPosts) {
        const tpIdStr = tp.postId.toString();
        if (tpIdStr === sourcePostIdStr) continue; // Exclude the source post

        const existing = postScoreMap.get(tpIdStr);
        if (existing) {
          existing.score++;
        } else {
          postScoreMap.set(tpIdStr, { postId: tp.postId, score: 1 });
        }
      }
    }

    if (postScoreMap.size === 0) return [];

    // Sort by score descending, take extra in case some aren't published
    const sortedEntries = [...postScoreMap.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults * 3);

    // Fetch the actual posts and filter to published + public only
    const results: Array<{
      _id: Id<"posts">;
      title: string;
      slug: string;
      excerpt?: string;
      featuredImageId?: Id<"media">;
      publishedAt?: number;
      score: number;
    }> = [];

    for (const entry of sortedEntries) {
      if (results.length >= maxResults) break;

      const post = await ctx.db.get("posts", entry.postId);
      if (!post) continue;
      if (post.status !== "publish" || post.visibility !== "public") continue;
      if (post.type !== "post") continue;

      results.push({
        _id: post._id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        featuredImageId: post.featuredImageId,
        publishedAt: post.publishedAt,
        score: entry.score,
      });
    }

    return results;
  },
});

// ─── Get Adjacent Posts (Public) ────────────────────────────────────────────

/**
 * Get the chronologically adjacent published posts (previous and next).
 * No auth required. Returns only published, public posts of type "post".
 *
 * Previous = most recent published post BEFORE this one's publishedAt.
 * Next = oldest published post AFTER this one's publishedAt.
 */
export const getAdjacentPosts = query({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get("posts", args.postId);
    if (!post || !post.publishedAt) {
      return { previous: null, next: null };
    }

    const publishedAt = post.publishedAt;

    // Get all published posts of type "post" using the by_type_status_published index
    // This index has fields: [type, status, publishedAt]
    const allPublished = await ctx.db
      .query("posts")
      .withIndex("by_type_status_published", (q) =>
        q.eq("type", "post").eq("status", "publish"),
      )
      .take(5000);

    // Filter to public visibility only, exclude the source post
    const publicPosts = allPublished.filter(
      (p) =>
        p.visibility === "public" &&
        p._id.toString() !== args.postId.toString(),
    );

    // Find previous (most recent before this post's publishedAt)
    let previous: {
      _id: Id<"posts">;
      title: string;
      slug: string;
      featuredImageId?: Id<"media">;
    } | null = null;

    let prevBestDate = 0;
    for (const p of publicPosts) {
      const pDate = p.publishedAt ?? 0;
      if (pDate < publishedAt && pDate > prevBestDate) {
        prevBestDate = pDate;
        previous = {
          _id: p._id,
          title: p.title,
          slug: p.slug,
          featuredImageId: p.featuredImageId,
        };
      }
    }

    // Find next (oldest after this post's publishedAt)
    let next: {
      _id: Id<"posts">;
      title: string;
      slug: string;
      featuredImageId?: Id<"media">;
    } | null = null;

    let nextBestDate = Infinity;
    for (const p of publicPosts) {
      const pDate = p.publishedAt ?? 0;
      if (pDate > publishedAt && pDate < nextBestDate) {
        nextBestDate = pDate;
        next = {
          _id: p._id,
          title: p.title,
          slug: p.slug,
          featuredImageId: p.featuredImageId,
        };
      }
    }

    return { previous, next };
  },
});

// ─── Get Date Archive Groups (Public) ───────────────────────────────────────

/**
 * Get post counts grouped by year/month for archive sidebar widgets.
 * No auth required. Counts only published, public posts.
 *
 * Returns array of { year, month, count } sorted newest first.
 */
export const getDateArchiveGroups = query({
  args: {
    type: v.optional(v.union(v.literal("post"), v.literal("page"))),
  },
  handler: async (ctx, args) => {
    const type = args.type ?? "post";

    // Get all published posts of the specified type
    const publishedPosts = await ctx.db
      .query("posts")
      .withIndex("by_type_status", (q) =>
        q.eq("type", type).eq("status", "publish"),
      )
      .take(10000);

    // Filter to public visibility
    const publicPosts = publishedPosts.filter(
      (p) => p.visibility === "public",
    );

    // Group by year/month from publishedAt
    const groups = new Map<string, { year: number; month: number; count: number }>();

    for (const post of publicPosts) {
      if (!post.publishedAt) continue;
      const date = new Date(post.publishedAt);
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // 1-based
      const key = `${year}-${month}`;

      const existing = groups.get(key);
      if (existing) {
        existing.count++;
      } else {
        groups.set(key, { year, month, count: 1 });
      }
    }

    // Sort descending by year then month
    const result = [...groups.values()].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    return result;
  },
});

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Filter posts based on the user's role level.
 *
 * - Level 80+ (Editor/Admin): See all posts
 * - Level 60 (Author): See own posts (all statuses) + all published
 * - Level 40 (Contributor): See own draft/pending + all published
 * - Level 20 (Subscriber): See only published + own (if any)
 */
function filterByRole(
  posts: PostRow[],
  userId: Id<"users">,
  roleLevel: number,
): PostRow[] {
  // Editors and Admins see everything
  if (roleLevel >= 80) return posts;

  const userIdStr = userId.toString();

  return posts.filter((post) => {
    const isOwn = post.authorId.toString() === userIdStr;

    // Authors (60): own posts (all statuses) + all published
    if (roleLevel >= 60) {
      return isOwn || post.status === "publish";
    }

    // Contributors (40): own draft/pending + all published
    if (roleLevel >= 40) {
      if (isOwn) {
        return ["draft", "auto-draft", "pending"].includes(post.status);
      }
      return post.status === "publish";
    }

    // Subscribers (20): only published
    return post.status === "publish";
  });
}
