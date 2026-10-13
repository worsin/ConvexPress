import { canonicalBoundary, createApiDocument, updateApiDocument, readApiDocument } from "../canonicalDocuments/service";
import { apiDocumentInput, apiPageInput, apiDocumentRead } from "../canonicalDocuments/apiValidators";
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

import { patchWithMediaReferences } from "../media/attachmentGuard";
import { readPublicContent, publicContentAuthor } from "../helpers/publicContent";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { emitEvent } from "../helpers/events";
import { POST_EVENTS, SYSTEM } from "../events/constants";

import { postsDocs } from "../schema/posts.docs.generated";
/** Valid post status values */


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
  returns: v.object({
    posts: v.array(v.object({
      author: v.union(v.null(), v.object({ _id: v.id("users"), displayName: v.string() })),
      isPasswordProtected: v.boolean(),
      passwordVerified: v.boolean(),
      isMembershipRestricted: v.boolean(),
      membershipAccess: v.object({
        allowed: v.boolean(),
        reason: v.string(),
        teaserMode: v.union(v.null(), v.literal("excerpt"), v.literal("hide"), v.literal("custom_message")),
        customMessage: v.union(v.null(), v.string()),
        matchingPlanIds: v.array(v.string()),
      }),
      _id: v.id("posts"),
      _creationTime: v.number(),
      type: v.union(v.literal("post"), v.literal("page")),
      title: v.string(),
      slug: v.string(),
      status: v.union(v.literal("draft"), v.literal("pending"), v.literal("trash"), v.literal("auto-draft"), v.literal("publish"), v.literal("future"), v.literal("private")),
      visibility: v.union(v.literal("private"), v.literal("public"), v.literal("password")),
      authorId: v.id("users"),
      featuredImageId: v.optional(v.id("media")),
      commentStatus: v.union(v.literal("open"), v.literal("closed")),
      commentCount: v.optional(v.number()),
      isSticky: v.optional(v.boolean()),
      publishedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
      parentId: v.optional(v.id("posts")),
      menuOrder: v.optional(v.number()),
      pageTemplate: v.optional(v.string()),
      path: v.optional(v.string()),
      depth: v.optional(v.number()),
      hideHeader: v.optional(v.boolean()),
      hideFooter: v.optional(v.boolean()),
      layoutId: v.optional(v.string()),
      excerpt: v.optional(v.string()),
      blocks: postsDocs.posts.fields.blocks,
      blocksVersion: v.optional(v.number()),
      blocksRevision: v.optional(v.number()),
      hero: v.optional(v.object({
        title: v.optional(v.string()),
        content: v.optional(v.string()),
        subtitle: v.optional(v.string()),
        imageId: v.optional(v.id("media")),
        videoUrl: v.optional(v.string()),
        ctaText: v.optional(v.string()),
        ctaUrl: v.optional(v.string()),
      })),
      topics: v.optional(v.array(v.object({
        title: v.optional(v.string()),
        content: v.optional(v.string()),
        subtitle: v.optional(v.string()),
        imageId: v.optional(v.id("media")),
        videoUrl: v.optional(v.string()),
      }))),
      summary: v.optional(v.object({ title: v.optional(v.string()), content: v.optional(v.string()) })),
      sources: v.optional(v.string()),
      tableOfContents: v.optional(v.string()),
    })),
    total: v.number(),
    page: v.number(),
    perPage: v.number(),
  }),
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
          ...(await readPublicContent(ctx, post))!,
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
 args:{postId:v.id("posts"),keyId:v.id("apiKeys")},
 returns:apiDocumentRead,
 handler:(ctx,args)=>canonicalBoundary(()=>readApiDocument(ctx,"post",args.postId,args.keyId)),
});

export const createInternal = internalMutation({
 args: {...apiDocumentInput,title:v.string()},
 returns:v.id("posts"),
 handler:(ctx,args)=>canonicalBoundary(()=>createApiDocument(ctx,"post",args)),
});

export const updateInternal = internalMutation({
 args: {...apiDocumentInput,postId:v.id("posts"),expectedRevision:v.number()},
 returns:v.object({postId:v.id("posts"),revision:v.number(),digest:v.string(),changed:v.boolean()}),
 handler:(ctx,args)=>canonicalBoundary(()=>updateApiDocument(ctx,"post",{...args,postId:args.postId})),
});

export const trashInternal = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new Error("Post not found");
    }
    if (post.status === "trash") {
      throw new Error("Post is already in trash");
    }

    const now = Date.now();

    await patchWithMediaReferences<"posts">(ctx, "posts", args.postId, {
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
