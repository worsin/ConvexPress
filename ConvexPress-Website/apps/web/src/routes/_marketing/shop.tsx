import { useState } from "react";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { Search, ShoppingBag, SlidersHorizontal, X } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import { useSettings } from "@/contexts/SettingsContext";

type ShopSearch = {
  page?: number;
  category?: string;
  search?: string;
};

export const Route = createFileRoute("/_marketing/shop")({
  validateSearch: (search: Record<string, unknown>): ShopSearch => ({
    page:
      typeof search.page === "number"
        ? Math.max(1, search.page)
        : Number(search.page) || 1,
    category: typeof search.category === "string" ? search.category : undefined,
    search: typeof search.search === "string" ? search.search : undefined,
  }),
  loaderDeps: ({ search }) => ({
    page: Number(search.page) || 1,
    category: search.category,
    search: search.search,
  }),
  loader: async ({ context: { queryClient }, deps }) => {
    await queryClient.ensureQueryData(
      convexQuery(api.commerce.products.listPublished, {
        page: deps.page,
        perPage: 12,
        categorySlug: deps.category,
        search: deps.search,
      }),
    );
  },
  head: () => ({
    meta: [{ title: "Shop - ConvexPress" }],
  }),
  component: ShopPage,
});

function ShopPage() {
  return <ShopContent />;
}

