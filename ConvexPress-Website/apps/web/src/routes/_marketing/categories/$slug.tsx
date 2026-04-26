import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { ChevronRight, PackageOpen } from "lucide-react";
import { z } from "zod";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { MediaImage } from "@/components/media/MediaImage";
import { useSettings } from "@/contexts/SettingsContext";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

type ProductCategory = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  thumbnailMediaId?: string;
  productCount?: number;
  totalProductCount?: number;
  metaTitle?: string;
  metaDescription?: string;
  ancestors?: ProductCategory[];
  children?: ProductCategory[];
};

type ProductSummary = {
  _id: string;
  slug: string;
  title: string;
  excerpt?: string;
  displayPrice?: number;
  productType?: "simple" | "variable" | "external";
  featuredMediaId?: string;
  categories?: Array<{ _id: string; name: string; slug: string }>;
};

const categorySearchSchema = z.object({
  page: z.number().min(1).optional(),
});

export const Route = createFileRoute("/_marketing/categories/$slug")({
  validateSearch: categorySearchSchema,
  loaderDeps: ({ search }) => ({
    page: Number(search.page) || 1,
  }),
  loader: async ({ context: { queryClient }, params: { slug }, deps }) => {
    const [publicSettings, category] = await Promise.all([
      queryClient.ensureQueryData(convexQuery(api.settings.queries.getPublic, {})),
      queryClient.ensureQueryData(
        convexQuery(api.commerce.categories.getBySlug, { slug }),
      ),
    ]);

    const siteUrl = normalizeSiteUrl(
      (publicSettings as { siteUrl?: string | null })?.siteUrl,
    );

    if (category) {
      await queryClient.ensureQueryData(
        convexQuery(api.commerce.products.listPublished, {
          page: deps.page,
          perPage: 12,
          categorySlug: slug,
        }),
      );
    }

    const title =
      (category as ProductCategory | null)?.metaTitle ??
      `${(category as ProductCategory | null)?.name ?? slug} - ConvexPress`;
    const description =
      (category as ProductCategory | null)?.metaDescription ??
      (category as ProductCategory | null)?.description ??
      "Browse products in this category.";

    return {
      seoHead: buildSeoHead({
        title,
        description,
        canonical: toAbsoluteUrl(
          deps.page > 1
            ? `/categories/${slug}?page=${deps.page}`
            : `/categories/${slug}`,
          siteUrl,
        ),
        ogType: "website",
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  component: ProductCategoryArchivePage,
});

function ProductCategoryArchivePage() {
  const { slug } = Route.useParams();
  const { page } = Route.useLoaderDeps();
  const settings = useSettings();
  const currencyCode = settings?.commerceConfig?.currencyCode || "USD";

  const { data: category } = useSuspenseQuery(
    convexQuery(api.commerce.categories.getBySlug, { slug }) as any,
  ) as { data: ProductCategory | null };

  if (!category) {
    return <NotFoundPage />;
  }

  const { data } = useSuspenseQuery(
    convexQuery(api.commerce.products.listPublished, {
      page,
      perPage: 12,
      categorySlug: slug,
    }) as any,
  ) as {
    data: {
      products: ProductSummary[];
      page: number;
      totalPages: number;
      total: number;
    };
  };

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
          <span>{data.total} products found</span>
          <span>Page {data.page}</span>
        </div>

        {data.products.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <PackageOpen className="mx-auto size-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              No published products in this category.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {data.products.map((product) => (
              <ProductCard
                key={product._id}
                product={product}
                currencyCode={currencyCode}
              />
            ))}
          </div>
        )}

        {data.totalPages > 1 ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4 text-sm">
            <span className="text-muted-foreground">
              Page {data.page} of {data.totalPages}
            </span>
            <div className="flex gap-3">
              {data.page > 1 ? (
                <Link
                  to="/categories/$slug"
                  params={{ slug }}
                  search={{ page: data.page - 1 }}
                  className="font-medium text-primary hover:underline"
                >
                  Previous
                </Link>
              ) : (
                <span className="text-muted-foreground/60">Previous</span>
              )}
              {data.page < data.totalPages ? (
                <Link
                  to="/categories/$slug"
                  params={{ slug }}
                  search={{ page: data.page + 1 }}
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
  product: ProductSummary;
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
