/** Core · recipes.detail — a single recipe: story, ingredients, instructions, notes and snapshot. */
import { Link } from "@tanstack/react-router";

import { MediaImage } from "@/components/media/MediaImage";
import type { SurfaceProps } from "@/templates/sdk/types";

export type RecipeCategoryRef = { _id: string; name: string; slug: string };

export type RecipeDetail = {
  _id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  description?: string | null;
  notes?: string | null;
  featuredImageId?: string | null;
  categories?: RecipeCategoryRef[];
  ingredients?: string[];
  instructions?: string[];
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  totalMinutes?: number | null;
  servings?: number | string | null;
  difficulty?: string | null;
};

export interface RecipeDetailSurfaceData {
  recipe: RecipeDetail;
}

export default function CoreRecipeDetail({ data }: SurfaceProps<RecipeDetailSurfaceData>) {
  const { recipe } = data;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            {(recipe.categories ?? []).map((category) => (
              <Link
                key={category._id}
                to="/recipes/category/$slug"
                params={{ slug: category.slug }}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
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
                  mediaId={recipe.featuredImageId as any}
                  alt={recipe.title}
                  className="h-full w-full object-cover"
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  loading="eager"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
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
