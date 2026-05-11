/**
 * User Profile System - Mutation Hooks
 *
 * Wraps all profile mutations with error handling and toast notifications.
 * Each hook returns a stable async function that handles the full lifecycle:
 *   1. Call the Convex mutation
 *   2. Show success toast on completion
 *   3. Show error toast on failure
 *   4. Return success/failure indicator
 */

import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { SocialLinks, UserPreferences, UserStatus } from "@/lib/users/types";

// --- Update Own Profile ---

export function useUpdateProfile() {
  const mutation = useMutation(api.profiles.mutations.updateProfile);

  return useCallback(
    async (args: {
      nickname?: string;
      displayName?: string;
      bio?: string;
      url?: string;
      socialLinks?: SocialLinks;
      preferences?: UserPreferences;
      locale?: string;
      timezone?: string;
    }) => {
      try {
        await mutation(args);
        toast.success("Profile updated successfully.");
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to update profile";
        toast.error(message);
        return false;
      }
    },
    [mutation],
  );
}

// --- Admin Update Any User ---

export function useUpdateUser() {
  const mutation = useMutation(api.profiles.mutations.updateUser);

  return useCallback(
    async (args: {
      userId: Id<"users">;
      nickname?: string;
      displayName?: string;
      bio?: string;
      url?: string;
      socialLinks?: SocialLinks;
      preferences?: UserPreferences;
      locale?: string;
      timezone?: string;
      status?: UserStatus;
      roleId?: Id<"roles">;
      email?: string;
    }) => {
      try {
        await mutation(args);
        toast.success("User updated successfully.");
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to update user";
        toast.error(message);
        return false;
      }
    },
    [mutation],
  );
}

// --- Deactivate User ---

export function useDeactivateUser() {
  const mutation = useMutation(api.profiles.mutations.deactivateUser);

  return useCallback(
    async (args: { userId: Id<"users">; reason?: string }) => {
      try {
        await mutation(args);
        toast.success("User deactivated successfully.");
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to deactivate user";
        toast.error(message);
        return false;
      }
    },
    [mutation],
  );
}

// --- Reactivate User ---

export function useReactivateUser() {
  const mutation = useMutation(api.profiles.mutations.reactivateUser);

  return useCallback(
    async (args: { userId: Id<"users"> }) => {
      try {
        await mutation(args);
        toast.success("User reactivated successfully.");
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to reactivate user";
        toast.error(message);
        return false;
      }
    },
    [mutation],
  );
}

// --- Delete User ---

export function useDeleteUser() {
  const mutation = useMutation(api.profiles.mutations.deleteUser);

  return useCallback(
    async (args: {
      userId: Id<"users">;
      deleteContent: boolean;
      reassignTo?: Id<"users">;
    }) => {
      try {
        await mutation(args);
        toast.success("User deleted permanently.");
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to delete user";
        toast.error(message);
        return false;
      }
    },
    [mutation],
  );
}

// --- Bulk Delete Users ---

export function useBulkDeleteUsers() {
  const mutation = useMutation(api.profiles.mutations.bulkDeleteUsers);

  return useCallback(
    async (args: {
      userIds: Id<"users">[];
      deleteContent: boolean;
      reassignTo?: Id<"users">;
    }) => {
      try {
        const result = await mutation(args);
        if (result && typeof result === "object" && "deleted" in result) {
          const { deleted, errors } = result as {
            deleted: number;
            errors: Array<{ userId: string; error: string }>;
          };
          if (errors.length > 0) {
            toast.warning(
              `Deleted ${deleted} users. ${errors.length} failed.`,
            );
          } else {
            toast.success(`${deleted} users deleted.`);
          }
        } else {
          toast.success("Users deleted.");
        }
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to delete users";
        toast.error(message);
        return false;
      }
    },
    [mutation],
  );
}

// --- Upload Avatar ---

export function useUploadAvatar() {
  const mutation = useMutation(api.profiles.mutations.uploadAvatar);

  return useCallback(
    async (args: { userId?: Id<"users">; storageId: string }) => {
      try {
        await mutation(args);
        toast.success("Avatar updated.");
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to upload avatar";
        toast.error(message);
        return false;
      }
    },
    [mutation],
  );
}

// --- Remove Avatar ---

export function useRemoveAvatar() {
  const mutation = useMutation(api.profiles.mutations.removeAvatar);

  return useCallback(
    async (args: { userId?: Id<"users"> }) => {
      try {
        await mutation(args);
        toast.success("Avatar removed.");
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to remove avatar";
        toast.error(message);
        return false;
      }
    },
    [mutation],
  );
}

// --- Create User ---

export function useCreateUser() {
  const mutation = useMutation(api.profiles.mutations.createUser);

  return useCallback(
    async (args: {
      email: string;
      firstName?: string;
      lastName?: string;
      displayName?: string;
      roleId?: Id<"roles">;
      status?: UserStatus;
    }) => {
      try {
        const userId = await mutation(args);
        toast.success("User created successfully.");
        return userId;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to create user";
        toast.error(message);
        return null;
      }
    },
    [mutation],
  );
}
