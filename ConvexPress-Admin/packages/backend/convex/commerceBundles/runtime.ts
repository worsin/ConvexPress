import { readStockTarget, readReservedStock } from "../commerce/stockTarget";
import { resolveStockPolicy, canOrderQuantity } from "../commerce/stockPolicy";
import { ConvexError } from "convex/values";
import { activePriceAmount } from "../commerce/activePrice";
import type { RequestReadLedger } from "../helpers/requestReadLedger";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type BundleCtx = Pick<QueryCtx, "db">;
type BundleDoc = Doc<"commerce_bundles">;
type BundleComponentDoc = Doc<"commerce_bundle_components">;
type ProductDoc = Doc<"commerce_products">;
type VariantDoc = Doc<"commerce_product_variants">;

export type BundleSelectionInput = {
  componentId: Id<"commerce_bundle_components">;
  productId?: Id<"commerce_products">;
  variantId?: Id<"commerce_product_variants">;
  quantity: number;
};

export type BundleSelectionSnapshot = {
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

export type BundleSnapshotResult = {
  selections: BundleSelectionSnapshot[];
  totalItems: number;
  regularPriceAmount: number;
  componentSubtotalAmount: number;
  resolvedBundlePriceAmount: number;
};

export function isConfigurableBundle(bundle: { bundleType: "fixed" | "mix_and_match" | "bogo" }) {
  return bundle.bundleType === "mix_and_match" || bundle.bundleType === "bogo";
}

export async function getBundleByProductId(
  ctx: BundleCtx,
  productId: Id<"commerce_products">,
): Promise<BundleDoc | null> {
  return ctx.db
    .query("commerce_bundles")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .unique();
}

export async function getBundleComponents(
  ctx: BundleCtx,
  bundleId: Id<"commerce_bundles">,
): Promise<BundleComponentDoc[]> {
  const components = await ctx.db
    .query("commerce_bundle_components")
    .withIndex("by_bundle", (q) => q.eq("bundleId", bundleId))
    .collect();

  return components.sort((a, b) => a.sortOrder - b.sortOrder);
}

function invalidPricing(message: string): never {
  throw new ConvexError({ code: "invalid_bundle_pricing", message });
}

function money(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0) invalidPricing("Bundle money must be a nonnegative safe integer in minor units.");
  return amount;
}

function discount(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) invalidPricing("Bundle discounts must be between zero and 100 percent.");
  return percent;
}

function getProductBaseUnitPrice(
  product: ProductDoc,
  variant: VariantDoc | null,
  now: number,
): { amount: number; currencyCode: string } {
  const price = variant ? variant.price : product.basePrice;
  if (!/^[A-Z]{3}$/u.test(price.currencyCode) || price.currencyCode !== product.basePrice.currencyCode)
    invalidPricing("Component and variant currencies must match.");
  money(price.amount);
  const source = variant ?? product;
  return { amount: money(activePriceAmount(price, source.salePrice, source, now)), currencyCode: price.currencyCode };
}

export function getResolvedComponentUnitPrice(
  component: { discountPercent?: number; priceOverride?: number },
  baseUnitPrice: number,
): number {
  money(baseUnitPrice);
  if (component.discountPercent !== undefined) discount(component.discountPercent);
  if (component.priceOverride !== undefined && component.priceOverride !== null) {
    return money(component.priceOverride);
  }
  if (typeof component.discountPercent === "number" && component.discountPercent > 0) {
    return money(Math.round(baseUnitPrice * (1 - component.discountPercent / 100)));
  }
  return baseUnitPrice;
}

