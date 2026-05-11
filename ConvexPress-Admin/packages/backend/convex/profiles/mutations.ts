/**
 * User Profile System - Public Mutations
 *
 * All write operations for user profile management.
 *
 * Mutations:
 *   - updateProfile - Update own profile (any authenticated user)
 *   - updateUser - Admin update of any user (Administrator only)
 *   - createUser - Admin creates a user manually (Administrator only)
 *   - deactivateUser - Deactivate a user account (Administrator only)
 *   - reactivateUser - Reactivate a deactivated user (Administrator only)
 *   - deleteUser - Permanently delete a user (Administrator only)
 *   - bulkDeleteUsers - Bulk delete users (Administrator only)
 *   - uploadAvatar - Upload a custom avatar (any authenticated user)
 *   - removeAvatar - Remove custom avatar (any authenticated user)
 *
 * All mutations require authentication and appropriate capabilities.
 * All write operations emit events via the Event Dispatcher System.
 */

import { mutation } from "../_generated/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireCan, resolveUserRole } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { countActiveAdmins } from "../helpers/profile";
import { PROFILE_EVENTS, SYSTEM } from "../events/constants";
import {
  validateBio,
  isValidUrl,
  generateSlug,
  ensureUniqueSlug,
  generateDisplayName,
} from "../helpers/profile";
import {
  updateProfileArgs,
  updateUserArgs,
  createUserArgs,
  deactivateUserArgs,
  reactivateUserArgs,
  deleteUserArgs,
  bulkDeleteUsersArgs,
  bulkChangeRoleArgs,
  uploadAvatarArgs,
  removeAvatarArgs,
  MAX_NICKNAME_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
} from "./validators";

// ─── Validation Helpers (local) ─────────────────────────────────────────────

function validateNickname(nickname: string): string {
  const trimmed = nickname.trim();
  if (trimmed.length > MAX_NICKNAME_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Nickname cannot exceed ${MAX_NICKNAME_LENGTH} characters`,
    });
  }
  return trimmed;
}

function validateDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Display name cannot be empty",
    });
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Display name cannot exceed ${MAX_DISPLAY_NAME_LENGTH} characters`,
    });
  }
  return trimmed;
}

function validateUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (!isValidUrl(trimmed)) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Invalid website URL format",
    });
  }
  return trimmed;
}

// ─── Profile Update Mutations ───────────────────────────────────────────────

