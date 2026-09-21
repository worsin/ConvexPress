import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import type { Id } from "../_generated/dataModel";
import { advanceWishlistDeletion, recoverWishlistDeletions } from "./deletion";
import type { DeletionTask, DeletionProgress } from "./deletion";
import { getActiveWishlistUser } from "./helpers";
export const page: RegisteredMutation<
	"internal",
	DeletionTask,
	Promise<DeletionProgress>
> = internalMutation({
	args: { jobId: v.id("commerce_wishlist_deletions"), generation: v.number() },
	returns: v.object({
		deleted: v.number(),
		state: v.union(
			v.literal("pending"),
			v.literal("complete"),
			v.literal("blocked"),
			v.literal("obsolete"),
		),
	}),
	handler: advanceWishlistDeletion,
});
export const recover: RegisteredMutation<
	"internal",
	Record<string, never>,
	Promise<{ resumed: number; pruned: number }>
> = internalMutation({
	args: {},
	returns: v.object({ resumed: v.number(), pruned: v.number() }),
	handler: recoverWishlistDeletions,
});
type Status = {
	state: "pending" | "complete" | "blocked";
	deletedItems: number;
	updatedAt: number;
};
export const getStatus: RegisteredQuery<
	"public",
	{ wishlistId: Id<"commerce_wishlists"> },
	Promise<Status | null>
> = query({
	args: { wishlistId: v.id("commerce_wishlists") },
	returns: v.union(
		v.null(),
		v.object({
			state: v.union(
				v.literal("pending"),
				v.literal("complete"),
				v.literal("blocked"),
			),
			deletedItems: v.number(),
			updatedAt: v.number(),
		}),
	),
	handler: async (ctx, args): Promise<Status | null> => {
		const user = await getActiveWishlistUser(ctx);
		if (!user) return null;
		const job = await ctx.db
			.query("commerce_wishlist_deletions")
			.withIndex("by_wishlist", (q) => q.eq("wishlistId", args.wishlistId))
			.unique();
		return job?.requestedBy === user._id
			? {
					state: job.state,
					deletedItems: job.deletedItems,
					updatedAt: job.updatedAt,
				}
			: null;
	},
});
