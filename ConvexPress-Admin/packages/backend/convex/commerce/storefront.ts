// @ts-nocheck
import { assertCartAccess, getCurrentShopper } from "./shopperAccess";
import { resolvePrice, isPublicVariant, type PriceInput } from "./activePrice";
import { isClosedCart } from "./cartLifecycle";
import { assistantScope } from "./assistant/scope";
// TS2589: the generated commerce schema union exceeds TypeScript's instantiation depth
// inside Convex's typecheck; handlers are annotated `any` like the rest of convex/commerce.
/**
 * Storefront discovery queries.
 *
 * Public, session-scoped reads used by the shop search page, the cart, and
 * the shopping assistant:
 *   - searchProducts        hybrid title + full-text product search with facets
 *   - productCards          compact cards for a list of product ids
 *   - relatedForProducts    relation-graph neighbours, grouped by purpose
 *   - relatedForCart        the same, seeded from the session's cart
 *   - cartContext           compact cart lines the assistant reasons over
 *   - facetsForQuery        cached AI "narrow your search" chips
 */

import { ConvexError, v } from "convex/values";
import { resolveStockPolicy, canOrderQuantity } from "./stockPolicy";
import { query } from "../_generated/server";
import { requireCommerceEnabled } from "./helpers";
import { getSettingsDoc } from "../settings/helpers";
import { RELATION_GROUP, RELATION_GROUP_LABEL, type RelationType } from "./relations";
import { productRelationTypeValidator } from "../schema/commerceAssistant";

const CARD_FIELDS_LIMIT = 48;

// Keep a complete result or fail explicitly before Convex's transaction limit;
// never present the first arbitrary slice as a complete recommendation ranking.
const MAX_CART_LINES = 160;
const MAX_RELATION_EDGES = 1000;

export async function visibleCategories(ctx: any, limit = 60) {
  const batches = await Promise.all([true, undefined].map(visible => ctx.db.query("commerce_product_categories")
    .withIndex("by_visible", (q: any) => q.eq("isVisible", visible)).take(limit)));
  return batches.flat().sort((a: any, b: any) => a._creationTime - b._creationTime || String(a._id).localeCompare(String(b._id))).slice(0, limit);
}

async function publicDefaultVariant(ctx: any, productId: string) {
  const choose = (rows: any[]) => rows.filter(Boolean).sort((a, b) => a._creationTime - b._creationTime || String(a._id).localeCompare(String(b._id)))[0];
  const defaults = await Promise.all(["publish", undefined].map(status => ctx.db.query("commerce_product_variants")
    .withIndex("by_product_status_default", (q: any) => q.eq("productId", productId).eq("status", status).eq("isDefault", true)).first()));
  const preferred = choose(defaults);
  if (preferred) return preferred;
  return choose(await Promise.all(["publish", undefined].map(status => ctx.db.query("commerce_product_variants")
    .withIndex("by_product_status", (q: any) => q.eq("productId", productId).eq("status", status)).first())));
}

export async function publicCartLines(ctx: any, cart: any) {
  if (!cart || isClosedCart(cart)) return [];
  const items = await ctx.db.query("commerce_cart_items").withIndex("by_cart", (q: any) => q.eq("cartId", cart._id)).take(MAX_CART_LINES + 1);
  if (items.length > MAX_CART_LINES) throw new ConvexError({ code: "CART_LIMIT", message: "This cart is too large for the shopping assistant." });
  const lines = [];
  for (const item of items) {
    const product = await ctx.db.get("commerce_products", item.productId);
    const variant = item.variantId ? await ctx.db.get("commerce_product_variants", item.variantId) : null;
    const unavailable = !product || product.status !== "publish" || !!item.variantId && (!variant || variant.productId !== item.productId || !isPublicVariant(variant));
    lines.push({ productId: String(item.productId), variantId: item.variantId ? String(item.variantId) : null,
      title: unavailable ? "Unavailable product" : product.title, variantTitle: unavailable ? null : variant?.title ?? null,
      slug: unavailable ? "" : product.slug, quantity: item.quantity, unitPriceAmount: item.unitPriceAmount, lineTotalAmount: item.lineTotalAmount,
      featuredMediaId: !unavailable && product.featuredMediaId ? String(product.featuredMediaId) : null,
      attributes: unavailable ? null : product.conversationalAttributes ?? null, summary: unavailable ? null : product.assistantSummary ?? null,
      ...(unavailable ? { unavailable: true } : {}),
    });
  }
  return lines;
}

