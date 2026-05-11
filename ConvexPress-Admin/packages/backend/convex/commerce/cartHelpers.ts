/**
 * Pure cart helper functions for variant validation and metadata.
 * Extracted for unit testing without Convex runtime.
 */

export interface CartItemCandidate {
  productId: string;
  productType: string;
  variantId?: string | null;
  variantProductId?: string | null;
  quantity: number;
}

export interface CartValidationError {
  code: string;
  message: string;
}

/**
 * Validate that a cart item candidate has correct variant setup.
 * Returns null if valid, or an error if invalid.
 */
export function validateCartItemVariant(
  candidate: CartItemCandidate,
): CartValidationError | null {
  if (candidate.productType === "variable" && !candidate.variantId) {
    return {
      code: "VALIDATION_ERROR",
      message: "A product variant must be selected before adding this item to cart.",
    };
  }

  if (
    candidate.variantId &&
    candidate.variantProductId &&
    candidate.variantProductId !== candidate.productId
  ) {
    return {
      code: "VALIDATION_ERROR",
      message: "Selected variant does not belong to this product.",
    };
  }

  return null;
}

/**
 * Build cart item metadata for a variant line.
 */
export function buildCartItemVariantMetadata(variant: {
  title?: string;
  optionSummary?: string;
  sku?: string;
} | null): Record<string, unknown> | undefined {
  if (!variant) return undefined;
  return {
    variantTitle: variant.title,
    optionSummary: variant.optionSummary,
    variantSku: variant.sku,
  };
}

/**
 * Resolve unit price for a cart item, preferring variant pricing.
 */
export function resolveCartItemUnitPrice(args: {
  variant?: { salePrice?: { amount: number } | null; price: { amount: number } } | null;
  product: { salePrice?: { amount: number } | null; basePrice: { amount: number } };
  bundlePriceAmount?: number;
}): number {
  if (args.variant) {
    return (args.variant.salePrice ?? args.variant.price).amount;
  }
  if (typeof args.bundlePriceAmount === "number") {
    return args.bundlePriceAmount;
  }
  return (args.product.salePrice ?? args.product.basePrice).amount;
}

/**
 * Build an order item snapshot from cart item + product + variant.
 */
export function buildOrderItemSnapshot(args: {
  productId: string;
  variantId?: string | null;
  quantity: number;
  product: { title: string; sku?: string };
  variant?: {
    title?: string;
    sku?: string;
    optionSummary?: string;
    price: { amount: number; currencyCode: string };
    salePrice?: { amount: number; currencyCode: string } | null;
  } | null;
  unitPriceAmount: number;
}): {
  productTitle: string;
  sku: string | undefined;
  variantTitle: string | undefined;
  optionSummary: string | undefined;
  variantSku: string | undefined;
  unitPriceAmount: number;
  lineTotalAmount: number;
} {
  return {
    productTitle: args.product.title,
    sku: args.variant?.sku ?? args.product.sku,
    variantTitle: args.variant?.title,
    optionSummary: args.variant?.optionSummary,
    variantSku: args.variant?.sku,
    unitPriceAmount: args.unitPriceAmount,
    lineTotalAmount: args.unitPriceAmount * args.quantity,
  };
}

/**
 * Compute inventory availability for a single product/variant.
 * Pure function — no DB access.
 */
export function computeAvailability(args: {
  trackInventory: boolean;
  allowBackorders: boolean;
  stockQuantity: number;
  reservedCount: number;
  requestedQuantity: number;
}): {
  canFulfill: boolean;
  available: number;
  reason?: string;
} {
  if (!args.trackInventory) {
    return { canFulfill: true, available: Number.POSITIVE_INFINITY };
  }

  const available = args.stockQuantity - args.reservedCount;

  if (args.allowBackorders) {
    return { canFulfill: true, available };
  }

  if (available < args.requestedQuantity) {
    return {
      canFulfill: false,
      available,
      reason: `Only ${Math.max(0, available)} available, requested ${args.requestedQuantity}`,
    };
  }

  return { canFulfill: true, available };
}
