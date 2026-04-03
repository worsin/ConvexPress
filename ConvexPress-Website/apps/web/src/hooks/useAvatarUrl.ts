import { useMemo } from "react";

import type { UserProfile } from "@/lib/dashboard/types";

/**
 * Resolves the avatar URL for a user following the priority chain:
 * 1. Custom uploaded avatar (avatarUrl -- from Convex Storage)
 * 2. OAuth provider avatar (oauthAvatarUrl / Clerk imageUrl)
 * 3. null (caller should render initials)
 */
export function useAvatarUrl(user: UserProfile | null): string | null {
  return useMemo(() => {
    if (!user) return null;
    return user.avatarUrl ?? user.oauthAvatarUrl ?? null;
  }, [user]);
}