/**
 * Update own profile.
 *
 * Any authenticated user can update their own profile fields:
 * nickname, displayName, bio, url, socialLinks, preferences, locale, timezone.
 *
 * Requires `profile.update` capability (all roles have this).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateProfile = mutation({
  args: updateProfileArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const user = await requireCan(ctx, "profile.update");

    // 2. Build patch object tracking changes
    const patch: Record<string, any> = {};
    const changes: string[] = [];

    // 3. Validate and apply each field
    if (args.nickname !== undefined) {
      const newNickname = validateNickname(args.nickname);
      if (newNickname !== user.nickname) {
        patch.nickname = newNickname;
        changes.push("nickname");
      }
    }

    if (args.displayName !== undefined) {
      const newDisplayName = validateDisplayName(args.displayName);
      if (newDisplayName !== user.displayName) {
        patch.displayName = newDisplayName;
        changes.push("displayName");
      }
    }

    if (args.bio !== undefined) {
      const newBio = validateBio(args.bio);
      if (newBio !== user.bio) {
        patch.bio = newBio;
        changes.push("bio");
      }
    }

    if (args.url !== undefined) {
      const newUrl = validateUrl(args.url);
      if (newUrl !== user.url) {
        patch.url = newUrl || undefined; // Clear if empty
        changes.push("url");
      }
    }

    if (args.socialLinks !== undefined) {
      // Merge with existing social links (don't replace entirely)
      const existingSocialLinks = user.socialLinks ?? {};
      const mergedSocialLinks = { ...existingSocialLinks, ...args.socialLinks };
      patch.socialLinks = mergedSocialLinks;
      changes.push("socialLinks");
    }

    if (args.preferences !== undefined) {
      // Merge with existing preferences (don't replace entirely)
      const existingPreferences = user.preferences ?? {};
      const mergedPreferences = { ...existingPreferences, ...args.preferences };
      patch.preferences = mergedPreferences;
      changes.push("preferences");
    }

    if (args.locale !== undefined) {
      if (args.locale !== user.locale) {
        patch.locale = args.locale;
        changes.push("locale");
      }
    }

    if (args.timezone !== undefined) {
      if (args.timezone !== user.timezone) {
        patch.timezone = args.timezone;
        changes.push("timezone");
      }
    }

    if (args.avatarUrl !== undefined) {
      if (args.avatarUrl !== user.avatarUrl) {
        patch.avatarUrl = args.avatarUrl || undefined;
        changes.push("avatarUrl");
      }
    }

    if (args.avatarMediaId !== undefined) {
      if (args.avatarMediaId !== user.avatarMediaId) {
        patch.avatarMediaId = args.avatarMediaId;
        changes.push("avatarMediaId");
      }
    }

    // 4. Ensure slug exists (generate if missing)
    if (!user.slug) {
      const displayName = patch.displayName ?? user.displayName ?? generateDisplayName(
        user.firstName,
        user.lastName,
        user.email,
        user.username,
      );
      const slug = generateSlug(displayName);
      patch.slug = await ensureUniqueSlug(ctx, slug, user._id);
      changes.push("slug");
    }

    // 5. If no changes, return early (no-op)
    if (changes.length === 0) {
      return;
    }

    // 6. Update
    patch.updatedAt = Date.now();
    await ctx.db.patch("users", user._id, patch);

    // 7. Emit event
    await emitEvent(ctx, PROFILE_EVENTS.UPDATED, SYSTEM.PROFILE, {
      userId: user._id,
      changes,
    });
  },
});

/**
 * Admin update of any user's profile.
 *
 * Requires `profile.update` capability. If updating a different user,
 * must also be Administrator (role level 100).
 *
 * Can change: all profile fields + status, roleId, email (admin-only fields).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateUser = mutation({
  args: updateUserArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const currentUser = await requireCan(ctx, "profile.update");

    // 2. Verify admin role for editing other users
    const role = await resolveUserRole(ctx, currentUser);
    if (!role || role.level < 100) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Administrator role required to edit other users",
      });
    }

    // 3. Fetch target user
    const targetUser = await ctx.db.get("users", args.userId);
    if (!targetUser) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // 4. Build patch object
    const patch: Record<string, any> = {};
    const changes: string[] = [];

    // Profile fields
    if (args.nickname !== undefined) {
      const newNickname = validateNickname(args.nickname);
      if (newNickname !== targetUser.nickname) {
        patch.nickname = newNickname;
        changes.push("nickname");
      }
    }

    if (args.displayName !== undefined) {
      const newDisplayName = validateDisplayName(args.displayName);
      if (newDisplayName !== targetUser.displayName) {
        patch.displayName = newDisplayName;
        changes.push("displayName");
      }
    }

    if (args.bio !== undefined) {
      const newBio = validateBio(args.bio);
      if (newBio !== targetUser.bio) {
        patch.bio = newBio;
        changes.push("bio");
      }
    }

    if (args.url !== undefined) {
      const newUrl = validateUrl(args.url);
      if (newUrl !== targetUser.url) {
        patch.url = newUrl || undefined;
        changes.push("url");
      }
    }

    if (args.socialLinks !== undefined) {
      const existingSocialLinks = targetUser.socialLinks ?? {};
      const mergedSocialLinks = { ...existingSocialLinks, ...args.socialLinks };
      patch.socialLinks = mergedSocialLinks;
      changes.push("socialLinks");
    }

    if (args.preferences !== undefined) {
      const existingPreferences = targetUser.preferences ?? {};
      const mergedPreferences = { ...existingPreferences, ...args.preferences };
      patch.preferences = mergedPreferences;
      changes.push("preferences");
    }

    if (args.locale !== undefined) {
      if (args.locale !== targetUser.locale) {
        patch.locale = args.locale;
        changes.push("locale");
      }
    }

    if (args.timezone !== undefined) {
      if (args.timezone !== targetUser.timezone) {
        patch.timezone = args.timezone;
        changes.push("timezone");
      }
    }

    if (args.avatarUrl !== undefined) {
      if (args.avatarUrl !== targetUser.avatarUrl) {
        patch.avatarUrl = args.avatarUrl || undefined;
        changes.push("avatarUrl");
      }
    }

    if (args.avatarMediaId !== undefined) {
      if (args.avatarMediaId !== targetUser.avatarMediaId) {
        patch.avatarMediaId = args.avatarMediaId;
        changes.push("avatarMediaId");
      }
    }

    // Admin-only fields
    if (args.status !== undefined) {
      if (args.status !== targetUser.status) {
        patch.status = args.status;
        changes.push("status");
      }
    }

    if (args.roleId !== undefined) {
      if (args.roleId !== targetUser.roleId) {
        // Verify the target role exists and is active
        const targetRole = await ctx.db.get("roles", args.roleId);
        if (!targetRole || targetRole.status !== "active") {
          throw new ConvexError({
            code: "NOT_FOUND",
            message: "Target role not found or inactive",
          });
        }
        patch.roleId = args.roleId;
        changes.push("roleId");
      }
    }

    if (args.email !== undefined) {
      if (args.email !== targetUser.email) {
        // Check email uniqueness
        const existingByEmail = await ctx.db
          .query("users")
          .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", args.email!))
          .unique();
        if (existingByEmail && existingByEmail._id !== args.userId) {
          throw new ConvexError({
            code: "CONFLICT",
            message: "A user with this email already exists",
          });
        }
        patch.email = args.email;
        changes.push("email");
      }
    }

    // Ensure slug exists
    if (!targetUser.slug) {
      const displayName = patch.displayName ?? targetUser.displayName ?? generateDisplayName(
        targetUser.firstName,
        targetUser.lastName,
        targetUser.email,
        targetUser.username,
      );
      const slug = generateSlug(displayName);
      patch.slug = await ensureUniqueSlug(ctx, slug, args.userId);
      changes.push("slug");
    }

    // 5. If no changes, return early
    if (changes.length === 0) {
      return;
    }

    // 6. Update
    patch.updatedAt = Date.now();
    await ctx.db.patch("users", args.userId, patch);

    // 7. Emit event
    await emitEvent(ctx, PROFILE_EVENTS.UPDATED, SYSTEM.PROFILE, {
      userId: args.userId,
      updatedBy: currentUser._id,
      changes,
    });
  },
});

/**
 * Admin creates a user manually.
 *
 * Requires `profile.deactivate` capability (Administrator only -- uses deactivate
 * as a proxy for "can manage users"; profile.create doesn't exist in the capability
 * system, so we use the admin-level profile capability).
 *
 * Note: This creates a Convex-side user record with local auth. This is
 * primarily for pre-provisioning user records.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createUser = mutation({
  args: createUserArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Auth + admin check
    const currentUser = await requireCan(ctx, "profile.deactivate");

    // 2. Check email uniqueness
    const existingByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", args.email))
      .unique();
    if (existingByEmail) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "A user with this email already exists",
      });
    }

    // 3. Generate display name
    const displayName =
      args.displayName ??
      generateDisplayName(args.firstName, args.lastName, args.email);

    // 4. Generate unique slug
    const slug = await ensureUniqueSlug(ctx, generateSlug(displayName));

    // 5. Resolve default role if not provided
    let roleId = args.roleId;
    if (!roleId) {
      // Look up the default role (Subscriber)
      const defaultRole = await ctx.db
        .query("roles")
        .withIndex("by_isDefault", (q: ConvexQueryBuilder) => q.eq("isDefault", true))
        .first();
      if (defaultRole) {
        roleId = defaultRole._id;
      }
    }

    // 6. Insert user
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      authSource: "local",
      email: args.email,
      emailVerified: false,
      firstName: args.firstName,
      lastName: args.lastName,
      displayName,
      slug,
      roleId,
      status: args.status ?? "active",
      createdAt: now,
      updatedAt: now,
    });

    // 7. Emit event
    await emitEvent(ctx, PROFILE_EVENTS.UPDATED, SYSTEM.PROFILE, {
      userId,
      action: "created",
      createdBy: currentUser._id,
    });

    return userId;
  },
});

// ─── Account Status Mutations ───────────────────────────────────────────────

/**
 * Deactivate a user account.
 *
 * Requires `profile.deactivate` capability (Administrator only).
 * Prevents the user from logging in.
 *
 * Safety checks:
 *   - Cannot deactivate yourself
 *   - Cannot deactivate the last active Administrator
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deactivateUser = mutation({
  args: deactivateUserArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const currentUser = await requireCan(ctx, "profile.deactivate");

    // 2. Self-protection
    if (args.userId === currentUser._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot deactivate your own account",
      });
    }

    // 3. Fetch target user
    const targetUser = await ctx.db.get("users", args.userId);
    if (!targetUser) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // 4. Check if already deactivated
    if (targetUser.status === "inactive") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "User is already deactivated",
      });
    }

    // 5. Last admin protection
    if (targetUser.roleId) {
      const targetRole = await ctx.db.get("roles", targetUser.roleId);
      if (targetRole && targetRole.level >= 100) {
        const activeAdminCount = await countActiveAdmins(ctx);
        if (activeAdminCount <= 1) {
          throw new ConvexError({
            code: "FORBIDDEN",
            message: "Cannot deactivate the last active Administrator",
          });
        }
      }
    }

    // 6. Deactivate
    const now = Date.now();
    await ctx.db.patch("users", args.userId, {
      status: "inactive",
      deactivatedAt: now,
      deactivatedBy: currentUser._id,
      updatedAt: now,
    });

    // 7. Emit event
    await emitEvent(ctx, PROFILE_EVENTS.DEACTIVATED, SYSTEM.PROFILE, {
      userId: args.userId,
      deactivatedBy: currentUser._id,
      reason: args.reason,
    });
  },
});

/**
 * Reactivate a deactivated user account.
 *
 * Requires `profile.deactivate` capability (Administrator only).
 * Sets status back to "active" and clears deactivation metadata.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const reactivateUser = mutation({
  args: reactivateUserArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const currentUser = await requireCan(ctx, "profile.deactivate");

    // 2. Fetch target user
    const targetUser = await ctx.db.get("users", args.userId);
    if (!targetUser) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // 3. Verify user is deactivated
    if (targetUser.status !== "inactive") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "User is not deactivated",
      });
    }

    // 4. Reactivate
    await ctx.db.patch("users", args.userId, {
      status: "active",
      deactivatedAt: undefined,
      deactivatedBy: undefined,
      updatedAt: Date.now(),
    });

    // 5. Emit event
    await emitEvent(ctx, PROFILE_EVENTS.UPDATED, SYSTEM.PROFILE, {
      userId: args.userId,
      reactivatedBy: currentUser._id,
      changes: ["status"],
    });
  },
});

/**
 * Permanently delete a user.
 *
 * Requires `profile.delete_user` capability (Administrator only).
 *
 * Content disposition:
 *   - If deleteContent = true: All posts/pages by this user are deleted
 *   - If deleteContent = false and reassignTo provided: Content reassigned to target user
 *   - If deleteContent = false and no reassignTo: Error (must choose)
 *
 * Safety checks:
 *   - Cannot delete yourself
 *   - Cannot delete the last active Administrator
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteUser = mutation({
  args: deleteUserArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const currentUser = await requireCan(ctx, "profile.delete_user");

    // 2. Self-protection
    if (args.userId === currentUser._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot delete your own account",
      });
    }

    // 3. Fetch target user
    const targetUser = await ctx.db.get("users", args.userId);
    if (!targetUser) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // 4. Last admin protection
    if (targetUser.roleId) {
      const targetRole = await ctx.db.get("roles", targetUser.roleId);
      if (targetRole && targetRole.level >= 100) {
        const activeAdminCount = await countActiveAdmins(ctx);
        if (activeAdminCount <= 1) {
          throw new ConvexError({
            code: "FORBIDDEN",
            message: "Cannot delete the last Administrator",
          });
        }
      }
    }

    // 5. Content disposition validation
    if (!args.deleteContent && !args.reassignTo) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Must specify a user to reassign content to, or choose to delete content",
      });
    }

    if (args.reassignTo) {
      const reassignTarget = await ctx.db.get("users", args.reassignTo);
      if (!reassignTarget) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Reassignment target user not found",
        });
      }
      if (reassignTarget.status !== "active") {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Reassignment target user is not active",
        });
      }
    }

    // 6. Store data before deletion (needed for events and cleanup)
    const deletedEmail = targetUser.email;
    const deletedAvatarStorageId = targetUser.avatarStorageId;

    // 7. Handle content (posts/pages)
    // NOTE: Content reassignment/deletion will be handled by Post/Page systems
    // via the profile.deleted event. For now, we emit the event with the
    // content action so listeners can handle it.

    // 8. Delete custom avatar from Convex Storage if exists
    if (deletedAvatarStorageId) {
      try {
        await ctx.storage.delete(deletedAvatarStorageId as Id<"_storage">);
      } catch {
        // Storage file may not exist; continue with deletion
      }
    }

    // 9. Delete the user record
    await ctx.db.delete("users", args.userId);

    // 10. Emit event (uses stored data since the record is now deleted)
    await emitEvent(ctx, "profile.deleted", SYSTEM.PROFILE, {
      userId: args.userId,
      deletedBy: currentUser._id,
      email: deletedEmail,
      contentAction: args.deleteContent ? "delete" : "reassign",
      reassignTo: args.reassignTo,
    });
  },
});

/**
 * Bulk delete users.
 *
 * Requires `profile.bulk_delete` capability (Administrator only).
 * Iterates over userIds and delegates to the delete logic for each.
 * Silently skips the current user if included in the list.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const bulkDeleteUsers = mutation({
  args: bulkDeleteUsersArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const currentUser = await requireCan(ctx, "profile.bulk_delete");

    let deleted = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const userId of args.userIds) {
      // Skip self silently
      if (userId === currentUser._id) continue;

      try {
        const targetUser = await ctx.db.get("users", userId);
        if (!targetUser) continue;

        // Last admin protection
        if (targetUser.roleId) {
          const targetRole = await ctx.db.get("roles", targetUser.roleId);
          if (targetRole && targetRole.level >= 100) {
            const activeAdminCount = await countActiveAdmins(ctx);
            if (activeAdminCount <= 1) {
              errors.push({
                userId: userId as string,
                error: "Cannot delete the last Administrator",
              });
              continue;
            }
          }
        }

        // Store data before deletion
        const deletedEmail = targetUser.email;
        const deletedAvatarStorageId = targetUser.avatarStorageId;

        // Delete avatar from storage
        if (deletedAvatarStorageId) {
          try {
            await ctx.storage.delete(deletedAvatarStorageId as Id<"_storage">);
          } catch {
            // Continue
          }
        }

        // Delete user record
        await ctx.db.delete("users", userId);

        // Emit event per user
        await emitEvent(ctx, "profile.deleted", SYSTEM.PROFILE, {
          userId,
          deletedBy: currentUser._id,
          email: deletedEmail,
          contentAction: args.deleteContent ? "delete" : "reassign",
          reassignTo: args.reassignTo,
        });

        deleted++;
      } catch (e: unknown) {
        errors.push({
          userId: userId as string,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    return { deleted, errors };
  },
});

/**
 * Bulk change role for multiple users.
 *
 * Requires `profile.update_role` capability (Administrator only).
 * Iterates over userIds and changes each user's role.
 * Silently skips the current user to prevent self-demotion accidents.
 *
 * Safety checks:
 *   - Cannot change role of the last Administrator if demoting
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const bulkChangeRole = mutation({
  args: bulkChangeRoleArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const currentUser = await requireCan(ctx, "role.assign");

    // 2. Verify the target role exists and is active
    const targetRole = await ctx.db.get("roles", args.newRoleId);
    if (!targetRole || targetRole.status !== "active") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Target role not found or inactive",
      });
    }

    let updated = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const userId of args.userIds) {
      // Skip self silently
      if (userId === currentUser._id) continue;

      try {
        const targetUser = await ctx.db.get("users", userId);
        if (!targetUser) continue;

        // Skip if already has this role
        if (targetUser.roleId === args.newRoleId) continue;

        // Last admin protection: if demoting from admin to non-admin
        if (targetUser.roleId) {
          const currentRole = await ctx.db.get("roles", targetUser.roleId);
          if (currentRole && currentRole.level >= 100 && targetRole.level < 100) {
            const activeAdminCount = await countActiveAdmins(ctx);
            if (activeAdminCount <= 1) {
              errors.push({
                userId: userId as string,
                error: "Cannot demote the last Administrator",
              });
              continue;
            }
          }
        }

        // Update role
        await ctx.db.patch("users", userId, {
          roleId: args.newRoleId,
          updatedAt: Date.now(),
        });

        // Emit event
        await emitEvent(ctx, PROFILE_EVENTS.UPDATED, SYSTEM.PROFILE, {
          userId,
          updatedBy: currentUser._id,
          changes: ["roleId"],
          newRole: targetRole.name,
        });

        updated++;
      } catch (e: unknown) {
        errors.push({
          userId: userId as string,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    return { updated, errors };
  },
});

// ─── Avatar Mutations ───────────────────────────────────────────────────────

/**
 * Upload a custom avatar.
 *
 * Requires `profile.upload_avatar` capability (all authenticated users).
 * If userId is provided and different from current user, requires admin role.
 *
 * Avatar upload flow:
 *   1. Client calls generateUploadUrl() to get Convex upload URL
 *   2. Client uploads cropped image to the URL
 *   3. Client gets storageId from upload response
 *   4. Client calls this mutation with storageId
 *   5. Server resolves URL, patches user, emits event
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const uploadAvatar = mutation({
  args: uploadAvatarArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const currentUser = await requireCan(ctx, "profile.upload_avatar");

    // 2. Determine target user
    let targetUserId = currentUser._id;
    if (args.userId && args.userId !== currentUser._id) {
      // Admin escalation
      const role = await resolveUserRole(ctx, currentUser);
      if (!role || role.level < 100) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Administrator role required to change another user's avatar",
        });
      }
      targetUserId = args.userId;
    }

    const targetUser = await ctx.db.get("users", targetUserId);
    if (!targetUser) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // 3. Delete old avatar from storage if exists
    if (targetUser.avatarStorageId) {
      try {
        await ctx.storage.delete(targetUser.avatarStorageId as Id<"_storage">);
      } catch {
        // Old file may not exist; continue
      }
    }

    // 4. Get URL for new avatar
    const avatarUrl = await ctx.storage.getUrl(args.storageId as Id<"_storage">);
    if (!avatarUrl) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Could not resolve avatar storage URL",
      });
    }

    // 5. Patch user
    await ctx.db.patch("users", targetUserId, {
      avatarUrl,
      avatarStorageId: args.storageId,
      updatedAt: Date.now(),
    });

    // 6. Emit event
    await emitEvent(ctx, PROFILE_EVENTS.AVATAR_CHANGED, SYSTEM.PROFILE, {
      userId: targetUserId,
      avatarUrl,
    });
  },
});

/**
 * Remove custom avatar, falling back to OAuth provider avatar or initials.
 *
 * Requires `profile.upload_avatar` capability (all authenticated users).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const removeAvatar = mutation({
  args: removeAvatarArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const currentUser = await requireCan(ctx, "profile.upload_avatar");

    // 2. Determine target user
    let targetUserId = currentUser._id;
    if (args.userId && args.userId !== currentUser._id) {
      const role = await resolveUserRole(ctx, currentUser);
      if (!role || role.level < 100) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Administrator role required to change another user's avatar",
        });
      }
      targetUserId = args.userId;
    }

    const targetUser = await ctx.db.get("users", targetUserId);
    if (!targetUser) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // 3. Delete from storage if exists
    if (targetUser.avatarStorageId) {
      try {
        await ctx.storage.delete(targetUser.avatarStorageId as Id<"_storage">);
      } catch {
        // Continue
      }
    }

    // 4. Clear avatar fields
    await ctx.db.patch("users", targetUserId, {
      avatarUrl: undefined,
      avatarStorageId: undefined,
      avatarMediaId: undefined,
      updatedAt: Date.now(),
    });

    // 5. Emit event with fallback URL
    const fallbackUrl = targetUser.profilePictureUrl ?? null;
    await emitEvent(ctx, PROFILE_EVENTS.AVATAR_CHANGED, SYSTEM.PROFILE, {
      userId: targetUserId,
      avatarUrl: fallbackUrl,
    });
  },
});
