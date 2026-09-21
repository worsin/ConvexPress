import { makeFunctionReference, type RegisteredMutation } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import { isWishlistInstallationEnabled } from "./pages";
import { createWishlistItemProjector } from "./publicItems";

const addCartItem = makeFunctionReference<
	"mutation",
	{
		sessionToken: string;
		productId: Id<"commerce_products">;
		variantId?: Id<"commerce_product_variants">;
		quantity: number;
	},
	Id<"commerce_carts">
>("commerce/cart:addItem");
function unavailable(): never {
	throw new ConvexError({
		code: "shared_wishlist_unavailable",
		message: "This saved product is no longer available from this link.",
	});
}

/** The caller supplies a saved-item ID, never a replacement product/variant.
 * Sharing, stock and publication are checked in the same transaction as cart add. */
export const addToCart: RegisteredMutation<
	"public",
	{
		instanceKey: string;
		shareToken: string;
		itemId: Id<"commerce_wishlist_items">;
		sessionToken: string;
	},
	Promise<Id<"commerce_carts">>
> = mutation({
	args: {
		instanceKey: v.string(),
		shareToken: v.string(),
		itemId: v.id("commerce_wishlist_items"),
		sessionToken: v.string(),
	},
	returns: v.id("commerce_carts"),
	handler: async (ctx, args): Promise<Id<"commerce_carts">> => {
		if (
			!(await isWishlistInstallationEnabled(ctx, args.instanceKey)) ||
			!args.shareToken ||
			args.shareToken.length > 256
		)
			unavailable();
		const wishlist = await ctx.db
			.query("commerce_wishlists")
			.withIndex("by_share_token", (q) => q.eq("shareToken", args.shareToken))
			.unique();
		if (!wishlist?.isPublic) unavailable();
		const owner = await ctx.db.get("users", wishlist.userId);
		if (owner?.status !== "active") unavailable();
		const item = await ctx.db.get("commerce_wishlist_items", args.itemId);
		if (!item || item.wishlistId !== wishlist._id) unavailable();
		const project = await createWishlistItemProjector(ctx);
		if ((await project(item)).purchaseMode !== "add") unavailable();
		return await ctx.runMutation(addCartItem, {
			sessionToken: args.sessionToken,
			productId: item.productId,
			...(item.variantId ? { variantId: item.variantId } : {}),
			quantity: 1,
		});
	},
});
