/**
 * Profile page loader: the current member, handed to the `dashboard.profile`
 * surface (Core composes components/dashboard/profile/ProfileForm).
 */
import { useCurrentUser } from "@/hooks/useCurrentUser";
import CoreDashboardProfile, { type DashboardProfileSurfaceData } from "@/templates/packs/core/surfaces/dashboard.profile";
import { Surface } from "@/templates/sdk/Surface";

export function ProfilePage() {
  const { user, isLoading } = useCurrentUser();
  const data: DashboardProfileSurfaceData = { user: user ?? null, isLoading };
  return <Surface name="dashboard.profile" data={data} fallback={CoreDashboardProfile} />;
}
