/**
 * Depot · dashboard.comments — the member's comments across the site under
 * a Depot page header; the composed `UserCommentList` (filter tabs,
 * pagination, edit / delete) takes the Depot frame. Same gate as Core.
 */
import { UserCommentList } from "@/components/dashboard/comments/UserCommentList";
import { cn } from "@/lib/utils";
import type { DashboardCommentsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.comments";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Skeleton } from "../parts";
import { DashboardPageHeader, dashboardFrame } from "../parts/extra-dashboard";

export default function DepotDashboardComments({ data }: SurfaceProps<DashboardCommentsSurfaceData>) {
  if (data.isLoading || !data.user) {
    return (
      <div className="flex flex-col gap-4" aria-hidden="true">
        <div className="flex flex-col gap-2 border-b border-border pb-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-8 w-full" />
        <div className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-2 p-3">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-slot="dashboard-comments" data-pack="depot" className={cn("flex flex-col gap-4", dashboardFrame)}>
      <DashboardPageHeader eyebrow="Content" title="My comments" description="View and manage your comments." />
      <UserCommentList userId={data.user._id} />
    </div>
  );
}
