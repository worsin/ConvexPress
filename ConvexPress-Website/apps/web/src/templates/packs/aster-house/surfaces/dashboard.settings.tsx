/**
 * Aster · dashboard.settings — account preferences (email, notifications,
 * password, deletion). The shared AccountSettingsForm keeps the behaviour;
 * the frame restyles its cards into rule-separated sections.
 */
import { AccountSettingsForm } from "@/components/dashboard/settings/AccountSettingsForm";
import { cn } from "@/lib/utils";
import type { DashboardSettingsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.settings";
import type { SurfaceProps } from "@/templates/sdk/types";

import { JOURNAL_DASHBOARD_FRAME, PageHeading, PageSkeleton } from "../parts/extra-dashboard";

export default function AsterDashboardSettings({ data }: SurfaceProps<DashboardSettingsSurfaceData>) {
  if (data.isLoading || !data.user) return <PageSkeleton rows={4} />;

  return (
    <div data-slot="dashboard-settings" className="flex flex-col gap-10">
      <PageHeading eyebrow="Account" title="Account settings" lede="Manage your account preferences." />
      <div className={cn("flex flex-col", JOURNAL_DASHBOARD_FRAME)}>
        <AccountSettingsForm user={data.user} />
      </div>
    </div>
  );
}
