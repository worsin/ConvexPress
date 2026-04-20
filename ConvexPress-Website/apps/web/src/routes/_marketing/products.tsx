import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/_marketing/products")({
  component: ProductsLayout,
});

function ProductsLayout() {
  return (
    <PublicPluginGate pluginId="commerce">
      <Outlet />
    </PublicPluginGate>
  );
}
