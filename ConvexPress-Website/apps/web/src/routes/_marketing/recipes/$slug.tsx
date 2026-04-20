import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { MediaImage } from "@/components/media/MediaImage";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

export const Route = createFileRoute("/_marketing/recipes/$slug")({
  component: RecipeDetailPage,
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

    const siteUrl = normalizeSiteUrl(publicSettings?.siteUrl);

    return {
      recipesDisabled: false as const,
      seoHead: buildSeoHead({
        title: `${recipe?.title ?? params.slug} - Recipe - ConvexPress`,
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
  const query = convexQuery(api.recipes.queries.getBySlug, { slug }) as any;
  const { data: recipe } = useSuspenseQuery(query) as { data: any };

  if (!recipe) {
    return <NotFoundPage />;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            {(recipe.categories ?? []).map((category: any) => (
              <Link
                key={category._id}
                to="/recipes/category/$slug"
                params={{ slug: category.slug }}
                className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-800"
              >
                {category.name}
              </Link>
            ))}
          </div>
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              {recipe.title}
            </h1>
            {recipe.excerpt && (
              <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
                {recipe.excerpt}
              </p>
            )}
          </div>
          <div className="overflow-hidden rounded-[2rem] border border-border bg-card">
            <div className="aspect-[16/10] bg-muted/40">
              {recipe.featuredImageId ? (
                <MediaImage
                  mediaId={recipe.featuredImageId}
                  alt={recipe.title}
                  className="h-full w-full object-cover"
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  loading="eager"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-orange-100 to-amber-100 text-sm text-orange-900">
                  Recipe
                </div>
              )}
            </div>
          </div>

          {recipe.description && (
            <section className="rounded-[2rem] border border-border bg-card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Story
              </h2>
              <p className="mt-4 whitespace-pre-wrap text-base leading-8 text-foreground">
                {recipe.description}
              </p>
            </section>
          )}

          <section className="rounded-[2rem] border border-border bg-card p-6">
            <h2 className="text-2xl font-semibold">Ingredients</h2>
            <ul className="mt-5 grid gap-3">
              {(recipe.ingredients ?? []).map((ingredient: string, index: number) => (
                <li
                  key={`${ingredient}-${index}`}
                  className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm leading-6 text-foreground"
                >
                  {ingredient}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[2rem] border border-border bg-card p-6">
            <h2 className="text-2xl font-semibold">Instructions</h2>
            <ol className="mt-5 grid gap-4">
              {(recipe.instructions ?? []).map((instruction: string, index: number) => (
                <li
                  key={`${instruction}-${index}`}
                  className="grid grid-cols-[auto_1fr] gap-4 rounded-2xl border border-border/70 bg-background px-4 py-4"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-600 text-sm font-semibold text-white">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-7 text-foreground">
                    {instruction}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {recipe.notes && (
            <section className="rounded-[2rem] border border-border bg-card p-6">
              <h2 className="text-2xl font-semibold">Cook Notes</h2>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-foreground">
                {recipe.notes}
              </p>
            </section>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          <section className="rounded-[2rem] border border-border bg-card p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Recipe Snapshot
            </h2>
            <dl className="mt-5 grid gap-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <dt className="text-sm text-muted-foreground">Prep</dt>
                <dd className="text-sm font-medium">
                  {recipe.prepMinutes ? `${recipe.prepMinutes} min` : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <dt className="text-sm text-muted-foreground">Cook</dt>
                <dd className="text-sm font-medium">
                  {recipe.cookMinutes ? `${recipe.cookMinutes} min` : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <dt className="text-sm text-muted-foreground">Total</dt>
                <dd className="text-sm font-medium">
                  {recipe.totalMinutes ? `${recipe.totalMinutes} min` : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <dt className="text-sm text-muted-foreground">Servings</dt>
                <dd className="text-sm font-medium">{recipe.servings || "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted-foreground">Difficulty</dt>
                <dd className="text-sm font-medium capitalize">
                  {recipe.difficulty || "—"}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
