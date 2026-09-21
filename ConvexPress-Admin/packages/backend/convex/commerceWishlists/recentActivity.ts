import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { isPluginEnabled } from "../helpers/plugins";
import { requireCommerceWishlistsEnabled } from "./helpers";
export type RecentWishlistItem = {
	_id: Id<"commerce_wishlist_items">;
	addedAt: number;
	productName: string;
	productSlug?: string;
	userName: string;
};
export async function readRecentWishlistActivity(
	ctx: QueryCtx,
	args: { limit?: number },
): Promise<RecentWishlistItem[] | null> {
	if (!(await isPluginEnabled(ctx, "commerceWishlists"))) return null;
	await requireCommerceWishlistsEnabled(ctx);
	await requireCan(ctx, "commerce.wishlists.manage");
	const limit = args.limit ?? 20;
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
		throw new ConvexError({
			code: "invalid_wishlist_activity_limit",
			message: "Choose between 1 and 100 recent items.",
		});
	const items = await ctx.db
		.query("commerce_wishlist_items")
		.withIndex("by_added_at")
		.order("desc")
		.take(limit);
	return Promise.all(
		items.map(async (item) => {
			const product = await ctx.db.get("commerce_products", item.productId);
			const wishlist = await ctx.db.get("commerce_wishlists", item.wishlistId);
			const user = wishlist ? await ctx.db.get("users", wishlist.userId) : null;
			return {
				_id: item._id,
				addedAt: item.addedAt,
				productName: product?.title || "Unknown Product",
				...(product ? { productSlug: product.slug } : {}),
				userName:
					user?.displayName ||
					`${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
					"Unknown User",
			};
		}),
	);
}
