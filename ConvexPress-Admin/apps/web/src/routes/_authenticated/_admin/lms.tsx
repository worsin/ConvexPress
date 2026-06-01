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
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/lms")({
  component: LMSLayout,
  errorComponent: ErrorTemplate,
});

function LMSLayout() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/lms">
      <PluginGuard pluginId="lms">
        <Outlet />
      </PluginGuard>
    </RoutePermissionGuard>
  );
}
