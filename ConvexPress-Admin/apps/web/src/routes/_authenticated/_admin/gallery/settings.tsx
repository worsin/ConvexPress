import { createFileRoute } from "@tanstack/react-router";

import { GallerySettingsPanel } from "@/components/gallery/GallerySettingsPanel";

export const Route = createFileRoute("/_authenticated/_admin/gallery/settings")({
  component: GallerySettingsPage,
});

function GallerySettingsPage() {
  return <GallerySettingsPanel />;
}
