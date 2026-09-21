/**
 * Aster · recipes.category — recipes filed under one category: breadcrumbs,
 * display heading with the description as lede, and the recipes three-up.
 */
import type { RecipesCategorySurfaceData } from "@/templates/packs/core/surfaces/recipes.category";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, EmptyState, LinkButton, SectionHeading, SmallCaps } from "../parts";
import { RecipeCard } from "../parts/extra-plugins";

export default function AsterRecipesCategory({ data }: SurfaceProps<RecipesCategorySurfaceData>) {
  const { category, recipes } = data;

  return (
    <Container data-slot="recipes-category" className="flex flex-col gap-10 py-6 md:gap-14 md:py-10">
      <Breadcrumbs items={[{ label: "Recipes", to: "/recipes" }, { label: category.name }]} />
      <SectionHeading
        level={1}
        eyebrow="Recipe category"
        title={category.name}
        lede={category.description ?? undefined}
        action={recipes.length > 0 ? <SmallCaps className="tabular-nums">{recipes.length === 1 ? "1 recipe" : `${recipes.length} recipes`}</SmallCaps> : undefined}
      />

      {recipes.length === 0 ? (
        <EmptyState
          eyebrow="Nothing yet"
          title="No recipes are published in this category yet."
          action={
            <LinkButton to="/recipes" variant="ghost">
              All recipes
            </LinkButton>
          }
        />
      ) : (
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe._id} recipe={recipe} />
          ))}
        </div>
      )}
    </Container>
  );
}
