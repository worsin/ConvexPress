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

import { resolveShopLayout } from "@/lib/commerce/shop-layout";
import { getTemplatePack } from "@/templates/sdk/registry";
import type { TemplateConfig } from "@/templates/sdk/types";
import { ShopShell } from "@/components/shop/ShopShell";
import { perPageFor, queryArgs, shopSearchSchema } from "@/lib/commerce/shopSearch";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";
import CoreCatalog from "@/templates/packs/core/surfaces/shop.catalog";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/products/")({
  validateSearch: shopSearchSchema,
  loaderDeps: ({ search }) => ({ ...queryArgs(search), layout: search.layout, template: search.template }),
  loader: async ({ context: { queryClient }, deps }) => {
    const publicSettings = await queryClient.ensureQueryData(convexQuery(api.settings.queries.getPublic, {}));
    const siteUrl = normalizeSiteUrl((publicSettings as { siteUrl?: string | null })?.siteUrl);
    const siteTitle = (publicSettings as { siteTitle?: string })?.siteTitle ?? "Shop";
    const config = (publicSettings as { templateConfig?: Partial<TemplateConfig> })?.templateConfig;
    const { layout, template: previewPack, ...args } = deps;
    const packId = previewPack && getTemplatePack(previewPack) ? previewPack : config?.active ?? "core";
    const pack = getTemplatePack(packId);
    const savedShop = config?.settings?.[packId]?.shop;
    const shop = { ...pack?.manifest.defaults?.shop, ...(savedShop && typeof savedShop === "object" ? savedShop as Record<string, unknown> : {}) };
    const shopLayout = resolveShopLayout(config?.variants ?? {}, shop, { layout });
    const perPage = perPageFor(shopLayout.shopLayout, shopLayout.gridDensity);
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
  const navigate = Route.useNavigate();
  const q = search.q?.trim() || "";
  return (
    <ShopShell kind={q ? "search" : "catalog"} query={q || undefined} initialPrompt={search.ask}
      onInitialPromptConsumed={prompt => {
        const url = new URL(window.location.href);
        if (url.searchParams.get("ask") !== prompt) return;
        url.searchParams.delete("ask");
        void navigate({ href: `${url.pathname}${url.search}${url.hash}`, search: true, replace: true, resetScroll: false });
      }}>
      <Surface name="shop.catalog" data={{}} fallback={CoreCatalog} />
    </ShopShell>
  );
}
