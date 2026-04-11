/**
 * WordPress Sync - Site Detail (Legacy Redirect)
 *
 * Redirects to the new "Website Import" site detail route.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/wordpress-sync/$siteId/",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/tools/website-import/$siteId",
      params: { siteId: params.siteId },
    });
  },
});
