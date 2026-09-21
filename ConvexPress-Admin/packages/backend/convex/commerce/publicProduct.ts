/** Explicit storefront projection. Admin import metadata, inventory audit rows,
 * ownership and fulfillment/license configuration never cross this boundary. */
import { isPublicVariant, resolvePrice } from "./activePrice";
import type { GenericId as Id } from "convex/values";
import type { PriceAmount, SaleWindow } from "./activePrice";
// Structural inputs deliberately avoid recursively expanding the full backend
// schema through public query inference. They are checked at the call boundary.
type VariantInput = SaleWindow & {
  _id: Id<"commerce_product_variants">; title: string; sku?: string; optionSummary: string;
  price: PriceAmount; salePrice?: PriceAmount;
  selections?: { optionTypeId: string; optionValueId: string; optionValueLabel: string }[];
  featuredMediaId?: Id<"media">; galleryMediaIds?: Id<"media">[];
  stockQuantity?: number; stockStatus?: "instock" | "outofstock" | "onbackorder";
  backorders?: "yes" | "no" | "notify"; manageStock?: "yes" | "no" | "parent";
  description?: string; isDefault: boolean; status?: "publish" | "private" | "draft";
};
type ProductInput = SaleWindow & {
  _id: Id<"commerce_products">; title: string; slug: string; excerpt?: string; description?: string;
  productType: string; sku?: string; basePrice: PriceAmount; salePrice?: PriceAmount;
  displayPrice?: number; featuredMediaId?: Id<"media">; galleryMediaIds: Id<"media">[];
  categories: { _id: Id<"commerce_product_categories">; name: string; slug: string; isVisible?: boolean }[];
  trackInventory: boolean; stockQuantity?: number; allowBackorders: boolean;
  isVirtual: boolean; isDownloadable: boolean; optionTypes?: unknown;
};

type PublicVariant = VariantInput;
type PublicOptionType = { id: string; name: string; values: { id: string; label: string }[] };
type PublicProductSummary = Omit<ProductInput, "description" | "optionTypes" | "categories"> & {
  categories: { _id: Id<"commerce_product_categories">; name: string; slug: string }[];
  compareAtPrice?: number; pricedAt: number;
};
type PublicProductDetail = PublicProductSummary & { description?: string; variants: PublicVariant[]; optionTypes: PublicOptionType[] };
export function publicVariant(variant: VariantInput): PublicVariant {
  return {
    _id: variant._id, title: variant.title, sku: variant.sku, optionSummary: variant.optionSummary,
    price: variant.price, salePrice: variant.salePrice, salePriceFrom: variant.salePriceFrom, salePriceTo: variant.salePriceTo,
    selections: variant.selections?.map(({ optionTypeId, optionValueId, optionValueLabel }) => ({ optionTypeId, optionValueId, optionValueLabel })),
    featuredMediaId: variant.featuredMediaId, galleryMediaIds: variant.galleryMediaIds,
    stockQuantity: variant.stockQuantity, stockStatus: variant.stockStatus, backorders: variant.backorders,
    manageStock: variant.manageStock, description: variant.description, isDefault: variant.isDefault, status: variant.status,
  };
}
function publicOptionTypes(value: unknown, variants: PublicVariant[]): PublicOptionType[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(option => {
    if (!option || typeof option !== "object" || typeof option.id !== "string" || typeof option.name !== "string" || !Array.isArray(option.values)) return [];
    const allowed = new Set(variants.flatMap(variant => (variant.selections ?? []).filter(selection => selection.optionTypeId === option.id).map(selection => selection.optionValueId)));
    return [{ id: option.id, name: option.name, values: option.values.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object" || !("id" in entry) || !("label" in entry) || typeof entry.id !== "string" || typeof entry.label !== "string" || !allowed.has(entry.id)) return [];
      return [{ id: entry.id, label: entry.label }];
    }) }];
  });
}
export function publicProductSummary(product: ProductInput, now = Date.now()): PublicProductSummary {
  const decision = resolvePrice(product.basePrice, product.salePrice, product, now);
  return {
    _id: product._id, title: product.title, slug: product.slug, excerpt: product.excerpt,
    productType: product.productType, sku: product.sku, basePrice: product.basePrice,
    salePrice: product.salePrice, salePriceFrom: product.salePriceFrom, salePriceTo: product.salePriceTo,
    displayPrice: product.productType === "variable" ? product.displayPrice : decision.amount,
    compareAtPrice: product.productType !== "variable" && decision.amount < product.basePrice.amount ? product.basePrice.amount : undefined,
    pricedAt: now, featuredMediaId: product.featuredMediaId, galleryMediaIds: product.galleryMediaIds,
    categories: product.categories.filter(category => category.isVisible !== false).map(category => ({ _id: category._id, name: category.name, slug: category.slug })),
    trackInventory: product.trackInventory, stockQuantity: product.stockQuantity, allowBackorders: product.allowBackorders,
    isVirtual: product.isVirtual, isDownloadable: product.isDownloadable,
  };
}
export function publicProductDetail(product: ProductInput & { variants: VariantInput[] }, now = Date.now()): PublicProductDetail {
  const variants = product.variants.filter(isPublicVariant).map(publicVariant);
  return { ...publicProductSummary(product, now), description: product.description, variants, optionTypes: publicOptionTypes(product.optionTypes, variants) };
}
