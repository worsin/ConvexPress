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
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-1/3" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      </div>
    );
  }

  // Not authorized
  if (atAGlance === null) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        You do not have permission to view this widget.
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-3">
        {/* Posts */}
        {atAGlance.posts && (
          <StatItem
            icon={<FileTextIcon className="size-4" />}
            count={atAGlance.posts.publish}
            label={atAGlance.posts.publish === 1 ? "Post" : "Posts"}
            to="/posts"
          />
        )}

        {/* Pages */}
        {atAGlance.pages && (
          <StatItem
            icon={<FilesIcon className="size-4" />}
            count={atAGlance.pages.publish}
            label={atAGlance.pages.publish === 1 ? "Page" : "Pages"}
            to="/pages"
          />
        )}

        {/* Comments */}
        {atAGlance.comments && (
          <StatItem
            icon={<MessageSquareIcon className="size-4" />}
            count={atAGlance.comments.approved}
            label={
              atAGlance.comments.approved === 1 ? "Comment" : "Comments"
            }
            to="/comments"
            badge={
              atAGlance.comments.pending > 0
                ? `${atAGlance.comments.pending} pending`
                : undefined
            }
          />
        )}

        {/* Users */}
        {atAGlance.users !== null && (
          <StatItem
            icon={<UsersIcon className="size-4" />}
            count={atAGlance.users}
            label={atAGlance.users === 1 ? "User" : "Users"}
            to="/users"
          />
        )}
      </div>

      {/* Pending content summary */}
      {atAGlance.posts && atAGlance.posts.draft > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {atAGlance.posts.draft > 0 && (
              <Link
                to="/posts"
                search={{ status: "draft" }}
                className="hover:text-foreground transition-colors"
              >
                {atAGlance.posts.draft}{" "}
                {atAGlance.posts.draft === 1 ? "Draft" : "Drafts"}
              </Link>
            )}
            {atAGlance.posts.pending > 0 && (
              <Link
                to="/posts"
                search={{ status: "pending" }}
                className="hover:text-foreground transition-colors"
              >
                {atAGlance.posts.pending} Pending Review
              </Link>
            )}
            {atAGlance.posts.future > 0 && (
              <Link
                to="/posts"
                search={{ status: "future" }}
                className="hover:text-foreground transition-colors"
              >
                {atAGlance.posts.future} Scheduled
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat Item ───────────────────────────────────────────────────────────────

function StatItem({
  icon,
  count,
  label,
  to,
  badge,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  to: string;
  badge?: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 p-2 border border-border hover:bg-muted/50 transition-colors group"
    >
      <span className="text-muted-foreground group-hover:text-foreground transition-colors">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground leading-tight">
          {count}
        </div>
        <div className="text-xs text-muted-foreground leading-tight">
          {label}
        </div>
        {badge && (
          <div className="text-[10px] text-primary leading-tight mt-0.5">
            {badge}
          </div>
        )}
      </div>
    </Link>
  );
}

export default AtAGlanceWidget;
