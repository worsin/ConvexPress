/**
 * Dashboard System - At a Glance Widget
 *
 * Displays content, comment, and user counts with navigation links.
 * Mirrors WordPress's "At a Glance" dashboard widget.
 *
 * Shows:
 *   - Published post count (links to All Posts)
 *   - Published page count (links to All Pages)
 *   - Approved + pending comment counts (links to Comments)
 *   - Total user count (links to Users)
 */

import { Link } from "@tanstack/react-router";
import {
  FileTextIcon,
  FilesIcon,
  MessageSquareIcon,
  UsersIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/hooks/dashboard/useDashboardData";

function AtAGlanceWidget() {
  const { atAGlance } = useDashboardData();

  // Loading state
  if (atAGlance === undefined) {
    return (
      <div className="grid grid-cols-2 gap-3 px-[18px] pb-[18px] pt-1 lg:grid-cols-4">
        <Skeleton className="h-[104px] rounded-xl" />
        <Skeleton className="h-[104px] rounded-xl" />
        <Skeleton className="h-[104px] rounded-xl" />
        <Skeleton className="h-[104px] rounded-xl" />
      </div>
    );
  }

  // Not authorized
  if (atAGlance === null) {
    return (
      <div className="px-[18px] py-4 text-[13px] text-muted-foreground">
        You do not have permission to view this widget.
      </div>
    );
  }

  const drafts = atAGlance.posts?.draft ?? 0;
  const pendingPosts = atAGlance.posts?.pending ?? 0;
  const scheduled = atAGlance.posts?.future ?? 0;

  return (
    <div className="px-[18px] pb-[18px] pt-1">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {atAGlance.posts && (
          <StatTile
            icon={<FileTextIcon />}
            count={atAGlance.posts.publish}
            label={atAGlance.posts.publish === 1 ? "Post" : "Posts"}
            to="/posts"
            note={
              drafts > 0
                ? { text: `${drafts} ${drafts === 1 ? "draft" : "drafts"}`, to: "/posts", search: { status: "draft" } }
                : undefined
            }
          />
        )}

        {atAGlance.pages && (
          <StatTile
            icon={<FilesIcon />}
            count={atAGlance.pages.publish}
            label={atAGlance.pages.publish === 1 ? "Page" : "Pages"}
            to="/pages"
            note={
              atAGlance.pages.draft > 0
                ? { text: `${atAGlance.pages.draft} ${atAGlance.pages.draft === 1 ? "draft" : "drafts"}` }
                : undefined
            }
          />
        )}

        {atAGlance.comments && (
          <StatTile
            icon={<MessageSquareIcon />}
            count={atAGlance.comments.approved}
            label={atAGlance.comments.approved === 1 ? "Comment" : "Comments"}
            to="/comments"
            note={
              atAGlance.comments.pending > 0
                ? {
                    text: `${atAGlance.comments.pending} awaiting moderation`,
                    tone: "warn",
                    to: "/comments",
                    search: { status: "pending" },
                  }
                : undefined
            }
          />
        )}

        {atAGlance.users !== null && (
          <StatTile
            icon={<UsersIcon />}
            count={atAGlance.users}
            label={atAGlance.users === 1 ? "User" : "Users"}
            to="/users"
          />
        )}
      </div>

      {/* Pending content summary */}
      {(pendingPosts > 0 || scheduled > 0) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
          {pendingPosts > 0 && (
            <Link
              to="/posts"
              search={{ status: "pending" }}
              className="transition-colors hover:text-foreground"
            >
              {pendingPosts} pending review
            </Link>
          )}
          {scheduled > 0 && (
            <Link
              to="/posts"
              search={{ status: "future" }}
              className="transition-colors hover:text-foreground"
            >
              {scheduled} scheduled
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stat Tile ───────────────────────────────────────────────────────────────

function StatTile({
  icon,
  count,
  label,
  to,
  note,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  to: string;
  note?: {
    text: string;
    tone?: "warn";
    to?: string;
    search?: Record<string, string>;
  };
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-2 rounded-xl border border-border bg-surface-2/60 px-4 pb-3 pt-3.5 transition-colors hover:border-line-strong hover:bg-surface-2"
    >
      <span className="flex items-center justify-between text-[13px] font-medium text-muted-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground group-hover:[&_svg]:text-primary">
        {label}
        {icon}
      </span>
      <span className="font-serif text-[32px] leading-none tracking-[-0.01em] text-foreground">
        {count.toLocaleString()}
      </span>
      <span
        className={
          note?.tone === "warn"
            ? "text-[12.5px] font-medium text-warning"
            : "text-[12.5px] text-muted-foreground"
        }
      >
        {note?.text ?? " "}
      </span>
    </Link>
  );
}

export default AtAGlanceWidget;
