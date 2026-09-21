/**
 * Shop catalog surface (Core implementation). Rendered through
 * `<Surface name="shop.catalog">`; other template packs may replace it.
 */

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { useQuery } from "convex/react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ProductGridCard } from "@/components/shop/ProductGridCard";
import { useShopShell } from "@/components/shop/ShopShell";
import { useSettings } from "@/contexts/SettingsContext";
import { useAssistantConfig } from "@/hooks/useAssistantConfig";
import { useShopLayout } from "@/hooks/useShopLayout";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { formatMoney } from "@/lib/commerce/format";
import { perPageFor, queryArgs, type SearchResponse, type ShopSearch, type Sort } from "@/lib/commerce/shopSearch";
import { cn } from "@/lib/utils";

export function ShopCatalog({ variant }: { variant?: string }) {
  const { sessionToken } = useCommerceSessionToken();
  const search = useSearch({ from: "/_marketing/products/" }) as ShopSearch;
  const navigate = useNavigate({ from: "/products" });
  const settings = useSettings();
  const config = useAssistantConfig();
  const layoutSetting = useShopLayout();
  const layout = { ...layoutSetting, shopLayout: (variant === "boutique" || variant === "marketplace" ? variant : layoutSetting.shopLayout) as typeof layoutSetting.shopLayout };
  const shell = useShopShell();
  const q = search.q?.trim() || "";
  const marketplace = layout.shopLayout === "marketplace";
  const args = queryArgs(search, perPageFor(layout.shopLayout, layout.gridDensity));
  const commerceEnabled = settings?.plugins?.commerceEnabled === true;
  const { data } = useTanStackQuery(convexQuery((api as any).commerce.storefront.searchProducts, args) as any) as { data: SearchResponse | undefined };
  const facets = useQuery((api as any).commerce.storefront.facetsForQuery, q && config.searchFacets && sessionToken ? { q, sessionToken } : "skip") as
    | { chips: Array<{ label: string; query?: string; categorySlug?: string }> }
    | null
    | undefined;
  const [draft, setDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const currency = settings?.commerceConfig?.currencyCode || "USD";

  const update = (patch: Partial<ShopSearch>) => {
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
  const gridClass = marketplace
    ? layout.gridDensity === "dense"
      ? "grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
      : "grid gap-4 grid-cols-2 md:grid-cols-3 2xl:grid-cols-4"
    : shell?.railOpen && shell.cartColumn
      ? "grid gap-4 sm:grid-cols-2 2xl:grid-cols-3"
      : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";

  const filterProps = { search, data, q, currency, hasFilters, update };

  return (
    <div className="flex flex-col gap-5 pb-16" data-shop-layout={layout.shopLayout}>
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
          {!marketplace && (
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted lg:hidden"
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" /> Filters
            </button>
          )}
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

      {marketplace && <FilterToolbar {...filterProps} />}

      <div className={cn(!marketplace && "grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]")}>
        {!marketplace && <FilterRail {...filterProps} open={filtersOpen} />}

        {/* Results */}
        <div className="min-w-0">
          {!data ? (
            <div className={gridClass}>
              {Array.from({ length: marketplace ? 10 : 6 }).map((_, index) => (
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
              <div className={gridClass}>
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

interface FilterProps {
  search: ShopSearch;
  data: SearchResponse | undefined;
  q: string;
  currency: string;
  hasFilters: boolean;
  update: (patch: Partial<ShopSearch>) => void;
}

const PRICE_CAPS = [25, 50, 100, 250, 1000];

function SortSelect({ search, q, update, className }: Pick<FilterProps, "search" | "q" | "update"> & { className?: string }) {
  return (
    <select
      value={search.sort ?? (q ? "relevance" : "newest")}
      onChange={(event) => update({ sort: event.target.value as Sort })}
      className={cn("h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground", className)}
      aria-label="Sort products"
    >
      <option value="relevance">Relevance</option>
      <option value="newest">Newest</option>
      <option value="price_asc">Price: low to high</option>
      <option value="price_desc">Price: high to low</option>
    </select>
  );
}

/** Boutique: vertical filter rail beside the grid. */
function FilterRail({ search, data, q, currency, hasFilters, update, open }: FilterProps & { open: boolean }) {
  return (
    <aside className={cn("flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start", open ? "flex" : "hidden lg:flex")} aria-label="Filters">
      <div>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sort</h2>
        <SortSelect search={search} q={q} update={update} className="w-full" />
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
            {PRICE_CAPS.map((cap) =>
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
  );
}

/** Marketplace: one toolbar over the grid — category chips, price caps, sort. */
function FilterToolbar({ search, data, q, currency, hasFilters, update }: FilterProps) {
  const categories = data?.facets.categories ?? [];
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5" aria-label="Filters">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Department</span>
        <button
          type="button"
          onClick={() => update({ category: undefined })}
          className={cn("rounded-full border px-3 py-1 text-xs", !search.category ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-foreground hover:bg-muted")}
        >
          All
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => update({ category: search.category === category.slug ? undefined : category.slug })}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              search.category === category.slug ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-foreground hover:bg-muted",
            )}
          >
            {category.name} <span className="text-muted-foreground">{category.count}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {data?.facets.priceRange && (
          <>
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Price</span>
            {PRICE_CAPS.map((cap) =>
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
          </>
        )}
        {hasFilters && (
          <button type="button" onClick={() => update({ category: undefined, min: undefined, max: undefined })} className="text-xs font-medium text-primary hover:underline">
            Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sort</span>
          <SortSelect search={search} q={q} update={update} />
        </div>
      </div>
    </div>
  );
}
