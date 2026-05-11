import { ConvexError } from "convex/values";

import {
  expandBundleLineInventory,
  isBundleLineMetadata,
} from "../commerceBundles/runtime";

export function buildOrderItemTitle(item: any) {
  if (item.variant?.title) {
    return `${item.product?.title ?? "Product"} - ${item.variant.title}`;
  }

  return item.product?.title ?? "Product";
}

export function buildOrderItemMetadata(item: any) {
  return {
    ...(item.metadata ?? {}),
    productTitle: item.product?.title ?? "Product",
    variantTitle: item.variant?.title,
    optionSummary: item.variant?.optionSummary ?? item.metadata?.optionSummary,
    variantSku: item.variant?.sku ?? item.metadata?.variantSku,
    // Physical properties for shipping calculations (variant overrides product)
    weight: item.variant?.weight ?? item.product?.weight,
    shippingLengthIn: item.variant?.shippingLengthIn ?? item.product?.shippingLengthIn,
    shippingWidthIn: item.variant?.shippingWidthIn ?? item.product?.shippingWidthIn,
    shippingHeightIn: item.variant?.shippingHeightIn ?? item.product?.shippingHeightIn,
    // Tax and virtual flags
    taxClass: item.variant?.taxClass,
    isVirtual: item.variant?.isVirtual ?? item.product?.isVirtual,
  };
}

export function getOrderItemInventoryAllocations(item: any) {
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
