import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { readPublicBundle, type PublicBundle } from "../commerceBundles/publicBundle";
import { bundleOfferArgsSchema, bundleOfferResultSchema, type BundleOffer, type BundleOfferResult } from "./foundation/bundleOfferContracts";

/** This adapter receives saved block arguments, never a visitor-supplied query. */
export async function readBundleOffer(ctx: QueryCtx, raw: unknown, budget = new RequestReadLedger()): Promise<BundleOfferResult> {
  const args = bundleOfferArgsSchema.parse(raw);
  const id = args.bundle ? ctx.db.normalizeId("commerce_bundles", args.bundle) : null;
  if (!id) return { bundle: null };
  budget.beforeRead();
  const source = budget.record(await ctx.db.get(id));
  const bundle = await readPublicBundle(ctx, source, { budget });
  return bundleOfferResultSchema.parse({ bundle: bundle ? projectBundleOffer(bundle) : null });
}

export function projectBundleOffer(bundle: PublicBundle): BundleOffer {
  return {
    id: bundle._id, productId: bundle.productId, name: bundle.name, slug: bundle.slug,
    href: `/bundles/${encodeURIComponent(bundle.slug)}/`, description: (bundle.shortDescription ?? bundle.description ?? "").slice(0, 3000).replace(/[\uD800-\uDBFF]$/u, ""),
    images: bundle.images, configurable: bundle.bundleType !== "fixed", minItems: bundle.minItems ?? null, maxItems: bundle.maxItems ?? null,
    currencyCode: bundle.currencyCode,
    components: bundle.components.map(component => ({
      id: component._id, productId: component.productId, title: component.label ?? component.product.title,
      href: `/products/${encodeURIComponent(component.product.slug)}/`, quantity: component.quantity,
      minQuantity: component.minQuantity ?? 1, maxQuantity: component.maxQuantity ?? null,
      required: component.isRequired, selectedByDefault: component.isDefault, allowVariantChange: component.allowVariantChange,
      variantId: component.variantId, unitPriceAmount: component.unitPriceAmount,
      variants: component.variants.map(variant => ({ id: variant._id, title: variant.title, unitPriceAmount: variant.unitPriceAmount, available: variant.available })),
    })),
    defaults: bundle.components.filter(component => bundle.bundleType === "fixed" || component.isRequired || component.isDefault).map(component => ({
      componentId: component._id, variantId: component.variantId, quantity: bundle.bundleType === "fixed" ? component.quantity : component.minQuantity ?? component.quantity,
    })),
    quote: bundle.quote ? { regularPrice: bundle.quote.regularPrice, bundlePrice: bundle.quote.bundlePrice,
      savings: bundle.quote.savings, currencyCode: bundle.quote.currencyCode, available: bundle.quote.available,
      pricedAt: bundle.quote.pricedAt, recheckAt: bundle.quote.recheckAt } : null,
  };
}
