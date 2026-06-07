import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";

export const Route = createFileRoute("/_marketing/bundles")({
  loader: async ({ context: { queryClient } }) => {
    await requirePublicPluginEnabled(queryClient, "commerceBundles");
  },
  component: BundlesLayout,
});

function BundlesLayout() {
  return (
    <PublicPluginGate pluginId="commerceBundles">
      <Outlet />
    </PublicPluginGate>
  );
}
