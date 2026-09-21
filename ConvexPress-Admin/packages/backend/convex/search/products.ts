/**
 * Search System - Products
 *
 * Keeps two things in sync whenever a product changes:
 *   1. `commerce_products.searchText` — denormalised text behind the
 *      `search_commerce_products_text` search index (storefront search and
 *      the shopping assistant's product lookup).
 *   2. The unified `searchIndex` entry with contentType "product", so
 *      products show up in site-wide search next to posts and pages.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { patchWithMediaReferences , deleteDynamicWithMediaReferences, patchDynamicWithMediaReferences} from "../media/attachmentGuard";

function stripHtml(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenAttributes(value: unknown, depth = 0): string[] {
  if (value === null || value === undefined || depth > 3) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((entry) => flattenAttributes(entry, depth + 1));
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => [
      key.replace(/[_-]+/g, " "),
      ...flattenAttributes(entry, depth + 1),
    ]);
  }
  return [];
}

export function buildProductSearchText(
  product: {
    title: string;
    slug: string;
    sku?: string;
    excerpt?: string;
    description?: string;
    productAttributes?: unknown;
    conversationalAttributes?: unknown;
    assistantSummary?: string;
  },
  categoryNames: string[],
): string {
  const parts = [
    product.title,
    product.slug.replace(/-/g, " "),
    product.sku ?? "",
    stripHtml(product.excerpt),
    stripHtml(product.description),
    product.assistantSummary ?? "",
    ...categoryNames,
    ...flattenAttributes(product.productAttributes),
    ...flattenAttributes(product.conversationalAttributes),
  ];
  return parts
    .filter((part) => typeof part === "string" && part.trim())
    .join(" · ")
    .slice(0, 60_000);
}

/**
 * Recompute searchText and the site-wide search entry for one product.
 * Safe to call from any mutation that touched the product.
 */
export async function syncProductSearch(ctx: any, productId: any): Promise<void> {
  const product = await ctx.db.get(productId);
  if (!product) {
    const stale = await ctx.db
      .query("searchIndex")
      .withIndex("by_content", (q: any) => q.eq("contentType", "product").eq("contentId", String(productId)))
      .unique();
    if (stale) await deleteDynamicWithMediaReferences(ctx, stale._id);
    return;
  }

  const categories = await Promise.all((product.categoryIds ?? []).map((id: any) => ctx.db.get(id)));
  const categoryNames = categories.filter(Boolean).map((category: any) => category.name as string);
  const searchText = buildProductSearchText(product, categoryNames);
  if (product.searchText !== searchText) {
    await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", productId, { searchText });
  }

  const author = product.authorId ? await ctx.db.get(product.authorId) : null;
  const content = stripHtml(product.description) || stripHtml(product.excerpt) || product.title;
  const excerpt = (stripHtml(product.excerpt) || content).slice(0, 200);
  const now = Date.now();
  const entry = {
    contentType: "product" as const,
    contentId: String(productId),
    title: product.title.slice(0, 500),
    content: searchText.slice(0, 100_000),
    excerpt,
    authorId: String(product.authorId ?? ""),
    authorName: author?.displayName ?? author?.name ?? "",
    status: product.status === "publish" ? "publish" : product.status,
    categoryNames,
    tagNames: [] as string[],
    url: `/products/${product.slug}`,
    boostScore: undefined as number | undefined,
    publishedAt: product.publishedAt,
    indexedAt: now,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };

  const existing = await ctx.db
    .query("searchIndex")
    .withIndex("by_content", (q: any) => q.eq("contentType", "product").eq("contentId", String(productId)))
    .unique();
  if (existing) {
    await patchDynamicWithMediaReferences(ctx, existing._id, entry);
  } else {
    await ctx.db.insert("searchIndex", entry);
  }
}

export const syncProduct = internalMutation({
  args: { productId: v.id("commerce_products") },
  handler: async (ctx: any, args: any) => {
    await syncProductSearch(ctx, args.productId);
  },
});

/** Backfill every product's searchText and search entry (paged). */
export const syncAllProducts = internalMutation({
  args: { cursor: v.optional(v.string()), batch: v.optional(v.number()) },
  handler: async (ctx: any, args: any) => {
    const page = await ctx.db
      .query("commerce_products")
      .paginate({ cursor: args.cursor ?? null, numItems: Math.min(100, args.batch ?? 50) });
    for (const product of page.page) {
      await syncProductSearch(ctx, product._id);
    }
    return { processed: page.page.length, cursor: page.isDone ? null : page.continueCursor };
  },
});
