/**
 * Site Notification System - Toast Detection Hook
 *
 * Tracks the latest notification ID and fires a Sonner toast
 * when a new notification arrives. Checks user toast preferences
 * before showing.
 *
 * Used by <NotificationToastProvider /> in the admin app root.
 */

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "@tanstack/react-router";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";

import { TOAST_DURATIONS } from "@/lib/notifications/constants";
import type { NotificationType, SiteNotification } from "@/lib/notifications/types";

/**
 * Hook that monitors the user's notification feed and triggers
 * Sonner toasts for new arrivals.
 *
 * It subscribes to the most recent notification (limit: 1) and
 * compares the latest ID against the previously seen one.
 * On first mount it records the current latest ID without toasting.
 */
export function useNotificationToasts() {
  const latestIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const router = useRouter();

  // Subscribe to the single most recent notification
  const result = useQuery(api.notifications.queries.list, { limit: 1 });

  useEffect(() => {
    if (!result || result.notifications.length === 0) return;

    const latest = result.notifications[0] as SiteNotification;

    // On first load, record the current ID without toasting
    if (!initializedRef.current) {
      latestIdRef.current = latest._id;
      initializedRef.current = true;
      return;
    }

    // If the latest notification is new (different ID), show toast
    if (latest._id !== latestIdRef.current) {
      latestIdRef.current = latest._id;

      const notificationType = latest.type as NotificationType;
      const duration = TOAST_DURATIONS[notificationType] ?? 5000;

      // Map notification type to Sonner toast method
      const toastFn =
        notificationType === "success"
          ? toast.success
          : notificationType === "warning"
            ? toast.warning
            : notificationType === "error"
              ? toast.error
              : toast.info;

      toastFn(latest.title, {
        description: latest.message,
        duration,
        action: latest.actionUrl
          ? {
              label: latest.actionLabel ?? "View",
              onClick: () => {
                router.navigate({ to: latest.actionUrl! });
              },
            }
          : undefined,
      });
    }
  }, [result, router]);
}
