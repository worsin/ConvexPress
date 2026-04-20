import { createFileRoute } from "@tanstack/react-router";

import { RecipeListTable } from "@/components/recipes/RecipeListTable";

export const Route = createFileRoute("/_authenticated/_admin/recipes/")({
  component: RecipesIndexPage,
});

function RecipesIndexPage() {
  return <RecipeListTable />;
}
