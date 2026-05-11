/**
 * Route Restriction Helper
 *
 * SSR-safe utility for checking membership-gated routes on the website.
 * Called from layout loaders (e.g., _marketing.tsx beforeLoad / loader) to
 * determine whether the current pathname is restricted by a membership rule.
 *
 * Pattern:
 *   - Looks up `membership.queries.checkAccess` for resourceType="route"
 *     using the backend route-rule evaluator (exact path or glob pattern).
 *   - Returns the access decision so the caller can decide to render
 *     RestrictedContent instead of the normal page output.
 *
 * The function is intentionally lightweight — it only reads from the Convex
 * query cache (no write side-effect). If you need an audit log entry, the
 * page component can call `api.membership.queries.checkAccessAndLog` as a
 * Convex mutation instead.
 */

import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";
import type { QueryClient } from "@tanstack/react-query";

export interface RouteAccessResult {
	/** Whether access is allowed. */
	allowed: boolean;
	/** Reason string from the rule evaluation ("no_restriction", "login_required", etc.) */
	reason: string;
	/** Teaser mode for gated display ("hide" | "excerpt" | "custom_message" | null) */
	teaserMode?: "hide" | "excerpt" | "custom_message" | null;
	/** Admin-authored custom message for custom_message teaser mode */
	customMessage?: string | null;
	/** Plan IDs that would grant access (used to deep-link UpgradeCTA) */
	matchingPlanIds?: string[] | null;
}

/**
 * Check whether `pathname` is membership-gated.
 *
 * @param queryClient - TanStack Query client from the route context.
 * @param pathname    - The current URL pathname (e.g. "/members-only").
 * @returns `RouteAccessResult`. If the membership plugin is disabled or
 *          no rule is found, returns `{ allowed: true, reason: "no_restriction" }`.
 */
export async function checkRouteAccess(
	queryClient: QueryClient,
	pathname: string,
): Promise<RouteAccessResult> {
	try {
		const result = await queryClient.ensureQueryData(
			convexQuery(api.membership.queries.checkAccess, {
				resourceType: "route",
				resourceIdOrKey: pathname,
			}),
		);

		if (!result) {
			// Plugin disabled — treat as unrestricted.
			return { allowed: true, reason: "plugin_disabled" };
		}

		return result as RouteAccessResult;
	} catch {
		// Network errors or schema mismatches must not break normal page rendering.
		return { allowed: true, reason: "check_failed" };
	}
}