// Validators hoisted out of the registrations (TS2589 guard, see relations.ts).
const searchProductsArgs = {
  q: v.optional(v.string()),
  categorySlug: v.optional(v.string()),
  maxPriceAmount: v.optional(v.number()),
  minPriceAmount: v.optional(v.number()),
  inStockOnly: v.optional(v.boolean()),
  sort: v.optional(
    v.union(v.literal("relevance"), v.literal("price_asc"), v.literal("price_desc"), v.literal("newest")),
  ),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
};
const productCardsArgs = { productIds: v.array(v.string()) };
const slugArgs = { slug: v.string() };
const relatedForProductsArgs = {
  productIds: v.array(v.string()),
  perGroup: v.optional(v.number()),
  types: v.optional(v.array(productRelationTypeValidator)),
};
const sessionArgs = { sessionToken: v.string(), perGroup: v.optional(v.number()) };
const sessionOnlyArgs = { sessionToken: v.string() };
const queryArgs = { q: v.string(), sessionToken: v.optional(v.string()) };
const slugsArgs = { slugs: v.array(v.string()) };
const categoryTilesArgs = { slugs: v.optional(v.array(v.string())), limit: v.optional(v.number()) };

export interface ProductCard {
  pricing?: PriceInput & { price: { amount: number; currencyCode: string }; pricedAt: number };
  productId: string;
  slug: string;
  title: string;
  excerpt: string;
  summary: string | null;
  price: { amount: number; currencyCode: string };
  compareAtPrice: { amount: number; currencyCode: string } | null;
  featuredMediaId: string | null;
  categories: Array<{ id: string; name: string; slug: string }>;
  inStock: boolean;
  stockQuantity: number | null;
  productType: string;
  attributes: Record<string, unknown> | null;
  defaultVariantId: string | null;
}

function saleActive(product: any, now: number): boolean {
  return resolvePrice(product.basePrice, product.salePrice, product, now).saleActive;
}

export async function toProductCard(ctx: any, product: any): Promise<ProductCard> {
  const now = Date.now();
  const categories = (
    await Promise.all((product.categoryIds ?? []).map((id: any) => ctx.db.get(id)))
  )
    .filter((category: any) => category && category.isVisible !== false)
    .map((category: any) => ({ id: String(category._id), name: category.name, slug: category.slug }));

  let pricing = { price: product.basePrice, salePrice: product.salePrice, salePriceFrom: product.salePriceFrom, salePriceTo: product.salePriceTo, pricedAt: now };
  let price = product.basePrice;
  let compareAtPrice: { amount: number; currencyCode: string } | null = null;
  let defaultVariantId: string | null = null;
  let chosen: any = null;
  if (product.productType === "variable") {
    chosen = await publicDefaultVariant(ctx, product._id);
    if (chosen) {
      defaultVariantId = String(chosen._id);
      pricing = { price: chosen.price, salePrice: chosen.salePrice, salePriceFrom: chosen.salePriceFrom, salePriceTo: chosen.salePriceTo, pricedAt: now };
      const active = resolvePrice(chosen.price, chosen.salePrice, chosen, now);
      price = { ...chosen.price, amount: active.amount };
      compareAtPrice = active.amount < chosen.price.amount ? chosen.price : null;
    }
  } else if (saleActive(product, now)) {
    price = { ...product.basePrice, amount: resolvePrice(product.basePrice, product.salePrice, product, now).amount };
    compareAtPrice = price.amount < product.basePrice.amount ? product.basePrice : null;
  }

  const stock = resolveStockPolicy(product, chosen);
  const stockQuantity = stock.tracked ? stock.available : null;
  const inStock = (product.productType !== "variable" || defaultVariantId !== null) && canOrderQuantity(stock, 1);

  return {
    productId: String(product._id),
    slug: product.slug,
    title: product.title,
    excerpt: (product.excerpt ?? "").replace(/<[^>]+>/g, "").slice(0, 240),
    summary: product.assistantSummary ?? null,
    price,
    pricing,
    compareAtPrice,
    featuredMediaId: product.featuredMediaId ? String(product.featuredMediaId) : null,
    categories,
    inStock,
    stockQuantity,
    productType: product.productType,
    attributes: (product.conversationalAttributes as Record<string, unknown> | undefined) ?? null,
    defaultVariantId,
  };
}

