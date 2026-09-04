/**
 * Depot · dashboard.security — login activity and account security under a
 * Depot page header; the composed `SecurityOverview` (stats, login history,
 * failed attempts) takes the Depot frame. Same gate and skeleton as Core.
 */
import { SecurityOverview } from "@/components/dashboard/security/SecurityOverview";
import { cn } from "@/lib/utils";
import type { DashboardSecuritySurfaceData } from "@/templates/packs/core/surfaces/dashboard.security";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Skeleton } from "../parts";
import { DashboardPageHeader, TableSkeleton, dashboardFrame } from "../parts/extra-dashboard";

export default function DepotDashboardSecurity({ data }: SurfaceProps<DashboardSecuritySurfaceData>) {
  if (data.isLoading || !data.user) {
    return (
      <div className="flex flex-col gap-4" aria-hidden="true">
        <div className="flex flex-col gap-2 border-b border-border pb-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <TableSkeleton rows={6} />
      </div>
    );
  }

  return (
    <div data-slot="dashboard-security" data-pack="depot" className={cn("flex flex-col gap-4", dashboardFrame)}>
      <DashboardPageHeader eyebrow="Account" title="Security" description="Review your login activity and account security." />
      <SecurityOverview />
    </div>
  );
}
