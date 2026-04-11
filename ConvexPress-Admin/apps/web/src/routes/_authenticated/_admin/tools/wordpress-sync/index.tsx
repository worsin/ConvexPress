/**
 * Tools > WordPress Sync (Legacy Redirect)
 *
 * Redirects to the new "Website Import" route.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/wordpress-sync/",
)({
  beforeLoad: () => {
    throw redirect({ to: "/tools/website-import" });
  },
});
