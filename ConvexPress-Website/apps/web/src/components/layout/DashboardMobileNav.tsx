import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { cn } from "@/lib/utils";
import { DASHBOARD_NAV_ITEMS } from "@/lib/layout/constants";

/**
 * Horizontal scrolling navigation bar for the dashboard on mobile viewports.
 * Visible only below md breakpoint where the sidebar is hidden (#118).
 *
 * Displays all dashboard nav items in a horizontally scrollable strip
 * with the active item highlighted and notification badge for unread count.
 */
export function DashboardMobileNav() {
  const unreadCountResult = useQuery(
    api.notifications.queries.unreadCount,
    {},
  );
  const unreadCount =
    unreadCountResult !== undefined && unreadCountResult !== null
      ? (unreadCountResult as { count: number }).count
      : 0;

  return (
    <nav
      data-slot="dashboard-mobile-nav"
      aria-label="Dashboard navigation"
      className="flex border-b border-border bg-card md:hidden"
    >
      <div className="flex w-full items-center gap-0.5 overflow-x-auto px-2 py-1.5 scrollbar-none">
        {DASHBOARD_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const showBadge = item.id === "notifications" && unreadCount > 0;

          return (
            <Link
              key={item.id}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-[10px] text-muted-foreground transition-colors",
                "hover:text-foreground",
              )}
              activeProps={{
                className: "text-foreground font-medium border-b-2 border-primary",
                "aria-current": "page" as const,
              }}
            >
              <Icon className="size-3.5" />
              <span>{item.label}</span>
              {showBadge && (
                <span
                  aria-label={`${unreadCount} unread`}
                  className="flex h-[14px] min-w-[14px] items-center justify-center bg-destructive text-destructive-foreground rounded-full px-0.5 text-[8px] font-medium leading-none"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
