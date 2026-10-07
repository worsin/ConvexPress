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

import { progressValidator, type ReindexProgress } from "./reindex";
const resultValidator = v.union(v.object({ updated: v.literal(true) }), progressValidator);
type ReindexResult = { updated: true } | ReindexProgress;

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
    jobId: v.optional(v.string()),
  },
  returns: resultValidator,
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

    const leaseId = crypto.randomUUID();
    let state: ReindexProgress = await ctx.runMutation(internal.search.reindex.begin, {
      jobId: args.jobId, newJobId: crypto.randomUUID(), leaseId, contentType: args.contentType,
    });
    const deadline = Date.now() + 30_000;
    let steps = 0;
    while (state.status === "running" && Date.now() < deadline && steps++ < 100) {
      const sequence = state.sequence;
      try {
        state = await ctx.runMutation(internal.search.reindex.step, { jobId: state.jobId, leaseId, sequence });
      } catch (error) {
        // A response may be lost after commit. Read durable progress before
        // recording failure; never replay an already committed sequence.
        const latest: ReindexProgress = await ctx.runQuery(internal.search.reindex.status, { jobId: state.jobId });
        if (latest.sequence !== sequence || latest.status === "completed") { state = latest; continue; }
        const details = error instanceof ConvexError ? error.data : null;
        const failure = details && typeof details === "object" && !Array.isArray(details) && details.code === "REINDEX_ITEM_FAILED"
          && typeof details.contentId === "string" && ["post", "page", "media", "comment", "course", "product", "event"].includes(String(details.contentType))
          ? { contentType: details.contentType as NonNullable<ReindexProgress["contentType"]>, contentId: details.contentId } : undefined;
        return await ctx.runMutation(internal.search.reindex.finishChunk, { jobId: state.jobId, leaseId, sequence, failed: true, failure });
      }
    }
    if (state.status === "completed") return state;
    return await ctx.runMutation(internal.search.reindex.finishChunk, { jobId: state.jobId, leaseId, sequence: state.sequence, failed: false });
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
    jobId: v.optional(v.string()),
  },
  returns: resultValidator,
  handler: async (ctx, args): Promise<ReindexResult> => {
    // ── Authentication & Authorization ──────────────────────────────────
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required to trigger reindex",
      });
    }

    // Selecting one document changes the amount of work, not its authority.
    const canReindex = await ctx.runQuery(
      internal.search.internals.checkReindexPermission,
      { userId: identity.subject },
    );
    if (!canReindex) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Insufficient permissions",
      });
    }

    // Delegate to internal implementation
    return await ctx.runAction(
      internal.search.actions._reindexInternal,
      args,
    ) as ReindexResult;
  },
});
