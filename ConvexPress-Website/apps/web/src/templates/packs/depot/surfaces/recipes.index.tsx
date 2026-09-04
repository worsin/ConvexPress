/**
 * Depot · recipes.index — recipes as a dense card grid: square image,
 * category label, title, excerpt, a facts row (time / servings /
 * difficulty). The filtered-category banner and empty state as in Core.
 */
import { Link } from "@tanstack/react-router";
import { UtensilsCrossed } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import type { RecipeCard, RecipesIndexSurfaceData } from "@/templates/packs/core/surfaces/recipes.index";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Card, Container, EmptyState, Label } from "../parts";
import { PluginPageHeader } from "../parts/extra-plugins";

export default function DepotRecipesIndex({ data }: SurfaceProps<RecipesIndexSurfaceData>) {
  const { category, recipes } = data;

  return (
    <Container padded={false} data-slot="recipes-index" data-pack="depot" className="flex flex-col gap-4 py-6 md:py-8">
      <PluginPageHeader eyebrow="Recipes" title="Recipe box" description="Recipe cards organised by category, with ingredients and steps laid out to cook from." aside={recipes.length > 0 ? <Label className="tabular-nums">{recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}</Label> : undefined} />

      {category ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label>Filtered category</Label>
            <h2 className="text-lg font-semibold text-foreground">{category.name}</h2>
            {category.description ? <p className="text-[13px] leading-5 text-muted-foreground">{category.description}</p> : null}
          </div>
          <Link to="/recipes" className="text-[13px] font-medium text-primary hover:underline">
            All recipes
          </Link>
        </Card>
      ) : null}

      {recipes.length === 0 ? (
        <EmptyState title="No recipes are published yet." />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {recipes.map((recipe) => (
            <RecipeTile key={recipe._id} recipe={recipe} />
          ))}
        </div>
      )}
    </Container>
  );
}

export function RecipeTile({ recipe }: { recipe: RecipeCard }) {
  const facts = [recipe.totalMinutes ? `${recipe.totalMinutes} min` : null, recipe.servings ? `${recipe.servings} servings` : null, recipe.difficulty ?? null].filter(Boolean) as string[];
  return (
    <Card as="article" className="flex flex-col overflow-hidden">
      <Link to="/recipes/$slug" params={{ slug: recipe.slug }} className="block aspect-square bg-muted/40">
        {recipe.featuredImageId ? (
          <MediaImage mediaId={recipe.featuredImageId as any} alt={recipe.title} className="h-full w-full object-cover" sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <UtensilsCrossed className="size-8" aria-hidden="true" />
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {recipe.categories && recipe.categories.length > 0 ? <Label>{recipe.categories[0]!.name}</Label> : <Label>Recipe</Label>}
        <Link to="/recipes/$slug" params={{ slug: recipe.slug }} className="line-clamp-2 text-sm font-semibold leading-5 text-foreground hover:text-primary">
          {recipe.title}
        </Link>
        {recipe.excerpt ? <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{recipe.excerpt}</p> : null}
        {facts.length > 0 ? (
          <div className="mt-auto flex flex-wrap gap-x-2 gap-y-0.5 pt-1">
            {facts.map((fact) => (
              <span key={fact} className="text-[11px] uppercase tracking-wide tabular-nums text-muted-foreground">
                {fact}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
