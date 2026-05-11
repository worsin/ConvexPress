import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type BundleCtx = Pick<QueryCtx, "db">;
type CommerceMoney = number | { amount: number; currencyCode?: string };
type BundleDoc = Doc<"commerce_bundles">;
type BundleComponentDoc = Doc<"commerce_bundle_components">;
type ProductDoc = Doc<"commerce_products">;
type VariantDoc = Doc<"commerce_product_variants">;

type BundleSelectionInput = {
  componentId: Id<"commerce_bundle_components">;
  productId?: Id<"commerce_products">;
  variantId?: Id<"commerce_product_variants">;
  quantity: number;
};

type BundleSelectionSnapshot = {
  componentId: Id<"commerce_bundle_components">;
  componentLabel?: string;
  productId: Id<"commerce_products">;
  productTitle: string;
  variantId?: Id<"commerce_product_variants">;
  variantTitle?: string;
  quantity: number;
  unitPriceAmount: number;
  lineTotalAmount: number;
};

type BundleSnapshotResult = {
  selections: BundleSelectionSnapshot[];
  totalItems: number;
  regularPriceAmount: number;
  componentSubtotalAmount: number;
  resolvedBundlePriceAmount: number;
};

export function isConfigurableBundle(bundle: Pick<BundleDoc, "bundleType">) {
  return bundle.bundleType === "mix_and_match" || bundle.bundleType === "bogo";
}

export async function getBundleByProductId(
  ctx: BundleCtx,
  productId: Id<"commerce_products">,
) {
  return ctx.db
    .query("commerce_bundles")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .unique();
}

export async function getBundleComponents(
  ctx: BundleCtx,
  bundleId: Id<"commerce_bundles">,
) {
  const components = await ctx.db
    .query("commerce_bundle_components")
    .withIndex("by_bundle", (q) => q.eq("bundleId", bundleId))
    .collect();

  return components.sort((a, b) => a.sortOrder - b.sortOrder);
}

function getMoneyAmount(money: CommerceMoney): number {
  if (typeof money === "number") return money;
  return money.amount;
}

function getProductBaseUnitPrice(
  product: ProductDoc,
  variant: VariantDoc | null,
): number {
  if (variant) {
    return getMoneyAmount(variant.salePrice ?? variant.price);
  }
  return getMoneyAmount(product.salePrice ?? product.basePrice);
}

export function getResolvedComponentUnitPrice(
  component: Pick<BundleComponentDoc, "discountPercent" | "priceOverride">,
  baseUnitPrice: number,
): number {
  if (component.priceOverride !== undefined && component.priceOverride !== null) {
    return component.priceOverride;
  }
  if (typeof component.discountPercent === "number" && component.discountPercent > 0) {
    return Math.round(baseUnitPrice * (1 - component.discountPercent / 100));
  }
  return baseUnitPrice;
}

export function applyBundlePricing(
  bundle: Pick<
    BundleDoc,
    "discountAmount" | "discountPercent" | "fixedPrice" | "pricingType"
  >,
  componentSubtotalAmount: number,
): number {
  switch (bundle.pricingType) {
    case "fixed":
      return bundle.fixedPrice ?? componentSubtotalAmount;
    case "percent_off":
      return Math.round(
        componentSubtotalAmount * (1 - (bundle.discountPercent ?? 0) / 100),
      );
    case "amount_off":
      return Math.max(0, componentSubtotalAmount - (bundle.discountAmount ?? 0));
    case "component_sum":
    default:
      return componentSubtotalAmount;
  }
}

