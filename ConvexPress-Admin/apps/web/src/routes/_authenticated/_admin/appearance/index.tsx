/**
 * Appearance Index - Redirects /admin/appearance to /admin/appearance/colors
 *
 * Permission checks are handled by the destination route's RoutePermissionGuard.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_admin/appearance/",
)({
  beforeLoad: async () => {
    // Redirect to the Website Colors page
    // Permission is checked by the destination route's RoutePermissionGuard
    throw redirect({ to: "/appearance/colors" });
  },
});
