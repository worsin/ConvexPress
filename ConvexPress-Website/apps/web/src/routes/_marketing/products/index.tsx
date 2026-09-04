/**
 * Shop: catalog and product search in one place.
 *
 * `/products` lists the catalog; `/products?q=…` searches it. Both render
 * inside the Shopping Shell, so the assistant rail sits beside the results
 * and briefs the shopper from their query and cart the moment results land.
 */

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { useQuery } from "convex/react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { ProductGridCard } from "@/components/shop/ProductGridCard";
import { ShopShell, useShopShell } from "@/components/shop/ShopShell";
import type { ProductCardData } from "@/components/shop/ProductMiniCard";
import { useSettings } from "@/contexts/SettingsContext";
import { useAssistantConfig } from "@/hooks/useAssistantConfig";
import { formatMoney } from "@/lib/commerce/format";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";
import { cn } from "@/lib/utils";

const SORTS = ["relevance", "price_asc", "price_desc", "newest"] as const;
type Sort = (typeof SORTS)[number];

const searchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  sort: z.enum(SORTS).optional(),
  page: z.number().min(1).optional(),
  min: z.number().min(0).optional(),
  max: z.number().min(0).optional(),
  /** Opens the assistant with this question (used by the assistant band block). */
  ask: z.string().max(200).optional(),
});

const PER_PAGE = 12;

function queryArgs(search: z.infer<typeof searchSchema>) {
  return {
    q: search.q?.trim() || undefined,
    categorySlug: search.category || undefined,
    sort: search.sort,
    page: search.page ?? 1,
    perPage: PER_PAGE,
    minPriceAmount: typeof search.min === "number" ? Math.round(search.min * 100) : undefined,
    maxPriceAmount: typeof search.max === "number" ? Math.round(search.max * 100) : undefined,
  };
}

