import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { ConvexError, v, type Validator } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isWishlistInstallationEnabled } from "./pages";
import { getActiveWishlistUser } from "./helpers";
import { readCompletedWishlistCount } from "./counts";
import { readOwnerSummary, type OwnerSummary } from "./ownerTotals";
export type OwnerWidgetArgs = {
	instanceKey: string;
	refreshKey: string;
	paginationOpts: PaginationOptions;
};
export type OwnerWidgetSnapshot = {
	page: {
		_id: Id<"commerce_wishlists">;
		name: string;
		isPublic: boolean;
		itemCount?: number;
	}[];
	isDone: boolean;
	continueCursor: string;
	expiresAt: number;
	summary: OwnerSummary;
};
export const ownerWidgetArgs = {
	instanceKey: v.string(),
	refreshKey: v.string(),
	paginationOpts: paginationOptsValidator,
};
export const ownerWidgetValidator: Validator<OwnerWidgetSnapshot | null> = v.union(
	v.null(),
	v.object({
		page: v.array(
			v.object({
				_id: v.id("commerce_wishlists"),
				name: v.string(),
				isPublic: v.boolean(),
				itemCount: v.optional(v.number()),
			}),
		),
		isDone: v.boolean(),
		continueCursor: v.string(),
		expiresAt: v.number(),
		summary: v.union(
			v.object({
				state: v.literal("ready"),
				totalLists: v.number(),
				totalItems: v.number(),
			}),
			v.object({
				state: v.literal("preparing"),
				totalLists: v.null(),
				totalItems: v.null(),
			}),
		),
	}),
);
/** One small list page plus one maintained owner summary; no full-list/item scan. */
export async function readOwnerWidget(
	ctx: QueryCtx,
	args: OwnerWidgetArgs,
): Promise<OwnerWidgetSnapshot | null> {
	const opts = args.paginationOpts;
	if (
		!Number.isSafeInteger(opts.numItems) ||
		opts.numItems < 1 ||
		opts.numItems > 24 ||
		(opts.cursor?.length ?? 0) > 8192 ||
		args.refreshKey.length > 128
	)
		throw new ConvexError({
			code: "invalid_wishlist_page",
			message: "Invalid saved-list page.",
		});
	if (!(await isWishlistInstallationEnabled(ctx, args.instanceKey)))
		return null;
	const user = await getActiveWishlistUser(ctx);
	if (!user) return null;
	const result = await ctx.db
		.query("commerce_wishlists")
		.withIndex("by_user", (q) => q.eq("userId", user._id))
		.paginate({
			cursor: opts.cursor,
			numItems: opts.numItems,
			maximumRowsRead: 24,
			maximumBytesRead: 256 * 1024,
		});
	return {
		page: await Promise.all(
			result.page.map(async (row) => ({
				_id: row._id,
				name: row.name,
				isPublic: row.isPublic,
				itemCount:
					(await readCompletedWishlistCount(ctx, row._id)) ?? undefined,
			})),
		),
		isDone: result.isDone,
		continueCursor: result.continueCursor,
		expiresAt: Date.now() + 15000,
		summary: await readOwnerSummary(ctx, user._id),
	};
}
