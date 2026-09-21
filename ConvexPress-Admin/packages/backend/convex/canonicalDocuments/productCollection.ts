import {readActiveSaleCandidates} from "../commerce/productSaleIndex";
import {readProductRatingSummary} from "../commerceReviews/ratingIndex";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isCommerceReviewsEnabled } from "../commerce/helpers";
import { readProductDiscoveryCandidates, MAX_PRODUCT_DISCOVERY_CANDIDATES } from "../commerce/productDiscovery";
import { findVisibleProductTag } from "../commerce/productTags";
import { readReservedStock } from "../commerce/stockTarget";
import { canOrderQuantity, resolveStockPolicy } from "../commerce/stockPolicy";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { SourceByteLedger } from "./sourceBudget";
import { createPublicProductCardProjector } from "./featuredProducts";
import { CanonicalDataError } from "./foundation/contracts";
import { resolvePrice } from "./foundation/commercePricing";
import { productCollectionArgsSchema, productCollectionResultSchema, productCollectionMatchArgs, type ProductCollectionCard, type ProductCollectionResult } from "./foundation/productCollectionContracts";

const MAX_CANDIDATES = MAX_PRODUCT_DISCOVERY_CANDIDATES;
function refuse(code: string, message: string): never { throw new CanonicalDataError(code, "productCollection", message); }

/** Service-only. A registered adapter must supply the authorized saved tree.
 * Visitor candidates are request-local hints, never authority or saved args.
 * Their order is newest-view-first; every ID still passes current source policy. */
