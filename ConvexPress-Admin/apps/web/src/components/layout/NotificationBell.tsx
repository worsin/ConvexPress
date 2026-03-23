/**
 * Notification Bell Component
 *
 * Self-contained bell icon with unread count badge and dropdown popover.
 * Wired directly to Convex reactive queries -- no props needed.
 *
 * Features:
 *   - Real-time unread count badge (capped at 99+)
 *   - Click-to-open dropdown with 10 most recent notifications
 *   - "Mark all as read" link in dropdown header
 *   - "View all notifications" footer link
 *   - Click outside to close
 *   - New notifications slide in while open (reactive subscription)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  useNotificationDropdown,
  useNotificationMutations,
} from "@/hooks/use-notifications";
import { useNotificationCount } from "@/hooks/layout/useNotificationCount";
import { NotificationCard } from "@/components/notifications/notification-card";
import type { SiteNotification } from "@/lib/notifications/types";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const unreadCount = useNotificationCount();
  const { notifications, isLoading } = useNotificationDropdown(isOpen);
  const { markRead, markAllRead, dismiss } = useNotificationMutations();

  const displayCount = unreadCount > 99 ? "99+" : String(unreadCount);
  const hasUnread = unreadCount > 0;

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape key and trap Tab focus within dropdown
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
        return;
      }

      // Focus trap: cycle through focusable elements within the dropdown
      if (e.key === "Tab" && dropdownRef.current) {
        const focusable = dropdownRef.current.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"]), [role="button"]',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: if at first element, wrap to last
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab: if at last element, wrap to first
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      try {
        await markRead({ notificationId: id as Id<"siteNotifications"> });
      } catch {
        // Silently handle -- the UI will update via subscription
      }
    },
    [markRead],
  );

  const handleDismiss = useCallback(
    async (id: string) => {
      try {
        await dismiss({ notificationId: id as Id<"siteNotifications"> });
      } catch {
        // Silently handle
      }
    },
    [dismiss],
  );

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllRead({});
    } catch {
      // Silently handle
    }
  }, [markAllRead]);

  const handleNotificationClick = useCallback(
    (notification: SiteNotification) => {
      if (notification.actionUrl) {
        setIsOpen(false);
        navigate({ to: notification.actionUrl });
      }
    },
    [navigate],
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative inline-flex items-center justify-center rounded-sm p-1.5 text-foreground transition-colors hover:bg-muted"
        aria-label={
          hasUnread
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="size-4" aria-hidden="true" />
        {hasUnread && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 inline-flex items-center justify-center rounded-full bg-destructive px-1 py-0.5 text-[9px] font-bold leading-none text-destructive-foreground",
              unreadCount > 9 ? "min-w-5" : "min-w-4",
            )}
            aria-hidden="true"
          >
            {displayCount}
          </span>
        )}
      </button>

      {/* Dropdown popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden border border-border bg-card shadow-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h3 className="text-xs font-medium text-foreground">
              Notifications
            </h3>
            {hasUnread && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                <CheckCheck className="size-3" aria-hidden="true" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-0">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0"
                  >
                    <div className="size-4 shrink-0 animate-pulse rounded bg-muted" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                      <div className="h-2 w-1/3 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length > 0 ? (
              notifications.map((notification) => (
                <NotificationCard
                  key={notification._id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                  onDismiss={handleDismiss}
                  onClick={handleNotificationClick}
                  compact
                />
              ))
            ) : (
              <div className="px-4 py-6 text-center">
                <Bell className="mx-auto size-5 text-muted-foreground/50" aria-hidden="true" />
                <p className="mt-2 text-xs text-muted-foreground">
                  No notifications yet
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center border-t border-border">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate({ to: "/tools/site-notifications" });
              }}
              className="flex-1 px-3 py-2 text-center text-[11px] text-primary transition-colors hover:bg-muted/50"
            >
              View all notifications
            </button>
            <div className="h-4 w-px bg-border" />
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate({ to: "/settings/notifications" });
              }}
              className="px-3 py-2 text-center text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
