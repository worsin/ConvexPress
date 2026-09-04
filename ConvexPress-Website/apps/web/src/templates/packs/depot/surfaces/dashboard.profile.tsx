/**
 * Depot · dashboard.profile — the public profile form (avatar, names, bio,
 * social links) under a Depot page header; the composed `ProfileForm`'s
 * cards and inputs take the Depot frame. Same gate and skeleton as Core.
 */
import { ProfileForm } from "@/components/dashboard/profile/ProfileForm";
import { cn } from "@/lib/utils";
import type { DashboardProfileSurfaceData } from "@/templates/packs/core/surfaces/dashboard.profile";
import type { SurfaceProps } from "@/templates/sdk/types";

import { DashboardPageHeader, DashboardSkeleton, dashboardFrame } from "../parts/extra-dashboard";

export default function DepotDashboardProfile({ data }: SurfaceProps<DashboardProfileSurfaceData>) {
  if (data.isLoading || !data.user) {
    return <DashboardSkeleton blocks={["h-40", "h-32", "h-48"]} />;
  }

  return (
    <div data-slot="dashboard-profile" data-pack="depot" className={cn("flex flex-col gap-4", dashboardFrame)}>
      <DashboardPageHeader eyebrow="Account" title="Edit profile" description="Update your public profile information." />
      <ProfileForm user={data.user} />
    </div>
  );
}
