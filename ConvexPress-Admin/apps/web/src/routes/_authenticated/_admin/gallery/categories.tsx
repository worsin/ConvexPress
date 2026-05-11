import { createFileRoute } from "@tanstack/react-router";

import { GalleryCategoryManager } from "@/components/gallery/GalleryCategoryManager";

export const Route = createFileRoute(
  "/_authenticated/_admin/gallery/categories",
)({
  component: GalleryCategoriesPage,
});

function GalleryCategoriesPage() {
  return <GalleryCategoryManager />;
}
