import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import { DASHBOARD_NAV_ITEMS } from "@/lib/layout/constants";
import { AvatarDisplay } from "@/components/dashboard/profile/AvatarDisplay";

/**
 * Vertical navigation sidebar for the authenticated user dashboard.
 * Hidden on mobile (< md breakpoint), visible on desktop.
 *
 * Displays:
 * - User avatar + display name at top (#115)
 * - Navigation links with unread notification count badge
 */
export function DashboardSidebar() {
  const { user } = useCurrentUser();

  // Lightweight reactive query for the unread notification badge
  const unreadCountResult = useQuery(
    api.notifications.queries.unreadCount,
    {},
  );
  const unreadCount =
    unreadCountResult !== undefined && unreadCountResult !== null
      ? (unreadCountResult as { count: number }).count
      : 0;

  return (
    <aside
      data-slot="dashboard-sidebar"
      className={cn(
        "hidden w-56 shrink-0 border-r border-border bg-card md:flex md:flex-col",
        "sticky top-16 h-[calc(100svh-4rem)]",
      )}
    >
      {/* User info section (#115) */}
      {user && (
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-center gap-3">
            <AvatarDisplay
              avatarUrl={user.avatarUrl}
              workosAvatarUrl={user.workosAvatarUrl}
              displayName={user.displayName}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">
                {user.displayName}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {user.email}
              </p>
            </div>
          </div>
        </div>
      )}

      <nav aria-label="Dashboard navigation" className="flex-1 py-4">
        <ul role="list" className="space-y-1 px-3">
          {DASHBOARD_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const showBadge = item.id === "notifications" && unreadCount > 0;

            return (
              <li key={item.id}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 text-xs text-muted-foreground transition-colors",
                    "hover:bg-muted hover:text-foreground",
                  )}
                  activeProps={{
                    className:
                      "bg-muted text-foreground font-medium",
                    "aria-current": "page" as const,
                  }}
                >
                  <Icon className="size-4" />
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span
                      aria-label={`${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`}
                      className={cn(
                        "flex h-[18px] min-w-[18px] items-center justify-center",
                        "bg-destructive text-destructive-foreground",
                        "rounded-full px-1 text-[10px] font-medium leading-none",
                      )}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
