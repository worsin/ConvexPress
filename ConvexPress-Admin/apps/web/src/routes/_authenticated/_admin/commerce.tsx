import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PluginGuard } from "@/components/plugins/PluginGuard";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/commerce")({
  component: CommerceLayout,
});

function CommerceLayout() {
  return (
    <PluginGuard pluginId="commerce">
      <RoutePermissionGuard requiredAccess="/admin/commerce">
        <Outlet />
      </RoutePermissionGuard>
    </PluginGuard>
  );
}
