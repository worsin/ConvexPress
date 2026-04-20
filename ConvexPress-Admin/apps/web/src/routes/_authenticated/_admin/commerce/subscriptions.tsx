import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PluginGuard } from "@/components/plugins/PluginGuard";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions",
)({
  component: CommerceSubscriptionsLayout,
});

function CommerceSubscriptionsLayout() {
  return (
    <PluginGuard pluginId="commerceSubscriptions">
      <RoutePermissionGuard requiredAccess="/admin/commerce/subscriptions">
        <Outlet />
      </RoutePermissionGuard>
    </PluginGuard>
  );
}
