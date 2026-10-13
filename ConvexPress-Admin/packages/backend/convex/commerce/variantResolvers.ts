import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function assertVariantBelongsToProduct(
	ctx: Pick<QueryCtx, "db">,
	productId: Id<"commerce_products">,
	variantId?: Id<"commerce_product_variants">,
) {
	if (!variantId) return null;

	const variant = await ctx.db.get("commerce_product_variants", variantId);
	if (!variant || variant.productId.toString() !== productId.toString()) {
		throw new ConvexError({
			code: "INVALID_VARIANT",
			message: "Selected variant does not belong to the selected product.",
		});
	}

	return variant;
}
