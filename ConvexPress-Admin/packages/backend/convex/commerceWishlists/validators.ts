import { v, type Validator, type GenericId } from "convex/values";
export type WishlistPublicItem = {
	_id: GenericId<"commerce_wishlist_items">;
	productId: GenericId<"commerce_products">;
	variantId?: GenericId<"commerce_product_variants">;
	addedAt: number;
	effectivePrice: number;
	currencyCode: string | null;
	isAvailable: boolean;
	purchaseMode: "add" | "chooseOptions" | "unavailable";
	image: { src: string; alt: string } | null;
	product: {
		_id: GenericId<"commerce_products">;
		title: string;
		slug: string;
		status: "publish";
		featuredMediaId?: GenericId<"media">;
	} | null;
	variant: { _id: GenericId<"commerce_product_variants">; name: string } | null;
};
const imageValidator: Validator<
	WishlistPublicItem["image"],
	"required",
	string
> = v.union(v.object({ src: v.string(), alt: v.string() }), v.null());
const productValidator: Validator<
	WishlistPublicItem["product"],
	"required",
	string
> = v.union(
	v.object({
		_id: v.id("commerce_products"),
		title: v.string(),
		slug: v.string(),
		status: v.literal("publish"),
		featuredMediaId: v.optional(v.id("media")),
	}),
	v.null(),
);
const variantValidator: Validator<
	WishlistPublicItem["variant"],
	"required",
	string
> = v.union(
	v.object({ _id: v.id("commerce_product_variants"), name: v.string() }),
	v.null(),
);
const itemFields: {
	[K in keyof Required<WishlistPublicItem>]: Validator<
		WishlistPublicItem[K],
		undefined extends WishlistPublicItem[K] ? "optional" : "required",
		string
	>;
} = {
	image: imageValidator,
	_id: v.id("commerce_wishlist_items"),
	productId: v.id("commerce_products"),
	variantId: v.optional(v.id("commerce_product_variants")),
	addedAt: v.number(),
	effectivePrice: v.number(),
	currencyCode: v.union(v.string(), v.null()),
	isAvailable: v.boolean(),
	purchaseMode: v.union(
		v.literal("add"),
		v.literal("chooseOptions"),
		v.literal("unavailable"),
	),
	product: productValidator,
	variant: variantValidator,
};
// Explicit DTO boundary avoids recursive inference through the full site API graph.
// The mapped field check above still verifies every field and optionality.
export const wishlistPublicItemValidator: Validator<
	WishlistPublicItem,
	"required",
	string
> = v.object(itemFields);

export type WishlistDetail = {
	_id: GenericId<"commerce_wishlists">;
	name: string;
	isPublic: boolean;
	isDefault: boolean;
	shareToken: string;
	createdAt: number;
	updatedAt: number;
	items: WishlistPublicItem[];
};
export const wishlistDetailValidator: Validator<
	WishlistDetail | null,
	"required",
	string
> = v.union(
	v.null(),
	v.object({
		_id: v.id("commerce_wishlists"),
		name: v.string(),
		isPublic: v.boolean(),
		isDefault: v.boolean(),
		shareToken: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
		items: v.array(wishlistPublicItemValidator),
	}),
);
export type SharedWishlist = {
	_id: GenericId<"commerce_wishlists">;
	name: string;
	ownerName: string;
	items: WishlistPublicItem[];
};
export const sharedWishlistValidator: Validator<
	SharedWishlist | null,
	"required",
	string
> = v.union(
	v.null(),
	v.object({
		_id: v.id("commerce_wishlists"),
		name: v.string(),
		ownerName: v.string(),
		items: v.array(wishlistPublicItemValidator),
	}),
);
