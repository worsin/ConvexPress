/**
 * Comments page loader: the current member, handed to the `dashboard.comments`
 * surface (Core composes components/dashboard/comments/UserCommentList).
 */
import { useCurrentUser } from "@/hooks/useCurrentUser";
import CoreDashboardComments, { type DashboardCommentsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.comments";
import { Surface } from "@/templates/sdk/Surface";

export function CommentsPage() {
  const { user, isLoading } = useCurrentUser();
  const data: DashboardCommentsSurfaceData = { user: user ?? null, isLoading };
  return <Surface name="dashboard.comments" data={data} fallback={CoreDashboardComments} />;
}
