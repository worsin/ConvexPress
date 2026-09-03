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
      <div className="space-y-2 px-[18px] py-4">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  // No comment data (no permission or null)
  if (atAGlance === null || atAGlance.comments === null) {
    return (
      <div className="px-[18px] py-4 text-[13px] text-muted-foreground">
        Comment moderation data is not available.
      </div>
    );
  }

  const { pending, spam } = atAGlance.comments;

  return (
    <div className="px-[18px] pb-4 pt-1">
      <div className="flex items-start gap-3.5">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-lg ${
            pending > 0 ? "bg-warning-soft text-warning" : "bg-success-soft text-success"
          }`}
        >
          <MessageSquareWarningIcon className="size-4.5" aria-hidden="true" />
        </span>
        <div>
          <div className="font-serif text-[30px] leading-none tracking-[-0.01em] text-foreground">
            {pending}
          </div>
          <div className="mt-1 text-[13px] text-ink-2">
            {pending === 1 ? "Comment" : "Comments"} awaiting moderation
          </div>
        </div>
      </div>

      {spam > 0 && (
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          {spam} {spam === 1 ? "comment" : "comments"} marked as spam
        </p>
      )}

      <div className="mt-3.5 flex flex-col gap-1.5">
        {pending > 0 && (
          <Link
            to="/comments"
            search={{ status: "pending" }}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-primary transition-colors hover:text-foreground"
          >
            Review pending comments
            <ArrowRightIcon className="size-3.5" aria-hidden="true" />
          </Link>
        )}
        {spam > 0 && (
          <Link
            to="/comments"
            search={{ status: "spam" }}
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            View spam queue
            <ArrowRightIcon className="size-3.5" aria-hidden="true" />
          </Link>
        )}
        {pending === 0 && spam === 0 && (
          <p className="text-[13px] text-muted-foreground">
            No comments need moderation. All clear.
          </p>
        )}
      </div>
    </div>
  );
}

export default ModerationQueueWidget;
