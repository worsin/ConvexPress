import { assertCartAccess, getCurrentShopper } from "./shopperAccess";
import { resolvePrice, isPublicVariant, type PriceInput } from "./activePrice";
import { isClosedCart } from "./cartLifecycle";
import { assistantScope } from "./assistant/scope";
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
import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { productAttributesOf, type ProductAttributes } from "./conversationalAttributes";

type ProductDoc = Doc<"commerce_products">;
type VariantDoc = Doc<"commerce_product_variants">;
type CategoryDoc = Doc<"commerce_product_categories">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
import { requireCommerceEnabled } from "./helpers";
import { getSettingsDoc } from "../settings/helpers";
import { RELATION_GROUP, RELATION_GROUP_LABEL, type RelationType } from "./relations";
import { productRelationTypeValidator } from "../schema/commerceAssistant";

const CARD_FIELDS_LIMIT = 48;

// Keep a complete result or fail explicitly before Convex's transaction limit;
// never present the first arbitrary slice as a complete recommendation ranking.
const MAX_CART_LINES = 160;
const MAX_RELATION_EDGES = 1000;

export async function visibleCategories(ctx: Pick<QueryCtx, "db">, limit = 60): Promise<CategoryDoc[]> {
  const batches = await Promise.all(([true, undefined] as const).map(visible => ctx.db.query("commerce_product_categories")
    .withIndex("by_visible", (q) => q.eq("isVisible", visible)).take(limit)));
  return batches.flat().sort((a, b) => a._creationTime - b._creationTime || String(a._id).localeCompare(String(b._id))).slice(0, limit);
}

async function publicDefaultVariant(ctx: Pick<QueryCtx, "db">, productId: Id<"commerce_products">): Promise<VariantDoc | null> {
  const choose = (rows: (VariantDoc | null)[]) => rows.filter((row) => row !== null).sort((a, b) => a._creationTime - b._creationTime || String(a._id).localeCompare(String(b._id)))[0] ?? null;
  const defaults = await Promise.all((["publish", undefined] as const).map(status => ctx.db.query("commerce_product_variants")
    .withIndex("by_product_status_default", (q) => q.eq("productId", productId).eq("status", status).eq("isDefault", true)).first()));
  const preferred = choose(defaults);
  if (preferred) return preferred;
  return choose(await Promise.all((["publish", undefined] as const).map(status => ctx.db.query("commerce_product_variants")
    .withIndex("by_product_status", (q) => q.eq("productId", productId).eq("status", status)).first())));
}

/** A cart line as the assistant and storefront see it. */
export type PublicCartLine = {
  productId: string;
  variantId: string | null;
  title: string;
  variantTitle: string | null;
  slug: string;
  quantity: number;
  unitPriceAmount: number;
  lineTotalAmount: number;
  featuredMediaId: string | null;
  attributes: ProductAttributes | null;
  summary: string | null;
  unavailable?: true;
};

export async function publicCartLines(ctx: Pick<QueryCtx, "db">, cart: Doc<"commerce_carts"> | null): Promise<PublicCartLine[]> {
  if (!cart || isClosedCart(cart)) return [];
  const items = await ctx.db.query("commerce_cart_items").withIndex("by_cart", (q) => q.eq("cartId", cart._id)).take(MAX_CART_LINES + 1);
  if (items.length > MAX_CART_LINES) throw new ConvexError({ code: "CART_LIMIT", message: "This cart is too large for the shopping assistant." });
  const lines: PublicCartLine[] = [];
  for (const item of items) {
    const product = await ctx.db.get("commerce_products", item.productId);
    const variant = item.variantId ? await ctx.db.get("commerce_product_variants", item.variantId) : null;
    const base = { productId: String(item.productId), variantId: item.variantId ? String(item.variantId) : null,
      quantity: item.quantity, unitPriceAmount: item.unitPriceAmount, lineTotalAmount: item.lineTotalAmount };
    const available = product && product.status === "publish" && !(item.variantId && (!variant || variant.productId !== item.productId || !isPublicVariant(variant)));
    lines.push(available
      ? { ...base, title: product.title, variantTitle: variant?.title ?? null, slug: product.slug,
          featuredMediaId: product.featuredMediaId ? String(product.featuredMediaId) : null,
          attributes: productAttributesOf(product.conversationalAttributes), summary: product.assistantSummary ?? null }
      : { ...base, title: "Unavailable product", variantTitle: null, slug: "", featuredMediaId: null,
          attributes: null, summary: null, unavailable: true });
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
  attributes: ProductAttributes | null;
  defaultVariantId: string | null;
}

function saleActive(product: ProductDoc, now: number): boolean {
  return resolvePrice(product.basePrice, product.salePrice, product, now).saleActive;
}

export async function toProductCard(ctx: Pick<QueryCtx, "db">, product: ProductDoc): Promise<ProductCard> {
  const now = Date.now();
  const categories = (
    await Promise.all((product.categoryIds ?? []).map((id) => ctx.db.get("commerce_product_categories", id)))
  )
    .flatMap((category) => (category && category.isVisible !== false ? [{ id: String(category._id), name: category.name, slug: category.slug }] : []));

  let pricing: NonNullable<ProductCard["pricing"]> = { price: product.basePrice, salePrice: product.salePrice, salePriceFrom: product.salePriceFrom, salePriceTo: product.salePriceTo, pricedAt: now };
  let price = product.basePrice;
  let compareAtPrice: { amount: number; currencyCode: string } | null = null;
  let defaultVariantId: string | null = null;
  let chosen: VariantDoc | null = null;
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
    attributes: productAttributesOf(product.conversationalAttributes),
    defaultVariantId,
  };
}