async function loadPublishedByIds(ctx: any, ids: string[]): Promise<any[]> {
  const docs = await Promise.all(ids.slice(0, CARD_FIELDS_LIMIT).map((id) => ctx.db.get("commerce_products", id as any).catch(() => null)));
  return docs.filter((doc: any) => doc && doc.status === "publish");
}

// ─── Search ──────────────────────────────────────────────────────────────────

export const searchProducts = query({
  args: searchProductsArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const q = (args.q ?? "").trim();
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(48, Math.max(1, args.perPage ?? 12));

    let scored: Array<{ product: any; score: number }> = [];
    if (q) {
      const [byTitle, byText] = await Promise.all([
        ctx.db
          .query("commerce_products")
          .withSearchIndex("search_commerce_products", (s: any) => s.search("title", q).eq("status", "publish"))
          .take(60),
        ctx.db
          .query("commerce_products")
          .withSearchIndex("search_commerce_products_text", (s: any) =>
            s.search("searchText", q).eq("status", "publish"),
          )
          .take(120),
      ]);
      const map = new Map<string, { product: any; score: number }>();
      byTitle.forEach((product: any, index: number) => {
        map.set(String(product._id), { product, score: 2 / (index + 1) + 1 });
      });
      byText.forEach((product: any, index: number) => {
        const key = String(product._id);
        const bonus = 1 / (index + 1);
        const existing = map.get(key);
        if (existing) existing.score += bonus;
        else map.set(key, { product, score: bonus });
      });
      scored = [...map.values()];
    } else {
      const products = await ctx.db
        .query("commerce_products")
        .withIndex("by_status", (s: any) => s.eq("status", "publish"))
        .take(1000);
      scored = products.map((product: any) => ({
        product,
        score: (product.publishedAt ?? product.createdAt ?? 0) / 1e13,
      }));
    }

    // Bundle-owned products are bought through their bundle page.
    const bundles = await ctx.db.query("commerce_bundles").take(500);
    const bundleProductIds = new Set(bundles.map((bundle: any) => String(bundle.productId)));
    scored = scored.filter((entry) => !bundleProductIds.has(String(entry.product._id)));

    let categoryId: string | null = null;
    if (args.categorySlug) {
      const category = await ctx.db
        .query("commerce_product_categories")
        .withIndex("by_slug", (s: any) => s.eq("slug", args.categorySlug))
        .unique();
      categoryId = category ? String(category._id) : "__none__";
    }

    const now = Date.now();
    const priceOf = (product: any) =>
      saleActive(product, now) ? product.salePrice.amount : product.basePrice.amount;

    let filtered = scored.filter(({ product }) => {
      if (categoryId && !(product.categoryIds ?? []).some((id: any) => String(id) === categoryId)) return false;
      const amount = priceOf(product);
      if (typeof args.minPriceAmount === "number" && amount < args.minPriceAmount) return false;
      if (typeof args.maxPriceAmount === "number" && amount > args.maxPriceAmount) return false;
      if (args.inStockOnly && product.trackInventory !== false && (product.stockQuantity ?? 0) <= 0 && !product.allowBackorders)
        return false;
      return true;
    });

    const sort = args.sort ?? (q ? "relevance" : "newest");
    filtered.sort((a, b) => {
      if (sort === "price_asc") return priceOf(a.product) - priceOf(b.product);
      if (sort === "price_desc") return priceOf(b.product) - priceOf(a.product);
      if (sort === "newest")
        return (b.product.publishedAt ?? b.product.createdAt ?? 0) - (a.product.publishedAt ?? a.product.createdAt ?? 0);
      return b.score - a.score;
    });

    // Facets over the filtered set (before pagination).
    const categoryCounts = new Map<string, number>();
    let minAmount = Number.POSITIVE_INFINITY;
    let maxAmount = 0;
    for (const { product } of filtered) {
      for (const id of product.categoryIds ?? []) {
        categoryCounts.set(String(id), (categoryCounts.get(String(id)) ?? 0) + 1);
      }
      const amount = priceOf(product);
      minAmount = Math.min(minAmount, amount);
      maxAmount = Math.max(maxAmount, amount);
    }
    const facetCategories = (
      await Promise.all([...categoryCounts.entries()].map(async ([id, count]) => {
        const category = await ctx.db.get(id as any);
        return category && category.isVisible !== false ? { id, name: category.name, slug: category.slug, count } : null;
      }))
    ).filter(Boolean);

    const total = filtered.length;
    const start = (page - 1) * perPage;
    const items = await Promise.all(
      filtered.slice(start, start + perPage).map(({ product }) => toProductCard(ctx, product)),
    );

    return {
      query: q,
      items,
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      facets: {
        categories: facetCategories,
        priceRange: total ? { min: minAmount, max: maxAmount } : null,
      },
    };
  },
});

