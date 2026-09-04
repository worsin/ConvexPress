/**
 * Everything a product page needs to decide, independent of how it is laid
 * out: variant selection, effective price, stock, gallery and add-to-cart.
 * The five product layouts render from this one state.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useSettings } from "@/contexts/SettingsContext";
import { useCart } from "@/hooks/useCart";
import { useProductAccess } from "@/hooks/useProductAccess";
import { formatMoney } from "@/lib/commerce/format";
import {
  findMatchingVariant,
  getInitialSelectedOptions,
  isOptionValueEnabled,
} from "@/routes/_marketing/products/-variantSelection";

export interface ProductVariant {
  _id: string;
  title: string;
  sku?: string;
  optionSummary?: string;
  stockQuantity?: number;
  isDefault?: boolean;
  featuredMediaId?: string;
  price?: { amount: number };
  salePrice?: { amount: number };
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
  compareAtPrice?: number;
  featuredMediaId?: string;
  galleryMediaIds?: string[];
  sku?: string;
  stockQuantity?: number;
  trackInventory?: boolean;
  isVirtual?: boolean;
  isDownloadable?: boolean;
  categories?: Array<{ _id: string; name: string; slug: string }>;
  attributes?: Record<string, unknown> | null;
  optionTypes?: Array<{ id: string; name: string; values?: Array<{ id: string; label: string }> }>;
  variants?: ProductVariant[];
}

function isVariantOnSale(variant: Pick<ProductVariant, "salePrice" | "salePriceFrom" | "salePriceTo"> | null | undefined): boolean {
  if (!variant?.salePrice?.amount) return false;
  const now = Date.now();
  if (variant.salePriceFrom && variant.salePriceFrom > now) return false;
  if (variant.salePriceTo && variant.salePriceTo < now) return false;
  return true;
}

export function useProductPage(product: ProductDetail | null) {
  const settings = useSettings();
  const currency = settings?.commerceConfig?.currencyCode || "USD";
  const cart = useCart();
  const access = useProductAccess(product?._id ?? undefined);

  const optionTypes = product?.optionTypes ?? [];
  const variants = product?.variants ?? [];
  const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0] ?? null;
  const isVariable = product?.productType === "variable" && optionTypes.length > 0;

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);

  useEffect(() => {
    if (!product || !isVariable || !defaultVariant?.selections?.length) return;
    setSelectedOptions(getInitialSelectedOptions(defaultVariant));
  }, [defaultVariant, isVariable, product]);

  const selectedVariant = useMemo(() => {
    if (!product || !isVariable) return null;
    return findMatchingVariant(optionTypes, variants, selectedOptions);
  }, [isVariable, optionTypes, product, selectedOptions, variants]);

  const currentVariant = selectedVariant ?? defaultVariant;
  const requiresSelection = isVariable && !selectedVariant;
  const stockStatus = currentVariant?.stockStatus ?? "instock";
  const backorders = currentVariant?.backorders ?? "no";
  const outOfStock = stockStatus === "outofstock";
  const onSale = isVariantOnSale(currentVariant);
  const price = currentVariant
    ? onSale
      ? currentVariant.salePrice!.amount
      : (currentVariant.price?.amount ?? product?.displayPrice)
    : product?.displayPrice;
  const regularPrice = currentVariant ? currentVariant.price?.amount : product?.compareAtPrice;
  const showCompare = currentVariant ? onSale && !!regularPrice : !!regularPrice && !!price && regularPrice > price;

  const priceRange = useMemo(() => {
    if (!isVariable || variants.length === 0) return null;
    const amounts = variants
      .filter((v) => v.status !== "draft" && v.status !== "private" && v.price?.amount)
      .map((v) => (isVariantOnSale(v) ? v.salePrice!.amount : v.price!.amount));
    if (!amounts.length) return null;
    return { min: Math.min(...amounts), max: Math.max(...amounts) };
  }, [isVariable, variants]);

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
      !isVariable || isOptionValueEnabled(optionTypeId, optionValueId, selectedOptions, variants),
    [isVariable, selectedOptions, variants],
  );

  const selectOption = useCallback((optionTypeId: string, optionValueId: string) => {
    setSelectedOptions((current) => ({ ...current, [optionTypeId]: optionValueId }));
  }, []);

  const addToCart = useCallback(async () => {
    if (!product || requiresSelection || outOfStock) return false;
    return cart.add(product._id, {
      variantId: isVariable ? selectedVariant?._id : undefined,
      quantity,
      label: product.title,
    });
  }, [cart, isVariable, outOfStock, product, quantity, requiresSelection, selectedVariant?._id]);

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
    busy: cart.busyProductId === product?._id || !cart.isReady,
    sku: currentVariant?.sku ?? product?.sku,
    stockQuantity: currentVariant?.stockQuantity ?? product?.stockQuantity,
  };
}

export type ProductPageState = ReturnType<typeof useProductPage>;
