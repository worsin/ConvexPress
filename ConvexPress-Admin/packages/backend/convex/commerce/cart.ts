import { ConvexError } from "convex/values";

import { internalMutation, mutation, query } from "../_generated/server";
import { emitEvent } from "../helpers/events";
import { getCurrentUser } from "../helpers/permissions";
import { evaluateMembershipAccess } from "../membership/access";
import { CART_EVENTS, SYSTEM } from "../events/constants";
import { evaluateDiscount } from "./discountEngine";
import { evaluateDynamicPricingForCart } from "./dynamicPricing";
import { getCommerceSettings, requireCommerceEnabled } from "./helpers";
import { calculateTaxForLinesFromRules } from "./tax";
import {
	addCartItemArgs,
	applyCartDiscountCodeArgs,
	clearCartArgs,
	copySharedCartArgs,
	getCartArgs,
	getSharedCartArgs,
	markAbandonedCartsArgs,
	mergeCartArgs,
	removeCartDiscountCodeArgs,
	removeCartItemArgs,
	shareCartArgs,
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

async function getCartItems(ctx: any, cartId: any) {
	return ctx.db
		.query("commerce_cart_items")
		.withIndex("by_cart", (q: any) => q.eq("cartId", cartId))
		.collect();
}

function normalizeBundleSelections(metadata: any) {
	if (metadata?.lineType !== "bundle") return [];
	return [...(metadata.selections ?? [])]
		.map((selection: any) => ({
			componentId: String(selection.componentId ?? ""),
			productId: selection.productId ? String(selection.productId) : "",
			variantId: selection.variantId ? String(selection.variantId) : "",
			quantity: Number(selection.quantity ?? 0),
		}))
		.sort((a, b) =>
			`${a.componentId}:${a.productId}:${a.variantId}:${a.quantity}`.localeCompare(
				`${b.componentId}:${b.productId}:${b.variantId}:${b.quantity}`,
			),
		);
}

function cartLineKey(input: {
	productId: any;
	variantId?: any;
	metadata?: any;
}) {
	const metadata = input.metadata;
	const base = [
		String(input.productId),
		input.variantId ? String(input.variantId) : "",
		metadata?.lineType ?? "product",
	];

	if (metadata?.lineType === "bundle") {
		base.push(String(metadata.bundleId ?? ""));
		base.push(JSON.stringify(normalizeBundleSelections(metadata)));
	}

	return base.join("|");
}

function buildShareToken() {
	const random =
		globalThis.crypto?.randomUUID?.().replace(/-/g, "") ??
		`${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
	return `cart_${random}`;
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
}

async function recalculateCart(ctx: any, cartId: any) {
	const cart = await ctx.db.get("commerce_carts", cartId);
	if (!cart) return;

	const items = await getCartItemsForDiscount(ctx, cartId);
	const dynamicPricing = await evaluateDynamicPricingForCart(ctx, { cart, items });
	const pricedItems = dynamicPricing.items;
	for (const item of pricedItems) {
		const nextUnitPriceAmount = item.adjustedUnitPriceAmount;
		const nextLineTotalAmount = nextUnitPriceAmount * item.quantity;
		item.unitPriceAmount = nextUnitPriceAmount;
		item.lineTotalAmount = nextLineTotalAmount;
		await ctx.db.patch("commerce_cart_items", item._id, {
			baseUnitPriceAmount: item.baseUnitPriceAmount,
			unitPriceAmount: nextUnitPriceAmount,
			lineTotalAmount: nextLineTotalAmount,
			dynamicPricingAdjustmentAmount:
				item.dynamicPricingAdjustmentAmount || undefined,
			dynamicPricingRuleIds: item.dynamicPricingRuleIds?.length
				? item.dynamicPricingRuleIds
				: undefined,
			dynamicPricingDescription:
				item.dynamicPricingRuleIds?.length && dynamicPricing.description
					? dynamicPricing.description
					: undefined,
			updatedAt: Date.now(),
		});
	}
	const subtotalAmount = pricedItems.reduce(
		(sum: number, item: any) => sum + item.lineTotalAmount,
		0,
	);
	const discount = await resolveActiveDiscount(ctx, cart.appliedDiscountCode);
	const discountEvaluation = discount
		? evaluateDiscount(discount, pricedItems)
		: null;
	const couponDiscountAmount = discountEvaluation?.eligible
		? discountEvaluation.discountAmount
		: 0;
	const discountAmount =
		Number(dynamicPricing.cartDiscountAmount ?? 0) + couponDiscountAmount;

	// Tax calculation requires a shipping address which the cart does not store.
	// Tax is computed at checkout when the address is provided (see checkout.ts).
	// If the cart ever gains an address field, calculate here using:
	//   const rules = await ctx.db.query("commerce_tax_rules")
	//     .withIndex("by_active", (q: any) => q.eq("isActive", true)).collect();
	//   const { taxAmount } = calculateTaxFromRules(rules, address, taxableAmount);
	const taxableAmount = Math.max(0, subtotalAmount - discountAmount);
	const taxAmount = 0;
	const itemCount = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
	const now = Date.now();

	await ctx.db.patch("commerce_carts", cartId, {
		subtotalAmount,
		appliedDiscountCode: discount?.code,
		appliedDiscountDescription:
			discountEvaluation?.message ?? discount?.description,
		dynamicPricingDiscountAmount: dynamicPricing.cartDiscountAmount || undefined,
		dynamicPricingRuleIds: dynamicPricing.ruleIds?.length
			? dynamicPricing.ruleIds
			: undefined,
		dynamicPricingDescription: dynamicPricing.description,
		freeShippingByDynamicPricing: dynamicPricing.freeShipping || undefined,
		discountAmount,
		shippingAmount: 0,
		taxAmount,
		totalAmount: taxableAmount,
		itemCount,
		lastActiveAt: now,
		updatedAt: now,
	});

	await invalidateCheckoutShippingForCart(ctx, {
		cartId,
		items: pricedItems,
		appliedDiscountCode: discount?.code,
		appliedDiscountDescription:
			discountEvaluation?.message ?? discount?.description,
		dynamicPricingDiscountAmount: dynamicPricing.cartDiscountAmount || undefined,
		dynamicPricingRuleIds: dynamicPricing.ruleIds?.length
			? dynamicPricing.ruleIds
			: undefined,
		dynamicPricingDescription: dynamicPricing.description,
		freeShippingByDynamicPricing: dynamicPricing.freeShipping || undefined,
		subtotalAmount,
		discountAmount,
		itemTaxableAmount: taxableAmount,
		now,
	});
}

async function invalidateCheckoutShippingForCart(
	ctx: any,
	input: {
		cartId: any;
		items: any[];
		appliedDiscountCode?: string;
		appliedDiscountDescription?: string;
		dynamicPricingDiscountAmount?: number;
		dynamicPricingRuleIds?: any[];
		dynamicPricingDescription?: string;
		freeShippingByDynamicPricing?: boolean;
		subtotalAmount: number;
		discountAmount: number;
		itemTaxableAmount: number;
		now: number;
	},
) {
	const sessions = await ctx.db
		.query("commerce_checkout_sessions")
		.withIndex("by_cart", (q: any) => q.eq("cartId", input.cartId))
		.collect();
	const activeSessions = sessions.filter((session: any) =>
		[
			"draft",
			"collecting_shipping",
			"collecting_payment",
			"ready_for_review",
			"payment_pending",
		].includes(session.status),
	);
	if (activeSessions.length === 0) return;

	const settings = await getCommerceSettings(ctx);
	const rules = await ctx.db
		.query("commerce_tax_rules")
		.withIndex("by_active", (q: any) => q.eq("isActive", true))
		.collect();

	for (const session of activeSessions) {
		const selectedShippingMethods = await ctx.db
			.query("commerce_checkout_shipping_methods")
			.withIndex("by_checkout_status", (q: any) =>
				q.eq("checkoutSessionId", session._id).eq("status", "active"),
			)
			.collect();
		for (const method of selectedShippingMethods) {
			await ctx.db.patch("commerce_checkout_shipping_methods", method._id, {
				status: "stale",
				invalidatedAt: input.now,
				updatedAt: input.now,
			});
		}

		const quotes = await ctx.db
			.query("commerce_shipping_rate_quotes")
			.withIndex("by_checkout", (q: any) => q.eq("checkoutSessionId", session._id))
			.collect();
		for (const quote of quotes) {
			await ctx.db.delete(quote._id);
		}

		let taxAmount = 0;
		const taxAddress = session.shippingAddress ?? session.billingAddress;
		if (taxAddress) {
			const discountRatio =
				input.subtotalAmount > 0
					? Math.min(1, Math.max(0, input.discountAmount / input.subtotalAmount))
					: 0;
			const taxResult = calculateTaxForLinesFromRules(
				rules,
				taxAddress,
				input.items.map((item: any) => ({
					amount: Math.max(
						0,
						Math.round(Number(item.lineTotalAmount ?? 0) * (1 - discountRatio)),
					),
					taxClass: item.variant?.taxClass ?? item.product?.taxClass,
					taxable: true,
				})),
				{ pricesIncludeTax: Boolean(settings.pricesIncludeTax) },
			);
			taxAmount = taxResult.taxAmount;
		}

		await ctx.db.patch("commerce_checkout_sessions", session._id, {
			selectedShippingMethodCode: undefined,
			selectedShippingMethodLabel: undefined,
			appliedDiscountCode: input.appliedDiscountCode,
			appliedDiscountDescription: input.appliedDiscountDescription,
			dynamicPricingDiscountAmount: input.dynamicPricingDiscountAmount,
			dynamicPricingRuleIds: input.dynamicPricingRuleIds,
			dynamicPricingDescription: input.dynamicPricingDescription,
			freeShippingByDynamicPricing: input.freeShippingByDynamicPricing,
			subtotalAmount: input.subtotalAmount,
			discountAmount: input.discountAmount,
			shippingAmount: 0,
			taxAmount,
			totalAmount:
				input.itemTaxableAmount + (settings.pricesIncludeTax ? 0 : taxAmount),
			status: taxAddress ? "collecting_shipping" : "draft",
			updatedAt: input.now,
		});
	}
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

async function resolveContextualPrice(
	ctx: any,
	args: {
		product: any;
		variant?: any;
		cart?: any;
		quantity: number;
	},
) {
	const fallback = args.variant
		? resolveVariantActivePrice(args.variant)
		: resolveProductActivePrice(args.product);
	const now = Date.now();
	const priceSets = args.variant
		? await ctx.db
				.query("commerce_price_sets")
				.withIndex("by_variant", (q: any) => q.eq("variantId", args.variant._id))
				.collect()
		: await ctx.db
				.query("commerce_price_sets")
				.withIndex("by_product", (q: any) => q.eq("productId", args.product._id))
				.collect();

	const context = {
		currencyCode: args.cart?.currencyCode ?? args.product.basePrice?.currencyCode ?? "USD",
		regionId: args.cart?.regionId ? String(args.cart.regionId) : undefined,
		salesChannelId: args.cart?.salesChannelId ? String(args.cart.salesChannelId) : undefined,
		customerGroupId: args.cart?.customerGroupId ? String(args.cart.customerGroupId) : undefined,
		quantity: args.quantity,
	};

	const candidates: any[] = [];
	for (const priceSet of priceSets) {
		const prices = await ctx.db
			.query("commerce_prices")
			.withIndex("by_price_set", (q: any) => q.eq("priceSetId", priceSet._id))
			.collect();
		for (const price of prices) {
			if (price.status !== "active") continue;
			if (price.currencyCode !== context.currencyCode) continue;
			if (price.startsAt && price.startsAt > now) continue;
			if (price.endsAt && price.endsAt < now) continue;
			if (typeof price.minQuantity === "number" && context.quantity < price.minQuantity) continue;
			if (typeof price.maxQuantity === "number" && context.quantity > price.maxQuantity) continue;

			const rules = await ctx.db
				.query("commerce_price_rules")
				.withIndex("by_price", (q: any) => q.eq("priceId", price._id))
				.collect();
			const matches = rules.every((rule: any) => {
				const actual = (context as any)[rule.attribute];
				if (rule.operator === "eq") return actual === rule.value;
				if (rule.operator === "neq") return actual !== rule.value;
				if (rule.operator === "in") return Array.isArray(rule.value) && rule.value.includes(actual);
				if (rule.operator === "not_in") return Array.isArray(rule.value) && !rule.value.includes(actual);
				if (rule.operator === "gte") return Number(actual) >= Number(rule.value);
				if (rule.operator === "lte") return Number(actual) <= Number(rule.value);
				return false;
			});
			if (matches) candidates.push({ price, ruleCount: rules.length });
		}
	}

	if (!candidates.length) return fallback;
	candidates.sort((a: any, b: any) => {
		if (b.ruleCount !== a.ruleCount) return b.ruleCount - a.ruleCount;
		return a.price.amount - b.price.amount;
	});
	return candidates[0].price.amount;
}

async function ensureCart(ctx: any, sessionToken: string, userId?: any) {
	const sessionCart = await findCartBySession(ctx, sessionToken);
	const userCart = userId ? await findActiveCartByUser(ctx, userId) : null;

	if (sessionCart) {
		if (
			userCart &&
			sessionCart._id.toString() !== userCart._id.toString() &&
			!sessionCart.userId
		) {
			return userCart;
		}
		if (sessionCart.status === "abandoned") {
			await ctx.db.patch("commerce_carts", sessionCart._id, {
				status: "active",
				recoveredAt: Date.now(),
				updatedAt: Date.now(),
			});
			await emitEvent(ctx, CART_EVENTS.RECOVERED, SYSTEM.CART, {
				cartId: sessionCart._id,
				sessionToken,
				userId,
			});
			return ctx.db.get("commerce_carts", sessionCart._id);
		}
		if (userId && !sessionCart.userId) {
			await ctx.db.patch("commerce_carts", sessionCart._id, {
				userId,
				updatedAt: Date.now(),
			});
			return ctx.db.get("commerce_carts", sessionCart._id);
		}
		return sessionCart;
	}

	if (userCart && userCart.status !== "converted" && userCart.status !== "merged") {
		if (userCart.sessionToken !== sessionToken) {
			await ctx.db.patch("commerce_carts", userCart._id, {
				sessionToken,
				updatedAt: Date.now(),
			});
			return ctx.db.get("commerce_carts", userCart._id);
		}
		return userCart;
	}

	const settings = await getCommerceSettings(ctx);
	const defaultRegion = await ctx.db
		.query("commerce_regions")
		.withIndex("by_default", (q: any) => q.eq("isDefault", true))
		.first();
	const defaultChannel = await ctx.db
		.query("commerce_sales_channels")
		.withIndex("by_default", (q: any) => q.eq("isDefault", true))
		.first();

	const now = Date.now();
	const cartId = await ctx.db.insert("commerce_carts", {
		userId,
		sessionToken,
		status: "active",
		currencyCode: defaultRegion?.currencyCode ?? settings.currencyCode ?? "USD",
		regionId: defaultRegion?._id,
		salesChannelId: defaultChannel?._id,
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
				? await findActiveCartByUser(ctx, user._id)
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

		const nextLineKey = cartLineKey({
			productId: args.productId,
			variantId: args.variantId,
			metadata: args.metadata,
		});
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
					(args.variantId?.toString() ?? null) &&
				cartLineKey(item) === nextLineKey,
		);

		// Resolve active price with scheduled sale date awareness
		// Stock validation — respect variant-level manageStock and backorders
		const desiredQty = (existing?.quantity ?? 0) + quantity;
		const unitPriceAmount = await resolveContextualPrice(ctx, {
			product,
			variant,
			cart,
			quantity: desiredQty,
		});
		assertSufficientStock(product, variant, desiredQty);

		const now = Date.now();

		if (existing) {
			await ctx.db.patch(existing._id, {
				quantity: existing.quantity + quantity,
				baseUnitPriceAmount: unitPriceAmount,
				dynamicPricingAdjustmentAmount: undefined,
				dynamicPricingRuleIds: undefined,
				dynamicPricingDescription: undefined,
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
				baseUnitPriceAmount: unitPriceAmount,
				unitPriceAmount,
				lineTotalAmount: quantity * unitPriceAmount,
				metadata: args.metadata,
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

		const cart = await ctx.db.get(item.cartId);
		const refreshedPrice = await resolveContextualPrice(ctx, {
			product,
			variant,
			cart,
			quantity: args.quantity,
		});

		// Stock validation — respect variant-level manageStock and backorders
		assertSufficientStock(product, variant, args.quantity);

		await ctx.db.patch(args.cartItemId, {
			quantity: args.quantity,
			baseUnitPriceAmount: refreshedPrice,
			dynamicPricingAdjustmentAmount: undefined,
			dynamicPricingRuleIds: undefined,
			dynamicPricingDescription: undefined,
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

		const guestItems = await getCartItems(ctx, guestCart._id);
		const userItems = await getCartItems(ctx, userCart._id);

		for (const guestItem of guestItems) {
			const guestLineKey = cartLineKey(guestItem);
			const match = userItems.find(
				(item: any) =>
					item.productId.toString() === guestItem.productId.toString() &&
					(item.variantId?.toString() ?? null) ===
						(guestItem.variantId?.toString() ?? null) &&
					cartLineKey(item) === guestLineKey,
			);

			if (match) {
				const quantity = match.quantity + guestItem.quantity;
				const { product, variant } = await resolvePurchasableProductAndVariant(
					ctx,
					match.productId,
					match.variantId,
				);
				assertSufficientStock(product, variant, quantity);
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
export const enableSharing = mutation({
	args: shareCartArgs,
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		const user = await getCurrentUser(ctx);
		const cart = await findCartBySession(ctx, args.sessionToken);
		await assertCanMutateCart(cart, args.sessionToken, user?._id);

		const now = Date.now();
		const shareToken = cart.shareToken ?? buildShareToken();
		await ctx.db.patch("commerce_carts", cart._id, {
			shareToken,
			isShared: true,
			sharedAt: cart.sharedAt ?? now,
			shareDisabledAt: undefined,
			updatedAt: now,
		});
		await emitEvent(ctx, CART_EVENTS.SHARED, SYSTEM.CART, {
			cartId: cart._id,
			shareToken,
			userId: user?._id,
		});
		return { shareToken };
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const disableSharing = mutation({
	args: shareCartArgs,
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		const user = await getCurrentUser(ctx);
		const cart = await findCartBySession(ctx, args.sessionToken);
		await assertCanMutateCart(cart, args.sessionToken, user?._id);

		const now = Date.now();
		await ctx.db.patch("commerce_carts", cart._id, {
			isShared: false,
			shareDisabledAt: now,
			updatedAt: now,
		});
		await emitEvent(ctx, CART_EVENTS.SHARE_DISABLED, SYSTEM.CART, {
			cartId: cart._id,
			userId: user?._id,
		});
		return cart._id;
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getShared = query({
	args: getSharedCartArgs,
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		const cart = await ctx.db
			.query("commerce_carts")
			.withIndex("by_share_token", (q: any) => q.eq("shareToken", args.shareToken))
			.unique();
		if (!cart || cart.isShared !== true || cart.status !== "active") return null;

		const items = await getCartItems(ctx, cart._id);
			// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
			const enrichedItems = await Promise.all(
			items.map(async (item: any) => ({
				...item,
				product: await ctx.db.get(item.productId),
				variant: item.variantId
					? await ctx.db.get("commerce_product_variants", item.variantId)
					: null,
			})),
		);

		return {
			_id: cart._id,
			currencyCode: cart.currencyCode,
			subtotalAmount: cart.subtotalAmount,
			discountAmount: cart.discountAmount,
			totalAmount: cart.totalAmount,
			itemCount: cart.itemCount,
			sharedAt: cart.sharedAt,
			items: enrichedItems,
		};
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const copyShared = mutation({
	args: copySharedCartArgs,
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		const user = await getCurrentUser(ctx);
		const sourceCart = await ctx.db
			.query("commerce_carts")
			.withIndex("by_share_token", (q: any) => q.eq("shareToken", args.shareToken))
			.unique();
		if (!sourceCart || sourceCart.isShared !== true || sourceCart.status !== "active") {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Shared cart is no longer available.",
			});
		}

		const destinationCart = await ensureCart(ctx, args.sessionToken, user?._id);
		await assertCanMutateCart(destinationCart, args.sessionToken, user?._id);

		const sourceItems = await getCartItems(ctx, sourceCart._id);
		const destinationItems = await getCartItems(ctx, destinationCart._id);
		const now = Date.now();

		for (const sourceItem of sourceItems) {
			const { product, variant } = await resolvePurchasableProductAndVariant(
				ctx,
				sourceItem.productId,
				sourceItem.variantId,
			);
			const lineKey = cartLineKey(sourceItem);
			const existing = destinationItems.find(
				(item: any) =>
					item.productId.toString() === sourceItem.productId.toString() &&
					(item.variantId?.toString() ?? null) ===
						(sourceItem.variantId?.toString() ?? null) &&
					cartLineKey(item) === lineKey,
			);
			const nextQuantity = (existing?.quantity ?? 0) + sourceItem.quantity;
			assertSufficientStock(product, variant, nextQuantity);

			if (existing) {
				await ctx.db.patch("commerce_cart_items", existing._id, {
					quantity: nextQuantity,
					lineTotalAmount: nextQuantity * existing.unitPriceAmount,
					updatedAt: now,
				});
			} else {
				await ctx.db.insert("commerce_cart_items", {
					cartId: destinationCart._id,
					productId: sourceItem.productId,
					variantId: sourceItem.variantId,
					quantity: sourceItem.quantity,
					unitPriceAmount: sourceItem.unitPriceAmount,
					lineTotalAmount: sourceItem.lineTotalAmount,
					metadata: sourceItem.metadata,
					createdAt: now,
					updatedAt: now,
				});
			}
		}

		await recalculateCart(ctx, destinationCart._id);
		await emitEvent(ctx, CART_EVENTS.ITEM_ADDED, SYSTEM.CART, {
			cartId: destinationCart._id,
			sourceCartId: sourceCart._id,
			source: "shared_cart",
			itemsCopied: sourceItems.length,
			userId: user?._id,
		});

		return destinationCart._id;
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
