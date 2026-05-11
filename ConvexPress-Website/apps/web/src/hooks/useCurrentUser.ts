import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import type { UserProfile } from "@/lib/dashboard/types";

/** User status values */
type UserStatus = "pending" | "active" | "deactivated";

/** Backend user profile response shape from profiles.queries.getProfile */
interface BackendUserProfile {
  _id: string;
  clerkUserId?: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  profilePictureUrl?: string | null;
  nickname?: string | null;
  displayName?: string | null;
  slug?: string;
  url?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  resolvedAvatarUrl?: string | null;
  avatarStorageId?: string | null;
  socialLinks?: Record<string, string> | null;
  preferences?: Record<string, unknown> | null;
  roleId?: string;
  status?: UserStatus;
  postCount?: number | null;
  commentCount?: number | null;
  lastLoginAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Fetches the current authenticated user's profile from Convex.
 * Returns loading state and user data.
 *
 * - undefined = loading (query in progress)
 * - null = user not found (webhook race condition)
 * - UserProfile = loaded
 *
 * Uses the profiles.queries.getProfile query which returns the full user
 * document for the currently authenticated user, including resolvedAvatarUrl.
 */
export function useCurrentUser(): {
  user: UserProfile | null | undefined;
  isLoading: boolean;
} {
  const result = useQuery(api.profiles.queries.getProfile);

  // Map Convex result to the UserProfile shape expected by dashboard components.
  // The backend returns the full user document with some fields named differently
  // from the frontend type (e.g., url vs websiteUrl, profilePictureUrl vs oauthAvatarUrl).
  const user = useMemo<UserProfile | null | undefined>(() => {
    // undefined = still loading
    if (result === undefined) return undefined;
    // null = not authenticated or user not found
    if (result === null) return null;

    // Type the result as the backend response shape
    const r = result as BackendUserProfile;
    return {
      _id: r._id,
      externalAuthId: r.clerkUserId ?? "",
      email: r.email,
      firstName: r.firstName ?? null,
      lastName: r.lastName ?? null,
      oauthAvatarUrl: r.profilePictureUrl ?? null,
      nickname: r.nickname ?? null,
      displayName: r.displayName ?? r.email,
      slug: r.slug ?? "",
      websiteUrl: r.url ?? null,
      bio: r.bio ?? null,
      avatarUrl: r.avatarUrl ?? r.resolvedAvatarUrl ?? null,
      avatarStorageId: r.avatarStorageId ?? null,
      socialLinks: r.socialLinks ?? null,
      preferences: r.preferences ?? null,
      roleId: r.roleId ?? "",
      status: r.status ?? "active",
      postCount: r.postCount ?? null,
      commentCount: r.commentCount ?? null,
      lastLoginAt: r.lastLoginAt ?? null,
      createdAt: r.createdAt ?? 0,
      updatedAt: r.updatedAt ?? 0,
    };
  }, [result]);

  const isLoading = useMemo(() => user === undefined, [user]);

  return { user, isLoading };
}
