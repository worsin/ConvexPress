import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/_marketing/bundles")({
  component: BundlesLayout,
});

function BundlesLayout() {
  return (
    <PublicPluginGate pluginId="commerceBundles">
      <Outlet />
    </PublicPluginGate>
  );
}
