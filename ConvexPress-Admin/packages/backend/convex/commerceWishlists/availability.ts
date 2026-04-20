type WishlistAvailabilityProduct = {
	status?: string;
	trackInventory?: boolean;
	productType?: string;
	stockQuantity?: number;
	allowBackorders?: boolean;
} | null;

type WishlistAvailabilityVariant = {
	stockQuantity?: number;
} | null;

export function isWishlistItemAvailable(
	product: WishlistAvailabilityProduct,
	variant: WishlistAvailabilityVariant,
) {
	if (product?.status !== "publish") return false;
	if (!product.trackInventory) return true;

	if (product.productType === "variable") {
		if (!variant) return false;
		return (variant.stockQuantity ?? 0) > 0 || product.allowBackorders;
	}

	return (product.stockQuantity ?? 0) > 0 || product.allowBackorders;
}
