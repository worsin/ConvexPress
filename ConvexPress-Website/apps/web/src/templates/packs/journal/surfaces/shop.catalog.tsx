/**
 * Journal · shop.catalog — the boutique catalog: a display-type heading, one
 * underline search line, categories as a row of text links with a sort select
 * on the right, price caps as pills, and a three-up grid of ProductCards.
 *
 * Same URL contract as Core (`/products?q=&category=&sort=&min=&max=&page=`)
 * through `useShopCatalogData`; the marketplace variant is not offered.
 */
import { Link } from "@tanstack/react-router";
import { ChevronDown, Search, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useShopCatalogData } from "@/components/shop/useShopCatalogData";
import { formatMoney } from "@/lib/commerce/format";
import type { Sort } from "@/lib/commerce/shopSearch";
import { cn } from "@/lib/utils";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Container, EmptyState, Pagination, ProductCard, SectionHeading, SkeletonBlock, SmallCaps, UnderlineInput } from "../parts";

const PRICE_CAPS = [25, 50, 100, 250, 1000];

export default function JournalShopCatalog(_props: SurfaceProps<Record<string, never>>) {
  const { search, q, data, facetChips, commerceEnabled, currency, siteTitle, assistant, shell, layout, hasFilters, activeCategory, update } = useShopCatalogData("boutique");
  const [draft, setDraft] = useState(q);
  const gridClass = layout.gridDensity === "dense"
    ? "grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4"
    : "grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3";

  if (!commerceEnabled) {
    return (
      <Container className="py-14 md:py-20">
        <EmptyState eyebrow="Shop" title="The shop is not enabled on this site." />
      </Container>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    update({ q: draft.trim() || undefined });
  };
  const categories = data?.facets.categories ?? [];
  const priceRange = data?.facets.priceRange ?? null;
  const caps = priceRange ? PRICE_CAPS.filter((cap) => priceRange.min < cap * 100) : [];

  return (
    <Container data-slot="shop-catalog" data-shop-layout="boutique" className="flex flex-col gap-10 py-6 pb-16 md:py-10">
      <header className="flex flex-col gap-8">
        <SectionHeading
          level={1}
          eyebrow={siteTitle || "Shop"}
          title={
            q ? (
              <>
                Results for <span className="text-primary">“{q}”</span>
              </>
            ) : (
              (activeCategory?.name ?? "Shop")
            )
          }
          lede={data ? `${data.total} ${data.total === 1 ? "product" : "products"}` : undefined}
        />

        <form onSubmit={submit} role="search" className="flex max-w-xl items-end gap-4">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search products</span>
            <Search className="pointer-events-none absolute left-0 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <UnderlineInput value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Search the shop…" className="pl-7 pr-8" />
            {draft ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setDraft("");
                  update({ q: undefined });
                }}
                className="absolute right-0 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <button type="submit" className="h-11 shrink-0 text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground">
            Search
          </button>
        </form>

        {facetChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <SmallCaps className="mr-1">Narrow your search</SmallCaps>
            {facetChips.map((chip) => (
              <Link
                key={chip.label}
                to="/products"
                search={{ q: chip.query ?? q, category: chip.categorySlug } as any}
                className="rounded-full border border-border px-3 py-1 text-xs text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {chip.label}
              </Link>
            ))}
          </div>
        ) : null}
        {q && shell ? (
          <p className="text-sm text-muted-foreground">
            Want a recommendation?{" "}
            <button type="button" onClick={() => shell.ask(`Which of these “${q}” results should I pick, and why?`)} className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
              Ask {assistant.displayName}
            </button>
          </p>
        ) : null}
      </header>

      {/* Filters: categories as text links, sort on the right */}
      <div className="flex flex-col gap-4 border-y border-border py-4" aria-label="Filters">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {categories.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Categories">
              <li>
                <FilterLink active={!search.category} onClick={() => update({ category: undefined })}>
                  All
                </FilterLink>
              </li>
              {categories.map((category) => (
                <li key={category.id}>
                  <FilterLink active={search.category === category.slug} onClick={() => update({ category: search.category === category.slug ? undefined : category.slug })} count={category.count}>
                    {category.name}
                  </FilterLink>
                </li>
              ))}
            </ul>
          ) : (
            <span />
          )}
          <label className="relative inline-flex shrink-0 items-center gap-2 self-start md:self-auto">
            <SmallCaps>Sort</SmallCaps>
            <span className="relative">
              <select
                value={search.sort ?? (q ? "relevance" : "newest")}
                onChange={(event) => update({ sort: event.target.value as Sort })}
                className="h-9 appearance-none rounded-none border-0 border-b border-border bg-transparent pr-6 text-sm text-foreground focus:border-foreground focus:outline-none"
                aria-label="Sort products"
              >
                <option value="relevance">Relevance</option>
                <option value="newest">Newest</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            </span>
          </label>
        </div>
        {caps.length > 0 || hasFilters ? (
          <div className="flex flex-wrap items-center gap-2">
            {caps.length > 0 ? <SmallCaps className="mr-1">Price</SmallCaps> : null}
            {caps.map((cap) => (
              <button
                key={cap}
                type="button"
                onClick={() => update({ max: search.max === cap ? undefined : cap, min: undefined })}
                aria-pressed={search.max === cap}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  search.max === cap ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:border-foreground/40",
                )}
              >
                Under {formatMoney(cap * 100, currency).replace(/\.00$/, "")}
              </button>
            ))}
            {hasFilters ? (
              <button type="button" onClick={() => update({ category: undefined, min: undefined, max: undefined })} className="ml-2 text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Results */}
      {!data ? (
        <div className={gridClass} aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-4">
              <SkeletonBlock className="aspect-[4/5] rounded-2xl" />
              <SkeletonBlock className="h-3 w-16 rounded-full" />
              <SkeletonBlock className="h-6 w-2/3" />
            </div>
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          eyebrow="No results"
          title={q ? `No products match “${q}”.` : "No products match these filters."}
          action={
            shell ? (
              <Button variant="ghost" onClick={() => shell.ask(q ? `I'm looking for ${q}. What do you have that's close?` : "Help me find something")}>
                Ask {assistant.displayName}
              </Button>
            ) : hasFilters ? (
              <Button variant="ghost" onClick={() => update({ category: undefined, min: undefined, max: undefined })}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-12">
          <div className={gridClass}>
            {data.items.map((product) => (
              <ProductCard key={product.productId} product={product} />
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} getLink={(target) => ({ to: "/products", search: { ...search, page: target } })} />
        </div>
      )}
    </Container>
  );
}

function FilterLink({ active, count, onClick, children }: { active: boolean; count?: number; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-baseline gap-1.5 text-sm tracking-wide transition-colors",
        active ? "text-foreground underline decoration-foreground underline-offset-[6px]" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {typeof count === "number" ? <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span> : null}
    </button>
  );
}
