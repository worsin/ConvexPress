import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";

export const Route = createFileRoute("/_marketing/gallery")({
  loader: async ({ context: { queryClient } }) => {
    await requirePublicPluginEnabled(queryClient, "gallery");
  },
  component: GalleryLayout,
});

function GalleryLayout() {
  return (
    <PublicPluginGate pluginId="gallery">
      <Outlet />
    </PublicPluginGate>
  );
}
