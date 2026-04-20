export type CartLineMetadata = {
  lineType?: string;
  bundleName?: string;
  variantTitle?: string;
  optionSummary?: string;
  variantSku?: string;
  selections?: Array<{
    componentId: string;
    componentLabel?: string;
    productTitle: string;
    quantity: number;
  }>;
};

export type CartLineProduct = {
  title?: string;
  sku?: string;
};

export function getCartLineTitle(
  product: CartLineProduct | null | undefined,
  metadata?: CartLineMetadata,
) {
  if (metadata?.lineType === "bundle") {
    return metadata.bundleName ?? product?.title ?? "Bundle";
  }

  return product?.title ?? "Product";
}

export function getCartLineSubtitle(metadata?: CartLineMetadata) {
  if (metadata?.lineType === "bundle") {
    return null;
  }

  if (metadata?.optionSummary) return metadata.optionSummary;
  if (metadata?.variantTitle) return metadata.variantTitle;
  return null;
}

export function getCartLineBundleSelections(metadata?: CartLineMetadata) {
  if (metadata?.lineType !== "bundle") return [];
  return metadata.selections ?? [];
}

export function getCartLineSku(
  product: CartLineProduct | null | undefined,
  metadata?: CartLineMetadata,
) {
  if (metadata?.lineType === "bundle") return null;
  return metadata?.variantSku ?? product?.sku ?? null;
}
