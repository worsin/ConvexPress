/** Core · shop.category — one product category: breadcrumb, hero, subcategories, paginated products. */
import { Link } from "@tanstack/react-router";
import { ChevronRight, PackageOpen } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface CategoryArchiveCategory {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  thumbnailMediaId?: string;
  productCount?: number;
  totalProductCount?: number;
  metaTitle?: string;
  metaDescription?: string;
  ancestors?: CategoryArchiveCategory[];
  children?: CategoryArchiveCategory[];
}

export interface CategoryArchiveProduct {
  _id: string;
  slug: string;
  title: string;
  excerpt?: string;
  displayPrice?: number;
  productType?: "simple" | "variable" | "external";
  featuredMediaId?: string;
  categories?: Array<{ _id: string; name: string; slug: string }>;
}

export interface CategoryArchiveSurfaceData {
  /** Slug of the category being viewed (used for pagination links). */
  slug: string;
  category: CategoryArchiveCategory;
  currencyCode: string;
  results: {
    products: CategoryArchiveProduct[];
    page: number;
    totalPages: number;
    total: number;
  };
}

export default function CoreShopCategory({ data }: SurfaceProps<CategoryArchiveSurfaceData>) {
  const { slug, category, currencyCode, results } = data;

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="size-4 text-muted-foreground" />
        <Link
          to="/categories"
          className="text-muted-foreground hover:text-foreground"
        >
          Categories
        </Link>
        {(category.ancestors ?? []).map((ancestor) => (
          <span key={ancestor._id} className="contents">
            <ChevronRight className="size-4 text-muted-foreground" />
            <Link
              to="/categories/$slug"
              params={{ slug: ancestor.slug }}
              className="text-muted-foreground hover:text-foreground"
            >
              {ancestor.name}
            </Link>
          </span>
        ))}
        <ChevronRight className="size-4 text-muted-foreground" />
        <span className="font-medium text-foreground">{category.name}</span>
      </nav>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        {category.thumbnailMediaId ? (
          <div className="aspect-[5/2] bg-muted">
            <MediaImage
              mediaId={category.thumbnailMediaId as any}
              alt={category.name}
              className="h-full w-full object-cover"
              preferredSize="large"
              sizes="100vw"
            />
          </div>
        ) : null}
        <div className="grid gap-3 p-6">
          <div className="text-sm font-medium text-muted-foreground">
            {category.totalProductCount ?? category.productCount ?? 0} products
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            {category.name}
          </h1>
          {category.description ? (
            <p className="max-w-3xl text-base leading-7 text-muted-foreground">
              {category.description}
            </p>
          ) : null}
        </div>
      </section>

      {(category.children ?? []).length > 0 ? (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold text-foreground">Subcategories</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(category.children ?? []).map((child) => (
              <Link
                key={child._id}
                to="/categories/$slug"
                params={{ slug: child.slug }}
                className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <div className="font-medium text-foreground">{child.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {child.totalProductCount ?? child.productCount ?? 0} products
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-5">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{results.total} products found</span>
          <span>Page {results.page}</span>
        </div>

        {results.products.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <PackageOpen className="mx-auto size-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              No published products in this category.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {results.products.map((product) => (
              <ProductCard
                key={product._id}
                product={product}
                currencyCode={currencyCode}
              />
            ))}
          </div>
        )}

        {results.totalPages > 1 ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4 text-sm">
            <span className="text-muted-foreground">
              Page {results.page} of {results.totalPages}
            </span>
            <div className="flex gap-3">
              {results.page > 1 ? (
                <Link
                  to="/categories/$slug"
                  params={{ slug }}
                  search={{ page: results.page - 1 }}
                  className="font-medium text-primary hover:underline"
                >
                  Previous
                </Link>
              ) : (
                <span className="text-muted-foreground/60">Previous</span>
              )}
              {results.page < results.totalPages ? (
                <Link
                  to="/categories/$slug"
                  params={{ slug }}
                  search={{ page: results.page + 1 }}
                  className="font-medium text-primary hover:underline"
                >
                  Next
                </Link>
              ) : (
                <span className="text-muted-foreground/60">Next</span>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ProductCard({
  product,
  currencyCode,
}: {
  product: CategoryArchiveProduct;
  currencyCode: string;
}) {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  });

  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50">
      <Link to="/products/$slug" params={{ slug: product.slug }} className="block">
        <div className="aspect-[4/3] bg-muted">
          {product.featuredMediaId ? (
            <MediaImage
              mediaId={product.featuredMediaId as any}
              alt={product.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              preferredSize="large"
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <PackageOpen className="size-10 text-muted-foreground/50" />
            </div>
          )}
        </div>
        <div className="grid gap-3 p-5">
          {(product.categories ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {(product.categories ?? []).slice(0, 3).map((category) => (
                <span
                  key={category._id}
                  className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
                >
                  {category.name}
                </span>
              ))}
            </div>
          ) : null}
          <h2 className="text-lg font-semibold leading-snug text-foreground">
            {product.title}
          </h2>
          {product.excerpt ? (
            <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
              {product.excerpt}
            </p>
          ) : null}
          <div className="font-semibold text-foreground">
            {typeof product.displayPrice === "number" ? (
              <>
                {product.productType === "variable" ? (
                  <span className="mr-1 text-sm font-normal text-muted-foreground">
                    From
                  </span>
                ) : null}
                {formatter.format(product.displayPrice / 100)}
              </>
            ) : (
              "Price unavailable"
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
