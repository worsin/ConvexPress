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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listByPost = query({
  args: listByPostArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
        .withIndex("by_parent_type", (q: ConvexQueryBuilder) =>
          q.eq("parentId", args.parentId).eq("type", args.type!),
        )
        .collect();
    } else {
      revisions = await ctx.db
        .query("revisions")
        .withIndex("by_parent", (q: ConvexQueryBuilder) => q.eq("parentId", args.parentId))
        .collect();
    }

    // ── Sort by revisionNumber descending (newest first) ────────────────
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
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
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      paged.map(async (rev) => {
        const { authorName, authorAvatar } = await resolveRevisionAuthor(ctx, rev.authorId);
        return {
          ...rev,
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const get = query({
  args: getRevisionArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const compare = query({
  args: compareRevisionsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const count = query({
  args: countRevisionsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
      .withIndex("by_parent", (q: ConvexQueryBuilder) => q.eq("parentId", args.parentId))
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getLatest = query({
  args: getLatestRevisionArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
        .withIndex("by_parent_type", (q: ConvexQueryBuilder) =>
          q.eq("parentId", args.parentId).eq("type", args.type!),
        )
        .collect();
    } else {
      revisions = await ctx.db
        .query("revisions")
        .withIndex("by_parent", (q: ConvexQueryBuilder) => q.eq("parentId", args.parentId))
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
