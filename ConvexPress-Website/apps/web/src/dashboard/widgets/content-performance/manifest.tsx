/**
 * Content performance: views per post (Author+; the backend returns null
 * for members without the capability, in which case the card explains).
 */

import { useUserDashboard } from "@/hooks/useUserDashboard";
import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";
import { WidgetEmpty, WidgetSkeleton } from "../../grid/WidgetCard";
import { rowsForSize } from "../_shared";

function ContentPerformanceWidget({ size }: DashboardWidgetProps) {
  const { data } = useUserDashboard();
  if (data === undefined) return <WidgetSkeleton rows={4} />;
  const posts = data?.contentPerformance;
  if (posts === null || posts === undefined) {
    return <WidgetEmpty icon="trending-up" title="Not available" description="Performance is shown to authors and editors." />;
  }
  if (posts.length === 0) {
    return <WidgetEmpty icon="trending-up" title="No view data yet" description="Views appear after visitors read your published posts." />;
  }
  const max = Math.max(...posts.map((post) => post.views), 1);
  return (
    <ol className="space-y-2">
      {posts.slice(0, rowsForSize(size, 5)).map((post, index) => (
        <li key={post._id} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-foreground">
              {index + 1}. {post.title}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{post.views.toLocaleString()} views</span>
          </div>
          <div className="h-1.5 w-full bg-muted" aria-hidden="true">
            <div className="h-full bg-primary/50" style={{ width: `${Math.max((post.views / max) * 100, 2)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

const module: DashboardWidgetModule = {
  id: "content-performance",
  Widget: ContentPerformanceWidget,
};

export default module;
