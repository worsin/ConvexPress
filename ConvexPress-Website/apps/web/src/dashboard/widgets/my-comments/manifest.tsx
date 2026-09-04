/**
 * My comments: the member's recent comments with status (getWebsiteDashboard).
 */

import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useUserDashboard } from "@/hooks/useUserDashboard";
import { formatRelativeTime } from "@/lib/format";
import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";
import { WidgetEmpty, WidgetSkeleton } from "../../grid/WidgetCard";
import { useDashboardShell } from "../../shell/DashboardShellContext";
import { ViewAllLink, rowsForSize } from "../_shared";

function MyCommentsWidget({ size }: DashboardWidgetProps) {
  const { data } = useUserDashboard();
  if (data === undefined) return <WidgetSkeleton rows={4} />;
  const comments = data?.myComments ?? [];
  if (comments.length === 0) {
    return <WidgetEmpty icon="message-square" title="You haven't commented yet" description="Join the conversation on a post." />;
  }
  return (
    <ul role="list" className="divide-y divide-border">
      {comments.slice(0, rowsForSize(size, 5)).map((comment) => (
        <li key={comment._id} className="space-y-0.5 py-1.5">
          <p className="truncate text-xs text-foreground">“{comment.excerpt}”</p>
          <p className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="truncate">On {comment.postTitle}</span>
            <StatusBadge status={comment.status} />
            <span className="shrink-0">{formatRelativeTime(comment.date)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

function Actions() {
  const { to } = useDashboardShell();
  return <ViewAllLink to={to("/comments")} />;
}

const module: DashboardWidgetModule = {
  id: "my-comments",
  Widget: MyCommentsWidget,
  Actions,
};

export default module;
