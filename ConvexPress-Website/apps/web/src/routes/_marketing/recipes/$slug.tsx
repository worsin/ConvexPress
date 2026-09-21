import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl, siteTitled } from "@/lib/seo/head";
import CoreRecipeDetail, { type RecipeDetailSurfaceData } from "@/templates/packs/core/surfaces/recipes.detail";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/recipes/$slug")({
  component: RecipeDetailPage,
  notFoundComponent: NotFoundPage,
  loader: async ({ context: { queryClient }, params }) => {
    const publicSettings = (await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    )) as { siteUrl?: string | null; plugins?: { recipesEnabled?: boolean } };

    if (!isPublicPluginEnabled("recipes", publicSettings)) {
      return { seoHead: {}, recipesDisabled: true as const };
    }

    const recipe = await queryClient.ensureQueryData(
      convexQuery(api.recipes.queries.getBySlug, { slug: params.slug }),
    );

    if (!recipe) throw notFound();
    const siteUrl = normalizeSiteUrl(publicSettings?.siteUrl);

    return {
      recipesDisabled: false as const,
      seoHead: buildSeoHead({
        title: siteTitled(`${recipe?.title ?? params.slug} - Recipe`),
        description: recipe?.excerpt || recipe?.description || `Recipe: ${recipe?.title ?? params.slug}.`,
        canonical: toAbsoluteUrl(`/recipes/${params.slug}`, siteUrl),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
});

function RecipeDetailPage() {
  return (
    <PublicPluginGate pluginId="recipes">
      <RecipeDetailPageInner />
    </PublicPluginGate>
  );
}

function RecipeDetailPageInner() {
  const { slug } = Route.useParams();
  const query = convexQuery(api.recipes.queries.getBySlug, { slug });
  const { data: recipe } = useSuspenseQuery(query);

  if (!recipe) {
    return <NotFoundPage />;
  }

  const data: RecipeDetailSurfaceData = { recipe };

  return <Surface name="recipes.detail" data={data} fallback={CoreRecipeDetail} />;
}
