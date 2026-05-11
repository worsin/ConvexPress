import { useCallback, useEffect, useState } from "react";

type BrowserNotificationPermission = NotificationPermission | "unsupported";

function readPermission(): BrowserNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return window.Notification.permission;
}

export function useBrowserNotificationPermission() {
  const [permission, setPermission] = useState<BrowserNotificationPermission>(
    readPermission,
  );

  useEffect(() => {
    const refresh = () => setPermission(readPermission());

    refresh();

    if (typeof window === "undefined") return;

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported" as const;
    }

    const next = await window.Notification.requestPermission();
    setPermission(next);
    return next;
  }, []);

  return {
    supported: permission !== "unsupported",
    permission,
    isGranted: permission === "granted",
    isDenied: permission === "denied",
    canRequest: permission === "default",
    requestPermission,
  };
}
