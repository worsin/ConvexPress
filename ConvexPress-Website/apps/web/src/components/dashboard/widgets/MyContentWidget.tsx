import { FileText, PenSquare } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { WebsiteDashboardData } from "@/lib/dashboard/types";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardWidget } from "../DashboardWidget";
import { EmptyState } from "../EmptyState";
import { StatusBadge } from "../StatusBadge";

interface MyContentWidgetProps {
  data: WebsiteDashboardData["myPosts"] | undefined;
}

/**
 * Shows the user's own post counts by status and recent posts.
 */
export function MyContentWidget({ data }: MyContentWidgetProps) {
  if (data === undefined) {
    return (
      <DashboardWidget title="My Content" icon={FileText}>
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </DashboardWidget>
    );
  }

  const { counts, recent } = data;
  const totalPosts = counts.published + counts.draft + counts.pending;

  return (
    <DashboardWidget
      title="My Content"
      icon={FileText}
      action={
        <Link
          to="/dashboard/posts"
          className="text-[10px] text-primary hover:underline"
        >
          View All
        </Link>
      }
    >
      {totalPosts === 0 ? (
        <EmptyState
          icon={PenSquare}
          title="No posts yet"
          description="Start writing your first post."
        />
      ) : (
        <div className="space-y-3">
          {/* Counts */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {counts.published}
              </span>{" "}
              Published
            </span>
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {counts.draft}
              </span>{" "}
              Drafts
            </span>
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {counts.pending}
              </span>{" "}
              Pending
            </span>
          </div>

          {/* Recent posts */}
          <div className="divide-y divide-border">
            {recent.slice(0, 5).map((post) => (
              <div
                key={post._id}
                className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
              >
                <span className="truncate text-xs text-foreground">
                  {post.title}
                </span>
                <StatusBadge status={post.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardWidget>
  );
}
