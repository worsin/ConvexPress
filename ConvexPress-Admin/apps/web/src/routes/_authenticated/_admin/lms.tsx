/**
 * LMS Layout Route
 *
 * Parent layout route for all LMS (Courses) admin pages.
 * Provides an error boundary so LMS route failures don't crash the admin,
 * and a PluginGuard so pages only render when the `lms` extension is enabled.
 */

import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ErrorTemplate } from "@/templates/ErrorTemplate";
import { PluginGuard } from "@/components/plugins/PluginGuard";

export const Route = createFileRoute("/_authenticated/_admin/lms")({
  component: LMSLayout,
  errorComponent: ErrorTemplate,
});

function LMSLayout() {
  return (
    <PluginGuard pluginId="lms">
      <Outlet />
    </PluginGuard>
  );
}
