/**
 * useNetworkStatus - Monitors browser online/offline state
 *
 * Returns the current network connectivity status using the
 * navigator.onLine API and online/offline window events.
 *
 * Used by the Content Editor to display a disconnect warning banner
 * when the user loses their internet connection (autosave will fail).
 */

import { useState, useEffect } from "react";

interface NetworkStatus {
  /** Whether the browser reports an active network connection */
  isOnline: boolean;
  /** Timestamp (ms) of the last time status changed, or null if no change detected */
  lastChangedAt: number | null;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    lastChangedAt: null,
  });

  useEffect(() => {
    function handleOnline() {
      setStatus({ isOnline: true, lastChangedAt: Date.now() });
    }

    function handleOffline() {
      setStatus({ isOnline: false, lastChangedAt: Date.now() });
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return status;
}
