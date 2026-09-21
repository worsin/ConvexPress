import { insertCountedWishlist, insertCountedWishlistItem } from "./counts";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { SourceByteLedger } from "../canonicalDocuments/sourceBudget";
import { createPublicProductAccessReader } from "../commerce/publicProductAccess";
import { emitEvent } from "../helpers/events";
import { SYSTEM, WISHLIST_EVENTS } from "../events/constants";
import {
	getActiveWishlistUser,
	requireCommerceWishlistsEnabled,
} from "./helpers";

/** Each request is one atomic batch. Callers retain unacknowledged IDs and can
 * safely replay a batch: the indexed product/no-variant identity prevents duplicates. */
export async function mergeGuestProducts(
	ctx: MutationCtx,
	args: { guestProductIds: Id<"commerce_products">[] },
	createShareToken: () => string,
): Promise<{ merged: number }> {
	await requireCommerceWishlistsEnabled(ctx);
	const user = await getActiveWishlistUser(ctx);
	if (!user)
		throw new ConvexError({
			code: "auth_required",
			message: "Authentication required.",
		});
	if (args.guestProductIds.length > 24)
		throw new ConvexError({
			code: "wishlist_merge_batch_too_large",
			message: "Merge at most 24 saved products per request.",
		});
	if (!args.guestProductIds.length) return { merged: 0 };
	const now = Date.now(),
		budget = new RequestReadLedger(),
		sources = new SourceByteLedger();
	const canSave = createPublicProductAccessReader(ctx, budget, sources, now);
	budget.beforeRead();
	const existingList = budget.record(
		await ctx.db
			.query("commerce_wishlists")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.first(),
	);
	let wishlistId = existingList?._id;
	let merged = 0;
	for (const productId of new Set(args.guestProductIds)) {
		sources.beforeRead();
		budget.beforeRead();
		const product = budget.record(
			await ctx.db.get("commerce_products", productId),
		);
		if (product) sources.record("product", product);
		// Future/private/deleted/member-only products follow the same authority as
		// current public cards. Budget failures propagate and roll back the batch.
		if (!(await canSave(product))) continue;
		if (!wishlistId)
			wishlistId = await insertCountedWishlist(ctx, {
				userId: user._id,
				name: "My Wishlist",
				isDefault: true,
				isPublic: false,
				shareToken: createShareToken(),
				createdAt: now,
				updatedAt: now,
			});
		budget.beforeRead();
		const existing = budget.record(
			await ctx.db
				.query("commerce_wishlist_items")
				.withIndex("by_wishlist_product_variant", (q) =>
					q
						.eq("wishlistId", wishlistId!)
						.eq("productId", productId)
						.eq("variantId", undefined),
				)
				.first(),
		);
		if (existing) continue;
		const itemId = await insertCountedWishlistItem(ctx, {
			wishlistId,
			productId,
			addedAt: now,
		});
		await emitEvent(ctx, WISHLIST_EVENTS.ITEM_ADDED, SYSTEM.WISHLIST, {
			wishlistId,
			itemId,
			productId,
			source: "guest_merge",
		});
		merged++;
	}
	return { merged };
}
