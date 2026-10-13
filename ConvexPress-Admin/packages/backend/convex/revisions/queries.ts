import { authoringDetails } from "../helpers/authoringSnapshot";
/**
 * Revision System - Queries
 *
 * All read operations for revisions:
 *   listByPost   - Paginated revision list for a post (with author info)
 *   get          - Single revision with full content
 *   compare      - Two revisions side-by-side for diff rendering
 *   count        - Revision count for a post (metabox display)
 *   getLatest    - Most recent revision for a post
 *
 * Authorization:
 *   - All queries require authentication
 *   - Own posts: Requires revision.view capability
 *   - Others' posts: Requires revision.view + role level >= Editor (80)
 *   - Reads do not emit events
 */

import { ConvexError } from "convex/values";
import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { RegisteredQuery } from "convex/server";
import { getCurrentUser, lookupUserByIdentifier } from "../helpers/permissions";
import { requireRevisionAccess, getRevisionCount } from "../helpers/revisions";
import {
  listByPostArgs,
  getRevisionArgs,
  compareRevisionsArgs,
  countRevisionsArgs,
  getLatestRevisionArgs,
  DEFAULT_REVISION_LIMIT,
  MAX_REVISION_LIMIT,
} from "./validators";

import { v } from "convex/values";
import { revisionsDocs } from "../schema/revisions.docs.generated";
// ─── Shared Helper: Resolve Author Data ─────────────────────────────────────

/**
 * Resolve author display name and avatar from a user identifier string.
 *
 * Revision `authorId` stores a user identifier (clerkUserId or Convex _id).
 * Uses lookupUserByIdentifier to try multiple lookup strategies.
 *
 * @param ctx - Query context
 * @param userId - The user identifier stored on the revision
 * @returns Object with authorName and authorAvatar
 */
async function resolveRevisionAuthor(
  ctx: QueryCtx,
  userId: string,
): Promise<{ authorName: string; authorAvatar: string | undefined }> {
  let authorName = "Unknown";
  let authorAvatar: string | undefined;

  try {
    const authorUser = await lookupUserByIdentifier(ctx, userId);

    if (authorUser) {
      authorName =
        authorUser.displayName ??
        authorUser.email ??
        "Unknown";
      authorAvatar = authorUser.profilePictureUrl;
    }
  } catch {
    // User lookup failed; use defaults
  }

  return { authorName, authorAvatar };
}

// ─── List By Post ───────────────────────────────────────────────────────────

/**
 * Paginated list of revisions for a specific post.
 *
 * Sorted by revisionNumber descending (newest first).
 * Includes denormalized author data for each revision.
 *
 * Used by: Revision comparison page (/admin/posts/$postId/revisions)
 */
