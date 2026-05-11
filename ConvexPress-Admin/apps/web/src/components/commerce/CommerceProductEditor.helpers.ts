export type VariantDraft = {
	title: string;
	sku: string;
	price: string;
	salePrice: string;
	stockQuantity: string;
	// WooCommerce-parity fields
	description: string;
	globalUniqueId: string;
	weight: string;
	shippingLengthIn: string;
	shippingWidthIn: string;
	shippingHeightIn: string;
	manageStock: "yes" | "no" | "parent";
	stockStatus: "instock" | "outofstock" | "onbackorder";
	backorders: "yes" | "no" | "notify";
	lowStockAmount: string;
	taxClass: string;
	shippingClassId: string;
	isVirtual: boolean;
	isDownloadable: boolean;
	downloadLimit: string;
	downloadExpiry: string;
	status: "publish" | "private" | "draft";
	salePriceFrom: string;
	salePriceTo: string;
	menuOrder: string;
};

export function centsToDisplay(amount?: number) {
	if (typeof amount !== "number") return "";
	return (amount / 100).toFixed(2);
}

export function displayToMoney(value: string) {
	const amount = Math.round(Number.parseFloat(value || "0") * 100);
	return {
		amount: Number.isFinite(amount) ? amount : 0,
		currencyCode: "USD",
	};
}

export function parseOptionValueInput(value: string) {
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
		.filter((entry, index, array) => array.indexOf(entry) === index);
}

export function buildVariantDraft(variant: {
	title?: string;
	sku?: string;
	price?: { amount?: number };
	salePrice?: { amount?: number } | null;
	stockQuantity?: number;
	description?: string;
	globalUniqueId?: string;
	weight?: string;
	shippingLengthIn?: string;
	shippingWidthIn?: string;
	shippingHeightIn?: string;
	manageStock?: "yes" | "no" | "parent";
	stockStatus?: "instock" | "outofstock" | "onbackorder";
	backorders?: "yes" | "no" | "notify";
	lowStockAmount?: number;
	taxClass?: string;
	shippingClassId?: string;
	isVirtual?: boolean;
	isDownloadable?: boolean;
	downloadLimit?: number;
	downloadExpiry?: number;
	status?: "publish" | "private" | "draft";
	salePriceFrom?: number;
	salePriceTo?: number;
	menuOrder?: number;
}): VariantDraft {
	return {
		title: variant.title ?? "",
		sku: variant.sku ?? "",
		price: centsToDisplay(variant.price?.amount),
		salePrice: centsToDisplay(variant.salePrice?.amount),
		stockQuantity:
			typeof variant.stockQuantity === "number"
				? String(variant.stockQuantity)
				: "",
		description: variant.description ?? "",
		globalUniqueId: variant.globalUniqueId ?? "",
		weight: variant.weight ?? "",
		shippingLengthIn: variant.shippingLengthIn ?? "",
		shippingWidthIn: variant.shippingWidthIn ?? "",
		shippingHeightIn: variant.shippingHeightIn ?? "",
		manageStock: variant.manageStock ?? "parent",
		stockStatus: variant.stockStatus ?? "instock",
		backorders: variant.backorders ?? "no",
		lowStockAmount:
			typeof variant.lowStockAmount === "number"
				? String(variant.lowStockAmount)
				: "",
		taxClass: variant.taxClass ?? "",
		shippingClassId: variant.shippingClassId ?? "",
		isVirtual: variant.isVirtual ?? false,
		isDownloadable: variant.isDownloadable ?? false,
		downloadLimit:
			typeof variant.downloadLimit === "number"
				? String(variant.downloadLimit)
				: "",
		downloadExpiry:
			typeof variant.downloadExpiry === "number"
				? String(variant.downloadExpiry)
				: "",
		status: variant.status ?? "publish",
		salePriceFrom: variant.salePriceFrom
			? new Date(variant.salePriceFrom).toISOString().slice(0, 16)
			: "",
		salePriceTo: variant.salePriceTo
			? new Date(variant.salePriceTo).toISOString().slice(0, 16)
			: "",
		menuOrder:
			typeof variant.menuOrder === "number" ? String(variant.menuOrder) : "",
	};
}

export function getProductTypeLabel(productType?: string, variantCount = 0) {
	return productType === "variable" || variantCount > 0 ? "Variable" : "Simple";
}

/**
 * Count how many existing variants use a given option type in their selections.
 */
export function countVariantsUsingOptionType(
	variants: Array<{ selections?: Array<{ optionTypeId?: string }> }>,
	optionTypeId: string,
): number {
	return variants.filter((variant) =>
		(variant.selections ?? []).some(
			(selection) => selection.optionTypeId === optionTypeId,
		),
	).length;
}

/**
 * Build an option summary string from selected option type/value pairs.
 * For example: [{ optionTypeName: "Size", optionValueLabel: "Large" }, ...] => "Large / Red"
 */
export function buildOptionSummaryFromPairs(
	pairs: Array<{ optionTypeName: string; optionValueLabel: string }>,
): string {
	if (pairs.length === 0) return "";
	return pairs.map((pair) => pair.optionValueLabel).join(" / ");
}

export type BulkEditFields = {
	price: string;
	salePrice: string;
	skuPrefix: string;
	stockQuantity: string;
};

/**
 * Build the initial empty bulk-edit state.
 */
export function emptyBulkEditFields(): BulkEditFields {
	return { price: "", salePrice: "", skuPrefix: "", stockQuantity: "" };
}

/**
 * Apply bulk-edit values to a set of variant drafts.
 * Only non-empty fields are applied. skuPrefix replaces the SKU entirely.
 * Returns a new draft map.
 */
export function applyBulkEditToVariants(
	drafts: Record<string, VariantDraft>,
	variantIds: string[],
	bulk: BulkEditFields,
): Record<string, VariantDraft> {
	const next = { ...drafts };
	for (const id of variantIds) {
		const current = next[id];
		if (!current) continue;
		next[id] = {
			...current,
			...(bulk.price.trim() ? { price: bulk.price.trim() } : {}),
			...(bulk.salePrice.trim() ? { salePrice: bulk.salePrice.trim() } : {}),
			...(bulk.skuPrefix.trim() ? { sku: bulk.skuPrefix.trim() } : {}),
			...(bulk.stockQuantity.trim()
				? { stockQuantity: bulk.stockQuantity.trim() }
				: {}),
		};
	}
	return next;
}
