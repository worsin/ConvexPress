/**
 * Page Engagement Tab - /admin/pages/$pageId/engagement
 *
 * Route configuration only. Component is lazy-loaded from engagement.lazy.tsx.
 * Placeholder until the Analytics System is built.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_admin/pages/$pageId/engagement",
)({});
