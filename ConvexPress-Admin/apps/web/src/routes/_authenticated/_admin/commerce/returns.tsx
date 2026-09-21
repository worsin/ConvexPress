import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PluginGuard } from "@/components/plugins/PluginGuard";
export const Route = createFileRoute("/_authenticated/_admin/commerce/returns")(
  {
    component: () => (
      <PluginGuard pluginId="commerceReturns">
        <Outlet />
      </PluginGuard>
    ),
  },
);