export const listByPost: import("convex/server").RegisteredQuery<"public", { parentId: import("../_generated/dataModel").Id<"posts">; type?: import("../_generated/dataModel").Doc<"revisions">["type"]; limit?: number }, { revisions: Array<import("../_generated/dataModel").Doc<"revisions"> & { details: ReturnType<typeof authoringDetails>; authorName: string; authorAvatar: string | undefined }>; total: number; hasMore: boolean }> = query({
  args: listByPostArgs,
  returns: v.object({
    revisions: v.array(v.object({
      details: v.string(),
      authorName: v.string(),
      authorAvatar: v.optional(v.string()),
      _id: v.id("revisions"),
      _creationTime: v.number(),
      blocks: revisionsDocs.revisions.fields.blocks,
      composedDefinitions: v.optional(v.object({
        scope: v.object({ websiteKey: v.string(), instanceKey: v.string(), deploymentOrigin: v.string() }),
        definitions: v.array(v.object({ name: v.string(), version: v.number(), digest: v.string(), definitionJson: v.string() })),
      })),
      summary: v.optional(v.object({ title: v.optional(v.string()), content: v.optional(v.string()) })),
      excerpt: v.optional(v.string()),
      featuredImageId: v.optional(v.id("media")),
      pageTemplate: v.optional(v.string()),
      blocksVersion: v.optional(v.number()),
      blocksRevision: v.optional(v.number()),
      layoutId: v.optional(v.string()),
      hideHeader: v.optional(v.boolean()),
      hideFooter: v.optional(v.boolean()),
      autosaveContent: v.optional(v.string()),
      autosaveTitle: v.optional(v.string()),
      autosavedAt: v.optional(v.number()),
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
      sources: v.optional(v.string()),
      tableOfContents: v.optional(v.string()),
      pagePrompt: v.optional(v.string()),
      snapshotVersion: v.optional(v.union(v.literal(1), v.literal(2))),
      contentMode: v.optional(v.union(v.literal("blocks"), v.literal("article"))),
      pageSections: revisionsDocs.revisions.fields.pageSections,
      type: v.union(v.literal("manual"), v.literal("autosave")),
      title: v.string(),
      createdAt: v.number(),
      authorId: v.string(),
      parentId: v.id("posts"),
      content: v.string(),
      parentType: v.union(v.literal("post"), v.literal("page")),
      revisionNumber: v.number(),
      changedFields: v.array(v.string()),
      contentLength: v.number(),
    })),
    total: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // ── Fetch parent post ───────────────────────────────────────────────
    const post = await ctx.db.get("posts", args.parentId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    // ── Capability check ────────────────────────────────────────────────
    await requireRevisionAccess(ctx, user, post, "revision.view");

    // ── Query revisions ─────────────────────────────────────────────────
    let revisions;

    if (args.type) {
      revisions = await ctx.db
        .query("revisions")
        .withIndex("by_parent_type", q =>
          q.eq("parentId", args.parentId).eq("type", args.type!),
        )
        .collect();
    } else {
      revisions = await ctx.db
        .query("revisions")
        .withIndex("by_parent", q => q.eq("parentId", args.parentId))
        .collect();
    }

    // ── Sort by revisionNumber descending (newest first) ────────────────
    revisions.sort((a, b) => b.revisionNumber - a.revisionNumber);

    // ── Apply limit ─────────────────────────────────────────────────────
    const limit = Math.min(
      MAX_REVISION_LIMIT,
      Math.max(1, args.limit ?? DEFAULT_REVISION_LIMIT),
    );
    const total = revisions.length;
    const hasMore = total > limit;
    const paged = revisions.slice(0, limit);

    // ── Denormalize author data ─────────────────────────────────────────
    const revisionsWithAuthors = await Promise.all(
      paged.map(async (rev) => {
        const { authorName, authorAvatar } = await resolveRevisionAuthor(ctx, rev.authorId);
        return {
          ...rev,
          details: authoringDetails(rev),
          authorName,
          authorAvatar,
        };
      }),
    );

    return {
      revisions: revisionsWithAuthors,
      total,
      hasMore,
    };
  },
});

// ─── Get Single Revision ────────────────────────────────────────────────────

/**
 * Get a single revision with its full content.
 *
 * Used by: Client-side rendering of a specific revision snapshot.
 */
export const get = query({
  args: getRevisionArgs,
  returns: v.object({
    authorName: v.string(),
    authorAvatar: v.optional(v.string()),
    _id: v.id("revisions"),
    _creationTime: v.number(),
    blocks: revisionsDocs.revisions.fields.blocks,
    composedDefinitions: v.optional(v.object({
      scope: v.object({ websiteKey: v.string(), instanceKey: v.string(), deploymentOrigin: v.string() }),
      definitions: v.array(v.object({ name: v.string(), version: v.number(), digest: v.string(), definitionJson: v.string() })),
    })),
    summary: v.optional(v.object({ title: v.optional(v.string()), content: v.optional(v.string()) })),
    excerpt: v.optional(v.string()),
    featuredImageId: v.optional(v.id("media")),
    pageTemplate: v.optional(v.string()),
    blocksVersion: v.optional(v.number()),
    blocksRevision: v.optional(v.number()),
    layoutId: v.optional(v.string()),
    hideHeader: v.optional(v.boolean()),
    hideFooter: v.optional(v.boolean()),
    autosaveContent: v.optional(v.string()),
    autosaveTitle: v.optional(v.string()),
    autosavedAt: v.optional(v.number()),
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
    sources: v.optional(v.string()),
    tableOfContents: v.optional(v.string()),
    pagePrompt: v.optional(v.string()),
    snapshotVersion: v.optional(v.union(v.literal(1), v.literal(2))),
    contentMode: v.optional(v.union(v.literal("blocks"), v.literal("article"))),
    pageSections: revisionsDocs.revisions.fields.pageSections,
    type: v.union(v.literal("manual"), v.literal("autosave")),
    title: v.string(),
    createdAt: v.number(),
    authorId: v.string(),
    parentId: v.id("posts"),
    content: v.string(),
    parentType: v.union(v.literal("post"), v.literal("page")),
    revisionNumber: v.number(),
    changedFields: v.array(v.string()),
    contentLength: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const revision = await ctx.db.get("revisions", args.revisionId);
    if (!revision) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Revision not found",
      });
    }

    // ── Fetch parent post for ownership check ───────────────────────────
    const post = await ctx.db.get("posts", revision.parentId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Parent post no longer exists",
      });
    }

    await requireRevisionAccess(ctx, user, post, "revision.view");

    // ── Denormalize author data ─────────────────────────────────────────
    const { authorName, authorAvatar } = await resolveRevisionAuthor(ctx, revision.authorId);

    return {
      ...revision,
      authorName,
      authorAvatar,
    };
  },
});

