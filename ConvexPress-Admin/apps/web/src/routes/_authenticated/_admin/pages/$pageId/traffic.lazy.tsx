/**
 * Page Traffic Tab - Lazy-loaded component
 *
 * Renders the TrafficDashboard with real analytics data for this page.
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import type { Id } from "@backend/convex/_generated/dataModel";
import { TrafficDashboard } from "@/components/analytics/TrafficDashboard";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/pages/$pageId/traffic",
)({
  component: TrafficTab,
});

function TrafficTab() {
  const { pageId } = Route.useParams();
  return <TrafficDashboard postId={pageId as Id<"posts">} />;
}
