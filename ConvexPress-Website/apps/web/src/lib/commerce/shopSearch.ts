/**
 * Shop catalog search params and query args, shared by the route (loader,
 * validation) and the catalog surface (rendering).
 */

import { z } from "zod";

import { PRODUCT_LAYOUT_IDS, SHOP_LAYOUT_IDS } from "@/hooks/useShopLayout";

export const SORTS = ["relevance", "price_asc", "price_desc", "newest"] as const;
export type Sort = (typeof SORTS)[number];

export const shopSearchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  sort: z.enum(SORTS).optional(),
  page: z.number().min(1).optional(),
  min: z.number().min(0).optional(),
  max: z.number().min(0).optional(),
  /** Opens the assistant with this question (used by the assistant band block). */
  ask: z.string().max(200).optional(),
  /** Admin preview overrides (Settings › Shop layouts). Never persisted. */
  layout: z.enum(SHOP_LAYOUT_IDS).optional(),
  productLayout: z.enum(PRODUCT_LAYOUT_IDS).optional(),
  cartPanel: z.enum(["persistent", "drawer"]).optional(),
  /** Template preview override (Appearance › Templates). Never persisted. */
  template: z.string().max(64).optional(),
});

export type ShopSearch = z.infer<typeof shopSearchSchema>;

export function perPageFor(layout: string, density: string) {
  if (layout === "marketplace") return density === "dense" ? 24 : 20;
  return 12;
}

export function queryArgs(search: ShopSearch, perPage = 12) {
  return {
    q: search.q?.trim() || undefined,
    categorySlug: search.category || undefined,
    sort: search.sort,
    page: search.page ?? 1,
    perPage,
    minPriceAmount: typeof search.min === "number" ? Math.round(search.min * 100) : undefined,
    maxPriceAmount: typeof search.max === "number" ? Math.round(search.max * 100) : undefined,
  };
}

export interface SearchResponse {
  query: string;
  items: import("@/components/shop/ProductMiniCard").ProductCardData[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  facets: { categories: Array<{ id: string; name: string; slug: string; count: number }>; priceRange: { min: number; max: number } | null };
}
