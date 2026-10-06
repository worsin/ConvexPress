import { canonicalBoundary, createApiDocument, updateApiDocument, readApiDocument } from "../canonicalDocuments/service";
import { apiDocumentInput, apiPageInput, apiDocumentRead } from "../canonicalDocuments/apiValidators";
/**
 * Page System - HTTP API Internal Functions
 *
 * These internal functions are used exclusively by HTTP actions (httpAction).
 * They are NOT client-callable, providing a security layer between the public
 * HTTP API and the database operations.
 *
 * This addresses security issue H-17: HTTP actions should use internal functions
 * instead of public API functions.
 *
 * Functions:
 *   listPublishedInternal - List published pages for HTTP API
 *   getInternal           - Get single page for HTTP API
 *   createInternal        - Create page via HTTP API
 *   updateInternal        - Update page via HTTP API
 *   trashInternal         - Trash page via HTTP API
 */

import { readPublicContent, canDiscoverContent } from "../helpers/publicContent";
import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

/** Valid post status values */

import { emitEvent } from "../helpers/events";
import { PAGE_EVENTS, SYSTEM } from "../events/constants";
import type { Id } from "../_generated/dataModel";
import { patchWithMediaReferences } from "../media/attachmentGuard";

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
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 100));

    // Fetch all published pages
    const candidates = await ctx.db
      .query("posts")
      .withIndex("by_type_status_published", (q) =>
        q.eq("type", "page").eq("status", "publish"),
      )
      .collect();

    const allPublished = [];
    for (const candidate of candidates) {
      if (await canDiscoverContent(ctx, candidate)) allPublished.push(candidate);
    }

    // Sort by menuOrder then title
    allPublished.sort((a, b) => {
      const orderCmp = ((a.menuOrder as number) ?? 0) - ((b.menuOrder as number) ?? 0);
      if (orderCmp !== 0) return orderCmp;
      return a.title.localeCompare(b.title);
    });

    // Paginate
    const total = allPublished.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const paginated = allPublished.slice(offset, offset + perPage);

    // Return lightweight shape for public consumers
    const pages = paginated.map((p) => ({
      _id: p._id,
      title: p.title,
      slug: p.slug,
      path: p.path,
      depth: p.depth,
      menuOrder: p.menuOrder,
      parentId: p.parentId,
      pageTemplate: p.pageTemplate,
      excerpt: p.excerpt,
      featuredImageId: p.featuredImageId,
      publishedAt: p.publishedAt,
      createdAt: p.createdAt,
    }));

    return { pages, total, page, perPage, totalPages };
  },
});

/**
 * Internal version of get for HTTP API.
 * No auth required - caller handles API key auth.
 */
export const getInternal = internalQuery({
 args:{pageId:v.id("posts"),keyId:v.id("apiKeys")},
 returns:apiDocumentRead,
 handler:(ctx,args)=>canonicalBoundary(()=>readApiDocument(ctx,"page",args.pageId,args.keyId)),
});

export const createInternal = internalMutation({
 args: {...apiDocumentInput,...apiPageInput,title:v.string()},
 returns:v.id("posts"),
 handler:(ctx,args)=>canonicalBoundary(()=>createApiDocument(ctx,"page",args)),
});

export const updateInternal = internalMutation({
 args: {...apiDocumentInput,...apiPageInput,pageId:v.id("posts"),expectedRevision:v.number()},
 returns:v.object({postId:v.id("posts"),revision:v.number(),digest:v.string(),changed:v.boolean()}),
 handler:(ctx,args)=>canonicalBoundary(()=>updateApiDocument(ctx,"page",{...args,postId:args.pageId})),
});

export const trashInternal = internalMutation({
  args: {
    pageId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.get("posts", args.pageId);
    if (!page || page.type !== "page") {
      throw new Error("Page not found");
    }
    if (page.status === "trash") {
      throw new Error("Page is already in trash");
    }

    const now = Date.now();

    await patchWithMediaReferences<"posts">(ctx, "posts", args.pageId, {
      previousStatus: page.status,
      status: "trash",
      trashedAt: now,
      updatedAt: now,
    });

    await emitEvent(ctx, PAGE_EVENTS.TRASHED, SYSTEM.PAGE, {
      pageId: args.pageId,
      title: page.title,
      authorId: page.authorId,
    });

    return { success: true };
  },
});
