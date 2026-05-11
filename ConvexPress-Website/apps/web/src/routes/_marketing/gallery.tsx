import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/_marketing/gallery")({
  component: GalleryLayout,
});

function GalleryLayout() {
  return (
    <PublicPluginGate pluginId="gallery">
      <Outlet />
    </PublicPluginGate>
  );
}
