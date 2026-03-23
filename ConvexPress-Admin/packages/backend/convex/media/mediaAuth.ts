/**
 * Media System - Authorization Helper
 *
 * Consolidates ownership-based capability checks for media operations.
 * Centralizes the logic: own media needs Author-level (60+) role,
 * others' media needs Editor-level (80+) role.
 *
 * Usage:
 *   import { checkMediaCapability } from "./mediaAuth";
 *
 *   // Inside a mutation handler:
 *   await checkMediaCapability(ctx, user, media, "edit");
 */

import { ConvexError } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type UserDoc = {
  _id: Id<"users">;
  roleId?: Id<"roles">;
  workosUserId?: string;
  clerkUserId?: string;
};

type MediaDoc = {
  _id: Id<"media">;
  uploadedBy: Id<"users">;
};

/**
 * Check media-specific capabilities based on ownership and action type.
 *
 * Rules:
 *   - "read": All authenticated users can read media.
 *   - "upload": Requires role level >= 60 (Author+). Already checked via requireCan("media.upload").
 *   - "edit": Own media = Author+ (60+), Others' media = Editor+ (80+).
 *   - "delete": Own media = Author+ (60+), Others' media = Editor+ (80+).
 *
 * Throws ConvexError with code FORBIDDEN if the user lacks permission.
 */
export async function checkMediaCapability(
  ctx: MutationCtx,
  user: UserDoc,
  media: MediaDoc,
  action: "upload" | "edit" | "delete" | "read",
): Promise<void> {
  // Read is always allowed for authenticated users
  if (action === "read") return;

  // Upload doesn't involve existing media, just needs capability (already checked by caller)
  if (action === "upload") return;

  // For edit/delete: if user owns the media, Author-level is sufficient (already passed requireCan)
  if (media.uploadedBy === user._id) return;

  // For others' media: need Editor-level role (80+)
  const level = await getUserRoleLevel(ctx, user);

  if (level < 80) {
    const actionLabel = action === "edit" ? "edit" : "delete";
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `You can only ${actionLabel} your own media`,
    });
  }
}

/**
 * Get the role level for a user.
 * Returns the numeric role level, or 0 if no role is assigned.
 */
export async function getUserRoleLevel(
  ctx: MutationCtx,
  user: UserDoc,
): Promise<number> {
  if (!user.roleId) return 0;
  const role = await ctx.db.get("roles", user.roleId);
  if (!role) return 0;
  // The roles table has a 'level' field (number). Use safe property access.
  return typeof (role as Record<string, unknown>).level === "number"
    ? (role as Record<string, unknown>).level as number
    : 0;
}