// ─── Cards ───────────────────────────────────────────────────────────────────

export const productCards = query({
  args: productCardsArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const products = await loadPublishedByIds(ctx, args.productIds);
    const cards = await Promise.all(products.map((product: any) => toProductCard(ctx, product)));
    const order = new Map(args.productIds.map((id: string, index: number) => [id, index]));
    cards.sort((a, b) => (order.get(a.productId) ?? 0) - (order.get(b.productId) ?? 0));
    return cards;
  },
});

export const productCardBySlug = query({
  args: slugArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const product = await ctx.db
      .query("commerce_products")
      .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
      .unique();
    if (!product || product.status !== "publish") return null;
    return await toProductCard(ctx, product);
  },
});

export const productCardsBySlugs = query({
  args: slugsArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const cards: ProductCard[] = [];
    for (const slug of args.slugs.slice(0, 24)) {
      const product = await ctx.db
        .query("commerce_products")
        .withIndex("by_slug", (q: any) => q.eq("slug", slug))
        .unique();
      if (product && product.status === "publish") cards.push(await toProductCard(ctx, product));
    }
    return cards;
  },
});

/** Visible categories with a representative product image, for tile grids. */
export const categoryTiles = query({
  args: categoryTilesArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    let categories = await visibleCategories(ctx, 200);
    categories = categories.filter((category: any) => category.isVisible !== false);
    if (args.slugs?.length) {
      const wanted = new Map(args.slugs.map((slug: string, index: number) => [slug, index]));
      categories = categories
        .filter((category: any) => wanted.has(category.slug))
        .sort((a: any, b: any) => (wanted.get(a.slug) ?? 0) - (wanted.get(b.slug) ?? 0));
    } else {
      categories.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    const products = await ctx.db
      .query("commerce_products")
      .withIndex("by_status", (q: any) => q.eq("status", "publish"))
      .take(1000);
    const tiles = [];
    for (const category of categories.slice(0, Math.min(24, args.limit ?? 12))) {
      const members = products.filter((product: any) =>
        (product.categoryIds ?? []).some((id: any) => String(id) === String(category._id)),
      );
      const cover = members.find((product: any) => product.featuredMediaId) ?? null;
      if (!members.length && args.slugs?.length === undefined) continue;
      tiles.push({
        id: String(category._id),
        slug: category.slug,
        name: category.name,
        description: category.description ?? "",
        productCount: members.length,
        coverMediaId: category.thumbnailMediaId
          ? String(category.thumbnailMediaId)
          : cover?.featuredMediaId
            ? String(cover.featuredMediaId)
            : null,
        coverTitle: cover?.title ?? null,
      });
    }
    return tiles;
  },
});

