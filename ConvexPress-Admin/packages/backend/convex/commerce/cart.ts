import { ConvexError } from "convex/values";

import { internalMutation, mutation, query } from "../_generated/server";
import { emitEvent } from "../helpers/events";
import { getCurrentUser } from "../helpers/permissions";
import { evaluateMembershipAccess } from "../membership/access";
import { CART_EVENTS, SYSTEM } from "../events/constants";
import { evaluateDiscount } from "./discountEngine";
import { getCommerceSettings, requireCommerceEnabled } from "./helpers";
import {
	addCartItemArgs,
	applyCartDiscountCodeArgs,
	clearCartArgs,
	getCartArgs,
	markAbandonedCartsArgs,
	mergeCartArgs,
	removeCartDiscountCodeArgs,
	removeCartItemArgs,
	updateCartItemArgs,
} from "./validators";

async function findCartBySession(ctx: any, sessionToken: string) {
	return ctx.db
		.query("commerce_carts")
		.withIndex("by_session", (q: any) => q.eq("sessionToken", sessionToken))
		.unique();
}

async function findActiveCartByUser(ctx: any, userId: any) {
	const carts = await ctx.db
		.query("commerce_carts")
		.withIndex("by_user", (q: any) => q.eq("userId", userId))
		.collect();
	return (
		carts.find((cart: any) => cart.status === "active") ??
		carts.find((cart: any) => cart.status === "abandoned") ??
		null
	);
}

async function findDiscountByCode(ctx: any, code: string) {
	return ctx.db
		.query("commerce_discount_codes")
		.withIndex("by_code", (q: any) => q.eq("code", code))
		.unique();
}

async function assertCanMutateCart(
	cart: any,
	sessionToken?: string,
	userId?: any,
) {
	if (!cart || cart.status !== "active") {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "Active cart not found.",
		});
	}

	const normalizedSessionToken = sessionToken?.trim();
	const sessionMatches =
		normalizedSessionToken && cart.sessionToken === normalizedSessionToken;
	const userMatches =
		userId && cart.userId && cart.userId.toString() === userId.toString();

	if (!sessionMatches && !userMatches) {
		throw new ConvexError({
			code: "FORBIDDEN",
			message: "You do not have permission to update this cart.",
		});
	}
}

async function resolveCartItemForMutation(
	ctx: any,
	cartItemId: any,
	sessionToken?: string,
) {
	const user = await getCurrentUser(ctx);
	const item = await ctx.db.get("commerce_cart_items", cartItemId);
	if (!item) return { item: null, cart: null, user };

	const cart = await ctx.db.get("commerce_carts", item.cartId);
	await assertCanMutateCart(cart, sessionToken, user?._id);
	return { item, cart, user };
}

function isVariantPublic(variant: any) {
	return !variant.status || variant.status === "publish";
}

async function resolvePurchasableProductAndVariant(
	ctx: any,
	productId: any,
	variantId?: any,
) {
	const product = await ctx.db.get("commerce_products", productId);

	if (!product || product.status !== "publish") {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "Product not found.",
		});
	}

	const variant = variantId
		? await ctx.db.get("commerce_product_variants", variantId)
		: null;
	if (product.productType === "variable" && !variant) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: "Choose a product option before adding this item.",
		});
	}

	if (variant) {
		if (
			variant.productId.toString() !== productId.toString() ||
			!isVariantPublic(variant)
		) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Selected product option is unavailable.",
			});
		}
	}

	return { product, variant };
}

function assertSufficientStock(product: any, variant: any, quantity: number) {
	if (!product.trackInventory) return;

	const useParentStock = variant?.manageStock === "parent";
	const stock =
		variant && !useParentStock
			? (variant.stockQuantity ?? 0)
			: (product.stockQuantity ?? 0);
	const variantAllowsBackorders =
		variant?.backorders === "yes" || variant?.backorders === "notify";
	const allowBackorders = variant
		? variantAllowsBackorders
		: !!product.allowBackorders;

	if (!allowBackorders && stock < quantity) {
		throw new ConvexError({
			code: "INSUFFICIENT_STOCK",
			message: `Only ${stock} available in stock.`,
		});
	}
}

