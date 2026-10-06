/**
 * Depot · shop.catalog — the marketplace catalog: a toolbar of department
 * chips, price caps and sort, then a dense grid and numbered pagination.
 * The assistant column and persistent cart come from `ShopShell`; the data
 * comes from `useShopCatalogData` (the same reads as Core's catalog).
 */
import { Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useShopCatalogData } from "@/components/shop/useShopCatalogData";
import { formatMoney } from "@/lib/commerce/format";
import type { Sort } from "@/lib/commerce/shopSearch";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Chip, EmptyState, Label, Pagination, ProductCard, Select, Skeleton, Toolbar, buttonClasses } from "../parts";

const PRICE_CAPS = [25, 50, 100, 250, 1000];

export default function DepotShopCatalog(_props: SurfaceProps<Record<string, never>>) {
  // Depot offers the marketplace layout only.
  const { search, q, data, facetChips, commerceEnabled, currency, siteTitle, assistant, shell, layout, hasFilters, activeCategory, update } = useShopCatalogData("marketplace");
  const [draft, setDraft] = useState(q);
  const gridClass = layout.gridDensity === "dense"
    ? "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
    : "grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-4";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    update({ q: draft.trim() || undefined });
  };

  if (!commerceEnabled) {
    return <EmptyState title="The shop is not enabled on this site." />;
  }

  const categories = data?.facets.categories ?? [];
  const priceRange = data?.facets.priceRange ?? null;

  return (
    <div className="flex flex-col gap-4 pb-12" data-shop-layout="marketplace" data-pack="depot">
      {/* Title + search */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            {siteTitle ? <Label className="text-primary">{siteTitle}</Label> : null}
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
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
            <p className="text-[13px] tabular-nums text-muted-foreground">
              {data.total} {data.total === 1 ? "product" : "products"}
            </p>
          )}
        </div>

        <form onSubmit={submit} role="search" className="flex">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search products</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search products, parts, or ask a question…"
              className="h-10 w-full rounded-l-md border border-r-0 border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
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
          <Button type="submit" className="rounded-l-none">
            Search
          </Button>
        </form>

        {facetChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Label className="mr-1">Narrow your search</Label>
            {facetChips.map((chip) => (
              <Link key={chip.label} to="/products" search={{ q: chip.query ?? q, category: chip.categorySlug } as any} className={buttonClasses("secondary", "sm")}>
                {chip.label}
              </Link>
            ))}
          </div>
        )}
        {q && shell && (
          <p className="text-[13px] text-muted-foreground">
            Want a recommendation?{" "}
            <button type="button" onClick={() => shell.ask(`Which of these “${q}” results should I pick, and why?`)} className="font-medium text-primary hover:underline">
              Ask {assistant.displayName}
            </button>
          </p>
        )}
      </header>

      {/* Toolbar: departments, price caps, sort */}
      <Toolbar
        label="Filters"
        end={
          <>
            <Label>Sort</Label>
            <Select value={search.sort ?? (q ? "relevance" : "newest")} onChange={(event) => update({ sort: event.target.value as Sort })} aria-label="Sort products">
              <option value="relevance">Relevance</option>
              <option value="newest">Newest</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </Select>
          </>
        }
      >
        <Label className="mr-1">Department</Label>
        <Chip active={!search.category} onClick={() => update({ category: undefined })}>
          All
        </Chip>
        {categories.map((category) => (
          <Chip key={category.id} active={search.category === category.slug} onClick={() => update({ category: search.category === category.slug ? undefined : category.slug })}>
            {category.name} <span className="tabular-nums text-muted-foreground">{category.count}</span>
          </Chip>
        ))}
        {priceRange && (
          <>
            <Label className="ml-2 mr-1">Price</Label>
            {PRICE_CAPS.map((cap) =>
              priceRange.min < cap * 100 ? (
                <Chip key={cap} active={search.max === cap} onClick={() => update({ max: search.max === cap ? undefined : cap, min: undefined })}>
                  Under {formatMoney(cap * 100, currency).replace(/\.00$/, "")}
                </Chip>
              ) : null,
            )}
          </>
        )}
        {hasFilters && (
          <button type="button" onClick={() => update({ category: undefined, min: undefined, max: undefined })} className="ml-1 text-[13px] font-medium text-primary hover:underline">
            Clear
          </button>
        )}
      </Toolbar>

      {/* Results */}
      {!data ? (
        <div className={gridClass}>
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[3/4]" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          title={`No products match${q ? ` “${q}”` : ""}.`}
          description={`Try a broader term, clear the filters, or ask ${assistant.displayName} what you are looking for.`}
          action={
            shell ? (
              <Button onClick={() => shell.ask(q ? `I'm looking for ${q}. What do you have that's close?` : "Help me find something")}>Ask {assistant.displayName}</Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className={gridClass}>
            {data.items.map((product) => (
              <ProductCard key={product.productId} product={product} />
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} linkFor={(page) => ({ to: "/products", search: { ...search, page: page === 1 ? undefined : page } })} />
        </>
      )}
    </div>
  );
}
