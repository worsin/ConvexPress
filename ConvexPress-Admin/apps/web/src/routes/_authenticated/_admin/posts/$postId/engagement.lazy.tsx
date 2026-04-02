/**
 * Post Engagement Tab - Lazy-loaded component
 *
 * Renders the EngagementDashboard with real analytics data for this post.
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import type { Id } from "@backend/convex/_generated/dataModel";
import { EngagementDashboard } from "@/components/analytics/EngagementDashboard";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/posts/$postId/engagement",
)({
  component: EngagementTab,
});

function EngagementTab() {
  const { postId } = Route.useParams();
  return <EngagementDashboard postId={postId as Id<"posts">} />;
}
