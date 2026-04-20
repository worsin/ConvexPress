import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PluginGuard } from "@/components/plugins/PluginGuard";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/recipes")({
  component: RecipesLayout,
});

function RecipesLayout() {
  return (
    <PluginGuard pluginId="recipes">
      <RoutePermissionGuard requiredAccess="/admin/recipes">
        <Outlet />
      </RoutePermissionGuard>
    </PluginGuard>
  );
}
