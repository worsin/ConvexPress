/**
 * useTrafficData - GA4/fallback switching hook for traffic data.
 *
 * Checks if GA4 is connected. If yes, reads from GA4 cache and triggers
 * fetch actions on cache miss. If no, reads from built-in analytics rollups.
 *
 * Returns a normalized data shape regardless of source, plus a `source`
 * field ("ga4" | "builtin") for the DataSourceIndicator.
 */

import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
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

export function useTrafficData(
  dateRange: DateRangeKey,
  opts?: { postId?: Id<"posts">; path?: string },
) {
  const isGA4Connected = useQuery(api.ga4.queries.isConnected);

  // GA4 path: read from cache
  const ga4Data = useQuery(
    api.ga4.queries.getCachedTrafficData,
    isGA4Connected ? { dateRange, path: opts?.path } : "skip",
  );

  // Built-in path: read from rollups
  const { startDate, endDate } = dateRangeToISO(dateRange);
  const builtinData = useQuery(
    api.analytics.queries.getTrafficSummary,
    !isGA4Connected
      ? { startDate, endDate, postId: opts?.postId, path: opts?.path }
      : "skip",
  );

  // Trigger GA4 fetch on cache miss
  const fetchTraffic = useAction(api.ga4.actions.fetchTrafficData);
  const fetchInFlightRef = useRef(false);

  useEffect(() => {
    if (isGA4Connected && ga4Data === null && !fetchInFlightRef.current) {
      fetchInFlightRef.current = true;
      fetchTraffic({ dateRange, path: opts?.path })
        .catch(() => {
          // Error handled by action (stored in settings)
        })
        .finally(() => {
          fetchInFlightRef.current = false;
        });
    }
  }, [isGA4Connected, ga4Data, dateRange, opts?.path, fetchTraffic]);

  return {
    data: isGA4Connected ? ga4Data?.data ?? null : builtinData,
    source: (isGA4Connected ? "ga4" : "builtin") as "ga4" | "builtin",
    isLoading:
      isGA4Connected === undefined ||
      (isGA4Connected && ga4Data === undefined) ||
      (!isGA4Connected && builtinData === undefined),
    isFetching: isGA4Connected && ga4Data === null,
  };
}