async function loadPublishedByIds(ctx: Pick<QueryCtx, "db">, ids: string[]): Promise<ProductDoc[]> {
  const docs = await Promise.all(ids.slice(0, CARD_FIELDS_LIMIT).map((raw) => {
    const id = ctx.db.normalizeId("commerce_products", raw);
    return id ? ctx.db.get("commerce_products", id) : null;
  }));
  return docs.flatMap((doc) => (doc && doc.status === "publish" ? [doc] : []));
}

// ─── Search ──────────────────────────────────────────────────────────────────

export const searchProducts = query({
  args: searchProductsArgs,
  returns: v.object({
    query: v.string(),
    items: v.array(v.object({
      pricing: v.optional(v.object({
        salePriceFrom: v.optional(v.number()),
        salePriceTo: v.optional(v.number()),
        price: v.object({ amount: v.number(), currencyCode: v.string() }),
        salePrice: v.optional(v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.optional(v.string()) }))),
        pricedAt: v.number(),
      })),
      productId: v.string(),
      slug: v.string(),
      title: v.string(),
      excerpt: v.string(),
      summary: v.union(v.null(), v.string()),
      price: v.object({ amount: v.number(), currencyCode: v.string() }),
      compareAtPrice: v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.string() })),
      featuredMediaId: v.union(v.null(), v.string()),
      categories: v.array(v.object({ id: v.string(), name: v.string(), slug: v.string() })),
      inStock: v.boolean(),
      stockQuantity: v.union(v.null(), v.number()),
      productType: v.string(),
      attributes: v.union(v.null(), v.record(v.string(), v.union(v.boolean(), v.string(), v.number(), v.array(v.union(v.boolean(), v.string(), v.number()))))),
      defaultVariantId: v.union(v.null(), v.string()),
    })),
    total: v.number(),
    page: v.number(),
    perPage: v.number(),
    totalPages: v.number(),
    facets: v.object({
      categories: v.array(v.object({ id: v.string(), name: v.string(), slug: v.string(), count: v.number() })),
      priceRange: v.union(v.null(), v.object({ min: v.number(), max: v.number() })),
    }),
  }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const q = (args.q ?? "").trim();
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(48, Math.max(1, args.perPage ?? 12));

    let scored: Array<{ product: ProductDoc; score: number }> = [];
    if (q) {
      const [byTitle, byText] = await Promise.all([
        ctx.db
          .query("commerce_products")
          .withSearchIndex("search_commerce_products", (s) => s.search("title", q).eq("status", "publish"))
          .take(60),
        ctx.db
          .query("commerce_products")
          .withSearchIndex("search_commerce_products_text", (s) =>
            s.search("searchText", q).eq("status", "publish"),
          )
          .take(120),
      ]);
      const map = new Map<string, { product: ProductDoc; score: number }>();
      byTitle.forEach((product, index) => {
        map.set(String(product._id), { product, score: 2 / (index + 1) + 1 });
      });
      byText.forEach((product, index) => {
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
        .withIndex("by_status", (s) => s.eq("status", "publish"))
        .take(1000);
      scored = products.map((product) => ({
        product,
        score: (product.publishedAt ?? product.createdAt ?? 0) / 1e13,
      }));
    }

    // Bundle-owned products are bought through their bundle page.
    const bundles = await ctx.db.query("commerce_bundles").take(500);
    const bundleProductIds = new Set(bundles.map((bundle) => String(bundle.productId)));
    scored = scored.filter((entry) => !bundleProductIds.has(String(entry.product._id)));

    let categoryId: string | null = null;
    const categorySlug = args.categorySlug;
    if (categorySlug) {
      const category = await ctx.db
        .query("commerce_product_categories")
        .withIndex("by_slug", (s) => s.eq("slug", categorySlug))
        .unique();
      categoryId = category ? String(category._id) : "__none__";
    }

    const now = Date.now();
    const priceOf = (product: ProductDoc) =>
      saleActive(product, now) && product.salePrice ? product.salePrice.amount : product.basePrice.amount;

    let filtered = scored.filter(({ product }) => {
      if (categoryId && !(product.categoryIds ?? []).some((id) => String(id) === categoryId)) return false;
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
    const categoryCounts = new Map<Id<"commerce_product_categories">, number>();
    let minAmount = Number.POSITIVE_INFINITY;
    let maxAmount = 0;
    for (const { product } of filtered) {
      for (const id of product.categoryIds ?? []) {
        categoryCounts.set(id, (categoryCounts.get(id) ?? 0) + 1);
      }
      const amount = priceOf(product);
      minAmount = Math.min(minAmount, amount);
      maxAmount = Math.max(maxAmount, amount);
    }
    const facetCategories = (
      await Promise.all([...categoryCounts.entries()].map(async ([id, count]) => {
        const category = await ctx.db.get("commerce_product_categories", id);
        return category && category.isVisible !== false ? { id: String(id), name: category.name, slug: category.slug, count } : null;
      }))
    ).filter((entry) => entry !== null);

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
  returns: v.array(v.object({
    pricing: v.optional(v.object({
      salePriceFrom: v.optional(v.number()),
      salePriceTo: v.optional(v.number()),
      price: v.object({ amount: v.number(), currencyCode: v.string() }),
      salePrice: v.optional(v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.optional(v.string()) }))),
      pricedAt: v.number(),
    })),
    productId: v.string(),
    slug: v.string(),
    title: v.string(),
    excerpt: v.string(),
    summary: v.union(v.null(), v.string()),
    price: v.object({ amount: v.number(), currencyCode: v.string() }),
    compareAtPrice: v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.string() })),
    featuredMediaId: v.union(v.null(), v.string()),
    categories: v.array(v.object({ id: v.string(), name: v.string(), slug: v.string() })),
    inStock: v.boolean(),
    stockQuantity: v.union(v.null(), v.number()),
    productType: v.string(),
    attributes: v.union(v.null(), v.record(v.string(), v.union(v.boolean(), v.string(), v.number(), v.array(v.union(v.boolean(), v.string(), v.number()))))),
    defaultVariantId: v.union(v.null(), v.string()),
  })),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const products = await loadPublishedByIds(ctx, args.productIds);
    const cards = await Promise.all(products.map((product) => toProductCard(ctx, product)));
    const order = new Map(args.productIds.map((id, index) => [id, index]));
    cards.sort((a, b) => (order.get(a.productId) ?? 0) - (order.get(b.productId) ?? 0));
    return cards;
  },
});

