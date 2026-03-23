/**
 * Post System - HTTP API Internal Functions
 *
 * These internal functions are used exclusively by HTTP actions (httpAction).
 * They are NOT client-callable, providing a security layer between the public
 * HTTP API and the database operations.
 *
 * This addresses security issue H-17: HTTP actions should use internal functions
 * instead of public API functions.
 *
 * Functions:
 *   listPublishedInternal - List published posts for HTTP API
 *   getInternal           - Get single post for HTTP API
 *   createInternal        - Create post via HTTP API
 *   updateInternal        - Update post via HTTP API
 *   trashInternal         - Trash post via HTTP API
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { emitEvent } from "../helpers/events";
import { POST_EVENTS, SYSTEM } from "../events/constants";

/** Valid post status values */
type PostStatus = "auto-draft" | "draft" | "pending" | "publish" | "future" | "private" | "trash";

/** User record with profile fields that may be merged */
interface UserWithProfile {
  _id: string;
  email?: string;
  displayName?: string;
}

/**
 * Internal version of listPublished for HTTP API.
 * No auth required - caller (HTTP handler) handles API key auth.
 */
export const listPublishedInternal = internalQuery({
  args: {
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 10));

    // Get all published posts
    let allPosts = await ctx.db
      .query("posts")
      .withIndex("by_type_status", (q) =>
        q.eq("type", "post").eq("status", "publish"),
      )
      .take(10000);

    // Filter out private and password-protected posts for public listing
    allPosts = allPosts.filter((p) => p.visibility === "public");

    // Sort: sticky first, then by publishedAt desc
    allPosts.sort((a, b) => {
      if (a.isSticky && !b.isSticky) return -1;
      if (!a.isSticky && b.isSticky) return 1;
      const aDate = a.publishedAt ?? 0;
      const bDate = b.publishedAt ?? 0;
      return bDate - aDate;
    });

    // Paginate
    const total = allPosts.length;
    const offset = (page - 1) * perPage;
    const posts = allPosts.slice(offset, offset + perPage);

    // Denormalize author data
    const postsWithAuthors = await Promise.all(
      posts.map(async (post) => {
        const author = await ctx.db.get("users", post.authorId);
        return {
          ...post,
          author: author
            ? {
                _id: author._id,
                displayName: (author as UserWithProfile).displayName ?? author.email,
              }
            : null,
        };
      }),
    );

    return { posts: postsWithAuthors, total, page, perPage };
  },
});

/**
 * Internal version of get for HTTP API.
 * No auth required - caller handles API key auth.
 */
export const getInternal = internalQuery({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get("posts", args.postId);
    if (!post || post.type !== "post") return null;

    const author = await ctx.db.get("users", post.authorId);
    return {
      ...post,
      isPasswordProtected: post.visibility === "password",
      author: author
        ? {
            _id: author._id,
            displayName: (author as UserWithProfile).displayName ?? author.email,
          }
        : null,
    };
  },
});

/**
 * Internal version of create for HTTP API.
 * Authentication is handled by the HTTP handler via API key.
 * This function performs the database operations without client-side auth checks.
 */
export const createInternal = internalMutation({
  args: {
    title: v.string(),
    content: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    status: v.optional(v.string()),
    slug: v.optional(v.string()),
    authorId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const status = args.status ?? "draft";

    // Generate slug from title
    const baseSlug = (args.slug || args.title || "post")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 200) || "post";

    // Check for slug uniqueness and append suffix if needed
    let slug = baseSlug;
    let suffix = 0;
    while (true) {
      const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
      const existing = await ctx.db
        .query("posts")
        .withIndex("by_slug", (q) => q.eq("slug", candidate).eq("type", "post"))
        .first();
      if (!existing) {
        slug = candidate;
        break;
      }
      suffix++;
      if (suffix > 100) {
        slug = `${baseSlug}-${now}`;
        break;
      }
    }

    const postId = await ctx.db.insert("posts", {
      type: "post",
      title: args.title,
      slug,
      content: args.content ?? "",
      excerpt: args.excerpt,
      status: status as PostStatus,
      visibility: "public",
      authorId: args.authorId,
      commentStatus: "open",
      commentCount: 0,
      isSticky: false,
      publishedAt: status === "publish" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Emit event
    await emitEvent(ctx, POST_EVENTS.CREATED, SYSTEM.POST, {
      postId,
      title: args.title,
      authorId: args.authorId,
      postType: "post",
      status,
    });

    return postId;
  },
});

/**
 * Internal version of update for HTTP API.
 */
export const updateInternal = internalMutation({
  args: {
    postId: v.id("posts"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    status: v.optional(v.string()),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new Error("Post not found");
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };

    if (args.title !== undefined) patch.title = args.title;
    if (args.content !== undefined) patch.content = args.content;
    if (args.excerpt !== undefined) patch.excerpt = args.excerpt;
    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "publish" && !post.publishedAt) {
        patch.publishedAt = now;
      }
    }
    if (args.slug !== undefined) patch.slug = args.slug;

    await ctx.db.patch("posts", args.postId, patch);

    await emitEvent(ctx, POST_EVENTS.UPDATED, SYSTEM.POST, {
      postId: args.postId,
      title: (patch.title as string) ?? post.title,
      authorId: post.authorId,
      changes: Object.keys(patch).filter((k) => k !== "updatedAt"),
    });

    return args.postId;
  },
});

/**
 * Internal version of trash for HTTP API.
 */
export const trashInternal = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new Error("Post not found");
    }
    if (post.status === "trash") {
      throw new Error("Post is already in trash");
    }

    const now = Date.now();

    await ctx.db.patch("posts", args.postId, {
      previousStatus: post.status,
      status: "trash",
      trashedAt: now,
      updatedAt: now,
    });

    // Schedule auto-purge after 30 days
    const TRASH_PURGE_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    await ctx.scheduler.runAt(
      now + TRASH_PURGE_DAYS_MS,
      internal.posts.internals.purgeOldTrash,
      { postId: args.postId },
    );

    await emitEvent(ctx, POST_EVENTS.TRASHED, SYSTEM.POST, {
      postId: args.postId,
      title: post.title,
      authorId: post.authorId,
    });

    return { success: true };
  },
});
