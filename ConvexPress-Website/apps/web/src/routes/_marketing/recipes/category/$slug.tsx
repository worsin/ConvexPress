import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl, siteTitled } from "@/lib/seo/head";
import CoreRecipesCategory, { type RecipesCategorySurfaceData } from "@/templates/packs/core/surfaces/recipes.category";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/recipes/category/$slug")({
  component: RecipeCategoryPage,
  notFoundComponent: NotFoundPage,
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
    if (!category) throw notFound();
    const siteUrl = normalizeSiteUrl(publicSettings?.siteUrl);
    const categoryName = category?.name ?? params.slug;
    return {
      recipesDisabled: false as const,
      seoHead: buildSeoHead({
        title: siteTitled(`${categoryName} - Recipes`),
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
  );
  const { data: category } = useSuspenseQuery(categoryQuery);
  const listQuery = convexQuery(api.recipes.queries.listPublished, {
      categorySlug: slug,
      page: 1,
      perPage: 24,
    });
  const { data } = useSuspenseQuery(listQuery);

  if (!category || !data) {
    return <NotFoundPage />;
  }

  const surfaceData: RecipesCategorySurfaceData = { category, recipes: data.recipes };

  return <Surface name="recipes.category" data={surfaceData} fallback={CoreRecipesCategory} />;
}
