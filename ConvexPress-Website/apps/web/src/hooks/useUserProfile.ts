import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

import type { ProfileFormValues, UserProfile } from "@/lib/dashboard/types";
import { extractErrorMessage } from "@/lib/format";

/**
 * Hook for managing user profile form state and submission.
 * Wraps the Convex updateProfile mutation with optimistic feedback.
 *
 * Only sends changed fields to the backend (delta updates).
 */
export function useUserProfile(user: UserProfile | null) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateProfile = useMutation(api.profiles.mutations.updateProfile);

  const handleSave = useCallback(
    async (values: ProfileFormValues) => {
      if (!user) return;

      setIsSubmitting(true);
      try {
        // Build delta: only send changed fields
        const args: Record<string, any> = {};

        if (values.nickname !== (user.nickname ?? "")) {
          args.nickname = values.nickname;
        }
        if (values.displayName !== user.displayName) {
          args.displayName = values.displayName;
        }
        if (values.websiteUrl !== (user.websiteUrl ?? "")) {
          args.url = values.websiteUrl; // Backend field is "url", not "websiteUrl"
        }
        if (values.bio !== (user.bio ?? "")) {
          args.bio = values.bio;
        }
        if (
          JSON.stringify(values.socialLinks) !==
          JSON.stringify(user.socialLinks ?? {})
        ) {
          args.socialLinks = values.socialLinks;
        }

        // Only call mutation if there are actual changes
        if (Object.keys(args).length > 0) {
          await updateProfile(args);
        }

        toast.success("Profile updated successfully");
      } catch (error: unknown) {
        toast.error(extractErrorMessage(error, "Failed to update profile"));
      } finally {
        setIsSubmitting(false);
      }
    },
    [user, updateProfile],
  );

  return {
    isSubmitting,
    handleSave,
  };
}
