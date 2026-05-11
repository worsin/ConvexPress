/**
 * Website Notification Toast Provider
 *
 * Listens for new notifications via Convex reactive subscription
 * and fires Sonner toasts for new arrivals.
 *
 * Toast position: bottom-right (standard SaaS position for website).
 *
 * Only active when user is authenticated (checked via useConvexAuth).
 */

import { useEffect, useRef } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

interface NotificationData {
  _id: string;
  notificationKey: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
}

interface NotificationPreference {
  notificationKey: string;
  toastEnabled: boolean;
}

const TOAST_DURATIONS: Record<string, number> = {
  info: 5000,
  success: 4000,
  warning: 8000,
  error: 10000,
};

function NotificationToastListener() {
  const latestIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const router = useRouter();

  const result = useQuery(api.notifications.queries.list, { limit: 1 });
  const preferences = useQuery(api.notifications.queries.getPreferences, {}) as
    | NotificationPreference[]
    | undefined;

  useEffect(() => {
    if (!result) return;

    const notifications = (result as { notifications: NotificationData[] }).notifications;
    if (!notifications || notifications.length === 0) return;

    const latest = notifications[0];

    // On first load, record current ID without toasting
    if (!initializedRef.current) {
      latestIdRef.current = latest._id;
      initializedRef.current = true;
      return;
    }

    // If new notification (different ID), show toast
    if (latest._id !== latestIdRef.current) {
      latestIdRef.current = latest._id;

      const preference = preferences?.find(
        (entry) => entry.notificationKey === latest.notificationKey,
      );
      if (preference && !preference.toastEnabled) {
        return;
      }

      const navigate = (to: string) => {
        router.navigate({ to });
      };
      const shouldUseDesktop =
        typeof document !== "undefined" &&
        document.visibilityState === "hidden" &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        window.Notification.permission === "granted";

      if (shouldUseDesktop) {
        const desktopNotification = new window.Notification(latest.title, {
          body: latest.message,
          icon: "/favicon.ico",
          tag: latest._id,
        });

        desktopNotification.onclick = () => {
          window.focus();
          if (latest.actionUrl) {
            navigate(latest.actionUrl);
          }
          desktopNotification.close();
        };
        return;
      }

      const duration = TOAST_DURATIONS[latest.type] ?? 5000;
      const toastFn =
        latest.type === "success"
          ? toast.success
          : latest.type === "warning"
            ? toast.warning
            : latest.type === "error"
              ? toast.error
              : toast.info;

      toastFn(latest.title, {
        description: latest.message,
        duration,
        action: latest.actionUrl
            ? {
                label: latest.actionLabel ?? "View",
                onClick: () => {
                  navigate(latest.actionUrl!);
                },
              }
            : undefined,
      });
    }
  }, [preferences, result, router]);

  return null;
}

interface WebsiteNotificationToastProviderProps {
  children: React.ReactNode;
}

export function WebsiteNotificationToastProvider({
  children,
}: WebsiteNotificationToastProviderProps) {
  const { isAuthenticated } = useConvexAuth();

  return (
    <>
      {isAuthenticated && <NotificationToastListener />}
      {children}
    </>
  );
}
