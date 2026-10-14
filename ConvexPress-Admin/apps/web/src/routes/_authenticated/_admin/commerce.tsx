import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";

import { PluginGuard } from "@/components/plugins/PluginGuard";
import { getPluginIdForAdminAccess } from "@/lib/plugins/registry";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/commerce")({
  component: CommerceLayout,
});

/**
 * Every Commerce screen needs Commerce; a screen a sub-extension owns (the
 * storefront's products, carts and shipping; returns; subscriptions) also
 * needs that sub-extension, by the most specific registered admin prefix.
 */
function CommerceLayout() {
  const { pathname } = useLocation();
  const owner = getPluginIdForAdminAccess(pathname);
  const content = (
    <RoutePermissionGuard requiredAccess="/admin/commerce">
      <Outlet />
    </RoutePermissionGuard>
  );
  return (
    <PluginGuard pluginId="commerce">
      {owner && owner !== "commerce" ? <PluginGuard pluginId={owner}>{content}</PluginGuard> : content}
    </PluginGuard>
  );
}
