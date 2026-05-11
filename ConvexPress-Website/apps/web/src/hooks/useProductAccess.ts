/**
 * useProductAccess
 *
 * React hook that checks whether the current user has membership access to a
 * specific product (resourceType="product", resourceIdOrKey=productId).
 *
 * Returns the access decision from `api.membership.queries.checkAccess` in
 * real-time (reactive Convex query). Falls back to `{ allowed: true }` when:
 *   - The query hasn't loaded yet (undefined state)
 *   - The membership plugin is disabled
 *
 * Usage in the product detail page:
 *   const { allowed, isLoading, teaserMode, matchingPlanIds } = useProductAccess(product._id);
 *   if (!allowed) return <UpgradeCTA matchingPlanIds={matchingPlanIds} />;
 *
 * Wave 7: exact productId match only.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

export interface ProductAccessResult {
  /** True while the Convex query is still loading. */
  isLoading: boolean;
  /** Whether access is allowed (defaults to true while loading). */
  allowed: boolean;
  /** Reason string from the rule evaluation. */
  reason?: string;
  /** Teaser mode to use when rendering a gate. */
  teaserMode?: "hide" | "excerpt" | "custom_message" | null;
  /** Admin-authored custom message. */
  customMessage?: string | null;
  /** Plan IDs that would grant access (used to deep-link UpgradeCTA). */
  matchingPlanIds?: string[] | null;
}

/**
 * @param productId - The Convex product document ID.
 */
export function useProductAccess(productId: string | undefined): ProductAccessResult {
  const result = useQuery(
    api.membership.queries.checkAccess,
    productId
      ? { resourceType: "product", resourceIdOrKey: productId }
      : "skip",
  );

  // Not yet loaded or productId not provided — allow by default.
  if (result === undefined || productId === undefined) {
    return { isLoading: result === undefined && productId !== undefined, allowed: true };
  }

  // Plugin disabled — treat as unrestricted.
  if (!result) {
    return { isLoading: false, allowed: true };
  }

  return {
    isLoading: false,
    allowed: result.allowed ?? true,
    reason: result.reason ?? undefined,
    teaserMode: result.teaserMode ?? null,
    customMessage: result.customMessage ?? null,
    matchingPlanIds: result.matchingPlanIds ?? null,
  };
}