// ─── Compare Two Revisions ──────────────────────────────────────────────────

/**
 * Fetch two revisions for side-by-side comparison.
 *
 * Returns both revisions with full content for client-side diff computation.
 * The actual diff is computed in the browser using `diff-match-patch`.
 *
 * Validates that both revisions belong to the same parent post.
 *
 * Used by: Revision comparison page with diff viewer
 */
type ComparisonSide = Pick<Doc<"revisions">, "_id" | "revisionNumber" | "title" | "content" | "excerpt" | "createdAt" | "changedFields" | "type" | "contentLength"> & {
  details: string; authorName: string; authorAvatar?: string;
};
type ComparisonResult = { left: ComparisonSide; right: ComparisonSide; parentId: Id<"posts">; parentTitle: string; totalRevisions: number };
type ComparisonArgs = { leftRevisionId: Id<"revisions">; rightRevisionId: Id<"revisions"> };
export const compare: RegisteredQuery<"public", ComparisonArgs, Promise<ComparisonResult>> = query({
  args: compareRevisionsArgs,
  returns: v.object({
    left: v.object({
      type: v.union(v.literal("manual"), v.literal("autosave")),
      title: v.string(),
      createdAt: v.number(),
      excerpt: v.optional(v.string()),
      content: v.string(),
      revisionNumber: v.number(),
      changedFields: v.array(v.string()),
      contentLength: v.number(),
      _id: v.id("revisions"),
      details: v.string(),
      authorName: v.string(),
      authorAvatar: v.optional(v.string()),
    }),
    right: v.object({
      type: v.union(v.literal("manual"), v.literal("autosave")),
      title: v.string(),
      createdAt: v.number(),
      excerpt: v.optional(v.string()),
      content: v.string(),
      revisionNumber: v.number(),
      changedFields: v.array(v.string()),
      contentLength: v.number(),
      _id: v.id("revisions"),
      details: v.string(),
      authorName: v.string(),
      authorAvatar: v.optional(v.string()),
    }),
    parentId: v.id("posts"),
    parentTitle: v.string(),
    totalRevisions: v.number(),
  }),
  handler: async (ctx: QueryCtx, args: ComparisonArgs): Promise<ComparisonResult> => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // ── Fetch both revisions ────────────────────────────────────────────
    const left = await ctx.db.get("revisions", args.leftRevisionId);
    if (!left) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Left revision not found",
      });
    }

    const right = await ctx.db.get("revisions", args.rightRevisionId);
    if (!right) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Right revision not found",
      });
    }

    // ── Validate same parent ────────────────────────────────────────────
    if (left.parentId !== right.parentId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Revisions belong to different posts",
      });
    }

    // ── Fetch parent post for ownership check ───────────────────────────
    const post = await ctx.db.get("posts", left.parentId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Parent post no longer exists",
      });
    }

    await requireRevisionAccess(ctx, user, post, "revision.compare");

    // ── Get total revision count ────────────────────────────────────────
    const totalRevisions = await getRevisionCount(ctx, left.parentId);

    // ── Denormalize author data for both revisions ──────────────────────
    const leftAuthor = await resolveRevisionAuthor(ctx, left.authorId);
    const rightAuthor = await resolveRevisionAuthor(ctx, right.authorId);

    return {
      left: {
        _id: left._id,
        revisionNumber: left.revisionNumber,
        title: left.title,
        content: left.content,
        details: authoringDetails(left),
        excerpt: left.excerpt,
        authorName: leftAuthor.authorName,
        authorAvatar: leftAuthor.authorAvatar,
        createdAt: left.createdAt,
        changedFields: left.changedFields,
        type: left.type,
        contentLength: left.contentLength,
      },
      right: {
        _id: right._id,
        revisionNumber: right.revisionNumber,
        title: right.title,
        content: right.content,
        details: authoringDetails(right),
        excerpt: right.excerpt,
        authorName: rightAuthor.authorName,
        authorAvatar: rightAuthor.authorAvatar,
        createdAt: right.createdAt,
        changedFields: right.changedFields,
        type: right.type,
        contentLength: right.contentLength,
      },
      parentId: left.parentId,
      parentTitle: post.title,
      totalRevisions,
    };
  },
});

