/**
 * Appearance Index — redirects /admin/appearance to /admin/appearance/header
 * (the most common entry point for site-chrome editing).
 *
 * Permission checks are handled by the destination route's RoutePermissionGuard.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_admin/appearance/",
)({
  beforeLoad: async () => {
    throw redirect({ to: "/appearance/header" });
  },
});
