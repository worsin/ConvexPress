import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { beginTermCountRepair, advanceTermCountRepair, type TermCountTask } from "../helpers/termCounts";

const pageRef = makeFunctionReference<"mutation", TermCountTask>("taxonomies/counts:page");
const sweepRef = makeFunctionReference<"mutation", Record<string, never>>("taxonomies/counts:sweep");
const allRef = makeFunctionReference<"mutation", { cursor?: string | null }>("taxonomies/counts:all");
async function schedule(ctx: MutationCtx, task: TermCountTask | undefined) {
  if (task) await ctx.scheduler.runAfter(0, pageRef, task);
}
export const request = internalMutation({
  args: { termId: v.id("terms"), force: v.optional(v.boolean()) }, returns: v.null(),
  handler: async (ctx, { termId, force }) => {
    await schedule(ctx, await beginTermCountRepair(ctx, termId, force)); return null;
  },
});
export const page = internalMutation({
  args: { termId: v.id("terms"), generation: v.string(), cursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, task) => { await schedule(ctx, await advanceTermCountRepair(ctx, task)); return null; },
});
/** Restartable migration/import correction; never materializes all terms or posts. */
export const all = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) }, returns: v.null(),
  handler: async (ctx, args) => {
    const batch = await ctx.db.query("terms").paginate({ cursor: args.cursor ?? null, numItems: 8,
      maximumRowsRead: 8, maximumBytesRead: 1024 * 1024 });
    for (const term of batch.page) await schedule(ctx, await beginTermCountRepair(ctx, term._id, true));
    if (!batch.isDone) await ctx.scheduler.runAfter(500, allRef, { cursor: batch.continueCursor });
    return null;
  },
});
/** Recover legacy baselines and continuations lost to deployment/failure. */
export const sweep = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const legacy = await ctx.db.query("terms").withIndex("by_count_ready", q => q.eq("countReady", undefined)).take(8);
    const pending = await ctx.db.query("terms").withIndex("by_count_phase_updated", q => q.eq("countState.phase", "pending")).take(8);
    const stalled = await ctx.db.query("terms").withIndex("by_count_phase_updated", q => q.eq("countState.phase", "scanning").lte("countState.updatedAt", Date.now() - 60_000)).take(8);
    for (const term of [...legacy, ...pending, ...stalled]) await schedule(ctx, await beginTermCountRepair(ctx, term._id));
    if (legacy.length === 8 || pending.length === 8 || stalled.length === 8) await ctx.scheduler.runAfter(500, sweepRef, {});
    return null;
  },
});
