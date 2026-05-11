/**
 * Notification Toast Provider
 *
 * Wraps the admin app and listens for new notifications
 * via Convex reactive subscription. Fires Sonner toasts
 * for new arrivals.
 *
 * Toast position: top-right (avoids left sidebar interference).
 *
 * Usage in __root.tsx:
 *   <NotificationToastProvider>
 *     <Outlet />
 *   </NotificationToastProvider>
 */

import { useNotificationToasts } from "@/hooks/use-notification-toasts";
import { useConvexAuth } from "convex/react";

function NotificationToastListener() {
  useNotificationToasts();
  return null;
}

interface NotificationToastProviderProps {
  children: React.ReactNode;
}

export function NotificationToastProvider({
  children,
}: NotificationToastProviderProps) {
  const { isAuthenticated } = useConvexAuth();

  return (
    <>
      {isAuthenticated && <NotificationToastListener />}
      {children}
    </>
  );
}
