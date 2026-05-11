/**
 * Standardized label fallback for variant display across all customer surfaces.
 *
 * Fallback order: optionSummary -> title -> name -> sku
 */
export function getVariantLabel(
	variant:
		| {
				optionSummary?: string;
				title?: string;
				name?: string;
				sku?: string;
		  }
		| null
		| undefined,
): string | null {
	return (
		variant?.optionSummary ??
		variant?.title ??
		variant?.name ??
		variant?.sku ??
		null
	);
}
