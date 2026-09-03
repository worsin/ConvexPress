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
import { FileTextIcon, MessageSquareIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/hooks/dashboard/useDashboardData";

function ActivityFeedWidget() {
  const { activityFeed } = useDashboardData();

  // Loading
  if (activityFeed === undefined) {
    return (
      <div className="space-y-3 px-[18px] py-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  // Not authorized
  if (activityFeed === null) {
    return (
      <div className="px-[18px] py-4 text-[13px] text-muted-foreground">
        You do not have permission to view this widget.
      </div>
    );
  }

  const hasPosts = activityFeed.recentPosts.length > 0;
  const hasComments = activityFeed.recentComments.length > 0;

  if (!hasPosts && !hasComments) {
    return (
      <div className="px-[18px] py-4 text-[13px] text-muted-foreground">
        No recent activity.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {hasPosts && (
        <div className="border-t border-border">
          <h4 className="eyebrow px-[18px] pb-1 pt-3">Recently published</h4>
          <ul>
            {activityFeed.recentPosts.map((post) => (
              <li key={post._id}>
                <ActivityRow
                  icon={<FileTextIcon />}
                  time={post.publishedAt ? formatRelativeDate(post.publishedAt) : ""}
                >
                  <Link
                    to="/posts/$postId/edit"
                    params={{ postId: post._id }}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {post.title || "(no title)"}
                  </Link>{" "}
                  <span className="text-ink-2">by {post.authorName}</span>
                </ActivityRow>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasComments && (
        <div className="border-t border-border">
          <h4 className="eyebrow px-[18px] pb-1 pt-3">Recent comments</h4>
          <ul>
            {activityFeed.recentComments.map((comment) => (
              <li key={comment._id}>
                <ActivityRow
                  icon={<MessageSquareIcon />}
                  time={formatRelativeDate(comment.createdAt)}
                >
                  <span className="font-medium text-foreground">{comment.authorName}</span>{" "}
                  <span className="text-ink-2">on</span>{" "}
                  <Link
                    to="/posts/$postId/edit"
                    params={{ postId: comment.postId }}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {comment.postTitle}
                  </Link>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-5 text-muted-foreground">
                    {comment.content}
                  </p>
                </ActivityRow>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActivityRow({
  icon,
  time,
  children,
}: {
  icon: React.ReactNode;
  time: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3 px-[18px] py-2.5 text-[13.5px]">
      <span className="mt-px grid size-5 place-items-center rounded-md bg-surface-2 text-ink-2 [&_svg]:size-3">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
      <span className="whitespace-nowrap text-[12px] text-muted-foreground">{time}</span>
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
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} h ago`;
  if (days < 7) return `${days} d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default ActivityFeedWidget;
