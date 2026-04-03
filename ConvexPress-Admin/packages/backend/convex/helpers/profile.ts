/**
 * User Profile System - Shared Helper Functions
 *
 * Reusable helpers for avatar resolution, display name generation,
 * slug generation, and other profile-related utilities.
 *
 * Used by:
 *   - profiles/mutations.ts
 *   - profiles/queries.ts
 *   - profiles/internals.ts
 *   - Other systems that need user display data
 */

import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Minimal user shape needed for profile helpers. */
type UserProfileFields = {
  _id: Id<"users">;
  email: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  profilePictureUrl?: string; // OAuth provider avatar
};

// ─── Avatar Helpers ─────────────────────────────────────────────────────────

/**
 * Resolve the effective avatar URL following the priority chain:
 *   1. Custom upload (avatarUrl) -- highest priority
 *   2. OAuth provider (profilePictureUrl)
 *   3. null (client should render initials)
 */
export function resolveAvatarUrl(
  user: Pick<UserProfileFields, "avatarUrl" | "profilePictureUrl">,
): string | null {
  if (user.avatarUrl) return user.avatarUrl;
  if (user.profilePictureUrl) return user.profilePictureUrl;
  return null;
}

/**
 * Generate 1-2 character initials from a display name.
 *
 * Examples:
 *   "John Doe" -> "JD"
 *   "Jane" -> "J"
 *   "" -> "?"
 */
export function getInitials(displayName: string | undefined | null): string {
  if (!displayName || !displayName.trim()) return "?";

  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0]!.charAt(0).toUpperCase();
  }
  return (
    parts[0]!.charAt(0).toUpperCase() +
    parts[parts.length - 1]!.charAt(0).toUpperCase()
  );
}

// ─── Display Name Helpers ───────────────────────────────────────────────────

/**
 * Generate dropdown options from a user's name components.
 * Matches WordPress's "Display name publicly as" dropdown behavior.
 *
 * Uses a Set to deduplicate options.
 *
 * Options generated (when available):
 *   - Email username (always included as fallback)
 *   - First name
 *   - Last name
 *   - "First Last"
 *   - "Last, First"
 *   - Nickname (if different from first/last name)
 */
export function generateDisplayNameOptions(
  user: Pick<
    UserProfileFields,
    "email" | "firstName" | "lastName" | "nickname" | "username"
  >,
): string[] {
  const options = new Set<string>();

  // Email username (always present as fallback)
  const emailUsername = user.email.split("@")[0];
  if (emailUsername) {
    options.add(emailUsername);
  }

  // Username (if set and different)
  if (user.username) {
    options.add(user.username);
  }

  // First name
  if (user.firstName) {
    options.add(user.firstName);
  }

  // Last name
  if (user.lastName) {
    options.add(user.lastName);
  }

  // "First Last" (if both available)
  if (user.firstName && user.lastName) {
    options.add(`${user.firstName} ${user.lastName}`);
  }

  // "Last, First" (if both available)
  if (user.firstName && user.lastName) {
    options.add(`${user.lastName}, ${user.firstName}`);
  }

  // Nickname (if available and different from other options)
  if (user.nickname) {
    options.add(user.nickname);
  }

  return Array.from(options);
}

/**
 * Generate a default display name for a new user.
 *
 * Priority:
 *   1. "First Last" if both names available
 *   2. First name only
 *   3. Last name only
 *   4. Username if available
 *   5. Email username
 *   6. "Anonymous" as ultimate fallback
 */
export function generateDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  email?: string | null,
  username?: string | null,
): string {
  if (firstName && lastName) return `${firstName} ${lastName}`;
  if (firstName) return firstName;
  if (lastName) return lastName;
  if (username) return username;
  if (email) {
    const emailUsername = email.split("@")[0];
    if (emailUsername) return emailUsername;
  }
  return "Anonymous";
}

// ─── Slug Helpers ───────────────────────────────────────────────────────────

/**
 * Convert a display name to a URL-safe slug.
 *
 * Rules:
 *   - Lowercase
 *   - Remove non-alphanumeric except spaces and hyphens
 *   - Replace spaces with hyphens
 *   - Collapse multiple hyphens
 *   - Strip leading/trailing hyphens
 *   - Fallback to "user" if empty result
 */
