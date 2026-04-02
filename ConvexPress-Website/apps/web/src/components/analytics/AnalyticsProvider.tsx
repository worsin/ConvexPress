/**
 * AnalyticsProvider - Initializes the ConvexPress analytics tracker.
 *
 * Placed in the marketing layout to track all public pages.
 * Initializes the tracker on mount and tracks client-side navigations
 * via TanStack Router's useLocation hook.
 *
 * The VITE_CONVEX_URL environment variable provides the Convex deployment
 * URL, which is used to construct the tracking endpoint URL.
 */

import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  initAnalytics,
  trackPageview,
  destroyAnalytics,
} from "@/lib/analytics/tracker";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;

export function AnalyticsProvider() {
  const location = useLocation();
  const initializedRef = useRef(false);
  const prevPathRef = useRef<string>("");

  // Initialize tracker on mount
  useEffect(() => {
    if (!CONVEX_URL || initializedRef.current) return;
    initAnalytics(CONVEX_URL);
    initializedRef.current = true;
    prevPathRef.current = location.pathname;

    return () => {
      destroyAnalytics();
      initializedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track client-side navigations
  useEffect(() => {
    if (!initializedRef.current) return;
    if (location.pathname === prevPathRef.current) return;
    prevPathRef.current = location.pathname;
    trackPageview();
  }, [location.pathname]);

  // This component renders nothing
  return null;
}
