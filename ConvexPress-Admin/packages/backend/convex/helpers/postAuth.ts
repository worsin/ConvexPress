/**
 * Post System - Authorization Helper
 *
 * Implements WordPress-style post capability checking with ownership semantics.
 *
 * WordPress distinguishes between "own" and "others'" capabilities:
 *   - edit_posts (own) vs edit_others_posts
 *   - delete_posts (own) vs delete_others_posts
 *   - edit_published_posts (already published content)
 *   - edit_private_posts (private visibility content)
 *
 * ConvexPress maps these to the capability system defined in types/capabilities.ts:
 *   - post.create, post.update, post.delete, post.publish, etc.
 *   - Ownership is checked by comparing post.authorId with the user's _id
 *   - Role level is used to determine "others'" access (Editor = 80+)
 *
 * Usage:
 *   import { checkPostCapability } from "../helpers/postAuth";
 *
 *   // In a mutation:
 *   await checkPostCapability(ctx, user, post, "edit");
 */

import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveUserRole } from "../helpers/permissions";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Minimal user shape needed for post auth checks. */
export type AuthUser = {
  _id: Id<"users">;
  clerkUserId?: string;
  email: string;
  roleId?: Id<"roles">;
  internalRole?: string;
  status: string;
};

/** Minimal post shape needed for auth checks. */
export type AuthPost = {
  _id: Id<"posts">;
  authorId: Id<"users">;
  status: string;
  type: string;
};

/** The action being performed on a post. */
export type PostAction = "edit" | "delete" | "publish" | "read";

// ─── Core Function ──────────────────────────────────────────────────────────

/**
 * Check if a user has the capability to perform an action on a post.
 * Throws ConvexError with code "FORBIDDEN" if the check fails.
 *
 * This function implements WordPress's multi-layered capability logic:
 *   1. Is this the user's own post or someone else's?
 *   2. What is the post's current status? (published, private, etc.)
 *   3. Does the user's role grant the needed capabilities?
 *
 * @param ctx - Convex context
 * @param user - The authenticated user document
 * @param post - The post document being acted upon
 * @param action - "edit", "delete", "publish", or "read"
 * @throws ConvexError with code "FORBIDDEN" if check fails
 */
export async function checkPostCapability(
  ctx: QueryCtx | MutationCtx,
  user: AuthUser,
  post: AuthPost,
  action: PostAction,
): Promise<void> {
  const isOwn = post.authorId.toString() === user._id.toString();
  const role = await resolveUserRole(ctx, user);
  const capabilities = role?.capabilities ?? [];
  const level = role?.level ?? 0;

  const has = (cap: string) => capabilities.includes(cap);

  switch (action) {
    case "edit": {
      // Basic edit check
      if (isOwn) {
        if (!has("post.update")) {
          throw forbidden("post.update");
        }
      } else {
        // Editing others' posts requires Editor-level (80+)
        if (level < 80 || !has("post.update")) {
          throw forbidden("edit others' posts (Editor+ required)");
        }
      }
      // Additional checks for published/private posts
      if (post.status === "publish" && !isOwn) {
        if (!has("post.update")) {
          throw forbidden("edit published posts");
        }
      }
      break;
    }

    case "delete": {
      if (isOwn) {
        if (!has("post.delete") && !has("post.trash")) {
          throw forbidden("post.delete");
        }
      } else {
        if (level < 80 || (!has("post.delete") && !has("post.trash"))) {
          throw forbidden("delete others' posts (Editor+ required)");
        }
      }
      break;
    }

    case "publish": {
      if (!has("post.publish")) {
        throw forbidden("post.publish");
      }
      if (!isOwn && level < 80) {
        throw forbidden("publish others' posts (Editor+ required)");
      }
      break;
    }

    case "read": {
      // Published posts are public - no check needed
      if (post.status === "publish") return;

      // Private posts require special capability
      if (post.status === "private") {
        if (!has("post.read") || level < 80) {
          throw forbidden("read private posts");
        }
        return;
      }

      // Draft, pending, auto-draft, future, trash - need edit capability
      if (isOwn) {
        if (!has("post.read") && !has("post.update")) {
          throw forbidden("read own draft posts");
        }
      } else {
        if (level < 80) {
          throw forbidden("read others' draft posts (Editor+ required)");
        }
      }
      break;
    }
  }
}

/**
 * Check if a user is the owner of a post.
 */
export function isPostOwner(
  user: Pick<AuthUser, "_id">,
  post: Pick<AuthPost, "authorId">,
): boolean {
  return post.authorId.toString() === user._id.toString();
}

/**
 * Get the user's role level for quick checks.
 */
export async function getUserRoleLevel(
  ctx: QueryCtx | MutationCtx,
  user: AuthUser,
): Promise<number> {
  const role = await resolveUserRole(ctx, user);
  return role?.level ?? 0;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function forbidden(detail: string): ConvexError<{ code: string; message: string }> {
  console.warn(`Post access denied: ${detail}`);
  return new ConvexError({
    code: "FORBIDDEN",
    message: "Insufficient permissions",
  });
}
