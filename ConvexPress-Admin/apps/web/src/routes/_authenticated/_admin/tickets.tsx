/**
 * Tickets Layout Route
 *
 * Parent layout route for all Ticket pages.
 * Provides an error boundary so ticket route failures don't crash the entire admin.
 */

import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ErrorTemplate } from "@/templates/ErrorTemplate";
import { PluginGuard } from "@/components/plugins/PluginGuard";

export const Route = createFileRoute("/_authenticated/_admin/tickets")({
  component: TicketsLayout,
  errorComponent: ErrorTemplate,
});

function TicketsLayout() {
  return (
    <PluginGuard pluginId="tickets">
      <Outlet />
    </PluginGuard>
  );
}
