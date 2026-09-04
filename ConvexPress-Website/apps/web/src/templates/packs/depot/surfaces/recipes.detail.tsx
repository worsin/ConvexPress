/**
 * Depot · recipes.detail — a recipe to cook from: breadcrumb, title with
 * category chips, then 8/12 (image, story, ingredients table, numbered steps
 * table, notes) beside a sticky 4/12 snapshot table.
 */
import { Link } from "@tanstack/react-router";
import { UtensilsCrossed } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import type { RecipeDetailSurfaceData } from "@/templates/packs/core/surfaces/recipes.detail";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Card, Container, DataTable, Label, SectionHeading, StickyPanel, Td, Th } from "../parts";

export default function DepotRecipeDetail({ data }: SurfaceProps<RecipeDetailSurfaceData>) {
  const { recipe } = data;
  const ingredients = recipe.ingredients ?? [];
  const instructions = recipe.instructions ?? [];
  const categories = recipe.categories ?? [];

  return (
    <Container padded={false} data-slot="recipe-detail" data-pack="depot" className="flex flex-col gap-4 py-6 md:py-8">
      <Breadcrumbs items={[{ label: "Recipes", to: "/recipes" }, ...(categories[0] ? [{ label: categories[0].name, to: "/recipes/category/$slug", params: { slug: categories[0].slug } }] : []), { label: recipe.title }]} />

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Label>Recipe</Label>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{recipe.title}</h1>
          {recipe.excerpt ? <p className="max-w-3xl text-[13px] leading-5 text-muted-foreground">{recipe.excerpt}</p> : null}
        </div>
        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <Link key={category._id} to="/recipes/category/$slug" params={{ slug: category.slug }} className="inline-flex h-8 items-center rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground transition-colors hover:bg-muted">
                {category.name}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          <Card className="overflow-hidden">
            <div className="aspect-video bg-muted/40">
              {recipe.featuredImageId ? (
                <MediaImage mediaId={recipe.featuredImageId as any} alt={recipe.title} className="h-full w-full object-cover" sizes="(max-width: 1024px) 100vw, 60vw" loading="eager" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <UtensilsCrossed className="size-8" aria-hidden="true" />
                </div>
              )}
            </div>
          </Card>

          {recipe.description ? (
            <section className="flex flex-col gap-3">
              <SectionHeading title="Story" />
              <Card className="p-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{recipe.description}</p>
              </Card>
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <SectionHeading title="Ingredients" count={ingredients.length > 0 ? ingredients.length : undefined} />
            {ingredients.length === 0 ? (
              <Card className="p-4 text-[13px] text-muted-foreground">No ingredients listed.</Card>
            ) : (
              <DataTable caption="Ingredients">
                <thead>
                  <tr>
                    <Th className="w-12">#</Th>
                    <Th>Ingredient</Th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map((ingredient, index) => (
                    <tr key={`${ingredient}-${index}`} className="border-t border-border">
                      <Td className="tabular-nums text-muted-foreground">{index + 1}</Td>
                      <Td className="text-sm text-foreground">{ingredient}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading title="Instructions" count={instructions.length > 0 ? `${instructions.length} steps` : undefined} />
            {instructions.length === 0 ? (
              <Card className="p-4 text-[13px] text-muted-foreground">No instructions listed.</Card>
            ) : (
              <DataTable caption="Instructions">
                <thead>
                  <tr>
                    <Th className="w-16">Step</Th>
                    <Th>Instruction</Th>
                  </tr>
                </thead>
                <tbody>
                  {instructions.map((instruction, index) => (
                    <tr key={`${instruction}-${index}`} className="border-t border-border">
                      <Td className="align-top">
                        <span className="inline-flex size-6 items-center justify-center rounded-md bg-primary text-[11px] font-semibold tabular-nums text-primary-foreground">{index + 1}</span>
                      </Td>
                      <Td className="text-sm leading-6 text-foreground">{instruction}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </section>

          {recipe.notes ? (
            <section className="flex flex-col gap-3">
              <SectionHeading title="Cook notes" />
              <Card className="bg-muted/30 p-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{recipe.notes}</p>
              </Card>
            </section>
          ) : null}
        </div>

        <StickyPanel label="Recipe snapshot" className="lg:col-span-4">
          <h2 className="text-lg font-semibold text-foreground">Snapshot</h2>
          <DataTable
            caption="Recipe snapshot"
            firstColumnLabel
            rows={[
              { key: "prep", cells: ["Prep", <span className="tabular-nums">{recipe.prepMinutes ? `${recipe.prepMinutes} min` : "—"}</span>] },
              { key: "cook", cells: ["Cook", <span className="tabular-nums">{recipe.cookMinutes ? `${recipe.cookMinutes} min` : "—"}</span>] },
              { key: "total", cells: ["Total", <span className="font-semibold tabular-nums text-foreground">{recipe.totalMinutes ? `${recipe.totalMinutes} min` : "—"}</span>] },
              { key: "servings", cells: ["Servings", <span className="tabular-nums">{recipe.servings || "—"}</span>] },
              { key: "difficulty", cells: ["Difficulty", <span className="capitalize">{recipe.difficulty || "—"}</span>] },
            ]}
          />
        </StickyPanel>
      </div>
    </Container>
  );
}
