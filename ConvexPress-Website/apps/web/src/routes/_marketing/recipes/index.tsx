import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl, siteTitled } from "@/lib/seo/head";
import CoreRecipesIndex, { type RecipesIndexSurfaceData } from "@/templates/packs/core/surfaces/recipes.index";
import { Surface } from "@/templates/sdk/Surface";

const recipesSearchSchema = z.object({
  page: z.number().min(1).optional(),
});

export const Route = createFileRoute("/_marketing/recipes/")({
  validateSearch: recipesSearchSchema,
  component: RecipesIndexPage,
  notFoundComponent: NotFoundPage,
  loaderDeps: ({ search }) => ({
    page: Number(search.page) || 1,
  }),
  loader: async ({ context: { queryClient }, deps: { page } }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );

    if (!isPublicPluginEnabled("recipes", publicSettings)) {
      return { seoHead: {}, recipesDisabled: true as const };
    }

    const recipes = await queryClient.ensureQueryData(
      convexQuery(api.recipes.queries.listPublished, {
        page,
        perPage: 12,
      }),
    );

    if (!recipes) throw notFound();
    const siteUrl = normalizeSiteUrl((publicSettings as { siteUrl?: string | null })?.siteUrl);
    return {
      recipesDisabled: false as const,
      seoHead: buildSeoHead({
        title: page > 1 ? siteTitled(`Recipes Page ${page}`) : siteTitled("Recipes"),
        description: "Browse beautifully organized recipes powered by ConvexPress.",
        canonical: toAbsoluteUrl(page > 1 ? `/recipes?page=${page}` : "/recipes", siteUrl),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
});

function RecipesIndexPage() {
  const { page } = Route.useLoaderDeps();
  const query = convexQuery(api.recipes.queries.listPublished, {
      page,
      perPage: 12,
    });
  const { data } = useSuspenseQuery(query);

  if (!data) return <NotFoundPage />;

  const surfaceData: RecipesIndexSurfaceData = {
    category: data.category,
    recipes: data.recipes,
  };

  return <Surface name="recipes.index" data={surfaceData} fallback={CoreRecipesIndex} />;
}
