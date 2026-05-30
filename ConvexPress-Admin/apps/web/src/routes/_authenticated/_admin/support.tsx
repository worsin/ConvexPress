/**
 * Support Layout Route
 *
 * Support analytics/settings are owned by the Tickets plugin even though they
 * live under the /support admin prefix.
 */

import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PluginGuard } from "@/components/plugins/PluginGuard";
import { ErrorTemplate } from "@/templates/ErrorTemplate";

export const Route = createFileRoute("/_authenticated/_admin/support")({
  component: SupportLayout,
  errorComponent: ErrorTemplate,
});

function SupportLayout() {
  return (
    <PluginGuard pluginId="tickets">
      <Outlet />
    </PluginGuard>
  );
}
