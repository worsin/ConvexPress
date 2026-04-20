import { createFileRoute } from "@tanstack/react-router";

import { RecipeEditor } from "@/components/recipes/RecipeEditor";

export const Route = createFileRoute(
  "/_authenticated/_admin/recipes/$recipeId/edit",
)({
  component: EditRecipePage,
});

function EditRecipePage() {
  const { recipeId } = Route.useParams();
  return <RecipeEditor recipeId={recipeId} />;
}
