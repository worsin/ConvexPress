/**
 * Dashboard System - Combined Data Hook
 *
 * Aggregates all dashboard queries into a single hook.
 * Each query is independent and reactive via Convex subscriptions.
 *
 * Three independent useQuery calls:
 *   useQuery(api.dashboard.queries.getAtAGlance)
 *   useQuery(api.dashboard.queries.getActivityFeed)
 *   useQuery(api.dashboard.queries.getQuickDrafts)
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { AtAGlanceData, ActivityFeedData, QuickDraftItem } from "@/lib/dashboard/types";

/**
 * Hook to load all dashboard widget data.
 *
 * Returns undefined for each field while loading (Convex convention).
 * Returns null if the user lacks permissions for that data slice.
 */
export function useDashboardData() {
  const atAGlance = useQuery(api.dashboard.queries.getAtAGlance) as
    | AtAGlanceData
    | null
    | undefined;

  const activityFeed = useQuery(api.dashboard.queries.getActivityFeed) as
    | ActivityFeedData
    | null
    | undefined;

  const quickDrafts = useQuery(api.dashboard.queries.getQuickDrafts) as
    | QuickDraftItem[]
    | null
    | undefined;

  return {
    atAGlance,
    activityFeed,
    quickDrafts,
    /** True if any query is still loading. */
    isLoading:
      atAGlance === undefined ||
      activityFeed === undefined ||
      quickDrafts === undefined,
  };
}
