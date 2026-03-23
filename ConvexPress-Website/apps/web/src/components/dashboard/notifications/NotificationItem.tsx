/**
 * Single notification display with click-to-navigate and mark-as-read.
 * Matches the Convex siteNotifications schema shape (readAt timestamp,
 * actionUrl, title, message).
 */

import { AlertTriangle, CheckCircle, Info, X, XCircle } from "lucide-react";
import { useRouter } from "@tanstack/react-router";

import type { NotificationItem as NotificationItemType } from "@/lib/dashboard/types";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface NotificationItemProps {
  notification: NotificationItemType;
  onMarkAsRead: (id: string) => void | Promise<void>;
  onDismiss?: (id: string) => void;
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

export function NotificationItemComponent({
  notification,
  onMarkAsRead,
  onDismiss,
}: NotificationItemProps) {
  const router = useRouter();
  const Icon = TYPE_ICONS[notification.type] ?? Info;
  const colorClass = TYPE_COLORS[notification.type] ?? "text-primary";
  const isUnread = notification.readAt === undefined;

  const handleClick = async () => {
    // Await mark-as-read mutation before navigating to avoid race condition (#112)
    if (isUnread) {
      await onMarkAsRead(notification._id);
    }
    if (notification.actionUrl) {
      router.navigate({ to: notification.actionUrl });
    }
  };

  return (
    <button
      type="button"
      data-slot="notification-item"
      onClick={handleClick}
      className={cn(
        "flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0",
        notification.actionUrl && "cursor-pointer hover:bg-muted/50",
        isUnread && "border-l-2 border-l-primary bg-primary/5",
      )}
    >
      {/* Type icon or actor avatar */}
      {notification.actorAvatarUrl ? (
        <img
          src={notification.actorAvatarUrl}
          alt={notification.actorName ?? ""}
          className="mt-0.5 size-5 shrink-0 rounded-full object-cover"
        />
      ) : (
        <Icon className={cn("mt-0.5 size-4 shrink-0", colorClass)} />
      )}

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-xs",
            isUnread
              ? "font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          {notification.title}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeTime(notification.createdAt)}
          </span>
          {notification.groupCount && notification.groupCount > 1 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              +{notification.groupCount - 1}
            </span>
          )}
          {notification.actionUrl && notification.actionLabel && (
            <span className="text-[10px] text-primary">
              {notification.actionLabel}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {isUnread && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkAsRead(notification._id);
            }}
            className="text-[10px] text-primary hover:underline"
            aria-label="Mark as read"
          >
            Mark read
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(notification._id);
            }}
            className="p-0.5 text-muted-foreground transition-opacity hover:text-foreground"
            aria-label="Dismiss notification"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
    </button>
  );
}
