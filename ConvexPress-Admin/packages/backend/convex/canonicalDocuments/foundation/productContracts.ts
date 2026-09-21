import { z } from "zod";
import { safeLinkSchema } from "./generated/field_runtime.mjs";

const identity = z.string().min(1).max(256);
const money = z.strictObject({ amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), currencyCode: z.string().regex(/^[A-Z]{3}$/u) });
/** Saved references determine selection; visitors cannot inject a product list. */
export const featuredProductsArgsSchema = z.strictObject({
  productIds: z.array(z.string().max(256)).max(12).default([]),
  count: z.number().int().min(1).max(12).default(4),
  showPrice: z.boolean().default(true),
});
export const publicProductCardSchema = z.strictObject({
  id: identity, title: z.string().max(512), href: safeLinkSchema(z, ["relative"]).max(2048),
  excerpt: z.string().max(8192).nullable(), createdAt: z.number().int().nonnegative(),
  image: z.strictObject({ src: safeLinkSchema(z, ["http", "https", "relative"]).max(4096), alt: z.string().max(1000) }).nullable(),
  pricing: z.strictObject({
    price: money, salePrice: money.nullable(),
    salePriceFrom: z.number().int().safe().nullable(), salePriceTo: z.number().int().safe().nullable(),
    pricedAt: z.number().int().nonnegative(),
  }).nullable(),
});
export const featuredProductsResultSchema = z.strictObject({ items: z.array(publicProductCardSchema).max(12) }).superRefine((value, ctx) => {
  const ids = new Set<string>();
  for (const [index, item] of value.items.entries()) {
    if (ids.has(item.id)) ctx.addIssue({ code: "custom", path: ["items", index], message: "Duplicate product identity" });
    ids.add(item.id);
  }
});
export type FeaturedProductsArgs = z.infer<typeof featuredProductsArgsSchema>;
export type FeaturedProductsResult = z.infer<typeof featuredProductsResultSchema>;
export function featuredProductsMatchArgs(args: FeaturedProductsArgs, result: FeaturedProductsResult): boolean {
  if (result.items.length > args.count || (!args.showPrice && result.items.some(item => item.pricing !== null))) return false;
  // An explicitly supplied but empty/invalid reference never switches to latest.
  if (args.productIds.length) {
    const selected = [...new Set(args.productIds)]; let previous = -1;
    for (const item of result.items) {
      const index = selected.indexOf(item.id);
      if (index <= previous) return false;
      previous = index;
    }
  } else {
    for (let index = 1; index < result.items.length; index++)
      if (result.items[index]!.createdAt > result.items[index - 1]!.createdAt) return false;
  }
  return true;
}
