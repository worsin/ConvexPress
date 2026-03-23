import { MessageSquare } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { WebsiteDashboardData } from "@/lib/dashboard/types";
import { formatRelativeTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardWidget } from "../DashboardWidget";
import { EmptyState } from "../EmptyState";
import { StatusBadge } from "../StatusBadge";

interface MyCommentsWidgetProps {
  data: WebsiteDashboardData["myComments"] | undefined;
}

/**
 * Shows the user's recent comments with status and link to parent post.
 */
export function MyCommentsWidget({ data }: MyCommentsWidgetProps) {
  if (data === undefined) {
    return (
      <DashboardWidget title="My Comments" icon={MessageSquare}>
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </DashboardWidget>
    );
  }

  return (
    <DashboardWidget
      title="My Comments"
      icon={MessageSquare}
      action={
        <Link
          to="/dashboard/comments"
          className="text-[10px] text-primary hover:underline"
        >
          View All
        </Link>
      }
    >
      {data.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="You haven't commented yet"
          description="Join the conversation on a post."
        />
      ) : (
        <div className="divide-y divide-border">
          {data.slice(0, 5).map((comment) => (
            <div key={comment._id} className="space-y-1 py-2 first:pt-0 last:pb-0">
              <p className="truncate text-xs text-foreground">
                "{comment.excerpt}"
              </p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>On: {comment.postTitle}</span>
                <StatusBadge status={comment.status} />
                <span>{formatRelativeTime(comment.date)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardWidget>
  );
}
