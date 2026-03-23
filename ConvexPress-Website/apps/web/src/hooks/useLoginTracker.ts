/**
 * Login Tracker Hook
 *
 * Tracks successful login events on the website app by calling the
 * `auth.mutations.recordLogin` Convex mutation once per session.
 *
 * Uses sessionStorage to prevent duplicate tracking across page navigations
 * within the same browser session.
 *
 * Usage:
 *   function AuthenticatedLayout() {
 *     useLoginTracker();
 *     return <Outlet />;
 *   }
 */

import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@convexpress-website/backend/generated/api";

const SESSION_KEY = "sh-login-tracked";

export function useLoginTracker() {
  const { isSignedIn } = useAuth();
  const recordLogin = useMutation(api.authTracking.mutations.recordLogin);
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track if user is authenticated and we haven't already tracked this session
    if (!isSignedIn || hasTracked.current) return;

    // Check sessionStorage to avoid duplicate tracking across navigations
    if (typeof window !== "undefined") {
      const alreadyTracked = sessionStorage.getItem(SESSION_KEY);
      if (alreadyTracked) {
        hasTracked.current = true;
        return;
      }
    }

    hasTracked.current = true;

    // Record the login event (best-effort)
    recordLogin({
      method: "unknown",
      app: "website",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    })
      .then(() => {
        // Mark as tracked in sessionStorage
        if (typeof window !== "undefined") {
          sessionStorage.setItem(SESSION_KEY, "1");
        }
      })
      .catch(() => {
        // Login tracking is best-effort; reset the flag so it can retry
        hasTracked.current = false;
      });
  }, [isSignedIn, recordLogin]);
}
