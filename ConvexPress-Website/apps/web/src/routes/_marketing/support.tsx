/**
 * Support Layout Route
 *
 * Parent layout route for all Support pages (tickets, new ticket, etc.).
 * Provides an error boundary so support route failures don't crash the entire website.
 */

import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ErrorTemplate } from "@/templates/ErrorTemplate";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/_marketing/support")({
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
