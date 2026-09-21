import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { SourceByteLedger } from "../canonicalDocuments/sourceBudget";
import { createPublicProductCardProjector } from "../canonicalDocuments/featuredProducts";
import { publicProductCardSchema } from "../canonicalDocuments/foundation/productContracts";
import { isPublicVariant, resolvePrice } from "../commerce/activePrice";
import { canOrderQuantity, resolveStockPolicy } from "../commerce/stockPolicy";
import { readReservedStock } from "../commerce/stockTarget";

import type { WishlistPublicItem } from "./validators";
export type { WishlistPublicItem } from "./validators";

/** Closed public product data. List ownership and sharing are checked by callers.
 * A hidden/deleted product remains removable by its owner without disclosing it. */
export async function createWishlistItemProjector(
	ctx: QueryCtx,
	budget = new RequestReadLedger(),
	sources = new SourceByteLedger(),
	now = Date.now(),
) {
	const project = await createPublicProductCardProjector(
		ctx,
		true,
		budget,
		sources,
		now,
	);
	return async (
		item: Doc<"commerce_wishlist_items">,
	): Promise<WishlistPublicItem> => {
		const hidden: WishlistPublicItem = {
			_id: item._id,
			productId: item.productId,
			...(item.variantId ? { variantId: item.variantId } : {}),
			addedAt: item.addedAt,
			effectivePrice: 0,
			currencyCode: null,
			isAvailable: false,
			purchaseMode: "unavailable",
			product: null,
			variant: null,
			image: null,
		};
		sources.beforeRead();
		budget.beforeRead();
		const source = budget.record(
			await ctx.db.get("commerce_products", item.productId),
		);
		const raw = await project(source);
		if (!raw || !source) return hidden;
		const card = publicProductCardSchema.parse(raw);
		let variant: Doc<"commerce_product_variants"> | null = null;
		if (item.variantId) {
			sources.beforeRead();
			budget.beforeRead();
			variant = budget.record(
				await ctx.db.get("commerce_product_variants", item.variantId),
			);
			if (variant) sources.record("variant", variant);
			if (
				!variant ||
				variant.productId !== source._id ||
				!isPublicVariant(variant) ||
				source.productType !== "variable"
			)
				return hidden;
		}
		const priced = variant
			? {
					price: variant.price,
					salePrice: variant.salePrice ?? null,
					salePriceFrom: variant.salePriceFrom ?? null,
					salePriceTo: variant.salePriceTo ?? null,
					pricedAt: now,
				}
			: card.pricing;
		if (!priced)
			throw new ConvexError({
				code: "wishlist_price_unavailable",
				message: "Saved product pricing is unavailable.",
			});
		publicProductCardSchema.parse({ ...card, pricing: priced });
		const price = resolvePrice(
			priced.price,
			priced.salePrice,
			{
				salePriceFrom: priced.salePriceFrom ?? undefined,
				salePriceTo: priced.salePriceTo ?? undefined,
			},
			now,
		);
		budget.noteAuthorizationBoundary(price.recheckAt ?? undefined, now);
		let purchaseMode: WishlistPublicItem["purchaseMode"] = "unavailable";
		if (source.productType === "variable" && !variant)
			purchaseMode = "chooseOptions";
		else if (source.productType !== "external") {
			const initial = resolveStockPolicy(source, variant);
			const reserved = initial.tracked
				? await readReservedStock(
						ctx,
						source._id,
						variant?._id,
						undefined,
						budget,
						now,
					)
				: 0;
			if (canOrderQuantity(resolveStockPolicy(source, variant, reserved), 1))
				purchaseMode = "add";
		}
		return {
			...hidden,
			image: card.image,
			effectivePrice: price.amount,
			currencyCode: priced.price.currencyCode,
			purchaseMode,
			isAvailable: purchaseMode === "add",
			product: {
				_id: source._id,
				title: card.title,
				slug: source.slug,
				status: "publish",
				...(card.image && source.featuredMediaId
					? { featuredMediaId: source.featuredMediaId }
					: {}),
			},
			variant: variant ? { _id: variant._id, name: variant.title } : null,
		};
	};
}

/** Compatibility endpoint returns a complete bounded list, never a silent prefix.
 * The block's paginated endpoint will use the same projector for larger lists. */
export async function readWishlistItems(
	ctx: QueryCtx,
	wishlistId: Id<"commerce_wishlists">,
) {
	const budget = new RequestReadLedger({
			queries: 2048,
			documents: 8192,
			bytes: 8 * 1024 * 1024,
			documentBytes: 512 * 1024,
		}),
		sources = new SourceByteLedger();
	budget.beforeRead();
	const items = await ctx.db
		.query("commerce_wishlist_items")
		.withIndex("by_wishlist", (q) => q.eq("wishlistId", wishlistId))
		.take(129);
	for (const item of items) budget.record(item);
	if (items.length > 128)
		throw new ConvexError({
			code: "wishlist_pagination_required",
			message:
				"This wishlist needs paginated loading; no partial list was returned.",
		});
	const project = await createWishlistItemProjector(ctx, budget, sources);
	const result: WishlistPublicItem[] = [];
	for (const item of items) result.push(await project(item));
	return result;
}
