import { effectiveStockMode, type ProductStock } from "@convexpress-admin/backend/canonical-blocks-foundation/commerceInventory";
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
}, product: ProductStock = {}): VariantDraft {
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
		manageStock: effectiveStockMode(product, variant),
		stockStatus: variant.stockStatus ?? "instock",
		backorders: variant.backorders ?? (variant.manageStock === undefined && product.allowBackorders ? "yes" : "no"),
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
		salePriceFrom: formatSaleDateLocal(variant.salePriceFrom),
		salePriceTo: formatSaleDateLocal(variant.salePriceTo),
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

/** datetime-local contains computer-local wall time, never UTC text. Keep
 * seconds/milliseconds so opening an existing schedule does not truncate it. */
export function formatSaleDateLocal(time: number | undefined): string {
  if (time === undefined || !Number.isFinite(time)) return "";
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  const minute = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (!date.getSeconds() && !date.getMilliseconds()) return minute;
  const seconds = `${minute}:${pad(date.getSeconds())}`;
  return date.getMilliseconds() ? `${seconds}.${pad(date.getMilliseconds(), 3).replace(/0+$/, "")}` : seconds;
}
/** Omission preserves the original instant, including a DST repeated hour. */
export function saleDateChange(value: string, original: number | undefined): number | null | undefined {
  if (value === formatSaleDateLocal(original)) return undefined;
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error("Choose a valid sale date.");
  return time;
}
