/**
 * Settings Index - Redirects /settings to /settings/general
 *
 * The path "/settings/general" is correct for TanStack Router:
 * /_authenticated and /_admin are layout route segments (prefixed with _)
 * and do not contribute to the URL path. This matches the pattern used
 * across the codebase (e.g., appearance/index.tsx -> "/appearance/themes").
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/",
)({
  beforeLoad: () => {
    throw redirect({ to: "/settings/general" });
  },
});
