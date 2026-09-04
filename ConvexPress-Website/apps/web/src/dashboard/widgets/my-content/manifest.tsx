/**
 * My content: post counts by status and recent posts (getWebsiteDashboard).
 */

import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useUserDashboard } from "@/hooks/useUserDashboard";
import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";
import { WidgetEmpty, WidgetSkeleton } from "../../grid/WidgetCard";
import { useDashboardShell } from "../../shell/DashboardShellContext";
import { ViewAllLink, rowsForSize } from "../_shared";

function MyContentWidget({ size }: DashboardWidgetProps) {
  const { data } = useUserDashboard();
  if (data === undefined) return <WidgetSkeleton rows={4} />;
  if (!data) return <WidgetEmpty icon="file-text" title="No content yet" />;
  const { counts, recent } = data.myPosts;
  const total = counts.published + counts.draft + counts.pending;
  if (total === 0) {
    return <WidgetEmpty icon="square-pen" title="No posts yet" description="Your published and draft posts appear here." />;
  }
  return (
    <div className="space-y-3">
      <dl className="flex items-center gap-4 text-xs">
        {[
          ["Published", counts.published],
          ["Drafts", counts.draft],
          ["Pending", counts.pending],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-1">
            <dd className="text-sm font-semibold text-foreground">{value}</dd>
            <dt className="text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <ul role="list" className="divide-y divide-border">
        {recent.slice(0, rowsForSize(size, 5)).map((post) => (
          <li key={post._id} className="flex items-center justify-between gap-2 py-1.5">
            <span className="truncate text-xs text-foreground">{post.title}</span>
            <StatusBadge status={post.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Actions() {
  const { to } = useDashboardShell();
  return <ViewAllLink to={to("/posts")} />;
}

const module: DashboardWidgetModule = {
  id: "my-content",
  Widget: MyContentWidget,
  Actions,
};

export default module;
