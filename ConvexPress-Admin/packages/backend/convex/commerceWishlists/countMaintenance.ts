import { makeFunctionReference, type RegisteredMutation } from "convex/server";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import {
	beginWishlistCountRepair,
	advanceWishlistCountRepair,
	type WishlistCountTask,
} from "./counts";

const pageRef = makeFunctionReference<"mutation", WishlistCountTask>(
	"commerceWishlists/countMaintenance:page",
);
const sweepRef = makeFunctionReference<"mutation", Record<string, never>>(
	"commerceWishlists/countMaintenance:sweep",
);
async function schedule(ctx: MutationCtx, task: WishlistCountTask | null) {
	if (task) await ctx.scheduler.runAfter(0, pageRef, task);
}
export const request: RegisteredMutation<
	"internal",
	{ wishlistId: WishlistCountTask["wishlistId"]; force?: boolean },
	Promise<null>
> = internalMutation({
	args: {
		wishlistId: v.id("commerce_wishlists"),
		force: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		await schedule(
			ctx,
			await beginWishlistCountRepair(ctx, args.wishlistId, args.force),
		);
		return null;
	},
});
export const page: RegisteredMutation<
	"internal",
	WishlistCountTask,
	Promise<null>
> = internalMutation({
	args: {
		wishlistId: v.id("commerce_wishlists"),
		generation: v.number(),
		afterTime: v.union(v.number(), v.null()),
		afterId: v.union(v.string(), v.null()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		await schedule(ctx, await advanceWishlistCountRepair(ctx, args));
		return null;
	},
});
export const sweep: RegisteredMutation<
	"internal",
	Record<string, never>,
	Promise<null>
> = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx): Promise<null> => {
		const legacy = await ctx.db
			.query("commerce_wishlists")
			.withIndex("by_item_count_ready", (q) =>
				q.eq("itemCountReady", undefined),
			)
			.paginate({
				cursor: null,
				numItems: 8,
				maximumRowsRead: 8,
				maximumBytesRead: 512 * 1024,
			});
		for (const list of legacy.page)
			await schedule(ctx, await beginWishlistCountRepair(ctx, list._id));
		const pending = await ctx.db
			.query("commerce_wishlist_counts")
			.withIndex("by_phase_updated", (q) => q.eq("phase", "pending"))
			.take(8);
		for (const state of pending)
			await schedule(
				ctx,
				await beginWishlistCountRepair(ctx, state.wishlistId),
			);
		const stalled = await ctx.db
			.query("commerce_wishlist_counts")
			.withIndex("by_phase_updated", (q) =>
				q.eq("phase", "scanning").lte("updatedAt", Date.now() - 60_000),
			)
			.take(8);
		for (const state of stalled)
			await schedule(
				ctx,
				await beginWishlistCountRepair(ctx, state.wishlistId),
			);
		if (!legacy.isDone) await ctx.scheduler.runAfter(500, sweepRef, {});
		return null;
	},
});