export const productCardBySlug = query({
  args: slugArgs,
  returns: v.union(v.null(), v.object({
    pricing: v.optional(v.object({
      salePriceFrom: v.optional(v.number()),
      salePriceTo: v.optional(v.number()),
      price: v.object({ amount: v.number(), currencyCode: v.string() }),
      salePrice: v.optional(v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.optional(v.string()) }))),
      pricedAt: v.number(),
    })),
    productId: v.string(),
    slug: v.string(),
    title: v.string(),
    excerpt: v.string(),
    summary: v.union(v.null(), v.string()),
    price: v.object({ amount: v.number(), currencyCode: v.string() }),
    compareAtPrice: v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.string() })),
    featuredMediaId: v.union(v.null(), v.string()),
    categories: v.array(v.object({ id: v.string(), name: v.string(), slug: v.string() })),
    inStock: v.boolean(),
    stockQuantity: v.union(v.null(), v.number()),
    productType: v.string(),
    attributes: v.union(v.null(), v.record(v.string(), v.union(v.boolean(), v.string(), v.number(), v.array(v.union(v.boolean(), v.string(), v.number()))))),
    defaultVariantId: v.union(v.null(), v.string()),
  })),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const product = await ctx.db
      .query("commerce_products")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!product || product.status !== "publish") return null;
    return await toProductCard(ctx, product);
  },
});

