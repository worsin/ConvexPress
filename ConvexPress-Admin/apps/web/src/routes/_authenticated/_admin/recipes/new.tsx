import { createFileRoute } from "@tanstack/react-router";

import { RecipeEditor } from "@/components/recipes/RecipeEditor";

export const Route = createFileRoute("/_authenticated/_admin/recipes/new")({
  component: NewRecipePage,
});

function NewRecipePage() {
  return <RecipeEditor />;
}
