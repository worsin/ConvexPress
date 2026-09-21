import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { advanceAuthorPostCountRepair, beginAuthorPostCountRepair, type AuthorCountResult, type AuthorCountTask } from "../helpers/authorPostCounts";
import { patchWithMediaReferences } from "../media/attachmentGuard";

const pageRef = makeFunctionReference<"mutation", AuthorCountTask>("posts/authorCounts:page");
const sweepRef = makeFunctionReference<"mutation", Record<string, never>>("posts/authorCounts:sweep");

async function apply(ctx: MutationCtx, result: AuthorCountResult) {
  if (result.update) await patchWithMediaReferences(ctx, "users", result.update.authorId, {
    postCount: result.update.count, postCountReady: result.update.ready,
  });
  if (result.next) await ctx.scheduler.runAfter(0, pageRef, result.next);
}

export const request = internalMutation({
  args: { authorId: v.id("users"), force: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { authorId, force }) => {
    await apply(ctx, await beginAuthorPostCountRepair(ctx, authorId, force));
    return null;
  },
});

export const page = internalMutation({
  args: { authorId: v.id("users"), generation: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, task) => {
    await apply(ctx, await advanceAuthorPostCountRepair(ctx, task));
    return null;
  },
});

/** Upgrade initialization and recovery of committed scans whose continuation failed. */
export const sweep = internalMutation({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    const legacy = await ctx.db.query("users")
      .withIndex("by_post_count_ready", q => q.eq("postCountReady", undefined))
      .paginate({ cursor: null, numItems: 8, maximumRowsRead: 8, maximumBytesRead: 1024 * 1024 });
    for (const user of legacy.page) await apply(ctx, await beginAuthorPostCountRepair(ctx, user._id));
    const pending = await ctx.db.query("authorPostCounts")
      .withIndex("by_phase_updated", q => q.eq("phase", "pending")).take(8);
    for (const state of pending) await apply(ctx, await beginAuthorPostCountRepair(ctx, state.authorId));
    const stalled = await ctx.db.query("authorPostCounts")
      .withIndex("by_phase_updated", q => q.eq("phase", "scanning").lte("updatedAt", Date.now() - 60_000)).take(8);
    for (const state of stalled) await apply(ctx, await beginAuthorPostCountRepair(ctx, state.authorId));
    if (!legacy.isDone) await ctx.scheduler.runAfter(500, sweepRef, {});
    return null;
  },
});
