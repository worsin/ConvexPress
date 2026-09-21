/**
 * Aster · dashboard.security — login activity and account security. The
 * shared SecurityOverview keeps the stats, history and tips; the frame turns
 * its cards into rule-separated sections.
 */
import { SecurityOverview } from "@/components/dashboard/security/SecurityOverview";
import { cn } from "@/lib/utils";
import type { DashboardSecuritySurfaceData } from "@/templates/packs/core/surfaces/dashboard.security";
import type { SurfaceProps } from "@/templates/sdk/types";

import { JOURNAL_DASHBOARD_FRAME, PageHeading, PageSkeleton } from "../parts/extra-dashboard";

export default function AsterDashboardSecurity({ data }: SurfaceProps<DashboardSecuritySurfaceData>) {
  if (data.isLoading || !data.user) return <PageSkeleton rows={6} />;

  return (
    <div data-slot="dashboard-security" className="flex flex-col gap-10">
      <PageHeading eyebrow="Account" title="Security" lede="Review your login activity and account security." />
      <div className={cn("flex flex-col", JOURNAL_DASHBOARD_FRAME)}>
        <SecurityOverview />
      </div>
    </div>
  );
}