// ─── Count Revisions ────────────────────────────────────────────────────────

/**
 * Count total revisions for a post.
 *
 * Used by: Revisions metabox on the edit post page
 * ("Revisions: 12" with "Browse Revisions" link)
 */
export const count = query({
  args: countRevisionsArgs,
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // ── Fetch parent post for ownership check ───────────────────────────
    const post = await ctx.db.get("posts", args.parentId);
    if (!post) {
      return 0; // Post doesn't exist, no revisions
    }

    // ── Capability check ────────────────────────────────────────────────
    try {
      await requireRevisionAccess(ctx, user, post, "revision.view");
    } catch {
      return 0; // User can't view revisions for this post
    }

    // ── Count ───────────────────────────────────────────────────────────
    const revisions = await ctx.db
      .query("revisions")
      .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
      .collect();

    return revisions.length;
  },
});

// ─── Get Latest Revision ────────────────────────────────────────────────────

/**
 * Get the most recent revision for a post.
 *
 * Optionally filtered by type (manual/autosave).
 *
 * Used by: Editor to detect if autosave exists, revision metabox
 */
export const getLatest = query({
  args: getLatestRevisionArgs,
  returns: v.union(v.null(), v.object({
    authorName: v.string(),
    authorAvatar: v.optional(v.string()),
    _id: v.id("revisions"),
    _creationTime: v.number(),
    blocks: revisionsDocs.revisions.fields.blocks,
    composedDefinitions: v.optional(v.object({
      scope: v.object({ websiteKey: v.string(), instanceKey: v.string(), deploymentOrigin: v.string() }),
      definitions: v.array(v.object({ name: v.string(), version: v.number(), digest: v.string(), definitionJson: v.string() })),
    })),
    summary: v.optional(v.object({ title: v.optional(v.string()), content: v.optional(v.string()) })),
    excerpt: v.optional(v.string()),
    featuredImageId: v.optional(v.id("media")),
    pageTemplate: v.optional(v.string()),
    blocksVersion: v.optional(v.number()),
    blocksRevision: v.optional(v.number()),
    layoutId: v.optional(v.string()),
    hideHeader: v.optional(v.boolean()),
    hideFooter: v.optional(v.boolean()),
    autosaveContent: v.optional(v.string()),
    autosaveTitle: v.optional(v.string()),
    autosavedAt: v.optional(v.number()),
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
    sources: v.optional(v.string()),
    tableOfContents: v.optional(v.string()),
    pagePrompt: v.optional(v.string()),
    snapshotVersion: v.optional(v.union(v.literal(1), v.literal(2))),
    contentMode: v.optional(v.union(v.literal("blocks"), v.literal("article"))),
    pageSections: revisionsDocs.revisions.fields.pageSections,
    type: v.union(v.literal("manual"), v.literal("autosave")),
    title: v.string(),
    createdAt: v.number(),
    authorId: v.string(),
    parentId: v.id("posts"),
    content: v.string(),
    parentType: v.union(v.literal("post"), v.literal("page")),
    revisionNumber: v.number(),
    changedFields: v.array(v.string()),
    contentLength: v.number(),
  })),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // ── Fetch parent post for ownership check ───────────────────────────
    const post = await ctx.db.get("posts", args.parentId);
    if (!post) {
      return null;
    }

    // ── Capability check ────────────────────────────────────────────────
    try {
      await requireRevisionAccess(ctx, user, post, "revision.view");
    } catch {
      return null;
    }

    // ── Query revisions ─────────────────────────────────────────────────
    let revisions;

    if (args.type) {
      revisions = await ctx.db
        .query("revisions")
        .withIndex("by_parent_type", (q) =>
          q.eq("parentId", args.parentId).eq("type", args.type!),
        )
        .collect();
    } else {
      revisions = await ctx.db
        .query("revisions")
        .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
        .collect();
    }

    if (revisions.length === 0) return null;

    // Find the one with the highest revision number
    let latest = revisions[0];
    for (let i = 1; i < revisions.length; i++) {
      if (revisions[i].revisionNumber > latest.revisionNumber) {
        latest = revisions[i];
      }
    }

    // ── Denormalize author data ─────────────────────────────────────────
    const { authorName, authorAvatar } = await resolveRevisionAuthor(ctx, latest.authorId);

    return {
      ...latest,
      authorName,
      authorAvatar,
    };
  },
});
