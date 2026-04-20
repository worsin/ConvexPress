import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PluginGuard } from "@/components/plugins/PluginGuard";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/gallery")({
  component: GalleryLayout,
});

function GalleryLayout() {
  return (
    <PluginGuard pluginId="gallery">
      <RoutePermissionGuard requiredAccess="/admin/media">
        <Outlet />
      </RoutePermissionGuard>
    </PluginGuard>
  );
}