export const productCardsBySlugs = query({
  args: slugsArgs,
  returns: v.array(v.object({
    pricing: v.optional(v.object({
      salePriceFrom: v.optional(v.number()),
      salePriceTo: v.optional(v.number()),
      price: v.object({ amount: v.number(), currencyCode: v.string() }),
      salePrice: v.optional(v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.optional(v.string()) }))),
      pricedAt: v.number(),
    })),
    productId: v.string(),
    slug: v.string(),
    title: v.string(),
    excerpt: v.string(),
    summary: v.union(v.null(), v.string()),
    price: v.object({ amount: v.number(), currencyCode: v.string() }),
    compareAtPrice: v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.string() })),
    featuredMediaId: v.union(v.null(), v.string()),
    categories: v.array(v.object({ id: v.string(), name: v.string(), slug: v.string() })),
    inStock: v.boolean(),
    stockQuantity: v.union(v.null(), v.number()),
    productType: v.string(),
    attributes: v.union(v.null(), v.record(v.string(), v.union(v.boolean(), v.string(), v.number(), v.array(v.union(v.boolean(), v.string(), v.number()))))),
    defaultVariantId: v.union(v.null(), v.string()),
  })),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const cards: ProductCard[] = [];
    for (const slug of args.slugs.slice(0, 24)) {
      const product = await ctx.db
        .query("commerce_products")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (product && product.status === "publish") cards.push(await toProductCard(ctx, product));
    }
    return cards;
  },
});

/** Visible categories with a representative product image, for tile grids. */
export const categoryTiles = query({
  args: categoryTilesArgs,
  returns: v.array(v.object({
    id: v.string(),
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    productCount: v.number(),
    coverMediaId: v.union(v.null(), v.string()),
    coverTitle: v.union(v.null(), v.string()),
  })),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    let categories = await visibleCategories(ctx, 200);
    categories = categories.filter((category) => category.isVisible !== false);
    if (args.slugs?.length) {
      const wanted = new Map(args.slugs.map((slug, index) => [slug, index]));
      categories = categories
        .filter((category) => wanted.has(category.slug))
        .sort((a, b) => (wanted.get(a.slug) ?? 0) - (wanted.get(b.slug) ?? 0));
    } else {
      categories.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    const products = await ctx.db
      .query("commerce_products")
      .withIndex("by_status", (q) => q.eq("status", "publish"))
      .take(1000);
    const tiles: Array<{
      id: string;
      slug: string;
      name: string;
      description: string;
      productCount: number;
      coverMediaId: string | null;
      coverTitle: string | null;
    }> = [];
    for (const category of categories.slice(0, Math.min(24, args.limit ?? 12))) {
      const members = products.filter((product) =>
        (product.categoryIds ?? []).some((id) => String(id) === String(category._id)),
      );
      const cover = members.find((product) => product.featuredMediaId) ?? null;
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
  ctx: Pick<QueryCtx, "db">,
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
    const seedProductId = ctx.db.normalizeId("commerce_products", seedId);
    const seed = seedProductId ? await ctx.db.get("commerce_products", seedProductId) : null;
    if (!seedProductId || !seed || seed.status !== "publish") continue;
    const edges = await ctx.db
      .query("commerce_product_relations")
      .withIndex("by_from_status", (q) => q.eq("fromProductId", seedProductId).eq("status", "active"))
      .take(MAX_RELATION_EDGES - edgeCount + 1);
    edgeCount += edges.length;
    if (edgeCount > MAX_RELATION_EDGES) throw new ConvexError({ code: "RELATION_LIMIT", message: "Too many recommendations to rank safely. Please narrow the selected products." });
    for (const edge of edges) {
      if (options.types && !options.types.includes(edge.type)) continue;
      const targetId = String(edge.toProductId);
      if (exclude.has(targetId)) continue;
      const groupKey = RELATION_GROUP[edge.type];
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
    const items: RelatedGroup["items"] = [];
    for (const [id, meta] of ranked) {
      const productId = ctx.db.normalizeId("commerce_products", id);
      const product = productId ? await ctx.db.get("commerce_products", productId) : null;
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
  returns: v.array(v.object({
    key: v.string(),
    label: v.string(),
    items: v.array(v.object({
      card: v.object({
        pricing: v.optional(v.object({
          salePriceFrom: v.optional(v.number()),
          salePriceTo: v.optional(v.number()),
          price: v.object({ amount: v.number(), currencyCode: v.string() }),
          salePrice: v.optional(v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.optional(v.string()) }))),
          pricedAt: v.number(),
        })),
        productId: v.string(),
        slug: v.string(),
        title: v.string(),
        excerpt: v.string(),
        summary: v.union(v.null(), v.string()),
        price: v.object({ amount: v.number(), currencyCode: v.string() }),
        compareAtPrice: v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.string() })),
        featuredMediaId: v.union(v.null(), v.string()),
        categories: v.array(v.object({ id: v.string(), name: v.string(), slug: v.string() })),
        inStock: v.boolean(),
        stockQuantity: v.union(v.null(), v.number()),
        productType: v.string(),
        attributes: v.union(v.null(), v.record(v.string(), v.union(v.boolean(), v.string(), v.number(), v.array(v.union(v.boolean(), v.string(), v.number()))))),
        defaultVariantId: v.union(v.null(), v.string()),
      }),
      reason: v.union(v.null(), v.string()),
      weight: v.number(),
      forProductId: v.string(),
      type: v.union(v.literal("accessory_of"), v.literal("compatible_with"), v.literal("consumable_for"), v.literal("maintenance_for"), v.literal("upgrade_of"), v.literal("replacement_for"), v.literal("bundle_with"), v.literal("similar_to")),
    })),
  })),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    return await relatedGroups(ctx, args.productIds, {
      perGroup: Math.min(6, Math.max(1, args.perGroup ?? 2)),
      types: args.types,
    });
  },
});

