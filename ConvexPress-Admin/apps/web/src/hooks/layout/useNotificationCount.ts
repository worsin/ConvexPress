import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";

/**
 * Reactive unread notification count for the admin bar bell badge.
 *
 * Wraps the `api.notifications.queries.unreadCount` Convex query.
 * Returns 0 while loading or if the query fails.
 * Updates in real-time via Convex subscription.
 *
 * The backend caps the count at 100 for performance.
 * The UI displays "99+" for counts > 99.
 */
export function useNotificationCount(): number {
  const result = useQuery(api.notifications.queries.unreadCount, {});

  // Return 0 while loading (undefined) or if no result
  if (result === undefined || result === null) return 0;

  return result.count;
}