export async function resolveBundleSelectionSnapshot(
  ctx: BundleCtx,
  args: {
    bundle: BundleDoc;
    components?: BundleComponentDoc[];
    selections?: BundleSelectionInput[];
  },
): Promise<BundleSnapshotResult> {
  const components = args.components ?? (await getBundleComponents(ctx, args.bundle._id));
  const selectionsByComponent = new Map(
    (args.selections ?? []).map((selection) => [selection.componentId.toString(), selection]),
  );
  const selections: BundleSelectionSnapshot[] = [];
  let regularPriceAmount = 0;
  let componentSubtotalAmount = 0;
  let totalItems = 0;

  for (const component of components) {
    const inputSelection = selectionsByComponent.get(component._id.toString());
    const configurable = isConfigurableBundle(args.bundle);

    if (configurable && !inputSelection) {
      if (component.isRequired) {
        throw new ConvexError({
          code: "required_component_missing",
          message: `Required component missing: ${component.label || component._id}`,
        });
      }
      continue;
    }

    const productId = component.productId;
    if (
      inputSelection?.productId &&
      inputSelection.productId.toString() !== productId.toString()
    ) {
      throw new ConvexError({
        code: "invalid_component_product",
        message: "Selected product does not match the bundle component.",
      });
    }

    const product = await ctx.db.get(productId);
    if (!product) {
      throw new ConvexError({
        code: "product_not_found",
        message: "Bundle component product not found.",
      });
    }

    const selectedVariantId = inputSelection?.variantId ?? component.variantId;
    if (
      inputSelection?.variantId &&
      component.allowVariantChange !== true &&
      component.variantId &&
      inputSelection.variantId.toString() !== component.variantId.toString()
    ) {
      throw new ConvexError({
        code: "variant_change_not_allowed",
        message: "This bundle component does not allow variant changes.",
      });
    }
    if (
      inputSelection?.variantId &&
      component.allowVariantChange !== true &&
      !component.variantId
    ) {
      throw new ConvexError({
        code: "variant_change_not_allowed",
        message: "This bundle component does not allow variant changes.",
      });
    }

    const variant = selectedVariantId ? await ctx.db.get(selectedVariantId) : null;
    if (selectedVariantId && !variant) {
      throw new ConvexError({
        code: "variant_not_found",
        message: "Selected variant not found.",
      });
    }
    if (variant && variant.productId.toString() !== productId.toString()) {
      throw new ConvexError({
        code: "invalid_variant",
        message: "Selected variant does not belong to the bundle component product.",
      });
    }

    const quantity =
      inputSelection?.quantity ??
      (configurable ? component.minQuantity ?? component.quantity : component.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ConvexError({
        code: "invalid_quantity",
        message: "Bundle component quantity must be greater than zero.",
      });
    }
    if (component.minQuantity !== undefined && quantity < component.minQuantity) {
      throw new ConvexError({
        code: "component_min_quantity_not_met",
        message: `Component quantity must be at least ${component.minQuantity}.`,
      });
    }
    if (component.maxQuantity !== undefined && quantity > component.maxQuantity) {
      throw new ConvexError({
        code: "component_max_quantity_exceeded",
        message: `Component quantity cannot exceed ${component.maxQuantity}.`,
      });
    }

    const baseUnitPrice = getProductBaseUnitPrice(product, variant);
    const resolvedUnitPrice = getResolvedComponentUnitPrice(component, baseUnitPrice);
    const lineTotalAmount = resolvedUnitPrice * quantity;

    regularPriceAmount += baseUnitPrice * quantity;
    componentSubtotalAmount += lineTotalAmount;
    totalItems += quantity;
    selections.push({
      componentId: component._id,
      componentLabel: component.label,
      productId,
      productTitle: product.title,
      variantId: variant?._id,
      variantTitle: variant?.title,
      quantity,
      unitPriceAmount: resolvedUnitPrice,
      lineTotalAmount,
    });
  }

  if (isConfigurableBundle(args.bundle)) {
    if (args.bundle.minItems && totalItems < args.bundle.minItems) {
      throw new ConvexError({
        code: "min_items_not_met",
        message: `Minimum ${args.bundle.minItems} items required`,
      });
    }
    if (args.bundle.maxItems && totalItems > args.bundle.maxItems) {
      throw new ConvexError({
        code: "max_items_exceeded",
        message: `Maximum ${args.bundle.maxItems} items allowed`,
      });
    }
  }

  return {
    selections,
    totalItems,
    regularPriceAmount,
    componentSubtotalAmount,
    resolvedBundlePriceAmount: applyBundlePricing(args.bundle, componentSubtotalAmount),
  };
}

export async function resolveBundlePricingPreview(
  ctx: BundleCtx,
  args: {
    bundle: BundleDoc;
    components?: BundleComponentDoc[];
  },
): Promise<BundleSnapshotResult | null> {
  const components = args.components ?? (await getBundleComponents(ctx, args.bundle._id));

  if (!isConfigurableBundle(args.bundle)) {
    return resolveBundleSelectionSnapshot(ctx, {
      bundle: args.bundle,
      components,
    });
  }

  const previewSelections = components
    .filter((component) => component.isRequired || component.isDefault)
    .map((component) => ({
      componentId: component._id,
      productId: component.productId,
      variantId: component.variantId,
      quantity: component.minQuantity ?? component.quantity,
    }));

  if (previewSelections.length === 0) {
    return null;
  }

  try {
    return await resolveBundleSelectionSnapshot(ctx, {
      bundle: args.bundle,
      components,
      selections: previewSelections,
    });
  } catch {
    return null;
  }
}