export function applyBundlePricing(
  bundle: { discountAmount?: number; discountPercent?: number; fixedPrice?: number; pricingType: "fixed" | "percent_off" | "amount_off" | "component_sum" },
  componentSubtotalAmount: number,
): number {
  money(componentSubtotalAmount);
  switch (bundle.pricingType) {
    case "fixed":
      return money(bundle.fixedPrice ?? componentSubtotalAmount);
    case "percent_off":
      return money(Math.round(componentSubtotalAmount * (1 - discount(bundle.discountPercent ?? 0) / 100)));
    case "amount_off":
      return money(Math.max(0, componentSubtotalAmount - money(bundle.discountAmount ?? 0)));
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
    now?: number;
    budget?: RequestReadLedger;
  },
): Promise<BundleSnapshotResult> {
  const components = args.components ?? (await getBundleComponents(ctx, args.bundle._id));
  const now = args.now ?? Date.now();
  if (!Number.isSafeInteger(now)) invalidPricing("Invalid bundle pricing time.");
  const componentIds = new Set(components.map(component => component._id.toString()));
  if (componentIds.size !== components.length) invalidPricing("Duplicate bundle component identity.");
  const selectionsByComponent = new Map(
    (args.selections ?? []).map((selection) => [selection.componentId.toString(), selection]),
  );
  if (selectionsByComponent.size !== (args.selections ?? []).length ||
      [...selectionsByComponent.keys()].some(id => !componentIds.has(id)))
    throw new ConvexError({ code: "invalid_bundle_selection", message: "Every selection must identify one unique component of this bundle." });
  const selections: BundleSelectionSnapshot[] = [];
  let regularPriceAmount = 0;
  let componentSubtotalAmount = 0;
  let totalItems = 0;
  let currencyCode: string | undefined;

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

    args.budget?.beforeRead();
    const product = await ctx.db.get(productId);
    args.budget?.record(product);
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

    if (selectedVariantId) args.budget?.beforeRead();
    const variant = selectedVariantId ? await ctx.db.get(selectedVariantId) : null;
    if (selectedVariantId) args.budget?.record(variant);
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

    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new ConvexError({
        code: "invalid_quantity",
        message: "Bundle component quantity must be a positive safe integer.",
      });
    }
    if (!configurable && quantity !== component.quantity)
      throw new ConvexError({ code: "invalid_fixed_quantity", message: "Fixed bundle component quantities cannot be changed." });
    for (const bound of [component.minQuantity, component.maxQuantity])
      if (bound !== undefined && (!Number.isSafeInteger(bound) || bound <= 0)) invalidPricing("Invalid component quantity bound.");
    if (component.minQuantity !== undefined && component.maxQuantity !== undefined && component.minQuantity > component.maxQuantity)
      invalidPricing("Component quantity bounds are reversed.");
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

    const price = getProductBaseUnitPrice(product, variant, now);
    if (currencyCode !== undefined && currencyCode !== price.currencyCode) invalidPricing("Bundle components cannot mix currencies.");
    currencyCode = price.currencyCode;
    const baseUnitPrice = price.amount;
    const resolvedUnitPrice = getResolvedComponentUnitPrice(component, baseUnitPrice);
    const lineTotalAmount = money(resolvedUnitPrice * quantity);

    regularPriceAmount = money(regularPriceAmount + money(baseUnitPrice * quantity));
    componentSubtotalAmount = money(componentSubtotalAmount + lineTotalAmount);
    totalItems += quantity;
    if (!Number.isSafeInteger(totalItems)) invalidPricing("Bundle item count exceeds the safe integer range.");
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

    try {
      const target=await readStockTarget(ctx,selection.productId,selection.variantId);
      const reserved=target.policy.tracked?await readReservedStock(ctx,selection.productId,target.inventoryVariantId):0;
      const stock=resolveStockPolicy(product,target.variant,reserved);
      if(!canOrderQuantity(stock,selection.quantity*lineQuantity))unavailableComponents.push(target.label);
    } catch (error) {
      if (!(error instanceof ConvexError) || !["NOT_FOUND","VALIDATION_ERROR"].includes((error.data as {code:string}).code)) throw error;
      unavailableComponents.push(selection.variantTitle ? `${product.title} - ${selection.variantTitle}` : product.title);
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

export type BundlePurchaseMetadata = {
  lineType: "bundle";
  bundleId: Id<"commerce_bundles">;
  bundleSlug: string;
  bundleName: string;
  owningProductId: Id<"commerce_products">;
  bundleType: "fixed" | "mix_and_match" | "bogo";
  pricingType: "fixed" | "percent_off" | "amount_off" | "component_sum";
  regularPriceAmount: number;
  resolvedBundlePriceAmount: number;
  selections: BundleSelectionSnapshot[];
};

export function buildBundleLineMetadata(args: {
  bundle: { _id: Id<"commerce_bundles">; name: string; slug: string; bundleType: BundlePurchaseMetadata["bundleType"]; pricingType: BundlePurchaseMetadata["pricingType"] };
  owningProductId: Id<"commerce_products">;
  snapshot: BundleSnapshotResult;
}): BundlePurchaseMetadata {
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
