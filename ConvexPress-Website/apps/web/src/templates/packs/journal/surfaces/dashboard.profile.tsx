/**
 * Journal · dashboard.profile — edit the public profile. The shared
 * ProfileForm keeps every field, validation message and the save gate; the
 * frame turns its cards into rule-separated sections with underline inputs.
 */
import { ProfileForm } from "@/components/dashboard/profile/ProfileForm";
import { cn } from "@/lib/utils";
import type { DashboardProfileSurfaceData } from "@/templates/packs/core/surfaces/dashboard.profile";
import type { SurfaceProps } from "@/templates/sdk/types";

import { JOURNAL_DASHBOARD_FRAME, PageHeading, PageSkeleton } from "../parts/extra-dashboard";

export default function JournalDashboardProfile({ data }: SurfaceProps<DashboardProfileSurfaceData>) {
  if (data.isLoading || !data.user) return <PageSkeleton rows={4} />;

  return (
    <div data-slot="dashboard-profile" className="flex flex-col gap-10">
      <PageHeading eyebrow="Account" title="Edit profile" lede="Update your public profile information." />
      <div className={cn("flex flex-col", JOURNAL_DASHBOARD_FRAME)}>
        <ProfileForm user={data.user} />
      </div>
    </div>
  );
}
