/**
 * Shop: catalog and product search in one place.
 *
 * `/products` lists the catalog; `/products?q=…` searches it. The route
 * validates the search params, prefetches results for SSR and hands the
 * page to the `shop.catalog` surface; the active template pack decides how
 * it looks (Core offers the boutique and marketplace variants).
 */

import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { ShopShell } from "@/components/shop/ShopShell";
import { perPageFor, queryArgs, shopSearchSchema } from "@/lib/commerce/shopSearch";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";
import CoreCatalog from "@/templates/packs/core/surfaces/shop.catalog";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/products/")({
  validateSearch: shopSearchSchema,
  loaderDeps: ({ search }) => ({ ...queryArgs(search), layout: search.layout }),
  loader: async ({ context: { queryClient }, deps }) => {
    const publicSettings = await queryClient.ensureQueryData(convexQuery(api.settings.queries.getPublic, {}));
    const siteUrl = normalizeSiteUrl((publicSettings as { siteUrl?: string | null })?.siteUrl);
    const siteTitle = (publicSettings as { siteTitle?: string })?.siteTitle ?? "Shop";
    const layoutConfig = (publicSettings as any)?.layoutConfig ?? {};
    const { layout, ...args } = deps;
    const perPage = perPageFor(layout ?? layoutConfig.shopLayout ?? "boutique", layoutConfig.gridDensity ?? "comfortable");
    if ((publicSettings as any)?.plugins?.commerceEnabled === true) {
      await queryClient.ensureQueryData(convexQuery((api as any).commerce.storefront.searchProducts, { ...args, perPage }));
    }
    const path = args.q ? `/products?q=${encodeURIComponent(args.q)}` : args.page > 1 ? `/products?page=${args.page}` : "/products";
    return {
      seoHead: buildSeoHead({
        title: args.q ? `“${args.q}” – ${siteTitle}` : `Shop – ${siteTitle}`,
        description: args.q ? `Products matching “${args.q}” at ${siteTitle}.` : `Browse everything at ${siteTitle}.`,
        canonical: toAbsoluteUrl(path, siteUrl),
        robots: args.q ? "noindex, follow" : undefined,
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  component: ShopPage,
});

function ShopPage() {
  const search = Route.useSearch();
  const q = search.q?.trim() || "";
  return (
    <ShopShell kind={q ? "search" : "catalog"} query={q || undefined} initialPrompt={search.ask}>
      <Surface name="shop.catalog" data={{}} fallback={CoreCatalog} />
    </ShopShell>
  );
}
