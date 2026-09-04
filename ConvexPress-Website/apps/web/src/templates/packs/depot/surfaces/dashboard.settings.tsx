/**
 * Depot · dashboard.settings — account preferences (email, notifications,
 * password, deletion) under a Depot page header; the composed
 * `AccountSettingsForm` takes the Depot frame. Same gate and skeleton as Core.
 */
import { AccountSettingsForm } from "@/components/dashboard/settings/AccountSettingsForm";
import { cn } from "@/lib/utils";
import type { DashboardSettingsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.settings";
import type { SurfaceProps } from "@/templates/sdk/types";

import { DashboardPageHeader, DashboardSkeleton, dashboardFrame } from "../parts/extra-dashboard";

export default function DepotDashboardSettings({ data }: SurfaceProps<DashboardSettingsSurfaceData>) {
  if (data.isLoading || !data.user) {
    return <DashboardSkeleton blocks={["h-24", "h-20", "h-48", "h-20"]} />;
  }

  return (
    <div data-slot="dashboard-settings" data-pack="depot" className={cn("flex flex-col gap-4", dashboardFrame)}>
      <DashboardPageHeader eyebrow="Account" title="Account settings" description="Manage your account preferences." />
      <AccountSettingsForm user={data.user} />
    </div>
  );
}
