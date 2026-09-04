/**
 * Journal · recipes.index — the recipe box as an editorial list: display
 * heading, an optional filtered-category line under a rule, then recipes
 * three-up (3:2 image, small-caps categories, display title, meta line, rule
 * below).
 */
import type { RecipesIndexSurfaceData } from "@/templates/packs/core/surfaces/recipes.index";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, LinkButton, SectionHeading, SmallCaps } from "../parts";
import { RecipeCard } from "../parts/extra-plugins";

export default function JournalRecipesIndex({ data }: SurfaceProps<RecipesIndexSurfaceData>) {
  const { category, recipes } = data;

  return (
    <Container data-slot="recipes-index" className="flex flex-col gap-10 py-6 md:gap-14 md:py-10">
      <SectionHeading
        level={1}
        eyebrow="Recipes"
        title={category ? category.name : "Recipes"}
        lede={category ? (category.description ?? undefined) : "A living recipe box: recipe cards organised by category, from scanned pages to clean cooking pages."}
        action={recipes.length > 0 ? <SmallCaps className="tabular-nums">{recipes.length === 1 ? "1 recipe" : `${recipes.length} recipes`}</SmallCaps> : undefined}
      />

      {category ? (
        <div className="flex flex-wrap items-center justify-between gap-4 border-y border-border py-4">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SmallCaps>Filtered category</SmallCaps>
            <span className="font-display text-xl tracking-tight text-foreground">{category.name}</span>
          </p>
          <LinkButton to="/recipes" variant="link" className="text-sm">
            All recipes
          </LinkButton>
        </div>
      ) : null}

      {recipes.length === 0 ? (
        <EmptyState
          eyebrow="Nothing yet"
          title={category ? "No recipes are published in this category yet." : "No recipes are published yet."}
          action={
            category ? (
              <LinkButton to="/recipes" variant="ghost">
                All recipes
              </LinkButton>
            ) : undefined
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
