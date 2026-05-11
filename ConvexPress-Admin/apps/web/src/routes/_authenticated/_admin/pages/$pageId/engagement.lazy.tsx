/**
 * Page Engagement Tab - Lazy-loaded component
 *
 * Renders the EngagementDashboard with real analytics data for this page.
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import type { Id } from "@backend/convex/_generated/dataModel";
import { EngagementDashboard } from "@/components/analytics/EngagementDashboard";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/pages/$pageId/engagement",
)({
  component: EngagementTab,
});

function EngagementTab() {
  const { pageId } = Route.useParams();
  return <EngagementDashboard postId={pageId as Id<"posts">} />;
}
