import { BarChart3, TrendingUp } from "lucide-react";

import type { WebsiteDashboardData } from "@/lib/dashboard/types";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardWidget } from "../DashboardWidget";
import { EmptyState } from "../EmptyState";

interface ContentPerformanceWidgetProps {
  data: WebsiteDashboardData["contentPerformance"] | null | undefined;
}

/**
 * Shows the user's top-performing posts by view count.
 * Author+ only. Returns null if user lacks capability.
 */
export function ContentPerformanceWidget({
  data,
}: ContentPerformanceWidgetProps) {
  // null means user lacks the capability -- do not render
  if (data === null) return null;

  // undefined means loading
  if (data === undefined) {
    return (
      <DashboardWidget
        title="Content Performance"
        icon={BarChart3}
        className="md:col-span-2"
      >
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </DashboardWidget>
    );
  }

  // Empty -- tracking is active, but no pageviews have been recorded yet
  if (data.length === 0) {
    return (
      <DashboardWidget
        title="Content Performance"
        icon={BarChart3}
        className="md:col-span-2"
      >
        <EmptyState
          icon={TrendingUp}
          title="No view data available yet"
          description="Views appear here after visitors read your published posts."
        />
      </DashboardWidget>
    );
  }

  const maxViews = Math.max(...data.map((p) => p.views), 1);

  return (
    <DashboardWidget
      title="Content Performance"
      icon={BarChart3}
      className="md:col-span-2"
    >
      <div className="space-y-2">
        {data.slice(0, 5).map((post, index) => {
          const barWidth = Math.max((post.views / maxViews) * 100, 2);

          return (
            <div key={post._id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate text-foreground">
                  {index + 1}. {post.title}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {post.views.toLocaleString()} views
                </span>
              </div>
              <div className="h-1.5 w-full bg-muted">
                <div
                  className="h-full bg-primary/40 transition-all"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </DashboardWidget>
  );
}
