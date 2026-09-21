/** Service-only reader. The canonical endpoint supplies the authorized saved tree. */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireCommerceEnabled } from "../commerce/helpers";
import { createPublicProductAccessReader } from "../commerce/publicProductAccess";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { SourceByteLedger } from "./sourceBudget";
import { CanonicalDataError } from "./foundation/contracts";
import { featuredProductsArgsSchema, featuredProductsResultSchema, type FeaturedProductsResult } from "./foundation/productContracts";

export {readPublicCardVariant} from "../commerce/publicProductVariant";

/** One request-scoped projector shared by commerce blocks. It owns the same
 * plugin, membership, public variant, media and price disclosure policy. */
export async function createPublicProductCardProjector(ctx: QueryCtx, showPrice: boolean,
  budget: RequestReadLedger, sources: SourceByteLedger, now = Date.now()) {
  await requireCommerceEnabled(ctx, budget);
  const readAccess = createPublicProductAccessReader(ctx, budget, sources, now);
  const mediaCache = new Map<Id<"media">, FeaturedProductsResult["items"][number]["image"]>();
  return async (product: Doc<"commerce_products"> | null): Promise<FeaturedProductsResult["items"][number] | null> => {
    if (!product) return null;
    sources.record("product", product);
    const access = await readAccess(product);
    if (!access) return null;
    // Bundle-owned products are sold through their dedicated bundle document.
    budget.beforeRead();
    if (budget.record(await ctx.db.query("commerce_bundles").withIndex("by_product", q => q.eq("productId", product._id)).first())) return null;
    const href = `/products/${encodeURIComponent(product.slug)}`;
    const { variant } = access;
    let image: FeaturedProductsResult["items"][number]["image"] = null;
    const mediaId = variant?.featuredMediaId ?? product.featuredMediaId;
    if (mediaId) {
      if (!mediaCache.has(mediaId)) {
        sources.beforeRead(); budget.beforeRead();
        const media = budget.record(await ctx.db.get("media", mediaId));
        if (media) sources.record("media", media);
        let src: string | null | undefined = null;
        if (media && media.status === "active" && media.mediaType === "image" && media.mimeType.startsWith("image/")) {
          if (media.storageId) { budget.beforeRead(); src = await ctx.storage.getUrl(media.storageId); }
          src ??= media.url;
        }
        mediaCache.set(mediaId, src ? { src, alt: media?.altText ?? "" } : null);
      }
      image = mediaCache.get(mediaId) ?? null;
    }
    const priced = variant ?? product;
    return { id: product._id, title: product.title, href, excerpt: product.excerpt ?? null, createdAt: product.createdAt, image,
      pricing: showPrice ? { price: variant?.price ?? product.basePrice, salePrice: priced.salePrice ?? null,
        salePriceFrom: priced.salePriceFrom ?? null, salePriceTo: priced.salePriceTo ?? null, pricedAt: now } : null,
    };
  };
}

export async function readFeaturedProducts(ctx: QueryCtx, rawArgs: unknown,
  budget = new RequestReadLedger(), sources = new SourceByteLedger()): Promise<FeaturedProductsResult> {
  const args = featuredProductsArgsSchema.parse(rawArgs);
  const items: FeaturedProductsResult["items"] = [];
  const project = await createPublicProductCardProjector(ctx, args.showPrice, budget, sources);
  const append = async (product: Doc<"commerce_products"> | null) => {
    const card = await project(product);
    if (card) items.push(card);
  };
  if (args.productIds.length) {
    for (const rawId of new Set(args.productIds)) {
      if (items.length >= args.count) break;
      const id = ctx.db.normalizeId("commerce_products", rawId);
      if (!id) continue;
      sources.beforeRead(); budget.beforeRead();
      await append(budget.record(await ctx.db.get("commerce_products", id)));
    }
  } else {
    const iterator = ctx.db.query("commerce_products").withIndex("by_status_created", q => q.eq("status", "publish")).order("desc")[Symbol.asyncIterator]();
    let scanned = 0;
    try {
      while (items.length < args.count) {
        sources.beforeRead(); budget.beforeRead();
        const next = await iterator.next(); if (next.done) break;
        const product = budget.record(next.value);
        if (++scanned > 160) { sources.record("product", product); throw new CanonicalDataError("PRODUCT_DISCOVERY_BUDGET", "featuredProducts", "Product discovery exceeds its bounded scan; no partial list is returned."); }
        await append(product);
      }
    } finally { await iterator.return?.(); }
  }
  return featuredProductsResultSchema.parse({ items });
}
