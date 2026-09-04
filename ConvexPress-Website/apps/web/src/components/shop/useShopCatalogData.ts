/**
 * Everything the catalog surface needs to render, independent of how it is
 * laid out: the validated search params, the search results (SSR-prefetched
 * by the `/products` route loader), AI facet chips, and the `update` helper
 * that rewrites the URL. Template packs compose their own grid and filters
 * from this one hook, so they never reach the backend directly.
 */

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { useQuery } from "convex/react";
import { useCallback } from "react";

import { useShopShell } from "@/components/shop/ShopShell";
import { useSettings } from "@/contexts/SettingsContext";
import { useAssistantConfig, type AssistantConfig } from "@/hooks/useAssistantConfig";
import { useShopLayout, type ShopLayout } from "@/hooks/useShopLayout";
import { perPageFor, queryArgs, type SearchResponse, type ShopSearch } from "@/lib/commerce/shopSearch";

export interface ShopFacetChip {
  label: string;
  query?: string;
  categorySlug?: string;
}

export interface ShopCatalogData {
  /** Validated `/products` search params. */
  search: ShopSearch;
  /** Trimmed search query ("" when browsing). */
  q: string;
  /** Search results; `undefined` while loading. */
  data: SearchResponse | undefined;
  /** AI "narrow your search" chips for the current query, when enabled. */
  facetChips: ShopFacetChip[];
  commerceEnabled: boolean;
  currency: string;
  siteTitle: string;
  /** Resolved shop layout with the surface's variant applied. */
  layout: ShopLayout;
  /** Assistant settings (display name, facets, free-shipping threshold). */
  assistant: AssistantConfig;
  /** Shopping shell (assistant rail) when the catalog renders inside one. */
  shell: ReturnType<typeof useShopShell>;
  /** True when a category or price filter is applied. */
  hasFilters: boolean;
  /** The category matching `search.category`, from the facets. */
  activeCategory: SearchResponse["facets"]["categories"][number] | undefined;
  /** Rewrite the URL search params (resets the page). */
  update: (patch: Partial<ShopSearch>) => void;
}

export function useShopCatalogData(variant?: string): ShopCatalogData {
  const search = useSearch({ from: "/_marketing/products/" }) as ShopSearch;
  const navigate = useNavigate({ from: "/products" });
  const settings = useSettings();
  const assistant = useAssistantConfig();
  const layoutSetting = useShopLayout();
  const shopLayout = (variant === "boutique" || variant === "marketplace" ? variant : layoutSetting.shopLayout) as ShopLayout["shopLayout"];
  const layout: ShopLayout = { ...layoutSetting, shopLayout };
  const shell = useShopShell();
  const q = search.q?.trim() || "";
  const commerceEnabled = settings?.plugins?.commerceEnabled === true;
  const args = queryArgs(search, perPageFor(layout.shopLayout, layout.gridDensity));
  const { data } = useTanStackQuery(convexQuery((api as any).commerce.storefront.searchProducts, args) as any) as {
    data: SearchResponse | undefined;
  };
  const facets = useQuery((api as any).commerce.storefront.facetsForQuery, q && assistant.searchFacets ? { q } : "skip") as
    | { chips: ShopFacetChip[] }
    | null
    | undefined;

  const update = useCallback(
    (patch: Partial<ShopSearch>) => {
      void (navigate as (options: { search: (current: Record<string, unknown>) => Record<string, unknown> }) => Promise<void>)({
        search: (current) => ({ ...current, page: undefined, ...patch }),
      });
    },
    [navigate],
  );

  return {
    search,
    q,
    data,
    facetChips: q ? (facets?.chips ?? []) : [],
    commerceEnabled,
    currency: settings?.commerceConfig?.currencyCode || "USD",
    siteTitle: settings?.siteTitle ?? "",
    layout,
    assistant,
    shell,
    hasFilters: Boolean(search.category || search.min !== undefined || search.max !== undefined),
    activeCategory: data?.facets.categories.find((category) => category.slug === search.category),
    update,
  };
}
