/** Core · recipes.index — published recipes as a card grid. */
import { Link } from "@tanstack/react-router";

import { MediaImage } from "@/components/media/MediaImage";
import type { SurfaceProps } from "@/templates/sdk/types";

export type RecipeCategoryRef = { _id: string; name: string; slug: string };

export type RecipeCard = {
  _id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  featuredImageId?: string | null;
  categories?: RecipeCategoryRef[];
  totalMinutes?: number | null;
  servings?: number | string | null;
  difficulty?: string | null;
};

export type RecipeCategorySummary = {
  _id?: string;
  name: string;
  slug?: string;
  description?: string | null;
};

export interface RecipesIndexSurfaceData {
  /** Present when the listing was filtered to a category. */
  category?: RecipeCategorySummary | null;
  recipes: RecipeCard[];
}

export default function CoreRecipesIndex({ data }: SurfaceProps<RecipesIndexSurfaceData>) {
  const { category, recipes } = data;

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

      {category && (
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Filtered category
          </div>
          <h2 className="mt-2 text-2xl font-semibold">{category.name}</h2>
          {category.description && (
            <p className="mt-2 text-sm text-muted-foreground">
              {category.description}
            </p>
          )}
        </div>
      )}

      {recipes.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No recipes are published yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {recipes.map((recipe) => (
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
                      mediaId={recipe.featuredImageId as any}
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
                    {(recipe.categories ?? []).map((category) => (
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
