/**
 * Search System - Actions
 *
 * Convex actions for operations that require multiple steps or external calls.
 *
 * Actions:
 *   reindex - Public authenticated wrapper (Administrator only)
 *   _reindexInternal - Internal implementation (not client-callable)
 *
 * The reindex action authenticates the caller and delegates to the internal
 * implementation. It prevents concurrent full reindex operations.
 */

import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";
import { searchableContentTypeValidator } from "./validators";

type ReindexResult =
  | { updated: true }
  | {
      indexed: {
        post: number;
        page: number;
        media: number;
        comment: number;
      };
      removed: number;
      errors: number;
      duration: number;
    };

// ─── _reindexInternal (INTERNAL) ────────────────────────────────────────────

/**
 * Internal reindex implementation. Not client-callable.
 *
 * Handles both incremental reindex (with contentId) and full reindex.
 * Auth is enforced by the public wrapper — this function trusts its caller.
 */
export const _reindexInternal = internalAction({
  args: {
    contentType: v.optional(searchableContentTypeValidator),
    contentId: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ReindexResult> => {
    // Incremental reindex (internal call with contentId)
    if (args.contentId) {
      await ctx.runMutation(internal.search.internals.onContentChanged, {
        contentType: args.contentType ?? "post",
        contentId: args.contentId,
        action: "upsert",
      });
      return { updated: true };
    }

    // ── Concurrent reindex prevention (#57 FIX) ─────────────────────────
    // Use an internal mutation to atomically acquire a lock flag. If another
    // reindex is in progress, this will throw ALREADY_RUNNING.
    const lockAcquired = await ctx.runMutation(
      internal.search.internals.acquireReindexLock,
      {},
    );
    if (!lockAcquired) {
      throw new ConvexError({
        code: "ALREADY_RUNNING",
        message: "A full reindex is already in progress. Please wait for it to complete.",
      });
    }

    // Full reindex - delegate to internal mutation
    const startTime = Date.now();

    let stats: {
      post: number;
      page: number;
      media: number;
      comment: number;
      removed: number;
      errors: number;
    };

    try {
      stats = await ctx.runMutation(
        internal.search.internals.reindexAll,
        {
          contentType: args.contentType,
        },
      );
    } finally {
      // Always release the lock, even if reindex fails
      await ctx.runMutation(
        internal.search.internals.releaseReindexLock,
        {},
      ).catch(() => {
        // Best-effort lock release
      });
    }

    const duration = Date.now() - startTime;

    return {
      indexed: {
        post: stats.post,
        page: stats.page,
        media: stats.media,
        comment: stats.comment,
      },
      removed: stats.removed,
      errors: stats.errors,
      duration,
    };
  },
});

// ─── reindex (PUBLIC, AUTHENTICATED) ────────────────────────────────────────

/**
 * Public authenticated wrapper for reindex.
 *
 * Verifies the caller is authenticated and has the required capability,
 * then delegates to the internal implementation.
 *
 * @throws UNAUTHORIZED if not authenticated
 * @throws FORBIDDEN if user lacks search.reindex or manage_options capability
 */
export const reindex = action({
  args: {
    contentType: v.optional(searchableContentTypeValidator),
    contentId: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ReindexResult> => {
    // ── Authentication & Authorization ──────────────────────────────────
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required to trigger reindex",
      });
    }

    // For full reindex, check capability
    if (!args.contentId) {
      const canReindex = await ctx.runQuery(
        internal.search.internals.checkReindexPermission,
        { workosUserId: identity.subject },
      );
      if (!canReindex) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "You do not have permission to trigger a full reindex. Requires search.reindex or manage_options capability.",
        });
      }
    }

    // Delegate to internal implementation
    return await ctx.runAction(
      internal.search.actions._reindexInternal,
      args,
    ) as ReindexResult;
  },
});
