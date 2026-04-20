import { ConvexError } from "convex/values";

export async function assertVariantBelongsToProduct(
	ctx: any,
	productId: any,
	variantId?: any,
) {
	if (!variantId) return null;

	const variant = await ctx.db.get(variantId);
	if (!variant || variant.productId.toString() !== productId.toString()) {
		throw new ConvexError({
			code: "INVALID_VARIANT",
			message: "Selected variant does not belong to the selected product.",
		});
	}

	return variant;
}
