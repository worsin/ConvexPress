/**
 * Website-side capability checking hook.
 *
 * Provides React hooks for checking user capabilities on the public website.
 * Uses the current user's profile data (which includes role and capabilities)
 * to perform client-side permission checks.
 *
 * IMPORTANT: These are UI-convenience checks only. The backend `requireCan()`
 * in Convex mutations is the real security boundary.
 *
 * @example
 * // Check a single capability (returns boolean)
 * const canCreatePost = useCan("post.create");
 *
 * // Get the check function for dynamic checks
 * const can = useCanFn();
 * if (can("comment.create")) { ... }
 *
 * // Check role level
 * const isAtLeastAuthor = useRoleLevel(60);
 *
 * @see ConvexPress-Website/apps/web/src/lib/auth/auth.ts for the underlying utility functions
 * @see ConvexPress-Admin/apps/web/src/hooks/useCan.ts for the admin-side equivalent
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

import { useCurrentUser } from "./useCurrentUser";
import {
  userCan,
  userCanAll,
  userCanAny,
  userHasRoleLevel,
  userHasRole,
  userCanEditContent,
  type WebsiteAuthUser,
} from "@/lib/auth/auth";

// --- Adapting UserProfile to WebsiteAuthUser ---

/**
 * Adapts the UserProfile type from useCurrentUser() into the WebsiteAuthUser
 * shape needed by the auth utility functions.
 *
 * Fetches the user's role document via the roles.queries.getRole query
 * to get capabilities, slug, and level. This is a separate reactive query
 * so role changes propagate to capability checks in real-time.
 */
function useWebsiteAuthUser(): WebsiteAuthUser | null {
  const { user } = useCurrentUser();

  // Fetch the user's role to get capabilities, slug, and level.
  // Pass "skip" when there's no roleId to avoid unnecessary queries.
  const role = useQuery(
    api.roles.queries.getRole,
    user?.roleId
      ? { roleId: user.roleId as Id<"roles"> }
      : "skip",
  );

  return useMemo(() => {
    if (!user) return null;

    // Role data may still be loading -- provide empty capabilities until loaded.
    // This is safe because the backend enforces permissions via requireCan().
    const roleData = role as Record<string, unknown> | null | undefined;

    return {
      _id: user._id,
      email: user.email,
      displayName: user.displayName,
      roleId: user.roleId,
      roleSlug: (roleData?.slug as string) ?? "",
      roleLevel: (roleData?.level as number) ?? 0,
      capabilities: (roleData?.capabilities as string[]) ?? [],
      status: user.status,
    };
  }, [user, role]);
}

// --- Hooks ---

/**
 * Check if the current user has a specific capability.
 *
 * @param capability - The capability string to check (e.g., "post.create")
 * @returns true if the user has the capability, false if loading or denied
 *
 * @example
 * const canComment = useCan("comment.create");
 * if (canComment) { showCommentForm(); }
 */
export function useCan(capability: string): boolean {
  const authUser = useWebsiteAuthUser();
  return useMemo(() => userCan(authUser, capability), [authUser, capability]);
}

/**
 * Get a capability-checking function for dynamic checks.
 * Useful when you need to check multiple capabilities or check
 * capabilities conditionally.
 *
 * @returns A function that checks if the current user has a capability
 *
 * @example
 * const can = useCanFn();
 * const showEditButton = can("post.update");
 */
export function useCanFn(): (capability: string) => boolean {
  const authUser = useWebsiteAuthUser();
  return useMemo(
    () => (capability: string) => userCan(authUser, capability),
    [authUser],
  );
}

/**
 * Check if the current user has ALL of the specified capabilities.
 *
 * @param capabilities - Array of capability strings
 * @returns true if the user has every capability in the list
 *
 * @example
 * const canManageContent = useCanAll(["post.edit", "post.delete", "post.publish"]);
 */
export function useCanAll(capabilities: string[]): boolean {
  const authUser = useWebsiteAuthUser();
  return useMemo(
    () => userCanAll(authUser, capabilities),
    [authUser, capabilities],
  );
}

/**
 * Check if the current user has ANY of the specified capabilities.
 *
 * @param capabilities - Array of capability strings
 * @returns true if the user has at least one capability
 *
 * @example
 * const canSeeModTools = useCanAny(["comment.moderate", "post.edit"]);
 */
export function useCanAny(capabilities: string[]): boolean {
  const authUser = useWebsiteAuthUser();
  return useMemo(
    () => userCanAny(authUser, capabilities),
    [authUser, capabilities],
  );
}

/**
 * Check if the current user's role level meets a minimum threshold.
 *
 * Built-in role levels:
 *   Subscriber: 20, Contributor: 40, Author: 60, Editor: 80, Administrator: 100
 *
 * @param minLevel - The minimum role level required
 * @returns true if the user's role level is >= minLevel
 *
 * @example
 * const isAtLeastAuthor = useRoleLevel(60);
 */
export function useRoleLevel(minLevel: number): boolean {
  const authUser = useWebsiteAuthUser();
  return useMemo(
    () => userHasRoleLevel(authUser, minLevel),
    [authUser, minLevel],
  );
}

/**
 * Check if the current user has a specific role.
 *
 * @param roleSlug - The role slug to check (e.g., "editor", "administrator")
 * @returns true if the user has the specified role
 *
 * @example
 * const isAdmin = useHasRole("administrator");
 */
export function useHasRole(roleSlug: string): boolean {
  const authUser = useWebsiteAuthUser();
  return useMemo(
    () => userHasRole(authUser, roleSlug),
    [authUser, roleSlug],
  );
}

/**
 * Check if the current user can edit a specific piece of content.
 * Handles both general edit capability and own-content editing.
 *
 * @param concreteCap - The concrete capability (e.g., "post.update", "media.update")
 * @param ownCap - Deprecated. Kept for API compatibility. Pass the same value as concreteCap.
 * @param authorId - The _id of the content author
 * @returns true if the user can edit the content
 *
 * @example
 * const canEditPost = useCanEditContent("post.update", "post.update", post.authorId);
 */
export function useCanEditContent(
  editCap: string,
  ownCap: string,
  authorId: string,
): boolean {
  const authUser = useWebsiteAuthUser();
  return useMemo(
    () => userCanEditContent(authUser, editCap, ownCap, authorId),
    [authUser, editCap, ownCap, authorId],
  );
}