async function resolveActiveDiscount(ctx: any, code?: string) {
	const normalizedCode = code?.trim().toUpperCase();
	if (!normalizedCode) return null;

	const discount = await findDiscountByCode(ctx, normalizedCode);
	if (!discount || discount.status !== "active") return null;

	const now = Date.now();
	if (discount.startsAt && discount.startsAt > now) return null;
	if (discount.endsAt && discount.endsAt < now) return null;
	if (
		typeof discount.usageLimit === "number" &&
		discount.usageCount >= discount.usageLimit
	) {
		return null;
	}

	return discount;
}

async function getCartItemsForDiscount(ctx: any, cartId: any) {
	const items = await ctx.db
		.query("commerce_cart_items")
		.withIndex("by_cart", (q: any) => q.eq("cartId", cartId))
		.collect();

	return Promise.all(
		items.map(async (item: any) => {
			const product = await ctx.db.get("commerce_products", item.productId);
			return {
				...item,
				product,
			};
		}),
	);
}

async function recalculateCart(ctx: any, cartId: any) {
	const cart = await ctx.db.get("commerce_carts", cartId);
	if (!cart) return;

	const items = await getCartItemsForDiscount(ctx, cartId);
	const subtotalAmount = items.reduce(
		(sum: number, item: any) => sum + item.lineTotalAmount,
		0,
	);
	const discount = await resolveActiveDiscount(ctx, cart.appliedDiscountCode);
	const discountEvaluation = discount
		? evaluateDiscount(discount, items)
		: null;
	const discountAmount = discountEvaluation?.eligible
		? discountEvaluation.discountAmount
		: 0;

	// Tax calculation requires a shipping address which the cart does not store.
	// Tax is computed at checkout when the address is provided (see checkout.ts).
	// If the cart ever gains an address field, calculate here using:
	//   const rules = await ctx.db.query("commerce_tax_rules")
	//     .withIndex("by_active", (q: any) => q.eq("isActive", true)).collect();
	//   const { taxAmount } = calculateTaxFromRules(rules, address, taxableAmount);
	const taxableAmount = Math.max(0, subtotalAmount - discountAmount);
	const taxAmount = 0;

	await ctx.db.patch("commerce_carts", cartId, {
		subtotalAmount,
		appliedDiscountCode: discount?.code,
		appliedDiscountDescription:
			discountEvaluation?.message ?? discount?.description,
		discountAmount,
		shippingAmount: 0,
		taxAmount,
		totalAmount: taxableAmount,
		itemCount: items.reduce((sum: number, item: any) => sum + item.quantity, 0),
		lastActiveAt: Date.now(),
		updatedAt: Date.now(),
	});
}

/**
 * Resolve the active price for a variant, respecting scheduled sale dates.
 * Falls back to the regular price when no sale is active or dates are outside range.
 */
function resolveVariantActivePrice(variant: any): number {
	const now = Date.now();
	if (
		variant.salePrice?.amount &&
		(!variant.salePriceFrom || variant.salePriceFrom <= now) &&
		(!variant.salePriceTo || variant.salePriceTo >= now)
	) {
		return variant.salePrice.amount;
	}
	return variant.price.amount;
}

/**
 * Resolve the active price for a product, respecting scheduled sale dates.
 */
function resolveProductActivePrice(product: any): number {
	const now = Date.now();
	if (
		product.salePrice?.amount &&
		(!product.salePriceFrom || product.salePriceFrom <= now) &&
		(!product.salePriceTo || product.salePriceTo >= now)
	) {
		return product.salePrice.amount;
	}
	return product.basePrice.amount;
}

