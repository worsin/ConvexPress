import { createFileRoute } from "@tanstack/react-router";

import { RecipeCategoryManager } from "@/components/recipes/RecipeCategoryManager";

export const Route = createFileRoute(
  "/_authenticated/_admin/recipes/categories",
)({
  component: RecipeCategoriesPage,
});

function RecipeCategoriesPage() {
  return <RecipeCategoryManager />;
}
