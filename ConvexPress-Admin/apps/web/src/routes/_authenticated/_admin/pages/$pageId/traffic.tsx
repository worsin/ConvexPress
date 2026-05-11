/**
 * Page Traffic Tab - /admin/pages/$pageId/traffic
 *
 * Route configuration only. Component is lazy-loaded from traffic.lazy.tsx.
 * Placeholder until the Analytics System is built.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_admin/pages/$pageId/traffic",
)({});