export async function resolveBundleAvailability(
  ctx: BundleCtx,
  args: {
    bundle: BundleDoc;
    snapshot: Pick<BundleSnapshotResult, "selections">;
    quantity?: number;
  },
): Promise<{
  available: boolean;
  reason?: string;
  unavailableComponents?: string[];
}> {
  const lineQuantity = Math.max(1, args.quantity ?? 1);

  if (args.bundle.status !== "active") {
    return { available: false, reason: "Bundle is not active" };
  }

  if (args.bundle.trackInventory && args.bundle.stockCount !== undefined) {
    if (args.bundle.stockCount < lineQuantity) {
      return { available: false, reason: "Bundle out of stock" };
    }
  }

  const unavailableComponents: string[] = [];

  for (const selection of args.snapshot.selections) {
    const product = await ctx.db.get(selection.productId);
    if (!product) {
      unavailableComponents.push(selection.componentLabel || selection.productTitle);
      continue;
    }
    if (product.status !== "publish") {
      unavailableComponents.push(selection.componentLabel || product.title);
      continue;
    }

    if (product.trackInventory !== true) {
      continue;
    }

    const requiredQty = selection.quantity * lineQuantity;
    let stock = product.stockQuantity ?? 0;
    let label = selection.variantTitle
      ? `${product.title} - ${selection.variantTitle}`
      : product.title;

    if (product.productType === "variable") {
      if (!selection.variantId) {
        unavailableComponents.push(label);
        continue;
      }

      const variant = await ctx.db.get(selection.variantId);
      if (!variant || variant.productId.toString() !== selection.productId.toString()) {
        unavailableComponents.push(label);
        continue;
      }

      stock = variant.stockQuantity ?? 0;
      label = `${product.title} - ${variant.title}`;
    }

    if (stock < requiredQty && !product.allowBackorders) {
      unavailableComponents.push(label);
    }
  }

  if (unavailableComponents.length > 0) {
    return {
      available: false,
      reason: `Out of stock: ${unavailableComponents.join(", ")}`,
      unavailableComponents,
    };
  }

  return { available: true };
}

export function buildBundleLineMetadata(args: {
  bundle: BundleDoc;
  owningProductId: Id<"commerce_products">;
  snapshot: Awaited<ReturnType<typeof resolveBundleSelectionSnapshot>>;
}) {
  return {
    lineType: "bundle",
    bundleId: args.bundle._id,
    bundleSlug: args.bundle.slug,
    bundleName: args.bundle.name,
    owningProductId: args.owningProductId,
    bundleType: args.bundle.bundleType,
    pricingType: args.bundle.pricingType,
    regularPriceAmount: args.snapshot.regularPriceAmount,
    resolvedBundlePriceAmount: args.snapshot.resolvedBundlePriceAmount,
    selections: args.snapshot.selections,
  };
}

type BundleLineMetadata = {
  lineType: "bundle";
  bundleId: Id<"commerce_bundles">;
  selections: BundleSelectionSnapshot[];
  regularPriceAmount: number;
  resolvedBundlePriceAmount: number;
};

export function isBundleLineMetadata(metadata: unknown): metadata is BundleLineMetadata {
  if (!metadata || typeof metadata !== "object") return false;
  const value = metadata as Partial<BundleLineMetadata>;
  return (
    value.lineType === "bundle" &&
    Array.isArray(value.selections) &&
    typeof value.regularPriceAmount === "number" &&
    typeof value.resolvedBundlePriceAmount === "number"
  );
}

export function expandBundleLineInventory(metadata: unknown, lineQuantity: number) {
  if (!isBundleLineMetadata(metadata)) return [];

  return metadata.selections.map((selection) => ({
    productId: selection.productId,
    variantId: selection.variantId,
    quantity: selection.quantity * lineQuantity,
    label: selection.productTitle,
  }));
}

export function getBundlePurchaseDelta(
  metadata: unknown,
  lineQuantity: number,
): { bundleId: Id<"commerce_bundles">; quantity: number } | null {
  if (!isBundleLineMetadata(metadata)) return null;
  if (!Number.isFinite(lineQuantity) || lineQuantity <= 0) return null;

  return {
    bundleId: metadata.bundleId,
    quantity: lineQuantity,
  };
}
