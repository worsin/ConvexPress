import { resolveStockPolicy } from "@/templates/sdk/block-data/portable/commerceInventory";
/**
 * Everything a product page needs to decide, independent of how it is laid
 * out: variant selection, effective price, stock, gallery and add-to-cart.
 * The five product layouts render from this one state.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { isPublicVariant, type PriceAmount } from "@/templates/sdk/block-data/portable/commercePricing";
import { productPricing, productPriceInputs } from "./productPricing";
import { usePriceTime } from "./usePriceTime";

import { useSettings } from "@/contexts/SettingsContext";
import { useCart } from "@/hooks/useCart";
import { useProductAccess } from "@/hooks/useProductAccess";
import { formatMoney } from "@/lib/commerce/format";
import {
  findMatchingVariant,
  getInitialSelectedOptions,
  getLinkedSelectedOptions,
  getNextSelectedOptions,
} from "@/routes/_marketing/products/-variantSelection";

export interface ProductVariant {
  _id: string;
  title: string;
  sku?: string;
  optionSummary?: string;
  stockQuantity?: number;
  isDefault?: boolean;
  featuredMediaId?: string;
  price?: PriceAmount;
  salePrice?: PriceAmount;
  selections?: Array<{ optionTypeId: string; optionValueId: string; optionValueLabel: string }>;
  stockStatus?: "instock" | "outofstock" | "onbackorder";
  backorders?: "yes" | "no" | "notify";
  description?: string;
  salePriceFrom?: number;
  salePriceTo?: number;
  manageStock?: "yes" | "no" | "parent";
  status?: string;
}

export interface ProductDetail {
  _id: string;
  title: string;
  slug: string;
  description?: string;
  excerpt?: string;
  productType?: "simple" | "variable" | "external";
  displayPrice?: number;
  basePrice?: PriceAmount;
  salePrice?: PriceAmount;
  salePriceFrom?: number;
  salePriceTo?: number;
  pricedAt?: number;
  compareAtPrice?: number;
  featuredMediaId?: string;
  galleryMediaIds?: string[];
  sku?: string;
  stockQuantity?: number;
  trackInventory?: boolean;
  allowBackorders?: boolean;
  isVirtual?: boolean;
  isDownloadable?: boolean;
  categories?: Array<{ _id: string; name: string; slug: string }>;
  attributes?: Record<string, unknown> | null;
  optionTypes?: Array<{ id: string; name: string; values?: Array<{ id: string; label: string }> }>;
  variants?: ProductVariant[];
}

export function useProductPage(product: ProductDetail | null, optionHint?: {optionType?:string;optionValue?:string}) {
  const settings = useSettings();
  const currency = settings?.commerceConfig?.currencyCode || "USD";
  const cart = useCart();
  const access = useProductAccess(product?._id ?? undefined);

  const optionTypes = product?.optionTypes ?? [];
  const variants = useMemo(() => (product?.variants ?? []).filter(isPublicVariant), [product?.variants]);
  const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0] ?? null;
  const isVariable = product?.productType === "variable";
  const priceInputs = useMemo(() => productPriceInputs(product, variants), [product, variants]);
  const priceTime = usePriceTime(priceInputs, product?.pricedAt);

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);

  useEffect(() => {
    if (!product || !isVariable) { setSelectedOptions({}); return; }
    setSelectedOptions(getLinkedSelectedOptions(product.optionTypes ?? [], variants, optionHint) ?? getInitialSelectedOptions(defaultVariant));
  }, [defaultVariant, isVariable, product, variants, optionHint?.optionType, optionHint?.optionValue]);

  const selectedVariant = useMemo(() => {
    if (!product || !isVariable) return null;
    return findMatchingVariant(optionTypes, variants, selectedOptions);
  }, [isVariable, optionTypes, product, selectedOptions, variants]);

  const currentVariant = selectedVariant ?? defaultVariant;
  const requiresSelection = isVariable && !selectedVariant;
  const stock = resolveStockPolicy(product ?? {}, currentVariant);
  const {stockStatus, backorders} = stock;
  const outOfStock = stockStatus === "outofstock";
  const { price, regularPrice, showCompare, priceRange } = productPricing(product, currentVariant, variants, isVariable, priceTime);

  const gallery = useMemo(() => {
    const ids = [currentVariant?.featuredMediaId, product?.featuredMediaId, ...(product?.galleryMediaIds ?? [])].filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    return [...new Set(ids)];
  }, [currentVariant?.featuredMediaId, product?.featuredMediaId, product?.galleryMediaIds]);

  // Selecting a variant with its own photo jumps the gallery to it.
  useEffect(() => {
    setActiveMediaId(currentVariant?.featuredMediaId ?? null);
  }, [currentVariant?.featuredMediaId]);

  const displayMediaId = activeMediaId && gallery.includes(activeMediaId) ? activeMediaId : (gallery[0] ?? null);

  const optionEnabled = useCallback(
    (optionTypeId: string, optionValueId: string) =>
      !isVariable || getLinkedSelectedOptions(optionTypes, variants, {optionType:optionTypeId,optionValue:optionValueId}) !== null,
    [isVariable, optionTypes, variants],
  );

  const selectOption = useCallback((optionTypeId: string, optionValueId: string) => {
    setSelectedOptions((current) => getNextSelectedOptions(optionTypes, variants, current, optionTypeId, optionValueId) ?? current);
  }, [optionTypes, variants]);

  const addToCart = useCallback(async () => {
    if (!product || requiresSelection || outOfStock || price === undefined || access.isLoading || !access.allowed) return false;
    return cart.add(product._id, {
      variantId: isVariable ? selectedVariant?._id : undefined,
      quantity,
      label: product.title,
    });
  }, [access.allowed, access.isLoading, cart, isVariable, outOfStock, price, product, quantity, requiresSelection, selectedVariant?._id]);

  const priceLabel = (() => {
    if (requiresSelection && priceRange) {
      return priceRange.min === priceRange.max
        ? formatMoney(priceRange.min, currency)
        : `${formatMoney(priceRange.min, currency)} – ${formatMoney(priceRange.max, currency)}`;
    }
    return typeof price === "number" ? formatMoney(price, currency) : "Price unavailable";
  })();

  const inCart = product ? cart.lineByProduct.get(product._id) : undefined;

  return {
    currency,
    cart,
    access,
    isVariable,
    optionTypes,
    variants,
    selectedOptions,
    selectedVariant,
    currentVariant,
    requiresSelection,
    stockStatus,
    backorders,
    outOfStock,
    price,
    priceLabel,
    regularPrice,
    showCompare,
    gallery,
    displayMediaId,
    setActiveMediaId,
    optionEnabled,
    selectOption,
    quantity,
    setQuantity,
    addToCart,
    inCart,
    busy: cart.busyProductId === product?._id || !cart.isReady || access.isLoading || price === undefined,
    sku: currentVariant?.sku ?? product?.sku,
    stockQuantity: stock.tracked ? stock.available : undefined,
  };
}

export type ProductPageState = ReturnType<typeof useProductPage>;
