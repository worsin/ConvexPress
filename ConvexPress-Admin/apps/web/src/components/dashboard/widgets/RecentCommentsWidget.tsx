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
import { ArrowRightIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { initialsFor } from "@/components/shell/environment-presentation";

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
      <div className="space-y-3 px-[18px] py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <Skeleton className="size-7 shrink-0 rounded-full" />
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
      <div className="px-[18px] py-4 text-[13px] text-muted-foreground">
        No recent comments.
      </div>
    );
  }

  return (
    <div className="px-[18px] pb-4 pt-1">
      <ul className="space-y-2">
        {recentComments.map((comment) => (
          <li
            key={comment._id}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 rounded-lg bg-surface-2 px-3 py-2.5"
          >
            {comment.authorAvatarUrl ? (
              <img
                src={comment.authorAvatarUrl}
                alt=""
                className="size-6 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-line-strong text-[10.5px] font-semibold text-foreground">
                {initialsFor(comment.authorName)}
              </span>
            )}

            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {comment.authorName}
                </span>
                <span className="shrink-0 text-[12px] text-muted-foreground">
                  {formatRelativeTime(comment.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-5 text-ink-2">
                {comment.content}
              </p>
              <div className="mt-1 flex items-center gap-2 text-[12px]">
                {comment.status === "pending" && (
                  <span className="rounded-md bg-warning-soft px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[0.06em] text-warning">
                    Pending
                  </span>
                )}
                <span className="truncate text-muted-foreground">
                  on{" "}
                  <Link
                    to="/posts/$postId/edit"
                    params={{ postId: comment.postId }}
                    className="font-medium text-ink-2 hover:text-primary"
                  >
                    {comment.postTitle}
                  </Link>
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <Link
          to="/comments"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-primary transition-colors hover:text-foreground"
        >
          View all comments
          <ArrowRightIcon className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Format a timestamp as a relative time string (e.g., "2 min", "3 h", "5 d").
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} d`;
  if (hours > 0) return `${hours} h`;
  if (minutes > 0) return `${minutes} min`;
  return "just now";
}

export default RecentCommentsWidget;
