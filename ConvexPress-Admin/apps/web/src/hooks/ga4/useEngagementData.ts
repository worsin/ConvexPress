/**
 * useEngagementData - GA4/fallback switching hook for engagement data.
 *
 * When GA4 is connected: bounce rate, avg session duration, pages/session,
 * engagement rate, event count. These metrics are NOT available from built-in.
 *
 * When GA4 is not connected: scroll depth and time on page from built-in.
 * Bounce rate and pages/session show "N/A".
 *
 * The hook merges both sources: GA4 provides the aggregate engagement metrics,
 * while built-in always provides section-level scroll depth (GA4 cannot track
 * ConvexPress structured content sections).
 */

import { useQuery, useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { useEffect, useRef } from "react";
import type { Id } from "@backend/convex/_generated/dataModel";

type DateRangeKey = "last7days" | "last28days" | "last90days";

function dateRangeToISO(range: DateRangeKey): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const days = range === "last7days" ? 7 : range === "last28days" ? 28 : 90;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

export function useEngagementData(
  dateRange: DateRangeKey,
  opts?: { postId?: Id<"posts">; path?: string },
) {
  const isGA4Connected = useQuery(api.ga4.queries.isConnected);

  // GA4 path: read from cache
  const ga4Data = useQuery(
    api.ga4.queries.getCachedEngagementData,
    isGA4Connected ? { dateRange, path: opts?.path } : "skip",
  );

  // Built-in always loaded for scroll depth (GA4 can't do section-level)
  const { startDate, endDate } = dateRangeToISO(dateRange);
  const builtinData = useQuery(api.analytics.queries.getEngagementSummary, {
    startDate,
    endDate,
    postId: opts?.postId,
    path: opts?.path,
  });

  // Trigger GA4 fetch on cache miss
  const fetchEngagement = useAction(api.ga4.actions.fetchEngagementData);
  const fetchInFlightRef = useRef(false);

  useEffect(() => {
    if (isGA4Connected && ga4Data === null && !fetchInFlightRef.current) {
      fetchInFlightRef.current = true;
      fetchEngagement({ dateRange, path: opts?.path })
        .catch(() => {})
        .finally(() => {
          fetchInFlightRef.current = false;
        });
    }
  }, [isGA4Connected, ga4Data, dateRange, opts?.path, fetchEngagement]);

  return {
    ga4Data: isGA4Connected ? ga4Data?.data ?? null : null,
    builtinData,
    source: (isGA4Connected ? "ga4" : "builtin") as "ga4" | "builtin",
    isLoading:
      isGA4Connected === undefined ||
      builtinData === undefined ||
      (isGA4Connected && ga4Data === undefined),
    isFetching: isGA4Connected && ga4Data === null,
  };
}
