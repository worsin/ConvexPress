import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

import {
  expandBundleLineInventory,
  isBundleLineMetadata,
} from "../commerceBundles/runtime";

type LineWithCatalog = {
  metadata?: unknown;
  product?: Doc<"commerce_products"> | null;
  variant?: Doc<"commerce_product_variants"> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildOrderItemTitle(item: LineWithCatalog) {
  if (item.variant?.title) {
    return `${item.product?.title ?? "Product"} - ${item.variant.title}`;
  }

  return item.product?.title ?? "Product";
}

export function buildOrderItemMetadata(item: LineWithCatalog) {
  // Line metadata is stored untyped; keep whatever the cart line carried.
  const metadata = isRecord(item.metadata) ? item.metadata : {};
  return {
    ...metadata,
    productTitle: item.product?.title ?? "Product",
    variantTitle: item.variant?.title,
    optionSummary: item.variant?.optionSummary ?? metadata.optionSummary,
    variantSku: item.variant?.sku ?? metadata.variantSku,
    // Physical properties for shipping calculations (variant overrides product).
    // Variant weight is free text; products record weight as shippingWeightOz.
    weight: item.variant?.weight,
    shippingLengthIn: item.variant?.shippingLengthIn ?? item.product?.shippingLengthIn,
    shippingWidthIn: item.variant?.shippingWidthIn ?? item.product?.shippingWidthIn,
    shippingHeightIn: item.variant?.shippingHeightIn ?? item.product?.shippingHeightIn,
    // Tax and virtual flags
    taxClass: item.variant?.taxClass,
    isVirtual: item.variant?.isVirtual ?? item.product?.isVirtual,
  };
}

export type InventoryAllocation = {
  productId: Id<"commerce_products">;
  variantId?: Id<"commerce_product_variants">;
  quantity: number;
  label: string | undefined;
};

export function getOrderItemInventoryAllocations(item: {
  metadata?: unknown;
  quantity: number;
  productId: Id<"commerce_products">;
  variantId?: Id<"commerce_product_variants">;
  productTitle?: string;
}): InventoryAllocation[] {
  if (isBundleLineMetadata(item.metadata)) {
    return expandBundleLineInventory(item.metadata, item.quantity);
  }

  return [
    {
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      label: item.productTitle,
    },
  ];
}

export function resolveInventoryAdjustment(args: {
  mode: "decrement" | "restore";
  stockQuantity: number;
  allocationQuantity: number;
  allowBackorders?: boolean;
  label: string;
}) {
  const quantityDelta =
    args.mode === "decrement" ? -args.allocationQuantity : args.allocationQuantity;
  const nextStock = args.stockQuantity + quantityDelta;

  if (
    args.mode === "decrement" &&
    args.allowBackorders !== true &&
    nextStock < 0
  ) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Insufficient inventory for ${args.label}.`,
    });
  }

  return {
    quantityDelta,
    nextStock,
    adjustmentType:
      args.mode === "decrement" ? "order_allocation" : "order_release",
  };
}
