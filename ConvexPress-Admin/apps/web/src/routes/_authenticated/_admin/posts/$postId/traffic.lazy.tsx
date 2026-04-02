/**
 * Post Traffic Tab - Lazy-loaded component
 *
 * Renders the TrafficDashboard with real analytics data for this post.
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import type { Id } from "@backend/convex/_generated/dataModel";
import { TrafficDashboard } from "@/components/analytics/TrafficDashboard";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/posts/$postId/traffic",
)({
  component: TrafficTab,
});

function TrafficTab() {
  const { postId } = Route.useParams();
  return <TrafficDashboard postId={postId as Id<"posts">} />;
}
