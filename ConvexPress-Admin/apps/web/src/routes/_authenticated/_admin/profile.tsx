/**
 * Your Profile - /admin/profile
 *
 * WordPress equivalent: Users > Your Profile
 *
 * Allows the current user to edit their own profile.
 * Same form as Edit User but WITHOUT:
 *   - Role & Permissions section (cannot change own role)
 *   - Deactivate/Delete buttons (cannot deactivate/delete self)
 *   - Admin-only fields
 */

import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";

import { Skeleton } from "@/components/ui/skeleton";
import { UserForm } from "@/components/users/user-form";
import { useUpdateProfile } from "@/hooks/users/useUserMutations";
import type { SocialLinks, UserPreferences, UserStatus } from "@/lib/users/types";
import type { Id } from "@backend/convex/_generated/dataModel";

/** Shape returned by getProfile query (enriched user profile) */
interface EnrichedUserProfile {
  _id: Id<"users">;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePictureUrl?: string;
  avatarUrl?: string;
  avatarStorageId?: string;
  resolvedAvatarUrl?: string;
  displayName?: string;
  nickname?: string;
  bio?: string;
  url?: string;
  socialLinks?: SocialLinks;
  preferences?: UserPreferences;
  status: UserStatus;
  roleId?: Id<"roles">;
  roleName?: string;
  roleLevel?: number;
  createdAt: number;
  lastLoginAt?: number;
}

export const Route = createFileRoute("/_authenticated/_admin/profile")({
  component: YourProfilePage,
});

function YourProfilePage() {
  // --- Fetch current user ---
  const profile = useQuery(api.profiles.queries.getProfile, {});
  const isLoading = profile === undefined;
  const [isSaving, setIsSaving] = useState(false);

  const updateProfile = useUpdateProfile();

  // --- Profile save handler ---
  const handleSaveProfile = useCallback(
    async (data: {
      nickname: string;
      displayName: string;
      bio: string;
      url: string;
      socialLinks: SocialLinks;
      preferences: UserPreferences;
    }) => {
      setIsSaving(true);
      const success = await updateProfile({
        nickname: data.nickname || undefined,
        displayName: data.displayName || undefined,
        bio: data.bio || undefined,
        url: data.url || undefined,
        socialLinks: data.socialLinks,
        preferences: data.preferences,
      });
      setIsSaving(false);
      return success;
    },
    [updateProfile],
  );

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // --- Not authenticated ---
  if (!profile) {
    return (
      <p className="text-sm text-muted-foreground">
        Please log in to view your profile.
      </p>
    );
  }

  const user = profile as EnrichedUserProfile;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">Your Profile</h1>
        <p className="text-xs text-muted-foreground">
          Manage your personal information and preferences.
        </p>
      </div>

      {/* Profile Form (self-profile mode hides admin-only sections) */}
      <UserForm
        user={{
          _id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePictureUrl: user.profilePictureUrl,
          avatarUrl: user.avatarUrl,
          avatarStorageId: user.avatarStorageId,
          resolvedAvatarUrl: user.resolvedAvatarUrl,
          displayName: user.displayName,
          nickname: user.nickname,
          bio: user.bio,
          url: user.url,
          socialLinks: user.socialLinks,
          preferences: user.preferences,
          status: user.status,
          roleId: user.roleId,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
        }}
        isSelfProfile
        onSave={handleSaveProfile}
        isSaving={isSaving}
      />
    </div>
  );
}
