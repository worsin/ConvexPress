import { makeFunctionReference, type RegisteredMutation } from "convex/server";
import type { Id } from "../_generated/dataModel";
type RequestArgs = {
    productId: Id<"commerce_products">;
    force?: boolean;
};
type CatalogArgs = {
    cursor?: string;
    force?: boolean;
};
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { beginRatingRepair, advanceRatingRepair, type RatingTask } from "./ratingIndex";
const pageRef = makeFunctionReference<"mutation", RatingTask>("commerceReviews/ratingMaintenance:page");
const catalogRef = makeFunctionReference<"mutation", {
    cursor?: string;
    force?: boolean;
}>("commerceReviews/ratingMaintenance:catalog");
const schedule = async (ctx: MutationCtx, task: RatingTask | null) => { if (task)
    await ctx.scheduler.runAfter(0, pageRef, task); };
export const request: RegisteredMutation<"internal", RequestArgs, null> = internalMutation({ args: { productId: v.id("commerce_products"), force: v.optional(v.boolean()) }, returns: v.null(), handler: async (ctx: MutationCtx, args: RequestArgs): Promise<null> => { await schedule(ctx, await beginRatingRepair(ctx, args.productId, args.force)); return null; } });
export const page: RegisteredMutation<"internal", RatingTask, null> = internalMutation({ args: { productId: v.id("commerce_products"), generation: v.number(), afterTime: v.union(v.number(), v.null()), afterId: v.union(v.string(), v.null()) }, returns: v.null(), handler: async (ctx: MutationCtx, args: RatingTask): Promise<null> => { await schedule(ctx, await advanceRatingRepair(ctx, args)); return null; } });
/** Explicit migration/restore sweep; never loads the full product or review catalog. */
export const catalog: RegisteredMutation<"internal", CatalogArgs, {
    processed: number;
    done: boolean;
}> = internalMutation({ args: { cursor: v.optional(v.string()), force: v.optional(v.boolean()) }, returns: v.object({ processed: v.number(), done: v.boolean() }), handler: async (ctx: MutationCtx, args: CatalogArgs): Promise<{
        processed: number;
        done: boolean;
    }> => {
        const result = await ctx.db.query("commerce_products").paginate({ cursor: args.cursor ?? null, numItems: 8, maximumRowsRead: 8, maximumBytesRead: 512 * 1024 });
        for (const product of result.page)
            await schedule(ctx, await beginRatingRepair(ctx, product._id, args.force));
        if (!result.isDone)
            await ctx.scheduler.runAfter(100, catalogRef, { cursor: result.continueCursor, ...(args.force ? { force: true } : {}) });
        return { processed: result.page.length, done: result.isDone };
    } });
export const recover: RegisteredMutation<"internal", Record<string, never>, null> = internalMutation({ args: {}, returns: v.null(), handler: async (ctx: MutationCtx): Promise<null> => {
        const pending = await ctx.db.query("commerce_review_ratings").withIndex("by_phase_updated", q => q.eq("phase", "pending")).take(8);
        const stalled = await ctx.db.query("commerce_review_ratings").withIndex("by_phase_updated", q => q.eq("phase", "scanning").lte("updatedAt", Date.now() - 60000)).take(8);
        for (const state of [...pending, ...stalled])
            await schedule(ctx, await beginRatingRepair(ctx, state.productId));
        return null;
    } });
