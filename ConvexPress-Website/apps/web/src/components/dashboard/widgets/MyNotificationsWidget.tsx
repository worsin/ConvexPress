import { Bell, CheckCircle, Info, AlertTriangle, XCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { WebsiteDashboardData } from "@/lib/dashboard/types";
import { formatRelativeTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardWidget } from "../DashboardWidget";
import { EmptyState } from "../EmptyState";

interface MyNotificationsWidgetProps {
  data: WebsiteDashboardData["unreadNotifications"] | undefined;
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
};

const TYPE_COLORS: Record<string, string> = {
  info: "text-primary",
  success: "text-primary",
  warning: "text-foreground/60",
  error: "text-destructive",
};

/**
 * Shows unread notification count and recent notifications.
 */
export function MyNotificationsWidget({ data }: MyNotificationsWidgetProps) {
  if (data === undefined) {
    return (
      <DashboardWidget title="Notifications" icon={Bell}>
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </DashboardWidget>
    );
  }

  return (
    <DashboardWidget
      title="Notifications"
      icon={Bell}
      action={
        <Link
          to="/dashboard/notifications"
          className="text-[10px] text-primary hover:underline"
        >
          View All
        </Link>
      }
    >
      {data.count === 0 && data.recent.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No new notifications"
          description="You're all caught up."
        />
      ) : (
        <div className="space-y-3">
          {data.count > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{data.count}</span>{" "}
              unread
            </p>
          )}

          <div className="divide-y divide-border">
            {data.recent.slice(0, 5).map((notification) => {
              const Icon = TYPE_ICONS[notification.type] ?? Info;
              const colorClass = TYPE_COLORS[notification.type] ?? "text-primary";

              return (
                <div
                  key={notification._id}
                  className="flex items-start gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <Icon aria-hidden="true" className={`mt-0.5 size-3.5 shrink-0 ${colorClass}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-foreground">
                      {notification.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(notification.date)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DashboardWidget>
  );
}
