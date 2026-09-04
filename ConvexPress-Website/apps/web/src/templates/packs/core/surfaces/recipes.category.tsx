/** Core · recipes.category — recipes filed under one category. */
import { Link } from "@tanstack/react-router";

import { MediaImage } from "@/components/media/MediaImage";
import type { SurfaceProps } from "@/templates/sdk/types";

export type RecipeCategory = {
  _id: string;
  name: string;
  slug: string;
  description?: string | null;
};

export type RecipeCategoryCard = {
  _id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  featuredImageId?: string | null;
};

export interface RecipesCategorySurfaceData {
  category: RecipeCategory;
  recipes: RecipeCategoryCard[];
}

export default function CoreRecipesCategory({ data }: SurfaceProps<RecipesCategorySurfaceData>) {
  const { category, recipes } = data;

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-[2rem] border border-border bg-card p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
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

      {recipes.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No recipes are published in this category yet.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {recipes.map((recipe) => (
            <article
              key={recipe._id}
              className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm"
            >
              <Link to="/recipes/$slug" params={{ slug: recipe.slug }}>
                <div className="aspect-[4/3] bg-muted/40">
                  {recipe.featuredImageId ? (
                    <MediaImage
                      mediaId={recipe.featuredImageId as any}
                      alt={recipe.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
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
