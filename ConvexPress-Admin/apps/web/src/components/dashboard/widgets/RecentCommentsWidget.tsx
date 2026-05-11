/**
 * Dashboard System - Recent Comments Widget
 *
 * Shows the most recent comments across all posts.
 * Only visible to users with comment.approve capability (Editor+).
 *
 * Mirrors WordPress's dashboard "Recent Comments" widget.
 * Calls the comments.queries.recent query directly.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { MessageSquareIcon, ArrowRightIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface RecentComment {
  _id: string;
  authorAvatarUrl?: string;
  authorName: string;
  postId: string;
  postTitle: string;
  content: string;
  status: string;
  createdAt: number;
}

function RecentCommentsWidget() {
  const recentComments = useQuery(api.comments.queries.recent, { limit: 5 }) as
    | RecentComment[]
    | undefined;

  // Loading state
  if (recentComments === undefined) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-2">
            <Skeleton className="size-8 rounded-none shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (recentComments.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        No recent comments.
      </div>
    );
  }

  return (
    <div className="p-4">
      <ul className="space-y-3">
        {recentComments.map((comment) => (
          <li key={comment._id} className="flex items-start gap-2">
            {/* Author avatar */}
            {comment.authorAvatarUrl ? (
              <img
                src={comment.authorAvatarUrl}
                alt={comment.authorName}
                className="size-8 rounded-none object-cover shrink-0"
              />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-none bg-muted text-xs font-medium text-muted-foreground shrink-0">
                {comment.authorName.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Comment info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-foreground truncate">
                  {comment.authorName}
                </span>
                {comment.status === "pending" && (
                  <span className="inline-flex items-center rounded-none px-1 py-0.5 text-[10px] font-medium bg-primary/20 text-primary">
                    Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {comment.content}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <MessageSquareIcon className="size-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">
                  on{" "}
                  <Link
                    to="/posts/$postId/edit"
                    params={{ postId: comment.postId }}
                    className="text-primary hover:underline"
                  >
                    {comment.postTitle}
                  </Link>
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatRelativeTime(comment.createdAt)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* View all link */}
      <div className="mt-3 pt-2 border-t border-border">
        <Link
          to="/comments"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline transition-colors"
        >
          View all comments
          <ArrowRightIcon className="size-3" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Format a timestamp as a relative time string (e.g., "2m ago", "3h ago", "5d ago").
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

export default RecentCommentsWidget;
