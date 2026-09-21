import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { createMembershipAccessEvaluator } from "../membership/access";
import { requireCommerceBundlesEnabled } from "../commerceBundles/helpers";
import { buildBundleLineMetadata, expandBundleLineInventory, isBundleLineMetadata, getBundleByProductId, resolveBundleAvailability, resolveBundleSelectionSnapshot } from "../commerceBundles/runtime";
import { readStockTarget, readReservedStock } from "./stockTarget";
import { resolveStockPolicy, canOrderQuantity } from "./stockPolicy";
import type { BundlePurchaseMetadata, BundleSelectionInput, BundleSnapshotResult } from "../commerceBundles/runtime";
import { parseSourceOptions, isEligibleProductVariant } from "../canonicalDocuments/productOptionSource";

type ResolvedCartBundle = { unitPriceAmount: number; metadata: BundlePurchaseMetadata };

function invalidSelection(): never {
  throw new ConvexError({ code: "invalid_bundle_selection", message: "Select a valid configuration for this bundle." });
}
function unavailable(): never {
  throw new ConvexError({ code: "BUNDLE_UNAVAILABLE", message: "This bundle configuration is unavailable." });
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Resolve the purchase from database authority, including metadata-free fixed
 * bundles. Caller and persisted metadata supply choices only, never prices. */
export async function resolveCartBundle(ctx: QueryCtx, args: {
  productId: Id<"commerce_products">;
  variantId?: Id<"commerce_product_variants">;
  metadata: unknown;
  quantity: number;
  currencyCode: string;
}): Promise<ResolvedCartBundle | null> {
  const bundle = await getBundleByProductId(ctx, args.productId);
  if (!bundle) {
    if (record(args.metadata) && args.metadata.lineType === "bundle") invalidSelection();
    return null;
  }
  await requireCommerceBundlesEnabled(ctx);
  const now = Date.now();
  if (bundle.status !== "active" || (bundle.publishedAt !== undefined && bundle.publishedAt > now)) unavailable();
  if (args.variantId || !Number.isSafeInteger(args.quantity) || args.quantity <= 0) invalidSelection();
  let selections: BundleSelectionInput[] | undefined;
  if (args.metadata !== undefined && args.metadata !== null) {
    if (!record(args.metadata) || args.metadata.lineType !== "bundle" || args.metadata.bundleId !== bundle._id || !Array.isArray(args.metadata.selections)) invalidSelection();
    selections = args.metadata.selections.map((input: unknown) => {
      if (!record(input) || typeof input.componentId !== "string" || typeof input.quantity !== "number") invalidSelection();
      const componentId = ctx.db.normalizeId("commerce_bundle_components", input.componentId);
      const productId = input.productId === undefined ? undefined : typeof input.productId === "string" ? ctx.db.normalizeId("commerce_products", input.productId) : null;
      const variantId = input.variantId === undefined ? undefined : typeof input.variantId === "string" ? ctx.db.normalizeId("commerce_product_variants", input.variantId) : null;
      if (!componentId || productId === null || variantId === null) invalidSelection();
      return { componentId, productId, variantId, quantity: input.quantity };
    });
  }
  const evaluateAccess = createMembershipAccessEvaluator(ctx);
  async function assertProductAccess(product: Doc<"commerce_products"> | null) {
    if (!product || product.status !== "publish" || (product.publishedAt !== undefined && product.publishedAt > now)) unavailable();
    if (product.basePrice.currencyCode !== args.currencyCode) unavailable();
    for (const resource of [
      { resourceType: "product" as const, resourceIdOrKey: String(product._id) },
      { resourceType: "route" as const, resourceIdOrKey: `/products/${encodeURIComponent(product.slug)}` },
    ]) if (!(await evaluateAccess(resource)).allowed) unavailable();
    return product;
  }
  await assertProductAccess(await ctx.db.get(args.productId));
  if (!(await evaluateAccess({ resourceType: "route", resourceIdOrKey: `/bundles/${encodeURIComponent(bundle.slug)}` })).allowed) unavailable();
  let snapshot: BundleSnapshotResult;
  try {
    snapshot = await resolveBundleSelectionSnapshot(ctx, { bundle, selections, now });
  } catch (error) {
    // Authoring errors may contain component labels. Do not expose those before
    // the shopper's component permissions have been established.
    if (error instanceof ConvexError) invalidSelection();
    throw error;
  }
  if (snapshot.selections.length === 0 || !Number.isSafeInteger(snapshot.resolvedBundlePriceAmount * args.quantity)) unavailable();
  for (const selection of snapshot.selections) {
    const product = await assertProductAccess(await ctx.db.get(selection.productId));
    const variant = selection.variantId ? await ctx.db.get(selection.variantId) : null;
    const options = parseSourceOptions(product.optionTypes ?? []);
    if (!options.success || (product.productType === "variable" && !variant) ||
        (variant && !isEligibleProductVariant(product._id, options.data, variant))) unavailable();
  }
  const availability = await resolveBundleAvailability(ctx, { bundle, snapshot, quantity: args.quantity });
  if (!availability.available) unavailable();
  return {
    unitPriceAmount: snapshot.resolvedBundlePriceAmount,
    metadata: buildBundleLineMetadata({ bundle, owningProductId: args.productId, snapshot }),
  };
}

/** Check combined demand, including distinct bundle configurations and variants
 * whose stock belongs to the same parent product. Metadata is server-resolved by
 * recalculateCart before this function runs. Reservations remain checkout-owned. */
export async function assertBundleCartInventory(ctx: QueryCtx, items: Doc<"commerce_cart_items">[]) {
  if (!items.some(item => isBundleLineMetadata(item.metadata))) return;
  const bundleCounts = new Map<Id<"commerce_bundles">, number>();
  const targets: Awaited<ReturnType<typeof readStockTarget>>[] = [];
  const totals = new Map<string, number>();
  const insufficient = (): never => { throw new ConvexError({ code: "INSUFFICIENT_STOCK", message: "Insufficient stock for the combined cart quantities." }); };
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) invalidSelection();
    const metadata: unknown = item.metadata;
    if (isBundleLineMetadata(metadata)) bundleCounts.set(metadata.bundleId, (bundleCounts.get(metadata.bundleId) ?? 0) + item.quantity);
    const allocations = isBundleLineMetadata(metadata) ? expandBundleLineInventory(metadata, item.quantity) : [{ productId: item.productId, variantId: item.variantId, quantity: item.quantity }];
    for (const allocation of allocations) {
      if (!Number.isSafeInteger(allocation.quantity) || allocation.quantity <= 0) invalidSelection();
      const target = await readStockTarget(ctx, allocation.productId, allocation.variantId);
      if (!target.policy.tracked) continue;
      const total = (totals.get(target.patchId) ?? 0) + allocation.quantity;
      if (!Number.isSafeInteger(total)) invalidSelection();
      totals.set(target.patchId, total);
      targets.push(target);
    }
  }
  const reservations = new Map<string, number>();
  for (const target of targets) {
    let reserved = reservations.get(target.patchId);
    if (reserved === undefined) {
      reserved = await readReservedStock(ctx, target.product._id, target.inventoryVariantId);
      reservations.set(target.patchId, reserved);
    }
    if (!canOrderQuantity(resolveStockPolicy(target.product, target.variant, reserved), totals.get(target.patchId)!)) insufficient();
  }
  for (const [id, quantity] of bundleCounts) {
    const bundle = await ctx.db.get(id);
    if (!bundle || !Number.isSafeInteger(quantity)) unavailable();
    if (bundle.trackInventory && (bundle.stockCount === undefined || bundle.stockCount < quantity)) insufficient();
  }
}

/** Do not silently charge an old price or fulfil a newly changed composition.
 * Dynamic pricing applies after the authoritative bundle base price. */
export function assertCurrentBundlePrice(item: Doc<"commerce_cart_items">, current: ResolvedCartBundle) {
  const stored: unknown = item.metadata;
  const signature = (value: unknown) => {
    if (!Array.isArray(value)) return null;
    return JSON.stringify(value.map((entry: unknown) => record(entry) ? [entry.componentId, entry.productId, entry.variantId ?? null, entry.quantity, entry.unitPriceAmount, entry.lineTotalAmount] : null).sort((a, b) => String(a?.[0]).localeCompare(String(b?.[0]))));
  };
  if ((item.baseUnitPriceAmount ?? item.unitPriceAmount) !== current.unitPriceAmount ||
      !record(stored) || stored.resolvedBundlePriceAmount !== current.unitPriceAmount ||
      signature(stored.selections) !== signature(current.metadata.selections)) {
    throw new ConvexError({ code: "BUNDLE_CHANGED", message: "Bundle pricing or configuration changed. Refresh your cart before placing the order." });
  }
}
