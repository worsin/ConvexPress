/**
 * Site Notification System - Admin Convenience Hooks
 *
 * Wraps Convex queries and mutations for the notification bell,
 * dropdown, and notification settings page.
 */

import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";

import type {
  SiteNotification,
  NotificationListResult,
  NotificationPreference,
} from "@/lib/notifications/types";

/**
 * Hook for the notification dropdown.
 * Returns the 10 most recent (non-dismissed) notifications.
 *
 * Pass `enabled: false` to skip the query when the dropdown is closed.
 */
export function useNotificationDropdown(enabled: boolean) {
  const result = useQuery(
    api.notifications.queries.list,
    enabled ? { limit: 10 } : "skip",
  ) as NotificationListResult | undefined;

  return {
    notifications: result?.notifications ?? [],
    isLoading: enabled && result === undefined,
  };
}

/**
 * Hook for the unread notification count (bell badge).
 * Already exists at hooks/layout/useNotificationCount.ts but
 * re-exported here for convenience.
 */
export function useUnreadCount(): number {
  const result = useQuery(api.notifications.queries.unreadCount, {});
  if (result === undefined || result === null) return 0;
  return (result as { count: number }).count;
}

/**
 * Hook providing all notification mutations.
 */
export function useNotificationMutations() {
  const markRead = useMutation(api.notifications.mutations.markRead);
  const markAllRead = useMutation(api.notifications.mutations.markAllRead);
  const dismiss = useMutation(api.notifications.mutations.dismiss);
  const dismissAll = useMutation(api.notifications.mutations.dismissAll);
  const updatePreferences = useMutation(
    api.notifications.mutations.updatePreferences,
  );

  return {
    markRead,
    markAllRead,
    dismiss,
    dismissAll,
    updatePreferences,
  };
}

/**
 * Hook for loading user notification preferences (merged with defaults).
 */
export function useNotificationPreferences(): {
  preferences: NotificationPreference[];
  isLoading: boolean;
} {
  const result = useQuery(api.notifications.queries.getPreferences, {});

  return {
    preferences: (result ?? []) as NotificationPreference[],
    isLoading: result === undefined,
  };
}
