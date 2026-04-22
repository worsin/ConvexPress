type DiscountType = "fixed_cart" | "percent" | "fixed_product" | "free_shipping";

export type DiscountTier = {
	label?: string;
	minQuantity?: number;
	minSubtotalAmount?: number;
	discountType: DiscountType;
	amount: number;
};

export type DiscountRule = {
	code?: string;
	description?: string;
	discountType: DiscountType;
	amount: number;
	minimumSubtotalAmount?: number;
	maximumSubtotalAmount?: number;
	minimumQuantity?: number;
	applicability?: "cart" | "matching_items";
	productIds?: string[];
	categoryIds?: string[];
	excludedProductIds?: string[];
	excludedCategoryIds?: string[];
	tiers?: DiscountTier[];
	maxDiscountAmount?: number;
	// Wave 11.7 parity fields
	allowedEmails?: string[];
	newCustomersOnly?: boolean;
	individualUse?: boolean;
	excludeSaleItems?: boolean;
	perUserUsageLimit?: number;
};

export type DiscountLineItem = {
	productId: string;
	variantId?: string;
	quantity: number;
	lineTotalAmount: number;
	onSale?: boolean;
	product?: {
		_id?: string;
		categoryIds?: string[];
	};
};

export type DiscountEvaluation = {
	eligible: boolean;
	discountAmount: number;
	eligibleSubtotalAmount: number;
	eligibleQuantity: number;
	appliedTier?: DiscountTier;
	message?: string;
	/**
	 * Free-shipping discounts don't reduce the cart subtotal; instead they
	 * suppress the shipping line. Callers (checkout) honor this flag.
	 */
	suppressShipping?: boolean;
};

/**
 * Context passed by the cart / checkout layer to enforce user-scoped rules
 * (newCustomersOnly / allowedEmails / perUserUsageLimit). Optional —
 * when omitted, these checks are skipped (backwards compat).
 */
export type DiscountUserContext = {
	userId?: string;
	email?: string;
	priorOrderCount?: number;
	priorCodeUsageCount?: number;
};

function idString(value: unknown) {
	return value?.toString?.() ?? String(value ?? "");
}

function normalizeIdSet(values?: unknown[]) {
	const ids = (values ?? []).map(idString).filter(Boolean);
	return ids.length > 0 ? new Set(ids) : null;
}

function itemCategoryIds(item: DiscountLineItem) {
	return (item.product?.categoryIds ?? []).map(idString).filter(Boolean);
}

function itemMatchesRule(item: DiscountLineItem, discount: DiscountRule) {
	const productIds = normalizeIdSet(discount.productIds);
	const categoryIds = normalizeIdSet(discount.categoryIds);
	const excludedProductIds = normalizeIdSet(discount.excludedProductIds);
	const excludedCategoryIds = normalizeIdSet(discount.excludedCategoryIds);
	const productId = idString(item.productId);
	const categories = itemCategoryIds(item);

	if (excludedProductIds?.has(productId)) return false;
	if (
		excludedCategoryIds &&
		categories.some((id) => excludedCategoryIds.has(id))
	) {
		return false;
	}
	if (productIds && !productIds.has(productId)) return false;
	if (categoryIds && !categories.some((id) => categoryIds.has(id)))
		return false;
	return true;
}

function selectBestTier(
	tiers: DiscountTier[] | undefined,
	eligibleQuantity: number,
	eligibleSubtotalAmount: number,
) {
	const matching = (tiers ?? []).filter((tier) => {
		if (
			typeof tier.minQuantity === "number" &&
			eligibleQuantity < tier.minQuantity
		) {
			return false;
		}
		if (
			typeof tier.minSubtotalAmount === "number" &&
			eligibleSubtotalAmount < tier.minSubtotalAmount
		) {
			return false;
		}
		return true;
	});

	return matching.sort((a, b) => {
		const quantityDelta = (b.minQuantity ?? 0) - (a.minQuantity ?? 0);
		if (quantityDelta !== 0) return quantityDelta;
		return (b.minSubtotalAmount ?? 0) - (a.minSubtotalAmount ?? 0);
	})[0];
}

