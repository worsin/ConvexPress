/**
 * Website Notification Bell
 *
 * Bell icon with unread count badge for the website header.
 * Navigates to /dashboard/notifications on click.
 * Wired to Convex reactive query for real-time unread count.
 */

import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { cn } from "@/lib/utils";

export function WebsiteNotificationBell() {
  const result = useQuery(api.notifications.queries.unreadCount, {});
  const count =
    result !== undefined && result !== null
      ? (result as { count: number }).count
      : 0;
  const displayCount = count > 99 ? "99+" : String(count);
  const hasUnread = count > 0;

  return (
    <Link
      to="/dashboard/notifications"
      className="relative flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      aria-label={
        hasUnread
          ? `Notifications (${count} unread)`
          : "Notifications"
      }
    >
      <Bell className="size-4" aria-hidden="true" />
      {hasUnread && (
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 inline-flex items-center justify-center rounded-full bg-destructive px-1 py-0.5 text-[9px] font-bold leading-none text-destructive-foreground",
            count > 9 ? "min-w-5" : "min-w-4",
          )}
          aria-hidden="true"
        >
          {displayCount}
        </span>
      )}
    </Link>
  );
}