async function cartProductIds(ctx: QueryCtx, sessionToken: string): Promise<string[]> {
  const cart = await ctx.db
    .query("commerce_carts")
    .withIndex("by_session", (q) => q.eq("sessionToken", sessionToken))
    .unique();
  if (cart) assertCartAccess(cart, sessionToken, (await getCurrentShopper(ctx))?._id);
  if (!cart || isClosedCart(cart)) return [];
  return [...new Set((await publicCartLines(ctx, cart)).filter((line) => !line.unavailable).map((line) => line.productId))];
}

export const relatedForCart = query({
  args: sessionArgs,
  returns: v.array(v.object({
    key: v.string(),
    label: v.string(),
    items: v.array(v.object({
      card: v.object({
        pricing: v.optional(v.object({
          salePriceFrom: v.optional(v.number()),
          salePriceTo: v.optional(v.number()),
          price: v.object({ amount: v.number(), currencyCode: v.string() }),
          salePrice: v.optional(v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.optional(v.string()) }))),
          pricedAt: v.number(),
        })),
        productId: v.string(),
        slug: v.string(),
        title: v.string(),
        excerpt: v.string(),
        summary: v.union(v.null(), v.string()),
        price: v.object({ amount: v.number(), currencyCode: v.string() }),
        compareAtPrice: v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.string() })),
        featuredMediaId: v.union(v.null(), v.string()),
        categories: v.array(v.object({ id: v.string(), name: v.string(), slug: v.string() })),
        inStock: v.boolean(),
        stockQuantity: v.union(v.null(), v.number()),
        productType: v.string(),
        attributes: v.union(v.null(), v.record(v.string(), v.union(v.boolean(), v.string(), v.number(), v.array(v.union(v.boolean(), v.string(), v.number()))))),
        defaultVariantId: v.union(v.null(), v.string()),
      }),
      reason: v.union(v.null(), v.string()),
      weight: v.number(),
      forProductId: v.string(),
      type: v.union(v.literal("accessory_of"), v.literal("compatible_with"), v.literal("consumable_for"), v.literal("maintenance_for"), v.literal("upgrade_of"), v.literal("replacement_for"), v.literal("bundle_with"), v.literal("similar_to")),
    })),
  })),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const seeds = await cartProductIds(ctx, args.sessionToken);
    if (!seeds.length) return [];
    return await relatedGroups(ctx, seeds, { perGroup: Math.min(6, Math.max(1, args.perGroup ?? 2)) });
  },
});

