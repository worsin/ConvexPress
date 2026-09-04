/**
 * Legacy `/shop` — the catalog now lives at `/products` (the `shop.catalog`
 * surface). This route only redirects so old links (dashboard widgets, the
 * cart drawer, shared wishlists, bookmarks) keep working. Old query params map
 * onto the catalog's: `search` → `q`, `category` and `page` pass through.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

type LegacyShopSearch = {
  page?: number;
  category?: string;
  search?: string;
};

export const Route = createFileRoute("/_marketing/shop")({
  validateSearch: (search: Record<string, unknown>): LegacyShopSearch => ({
    page:
      typeof search.page === "number"
        ? Math.max(1, search.page)
        : Number(search.page) || undefined,
    category: typeof search.category === "string" ? search.category : undefined,
    search: typeof search.search === "string" ? search.search : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/products",
      search: {
        q: search.search || undefined,
        category: search.category || undefined,
        page: search.page && search.page > 1 ? search.page : undefined,
      },
      replace: true,
    });
  },
});
