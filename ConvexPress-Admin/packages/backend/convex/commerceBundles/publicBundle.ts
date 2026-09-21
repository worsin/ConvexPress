import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { createMembershipAccessEvaluator } from "../membership/access";
import { resolvePrice } from "../commerce/activePrice";
import { resolveStockPolicy, canOrderQuantity } from "../commerce/stockPolicy";
import { readReservedStock } from "../commerce/stockTarget";
import { parseSourceOptions, isEligibleProductVariant } from "../canonicalDocuments/productOptionSource";
import { getResolvedComponentUnitPrice, isConfigurableBundle, resolveBundleSelectionSnapshot } from "./runtime";
import type { BundleSelectionInput, BundleSnapshotResult } from "./runtime";

type Money = { amount: number; currencyCode: string };
export type PublicBundleVariant = { _id: Id<"commerce_product_variants">; title: string; name: string; price: Money; unitPriceAmount: number; available: boolean };
export type PublicBundleComponent = {
  _id: Id<"commerce_bundle_components">; productId: Id<"commerce_products">; variantId?: Id<"commerce_product_variants">;
  quantity: number; minQuantity?: number; maxQuantity?: number; isRequired: boolean; isDefault: boolean;
  allowVariantChange: boolean; label?: string; sortOrder: number; priceOverride?: number; discountPercent?: number;
  product: { _id: Id<"commerce_products">; title: string; slug: string; basePrice: Money };
  variant?: PublicBundleVariant; variants: PublicBundleVariant[]; unitPriceAmount: number;
};
export type PublicBundlePrice = {
  regularPrice: number; bundlePrice: number; savings: number; savingsPercent: number;
  currencyCode: string; available: boolean; selections: BundleSelectionInput[];
  pricedAt: number; recheckAt: number | null;
};
export type PublicBundle = {
  _id: Id<"commerce_bundles">; productId: Id<"commerce_products">; name: string; slug: string;
  description?: string; shortDescription?: string; images: string[]; bundleType: "fixed" | "mix_and_match" | "bogo";
  pricingType: "fixed" | "percent_off" | "amount_off" | "component_sum"; fixedPrice?: number; discountPercent?: number; discountAmount?: number;
  regularPrice?: number; bundlePrice?: number; minItems?: number; maxItems?: number; status: "active";
  currencyCode: string; components: PublicBundleComponent[]; quote: PublicBundlePrice | null; pricedAt: number; recheckAt: number | null;
};
function capacity(): never { throw new ConvexError({ code: "BUNDLE_READ_BUDGET", message: "The bundle exceeds the supported display budget. No partial bundle was returned." }); }
const clip = (text: string | undefined, max: number) => text?.slice(0, max).replace(/[\uD800-\uDBFF]$/u, "");
function publicImage(url: string): boolean {
  if (url.length > 2048) return false;
  try { const parsed = new URL(url); return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password; } catch { return false; }
}

/** Closed shopper DTO shared by catalog, pricing, availability and the block
 * resolver. Every materialized source/policy read belongs to this request budget. */
