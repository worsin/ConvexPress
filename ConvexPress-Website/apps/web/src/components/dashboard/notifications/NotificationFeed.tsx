import { useState } from "react";
import { Bell, Loader2 } from "lucide-react";

import { useUserNotifications } from "@/hooks/useUserNotifications";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "../EmptyState";
import { NotificationActions } from "./NotificationActions";
import { NotificationItemComponent } from "./NotificationItem";

type FilterTab = "all" | "unread";
type TypeFilter = "all" | "info" | "success" | "warning" | "error";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
];

const TYPE_FILTER_TABS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
];

/**
 * Full notification list with mark-as-read, filtering, load-more pagination,
 * and actions.
 * Auth context is resolved internally by the hook -- no userId prop needed.
 */
export function NotificationFeed() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const {
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore,
    isMarkingRead,
    hasMore,
    loadMore,
    markAsRead,
    markAllAsRead,
    dismissNotification,
  } = useUserNotifications(activeFilter);

  // Apply client-side type filter
  const filteredNotifications =
    typeFilter === "all" || !notifications
      ? notifications
      : notifications.filter((n) => n.type === typeFilter);

  return (
    <div data-slot="notification-feed" className="space-y-4">
      {/* Actions bar */}
      <NotificationActions
        unreadCount={unreadCount}
        onMarkAllRead={markAllAsRead}
        isMarkingRead={isMarkingRead}
      />

      {/* Filter tabs */}
      <div className="space-y-0">
        {/* Read state filter */}
        <div className="flex items-center gap-1 border-b border-border">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveFilter(tab.value)}
              className={cn(
                "px-3 py-2 text-xs transition-colors",
                activeFilter === tab.value
                  ? "border-b-2 border-primary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-0.5 px-1 py-1.5">
          {TYPE_FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setTypeFilter(tab.value)}
              className={cn(
                "rounded-sm px-2 py-1 text-[10px] transition-colors",
                typeFilter === tab.value
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notification list */}
      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-3 border-b border-border px-3 py-3"
            >
              <Skeleton className="size-4 shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredNotifications && filteredNotifications.length > 0 ? (
        <div>
          {filteredNotifications.map((notification) => (
            <NotificationItemComponent
              key={notification._id}
              notification={notification}
              onMarkAsRead={markAsRead}
              onDismiss={dismissNotification}
            />
          ))}

          {/* Load more button */}
          {hasMore && typeFilter === "all" && (
            <div className="flex justify-center border-t border-border py-3">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load more notifications"
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Bell}
          title={
            typeFilter !== "all"
              ? `No ${typeFilter} notifications`
              : activeFilter === "unread"
                ? "No unread notifications"
                : "No notifications"
          }
          description={
            typeFilter !== "all"
              ? `No notifications of type "${typeFilter}" found.`
              : activeFilter === "unread"
                ? "You're all caught up."
                : "Notifications will appear here when there's activity."
          }
        />
      )}
    </div>
  );
}