export function generateSlug(displayName: string): string {
  let slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove non-alphanumeric except spaces and hyphens
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Strip leading/trailing hyphens

  if (!slug) return "user";
  return slug;
}

/**
 * Ensure slug uniqueness by querying the by_slug index.
 * If the slug is taken, appends a counter: "slug-2", "slug-3", etc.
 *
 * @param ctx - Query or mutation context
 * @param slug - The desired slug
 * @param excludeUserId - Optional user ID to exclude (allows a user to keep their own slug)
 * @returns A unique slug
 */
export async function ensureUniqueSlug(
  ctx: QueryCtx | MutationCtx,
  slug: string,
  excludeUserId?: Id<"users">,
): Promise<string> {
  // Check if the slug is available
  const existing = await ctx.db
    .query("users")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (!existing || (excludeUserId && existing._id === excludeUserId)) {
    return slug;
  }

  // Slug is taken -- append a counter
  let counter = 2;
  while (counter < 100) {
    // Safety limit to prevent infinite loop
    const candidate = `${slug}-${counter}`;
    const candidateExisting = await ctx.db
      .query("users")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique();

    if (
      !candidateExisting ||
      (excludeUserId && candidateExisting._id === excludeUserId)
    ) {
      return candidate;
    }
    counter++;
  }

  // Extremely unlikely fallback
  return `${slug}-${Date.now()}`;
}

// ─── Public Fields Filter ───────────────────────────────────────────────────

/**
 * Extract public-only fields from a user document.
 * Used for non-admin queries and author archive pages.
 */
export function extractPublicFields(user: { _id: string; displayName?: string; slug?: string; bio?: string; avatarStorageId?: string; avatarExternalUrl?: string; url?: string; socialLinks?: Record<string, string>; postCount?: number; status?: string; }) {
  return {
    _id: user._id,
    displayName: user.displayName,
    slug: user.slug,
    bio: user.bio,
    avatarUrl: resolveAvatarUrl(user),
    url: user.url,
    socialLinks: user.socialLinks,
    postCount: user.postCount ?? 0,
    status: user.status,
  };
}

// ─── Validation Helpers ─────────────────────────────────────────────────────

/** Maximum bio length in characters. */
export const MAX_BIO_LENGTH = 500;

/**
 * Validate and sanitize a bio string.
 * Strips HTML tags and enforces max length.
 */
export function validateBio(bio: string): string {
  // Strip HTML tags to prevent XSS
  const stripped = bio.replace(/<[^>]*>/g, "").trim();
  if (stripped.length > MAX_BIO_LENGTH) {
    throw new ConvexError(`Bio must be ${MAX_BIO_LENGTH} characters or less`);
  }
  return stripped;
}

/**
 * Basic URL format validation.
 * Returns true if the string looks like a valid URL.
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ─── Admin Count Helper ──────────────────────────────────────────────────────

/**
 * Count the number of active administrators.
 *
 * Used by deactivateUser, deleteUser, and bulkDeleteUsers to enforce
 * the "last admin protection" rule -- the system must always have at least
 * one active administrator.
 *
 * Performance optimization: Instead of loading ALL active users and checking
 * each one's role (O(n) users * O(1) role lookup), we first find admin-level
 * roles, then query users with those roleIds using the `by_roleId` index,
 * and filter to active status. This dramatically reduces the working set
 * for sites with many non-admin users.
 *
 * @param ctx - Query or mutation context
 * @returns The number of active administrators
 */
export async function countActiveAdmins(
  ctx: QueryCtx | MutationCtx,
): Promise<number> {
  // Step 1: Find all roles with level >= 100 (admin-level roles).
  // Typically just 1 role (Administrator), so this is a small set.
  const allRoles = await ctx.db.query("roles").collect();
  const adminRoles = allRoles.filter((r) => r.level >= 100);

  if (adminRoles.length === 0) return 0;

  // Step 2: For each admin role, count active users with that roleId.
  // Uses the by_roleId index so we only load users with admin roles,
  // not ALL active users.
  let count = 0;
  for (const adminRole of adminRoles) {
    const usersWithRole = await ctx.db
      .query("users")
      .withIndex("by_roleId", (q) => q.eq("roleId", adminRole._id))
      .collect();

    // Filter to active status in memory (small set: only admin-role users)
    count += usersWithRole.filter((u) => u.status === "active").length;
  }

  return count;
}
