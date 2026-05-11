import { CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

interface NotificationActionsProps {
  unreadCount: number;
  onMarkAllRead: () => void;
  isMarkingRead: boolean;
}

/**
 * Notification action bar with "Mark All Read" and unread count.
 */
export function NotificationActions({
  unreadCount,
  onMarkAllRead,
  isMarkingRead,
}: NotificationActionsProps) {
  return (
    <div
      data-slot="notification-actions"
      className="flex items-center justify-between"
    >
      <p className="text-xs text-muted-foreground">
        {unreadCount > 0 ? (
          <>
            <span className="font-medium text-foreground">{unreadCount}</span>{" "}
            unread notification{unreadCount !== 1 ? "s" : ""}
          </>
        ) : (
          "No unread notifications"
        )}
      </p>

      {unreadCount > 0 && (
        <Button
          variant="ghost"
          size="xs"
          onClick={onMarkAllRead}
          disabled={isMarkingRead}
        >
          <CheckCheck className="size-3.5" />
          <span>Mark All Read</span>
        </Button>
      )}
    </div>
  );
}
