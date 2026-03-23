/**
 * Client-side auth utilities for the SmithHarper website.
 *
 * Provides capability checking for the website frontend.
 * This is the website-side equivalent of the admin's auth-context.tsx.
 *
 * IMPORTANT: Client-side capability checks are for UI convenience only.
 * The backend `requireCan()` in Convex mutations is the actual security boundary.
 *
 * @see ConvexPress-Admin/apps/web/src/lib/auth-context.tsx for the admin-side implementation
 */

// --- Types ---

export interface WebsiteAuthUser {
  _id: string;
  email: string;
  displayName: string;
  roleId: string;
  roleSlug: string;
  roleLevel: number;
  capabilities: string[];
  status: "active" | "deactivated" | "pending";
}

// --- Capability Checking ---

/**
 * Check if a user has a specific capability.
 *
 * @param user - The user object with capabilities array
 * @param capability - The capability string to check (e.g., "post.create")
 * @returns true if the user has the capability, false otherwise
 */
export function userCan(
  user: WebsiteAuthUser | null | undefined,
  capability: string,
): boolean {
  if (!user) return false;
  if (user.status !== "active") return false;
  return user.capabilities.includes(capability);
}

/**
 * Check if a user has ALL of the specified capabilities.
 *
 * @param user - The user object with capabilities array
 * @param capabilities - Array of capability strings to check
 * @returns true if the user has every capability in the list
 */
export function userCanAll(
  user: WebsiteAuthUser | null | undefined,
  capabilities: string[],
): boolean {
  if (!user) return false;
  if (user.status !== "active") return false;
  return capabilities.every((cap) => user.capabilities.includes(cap));
}

/**
 * Check if a user has ANY of the specified capabilities.
 *
 * @param user - The user object with capabilities array
 * @param capabilities - Array of capability strings to check
 * @returns true if the user has at least one capability in the list
 */
export function userCanAny(
  user: WebsiteAuthUser | null | undefined,
  capabilities: string[],
): boolean {
  if (!user) return false;
  if (user.status !== "active") return false;
  return capabilities.some((cap) => user.capabilities.includes(cap));
}

// --- Role Level Checking ---

/**
 * Check if a user's role level is at least the specified minimum.
 * Useful for broad access checks (e.g., "is this user at least an Author?").
 *
 * Built-in role levels:
 *   Subscriber: 20, Contributor: 40, Author: 60, Editor: 80, Administrator: 100
 *
 * @param user - The user object with roleLevel
 * @param minLevel - The minimum role level required
 * @returns true if the user's role level meets or exceeds minLevel
 */
export function userHasRoleLevel(
  user: WebsiteAuthUser | null | undefined,
  minLevel: number,
): boolean {
  if (!user) return false;
  if (user.status !== "active") return false;
  return user.roleLevel >= minLevel;
}

/**
 * Check if a user has a specific role by slug.
 *
 * @param user - The user object with roleSlug
 * @param roleSlug - The role slug to check (e.g., "administrator", "editor")
 * @returns true if the user's role matches the specified slug
 */
export function userHasRole(
  user: WebsiteAuthUser | null | undefined,
  roleSlug: string,
): boolean {
  if (!user) return false;
  if (user.status !== "active") return false;
  return user.roleSlug === roleSlug;
}

// --- Content Ownership ---

/**
 * Check if a user can edit a specific piece of content.
 *
 * SmithHarper uses a meta-capability pattern where ownership is resolved
 * at the backend level via `mapMetaCap()`. On the client side, we replicate
 * this logic: a user can edit content if they have the concrete capability
 * AND either they own the content OR their role level is Editor+ (80+).
 *
 * The `ownCap` parameter is kept for backward compatibility but is now
 * treated identically to the concrete capability -- the ownership check
 * is performed by comparing `user._id === authorId` regardless.
 *
 * NOTE: This is a UI-convenience check only. The backend `requireCanOnResource()`
 * is the actual security boundary.
 *
 * @param user - The user object
 * @param concreteCap - The concrete capability (e.g., "post.update", "media.update")
 * @param _ownCap - Deprecated. Kept for API compatibility. Use the same capability as concreteCap.
 * @param authorId - The _id of the content author
 * @returns true if the user can edit the content
 */
export function userCanEditContent(
  user: WebsiteAuthUser | null | undefined,
  concreteCap: string,
  _ownCap: string,
  authorId: string,
): boolean {
  if (!user) return false;
  if (user.status !== "active") return false;

  // User must have the concrete capability (e.g., "post.update")
  if (!user.capabilities.includes(concreteCap)) return false;

  // If user owns the content, the concrete capability is sufficient
  if (user._id === authorId) return true;

  // If user doesn't own the content, they need Editor-level role (80+)
  // to manage others' content (matches backend mapMetaCap behavior)
  if (user.roleLevel >= 80) return true;

  return false;
}
