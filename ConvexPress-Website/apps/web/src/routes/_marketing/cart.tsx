import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";

export const Route = createFileRoute("/_marketing/cart")({
  loader: async ({ context: { queryClient } }) => {
    await requirePublicPluginEnabled(queryClient, "commerceStorefront");
  },
  component: CartLayout,
});

function CartLayout() {
  return (
    <PublicPluginGate pluginId="commerceStorefront">
      <Outlet />
    </PublicPluginGate>
  );
}
