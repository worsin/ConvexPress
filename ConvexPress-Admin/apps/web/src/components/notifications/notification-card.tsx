/**
 * Notification Card Component
 *
 * Renders a single notification in the dropdown or notification list.
 * Shows type icon, title, message, relative timestamp, actor info,
 * action button, dismiss button, and unread indicator.
 */

import {
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTIFICATION_TYPE_COLORS } from "@/lib/notifications/constants";
import type { SiteNotification, NotificationType } from "@/lib/notifications/types";

interface NotificationCardProps {
  notification: SiteNotification;
  onMarkRead?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onClick?: (notification: SiteNotification) => void;
  compact?: boolean;
}

const TYPE_ICONS: Record<
  NotificationType,
  React.ComponentType<{ className?: string }>
> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

export function NotificationCard({
  notification,
  onMarkRead,
  onDismiss,
  onClick,
  compact = false,
}: NotificationCardProps) {
  const isUnread = notification.readAt === undefined;
  const Icon = TYPE_ICONS[notification.type] ?? Info;
  const colorClass =
    NOTIFICATION_TYPE_COLORS[notification.type] ?? "text-primary";

  const handleClick = () => {
    if (isUnread && onMarkRead) {
      onMarkRead(notification._id);
    }
    if (onClick) {
      onClick(notification);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "group flex w-full items-start gap-2.5 border-b border-border px-3 text-left transition-colors last:border-b-0",
        compact ? "py-2" : "py-3",
        notification.actionUrl && "cursor-pointer hover:bg-muted/50",
        isUnread && "border-l-2 border-l-primary bg-primary/5",
      )}
    >
      {/* Type icon or actor avatar */}
      <div className="mt-0.5 shrink-0">
        {notification.actorAvatarUrl ? (
          <img
            src={notification.actorAvatarUrl}
            alt={notification.actorName ?? ""}
            className="size-5 rounded-full object-cover"
          />
        ) : (
          <Icon className={cn("size-4", colorClass)} />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-xs leading-relaxed",
            isUnread
              ? "font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          {notification.title}
        </p>
        {!compact && (
          <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
            {notification.message}
          </p>
        )}
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
            <span className="text-[10px] text-primary hover:underline">
              {notification.actionLabel}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {isUnread && onMarkRead && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead(notification._id);
            }}
            className="text-[10px] text-primary opacity-0 transition-opacity hover:underline group-hover:opacity-100"
            aria-label="Mark as read"
          >
            Read
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(notification._id);
            }}
            className="p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            aria-label="Dismiss notification"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}
