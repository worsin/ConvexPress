/**
 * Support Layout Route
 *
 * Parent layout route for all Support pages (tickets, new ticket, etc.).
 * Provides an error boundary so support route failures don't crash the entire website.
 */

import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ErrorTemplate } from "@/templates/ErrorTemplate";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";

export const Route = createFileRoute("/_marketing/support")({
  loader: async ({ context: { queryClient } }) => {
    await requirePublicPluginEnabled(queryClient, "tickets");
  },
  component: SupportLayout,
  errorComponent: ErrorTemplate,
});

function SupportLayout() {
  return (
    <PublicPluginGate pluginId="tickets">
      <Outlet />
    </PublicPluginGate>
  );
}
