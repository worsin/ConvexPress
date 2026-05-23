import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";

import { MediaImage } from "@/components/media/MediaImage";
import { useSettings } from "@/contexts/SettingsContext";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

const productsSearchSchema = z.object({
  page: z.number().min(1).optional(),
});

export const Route = createFileRoute("/_marketing/products/")({
  validateSearch: productsSearchSchema,
  loaderDeps: ({ search }) => ({
    page: Number(search.page) || 1,
  }),
  loader: async ({ context: { queryClient }, deps: { page } }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );

    const siteUrl = normalizeSiteUrl((publicSettings as { siteUrl?: string | null })?.siteUrl);
    if ((publicSettings as any)?.plugins?.commerceEnabled === true) {
      await queryClient.ensureQueryData(
        convexQuery(api.commerce.products.listPublished, {
          page,
          perPage: 12,
        }),
      );
    }

    return {
      seoHead: buildSeoHead({
        title: page > 1 ? `Products Page ${page} - ConvexPress` : "Products - ConvexPress",
        description: "Browse products published through the ConvexPress commerce catalog.",
        canonical: toAbsoluteUrl(page > 1 ? `/products?page=${page}` : "/products", siteUrl),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  component: ProductsIndexPage,
});

function ProductsIndexPage() {
  const settings = useSettings();
  const currencyCode = settings?.commerceConfig?.currencyCode || "USD";
  const { page } = Route.useLoaderDeps();
  const { data } = useSuspenseQuery(
    convexQuery(api.commerce.products.listPublished, {
      page,
      perPage: 12,
    }) as any,
  ) as {
    data: {
      products: Array<{
        _id: string;
        slug: string;
        title: string;
        excerpt?: string;
        displayPrice?: number;
        productType?: "simple" | "variable" | "external";
        featuredMediaId?: string;
        categories?: Array<{ _id: string; name: string }>;
      }>;
      page: number;
      totalPages: number;
      total: number;
    };
  };

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-8 rounded-[2rem] border border-border/60 bg-card p-8 shadow-sm">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Storefront
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Commerce products published from the ConvexPress catalog.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            Browse active products, pricing, categories, and availability from
            the published commerce catalog.
          </p>
        </div>
      </section>

      {data.products.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No products are published yet.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>{data.total} products in the catalog</p>
            <p>Page {data.page}</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {data.products.map((product) => (
              <article
                key={product._id}
                className="group overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
              >
                <Link to="/products/$slug" params={{ slug: product.slug }} className="block">
                  <div className="aspect-[4/3] bg-muted/40">
                    {product.featuredMediaId ? (
                      <MediaImage
                        mediaId={product.featuredMediaId as any}
                        alt={product.title}
                        className="h-full w-full object-cover"
                        preferredSize="large"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
                        Product
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-4 p-5">
                    <div className="flex flex-wrap gap-2">
                      {(product.categories ?? []).map((category) => (
                        <span
                          key={category._id}
                          className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                        >
                          {category.name}
                        </span>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <h2 className="text-xl font-semibold text-foreground">
                        {product.title}
                      </h2>
                      {product.excerpt ? (
                        <p className="text-sm leading-6 text-muted-foreground">
                          {product.excerpt}
                        </p>
                      ) : null}
                    </div>

                    <div className="text-lg font-semibold text-foreground">
                      {typeof product.displayPrice === "number" ? (
                        <>
                          {product.productType === "variable" ? (
                            <span className="mr-1 text-sm font-normal text-muted-foreground">
                              From
                            </span>
                          ) : null}
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: currencyCode,
                          }).format(product.displayPrice / 100)}
                        </>
                      ) : (
                        "Price unavailable"
                      )}
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>

          {data.totalPages > 1 ? (
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 text-sm">
              <div className="text-muted-foreground">
                Page {data.page} of {data.totalPages}
              </div>
              <div className="flex gap-3">
                {data.page > 1 ? (
                  <Link
                    to="/products"
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
                    to="/products"
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
        </>
      )}
    </div>
  );
}
