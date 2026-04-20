import { createFileRoute } from "@tanstack/react-router";

import { GalleryListTable } from "@/components/gallery/GalleryListTable";

export const Route = createFileRoute("/_authenticated/_admin/gallery/")({
  component: GalleryIndexPage,
});

function GalleryIndexPage() {
  return <GalleryListTable />;
}
