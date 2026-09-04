/**
 * Journal · recipes.detail — a recipe read like a magazine piece in the
 * reading measure: categories as small-caps links, display title, excerpt,
 * a 3:2 hero, the snapshot (prep · cook · total · servings · difficulty) as
 * a rule-bounded row, then the story, ingredients as rule-separated rows,
 * instructions numbered in display type, and cook notes.
 */
import { Link } from "@tanstack/react-router";

import { MediaImage } from "@/components/media/MediaImage";
import type { RecipeDetailSurfaceData } from "@/templates/packs/core/surfaces/recipes.detail";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, Prose, Rule, SmallCaps } from "../parts";

export default function JournalRecipeDetail({ data }: SurfaceProps<RecipeDetailSurfaceData>) {
  const { recipe } = data;
  const categories = recipe.categories ?? [];
  const ingredients = recipe.ingredients ?? [];
  const instructions = recipe.instructions ?? [];

  const snapshot: Array<{ label: string; value: string }> = [
    { label: "Prep", value: recipe.prepMinutes ? `${recipe.prepMinutes} min` : "—" },
    { label: "Cook", value: recipe.cookMinutes ? `${recipe.cookMinutes} min` : "—" },
    { label: "Total", value: recipe.totalMinutes ? `${recipe.totalMinutes} min` : "—" },
    { label: "Servings", value: recipe.servings ? String(recipe.servings) : "—" },
    { label: "Difficulty", value: recipe.difficulty || "—" },
  ];

  return (
    <Container as="article" data-slot="recipe-detail" className="flex flex-col gap-12 py-6 md:gap-16 md:py-10">
      <Prose>
        <Breadcrumbs items={[{ label: "Recipes", to: "/recipes" }, { label: recipe.title }]} />
      </Prose>

      {/* Header */}
      <header className="flex flex-col items-center gap-8 text-center">
        <Prose className="flex flex-col items-center gap-5">
          {categories.length > 0 ? (
            <p className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              {categories.map((category) => (
                <Link key={category._id} to="/recipes/category/$slug" params={{ slug: category.slug }} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary hover:underline">
                  {category.name}
                </Link>
              ))}
            </p>
          ) : null}
          <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-5xl">{recipe.title}</h1>
          {recipe.excerpt ? <p className="text-base leading-8 text-muted-foreground md:text-[17px]">{recipe.excerpt}</p> : null}
        </Prose>
        <figure className="w-full max-w-4xl overflow-hidden rounded-2xl bg-muted">
          <div className="aspect-[3/2] w-full">
            {recipe.featuredImageId ? (
              <MediaImage mediaId={recipe.featuredImageId as any} alt={recipe.title} className="h-full w-full object-cover" preferredSize="large" sizes="(max-width: 1024px) 100vw, 896px" loading="eager" />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center font-display text-2xl text-muted-foreground">{recipe.title}</div>
            )}
          </div>
        </figure>
      </header>

      {/* Snapshot */}
      <Prose>
        <dl data-slot="recipe-snapshot" className="grid grid-cols-2 gap-y-6 border-y border-border py-6 sm:grid-cols-5 sm:gap-y-0">
          {snapshot.map((entry) => (
            <div key={entry.label} className="flex flex-col gap-1.5 sm:border-l sm:border-border sm:pl-4 sm:first:border-l-0 sm:first:pl-0">
              <SmallCaps as="dt">{entry.label}</SmallCaps>
              <dd className="font-display text-xl capitalize tabular-nums text-foreground">{entry.value}</dd>
            </div>
          ))}
        </dl>
      </Prose>

      {/* Story */}
      {recipe.description ? (
        <Prose as="section" className="flex flex-col gap-5">
          <SmallCaps as="h2">The story</SmallCaps>
          <p className="whitespace-pre-wrap text-base leading-8 text-muted-foreground md:text-[17px]">{recipe.description}</p>
        </Prose>
      ) : null}

      {/* Ingredients */}
      <Prose as="section" className="flex flex-col gap-8">
        <Rule />
        <h2 className="font-display text-3xl tracking-tight text-foreground md:text-4xl">Ingredients</h2>
        {ingredients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ingredients listed yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {ingredients.map((ingredient, index) => (
              <li key={`${ingredient}-${index}`} className="py-3 text-base leading-7 text-foreground">
                {ingredient}
              </li>
            ))}
          </ul>
        )}
      </Prose>

      {/* Instructions */}
      <Prose as="section" className="flex flex-col gap-8">
        <Rule />
        <h2 className="font-display text-3xl tracking-tight text-foreground md:text-4xl">Instructions</h2>
        {instructions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No instructions listed yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border border-y border-border">
            {instructions.map((instruction, index) => (
              <li key={`${instruction}-${index}`} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-4 py-6 sm:gap-6">
                <span className="font-display text-3xl leading-none tabular-nums text-primary" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="text-base leading-8 text-foreground md:text-[17px]">
                  <span className="sr-only">Step {index + 1}: </span>
                  {instruction}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Prose>

      {/* Notes */}
      {recipe.notes ? (
        <Prose as="section" className="flex flex-col gap-8">
          <Rule />
          <h2 className="font-display text-3xl tracking-tight text-foreground md:text-4xl">Cook notes</h2>
          <p className="whitespace-pre-wrap text-base leading-8 text-muted-foreground md:text-[17px]">{recipe.notes}</p>
        </Prose>
      ) : null}
    </Container>
  );
}