// ─── Relations ───────────────────────────────────────────────────────────────

export interface RelatedGroup {
  key: string;
  label: string;
  items: Array<{ card: ProductCard; reason: string | null; weight: number; forProductId: string; type: RelationType }>;
}

export async function relatedGroups(
  ctx: any,
  seedProductIds: string[],
  options: { perGroup: number; types?: RelationType[]; excludeIds?: Set<string> },
): Promise<RelatedGroup[]> {
  seedProductIds = [...new Set(seedProductIds)];
  if (seedProductIds.length > MAX_CART_LINES) throw new ConvexError({ code: "RELATION_LIMIT", message: "Too many products for recommendations. Choose fewer products." });
  const exclude = new Set(options.excludeIds ?? []);
  let edgeCount = 0;
  const perGroup = Number.isFinite(options.perGroup) ? Math.min(6, Math.max(1, Math.floor(options.perGroup))) : 2;
  for (const id of seedProductIds) exclude.add(id);
  const grouped = new Map<string, Map<string, { weight: number; reason: string | null; forProductId: string; type: RelationType }>>();

  for (const seedId of seedProductIds) {
    const seed = await ctx.db.get("commerce_products", seedId).catch(() => null);
    if (!seed || seed.status !== "publish") continue;
    const edges = await ctx.db
      .query("commerce_product_relations")
      .withIndex("by_from_status", (q: any) => q.eq("fromProductId", seedId).eq("status", "active"))
      .take(MAX_RELATION_EDGES - edgeCount + 1);
    edgeCount += edges.length;
    if (edgeCount > MAX_RELATION_EDGES) throw new ConvexError({ code: "RELATION_LIMIT", message: "Too many recommendations to rank safely. Please narrow the selected products." });
    for (const edge of edges) {
      if (options.types && !options.types.includes(edge.type)) continue;
      const targetId = String(edge.toProductId);
      if (exclude.has(targetId)) continue;
      const groupKey = RELATION_GROUP[edge.type as RelationType];
      const bucket = grouped.get(groupKey) ?? new Map();
      const current = bucket.get(targetId);
      if (!current || current.weight < edge.weight) {
        bucket.set(targetId, {
          weight: edge.weight,
          reason: edge.evidence ?? null,
          forProductId: seedId,
          type: edge.type,
        });
      }
      grouped.set(groupKey, bucket);
    }
  }

  const groups: RelatedGroup[] = [];
  for (const [key, bucket] of grouped) {
    const ranked = [...bucket.entries()].sort((a, b) => b[1].weight - a[1].weight);
    const items = [];
    for (const [id, meta] of ranked) {
      const product = await ctx.db.get("commerce_products", id);
      if (!product || product.status !== "publish") continue;
      items.push({ card: await toProductCard(ctx, product), reason: meta.reason, weight: meta.weight, forProductId: meta.forProductId, type: meta.type });
      if (items.length >= perGroup) break;
    }
    if (items.length) groups.push({ key, label: RELATION_GROUP_LABEL[key] ?? key, items });
  }
  const order = ["accessory", "consumable", "maintenance", "upgrade", "similar"];
  groups.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return groups;
}

