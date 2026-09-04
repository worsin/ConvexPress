/**
 * Depot · recipes.category — recipes filed under one category as a dense
 * card grid with a breadcrumb and page header.
 */
import type { RecipesCategorySurfaceData } from "@/templates/packs/core/surfaces/recipes.category";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, EmptyState, Label } from "../parts";
import { PluginPageHeader } from "../parts/extra-plugins";
import { RecipeTile } from "./recipes.index";

export default function DepotRecipesCategory({ data }: SurfaceProps<RecipesCategorySurfaceData>) {
  const { category, recipes } = data;

  return (
    <Container padded={false} data-slot="recipes-category" data-pack="depot" className="flex flex-col gap-4 py-6 md:py-8">
      <Breadcrumbs items={[{ label: "Recipes", to: "/recipes" }, { label: category.name }]} />
      <PluginPageHeader eyebrow="Recipe category" title={category.name} description={category.description} aside={<Label className="tabular-nums">{recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}</Label>} />

      {recipes.length === 0 ? (
        <EmptyState title="No recipes are published in this category yet." />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {recipes.map((recipe) => (
            <RecipeTile key={recipe._id} recipe={{ ...recipe, categories: [{ _id: category._id, name: category.name, slug: category.slug }] }} />
          ))}
        </div>
      )}
    </Container>
  );
}
