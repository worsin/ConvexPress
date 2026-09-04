/**
 * Security page loader: the current member, handed to the `dashboard.security`
 * surface (Core composes components/dashboard/security/SecurityOverview).
 */
import { useCurrentUser } from "@/hooks/useCurrentUser";
import CoreDashboardSecurity, { type DashboardSecuritySurfaceData } from "@/templates/packs/core/surfaces/dashboard.security";
import { Surface } from "@/templates/sdk/Surface";

export function SecurityPage() {
  const { user, isLoading } = useCurrentUser();
  const data: DashboardSecuritySurfaceData = { user: user ?? null, isLoading };
  return <Surface name="dashboard.security" data={data} fallback={CoreDashboardSecurity} />;
}