async function ensureCart(ctx: any, sessionToken: string, userId?: any) {
	const cart = await findCartBySession(ctx, sessionToken);
	if (cart) {
		if (cart.status === "abandoned") {
			await ctx.db.patch("commerce_carts", cart._id, {
				status: "active",
				recoveredAt: Date.now(),
				updatedAt: Date.now(),
			});
			await emitEvent(ctx, CART_EVENTS.RECOVERED, SYSTEM.CART, {
				cartId: cart._id,
				sessionToken,
				userId,
			});
			return ctx.db.get("commerce_carts", cart._id);
		}
		return cart;
	}
	const settings = await getCommerceSettings(ctx);

	const now = Date.now();
	const cartId = await ctx.db.insert("commerce_carts", {
		userId,
		sessionToken,
		status: "active",
		currencyCode: settings.currencyCode || "USD",
		appliedDiscountCode: undefined,
		appliedDiscountDescription: undefined,
		subtotalAmount: 0,
		discountAmount: 0,
		shippingAmount: 0,
		taxAmount: 0,
		totalAmount: 0,
		itemCount: 0,
		lastActiveAt: now,
		createdAt: now,
		updatedAt: now,
	});

	return ctx.db.get("commerce_carts", cartId);
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getMine = query({
	args: getCartArgs,
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		const user = await getCurrentUser(ctx);
		const sessionToken = args.sessionToken?.trim();

		const cart = sessionToken
			? await findCartBySession(ctx, sessionToken)
			: user
				? await ctx.db
						.query("commerce_carts")
						.withIndex("by_user", (q: any) => q.eq("userId", user._id))
						.unique()
				: null;

		if (!cart) return null;

		const items = await ctx.db
			.query("commerce_cart_items")
			.withIndex("by_cart", (q: any) => q.eq("cartId", cart._id))
			.collect();

		const enrichedItems = await Promise.all(
			items.map(async (item: any) => {
				const product = await ctx.db.get("commerce_products", item.productId);
				const variant = item.variantId
					? await ctx.db.get("commerce_product_variants", item.variantId)
					: null;
				return {
					...item,
					product,
					variant,
				};
			}),
		);

		return {
			...cart,
			items: enrichedItems,
		};
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const addItem = mutation({
	args: addCartItemArgs,
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		const user = await getCurrentUser(ctx);
		const { product, variant } = await resolvePurchasableProductAndVariant(
			ctx,
			args.productId,
			args.variantId,
		);
		const productAccess = await evaluateMembershipAccess(ctx, {
			resourceType: "product",
			resourceIdOrKey: String(args.productId),
		});
		if (!productAccess.allowed) {
			throw new ConvexError({
				code: "PRODUCT_RESTRICTED",
				message: "This product is restricted to members with access.",
				reason: productAccess.reason,
				matchingPlanIds: productAccess.matchingPlanIds,
			});
		}

		const quantity = Math.max(1, args.quantity);
		const cart = await ensureCart(ctx, args.sessionToken, user?._id);
		await assertCanMutateCart(cart, args.sessionToken, user?._id);

		const existing = (
			await ctx.db
				.query("commerce_cart_items")
				.withIndex("by_cart_product", (q: any) =>
					q.eq("cartId", cart._id).eq("productId", args.productId),
				)
				.collect()
		).find(
			(item: any) =>
				(item.variantId?.toString() ?? null) ===
				(args.variantId?.toString() ?? null),
		);

		// Resolve active price with scheduled sale date awareness
		const unitPriceAmount = variant
			? resolveVariantActivePrice(variant)
			: resolveProductActivePrice(product);

		// Stock validation — respect variant-level manageStock and backorders
		const desiredQty = (existing?.quantity ?? 0) + quantity;
		assertSufficientStock(product, variant, desiredQty);

		const now = Date.now();

		if (existing) {
			await ctx.db.patch(existing._id, {
				quantity: existing.quantity + quantity,
				unitPriceAmount,
				lineTotalAmount: (existing.quantity + quantity) * unitPriceAmount,
				updatedAt: now,
			});
		} else {
			await ctx.db.insert("commerce_cart_items", {
				cartId: cart._id,
				productId: args.productId,
				variantId: args.variantId,
				quantity,
				unitPriceAmount,
				lineTotalAmount: quantity * unitPriceAmount,
				createdAt: now,
				updatedAt: now,
			});
		}

		await recalculateCart(ctx, cart._id);
		await emitEvent(
			ctx,
			existing ? CART_EVENTS.ITEM_UPDATED : CART_EVENTS.ITEM_ADDED,
			SYSTEM.CART,
			{
				cartId: cart._id,
				productId: args.productId,
				variantId: args.variantId,
				quantity: existing ? existing.quantity + quantity : quantity,
			},
		);
		return cart._id;
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateItemQuantity = mutation({
	args: updateCartItemArgs,
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		const { item } = await resolveCartItemForMutation(
			ctx,
			args.cartItemId,
			args.sessionToken,
		);
		if (!item) return null;

		if (args.quantity <= 0) {
			await ctx.db.delete(args.cartItemId);
			await recalculateCart(ctx, item.cartId);
			await emitEvent(ctx, CART_EVENTS.ITEM_REMOVED, SYSTEM.CART, {
				cartId: item.cartId,
				cartItemId: args.cartItemId,
				productId: item.productId,
				variantId: item.variantId,
			});
			return null;
		}

		// Refresh pricing from source of truth (variant or product)
		const { product, variant } = await resolvePurchasableProductAndVariant(
			ctx,
			item.productId,
			item.variantId,
		);

		const refreshedPrice = variant
			? resolveVariantActivePrice(variant)
			: resolveProductActivePrice(product);

		// Stock validation — respect variant-level manageStock and backorders
		assertSufficientStock(product, variant, args.quantity);

		await ctx.db.patch(args.cartItemId, {
			quantity: args.quantity,
			unitPriceAmount: refreshedPrice,
			lineTotalAmount: args.quantity * refreshedPrice,
			updatedAt: Date.now(),
		});
		await recalculateCart(ctx, item.cartId);
		await emitEvent(ctx, CART_EVENTS.ITEM_UPDATED, SYSTEM.CART, {
			cartId: item.cartId,
			cartItemId: args.cartItemId,
			productId: item.productId,
			variantId: item.variantId,
			quantity: args.quantity,
		});
		return args.cartItemId;
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const removeItem = mutation({
	args: removeCartItemArgs,
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		const { item } = await resolveCartItemForMutation(
			ctx,
			args.cartItemId,
			args.sessionToken,
		);
		if (!item) return null;

		await ctx.db.delete(args.cartItemId);
		await recalculateCart(ctx, item.cartId);
		await emitEvent(ctx, CART_EVENTS.ITEM_REMOVED, SYSTEM.CART, {
			cartId: item.cartId,
			cartItemId: args.cartItemId,
			productId: item.productId,
			variantId: item.variantId,
		});
		return args.cartItemId;
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const clear = mutation({
	args: clearCartArgs,
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		const cart = await findCartBySession(ctx, args.sessionToken);
		if (!cart) return null;

		const items = await ctx.db
			.query("commerce_cart_items")
			.withIndex("by_cart", (q: any) => q.eq("cartId", cart._id))
			.collect();

		for (const item of items) {
			await ctx.db.delete(item._id);
		}

		await recalculateCart(ctx, cart._id);
		await emitEvent(ctx, CART_EVENTS.CLEARED, SYSTEM.CART, {
			cartId: cart._id,
			itemsRemoved: items.length,
		});
		return cart._id;
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const applyDiscountCode = mutation({
	args: applyCartDiscountCodeArgs,
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		const cart = await findCartBySession(ctx, args.sessionToken);
		if (!cart) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Cart not found.",
			});
		}

		const discount = await resolveActiveDiscount(ctx, args.code);
		if (!discount) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Discount code is invalid or unavailable.",
			});
		}

		const items = await getCartItemsForDiscount(ctx, cart._id);
		const evaluation = evaluateDiscount(discount, items);
		if (!evaluation.eligible) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message:
					evaluation.message ?? "Cart does not qualify for this discount.",
			});
		}

		await ctx.db.patch("commerce_carts", cart._id, {
			appliedDiscountCode: discount.code,
			appliedDiscountDescription: evaluation.message ?? discount.description,
			updatedAt: Date.now(),
		});
		await recalculateCart(ctx, cart._id);
		await emitEvent(ctx, CART_EVENTS.ITEM_UPDATED, SYSTEM.CART, {
			cartId: cart._id,
			change: "discount_applied",
			code: discount.code,
		});
		return cart._id;
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const removeDiscountCode = mutation({
	args: removeCartDiscountCodeArgs,
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		const cart = await findCartBySession(ctx, args.sessionToken);
		if (!cart) return null;

		await ctx.db.patch("commerce_carts", cart._id, {
			appliedDiscountCode: undefined,
			appliedDiscountDescription: undefined,
			updatedAt: Date.now(),
		});
		await recalculateCart(ctx, cart._id);
		await emitEvent(ctx, CART_EVENTS.ITEM_UPDATED, SYSTEM.CART, {
			cartId: cart._id,
			change: "discount_removed",
		});
		return cart._id;
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const merge = mutation({
	args: mergeCartArgs,
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new ConvexError({
				code: "UNAUTHORIZED",
				message: "Sign in to merge your cart.",
			});
		}

		const guestCart = await findCartBySession(ctx, args.sessionToken);
		const userCart = await findActiveCartByUser(ctx, user._id);

		if (!guestCart) return userCart?._id ?? null;

		if (guestCart.userId?.toString() === user._id.toString()) {
			if (guestCart.status === "abandoned") {
				await ctx.db.patch("commerce_carts", guestCart._id, {
					status: "active",
					recoveredAt: Date.now(),
					updatedAt: Date.now(),
				});
				await emitEvent(ctx, CART_EVENTS.RECOVERED, SYSTEM.CART, {
					cartId: guestCart._id,
					userId: user._id,
				});
			}
			return guestCart._id;
		}

		if (!userCart || userCart._id.toString() === guestCart._id.toString()) {
			await ctx.db.patch("commerce_carts", guestCart._id, {
				userId: user._id,
				status: "active",
				recoveredAt:
					guestCart.status === "abandoned" ? Date.now() : guestCart.recoveredAt,
				updatedAt: Date.now(),
			});
			await emitEvent(ctx, CART_EVENTS.MERGED, SYSTEM.CART, {
				cartId: guestCart._id,
				source: "session_claimed",
				userId: user._id,
			});
			return guestCart._id;
		}

		const guestItems = await ctx.db
			.query("commerce_cart_items")
			.withIndex("by_cart", (q: any) => q.eq("cartId", guestCart._id))
			.collect();

		const userItems = await ctx.db
			.query("commerce_cart_items")
			.withIndex("by_cart", (q: any) => q.eq("cartId", userCart._id))
			.collect();

		for (const guestItem of guestItems) {
			const match = userItems.find(
				(item: any) =>
					item.productId.toString() === guestItem.productId.toString() &&
					(item.variantId?.toString() ?? null) ===
						(guestItem.variantId?.toString() ?? null),
			);

			if (match) {
				const quantity = match.quantity + guestItem.quantity;
				await ctx.db.patch("commerce_cart_items", match._id, {
					quantity,
					lineTotalAmount: quantity * match.unitPriceAmount,
					updatedAt: Date.now(),
				});
				await ctx.db.delete("commerce_cart_items", guestItem._id);
			} else {
				await ctx.db.patch("commerce_cart_items", guestItem._id, {
					cartId: userCart._id,
					updatedAt: Date.now(),
				});
			}
		}

		await ctx.db.patch("commerce_carts", guestCart._id, {
			status: "merged",
			itemCount: 0,
			subtotalAmount: 0,
			discountAmount: 0,
			shippingAmount: 0,
			taxAmount: 0,
			totalAmount: 0,
			mergedIntoCartId: userCart._id,
			updatedAt: Date.now(),
		});
		await recalculateCart(ctx, userCart._id);
		await emitEvent(ctx, CART_EVENTS.MERGED, SYSTEM.CART, {
			cartId: userCart._id,
			mergedCartId: guestCart._id,
			itemsMerged: guestItems.length,
			userId: user._id,
		});

		return userCart._id;
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const markAbandonedCarts = internalMutation({
	args: markAbandonedCartsArgs,
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		const olderThanMs = args.olderThanMs ?? 24 * 60 * 60 * 1000;
		const limit = Math.min(args.limit ?? 100, 500);
		const cutoff = Date.now() - olderThanMs;
		const carts = await ctx.db
			.query("commerce_carts")
			.withIndex("by_status", (q: any) => q.eq("status", "active"))
			.take(limit);

		let abandoned = 0;
		for (const cart of carts) {
			if (cart.itemCount <= 0 || cart.lastActiveAt > cutoff) continue;
			await ctx.db.patch("commerce_carts", cart._id, {
				status: "abandoned",
				abandonedAt: Date.now(),
				updatedAt: Date.now(),
			});
			await emitEvent(ctx, CART_EVENTS.ABANDONED, SYSTEM.CART, {
				cartId: cart._id,
				userId: cart.userId,
				itemCount: cart.itemCount,
				lastActiveAt: cart.lastActiveAt,
			});
			abandoned += 1;
		}

		return { abandoned, cutoff };
	},
});