export const Route = createFileRoute("/_marketing/products/")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => queryArgs(search),
  loader: async ({ context: { queryClient }, deps }) => {
    const publicSettings = await queryClient.ensureQueryData(convexQuery(api.settings.queries.getPublic, {}));
    const siteUrl = normalizeSiteUrl((publicSettings as { siteUrl?: string | null })?.siteUrl);
    const siteTitle = (publicSettings as { siteTitle?: string })?.siteTitle ?? "Shop";
    if ((publicSettings as any)?.plugins?.commerceEnabled === true) {
      await queryClient.ensureQueryData(convexQuery((api as any).commerce.storefront.searchProducts, deps));
    }
    const path = deps.q ? `/products?q=${encodeURIComponent(deps.q)}` : deps.page > 1 ? `/products?page=${deps.page}` : "/products";
    return {
      seoHead: buildSeoHead({
        title: deps.q ? `“${deps.q}” – ${siteTitle}` : `Shop – ${siteTitle}`,
        description: deps.q ? `Products matching “${deps.q}” at ${siteTitle}.` : `Browse everything at ${siteTitle}.`,
        canonical: toAbsoluteUrl(path, siteUrl),
        robots: deps.q ? "noindex, follow" : undefined,
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  component: ShopPage,
});

interface SearchResponse {
  query: string;
  items: ProductCardData[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  facets: { categories: Array<{ id: string; name: string; slug: string; count: number }>; priceRange: { min: number; max: number } | null };
}

function ShopPage() {
  const search = Route.useSearch();
  const q = search.q?.trim() || "";
  return (
    <ShopShell kind={q ? "search" : "catalog"} query={q || undefined} initialPrompt={search.ask}>
      <ShopContent />
    </ShopShell>
  );
}

function ShopContent() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/products" });
  const settings = useSettings();
  const config = useAssistantConfig();
  const shell = useShopShell();
  const q = search.q?.trim() || "";
  const args = queryArgs(search);
  const commerceEnabled = settings?.plugins?.commerceEnabled === true;
  const { data } = useTanStackQuery(convexQuery((api as any).commerce.storefront.searchProducts, args) as any) as { data: SearchResponse | undefined };
  const facets = useQuery((api as any).commerce.storefront.facetsForQuery, q && config.searchFacets ? { q } : "skip") as
    | { chips: Array<{ label: string; query?: string; categorySlug?: string }> }
    | null
    | undefined;
  const [draft, setDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const currency = settings?.commerceConfig?.currencyCode || "USD";

  const update = (patch: Partial<z.infer<typeof searchSchema>>) => {
    void (navigate as (options: { search: (current: Record<string, unknown>) => Record<string, unknown> }) => Promise<void>)({
      search: (current) => ({ ...current, page: undefined, ...patch }),
    });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    update({ q: draft.trim() || undefined });
  };

  if (!commerceEnabled) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        The shop is not enabled on this site.
      </div>
    );
  }

  const activeCategory = data?.facets.categories.find((category) => category.slug === search.category);
  const hasFilters = Boolean(search.category || search.min !== undefined || search.max !== undefined);

  return (
    <div className="flex flex-col gap-5 pb-16">
      {/* Header + search */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{settings?.siteTitle}</p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {q ? (
                <>
                  Results for <span className="text-primary">“{q}”</span>
                </>
              ) : activeCategory ? (
                activeCategory.name
              ) : (
                "Shop"
              )}
            </h1>
          </div>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.total} {data.total === 1 ? "product" : "products"}
            </p>
          )}
        </div>
        <form onSubmit={submit} role="search" className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Search products</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search products, parts, or ask a question…"
              className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {draft && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setDraft("");
                  update({ q: undefined });
                }}
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </label>
          <button type="submit" className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Search
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted lg:hidden"
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" /> Filters
          </button>
        </form>

        {/* AI facets */}
        {q && facets?.chips?.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Narrow your search</span>
            {facets.chips.map((chip) => (
              <Link
                key={chip.label}
                to="/products"
                search={{ q: chip.query ?? q, category: chip.categorySlug } as any}
                className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                {chip.label}
              </Link>
            ))}
          </div>
        ) : null}
        {q && shell && (
          <p className="text-xs text-muted-foreground">
            Want a recommendation?{" "}
            <button type="button" onClick={() => shell.ask(`Which of these “${q}” results should I pick, and why?`)} className="font-medium text-primary hover:underline">
              Ask {config.displayName}
            </button>
          </p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Filter rail */}
        <aside className={cn("flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start", filtersOpen ? "flex" : "hidden lg:flex")} aria-label="Filters">
          <div>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sort</h2>
            <select
              value={search.sort ?? (q ? "relevance" : "newest")}
              onChange={(event) => update({ sort: event.target.value as Sort })}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
              aria-label="Sort products"
            >
              <option value="relevance">Relevance</option>
              <option value="newest">Newest</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </div>
          {data?.facets.categories.length ? (
            <div>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Category</h2>
              <ul className="space-y-0.5">
                <li>
                  <button
                    type="button"
                    onClick={() => update({ category: undefined })}
                    className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted", !search.category ? "font-semibold text-primary" : "text-foreground")}
                  >
                    All
                  </button>
                </li>
                {data.facets.categories.map((category) => (
                  <li key={category.id}>
                    <button
                      type="button"
                      onClick={() => update({ category: category.slug })}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                        search.category === category.slug ? "font-semibold text-primary" : "text-foreground",
                      )}
                    >
                      <span>{category.name}</span>
                      <span className="text-xs text-muted-foreground">{category.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data?.facets.priceRange && (
            <div>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Price</h2>
              <div className="flex flex-wrap gap-1.5">
                {[25, 50, 100, 250, 1000].map((cap) =>
                  data.facets.priceRange && data.facets.priceRange.min < cap * 100 ? (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => update({ max: search.max === cap ? undefined : cap, min: undefined })}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs",
                        search.max === cap ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-foreground hover:bg-muted",
                      )}
                    >
                      Under {formatMoney(cap * 100, currency).replace(/\.00$/, "")}
                    </button>
                  ) : null,
                )}
              </div>
            </div>
          )}
          {hasFilters && (
            <button type="button" onClick={() => update({ category: undefined, min: undefined, max: undefined })} className="text-left text-xs font-medium text-primary hover:underline">
              Clear filters
            </button>
          )}
        </aside>

        {/* Results */}
        <div className="min-w-0">
          {!data ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : data.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <p className="text-sm font-medium text-foreground">No products match{q ? ` “${q}”` : ""}.</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a broader term, clear the filters, or ask {config.displayName} what you are looking for.</p>
              {shell && (
                <button type="button" onClick={() => shell.ask(q ? `I'm looking for ${q}. What do you have that's close?` : "Help me find something")} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                  Ask {config.displayName}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {data.items.map((product) => (
                  <ProductGridCard key={product.productId} product={product} />
                ))}
              </div>
              {data.totalPages > 1 && (
                <nav className="mt-6 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm" aria-label="Pagination">
                  <span className="text-muted-foreground">
                    Page {data.page} of {data.totalPages}
                  </span>
                  <div className="flex gap-3">
                    {data.page > 1 ? (
                      <Link to="/products" search={{ ...search, page: data.page - 1 } as any} className="font-medium text-primary hover:underline">
                        Previous
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/60">Previous</span>
                    )}
                    {data.page < data.totalPages ? (
                      <Link to="/products" search={{ ...search, page: data.page + 1 } as any} className="font-medium text-primary hover:underline">
                        Next
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/60">Next</span>
                    )}
                  </div>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
