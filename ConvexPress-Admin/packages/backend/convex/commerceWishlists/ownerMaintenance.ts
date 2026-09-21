import { makeFunctionReference, type RegisteredMutation } from "convex/server";
import { v, ConvexError } from "convex/values";
import {
	internalMutation,
	mutation,
	type MutationCtx,
} from "../_generated/server";
import { isWishlistInstallationEnabled } from "./pages";
import { getActiveWishlistUser } from "./helpers";
import {
	beginOwnerSummaryRepair,
	advanceOwnerSummaryRepair,
	type OwnerSummaryTask,
} from "./ownerTotals";
const pageRef = makeFunctionReference<"mutation", OwnerSummaryTask>(
	"commerceWishlists/ownerMaintenance:page",
);
export const request: RegisteredMutation<
	"internal",
	{ ownerId: OwnerSummaryTask["ownerId"]; force?: boolean },
	Promise<null>
> = internalMutation({
	args: { ownerId: v.id("users"), force: v.optional(v.boolean()) },
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		await schedule(ctx, await beginOwnerSummaryRepair(ctx, args.ownerId, args.force));
		return null;
	},
});
async function schedule(ctx: MutationCtx, task: OwnerSummaryTask | null) {
	if (task) await ctx.scheduler.runAfter(0, pageRef, task);
}
export const ensure: RegisteredMutation<
	"public",
	{ instanceKey: string },
	Promise<null>
> = mutation({
	args: { instanceKey: v.string() },
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		if (!(await isWishlistInstallationEnabled(ctx, args.instanceKey)))
			throw new ConvexError({
				code: "unavailable",
				message: "Saved lists are unavailable.",
			});
		const user = await getActiveWishlistUser(ctx);
		if (!user)
			throw new ConvexError({
				code: "auth_required",
				message: "Please sign in.",
			});
		await schedule(ctx, await beginOwnerSummaryRepair(ctx, user._id));
		return null;
	},
});
export const page: RegisteredMutation<
	"internal",
	OwnerSummaryTask,
	Promise<null>
> = internalMutation({
	args: {
		ownerId: v.id("users"),
		generation: v.number(),
		afterTime: v.union(v.number(), v.null()),
		afterId: v.union(v.string(), v.null()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		await schedule(ctx, await advanceOwnerSummaryRepair(ctx, args));
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
		const pending = await ctx.db
			.query("commerce_wishlist_owner_totals")
			.withIndex("by_phase_updated", (q) => q.eq("phase", "pending"))
			.take(8);
		for (const state of pending)
			await schedule(ctx, await beginOwnerSummaryRepair(ctx, state.ownerId));
		const stalled = await ctx.db
			.query("commerce_wishlist_owner_totals")
			.withIndex("by_phase_updated", (q) =>
				q.eq("phase", "scanning").lte("updatedAt", Date.now() - 60000),
			)
			.take(8);
		for (const state of stalled)
			await schedule(ctx, await beginOwnerSummaryRepair(ctx, state.ownerId));
		return null;
	},
});
