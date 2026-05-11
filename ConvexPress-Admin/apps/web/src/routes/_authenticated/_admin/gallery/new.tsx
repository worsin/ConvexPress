import { createFileRoute } from "@tanstack/react-router";

import { GalleryEditor } from "@/components/gallery/GalleryEditor";

export const Route = createFileRoute("/_authenticated/_admin/gallery/new")({
  component: GalleryNewPage,
});

function GalleryNewPage() {
  return <GalleryEditor />;
}
