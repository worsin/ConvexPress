/**
 * Knowledge Base System - User Enrichment Helper
 *
 * Shared helper to extract a typed user brief from a raw users document.
 * Eliminates the need for `(author as any).displayName` casts throughout
 * the KB module.
 *
 * The users schema defines `displayName` and `avatarUrl` as optional fields.
 * This helper provides safe access with fallback logic:
 *   displayName: user.displayName ?? join(firstName, lastName) ?? email ?? "Unknown"
 *   avatarUrl:   user.avatarUrl (may be undefined)
 */

import type { Doc, Id } from "../../_generated/dataModel";

export type EnrichedUser = {
  _id: Id<"users">;
  displayName: string;
  avatarUrl?: string;
};

/**
 * Convert a raw user document into a typed brief suitable for
 * embedding in article/comment/version responses.
 *
 * @param user - The user document from ctx.db.get(), or null
 * @returns EnrichedUser with guaranteed displayName, or null if input is null
 */
export function enrichUser(user: Doc<"users"> | null): EnrichedUser | null {
  if (!user) return null;
  return {
    _id: user._id,
    displayName:
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      "Unknown",
    avatarUrl: user.avatarUrl,
  };
}
