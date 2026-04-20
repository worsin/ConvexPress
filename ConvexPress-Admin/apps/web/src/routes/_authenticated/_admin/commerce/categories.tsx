import { createFileRoute } from "@tanstack/react-router";

import { CommerceCategoryManager } from "@/components/commerce/CommerceCategoryManager";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/categories",
)({
  component: CommerceCategoriesPage,
});

function CommerceCategoriesPage() {
  return <CommerceCategoryManager />;
}
