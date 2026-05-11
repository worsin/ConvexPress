import { createFileRoute } from "@tanstack/react-router";

import { GalleryEditor } from "@/components/gallery/GalleryEditor";

export const Route = createFileRoute(
  "/_authenticated/_admin/gallery/$albumId/edit",
)({
  component: GalleryEditPage,
});

function GalleryEditPage() {
  const { albumId } = Route.useParams();
  return <GalleryEditor albumId={albumId} />;
}