// ─── Cart context ────────────────────────────────────────────────────────────

export const cartContext = query({
  args: sessionOnlyArgs,
  returns: v.object({
    itemCount: v.number(),
    subtotalAmount: v.number(),
    currencyCode: v.string(),
    lines: v.array(v.object({
      productId: v.string(),
      variantId: v.union(v.null(), v.string()),
      title: v.string(),
      variantTitle: v.union(v.null(), v.string()),
      slug: v.string(),
      quantity: v.number(),
      unitPriceAmount: v.number(),
      lineTotalAmount: v.number(),
      featuredMediaId: v.union(v.null(), v.string()),
      attributes: v.union(v.null(), v.record(v.string(), v.union(v.boolean(), v.string(), v.number(), v.array(v.union(v.boolean(), v.string(), v.number()))))),
      summary: v.union(v.null(), v.string()),
      unavailable: v.optional(v.literal(true)),
    })),
  }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const cart = await ctx.db
      .query("commerce_carts")
      .withIndex("by_session", (q) => q.eq("sessionToken", args.sessionToken))
      .unique();
    if (cart) assertCartAccess(cart, args.sessionToken, (await getCurrentShopper(ctx))?._id);
    if (!cart || isClosedCart(cart)) {
      const lines: PublicCartLine[] = [];
      return { itemCount: 0, subtotalAmount: 0, currencyCode: "USD", lines };
    }
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
  returns: v.union(v.null(), v.object({
    chips: v.array(v.object({ query: v.optional(v.string()), categorySlug: v.optional(v.string()), label: v.string() })),
    generatedAt: v.number(),
    pinned: v.boolean(),
  })),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    if (args.sessionToken) await assistantScope(ctx, args.sessionToken);
    const doc = await ctx.db
      .query("commerce_search_facets")
      .withIndex("by_query_hash", (q) => q.eq("queryHash", hashQuery(args.q)))
      .unique();
    if (doc?.banned) return null;
    // Curated chips are public. Model-written chips belong to the shopper's brief.
    if (doc?.pinned) return { chips: doc.chips, generatedAt: doc.generatedAt, pinned: true };
    const sessionToken = args.sessionToken;
    if (!sessionToken) return null;
    const brief = await ctx.db.query("commerce_assistant_briefs")
      .withIndex("by_session_query", (q) => q.eq("sessionToken", sessionToken).eq("kind", "query").eq("query", args.q.trim().slice(0, 200)))
      .order("desc").first();
    if (!brief || brief.expiresAt <= Date.now()) return null;
    // Settings values and brief payloads are stored untyped; read them as unknown.
    const assistantValues: unknown = (await getSettingsDoc(ctx, "commerce.assistant"))?.values;
    const assistant = isRecord(assistantValues) ? assistantValues : {};
    const payload: unknown = brief.payload;
    const payloadRecord = isRecord(payload) ? payload : {};
    if (assistant.enabled === false || (assistant.memoryEnabled === false && payloadRecord.memoryEnabled !== false)) return null;
    const blocks: unknown[] = Array.isArray(payloadRecord.blocks) ? payloadRecord.blocks : [];
    const facets = blocks.find((block) => isRecord(block) && block.type === "facets");
    const facetItems: unknown[] = isRecord(facets) && Array.isArray(facets.items) ? facets.items : [];
    const chips = facetItems
      .flatMap((item): Array<{ label: string; query?: string; categorySlug?: string }> => {
        if (!isRecord(item) || typeof item.label !== "string") return [];
        const { query, categorySlug } = item;
        return [{
          label: item.label.slice(0, 80),
          ...(typeof query === "string" ? { query: query.slice(0, 200) } : {}),
          ...(typeof categorySlug === "string" ? { categorySlug: categorySlug.slice(0, 100) } : {}),
        }];
      })
      .slice(0, 12);
    return chips.length ? { chips, generatedAt: brief.generatedAt, pinned: false } : null;
  },
});
