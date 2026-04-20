import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PluginGuard } from "@/components/plugins/PluginGuard";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/membership")({
  component: MembershipLayout,
});

function MembershipLayout() {
  return (
    <PluginGuard pluginId="membership">
      <RoutePermissionGuard requiredAccess="/admin/membership">
        <Outlet />
      </RoutePermissionGuard>
    </PluginGuard>
  );
}
