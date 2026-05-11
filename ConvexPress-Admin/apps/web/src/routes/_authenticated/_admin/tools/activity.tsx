/**
 * Tools > Activity Log
 *
 * Timeline-style view of recent activity across the CMS.
 * Grouped by date (Today, Yesterday, etc.) with category filtering.
 * Real-time Convex subscription - new entries appear without refresh.
 *
 * WordPress equivalent: Dashboard Activity widget (extended to full page)
 */

import { createFileRoute } from "@tanstack/react-router";
import { ActivityIcon } from "lucide-react";

import { ActivityTimeline } from "@/components/audit/ActivityTimeline";

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/activity",
)({
  component: ActivityPage,
});

function ActivityPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <ActivityIcon className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-bold text-foreground">Activity Log</h1>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Real-time timeline of all activity across the CMS. Click an entry to
        expand details.
      </p>
      <ActivityTimeline initialLimit={50} />
    </div>
  );
}
