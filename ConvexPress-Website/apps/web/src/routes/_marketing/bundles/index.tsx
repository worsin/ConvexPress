import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { Package } from "lucide-react";

import { useSettings } from "@/contexts/SettingsContext";

export const Route = createFileRoute("/_marketing/bundles/")({
  head: () => ({
    meta: [{ title: "Product Bundles - ConvexPress" }],
  }),
  component: BundlesIndexPage,
});

function BundlesIndexPage() {
  const settings = useSettings();
  const currencyCode =
    (settings as any)?.commerceConfig?.currencyCode || "USD";

  const { data: bundles } = useSuspenseQuery(
    convexQuery(
      (api as any).commerceBundles.queries.listActive,
      {},
    ) as any,
  ) as {
    data: Array<{
      _id: string;
      name: string;
      slug: string;
      shortDescription?: string;
      description?: string;
      images: string[];
      bundleType: string;
      pricingType: string;
      regularPrice?: number;
      bundlePrice?: number;
      discountPercent?: number;
      components: Array<{
        _id: string;
        quantity: number;
        product?: {
          _id: string;
          title: string;
          featuredMediaId?: string;
          basePrice?: number | { amount: number };
        };
      }>;
    }>;
  };

  function formatPrice(cents: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
    }).format(cents / 100);
  }

  return (
    <div className="relative left-1/2 w-[calc(100vw-1rem)] -translate-x-1/2">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-10 px-4 pb-12 md:px-6 lg:px-8">
      {/* Hero */}
      <section className="grid gap-8 rounded-[2rem] border border-border/60 bg-card p-8 shadow-sm">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Bundles
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Save more with curated product bundles.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            Handpicked combinations at special prices. Buy together and get more
            value from every order.
          </p>
        </div>
      </section>

      {bundles.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No bundles are available right now. Check back soon.
          </p>
        </div>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            {bundles.length} bundle{bundles.length === 1 ? "" : "s"} available
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {bundles.map((bundle) => {
              const savings =
                typeof bundle.regularPrice === "number" &&
                typeof bundle.bundlePrice === "number" &&
                bundle.regularPrice > bundle.bundlePrice
                  ? bundle.regularPrice - bundle.bundlePrice
                  : 0;

              const savingsPercent =
                savings > 0 && bundle.regularPrice
                  ? Math.round((savings / bundle.regularPrice) * 100)
                  : 0;

              return (
                <article
                  key={bundle._id}
                  className="group overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <Link
                    to="/bundles/$slug"
                    params={{ slug: bundle.slug }}
                    className="block"
                  >
                    {/* Component preview */}
                    <div className="relative aspect-[4/3] bg-muted">
                      {bundle.images?.[0] ? (
                        <img
                          src={bundle.images[0]}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
                          <Package className="h-10 w-10 text-muted-foreground/60" />
                          <span className="text-sm font-medium text-muted-foreground">
                            {bundle.components.length} product
                            {bundle.components.length === 1 ? "" : "s"}
                          </span>
                          <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                            {bundle.components.slice(0, 4).map((comp) => (
                              <span
                                key={comp._id}
                                className="rounded-full bg-background/70 px-2.5 py-0.5 text-xs font-medium text-foreground"
                              >
                                {comp.product?.title ?? "Product"}
                                {comp.quantity > 1 ? ` x${comp.quantity}` : ""}
                              </span>
                            ))}
                            {bundle.components.length > 4 && (
                              <span className="rounded-full bg-background/70 px-2.5 py-0.5 text-xs font-medium text-foreground">
                                +{bundle.components.length - 4} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {savingsPercent > 0 && (
                        <div className="absolute right-3 top-3 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-sm">
                          Save {savingsPercent}%
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 p-5">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                          {bundle.bundleType === "mix_and_match"
                            ? "Mix & Match"
                            : bundle.bundleType === "bogo"
                              ? "BOGO"
                              : "Bundle"}
                        </span>
                      </div>

                      <h2 className="text-xl font-semibold text-foreground">
                        {bundle.name}
                      </h2>

                      {bundle.shortDescription && (
                        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                          {bundle.shortDescription}
                        </p>
                      )}

                      <div className="flex items-baseline gap-2">
                        {typeof bundle.bundlePrice === "number" ? (
                          <span className="text-lg font-semibold text-foreground">
                            {formatPrice(bundle.bundlePrice)}
                          </span>
                        ) : (
                          <span className="text-lg font-semibold text-foreground">
                            {typeof bundle.regularPrice === "number"
                              ? formatPrice(bundle.regularPrice)
                              : "Price varies"}
                          </span>
                        )}
                        {savings > 0 &&
                          typeof bundle.regularPrice === "number" && (
                            <span className="text-sm text-muted-foreground line-through">
                              {formatPrice(bundle.regularPrice)}
                            </span>
                          )}
                      </div>
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
