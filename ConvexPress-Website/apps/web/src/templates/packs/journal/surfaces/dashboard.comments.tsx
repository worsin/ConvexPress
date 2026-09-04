/**
 * Journal · dashboard.comments — the member's comments across the site. The
 * shared UserCommentList keeps the filters, pagination and edit behaviour;
 * the frame restyles its controls.
 */
import { UserCommentList } from "@/components/dashboard/comments/UserCommentList";
import { cn } from "@/lib/utils";
import type { DashboardCommentsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.comments";
import type { SurfaceProps } from "@/templates/sdk/types";

import { JOURNAL_DASHBOARD_FRAME, PageHeading, PageSkeleton } from "../parts/extra-dashboard";

export default function JournalDashboardComments({ data }: SurfaceProps<DashboardCommentsSurfaceData>) {
  if (data.isLoading || !data.user) return <PageSkeleton rows={3} />;

  return (
    <div data-slot="dashboard-comments" className="flex flex-col gap-10">
      <PageHeading eyebrow="Activity" title="My comments" lede="View and manage your comments." />
      <div className={cn("flex flex-col", JOURNAL_DASHBOARD_FRAME)}>
        <UserCommentList userId={data.user._id} />
      </div>
    </div>
  );
}