export const relatedForProducts = query({
  args: relatedForProductsArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    return await relatedGroups(ctx, args.productIds, {
      perGroup: Math.min(6, Math.max(1, args.perGroup ?? 2)),
      types: args.types,
    });
  },
});

async function cartProductIds(ctx: any, sessionToken: string): Promise<string[]> {
  const cart = await ctx.db
    .query("commerce_carts")
    .withIndex("by_session", (q: any) => q.eq("sessionToken", sessionToken))
    .unique();
  if (cart) assertCartAccess(cart, sessionToken, (await getCurrentShopper(ctx))?._id);
  if (!cart || isClosedCart(cart)) return [];
  return [...new Set((await publicCartLines(ctx, cart)).filter((line: any) => !line.unavailable).map((line: any) => line.productId))] as string[];
}

export const relatedForCart = query({
  args: sessionArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const seeds = await cartProductIds(ctx, args.sessionToken);
    if (!seeds.length) return [];
    return await relatedGroups(ctx, seeds, { perGroup: Math.min(6, Math.max(1, args.perGroup ?? 2)) });
  },
});

// ─── Cart context ────────────────────────────────────────────────────────────

export const cartContext = query({
  args: sessionOnlyArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const cart = await ctx.db
      .query("commerce_carts")
      .withIndex("by_session", (q: any) => q.eq("sessionToken", args.sessionToken))
      .unique();
    if (cart) assertCartAccess(cart, args.sessionToken, (await getCurrentShopper(ctx))?._id);
    if (!cart || isClosedCart(cart)) return { itemCount: 0, subtotalAmount: 0, currencyCode: "USD", lines: [] as any[] };
    const lines = await publicCartLines(ctx, cart);
    return {
      itemCount: cart.itemCount,
      subtotalAmount: cart.subtotalAmount,
      currencyCode: cart.currencyCode,
      lines,
    };
  },
});

// ─── Facets ──────────────────────────────────────────────────────────────────

export function hashQuery(value: string): string {
  let hash = 2166136261;
  const normalized = value.trim().toLowerCase();
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `${normalized.length}-${hash.toString(16)}`;
}

export const facetsForQuery = query({
  args: queryArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    if (args.sessionToken) await assistantScope(ctx, args.sessionToken);
    const doc = await ctx.db
      .query("commerce_search_facets")
      .withIndex("by_query_hash", (q: any) => q.eq("queryHash", hashQuery(args.q)))
      .unique();
    if (doc?.banned) return null;
    // Curated chips are public. Model-written chips belong to the shopper's brief.
    if (doc?.pinned) return { chips: doc.chips, generatedAt: doc.generatedAt, pinned: true };
    if (!args.sessionToken) return null;
    const brief = await ctx.db.query("commerce_assistant_briefs")
      .withIndex("by_session_query", (q: any) => q.eq("sessionToken", args.sessionToken).eq("kind", "query").eq("query", args.q.trim().slice(0, 200)))
      .order("desc").first();
    if (!brief || brief.expiresAt <= Date.now()) return null;
    const assistant = (await getSettingsDoc(ctx, "commerce.assistant"))?.values ?? {};
    if (assistant.enabled === false || (assistant.memoryEnabled === false && brief.payload?.memoryEnabled !== false)) return null;
    const blocks = Array.isArray(brief.payload?.blocks) ? brief.payload.blocks : [];
    const facets = blocks.find((block: any) => block?.type === "facets");
    const chips = Array.isArray(facets?.items) ? facets.items.filter((item: any) => typeof item?.label === "string").slice(0, 12).map((item: any) => ({
      label: item.label.slice(0, 80),
      ...(typeof item.query === "string" ? { query: item.query.slice(0, 200) } : {}),
      ...(typeof item.categorySlug === "string" ? { categorySlug: item.categorySlug.slice(0, 100) } : {}),
    })) : [];
    return chips.length ? { chips, generatedAt: brief.generatedAt, pinned: false } : null;
  },
});
