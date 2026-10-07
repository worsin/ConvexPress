/** Edit-lock lifecycle. Reusable content is authored through canonical syncedBlocks. */
import type { RegisteredMutation } from "convex/server";
import type { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { acquireLockArgs, releaseLockArgs, renewLockArgs, LOCK_DURATION_MS } from "./validators";

// ─── Acquire Lock ───────────────────────────────────────────────────────────

/**
 * Acquire an edit lock on a post.
 *
 * If the post is already locked by another user and the lock hasn't expired,
 * the lock acquisition fails and returns the current lock holder's info.
 *
 * If the post is locked by the current user, the lock is renewed.
 * If the post is locked by another user but the lock has expired, the old
 * lock is replaced.
 *
 * @returns { acquired: true } or { acquired: false, lockedBy: { userId, displayName, lockedAt } }
 */
export const acquireLock: RegisteredMutation<"public", { postId: Id<"posts"> }, { acquired: boolean; lockedBy?: { userId: Id<"users">; displayName: string; lockedAt: number } }> = mutation({
  args: acquireLockArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // Verify the post exists
    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    const now = Date.now();
    const expiresAt = now + LOCK_DURATION_MS;

    // Check for existing lock
    const existingLock = await ctx.db
      .query("editorLocks")
      .withIndex("by_postId", (q) => q.eq("postId", args.postId))
      .first();

    if (existingLock) {
      // If locked by the current user, renew
      if (existingLock.userId === user._id) {
        await ctx.db.patch("editorLocks", existingLock._id, {
          expiresAt,
        });
        return { acquired: true };
      }

      // If locked by another user and not expired, reject
      if (existingLock.expiresAt > now) {
        return {
          acquired: false,
          lockedBy: {
            userId: existingLock.userId,
            displayName: existingLock.userDisplayName,
            lockedAt: existingLock.lockedAt,
          },
        };
      }

      // Lock has expired - replace it
      await ctx.db.delete("editorLocks", existingLock._id);
    }

    // Create new lock
    const displayName = user.displayName ?? user.firstName ?? user.email;
    await ctx.db.insert("editorLocks", {
      postId: args.postId,
      userId: user._id,
      userDisplayName: displayName,
      lockedAt: now,
      expiresAt,
    });

    return { acquired: true };
  },
});

// ─── Release Lock ───────────────────────────────────────────────────────────

/**
 * Release an edit lock on a post.
 *
 * Called when a user navigates away from the editor.
 * Only the lock holder can release their own lock.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const releaseLock = mutation({
  args: releaseLockArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const existingLock = await ctx.db
      .query("editorLocks")
      .withIndex("by_postId", (q: ConvexQueryBuilder) => q.eq("postId", args.postId))
      .first();

    if (!existingLock) {
      // No lock to release - idempotent
      return { released: true };
    }

    // Only the lock holder can release their own lock
    if (existingLock.userId !== user._id) {
      // Don't throw - just return false. The other user's lock is not our concern.
      return { released: false, reason: "Lock held by another user" };
    }

    await ctx.db.delete("editorLocks", existingLock._id);
    return { released: true };
  },
});

// ─── Renew Lock ─────────────────────────────────────────────────────────────

/**
 * Renew (heartbeat) an edit lock on a post.
 *
 * Called every 30 seconds by the editor UI to keep the lock alive.
 * Extends the lock expiry by 2 minutes from now.
 *
 * If the lock has been stolen (expired and another user acquired it),
 * this returns { renewed: false } and the editor UI should show a
 * warning that another user has taken over editing.
 */
export const renewLock: RegisteredMutation<"public", { postId: Id<"posts"> }, { renewed: boolean; reason?: string; lockedBy?: { userId: Id<"users">; displayName: string } }> = mutation({
  args: renewLockArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const existingLock = await ctx.db
      .query("editorLocks")
      .withIndex("by_postId", (q) => q.eq("postId", args.postId))
      .first();

    if (!existingLock) {
      // Lock was released or expired and cleaned up
      return { renewed: false, reason: "No lock found" };
    }

    if (existingLock.userId !== user._id) {
      // Another user has acquired the lock
      return {
        renewed: false,
        reason: "Lock held by another user",
        lockedBy: {
          userId: existingLock.userId,
          displayName: existingLock.userDisplayName,
        },
      };
    }

    // Renew the lock
    const now = Date.now();
    await ctx.db.patch("editorLocks", existingLock._id, {
      expiresAt: now + LOCK_DURATION_MS,
    });

    return { renewed: true };
  },
});