export async function readProductCollection(ctx: QueryCtx, rawArgs: unknown,
  budget = new RequestReadLedger(), sources = new SourceByteLedger(),
  request: { recentlyViewedIds?: readonly string[]; now?: number } = {}): Promise<ProductCollectionResult> {
  const args = productCollectionArgsSchema.parse(rawArgs);
  const now = request.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0) refuse("PRODUCT_COLLECTION_CLOCK", "Invalid collection time.");
  const history = request.recentlyViewedIds ?? [];
  if (history.length > 48 || history.some(id => typeof id !== "string" || id.length > 256))
    refuse("PRODUCT_HISTORY_LIMIT", "Recently viewed supports up to 48 product references.");
  // Sale eligibility needs real pricing even if the author suppresses its display.
  const project = await createPublicProductCardProjector(ctx, args.showPrice || args.mode === "sale", budget, sources, now);
  const reviewsEnabled = args.showRating && await isCommerceReviewsEnabled(ctx, budget);
  const products = new Map<string, Doc<"commerce_products"> | null>();
  const cards = new Map<string, ProductCollectionCard | null>();
  const load = async (rawId: string) => {
    if (!products.has(rawId)) {
      const id = ctx.db.normalizeId("commerce_products", rawId);
      if (!id) products.set(rawId, null);
      else { sources.beforeRead(); budget.beforeRead(); products.set(rawId, budget.record(await ctx.db.get("commerce_products", id))); }
    }
    return products.get(rawId) ?? null;
  };
  const cardFor = async (rawId: string): Promise<ProductCollectionCard | null> => {
    if (cards.has(rawId)) return cards.get(rawId) ?? null;
    const product = await load(rawId);
    if (product?.status === "publish") budget.noteAuthorizationBoundary(product.publishedAt, now);
    const base = await project(product);
    if (!base || !product) { cards.set(rawId, null); return null; }
    let rating: ProductCollectionCard["rating"] = null;
    if (reviewsEnabled) {
      const summary=await readProductRatingSummary(ctx,product._id,budget);
      if(!summary)refuse("PRODUCT_RATING_NOT_READY","Product ratings need repair; no partial average is returned.");
      if(summary.count)rating={average:summary.average,count:summary.count};
    }
    let cart: ProductCollectionCard["cart"] = null;
    if (args.showAddToCart) {
      if (product.productType === "variable") cart = { kind: "chooseOptions" };
      else if (product.productType === "simple") {
        const initial = resolveStockPolicy(product);
        const reserved = initial.tracked ? await readReservedStock(ctx, product._id, undefined, undefined, budget, now) : 0;
        if (canOrderQuantity(resolveStockPolicy(product, null, reserved), 1)) cart = { kind: "add", productId: product._id };
      }
    }
    const card = { ...base, rating, cart };
    cards.set(rawId, card);
    return card;
  };
  const disclose = (card: ProductCollectionCard): ProductCollectionCard => args.showPrice ? card : { ...card, pricing: null };
  const manual = async (ids: readonly string[]) => {
    const items: ProductCollectionCard[] = [];
    for (const id of new Set(ids)) { if (items.length === args.count) break; const card = await cardFor(id); if (card) items.push(disclose(card)); }
    return items;
  };
  let items: ProductCollectionCard[] = [];
  if (args.mode === "manual") items = await manual(args.productIds);
  else if (args.mode === "recentlyViewed") items = await manual(history);
  else if(args.mode === "sale") {
    let scanned=0;const seen=new Set<string>();
    for await(const candidate of readActiveSaleCandidates(ctx,now,budget)) {
      if(++scanned>MAX_CANDIDATES)refuse("PRODUCT_DISCOVERY_BUDGET","Active sales exceed the authorized candidate budget; no partial list is returned.");
      if(seen.has(candidate.productId))continue;
      const product=await load(candidate.productId);
      if(!product||product.createdAt!==candidate.createdAt)continue;
      seen.add(candidate.productId);
      const card=await cardFor(candidate.productId);if(!card?.pricing)continue;
      const price=card.pricing,decision=resolvePrice(price.price,price.salePrice,{salePriceFrom:price.salePriceFrom??undefined,salePriceTo:price.salePriceTo??undefined},now);
      budget.noteAuthorizationBoundary(decision.recheckAt??undefined,now);
      if(!decision.saleActive)continue;
      items.push(disclose(card));if(items.length===args.count)break;
    }
  }
  else {
    let key = "", available = true;
    const kind = args.mode === "category" ? "category" : args.mode === "tag" ? "tag" : args.mode === "featured" ? "featured" : "recent";
    if (args.mode === "tag") {
      const tag = await findVisibleProductTag(ctx, args.tagSlug, budget);
      available = tag !== null; key = tag?._id ?? "";
    } else if (args.mode === "category") {
      budget.beforeRead();
      const category = budget.record(await ctx.db.query("commerce_product_categories").withIndex("by_slug", q => q.eq("slug", args.categorySlug)).unique());
      available = category !== null && category.isVisible !== false; key = category?._id ?? "";
      // A hidden/deleted ancestor cannot expose a child category. Direct category
      // membership is intentional; descendant expansion is not implied by a slug.
      const seen = new Set<string>(); let parent = category?.parentId;
      while (available && parent) {
        if (seen.has(parent) || seen.size >= 32) refuse("PRODUCT_CATEGORY_HIERARCHY", "Product category hierarchy needs repair.");
        seen.add(parent); budget.beforeRead();
        const row = budget.record(await ctx.db.get("commerce_product_categories", parent));
        available = row !== null && row.isVisible !== false; parent = row?.parentId;
      }
    }
    if (available) {
      const candidates = await readProductDiscoveryCandidates(ctx, kind, key, budget);
      let scanned = 0;
      const seen = new Set<string>();
      for (const candidate of candidates) {
          if (items.length === args.count) break;
          if (++scanned > MAX_CANDIDATES) refuse("PRODUCT_DISCOVERY_BUDGET", "Product discovery exceeds its bounded scan; no partial list is returned.");
          if (seen.has(candidate.productId)) continue;
          const product = await load(candidate.productId);
          // Recheck coordinates so stale index rows never broaden a selection.
          if (!product || product.createdAt !== candidate.createdAt || (kind === "featured" && product.isFeatured !== true)
            || (kind === "category" && !product.categoryIds.includes(key as Id<"commerce_product_categories">))
            || (kind === "tag" && !product.tagIds?.includes(key as Id<"commerce_product_tags">))) continue;
          seen.add(candidate.productId);
          const card = await cardFor(candidate.productId);
          if (!card) continue;
          items.push(disclose(card));
      }
    }
  }
  const groups: ProductCollectionResult["groups"] = [];
  for (const [index, group] of args.groups.entries()) groups.push({ index, items: await manual(group.productIds) });
  const result = productCollectionResultSchema.parse({ items, groups });
  if (!productCollectionMatchArgs(args, result)) refuse("PRODUCT_COLLECTION_RESULT", "Product collection output does not match its saved selection.");
  return result;
}