function computeAmount(
	discountType: DiscountType,
	amount: number,
	eligibleSubtotalAmount: number,
	eligibleQuantity: number,
) {
	if (eligibleSubtotalAmount <= 0 || amount <= 0) return 0;

	if (discountType === "percent") {
		return Math.round((eligibleSubtotalAmount * amount) / 100);
	}
	if (discountType === "fixed_product") {
		return amount * eligibleQuantity;
	}
	return amount;
}

export function evaluateDiscount(
	discount: DiscountRule | null | undefined,
	items: DiscountLineItem[],
	userContext?: DiscountUserContext,
): DiscountEvaluation {
	if (!discount) {
		return {
			eligible: false,
			discountAmount: 0,
			eligibleSubtotalAmount: 0,
			eligibleQuantity: 0,
			message: "Discount code is unavailable.",
		};
	}

	// Wave 11.7: user-scoped gates. Skip any check the caller didn't provide
	// context for.
	if (
		discount.newCustomersOnly &&
		typeof userContext?.priorOrderCount === "number" &&
		userContext.priorOrderCount > 0
	) {
		return {
			eligible: false,
			discountAmount: 0,
			eligibleSubtotalAmount: 0,
			eligibleQuantity: 0,
			message: "This discount is only for new customers.",
		};
	}

	if (
		discount.allowedEmails &&
		discount.allowedEmails.length > 0 &&
		userContext?.email &&
		!discount.allowedEmails.some(
			(e) => e.trim().toLowerCase() === userContext.email!.trim().toLowerCase(),
		)
	) {
		return {
			eligible: false,
			discountAmount: 0,
			eligibleSubtotalAmount: 0,
			eligibleQuantity: 0,
			message: "This discount is not available for your account.",
		};
	}

	if (
		typeof discount.perUserUsageLimit === "number" &&
		typeof userContext?.priorCodeUsageCount === "number" &&
		userContext.priorCodeUsageCount >= discount.perUserUsageLimit
	) {
		return {
			eligible: false,
			discountAmount: 0,
			eligibleSubtotalAmount: 0,
			eligibleQuantity: 0,
			message: "You've reached the maximum uses for this discount.",
		};
	}

	// Wave 11.7: excludeSaleItems filters out on-sale lines before matching.
	const effectiveItems = discount.excludeSaleItems
		? items.filter((item) => !item.onSale)
		: items;

	const matchingItems = effectiveItems.filter((item) =>
		itemMatchesRule(item, discount),
	);
	const matchingSubtotalAmount = matchingItems.reduce(
		(sum, item) => sum + Math.max(0, item.lineTotalAmount),
		0,
	);
	const matchingQuantity = matchingItems.reduce(
		(sum, item) => sum + Math.max(0, item.quantity),
		0,
	);
	const cartSubtotalAmount = effectiveItems.reduce(
		(sum, item) => sum + Math.max(0, item.lineTotalAmount),
		0,
	);
	const cartQuantity = effectiveItems.reduce(
		(sum, item) => sum + Math.max(0, item.quantity),
		0,
	);
	const appliesToCart = discount.applicability === "cart";
	const eligibleSubtotalAmount = appliesToCart
		? cartSubtotalAmount
		: matchingSubtotalAmount;
	const eligibleQuantity = appliesToCart ? cartQuantity : matchingQuantity;

	// Wave 11.7: free_shipping type short-circuits — doesn't touch subtotal.
	if (discount.discountType === "free_shipping") {
		if (
			typeof discount.minimumSubtotalAmount === "number" &&
			cartSubtotalAmount < discount.minimumSubtotalAmount
		) {
			return {
				eligible: false,
				discountAmount: 0,
				eligibleSubtotalAmount: cartSubtotalAmount,
				eligibleQuantity: cartQuantity,
				message: "Cart subtotal does not meet this free-shipping threshold.",
			};
		}
		if (
			typeof discount.maximumSubtotalAmount === "number" &&
			cartSubtotalAmount > discount.maximumSubtotalAmount
		) {
			return {
				eligible: false,
				discountAmount: 0,
				eligibleSubtotalAmount: cartSubtotalAmount,
				eligibleQuantity: cartQuantity,
				message: "Cart subtotal exceeds this free-shipping cap.",
			};
		}
		return {
			eligible: true,
			discountAmount: 0,
			eligibleSubtotalAmount: cartSubtotalAmount,
			eligibleQuantity: cartQuantity,
			suppressShipping: true,
			message: discount.description ?? "Free shipping applied.",
		};
	}

	if (matchingItems.length === 0) {
		return {
			eligible: false,
			discountAmount: 0,
			eligibleSubtotalAmount: matchingSubtotalAmount,
			eligibleQuantity: matchingQuantity,
			message: "No cart items qualify for this discount.",
		};
	}

	if (
		typeof discount.minimumSubtotalAmount === "number" &&
		matchingSubtotalAmount < discount.minimumSubtotalAmount
	) {
		return {
			eligible: false,
			discountAmount: 0,
			eligibleSubtotalAmount: matchingSubtotalAmount,
			eligibleQuantity: matchingQuantity,
			message: "Cart subtotal does not meet this discount threshold.",
		};
	}

	// Wave 11.7: maximum-subtotal cap.
	if (
		typeof discount.maximumSubtotalAmount === "number" &&
		matchingSubtotalAmount > discount.maximumSubtotalAmount
	) {
		return {
			eligible: false,
			discountAmount: 0,
			eligibleSubtotalAmount: matchingSubtotalAmount,
			eligibleQuantity: matchingQuantity,
			message: "Cart subtotal exceeds this discount cap.",
		};
	}

	if (
		typeof discount.minimumQuantity === "number" &&
		matchingQuantity < discount.minimumQuantity
	) {
		return {
			eligible: false,
			discountAmount: 0,
			eligibleSubtotalAmount: matchingSubtotalAmount,
			eligibleQuantity: matchingQuantity,
			message: "Cart quantity does not meet this discount threshold.",
		};
	}

	const appliedTier = selectBestTier(
		discount.tiers,
		matchingQuantity,
		matchingSubtotalAmount,
	);
	if ((discount.tiers?.length ?? 0) > 0 && !appliedTier) {
		return {
			eligible: false,
			discountAmount: 0,
			eligibleSubtotalAmount: matchingSubtotalAmount,
			eligibleQuantity: matchingQuantity,
			message: "Cart does not meet any discount tier.",
		};
	}

	const discountType = appliedTier?.discountType ?? discount.discountType;
	const amount = appliedTier?.amount ?? discount.amount;
	const uncapped = computeAmount(
		discountType,
		amount,
		eligibleSubtotalAmount,
		eligibleQuantity,
	);
	const maxDiscount =
		typeof discount.maxDiscountAmount === "number"
			? Math.max(0, discount.maxDiscountAmount)
			: eligibleSubtotalAmount;
	const discountAmount = Math.min(
		eligibleSubtotalAmount,
		maxDiscount,
		uncapped,
	);

	return {
		eligible: discountAmount > 0,
		discountAmount,
		eligibleSubtotalAmount,
		eligibleQuantity,
		appliedTier,
		message:
			appliedTier?.label ??
			discount.description ??
			(discountAmount > 0 ? "Discount applied." : "Discount amount is zero."),
	};
}

/**
 * Wave 11.7: enforcing individualUse across multiple applied codes.
 *
 * Returns the subset of `discounts` that can coexist on the same cart.
 * Rules:
 *   - If any discount has `individualUse: true`, only that discount can apply
 *     (highest discountAmount wins).
 *   - Otherwise all eligible discounts stack (caller handles stacking math).
 */
export function filterForIndividualUse<
	T extends { individualUse?: boolean; discountAmount: number },
>(candidates: T[]): T[] {
	const individualUses = candidates.filter((c) => c.individualUse);
	if (individualUses.length === 0) return candidates;
	const best = individualUses.reduce((a, b) =>
		b.discountAmount > a.discountAmount ? b : a,
	);
	return [best];
}

