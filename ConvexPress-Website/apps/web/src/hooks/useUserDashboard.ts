/**
 * Website User Dashboard Hook
 *
 * Wraps the getWebsiteDashboard Convex query for the /dashboard home page.
 * Returns the current user's personal dashboard data with loading state.
 *
 * Data includes:
 *   - myPosts:              Own post counts by status + recent posts
 *   - myComments:           Recent comments by the user
 *   - unreadNotifications:  Unread count + recent notification feed
 *   - contentPerformance:   Top posts by views (Author+ only, null otherwise)
 *
 * This is a single Convex subscription that updates in real-time.
 * When a user publishes a post or receives a notification, the dashboard
 * data updates immediately without page refresh.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import type { WebsiteDashboardData } from "@/lib/dashboard/types";

interface UseUserDashboardResult {
  /** Dashboard data or undefined while loading, null if unauthenticated */
  data: WebsiteDashboardData | null | undefined;
  /** True while the initial query is in flight */
  isLoading: boolean;
}

/**
 * Fetch the current user's website dashboard data.
 *
 * @returns Dashboard data, loading state
 *
 * @example
 * const { data, isLoading } = useUserDashboard();
 * if (isLoading) return <DashboardSkeleton />;
 * if (!data) return <LoginRedirect />;
 * return <UserDashboard dashboardData={data} />;
 */
export function useUserDashboard(): UseUserDashboardResult {
  const data = useQuery(api.dashboard.queries.getWebsiteDashboard);

  return {
    data: data as WebsiteDashboardData | null | undefined,
    isLoading: data === undefined,
  };
}
