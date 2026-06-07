/**
 * Help Layout Route
 *
 * Parent layout route for all Help Center pages.
 * Provides an error boundary so help route failures don't crash the entire website.
 */

import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ErrorTemplate } from "@/templates/ErrorTemplate";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";

export const Route = createFileRoute("/_marketing/help")({
  loader: async ({ context: { queryClient } }) => {
    await requirePublicPluginEnabled(queryClient, "kb");
  },
  component: HelpLayout,
  errorComponent: ErrorTemplate,
});

function HelpLayout() {
  return (
    <PublicPluginGate pluginId="kb">
      <Outlet />
    </PublicPluginGate>
  );
}
