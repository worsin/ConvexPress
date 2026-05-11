/**
 * Dashboard System - Moderation Queue Widget
 *
 * Shows pending comment count with a link to the moderation queue.
 * Only visible to users with comment.approve capability (Editor+).
 *
 * Mirrors WordPress's dashboard display of pending comments for moderators.
 */

import { Link } from "@tanstack/react-router";
import { MessageSquareWarningIcon, ArrowRightIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/hooks/dashboard/useDashboardData";

function ModerationQueueWidget() {
  const { atAGlance } = useDashboardData();

  // Loading state
  if (atAGlance === undefined) {
    return (
      <div className="p-4 space-y-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  // No comment data (no permission or null)
  if (atAGlance === null || atAGlance.comments === null) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Comment moderation data is not available.
      </div>
    );
  }

  const { pending, spam } = atAGlance.comments;

  return (
    <div className="p-4">
      {/* Pending comments highlight */}
      <div className="flex items-start gap-3 mb-3">
        <div className="shrink-0 mt-0.5">
          <MessageSquareWarningIcon className="size-5 text-primary" />
        </div>
        <div>
          <div className="text-lg font-semibold text-foreground leading-tight">
            {pending}
          </div>
          <div className="text-xs text-muted-foreground">
            {pending === 1 ? "Comment" : "Comments"} awaiting moderation
          </div>
        </div>
      </div>

      {/* Spam count */}
      {spam > 0 && (
        <div className="text-xs text-muted-foreground mb-3">
          {spam} {spam === 1 ? "comment" : "comments"} marked as spam
        </div>
      )}

      {/* Action links */}
      <div className="flex flex-col gap-1.5">
        {pending > 0 && (
          <Link
            to="/comments"
            search={{ status: "pending" }}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline transition-colors"
          >
            Review pending comments
            <ArrowRightIcon className="size-3" />
          </Link>
        )}
        {spam > 0 && (
          <Link
            to="/comments"
            search={{ status: "spam" }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View spam queue
            <ArrowRightIcon className="size-3" />
          </Link>
        )}
        {pending === 0 && spam === 0 && (
          <p className="text-xs text-muted-foreground">
            No comments need moderation. All clear.
          </p>
        )}
      </div>
    </div>
  );
}

export default ModerationQueueWidget;
