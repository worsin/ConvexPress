/**
 * useCan Hook
 *
 * Client-side capability check hook for conditional rendering.
 * The SmithHarper equivalent of WordPress's `current_user_can()`.
 *
 * IMPORTANT: This is for UI convenience only.
 * The backend `requireCan()` is the actual security boundary.
 *
 * Usage:
 *   // As a boolean (checks a specific capability)
 *   const canCreatePost = useCan("post.create");
 *   if (canCreatePost) { ... }
 *
 *   // As a function (check multiple capabilities dynamically)
 *   const can = useCan();
 *   if (can("post.create")) { ... }
 *   if (can("role.assign")) { ... }
 */

import { useAuth } from "@/lib/auth-context";

/**
 * Overloaded hook:
 * - `useCan()` -> returns a function `(capability: string) => boolean`
 * - `useCan("post.create")` -> returns `boolean`
 */
export function useCan(): (capability: string) => boolean;
export function useCan(capability: string): boolean;
export function useCan(
  capability?: string,
): boolean | ((cap: string) => boolean) {
  const { can } = useAuth();

  if (capability !== undefined) {
    return can(capability);
  }

  return can;
}