export async function readPublicBundle(ctx: QueryCtx, bundle: Doc<"commerce_bundles"> | null,
  options: { selections?: BundleSelectionInput[]; quantity?: number; budget?: RequestReadLedger; now?: number } = {}): Promise<PublicBundle | null> {
  const budget = options.budget ?? new RequestReadLedger(), now = options.now ?? Date.now();
  const quantity = options.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return null;
  budget.beforeRead();
  const plugins = budget.record(await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique());
  if (!plugins?.values?.commerceEnabled || !plugins.values.commerceBundlesEnabled || !bundle?.productId || bundle.status !== "active" || bundle.slug.length > 256) return null;
  budget.noteAuthorizationBoundary(bundle.publishedAt, now);
  if (bundle.publishedAt !== undefined && bundle.publishedAt > now) return null;
  const access = createMembershipAccessEvaluator(ctx, budget);
  const products = new Map<Id<"commerce_products">, Doc<"commerce_products">>();
  async function productAccess(id: Id<"commerce_products">): Promise<Doc<"commerce_products"> | null> {
    const cached = products.get(id); if (cached) return cached;
    budget.beforeRead(); const product = budget.record(await ctx.db.get(id));
    if (!product || product.status !== "publish" || product.slug.length > 256) return null;
    budget.noteAuthorizationBoundary(product.publishedAt, now);
    if (product.publishedAt !== undefined && product.publishedAt > now) return null;
    for (const resource of [{ resourceType: "product" as const, resourceIdOrKey: String(id) },
      { resourceType: "route" as const, resourceIdOrKey: `/products/${encodeURIComponent(product.slug)}` }])
      if (!(await access(resource)).allowed) return null;
    products.set(id, product); return product;
  }
  const owner = await productAccess(bundle.productId);
  if (!owner || !(await access({ resourceType: "route", resourceIdOrKey: `/bundles/${encodeURIComponent(bundle.slug)}` })).allowed) return null;
  const currencyCode = owner.basePrice.currencyCode;
  if (!/^[A-Z]{3}$/u.test(currencyCode)) return null;
  budget.beforeRead();
  const components = await ctx.db.query("commerce_bundle_components").withIndex("by_bundle", q => q.eq("bundleId", bundle._id)).take(129);
  components.forEach(component => budget.record(component));
  if (components.length > 128) capacity();
  if (!components.length) return null;
  components.sort((a, b) => a.sortOrder - b.sortOrder || String(a._id).localeCompare(String(b._id)));
  const projected: PublicBundleComponent[] = [];
  const stock = new Map<string, { key: string; policy: ReturnType<typeof resolveStockPolicy> }>();
  const defaults: BundleSelectionInput[] = [];
  function price(source: Doc<"commerce_products"> | Doc<"commerce_product_variants">): Money {
    const regular = "price" in source ? source.price : source.basePrice;
    const decision = resolvePrice(regular, source.salePrice, source, now);
    budget.noteAuthorizationBoundary(decision.recheckAt ?? undefined, now);
    if (regular.currencyCode !== currencyCode || !Number.isSafeInteger(decision.amount) || decision.amount < 0) throw new ConvexError({ code: "invalid_bundle_pricing", message: "Bundle prices need repair." });
    return { amount: decision.amount, currencyCode };
  }
  for (const component of components) {
    const product = await productAccess(component.productId);
    if (!product || product.basePrice.currencyCode !== currencyCode) return null;
    const parsed = parseSourceOptions(product.optionTypes ?? []); if (!parsed.success) return null;
    const groups = parsed.data;
    function validVariant(variant: Doc<"commerce_product_variants">): boolean {
      return isEligibleProductVariant(product!._id, groups, variant);
    }
    const variants: Doc<"commerce_product_variants">[] = [];
    if (component.allowVariantChange) {
      let scanned = 0;
      for (const status of ["publish", undefined] as const) {
        budget.beforeRead();
        const rows = await ctx.db.query("commerce_product_variants").withIndex("by_product_status", q => q.eq("productId", product._id).eq("status", status)).take(129);
        rows.forEach(row => budget.record(row));
        scanned += rows.length;
        if (scanned > 128) capacity();
        variants.push(...rows.filter(validVariant));
      }
    } else if (component.variantId) {
      budget.beforeRead(); const variant = budget.record(await ctx.db.get(component.variantId));
      if (!variant || !validVariant(variant)) return null;
      variants.push(variant);
    }
    if (component.variantId && !variants.some(variant => variant._id === component.variantId)) return null;
    const defaultVariant = variants.find(variant => variant._id === component.variantId) ?? variants.find(variant => variant.isDefault) ?? variants[0];
    if (product.productType === "variable" && !defaultVariant) return null;
    async function projectVariant(variant: Doc<"commerce_product_variants"> | null): Promise<{ price: Money; unitPriceAmount: number; available: boolean }> {
      const policy = resolveStockPolicy(product!, variant);
      const inventoryVariantId = variant && policy.mode !== "parent" ? variant._id : undefined;
      const reserved = policy.tracked ? await readReservedStock(ctx, product!._id, inventoryVariantId, undefined, budget, now) : 0;
      const actual = resolveStockPolicy(product!, variant, reserved), amount = price(variant ?? product!);
      stock.set(`${product!._id}:${variant?._id ?? ""}`, { key: String(inventoryVariantId ?? product!._id), policy: actual });
      return { price: amount, unitPriceAmount: getResolvedComponentUnitPrice(component, amount.amount), available: canOrderQuantity(actual, 1) };
    }
    const choices: PublicBundleVariant[] = [];
    for (const variant of variants) choices.push({ _id: variant._id, title: clip(variant.title, 160)!, name: clip(variant.title, 160)!, ...await projectVariant(variant) });
    const fallback = product.productType === "variable" ? undefined : await projectVariant(null);
    const variant = choices.find(choice => choice._id === defaultVariant?._id);
    const effective = variant ?? fallback; if (!effective) return null;
    projected.push({ _id: component._id, productId: product._id, variantId: variant?._id, quantity: component.quantity,
      minQuantity: component.minQuantity, maxQuantity: component.maxQuantity, isRequired: component.isRequired, isDefault: component.isDefault === true,
      allowVariantChange: component.allowVariantChange === true, label: clip(component.label, 160), sortOrder: component.sortOrder,
      priceOverride: component.priceOverride, discountPercent: component.discountPercent,
      product: { _id: product._id, title: clip(product.title, 160)!, slug: clip(product.slug, 256)!, basePrice: price(product) },
      variant, variants: choices, unitPriceAmount: effective.unitPriceAmount });
    if (!isConfigurableBundle(bundle) || component.isRequired || component.isDefault)
      defaults.push({ componentId: component._id, productId: product._id, variantId: variant?._id, quantity: isConfigurableBundle(bundle) ? component.minQuantity ?? component.quantity : component.quantity });
  }
  let quote: PublicBundlePrice | null = null;
  const selections = options.selections ?? defaults;
  const choicesArePublic = selections.every(selection => {
    const component = projected.find(value => value._id === selection.componentId);
    return component && (!selection.variantId || component.variants.some(variant => variant._id === selection.variantId));
  });
  if (choicesArePublic) {
    let snapshot: BundleSnapshotResult | null = null;
    try { snapshot = await resolveBundleSelectionSnapshot(ctx, { bundle, components, selections, now, budget }); }
    catch (error) { if (!(error instanceof ConvexError) || (typeof error.data === "object" && error.data !== null && "code" in error.data && error.data.code === "CANONICAL_READ_BUDGET")) throw error; }
    if (snapshot && snapshot.selections.length && Number.isSafeInteger(snapshot.resolvedBundlePriceAmount * quantity)) {
      const demand = new Map<string, number>(); let available = true;
      for (const selection of snapshot.selections) {
        const target = stock.get(`${selection.productId}:${selection.variantId ?? ""}`);
        if (!target) { available = false; continue; }
        const amount = (demand.get(target.key) ?? 0) + selection.quantity * quantity;
        if (!Number.isSafeInteger(amount)) { available = false; continue; }
        demand.set(target.key, amount);
      }
      for (const selection of snapshot.selections) {
        const target = stock.get(`${selection.productId}:${selection.variantId ?? ""}`);
        if (!target || !canOrderQuantity(target.policy, demand.get(target.key) ?? 0)) available = false;
      }
      if (bundle.trackInventory && (!Number.isSafeInteger(bundle.stockCount) || (bundle.stockCount ?? 0) < quantity)) available = false;
      const savings = Math.max(0, snapshot.regularPriceAmount - snapshot.resolvedBundlePriceAmount);
      quote = { regularPrice: snapshot.regularPriceAmount, bundlePrice: snapshot.resolvedBundlePriceAmount, savings,
        savingsPercent: snapshot.regularPriceAmount > 0 ? Math.round(savings / snapshot.regularPriceAmount * 100) : 0,
        currencyCode, available, pricedAt: now, recheckAt: budget.authorizationRecheckAt,
        selections: snapshot.selections.map(selection => ({ componentId: selection.componentId, productId: selection.productId, variantId: selection.variantId, quantity: selection.quantity })) };
    }
  }
  const result: PublicBundle = { _id: bundle._id, productId: bundle.productId, name: clip(bundle.name, 160)!, slug: clip(bundle.slug, 256)!,
    description: clip(bundle.description, 12000), shortDescription: clip(bundle.shortDescription, 1000), images: bundle.images.filter(publicImage).slice(0, 20),
    bundleType: bundle.bundleType, pricingType: bundle.pricingType, fixedPrice: bundle.fixedPrice, discountPercent: bundle.discountPercent, discountAmount: bundle.discountAmount,
    regularPrice: quote?.regularPrice, bundlePrice: quote?.bundlePrice, minItems: bundle.minItems, maxItems: bundle.maxItems, status: "active", currencyCode,
    components: projected, quote, pricedAt: now, recheckAt: budget.authorizationRecheckAt };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 128 * 1024) capacity();
  return result;
}
