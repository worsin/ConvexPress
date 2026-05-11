export type ProductOptionType = {
	id: string;
	name: string;
	values?: Array<{ id: string; label: string }>;
};

export type ProductVariantSelection = {
	optionTypeId: string;
	optionValueId: string;
	optionValueLabel?: string;
};

export type ProductVariant = {
	_id: string;
	title: string;
	sku?: string;
	optionSummary?: string;
	stockQuantity?: number;
	isDefault?: boolean;
	featuredMediaId?: string;
	price?: { amount: number };
	salePrice?: { amount: number };
	selections?: ProductVariantSelection[];
	stockStatus?: "instock" | "outofstock" | "onbackorder";
	backorders?: "yes" | "no" | "notify";
	description?: string;
	salePriceFrom?: number;
	salePriceTo?: number;
	manageStock?: "yes" | "no" | "parent";
	status?: string;
};

export function getInitialSelectedOptions(
	variant: ProductVariant | null | undefined,
) {
	if (!variant?.selections?.length) return {};
	return Object.fromEntries(
		variant.selections.map((selection) => [
			selection.optionTypeId,
			selection.optionValueId,
		]),
	);
}

export function findMatchingVariant(
	optionTypes: ProductOptionType[],
	variants: ProductVariant[],
	selectedOptions: Record<string, string>,
) {
	return (
		variants.find(
			(variant) =>
				(variant.selections ?? []).every(
					(selection) =>
						selectedOptions[selection.optionTypeId] === selection.optionValueId,
				) && (variant.selections ?? []).length === optionTypes.length,
		) ?? null
	);
}

export function isOptionValueEnabled(
	optionTypeId: string,
	optionValueId: string,
	selectedOptions: Record<string, string>,
	variants: ProductVariant[],
) {
	return variants.some(
		(variant) =>
			(variant.selections ?? []).some(
				(selection) =>
					selection.optionTypeId === optionTypeId &&
					selection.optionValueId === optionValueId,
			) &&
			Object.entries(selectedOptions).every(
				([selectedTypeId, selectedValueId]) =>
					selectedTypeId === optionTypeId
						? true
						: (variant.selections ?? []).some(
								(selection) =>
									selection.optionTypeId === selectedTypeId &&
									selection.optionValueId === selectedValueId,
							),
			),
	);
}
