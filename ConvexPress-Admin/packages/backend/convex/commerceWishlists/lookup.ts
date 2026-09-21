import type { PaginationOptions, PaginationResult } from "convex/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getActiveWishlistUser } from "./helpers";
import { isWishlistInstallationEnabled } from "./pages";

export type WishlistLookupArgs = {
	instanceKey: string;
	productId: Id<"commerce_products">;
	variantId?: Id<"commerce_product_variants">;
	paginationOpts: PaginationOptions;
};
export type WishlistLookupEntry =
	| { state: "unavailable" }
	| {
			state: "saved";
			wishlistId: Id<"commerce_wishlists">;
			itemId: Id<"commerce_wishlist_items">;
	  };
export type WishlistLookupPage = PaginationResult<WishlistLookupEntry>;

/** Sparse pages preserve the owner's list order. An empty nonfinal page is
 * inconclusive; the caller must continue before offering an add operation. */
export async function lookupSavedProduct(
	ctx: QueryCtx,
	args: WishlistLookupArgs,
): Promise<WishlistLookupPage> {
	const opts = args.paginationOpts;
	if (
		!Number.isSafeInteger(opts.numItems) ||
		opts.numItems < 1 ||
		opts.numItems > 24 ||
		(opts.cursor?.length ?? 0) > 8192 ||
		(opts.endCursor?.length ?? 0) > 8192
	)
		throw new ConvexError({
			code: "invalid_wishlist_page",
			message: "Invalid saved-product lookup page.",
		});
	const unavailable: WishlistLookupPage = {
		page: [{ state: "unavailable" }],
		isDone: true,
		continueCursor: "",
	};
	if (!(await isWishlistInstallationEnabled(ctx, args.instanceKey)))
		return unavailable;
	const user = await getActiveWishlistUser(ctx);
	if (!user) return unavailable;
	const lists = await ctx.db
		.query("commerce_wishlists")
		.withIndex("by_user", (q) => q.eq("userId", user._id))
		.paginate({ ...opts, maximumRowsRead: 24, maximumBytesRead: 256 * 1024 });
	for (const list of lists.page) {
		const match = await ctx.db
			.query("commerce_wishlist_items")
			.withIndex("by_wishlist_product_variant", (q) => {
				const product = q
					.eq("wishlistId", list._id)
					.eq("productId", args.productId);
				return args.variantId === undefined
					? product
					: product.eq("variantId", args.variantId);
			})
			.first();
		// One match is sufficient. Do not read another saved document (which may
		// have large private notes), and never return those notes to the button.
		if (match)
			return {
				...lists,
				page: [{ state: "saved", wishlistId: list._id, itemId: match._id }],
			};
	}
	return { ...lists, page: [] };
}
