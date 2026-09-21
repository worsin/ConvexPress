import { z } from "zod";
import { publicProductCardSchema } from "./productContracts";

const id = z.string().min(1).max(256);
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const quantity = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const bundleOfferArgsSchema = z.strictObject({ bundle: id.optional() });
export type BundleOfferArgs = z.infer<typeof bundleOfferArgsSchema>;
export const bundleChoiceSchema = z.strictObject({ componentId: id, variantId: id.optional(), quantity });
export type BundleChoice = z.infer<typeof bundleChoiceSchema>;
export const bundleQuoteSchema = z.strictObject({
  regularPrice: amount, bundlePrice: amount, savings: amount, available: z.boolean(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/u), pricedAt: amount, recheckAt: amount.nullable(),
});
export const bundleOfferSchema = z.strictObject({
  id, productId: id, name: z.string().min(1).max(160), slug: id,
  href: publicProductCardSchema.shape.href, description: z.string().max(3000),
  images: z.array(publicProductCardSchema.shape.image.unwrap().shape.src).max(20),
  configurable: z.boolean(), minItems: quantity.nullable(), maxItems: quantity.nullable(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/u),
  components: z.array(z.strictObject({
    id, productId: id, title: z.string().min(1).max(160), href: publicProductCardSchema.shape.href,
    quantity, minQuantity: quantity, maxQuantity: quantity.nullable(),
    required: z.boolean(), selectedByDefault: z.boolean(), allowVariantChange: z.boolean(),
    variantId: id.optional(), unitPriceAmount: amount,
    variants: z.array(z.strictObject({ id, title: z.string().min(1).max(160), unitPriceAmount: amount, available: z.boolean() })).max(128),
  })).min(1).max(128),
  defaults: z.array(bundleChoiceSchema).max(128), quote: bundleQuoteSchema.nullable(),
}).superRefine((bundle, ctx) => {
  if (new Set(bundle.components.map(component => component.id)).size !== bundle.components.length)
    ctx.addIssue({ code: "custom", message: "Duplicate bundle component" });
  if (new Set(bundle.defaults.map(choice => choice.componentId)).size !== bundle.defaults.length)
    ctx.addIssue({ code: "custom", message: "Duplicate default choice" });
  for (const choice of bundle.defaults) {
    const component = bundle.components.find(item => item.id === choice.componentId);
    if (!component || choice.variantId && !component.variants.some(variant => variant.id === choice.variantId))
      ctx.addIssue({ code: "custom", message: "Default choice is outside this bundle" });
  }
  if (bundle.quote && bundle.quote.currencyCode !== bundle.currencyCode)
    ctx.addIssue({ code: "custom", message: "Bundle currencies differ" });
});
export const bundleOfferResultSchema = z.strictObject({ bundle: bundleOfferSchema.nullable() });
export type BundleOffer = z.infer<typeof bundleOfferSchema>;
export type BundleOfferResult = z.infer<typeof bundleOfferResultSchema>;
export type BundleQuote = z.infer<typeof bundleQuoteSchema>;
export function bundleOfferMatchesArgs(args: BundleOfferArgs, result: BundleOfferResult): boolean {
  return result.bundle === null || result.bundle.id === args.bundle;
}
