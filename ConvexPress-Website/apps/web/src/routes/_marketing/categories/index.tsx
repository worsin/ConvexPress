import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { FolderTree, PackageOpen } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

type ProductCategory = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  thumbnailMediaId?: string;
  depth?: number;
  productCount?: number;
  totalProductCount?: number;
  children?: ProductCategory[];
};

export const Route = createFileRoute("/_marketing/categories/")({
  loader: async ({ context: { queryClient } }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );
    const siteUrl = normalizeSiteUrl(
      (publicSettings as { siteUrl?: string | null })?.siteUrl,
    );
    if (isPublicPluginEnabled("commerce", publicSettings as any)) {
      await queryClient.ensureQueryData(
        convexQuery(api.commerce.categories.getTree, {}),
      );
    }

    return {
      seoHead: buildSeoHead({
        title: "Product Categories - ConvexPress",
        description: "Browse the ConvexPress product catalog by category.",
        canonical: toAbsoluteUrl("/categories", siteUrl),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  component: ProductCategoriesPage,
});

function ProductCategoriesPage() {
  const { data } = useSuspenseQuery(
    convexQuery(api.commerce.categories.getTree, {}) as any,
  ) as { data: ProductCategory[] };

  const categories = flattenVisible(data ?? []).filter(
    (category) => (category.totalProductCount ?? category.productCount ?? 0) > 0,
  );
  const featured = categories.filter((category: any) => category.isFeatured);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <FolderTree className="size-4" />
          Catalog
        </div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          Product Categories
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
          Browse products by category, including nested collections and featured
          storefront groupings.
        </p>
      </section>

      {featured.length > 0 ? (
        <CategorySection title="Featured" categories={featured.slice(0, 8)} />
      ) : null}

      <CategorySection title="All Categories" categories={categories} />
    </div>
  );
}

function CategorySection({
  title,
  categories,
}: {
  title: string;
  categories: ProductCategory[];
}) {
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <span className="text-sm text-muted-foreground">
          {categories.length} {categories.length === 1 ? "category" : "categories"}
        </span>
      </div>

      {categories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No visible product categories yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <CategoryCard key={category._id} category={category} />
          ))}
        </div>
      )}
    </section>
  );
}

function CategoryCard({ category }: { category: ProductCategory }) {
  const count = category.totalProductCount ?? category.productCount ?? 0;

  return (
    <Link
      to="/categories/$slug"
      params={{ slug: category.slug }}
      className="group grid overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50"
    >
      <div className="aspect-[5/3] bg-muted">
        {category.thumbnailMediaId ? (
          <MediaImage
            mediaId={category.thumbnailMediaId as any}
            alt={category.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            preferredSize="large"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <PackageOpen className="size-10 text-muted-foreground/50" />
          </div>
        )}
      </div>
      <div className="grid gap-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-foreground">
            {category.name}
          </h3>
          <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            {count}
          </span>
        </div>
        {category.description ? (
          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
            {category.description}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function flattenVisible(nodes: ProductCategory[], output: ProductCategory[] = []) {
  for (const node of nodes) {
    output.push(node);
    flattenVisible(node.children ?? [], output);
  }
  return output;
}
