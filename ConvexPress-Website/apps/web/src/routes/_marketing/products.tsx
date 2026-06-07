import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";

export const Route = createFileRoute("/_marketing/products")({
  loader: async ({ context: { queryClient } }) => {
    await requirePublicPluginEnabled(queryClient, "commerce");
  },
  component: ProductsLayout,
});

function ProductsLayout() {
  return (
    <PublicPluginGate pluginId="commerce">
      <Outlet />
    </PublicPluginGate>
  );
}
