/**
 * Hook for managing user notifications with read/unread state.
 * Wired to Convex reactive queries and mutations.
 *
 * Supports load-more pagination using cursor-based pagination
 * from the backend `list` query (nextCursor / hasMore).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { toast } from "sonner";

import type { NotificationItem } from "@/lib/dashboard/types";

/** Page size per load-more request */
const PAGE_SIZE = 20;

export function useUserNotifications(filter: "all" | "unread" = "all") {
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [accumulatedNotifications, setAccumulatedNotifications] = useState<
    NotificationItem[]
  >([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const prevFilterRef = useRef(filter);

  // Reset accumulated notifications and cursor when filter changes
  useEffect(() => {
    if (prevFilterRef.current !== filter) {
      setAccumulatedNotifications([]);
      setCursor(undefined);
      setIsLoadingMore(false);
      prevFilterRef.current = filter;
    }
  }, [filter]);

  // Reactive query for the initial page (no cursor)
  const initialResult = useQuery(api.notifications.queries.list, {
    unreadOnly: filter === "unread",
    limit: PAGE_SIZE,
  });

  // Reactive query for the current load-more cursor page
  const cursorResult = useQuery(
    api.notifications.queries.list,
    cursor !== undefined
      ? {
          unreadOnly: filter === "unread",
          limit: PAGE_SIZE,
          cursor,
        }
      : "skip",
  );

  const unreadCountResult = useQuery(
    api.notifications.queries.unreadCount,
    {},
  );

  // Mutations
  const markReadMutation = useMutation(api.notifications.mutations.markRead);
  const markAllReadMutation = useMutation(
    api.notifications.mutations.markAllRead,
  );
  const dismissMutation = useMutation(api.notifications.mutations.dismiss);

  // Append cursor page results when they arrive
  useEffect(() => {
    if (cursorResult && cursor !== undefined) {
      const newItems = (
        cursorResult as { notifications: NotificationItem[] }
      ).notifications;
      if (newItems.length > 0) {
        setAccumulatedNotifications((prev) => {
          // Deduplicate by _id
          const existingIds = new Set(prev.map((n) => n._id));
          const unique = newItems.filter((n) => !existingIds.has(n._id));
          return [...prev, ...unique];
        });
      }
      setIsLoadingMore(false);
    }
  }, [cursorResult, cursor]);

  // Build the combined notification list
  const initialNotifications: NotificationItem[] = initialResult
    ? (initialResult as { notifications: NotificationItem[] }).notifications
    : [];

  // Merge initial + accumulated, deduplicating
  const allNotifications = (() => {
    if (accumulatedNotifications.length === 0) return initialNotifications;
    const ids = new Set(initialNotifications.map((n) => n._id));
    const extra = accumulatedNotifications.filter((n) => !ids.has(n._id));
    return [...initialNotifications, ...extra];
  })();

  // Determine hasMore from the latest result
  const latestResult = cursor !== undefined ? cursorResult : initialResult;
  const hasMore = latestResult
    ? (latestResult as { hasMore: boolean }).hasMore
    : false;
  const nextCursor = latestResult
    ? (latestResult as { nextCursor?: number }).nextCursor
    : undefined;

  const unreadCount =
    unreadCountResult !== undefined && unreadCountResult !== null
      ? (unreadCountResult as { count: number }).count
      : 0;

  const isLoading = initialResult === undefined;

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || nextCursor === undefined) return;
    setIsLoadingMore(true);
    setCursor(nextCursor);
  }, [hasMore, isLoadingMore, nextCursor]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        await markReadMutation({
          notificationId: notificationId as Id<"siteNotifications">,
        });
      } catch {
        toast.error("Failed to mark notification as read");
      }
    },
    [markReadMutation],
  );

  const markAllAsRead = useCallback(async () => {
    setIsMarkingRead(true);
    try {
      await markAllReadMutation({});
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark all notifications as read");
    } finally {
      setIsMarkingRead(false);
    }
  }, [markAllReadMutation]);

  const dismissNotification = useCallback(
    async (notificationId: string) => {
      try {
        await dismissMutation({
          notificationId: notificationId as Id<"siteNotifications">,
        });
      } catch {
        toast.error("Failed to dismiss notification");
      }
    },
    [dismissMutation],
  );

  return {
    notifications: allNotifications,
    unreadCount,
    isLoading,
    isLoadingMore,
    isMarkingRead,
    hasMore,
    loadMore,
    markAsRead,
    markAllAsRead,
    dismissNotification,
  };
}
