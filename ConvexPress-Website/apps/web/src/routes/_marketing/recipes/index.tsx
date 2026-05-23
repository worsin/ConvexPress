import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";

import { MediaImage } from "@/components/media/MediaImage";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

const recipesSearchSchema = z.object({
  page: z.number().min(1).optional(),
});

export const Route = createFileRoute("/_marketing/recipes/")({
  validateSearch: recipesSearchSchema,
  component: RecipesIndexPage,
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

    await queryClient.ensureQueryData(
      convexQuery(api.recipes.queries.listPublished, {
        page,
        perPage: 12,
      }),
    );

    const siteUrl = normalizeSiteUrl((publicSettings as { siteUrl?: string | null })?.siteUrl);
    return {
      recipesDisabled: false as const,
      seoHead: buildSeoHead({
        title: page > 1 ? `Recipes Page ${page} - ConvexPress` : "Recipes - ConvexPress",
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
    }) as any;
  const { data } = useSuspenseQuery(query) as { data: any };

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-8 rounded-[2rem] border border-border/60 bg-card p-8 shadow-sm">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Recipes
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            A living recipe box for beautiful, searchable food content.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            Publish recipe cards, organize them by category, and turn scanned
            recipe images into clean, structured cooking pages.
          </p>
        </div>
      </section>

      {data.category && (
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Filtered category
          </div>
          <h2 className="mt-2 text-2xl font-semibold">{data.category.name}</h2>
          {data.category.description && (
            <p className="mt-2 text-sm text-muted-foreground">
              {data.category.description}
            </p>
          )}
        </div>
      )}

      {data.recipes.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No recipes are published yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {data.recipes.map((recipe: any) => (
            <article
              key={recipe._id}
              className="group overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
            >
              <Link
                to="/recipes/$slug"
                params={{ slug: recipe.slug }}
                className="block"
              >
                <div className="aspect-[4/3] bg-muted/40">
                  {recipe.featuredImageId ? (
                    <MediaImage
                      mediaId={recipe.featuredImageId}
                      alt={recipe.title}
                      className="h-full w-full object-cover"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
                      Recipe
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-4 p-5">
                  <div className="flex flex-wrap gap-2">
                    {(recipe.categories ?? []).map((category: any) => (
                      <span
                        key={category._id}
                        className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                      >
                        {category.name}
                      </span>
                    ))}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {recipe.title}
                    </h2>
                    {recipe.excerpt && (
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {recipe.excerpt}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {recipe.totalMinutes && <span>{recipe.totalMinutes} min</span>}
                    {recipe.servings && <span>{recipe.servings} servings</span>}
                    {recipe.difficulty && <span>{recipe.difficulty}</span>}
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
