import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";

/**
 * Reactive pending comment count for the Comments sidebar badge.
 *
 * Wraps the `api.comments.queries.pendingCount` Convex query.
 * Returns 0 while loading or if the query fails.
 * Updates in real-time via Convex subscription.
 *
 * Used to display the pending comment count badge next to
 * the "Comments" section in the admin sidebar nav.
 */
export function usePendingCommentCount(): number {
  const result = useQuery(api.comments.queries.pendingCount, {});

  // Return 0 while loading (undefined) or if no result
  if (result === undefined || result === null) return 0;

  return result;
}
