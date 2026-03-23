/**
 * Dashboard System - Activity Feed Widget
 *
 * Shows recent published posts and recent comments.
 * Mirrors WordPress's "Activity" dashboard widget.
 *
 * Displays:
 *   - Recently Published: Last 5 published posts with author name and date
 *   - Recent Comments: Last 5 approved comments with author, excerpt, and post title
 */

import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/hooks/dashboard/useDashboardData";

function ActivityFeedWidget() {
  const { activityFeed } = useDashboardData();

  // Loading
  if (activityFeed === undefined) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-3 w-1/4" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    );
  }

  // Not authorized
  if (activityFeed === null) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        You do not have permission to view this widget.
      </div>
    );
  }

  const hasPosts = activityFeed.recentPosts.length > 0;
  const hasComments = activityFeed.recentComments.length > 0;

  if (!hasPosts && !hasComments) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        No recent activity.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {/* Recently Published */}
      {hasPosts && (
        <div className="p-4">
          <h4 className="text-xs font-semibold text-foreground mb-2">
            Recently Published
          </h4>
          <ul className="space-y-2">
            {activityFeed.recentPosts.map((post) => (
              <li key={post._id} className="flex items-start gap-2">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                  {post.publishedAt
                    ? formatRelativeDate(post.publishedAt)
                    : ""}
                </span>
                <div className="min-w-0">
                  <Link
                    to="/posts/$postId/edit"
                    params={{ postId: post._id }}
                    className="text-xs text-primary hover:underline truncate block"
                  >
                    {post.title || "(no title)"}
                  </Link>
                  <span className="text-[10px] text-muted-foreground">
                    by {post.authorName}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent Comments */}
      {hasComments && (
        <div className="p-4">
          <h4 className="text-xs font-semibold text-foreground mb-2">
            Recent Comments
          </h4>
          <ul className="space-y-3">
            {activityFeed.recentComments.map((comment) => (
              <li key={comment._id} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1 text-xs">
                  <span className="font-medium text-foreground">
                    {comment.authorName}
                  </span>
                  <span className="text-muted-foreground">on</span>
                  <Link
                    to="/posts/$postId/edit"
                    params={{ postId: comment.postId }}
                    className="text-primary hover:underline truncate"
                  >
                    {comment.postTitle}
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {comment.content}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {formatRelativeDate(comment.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default ActivityFeedWidget;