function ShopContent() {
  const settings = useSettings();
  const currencyCode =
    (settings as any)?.commerceConfig?.currencyCode || "USD";
  const { page, category: categorySlug, search: searchParam } =
    Route.useLoaderDeps();

  const [searchInput, setSearchInput] = useState(searchParam ?? "");
  const [showFilters, setShowFilters] = useState(false);

  const { data } = useSuspenseQuery(
    convexQuery(api.commerce.products.listPublished, {
      page,
      perPage: 12,
      categorySlug,
      search: searchParam,
    }) as any,
  ) as {
    data: {
      products: Array<{
        _id: string;
        slug: string;
        title: string;
        excerpt?: string;
        displayPrice?: number;
        compareAtPrice?: number;
        productType?: "simple" | "variable" | "external";
        featuredMediaId?: string;
        categories?: Array<{ _id: string; name: string; slug: string }>;
        status: string;
      }>;
      page: number;
      totalPages: number;
      total: number;
    };
  };

  const { data: categories } = useSuspenseQuery(
    convexQuery(api.commerce.categories.listPublic, {}) as any,
  ) as {
    data: Array<{
      _id: string;
      name: string;
      slug: string;
      productCount: number;
      thumbnailMediaId?: string;
    }>;
  };

  const navigate = Route.useNavigate();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    void navigate({
      search: ((prev: ShopSearch) => ({
        ...prev,
        search: searchInput.trim() || undefined,
        page: 1,
      })) as any,
    });
  }

  function handleCategoryFilter(slug: string | undefined) {
    void navigate({
      search: ((prev: ShopSearch) => ({
        ...prev,
        category: slug,
        page: 1,
      })) as any,
    });
  }

  function clearFilters() {
    setSearchInput("");
    void navigate({
      search: { page: 1 } as any,
    });
  }

  const hasActiveFilters = Boolean(categorySlug || searchParam);

  return (
    <div className="flex flex-col gap-8">
      {/* Hero header */}
      <section className="grid gap-6 rounded-[2rem] border border-border/60 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-8 shadow-sm">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">
            Shop
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Browse our catalog
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            Discover products across our full collection. Use filters and search
            to find exactly what you need.
          </p>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex max-w-xl gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products..."
              className="w-full rounded-xl border border-border bg-background py-3 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Search
          </button>
        </form>
      </section>

      <div className="flex gap-8">
        {/* Category sidebar - desktop */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <CategorySidebar
            categories={categories ?? []}
            activeSlug={categorySlug}
            onSelect={handleCategoryFilter}
          />
        </aside>

        {/* Mobile filter drawer */}
        {showFilters && (
          <div
            className="fixed inset-0 z-50 bg-black/40 lg:hidden"
            onClick={() => setShowFilters(false)}
          >
            <aside
              className="absolute left-0 top-0 h-full w-72 overflow-y-auto bg-card p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Filters</h3>
                <button type="button" onClick={() => setShowFilters(false)}>
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
              <CategorySidebar
                categories={categories ?? []}
                activeSlug={categorySlug}
                onSelect={(slug) => {
                  handleCategoryFilter(slug);
                  setShowFilters(false);
                }}
              />
            </aside>
          </div>
        )}

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Toolbar */}
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowFilters(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground lg:hidden"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </button>
              <p className="text-sm text-muted-foreground">
                {data.total} {data.total === 1 ? "product" : "products"}
                {hasActiveFilters ? " found" : " in the catalog"}
              </p>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </button>
            )}
          </div>

          {/* Active filter badges */}
          {hasActiveFilters && (
            <div className="mb-6 flex flex-wrap gap-2">
              {categorySlug && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">
                  Category:{" "}
                  {categories?.find((c) => c.slug === categorySlug)?.name ??
                    categorySlug}
                  <button
                    type="button"
                    onClick={() => handleCategoryFilter(undefined)}
                    className="rounded-full p-0.5 hover:bg-emerald-200"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {searchParam && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-900">
                  Search: {searchParam}
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput("");
                      void navigate({
                        search: ((prev: ShopSearch) => ({
                          ...prev,
                          search: undefined,
                          page: 1,
                        })) as any,
                      });
                    }}
                    className="rounded-full p-0.5 hover:bg-blue-200"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Product grid */}
          {data.products.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border p-10 text-center">
              <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "No products match your filters. Try adjusting your search or category."
                  : "No products are published yet."}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {data.products.map((product) => (
                  <ProductCard
                    key={product._id}
                    product={product}
                    currencyCode={currencyCode}
                  />
                ))}
              </div>

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="mt-8 flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 text-sm">
                  <div className="text-muted-foreground">
                    Page {data.page} of {data.totalPages}
                  </div>
                  <div className="flex gap-3">
                    {data.page > 1 ? (
                      <Link
                        to="/shop"
                        search={((prev: ShopSearch) => ({
                          ...prev,
                          page: data.page - 1,
                        })) as any}
                        className="font-medium text-primary hover:underline"
                      >
                        Previous
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/60">
                        Previous
                      </span>
                    )}
                    {data.page < data.totalPages ? (
                      <Link
                        to="/shop"
                        search={((prev: ShopSearch) => ({
                          ...prev,
                          page: data.page + 1,
                        })) as any}
                        className="font-medium text-primary hover:underline"
                      >
                        Next
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/60">Next</span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Category Sidebar ──────────────────────────────────────────────────────

function CategorySidebar({
  categories,
  activeSlug,
  onSelect,
}: {
  categories: Array<{
    _id: string;
    name: string;
    slug: string;
    productCount: number;
    thumbnailMediaId?: string;
  }>;
  activeSlug?: string;
  onSelect: (slug: string | undefined) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Categories
      </h3>
      <ul className="space-y-1">
        <li>
          <button
            type="button"
            onClick={() => onSelect(undefined)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              !activeSlug
                ? "bg-primary/10 font-medium text-primary"
                : "text-foreground hover:bg-muted"
            }`}
          >
            All Products
          </button>
        </li>
        {categories.map((cat) => (
          <li key={cat._id}>
            <button
              type="button"
              onClick={() => onSelect(cat.slug)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                activeSlug === cat.slug
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {cat.thumbnailMediaId ? (
                  <span className="size-7 shrink-0 overflow-hidden rounded-md bg-muted">
                    <MediaImage
                      mediaId={cat.thumbnailMediaId as any}
                      alt=""
                      className="h-full w-full object-cover"
                      preferredSize="thumbnail"
                      sizes="28px"
                      loading="lazy"
                    />
                  </span>
                ) : null}
                <span className="truncate">{cat.name}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {cat.productCount}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Product Card ──────────────────────────────────────────────────────────

function ProductCard({
  product,
  currencyCode,
}: {
  product: {
    _id: string;
    slug: string;
    title: string;
    excerpt?: string;
    displayPrice?: number;
    compareAtPrice?: number;
    productType?: "simple" | "variable" | "external";
    featuredMediaId?: string;
    categories?: Array<{ _id: string; name: string; slug: string }>;
  };
  currencyCode: string;
}) {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  });

  const hasDiscount =
    typeof product.compareAtPrice === "number" &&
    typeof product.displayPrice === "number" &&
    product.compareAtPrice > product.displayPrice;

  return (
    <article className="group overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        className="block"
      >
        <div className="aspect-[4/3] bg-muted/40">
          {product.featuredMediaId ? (
            <MediaImage
              mediaId={product.featuredMediaId as any}
              alt={product.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              preferredSize="large"
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-emerald-100 to-cyan-100">
              <ShoppingBag className="h-10 w-10 text-emerald-600/40" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 p-5">
          {/* Category badges */}
          {(product.categories ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(product.categories ?? []).slice(0, 3).map((cat) => (
                <span
                  key={cat._id}
                  className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900"
                >
                  {cat.name}
                </span>
              ))}
            </div>
          )}

          <h2 className="text-lg font-semibold leading-snug text-foreground">
            {product.title}
          </h2>

          {product.excerpt && (
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {product.excerpt}
            </p>
          )}

          <div className="mt-auto flex items-center gap-3">
            {typeof product.displayPrice === "number" ? (
              <>
                {product.productType === "variable" && (
                  <span className="text-sm font-normal text-muted-foreground">
                    From
                  </span>
                )}
                <span
                  className={`text-lg font-semibold ${hasDiscount ? "text-red-600" : "text-foreground"}`}
                >
                  {formatter.format(product.displayPrice / 100)}
                </span>
                {hasDiscount && (
                  <span className="text-sm text-muted-foreground line-through">
                    {formatter.format(product.compareAtPrice! / 100)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                Price unavailable
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* View product action */}
      <div className="border-t border-border px-5 py-3">
        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <ShoppingBag className="h-4 w-4" />
          View Product
        </Link>
      </div>
    </article>
  );
}
