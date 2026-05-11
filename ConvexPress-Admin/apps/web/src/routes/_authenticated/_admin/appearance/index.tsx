/**
 * @deprecated 2026-05-11 — Legacy in-admin Theme/Template Builder.
 *
 * STATUS:  Frozen. Hidden from active nav. Do NOT extend or fix issues here.
 * REASON:  A pre-built section enum + preset theme picker limits what each
 *          site can look like. Replaced by AI-generated React components,
 *          one per route, generated per site by the design:* skill kit.
 * REPLACEMENT:  See ConvexPress-Website/design-kit/README.md
 * REMOVAL:  Safe to delete once at least one site is fully shipped via the
 *           skill kit and nothing else references this file.
 */
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
