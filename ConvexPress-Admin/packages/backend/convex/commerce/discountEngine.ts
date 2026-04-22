type DiscountType = "fixed_cart" | "percent" | "fixed_product";

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
	minimumQuantity?: number;
	applicability?: "cart" | "matching_items";
	productIds?: string[];
	categoryIds?: string[];
	excludedProductIds?: string[];
	excludedCategoryIds?: string[];
	tiers?: DiscountTier[];
	maxDiscountAmount?: number;
};

export type DiscountLineItem = {
	productId: string;
	variantId?: string;
	quantity: number;
	lineTotalAmount: number;
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

	const matchingItems = items.filter((item) => itemMatchesRule(item, discount));
	const matchingSubtotalAmount = matchingItems.reduce(
		(sum, item) => sum + Math.max(0, item.lineTotalAmount),
		0,
	);
	const matchingQuantity = matchingItems.reduce(
		(sum, item) => sum + Math.max(0, item.quantity),
		0,
	);
	const cartSubtotalAmount = items.reduce(
		(sum, item) => sum + Math.max(0, item.lineTotalAmount),
		0,
	);
	const cartQuantity = items.reduce(
		(sum, item) => sum + Math.max(0, item.quantity),
		0,
	);
	const appliesToCart = discount.applicability === "cart";
	const eligibleSubtotalAmount = appliesToCart
		? cartSubtotalAmount
		: matchingSubtotalAmount;
	const eligibleQuantity = appliesToCart ? cartQuantity : matchingQuantity;

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
