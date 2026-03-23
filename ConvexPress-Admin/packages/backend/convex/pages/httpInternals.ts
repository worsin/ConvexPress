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

import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";

/** Valid post status values */
type PostStatus = "auto-draft" | "draft" | "pending" | "publish" | "future" | "private" | "trash";
import { emitEvent } from "../helpers/events";
import { PAGE_EVENTS, SYSTEM } from "../events/constants";
import type { Id } from "../_generated/dataModel";

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
    const allPublished = await ctx.db
      .query("posts")
      .withIndex("by_type_status_published", (q) =>
        q.eq("type", "page").eq("status", "publish"),
      )
      .collect();

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
  args: {
    pageId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.get("posts", args.pageId);
    if (!page || page.type !== "page") return null;

    // Enrich with parent info
    let parentInfo = null;
    if (page.parentId) {
      const parent = await ctx.db.get("posts", page.parentId as Id<"posts">);
      if (parent && parent.type === "page") {
        parentInfo = {
          _id: parent._id,
          title: parent.title,
          slug: parent.slug,
          path: parent.path,
        };
      }
    }

    // Fetch direct children
    const childrenQuery = await ctx.db
      .query("posts")
      .withIndex("by_type_parent", (q) =>
        q.eq("type", "page").eq("parentId", page._id),
      )
      .collect();

    const children = childrenQuery
      .filter((c) => c.status === "publish")
      .sort((a, b) =>
        ((a.menuOrder as number) ?? 0) - ((b.menuOrder as number) ?? 0),
      )
      .map((c) => ({
        _id: c._id,
        title: c.title,
        slug: c.slug,
        status: c.status,
        menuOrder: c.menuOrder,
        path: c.path,
      }));

    return {
      ...page,
      isPasswordProtected: page.visibility === "password",
      parent: parentInfo,
      children,
    };
  },
});

/**
 * Slugify a string for URL-safe page slugs.
 */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200) || "page";
}

/**
 * Generate a unique slug for a page.
 */
async function generateUniqueSlug(
  ctx: MutationCtx,
  baseSlug: string,
  excludeId?: Id<"posts">,
): Promise<string> {
  let slug = baseSlug;
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
    const existing = await ctx.db
      .query("posts")
      .withIndex("by_type_slug", (q) =>
        q.eq("type", "page").eq("slug", candidate),
      )
      .unique();
    if (!existing || (excludeId && existing._id === excludeId)) {
      return candidate;
    }
    suffix++;
    if (suffix > 100) {
      return `${baseSlug}-${Date.now()}`;
    }
  }
}

/**
 * Compute the full URL path for a page based on its parent chain.
 */
async function computePagePath(
  ctx: MutationCtx,
  slug: string,
  parentId?: Id<"posts">,
): Promise<string> {
  if (!parentId) return `/${slug}`;

  const parent = await ctx.db.get("posts", parentId);
  if (!parent || parent.type !== "page") return `/${slug}`;

  const parentPath = (parent.path as string) ?? `/${parent.slug}`;
  return `${parentPath}/${slug}`;
}

/**
 * Internal version of create for HTTP API.
 */
export const createInternal = internalMutation({
  args: {
    title: v.string(),
    content: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    status: v.optional(v.string()),
    slug: v.optional(v.string()),
    parentId: v.optional(v.id("posts")),
    menuOrder: v.optional(v.number()),
    pageTemplate: v.optional(v.string()),
    authorId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const status = args.status ?? "draft";

    // Generate slug
    const baseSlug = args.slug ? slugify(args.slug) : slugify(args.title || "page");
    const slug = await generateUniqueSlug(ctx, baseSlug);

    // Compute path
    const path = await computePagePath(ctx, slug, args.parentId);

    // Compute depth
    let depth = 0;
    if (args.parentId) {
      const parent = await ctx.db.get("posts", args.parentId);
      if (parent) {
        depth = ((parent.depth as number) ?? 0) + 1;
      }
    }

    const pageId = await ctx.db.insert("posts", {
      type: "page",
      title: args.title,
      slug,
      content: args.content ?? "",
      excerpt: args.excerpt,
      status: status as PostStatus,
      visibility: "public",
      authorId: args.authorId,
      commentStatus: "closed",
      parentId: args.parentId,
      menuOrder: args.menuOrder ?? 0,
      pageTemplate: args.pageTemplate ?? "default",
      path,
      depth,
      publishedAt: status === "publish" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Emit event
    await emitEvent(ctx, PAGE_EVENTS.CREATED, SYSTEM.PAGE, {
      pageId,
      title: args.title,
      authorId: args.authorId,
    });

    return pageId;
  },
});

/**
 * Internal version of update for HTTP API.
 */
export const updateInternal = internalMutation({
  args: {
    pageId: v.id("posts"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    status: v.optional(v.string()),
    slug: v.optional(v.string()),
    parentId: v.optional(v.id("posts")),
    menuOrder: v.optional(v.number()),
    pageTemplate: v.optional(v.string()),
    visibility: v.optional(v.string()),
    password: v.optional(v.string()),
    commentStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.get("posts", args.pageId);
    if (!page || page.type !== "page") {
      throw new Error("Page not found");
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    const changes: string[] = [];

    if (args.title !== undefined && args.title !== page.title) {
      patch.title = args.title;
      changes.push("title");
    }
    if (args.content !== undefined && args.content !== page.content) {
      patch.content = args.content;
      changes.push("content");
    }
    if (args.excerpt !== undefined && args.excerpt !== page.excerpt) {
      patch.excerpt = args.excerpt;
      changes.push("excerpt");
    }
    if (args.status !== undefined && args.status !== page.status) {
      patch.status = args.status;
      if (args.status === "publish" && !page.publishedAt) {
        patch.publishedAt = now;
      }
      changes.push("status");
    }
    if (args.slug !== undefined && args.slug !== page.slug) {
      const newSlug = await generateUniqueSlug(ctx, slugify(args.slug), args.pageId);
      patch.slug = newSlug;
      // Recompute path
      patch.path = await computePagePath(ctx, newSlug, page.parentId as Id<"posts"> | undefined);
      changes.push("slug");
    }
    if (args.menuOrder !== undefined && args.menuOrder !== page.menuOrder) {
      patch.menuOrder = args.menuOrder;
      changes.push("menuOrder");
    }
    if (args.pageTemplate !== undefined && args.pageTemplate !== page.pageTemplate) {
      patch.pageTemplate = args.pageTemplate;
      changes.push("template");
    }
    if (args.visibility !== undefined && args.visibility !== page.visibility) {
      patch.visibility = args.visibility;
      if (args.visibility === "password") {
        patch.password = args.password;
      } else {
        patch.password = undefined;
      }
      changes.push("visibility");
    }
    if (args.commentStatus !== undefined) {
      patch.commentStatus = args.commentStatus;
      changes.push("commentStatus");
    }

    if (changes.length > 0) {
      await ctx.db.patch("posts", args.pageId, patch);

      await emitEvent(ctx, PAGE_EVENTS.UPDATED, SYSTEM.PAGE, {
        pageId: args.pageId,
        title: (patch.title as string) ?? page.title,
        authorId: page.authorId,
        changes,
      });
    }

    return args.pageId;
  },
});

/**
 * Internal version of trash for HTTP API.
 */
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

    await ctx.db.patch("posts", args.pageId, {
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
