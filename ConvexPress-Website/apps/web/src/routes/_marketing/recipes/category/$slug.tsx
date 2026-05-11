import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { MediaImage } from "@/components/media/MediaImage";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

export const Route = createFileRoute("/_marketing/recipes/category/$slug")({
  component: RecipeCategoryPage,
  loader: async ({ context: { queryClient }, params }) => {
    const publicSettings = (await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    )) as { siteUrl?: string | null; plugins?: { recipesEnabled?: boolean } };

    if (!isPublicPluginEnabled("recipes", publicSettings)) {
      return { seoHead: {}, recipesDisabled: true as const };
    }

    const [category] = await Promise.all([
      queryClient.ensureQueryData(
        convexQuery(api.recipes.queries.getCategoryBySlug, { slug: params.slug }),
      ),
      queryClient.ensureQueryData(
        convexQuery(api.recipes.queries.listPublished, {
          categorySlug: params.slug,
          page: 1,
          perPage: 24,
        }),
      ),
    ]);
    const siteUrl = normalizeSiteUrl(publicSettings?.siteUrl);
    const categoryName = category?.name ?? params.slug;
    return {
      recipesDisabled: false as const,
      seoHead: buildSeoHead({
        title: `${categoryName} - Recipes - ConvexPress`,
        description: category?.description || `Recipes filed under ${categoryName}.`,
        canonical: toAbsoluteUrl(`/recipes/category/${params.slug}`, siteUrl),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
});

function RecipeCategoryPage() {
  return (
    <PublicPluginGate pluginId="recipes">
      <RecipeCategoryPageInner />
    </PublicPluginGate>
  );
}

function RecipeCategoryPageInner() {
  const { slug } = Route.useParams();
  const categoryQuery = convexQuery(
    api.recipes.queries.getCategoryBySlug,
    { slug },
  ) as any;
  const { data: category } = useSuspenseQuery(categoryQuery) as { data: any };
  const listQuery = convexQuery(api.recipes.queries.listPublished, {
      categorySlug: slug,
      page: 1,
      perPage: 24,
    }) as any;
  const { data } = useSuspenseQuery(listQuery) as { data: any };

  if (!category) {
    return <NotFoundPage />;
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-[2rem] border border-border bg-card p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">
          Recipe Category
        </div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          {category.name}
        </h1>
        {category.description && (
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            {category.description}
          </p>
        )}
      </section>

      {data.recipes.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No recipes are published in this category yet.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {data.recipes.map((recipe: any) => (
            <article
              key={recipe._id}
              className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm"
            >
              <Link to="/recipes/$slug" params={{ slug: recipe.slug }}>
                <div className="aspect-[4/3] bg-muted/40">
                  {recipe.featuredImageId ? (
                    <MediaImage
                      mediaId={recipe.featuredImageId}
                      alt={recipe.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-orange-100 to-amber-100 text-sm text-orange-900">
                      Recipe
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h2 className="text-xl font-semibold">{recipe.title}</h2>
                  {recipe.excerpt && (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {recipe.excerpt}
                    </p>
                  )}
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
