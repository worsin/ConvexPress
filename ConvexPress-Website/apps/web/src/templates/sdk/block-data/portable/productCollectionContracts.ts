import { z } from "zod";
import { fingerprintCanonicalJson } from "./shared/fingerprints";
/** Request-local product candidates, never saved block attributes or identity. */
export const recentlyViewedIdsSchema = z.array(z.string().min(1).max(256)).max(48).transform(ids => [...new Set(ids)]);
export function productHistoryDigest(ids: readonly string[] = []): string {
  return fingerprintCanonicalJson(recentlyViewedIdsSchema.parse(ids));
}
import { publicProductCardSchema } from "./productContracts";

const productIds = (max: number) => z.array(z.string().max(256)).max(max);
export const productCollectionArgsSchema = z.strictObject({
  mode: z.enum(["manual", "category", "tag", "sale", "featured", "recent", "recentlyViewed"]).default("manual"),
  productIds: productIds(48).default([]),
  categorySlug: z.string().max(160).default(""),
  tagSlug: z.string().max(160).default(""),
  count: z.number().int().min(1).max(48).default(4),
  showPrice: z.boolean().default(true),
  showRating: z.boolean().default(false),
  showAddToCart: z.boolean().default(false),
  groups: z.array(z.strictObject({ productIds: productIds(24) })).max(8).default([]),
}).superRefine((args, ctx) => {
  if (args.mode !== "sale" && args.mode !== "recentlyViewed" && args.count > 24)
    ctx.addIssue({ code: "custom", path: ["count"], message: "This collection supports up to 24 products." });
  if (args.mode === "category" && !args.categorySlug.trim())
    ctx.addIssue({ code: "custom", path: ["categorySlug"], message: "Choose a product category." });
  if (args.mode === "tag" && !args.tagSlug.trim())
    ctx.addIssue({ code: "custom", path: ["tagSlug"], message: "Choose a product tag." });
});

// No visitor/session identity or arbitrary query arguments belong in a saved
// block binding. Recently viewed selection comes from the authorized request.
export const productCollectionCardSchema = publicProductCardSchema.extend({
  rating: z.strictObject({
    average: z.number().finite().min(1).max(5),
    count: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }).nullable(),
  cart: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("add"), productId: z.string().min(1).max(256) }),
    z.strictObject({ kind: z.literal("chooseOptions") }),
  ]).nullable(),
}).superRefine((card, ctx) => {
  if (card.cart?.kind === "add" && card.cart.productId !== card.id)
    ctx.addIssue({ code: "custom", path: ["cart"], message: "Cart target must match the displayed product." });
});
const itemsSchema = z.array(productCollectionCardSchema).max(48).superRefine((items, ctx) => {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) ctx.addIssue({ code: "custom", path: [index], message: "Duplicate product identity." });
    seen.add(item.id);
  }
});
export const productCollectionResultSchema = z.strictObject({
  items: itemsSchema,
  groups: z.array(z.strictObject({ index: z.number().int().min(0).max(7), items: itemsSchema })).max(8),
});
export type ProductCollectionArgs = z.infer<typeof productCollectionArgsSchema>;
export type ProductCollectionResult = z.infer<typeof productCollectionResultSchema>;
export type ProductCollectionCard = z.infer<typeof productCollectionCardSchema>;

/** Validate display disclosures and saved manual/group selection on both sides. */
export function productCollectionMatchArgs(args: ProductCollectionArgs, result: ProductCollectionResult): boolean {
  const matches = (items: ProductCollectionCard[], selected?: string[]) => {
    if (items.length > args.count) return false;
    let previous = -1;
    const ids = selected && [...new Set(selected)];
    for (const item of items) {
      if ((!args.showPrice && item.pricing !== null) || (!args.showRating && item.rating !== null)
        || (!args.showAddToCart && item.cart !== null)) return false;
      if (ids) {
        const index = ids.indexOf(item.id);
        if (index <= previous) return false;
        previous = index;
      }
    }
    return true;
  };
  if (!matches(result.items, args.mode === "manual" ? args.productIds : undefined)) return false;
  if (args.mode === "recent" && result.items.some((item, i) => i > 0 && item.createdAt > result.items[i - 1]!.createdAt)) return false;
  if (result.groups.length !== args.groups.length) return false;
  return result.groups.every((group, index) => group.index === index && matches(group.items, args.groups[index]!.productIds));
}
